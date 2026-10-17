// 달력 변환 테스트: 기대값은 한국천문연구원 음양력 변환 결과(scripts/fixtures/kasi-lunar-cases.json)에서 가져온다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { solarToLunar, lunarToSolar, resolveYear, switchBasis, parseDateSpec, lunarYearInfo, ymdStr, LUNAR_RANGE } from "../calendar-resolver.mjs";

const FIX = JSON.parse(fs.readFileSync(new URL("./fixtures/kasi-lunar-cases.json", import.meta.url), "utf8"));

test("KASI 대조: 양력→음력·음력→양력·윤달·월 일수·없는 날짜", () => {
  let n = 0;
  for (const c of FIX.cases) {
    if (c.q === "solc") {
      const r = solarToLunar(c.in);
      assert.equal(r.status, "ok", c.in);
      assert.equal(ymdStr(r.year, r.month, r.day), c.lunar, `solc ${c.in}`);
      assert.equal(r.leap, c.leap, `leap ${c.in}`);
      assert.equal(r.monthDays, c.monthDays, `monthDays ${c.in}`);
    } else {
      const [y, m, d] = c.in.split("-").map(Number);
      if (c.none) {
        assert.equal(lunarToSolar(y, m, d, false).status, "nodate", `none ${c.in}`);
        assert.equal(lunarToSolar(y, m, d, true).status, "nodate", `none leap ${c.in}`);
      } else {
        const r = lunarToSolar(y, m, d, c.leap);
        assert.equal(r.status, "ok", c.in);
        assert.equal(r.solar, c.solar, `lunc ${c.in} leap=${c.leap}`);
        assert.equal(r.monthDays, c.monthDays, `lunc monthDays ${c.in}`);
      }
    }
    n++;
  }
  assert.ok(n >= 90, `cases ${n}`);
});

test("평달만 있는 해의 윤달 요청은 대체하지 않는다", () => {
  for (const c of FIX.cases.filter((x) => x.q === "lunc" && !x.none)) {
    const [y, m, d] = c.in.split("-").map(Number);
    const hasLeap = FIX.cases.some((x) => x.q === "lunc" && x.in === c.in && x.leap);
    if (!hasLeap) assert.equal(lunarToSolar(y, m, d, true).status, "nodate", `${c.in} 윤달 없음`);
  }
  assert.equal(lunarYearInfo(2026).leapMonth, null);
  assert.equal(lunarYearInfo(2025).leapMonth, 6);
  assert.deepEqual(lunarToSolar(2026, 6, 1, true), { status: "nodate", reason: "noLeap" });
});

test("한국 음력 ≠ 중국력: 1997·2027 설날", () => {
  assert.equal(lunarToSolar(1997, 1, 1).solar, "1997-02-08");
  assert.equal(lunarToSolar(2027, 1, 1).solar, "2027-02-07");
});

test("전 구간 왕복(1900-01-31~2050-12-31 매일): 양력→음력→양력 같음", () => {
  for (let t = Date.UTC(1900, 0, 31); t <= Date.UTC(2050, 11, 31); t += 86400000) {
    const s = new Date(t).toISOString().slice(0, 10);
    const l = solarToLunar(s);
    assert.equal(lunarToSolar(l.year, l.month, l.day, l.leap).solar, s);
  }
  assert.equal(solarToLunar("1900-01-30").status, "range");
  assert.equal(solarToLunar("2051-01-01").status, "range");
  assert.equal(lunarToSolar(2050, 12, 1).status, "range");
  assert.equal(LUNAR_RANGE.solarTo, "2050-12-31");
});

test("양력 2월 29일: 윤년만 존재, 평년은 nodate(2/28·3/1 대체 없음)", () => {
  const s = parseDateSpec({ calendar: "solar", month: 2, day: 29 }).spec;
  assert.equal(resolveYear(s, 2024).solarDate, "2024-02-29");
  assert.equal(resolveYear(s, 2025).status, "nodate");
  assert.equal(resolveYear(s, 2025).solarDate, null);
  assert.equal(resolveYear(s, 1900).status, "nodate"); // 1900 은 평년
  assert.equal(resolveYear(s, 2000).status, "ok");
  assert.equal(parseDateSpec({ calendar: "solar", month: 2, day: 30 }).ok, false);
  assert.equal(parseDateSpec({ calendar: "solar", month: 4, day: 31 }).ok, false);
});

test("음력 30일 없는 해·연말 날짜의 다음 양력 연도 대응(기준연도 유지)", () => {
  const s30 = parseDateSpec({ calendar: "lunar", month: 12, day: 30 }).spec;
  assert.equal(resolveYear(s30, 2025).status, "nodate");
  assert.equal(resolveYear(s30, 2025).reason, "no30");
  const s29 = parseDateSpec({ calendar: "lunar", month: 12, day: 29 }).spec;
  const r = resolveYear(s29, 2025);
  assert.equal(r.referenceYear, 2025);
  assert.equal(r.solarDate, "2026-02-16");
});

test("기준 전환: 선택 연도의 실제 날짜를 보존", () => {
  const solar = parseDateSpec({ calendar: "solar", month: 10, day: 17 }).spec;
  const a = switchBasis(solar, 2026, "lunar");
  assert.deepEqual(a.spec, { calendar: "lunar", month: 9, day: 7, leapMonth: false });
  assert.equal(resolveYear(a.spec, a.selectedYear).solarDate, "2026-10-17");
  const back = switchBasis(a.spec, a.selectedYear, "solar");
  assert.deepEqual(back.spec, solar);
  // 윤달 날짜에서 전환하면 윤달 표시 유지
  const leapDay = switchBasis(parseDateSpec({ calendar: "solar", month: 7, day: 25 }).spec, 2025, "lunar");
  assert.deepEqual(leapDay.spec, { calendar: "lunar", month: 6, day: 1, leapMonth: true });
  // 평년 2/29 는 전환 불가(임의 변환 없음)
  const feb = switchBasis(parseDateSpec({ calendar: "solar", month: 2, day: 29 }).spec, 2026, "lunar");
  assert.equal(feb.ok, false);
  // 음력 연말 → 양력은 다음 해(선택 연도도 따라감)
  const ye = switchBasis(parseDateSpec({ calendar: "lunar", month: 12, day: 29 }).spec, 2025, "solar");
  assert.equal(ye.selectedYear, 2026);
  assert.deepEqual(ye.spec, { calendar: "solar", month: 2, day: 16, leapMonth: false });
});
