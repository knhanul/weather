// 날짜 기준(양력·음력) → 기준연도별 실제 양력 날짜 대응. 순수 함수(DB·HTTP·시간대 모름).
// 음력 = 대한민국 음양력(한국천문연구원 자료 기반 표, calendar-lunar-data.mjs). 중국력과 같다고 가정하지 않는다(예: 1997·2027 설날이 다름 — 테스트).
// 규칙(바꾸면 CALENDAR_VERSION 을 올린다):
//  - 양력 2월 29일은 윤년에만 있다. 2/28·3/1 로 바꾸지 않는다 → 그해 status "nodate"(그해에는 없는 날짜).
//  - 음력 윤달은 그해에 그 달의 윤달이 실제로 있을 때만 대응 날짜를 만든다. 없으면 평달로 바꾸지 않는다 → "nodate"(noLeap).
//  - 음력 30일이 없는(작은달, 29일) 해는 29일로 당기지 않는다 → "nodate"(no30).
//  - 변환표 범위(음력 1900-01-01 ~ 2050-11-18, 양력 1900-01-31 ~ 2050-12-31) 밖은 "range"(음력 변환 지원 범위 밖).
//  - 기준연도 = 그 카드가 고른 달력의 연도. 음력 2025년 12월 날짜가 양력 2026년이어도 기준연도는 2025.
import { LUNAR_BASE_YEAR, LUNAR_DATA } from "./calendar-lunar-data.mjs";

export const CALENDAR_VERSION = "kr-lunar-1900-2050.v1"; // 표 출처 korean-lunar-calendar 0.4.0, KASI 대조 2026-10-17
const DAY_MS = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
export const ymdStr = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const dnOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
function ymdOfDn(dn) {
  const t = new Date(dn * DAY_MS);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
export const isSolarLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const solarMonthDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const LUNAR_RANGE = { fromYear: LUNAR_BASE_YEAR, toYear: LUNAR_BASE_YEAR + LUNAR_DATA.length - 1, lastLunar: "2050-11-18", solarFrom: "1900-01-31", solarTo: "2050-12-31" };
const ANCHOR_DN = dnOf(1900, 1, 31); // 음력 1900-01-01
const SOLAR_MAX_DN = dnOf(2050, 12, 31);

// 음력 한 해의 달 목록(순서대로, 윤달은 그 평달 바로 뒤) — 미리 계산
const YEARS = (() => {
  const out = new Map();
  let start = ANCHOR_DN;
  for (let k = 0; k < LUNAR_DATA.length; k++) {
    const v = LUNAR_DATA[k];
    const y = LUNAR_BASE_YEAR + k;
    const leapMonth = (v >> 12) & 15;
    const months = [];
    let dn = start;
    for (let m = 1; m <= 12; m++) {
      const days = (v >> (12 - m)) & 1 ? 30 : 29;
      months.push({ month: m, leap: false, days, startDn: dn });
      dn += days;
      if (leapMonth === m) {
        const ld = (v >> 16) & 1 ? 30 : 29;
        months.push({ month: m, leap: true, days: ld, startDn: dn });
        dn += ld;
      }
    }
    const yearDays = (v >> 17) & 511;
    if (dn - start !== yearDays) throw new Error(`lunar table inconsistent year=${y}`);
    out.set(y, { year: y, leapMonth: leapMonth || null, months, startDn: start, days: yearDays });
    start = dn;
  }
  return out;
})();

export function lunarYearInfo(y) {
  const info = YEARS.get(y);
  return info ? { year: y, leapMonth: info.leapMonth, days: info.days, months: info.months.map((m) => ({ month: m.month, leap: m.leap, days: m.days, start: ymdStr(...ymdOfDn(m.startDn)) })) } : null;
}
export function lunarMonthDays(y, m, leap = false) {
  const info = YEARS.get(y);
  const mo = info && info.months.find((x) => x.month === m && x.leap === !!leap);
  return mo ? mo.days : null;
}

// 음력 → 양력. { status:"ok", solar } | { status:"nodate", reason:"noLeap"|"no30"|"invalid" } | { status:"range" }
export function lunarToSolar(y, m, d, leap = false) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 30) return { status: "nodate", reason: "invalid" };
  const info = YEARS.get(y);
  if (!info) return { status: "range" };
  const mo = info.months.find((x) => x.month === m && x.leap === !!leap);
  if (!mo) return { status: "nodate", reason: "noLeap" };
  if (d > mo.days) return { status: "nodate", reason: "no30" };
  const dn = mo.startDn + d - 1;
  if (dn > SOLAR_MAX_DN) return { status: "range" };
  return { status: "ok", solar: ymdStr(...ymdOfDn(dn)), monthDays: mo.days };
}

// 양력 → 음력. { status:"ok", year, month, day, leap, monthDays, text } | { status:"range" } | { status:"nodate" }
export function solarToLunar(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return { status: "nodate", reason: "invalid" };
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > solarMonthDays(y, mo)) return { status: "nodate", reason: "invalid" };
  const dn = dnOf(y, mo, d);
  if (dn < ANCHOR_DN || dn > SOLAR_MAX_DN) return { status: "range" };
  let info = YEARS.get(y);
  if (!info || dn < info.startDn) info = YEARS.get(y - 1);
  if (!info) return { status: "range" };
  let pick = null;
  for (const x of info.months) if (dn >= x.startDn) pick = x;
  return { status: "ok", year: info.year, month: pick.month, day: dn - pick.startDn + 1, leap: pick.leap, monthDays: pick.days, text: lunarText(info.year, pick.month, dn - pick.startDn + 1, pick.leap) };
}
export const lunarText = (y, m, d, leap) => `${y != null ? `음력 ${y}년 ` : "음력 "}${leap ? "윤" : ""}${m}월 ${d}일`;

