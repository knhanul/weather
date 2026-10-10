// 날씨 통계 공통 계산(stats-engine.mjs)·API(stats-api.mjs)·캐시(stats-data.mjs) 단위 테스트 — DB 없이 합성 자료로
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePeriod, resolvePeriod, truncatedPeriod, periodLabel, buildDailyStore, aggregate, yearRow, yearRows, yearlyCompare,
  decadeDelta, rankOf, ongoingCompare, overlay, regionYearly, regionMonthly, regionPeriod, commonYears, toCsv, getMetric,
  ymdToDn, dnToYmd, StatsError, weekdayOf,
} from "../stats-engine.mjs";
import { createStatsApi } from "../stats-api.mjs";
import { createStatsData } from "../stats-data.mjs";

// 합성 일자료: from~to 매일 한 행. fn(ymd) 가 행 값을 돌려준다(null 이면 그날 행 없음)
function rowsFor(from, to, fn) {
  const out = [];
  for (let dn = ymdToDn(from); dn <= ymdToDn(to); dn++) {
    const d = dnToYmd(dn);
    const r = fn(d);
    if (r) out.push({ observation_date: d, ...r });
  }
  return out;
}
const flat = (over = {}) => (d) => ({ avg_temperature: 10, max_temperature: 15, min_temperature: 5, precipitation: null, avg_humidity: 60, avg_wind_speed: 2, ...(typeof over === "function" ? over(d) : over) });

// ---------------------------------------------------------------- 기간 해석
test("월 전체: 실제 일수(윤년 2월 29일, 평년 28일, 4월 30일)", () => {
  assert.deepEqual(resolvePeriod(parsePeriod("month:2"), 2024), { year: 2024, start: "2024-02-01", end: "2024-02-29", days: 29, crossYear: false });
  assert.equal(resolvePeriod(parsePeriod("month:2"), 2023).days, 28);
  assert.equal(resolvePeriod(parsePeriod("month:2"), 1900).days, 28); // 100으로 나눠지는 해는 평년
  assert.equal(resolvePeriod(parsePeriod("month:2"), 2000).days, 29); // 400으로 나눠지는 해는 윤년
  assert.equal(resolvePeriod(parsePeriod("month:4"), 2025).end, "2025-04-30");
  assert.equal(resolvePeriod(parsePeriod("month:5"), 2025).days, 31);
});

test("주차는 날짜 고정(1~7, 8~14 …, 29~말일) — 요일이 달라도 같은 날짜", () => {
  const w1 = parsePeriod("week:5:1");
  const a = resolvePeriod(w1, 2024);
  const b = resolvePeriod(w1, 2025);
  assert.equal(a.start, "2024-05-01");
  assert.equal(a.end, "2024-05-07");
  assert.equal(b.start, "2025-05-01");
  assert.equal(b.end, "2025-05-07");
  assert.notEqual(weekdayOf(a.start), weekdayOf(b.start)); // 요일은 다르지만 날짜는 같다
  assert.deepEqual([2, 3, 4].map((w) => resolvePeriod(parsePeriod(`week:5:${w}`), 2025).start), ["2025-05-08", "2025-05-15", "2025-05-22"]);
  assert.equal(periodLabel(w1), "5월 1주차 · 5/1~5/7");
  // 5주차 = 29일~말일: 31일 달 3일, 30일 달 2일, 평년 2월은 없음, 윤년 2월은 2/29 하루
  assert.equal(resolvePeriod(parsePeriod("week:5:5"), 2025).days, 3);
  assert.equal(resolvePeriod(parsePeriod("week:4:5"), 2025).days, 2);
  assert.equal(resolvePeriod(parsePeriod("week:2:5"), 2025), null);
  assert.deepEqual(resolvePeriod(parsePeriod("week:2:5"), 2024), { year: 2024, start: "2024-02-29", end: "2024-02-29", days: 1, crossYear: false });
  assert.equal(periodLabel(parsePeriod("week:4:5")), "4월 5주차 · 4/29~4/30");
});

