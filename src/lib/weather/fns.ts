import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensureWeatherReady } from "./bootstrap";
import {
  cancelJob,
  enqueueCollection,
  processJobTick,
  retryFailedChunks,
  testConnection,
} from "./collector";
import { encryptSecret, generateApiKey, hintOf } from "./crypto";
import { asBool, asInt, asNum, asString } from "./db-rows";
import { HOURLY_SELECT, mapDaily, mapHourly } from "./query-helpers";
import { assertRole, readRole, writeRole } from "./role";
import { ASOS_STATIONS } from "./stations-catalog";
import { addHoursKst, formatKst, latestOfficialHour, parseKst, toIsoKst, toKstWall } from "./timezone";
import { EXPORT_COLUMNS, ROLES, type Role } from "./types";
import { workbookXlsx } from "./xlsx";

async function db() {
  await ensureWeatherReady();
  return getSql();
}

async function audit(action: string, target: string, detail: string) {
  const sql = await getSql();
  await sql.query(
    `insert into weather_audit_log (actor_role, action, target, detail) values ($1,$2,$3,$4)`,
    [readRole(), action, target, detail],
  );
}

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  await ensureWeatherReady();
  return { role: readRole(), timezone: "Asia/Seoul", now: formatKst(new Date()) };
});

export const setSessionRole = createServerFn({ method: "POST" })
  .validator(z.object({ role: z.enum(ROLES) }))
  .handler(async ({ data }) => {
    writeRole(data.role);
    await audit("ROLE_SWITCH", data.role, `역할 전환: ${data.role}`);
    return { role: data.role as Role };
  });

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const coverage = await sql.query<Record<string, unknown>>(
    `select dataset_code,
            min(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as first_dt,
            max(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as last_dt,
            count(*)::int as records,
            count(distinct station_id)::int as stations
       from weather_observations_hourly
      group by dataset_code`,
  );
  const dailyCov = await sql.query<Record<string, unknown>>(
    `select dataset_code,
            min(observation_date)::text as first_dt,
            max(observation_date)::text as last_dt,
            count(*)::int as records,
            count(distinct station_id)::int as stations
       from weather_observations_daily
      group by dataset_code`,
  );
  const lastJob = await sql.query<Record<string, unknown>>(
    `select id, dataset_code, status, trigger_type, received_count, inserted_count, updated_count,
            to_char(completed_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as completed
       from weather_collection_jobs order by id desc limit 1`,
  );
  const providers = await sql.query<Record<string, unknown>>(
    `select provider_code, service_name, status, api_key_source, api_key_hint,
            last_test_status, last_test_message,
            to_char(last_test_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as last_test_at,
            to_char(last_collect_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as last_collect_at
       from weather_providers order by id`,
  );
  const apiToday = await sql.query<{ n: number }>(
    `select count(*)::int as n from weather_api_usage where created_at >= current_date`,
  );
  const alerts = await sql.query<Record<string, unknown>>(
    `select id, severity, code, title, message, acknowledged from weather_alerts
      where acknowledged=false order by id desc limit 8`,
  );
  const series = await sql.query<Record<string, unknown>>(
    `select to_char(observation_datetime,'YYYY-MM-DD HH24:MI') as t, temperature, precipitation
       from weather_observations_hourly
      where station_id='108'
      order by observation_datetime desc limit 72`,
  );
  const missing = await countRecentGaps(sql);
  return {
    coverage: coverage.map((r) => ({
      datasetCode: asString(r.dataset_code),
      first: asString(r.first_dt),
      last: asString(r.last_dt),
      records: asInt(r.records),
      stations: asInt(r.stations),
    })),
    dailyCoverage: dailyCov.map((r) => ({
      datasetCode: asString(r.dataset_code),
      first: asString(r.first_dt),
      last: asString(r.last_dt),
      records: asInt(r.records),
      stations: asInt(r.stations),
    })),
    lastJob: lastJob[0]
      ? {
          id: asInt(lastJob[0].id),
          datasetCode: asString(lastJob[0].dataset_code),
          status: asString(lastJob[0].status),
          triggerType: asString(lastJob[0].trigger_type),
          received: asInt(lastJob[0].received_count),
          inserted: asInt(lastJob[0].inserted_count),
          updated: asInt(lastJob[0].updated_count),
          completed: lastJob[0].completed ? asString(lastJob[0].completed) : null,
        }
      : null,
    providers: providers.map((p) => ({
      code: asString(p.provider_code),
      name: asString(p.service_name),
      status: asString(p.status),
      keySource: asString(p.api_key_source),
      keyHint: p.api_key_hint ? asString(p.api_key_hint) : null,
      lastTestStatus: p.last_test_status ? asString(p.last_test_status) : null,
      lastTestMessage: p.last_test_message ? asString(p.last_test_message) : null,
      lastTestAt: p.last_test_at ? asString(p.last_test_at) : null,
      lastCollectAt: p.last_collect_at ? asString(p.last_collect_at) : null,
    })),
    apiToday: apiToday[0]?.n ?? 0,
    alerts: alerts.map((a) => ({
      id: asInt(a.id),
      severity: asString(a.severity),
      title: asString(a.title),
      message: asString(a.message),
    })),
    series: series
      .slice()
      .reverse()
      .map((r) => ({
        t: asString(r.t),
        temperature: asNum(r.temperature),
        precipitation: asNum(r.precipitation),
      })),
    missingHours: missing,
    role: readRole(),
    now: formatKst(new Date()),
  };
});

