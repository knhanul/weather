// MySQL 5.6+ 저장소 (DB_DRIVER=mysql, MYSQL_URL). db.mjs 의 PostgreSQL 함수와 같은 이름·같은 결과 모양을 돌려준다.
// 5.6 에는 창 함수·CTE·JSON 형식·DISTINCT ON·부분 인덱스가 없으므로 그런 부분은 단순 쿼리 + JS 로 계산한다(db-common.mjs).
// 시각(timestamptz 대응)은 DATETIME(6) 에 UTC 로 저장: 연결마다 time_zone='+00:00', mysql2 timezone 'Z'.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOURLY_EXTRA, DAILY_EXTRA, HOURLY_LEGACY_COLUMNS, DAILY_LEGACY_COLUMNS, validateExportColumns,
} from "./kma-fields.mjs";
import { mergeDailyExport, hourGapIntervals, prefixUpper } from "./db-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MYSQL_MIGRATIONS_DIR = path.join(__dirname, "migrations", "mysql");

const QUERY_TIMEOUT_MS = Number(process.env.MYSQL_QUERY_TIMEOUT_MS) || 120000;
// NAS max_allowed_packet 이 1MB 라 한 INSERT 묶음을 그보다 작게 자른다.
const BATCH_MAX_BYTES = 600 * 1024;
const BATCH_MAX_ROWS = 400;
const RETRYABLE = new Set(["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "PROTOCOL_SEQUENCE_TIMEOUT"]);

let pool = null;
let fullFields = false;
export const fullFieldsReady = () => fullFields;

// TINYINT(1) → boolean (PostgreSQL boolean 과 같은 JSON 출력)
function typeCast(field, next) {
  if (field.type === "TINY" && field.length === 1) {
    const v = field.string();
    return v === null ? null : v === "1";
  }
  return next();
}

export function poolOptions(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    charset: "UTF8MB4_BIN",
    timezone: "Z",
    dateStrings: false,
    decimalNumbers: true,
    supportBigNumbers: false,
    typeCast,
    // 영향 행 수를 "바뀐 행" 기준으로(ON DUPLICATE KEY UPDATE: 새 행 1, 바뀐 행 2, 그대로 0)
    flags: ["-FOUND_ROWS"],
    connectionLimit: Number(process.env.MYSQL_POOL_MAX) || 6,
    maxIdle: 2,
    idleTimeout: 60000,
    queueLimit: 200,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    waitForConnections: true,
  };
}

const SESSION_SQL = "SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";

export async function createMysqlPool(url) {
  const mysql = (await import("mysql2/promise")).default;
  const p = mysql.createPool(poolOptions(url));
  p.pool.on("connection", (conn) => {
    // 쉬던 연결이 NAS·공유기 쪽에서 끊겨도 프로세스가 죽지 않게 오류를 받아 로그만 남긴다(풀이 그 연결을 버리고 새로 맺음).
    conn.on("error", (err) => console.error("mysql connection error", err?.code || err?.message));
    conn.query(SESSION_SQL, (err) => {
      if (err) console.error("mysql session setup failed", err.code || err.message);
    });
  });
  return p;
}

// 읽기: 연결이 끊긴 경우에만 한 번 다시 시도. 결과는 행 배열(또는 OkPacket).
async function q(sql, params = [], { retry = true } = {}) {
  try {
    const [rows] = await pool.query({ sql, timeout: QUERY_TIMEOUT_MS }, params);
    return rows;
  } catch (err) {
    if (retry && RETRYABLE.has(err?.code)) {
      const [rows] = await pool.query({ sql, timeout: QUERY_TIMEOUT_MS }, params);
      return rows;
    }
    throw err;
  }
}
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const run = async (sql, params = []) => (await conn.query({ sql, timeout: QUERY_TIMEOUT_MS }, params))[0];
    const out = await fn(run);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ---- 전체 표 집계 캐시 ----
// NAS(저사양 CPU, 버퍼 풀 128MB)에서 49만 행 전체 집계(개수·coverage·지점 요약)는 수 초 걸린다. 쓰기는 이 앱만 하므로
// 결과를 기억해 두고, 시간자료·일자료를 저장하면 비운 뒤 뒤에서 다시 계산한다. 밖에서 DB 를 고친 경우를 위해 최대 30분.
// 저장 뒤 다시 계산은 모아서 한 번(기본 2분 뒤, MYSQL_AGG_REFRESH_MS). 그동안은 직전 값을 그대로 보여 준다(대량 수집 중 NAS 가 집계만 돌지 않게).
export function createAggCache({ ttlMs, refreshMs }) {
  const cache = new Map();
  let timer = null;
  let refreshing = false;
  async function refresh() {
    timer = null;
    refreshing = true;
    try {
      for (const [key, e] of [...cache]) {
        try {
          const p = e.fn();
          await p;
          cache.set(key, { at: Date.now(), fn: e.fn, settled: true, p });
        } catch {
          cache.delete(key); // 다음 요청 때 다시
        }
      }
    } finally {
      refreshing = false;
    }
  }
  return {
    get(key, fn) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < ttlMs()) return hit.p;
      // 만료됐어도 이미 값이 있으면 그 값을 바로 주고 뒤에서 한 번만 다시 계산(요청이 느린 집계를 기다리지 않게)
      if (hit && hit.settled) {
        if (!timer && !refreshing) {
          timer = setTimeout(() => refresh().catch(() => {}), 0);
          timer.unref?.();
        }
        return hit.p;
      }
      if (hit) return hit.p; // 같은 집계가 이미 계산 중이면 그걸 같이 기다림(동시 요청이 몰려도 한 번)
      const entry = { at: Date.now(), fn, settled: false };
      entry.p = fn();
      entry.p.then(() => (entry.settled = true), () => cache.get(key) === entry && cache.delete(key));
      cache.set(key, entry);
      return entry.p;
    },
    invalidate(override) {
      const ms = override ?? refreshMs();
      if (override === 0 && ttlMs() > 0) {
        for (const e of cache.values()) e.at = 0;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => refresh().catch(() => {}), 0);
        timer.unref?.();
        return;
      }
      if (ttlMs() <= 0 || ms <= 0) return cache.clear();
      for (const e of cache.values()) e.at = 0; // 만료 표시. 다시 계산될 때까지 직전 값을 준다
      if (!timer) {
        timer = setTimeout(() => refresh().catch(() => {}), ms);
        timer.unref?.();
      }
    },
    clear: () => cache.clear(),
  };
}
const agg = createAggCache({
  ttlMs: () => Number(process.env.MYSQL_AGG_CACHE_MS ?? 30 * 60000),
  refreshMs: () => Number(process.env.MYSQL_AGG_REFRESH_MS ?? 2 * 60000),
});
const cachedAgg = (key, fn) => agg.get(key, fn);
const invalidateAgg = (ms) => agg.invalidate(ms);
export async function warmAggregates() {
  await Promise.all([countHourly(), countDaily(), coverageHourly(), stationSummariesPg()]);
}

