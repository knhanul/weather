// Year-specific solar terms: apparent solar longitude, converted to Korean civil date.
// Astronomy Engine (MIT); stems from lunar-javascript (MIT). No fixed-date approximation.
import * as Astronomy from "astronomy-engine";
import Lunar from "lunar-javascript";
export const TERM_NAMES = [
  "소한",
  "대한",
  "입춘",
  "우수",
  "경칩",
  "춘분",
  "청명",
  "곡우",
  "입하",
  "소만",
  "망종",
  "하지",
  "소서",
  "대서",
  "입추",
  "처서",
  "백로",
  "추분",
  "한로",
  "상강",
  "입동",
  "소설",
  "대설",
  "동지",
];
export const SEASON_NAMES = ["초복", "중복", "말복", ...TERM_NAMES];
export const CALENDAR_SOURCE = {
  method:
    "태양의 겉보기 황경을 Astronomy Engine 2.1.19로 계산 → KST 날짜. 경일은 lunar-javascript 1.7.7 일간. 하지·입추 당일이 경일이면 포함.",
  links: [
    "https://github.com/cosinekitty/astronomy/tree/master/source/js",
    "https://encykorea.aks.ac.kr/Article/E0023653",
    "https://doi.org/10.5303/pkas.2014.29.1.001",
  ],
};
const cache = new Map();
export const kstDate = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const shiftDate = (d, n) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export function seasonDates(year) {
  if (!Number.isInteger(year) || year < 1970 || year > 2050)
    throw new RangeError("절기 계산은 1970~2050년을 지원합니다");
  if (cache.has(year)) return cache.get(year);
  const dates = {};
  TERM_NAMES.forEach((name, i) => {
    const month = Math.floor(i / 2) + 1,
      day = i % 2 ? 17 : 1;
    const t = Astronomy.SearchSunLongitude(
      (285 + i * 15) % 360,
      new Date(Date.UTC(year, month - 1, day)),
      10,
    );
    if (!t) throw new Error("절기 계산 실패");
    dates[name] = kstDate(t.date);
  });
  const geng = (start, n) => {
    for (let i = 0; i < 45; i++) {
      const d = shiftDate(start, i),
        [y, m, dd] = d.split("-").map(Number);
      if (Lunar.Solar.fromYmd(y, m, dd).getLunar().getDayGan() === "庚" && --n === 0) return d;
    }
    throw new Error("경일 계산 실패");
  };
  dates["초복"] = geng(dates["하지"], 3);
  dates["중복"] = geng(dates["하지"], 4);
  dates["말복"] = geng(dates["입추"], 1);
  cache.set(year, Object.freeze(dates));
  return dates;
}
