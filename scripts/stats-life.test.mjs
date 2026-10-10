// 날씨 통계 2단계(생활 속 날씨·날씨 기록·시간자료 통계) 단위 테스트 — DB 없이 합성 자료로
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePeriod, buildDailyStore, ymdToDn, dnToYmd, runsIn, streaks, longestRunYear, weekdayShare, sameDayHistory, thresholdDatesYear, thresholdDates,
  records, recordList, RECORDS, createHourlyStore, addHourlyRows, nightMin, tropicalYear, tropicalNights, parseOutdoor, outdoorShare, outdoorJudge,
  commuteShare, hourlyLastDay, mdPos, posToMd, aggregate, StatsError, hval,
} from "../stats-engine.mjs";
import { createStatsApi } from "../stats-api.mjs";
import { createStatsHourly } from "../stats-hourly.mjs";

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
// 합성 시간자료: from~to 매시. fn(ymd, hh) → 행 값(null 이면 행 없음)
function hourRows(from, to, fn) {
  const out = [];
  for (let dn = ymdToDn(from); dn <= ymdToDn(to); dn++) {
    const d = dnToYmd(dn);
    for (let h = 0; h < 24; h++) {
      const r = fn(d, h);
      if (r) out.push({ observation_datetime: `${d} ${String(h).padStart(2, "0")}:00`, temperature: 20, precipitation: null, humidity: 60, wind_speed: 2, rn_qcflg: null, ta_qcflg: "0", ...r });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 연속 강수·무강수
test("연속 강수일은 결측일을 건너뛰어 잇지 않는다", () => {
  // 7/1~7/3 비, 7/4 행 없음(결측), 7/5~7/6 비 → 3일과 2일(5일이 아님)
  const rows = rowsFor("2020-06-25", "2020-07-10", (d) => (d === "2020-07-04" ? null : flat({ precipitation: d >= "2020-07-01" && d <= "2020-07-06" ? 5 : null })(d)));
  const s = buildDailyStore("1", rows);
  const runs = runsIn(s, "wet", ymdToDn("2020-06-25"), ymdToDn("2020-07-10"));
  assert.deepEqual(runs.map((r) => [r.start, r.end, r.len, r.endReason]), [["2020-07-01", "2020-07-03", 3, "missing"], ["2020-07-05", "2020-07-06", 2, "end"]]);
  // 무강수 연속도 결측일에서 끊김: 6/25~6/30(6일), 7/7~7/10(4일, 구간 끝에서 잘림)
  const dry = runsIn(s, "dry", ymdToDn("2020-06-25"), ymdToDn("2020-07-10"));
  assert.deepEqual(dry.map((r) => [r.start, r.len, r.endReason]), [["2020-06-25", 6, "end"], ["2020-07-07", 4, "range"]]);
  // 0.0(흔적)·0.05 는 강수일이 아님(0.1mm 기준)
  const s2 = buildDailyStore("1", rowsFor("2021-01-01", "2021-01-05", flat((d) => ({ precipitation: { "2021-01-02": 0.0, "2021-01-03": 0.05, "2021-01-04": 0.1 }[d] ?? null }))));
  assert.deepEqual(runsIn(s2, "wet", ymdToDn("2021-01-01"), ymdToDn("2021-01-05")).map((r) => r.start), ["2021-01-04"]);
});
test("연도별 최장 연속: 빠진 날이 있는 해는 값 없이 '자료 부족', 보유 기간 최장은 순위와 날짜", () => {
  const rows = rowsFor("1990-01-01", "1992-12-31", (d) => (d === "1991-03-03" ? null : flat({ precipitation: d.startsWith("1990-07-0") ? 2 : d >= "1992-08-01" && d <= "1992-08-12" ? 1 : null })(d)));
  const s = buildDailyStore("1", rows);
  const p = parsePeriod("year");
  assert.equal(longestRunYear(s, "wet", p, 1990, "1992-12-31").len, 9); // 7/1~7/9
  const y91 = longestRunYear(s, "wet", p, 1991, "1992-12-31");
  assert.equal(y91.status, "partial");
  assert.equal(y91.len, null);
  const r = streaks(s, "wet", p, { fromYear: 1990, toYear: 1992, asOf: "1992-12-31", top: 2 });
  assert.equal(r.top[0].len, 12);
  assert.equal(r.top[0].start, "1992-08-01");
  assert.equal(r.top[1].len, 9);
});

// ---------------------------------------------------------------- 주말·평일
test("주말·평일 비율의 분모는 유효 관측일(결측일 제외), 차이는 %p", () => {
  // 2024-06: 토·일만 비. 6/3(월) 행 없음
  const rows = rowsFor("2024-06-01", "2024-06-30", (d) => {
    if (d === "2024-06-03") return null;
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return flat({ precipitation: wd === 0 || wd === 6 ? 3 : null })(d);
  });
  const s = buildDailyStore("1", rows);
  const r = weekdayShare(s, parsePeriod("month:6"), { fromYear: 2024, toYear: 2024, asOf: "2024-12-31" });
  // 2024-06: 토 5·일 5 = 주말 10일, 평일 20일 중 하루 결측 → 19일
  assert.equal(r.weekend.valid, 10);
  assert.equal(r.weekend.hit, 10);
  assert.equal(r.weekday.valid, 19);
  assert.equal(r.weekday.missing, 1);
  assert.equal(r.weekend.share, 100);
  assert.equal(r.weekday.share, 0);
  assert.equal(r.diff, 100);
  assert.equal(r.dow[1].valid, 3); // 월요일 4번 중 1번 결측
});

// ---------------------------------------------------------------- 같은 월·일
test("같은 월·일 조회: 2/29 는 윤년만, 강수 있었던 해 비율 = 강수 해 ÷ 자료 있는 해", () => {
  const rows = rowsFor("2019-01-01", "2025-12-31", (d) => (d === "2021-05-05" ? null : flat({ precipitation: d === "2020-05-05" || d === "2024-02-29" ? 4 : d === "2023-05-05" ? 0.0 : null })(d)));
  const s = buildDailyStore("1", rows);
  const may = sameDayHistory(s, "05-05", { fromYear: 2019, toYear: 2025, asOf: "2025-12-31" });
  assert.equal(may.summary.validYears, 6); // 2021 결측
  assert.equal(may.summary.rainyYears, 1); // 2020 만(2023 은 0.0 흔적 → 강수일 아님)
  assert.equal(may.summary.share, 17);
  assert.equal(may.rows.find((r) => r.year === 2021).status, "none");
  const leap = sameDayHistory(s, "02-29", { fromYear: 2019, toYear: 2025, asOf: "2025-12-31" });
  assert.deepEqual(leap.rows.filter((r) => r.status === "ok").map((r) => r.year), [2020, 2024]);
  assert.equal(leap.summary.noDateYears, 5);
  assert.equal(leap.summary.rainyYears, 1);
  assert.match(leap.text.join(" "), /확률이 아닙니다/);
});

// ---------------------------------------------------------------- 더위 첫날
test("첫·마지막 30℃ 날짜: 온전한 해만 확정, 그런 날이 없는 해는 날짜 평균에서 뺌", () => {
  const rows = rowsFor("1990-01-01", "2025-12-31", (d) => {
    const y = +d.slice(0, 4);
    const md = d.slice(5);
    const hot = y === 1995 ? false : md >= (y < 2000 ? "07-10" : "06-20") && md <= "08-20";
    return flat({ max_temperature: hot ? 31 : 25 })(d);
  });
  const s = buildDailyStore("1", rows);
  const y1990 = thresholdDatesYear(s, "hot30_days", parsePeriod("year"), 1990, "2025-12-31");
  assert.equal(y1990.first, "1990-07-10");
  assert.equal(y1990.last, "1990-08-20");
  assert.equal(y1990.count, 42);
  const r = thresholdDates(s, "hot30_days", parsePeriod("year"), { fromYear: 1990, toYear: 2025, asOf: "2025-12-31" });
  assert.deepEqual(r.summary.noEventYears, [1995]);
  assert.equal(r.firstDelta.available, true);
  assert.equal(r.firstDelta.baseline.n, 9); // 1995 제외
  assert.equal(posToMd(r.firstDelta.baseline.mean), "7/10");
  assert.equal(posToMd(r.firstDelta.recent.mean), "6/20");
  assert.equal(r.firstDelta.delta, -20);
  assert.equal(mdPos("2024-03-01"), mdPos("2023-03-01")); // 윤년도 같은 달력 위치
});

// ---------------------------------------------------------------- 기록
test("기록 순위: 같은 값은 같은 순위, 10위 동점 포함, 강수는 0보다 큰 날만, 결측 수 표시", () => {
  const rows = rowsFor("2000-01-01", "2000-12-31", (d) => (d === "2000-03-01" ? null : flat({ max_temperature: d === "2000-08-01" || d === "2000-08-02" ? 38 : d === "2000-08-03" ? 37 : 20, precipitation: d === "2000-07-01" ? 120 : null })(d)));
  const s = buildDailyStore("1", rows);
  const r = records(s, null, { asOf: "2000-12-31", n: 3 });
  const hi = r.lists.find((l) => l.id === "max_high");
  assert.deepEqual(hi.items.slice(0, 3).map((x) => [x.rank, x.value, x.date]), [[1, 38, "2000-08-01"], [1, 38, "2000-08-02"], [3, 37, "2000-08-03"]]);
  assert.equal(hi.missing, 1);
  const rain = r.lists.find((l) => l.id === "rain_high");
  assert.equal(rain.items.length, 1); // 무강수(공란=0) 날은 순위에 넣지 않음
  // 10위 동점 포함: 값이 모두 20 인 날들
  const lo = recordList(s, RECORDS.find((x) => x.id === "max_low"), null, { asOf: "2000-12-31", n: 3 });
  assert.ok(lo.items.length > 3 && lo.items.every((x) => x.rank === 1));
});

// ---------------------------------------------------------------- 시간자료: 열대야 추정
test("열대야 추정: 밤 = 그날 19시~다음 날 09시 정시 15개(자정을 넘김), 하나라도 없으면 판정 안 함", () => {
  const hs = createHourlyStore("1", 2021);
  addHourlyRows(hs, hourRows("2020-07-30", "2020-08-05", (d, h) => {
    if (d === "2020-08-03" && h === 3) return null; // 8/2 밤의 03시 빠짐
    let t = 27;
    if (d === "2020-08-02" && h === 5) t = 24.9; // (빠진 밤과 별개로) 8/1 밤엔 영향 없음
    if (d === "2020-08-05" && h === 6) t = 24; // 8/4 밤: 다음 날 06시가 24℃ → 열대야 아님
    if (d === "2020-07-31" && h === 18) t = 10; // 18시는 밤 구간 밖
    return { temperature: t };
  }));
  assert.equal(nightMin(hs, "2020-07-31"), 27); // 18시 10℃ 는 안 셈
  assert.equal(nightMin(hs, "2020-08-01"), 24.9); // 다음 날 05시 포함(자정 넘김)
  assert.equal(nightMin(hs, "2020-08-02"), null); // 03시 없음
  assert.equal(nightMin(hs, "2020-08-04"), 24);
  const y = tropicalYear(hs, parsePeriod("range:07-31:08-04"), 2020, "2020-08-05");
  assert.equal(y.status, "partial"); // 8/2 밤 판정 못 함
  assert.equal(y.value, null);
  assert.equal(y.countValid, 2); // 7/31, 8/3
  const y2 = tropicalYear(hs, parsePeriod("range:07-31:08-01"), 2020, "2020-08-05");
  assert.equal(y2.status, "complete");
  assert.equal(y2.value, 1);
  // 마지막 밤은 다음 날 09시까지 있어야 하므로 자료 마지막 날의 밤은 아직 판정하지 않음(진행 중)
  const y3 = tropicalYear(hs, parsePeriod("range:08-03:08-05"), 2020, "2020-08-05");
  assert.equal(y3.status, "ongoing");
});
test("시간자료: HH:MM 과 HH:MM:SS 중복은 19자 우선, 강수 플래그 9 는 결측, 공란은 무강수", () => {
  const hs = createHourlyStore("1", 2021);
  addHourlyRows(hs, [
    { observation_datetime: "2020-01-01 00:00:00", temperature: 1, precipitation: 2, rn_qcflg: "0" },
    { observation_datetime: "2020-01-01 00:00", temperature: 9, precipitation: null, rn_qcflg: null },
    { observation_datetime: "2020-01-01 01:00", temperature: 2, precipitation: null, rn_qcflg: "9" },
    { observation_datetime: "2020-01-01 02:00", temperature: null, precipitation: null, rn_qcflg: null, ta_qcflg: "9" },
  ]);
  const i0 = (ymdToDn("2020-01-01") - hs.base) * 24;
  assert.equal(hval(hs.ta, i0), 1);
  assert.equal(hval(hs.rn, i0), 2);
  assert.ok(Number.isNaN(hval(hs.rn, i0 + 1)));
  assert.equal(hval(hs.rn, i0 + 2), 0);
  assert.ok(Number.isNaN(hval(hs.ta, i0 + 2)));
  assert.equal(hs.rows, 3);
});

// ---------------------------------------------------------------- 산책·러닝, 출퇴근
test("사용자 조건: 기온·강수·풍속·시간대, 필요한 항목이 없는 시각은 분모에서 뺌", () => {
  const hs = createHourlyStore("1", 2021);
  addHourlyRows(hs, hourRows("2020-05-01", "2020-05-02", (d, h) => {
    if (h === 7 && d === "2020-05-01") return { temperature: 15, precipitation: 1.5 }; // 비
    if (h === 8 && d === "2020-05-01") return { temperature: 15, wind_speed: 9 }; // 바람
    if (h === 9 && d === "2020-05-01") return { temperature: 15, precipitation: null, rn_qcflg: "9" }; // 강수 결측 → 판정 불가
    if (h === 6 && d === "2020-05-02") return { temperature: 30 }; // 더움
    return { temperature: 15 };
  }));
  const c = parseOutdoor({ tmin: "10", tmax: "25", dry: "1", wind: "5", h1: "6", h2: "9" });
  const r = outdoorShare(hs, c, { fromYear: 2020, toYear: 2020, asOf: "2020-12-31" });
  const may = r.months[4];
  assert.equal(may.slots, 8);
  assert.equal(may.valid, 7);
  assert.equal(may.ok, 4); // 5/1 06, 5/2 07·08·09
  assert.equal(may.share, round1((4 / 7) * 100));
  // 강수 조건을 끄면 강수 결측 시각도 판정 가능
  const r2 = outdoorShare(hs, parseOutdoor({ tmin: "10", tmax: "25", dry: "0", wind: "off", h1: "6", h2: "9" }), { fromYear: 2020, toYear: 2020, asOf: "2020-12-31" });
  assert.equal(r2.months[4].valid, 8);
  assert.equal(r2.months[4].ok, 7);
  assert.throws(() => parseOutdoor({ tmin: "30", tmax: "10" }), StatsError);
  assert.throws(() => parseOutdoor({ h1: "9", h2: "6" }), StatsError);
  assert.equal(outdoorJudge(hs, 0, c), null); // 행 없는 시각
  assert.equal(hourlyLastDay(hs), "2020-05-02");
});
function round1(v) {
  return Math.round(v * 10) / 10;
}
test("출퇴근 강수: 평일만, 시간 비율과 '그 시간대가 모두 있는 날' 비율", () => {
  const hs = createHourlyStore("1", 2021);
  // 2020-06-01(월)~06-07(일). 월 08시 비, 화 18시 비, 수 07시 행 없음, 토 08시 비(평일만이면 빠짐)
  addHourlyRows(hs, hourRows("2020-06-01", "2020-06-07", (d, h) => {
    if (d === "2020-06-03" && h === 7) return null;
    const rain = (d === "2020-06-01" && h === 8) || (d === "2020-06-02" && h === 18) || (d === "2020-06-06" && h === 8);
    return { precipitation: rain ? 2 : null };
  }));
  const r = commuteShare(hs, { am: [7, 9], pm: [17, 19], weekdays: true }, { fromYear: 2020, toYear: 2020, asOf: "2020-12-31" });
  const am = r.windows.am.total;
  assert.equal(r.days, 5);
  assert.equal(am.hValid, 14); // 5일 × 3시각 − 1
  assert.equal(am.hRain, 1);
  assert.equal(am.dValid, 4); // 수요일은 07시가 없어 날 비율 분모에서 뺌
  assert.equal(am.dRain, 1);
  assert.equal(am.dShare, 25);
  assert.equal(r.windows.pm.total.hRain, 1);
  const all = commuteShare(hs, { am: [7, 9], pm: [17, 19], weekdays: false }, { fromYear: 2020, toYear: 2020, asOf: "2020-12-31" });
  assert.equal(all.windows.am.total.hRain, 2);
});

// ---------------------------------------------------------------- 눈: 신적설은 더하지 않고 날 수·최대만
test("눈: 공란은 쌓인 눈 없음(0), 날 수와 최대만(적설 합계 지표 없음)", () => {
  const s = buildDailyStore("1", rowsFor("2021-01-01", "2021-01-10", flat((d) => ({ max_new_snow: d === "2021-01-06" ? 3.2 : d === "2021-01-07" ? 1.0 : null, max_snow_depth: d >= "2021-01-06" && d <= "2021-01-08" ? 4 : null }))));
  const r = { start: "2021-01-01", end: "2021-01-10" };
  assert.equal(aggregate(s, "snow_days", r).value, 2);
  assert.equal(aggregate(s, "snow_cover_days", r).value, 3);
  assert.equal(aggregate(s, "snow_new_max", r).value, 3.2);
  assert.equal(aggregate(s, "snow_new_max", r).date, "2021-01-06");
});

// ---------------------------------------------------------------- API: 표 = CSV, 잘못된 입력
const fakeRes = () => ({ status: 0, headers: null, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = String(b ?? ""); } });
const jsonFn = (res, data, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
const parseCsv = (text) => text.replace(/^\uFEFF/, "").trim().split("\n").filter((l) => !l.startsWith("#")).map((l) => l.split(","));
test("API(2단계): 각 화면의 표와 CSV 가 같고, 잘못된 입력은 400", async () => {
  const store = buildDailyStore("108", rowsFor("1990-01-01", "2026-10-09", flat((d) => ({ max_temperature: d.slice(5, 7) === "07" ? 31 : 20, precipitation: d.slice(8) === "05" ? 6 : null }))));
  const hs = createHourlyStore("108", 2027);
  addHourlyRows(hs, hourRows("2025-06-01", "2025-10-01", (d, h) => ({ temperature: h >= 19 || h <= 9 ? 26 : 30, precipitation: h === 8 && d.endsWith("5") ? 1 : null })));
  const api = createStatsApi({
    statsData: { get: async () => store, version: () => 3 },
    statsHourly: { get: async () => hs, isLoaded: () => true },
    dayRow: async (id, date) => (date === "2024-05-05" ? { observation_date: date, avg_temperature: 18.2, max_temperature: 24.1, max_temperature_time: "1432", precipitation: null, max_new_snow: null } : null),
    stations: async () => [{ station_id: "108", station_name: "서울", region: "수도권", enabled: true }],
    officialDate: () => "2026-10-09",
    json: jsonFn,
  });
  const urls = [
    "/api/stats/life/heat?station=108",
    "/api/stats/life/streaks?station=108&kind=dry",
    "/api/stats/life/weekend?station=108&period=season:summer",
    "/api/stats/life/day?station=108&date=02-29",
    "/api/stats/life/outdoor?station=108&from=2025&to=2025",
    "/api/stats/life/commute?station=108&from=2025&to=2025",
    "/api/stats/life/tropical?station=108&from=2025&to=2025",
    "/api/stats/records?station=108",
    "/api/stats/date?station=108&date=2024-05-05",
    "/api/stats/highlights?station=108&set=life",
  ];
  for (const u of urls) {
    const r1 = fakeRes();
    assert.equal(await api({ method: "GET" }, r1, new URL(u, "http://x")), true, u);
    assert.equal(r1.status, 200, `${u} ${r1.body.slice(0, 200)}`);
    const j = JSON.parse(r1.body);
    if (!j.table) continue;
    const r2 = fakeRes();
    await api({ method: "GET" }, r2, new URL(`${u}&format=csv`, "http://x"));
    assert.match(r2.headers["content-type"], /text\/csv/, u);
    const csv = parseCsv(r2.body);
    assert.deepEqual(csv[0], j.table.columns.map((c) => c.label), u);
    assert.equal(csv.length - 1, j.table.rows.length, u);
    j.table.rows.forEach((row, i) => j.table.columns.forEach((c, k) => {
      const v = row[c.key];
      if (typeof v === "string" && /[",\n]/.test(v)) return; // 따옴표로 감싼 칸은 단순 split 으로 비교하지 않음
      assert.equal(csv[i + 1][k], v == null ? "" : String(v), `${u} row ${i} ${c.key}`);
    }));
  }
  // 열대야 응답 값 = 표
  const rt = fakeRes();
  await api({ method: "GET" }, rt, new URL("/api/stats/life/tropical?station=108&from=2025&to=2025", "http://x"));
  const jt = JSON.parse(rt.body);
  assert.equal(jt.rows[0].value, 122); // 6/1~9/30 모든 밤 26℃
  assert.equal(jt.table.rows[0].value, 122);
  assert.equal(jt.estimate, true);
  const rd = fakeRes();
  await api({ method: "GET" }, rd, new URL("/api/stats/date?station=108&date=2024-05-05", "http://x"));
  const jd = JSON.parse(rd.body);
  assert.equal(jd.fields.find((f) => f.key === "precipitation").note, "공란(기상청 일자료 관례상 무강수)");
  assert.equal(jd.fields.find((f) => f.key === "max_temperature_time").value, "14:32");
  assert.equal(jd.weekday, "일");
  for (const bad of ["/api/stats/life/day?station=108&date=04-31", "/api/stats/life/outdoor?station=108&tmin=30&tmax=10", "/api/stats/life/commute?station=108&am=9-7", "/api/stats/life/streaks?station=108&kind=x", "/api/stats/date?station=108&date=2023-02-29"]) {
    const r = fakeRes();
    await api({ method: "GET" }, r, new URL(bad, "http://x"));
    assert.equal(r.status, 400, bad);
  }
});

// ---------------------------------------------------------------- 시간자료 캐시: 저장하면 그 날짜부터 다시 읽음
test("시간자료 캐시: 처음엔 1990년부터 한 해씩, 저장 뒤엔 그 해부터만 다시 읽는다", async () => {
  const calls = [];
  let temp = 20;
  const loadRange = async (id, from, to) => {
    calls.push([from, to]);
    return from <= "2026-03-01" && to > "2026-03-01" ? [{ observation_datetime: "2026-03-01 05:00", temperature: temp, precipitation: null }] : [];
  };
  const sh = createStatsHourly({ loadRange, thisYear: () => 2026 });
  const hs = await sh.get("108");
  assert.equal(calls.length, 37); // 1990~2026
  assert.equal(calls[0][0], "1990-01-01");
  const i = (ymdToDn("2026-03-01") - hs.base) * 24 + 5;
  assert.equal(hval(hs.ta, i), 20);
  calls.length = 0;
  temp = 25;
  sh.invalidateRows([{ station_id: "108", observation_datetime: "2026-03-01 05:00" }]);
  const hs2 = await sh.get("108");
  assert.deepEqual(calls, [["2026-03-01", "2027-01-01"]]);
  assert.equal(hval(hs2.ta, i), 25);
  calls.length = 0;
  await sh.get("108");
  assert.equal(calls.length, 0); // 그 뒤엔 메모리
});