async function countRecentGaps(sql: Awaited<ReturnType<typeof getSql>>): Promise<number> {
  const latest = latestOfficialHour();
  const from = addHoursKst(latest, -24 * 3);
  const have = await sql.query<{ n: number }>(
    `select count(*)::int as n from weather_observations_hourly
      where station_id='108' and observation_datetime >= $1::timestamp and observation_datetime <= $2::timestamp`,
    [from, latest],
  );
  const expected = Math.round((parseKst(latest).getTime() - parseKst(from).getTime()) / 3600_000) + 1;
  return Math.max(0, expected - (have[0]?.n ?? 0));
}

export const listStations = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      type: z.string().optional(),
      region: z.string().optional(),
      enabled: z.string().optional(),
      favorite: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql.query<Record<string, unknown>>(
      `select id, provider, station_id, station_name, region, office, latitude, longitude, altitude,
              station_type, enabled, is_favorite
         from weather_stations
        order by station_id`,
    );
    return rows
      .map((r) => ({
        id: asInt(r.id),
        provider: asString(r.provider),
        stationId: asString(r.station_id),
        stationName: asString(r.station_name),
        region: r.region ? asString(r.region) : "",
        office: r.office ? asString(r.office) : "",
        latitude: asNum(r.latitude),
        longitude: asNum(r.longitude),
        altitude: asNum(r.altitude),
        stationType: asString(r.station_type),
        enabled: asBool(r.enabled),
        favorite: asBool(r.is_favorite),
      }))
      .filter((s) => {
        if (data.q) {
          const q = data.q.toLowerCase();
          if (!s.stationId.includes(q) && !s.stationName.toLowerCase().includes(q) && !s.region.includes(q)) {
            return false;
          }
        }
        if (data.type && s.stationType !== data.type) return false;
        if (data.region && s.region !== data.region) return false;
        if (data.enabled === "true" && !s.enabled) return false;
        if (data.enabled === "false" && s.enabled) return false;
        if (data.favorite && !s.favorite) return false;
        return true;
      });
  });

export const toggleStation = createServerFn({ method: "POST" })
  .validator(z.object({ stationId: z.string(), field: z.enum(["enabled", "favorite"]) }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    const col = data.field === "favorite" ? "is_favorite" : "enabled";
    await sql.query(
      `update weather_stations set ${col} = not ${col}, updated_at=now() where station_id=$1 and provider='KMA'`,
      [data.stationId],
    );
    await audit("STATION_UPDATE", data.stationId, `${data.field} 변경`);
    return { ok: true };
  });

export const syncStations = createServerFn({ method: "POST" }).handler(async () => {
  assertRole(readRole(), ["ADMIN"]);
  const sql = await db();
  let upserted = 0;
  for (const st of ASOS_STATIONS) {
    await sql.query(
      `insert into weather_stations (provider, station_id, station_name, region, office, latitude, longitude, altitude, station_type, enabled)
       values ('KMA',$1,$2,$3,$4,$5,$6,$7,'ASOS', true)
       on conflict (provider, station_id) do update set
         station_name=excluded.station_name, region=excluded.region, office=excluded.office,
         latitude=coalesce(excluded.latitude, weather_stations.latitude),
         longitude=coalesce(excluded.longitude, weather_stations.longitude),
         altitude=coalesce(excluded.altitude, weather_stations.altitude),
         updated_at=now()`,
      [st.stationId, st.stationName, st.region, st.office, st.latitude ?? null, st.longitude ?? null, st.altitude ?? null],
    );
    upserted += 1;
  }
  await audit("STATION_SYNC", "ASOS", `${upserted}개 지점 동기화`);
  return { upserted };
});

