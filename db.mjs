import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOURLY_EXTRA, DAILY_EXTRA, HOURLY_LEGACY_COLUMNS, DAILY_LEGACY_COLUMNS } from "./kma-fields.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool = null;
// 0003 마이그레이션(기상청 전체 항목 컬럼 + raw)이 적용돼 있으면 true. 아니면 예전 컬럼만 저장한다.
let fullFields = false;
export function fullFieldsReady() {
  return fullFields;
}
export function usingPg() {
  return Boolean(pool);
}
export function getPool() {
  return pool;
}

export async function initDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  const { default: pg } = await import("pg");
  pool = new pg.Pool({ connectionString: url, max: 8 });
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  await pool.query("SELECT 1");
  // 추가 마이그레이션이 실패해도 조회는 예전처럼 PostgreSQL 로 계속 한다(JSON 대체 모드로 떨어지지 않게).
  try {
    const applied = await applyHubMigrations(pool);
    if (applied.length) console.log(`hub migrations applied: ${applied.join(", ")}`);
  } catch (err) {
    console.error("hub migration failed (기존 컬럼만 저장)", err instanceof Error ? err.message : err);
  }
  fullFields = await hasFullFieldColumns(pool);
  return true;
}

const HUB_MIGRATIONS_DIR = path.join(__dirname, "migrations", "hub");

