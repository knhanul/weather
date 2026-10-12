// 기상청 단기예보 조회서비스(VilageFcstInfoService_2.0) 수집: 단기예보·초단기예보·초단기실황.
// 발표(base)마다 따로 보관한다 — 같은 (격자, 발표시각, 예보시각, 항목) 키만 덮어쓰고 다른 발표는 건드리지 않는다.
// 화면에는 아직 쓰지 않는다(2026-10-12, 적재만).

// ---- 위경도 → 기상청 격자(nx, ny): 기상청 동네예보 LCC DFS 변환(공식 예제와 같은 상수) ----
const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
export function latLonToGrid(lat, lon) {
  const D = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * D - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

// ---- 자료 종류 ----
// delayMin: 발표시각 뒤 이만큼 지나야 조회를 시도(기상청 제공 시각 기준, 여유 포함). 아직 없으면(03 NO_DATA) 실패가 아니라 "아직 없음".
export const FORECAST_KINDS = {
  KMA_VILAGE_FCST: { op: "getVilageFcst", table: "kma_vilage_fcst", valueKey: "fcstValue", hasFcst: true, delayMin: 10, base: (h, m) => m === 0 && h % 3 === 2 },
  KMA_ULTRA_FCST: { op: "getUltraSrtFcst", table: "kma_ultra_fcst", valueKey: "fcstValue", hasFcst: true, delayMin: 15, base: (h, m) => m === 30 },
  KMA_ULTRA_NCST: { op: "getUltraSrtNcst", table: "kma_ultra_ncst", valueKey: "obsrValue", hasFcst: false, delayMin: 10, base: (h, m) => m === 0 },
};
const KST_MS = 9 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const wallOf = (ms) => { const d = new Date(ms + KST_MS); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`; };

// 지금(nowMs) 조회할 수 있는 발표시각들(KST 'YYYY-MM-DD HH:MM:00'), 최근 hours 시간, 오래된 것부터.
export function releaseTimes(dataset, nowMs, hours = 24) {
  const k = FORECAST_KINDS[dataset];
  if (!k) throw new Error(`알 수 없는 dataset ${dataset}`);
  const out = [];
  const last = Math.floor((nowMs - k.delayMin * 60000) / 1800000) * 1800000; // 30분 단위
  for (let t = last; t > nowMs - hours * 3600000; t -= 1800000) {
    const d = new Date(t + KST_MS);
    if (k.base(d.getUTCHours(), d.getUTCMinutes())) out.push(wallOf(t));
  }
  return out.reverse();
}

const ymdhm = (d, t) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2, 4)}:00`;
// 기상청 item → 저장 행. 값은 문자열 그대로(강수없음, 1.0mm 등), raw 는 원문 item JSON.
export function parseForecastItems(dataset, items, grid) {
  const k = FORECAST_KINDS[dataset];
  const rows = [];
  for (const it of items || []) {
    if (!it || !it.category || !it.baseDate || !it.baseTime) continue;
    const row = {
      nx: Number(it.nx ?? grid?.nx),
      ny: Number(it.ny ?? grid?.ny),
      base_datetime: ymdhm(String(it.baseDate), String(it.baseTime).padStart(4, "0")),
      category: String(it.category),
      value: it[k.valueKey] == null ? null : String(it[k.valueKey]),
      raw: JSON.stringify(it),
    };
    if (k.hasFcst) {
      if (!it.fcstDate || !it.fcstTime) continue;
      row.fcst_datetime = ymdhm(String(it.fcstDate), String(it.fcstTime).padStart(4, "0"));
    }
    rows.push(row);
  }
  return rows;
}

// 응답 판정: { items, totalCount } 또는 { none: '사유' }(자료 없음·제공 기간 지남 → 실패 아님) 또는 throw(오류)
export function readForecastResponse(httpStatus, text) {
  let j;
  try { j = JSON.parse(text); } catch { throw Object.assign(new Error((String(text || "").replace(/\s+/g, " ").slice(0, 180)) || `HTTP ${httpStatus}`), { retry: true }); }
  const gw = j?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) throw new Error([gw.errMsg, gw.returnAuthMsg, gw.returnReasonCode && `(${gw.returnReasonCode})`, `HTTP ${httpStatus}`].filter(Boolean).join(" "));
  if (httpStatus < 200 || httpStatus >= 300) throw Object.assign(new Error(`HTTP ${httpStatus}`), { retry: httpStatus >= 500 });
  const h = j?.response?.header;
  if (!h) throw new Error("기상청 응답 형식이 아닙니다");
  if (h.resultCode === "03") return { none: "NO_DATA" };
  if (h.resultCode === "10") return { none: "OUT_OF_RANGE" }; // 최근 1일 간의 자료만 제공
  if (h.resultCode !== "00") throw Object.assign(new Error(`${h.resultCode} ${h.resultMsg || ""}`.trim()), { retry: ["01", "02", "04", "05"].includes(h.resultCode) });
  const b = j.response.body || {};
  const it = b.items?.item;
  const items = !it ? [] : Array.isArray(it) ? it : [it];
  return { items, totalCount: Number(b.totalCount ?? items.length) };
}

const BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/";
const ROWS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 한 발표(격자 하나) 전부 받기. 페이지 넘김 + 재시도. 반환 { rows } 또는 { none }
export async function fetchRelease({ dataset, key, grid, base, fetchImpl = fetch, tries = 3, timeoutMs = 20000 }) {
  const k = FORECAST_KINDS[dataset];
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL(BASE_URL + k.op);
    const q = { serviceKey: key, numOfRows: ROWS, pageNo: page, dataType: "JSON", base_date: base.slice(0, 10).replaceAll("-", ""), base_time: base.slice(11, 13) + base.slice(14, 16), nx: grid.nx, ny: grid.ny };
    for (const [a, v] of Object.entries(q)) url.searchParams.set(a, String(v));
    let r;
    for (let i = 1; ; i++) {
      try {
        const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
        r = readForecastResponse(res.status, await res.text());
        break;
      } catch (e) {
        const retry = e?.retry !== false && (e?.retry || e?.name === "TimeoutError" || e?.name === "AbortError" || e instanceof TypeError);
        if (!retry || i >= tries) throw e;
        await sleep(1000 * i);
      }
    }
    if (r.none) {
      if (page === 1) return { none: r.none };
      break;
    }
    all.push(...r.items);
    if (r.items.length < ROWS || page * ROWS >= r.totalCount) break;
  }
  return { rows: parseForecastItems(dataset, all, grid) };
}

