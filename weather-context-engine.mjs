// Read-only weather comparisons. Same ASOS station only; never use forecast/grid
// temperatures as if they were station observations. Missing means null, not zero.
import { ymdToDn, dnToYmd, hourIdx, hval } from "./stats-engine.mjs";
import { seasonDates, SEASON_NAMES, CALENDAR_SOURCE, shiftDate } from "./season-calendar.mjs";
export const CRITERIA = {
  warmer: { label: "더 따뜻한 날", field: "avg", hourly: "ta", unit: "℃", direction: 1, tie: 0.5 },
  cooler: { label: "더 선선한 날", field: "avg", hourly: "ta", unit: "℃", direction: -1, tie: 0.5 },
  dry: { label: "비가 적은 날", field: "rain", hourly: "rn", unit: "mm", direction: -1, tie: 0.1 },
  calm: {
    label: "바람이 약한 날",
    field: "wind",
    hourly: "ws",
    unit: "m/s",
    direction: -1,
    tie: 0.5,
  },
};
export const finite = (v) => (Number.isFinite(v) ? v : null);
export const mean = (xs) => {
  const a = xs.filter(Number.isFinite);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
};
export function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  const n = ymdToDn(d);
  return Number.isFinite(n) && dnToYmd(n) === d;
}
export function opponentDate(date, preset, chosen) {
  if (preset === "yesterday") return shiftDate(date, -1);
  if (preset === "week") return shiftDate(date, -7);
  if (preset === "year") {
    const d = `${+date.slice(0, 4) - 1}${date.slice(4)}`;
    return validDate(d) ? d : null;
  }
  return validDate(chosen) ? chosen : null;
}
export function dailyValue(s, d, k, today) {
  if (!validDate(d) || d >= today) return null;
  const i = ymdToDn(d) - s.base;
  return s.present[i] ? finite(s[k]?.[i]) : null;
}
export function hourlyValue(h, d, hour, k) {
  if (!h || !d || !Number.isInteger(hour)) return null;
  const i = hourIdx(h, d, hour);
  return h.src[i] ? finite(hval(h[k], i)) : null;
}
export function latestTodayHour(h, today, maxHour = 23) {
  for (let hr = maxHour; hr >= 0; hr--) if (hourlyValue(h, today, hr, "ta") !== null) return hr;
  return null;
}
const diff = (a, b) => (a === null || b === null ? null : finite(a - b));
export function recentContext({ daily, hourly, today, maxHour = 23 }) {
  const hour = latestTodayHour(hourly, today, maxHour),
    yesterday = shiftDate(today, -1);
  const value = hourlyValue(hourly, today, hour, "ta");
  const prev = hourlyValue(hourly, yesterday, hour, "ta");
  const sample = Array.from({ length: 7 }, (_, i) => ({
    date: shiftDate(today, -i - 1),
    value: hourlyValue(hourly, shiftDate(today, -i - 1), hour, "ta"),
  }));
  const avg = mean(sample.map((p) => p.value)),
    n = sample.filter((p) => p.value !== null).length;
  const extras = [
    ["rn", "직전 1시간 강수량", "mm", 1],
    ["ws", "풍속", "m/s", 2],
    ["hm", "습도", "%p", 10],
  ].flatMap(([k, label, unit, threshold]) => {
    const a = hourlyValue(hourly, today, hour, k),
      b = hourlyValue(hourly, yesterday, hour, k),
      delta = diff(a, b);
    return delta !== null && Math.abs(delta) + 1e-9 >= threshold
      ? [{ key: k, label, unit, today: a, yesterday: b, diff: delta, threshold }]
      : [];
  });
  return {
    today,
    yesterday,
    hour,
    value,
    previous: prev,
    diff: diff(value, prev),
    recent7: { mean: avg, days: n, expected: 7, diff: diff(value, avg), points: sample },
    extras,
    available: value !== null,
    message:
      value === null
        ? "오늘 같은 관측소의 시간 관측이 아직 없어 비교할 수 없어요. 격자 실황·예보로 대신하지 않아요."
        : `${today} ${hour}시 KST 관측 기준`,
    series: Array.from({ length: 24 }, (_, hr) => ({
      hour: hr,
      today: hr <= maxHour ? hourlyValue(hourly, today, hr, "ta") : null,
      yesterday: hourlyValue(hourly, yesterday, hr, "ta"),
    })),
    recentDays: sample
      .slice()
      .reverse()
      .map((p) => ({
        date: p.date,
        max: dailyValue(daily, p.date, "max", today),
        min: dailyValue(daily, p.date, "min", today),
      })),
    policy:
      "같은 ASOS 관측소·같은 정시. 최근 7일은 오늘 제외, 유효한 날만 평균(일수 표시). 강수는 직전 1시간끼리만 비교. 보간·예보 혼합 없음.",
    thresholds:
      "추가 안내: 강수 차이 1mm 이상 · 풍속 2m/s 이상 · 습도 10%p 이상. 서비스 설명 기준이며 공식 기상특보 기준이 아닙니다.",
  };
}
export function criterionResult(id, a, b, n = 1) {
  const c = CRITERIA[id],
    delta = diff(a, b);
  const winner =
    delta === null
      ? "unavailable"
      : Math.abs(delta) <= c.tie + 1e-9
        ? "draw"
        : delta * c.direction > 0
          ? "A"
          : "B";
  return {
    id,
    ...c,
    a,
    b,
    diff: delta,
    samples: n,
    winner,
    reason:
      winner === "unavailable"
        ? "관측 자료가 없어 비교 불가"
        : winner === "draw"
          ? `차이 ${Math.abs(delta).toFixed(1)}${c.unit} — ${c.tie}${c.unit} 이하는 무승부`
          : `${winner === "A" ? "기준 날" : "상대"} 승 — ${c.label} 기준, 차이 ${Math.abs(delta).toFixed(1)}${c.unit}`,
  };
}
export function contextBattle({
  daily,
  hourly,
  today,
  maxHour = 23,
  date1,
  date2,
  period = "exact",
  criteria = ["cooler", "dry", "calm"],
}) {
  if (!validDate(date1) || !validDate(date2))
    throw new RangeError(
      "실제로 있는 양력 날짜를 골라 주세요 (윤일의 작년 같은 날은 없을 수 있어요)",
    );
  if (!["exact", "recent5", "recent10", "all"].includes(period))
    throw new RangeError("지원하지 않는 비교 기간입니다");
  if (!criteria.length || criteria.some((k) => !Object.hasOwn(CRITERIA, k)))
    throw new RangeError("승리 조건을 하나 이상 골라 주세요");
  const isHourly = date1 === today || (period === "exact" && date2 === today);
  const hour = isHourly ? latestTodayHour(hourly, today, maxHour) : null;
  // Same hour also for historical opponents when today is ongoing. No day totals vs partials.
  const read = (date, c) =>
    date > today
      ? null
      : isHourly
        ? hourlyValue(hourly, date, hour, c.hourly)
        : dailyValue(daily, date, c.field, today);
  const hourlyFirst =
    hourly?.firstIdx >= 0 ? dnToYmd(hourly.base + Math.floor(hourly.firstIdx / 24)) : null;
  const hourlyLast =
    hourly?.lastIdx >= 0 ? dnToYmd(hourly.base + Math.floor(hourly.lastIdx / 24)) : null;
  const supportedFirst = isHourly ? hourlyFirst : daily.firstDate;
  const supportedLast = isHourly ? hourlyLast : daily.lastDate;
  const endYear = +today.slice(0, 4) - 1,
    firstYear = Math.max(1970, +(supportedFirst || today).slice(0, 4), isHourly ? 1990 : 1970);
  const fromYear =
    period === "all" ? firstYear : Math.max(firstYear, endYear - (period === "recent5" ? 4 : 9));
  const dates =
    period === "exact"
      ? [date2]
      : Array.from(
          { length: Math.max(0, endYear - fromYear + 1) },
          (_, i) => `${fromYear + i}${date2.slice(4)}`,
        )
          .filter(validDate)
          .filter(
            (d) =>
              d !== date1 &&
              supportedFirst &&
              supportedLast &&
              d >= supportedFirst &&
              d <= supportedLast,
          );
  const rows = [...new Set(criteria)].map((id) => {
    const c = CRITERIA[id],
      values = dates.map((d) => read(d, c)),
      n = values.filter(Number.isFinite).length;
    return criterionResult(id, read(date1, c), mean(values), n);
  });
  return {
    date1,
    date2,
    period,
    rows,
    hour,
    kind: isHourly ? "같은 정시 관측" : "완료된 하루 공식 관측",
    fieldNote: isHourly
      ? `기온·풍속 = 같은 ${hour ?? "–"}시 관측, 강수 = 그 정시 직전 1시간. 하루 전체 대결이 아닙니다.`
      : "기온 = 일평균기온, 강수 = 일강수량, 바람 = 일평균풍속.",
    window:
      period === "exact"
        ? null
        : {
            fromYear: dates.length ? fromYear : null,
            toYear: dates.length ? endYear : null,
            expected: dates.length,
          },
    wins: {
      A: rows.filter((r) => r.winner === "A").length,
      B: rows.filter((r) => r.winner === "B").length,
      draw: rows.filter((r) => r.winner === "draw").length,
      unavailable: rows.filter((r) => r.winner === "unavailable").length,
    },
    available: {
      first: supportedFirst,
      last: supportedLast,
      kind: isHourly ? "시간자료" : "일자료",
      lastCompleted: daily.lastDate && daily.lastDate < today ? daily.lastDate : null,
    },
    policy:
      "선택한 조건에서만 승패를 판단합니다. 더 덥거나 선선하다고 무조건 좋은 날은 아닙니다. 결측은 패배가 아닌 비교 불가. 차이가 무승부 기준 이하면 무승부. 여러 해 비교는 상대의 월·일 관측 평균이며 실제 표본 수를 항목마다 표시합니다.",
  };
}
const span = (a, b) =>
  Array.from({ length: ymdToDn(b) - ymdToDn(a) + 1 }, (_, i) => shiftDate(a, i));
