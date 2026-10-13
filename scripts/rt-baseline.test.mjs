import test from "node:test";
import assert from "node:assert/strict";
import { basePeriods, hourlyCompare, dailyCompare, windowFor, centerDn, kst, diffWord } from "../rt-baseline.mjs";
import { createHourlyStore, addHourlyRows, buildDailyStore, ymdToDn, dnToYmd } from "../stats-engine.mjs";

test("기준기간: 2026 → 1990~2025, 2016~2025, 2021~2025; 새해에 자동 이동", () => {
  const p = basePeriods("2026-10-13");
  assert.deepEqual(p.map((x) => [x.id, x.from, x.to, x.years]), [["all", 1990, 2025, 36], ["r10", 2016, 2025, 10], ["r5", 2021, 2025, 5]]);
  const q = basePeriods("2027-01-01");
  assert.deepEqual(q.map((x) => [x.from, x.to]), [[1990, 2026], [2017, 2026], [2022, 2026]]);
  assert.equal(p[0].label, "1990년 이후 평균");
  // 과거 연도 분석: 2000년 기준이면 그 해·미래가 섞이지 않음
  assert.deepEqual(basePeriods("2000-05-01").map((x) => [x.from, x.to]), [[1990, 1999], [1990, 1999], [1995, 1999]]);
});

test("KST 변환", () => {
  const k = kst(Date.UTC(2026, 11, 31, 15, 30)); // 2027-01-01 00:30 KST
  assert.equal(k.ymd, "2027-01-01");
  assert.equal(k.hour, 0);
});

test("2/29 와 연말·연초 창", () => {
  assert.equal(dnToYmd(centerDn(2023, "02-29")), "2023-02-28");
  assert.equal(dnToYmd(centerDn(2024, "02-29")), "2024-02-29");
  const w = windowFor(2025, "12-30", 2025);
  assert.equal(dnToYmd(w.a), "2025-12-23");
  assert.equal(dnToYmd(w.b), "2025-12-31"); // 기준 끝 뒤(2026)는 자름
  const w2 = windowFor(2020, "01-02", 2025);
  assert.equal(dnToYmd(w2.a), "2019-12-26"); // 연초 창은 앞 해 12월 포함
});

// 합성 시간자료: 해 y 의 15시 기온 = y - 2000 (+ 날마다 0), 1993 년은 자료 없음, 2019년은 3일만
function synth() {
  const rows = [];
  for (let y = 1990; y <= 2026; y++) {
    if (y === 1993) continue;
    for (let d = 1; d <= 31; d++) {
      if (y === 2019 && d > 3) continue;
      const day = `${y}-10-${String(d).padStart(2, "0")}`;
      rows.push({ observation_datetime: `${day} 15:00:00`, temperature: y - 2000 + d / 100, precipitation: d % 2 ? null : 0.5, ta_qcflg: "", rn_qcflg: d === 10 ? "9" : "" });
    }
  }
  const hs = createHourlyStore("1", 2026);
  addHourlyRows(hs, rows);
  return hs;
}

test("시간 비교: 연도별 같은 무게·누락 연도·독립 검산", () => {
  const hs = synth();
  const r = hourlyCompare(hs, "2026-10-13", 15, "ta", 30);
  const all = r[0];
  // 독립 검산: 해마다 10/6~10/20 (y-2000 + d/100) 평균, 1993·2019(3일<7.5) 제외
  const ys = [];
  for (let y = 1990; y <= 2025; y++) if (y !== 1993 && y !== 2019) ys.push(y - 2000 + 0.13);
  const expect = ys.reduce((a, b) => a + b, 0) / ys.length;
  assert.equal(all.validYears, 34);
  assert.deepEqual(all.missingYears, [1993, 2019]);
  assert.equal(all.status, "partial");
  assert.equal(all.mean, Math.round(expect * 10) / 10);
  assert.equal(all.samples, 34 * 15);
  assert.equal(r[2].from, 2021);
  assert.equal(r[2].validYears, 5);
  assert.equal(r[2].mean, Math.round((21 + 22 + 23 + 24 + 25 + 5 * 0.13) / 5 * 10) / 10);
  // 백분위 검산
  const vals = [];
  for (const y of ys) for (let d = 6; d <= 20; d++) vals.push(Math.round((y - 0.13 + d / 100) * 10) / 10);
  const x = 30;
  const pct = (vals.filter((v) => v < x).length + vals.filter((v) => v === x).length / 2) / vals.length * 100;
  assert.equal(all.percentile, Math.round(pct * 10) / 10);
  assert.equal(all.rankHigh, 1);
  assert.equal(all.newHigh, true);
  // 최근 10년: 2019 빠져 9/10 ≥ 8 → partial 이지만 계산
  assert.equal(r[1].validYears, 9);
  assert.equal(r[1].status, "partial");
  // 5년: 표본 75 ≥ 60 → 순위 있음
  assert.ok(r[2].percentile != null);
});

test("기준 연도 부족이면 '비교 데이터 부족'", () => {
  const hs = createHourlyStore("1", 2026);
  const rows = [];
  for (const y of [2023, 2024, 2025]) for (let d = 6; d <= 20; d++) rows.push({ observation_datetime: `${y}-10-${String(d).padStart(2, "0")} 15:00:00`, temperature: 10 });
  addHourlyRows(hs, rows);
  const r = hourlyCompare(hs, "2026-10-13", 15, "ta", 12);
  assert.equal(r[2].status, "insufficient");
  assert.equal(r[2].statusText, "비교 데이터 부족");
  assert.equal(r[2].mean, null);
  assert.equal(r[0].status, "insufficient");
});

test("결측과 0 구분: 강수 품질 9 는 빼고, 공란은 0", () => {
  const hs = synth();
  const r = hourlyCompare(hs, "2026-10-13", 15, "rn", NaN);
  // 10/6~10/20: 짝수일 0.5 7개(10일은 품질 9 → 제외), 홀수일 0 7개 → 해마다 3.5/14 = 0.25 → 0.3
  assert.equal(r[2].samples, 5 * 14);
  assert.equal(r[2].mean, 0.3);
});

test("일자료 비교(최고기온)", () => {
  const rows = [];
  for (let y = 2016; y <= 2026; y++) for (let d = 1; d <= 28; d++) rows.push({ observation_date: `${y}-02-${String(d).padStart(2, "0")}`, max_temperature: y === 2020 && d === 20 ? null : d, avg_temperature: 1 });
  rows.push({ observation_date: "2024-02-29", max_temperature: 29 });
  const st = buildDailyStore("1", rows);
  const r = dailyCompare(st, "2027-02-29".replace("2027", "2028"), "max", 20);
  // 2028 기준 r5 = 2023~2027(2027 자료 없음 → 4/5 = minYears 4 → partial)
  assert.equal(r[2].validYears, 4);
  // 2024 창: 2/22~3/7 → 2/22~2/29 만 있음(8개 ≥ 7.5)
  assert.ok(r[2].mean != null);
  assert.equal(r[2].status, "partial");
});

test("말: 과장하지 않음", () => {
  assert.equal(diffWord(0.4), "비슷");
  assert.equal(diffWord(2), "조금 높음");
  assert.equal(diffWord(-6), "상당히 낮음");
});
