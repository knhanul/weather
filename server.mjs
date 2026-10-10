import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.mjs";
import { dailyChartPoints } from "./db-common.mjs";
import {
  mapHourlyItem, mapDailyItem, withoutExtras, kmaResponseError,
  HOURLY_DEFAULT_EXPORT, DAILY_DEFAULT_EXPORT,
  EXPORT_PRESETS, getExportCatalog, validateExportColumns,
  formatCsvRow,
} from "./kma-fields.mjs";
import { createAuth, authConfigured } from "./auth.mjs";
import { createPgStore, createMysqlStore, createJsonStore } from "./auth-store.mjs";
import { handleLayouts, createPgLayoutStore, createMysqlLayoutStore, createJsonLayoutStore } from "./layouts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const OBS_FILE = path.join(DATA, "hourly.json");
const SET_FILE = path.join(DATA, "settings.json");
const JOB_FILE = path.join(DATA, "jobs.json");
const DAILY_FILE = path.join(DATA, "daily.json");
const STATION_FILE = path.join(DATA, "stations.json");
const AUTH_FILE = path.join(DATA, "auth.json"); // 로컬 개발(DATABASE_URL 없음)에서만 사용
const LAYOUT_FILE = path.join(DATA, "export-layouts.json"); // 로컬 개발(DATABASE_URL 없음)에서만 사용
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
  rows = rows.map(withoutExtras);
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
  const size = Math.min(10000, Math.max(1, Number(pageSize) || 500));
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

async function queryHourlyAll({ stationId = "108", from, to }) {
  const latest = latestOfficialHour();
  const start = from || addHours(latest, -24);
  const end = to || latest;
  if (db.usingPg()) {
    return db.queryHourlyAllPg({ stationId, from: start, to: end });
  }
  return loadJson(OBS_FILE, [])
    .filter((r) => r.station_id === stationId && r.observation_datetime >= start && r.observation_datetime <= end)
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime));
}

async function getExportData({ kind = "hourly", stationId = "108", from, to, columns, limit = null }) {
  const isDaily = kind === "daily";
  const defaultCols = isDaily ? DAILY_DEFAULT_EXPORT : HOURLY_DEFAULT_EXPORT;
  const cols = validateExportColumns(kind, columns || defaultCols);
  const latest = latestOfficialHour();
  const start = from || (isDaily ? addHours(latest, -24 * 7).slice(0, 10) : addHours(latest, -24));
  const end = to || (isDaily ? latest.slice(0, 10) : latest);

  if (db.usingPg()) {
    const rows = isDaily
      ? await db.queryDailyExportPg({ stationId, from: start.slice(0, 10), to: end.slice(0, 10), columns: cols, limit })
      : await db.queryHourlyExportPg({ stationId, from: start, to: end, columns: cols, limit });
    return { kind, stationId, from: start, to: end, columns: cols, rows };
  }

  // JSON 대체 모드 (로컬 개발)
  if (isDaily) {
    const rawDaily = await deriveDaily(stationId, start.slice(0, 10), end.slice(0, 10));
    const all = rawDaily.map((r) => {
      const row = {};
      for (const c of cols) {
        row[c] = r[c] ?? (r.extra && r.extra[c] !== undefined ? r.extra[c] : null);
      }
      return row;
    });
    return {
      kind,
      stationId,
      from: start.slice(0, 10),
      to: end.slice(0, 10),
      columns: cols,
      rows: limit && limit > 0 ? all.slice(0, limit) : all,
      total: all.length,
    };
  }

  const allHourly = loadJson(OBS_FILE, [])
    .filter((r) => r.station_id === stationId && r.observation_datetime >= start && r.observation_datetime <= end)
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime));

  const rows = (limit && limit > 0 ? allHourly.slice(0, limit) : allHourly).map((r) => {
    const row = {};
    for (const c of cols) {
      row[c] = r[c] ?? (r.extra && r.extra[c] !== undefined ? r.extra[c] : null);
    }
    return row;
  });

  return { kind, stationId, from: start, to: end, columns: cols, rows, total: allHourly.length };
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

// mapHourlyItem / mapDailyItem: kma-fields.mjs (기상청 전체 항목 + raw 포함)

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
  const kerr = kmaResponseError(res.status, parsed);
  if (kerr) throw new Error(kerr);
  const body = parsed?.response?.body ?? {};
  const items = body?.items?.item;
  const list = !items ? [] : Array.isArray(items) ? items : [items];
  return { list, totalCount: Number(body.totalCount || list.length) };
}

