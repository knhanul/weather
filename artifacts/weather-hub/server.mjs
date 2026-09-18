import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const OBS_FILE = path.join(DATA, "hourly.json");
const SET_FILE = path.join(DATA, "settings.json");
const JOB_FILE = path.join(DATA, "jobs.json");
const DAILY_FILE = path.join(DATA, "daily.json");
const STATION_FILE = path.join(DATA, "stations.json");
const PORT = Number(process.env.PORT || 8080);
const KST_MS = 9 * 60 * 60 * 1000;

const DEFAULT_STATIONS = [
  { station_id: "108", station_name: "서울", region: "수도권", enabled: true, favorite: true },
  { station_id: "112", station_name: "인천", region: "수도권", enabled: true, favorite: true },
  { station_id: "119", station_name: "수원", region: "수도권", enabled: true, favorite: false },
  { station_id: "133", station_name: "대전", region: "충청", enabled: true, favorite: false },
  { station_id: "143", station_name: "대구", region: "경상", enabled: true, favorite: false },
  { station_id: "156", station_name: "광주", region: "전라", enabled: true, favorite: false },
  { station_id: "159", station_name: "부산", region: "경상", enabled: true, favorite: true },
  { station_id: "184", station_name: "제주", region: "제주", enabled: true, favorite: false },
];

fs.mkdirSync(DATA, { recursive: true });

