import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool = null;
export function usingPg() {
  return Boolean(pool);
}

export async function initDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  const { default: pg } = await import("pg");
  const next = new pg.Pool({ connectionString: url, max: 8 });
  try {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await next.query(sql);
    await next.query("SELECT 1");
    pool = next;
    return true;
  } catch (err) {
    await next.end().catch(() => {});
    pool = null;
    throw err;
  }
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
      const res = await client.query(
        `INSERT INTO observations_hourly
          (provider, dataset, station_id, station_name, observation_datetime, timezone,
           temperature, precipitation, humidity, wind_speed, wind_direction, pressure,
           quality_temperature, source_kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (provider, dataset, station_id, observation_datetime)
         DO UPDATE SET
           station_name = EXCLUDED.station_name,
           temperature = EXCLUDED.temperature,
           precipitation = EXCLUDED.precipitation,
           humidity = EXCLUDED.humidity,
           wind_speed = EXCLUDED.wind_speed,
           wind_direction = EXCLUDED.wind_direction,
           pressure = EXCLUDED.pressure,
           quality_temperature = EXCLUDED.quality_temperature,
           source_kind = EXCLUDED.source_kind
         RETURNING (xmax = 0) AS is_insert`,
        [
          r.provider || "KMA",
          r.dataset || "ASOS_HOURLY",
          r.station_id,
          r.station_name || null,
          r.observation_datetime,
          r.timezone || "Asia/Seoul",
          r.temperature,
          r.precipitation,
          r.humidity,
          r.wind_speed,
          r.wind_direction,
          r.pressure,
          r.quality_temperature || null,
          r.source_kind || "OFFICIAL",
        ],
      );
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
  const size = Math.min(1000, Math.max(1, Number(pageSize) || 500));
  const p = Math.max(1, Number(page) || 1);
  const offset = (p - 1) * size;
  const count = await pool.query(
    `SELECT count(*)::int AS n FROM observations_hourly
     WHERE station_id = $1 AND observation_datetime >= $2 AND observation_datetime <= $3`,
    [stationId, from, to],
  );
  const total = count.rows[0].n;
  const rows = await pool.query(
    `SELECT * FROM observations_hourly
     WHERE station_id = $1 AND observation_datetime >= $2 AND observation_datetime <= $3
     ORDER BY observation_datetime
     LIMIT $4 OFFSET $5`,
    [stationId, from, to, size, offset],
  );
  return { total, page: p, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), data: rows.rows };
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

export async function seriesForStation(stationId = "108") {
  const r = await pool.query(
    `SELECT observation_datetime, temperature, precipitation
     FROM observations_hourly WHERE station_id = $1
     ORDER BY observation_datetime DESC LIMIT 72`,
    [stationId],
  );
  return r.rows.reverse().map((x) => ({
    t: String(x.observation_datetime).slice(5, 13),
    temperature: x.temperature,
    precipitation: x.precipitation,
  }));
}

export async function seriesSeoul() {
  return seriesForStation("108");
}

export async function stationSummaries() {
  const r = await pool.query(
    `SELECT DISTINCT ON (station_id)
        station_id, station_name, observation_datetime, temperature, precipitation, humidity, source_kind
     FROM observations_hourly
     ORDER BY station_id, observation_datetime DESC`,
  );
  const counts = await pool.query(
    `SELECT station_id, count(*)::int AS records,
            min(observation_datetime) AS first, max(observation_datetime) AS last
     FROM observations_hourly GROUP BY station_id`,
  );
  const byId = Object.fromEntries(counts.rows.map((x) => [x.station_id, x]));
  return r.rows.map((x) => ({
    station_id: x.station_id,
    station_name: x.station_name,
    last: x.observation_datetime,
    temperature: x.temperature,
    precipitation: x.precipitation,
    humidity: x.humidity,
    source_kind: x.source_kind,
    records: byId[x.station_id]?.records || 0,
    first: byId[x.station_id]?.first,
  }));
}

export async function hourlyForDaily(stationId, fromDate, toDate) {
  const r = await pool.query(
    `SELECT * FROM observations_hourly
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
    const res = await pool.query(
      `INSERT INTO observations_daily
        (station_id, station_name, observation_date, avg_temperature, min_temperature, max_temperature,
         precipitation, avg_humidity, source_kind, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (station_id, observation_date)
       DO UPDATE SET
         station_name = EXCLUDED.station_name,
         avg_temperature = EXCLUDED.avg_temperature,
         min_temperature = EXCLUDED.min_temperature,
         max_temperature = EXCLUDED.max_temperature,
         precipitation = EXCLUDED.precipitation,
         avg_humidity = EXCLUDED.avg_humidity,
         source_kind = EXCLUDED.source_kind,
         note = EXCLUDED.note
       RETURNING (xmax = 0) AS is_insert`,
      [
        r.station_id,
        r.station_name || null,
        r.observation_date,
        r.avg_temperature,
        r.min_temperature,
        r.max_temperature,
        r.precipitation,
        r.avg_humidity,
        r.source_kind || "OFFICIAL",
        r.note || null,
      ],
    );
    if (res.rows[0]?.is_insert) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}

export async function listDailyOfficial(stationId) {
  const r = await pool.query(`SELECT * FROM observations_daily WHERE station_id = $1`, [stationId]);
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

function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function migrateFromJson(dataDir, { force = false } = {}) {
  const summary = { hourly: 0, daily: 0, jobs: 0, stations: 0, settings: 0 };
  const hourlyN = await countHourly();
  const hourlyRows = readJsonFile(path.join(dataDir, "hourly.json"), []);
  if (Array.isArray(hourlyRows) && hourlyRows.length && (force || hourlyN === 0)) {
    const u = await upsertHourly(hourlyRows);
    summary.hourly = u.inserted + u.updated;
  }
  const dailyN = await countDaily();
  const dailyRows = readJsonFile(path.join(dataDir, "daily.json"), []);
  if (Array.isArray(dailyRows) && dailyRows.length && (force || dailyN === 0)) {
    const u = await upsertDaily(dailyRows);
    summary.daily = u.inserted + u.updated;
  }
  const jobs = readJsonFile(path.join(dataDir, "jobs.json"), []);
  if (Array.isArray(jobs) && jobs.length) {
    for (const j of jobs) {
      await insertJob({
        id: j.id,
        dataset: j.dataset,
        status: j.status,
        trigger: j.trigger,
        station_id: j.station_id,
        from: j.from,
        to: j.to,
        received: j.received,
        inserted: j.inserted,
        updated: j.updated,
        chunks: j.chunks,
        message: j.message,
      });
      summary.jobs += 1;
    }
  }
  const stations = readJsonFile(path.join(dataDir, "stations.json"), []);
  if (Array.isArray(stations) && stations.length) {
    await saveStations(stations);
    summary.stations = stations.length;
  }
  const settings = readJsonFile(path.join(dataDir, "settings.json"), {});
  if (settings.apiKey) {
    const existing = await getSetting("apiKey");
    if (force || !existing) {
      await setSetting("apiKey", settings.apiKey);
      summary.settings = 1;
    }
  }
  return summary;
}

export async function importJsonIfEmpty(dataDir) {
  return migrateFromJson(dataDir, { force: false });
}