// 수집 한 번: 최근 hours 시간의 발표 중 아직 안 받은 것(완료 기록 없음)을 격자마다 받는다.
// store: { completedReleases(dataset, fromBase) → Set('nx|ny|base'), upsert(dataset, rows) → {inserted, updated}, markRelease(dataset, grid, base, n) }
export async function collectForecast({ dataset, key, grids, store, nowMs = Date.now(), hours = 24, fetchImpl = fetch, concurrency = 4, log = () => {} }) {
  const bases = releaseTimes(dataset, nowMs, hours);
  const job = { dataset, from: bases[0] || null, to: bases[bases.length - 1] || null, received: 0, inserted: 0, updated: 0, chunks: 0, releases: 0, skipped: 0, none: 0, failed: 0, errors: [] };
  if (!bases.length) return job;
  const done = await store.completedReleases(dataset, bases[0]);
  const todo = [];
  for (const base of bases) for (const g of grids) {
    if (done.has(`${g.nx}|${g.ny}|${base}`)) job.skipped++;
    else todo.push({ g, base });
  }
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const { g, base } = todo[next++];
      try {
        const r = await fetchRelease({ dataset, key, grid: g, base, fetchImpl });
        if (r.none) { job.none++; continue; } // 아직 발표 전이거나 제공 기간이 지난 발표
        const u = await store.upsert(dataset, r.rows);
        await store.markRelease(dataset, g, base, r.rows.length);
        job.received += r.rows.length; job.inserted += u.inserted; job.updated += u.updated; job.chunks++; job.releases++;
      } catch (e) {
        job.failed++;
        const msg = `${g.nx},${g.ny} ${base.slice(0, 16)}: ${e instanceof Error ? e.message : String(e)}`;
        if (job.errors.length < 5) job.errors.push(msg);
        log(msg);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return job;
}