export const listDatasets = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select * from dataset_master order by id`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    code: asString(r.dataset_code),
    name: asString(r.dataset_name),
    provider: asString(r.provider),
    dataKind: asString(r.data_kind),
    timeResolution: asString(r.time_resolution),
    description: r.description ? asString(r.description) : "",
    enabled: asBool(r.enabled),
    connectorId: asString(r.connector_id),
  }));
});

export const listProviders = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(`select * from weather_providers order by id`);
  return rows.map((p) => ({
    id: asInt(p.id),
    code: asString(p.provider_code),
    providerName: asString(p.provider_name),
    serviceCode: asString(p.service_code),
    serviceName: asString(p.service_name),
    baseUrl: asString(p.base_url),
    status: asString(p.status),
    keySource: asString(p.api_key_source),
    keyHint: p.api_key_hint ? asString(p.api_key_hint) : null,
    lastTestStatus: p.last_test_status ? asString(p.last_test_status) : null,
    lastTestMessage: p.last_test_message ? asString(p.last_test_message) : null,
    lastTestAt: p.last_test_at ? asString(p.last_test_at) : null,
    lastCollectAt: p.last_collect_at ? asString(p.last_collect_at) : null,
    requestsPerSecond: asInt(p.requests_per_second),
    requestsPerMinute: asInt(p.requests_per_minute),
    retryCount: asInt(p.retry_count),
    timeoutSeconds: asInt(p.timeout_seconds),
    chunkDays: asInt(p.chunk_days),
    preserveRaw: asBool(p.preserve_raw),
    rawRetentionDays: asInt(p.raw_retention_days),
  }));
});

export const saveProviderKey = createServerFn({ method: "POST" })
  .validator(z.object({ serviceCode: z.string(), apiKey: z.string().min(8) }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN"]);
    const sql = await db();
    await sql.query(
      `update weather_providers
          set api_key_ciphertext=$1, api_key_hint=$2, api_key_source='DB', updated_at=now()
        where service_code=$3`,
      [encryptSecret(data.apiKey.trim()), hintOf(data.apiKey.trim()), data.serviceCode],
    );
    await audit("PROVIDER_KEY", data.serviceCode, "인증키 등록/교체 (값은 저장하지 않음)");
    return { ok: true, hint: hintOf(data.apiKey.trim()) };
  });

export const saveProviderSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      serviceCode: z.string(),
      requestsPerSecond: z.number().int().min(1).max(10),
      requestsPerMinute: z.number().int().min(1).max(200),
      retryCount: z.number().int().min(0).max(8),
      timeoutSeconds: z.number().int().min(5).max(60),
      chunkDays: z.number().int().min(1).max(90),
      preserveRaw: z.boolean(),
      rawRetentionDays: z.number().int().min(1).max(365),
      status: z.enum(["ENABLED", "DISABLED"]),
    }),
  )
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN"]);
    const sql = await db();
    await sql.query(
      `update weather_providers set
          requests_per_second=$1, requests_per_minute=$2, retry_count=$3, timeout_seconds=$4,
          chunk_days=$5, preserve_raw=$6, raw_retention_days=$7, status=$8, updated_at=now()
        where service_code=$9`,
      [
        data.requestsPerSecond,
        data.requestsPerMinute,
        data.retryCount,
        data.timeoutSeconds,
        data.chunkDays,
        data.preserveRaw,
        data.rawRetentionDays,
        data.status,
        data.serviceCode,
      ],
    );
    await audit("PROVIDER_SETTINGS", data.serviceCode, "공급원 설정 변경");
    return { ok: true };
  });

export const runConnectionTest = createServerFn({ method: "POST" })
  .validator(z.object({ datasetCode: z.string() }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    const result = await testConnection(sql, data.datasetCode);
    await audit("CONNECTION_TEST", data.datasetCode, result.message);
    return result;
  });

export const startCollection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      datasetCode: z.string(),
      stationIds: z.array(z.string()).min(1),
      from: z.string(),
      to: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    const job = await enqueueCollection(sql, {
      datasetCode: data.datasetCode,
      stationIds: data.stationIds,
      from: data.from,
      to: data.to,
      triggerType: "MANUAL",
      createdBy: readRole(),
    });
    await audit("MANUAL_COLLECT", data.datasetCode, `${data.stationIds.join(",")} ${data.from}~${data.to}`);
    await processJobTick(sql, job.jobId);
    return job;
  });

export const tickJobs = createServerFn({ method: "POST" }).handler(async () => {
  const sql = await db();
  const r = await processJobTick(sql);
  return r;
});

export const listJobs = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
            status, requested_count, received_count, inserted_count, updated_count, skipped_count,
            error_count, chunk_total, chunk_done, error_message, created_by,
            to_char(started_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as started_at,
            to_char(completed_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as completed_at
       from weather_collection_jobs order by id desc limit 40`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    datasetCode: asString(r.dataset_code),
    stationId: r.station_id ? asString(r.station_id) : null,
    from: asString(r.requested_from),
    to: asString(r.requested_to),
    triggerType: asString(r.trigger_type),
    status: asString(r.status),
    received: asInt(r.received_count),
    inserted: asInt(r.inserted_count),
    updated: asInt(r.updated_count),
    skipped: asInt(r.skipped_count),
    errorCount: asInt(r.error_count),
    chunkTotal: asInt(r.chunk_total),
    chunkDone: asInt(r.chunk_done),
    errorMessage: r.error_message ? asString(r.error_message) : null,
    createdBy: r.created_by ? asString(r.created_by) : null,
    startedAt: r.started_at ? asString(r.started_at) : null,
    completedAt: r.completed_at ? asString(r.completed_at) : null,
  }));
});

