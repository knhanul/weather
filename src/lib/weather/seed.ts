import type { Sql } from "@/lib/db";
import { checksum, encryptSecret, sha256Hex } from "./crypto";
import { ASOS_STATIONS, DEFAULT_FAVORITES } from "./stations-catalog";
import { formatKst, formatKstDate, kstWallToUtc, latestOfficialHour } from "./timezone";
import type { DailyObservation, HourlyObservation } from "./types";
import { upsertDaily, upsertHourly } from "./upsert";

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed: string): number {
  return hash32(seed) / 0xffffffff;
}

/** Climatological seed for preview only — labeled via collection_jobs.trigger_type=SEED. */
function synthHourly(stationId: string, wall: string): HourlyObservation {
  const date = wall.slice(0, 10);
  const hour = Number(wall.slice(11, 13));
  const doy = Number(date.slice(5, 7)) * 30 + Number(date.slice(8, 10));
  const offset =
    stationId === "108" ? 0 : stationId === "159" ? 1.4 : stationId === "184" ? 3.2 : -0.6;
  const diurnal = 4.8 * Math.sin(((hour - 4) / 24) * Math.PI * 2);
  const seasonal = 22.5 + 6.5 * Math.sin(((doy - 200) / 365) * Math.PI * 2);
  const jitter = (unit(`${stationId}:${wall}:t`) - 0.5) * 1.6;
  const temperature = Math.round((seasonal + diurnal + offset + jitter) * 10) / 10;
  const rainRoll = unit(`${stationId}:${date}:rain`);
  const isRainDay = rainRoll > 0.78;
  const precipitation =
    isRainDay && hour >= 14 && hour <= 19
      ? Math.round((unit(`${stationId}:${wall}:rn`) * 4.2 + 0.1) * 10) / 10
      : hour === 0
        ? 0
        : null;
  const humidity = Math.round(58 + (isRainDay ? 18 : 0) + (unit(`${stationId}:${wall}:h`) - 0.5) * 12);
  const windSpeed = Math.round((1.2 + unit(`${stationId}:${wall}:ws`) * 3.4) * 10) / 10;
  const dirs = [50, 70, 90, 110, 250, 270, 290, 320];
  const windDirection = dirs[Math.floor(unit(`${stationId}:${wall}:wd`) * dirs.length)]!;
  const pressure = Math.round((1012.4 + (unit(`${stationId}:${wall}:pa`) - 0.5) * 8) * 10) / 10;
  const sunshine = hour >= 7 && hour <= 18 ? Math.round(unit(`${stationId}:${wall}:ss`) * 10) / 10 : 0;
  return {
    provider: "KMA",
    datasetCode: "ASOS_HOURLY",
    stationId,
    observationDatetime: wall,
    timezone: "Asia/Seoul",
    temperature,
    temperatureQc: null,
    precipitation,
    precipitationQc: null,
    humidity,
    humidityQc: null,
    windSpeed,
    windSpeedQc: null,
    windDirection,
    windDirectionQc: null,
    pressure,
    pressureQc: null,
    seaLevelPressure: Math.round((pressure + 10.2) * 10) / 10,
    seaLevelPressureQc: null,
    sunshine,
    sunshineQc: hour >= 7 && hour <= 18 ? null : "9",
    solarRadiation: hour >= 7 && hour <= 18 ? Math.round(unit(`${stationId}:${wall}:sr`) * 2.4 * 100) / 100 : 0,
    snowDepth: null,
    snow3hour: null,
    visibility: isRainDay ? 1800 : 2800,
    cloudCover: isRainDay ? 8 : Math.round(unit(`${stationId}:${wall}:cc`) * 6),
    lowMidCloudCover: isRainDay ? 6 : 2,
    cloudType: isRainDay ? "Sc" : null,
    ceiling: isRainDay ? 8 : null,
    groundTemperature: Math.round((temperature - 0.8) * 10) / 10,
    groundTemperatureQc: null,
    vaporPressure: Math.round((8 + unit(`${stationId}:${wall}:pv`) * 6) * 10) / 10,
    dewPoint: Math.round((temperature - 6 + (isRainDay ? 3 : 0)) * 10) / 10,
    weatherPhenomenonCode: isRainDay ? "01" : null,
    soilTemp5cm: Math.round((temperature - 1.2) * 10) / 10,
    soilTemp10cm: Math.round((temperature - 1.6) * 10) / 10,
    soilTemp20cm: Math.round((temperature - 2.1) * 10) / 10,
    soilTemp30cm: Math.round((temperature - 2.6) * 10) / 10,
    qualityTemperature: "NORMAL",
    qualityPrecipitation: "NORMAL",
    qualityHumidity: "NORMAL",
    qualityWind: "NORMAL",
    qualityPressure: "NORMAL",
  };
}