// ---------------------------------------------------------------- 날짜 기준(DateSpec)
// { calendar: "solar"|"lunar", month, day, leapMonth } — leapMonth 는 lunar 에서만 의미(solar 는 늘 false)
export function parseDateSpec({ calendar = "solar", month, day, leap = false } = {}) {
  const cal = calendar === "lunar" ? "lunar" : calendar === "solar" ? "solar" : null;
  if (!cal) return { ok: false, message: "날짜 기준은 solar(양력) 또는 lunar(음력)입니다" };
  const mo = Number(month);
  const d = Number(day);
  if (!Number.isInteger(mo) || mo < 1 || mo > 12) return { ok: false, message: "월은 1~12 사이 숫자입니다" };
  const maxD = cal === "solar" ? solarMonthDays(2000, mo) : 30; // 2000 = 윤년(2/29 허용) · 음력은 30일까지
  if (!Number.isInteger(d) || d < 1 || d > maxD) return { ok: false, message: cal === "solar" ? `양력 ${mo}월에는 ${d}일이 없습니다` : "음력 날짜는 1~30일입니다" };
  return { ok: true, spec: { calendar: cal, month: mo, day: d, leapMonth: cal === "lunar" ? !!(leap === true || leap === "1" || leap === 1 || leap === "true") : false } };
}
export const specKey = (s) => `${s.calendar === "lunar" ? "L" : "S"}${p2(s.month)}${p2(s.day)}${s.leapMonth ? "L" : ""}`;
export const specLabel = (s) => (s.calendar === "lunar" ? `음력 ${s.month}월 ${s.day}일·${s.leapMonth ? "윤달" : "평달"}` : `양력 ${s.month}월 ${s.day}일`);
export const specCompareText = (s) => `매년 ${specLabel(s)}을 비교 중`;

// 기준연도 하나의 실제 날짜. { referenceYear, status, solarDate, lunarDate, isLeapMonth, reason? }
// status: ok | nodate | range
export function resolveYear(spec, refYear) {
  if (spec.calendar === "solar") {
    if (spec.month === 2 && spec.day === 29 && !isSolarLeap(refYear)) return { referenceYear: refYear, status: "nodate", reason: "noFeb29", solarDate: null, lunarDate: null, isLeapMonth: false };
    const solarDate = ymdStr(refYear, spec.month, spec.day);
    const l = solarToLunar(solarDate);
    return { referenceYear: refYear, status: "ok", solarDate, lunarDate: l.status === "ok" ? ymdStr(l.year, l.month, l.day) : null, isLeapMonth: l.status === "ok" ? l.leap : false, lunarText: l.status === "ok" ? l.text : null };
  }
  const r = lunarToSolar(refYear, spec.month, spec.day, spec.leapMonth);
  const lunarDate = ymdStr(refYear, spec.month, spec.day);
  if (r.status !== "ok") return { referenceYear: refYear, status: r.status, reason: r.reason || null, solarDate: null, lunarDate: r.status === "range" ? null : lunarDate, isLeapMonth: !!spec.leapMonth };
  return { referenceYear: refYear, status: "ok", solarDate: r.solar, lunarDate, isLeapMonth: !!spec.leapMonth, lunarText: lunarText(refYear, spec.month, spec.day, spec.leapMonth) };
}
export function resolveYears(spec, fromYear, toYear) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) out.push(resolveYear(spec, y));
  return out;
}

// 기준 전환: 선택 연도의 실제 양력 날짜를 보존해 새 기준의 월·일을 만든다.
// 예) 양력 2026-10-17 → 음력 기준 { lunar 9/7 평달 }. 실제 날짜가 없으면(2/29 의 평년 등) ok:false — 임의로 바꾸지 않는다.
export function switchBasis(spec, selectedYear, toCalendar) {
  if (spec.calendar === toCalendar) return { ok: true, spec, solarDate: resolveYear(spec, selectedYear).solarDate };
  const cur = resolveYear(spec, selectedYear);
  if (cur.status !== "ok") return { ok: false, reason: cur.status === "range" ? "range" : "nodate", message: cur.status === "range" ? "음력 변환 지원 범위 밖입니다" : `${selectedYear}년에는 이 날짜가 없어 기준을 바꿀 수 없습니다. 실제로 있는 날짜를 고르세요` };
  if (toCalendar === "lunar") {
    const l = solarToLunar(cur.solarDate);
    if (l.status !== "ok") return { ok: false, reason: "range", message: "음력 변환 지원 범위 밖입니다" };
    return { ok: true, spec: { calendar: "lunar", month: l.month, day: l.day, leapMonth: l.leap }, selectedYear: l.year, solarDate: cur.solarDate };
  }
  const [y, m, d] = cur.solarDate.split("-").map(Number);
  return { ok: true, spec: { calendar: "solar", month: m, day: d, leapMonth: false }, selectedYear: y, solarDate: cur.solarDate };
}
