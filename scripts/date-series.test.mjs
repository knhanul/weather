// 특정일 · 해마다 실제 날짜(date-series) 시험 — 손으로 확인할 수 있는 작은 합성 자료(운영 관측값 아님).
// 지키려는 것: (1) 그해 '실제 날짜'의 값만 쓴다(이웃 날짜를 섞지 않음) (2) 행이 없으면 대체하지 않고 null
//   (3) 설날 같은 음력 규칙도 그해 실제 양력 날짜를 따라간다 (4) 요약(평균·극값 연도·강수 횟수)이 점들로만 계산된다 (5) 범위 밖 제외
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore } from "../stats-engine.mjs";
import { seriesOf, seriesName } from "../date-series-api.mjs";
import { seedRows } from "../calendar-events.mjs";
import { resolveYear, parseDateSpec } from "../calendar-resolver.mjs";

const ctx = (o = {}) => ({ today: "2026-11-01", dailyFrom: "1970-01-01", dailyLast: "2026-10-31", hourlyFrom: "1990-01-01", hourlyLast: null, ...o });
const T = (avg, extra = {}) => ({ avg_temperature: avg, max_temperature: avg + 5, min_temperature: avg - 5, precipitation: null, avg_humidity: 60, avg_wind_speed: 2, ...extra });
const rowsOf = (list) => list.map(([date, o]) => ({ observation_date: date, ...o }));
const K = (i) => seedRows().filter((e) => e.kind === i);

test("수능: 해마다 다른 실제 시행일의 값을 쓴다(이웃 날짜 값과 섞이지 않음)", () => {
  // 2024학년도 수능 2023-11-16, 2025학년도 2024-11-14, 2026학년도 2025-11-13
  // 주변 날짜(시행일 하루 전·후)에 일부러 눈에 띄는 99 를 심어 둔다 — 섞이면 바로 보인다.
  const rows = rowsOf([
    ["2023-11-13", T(99)], ["2023-11-14", T(99)], ["2023-11-15", T(98)], ["2023-11-16", T(6)], ["2023-11-17", T(97)],
    ["2024-11-13", T(96)], ["2024-11-14", T(11)], ["2024-11-15", T(95)],
    ["2025-11-13", T(8)], ["2025-11-14", T(94)],
  ]);
  const store = buildDailyStore("108", rows);
  const r = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 2023, toYear: 2025 });
  assert.deepEqual(r.points.map((p) => p.solarDate), ["2023-11-16", "2024-11-14", "2025-11-13"]);
  assert.deepEqual(r.points.map((p) => p.yearLabel), ["2024학년도", "2025학년도", "2026학년도"]);
  assert.deepEqual(r.points.map((p) => p.values.avg), [6, 11, 8]);
  assert.deepEqual(r.points.map((p) => p.values.max), [11, 16, 13]);
  // 요약도 그 세 점만: 평균 (6+11+8)/3, 가장 더웠던 해 = 2024학년도(16℃)
  assert.equal(r.summary.avg.n, 3);
  assert.ok(Math.abs(r.summary.avg.mean - 25 / 3) < 1e-9);
  assert.deepEqual(r.summary.max.maxYears, [2024]);
  assert.deepEqual(r.summary.extremes.hottest.years, [2024]);
  assert.equal(r.summary.extremes.hottest.solarDate, "2024-11-14");
  // '월·일 고정'과 다르다는 것을 못 박는다: 11/13 고정이면 2023·2024 값이 99·96 이어야 한다
  const spec = parseDateSpec({ calendar: "solar", month: 11, day: 13 }).spec;
  assert.equal(resolveYear(spec, 2023).solarDate, "2023-11-13");
  assert.notEqual(r.points[0].values.avg, 99);
});

test("그해 행이 없으면 대체하지 않고 null(주변 날짜로도, 다른 해로도 채우지 않음)", () => {
  const rows = rowsOf([
    ["2023-11-16", T(6)],
    ["2023-11-15", T(77)], ["2023-11-17", T(78)], // 시행일 앞뒤 — 쓰면 안 된다
    // 2024-11-14 행 없음(그해 자료 없음)
    ["2025-11-13", T(8)],
  ]);
  const store = buildDailyStore("108", rows);
  const r = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 2023, toYear: 2025 });
  const p24 = r.points.find((p) => p.year === 2024);
  assert.equal(p24.dateStatus, "ok"); // 날짜는 정상(그해에 있는 날)
  assert.equal(p24.rowPresent, false);
  assert.equal(p24.values.max, null);
  assert.equal(p24.values.min, null);
  assert.equal(p24.values.avg, null);
  assert.equal(p24.values.rain, null);
  assert.equal(p24.rainNorm, "noRow");
  // 요약에서도 빠진다(0 으로 세지 않음)
  assert.equal(r.summary.avg.n, 2);
  assert.deepEqual(r.summary.avg.excludedYearsByReason.missing, [2024]);
  assert.equal(r.summary.excluded.length, 1);
  assert.equal(r.summary.excluded[0].year, 2024);
  assert.equal(r.summary.excluded[0].reason, "missing");
});

