// 날짜로 보는 날씨·날씨 배틀 순수 함수 테스트 — 손으로 확인할 수 있는 작은 합성 자료(운영 관측값 아님)
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore, createHourlyStore, addHourlyRows } from "../stats-engine.mjs";
import { parseDateSpec } from "../calendar-resolver.mjs";
import { dateWeather, windowYears, summarize, quantile, SAMPLE_POLICY, allFromYear } from "../date-weather-engine.mjs";
import { battle, compareValues, BATTLE_METRICS, battleYear } from "../date-battle-engine.mjs";

const S = (m, d) => parseDateSpec({ calendar: "solar", month: m, day: d }).spec;
const L = (m, d, leap = false) => parseDateSpec({ calendar: "lunar", month: m, day: d, leap }).spec;
const ctx = (o = {}) => ({ today: "2026-10-17", dailyFrom: "1970-01-01", dailyLast: "2026-10-16", hourlyFrom: "1990-01-01", hourlyLast: "2026-10-16", ...o });
// 일자료 행: 10/17 은 해마다 avg = (연도-2000), 10/16·10/18 은 99(섞이면 바로 보임)
function dayRows(years, f) {
  const rows = [];
  for (const y of years) for (const [md, v] of Object.entries(f(y))) if (v) rows.push({ observation_date: `${y}-${md}`, ...v });
  return rows;
}
const T = (avg, extra = {}) => ({ avg_temperature: avg, max_temperature: avg + 5, min_temperature: avg - 5, precipitation: null, avg_humidity: 60, avg_wind_speed: 2, ...extra });

test("양력 임의 날짜·최근 10년: 정확히 그 월·일만, 기간 고정", () => {
  const yrs = Array.from({ length: 12 }, (_, i) => 2014 + i);
  const store = buildDailyStore("1", dayRows(yrs, (y) => ({ "10-16": T(99), "10-17": T(y - 2000), "10-18": T(99) })));
  const years = windowYears({ mode: "recent", years: 10, toYear: 2025 });
  assert.deepEqual(years, { fromYear: 2016, toYear: 2025 });
  const r = dateWeather({ spec: S(10, 17), store, ctx: ctx(), years, part: "daily" });
  const a = r.daily.metrics.avg;
  assert.equal(a.n, 10);
  assert.equal(a.mean, 20.5); // (16+…+25)/10
  assert.deepEqual(a.maxYears, [2025]);
  // 선택 연도 변경: 평균 그대로, 선택 행만 바뀜
  const r2 = dateWeather({ spec: S(10, 17), store, ctx: ctx(), years, selectedYears: [2004], part: "daily" });
  assert.equal(r2.daily.metrics.avg.mean, 20.5);
  assert.equal(r2.selected[0].referenceYear, 2004);
  assert.equal(r2.selected[0].dateStatus, "ok");
  assert.equal(r2.selected[0].rowPresent, false); // 그해 행 없음 → 자료 없음(다른 해로 이동 안 함)
});

test("강수: 정상 0 / 공란 무강수 / 기온도 없는 공란 / 행 없음 구분, 식 일치", () => {
  const rows = [
    { observation_date: "2021-10-17", ...T(10, { precipitation: 0 }) }, // 정상 0
    { observation_date: "2022-10-17", ...T(10, { precipitation: null }) }, // 공란 → 무강수 0
    { observation_date: "2023-10-17", avg_temperature: null, max_temperature: null, min_temperature: null, precipitation: null }, // 모두 공란 → 자료 없음
    { observation_date: "2024-10-17", ...T(10, { precipitation: 12.5 }) },
    { observation_date: "2025-10-17", ...T(10, { precipitation: 0.1 }) },
    // 2020 행 없음
  ];
  const store = buildDailyStore("1", rows);
  const r = dateWeather({ spec: S(10, 17), store, ctx: ctx(), years: { fromYear: 2020, toYear: 2025 }, part: "daily" });
  const rn = r.daily.metrics.rain;
  assert.equal(rn.n, 4);
  assert.deepEqual(rn.validYears, [2021, 2022, 2024, 2025]);
  assert.deepEqual(rn.excludedYearsByReason.missing, [2020, 2023]);
  assert.equal(rn.eligible, 6); // 결측은 eligible 에 남는다(관측률을 부풀리지 않음)
  assert.equal(rn.k, 2);
  assert.equal(rn.share, 50);
  assert.equal(rn.total, 12.6);
  assert.ok(Math.abs(rn.mean * rn.n - rn.total) < 1e-9);
  assert.equal(rn.limited, true); // 4/6 < 80%
  const norm = Object.fromEntries(r.daily.rows.map((x) => [x.referenceYear, x.rainNorm]));
  assert.deepEqual(norm, { 2020: "noRow", 2021: "value", 2022: "blank0", 2023: "missing", 2024: "value", 2025: "value" });
});