export const getJob = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    const jobs = await sql.query<Record<string, unknown>>(`select * from weather_collection_jobs where id=$1`, [data.id]);
    const chunks = await sql.query<Record<string, unknown>>(
      `select id, station_id, chunk_from, chunk_to, status, received_count, inserted_count, updated_count, skipped_count, error_message
         from weather_collection_chunks where job_id=$1 order by id`,
      [data.id],
    );
    const job = jobs[0];
    if (!job) return null;
    return {
      id: asInt(job.id),
      status: asString(job.status),
      datasetCode: asString(job.dataset_code),
      chunkTotal: asInt(job.chunk_total),
      chunkDone: asInt(job.chunk_done),
      received: asInt(job.received_count),
      inserted: asInt(job.inserted_count),
      updated: asInt(job.updated_count),
      skipped: asInt(job.skipped_count),
      errorCount: asInt(job.error_count),
      errorMessage: job.error_message ? asString(job.error_message) : null,
      chunks: chunks.map((c) => ({
        id: asInt(c.id),
        stationId: asString(c.station_id),
        from: asString(c.chunk_from),
        to: asString(c.chunk_to),
        status: asString(c.status),
        received: asInt(c.received_count),
        inserted: asInt(c.inserted_count),
        errorMessage: c.error_message ? asString(c.error_message) : null,
      })),
    };
  });

export const retryJob = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    await retryFailedChunks(sql, data.id);
    await audit("RETRY_COLLECT", String(data.id), "실패 구간 재시도");
    await processJobTick(sql, data.id);
    return { ok: true };
  });

export const cancelCollection = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    await cancelJob(sql, data.id);
    await audit("CANCEL_COLLECT", String(data.id), "수집 취소");
    return { ok: true };
  });

export const listSchedules = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(`select * from weather_schedules order by id`);
  return rows.map((r) => ({
    id: asInt(r.id),
    datasetCode: asString(r.dataset_code),
    enabled: asBool(r.enabled),
    cadence: asString(r.cadence),
    lookbackHours: asInt(r.lookback_hours),
    stationScope: asString(r.station_scope),
    lastRunAt: r.last_run_at ? asString(r.last_run_at) : null,
    lastStatus: r.last_status ? asString(r.last_status) : null,
  }));
});

export const saveSchedule = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number(),
      enabled: z.boolean(),
      cadence: z.enum(["HOURLY", "DAILY"]),
      lookbackHours: z.number().int().min(1).max(168),
      stationScope: z.enum(["FAVORITES", "ENABLED", "ALL"]),
    }),
  )
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
    const sql = await db();
    await sql.query(
      `update weather_schedules set enabled=$2, cadence=$3, lookback_hours=$4, station_scope=$5, updated_at=now() where id=$1`,
      [data.id, data.enabled, data.cadence, data.lookbackHours, data.stationScope],
    );
    await audit("SCHEDULE", String(data.id), `자동수집 ${data.enabled ? "ON" : "OFF"} / ${data.cadence}`);
    return { ok: true };
  });

