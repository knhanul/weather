import test from "node:test";
import assert from "node:assert/strict";
import { createRtApi, freshness, rainText, windDir } from "../rt-api.mjs";
import { createHourlyStore, addHourlyRows, buildDailyStore } from "../stats-engine.mjs";

const NOW = Date.UTC(2026, 9, 13, 10, 20); // 2026-10-13 19:20 KST
function fakes({ ncstLast = "2026-10-13 19:00:00", noRain = false } = {}) {
  const hrows = [], drows = [];
  for (let y = 1990; y <= 2026; y++) for (let d = 1; d <= 31; d++) {
    const day = `${y}-10-${String(d).padStart(2, "0")}`;
    if (y === 2026 && d > 12) continue;
    for (let h = 0; h < 24; h++) hrows.push({ observation_datetime: `${day} ${String(h).padStart(2, "0")}:00:00`, temperature: 15, humidity: 60, wind_speed: 2 });
    drows.push({ observation_date: day, max_temperature: 20, min_temperature: 10, avg_temperature: 15 });
  }
  const hs = createHourlyStore("108", 2026);
  addHourlyRows(hs, hrows);
  const ds = buildDailyStore("108", drows);
  const ncst = [];
  for (let h = 0; h <= +ncstLast.slice(11, 13); h++) for (const [c, v] of [["T1H", 16 + h / 10], ["REH", 70], ...(noRain ? [] : [["RN1", "0"]]), ["WSD", 3], ["VEC", 250], ["PTY", 0]]) ncst.push({ base: `${ncstLast.slice(0, 10)} ${String(h).padStart(2, "0")}:00:00`, category: c, value: String(v) });
  const rt = {
    gridOf: async () => ({ nx: 60, ny: 127 }),
    ncst: async (nx, ny, a, b) => ncst.filter((r) => r.base >= a && r.base <= b),
    latestRelease: async (ds) => (ds === "KMA_ULTRA_FCST" ? { base: "2026-10-13 18:30:00" } : { base: "2026-10-13 17:00:00" }),
    fcst: async (ds, nx, ny, base) => {
      const out = [];
      if (ds === "KMA_ULTRA_FCST") for (let h = 19; h <= 23; h++) out.push({ base, fcst: `2026-10-13 ${h}:00:00`, category: "T1H", value: "17" });
      else for (let h = 18; h <= 23; h++) { out.push({ base, fcst: `2026-10-13 ${h}:00:00`, category: "TMP", value: "12" }); out.push({ base, fcst: `2026-10-13 ${h}:00:00`, category: "POP", value: "30" }); }
      return out;
    },
    dayExtremes: async () => ({ TMX: { value: "21.0", base: "2026-10-13 05:00:00" } }),
    extremesAll: async () => [],
    midItems: async () => [],
  };
  const api = createRtApi({ rt, statsHourly: { get: async () => hs, version: () => 1 }, statsData: { get: async () => ds, version: () => 1 }, stations: async () => [{ station_id: "108", station_name: "서울" }], json: (res, b, s = 200) => { res.body = b; res.status = s; }, now: () => NOW });
  return api;
}
async function call(api, path) {
  const res = {};
  await api({ method: "GET" }, res, new URL(`http://x${path}`));
  return res;
}

test("today: 실황이 최신, 예보는 실황 이후 시각에만, 초단기 > 단기 우선", async () => {
  const r = (await call(fakes(), "/api/rt/today?station=108")).body;
  assert.equal(r.current.time, "2026-10-13 19:00:00");
  assert.equal(r.current.freshness.state, "fresh");
  assert.equal(r.current.values.ta, 17.9);
  const all = r.current.compare.ta[0];
  assert.equal(all.range, "1990~2025");
  assert.equal(all.mean, 15);
  assert.equal(all.diff, 2.9);
  assert.equal(r.hours[19].obs, 17.9);
  assert.equal(r.hours[19].fcst, null); // 관측이 있는 시각은 예보로 덮지 않음
  assert.equal(r.hours[20].fcst, 17);
  assert.equal(r.hours[20].fcstSource, "초단기예보");
  assert.equal(r.hours[20].obs, null);
  assert.equal(r.hours[5].base.r5, 15);
  assert.equal(r.day.max.value, 21);
  assert.equal(r.day.max.compare[0].mean, 20);
  assert.equal(r.day.min.value, null); // 예보가 없으면 만들지 않음
  assert.ok(r.stories.length >= 1);
  assert.ok(r.stories.every((s) => !/NaN|undefined|null/.test(s.text)));
});