test("2월 29일: 윤년만, 없는 해는 결측·무강수로 세지 않음", () => {
  const rows = [2016, 2020, 2024].map((y) => ({ observation_date: `${y}-02-29`, ...T(1, { precipitation: y === 2020 ? 3 : null }) }));
  const store = buildDailyStore("1", rows);
  const r = dateWeather({ spec: S(2, 29), store, ctx: ctx(), years: { fromYear: 2016, toYear: 2025 }, part: "daily" });
  const rn = r.daily.metrics.rain;
  assert.equal(rn.n, 3);
  assert.equal(rn.eligible, 3);
  assert.equal(rn.excludedYearsByReason.nodate.length, 7);
  assert.equal(rn.excludedYearsByReason.missing, undefined);
  assert.ok(r.stories.some((s) => s.id === "D-exist" && s.text.includes("10개 해 중 3개 해")));
});

test("미래·오늘 진행 중·수집 대기·자료 미제공은 완료 표본에서 제외", () => {
  const store = buildDailyStore("1", dayRows([1969, 1970, 2024, 2025, 2026], (y) => ({ "10-17": T(1), "10-16": T(1), "10-18": T(1) })));
  const c = ctx({ dailyLast: "2026-10-15" });
  const a = dateWeather({ spec: S(10, 17), store, ctx: c, years: { fromYear: 2026, toYear: 2026 }, part: "daily" });
  assert.deepEqual(a.daily.metrics.avg.excludedYearsByReason, { ongoing: [2026] });
  const b = dateWeather({ spec: S(10, 18), store, ctx: c, years: { fromYear: 2025, toYear: 2026 }, part: "daily" });
  assert.deepEqual(b.daily.metrics.avg.excludedYearsByReason, { future: [2026] });
  assert.equal(b.daily.metrics.avg.n, 1);
  assert.equal(b.daily.metrics.avg.tier, "reference");
  const p = dateWeather({ spec: S(10, 16), store, ctx: c, years: { fromYear: 2026, toYear: 2026 }, part: "daily" });
  assert.deepEqual(p.daily.metrics.avg.excludedYearsByReason, { pending: [2026] }); // 지났지만 DB 미적재 → 미래 아님
  const u = dateWeather({ spec: S(10, 17), store, ctx: c, years: { fromYear: 1969, toYear: 1970 }, part: "daily" });
  assert.deepEqual(u.daily.metrics.avg.excludedYearsByReason, { unsupported: [1969] });
});

test("음력 평달·윤달은 별개 날짜, 윤달 없는 해는 대체 없음, 연말은 다음 양력 해", () => {
  // 음력 6/1: 2025 평달 = 2025-06-25, 윤6/1 = 2025-07-25 (KASI)
  const store = buildDailyStore("1", [{ observation_date: "2025-06-25", ...T(20) }, { observation_date: "2025-07-25", ...T(28) }, { observation_date: "2024-07-06", ...T(25) }]);
  const leap = dateWeather({ spec: L(6, 1, true), store, ctx: ctx(), years: { fromYear: 2024, toYear: 2025 }, part: "daily" });
  assert.equal(leap.daily.metrics.avg.n, 1);
  assert.equal(leap.daily.metrics.avg.mean, 28);
  assert.deepEqual(leap.daily.metrics.avg.excludedYearsByReason, { nodate: [2024] });
  const normal = dateWeather({ spec: L(6, 1), store, ctx: ctx(), years: { fromYear: 2025, toYear: 2025 }, part: "daily" });
  assert.equal(normal.daily.metrics.avg.mean, 20);
  const ye = dateWeather({ spec: L(12, 29), store: buildDailyStore("1", [{ observation_date: "2026-02-16", ...T(-3) }]), ctx: ctx(), years: { fromYear: 2025, toYear: 2025 }, part: "daily" });
  assert.equal(ye.daily.rows[0].referenceYear, 2025);
  assert.equal(ye.daily.rows[0].solarDate, "2026-02-16");
  assert.equal(ye.daily.metrics.avg.mean, -3);
});