const queryInput = z.object({
  stationId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rainOnly: z.boolean().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(24),
});

export const queryHourly = createServerFn({ method: "GET" })
  .validator(queryInput)
  .handler(async ({ data }) => {
    const sql = await db();
    const stationId = data.stationId || "108";
    const to = toKstWall(data.to || latestOfficialHour());
    const from = toKstWall(data.from || addHoursKst(to, -48));
    const where = [
      `o.station_id = $1`,
      `o.observation_datetime >= $2::timestamp`,
      `o.observation_datetime <= $3::timestamp`,
    ];
    const params: unknown[] = [stationId, from, to];
    if (data.rainOnly) where.push(`o.precipitation is not null and o.precipitation > 0`);
    if (data.tempMin !== undefined) {
      params.push(data.tempMin);
      where.push(`o.temperature >= $${params.length}`);
    }
    if (data.tempMax !== undefined) {
      params.push(data.tempMax);
      where.push(`o.temperature <= $${params.length}`);
    }
    const whereSql = where.join(" and ");
    const total = await sql.query<{ n: number }>(
      `select count(*)::int as n from weather_observations_hourly o where ${whereSql}`,
      params,
    );
    params.push(data.pageSize, (data.page - 1) * data.pageSize);
    const rows = await sql.query<Record<string, unknown>>(
      `select ${HOURLY_SELECT}
         from weather_observations_hourly o
         left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
        where ${whereSql}
        order by o.observation_datetime desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return {
      total: total[0]?.n ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      from,
      to,
      stationId,
      rows: rows.map((r) => mapHourly(r)),
    };
  });

export const queryDaily = createServerFn({ method: "GET" })
  .validator(queryInput)
  .handler(async ({ data }) => {
    const sql = await db();
    const stationId = data.stationId || "108";
    const to = toKstWall(data.to || latestOfficialHour()).slice(0, 10);
    const from = toKstWall(data.from || addHoursKst(`${to} 00:00:00`, -30 * 24)).slice(0, 10);
    const total = await sql.query<{ n: number }>(
      `select count(*)::int as n from weather_observations_daily
        where station_id=$1 and observation_date >= $2::date and observation_date <= $3::date
          and source_kind='OFFICIAL'`,
      [stationId, from, to],
    );
    const rows = await sql.query<Record<string, unknown>>(
      `select d.*, s.station_name, d.observation_date::text as observation_date
         from weather_observations_daily d
         left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
        where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
          and d.source_kind='OFFICIAL'
        order by d.observation_date desc
        limit $4 offset $5`,
      [stationId, from, to, data.pageSize, (data.page - 1) * data.pageSize],
    );
    return {
      total: total[0]?.n ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      from,
      to,
      stationId,
      rows: rows.map((r) => mapDaily(r)),
    };
  });

export const findGaps = createServerFn({ method: "GET" })
  .validator(z.object({ stationId: z.string(), from: z.string(), to: z.string() }))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql.query<{ observation_datetime: string }>(
      `select to_char(observation_datetime,'YYYY-MM-DD HH24:MI:SS') as observation_datetime
         from weather_observations_hourly
        where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp
        order by observation_datetime`,
      [data.stationId, data.from, data.to],
    );
    const have = new Set(rows.map((r) => r.observation_datetime));
    const missing: string[] = [];
    let cursor = data.from.length === 10 ? `${data.from} 00:00:00` : data.from;
    const end = data.to.length === 10 ? `${data.to} 23:00:00` : data.to;
    let guard = 0;
    while (parseKst(cursor).getTime() <= parseKst(end).getTime() && guard < 4000) {
      if (!have.has(cursor)) missing.push(cursor);
      cursor = addHoursKst(cursor, 1);
      guard += 1;
    }
    return { missing, expected: guard, have: have.size };
  });

export const listApiClients = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, name, client_code, key_prefix, status, scopes, created_at, last_used_at, revoked_at
       from weather_api_clients order by id`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    name: asString(r.name),
    code: asString(r.client_code),
    prefix: asString(r.key_prefix),
    status: asString(r.status),
    scopes: asString(r.scopes),
    createdAt: asString(r.created_at),
    lastUsedAt: r.last_used_at ? asString(r.last_used_at) : null,
  }));
});