test("계절: 겨울은 전년 12월~그해 2월, 1·2월이 속한 해로 셈", () => {
  const w = parsePeriod("season:winter");
  assert.deepEqual(resolvePeriod(w, 2024), { year: 2024, start: "2023-12-01", end: "2024-02-29", days: 91, crossYear: true });
  assert.deepEqual(resolvePeriod(w, 2025), { year: 2025, start: "2024-12-01", end: "2025-02-28", days: 90, crossYear: true });
  assert.equal(resolvePeriod(parsePeriod("season:summer"), 2025).days, 92);
  assert.equal(resolvePeriod(parsePeriod("season:spring"), 2025).start, "2025-03-01");
  assert.equal(resolvePeriod(parsePeriod("season:autumn"), 2025).end, "2025-11-30");
});

test("직접 지정: 해를 넘는 구간은 끝 날짜의 해로, 2/29 규칙", () => {
  assert.deepEqual(resolvePeriod(parsePeriod("range:12-20:01-10"), 2025), { year: 2025, start: "2024-12-20", end: "2025-01-10", days: 22, crossYear: true });
  assert.deepEqual(resolvePeriod(parsePeriod("range:04-25:05-05"), 2025), { year: 2025, start: "2025-04-25", end: "2025-05-05", days: 11, crossYear: false });
  // 2/29 로 끝나면 평년은 2/28, 2/29 에 시작하면 평년은 3/1, 2/29 하루는 윤년만
  assert.equal(resolvePeriod(parsePeriod("range:02-20:02-29"), 2025).end, "2025-02-28");
  assert.equal(resolvePeriod(parsePeriod("range:02-20:02-29"), 2024).end, "2024-02-29");
  assert.equal(resolvePeriod(parsePeriod("range:02-29:03-05"), 2025).start, "2025-03-01");
  assert.equal(resolvePeriod(parsePeriod("range:02-29:02-29"), 2025), null);
  assert.equal(resolvePeriod(parsePeriod("range:02-29:02-29"), 2024).days, 1);
  // 해를 넘는 구간 중 2/29: 끝 해 기준
  assert.equal(resolvePeriod(parsePeriod("range:12-01:02-29"), 2024).end, "2024-02-29");
  assert.equal(resolvePeriod(parsePeriod("range:12-01:02-29"), 2025).end, "2025-02-28");
});

test("잘못된 기간은 거부", () => {
  for (const bad of ["", "month:13", "month:0", "week:5:6", "week:13:1", "season:rainy", "range:02-30:03-01", "range:13-01:01-01", "range:04-25", "year:2025", "month:5:1"]) {
    assert.throws(() => parsePeriod(bad), StatsError, bad);
  }
});

test("진행 중 구간 자르기: 다른 해도 같은 월·일까지(윤일·해 넘김 포함)", () => {
  const oct = parsePeriod("month:10");
  assert.deepEqual(truncatedPeriod(oct, 2000, 2026, "2026-10-09"), { year: 2000, start: "2000-10-01", end: "2000-10-09", days: 9, crossYear: false });
  const w = parsePeriod("season:winter");
  // 2028년 겨울(2027-12~2028-02)이 2028-02-29 까지 진행 → 평년은 2/28 까지
  assert.equal(truncatedPeriod(w, 2027, 2028, "2028-02-29").end, "2027-02-28");
  // 2026년 겨울이 2025-12-15 까지 진행 → 다른 해도 전년 12/15 까지
  assert.deepEqual(truncatedPeriod(w, 2010, 2026, "2025-12-15"), { year: 2010, start: "2009-12-01", end: "2009-12-15", days: 15, crossYear: true });
});