async function collectOfficial({ stationId = "108", from, to, trigger = "MANUAL" }) {
  const key = await getKey();
  const job = {
    id: Date.now(),
    dataset: "ASOS_HOURLY",
    status: "RUNNING",
    trigger,
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
  // 41일 = 984행 → 기상청 호출 1번(numOfRows 999). 예전 7일 단위는 같은 기간에 호출이 6배.
  const chunks = splitRange(from, to, 24 * 41);
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
  rows = rows.map(withoutExtras);
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
  // 시간자료가 있는 날(fromDate~toDate)만 공식 일자료를 찾으므로 그 기간만 읽는다(결과 같음)
  const official = db.usingPg() ? await db.listDailyOfficial(stationId, fromDate, toDate) : loadJson(DAILY_FILE, []);
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

async function collectDaily({ stationId = "108", from, to, trigger = "MANUAL" }) {
  const key = await getKey();
  const job = {
    id: Date.now(),
    dataset: "ASOS_DAILY",
    status: "RUNNING",
    trigger,
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
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* 아래에서 오류로 처리 */
    }
    const kerr = parsed ? kmaResponseError(res.status, parsed) : text.slice(0, 180) || `HTTP ${res.status}`;
    if (kerr) {
      job.status = "FAILED";
      job.message = kerr;
    } else {
      const items = parsed?.response?.body?.items?.item;
      const list = !items ? [] : Array.isArray(items) ? items : [items];
      const mapped = list.map((it) => mapDailyItem(it, stationId));
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

// ---- 대시보드: 지점별 요약 · 기온 시계열 ----
// observation_datetime은 16자('YYYY-MM-DD HH:MM')와 19자('...:SS')가 섞여 있어 16자로 정규화해 비교한다.
const SERIES_MIN_HOURS = 24;
const SERIES_MAX_HOURS = 720;
function t16(v) {
  return String(v ?? "").slice(0, 16);
}
function wallMs(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}
function lagHours(last, ref) {
  const a = wallMs(last);
  const b = wallMs(ref);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 3600000) : null;
}
// 같은 시각이 두 형식으로 중복된 행은 하나만 남긴다(19자 우선).
function dedupeHourly(rows) {
  const byT = new Map();
  for (const r of rows) {
    const k = t16(r.observation_datetime);
    const prev = byT.get(k);
    if (!prev || String(r.observation_datetime).length > String(prev.observation_datetime).length) byT.set(k, r);
  }
  return [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function stationSummaries(stationList) {
  const official = latestOfficialHour();
  let rows;
  if (db.usingPg()) {
    rows = await db.stationSummariesPg();
  } else {
    const byStation = new Map();
    for (const r of loadJson(OBS_FILE, [])) {
      if (!byStation.has(r.station_id)) byStation.set(r.station_id, []);
      byStation.get(r.station_id).push(r);
    }
    rows = [...byStation.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([stationId, list]) => {
        const uniq = dedupeHourly(list);
        const [lastT, last] = uniq[uniq.length - 1];
        return {
          station_id: stationId,
          station_name: last.station_name,
          first_observation: uniq[0][0],
          last_observation: lastT,
          temperature: last.temperature ?? null,
          humidity: last.humidity ?? null,
          precipitation: last.precipitation ?? null,
          wind_speed: last.wind_speed ?? null,
          rows: list.length,
          hours: uniq.length,
        };
      });
  }
  const meta = new Map(stationList.map((s) => [String(s.station_id), s]));
  return rows.map((r) => {
    const m = meta.get(String(r.station_id));
    const lag = lagHours(r.last_observation, official);
    return {
      ...r,
      station_id: String(r.station_id),
      station_name: m?.station_name || r.station_name || String(r.station_id),
      favorite: Boolean(m?.favorite),
      enabled: Boolean(m?.enabled),
      duplicates: Math.max(0, (r.rows || 0) - (r.hours || 0)),
      lag_hours: lag,
      stale: lag != null && lag > 24,
    };
  });
}

// 기간 지정(from/to) 그래프: 30일까지는 시간 단위, 그보다 길면 기상청 공식 일자료(observations_daily)로 그린다(최대 731일 = 24개월).
// 공식 일자료가 없는 날은 점을 만들지 않는다(시간자료로 메우지 않음 → 그래프에서 끊김).
const SERIES_HOURLY_MAX_DAYS = 30;
const SERIES_RANGE_MAX_DAYS = 731;
async function officialDailyPoints(stationId, fromDate, toDate) {
  const rows = db.usingPg()
    ? await db.dailySeriesPg(stationId, fromDate, toDate)
    : loadJson(DAILY_FILE, []).filter((r) => String(r.station_id) === stationId && r.source_kind !== "DERIVED" && r.observation_date >= fromDate && r.observation_date <= toDate)
        .sort((a, b) => String(a.observation_date).localeCompare(String(b.observation_date)));
  return dailyChartPoints(rows);
}
async function seriesPoints(stationId, from16, to16) {
  if (db.usingPg()) {
    return (await db.seriesPg(stationId, from16, to16)).map((r) => ({
      t: r.t,
      temperature: r.temperature,
      precipitation: r.precipitation,
      humidity: r.humidity,
      wind_speed: r.wind_speed,
    }));
  }
  return dedupeHourly(loadJson(OBS_FILE, []).filter((r) => String(r.station_id) === stationId))
    .filter(([t]) => t >= from16 && t <= to16)
    .map(([t, r]) => ({
      t,
      temperature: r.temperature ?? null,
      precipitation: r.precipitation ?? null,
      humidity: r.humidity ?? null,
      wind_speed: r.wind_speed ?? null,
    }));
}
async function stationLatest(stationId) {
  if (db.usingPg()) return db.latestHourPg(stationId);
  const uniq = dedupeHourly(loadJson(OBS_FILE, []).filter((r) => String(r.station_id) === stationId));
  return uniq.length ? uniq[uniq.length - 1][0] : null;
}

async function series(stationIdRaw, hoursRaw, fromRaw, toRaw) {
  const list = await stations();
  const stationId = String(stationIdRaw ?? "108").trim();
  const st = list.find((s) => String(s.station_id) === stationId);
  if (!st) return { status: 400, body: { ok: false, message: `알 수 없는 지점입니다: ${stationId.slice(0, 20)}` } };
  const official = latestOfficialHour();
  if (fromRaw != null && fromRaw !== "") return seriesRange(st, stationId, String(fromRaw), toRaw == null ? "" : String(toRaw), official);
  let hours = Math.round(Number(hoursRaw ?? 72));
  if (!Number.isFinite(hours)) hours = 72;
  hours = Math.min(SERIES_MAX_HOURS, Math.max(SERIES_MIN_HOURS, hours));
  const base = { timezone: "Asia/Seoul", mode: "hours", resolution: "hour", station_id: stationId, station_name: st.station_name, hours, latestOfficialHour: official };
  const latest = await stationLatest(stationId);
  const from = latest ? t16(addHours(latest, -(hours - 1))) : null;
  const points = latest ? await seriesPoints(stationId, from, latest) : [];
  const lag = latest ? lagHours(latest, official) : null;
  return {
    status: 200,
    body: { ...base, from, to: latest, latest, lag_hours: lag, stale: lag != null && lag > 24, count: points.length, expected: latest ? hours : 0, present: points.length, points },
  };
}

async function seriesRange(st, stationId, fromRaw, toRaw, official) {
  const bad = (message) => ({ status: 400, body: { ok: false, message } });
  const officialMs = wallMs(official);
  const officialDate = official.slice(0, 10);
  const fromMs = parseGapTime(fromRaw, false);
  const toMs0 = toRaw ? parseGapTime(toRaw, true) : officialMs;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs0)) return bad("날짜 형식이 올바르지 않습니다 (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)");
  if (fromMs > toMs0) return bad("시작이 종료보다 늦습니다");
  if (fromMs > officialMs) return bad(`시작이 공식 최신 날짜(${officialDate})보다 늦습니다. 공식 자료는 ${official.slice(0, 16)}까지 제공됩니다`);
  if (msToYmd(toMs0) > officialDate) return bad(`종료가 공식 최신 날짜(${officialDate})보다 늦습니다`);
  const toMs = Math.min(toMs0, officialMs);
  const spanDays = Math.floor(dayFloor(toMs) / DAY_MS - dayFloor(fromMs) / DAY_MS) + 1;
  if (spanDays > SERIES_RANGE_MAX_DAYS) return bad(`기간은 최대 ${SERIES_RANGE_MAX_DAYS}일까지 볼 수 있습니다 (지금 ${spanDays}일)`);
  const from16 = `${msToH13(fromMs)}:00`;
  const to16 = `${msToH13(toMs)}:00`;
  const resolution = spanDays > SERIES_HOURLY_MAX_DAYS ? "day" : "hour";
  const daily = resolution === "day";
  const [latest, raw] = await Promise.all([
    stationLatest(stationId),
    daily ? officialDailyPoints(stationId, msToYmd(fromMs), msToYmd(toMs)) : seriesPoints(stationId, from16, to16),
  ]);
  const lag = latest ? lagHours(latest, official) : null;
  // 일 단위: expected/present 는 날 수(공식 일자료가 있는 날). 시간 단위: 시각 수.
  const expected = daily ? spanDays : Math.round((toMs - fromMs) / 3600000) + 1;
  const points = raw;
  return {
    status: 200,
    body: {
      timezone: "Asia/Seoul",
      mode: "range",
      resolution,
      station_id: stationId,
      station_name: st.station_name,
      latestOfficialHour: official,
      from: resolution === "day" ? `${msToYmd(fromMs)} 00:00` : from16,
      to: resolution === "day" ? `${msToYmd(toMs)} 00:00` : to16,
      range_from: from16,
      range_to: to16,
      days: spanDays,
      hours: Math.round((toMs - fromMs) / 3600000) + 1,
      source: daily ? "official_daily" : "hourly",
      latest,
      lag_hours: lag,
      stale: lag != null && lag > 24,
      expected,
      present: daily ? points.filter((p) => p.temperature != null).length : raw.length,
      count: points.length,
      points,
    },
  };
}

// ---- 미적재 현황: 지점별로 비어 있는 시각(시간자료)·일자(일자료) 구간 ----
// 시간자료: 기간 안의 모든 정시 중 적재된 행이 없는 시각(HH:MM / HH:MM:SS 중복은 한 시각으로 셈).
// 일자료: /api/daily 와 같은 기준 — 공식 일자료 행도 없고 그날 시간자료도 한 시각도 없으면 미적재.
//         시간자료가 일부(1~23시각)만 있는 날은 집계값이 부정확할 수 있어 '불완전'으로 따로 센다.
const GAP_PERIODS = { 30: 30, 90: 90, 365: 365 };
const GAP_MAX_DAYS = 1100;
const GAP_MAX_INTERVALS = 300;
const DAY_MS = 24 * 3600000;
function msToYmd(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function msToH13(ms) {
  return `${msToYmd(ms)} ${pad(new Date(ms).getUTCHours())}`;
}
function h13Ms(h13) {
  return wallMs(`${h13}:00`);
}
// 'YYYY-MM-DD' | 'YYYY-MM-DD HH[:MM[:SS]]' | 'YYYY-MM-DDTHH:MM' → 정시 ms (날짜만이면 시작 00시 / 종료 23시)
function parseGapTime(v, isEnd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::\d{2}(?::\d{2})?)?)?$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const h = m[4] != null ? Number(m[4]) : isEnd ? 23 : 0;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], h);
  const d = new Date(ms);
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3] || h > 23) return NaN;
  return ms;
}
function dayFloor(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

async function gaps(params) {
  const kind = params.kind === "daily" ? "daily" : "hourly";
  const list = await stations();
  const wantId = String(params.stationId ?? "").trim();
  let targets = list;
  if (wantId) {
    targets = list.filter((s) => String(s.station_id) === wantId);
    if (!targets.length) return { status: 400, body: { ok: false, message: `알 수 없는 지점입니다: ${wantId.slice(0, 20)}` } };
  }
  const official = latestOfficialHour();
  const latestMs = wallMs(official);
  // 기간: from/to 직접 지정 > period(30|90|365|all). 끝은 공식 최신 시각을 넘지 않는다.
  let period = String(params.period ?? "90");
  if (params.from) period = "custom";
  else if (!(period in GAP_PERIODS) && period !== "all") period = "90";
  let endMs = params.to ? parseGapTime(params.to, true) : latestMs;
  if (!Number.isFinite(endMs)) return { status: 400, body: { ok: false, message: "종료 시각 형식이 올바르지 않습니다 (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)" } };
  if (endMs > latestMs) endMs = latestMs;
  let startMs = null;
  if (period === "custom") {
    startMs = parseGapTime(params.from, false);
    if (!Number.isFinite(startMs)) return { status: 400, body: { ok: false, message: "시작 시각 형식이 올바르지 않습니다 (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)" } };
  } else if (period !== "all") {
    startMs = dayFloor(endMs) - (GAP_PERIODS[period] - 1) * DAY_MS;
  }
  if (kind === "daily") {
    endMs = dayFloor(endMs);
    if (startMs != null) startMs = dayFloor(startMs);
  }
  const minStart = dayFloor(endMs) - (GAP_MAX_DAYS - 1) * DAY_MS;
  if (period === "custom") {
    if (startMs > endMs) return { status: 400, body: { ok: false, message: `시작이 종료(공식 최신 ${official.slice(0, 16)}까지)보다 늦습니다` } };
    if (startMs < minStart) return { status: 400, body: { ok: false, message: `기간은 최대 ${GAP_MAX_DAYS}일까지 조회할 수 있습니다` } };
  }
  const ids = targets.map((s) => String(s.station_id));

  // 1) 지점별 첫·마지막 관측
  const bounds = new Map(ids.map((id) => [id, { first: null, last: null, dFirst: null, dLast: null, rows: 0 }]));
  let allHourly = null;
  let allDaily = null;
  if (db.usingPg()) {
    const b = await db.gapBoundsPg(ids);
    for (const r of b.hourly) Object.assign(bounds.get(String(r.station_id)), { first: r.first, last: r.last });
    for (const r of b.daily) Object.assign(bounds.get(String(r.station_id)), { dFirst: r.first, dLast: r.last });
  } else {
    allHourly = loadJson(OBS_FILE, []).filter((r) => bounds.has(String(r.station_id)));
    allDaily = loadJson(DAILY_FILE, []).filter((r) => bounds.has(String(r.station_id)));
    for (const r of allHourly) {
      const x = bounds.get(String(r.station_id));
      const t = t16(r.observation_datetime);
      if (!x.first || t < x.first) x.first = t;
      if (!x.last || t > x.last) x.last = t;
    }
    for (const r of allDaily) {
      const x = bounds.get(String(r.station_id));
      const d = String(r.observation_date).slice(0, 10);
      if (!x.dFirst || d < x.dFirst) x.dFirst = d;
      if (!x.dLast || d > x.dLast) x.dLast = d;
    }
  }

  // 2) 지점별 점검 구간
  const ranges = [];
  const info = new Map();
  for (const id of ids) {
    const x = bounds.get(id);
    let s = startMs;
    let clamped = false;
    if (s == null) {
      // 전체: 그 지점의 첫 관측부터
      const firsts = [x.first ? wallMs(x.first) : NaN, kind === "daily" && x.dFirst ? wallMs(`${x.dFirst} 00:00`) : NaN].filter(Number.isFinite);
      if (!firsts.length) {
        info.set(id, { range: null });
        continue;
      }
      s = Math.min(...firsts);
      s = kind === "daily" ? dayFloor(s) : Math.floor(s / 3600000) * 3600000;
    }
    if (s < minStart) {
      s = minStart;
      clamped = true;
    }
    if (s > endMs) {
      info.set(id, { range: null });
      continue;
    }
    const a = kind === "daily" ? `${msToYmd(s)} 00` : msToH13(s);
    const b = kind === "daily" ? `${msToYmd(endMs)} 23` : msToH13(endMs);
    ranges.push({ station_id: id, a, b });
    info.set(id, { range: { s, e: endMs, a, b }, clamped });
  }

  // 3) 일자별 적재 시각 수 · 공식 일자료 · (시간자료) 미적재 구간
  const dayCounts = new Map(ids.map((id) => [id, new Map()]));
  const officialDays = new Map(ids.map((id) => [id, new Set()]));
  const hourIntervals = new Map(ids.map((id) => [id, []]));
  const rowsInRange = new Map(ids.map((id) => [id, 0]));
  const rangeOf = new Map(ranges.map((r) => [r.station_id, r]));
  if (db.usingPg()) {
    const minDate = ranges.length ? ranges.reduce((m, r) => (r.a < m ? r.a : m), ranges[0].a).slice(0, 10) : null;
    const [counts, ivs, offs] = await Promise.all([
      db.gapDayCountsPg(ranges),
      kind === "hourly" ? db.gapHourIntervalsPg(ranges) : Promise.resolve([]),
      kind === "daily" && ranges.length ? db.gapOfficialDaysPg(ranges.map((r) => r.station_id), minDate, msToYmd(endMs)) : Promise.resolve([]),
    ]);
    for (const r of counts) {
      dayCounts.get(String(r.station_id)).set(r.d, r.n);
      rowsInRange.set(String(r.station_id), rowsInRange.get(String(r.station_id)) + r.rows);
    }
    for (const r of ivs) hourIntervals.get(String(r.station_id)).push({ s: r.s, e: r.e, n: r.n });
    for (const r of offs) {
      const rg = rangeOf.get(String(r.station_id));
      if (rg && r.d >= rg.a.slice(0, 10) && r.d <= rg.b.slice(0, 10)) officialDays.get(String(r.station_id)).add(r.d);
    }
  } else {
    const hours = new Map(ids.map((id) => [id, new Set()]));
    for (const r of allHourly) {
      const id = String(r.station_id);
      const rg = rangeOf.get(id);
      const h = String(r.observation_datetime).slice(0, 13);
      if (!rg || h < rg.a || h > rg.b) continue;
      rowsInRange.set(id, rowsInRange.get(id) + 1);
      hours.get(id).add(h);
    }
    for (const [id, set] of hours) {
      const dc = dayCounts.get(id);
      for (const h of set) dc.set(h.slice(0, 10), (dc.get(h.slice(0, 10)) || 0) + 1);
      const rg = rangeOf.get(id);
      if (kind !== "hourly" || !rg) continue;
      let cur = null;
      for (let t = h13Ms(rg.a), e = h13Ms(rg.b); t <= e; t += 3600000) {
        const h = msToH13(t);
        if (set.has(h)) {
          cur = null;
          continue;
        }
        if (cur) {
          cur.e = h;
          cur.n += 1;
        } else {
          cur = { s: h, e: h, n: 1 };
          hourIntervals.get(id).push(cur);
        }
      }
    }
    for (const r of allDaily) {
      const id = String(r.station_id);
      const rg = rangeOf.get(id);
      const d = String(r.observation_date).slice(0, 10);
      if (rg && d >= rg.a.slice(0, 10) && d <= rg.b.slice(0, 10)) officialDays.get(id).add(d);
    }
  }

  // 4) 지점별 결과 조립
  const out = targets.map((st) => {
    const id = String(st.station_id);
    const x = bounds.get(id);
    const inf = info.get(id);
    const lastObs = x.last;
    const lag = lastObs ? lagHours(lastObs, official) : null;
    const base = {
      station_id: id,
      station_name: st.station_name,
      enabled: Boolean(st.enabled),
      favorite: Boolean(st.favorite),
      first_observation: x.first,
      last_observation: lastObs,
      first_official_day: x.dFirst,
      last_official_day: x.dLast,
      lag_hours: lag,
      stale: lag != null && lag > 24,
      has_data: Boolean(x.first || x.dFirst),
    };
    if (!inf.range) {
      return { ...base, from: null, to: null, expected: 0, present: 0, missing: 0, coverage: null, interval_count: 0, intervals: [], intervals_truncated: false, strip: null };
    }
    const { s, e, a, b } = inf.range;
    const dc = dayCounts.get(id);
    const days = [];
    for (let t = dayFloor(s); t <= dayFloor(e); t += DAY_MS) days.push(msToYmd(t));
    let expected;
    let present;
    let intervals;
    let strip;
    let extra = {};
    if (kind === "hourly") {
      expected = Math.round((e - s) / 3600000) + 1;
      present = [...dc.values()].reduce((acc, n) => acc + n, 0);
      intervals = hourIntervals.get(id).map((iv) => ({ start: `${iv.s}:00`, end: `${iv.e}:00`, length: iv.n }));
      const firstH = new Date(s).getUTCHours();
      const lastH = new Date(e).getUTCHours();
      strip = {
        start: days[0],
        present: days.map((d) => dc.get(d) || 0),
        expected: days.map((d, i) => (days.length === 1 ? lastH - firstH + 1 : i === 0 ? 24 - firstH : i === days.length - 1 ? lastH + 1 : 24)),
      };
      extra = { duplicates: Math.max(0, rowsInRange.get(id) - present) };
    } else {
      const offs = officialDays.get(id);
      const status = days.map((d) => (offs.has(d) ? 3 : (dc.get(d) || 0) >= 24 ? 2 : (dc.get(d) || 0) > 0 ? 1 : 0));
      expected = days.length;
      present = status.filter((v) => v > 0).length;
      intervals = [];
      let cur = null;
      status.forEach((v, i) => {
        if (v > 0) {
          cur = null;
          return;
        }
        if (cur) {
          cur.end = days[i];
          cur.length += 1;
        } else {
          cur = { start: days[i], end: days[i], length: 1 };
          intervals.push(cur);
        }
      });
      strip = { start: days[0], status };
      extra = {
        official_days: status.filter((v) => v === 3).length,
        derived_days: status.filter((v) => v === 2 || v === 1).length,
        partial_days: status.filter((v) => v === 1).length,
      };
    }
    const missing = Math.max(0, expected - present);
    return {
      ...base,
      from: kind === "hourly" ? `${a}:00` : a.slice(0, 10),
      to: kind === "hourly" ? `${b}:00` : b.slice(0, 10),
      range_clamped: inf.clamped,
      expected,
      present,
      missing,
      coverage: expected ? Math.floor((present / expected) * 1000) / 10 : null,
      ...extra,
      interval_count: intervals.length,
      intervals: intervals.slice(0, GAP_MAX_INTERVALS),
      intervals_truncated: intervals.length > GAP_MAX_INTERVALS,
      strip,
    };
  });
  return {
    status: 200,
    body: {
      timezone: "Asia/Seoul",
      kind,
      unit: kind === "daily" ? "day" : "hour",
      period,
      latestOfficialHour: official,
      from: startMs == null ? null : kind === "daily" ? msToYmd(startMs) : `${msToH13(Math.max(startMs, minStart))}:00`,
      to: kind === "daily" ? msToYmd(endMs) : `${msToH13(endMs)}:00`,
      storage: db.storageKind(),
      max_days: GAP_MAX_DAYS,
      max_intervals: GAP_MAX_INTERVALS,
      stations: out,
    },
  };
}

async function dashboard() {
  const key = await getKey();
  if (db.usingPg()) {
    const [hourlyRecords, dailyRecords, coverage, jobs, series, st] = await Promise.all([
      db.countHourly(),
      db.countDaily(),
      db.coverageHourly(),
      db.listJobs(),
      db.seriesSeoul(),
      stations(),
    ]);
    const stationSummaryList = await stationSummaries(st);
    return {
      timezone: "Asia/Seoul",
      latestOfficialHour: latestOfficialHour(),
      keyRegistered: Boolean(key),
      keyHint: hint(key),
      storage: db.storageKind(),
      hourlyRecords,
      dailyRecords,
      coverage,
      lastJob: jobs[0] || null,
      series,
      stations: st,
      stationSummaries: stationSummaryList,
    };
  }
  const hourly = loadJson(OBS_FILE, []);
  const daily = loadJson(DAILY_FILE, []);
  const jobs = await listJobs();
  const st = await stations();
  const seoul = hourly
    .filter((r) => r.station_id === "108")
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime))
    .slice(-72)
    .map((r) => ({ t: r.observation_datetime.slice(5, 13), temperature: r.temperature, precipitation: r.precipitation }));
  const byDs = {};
  for (const r of hourly) {
    byDs[r.dataset] ??= { records: 0, stations: new Set(), first: r.observation_datetime, last: r.observation_datetime };
    byDs[r.dataset].records += 1;
    byDs[r.dataset].stations.add(r.station_id);
    if (r.observation_datetime < byDs[r.dataset].first) byDs[r.dataset].first = r.observation_datetime;
    if (r.observation_datetime > byDs[r.dataset].last) byDs[r.dataset].last = r.observation_datetime;
  }
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
    series: seoul,
    stations: st,
    stationSummaries: await stationSummaries(st),
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