// auth-store / layouts 가 쓰는 얇은 래퍼 (pg Pool 대신 넘긴다)
export const handle = { kind: "mysql", query: (sql, params) => q(sql, params, { retry: false }), read: (sql, params) => q(sql, params), tx };
export function getHandle() {
  return pool ? handle : null;
}
export async function ping() {
  const t = Date.now();
  await q("SELECT 1 AS ok");
  return Date.now() - t;
}
export async function close() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
}

// 마이그레이션 파일은 줄 끝 ';' 로 문장을 나눈다(문자열 안의 ';' 는 쓰지 않는다). -- 주석 줄은 버린다.
export function splitStatements(text) {
  const noComments = text.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  return noComments.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
}

export async function applyMysqlMigrations(dir = MYSQL_MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  await q("CREATE TABLE IF NOT EXISTS hub_migrations (name VARCHAR(191) NOT NULL PRIMARY KEY, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
  const done = new Set((await q("SELECT name FROM hub_migrations")).map((r) => r.name));
  const applied = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
    const name = `mysql/${file}`;
    if (done.has(name)) continue;
    // MySQL DDL 은 트랜잭션으로 묶이지 않는다 → 문장마다 IF NOT EXISTS 로 다시 실행해도 안전하게 쓴다.
    for (const st of splitStatements(fs.readFileSync(path.join(dir, file), "utf8"))) await q(st, [], { retry: false });
    await q("INSERT IGNORE INTO hub_migrations (name) VALUES (?)", [name], { retry: false });
    applied.push(name);
  }
  return applied;
}

// MySQL 5.6 에는 ADD INDEX IF NOT EXISTS 가 없어 여기서 확인 후 만든다(온라인 DDL: 표를 잠그지 않음).
// observations_daily_date: 일자료 COUNT(*) 가 넓은 기본 키 대신 좁은 이 색인을 훑게(NAS 3.3초 → 0.1초).
async function ensureIndex(table, name, cols) {
  const r = await q("SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1", [table, name]);
  if (r.length) return false;
  await q(`ALTER TABLE ${table} ADD INDEX ${name} ${cols}, ALGORITHM=INPLACE, LOCK=NONE`, [], { retry: false });
  console.log(`mysql index added: ${table}.${name}`);
  return true;
}

