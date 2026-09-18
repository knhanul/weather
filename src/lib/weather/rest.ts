import { getSql } from "@/lib/db";
import { ensureWeatherReady } from "./bootstrap";
import { sha256Hex } from "./crypto";
import { asInt, asNum, asString } from "./db-rows";
import { HOURLY_SELECT, mapDaily, mapHourly } from "./query-helpers";
import { addHoursKst, latestOfficialHour, parseKst, toIsoKst, toKstWall } from "./timezone";

export type ApiClient = {
  id: number;
  name: string;
  code: string;
  scopes: string;
};

export async function authorize(request: Request): Promise<
  | { ok: true; client: ApiClient }
  | { ok: false; status: number; error: { code: string; message: string } }
> {
  await ensureWeatherReady();
  const header = request.headers.get("x-api-key") ?? request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (!key) {
    return { ok: false, status: 401, error: { code: "NO_KEY", message: "X-API-Key 헤더가 필요합니다." } };
  }
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, name, client_code, scopes, status from weather_api_clients where key_hash=$1`,
    [sha256Hex(key)],
  );
  const row = rows[0];
  if (!row) {
    return { ok: false, status: 401, error: { code: "BAD_KEY", message: "유효하지 않은 API 키입니다." } };
  }
  if (asString(row.status) !== "ACTIVE") {
    return { ok: false, status: 403, error: { code: "REVOKED", message: "폐기된 API 키입니다." } };
  }
  await sql.query(`update weather_api_clients set last_used_at=now() where id=$1`, [asInt(row.id)]);
  return {
    ok: true,
    client: {
      id: asInt(row.id),
      name: asString(row.name),
      code: asString(row.client_code),
      scopes: asString(row.scopes),
    },
  };
}

export async function logUsage(
  client: ApiClient | null,
  request: Request,
  status: number,
  count: number | null,
  started: number,
) {
  try {
    const sql = await getSql();
    const url = new URL(request.url);
    await sql.query(
      `insert into weather_api_usage (client_id, client_name, method, path, status_code, result_count, duration_ms)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        client?.id ?? null,
        client?.name ?? null,
        request.method,
        url.pathname,
        status,
        count,
        Date.now() - started,
      ],
    );
  } catch {
    /* ignore logging failures */
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

export async function queryHourlyApi(url: URL) {
  const sql = await getSql();
  const stationId = url.searchParams.get("station_id") || "108";
  const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -24));
  const to = toKstWall(url.searchParams.get("to") || latestOfficialHour());
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") ?? 100)));
  const st = await sql.query<{ station_name: string; station_type: string; latitude: number | null; longitude: number | null }>(
    `select station_name, station_type, latitude, longitude from weather_stations where station_id=$1`,
    [stationId],
  );
  const total = await sql.query<{ n: number }>(
    `select count(*)::int as n from weather_observations_hourly
      where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp`,
    [stationId, from, to],
  );
  const rows = await sql.query<Record<string, unknown>>(
    `select ${HOURLY_SELECT}
       from weather_observations_hourly o
       left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
      where o.station_id=$1 and o.observation_datetime >= $2::timestamp and o.observation_datetime <= $3::timestamp
      order by o.observation_datetime
      limit $4 offset $5`,
    [stationId, from, to, pageSize, (page - 1) * pageSize],
  );
  const mapped = rows.map((r) => mapHourly(r));
  return {
    source: "KMA",
    dataset: "ASOS_HOURLY",
    timezone: "Asia/Seoul",
    station: {
      id: stationId,
      name: st[0]?.station_name ?? stationId,
      type: st[0]?.station_type ?? "ASOS",
      latitude: st[0]?.latitude ?? null,
      longitude: st[0]?.longitude ?? null,
    },
    period: { from: toIsoKst(from), to: toIsoKst(to) },
    page,
    pageSize,
    total: total[0]?.n ?? 0,
    data: mapped.map((r) => ({
      observation_datetime: toIsoKst(r.observationDatetime),
      temperature: r.temperature,
      precipitation: r.precipitation,
      humidity: r.humidity,
      wind_speed: r.windSpeed,
      wind_direction: r.windDirection,
      pressure: r.pressure,
      sunshine: r.sunshine,
      solar_radiation: r.solarRadiation,
      snow_depth: r.snowDepth,
      visibility: r.visibility,
      quality: { temperature: r.qualityTemperature, precipitation: r.qualityPrecipitation },
    })),
  };
}