test("설날(음력 1/1): 그해 실제 양력 날짜를 따라간다", () => {
  // 음력 2024-01-01 = 2024-02-10, 음력 2025-01-01 = 2025-01-29 (KASI)
  const a = resolveYear(parseDateSpec({ calendar: "lunar", month: 1, day: 1 }).spec, 2024);
  const b = resolveYear(parseDateSpec({ calendar: "lunar", month: 1, day: 1 }).spec, 2025);
  assert.equal(a.solarDate, "2024-02-10");
  assert.equal(b.solarDate, "2025-01-29");
  const rows = rowsOf([
    ["2024-02-10", T(-1)], ["2024-02-09", T(88)], // 설날 전날은 섞이면 안 됨
    ["2025-01-29", T(0)], ["2025-01-28", T(87)],
    ["2024-01-29", T(86)], // 2024-01-29 는 2025 설날과 월·일이 같다(고정 월·일이었다면 이 값이 나왔을 것)
  ]);
  const store = buildDailyStore("108", rows);
  const r = seriesOf({ events: K("holiday"), store, ctx: ctx(), kind: "holiday", label: "설날", fromYear: 2024, toYear: 2025 });
  assert.deepEqual(r.points.map((p) => p.solarDate), ["2024-02-10", "2025-01-29"]);
  assert.deepEqual(r.points.map((p) => p.values.avg), [-1, 0]);
  assert.equal(r.series.name, "설날");
  assert.equal(r.series.label, "설날");
  // 추석도 이름으로 갈라진다
  const ch = seriesOf({ events: K("holiday"), store, ctx: ctx(), kind: "holiday", label: "추석", fromYear: 2024, toYear: 2025 });
  assert.equal(ch.points.length, 2);
  assert.deepEqual(ch.points.map((p) => p.solarDate), ["2024-09-17", "2025-10-06"]);
  assert.ok(ch.points.every((p) => p.rowPresent === false));
});

test("요약: 평균·최소·최대·극값 연도·강수 횟수가 점들로부터 계산된다(자료 없는 점은 제외)", () => {
  const rows = rowsOf([
    ["2021-11-18", T(3, { precipitation: 0 })],
    ["2022-11-17", T(9, { precipitation: 12.5 })],
    ["2023-11-16", T(-2, { precipitation: null })], // 공란 → 무강수 0
    ["2024-11-14", T(1.04, { precipitation: 0.1 })],
    ["2025-11-13", T(1.01, { precipitation: 0 })], // 1.04 와 1.01 은 표시 1자리로 같다 → 공동
  ]);
  const store = buildDailyStore("108", rows);
  const r = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 2021, toYear: 2025 });
  const S = r.summary;
  assert.equal(S.max.n, 5);
  assert.ok(Math.abs(S.max.mean - (8 + 14 + 3 + 6.04 + 6.01) / 5) < 1e-9);
  assert.equal(S.max.max, 14); // 2022 (avg 9)
  assert.deepEqual(S.max.maxYears, [2022]);
  assert.equal(S.min.min, -7); // 2023 (avg -2)
  assert.deepEqual(S.min.minYears, [2023]);
  // 강수: 0 / 12.5 / 0(공란) / 0.1 / 0 → 비 온 해 2번(2022·2024), 유효 5개 해
  assert.deepEqual(S.rainCount, { k: 2, n: 5, share: 40, hitYears: [2022, 2024] });
  assert.deepEqual(S.extremes.wettest.years, [2022]);
  assert.equal(S.extremes.wettest.value, 12.5);
  // 2024·2025 의 최고기온 1.04·1.01 → 표시 1자리 공동
  const hot = S.extremes.hottest;
  assert.deepEqual(hot.years, [2022]);
  const tied = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 2024, toYear: 2025 });
  assert.equal(tied.summary.extremes.hottest.value, 6.04);
  assert.equal(tied.summary.extremes.hottest.tie, true); // 6.04 와 6.01 → 표시 1자리 6.0 공동
  assert.deepEqual(tied.summary.extremes.hottest.years, [2024, 2025]);
  assert.equal(tied.summary.extremes.hottest.solarDate, "2024-11-14"); // 대표 점은 첫 점
});