function hourRows(date, f) {
  const out = [];
  for (let h = 0; h < 24; h++) { const r = f(h); if (r) out.push({ observation_datetime: `${date} ${String(h).padStart(2, "0")}:00:00`, ...r }); }
  return out;
}
test("시간자료: 시각별 표본·결측 끊김·강수 구간(h~h+1 = h+1시 값)·QC·밴드 N≥10", () => {
  const hs = createHourlyStore("1", 2026);
  for (let y = 2010; y <= 2021; y++) {
    addHourlyRows(hs, hourRows(`${y}-10-17`, (h) => (y === 2021 && h === 5 ? null : { temperature: h + (y - 2010), precipitation: h === 14 ? 2 : null, wind_speed: 1, humidity: 50, ta_qcflg: y === 2020 && h === 6 ? "9" : "0", rn_qcflg: null })));
    addHourlyRows(hs, hourRows(`${y}-10-18`, (h) => (h === 0 ? { temperature: 0, precipitation: 0.5, wind_speed: 1, humidity: 50 } : null)));
  }
  const store = buildDailyStore("1", []);
  const r = dateWeather({ spec: S(10, 17), store, hs, ctx: ctx(), years: { fromYear: 2010, toYear: 2021 }, selectedYears: [2021], part: "hourly" });
  const ta = r.hourly.metrics.ta.hours;
  assert.equal(ta[0].n, 12);
  assert.equal(ta[0].mean, 5.5); // 0..11 평균
  assert.equal(ta[5].n, 11); // 2021 05시 행 없음
  assert.equal(ta[6].n, 11); // 2020 06시 QC 9
  assert.equal(ta[6].excluded.qc, 1);
  assert.ok(ta[0].p10 != null && ta[0].p90 != null); // N=12 ≥ 10, 관측률 100%
  assert.ok(ta[5].p10 != null); // N=11, 11/12 = 92% → 밴드 표시
  const r9 = dateWeather({ spec: S(10, 17), store, hs, ctx: ctx(), years: { fromYear: 2013, toYear: 2021 }, part: "hourly" });
  assert.equal(r9.hourly.metrics.ta.hours[0].n, 9);
  assert.equal(r9.hourly.metrics.ta.hours[0].p10, null); // N=9 < 10 → 밴드 없음
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0.1), 2); // R-7: (11−1)×0.1 = 1 → 2
  const rn = r.hourly.metrics.rn.hours;
  assert.equal(rn[13].mean, 2); // 13~14시 = 14시 값
  assert.equal(rn[14].mean, 0); // 14~15시: 15시 공란 → 무강수 0
  assert.equal(rn[23].mean, 0.5); // 23~24시 = 다음날 00시 값
  assert.equal(r.hourly.selected[0].series.ta[5], null);
  assert.equal(r.hourly.selected[0].cellStatus.ta[5], "missing");
  assert.equal(r.hourly.heat.length, 12);
});

