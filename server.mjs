import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const OBS_FILE = path.join(DATA, "hourly.json");
const SET_FILE = path.join(DATA, "settings.json");
const JOB_FILE = path.join(DATA, "jobs.json");
const PORT = Number(process.env.PORT || 8080);
const KST_MS = 9 * 60 * 60 * 1000;

fs.mkdirSync(DATA, { recursive: true });

function nowKst() {
  const d = new Date(Date.now() + KST_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    h: d.getUTCHours(),
  };
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

function hash32(s) {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function synth(stationId, dt) {
  const hour = Number(dt.slice(11, 13));
  const doy = Number(dt.slice(5, 7)) * 30 + Number(dt.slice(8, 10));
  const off = stationId === "108" ? 0 : stationId === "159" ? 1.4 : -0.6;
  const temperature =
    Math.round((22.5 + 6.5 * Math.sin(((doy - 200) / 365) * Math.PI * 2) + 4.8 * Math.sin(((hour - 4) / 24) * Math.PI * 2) + off + (hash32(dt + stationId) - 0.5) * 1.4) * 10) / 10;
  const rainDay = hash32(stationId + dt.slice(0, 10) + "r") > 0.82;
  const precipitation =
    rainDay && hour >= 14 && hour <= 19
      ? Math.round((hash32(dt + "rn") * 4 + 0.2) * 10) / 10
      : hour === 0
        ? 0
        : null;
  return {
    provider: "KMA",
    dataset: "ASOS_HOURLY",
    station_id: stationId,
    station_name: { 108: "서울", 112: "인천", 159: "부산" }[stationId] ?? stationId,
    observation_datetime: dt,
    timezone: "Asia/Seoul",
    temperature,
    precipitation,
    humidity: Math.round(58 + (rainDay ? 16 : 0) + (hash32(dt + "h") - 0.5) * 10),
    wind_speed: Math.round((1.4 + hash32(dt + "w") * 3.2) * 10) / 10,
    wind_direction: [70, 90, 250, 270][Math.floor(hash32(dt + "wd") * 4)],
    pressure: Math.round((1012 + (hash32(dt + "p") - 0.5) * 6) * 10) / 10,
    quality_temperature: "NORMAL",
    source_kind: "SEED",
  };
}

function seedIfEmpty() {
  const existing = loadJson(OBS_FILE, []);
  if (existing.length) return existing;
  const latest = latestOfficialHour();
  const end = new Date(Date.UTC(+latest.slice(0, 4), +latest.slice(5, 7) - 1, +latest.slice(8, 10), +latest.slice(11, 13)) - KST_MS);
  const rows = [];
  for (const st of ["108", "112", "159"]) {
    for (let i = 7 * 24 - 1; i >= 0; i -= 1) {
      const t = new Date(end.getTime() - i * 3600000 + KST_MS);
      const dt = wall(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours());
      if (st === "108" && dt.endsWith("13:00:00") && dt.slice(8, 10) === latest.slice(8, 10)) continue;
      rows.push(synth(st, dt));
    }
  }
  saveJson(OBS_FILE, rows);
  saveJson(JOB_FILE, [
    {
      id: 1,
      dataset: "ASOS_HOURLY",
      status: "COMPLETED",
      trigger: "SEED",
      from: rows[0]?.observation_datetime,
      to: latest,
      received: rows.length,
      inserted: rows.length,
      message: "미리보기 시드(기후값). 공식 수집 시 UPSERT로 덮어씁니다.",
    },
  ]);
  return rows;
}

function upsert(rows) {
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

function queryHourly({ stationId = "108", from, to }) {
  const latest = latestOfficialHour();
  const start = from || addHours(latest, -24);
  const end = to || latest;
  const rows = loadJson(OBS_FILE, [])
    .filter((r) => r.station_id === stationId && r.observation_datetime >= start && r.observation_datetime <= end)
    .sort((a, b) => a.observation_datetime.localeCompare(b.observation_datetime));
  return { timezone: "Asia/Seoul", station_id: stationId, from: start, to: end, total: rows.length, data: rows };
}

function addHours(wallClock, hours) {
  const [d, t] = wallClock.split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const h = Number((t || "00:00:00").slice(0, 2));
  const utc = Date.UTC(y, m - 1, day, h) - KST_MS + hours * 3600000;
  const x = new Date(utc + KST_MS);
  return wall(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), x.getUTCHours());
}

function getKey() {
  const env = process.env.KMA_API_KEY?.trim();
  if (env) return env;
  const s = loadJson(SET_FILE, {});
  return s.apiKey || null;
}

function hint(key) {
  if (!key || key.length < 8) return null;
  return key.slice(0, 3) + "…" + key.slice(-4);
}

async function collectOfficial({ stationId = "108", from, to }) {
  const key = getKey();
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
    message: "",
  };
  const jobs = loadJson(JOB_FILE, []);
  if (!key) {
    job.status = "FAILED";
    job.message = "인증키가 없습니다. 공급원에 공공데이터포털 serviceKey를 등록하세요.";
    jobs.unshift(job);
    saveJson(JOB_FILE, jobs.slice(0, 40));
    return job;
  }
  const startDt = from.slice(0, 10).replaceAll("-", "");
  const endDt = to.slice(0, 10).replaceAll("-", "");
  const startHh = from.slice(11, 13) || "00";
  const endHh = to.slice(11, 13) || "23";
  const url = new URL("https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("dataCd", "ASOS");
  url.searchParams.set("dateCd", "HR");
  url.searchParams.set("startDt", startDt);
  url.searchParams.set("startHh", startHh);
  url.searchParams.set("endDt", endDt);
  url.searchParams.set("endHh", endHh);
  url.searchParams.set("stnIds", stationId);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      job.status = "FAILED";
      job.message = text.slice(0, 180) || `HTTP ${res.status}`;
      jobs.unshift(job);
      saveJson(JOB_FILE, jobs.slice(0, 40));
      return job;
    }
    const header = parsed?.response?.header ?? {};
    const code = header.resultCode;
    if (code && code !== "00") {
      job.status = "FAILED";
      job.message = `${code} ${header.resultMsg || ""}`.trim();
      jobs.unshift(job);
      saveJson(JOB_FILE, jobs.slice(0, 40));
      return job;
    }
    const items = parsed?.response?.body?.items?.item;
    const list = !items ? [] : Array.isArray(items) ? items : [items];
    const mapped = list.map((it) => ({
      provider: "KMA",
      dataset: "ASOS_HOURLY",
      station_id: String(it.stnId ?? stationId),
      station_name: it.stnNm || stationId,
      observation_datetime: String(it.tm || "").length === 13 ? `${it.tm}:00:00` : String(it.tm || ""),
      timezone: "Asia/Seoul",
      temperature: it.ta === "" || it.ta == null ? null : Number(it.ta),
      precipitation: it.rn === "" || it.rn == null ? null : Number(it.rn),
      humidity: it.hm === "" || it.hm == null ? null : Number(it.hm),
      wind_speed: it.ws === "" || it.ws == null ? null : Number(it.ws),
      wind_direction: it.wd === "" || it.wd == null ? null : Number(it.wd),
      pressure: it.pa === "" || it.pa == null ? null : Number(it.pa),
      quality_temperature: !it.taQcflg || it.taQcflg === "0" ? "NORMAL" : it.taQcflg === "1" ? "INVALID" : it.taQcflg === "9" ? "MISSING" : "SUSPECT",
      source_kind: "OFFICIAL",
    }));
    const u = upsert(mapped);
    job.status = "COMPLETED";
    job.received = mapped.length;
    job.inserted = u.inserted;
    job.updated = u.updated;
    job.message = "공식 ASOS 시간자료 UPSERT 완료";
  } catch (err) {
    job.status = "FAILED";
    job.message = err instanceof Error ? err.message : String(err);
  }
  jobs.unshift(job);
  saveJson(JOB_FILE, jobs.slice(0, 40));
  return job;
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
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && url.pathname === "/api/hourly") {
    return json(res, queryHourly(Object.fromEntries(url.searchParams)));
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    const key = getKey();
    const jobs = loadJson(JOB_FILE, []);
    const rows = loadJson(OBS_FILE, []);
    return json(res, {
      timezone: "Asia/Seoul",
      latestOfficialHour: latestOfficialHour(),
      keyRegistered: Boolean(key),
      keyHint: hint(key),
      hourlyRecords: rows.length,
      lastJob: jobs[0] || null,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return json(res, loadJson(JOB_FILE, []));
  }
  if (req.method === "POST" && url.pathname === "/api/key") {
    const body = await readBody(req);
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length < 8) return json(res, { ok: false, message: "키가 너무 짧습니다." }, 400);
    saveJson(SET_FILE, { apiKey, updatedAt: new Date().toISOString() });
    return json(res, { ok: true, hint: hint(apiKey) });
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
      res.end("not found");
      return;
    }
    const ext = path.extname(full);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
    res.end(buf);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`weather-hub ${PORT} latest=${latestOfficialHour()} rows=${loadJson(OBS_FILE, []).length}`);
});