export const createApiClient = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().min(2), code: z.string().min(2) }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN"]);
    const sql = await db();
    const key = generateApiKey();
    const row = await sql.query<{ id: number }>(
      `insert into weather_api_clients (name, client_code, key_prefix, key_hash, status, scopes, created_by)
       values ($1,$2,$3,$4,'ACTIVE','READ_WEATHER',$5) returning id`,
      [data.name, data.code.toUpperCase(), key.prefix, key.hash, readRole()],
    );
    await audit("API_KEY_ISSUE", data.code, "내부 API 키 발급 (전문은 저장하지 않음)");
    return { id: row[0]!.id, plaintext: key.plaintext, prefix: key.prefix };
  });

export const revokeApiClient = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN"]);
    const sql = await db();
    await sql.query(
      `update weather_api_clients set status='REVOKED', revoked_at=now() where id=$1`,
      [data.id],
    );
    await audit("API_KEY_REVOKE", String(data.id), "내부 API 키 폐기");
    return { ok: true };
  });

export const listApiUsage = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, client_name, method, path, status_code, result_count, duration_ms,
            to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as created_at
       from weather_api_usage order by id desc limit 80`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    client: r.client_name ? asString(r.client_name) : "unknown",
    method: asString(r.method),
    path: asString(r.path),
    status: asInt(r.status_code),
    count: r.result_count === null ? null : asInt(r.result_count),
    ms: r.duration_ms === null ? null : asInt(r.duration_ms),
    at: asString(r.created_at),
  }));
});

export const listAudit = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, actor_role, action, target, detail,
            to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as created_at
       from weather_audit_log order by id desc limit 80`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    role: r.actor_role ? asString(r.actor_role) : "",
    action: asString(r.action),
    target: r.target ? asString(r.target) : "",
    detail: r.detail ? asString(r.detail) : "",
    at: asString(r.created_at),
  }));
});

export const getHealth = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const hourly = await sql.query<{ n: number; last: string | null }>(
    `select count(*)::int as n, max(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as last
       from weather_observations_hourly`,
  );
  const jobs = await sql.query<{ n: number }>(
    `select count(*)::int as n from weather_collection_jobs where status='FAILED' and created_at > now() - interval '7 days'`,
  );
  return {
    ok: true,
    timezone: "Asia/Seoul",
    db: "ok",
    hourlyRecords: hourly[0]?.n ?? 0,
    latestHourly: hourly[0]?.last ?? null,
    failedJobs7d: jobs[0]?.n ?? 0,
    latestOfficial: latestOfficialHour(),
  };
});

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    await sql.query(`update weather_alerts set acknowledged=true where id=$1`, [data.id]);
    return { ok: true };
  });

export const exportColumns = createServerFn({ method: "GET" }).handler(async () => {
  return EXPORT_COLUMNS;
});