// ---------------------------------------------------------------- 배틀
const ctxOf = () => ctx();
const C = (id, spec, rows, stationId = "1") => ({ id, stationId, spec, store: buildDailyStore(stationId, rows) });
test("배틀: 지표별 공통 연도만(A 의 2020 풍속 없으면 B 의 2020 풍속도 제외, 기온은 사용)", () => {
  const ra = [2018, 2019, 2020, 2021].map((y) => ({ observation_date: `${y}-05-05`, ...T(20, { avg_wind_speed: y === 2020 ? null : 3 }) }));
  const rb = [2018, 2019, 2020, 2021].map((y) => ({ observation_date: `${y}-10-09`, ...T(15, { avg_wind_speed: 1 }) }));
  const r = battle({ cases: [C("A", S(5, 5), ra), C("B", S(10, 9), rb)], years: { fromYear: 2018, toYear: 2021 }, ctxOf });
  assert.equal(r.metrics.avg.n, 4);
  assert.equal(r.metrics.wind.n, 3);
  assert.deepEqual(r.metrics.wind.excludedYears[2020], [{ case: "A", reason: "missing" }]);
  assert.equal(r.metrics.avg.comparison.text, "A가 B보다 5.0℃ 높음");
  assert.equal(r.metrics.avg.comparison.badges, true);
  assert.equal(r.metrics.wind.comparison.text, "A가 B보다 2.0m/s 강함");
});
test("배틀: 강수일수·비율·평균·누적은 같은 공통 N, 식 일치", () => {
  const ra = [2018, 2019, 2020, 2021].map((y, i) => ({ observation_date: `${y}-05-05`, ...T(20, { precipitation: [0, 4, null, 10][i] }) }));
  const rb = [2018, 2019, 2020].map((y, i) => ({ observation_date: `${y}-10-09`, ...T(15, { precipitation: [1, null, 0.1][i] }) })); // 2021 행 없음
  const r = battle({ cases: [C("A", S(5, 5), ra), C("B", S(10, 9), rb)], years: { fromYear: 2018, toYear: 2021 }, ctxOf });
  for (const k of ["rain_days", "rain_share", "rain_mean", "rain_sum"]) assert.deepEqual(r.metrics[k].validYears, [2018, 2019, 2020], k);
  const A = (k) => r.metrics[k].results[0].value;
  assert.equal(A("rain_days"), 1); // 0, 4, 0(공란)
  assert.ok(Math.abs(A("rain_share") - 100 / 3) < 1e-9);
  assert.equal(A("rain_sum"), 4);
  assert.ok(Math.abs(A("rain_mean") * 3 - A("rain_sum")) < 1e-9);
  assert.equal(r.metrics.rain_days.limited, true); // 공통 eligible 4 중 valid 3 = 75% < 80% → 자료 제한
  assert.equal(r.metrics.rain_days.comparison.badges, false);
});
test("배틀: 공통 0개 → 비교 불가, 1~2개 → 참고(배지 없음)", () => {
  // 음력 윤6월 1일(2025 만 존재) vs 음력 윤4월 1일(2020 만 존재) → 공통 0
  const r0 = battle({ cases: [C("A", L(6, 1, true), [{ observation_date: "2025-07-25", ...T(28) }]), C("B", L(4, 1, true), [{ observation_date: "2020-05-23", ...T(18) }])], years: { fromYear: 2016, toYear: 2025 }, ctxOf });
  assert.equal(r0.metrics.avg.n, 0);
  assert.equal(r0.metrics.avg.comparison.status, "noCommon");
  assert.equal(r0.metrics.avg.comparison.text, "공통으로 비교할 연도가 없습니다");
  assert.equal(r0.metrics.avg.results[0].value, null); // 각자 다른 연도 평균으로 승자를 정하지 않음
  const r2 = battle({ cases: [C("A", S(5, 5), [{ observation_date: "2025-05-05", ...T(20) }, { observation_date: "2024-05-05", ...T(21) }]), C("B", S(10, 9), [{ observation_date: "2025-10-09", ...T(15) }, { observation_date: "2024-10-09", ...T(16) }])], years: { fromYear: 2024, toYear: 2025 }, ctxOf });
  assert.equal(r2.metrics.avg.tier, "reference");
  assert.equal(r2.metrics.avg.comparison.badges, false);
  assert.equal(r2.mixedCalendars, false);
});
test("같음·반올림 후 같음·3개 공동 순위·같은 조건", () => {
  const m = BATTLE_METRICS.avg;
  const t = { tier: "stats", limited: false };
  assert.equal(compareValues(m, [{ case: "A", value: 10 }, { case: "B", value: 10 }], t).status, "equal");
  const re = compareValues(m, [{ case: "A", value: 10.04 }, { case: "B", value: 10.01 }], t);
  assert.equal(re.status, "roundEqual");
  assert.equal(re.badges, false);
  const rk = compareValues(m, [{ case: "A", value: 10.04 }, { case: "B", value: 9 }, { case: "C", value: 10.01 }], t);
  assert.deepEqual(rk.ranks.map((x) => [x.case, x.rank, x.tied]), [["A", 1, true], ["C", 1, true], ["B", 3, false]]);
  const rows = [{ observation_date: "2025-05-05", ...T(20) }];
  const d = battle({ cases: [C("A", S(5, 5), rows), C("B", S(5, 5), rows)], years: { fromYear: 2025, toYear: 2025 }, ctxOf });
  assert.deepEqual(d.duplicates, [["A", "B"]]);
});
test("양력·음력 혼합: 각 달력의 같은 기준연도끼리, 실제 날짜 보존", () => {
  const r = battle({ cases: [C("A", S(1, 1), [{ observation_date: "2025-01-01", ...T(-2) }]), C("B", L(1, 1), [{ observation_date: "2025-01-29", ...T(-1) }])], years: { fromYear: 2025, toYear: 2025 }, ctxOf });
  assert.equal(r.mixedCalendars, true);
  assert.equal(r.cases[1].dateMap[0].solarDate, "2025-01-29");
  assert.equal(r.metrics.avg.n, 1);
  const y = battleYear({ cases: [C("A", S(1, 1), []), C("B", L(1, 1), [])], year: 2025, ctxOf });
  assert.equal(y[1].solarDate, "2025-01-29");
});
test("전체 기간 시작: 지원 범위 안 가장 이른 기준연도(음력 연초는 전년 양력일 수 있음)", () => {
  assert.equal(allFromYear(S(10, 17), "1970-01-01"), 1970);
  assert.equal(allFromYear(L(1, 1), "1970-01-01"), 1970); // 음력 1970-01-01 = 1970-02-06
  assert.equal(allFromYear(L(12, 1), "1970-01-01"), 1969); // 음력 1969-12-01 = 1970-01-08
  assert.equal(SAMPLE_POLICY.bandMinN, 10);
  assert.equal(summarize([{ year: 1, status: "ok", value: 1 }, { year: 2, status: "ok", value: 1.04 }], { digits: 1 }).maxYears.length, 2); // 표시 정밀도 동률 공개
});
test("선택 연도만 바꾸면 과거 평균(base)을 그대로 재사용", async () => {
  const { withSelected } = await import("../date-weather-engine.mjs");
  const store = buildDailyStore("1", [2023, 2024, 2025].map((y) => ({ observation_date: `${y}-10-17`, ...T(y - 2010) })));
  const base = dateWeather({ spec: S(10, 17), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, part: "daily" });
  const a = withSelected(base, { spec: S(10, 17), store, ctx: ctx(), selectedYears: [1999] });
  assert.equal(a.daily, base.daily); // 같은 객체
  assert.equal(a.selected[0].referenceYear, 1999);
  assert.equal(a.daily.metrics.avg.mean, 14);
});