test("today: 실황이 늦으면 지연 표시, 이야기에서 '지금' 문장 안 만듦", async () => {
  const r = (await call(fakes({ ncstLast: "2026-10-13 15:00:00" }), "/api/rt/today?station=108")).body;
  assert.equal(r.current.freshness.state, "stale");
  assert.ok(!r.stories.some((s) => s.id === "now-temp"));
});

test("baseline API: 검증·응답", async () => {
  const api = fakes();
  const r = (await call(api, "/api/rt/baseline?station=108&date=2026-10-13&hour=15&field=ta&value=18")).body;
  assert.deepEqual(r.periods.map((p) => p.range), ["1990~2025", "2016~2025", "2021~2025"]);
  assert.equal(r.periods[0].diff, 3);
  assert.equal(r.periods[0].validYears, 36);
  const bad = await call(api, "/api/rt/baseline?station=999");
  assert.equal(bad.status, 400);
  const d = (await call(api, "/api/rt/baseline?station=108&date=2026-10-13&daily=max")).body;
  assert.equal(d.periods[1].mean, 20);
});

test("도움 함수", () => {
  assert.equal(freshness("2026-10-13 19:00:00", NOW, 90).state, "fresh");
  assert.equal(freshness("2026-10-13 16:00:00", NOW, 90).state, "stale");
  assert.equal(freshness(null, NOW, 90).state, "none");
  assert.deepEqual(rainText("강수없음"), { mm: 0, text: "강수 없음" });
  assert.equal(rainText("1mm 미만").mm, null);
  assert.equal(windDir(250), "서남서풍");
});