// migrations/hub/*.sql 을 이름 순으로 한 번씩 적용하고 hub_migrations 에 기록한다(파일마다 트랜잭션 하나).
export async function applyHubMigrations(p, dir = HUB_MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  if (!files.length) return [];
  await p.query("CREATE TABLE IF NOT EXISTS hub_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await p.query("SELECT name FROM hub_migrations")).rows.map((r) => r.name));
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query(text);
      await client.query("INSERT INTO hub_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
      await client.query("COMMIT");
      applied.push(name);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`${name}: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function hasFullFieldColumns(p) {
  const need = [
    ...HOURLY_EXTRA.map((f) => ["observations_hourly", f.col]),
    ["observations_hourly", "raw"],
    ...DAILY_EXTRA.map((f) => ["observations_daily", f.col]),
    ["observations_daily", "raw"],
  ];
  const r = await p.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name IN ('observations_hourly', 'observations_daily')`,
  );
  const have = new Set(r.rows.map((x) => `${x.table_name}.${x.column_name}`));
  return need.every(([t, c]) => have.has(`${t}.${c}`));
}

const HOURLY_SELECT = HOURLY_LEGACY_COLUMNS.join(", ");
const DAILY_SELECT = DAILY_LEGACY_COLUMNS.join(", ");

// 기본 컬럼 값 + (마이그레이션 적용 시) 기상청 전체 항목 + raw 로 INSERT … ON CONFLICT 문을 만든다.
// 기존 컬럼의 값·갱신 규칙은 예전 SQL 과 같다. 새 컬럼은 다시 수집하면 새 값으로 채워진다.
export function buildUpsert({ table, base, conflict, update, extra, full }) {
  const cols = base.map((b) => b[0]);
  const vals = base.map((b) => b[1]);
  const sets = update.map((c) => `${c} = EXCLUDED.${c}`);
  if (full) {
    for (const f of extra.fields) {
      cols.push(f.col);
      vals.push(extra.values ? (extra.values[f.col] ?? null) : null);
      sets.push(`${f.col} = EXCLUDED.${f.col}`);
    }
    cols.push("raw");
    vals.push(extra.raw == null ? null : JSON.stringify(extra.raw));
    sets.push("raw = EXCLUDED.raw");
  }
  const ph = cols.map((c, i) => (c === "raw" ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const text = `INSERT INTO ${table}
          (${cols.join(", ")})
         VALUES (${ph.join(",")})
         ON CONFLICT (${conflict})
         DO UPDATE SET
           ${sets.join(",\n           ")}
         RETURNING (xmax = 0) AS is_insert`;
  return { text, values: vals };
}

export async function upsertHourly(rows) {
  if (!rows.length) return { inserted: 0, updated: 0, total: 0 };
  if (!pool) throw new Error("pg not ready");
  let inserted = 0;
  let updated = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      // 수집기(mapHourlyItem)가 붙인 extra/raw 가 있는 행만 새 컬럼을 쓴다. 예전 JSON 가져오기 행은 기존 컬럼만.
      const full = fullFields && r.extra != null;
      const q = buildUpsert({
        table: "observations_hourly",
        base: [
          ["provider", r.provider || "KMA"],
          ["dataset", r.dataset || "ASOS_HOURLY"],
          ["station_id", r.station_id],
          ["station_name", r.station_name || null],
          ["observation_datetime", r.observation_datetime],
          ["timezone", r.timezone || "Asia/Seoul"],
          ["temperature", r.temperature],
          ["precipitation", r.precipitation],
          ["humidity", r.humidity],
          ["wind_speed", r.wind_speed],
          ["wind_direction", r.wind_direction],
          ["pressure", r.pressure],
          ["quality_temperature", r.quality_temperature || null],
          ["source_kind", r.source_kind || "OFFICIAL"],
        ],
        conflict: "provider, dataset, station_id, observation_datetime",
        update: ["station_name", "temperature", "precipitation", "humidity", "wind_speed", "wind_direction", "pressure", "quality_temperature", "source_kind"],
        extra: { fields: HOURLY_EXTRA, values: r.extra, raw: r.raw },
        full,
      });
      const res = await client.query(q.text, q.values);
      if (res.rows[0]?.is_insert) inserted += 1;
      else updated += 1;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const total = await pool.query("SELECT count(*)::int AS n FROM observations_hourly");
  return { inserted, updated, total: total.rows[0].n };
}

export async function queryHourlyPg({ stationId, from, to, page, pageSize }) {
  const size = Math.min(10000, Math.max(1, Number(pageSize) || 500));
  const p = Math.max(1, Number(page) || 1);
  const offset = (p - 1) * size;
  const count = await pool.query(
    `SELECT count(*)::int AS n FROM observations_hourly
     WHERE station_id = $1 AND observation_datetime >= $2 AND observation_datetime <= $3`,
    [stationId, from, to],
  );
  const total = count.rows[0].n;
  const rows = await pool.query(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = $1 AND observation_datetime >= $2 AND observation_datetime <= $3
     ORDER BY observation_datetime
     LIMIT $4 OFFSET $5`,
    [stationId, from, to, size, offset],
  );
  return { total, page: p, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), data: rows.rows };
}

export async function queryHourlyAllPg({ stationId, from, to }) {
  const rows = await pool.query(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = $1 AND observation_datetime >= $2 AND observation_datetime <= $3
     ORDER BY observation_datetime`,
    [stationId, from, to],
  );
  return rows.rows;
}

export async function countHourly() {
  const r = await pool.query("SELECT count(*)::int AS n FROM observations_hourly");
  return r.rows[0].n;
}

export async function coverageHourly() {
  const r = await pool.query(
    `SELECT dataset, count(*)::int AS records, count(DISTINCT station_id)::int AS stations,
            min(observation_datetime) AS first, max(observation_datetime) AS last
     FROM observations_hourly GROUP BY dataset`,
  );
  return r.rows;
}

export async function seriesSeoul() {
  const r = await pool.query(
    `SELECT observation_datetime, temperature, precipitation
     FROM observations_hourly WHERE station_id = '108'
     ORDER BY observation_datetime DESC LIMIT 72`,
  );
  return r.rows.reverse().map((x) => ({
    t: String(x.observation_datetime).slice(5, 13),
    temperature: x.temperature,
    precipitation: x.precipitation,
  }));
}

// observation_datetime은 TEXT이고 'YYYY-MM-DD HH:MM'(16자)와 'YYYY-MM-DD HH:MM:SS'(19자)가 섞여 있다.
// 같은 시각이 두 형식으로 중복 저장된 행도 있으므로 left(...,16)으로 정규화하고 시각당 한 행만 쓴다.
export async function latestHourPg(stationId) {
  const r = await pool.query(
    `SELECT max(left(observation_datetime,16)) AS t FROM observations_hourly WHERE station_id = $1`,
    [stationId],
  );
  return r.rows[0]?.t || null;
}

export async function seriesPg(stationId, from16, to16) {
  const r = await pool.query(
    `SELECT DISTINCT ON (left(observation_datetime,16))
            left(observation_datetime,16) AS t, station_name,
            temperature, precipitation, humidity, wind_speed
     FROM observations_hourly
     WHERE station_id = $1 AND left(observation_datetime,16) BETWEEN $2 AND $3
     ORDER BY left(observation_datetime,16), length(observation_datetime) DESC`,
    [stationId, from16, to16],
  );
  return r.rows;
}

// 지점별 요약 한 번에: 시각(16자)별로 묶어 중복을 접고 → 지점별 집계 → 마지막 시각의 행을 붙인다.
export async function stationSummariesPg() {
  const r = await pool.query(
    `WITH u AS (
       SELECT station_id, left(observation_datetime,16) AS t, count(*) AS n
       FROM observations_hourly GROUP BY 1, 2
     ), agg AS (
       SELECT station_id, sum(n)::int AS rows, count(*)::int AS hours,
              min(t) AS first_observation, max(t) AS last_observation
       FROM u GROUP BY 1
     )
     SELECT DISTINCT ON (a.station_id)
            a.station_id, o.station_name, a.first_observation, a.last_observation,
            o.temperature, o.humidity, o.precipitation, o.wind_speed, a.rows, a.hours
     FROM agg a
     JOIN observations_hourly o
       ON o.station_id = a.station_id AND left(o.observation_datetime,16) = a.last_observation
     ORDER BY a.station_id, length(o.observation_datetime) DESC`,
  );
  return r.rows;
}

export async function hourlyForDaily(stationId, fromDate, toDate) {
  const r = await pool.query(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = $1
       AND left(observation_datetime,10) >= $2
       AND left(observation_datetime,10) <= $3`,
    [stationId, fromDate, toDate],
  );
  return r.rows;
}

export async function upsertDaily(rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const full = fullFields && r.extra != null;
    const q = buildUpsert({
      table: "observations_daily",
      base: [
        ["station_id", r.station_id],
        ["station_name", r.station_name || null],
        ["observation_date", r.observation_date],
        ["avg_temperature", r.avg_temperature],
        ["min_temperature", r.min_temperature],
        ["max_temperature", r.max_temperature],
        ["precipitation", r.precipitation],
        ["avg_humidity", r.avg_humidity],
        ["source_kind", r.source_kind || "OFFICIAL"],
        ["note", r.note || null],
      ],
      conflict: "station_id, observation_date",
      update: ["station_name", "avg_temperature", "min_temperature", "max_temperature", "precipitation", "avg_humidity", "source_kind", "note"],
      extra: { fields: DAILY_EXTRA, values: r.extra, raw: r.raw },
      full,
    });
    const res = await pool.query(q.text, q.values);
    if (res.rows[0]?.is_insert) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}

export async function listDailyOfficial(stationId) {
  const r = await pool.query(`SELECT ${DAILY_SELECT} FROM observations_daily WHERE station_id = $1`, [stationId]);
  return r.rows;
}

export async function countDaily() {
  const r = await pool.query("SELECT count(*)::int AS n FROM observations_daily");
  return r.rows[0].n;
}

export async function insertJob(job) {
  await pool.query(
    `INSERT INTO collect_jobs
      (id, dataset, status, trigger, station_id, range_from, range_to, received, inserted, updated, chunks, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status, received = EXCLUDED.received, inserted = EXCLUDED.inserted,
       updated = EXCLUDED.updated, chunks = EXCLUDED.chunks, message = EXCLUDED.message`,
    [
      job.id,
      job.dataset,
      job.status,
      job.trigger,
      job.station_id || null,
      job.from || null,
      job.to || null,
      job.received || 0,
      job.inserted || 0,
      job.updated || 0,
      job.chunks || 0,
      job.message || "",
    ],
  );
}

export async function listJobs() {
  const r = await pool.query(`SELECT * FROM collect_jobs ORDER BY id DESC LIMIT 80`);
  return r.rows.map((j) => ({
    id: Number(j.id),
    dataset: j.dataset,
    status: j.status,
    trigger: j.trigger,
    station_id: j.station_id,
    from: j.range_from,
    to: j.range_to,
    received: j.received,
    inserted: j.inserted,
    updated: j.updated,
    chunks: j.chunks,
    message: j.message,
  }));
}

export async function listStationsPg() {
  const r = await pool.query(`SELECT * FROM weather_stations ORDER BY station_id`);
  return r.rows;
}

export async function saveStations(list) {
  for (const s of list) {
    await pool.query(
      `INSERT INTO weather_stations (station_id, station_name, region, enabled, favorite)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (station_id) DO UPDATE SET
         station_name = EXCLUDED.station_name, region = EXCLUDED.region,
         enabled = EXCLUDED.enabled, favorite = EXCLUDED.favorite`,
      [s.station_id, s.station_name, s.region || null, Boolean(s.enabled), Boolean(s.favorite)],
    );
  }
}

export async function getSetting(k) {
  const r = await pool.query(`SELECT v FROM hub_settings WHERE k = $1`, [k]);
  return r.rows[0]?.v || null;
}

export async function setSetting(k, v) {
  await pool.query(
    `INSERT INTO hub_settings (k, v) VALUES ($1,$2)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
    [k, v],
  );
}

export async function importJsonIfEmpty(dataDir) {
  const n = await countHourly();
  if (n > 0) return { imported: 0 };
  const file = path.join(dataDir, "hourly.json");
  if (!fs.existsSync(file)) return { imported: 0 };
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || !rows.length) return { imported: 0 };
  const u = await upsertHourly(rows);
  return { imported: u.inserted + u.updated };
}

// ---- 미적재 현황(gaps) ----
// 시각은 left(observation_datetime,13) = 'YYYY-MM-DD HH' 로 정규화해 'HH:MM'/'HH:MM:SS' 중복 행이 한 시각으로 접히게 한다.
// ranges: [{ station_id, a: 'YYYY-MM-DD HH', b: 'YYYY-MM-DD HH' }] (양 끝 포함)
function rangeArrays(ranges) {
  return [ranges.map((r) => r.station_id), ranges.map((r) => r.a), ranges.map((r) => r.b)];
}

export async function gapBoundsPg(stationIds) {
  const [h, d] = await Promise.all([
    pool.query(
      `SELECT station_id, left(min(observation_datetime),16) AS first, left(max(observation_datetime),16) AS last
       FROM observations_hourly WHERE station_id = ANY($1::text[]) GROUP BY 1`,
      [stationIds],
    ),
    pool.query(
      `SELECT station_id, min(observation_date) AS first, max(observation_date) AS last
       FROM observations_daily WHERE station_id = ANY($1::text[]) GROUP BY 1`,
      [stationIds],
    ),
  ]);
  return { hourly: h.rows, daily: d.rows };
}

// 지점·일자별 적재된 시각 수(중복 제외)와 행 수
export async function gapDayCountsPg(ranges) {
  if (!ranges.length) return [];
  const r = await pool.query(
    `WITH r AS (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS r(station_id, a, b))
     SELECT o.station_id, left(o.observation_datetime,10) AS d,
            count(DISTINCT left(o.observation_datetime,13))::int AS n, count(*)::int AS rows
     FROM observations_hourly o
     JOIN r ON o.station_id = r.station_id AND left(o.observation_datetime,13) BETWEEN r.a AND r.b
     GROUP BY 1, 2`,
    rangeArrays(ranges),
  );
  return r.rows;
}

// 비어 있는 시각을 generate_series와 비교해 찾고, 연속된 시각을 한 구간으로 묶는다(gaps-and-islands).
export async function gapHourIntervalsPg(ranges) {
  if (!ranges.length) return [];
  const r = await pool.query(
    `WITH r AS (
       SELECT station_id, a, b, to_timestamp(a, 'YYYY-MM-DD HH24')::timestamp AS ta, to_timestamp(b, 'YYYY-MM-DD HH24')::timestamp AS tb
       FROM unnest($1::text[], $2::text[], $3::text[]) AS r(station_id, a, b)
     ), have AS (
       SELECT DISTINCT o.station_id, left(o.observation_datetime,13) AS h
       FROM observations_hourly o
       JOIN r ON o.station_id = r.station_id AND left(o.observation_datetime,13) BETWEEN r.a AND r.b
     ), miss AS (
       SELECT r.station_id, g
       FROM r CROSS JOIN LATERAL generate_series(r.ta, r.tb, interval '1 hour') AS g
       WHERE NOT EXISTS (SELECT 1 FROM have WHERE have.station_id = r.station_id AND have.h = to_char(g, 'YYYY-MM-DD HH24'))
     ), grp AS (
       SELECT station_id, g, g - (row_number() OVER (PARTITION BY station_id ORDER BY g)) * interval '1 hour' AS k
       FROM miss
     )
     SELECT station_id, to_char(min(g), 'YYYY-MM-DD HH24') AS s, to_char(max(g), 'YYYY-MM-DD HH24') AS e, count(*)::int AS n
     FROM grp GROUP BY station_id, k ORDER BY station_id, min(g)`,
    rangeArrays(ranges),
  );
  return r.rows;
}

export async function gapOfficialDaysPg(stationIds, fromDate, toDate) {
  const r = await pool.query(
    `SELECT station_id, observation_date AS d FROM observations_daily
     WHERE station_id = ANY($1::text[]) AND observation_date BETWEEN $2 AND $3`,
    [stationIds, fromDate, toDate],
  );
  return r.rows;
}
