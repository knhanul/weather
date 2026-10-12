// 기상청 단기예보 적재(kma-forecast.mjs): 격자 변환, 발표시각, 응답 해석, 수집(페이지·재시도·건너뛰기·실패 집계)
import { test } from "node:test";
import assert from "node:assert/strict";
import { latLonToGrid, releaseTimes, parseForecastItems, readForecastResponse, collectForecast } from "../kma-forecast.mjs";
import { STATION_COORDS } from "../station-coords.mjs";

const kst = (s) => Date.parse(s.replace(" ", "T") + "+09:00");

test("grid: 서울(108) = 60,127 and all stations map into the KMA grid", () => {
  assert.deepEqual(latLonToGrid(STATION_COORDS[108].latitude, STATION_COORDS[108].longitude), { nx: 60, ny: 127 });
  assert.deepEqual(latLonToGrid(37.5665, 126.978), { nx: 60, ny: 127 }); // 서울시청
  const want = { 112: [54, 125], 119: [60, 120], 133: [67, 101], 143: [90, 91], 156: [59, 75], 159: [97, 74], 184: [53, 38] };
  for (const [id, [nx, ny]] of Object.entries(want)) assert.deepEqual(latLonToGrid(STATION_COORDS[id].latitude, STATION_COORDS[id].longitude), { nx, ny }, id);
});

test("release times: 단기 8회/일, 초단기예보 HH30, 실황 HH00, 제공 지연 반영", () => {
  const v = releaseTimes("KMA_VILAGE_FCST", kst("2026-10-12 23:05"), 24);
  assert.equal(v.length, 7); // 23:05 기준 지난 24시간 안: 02~20시 (23시 발표는 아직, 어제 23시는 24시간 밖)
  assert.equal(v[0], "2026-10-12 02:00:00");
  assert.equal(releaseTimes("KMA_VILAGE_FCST", kst("2026-10-12 23:05"), 25)[0], "2026-10-11 23:00:00");
  assert.equal(v.at(-1), "2026-10-12 20:00:00"); // 23:00 발표는 23:10 이후
  assert.equal(releaseTimes("KMA_VILAGE_FCST", kst("2026-10-12 23:15"), 24).at(-1), "2026-10-12 23:00:00");
  const u = releaseTimes("KMA_ULTRA_FCST", kst("2026-10-12 23:50"), 24);
  assert.equal(u.length, 24);
  assert.equal(u.at(-1), "2026-10-12 23:30:00");
  assert.ok(u.every((b) => b.endsWith(":30:00")));
  const n = releaseTimes("KMA_ULTRA_NCST", kst("2026-10-12 23:15"), 24);
  assert.equal(n.at(-1), "2026-10-12 23:00:00");
  assert.equal(n[0], "2026-10-12 00:00:00"); // 24시간 전(어제 23시)은 기상청이 주지 않음 → 넣지 않는다
  assert.ok(n.every((b) => b.endsWith(":00:00")));
});

test("parse: values kept as strings, raw = original item", () => {
  const it = { baseDate: "20261012", baseTime: "2000", category: "PCP", fcstDate: "20261012", fcstTime: "2100", fcstValue: "강수없음", nx: 60, ny: 127 };
  const [r] = parseForecastItems("KMA_VILAGE_FCST", [it]);
  assert.deepEqual({ ...r, raw: JSON.parse(r.raw) }, { nx: 60, ny: 127, base_datetime: "2026-10-12 20:00:00", fcst_datetime: "2026-10-12 21:00:00", category: "PCP", value: "강수없음", raw: it });
  const [n] = parseForecastItems("KMA_ULTRA_NCST", [{ baseDate: "20261012", baseTime: "2200", category: "T1H", obsrValue: "21.3", nx: 60, ny: 127 }]);
  assert.equal(n.value, "21.3");
  assert.equal(n.fcst_datetime, undefined);
  assert.equal(n.base_datetime, "2026-10-12 22:00:00");
});