function nowKst() {
  const d = new Date(Date.now() + KST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours() };
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function wall(y, m, d, h) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:00:00`;
}
function latestOfficialHour() {
  const p = nowKst();
  const utc = Date.UTC(p.y, p.m - 1, p.day) - KST_MS;
  const back = p.h < 11 ? 2 : 1;
  const prev = new Date(utc - back * 86400000 + KST_MS);
  return wall(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 23);
}
function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function addHours(wallClock, hours) {
  const [d, t] = wallClock.split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const h = Number((t || "00:00:00").slice(0, 2));
  const utc = Date.UTC(y, m - 1, day, h) - KST_MS + hours * 3600000;
  const x = new Date(utc + KST_MS);
  return wall(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), x.getUTCHours());
}
function normalizeKey(raw) {
  if (!raw) return null;
  let v = String(raw).trim();
  try {
    if (v.includes("%")) v = decodeURIComponent(v);
  } catch {
    /* keep */
  }
  return v || null;
}
function hint(key) {
  if (!key || key.length < 8) return null;
  return key.slice(0, 3) + "…" + key.slice(-4);
}

async function stations() {
  if (db.usingPg()) {
    let list = await db.listStationsPg();
    if (!list.length) {
      await db.saveStations(DEFAULT_STATIONS);
      list = DEFAULT_STATIONS;
    }
    return list;
  }
  const saved = loadJson(STATION_FILE, []);
  if (saved.length) return saved;
  saveJson(STATION_FILE, DEFAULT_STATIONS);
  return DEFAULT_STATIONS;
}

function seedIfEmpty() {
  if (db.usingPg()) return;
  const existing = loadJson(OBS_FILE, []);
  if (existing.length) return;
  saveJson(JOB_FILE, loadJson(JOB_FILE, []));
}

async function upsert(rows) {
  if (db.usingPg()) return db.upsertHourly(rows);
  const all = loadJson(OBS_FILE, []);
  const idx = new Map(all.map((r, i) => [`${r.station_id}|${r.observation_datetime}`, i]));
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const k = `${row.station_id}|${row.observation_datetime}`;
    if (idx.has(k)) {
      all[idx.get(k)] = row;
      updated += 1;
    } else {
      idx.set(k, all.length);
      all.push(row);
      inserted += 1;
    }
  }
  saveJson(OBS_FILE, all);
  return { inserted, updated, total: all.length };
}

async function queryHourly({ stationId = "108", from, to, page = "1", pageSize = "500" }) {
  const latest = latestOfficialHour();
  const start = from || addHours(latest, -24);
  const end = to || latest;
  if (db.usingPg()) {
    const q = await db.queryHourlyPg({ stationId, from: start, to: end, page, pageSize });
    return { timezone: "Asia/Seoul", station_id: stationId, from: start, to: end, ...q };
  }
  const size = Math.min(500, Math.max(1, Number(pageSize) || 500));
  const p = Math.max(1, Number(page) || 1);
  const rows = loadJson(OBS_FILE, [])
    .filter((r) => r.station_id === stationId && r.observation_datetime >= start && r.observation_datetime <= end)
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime));
  const offset = (p - 1) * size;
  return {
    timezone: "Asia/Seoul",
    station_id: stationId,
    from: start,
    to: end,
    total: rows.length,
    page: p,
    pageSize: size,
    pages: Math.max(1, Math.ceil(rows.length / size)),
    data: rows.slice(offset, offset + size),
  };
}

async function getKey() {
  if (process.env.KMA_API_KEY) return normalizeKey(process.env.KMA_API_KEY);
  if (db.usingPg()) return normalizeKey(await db.getSetting("apiKey"));
  return normalizeKey(loadJson(SET_FILE, {}).apiKey);
}

async function saveJobs(job) {
  if (db.usingPg()) {
    await db.insertJob(job);
    return;
  }
  const jobs = loadJson(JOB_FILE, []);
  jobs.unshift(job);
  saveJson(JOB_FILE, jobs.slice(0, 80));
}

async function listJobs() {
  if (db.usingPg()) return db.listJobs();
  return loadJson(JOB_FILE, []);
}

function mapHourlyItem(it, stationId) {
  let tm = String(it.tm || "");
  if (tm.length === 13) tm = `${tm}:00`;
  if (tm.length === 16) tm = `${tm}:00`;
  return {
    provider: "KMA",
    dataset: "ASOS_HOURLY",
    station_id: String(it.stnId ?? stationId),
    station_name: it.stnNm || stationId,
    observation_datetime: tm,
    timezone: "Asia/Seoul",
    temperature: it.ta === "" || it.ta == null ? null : Number(it.ta),
    precipitation: it.rn === "" || it.rn == null ? null : Number(it.rn),
    humidity: it.hm === "" || it.hm == null ? null : Number(it.hm),
    wind_speed: it.ws === "" || it.ws == null ? null : Number(it.ws),
    wind_direction: it.wd === "" || it.wd == null ? null : Number(it.wd),
    pressure: it.pa === "" || it.pa == null ? null : Number(it.pa),
    quality_temperature: !it.taQcflg || it.taQcflg === "0" ? "NORMAL" : it.taQcflg === "1" ? "INVALID" : it.taQcflg === "9" ? "MISSING" : "SUSPECT",
    source_kind: "OFFICIAL",
  };
}

function splitRange(from, to, hours = 24 * 7) {
  const chunks = [];
  let cur = from;
  while (cur <= to) {
    let next = addHours(cur, hours - 1);
    if (next > to) next = to;
    chunks.push({ from: cur, to: next });
    cur = addHours(next, 1);
    if (chunks.length > 400) break;
  }
  return chunks;
}

async function fetchHourlyPage({ key, stationId, from, to, pageNo }) {
  const url = new URL("https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("dataCd", "ASOS");
  url.searchParams.set("dateCd", "HR");
  url.searchParams.set("startDt", from.slice(0, 10).replaceAll("-", ""));
  url.searchParams.set("startHh", from.slice(11, 13) || "00");
  url.searchParams.set("endDt", to.slice(0, 10).replaceAll("-", ""));
  url.searchParams.set("endHh", to.slice(11, 13) || "23");
  url.searchParams.set("stnIds", stationId);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 180) || `HTTP ${res.status}`);
  }
  const header = parsed?.response?.header ?? {};
  if (header.resultCode && header.resultCode !== "00") {
    throw new Error(`${header.resultCode} ${header.resultMsg || ""}`.trim());
  }
  const body = parsed?.response?.body ?? {};
  const items = body?.items?.item;
  const list = !items ? [] : Array.isArray(items) ? items : [items];
  return { list, totalCount: Number(body.totalCount || list.length) };
}

async function collectOfficial({ stationId = "108", from, to }) {
  const key = await getKey();
  const job = {
    id: Date.now(),
    dataset: "ASOS_HOURLY",
    status: "RUNNING",
    trigger: "MANUAL",
    station_id: stationId,
    from,
    to,
    received: 0,
    inserted: 0,
    updated: 0,
    chunks: 0,
    message: "",
  };
  if (!key) {
    job.status = "FAILED";
    job.message = "인증키가 없습니다. 공급원에 공공데이터포털 serviceKey를 등록하세요.";
    await saveJobs(job);
    return job;
  }
  const chunks = splitRange(from, to, 24 * 7);
  try {
    for (const chunk of chunks) {
      let page = 1;
      for (;;) {
        const { list, totalCount } = await fetchHourlyPage({ key, stationId, from: chunk.from, to: chunk.to, pageNo: page });
        const mapped = list.map((it) => mapHourlyItem(it, stationId));
        const u = await upsert(mapped);
        job.received += mapped.length;
        job.inserted += u.inserted;
        job.updated += u.updated;
        job.chunks += 1;
        if (mapped.length < 999 || page * 999 >= totalCount || page >= 20) break;
        page += 1;
      }
    }
    job.status = "COMPLETED";
    job.message = `공식 ASOS 시간자료 UPSERT 완료 · 구간 ${chunks.length}개 · 수신 ${job.received}`;
  } catch (err) {
    job.status = job.received ? "PARTIAL" : "FAILED";
    job.message = err instanceof Error ? err.message : String(err);
  }
  await saveJobs(job);
  return job;
}

async function upsertDaily(rows) {
  if (db.usingPg()) return db.upsertDaily(rows);
  const all = loadJson(DAILY_FILE, []);
  const idx = new Map(all.map((r, i) => [`${r.station_id}|${r.observation_date}`, i]));
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const k = `${row.station_id}|${row.observation_date}`;
    if (idx.has(k)) {
      all[idx.get(k)] = row;
      updated += 1;
    } else {
      idx.set(k, all.length);
      all.push(row);
      inserted += 1;
    }
  }
  saveJson(DAILY_FILE, all);
  return { inserted, updated };
}

async function deriveDaily(stationId, fromDate, toDate) {
  const hourly = db.usingPg()
    ? await db.hourlyForDaily(stationId, fromDate, toDate)
    : loadJson(OBS_FILE, []).filter(
        (r) => r.station_id === stationId && r.observation_datetime.slice(0, 10) >= fromDate && r.observation_datetime.slice(0, 10) <= toDate,
      );
  const byDay = new Map();
  for (const r of hourly) {
    const d = r.observation_datetime.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }
  const official = db.usingPg() ? await db.listDailyOfficial(stationId) : loadJson(DAILY_FILE, []);
  const officialIdx = new Map(official.filter((x) => x.station_id === stationId).map((x) => [x.observation_date, x]));
  const out = [];
  for (const [date, list] of [...byDay.entries()].sort()) {
    if (officialIdx.has(date) && officialIdx.get(date).source_kind === "OFFICIAL") {
      out.push(officialIdx.get(date));
      continue;
    }
    const temps = list.map((x) => x.temperature).filter((v) => v != null);
    const rains = list.map((x) => x.precipitation).filter((v) => v != null);
    const hums = list.map((x) => x.humidity).filter((v) => v != null);
    out.push({
      station_id: stationId,
      station_name: list[0]?.station_name,
      observation_date: date,
      avg_temperature: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
      min_temperature: temps.length ? Math.min(...temps) : null,
      max_temperature: temps.length ? Math.max(...temps) : null,
      precipitation: rains.length ? Math.round(rains.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      avg_humidity: hums.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null,
      source_kind: "DERIVED",
      note: "시간자료에서 집계",
    });
  }
  return out;
}

async function collectDaily({ stationId = "108", from, to }) {
  const key = await getKey();
  const job = {
    id: Date.now(),
    dataset: "ASOS_DAILY",
    status: "RUNNING",
    trigger: "MANUAL",
    station_id: stationId,
    from,
    to,
    received: 0,
    inserted: 0,
    updated: 0,
    message: "",
  };
  if (!key) {
    job.status = "FAILED";
    job.message = "인증키가 없습니다.";
    await saveJobs(job);
    return job;
  }
  const url = new URL("https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("dataCd", "ASOS");
  url.searchParams.set("dateCd", "DAY");
  url.searchParams.set("startDt", from.slice(0, 10).replaceAll("-", ""));
  url.searchParams.set("endDt", to.slice(0, 10).replaceAll("-", ""));
  url.searchParams.set("stnIds", stationId);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const parsed = JSON.parse(await res.text());
    const header = parsed?.response?.header ?? {};
    if (header.resultCode && header.resultCode !== "00") {
      job.status = "FAILED";
      job.message = `${header.resultCode} ${header.resultMsg || ""}`.trim();
    } else {
      const items = parsed?.response?.body?.items?.item;
      const list = !items ? [] : Array.isArray(items) ? items : [items];
      const mapped = list.map((it) => ({
        station_id: String(it.stnId ?? stationId),
        station_name: it.stnNm || stationId,
        observation_date: String(it.tm || "").slice(0, 10),
        avg_temperature: it.avgTa === "" || it.avgTa == null ? null : Number(it.avgTa),
        min_temperature: it.minTa === "" || it.minTa == null ? null : Number(it.minTa),
        max_temperature: it.maxTa === "" || it.maxTa == null ? null : Number(it.maxTa),
        precipitation: it.sumRn === "" || it.sumRn == null ? null : Number(it.sumRn),
        avg_humidity: it.avgRhm === "" || it.avgRhm == null ? null : Number(it.avgRhm),
        source_kind: "OFFICIAL",
      }));
      const u = await upsertDaily(mapped);
      job.status = "COMPLETED";
      job.received = mapped.length;
      job.inserted = u.inserted;
      job.updated = u.updated;
      job.message = "공식 ASOS 일자료 UPSERT 완료";
    }
  } catch (err) {
    job.status = "FAILED";
    job.message = err instanceof Error ? err.message : String(err);
  }
  await saveJobs(job);
  return job;
}

async function dashboard(stationId = "108") {
  const key = await getKey();
  const st = await stations();
  if (db.usingPg()) {
    const [hourlyRecords, dailyRecords, coverage, jobs, series, summaries] = await Promise.all([
      db.countHourly(),
      db.countDaily(),
      db.coverageHourly(),
      db.listJobs(),
      db.seriesForStation(stationId),
      db.stationSummaries(),
    ]);
    return {
      timezone: "Asia/Seoul",
      latestOfficialHour: latestOfficialHour(),
      keyRegistered: Boolean(key),
      keyHint: hint(key),
      storage: "postgresql",
      hourlyRecords,
      dailyRecords,
      coverage,
      lastJob: jobs[0] || null,
      series,
      seriesStation: stationId,
      stationSummaries: summaries,
      stations: st,
    };
  }
  const hourly = loadJson(OBS_FILE, []);
  const daily = loadJson(DAILY_FILE, []);
  const jobs = await listJobs();
  const series = hourly
    .filter((r) => r.station_id === stationId)
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime))
    .slice(-72)
    .map((r) => ({ t: r.observation_datetime.slice(5, 13), temperature: r.temperature, precipitation: r.precipitation }));
  const byDs = {};
  const latestBySt = new Map();
  const countBySt = new Map();
  for (const r of hourly) {
    byDs[r.dataset] ??= { records: 0, stations: new Set(), first: r.observation_datetime, last: r.observation_datetime };
    byDs[r.dataset].records += 1;
    byDs[r.dataset].stations.add(r.station_id);
    if (r.observation_datetime < byDs[r.dataset].first) byDs[r.dataset].first = r.observation_datetime;
    if (r.observation_datetime > byDs[r.dataset].last) byDs[r.dataset].last = r.observation_datetime;
    countBySt.set(r.station_id, (countBySt.get(r.station_id) || 0) + 1);
    const prev = latestBySt.get(r.station_id);
    if (!prev || r.observation_datetime > prev.observation_datetime) latestBySt.set(r.station_id, r);
  }
  const stationSummaries = [...latestBySt.values()].map((r) => ({
    station_id: r.station_id,
    station_name: r.station_name,
    last: r.observation_datetime,
    temperature: r.temperature,
    precipitation: r.precipitation,
    humidity: r.humidity,
    source_kind: r.source_kind,
    records: countBySt.get(r.station_id) || 0,
  }));
  return {
    timezone: "Asia/Seoul",
    latestOfficialHour: latestOfficialHour(),
    keyRegistered: Boolean(key),
    keyHint: hint(key),
    storage: "json",
    hourlyRecords: hourly.length,
    dailyRecords: daily.length,
    coverage: Object.entries(byDs).map(([dataset, v]) => ({
      dataset,
      records: v.records,
      stations: v.stations.size,
      first: v.first,
      last: v.last,
    })),
    lastJob: jobs[0] || null,
    series,
    seriesStation: stationId,
    stationSummaries,
    stations: st,
  };
}

function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

seedIfEmpty();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/hourly") {
      return json(res, await queryHourly(Object.fromEntries(url.searchParams)));
    }
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return json(res, await dashboard(url.searchParams.get("stationId") || "108"));
    }
    if (req.method === "GET" && url.pathname === "/api/daily") {
      const stationId = url.searchParams.get("stationId") || "108";
      const latest = latestOfficialHour().slice(0, 10);
      const from = url.searchParams.get("from") || addHours(latestOfficialHour(), -24 * 7).slice(0, 10);
      const to = url.searchParams.get("to") || latest;
      return json(res, { timezone: "Asia/Seoul", station_id: stationId, from, to, data: await deriveDaily(stationId, from, to) });
    }
    if (req.method === "GET" && url.pathname === "/api/stations") {
      return json(res, { data: await stations() });
    }
    if (req.method === "POST" && url.pathname === "/api/stations/toggle") {
      const body = await readBody(req);
      const list = await stations();
      const row = list.find((s) => s.station_id === body.stationId);
      if (!row) return json(res, { ok: false }, 404);
      if (body.field === "favorite") row.favorite = !row.favorite;
      if (body.field === "enabled") row.enabled = !row.enabled;
      if (db.usingPg()) await db.saveStations(list);
      else saveJson(STATION_FILE, list);
      return json(res, { ok: true, station: row });
    }
    if (req.method === "GET" && url.pathname === "/api/export") {
      const kind = url.searchParams.get("kind") || "hourly";
      const stationId = url.searchParams.get("stationId") || "108";
      const from = url.searchParams.get("from") || addHours(latestOfficialHour(), -24);
      const to = url.searchParams.get("to") || latestOfficialHour();
      const rows =
        kind === "daily"
          ? await deriveDaily(stationId, from.slice(0, 10), to.slice(0, 10))
          : db.usingPg()
            ? await db.listHourlyAll({ stationId, from, to })
            : loadJson(OBS_FILE, []).filter(
                (r) => r.station_id === stationId && r.observation_datetime >= from && r.observation_datetime <= to,
              );
      const headers =
        kind === "daily"
          ? ["observation_date", "station_id", "avg_temperature", "min_temperature", "max_temperature", "precipitation", "avg_humidity", "source_kind"]
          : ["observation_datetime", "station_id", "station_name", "temperature", "precipitation", "humidity", "wind_speed", "source_kind"];
      const lines = [headers.join(",")].concat(rows.map((r) => headers.map((h) => (r[h] == null ? "" : String(r[h]))).join(",")));
      const csv = `\uFEFF# source=KMA timezone=Asia/Seoul station=${stationId} from=${from} to=${to}\n${lines.join("\n")}`;
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="weather-${kind}-${stationId}.csv"`,
      });
      return res.end(csv);
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const key = await getKey();
      const jobs = await listJobs();
      const hourlyRecords = db.usingPg() ? await db.countHourly() : loadJson(OBS_FILE, []).length;
      return json(res, {
        timezone: "Asia/Seoul",
        latestOfficialHour: latestOfficialHour(),
        keyRegistered: Boolean(key),
        keyHint: hint(key),
        storage: db.usingPg() ? "postgresql" : "json",
        hourlyRecords,
        lastJob: jobs[0] || null,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      return json(res, await listJobs());
    }
    if (req.method === "POST" && url.pathname === "/api/key") {
      const body = await readBody(req);
      const apiKey = normalizeKey(body.apiKey);
      if (!apiKey || apiKey.length < 8) return json(res, { ok: false, message: "키가 너무 짧습니다." }, 400);
      if (db.usingPg()) await db.setSetting("apiKey", apiKey);
      else saveJson(SET_FILE, { apiKey, updatedAt: new Date().toISOString() });
      return json(res, { ok: true, hint: hint(apiKey) });
    }
    if (req.method === "POST" && url.pathname === "/api/collect-daily") {
      const body = await readBody(req);
      const latest = latestOfficialHour();
      const job = await collectDaily({
        stationId: body.stationId || "108",
        from: body.from || addHours(latest, -7 * 24),
        to: body.to || latest,
      });
      return json(res, job, job.status === "FAILED" ? 400 : 200);
    }
    if (req.method === "POST" && url.pathname === "/api/collect") {
      const body = await readBody(req);
      const latest = latestOfficialHour();
      const job = await collectOfficial({
        stationId: body.stationId || "108",
        from: body.from || addHours(latest, -24),
        to: body.to || latest,
      });
      return json(res, job, job.status === "FAILED" ? 400 : 200);
    }
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, ""));
    if (!full.startsWith(PUBLIC)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(full, (err, buf) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      const ext = path.extname(full);
      const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      res.end(buf);
    });
  } catch (err) {
    json(res, { ok: false, message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

const ready = (async () => {
  try {
    const ok = await db.initDb();
    if (ok) {
      const imported = await db.importJsonIfEmpty(DATA);
      console.log(`postgresql connected migrated=${JSON.stringify(imported)}`);
    } else {
      console.log("postgresql off · json fallback");
    }
  } catch (err) {
    console.error("postgresql init failed, json fallback", err);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`weather-hub ${PORT} latest=${latestOfficialHour()} pg=${db.usingPg()}`);
  });
})();
await ready;