export async function seedIfEmpty(sql: Sql): Promise<void> {
  const existing = await sql.query<{ n: number }>("select count(*)::int as n from dataset_master");
  if ((existing[0]?.n ?? 0) > 0) return;

  await sql.query(
    `insert into weather_providers (
        provider_code, provider_name, service_code, service_name, base_url, status,
        api_key_source, requests_per_second, requests_per_minute, chunk_days, preserve_raw, raw_retention_days
      ) values
      ('KMA_ASOS_HOURLY','기상청','ASOS_HOURLY','지상(종관, ASOS) 시간자료','https://apis.data.go.kr/1360000/AsosHourlyInfoService','ENABLED','NONE',2,50,7,true,30),
      ('KMA_ASOS_DAILY','기상청','ASOS_DAILY','지상(종관, ASOS) 일자료','https://apis.data.go.kr/1360000/AsosDalyInfoService','ENABLED','NONE',2,50,31,true,30),
      ('KMA_AWS_HOURLY','기상청','AWS_HOURLY','지상(방재, AWS) 시간자료','https://apis.data.go.kr/1360000/Aws1miInfoService','DISABLED','NONE',1,30,1,true,14)
    `,
  );

  const envKey = process.env.KMA_API_KEY?.trim();
  if (envKey) {
    await sql.query(
      `update weather_providers
          set api_key_ciphertext=$1, api_key_hint=$2, api_key_source='ENV', updated_at=now()
        where provider_code in ('KMA_ASOS_HOURLY','KMA_ASOS_DAILY')`,
      [encryptSecret(envKey), `····${envKey.slice(-4)}`],
    );
  }

  await sql.query(
    `insert into dataset_master (
        dataset_code, dataset_name, provider, data_kind, data_type, time_resolution,
        description, connector_id, enabled
      ) values
      ('ASOS_HOURLY','종관기상관측 시간자료','KMA','OBSERVATION','ASOS','HOURLY',
       '기상청 종관기상관측(ASOS) 시간 단위 실측값. 전일(D-1)까지 제공.','kma_asos_hourly', true),
      ('ASOS_DAILY','종관기상관측 일자료','KMA','OBSERVATION','ASOS','DAILY',
       '기상청 종관기상관측(ASOS) 공식 일자료. 시간자료 자체 집계와 동일하지 않음.','kma_asos_daily', true),
      ('AWS_HOURLY','방재기상관측 시간자료','KMA','OBSERVATION','AWS','HOURLY',
       'AWS 커넥터 준비. 공식 시간자료 API 계약 확인 후 활성화.','kma_aws_hourly', false)
    `,
  );

  for (const st of ASOS_STATIONS) {
    await sql.query(
      `insert into weather_stations (
          provider, station_id, station_name, region, office, latitude, longitude, altitude,
          station_type, enabled, is_favorite
        ) values ('KMA',$1,$2,$3,$4,$5,$6,$7,'ASOS', true, $8)`,
      [
        st.stationId,
        st.stationName,
        st.region,
        st.office,
        st.latitude ?? null,
        st.longitude ?? null,
        st.altitude ?? null,
        DEFAULT_FAVORITES.includes(st.stationId),
      ],
    );
  }

  await sql.query(
    `insert into weather_schedules (dataset_code, enabled, cadence, lookback_hours, station_scope)
     values ('ASOS_HOURLY', true, 'HOURLY', 3, 'FAVORITES'),
            ('ASOS_DAILY', true, 'DAILY', 48, 'FAVORITES')`,
  );

  const demoPlain = "whub_preview_cafeteria_read";
  await sql.query(
    `insert into weather_api_clients (name, client_code, key_prefix, key_hash, status, scopes, created_by)
     values ('구내식당 시스템','CAFETERIA_SYSTEM',$1,$2,'ACTIVE','READ_WEATHER','SEED'),
            ('시설관리 시스템','FACILITY_SYSTEM','whub_facili', $3,'ACTIVE','READ_WEATHER','SEED'),
            ('에너지관리 시스템','ENERGY_SYSTEM','whub_energy', $4,'ACTIVE','READ_WEATHER','SEED')`,
    [demoPlain.slice(0, 12), sha256Hex(demoPlain), sha256Hex("whub_facility_placeholder"), sha256Hex("whub_energy_placeholder")],
  );

  const latest = latestOfficialHour();
  const latestDate = latest.slice(0, 10);
  const start = (() => {
    const d = new Date(kstWallToUtc(
      Number(latestDate.slice(0, 4)),
      Number(latestDate.slice(5, 7)),
      Number(latestDate.slice(8, 10)),
    ).getTime() - 7 * 24 * 3600_000);
    return formatKstDate(d);
  })();

  const job = await sql.query<{ id: number }>(
    `insert into weather_collection_jobs (
        dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
        started_at, completed_at, status, created_by, chunk_total, chunk_done
      ) values ('ASOS_HOURLY','KMA', null, $1, $2, 'SEED', now(), now(), 'COMPLETED', 'SEED', 1, 1)
      returning id`,
    [`${start} 00:00:00`, latest],
  );
  const jobId = job[0]!.id;
  const raw = await sql.query<{ id: number }>(
    `insert into weather_raw_imports (
        provider, dataset_code, job_id, requested_from, requested_to, station_id,
        request_parameters_json, response_raw, response_format, checksum, status
      ) values ('KMA','ASOS_HOURLY',$1,$2,$3,'SEED','{"mode":"SEED"}','{"note":"preview climatological seed"}','JSON',$4,'OK')
      returning id`,
    [jobId, `${start} 00:00:00`, latest, checksum("SEED")],
  );
  const importId = raw[0]!.id;

  const seedStations = ["108", "112", "159"];
  const skip = new Set(["108|03", "108|04", "108|05"]);
  let received = 0;
  for (const stn of seedStations) {
    const hourly: HourlyObservation[] = [];
    let cursor = kstWallToUtc(
      Number(start.slice(0, 4)),
      Number(start.slice(5, 7)),
      Number(start.slice(8, 10)),
    );
    const endMs = kstWallToUtc(
      Number(latest.slice(0, 4)),
      Number(latest.slice(5, 7)),
      Number(latest.slice(8, 10)),
      Number(latest.slice(11, 13)),
    ).getTime();
    const gapDay = formatKstDate(new Date(kstWallToUtc(
      Number(latestDate.slice(0, 4)),
      Number(latestDate.slice(5, 7)),
      Number(latestDate.slice(8, 10)),
    ).getTime() - 2 * 24 * 3600_000));
    while (cursor.getTime() <= endMs) {
      const wall = formatKst(cursor);
      const key = `${stn}|${wall.slice(11, 13)}`;
      const isGapDay = wall.startsWith(gapDay);
      if (!(isGapDay && skip.has(key))) {
        hourly.push(synthHourly(stn, wall));
      }
      cursor = new Date(cursor.getTime() + 3600_000);
    }
    const counts = await upsertHourly(sql, hourly, { importId, jobId });
    received += counts.inserted;

    const daily: DailyObservation[] = [];
    let day = start;
    while (day <= latestDate) {
      const hours = hourly.filter((h) => h.observationDatetime.startsWith(day));
      if (hours.length) {
        const temps = hours.map((h) => h.temperature).filter((v): v is number => v !== null);
        const rains = hours.map((h) => h.precipitation).filter((v): v is number => v !== null);
        const hums = hours.map((h) => h.humidity).filter((v): v is number => v !== null);
        daily.push({
          provider: "KMA",
          datasetCode: "ASOS_DAILY",
          stationId: stn,
          observationDate: day,
          timezone: "Asia/Seoul",
          avgTemperature: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
          minTemperature: temps.length ? Math.min(...temps) : null,
          maxTemperature: temps.length ? Math.max(...temps) : null,
          precipitation: rains.length ? Math.round(rains.reduce((a, b) => a + b, 0) * 10) / 10 : 0,
          avgHumidity: hums.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null,
          minHumidity: hums.length ? Math.min(...hums) : null,
          snowDepth: null,
          snowFresh: null,
          sunshineHours: Math.round(hours.reduce((a, h) => a + (h.sunshine ?? 0), 0) * 10) / 10,
          solarRadiation: Math.round(hours.reduce((a, h) => a + (h.solarRadiation ?? 0), 0) * 100) / 100,
          avgWindSpeed: Math.round((hours.reduce((a, h) => a + (h.windSpeed ?? 0), 0) / hours.length) * 10) / 10,
          maxWindSpeed: Math.max(...hours.map((h) => h.windSpeed ?? 0)),
          avgPressure: Math.round((hours.reduce((a, h) => a + (h.pressure ?? 0), 0) / hours.length) * 10) / 10,
          sourceKind: "OFFICIAL",
        });
      }
      const next = new Date(kstWallToUtc(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))).getTime() + 24 * 3600_000);
      day = formatKstDate(next);
    }
    await upsertDaily(sql, daily, { importId, jobId });
  }

  await sql.query(
    `update weather_collection_jobs
        set received_count=$1, inserted_count=$1, requested_count=$1
      where id=$2`,
    [received, jobId],
  );

  await sql.query(
    `insert into weather_api_usage (client_id, client_name, method, path, status_code, result_count, duration_ms)
     select id, name, 'GET', '/api/v1/weather/hourly', 200, 24, 18 from weather_api_clients where client_code='CAFETERIA_SYSTEM'
     union all
     select id, name, 'GET', '/api/v1/weather/summary', 200, 1, 12 from weather_api_clients where client_code='FACILITY_SYSTEM'`,
  );

  await sql.query(
    `insert into weather_audit_log (actor_role, action, target, detail)
     values ('ADMIN','SEED','system','미리보기 시드 자료와 기준정보를 적재했습니다.')`,
  );

  await sql.query(
    `insert into weather_alerts (severity, code, title, message)
     values ('INFO','SEED_DATA','시드 관측자료가 적재되어 있습니다',
             '미리보기에는 서울·인천·부산 종관지점의 최근 약 8일 시드 관측자료가 들어 있습니다. 공공데이터포털 인증키를 등록한 뒤 수집하면 원본 ASOS 값으로 덮어씁니다(UPSERT).'),
            ('WARN','GAP_SAMPLE','서울 108 3시간 누락 구간',
             '누락 탐지 화면 확인용으로 서울 지점의 심야 3시간이 비어 있습니다. 재수집으로 채울 수 있습니다.')`,
  );

  await sql.query(
    `insert into app_settings (key, value) values
     ('hub_name','기상허브'),
     ('timezone','Asia/Seoul'),
     ('demo_api_key_note','미리보기 구내식당 키: whub_preview_cafeteria_read')`,
  );
}
