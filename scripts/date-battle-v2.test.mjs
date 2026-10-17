// 날씨 배틀 v2(해마다 결과·횟수·누가 더·앞뒤 15일) — 손으로 확인할 수 있는 합성 자료
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore } from "../stats-engine.mjs";
import { parseDateSpec } from "../calendar-resolver.mjs";
import { battleV2, duplicatesV2 } from "../date-battle-engine.mjs";

const S = (m, d) => parseDateSpec({ calendar: "solar", month: m, day: d }).spec;
const ctx = { today: "2026-10-17", dailyFrom: "1970-01-01", dailyLast: "2026-10-16", hourlyFrom: "1990-01-01", hourlyLast: "2026-10-16" };
const ctxOf = () => ctx;
const T = (avg, extra = {}) => ({ avg_temperature: avg, max_temperature: avg + 5, min_temperature: avg - 5, precipitation: 0, avg_humidity: 60, avg_wind_speed: 2, ...extra });
const C = (id, spec, rows, year = 2021) => ({ id, stationId: "1", spec, year, store: buildDailyStore("1", rows) });
const dn = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const ymd = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
// 연속 일자료(from~to) f(date) → 행(null 이면 행 없음)
function span(from, to, f) { const out = []; for (let d = dn(from); d <= dn(to); d++) { const s = ymd(d); const v = f(s); if (v) out.push({ observation_date: s, ...v }); } return out; }

test("v2 해마다 결과: 같은 날 평균 없음, 횟수·누가 더(동률·결측 제외)", () => {
  // A 5/5: 2018 비 3mm, 2019 avg 20, 2020 avg 21 비, 2021 avg 22 / B 10/9: avg 15·20·21·18, 2019 비, 2021 강수 결측
  const ra = [[2018, 18, 3], [2019, 20, 0], [2020, 21, 5], [2021, 22, 0]].map(([y, a, p]) => ({ observation_date: `${y}-05-05`, ...T(a, { precipitation: p }) }));
  const rb = [[2018, 15, 0], [2019, 20, 1], [2020, 21, 0], [2021, 18, null]].map(([y, a, p]) => ({ observation_date: `${y}-10-09`, ...T(a, { precipitation: p, ...(p === null ? { avg_temperature: 18 } : {}) }) }));
  rb[3].precipitation = undefined; // 아래에서 결측으로
  const b = battleV2({ cases: [C("A", S(5, 5), ra), C("B", S(10, 9), rb.map((r, i) => (i === 3 ? { observation_date: r.observation_date, avg_temperature: null, max_temperature: null, min_temperature: null } : r)))], years: { fromYear: 2018, toYear: 2021 }, ctxOf });
  assert.equal(b.metrics, undefined); // 같은 날 평균 지표 없음
  assert.equal(b.yearly.length, 4);
  const avg = b.tallies.find((x) => x.id === "avg");
  assert.equal(avg.n, 3); // 2021 B 기온 없음 → 뺌
  assert.deepEqual(avg.results.map((r) => [r.case, r.k]), [["A", 1], ["B", 0]]);
  assert.equal(avg.ties, 2); // 2019 20=20, 2020 21=21
  const rain = b.counts.find((x) => x.id === "rain");
  assert.equal(rain.n, 3); // 2021 B 강수 자료 없음(행 있으나 기온도 없음 → 0 으로 세지 않음)
  assert.deepEqual(rain.results.map((r) => [r.case, r.k]), [["A", 2], ["B", 1]]);
  const rt = b.tallies.find((x) => x.id === "rain");
  assert.equal(rt.none, 0);
  assert.deepEqual(rt.results.map((r) => r.years), [[2018, 2020], [2019]]);
  assert.equal(b.chosen[0].solarDate, "2021-05-05");
});

test("v2 앞뒤 15일: 결측 1일 허용·2일이면 그 해 제외(모든 카드), 차이 %p", () => {
  // A: 2020·2021 창 모두 완전, 1일마다 비(1mm) → 강수일 100% / B: 2021 창 2일 빠짐 → 2021 공통 제외
  const ra = span("2020-04-15", "2021-05-25", (s) => T(20, { precipitation: 1 }));
  const rb = span("2020-09-20", "2021-10-30", (s) => (s === "2021-10-01" || s === "2021-10-02" ? null : T(10)));
  const b = battleV2({ cases: [C("A", S(5, 5), ra), C("B", S(10, 9), rb)], years: { fromYear: 2020, toYear: 2021 }, ctxOf });
  const m = b.around.metrics.rainDays;
  assert.deepEqual(m.validYears, [2020]);
  assert.deepEqual(m.excludedYears[2021], [{ case: "B", reason: "partial" }]);
  assert.equal(m.results[0].share, 100);
  assert.equal(m.results[1].share, 0);
  assert.equal(m.diffs[0].value, -100);
  assert.equal(m.diffUnit, "%p");
  const t = b.around.metrics.avg;
  assert.equal(t.results[0].mean - t.results[1].mean, 10);
});

test("v2 같은 조건: 지점·날짜·연도가 모두 같을 때만", () => {
  const c = (id, y) => ({ id, stationId: "1", spec: S(5, 5), year: y });
  assert.deepEqual(duplicatesV2([c("A", 2025), c("B", 2025)]), [["A", "B"]]);
  assert.deepEqual(duplicatesV2([c("A", 2025), c("B", 2024)]), []);
});