// ---------------------------------------------------------------- 지표·결측
test("최고기온 평균과 기간 최고기온은 다른 지표(날짜 포함)", () => {
  const store = buildDailyStore("1", rowsFor("2025-05-01", "2025-05-31", flat((d) => ({ max_temperature: d === "2025-05-20" ? 31.4 : 20 }))));
  const r = resolvePeriod(parsePeriod("month:5"), 2025);
  const avgMax = aggregate(store, "avg_max", r);
  const pMax = aggregate(store, "period_max", r);
  assert.equal(avgMax.value, 20.4); // (30*20 + 31.4)/31 = 20.37
  assert.equal(pMax.value, 31.4);
  assert.equal(pMax.date, "2025-05-20");
  assert.equal(avgMax.date, null);
  assert.equal(aggregate(store, "hot30_days", r).value, 1);
  assert.equal(aggregate(store, "heatwave_days", r).value, 0);
  assert.notEqual(getMetric("avg_max").label, getMetric("period_max").label);
});

test("무강수(공란)와 자료 없음은 다르다", () => {
  // 5/1~5/31 중 5/10 은 행이 없음(자료 없음), 5/3 은 12.5mm, 5/4 는 0.0(흔적), 나머지는 공란(무강수)
  const rows = rowsFor("2025-05-01", "2025-05-31", (d) => (d === "2025-05-10" ? null : flat({ precipitation: d === "2025-05-03" ? 12.5 : d === "2025-05-04" ? 0 : null })(d)));
  const store = buildDailyStore("1", rows);
  const may = resolvePeriod(parsePeriod("month:5"), 2025);
  const total = aggregate(store, "rain_total", may);
  assert.equal(total.complete, false);
  assert.equal(total.value, null); // 하루라도 자료가 없으면 합계를 내지 않는다(0으로 채우지 않음)
  assert.equal(total.partial, null); // 합계·일수는 부분 값도 내지 않는다
  assert.equal(total.obs, 30);
  const first9 = { start: "2025-05-01", end: "2025-05-09" };
  assert.equal(aggregate(store, "rain_total", first9).value, 12.5); // 공란은 0으로 합산
  assert.equal(aggregate(store, "rain_days", first9).value, 1); // 0.0 은 강수일(0.1mm 이상)이 아님
  assert.equal(store.rainBlank[0], 1);
  // 행은 있는데 기온·강수가 모두 비면 강수도 자료 없음
  const empty = buildDailyStore("2", [{ observation_date: "2025-05-01", avg_temperature: null, max_temperature: null, min_temperature: null, precipitation: null }]);
  assert.equal(aggregate(empty, "rain_total", { start: "2025-05-01", end: "2025-05-01" }).obs, 0);
  // 기온 하나만 빈 날은 그 항목만 결측
  const oneNull = buildDailyStore("3", rowsFor("2025-05-01", "2025-05-03", (d) => flat({ max_temperature: d === "2025-05-02" ? null : 20 })(d)));
  const r3 = { start: "2025-05-01", end: "2025-05-03" };
  assert.equal(aggregate(oneNull, "avg_max", r3).value, null);
  assert.equal(aggregate(oneNull, "avg_max", r3).partial, 20);
  assert.equal(aggregate(oneNull, "avg_temp", r3).value, 10);
});