// ---------------------------------------------------------------- v2(2026-10-18): 해마다 이날 횟수·극값 · 앞뒤 15일
test("v2 해마다 이날: 비 온 해·30℃·영하 횟수, 결측·없는 날짜는 세지 않음, 극값 공동", () => {
  const rows = [];
  for (let y = 2016; y <= 2025; y++) {
    const v = { 2016: { precipitation: 5, max_temperature: 31.04, min_temperature: 20 }, 2017: { precipitation: 0, max_temperature: 31.0, min_temperature: 19 }, 2018: { precipitation: null }, 2019: { precipitation: 0.1 }, 2021: { precipitation: 12, max_temperature: 25, min_temperature: 19 } }[y] || {};
    if (y === 2020) continue; // 행 없음 → 자료 없음
    rows.push({ observation_date: `${y}-07-20`, ...T(26, { max_temperature: 28, min_temperature: 22, ...v }) });
  }
  const store = buildDailyStore("1", rows);
  const r = dateWeather({ spec: S(7, 20), store, ctx: ctx(), years: { fromYear: 2016, toYear: 2025 }, part: "daily" });
  const C = Object.fromEntries(r.counts.rules.map((c) => [c.id, c]));
  assert.equal(C.rain.n, 9); // 2020 제외
  assert.deepEqual(C.rain.hitYears, [2016, 2019, 2021]);
  assert.deepEqual(C.rain.excludedYearsByReason.missing, [2020]);
  assert.deepEqual(C.hot30.hitYears, [2016, 2017]);
  assert.equal(C.hot30.show, true); // 7월 = 계절
  assert.equal(C.frost.show, false); // 7월·0번 → 숨김
  assert.equal(C.frost.k, 0);
  assert.deepEqual(r.counts.extremes.hottest.years, [2016, 2017]); // 31.04 와 31.0 → 표시 31.0 공동
  assert.deepEqual(r.counts.extremes.wettest.years, [2021]);
  assert.ok(r.stories.some((s) => s.id === "D-rainCount" && s.text.includes("3번")));
  assert.ok(!r.stories.some((s) => /평균/.test(s.text) && s.id.startsWith("D-")));
});