export async function queryDailyApi(url: URL) {
  const sql = await getSql();
  const stationId = url.searchParams.get("station_id") || "108";
  const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -30 * 24)).slice(0, 10);
  const to = toKstWall(url.searchParams.get("to") || latestOfficialHour()).slice(0, 10);
  const st = await sql.query<{ station_name: string }>(
    `select station_name from weather_stations where station_id=$1`,
    [stationId],
  );
  const rows = await sql.query<Record<string, unknown>>(
    `select d.*, s.station_name, d.observation_date::text as observation_date
       from weather_observations_daily d
       left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
      where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
        and d.source_kind='OFFICIAL'
      order by d.observation_date`,
    [stationId, from, to],
  );
  const mapped = rows.map((r) => mapDaily(r));
  return {
    source: "KMA",
    dataset: "ASOS_DAILY",
    timezone: "Asia/Seoul",
    note: "공식 일자료이며 시간자료 자체 집계와 다를 수 있습니다.",
    station: { id: stationId, name: st[0]?.station_name ?? stationId },
    period: { from, to },
    data: mapped.map((r) => ({
      observation_date: r.observationDate,
      avg_temperature: r.avgTemperature,
      min_temperature: r.minTemperature,
      max_temperature: r.maxTemperature,
      precipitation: r.precipitation,
      avg_humidity: r.avgHumidity,
      snow_depth: r.snowDepth,
      sunshine_hours: r.sunshineHours,
    })),
  };
}

export async function nearestHourly(url: URL) {
  const sql = await getSql();
  const stationId = url.searchParams.get("station_id") || "108";
  const rawDt = url.searchParams.get("datetime");
  if (!rawDt) throw new Error("datetime 파라미터가 필요합니다.");
  const target = parseKst(rawDt);
  const wall = toKstWall(rawDt);
  const row = await sql.query<Record<string, unknown>>(
    `select ${HOURLY_SELECT},
            abs(extract(epoch from (o.observation_datetime - $2::timestamp))) as delta_sec
       from weather_observations_hourly o
       left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
      where o.station_id=$1
      order by abs(extract(epoch from (o.observation_datetime - $2::timestamp)))
      limit 1`,
    [stationId, wall],
  );
  if (!row[0]) return { source: "KMA", dataset: "ASOS_HOURLY", data: null };
  const mapped = mapHourly(row[0]);
  const obs = parseKst(mapped.observationDatetime);
  return {
    source: "KMA",
    dataset: "ASOS_HOURLY",
    timezone: "Asia/Seoul",
    requested_datetime: toIsoKst(wall),
    selected_datetime: toIsoKst(mapped.observationDatetime),
    delta_seconds: Math.round((obs.getTime() - target.getTime()) / 1000),
    interpolated: false,
    data: {
      observation_datetime: toIsoKst(mapped.observationDatetime),
      temperature: mapped.temperature,
      precipitation: mapped.precipitation,
      humidity: mapped.humidity,
      wind_speed: mapped.windSpeed,
      pressure: mapped.pressure,
    },
  };
}

export async function summaryApi(url: URL) {
  const sql = await getSql();
  const stationId = url.searchParams.get("station_id") || "108";
  const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -24));
  const to = toKstWall(url.searchParams.get("to") || latestOfficialHour());
  const rows = await sql.query<Record<string, unknown>>(
    `select count(*)::int as sample_count,
            avg(temperature) as avg_temperature,
            min(temperature) as min_temperature,
            max(temperature) as max_temperature,
            sum(precipitation) as total_precipitation,
            count(*) filter (where precipitation is not null and precipitation > 0)::int as rain_observation_count,
            avg(humidity) as avg_humidity
       from weather_observations_hourly
      where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp`,
    [stationId, from, to],
  );
  const r = rows[0] ?? {};
  return {
    source: "KMA",
    dataset: "ASOS_HOURLY",
    timezone: "Asia/Seoul",
    station_id: stationId,
    period: { from: toIsoKst(from), to: toIsoKst(to) },
    sample_count: asInt(r.sample_count),
    avg_temperature: r.avg_temperature === null ? null : Math.round(Number(r.avg_temperature) * 10) / 10,
    min_temperature: asNum(r.min_temperature),
    max_temperature: asNum(r.max_temperature),
    total_precipitation: r.total_precipitation === null ? null : Math.round(Number(r.total_precipitation) * 10) / 10,
    rain_observation_count: asInt(r.rain_observation_count),
    avg_humidity: r.avg_humidity === null ? null : Math.round(Number(r.avg_humidity) * 10) / 10,
    note: "강수 합계는 NULL이 아닌 값만 합산합니다. 보간하지 않습니다.",
  };
}

export async function stationsApi(url: URL) {
  const sql = await getSql();
  const q = url.searchParams.get("q") ?? "";
  const rows = await sql.query<Record<string, unknown>>(
    `select station_id, station_name, region, office, latitude, longitude, altitude, station_type, enabled, is_favorite
       from weather_stations where provider='KMA' order by station_id`,
  );
  const data = rows
    .map((r) => ({
      station_id: asString(r.station_id),
      name: asString(r.station_name),
      region: r.region ? asString(r.region) : null,
      office: r.office ? asString(r.office) : null,
      latitude: asNum(r.latitude),
      longitude: asNum(r.longitude),
      altitude: asNum(r.altitude),
      type: asString(r.station_type),
      enabled: r.enabled === true || r.enabled === "t",
      favorite: r.is_favorite === true || r.is_favorite === "t",
    }))
    .filter((s) => !q || s.station_id.includes(q) || s.name.includes(q));
  return { source: "KMA", data };
}