test("now: today 의 앞부분과 같은 값(히어로 먼저), 없는 칸은 안 줌", async () => {
  const api = fakes();
  const n = (await call(api, "/api/rt/now?station=108")).body;
  const t = (await call(api, "/api/rt/today?station=108")).body;
  assert.equal(n.part, "now");
  for (const k of ["now", "date", "station", "periods", "grid", "current", "day", "method"]) assert.deepEqual(n[k], t[k], k);
  assert.equal(n.hours, undefined);
  const n2 = (await call(api, "/api/rt/now?station=108")).body; // today 캐시에서 자른 값도 같음
  assert.deepEqual(n2.current, t.current);
});
test("ETag: 같은 본문이면 304, 캐시 머리글", async () => {
  const api = fakes();
  const mkRes = () => { const r = { h: null, code: 0, body: "" }; r.writeHead = (c, h) => { r.code = c; r.h = h; }; r.end = (b) => { r.body = b || ""; }; return r; };
  const r1 = mkRes();
  await api({ method: "GET", headers: {} }, r1, new URL("http://x/api/rt/today?station=108"));
  assert.equal(r1.code, 200);
  assert.match(r1.h.etag, /^W\/"/);
  assert.match(r1.h["cache-control"], /max-age=30/);
  const r2 = mkRes();
  await api({ method: "GET", headers: { "if-none-match": r1.h.etag } }, r2, new URL("http://x/api/rt/today?station=108"));
  assert.equal(r2.code, 304);
  assert.equal(r2.body, "");
});

test("life: 강수 자료가 없으면 러닝 '판단 보류'(좋음 아님), 있으면 조건 판정", async () => {
  const r = (await call(fakes({ noRain: true }), "/api/rt/life?station=108")).body;
  const run = r.items.find((x) => x.id === "running");
  assert.equal(run.judgement, "unknown");
  assert.equal(run.answer, "강수 자료가 없어 판단 보류");
  assert.equal(run.checks.find((c) => c.id === "rain").status, "unknown");
  const ok = (await call(fakes(), "/api/rt/life?station=108")).body.items.find((x) => x.id === "running");
  assert.equal(ok.judgement, "pass"); // 17.9℃, RN1 0(값), 3m/s
  assert.equal(ok.answer, "선택한 날씨 조건에 맞음");
  const hs = (await call(fakes(), "/api/rt/life?station=108")).body.items.find((x) => x.id === "heat-start");
  assert.equal(hs.homeEligible, false); // 30℃ 넘은 날 없음 → 홈 후보 아님
});

test("regions: 비교 가능한 지점 수·두 순위·동률·예전 이름 유지", async () => {
  const r = (await call(fakes(), "/api/rt/regions")).body;
  assert.equal(r.comparable, 1);
  assert.equal(r.time, "2026-10-13 19:00:00");
  assert.equal(r.rankAboveAvg[0].of, 1);
  assert.deepEqual(r.rankAnomaly, r.rankAboveAvg);
  assert.ok(Array.isArray(r.rankDeviation));
  assert.ok(r.rankings.r5);
  assert.match(r.note, /비교 가능한 1개 지점/);
});

test("stories: 이야기 객체 계약 필드 + 빈 이야기 사유, 지역 이야기는 6개 지점 미만이면 뺌", async () => {
  const r = (await call(fakes(), "/api/rt/stories?station=108")).body;
  assert.ok(r.rulesVersion);
  assert.ok("emptyReason" in r);
  for (const s of r.stories) {
    assert.equal(s.schemaVersion, 1);
    assert.ok(s.ruleId && s.eventId && s.templateId && s.evidence && s.facts);
    assert.ok(!/NaN|undefined|null/.test(`${s.title} ${s.text}`));
  }
  if (!r.stories.length) assert.ok(["normal", "insufficient", "stale", "error"].includes(r.emptyReason));
  const reg = r.dropped.find((x) => x.key === "region-anomaly");
  if (reg) assert.match(reg.reason, /비교 가능한 지점|표본|이례성/);
  const st = (await call(fakes({ ncstLast: "2026-10-13 15:00:00" }), "/api/rt/stories?station=108")).body;
  if (!st.stories.length) assert.equal(st.emptyReason, "stale");
});

test("stories 2판: 새 규칙 진단(13개)·선별 점수 식·탐색 카드·지금 비 이야기는 rain1h 대신 R04", async () => {
  const r = (await call(fakes(), "/api/rt/stories?station=108")).body;
  assert.equal(Object.keys(r.rules).length, 13);
  assert.match(r.rule.text, /0\.35U \+ 0\.35A/);
  assert.ok(!r.dropped.some((x) => /^rain1h/.test(x.key)) && !r.stories.some((x) => /^rain1h/.test(x.key)));
  assert.ok(r.exploreAlt && /이맘때의 하루|오늘과 닮은 날/.test(r.exploreAlt.title));
  if (r.emptyReason === "normal") assert.ok(r.explore);
  else assert.equal(r.explore, null);
  for (const s of r.stories) assert.ok(typeof s.method === "string" && s.method.length > 10, s.key);
  // 같은 발행 구간에 다시 불러도 같은 이야기(이력이 같은 날 점수를 흔들지 않음)
  const api = fakes();
  const a = (await call(api, "/api/rt/stories?station=108")).body;
  const b = (await call(api, "/api/rt/stories?station=108")).body;
  assert.deepEqual(a.stories.map((x) => [x.key, x.score]), b.stories.map((x) => [x.key, x.score]));
});

test("life 더위 시작: 완전한 시즌 기준 필드(completeSeasons·statusText)", async () => {
  const r = (await call(fakes(), "/api/rt/life?station=108")).body;
  const h = r.items.find((x) => x.id === "heat-start");
  for (const p of h.periods) { assert.ok("completeSeasons" in p); assert.equal(p.method, "complete-seasons"); }
});