test("v2 앞뒤 15일: 31일 창, 연초는 전년 12월로 이어짐, 결측 2일 이상은 자료 부족", () => {
  const rows = [];
  const add = (ymd, o = {}) => rows.push({ observation_date: ymd, ...T(1, { precipitation: 0, ...o }) });
  // 2023: 2022-12-21 ~ 2023-01-20 완전(그중 강수 3일, 최저 -4 = 영하 31일)
  for (let dn = Date.UTC(2022, 11, 21); dn <= Date.UTC(2023, 0, 20); dn += 864e5) { const d = new Date(dn).toISOString().slice(0, 10); add(d, ["2022-12-25", "2023-01-01", "2023-01-10"].includes(d) ? { precipitation: 2 } : {}); }
  // 2024: 하루 빠짐(1일 결측 허용)
  for (let dn = Date.UTC(2023, 11, 21); dn <= Date.UTC(2024, 0, 20); dn += 864e5) { const d = new Date(dn).toISOString().slice(0, 10); if (d !== "2024-01-03") add(d); }
  // 2025: 2일 빠짐 → 자료 부족
  for (let dn = Date.UTC(2024, 11, 21); dn <= Date.UTC(2025, 0, 20); dn += 864e5) { const d = new Date(dn).toISOString().slice(0, 10); if (d !== "2025-01-03" && d !== "2025-01-04") add(d); }
  const store = buildDailyStore("1", rows);
  const r = dateWeather({ spec: S(1, 5), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, selectedYears: [2026], part: "daily" });
  const y23 = r.around.years.find((y) => y.referenceYear === 2023);
  assert.equal(y23.start, "2022-12-21");
  assert.equal(y23.end, "2023-01-20");
  assert.equal(y23.metrics.rainDays.raw, 3);
  assert.equal(y23.metrics.frost.raw, 31);
  const m = r.around.metrics.rainDays;
  assert.deepEqual(m.validYears, [2023, 2024]);
  assert.deepEqual(m.excludedYearsByReason.partial, [2025]);
  assert.equal(m.validDays, 31 + 30);
  assert.equal(m.total, 3);
  assert.ok(Math.abs(m.share - (3 / 61) * 100) < 1e-9);
  assert.equal(r.around.metrics.avg.mean, 1);
  // 고른 해 2026: 창이 끝났지만 그 기간 행이 없음 → ok·지표마다 자료 없음(0 으로 세지 않음)
  assert.equal(r.aroundSelected.status, "ok");
  assert.equal(r.aroundSelected.metrics.rainDays.status, "missing");
  assert.equal(r.aroundSelected.metrics.rainDays.raw, null);
  // 오늘(10-17)이 창 안: 진행 중 · 어제까지(sofarEnd)만, 미래(창 시작이 오늘 이후)는 값 없음
  const on = dateWeather({ spec: S(10, 10), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, selectedYears: [2026], part: "daily" }).aroundSelected;
  assert.equal(on.status, "ongoing");
  assert.equal(on.sofarEnd, "2026-10-16");
  const fu = dateWeather({ spec: S(12, 1), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, selectedYears: [2026], part: "daily" }).aroundSelected;
  assert.equal(fu.status, "future");
  assert.deepEqual(fu.metrics, {});
  // 평년 2/29: 창을 만들지 않음(그해에는 없는 날짜)
  const f29 = dateWeather({ spec: S(2, 29), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, part: "daily" });
  assert.deepEqual(f29.around.years.map((y) => y.status), ["nodate", "ok", "nodate"]);
  assert.deepEqual(f29.around.metrics.avg.excludedYearsByReason.nodate, [2023, 2025]);
});

test("v2 음력: 해마다 그해 음력 날짜의 양력 날짜를 가운데로", () => {
  const store = buildDailyStore("1", [{ observation_date: "2024-09-17", ...T(20) }]);
  const r = dateWeather({ spec: L(8, 15), store, ctx: ctx(), years: { fromYear: 2023, toYear: 2025 }, part: "daily" });
  assert.deepEqual(r.around.years.map((y) => y.center), ["2023-09-29", "2024-09-17", "2025-10-06"]);
  assert.equal(r.around.years[1].start, "2024-09-02");
  assert.equal(r.around.years[1].metrics.avg.status, "partial"); // 31일 중 1일만 → 자료 부족(값 없음)
  assert.equal(r.around.metrics.avg.n, 0);
});

test("v2 주소: date=YYYY-MM-DD → m·d·years(겹쳐 볼 해 포함), 예전 m·d·year 그대로", async () => {
  const { withDateParam } = await import("../date-api.mjs");
  const q = withDateParam(new URLSearchParams("station=108&cal=solar&date=2018-07-05&cmp=2019,2020"));
  assert.equal(q.get("m"), "7");
  assert.equal(q.get("d"), "5");
  assert.equal(q.get("years"), "2018,2019,2020");
  assert.equal(q.get("date"), null);
  const old = withDateParam(new URLSearchParams("m=10&d=17&year=2004"));
  assert.equal(old.get("m"), "10");
  assert.equal(old.get("years"), null); // 예전 주소는 year 로(아래 계산에서 그대로)
  assert.equal(withDateParam(new URLSearchParams("date=bad&m=3&d=1")).get("m"), "3");
});