const summary = (daily, dates, k, today) => {
  const values = dates.map((d) => dailyValue(daily, d, k, today));
  return {
    mean: mean(values),
    days: values.filter(Number.isFinite).length,
    expected: dates.length,
  };
};
export function seasonalContext({ daily, today, year, name }) {
  if (!SEASON_NAMES.includes(name)) throw new RangeError("지원하지 않는 절기입니다");
  const date = seasonDates(year)[name],
    v = dailyValue(daily, date, "avg", today);
  const neighbors = span(shiftDate(date, -7), shiftDate(date, 7)).filter((d) => d !== date);
  const adjacent = summary(daily, neighbors, "avg", today);
  const before = summary(daily, span(shiftDate(date, -7), shiftDate(date, -1)), "avg", today);
  const after = summary(daily, span(shiftDate(date, 1), shiftDate(date, 7)), "avg", today);
  const result = {
    year,
    date,
    value: v,
    adjacent,
    before,
    after,
    change: diff(after.mean, before.mean),
    diff: diff(v, adjacent.mean),
    summer: null,
    winter: null,
    firstFreeze: null,
    laterCold: null,
  };
  if (["초복", "중복", "말복"].includes(name)) {
    result.summer = summary(daily, span(`${year}-06-01`, `${year}-08-31`), "avg", today);
    result.summer.diff = diff(v, result.summer.mean);
  }
  if (name === "입동") {
    const dates = span(`${year}-09-01`, shiftDate(`${year + 1}-03-01`, -1)),
      available = dates.filter((d) => dailyValue(daily, d, "min", today) !== null);
    result.firstFreeze = {
      date: available.find((d) => dailyValue(daily, d, "min", today) < 0) || null,
      days: available.length,
      expected: dates.length,
      note: "그해 9월~다음해 2월 중 관측된 첫 일최저 영하. 결측일이 있으면 실제 첫날을 확정할 수 없어요.",
    };
  }
  if (name === "입춘") {
    const dates = span(shiftDate(date, 1), shiftDate(date, 30));
    result.laterCold = {
      ...summary(daily, dates, "min", today),
      daysBelowZero: dates.some((d) => dailyValue(daily, d, "min", today) !== null)
        ? dates.filter((d) => {
            const v = dailyValue(daily, d, "min", today);
            return v !== null && v < 0;
          }).length
        : null,
    };
  }
  if (name === "동지") {
    const dates = span(`${year}-12-01`, shiftDate(`${year + 1}-03-01`, -1));
    const points = dates
      .map((d) => ({ date: d, value: dailyValue(daily, d, "min", today) }))
      .filter((p) => p.value !== null);
    const min = points.length ? Math.min(...points.map((p) => p.value)) : null;
    result.winter = {
      value: dailyValue(daily, date, "min", today),
      min,
      dates: points.filter((p) => p.value === min).map((p) => p.date),
      days: points.length,
      expected: dates.length,
      note: "해당 12월~다음해 2월의 일최저기온. 겨울이 끝나기 전·결측이 있으면 잠정 비교.",
    };
  }
  return result;
}
export function seasonStory({ daily, today, year, name }) {
  const first = Math.max(1970, +(daily.firstDate || today).slice(0, 4)),
    last = Math.min(2050, +today.slice(0, 4) - 1);
  const selected = seasonalContext({ daily, today, year, name });
  const points = [];
  for (let y = first; y <= last; y++) points.push(seasonalContext({ daily, today, year: y, name }));
  // Paired, per-year differences; never subtract means drawn from different years.
  const pairs = points.filter((p) => p.value !== null && p.adjacent.days === p.adjacent.expected);
  return {
    name,
    selected,
    thisYear: year === +today.slice(0, 4),
    history: {
      from: first <= last ? first : null,
      to: first <= last ? last : null,
      eligibleYears: points.length,
      years: pairs.length,
      excluded: points.length - pairs.length,
      meanDiff: mean(pairs.map((p) => p.diff)),
    },
    points,
    available: { first: daily.firstDate, last: daily.lastDate },
    calendar: CALENDAR_SOURCE,
    question: ["초복", "중복", "말복"].includes(name)
      ? "복날은 정말 더울까?"
      : name === "입동"
        ? "입동부터 추워질까?"
        : name === "입춘"
          ? "입춘이면 따뜻해질까?"
          : name === "동지"
            ? "동지가 가장 추운 날일까?"
            : `${name}, 앞뒤 일주일과 얼마나 다를까?`,
    policy:
      "공식 관측만 사용. 해당일 일평균과 앞뒤 7일(해당일 제외 14일)의 평균을 비교합니다. 여러 해 평균 차이는 해당일·주변 14일이 모두 있는 해만 사용. 올해·선택한 해 결과와 여러 해 평균을 구분하고, 관측일수/기대일수를 함께 표시합니다. 절기와 기온 변화는 인과관계가 아닙니다.",
  };
}
