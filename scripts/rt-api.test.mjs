import test from "node:test";
import assert from "node:assert/strict";
import { createRtApi, freshness, rainText, windDir } from "../rt-api.mjs";
import { createHourlyStore, addHourlyRows, buildDailyStore } from "../stats-engine.mjs";

const NOW = Date.UTC(2026, 9, 13, 10, 20); // 2026-10-13 19:20 KST
function fakes({ ncstLast = "2026-10-13 19:00:00" } = {}) {
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
  for (let h = 0; h <= +ncstLast.slice(11, 13); h++) for (const [c, v] of [["T1H", 16 + h / 10], ["REH", 70], ["RN1", "0"], ["WSD", 3], ["VEC", 250], ["PTY", 0]]) ncst.push({ base: `${ncstLast.slice(0, 10)} ${String(h).padStart(2, "0")}:00:00`, category: c, value: String(v) });
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