// 자동 수집 토큰으로 온 요청은 지점·기간을 반드시 명시해야 한다(기본값으로 수집하지 않음). 관리자 화면 요청은 기존과 동일.
const WALL_RE = /^\d{4}-\d{2}-\d{2}( \d{2}(:\d{2}(:\d{2})?)?)?$/;
function machineCollectError(req, body) {
  if (!req._collectToken) return null;
  if (!/^\d{2,4}$/.test(String(body.stationId ?? ""))) return "stationId(숫자 지점번호)가 필요합니다.";
  if (!WALL_RE.test(String(body.from ?? "")) || !WALL_RE.test(String(body.to ?? ""))) return "from/to (YYYY-MM-DD[ HH:00:00]) 가 필요합니다.";
  if (String(body.from) > String(body.to)) return "from 이 to 보다 늦습니다.";
  return null;
}

seedIfEmpty();

// 카카오 로그인(관리 기능 보호). 서버 시작 시 DB 연결 뒤에 만든다. 키가 없으면 꺼진 상태(기존과 동일).
let auth = createAuth({ env: {} });
let layoutStore = null;
const layoutKeys = (kind) => new Set(getExportCatalog(kind, { fullFields: true }).map((c) => c.key));
// 공개 응답에서 관리자 전용 정보(인증키 일부, 수집 메시지)를 뺀다. 로그인 기능이 꺼져 있으면 그대로.
async function publicView(req, d) {
  if (await auth.isAdmin(req)) return d;
  const j = d.lastJob;
  return {
    ...d,
    keyHint: null,
    lastJob: j ? { id: j.id, dataset: j.dataset, status: j.status, station_id: j.station_id, from: j.from, to: j.to } : null,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const denied = await auth.guard(req, url);
    if (denied) return json(res, denied.body, denied.status);
    if (await auth.handle(req, res, url)) return;
    if (await handleLayouts(req, res, url, { store: layoutStore, ownerOf: (r) => auth.ownerOf(r), allowedKeys: layoutKeys, readBody, json })) return;
    if (req.method === "GET" && url.pathname === "/api/hourly") {
      return json(res, await queryHourly(Object.fromEntries(url.searchParams)));
    }
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return json(res, await publicView(req, await dashboard()));
    }
    if (req.method === "GET" && url.pathname === "/api/series") {
      const r = await series(url.searchParams.get("stationId"), url.searchParams.get("hours"), url.searchParams.get("from"), url.searchParams.get("to"));
      return json(res, r.body, r.status);
    }
    if (req.method === "GET" && url.pathname === "/api/gaps") {
      const r = await gaps(Object.fromEntries(url.searchParams));
      return json(res, r.body, r.status);
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
    if (req.method === "GET" && url.pathname === "/api/export/fields") {
      const full = db.usingPg() ? db.fullFieldsReady() : false;
      const hourlyList = getExportCatalog("hourly", { fullFields: full });
      const dailyList = getExportCatalog("daily", { fullFields: full });
      return json(res, {
        ok: true,
        storage: db.storageKind(),
        fullFields: full,
        hourly: {
          catalog: hourlyList,
          defaultColumns: HOURLY_DEFAULT_EXPORT,
          presets: Object.fromEntries(EXPORT_PRESETS.filter((p) => p.kind === "hourly").map((p) => [p.id, p])),
        },
        daily: {
          catalog: dailyList,
          defaultColumns: DAILY_DEFAULT_EXPORT,
          presets: Object.fromEntries(EXPORT_PRESETS.filter((p) => p.kind === "daily").map((p) => [p.id, p])),
        },
        defaultLayouts: {
          hourly: HOURLY_DEFAULT_EXPORT,
          daily: DAILY_DEFAULT_EXPORT,
        },
        presets: EXPORT_PRESETS,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/export/preview") {
      const kind = url.searchParams.get("kind") || "hourly";
      const stationId = url.searchParams.get("stationId") || "108";
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const colParam = url.searchParams.get("columns");
      const columns = colParam ? colParam.split(",").map((s) => s.trim()).filter(Boolean) : null;
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)));
      const data = await getExportData({ kind, stationId, from, to, columns, limit });
      const full = db.usingPg() ? db.fullFieldsReady() : false;
      const catalog = getExportCatalog(kind, { fullFields: full });
      const metaMap = new Map(catalog.map((c) => [c.col, c]));
      const missing = data.columns.filter((c) => {
        const m = metaMap.get(c);
        return m && !m.available;
      });
      let total = data.total;
      if (total === undefined) {
        if (db.usingPg()) {
          total = kind === "daily"
            ? (await getExportData({ kind, stationId, from, to, columns })).rows.length
            : await db.countHourlyExportPg({ stationId, from: data.from, to: data.to });
        } else {
          total = data.rows.length;
        }
      }
      const colMetaList = data.columns.map((c) => metaMap.get(c) || { col: c, key: c, label: c, name_ko: c, unit: "", desc: "", group: "기타", category: "기타" });
      return json(res, {
        ok: true,
        kind: data.kind,
        stationId: data.stationId,
        from: data.from,
        to: data.to,
        columns: colMetaList,
        columnMeta: colMetaList,
        rows: data.rows,
        total: total ?? 0,
        totalCount: total ?? 0,
        previewCount: data.rows.length,
        missingColumns: missing,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/export") {
      const kind = url.searchParams.get("kind") || "hourly";
      const stationId = url.searchParams.get("stationId") || "108";
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const colParam = url.searchParams.get("columns");
      const columns = colParam ? colParam.split(",").map((s) => s.trim()).filter(Boolean) : null;
      const data = await getExportData({ kind, stationId, from, to, columns, limit: null });
      if (!data.rows || data.rows.length === 0) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({
          ok: false,
          error: "EMPTY_DATA",
          message: `선택한 조건(지점 ${stationId}, 기간 ${data.from} ~ ${data.to})에 해당하는 관측 자료가 DB에 없습니다 (0건).`,
        }));
      }
      const headers = data.columns;
      const lines = [headers.join(",")].concat(
        data.rows.map((r) => formatCsvRow(r, headers))
      );
      const csv = `\uFEFF# source=KMA timezone=Asia/Seoul station=${stationId} from=${data.from} to=${data.to} kind=${kind}\n${lines.join("\n")}`;
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
      return json(res, await publicView(req, {
        timezone: "Asia/Seoul",
        latestOfficialHour: latestOfficialHour(),
        keyRegistered: Boolean(key),
        keyHint: hint(key),
        storage: db.storageKind(),
        hourlyRecords,
        lastJob: jobs[0] || null,
      }));
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      // DB 연결 상태(개인정보·비밀 없음). DB 가 응답하지 않으면 503.
      const storage = db.storageKind();
      if (storage === "json") return json(res, { ok: true, storage, db: "none" });
      try {
        const ms = await db.pingDb();
        return json(res, { ok: true, storage, db: "ok", db_ms: ms });
      } catch (err) {
        return json(res, { ok: false, storage, db: "down", message: err?.code || "DB 응답 없음" }, 503);
      }
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
      const bad = machineCollectError(req, body);
      if (bad) return json(res, { ok: false, message: bad }, 400);
      const latest = latestOfficialHour();
      const job = await collectDaily({
        stationId: body.stationId || "108",
        trigger: req._collectToken ? "SCHEDULED" : "MANUAL",
        from: body.from || addHours(latest, -7 * 24),
        to: body.to || latest,
      });
      return json(res, job, job.status === "FAILED" ? 400 : 200);
    }
    if (req.method === "POST" && url.pathname === "/api/collect") {
      const body = await readBody(req);
      const bad = machineCollectError(req, body);
      if (bad) return json(res, { ok: false, message: bad }, 400);
      const latest = latestOfficialHour();
      const job = await collectOfficial({
        stationId: body.stationId || "108",
        trigger: req._collectToken ? "SCHEDULED" : "MANUAL",
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
      const types = {
        ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp",
        ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
      };
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
      console.log(`${db.storageKind()} connected imported=${imported.imported}`);
    } else {
      console.log("postgresql off · json fallback");
    }
  } catch (err) {
    // MySQL(NAS) 모드에서는 JSON 대체 모드로 내려가지 않는다(빈 화면·엉뚱한 곳에 저장 방지). 종료하면 docker 가 다시 띄워 재시도한다.
    if (db.dbDriver() === "mysql") {
      console.error("mysql init failed — exiting for restart", err instanceof Error ? err.message : err);
      process.exit(1);
    }
    console.error("postgresql init failed, json fallback", err);
  }
  // AUTH_PROVIDER=kakao(기본): 카카오 키가 있을 때 / nuni-id: 누니 ID 클라이언트 설정이 있을 때만 저장소를 만든다
  const authKeys = authConfigured(process.env);
  const kind = db.storageKind();
  const store = authKeys ? (kind === "mysql" ? createMysqlStore(db.getPool()) : kind === "postgresql" ? createPgStore(db.getPool()) : createJsonStore(AUTH_FILE)) : null;
  if (store) {
    // 로그인 기능이 켜질 때만 app_users/app_sessions 생성(IF NOT EXISTS). 실패해도 관리 기능은 잠긴 채로 둔다(fail closed).
    try {
      await store.ensureSchema();
    } catch (err) {
      console.error("auth schema init failed (관리 기능은 잠김 상태 유지)", err instanceof Error ? err.message : err);
    }
  }
  auth = createAuth({ env: process.env, store });
  layoutStore = kind === "mysql" ? createMysqlLayoutStore(db.getPool()) : kind === "postgresql" ? createPgLayoutStore(db.getPool()) : createJsonLayoutStore(LAYOUT_FILE);
  console.log(auth.startupLine);
  if (auth.enabled) {
    const n = await auth.cleanup();
    if (n) console.log(`auth expired sessions removed=${n}`);
    setInterval(() => auth.cleanup(), 3600000).unref();
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`weather-hub ${PORT} latest=${latestOfficialHour()} storage=${db.storageKind()}`);
  });
})();
await ready;