test("연도 상태: 온전·자료 부족·진행 중·미래·보유 밖·없는 날짜", () => {
  const store = buildDailyStore("1", rowsFor("1990-03-01", "2026-10-09", (d) => (d >= "2001-05-10" && d <= "2001-05-11" ? null : flat()(d))));
  const asOf = "2026-10-09";
  const may = parsePeriod("month:5");
  assert.equal(yearRow(store, "avg_temp", may, 2000, asOf).status, "complete");
  const y2001 = yearRow(store, "avg_temp", may, 2001, asOf);
  assert.equal(y2001.status, "partial");
  assert.equal(y2001.obs, 29);
  assert.equal(y2001.value, null);
  assert.equal(yearRow(store, "avg_temp", parsePeriod("month:10"), 2026, asOf).status, "ongoing");
  assert.equal(yearRow(store, "avg_temp", parsePeriod("month:11"), 2026, asOf).status, "future");
  assert.equal(yearRow(store, "avg_temp", parsePeriod("month:1"), 1989, asOf).status, "none");
  assert.equal(yearRow(store, "avg_temp", parsePeriod("month:2"), 1990, asOf).status, "none"); // 자료가 1990-03-01 부터
  // 1990년 겨울(1989-12~1990-02)은 자료 없음, 1991년 겨울은 온전
  assert.equal(yearRow(store, "avg_temp", parsePeriod("season:winter"), 1991, asOf).status, "complete");
  assert.equal(yearRow(store, "avg_temp", parsePeriod("week:2:5"), 2025, asOf).status, "nodate");
  // 자료가 시작되는 날이 구간 중간이면 자료 부족
  assert.equal(yearRow(store, "avg_temp", parsePeriod("range:02-20:03-10"), 1990, asOf).status, "partial");
});

test("순위: 같은 값은 같은 순위", () => {
  assert.deepEqual(rankOf([5, 7, 7, 3], 7), { high: 1, low: 3, of: 4 });
  assert.deepEqual(rankOf([5, 7, 7, 3], 5), { high: 3, low: 2, of: 4 });
  assert.deepEqual(rankOf([5, NaN, 3], 3), { high: 2, low: 1, of: 2 });
});

test("1990년대 대비 변화: 온전한 해 8개 미만이면 비교하지 않음, 기준 0이면 증감률 없음", () => {
  // 1990~1999: 1995~1997 의 5월이 자료 없음 → 온전한 해 7개 → 비교 안 함
  const gap = buildDailyStore("1", rowsFor("1990-01-01", "2026-10-09", (d) => (d.slice(0, 4) >= "1995" && d.slice(0, 4) <= "1997" && d.slice(5, 7) === "05" && d.slice(8) === "15" ? null : flat()(d))));
  const may = parsePeriod("month:5");
  const asOf = "2026-10-09";
  const d1 = decadeDelta(getMetric("avg_temp"), yearRows(gap, "avg_temp", may, 1990, 2026, asOf));
  assert.equal(d1.available, false);
  assert.equal(d1.baseline.n, 7);
  assert.match(d1.reason, /7개뿐/);
  // 평균 비교: 1990년대 10℃, 2017~2026 은 12℃ → +2℃ (5월은 2026년에 끝났으므로 최근 10년 = 2017~2026)
  const warm = buildDailyStore("2", rowsFor("1990-01-01", "2026-10-09", flat((d) => ({ avg_temperature: d >= "2017" ? 12 : 10 }))));
  const d2 = decadeDelta(getMetric("avg_temp"), yearRows(warm, "avg_temp", may, 1990, 2026, asOf));
  assert.equal(d2.available, true);
  assert.deepEqual([d2.recent.from, d2.recent.to], [2017, 2026]);
  assert.equal(d2.delta, 2);
  assert.equal(d2.pct, null); // 기온은 증감률을 내지 않음
  // 10월은 2026년이 진행 중 → 최근 10년 = 2016~2025
  const d3 = decadeDelta(getMetric("avg_temp"), yearRows(warm, "avg_temp", parsePeriod("month:10"), 1990, 2026, asOf));
  assert.deepEqual([d3.recent.from, d3.recent.to], [2016, 2025]);
  // 1990년대 폭염일 0 → 증감률 계산 안 함
  const hot = buildDailyStore("3", rowsFor("1990-01-01", "2026-10-09", flat((d) => ({ max_temperature: d >= "2017" && d.slice(5) === "08-01" ? 34 : 20 }))));
  const d4 = decadeDelta(getMetric("heatwave_days"), yearRows(hot, "heatwave_days", parsePeriod("month:8"), 1990, 2026, asOf));
  assert.equal(d4.available, true);
  assert.equal(d4.delta, 1);
  assert.equal(d4.pct, null);
  assert.match(d4.pctNote, /0이라/);
});