export const startExport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      format: z.enum(["CSV", "XLSX", "JSON"]),
      kind: z.enum(["hourly", "daily"]),
      stationId: z.string(),
      from: z.string(),
      to: z.string(),
      columns: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    assertRole(readRole(), ["ADMIN", "DATA_MANAGER", "VIEWER"]);
    const sql = await db();
    const st = await sql.query<{ station_name: string }>(
      `select station_name from weather_stations where station_id=$1`,
      [data.stationId],
    );
    const stationName = st[0]?.station_name ?? data.stationId;
    let records: Record<string, unknown>[] = [];
    if (data.kind === "hourly") {
      records = await sql.query(
        `select ${HOURLY_SELECT}
           from weather_observations_hourly o
           left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
          where o.station_id=$1 and o.observation_datetime >= $2::timestamp and o.observation_datetime <= $3::timestamp
          order by o.observation_datetime`,
        [data.stationId, data.from, data.to],
      );
    } else {
      records = await sql.query(
        `select d.*, s.station_name, d.observation_date::text as observation_date
           from weather_observations_daily d
           left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
          where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
            and d.source_kind='OFFICIAL'
          order by d.observation_date`,
        [data.stationId, data.from.slice(0, 10), data.to.slice(0, 10)],
      );
    }
    const mapped = records.map((r) => ({
      observation_datetime: asString(r.observation_datetime),
      observation_date: r.observation_date ? asString(r.observation_date).slice(0, 10) : asString(r.observation_datetime).slice(0, 10),
      station_id: asString(r.station_id),
      station_name: asString(r.station_name),
      temperature: asNum(r.temperature),
      avg_temperature: asNum(r.avg_temperature),
      min_temperature: asNum(r.min_temperature),
      max_temperature: asNum(r.max_temperature),
      precipitation: asNum(r.precipitation),
      humidity: asNum(r.humidity),
      avg_humidity: asNum(r.avg_humidity),
      wind_speed: asNum(r.wind_speed),
      wind_direction: r.wind_direction === null ? null : asInt(r.wind_direction),
      avg_wind_speed: asNum(r.avg_wind_speed),
      pressure: asNum(r.pressure),
      sunshine: asNum(r.sunshine),
      sunshine_hours: asNum(r.sunshine_hours),
      solar_radiation: asNum(r.solar_radiation),
      snow_depth: asNum(r.snow_depth),
      visibility: r.visibility === null || r.visibility === undefined ? null : asInt(r.visibility),
      quality_temperature: r.quality_temperature ? asString(r.quality_temperature) : null,
    }));
    const cols = data.columns;
    const headers = cols.map((c) => EXPORT_COLUMNS.find((x) => x.key === c)?.label ?? c);
    const meta = [
      ["데이터 출처", "기상청(KMA) · 기상허브 표준화"],
      ["Dataset", data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY"],
      ["관측지점", `${data.stationId} ${stationName}`],
      ["조회기간", `${data.from} ~ ${data.to}`],
      ["시간대", "Asia/Seoul"],
      ["생성일시", formatKst(new Date())],
      ["건수", String(mapped.length)],
      ["참고", "NULL은 결측이며 0과 다릅니다. 공식 일자료와 시간자료 집계는 별개입니다."],
    ];
    const fileName = `weather-${data.kind}-${data.stationId}-${data.from.slice(0, 10)}.${data.format.toLowerCase()}`;
    let bytes: Buffer;
    let mime: string;
    if (data.format === "JSON") {
      const payload = {
        source: "KMA",
        dataset: data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY",
        timezone: "Asia/Seoul",
        station: { id: data.stationId, name: stationName },
        period: { from: data.from, to: data.to },
        generatedAt: toIsoKst(formatKst(new Date())),
        count: mapped.length,
        data: mapped.map((row) => {
          const o: Record<string, unknown> = {};
          for (const c of cols) o[c] = row[c as keyof typeof row];
          return o;
        }),
      };
      bytes = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
      mime = "application/json";
    } else if (data.format === "CSV") {
      const lines = [
        `# 데이터 출처: 기상청(KMA)`,
        `# Dataset: ${data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY"}`,
        `# 관측지점: ${data.stationId} ${stationName}`,
        `# 조회기간: ${data.from} ~ ${data.to}`,
        `# 시간대: Asia/Seoul`,
        `# 생성일시: ${formatKst(new Date())}`,
        headers.join(","),
        ...mapped.map((row) =>
          cols
            .map((c) => {
              const v = row[c as keyof typeof row];
              if (v === null || v === undefined) return "";
              const s = String(v);
              return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
            })
            .join(","),
        ),
      ];
      bytes = Buffer.from(`\uFEFF${lines.join("\n")}`, "utf8");
      mime = "text/csv; charset=utf-8";
    } else {
      bytes = workbookXlsx([
        { name: "metadata", headers: ["항목", "값"], rows: meta },
        {
          name: "data",
          headers,
          rows: mapped.map((row) => cols.map((c) => row[c as keyof typeof row] as string | number | null)),
        },
      ]);
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    const inserted = await sql.query<{ id: number }>(
      `insert into weather_export_jobs (format, dataset_code, filters_json, columns_json, status, row_count, file_bytes, file_name, created_by, completed_at)
       values ($1,$2,$3,$4,'COMPLETED',$5,$6,$7,$8, now()) returning id`,
      [
        data.format,
        data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY",
        JSON.stringify({ stationId: data.stationId, from: data.from, to: data.to }),
        JSON.stringify(cols),
        mapped.length,
        bytes,
        fileName,
        readRole(),
      ],
    );
    await audit("EXPORT", data.format, `${fileName} ${mapped.length}건`);
    return {
      id: inserted[0]!.id,
      fileName,
      mime,
      base64: bytes.toString("base64"),
      rowCount: mapped.length,
    };
  });

