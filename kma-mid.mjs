// 기상청 중기예보 조회서비스(MidFcstInfoService) 적재: 중기전망(getMidFcst), 육상예보(getMidLandFcst), 기온(getMidTa). 2026-10-13, 화면 변경 없음.
// 발표(tmFc 06·18시 KST)마다 따로 보관. 항목은 세로로(item_key 하나 = 행 하나) + 발표 원문은 kma_mid_releases.raw 에 한 번.
import { readForecastResponse } from "./kma-forecast.mjs";

// 지점 → 중기 구역(2026-10-13 API 응답으로 확인: 8지점 × 3종 모두 resultCode 00).
// mid_stn_id: 중기전망 지점(109 서울·인천·경기, 133 대전·세종·충남, 143 대구·경북, 156 광주·전남, 159 부산·울산·경남, 184 제주)
// land_reg_id: 중기육상 광역구역, ta_reg_id: 중기기온 도시
export const MID_REGIONS = {
  108: { mid_stn_id: "109", land_reg_id: "11B00000", ta_reg_id: "11B10101" }, // 서울
  112: { mid_stn_id: "109", land_reg_id: "11B00000", ta_reg_id: "11B20201" }, // 인천
  119: { mid_stn_id: "109", land_reg_id: "11B00000", ta_reg_id: "11B20601" }, // 수원
  133: { mid_stn_id: "133", land_reg_id: "11C20000", ta_reg_id: "11C20401" }, // 대전
  143: { mid_stn_id: "143", land_reg_id: "11H10000", ta_reg_id: "11H10701" }, // 대구
  156: { mid_stn_id: "156", land_reg_id: "11F20000", ta_reg_id: "11F20501" }, // 광주
  159: { mid_stn_id: "159", land_reg_id: "11H20000", ta_reg_id: "11H20201" }, // 부산
  184: { mid_stn_id: "184", land_reg_id: "11G00000", ta_reg_id: "11G00201" }, // 제주
};

export const MID_KINDS = {
  KMA_MID_FCST: { op: "getMidFcst", param: "stnId", regionCol: "mid_stn_id" },
  KMA_MID_LAND: { op: "getMidLandFcst", param: "regId", regionCol: "land_reg_id" },
  KMA_MID_TA: { op: "getMidTa", param: "regId", regionCol: "ta_reg_id" },
};
const DELAY_MIN = 10; // 06시 발표를 06:10 이후에 조회(08:30 에 06시 발표 있음 확인)
const KST_MS = 9 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, "0");

// 지금 조회할 수 있는 발표시각(06·18시), 최근 hours 시간, 오래된 것부터. 기상청은 '최근 24시간'만 준다(그 이전은 03 또는 99).
export function midReleaseTimes(nowMs, hours = 36) {
  const out = [];
  const last = Math.floor((nowMs - DELAY_MIN * 60000 + KST_MS) / 3600000) * 3600000 - KST_MS;
  for (let t = last; t > nowMs - hours * 3600000; t -= 3600000) {
    const d = new Date(t + KST_MS);
    const h = d.getUTCHours();
    if (h === 6 || h === 18) out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(h)}:00:00`);
  }
  return out.reverse();
}

// item(한 발표·한 구역) → 행들. item_key 원래 이름(wf4Am, taMin4Low, wfSv …), metric(wf, taMinLow …), day_offset(4~10, 없으면 null), ampm(Am/Pm/'')
export function parseMidItem(dataset, item, region, tmFc) {
  const rows = [];
  for (const [k, v] of Object.entries(item || {})) {
    if (k === "regId" || k === "stnId" || v == null) continue;
    const m = /^([A-Za-z]+?)(\d+)([A-Za-z]*)$/.exec(k);
    let metric = k, day = null, ampm = "";
    if (m) {
      day = Number(m[2]);
      const suf = m[3];
      if (suf === "Am" || suf === "Pm") ampm = suf;
      metric = m[1] + (ampm ? "" : suf);
    }
    rows.push({ dataset, region_id: region, tm_fc: tmFc, item_key: k, metric, day_offset: day, ampm, value: String(v) });
  }
  return rows;
}

const BASE_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function readMidResponse(status, text) {
  // 99 "최대 조회 기간은 오늘 기준으로 1일 전까지" = 제공 기간 지남(실패 아님). 그 밖의 99 는 오류.
  try {
    const h = JSON.parse(text)?.response?.header;
    if (h?.resultCode === "99" && /조회 ?기간/.test(h.resultMsg || "")) return { none: "OUT_OF_RANGE" };
  } catch { /* 아래에서 처리 */ }
  return readForecastResponse(status, text);
}

export async function fetchMidRelease({ dataset, key, region, tmFc, fetchImpl = fetch, tries = 3, timeoutMs = 20000 }) {
  const k = MID_KINDS[dataset];
  const url = new URL(BASE_URL + k.op);
  const q = { serviceKey: key, numOfRows: 10, pageNo: 1, dataType: "JSON", [k.param]: region, tmFc: tmFc.slice(0, 10).replaceAll("-", "") + tmFc.slice(11, 13) + "00" };
  for (const [a, v] of Object.entries(q)) url.searchParams.set(a, String(v));
  for (let i = 1; ; i++) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      const r = readMidResponse(res.status, await res.text());
      if (r.none) return r;
      const item = r.items[0];
      if (!item) return { none: "EMPTY" };
      return { rows: parseMidItem(dataset, item, region, tmFc), raw: JSON.stringify(item) };
    } catch (e) {
      const retry = e?.retry !== false && (e?.retry || e?.name === "TimeoutError" || e?.name === "AbortError" || e instanceof TypeError);
      if (!retry || i >= tries) throw e;
      await sleep(1000 * i);
    }
  }
}

// store: { completedMid(dataset, fromTmFc) → Set('region|tmFc'), upsertMid(rows) → {inserted, updated}, markMid(dataset, region, tmFc, n, raw) }
export async function collectMid({ dataset, key, regions, store, nowMs = Date.now(), hours = 36, fetchImpl = fetch, log = () => {} }) {
  const bases = midReleaseTimes(nowMs, hours);
  const job = { dataset, from: bases[0] || null, to: bases[bases.length - 1] || null, received: 0, inserted: 0, updated: 0, chunks: 0, releases: 0, skipped: 0, none: 0, failed: 0, errors: [] };
  if (!bases.length) return job;
  const done = await store.completedMid(dataset, bases[0]);
  for (const tmFc of bases) for (const region of regions) {
    if (done.has(`${region}|${tmFc}`)) { job.skipped++; continue; }
    try {
      const r = await fetchMidRelease({ dataset, key, region, tmFc, fetchImpl });
      if (r.none) { job.none++; continue; }
      const u = await store.upsertMid(r.rows);
      await store.markMid(dataset, region, tmFc, r.rows.length, r.raw);
      job.received += r.rows.length; job.inserted += u.inserted; job.updated += u.updated; job.chunks++; job.releases++;
    } catch (e) {
      job.failed++;
      const msg = `${region} ${tmFc.slice(0, 16)}: ${e instanceof Error ? e.message : String(e)}`;
      if (job.errors.length < 5) job.errors.push(msg);
      log(msg);
    }
  }
  return job;
}