test("진행 중인 해는 같은 월·일까지만 비교", () => {
  const store = buildDailyStore("1", rowsFor("1990-01-01", "2026-10-09", flat((d) => ({ precipitation: d.slice(8) === "05" ? 10 : d.slice(8) === "20" ? 30 : null }))));
  const r = ongoingCompare(store, getMetric("rain_total"), parsePeriod("month:10"), 2026, "2026-10-09", 1990);
  assert.equal(r.end, "2026-10-09");
  assert.equal(r.value, 10); // 10/20 비는 아직 없음
  assert.ok(r.past.every((x) => x.end.slice(5) === "10-09" && x.value === 10)); // 과거도 10/9 까지만(10/20 의 30mm 제외)
  assert.equal(r.rank.of, 37);
  assert.equal(r.rank.high, 1);
  const y = yearlyCompare(store, "rain_total", parsePeriod("month:10"), { fromYear: 1990, toYear: 2026, asOf: "2026-10-09" });
  assert.equal(y.rows.at(-1).status, "ongoing");
  assert.equal(y.rows.at(-1).value, null); // 그래프의 연도 값으로는 쓰지 않는다
  assert.equal(y.summary.latest.year, 2025);
  assert.equal(y.summary.latest.value, 40);
  assert.ok(y.ongoing && y.ongoing.value === 10);
});

test("요약: 최고·최저 연도, 최근 연도 순위, 자료 부족 연도 별도 표시", () => {
  const store = buildDailyStore("1", rowsFor("1990-01-01", "2025-12-31", (d) => (d === "1993-05-03" ? null : flat({ avg_temperature: +d.slice(0, 4) === 1998 ? 20 : +d.slice(0, 4) === 1991 ? 5 : 10 })(d))));
  const y = yearlyCompare(store, "avg_temp", parsePeriod("month:5"), { fromYear: 1990, toYear: 2025, asOf: "2025-12-31" });
  assert.deepEqual(y.summary.highest, { value: 20, years: [1998] });
  assert.deepEqual(y.summary.lowest, { value: 5, years: [1991] });
  assert.equal(y.summary.completeYears, 35);
  assert.deepEqual(y.summary.incomplete, [{ year: 1993, status: "partial", obs: 30, days: 31 }]);
  assert.deepEqual(y.summary.latest.rank, { high: 2, low: 2, of: 35 });
  assert.ok(y.text.length >= 2 && y.text.every((t) => typeof t === "string"));
});

// ---------------------------------------------------------------- 겹쳐보기
test("날짜별 겹쳐보기: 월·일 축, 평년의 2/29 는 빈 값, 누적 강수는 결측 뒤로 끊김", () => {
  const store = buildDailyStore("1", rowsFor("2023-01-01", "2024-12-31", (d) => (d === "2023-02-10" ? null : flat({ precipitation: 1 })(d))));
  const r = overlay(store, "rain_total", parsePeriod("month:2"), [2023, 2024], "2024-12-31");
  assert.equal(r.keys.length, 29);
  assert.equal(r.keys.at(-1), "02-29");
  const [a, b] = r.series;
  assert.equal(a.values[28], null); // 2023-02-29 없음
  assert.equal(b.values[28], 29); // 2024 누적
  assert.equal(a.values[8], 9);
  assert.equal(a.values[9], null); // 2/10 결측
  assert.equal(a.values[10], null); // 결측 뒤 누적은 끊김(0으로 채우지 않음)
  assert.equal(a.status, "partial");
  assert.throws(() => overlay(store, "avg_temp", parsePeriod("month:2"), [2019, 2020, 2021, 2022, 2023], "2024-12-31"), StatsError);
  const t = overlay(store, "avg_max", parsePeriod("month:2"), [2024], "2024-12-31");
  assert.equal(t.value.label, "일최고기온");
  assert.equal(t.series[0].values[0], 15);
});