export async function hasFullFieldColumns() {
  const need = [
    ...HOURLY_EXTRA.map((f) => ["observations_hourly", f.col]),
    ["observations_hourly", "raw"],
    ...DAILY_EXTRA.map((f) => ["observations_daily", f.col]),
    ["observations_daily", "raw"],
  ];
  const r = await q(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name IN ('observations_hourly', 'observations_daily')`,
  );
  const have = new Set(r.map((x) => `${x.t}.${x.c}`));
  return need.every(([t, c]) => have.has(`${t}.${c}`));
}

export async function init(url) {
  pool = await createMysqlPool(url);
  await q("SELECT 1");
  const applied = await applyMysqlMigrations();
  if (applied.length) console.log(`mysql migrations applied: ${applied.join(", ")}`);
  fullFields = await hasFullFieldColumns();
  await ensureIndex("observations_daily", "observations_daily_date", "(observation_date)");
  statsReady = await loadStatsReady();
  // 요약표가 없으면 뒤에서 지점별로 채운다(그동안은 예전 전체 집계). 다 되면 집계를 다시 계산.
  if (!statsReady && process.env.MYSQL_STATS_BUILD !== "0") {
    statsQueue(rebuildStats)
      .then(() => { invalidateAgg(0); return warmAggregates(); })
      .catch((e) => console.error("mysql stats build failed", e?.code || e?.message));
  }
  // 첫 화면이 기다리지 않게 전체 집계를 미리 계산(뒤에서). 요약표가 준비됐을 때만(아니면 위에서 만든 뒤에)
  if (statsReady && Number(process.env.MYSQL_AGG_CACHE_MS ?? 1) > 0) warmAggregates().catch((e) => console.error("mysql warm aggregates failed", e?.code || e?.message));
  return true;
}

const HOURLY_SELECT = HOURLY_LEGACY_COLUMNS.join(", ");
const DAILY_SELECT = DAILY_LEGACY_COLUMNS.join(", ");
const qi = (c) => `\`${c}\``;

// ---- UPSERT ----
// rows → [{ cols, vals }] (pg 의 buildUpsert 와 같은 열 선택 규칙: extra/raw 가 있는 행만 새 컬럼을 쓴다)
export function upsertShape({ base, extra, full }) {
  const cols = base.map((b) => b[0]);
  const vals = base.map((b) => b[1]);
  if (full) {
    for (const f of extra.fields) {
      cols.push(f.col);
      vals.push(extra.values ? (extra.values[f.col] ?? null) : null);
    }
    cols.push("raw");
    vals.push(extra.raw == null ? null : JSON.stringify(extra.raw));
  }
  return { cols, vals };
}

// 같은 열 모양의 연속 행을 묶어 INSERT … VALUES (…),(…) ON DUPLICATE KEY UPDATE 문 여러 개로 만든다.
export function buildBatches({ table, shaped, update }) {
  const out = [];
  let cur = null;
  let bytes = 0;
  const flush = () => {
    if (!cur) return;
    const { cols } = cur;
    const sets = [...update, ...cols.filter((c) => !update.includes(c) && cur.extraUpdate.has(c))].map((c) => `${qi(c)} = VALUES(${qi(c)})`);
    const ph = `(${cols.map(() => "?").join(",")})`;
    out.push({
      sql: `INSERT INTO ${table} (${cols.map(qi).join(", ")}) VALUES ${cur.rows.map(() => ph).join(",")} ON DUPLICATE KEY UPDATE ${sets.join(", ")}`,
      params: cur.rows.flat(),
      count: cur.rows.length,
    });
    cur = null;
    bytes = 0;
  };
  for (const s of shaped) {
    const key = s.cols.join(",");
    const size = s.vals.reduce((n, v) => n + (v == null ? 4 : String(v).length * 3 + 4), 0);
    if (cur && (cur.key !== key || cur.rows.length >= BATCH_MAX_ROWS || bytes + size > BATCH_MAX_BYTES)) flush();
    if (!cur) cur = { key, cols: s.cols, rows: [], extraUpdate: new Set(s.extraUpdate || []) };
    cur.rows.push(s.vals);
    bytes += size;
  }
  flush();
  return out;
}

async function existingKeys(run, table, keyCols, rows) {
  // 지점별로 묶어 IN 목록으로 조회. 반환: Set("k1|k2|…")
  const set = new Set();
  const [a, b] = keyCols; // a = station_id, b = 시각/일자
  const byStation = new Map();
  for (const r of rows) {
    if (!byStation.has(r[a])) byStation.set(r[a], new Set());
    byStation.get(r[a]).add(r[b]);
  }
  for (const [st, vals] of byStation) {
    const list = [...vals];
    for (let i = 0; i < list.length; i += 500) {
      const part = list.slice(i, i + 500);
      const found = await run(
        `SELECT ${keyCols.map(qi).join(", ")} FROM ${table} WHERE ${qi(a)} = ? AND ${qi(b)} IN (${part.map(() => "?").join(",")})`,
        [st, ...part],
      );
      for (const f of found) set.add(keyCols.map((c) => f[c]).join("|"));
    }
  }
  return set;
}

async function upsertRows({ table, keyCols, update, shapedRows }) {
  return tx(async (run) => {
    const exist = await existingKeys(run, table, keyCols, shapedRows.map((s) => s.key));
    let inserted = 0;
    let updated = 0;
    for (const s of shapedRows) {
      const k = keyCols.map((c) => s.key[c]).join("|");
      if (exist.has(k)) updated += 1;
      else {
        inserted += 1;
        exist.add(k);
      }
    }
    for (const b of buildBatches({ table, shaped: shapedRows, update })) await run(b.sql, b.params);
    return { inserted, updated };
  });
}

const HOURLY_UPDATE = ["station_name", "temperature", "precipitation", "humidity", "wind_speed", "wind_direction", "pressure", "quality_temperature", "source_kind"];
const DAILY_UPDATE = ["station_name", "avg_temperature", "min_temperature", "max_temperature", "precipitation", "avg_humidity", "source_kind", "note"];

export function shapeHourly(r) {
  const full = fullFields && r.extra != null;
  const key = {
    provider: r.provider || "KMA",
    dataset: r.dataset || "ASOS_HOURLY",
    station_id: r.station_id,
    observation_datetime: r.observation_datetime,
  };
  const s = upsertShape({
    base: [
      ["provider", key.provider],
      ["dataset", key.dataset],
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
    extra: { fields: HOURLY_EXTRA, values: r.extra, raw: r.raw },
    full,
  });
  return { ...s, key, extraUpdate: full ? [...HOURLY_EXTRA.map((f) => f.col), "raw"] : [] };
}

export async function upsertHourly(rows) {
  if (!rows.length) return { inserted: 0, updated: 0, total: 0 };
  if (!pool) throw new Error("mysql not ready");
  const shapedRows = rows.map(shapeHourly).map((s) => ({ ...s, key: { station_id: s.key.station_id, observation_datetime: s.key.observation_datetime, provider: s.key.provider, dataset: s.key.dataset } }));
  let res;
  try {
    res = await upsertRows({ table: "observations_hourly", keyCols: ["station_id", "observation_datetime", "provider", "dataset"], update: HOURLY_UPDATE, shapedRows });
  } finally {
    await statsQueue(() => refreshHourlyStats(touchedMonths(rows))).catch((e) => markStatsStale(e));
    invalidateAgg();
  }
  // total 은 집계 캐시 값(다시 계산 전이면 직전 값). 매번 전체 COUNT(*) 를 하지 않는다.
  const total = await countHourly();
  return { ...res, total };
}

export async function upsertDaily(rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  if (!pool) throw new Error("mysql not ready");
  const shapedRows = rows.map((r) => {
    const full = fullFields && r.extra != null;
    const s = upsertShape({
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
      extra: { fields: DAILY_EXTRA, values: r.extra, raw: r.raw },
      full,
    });
    return { ...s, key: { station_id: r.station_id, observation_date: r.observation_date }, extraUpdate: full ? [...DAILY_EXTRA.map((f) => f.col), "raw"] : [] };
  });
  try {
    return await upsertRows({ table: "observations_daily", keyCols: ["station_id", "observation_date"], update: DAILY_UPDATE, shapedRows });
  } finally {
    await statsQueue(() => refreshDailyStats([...new Set(rows.map((r) => String(r.station_id)))])).catch((e) => markStatsStale(e));
    invalidateAgg();
  }
}

// ---- 시간자료 조회 ----
export async function queryHourlyPg({ stationId, from, to, page, pageSize }) {
  const size = Math.min(10000, Math.max(1, Number(pageSize) || 500));
  const p = Math.max(1, Number(page) || 1);
  const offset = (p - 1) * size;
  const total = (await q(
    `SELECT COUNT(*) AS n FROM observations_hourly WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?`,
    [stationId, from, to],
  ))[0].n;
  const rows = await q(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
     ORDER BY observation_datetime LIMIT ? OFFSET ?`,
    [stationId, from, to, size, offset],
  );
  return { total, page: p, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), data: rows };
}

export async function queryHourlyAllPg({ stationId, from, to }) {
  return q(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
     ORDER BY observation_datetime`,
    [stationId, from, to],
  );
}

export async function countHourlyExportPg({ stationId, from, to }) {
  if (!pool) throw new Error("mysql not ready");
  const r = await q(
    `SELECT COUNT(*) AS n FROM observations_hourly WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?`,
    [stationId, from, to],
  );
  return r[0]?.n || 0;
}

export function buildHourlyExportSqlMysql({ stationId, from, to, columns, limit = null, offset = 0, isFull = false }) {
  const cols = validateExportColumns("hourly", columns);
  const parts = cols.map((c) => (isFull || HOURLY_LEGACY_COLUMNS.includes(c) ? qi(c) : `NULL AS ${qi(c)}`));
  const lim = Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}${Number.isInteger(offset) && offset > 0 ? ` OFFSET ${offset}` : ""}` : "";
  return {
    sql: `SELECT ${parts.join(", ")} FROM observations_hourly
          WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
          ORDER BY observation_datetime ASC${lim}`,
    params: [stationId, from, to],
    columns: cols,
  };
}

export async function queryHourlyExportPg({ stationId, from, to, columns, limit = null, offset = 0 }) {
  if (!pool) throw new Error("mysql not ready");
  const { sql, params } = buildHourlyExportSqlMysql({ stationId, from, to, columns, limit, offset, isFull: fullFields });
  return q(sql, params);
}

// 요약표(hourly_month_stats 등)가 준비됐으면 거기서(수천 행), 아니면 예전처럼 원본 전체 집계. 값은 같다(scripts/check-stats.mjs).
export function countHourly() {
  return cachedAgg("countHourly", async () =>
    statsReady
      ? (await q("SELECT CAST(COALESCE(SUM(n_rows),0) AS SIGNED) AS n FROM hourly_month_stats"))[0].n
      : (await q("SELECT COUNT(*) AS n FROM observations_hourly"))[0].n,
  );
}

export function coverageHourly() {
  return cachedAgg("coverageHourly", () =>
    statsReady
      ? q(`SELECT dataset, CAST(SUM(n_rows) AS SIGNED) AS records, COUNT(DISTINCT station_id) AS stations,
                  MIN(first_dt) AS first, MAX(last_dt) AS last
           FROM hourly_month_stats GROUP BY dataset`)
      : q(`SELECT dataset, COUNT(*) AS records, COUNT(DISTINCT station_id) AS stations,
                  MIN(observation_datetime) AS first, MAX(observation_datetime) AS last
           FROM observations_hourly GROUP BY dataset`),
  );
}

export async function seriesSeoul() {
  const r = await q(
    `SELECT observation_datetime, temperature, precipitation
     FROM observations_hourly WHERE station_id = '108'
     ORDER BY observation_datetime DESC LIMIT 72`,
  );
  return r.reverse().map((x) => ({
    t: String(x.observation_datetime).slice(5, 13),
    temperature: x.temperature,
    precipitation: x.precipitation,
  }));
}

// max(left(x,16)) = left(max(x),16) (문자열 접두어는 순서를 지킨다) → 인덱스 끝 한 칸만 읽는다
export async function latestHourPg(stationId) {
  const r = await q(`SELECT LEFT(MAX(observation_datetime),16) AS t FROM observations_hourly WHERE station_id = ?`, [stationId]);
  return r[0]?.t || null;
}

// 시각(16자)별 한 행: 같은 시각이 'HH:MM'·'HH:MM:SS' 두 형식으로 있으면 긴 쪽 (pg DISTINCT ON … ORDER BY length DESC 와 같음).
// rows 는 observation_datetime 순이므로 같은 t 묶음이 붙어 있고, 묶음의 마지막 행이 가장 길다.
export function pickLongestPerT(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (i + 1 < rows.length && rows[i + 1].t === rows[i].t) continue;
    out.push(rows[i]);
  }
  return out;
}

// 그래프 일 단위(30일 초과): 공식 일자료만, 날짜순. 기본 키(station_id, observation_date) 범위 → 24개월 731행
export async function dailySeriesPg(stationId, fromDate, toDate) {
  return q(
    `SELECT observation_date, avg_temperature, min_temperature, max_temperature, precipitation, avg_humidity, avg_wind_speed
     FROM observations_daily WHERE station_id = ? AND observation_date BETWEEN ? AND ? AND source_kind = 'OFFICIAL'
     ORDER BY observation_date`,
    [stationId, fromDate, toDate],
  );
}

// 날씨 통계: 지점 하나의 공식 일자료 전체(통계용 항목만). 기본 키 (station_id, observation_date) 범위 읽기
export async function statsDailyRows(stationId) {
  return q(
    `SELECT observation_date, avg_temperature, max_temperature, min_temperature, precipitation, avg_humidity, avg_wind_speed, max_new_snow, max_snow_depth
     FROM observations_daily WHERE station_id = ? AND source_kind = 'OFFICIAL' ORDER BY observation_date`,
    [stationId],
  );
}
// 날씨 통계(시간자료 기반): 지점 하나의 [from, to) 정시 자료(통계용 항목만). 기본 키 (station_id, observation_datetime …) 범위 읽기 — 한 해 약 0.25초
export async function statsHourlyRows(stationId, from, to) {
  return q(
    `SELECT observation_datetime, temperature, precipitation, humidity, wind_speed, rn_qcflg, ta_qcflg
     FROM observations_hourly WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime < ? AND provider = 'KMA' AND dataset = 'ASOS_HOURLY'`,
    [stationId, from, to],
  );
}
// 날씨 기록 '그날의 날씨': 공식 일자료 한 행(기본 키 읽기)
export async function statsDayRow(stationId, date) {
  const rows = await q(
    `SELECT observation_date, avg_temperature, max_temperature, max_temperature_time, min_temperature, min_temperature_time, precipitation, precip_duration, max_precip_1h, avg_humidity, min_humidity, avg_wind_speed, max_wind_speed, max_inst_wind_speed, sunshine, avg_total_cloud, max_new_snow, max_snow_depth, weather_phenomena FROM observations_daily WHERE station_id = ? AND observation_date = ? AND source_kind = 'OFFICIAL' LIMIT 1`,
    [stationId, date],
  );
  return rows[0] || null;
}

export async function seriesPg(stationId, from16, to16) {
  const r = await q(
    `SELECT LEFT(observation_datetime,16) AS t, station_name, temperature, precipitation, humidity, wind_speed
     FROM observations_hourly
     WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
       AND LEFT(observation_datetime,16) BETWEEN ? AND ?
     ORDER BY observation_datetime`,
    [stationId, from16, prefixUpper(to16), from16, to16],
  );
  return pickLongestPerT(r);
}

export function stationSummariesPg() {
  return cachedAgg("stationSummaries", stationSummariesQuery);
}
async function stationSummariesQuery() {
  const agg = await q(
    statsReady
      ? `SELECT station_id, CAST(SUM(n_rows) AS SIGNED) AS n_rows, CAST(SUM(h) AS SIGNED) AS hours,
                LEFT(MIN(f),16) AS first_observation, LEFT(MAX(l),16) AS last_observation
         FROM (SELECT station_id, ym, SUM(n_rows) AS n_rows, MAX(hours) AS h, MIN(first_dt) AS f, MAX(last_dt) AS l
               FROM hourly_month_stats GROUP BY station_id, ym) x
         GROUP BY station_id ORDER BY station_id`
      : `SELECT station_id, COUNT(*) AS n_rows, COUNT(DISTINCT LEFT(observation_datetime,16)) AS hours,
                LEFT(MIN(observation_datetime),16) AS first_observation, LEFT(MAX(observation_datetime),16) AS last_observation
         FROM observations_hourly GROUP BY station_id ORDER BY station_id`,
  );
  if (!agg.length) return [];
  const where = agg.map(() => "(station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?)").join(" OR ");
  const params = agg.flatMap((a) => [a.station_id, a.last_observation, prefixUpper(a.last_observation)]);
  const last = await q(
    `SELECT station_id, observation_datetime, station_name, temperature, humidity, precipitation, wind_speed
     FROM observations_hourly WHERE ${where}`,
    params,
  );
  const best = new Map();
  for (const o of last) {
    if (String(o.observation_datetime).slice(0, 16) !== agg.find((a) => a.station_id === o.station_id)?.last_observation) continue;
    const cur = best.get(o.station_id);
    if (!cur || String(o.observation_datetime).length > String(cur.observation_datetime).length) best.set(o.station_id, o);
  }
  return agg
    .filter((a) => best.has(a.station_id))
    .map((a) => {
      const o = best.get(a.station_id);
      return {
        station_id: a.station_id,
        station_name: o.station_name,
        first_observation: a.first_observation,
        last_observation: a.last_observation,
        temperature: o.temperature,
        humidity: o.humidity,
        precipitation: o.precipitation,
        wind_speed: o.wind_speed,
        rows: a.n_rows,
        hours: a.hours,
      };
    });
}

export async function hourlyForDaily(stationId, fromDate, toDate) {
  return q(
    `SELECT ${HOURLY_SELECT} FROM observations_hourly
     WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
       AND LEFT(observation_datetime,10) >= ? AND LEFT(observation_datetime,10) <= ?`,
    [stationId, fromDate, prefixUpper(toDate), fromDate, toDate],
  );
}

// fromDate/toDate(선택): 일자료 백필(1990~) 뒤 지점 전체를 읽으면 NAS 에서 9~15초 → 필요한 기간만
export async function listDailyOfficial(stationId, fromDate = null, toDate = null) {
  if (fromDate && toDate) return q(`SELECT ${DAILY_SELECT} FROM observations_daily WHERE station_id = ? AND observation_date BETWEEN ? AND ?`, [stationId, fromDate, toDate]);
  return q(`SELECT ${DAILY_SELECT} FROM observations_daily WHERE station_id = ?`, [stationId]);
}

export function buildDailyExportSqlMysql({ stationId, from, to, columns, limit = null, isFull = false }) {
  const cols = validateExportColumns("daily", columns);
  const parts = cols.map((c) => (isFull || DAILY_LEGACY_COLUMNS.includes(c) ? qi(c) : `NULL AS ${qi(c)}`));
  const lim = Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}` : "";
  return {
    sql: `SELECT ${parts.join(", ")} FROM observations_daily
          WHERE station_id = ? AND observation_date >= ? AND observation_date <= ?
          ORDER BY observation_date ASC${lim}`,
    params: [stationId, from, to],
    columns: cols,
  };
}

export async function queryDailyExportPg({ stationId, from, to, columns, limit = null }) {
  if (!pool) throw new Error("mysql not ready");
  const { sql, params } = buildDailyExportSqlMysql({ stationId, from, to, columns, limit, isFull: fullFields });
  const officialRows = await q(sql, params);
  const hourlyRows = await hourlyForDaily(stationId, from, to);
  return mergeDailyExport({ stationId, cols: validateExportColumns("daily", columns), officialRows, hourlyRows, limit });
}

export function countDaily() {
  return cachedAgg("countDaily", async () =>
    statsReady
      ? (await q("SELECT CAST(COALESCE(SUM(n_rows),0) AS SIGNED) AS n FROM daily_station_stats"))[0].n
      : (await q("SELECT COUNT(*) AS n FROM observations_daily"))[0].n,
  );
}

// ---- 요약표 유지 ----
let statsReady = false;
let statsChain = Promise.resolve();
// 요약표 쓰기는 이 프로세스 안에서 한 줄로(같은 지점·월을 두 저장이 동시에 다시 세서 옛 값으로 덮지 않게)
function statsQueue(fn) {
  const p = statsChain.then(fn);
  statsChain = p.catch(() => {});
  return p;
}
async function loadStatsReady() {
  const r = await q("SELECT name FROM hub_stats_meta WHERE name = 'obs_stats_v2'");
  return r.length > 0;
}
// 요약표 갱신이 실패하면 값이 틀릴 수 있으니 원본 집계로 돌아가고 다음 시작 때 다시 만든다
function markStatsStale(e) {
  console.error("mysql stats refresh failed — falling back to full aggregates", e?.code || e?.message);
  statsReady = false;
  q("DELETE FROM hub_stats_meta WHERE name = 'obs_stats_v2'", [], { retry: false }).catch(() => {});
}
export function touchedMonths(rows) {
  const m = new Map();
  for (const r of rows) {
    const st = String(r.station_id);
    const ym = String(r.observation_datetime).slice(0, 7);
    if (!m.has(st)) m.set(st, new Set());
    m.get(st).add(ym);
  }
  return [...m].flatMap(([st, set]) => [...set].sort().map((ym) => [st, ym]));
}
async function writeMonthStats(run, stationId, ym, perDs, hours) {
  await run("DELETE FROM hourly_month_stats WHERE station_id = ? AND ym = ?", [stationId, ym]);
  if (perDs.length) {
    await run(
      `INSERT INTO hourly_month_stats (station_id, ym, dataset, n_rows, hours, first_dt, last_dt) VALUES ${perDs.map(() => "(?,?,?,?,?,?,?)").join(",")}`,
      perDs.flatMap((d) => [stationId, ym, d.dataset, d.n, hours, d.f, d.l]),
    );
  }
}
async function refreshHourlyStats(pairs) {
  for (const [stationId, ym] of pairs) {
    const range = [stationId, ym, prefixUpper(ym)];
    const perDs = await q(
      `SELECT dataset, COUNT(*) AS n, MIN(observation_datetime) AS f, MAX(observation_datetime) AS l FROM observations_hourly
       WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime < ? GROUP BY dataset`,
      range,
    );
    const h = await q(
      `SELECT COUNT(DISTINCT LEFT(observation_datetime,16)) AS h FROM observations_hourly
       WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime < ?`,
      range,
    );
    const days = await q(
      `SELECT LEFT(observation_datetime,10) AS d, COUNT(DISTINCT LEFT(observation_datetime,13)) AS n, COUNT(*) AS n_rows FROM observations_hourly
       WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime < ? GROUP BY d`,
      range,
    );
    await tx(async (run) => {
      await writeMonthStats(run, stationId, ym, perDs, h[0].h);
      await run("DELETE FROM hourly_day_stats WHERE station_id = ? AND d >= ? AND d < ?", range);
      if (days.length) await run(`INSERT INTO hourly_day_stats (station_id, d, n, n_rows) VALUES ${days.map(() => "(?,?,?,?)").join(",")}`, days.flatMap((x) => [stationId, x.d, x.n, x.n_rows]));
    });
  }
}
async function refreshDailyStats(stationIds) {
  for (const id of stationIds) {
    const n = (await q("SELECT COUNT(*) AS n FROM observations_daily WHERE station_id = ?", [id]))[0].n;
    await q("INSERT INTO daily_station_stats (station_id, n_rows) VALUES (?, ?) ON DUPLICATE KEY UPDATE n_rows = VALUES(n_rows)", [id, n], { retry: false });
  }
}
// 처음 한 번: 지점마다 원본을 한 번 훑어 월별로 채운다(사이트는 그동안 예전 집계로 답함)
export async function rebuildStats() {
  const t0 = Date.now();
  const ids = (await q("SELECT DISTINCT station_id FROM observations_hourly")).map((r) => r.station_id);
  for (const id of ids) {
    const perDs = await q(
      `SELECT LEFT(observation_datetime,7) AS ym, dataset, COUNT(*) AS n, MIN(observation_datetime) AS f, MAX(observation_datetime) AS l
       FROM observations_hourly WHERE station_id = ? GROUP BY ym, dataset`,
      [id],
    );
    const hours = new Map((await q(
      `SELECT LEFT(observation_datetime,7) AS ym, COUNT(DISTINCT LEFT(observation_datetime,16)) AS h FROM observations_hourly WHERE station_id = ? GROUP BY ym`,
      [id],
    )).map((r) => [r.ym, r.h]));
    const days = (await q(
      `SELECT LEFT(observation_datetime,10) AS d, COUNT(DISTINCT LEFT(observation_datetime,13)) AS n, COUNT(*) AS n_rows FROM observations_hourly WHERE station_id = ? GROUP BY d`,
      [id],
    )).map((x) => [id, x.d, x.n, x.n_rows]);
    // 한 지점 = DELETE 1번 + 여러 행 INSERT 몇 번(NAS 왕복이 ~90ms 라 월마다 쓰면 지점당 1분 넘게 걸린다)
    const vals = perDs.map((r) => [id, r.ym, r.dataset, r.n, hours.get(r.ym) ?? 0, r.f, r.l]);
    await tx(async (run) => {
      await run("DELETE FROM hourly_month_stats WHERE station_id = ?", [id]);
      for (let i = 0; i < vals.length; i += 500) {
        const part = vals.slice(i, i + 500);
        await run(`INSERT INTO hourly_month_stats (station_id, ym, dataset, n_rows, hours, first_dt, last_dt) VALUES ${part.map(() => "(?,?,?,?,?,?,?)").join(",")}`, part.flat());
      }
      await run("DELETE FROM hourly_day_stats WHERE station_id = ?", [id]);
      for (let i = 0; i < days.length; i += 2000) {
        const part = days.slice(i, i + 2000);
        await run(`INSERT INTO hourly_day_stats (station_id, d, n, n_rows) VALUES ${part.map(() => "(?,?,?,?)").join(",")}`, part.flat());
      }
    });
  }
  // 지점이 원본에서 사라진 경우(직접 지운 경우)
  for (const t of ["hourly_month_stats", "hourly_day_stats"]) {
    if (ids.length) await q(`DELETE FROM ${t} WHERE station_id NOT IN (${ids.map(() => "?").join(",")})`, ids, { retry: false });
    else await q(`DELETE FROM ${t}`, [], { retry: false });
  }
  await q("DELETE FROM daily_station_stats", [], { retry: false });
  await q("INSERT INTO daily_station_stats (station_id, n_rows) SELECT station_id, COUNT(*) FROM observations_daily GROUP BY station_id", [], { retry: false });
  await q("REPLACE INTO hub_stats_meta (name, built_at) VALUES ('obs_stats_v2', NOW(6))", [], { retry: false });
  statsReady = true;
  console.log(`mysql stats built: ${ids.length} stations in ${Math.round((Date.now() - t0) / 1000)}s`);
}
export const statsState = () => ({ ready: statsReady });

// ---- 수집 이력·지점·설정 ----
export async function insertJob(job) {
  await q(
    `INSERT INTO collect_jobs
      (id, dataset, status, \`trigger\`, station_id, range_from, range_to, received, inserted, updated, chunks, message)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), received = VALUES(received), inserted = VALUES(inserted),
       updated = VALUES(updated), chunks = VALUES(chunks), message = VALUES(message)`,
    [
      job.id, job.dataset, job.status, job.trigger, job.station_id || null, job.from || null, job.to || null,
      job.received || 0, job.inserted || 0, job.updated || 0, job.chunks || 0, job.message || "",
    ],
    { retry: false },
  );
}

export async function listJobs() {
  const r = await q(`SELECT * FROM collect_jobs ORDER BY id DESC LIMIT 80`);
  return r.map((j) => ({
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
  return q(`SELECT station_id, station_name, region, enabled, favorite FROM weather_stations ORDER BY station_id`);
}

export async function saveStations(list) {
  for (const s of list) {
    await q(
      `INSERT INTO weather_stations (station_id, station_name, region, enabled, favorite)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE station_name = VALUES(station_name), region = VALUES(region),
         enabled = VALUES(enabled), favorite = VALUES(favorite)`,
      [s.station_id, s.station_name, s.region || null, Boolean(s.enabled), Boolean(s.favorite)],
      { retry: false },
    );
  }
}

export async function getSetting(k) {
  const r = await q(`SELECT v FROM hub_settings WHERE k = ?`, [k]);
  return r[0]?.v || null;
}

export async function setSetting(k, v) {
  await q(`INSERT INTO hub_settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [k, v], { retry: false });
}

// ---- 미적재 현황(gaps) ----
const inList = (n) => Array.from({ length: n }, () => "?").join(",");

export async function gapBoundsPg(stationIds) {
  if (!stationIds.length) return { hourly: [], daily: [] };
  const [h, d] = await Promise.all([
    q(
      `SELECT station_id, LEFT(MIN(observation_datetime),16) AS first, LEFT(MAX(observation_datetime),16) AS last
       FROM observations_hourly WHERE station_id IN (${inList(stationIds.length)}) GROUP BY station_id`,
      stationIds,
    ),
    q(
      `SELECT station_id, MIN(observation_date) AS first, MAX(observation_date) AS last
       FROM observations_daily WHERE station_id IN (${inList(stationIds.length)}) GROUP BY station_id`,
      stationIds,
    ),
  ]);
  return { hourly: h, daily: d };
}

// 지점·일자별 적재 시각 수(중복 제외)와 행 수. ranges: [{ station_id, a:'YYYY-MM-DD HH', b }]
// 같은 화면 요청에서 gapHourIntervalsPg 와 함께 불리므로 몇 초 동안 같은 결과를 나눠 쓴다(NAS 왕복 줄이기).
const dayCountMemo = new Map();
export function gapDayCountsPg(ranges) {
  if (!ranges.length) return Promise.resolve([]);
  const key = JSON.stringify(ranges);
  const hit = dayCountMemo.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.p;
  const p = gapDayCountsQuery(ranges);
  dayCountMemo.set(key, { at: Date.now(), p });
  p.catch(() => dayCountMemo.delete(key));
  for (const [k, v] of dayCountMemo) if (Date.now() - v.at >= 5000) dayCountMemo.delete(k);
  return p;
}
// 요약표가 있으면: 범위 안의 온전한 날은 hourly_day_stats 에서, 범위 양 끝의 일부만 걸친 날만 원본에서 센다(결과는 같다).
export function splitDayRange(a, b) {
  const dA = a.slice(0, 10);
  const dB = b.slice(0, 10);
  const next = (d, k) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
  const fullFrom = a.slice(11, 13) === "00" ? dA : next(dA, 1);
  const fullTo = b.slice(11, 13) === "23" ? dB : next(dB, -1);
  const edges = [];
  if (fullFrom > fullTo) return { full: null, edges: [{ a, b }] };
  if (fullFrom !== dA) edges.push({ a, b: `${dA} 23` < b ? `${dA} 23` : b });
  if (fullTo !== dB) edges.push({ a: `${dB} 00` > a ? `${dB} 00` : a, b });
  return { full: [fullFrom, fullTo], edges };
}
async function gapDayCountsQuery(ranges) {
  if (!statsReady) return gapDayCountsRaw(ranges);
  const full = [];
  const edges = [];
  for (const r of ranges) {
    const sp = splitDayRange(r.a, r.b);
    if (sp.full) full.push({ station_id: r.station_id, from: sp.full[0], to: sp.full[1] });
    for (const e of sp.edges) edges.push({ station_id: r.station_id, ...e });
  }
  const [f, e] = await Promise.all([
    full.length
      ? q(full.map(() => "SELECT station_id, d, n, n_rows AS `rows` FROM hourly_day_stats WHERE station_id = ? AND d BETWEEN ? AND ?").join(" UNION ALL "), full.flatMap((x) => [x.station_id, x.from, x.to]))
      : [],
    edges.length ? gapDayCountsRaw(edges) : [],
  ]);
  return [...f, ...e];
}
async function gapDayCountsRaw(ranges) {
  const parts = ranges.map(
    () => `SELECT station_id, LEFT(observation_datetime,10) AS d,
                  COUNT(DISTINCT LEFT(observation_datetime,13)) AS n, COUNT(*) AS \`rows\`
           FROM observations_hourly
           WHERE station_id = ? AND observation_datetime >= ? AND observation_datetime <= ?
             AND LEFT(observation_datetime,13) BETWEEN ? AND ?
           GROUP BY station_id, LEFT(observation_datetime,10)`,
  );
  return q(parts.join(" UNION ALL "), ranges.flatMap((r) => [r.station_id, r.a, prefixUpper(r.b), r.a, r.b]));
}

// 비어 있는 시각 구간. 5.6 에는 generate_series·창 함수가 없으므로: 일자별 시각 수를 먼저 보고, 24시간이 다 찬 날은 건너뛰고,
// 일부만 찬 날의 시각만 받아 JS 로 구간을 만든다(db-common.hourGapIntervals). 결과는 pg 쿼리와 같은 { station_id, s, e, n }.
export async function gapHourIntervalsPg(ranges, dayCounts = null) {
  if (!ranges.length) return [];
  const counts = dayCounts || (await gapDayCountsPg(ranges));
  const out = [];
  for (const r of ranges) {
    const full = new Set();
    const partial = [];
    for (const c of counts) {
      if (String(c.station_id) !== r.station_id) continue;
      // 범위 양 끝 날은 일부 시각만 범위에 들어가므로 항상 시각 단위로 본다
      if (c.n >= 24 && c.d !== r.a.slice(0, 10) && c.d !== r.b.slice(0, 10)) full.add(c.d);
      else partial.push(c.d);
    }
    const have = new Set();
    for (let i = 0; i < partial.length; i += 200) {
      const days = partial.slice(i, i + 200);
      const where = days.map(() => "(observation_datetime >= ? AND observation_datetime <= ?)").join(" OR ");
      const rows = await q(
        `SELECT DISTINCT LEFT(observation_datetime,13) AS h FROM observations_hourly
         WHERE station_id = ? AND (${where}) AND LEFT(observation_datetime,13) BETWEEN ? AND ?`,
        [r.station_id, ...days.flatMap((d) => [d, prefixUpper(d)]), r.a, r.b],
      );
      for (const x of rows) have.add(x.h);
    }
    // 다 찬 날의 24시각은 집합에 넣는 대신 검사에서 건너뛴다
    const hasHour = { has: (h) => full.has(h.slice(0, 10)) || have.has(h) };
    out.push(...hourGapIntervals(r.station_id, r.a, r.b, hasHour));
  }
  return out;
}

export async function gapOfficialDaysPg(stationIds, fromDate, toDate) {
  if (!stationIds.length) return [];
  return q(
    // 좁은 색인(observation_date + 기본 키)만 읽게: 넓은 행을 범위로 읽으면 1100일 × 8개 지점에 3초
    `SELECT station_id, observation_date AS d FROM observations_daily FORCE INDEX (observations_daily_date)
     WHERE station_id IN (${inList(stationIds.length)}) AND observation_date BETWEEN ? AND ?`,
    [...stationIds, fromDate, toDate],
  );
}