test("response: 00 ok, 03/10 = none (not failure), gateway/HTTP/other codes throw", () => {
  const ok = readForecastResponse(200, JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: 1, items: { item: { category: "T1H" } } } } }));
  assert.equal(ok.items.length, 1);
  assert.equal(readForecastResponse(200, JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } })).none, "NO_DATA");
  assert.equal(readForecastResponse(200, JSON.stringify({ response: { header: { resultCode: "10", resultMsg: "최근 1일" } } })).none, "OUT_OF_RANGE");
  assert.throws(() => readForecastResponse(200, JSON.stringify({ response: { header: { resultCode: "22", resultMsg: "LIMITED" } } })), /22/);
  assert.throws(() => readForecastResponse(403, "Forbidden"), /Forbidden/);
  assert.throws(() => readForecastResponse(403, JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE ERROR", returnReasonCode: "30" } } })), /SERVICE ERROR.*30/);
  assert.throws(() => readForecastResponse(500, "{}"), /HTTP 500/);
});

function fakeKma({ total = 1016, failFirst = new Set(), alwaysFail = new Set(), none = new Set() } = {}) {
  const calls = [];
  const seen = new Map();
  const fetchImpl = async (url) => {
    const p = Object.fromEntries(url.searchParams);
    const id = `${p.nx},${p.ny},${p.base_date}${p.base_time}`;
    calls.push({ ...p });
    const n = (seen.get(id) || 0) + 1; seen.set(id, n);
    const body = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (alwaysFail.has(id)) return { status: 200, text: async () => "<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED</OpenAPI_ServiceResponse>" };
    if (failFirst.has(id) && n === 1) throw new TypeError("fetch failed");
    if (none.has(id)) return body({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } });
    const page = Number(p.pageNo), size = Number(p.numOfRows);
    const count = Math.max(0, Math.min(size, total - (page - 1) * size));
    const item = Array.from({ length: count }, (_, i) => ({ baseDate: p.base_date, baseTime: p.base_time, category: `C${(page - 1) * size + i}`, fcstDate: p.base_date, fcstTime: "0100", fcstValue: "1", nx: Number(p.nx), ny: Number(p.ny) }));
    return body({ response: { header: { resultCode: "00" }, body: { totalCount: total, items: { item } } } });
  };
  return { fetchImpl, calls };
}
function memStore(done = []) {
  const rows = new Map(), rel = new Map();
  for (const d of done) rel.set(d, 1);
  return {
    rows, rel,
    completedReleases: async () => new Set(rel.keys()),
    upsert: async (_ds, list) => { let inserted = 0, updated = 0; for (const r of list) { const k = [r.nx, r.ny, r.base_datetime, r.fcst_datetime, r.category].join("|"); rows.has(k) ? updated++ : inserted++; rows.set(k, r); } return { inserted, updated }; },
    markRelease: async (_ds, g, base, n) => { rel.set(`${g.nx}|${g.ny}|${base}`, n); },
  };
}

test("collect: pages through 1000+ rows, skips completed releases, retries network errors, counts failures", async () => {
  const now = kst("2026-10-12 23:20");
  const grids = [{ nx: 60, ny: 127 }, { nx: 98, ny: 76 }];
  const store = memStore(["60|127|2026-10-12 20:00:00"]);
  const { fetchImpl, calls } = fakeKma({ failFirst: new Set(["60,127,202610122300"]), alwaysFail: new Set(["98,76,202610121700"]), none: new Set(["98,76,202610122300"]) });
  const r = await collectForecast({ dataset: "KMA_VILAGE_FCST", key: "k", grids, store, nowMs: now, hours: 7, fetchImpl });
  // 7시간: 17,20,23시 발표 × 2격자 = 6, 그중 1 이미 받음
  assert.equal(r.skipped, 1);
  assert.equal(r.releases, 3);
  assert.equal(r.none, 1);
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /98,76 2026-10-12 17:00/);
  assert.equal(r.received, 3 * 1016);
  assert.equal(r.inserted, 3 * 1016);
  assert.equal(store.rel.get("60|127|2026-10-12 23:00:00"), 1016);
  assert.ok(!store.rel.has("98|76|2026-10-12 17:00:00")); // 실패한 발표는 완료 기록을 남기지 않아 다음 실행에서 다시 받는다
  assert.ok(calls.some((c) => c.pageNo === "2" && c.numOfRows === "1000"));
  // 다시 돌리면 남은 것(실패·아직 없음)만 다시 시도
  const again = fakeKma();
  const r2 = await collectForecast({ dataset: "KMA_VILAGE_FCST", key: "k", grids, store, nowMs: now, hours: 7, fetchImpl: again.fetchImpl });
  assert.equal(r2.skipped, 4);
  assert.equal(r2.releases, 2);
  assert.equal(r2.failed, 0);
});