// ---------------------------------------------------------------- 지역별 비교
test("지역 비교는 공통 연도만 쓰고 지점마다 같은 분모", () => {
  const a = buildDailyStore("A", rowsFor("1990-01-01", "2025-12-31", flat({ avg_temperature: 10 })));
  // B 는 2000년 7월 하루가 없고, 1995년 여름은 더움
  const b = buildDailyStore("B", rowsFor("1990-01-01", "2025-12-31", (d) => (d === "2000-07-15" ? null : flat({ avg_temperature: d.startsWith("1995-0") ? 30 : 20 })(d))));
  const summer = parsePeriod("season:summer");
  const r = regionYearly([a, b], "avg_temp", summer, { fromYear: 1990, toYear: 2025, asOf: "2025-12-31" });
  assert.equal(r.commonYears.length, 35);
  assert.ok(!r.commonYears.includes(2000));
  const [sa, sb] = r.stations;
  assert.equal(sa.years, 35); // A 는 2000년도 온전하지만 공통이 아니라 뺀다
  assert.equal(sb.years, 35);
  assert.equal(sa.rows.find((x) => x.year === 2000).value, null);
  assert.equal(sa.rows.find((x) => x.year === 2000).status, "complete");
  assert.equal(sb.mean, Math.round(((34 * 20 + 30) / 35) * 10) / 10);
  assert.equal(commonYears([[{ year: 1, status: "complete" }], [{ year: 1, status: "partial" }]]).length, 0);
  // 월별: 모든 지점·12개월이 온전한 해만(2000년 제외)
  const m = regionMonthly([a, b], "avg_temp", { fromYear: 1990, toYear: 2025, asOf: "2025-12-31" });
  assert.equal(m.commonYears.length, 35);
  assert.ok(m.months.every((x) => x.values.every((v) => v.years === 35)));
  const p = regionPeriod([a, b], summer, { fromYear: 1990, toYear: 2025, asOf: "2025-12-31", metrics: ["avg_temp", "rain_total"] });
  assert.equal(p.metrics[0].stations[0].years, p.metrics[0].stations[1].years);
});