test("범위 밖 이벤트는 버리고, 창 안에서 없는 해는 missingYears 로", () => {
  const rows = rowsOf([["1993-08-20", T(30)], ["1993-11-16", T(4)], ["1994-11-23", T(5)], ["2026-05-05", T(5)]]);
  const store = buildDailyStore("108", rows);
  // 수능 시드의 첫 해는 1993-08-20(1994학년도 1차)·1993-11-16(2차) — 1990~1992 창에는 수능이 없다
  const r = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 1990, toYear: 1994 });
  assert.ok(r.points.every((p) => p.year >= 1990 && p.year <= 1994));
  assert.deepEqual(r.points.map((p) => p.solarDate), ["1993-08-20", "1993-11-16", "1994-11-23"]);
  assert.deepEqual(r.missingYears, [1990, 1991, 1992]);
  // 같은 해 두 번(1994학년도 1·2차) → 연도 목록은 중복을 지우고, 점은 둘 다 남는다
  assert.equal(r.points.filter((p) => p.year === 1993).length, 2);
  assert.deepEqual(r.summary.avg.candidateYears, [1993, 1994]);
  assert.equal(r.summary.avg.n, 3);
  // 창 밖(2026 수능)은 들어오지 않는다
  const r2 = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 1990, toYear: 1994 });
  assert.ok(!r2.points.some((p) => p.solarDate === "2026-11-19"));
  assert.equal(r2.window.fromYear, 1990);
  assert.equal(r2.window.toYear, 1994);
  assert.equal(r2.window.dataFrom, 1993);
});

test("미래·자료 범위 밖은 값 없이 상태로 남고 요약에서 빠진다", () => {
  const store = buildDailyStore("108", rowsOf([["2025-11-13", T(8)]]));
  const r = seriesOf({ events: K("csat"), store, ctx: ctx({ today: "2026-11-01", dailyLast: "2025-12-31" }), kind: "csat", fromYear: 2025, toYear: 2026 });
  const p26 = r.points.find((p) => p.year === 2026);
  assert.equal(p26.solarDate, "2026-11-19");
  assert.equal(p26.dateStatus, "future");
  assert.equal(p26.values.max, null);
  assert.deepEqual(r.summary.max.excludedYearsByReason.future, [2026]);
  const old = seriesOf({ events: K("csat"), store, ctx: ctx({ dailyFrom: "2000-01-01" }), kind: "csat", fromYear: 1993, toYear: 1994 });
  assert.equal(old.points.find((p) => p.year === 1993).dateStatus, "unsupported");
  assert.deepEqual(old.summary.max.excludedYearsByReason.unsupported, [1993, 1994]); // 1994 시행일(1994-11-23)도 범위 밖
});

test("종류·이름 구분과 제목 문구", () => {
  const store = buildDailyStore("108", []);
  const csat = seriesOf({ events: K("csat"), store, ctx: ctx(), kind: "csat", fromYear: 2024, toYear: 2025 });
  assert.equal(csat.series.kind, "csat");
  assert.equal(csat.series.title, "수능일 날씨 — 2024~2025년"); // 제목 = 요청 창(양력 연도)
  assert.equal(csat.series.yearLabelRange, "2025학년도~2026학년도"); // 창 2024~2025 의 두 점
  assert.equal(seriesName("hakryeok", null), "학력고사일");
  assert.equal(seriesName("holiday", "추석"), "추석");
  const hak = seriesOf({ events: K("hakryeok"), store, ctx: ctx(), kind: "hakryeok", fromYear: 1981, toYear: 1983 });
  assert.ok(hak.points.every((p) => p.kind === "hakryeok"));
  // 이름이 없으면 kind 전체 — holiday 는 설날·추석 둘 다
  const all = seriesOf({ events: K("holiday"), store, ctx: ctx(), kind: "holiday", fromYear: 2024, toYear: 2025 });
  assert.equal(all.points.length, 4);
  assert.deepEqual([...new Set(all.points.map((p) => p.label))], ["설날", "추석"]);
  // 없는 이름은 빈 목록(오류 아님)
  const none = seriesOf({ events: K("holiday"), store, ctx: ctx(), kind: "holiday", label: "없는이름", fromYear: 2024, toYear: 2025 });
  assert.equal(none.points.length, 0);
  assert.deepEqual(none.missingYears, [2024, 2025]);
  assert.equal(none.summary.max.n, 0);
});