// ---------------------------------------------------------------- API: 그래프 값 = 표 = CSV
function fakeRes() {
  return {
    status: 0, headers: null, body: "",
    writeHead(s, h) { this.status = s; this.headers = h; },
    end(b) { this.body = String(b ?? ""); },
  };
}
const jsonFn = (res, data, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
function apiWith(stores) {
  const statsData = { get: async (id) => stores[id], version: () => 7 };
  const stations = async () => Object.keys(stores).map((id) => ({ station_id: id, station_name: `지점${id}`, region: "테스트", enabled: true }));
  return createStatsApi({ statsData, stations, officialDate: () => "2026-10-09", json: jsonFn });
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split("\n").filter((l) => !l.startsWith("#"));
  return lines.map((l) => l.split(","));
}
test("API: 연도별 비교의 그래프 값·표·CSV 가 같다", async () => {
  const s = buildDailyStore("108", rowsFor("1990-01-01", "2026-10-09", flat((d) => ({ avg_temperature: 10 + (+d.slice(0, 4) % 7) / 10, precipitation: d.slice(8) === "07" ? 3.3 : null }))));
  const api = apiWith({ 108: s });
  for (const metric of ["avg_temp", "rain_total", "period_max"]) {
    const q = `/api/stats/yearly?station=108&period=month:5&metric=${metric}&from=1990&to=2026`;
    const r1 = fakeRes();
    assert.equal(await api({ method: "GET" }, r1, new URL(q, "http://x")), true);
    const j = JSON.parse(r1.body);
    assert.equal(r1.status, 200);
    const r2 = fakeRes();
    await api({ method: "GET" }, r2, new URL(q + "&format=csv", "http://x"));
    assert.match(r2.headers["content-type"], /text\/csv/);
    assert.match(r2.headers["content-disposition"], /weather-stats-yearly-108/);
    const csv = parseCsv(r2.body);
    assert.deepEqual(csv[0], j.table.columns.map((c) => c.label));
    const vi = j.table.columns.findIndex((c) => c.key === "value");
    j.rows.forEach((row, i) => {
      assert.equal(j.table.rows[i].value, row.value); // 표 = 그래프 점
      assert.equal(csv[i + 1][vi], row.value == null ? "" : String(row.value)); // CSV = 표
    });
  }
});
test("API: 지역 비교 CSV 와 표가 같고, 잘못된 입력은 400", async () => {
  const mk = (id, t) => buildDailyStore(id, rowsFor("1990-01-01", "2026-10-09", flat({ avg_temperature: t })));
  const api = apiWith({ 108: mk("108", 12), 159: mk("159", 15) });
  for (const view of ["period", "monthly", "yearly"]) {
    const q = `/api/stats/region?stations=108,159&view=${view}&period=season:summer&metric=avg_temp`;
    const r1 = fakeRes();
    await api({ method: "GET" }, r1, new URL(q, "http://x"));
    assert.equal(r1.status, 200, view);
    const j = JSON.parse(r1.body);
    const r2 = fakeRes();
    await api({ method: "GET" }, r2, new URL(q + "&format=csv", "http://x"));
    const csv = parseCsv(r2.body);
    assert.equal(csv.length - 1, j.table.rows.length);
    j.table.rows.forEach((row, i) => j.table.columns.forEach((c, k) => assert.equal(csv[i + 1][k], row[c.key] == null ? "" : String(row[c.key]))));
  }
  for (const q of ["/api/stats/region?stations=108", "/api/stats/region?stations=108,159,1,2,3", "/api/stats/yearly?station=999", "/api/stats/yearly?station=108&period=month:13", "/api/stats/yearly?station=108&from=2030", "/api/stats/region?stations=108,159&view=x"]) {
    const r = fakeRes();
    await api({ method: "GET" }, r, new URL(q, "http://x"));
    assert.equal(r.status, 400, q);
  }
  const r = fakeRes();
  await api({ method: "POST" }, r, new URL("/api/stats/yearly", "http://x"));
  assert.equal(r.status, 405);
  assert.equal(await api({ method: "GET" }, fakeRes(), new URL("/api/stats/nope", "http://x")), false);
});

test("CSV: 쉼표·따옴표는 감싸고 BOM·설명 줄을 붙인다", () => {
  const t = toCsv({ columns: [{ key: "a", label: "가,나" }, { key: "b", label: "b" }], rows: [{ a: 'x"y', b: null }] }, ["설명"]);
  assert.equal(t, '\uFEFF# 설명\n"가,나",b\n"x""y",\n');
});

test("캐시: 저장(invalidate)하면 그 지점을 다시 읽고 version 이 오른다", async () => {
  let calls = 0;
  let temp = 10;
  const data = createStatsData({ loadRows: async () => { calls++; return rowsFor("2025-01-01", "2025-01-31", flat({ avg_temperature: temp })); } });
  const s1 = await data.get("108");
  await data.get("108");
  assert.equal(calls, 1);
  const v = data.version();
  temp = 20;
  data.invalidate(["108"]);
  assert.ok(data.version() > v);
  const s2 = await data.get("108");
  assert.equal(calls, 2);
  assert.equal(aggregate(s1, "avg_temp", { start: "2025-01-01", end: "2025-01-31" }).value, 10);
  assert.equal(aggregate(s2, "avg_temp", { start: "2025-01-01", end: "2025-01-31" }).value, 20);
  // 동시에 여러 요청이 와도 한 번만 읽는다
  data.invalidate();
  await Promise.all([data.get("108"), data.get("108"), data.get("108")]);
  assert.equal(calls, 3);
});
