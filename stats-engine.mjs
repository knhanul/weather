// 날씨 통계 공통 계산(순수 함수, DB·HTTP 모름). 기간 해석 · 결측 처리 · 지표 집계 · 비교 · 순위는 모두 여기서 한 번만 정의한다.
// 화면·CSV·API 가 같은 결과 객체를 쓰므로 값이 서로 다를 수 없다. 규칙은 docs/STATS_RULES.md 와 화면 '계산 기준'에 같은 문장으로 적는다.
//
// 날짜: 기상청 일자료의 날짜 문자열('YYYY-MM-DD', Asia/Seoul 기준 하루)을 UTC 자정 ms 로 옮겨 '일 번호'로 계산한다(시간대 변환 없음).

export class StatsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DAY_MS = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function ymdToDn(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").slice(0, 10));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : NaN;
}
export function dnToYmd(dn) {
  const d = new Date(dn * DAY_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
const ymd = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const mdOf = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
export const weekdayOf = (ymdStr) => new Date(ymdToDn(ymdStr) * DAY_MS).getUTCDay(); // 0=일

// ---------------------------------------------------------------- 기간(매년 같은 시기)
// 주소·API 형식:
//   year                연 전체(1/1~12/31)
//   month:5             매년 5월 전체
//   week:5:1            5월 1주차 = 날짜 고정 구간 1~7일 (2주차 8~14, 3주차 15~21, 4주차 22~28, 5주차 29일~말일). 요일과 무관
//   season:summer       봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 = 전년 12월~그해 2월(겨울은 1·2월이 속한 해로 셈)
//   range:04-25:05-05   직접 지정(월-일~월-일). 시작이 끝보다 늦으면 해를 넘는 구간이고 끝 날짜가 속한 해로 셈(겨울과 같은 규칙)
export const SEASONS = {
  spring: { label: "봄", months: "3~5월", start: [3, 1], end: [5, 31] },
  summer: { label: "여름", months: "6~8월", start: [6, 1], end: [8, 31] },
  autumn: { label: "가을", months: "9~11월", start: [9, 1], end: [11, 30] },
  winter: { label: "겨울", months: "전년 12월~2월", start: [12, 1], end: [2, 29], cross: true },
};
export const WEEKS = [
  [1, 7],
  [8, 14],
  [15, 21],
  [22, 28],
  [29, 31],
];
function validMd(m, d) {
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(2000, m); // 2000 = 윤년(2/29 허용)
}
function parseMd(s) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s ?? ""));
  if (!m) return null;
  const mo = +m[1];
  const d = +m[2];
  return validMd(mo, d) ? [mo, d] : null;
}

export function parsePeriod(raw) {
  const s = String(raw ?? "").trim();
  const parts = s.split(":");
  const bad = (msg) => {
    throw new StatsError(msg || `기간 형식이 올바르지 않습니다: ${s.slice(0, 30)}`);
  };
  switch (parts[0]) {
    case "year":
      if (parts.length !== 1) bad();
      return { kind: "year", key: "year" };
    case "month": {
      const m = Number(parts[1]);
      if (parts.length !== 2 || !Number.isInteger(m) || m < 1 || m > 12) bad("월은 1~12 사이여야 합니다");
      return { kind: "month", month: m, key: `month:${m}` };
    }
    case "week": {
      const m = Number(parts[1]);
      const w = Number(parts[2]);
      if (parts.length !== 3 || !Number.isInteger(m) || m < 1 || m > 12) bad("월은 1~12 사이여야 합니다");
      if (!Number.isInteger(w) || w < 1 || w > 5) bad("주차는 1~5 사이여야 합니다");
      return { kind: "week", month: m, week: w, key: `week:${m}:${w}` };
    }
    case "season": {
      if (parts.length !== 2 || !SEASONS[parts[1]]) bad("계절은 spring·summer·autumn·winter 중 하나입니다");
      return { kind: "season", season: parts[1], key: `season:${parts[1]}` };
    }
    case "range": {
      const a = parseMd(parts[1]);
      const b = parseMd(parts[2]);
      if (parts.length !== 3 || !a || !b) bad("직접 지정 기간은 range:MM-DD:MM-DD 형식입니다(예: range:04-25:05-05)");
      const cross = a[0] * 100 + a[1] > b[0] * 100 + b[1];
      return { kind: "range", start: a, end: b, cross, key: `range:${p2(a[0])}-${p2(a[1])}:${p2(b[0])}-${p2(b[1])}` };
    }
    default:
      return bad();
  }
}

// 사람이 읽는 기간 이름(연도와 무관한 일반형)
export function periodLabel(p) {
  if (p.kind === "year") return "연 전체(1/1~12/31)";
  if (p.kind === "month") return `${p.month}월 전체`;
  if (p.kind === "week") {
    const [a, b] = WEEKS[p.week - 1];
    const last = daysInMonth(2001, p.month);
    if (p.week < 5) return `${p.month}월 ${p.week}주차 · ${p.month}/${a}~${p.month}/${b}`;
    if (p.month === 2) return `2월 5주차 · 2/29 (윤년에만 있음)`;
    return `${p.month}월 5주차 · ${p.month}/29~${p.month}/${last}`;
  }
  if (p.kind === "season") {
    const s = SEASONS[p.season];
    return `${s.label}(${s.months})`;
  }
  const [a, b] = [p.start, p.end];
  if (!p.cross && a[0] === b[0] && a[1] === b[1]) return `${a[0]}/${a[1]}${a[0] === 2 && a[1] === 29 ? " (윤년에만 있음)" : ""}`;
  return `${a[0]}/${a[1]}~${b[0]}/${b[1]}${p.cross ? " (해를 넘는 구간)" : ""}`;
}

// 2/29 처리: 평년에 시작이 2/29 이면 3/1, 끝이 2/29 이면 2/28. 2/29 하루만 고른 경우 평년에는 구간이 없다(null).
function clampMd(y, m, d, isStart) {
  if (m === 2 && d === 29 && !isLeap(y)) return isStart ? [3, 1] : [2, 28];
  return [m, d];
}

// p 를 '그 해'의 실제 날짜 구간으로. 구간이 없는 해(평년의 2월 5주차·2/29)는 null.
// 반환: { year, start, end, days, crossYear }
export function resolvePeriod(p, year) {
  let sy = year;
  let sm;
  let sd;
  let ey = year;
  let em;
  let ed;
  if (p.kind === "year") [sm, sd, em, ed] = [1, 1, 12, 31];
  else if (p.kind === "month") [sm, sd, em, ed] = [p.month, 1, p.month, daysInMonth(year, p.month)];
  else if (p.kind === "week") {
    const last = daysInMonth(year, p.month);
    const [a, b] = WEEKS[p.week - 1];
    if (a > last) return null;
    [sm, sd, em, ed] = [p.month, a, p.month, Math.min(b, last)];
  } else if (p.kind === "season") {
    const s = SEASONS[p.season];
    [sm, sd] = s.start;
    [em, ed] = s.end;
    if (s.cross) sy = year - 1;
    if (em === 2) ed = daysInMonth(year, 2);
  } else {
    [sm, sd] = p.start;
    [em, ed] = p.end;
    if (p.cross) sy = year - 1;
    const single = !p.cross && sm === em && sd === ed;
    if (single && sm === 2 && sd === 29 && !isLeap(year)) return null;
    [sm, sd] = clampMd(sy, sm, sd, true);
    [em, ed] = clampMd(ey, em, ed, false);
  }
  const start = ymd(sy, sm, sd);
  const end = ymd(ey, em, ed);
  const days = ymdToDn(end) - ymdToDn(start) + 1;
  if (days < 1) return null;
  return { year, start, end, days, crossYear: sy !== ey };
}

// 진행 중인 기간을 asOf(자료가 끝난 날)까지로 자른 뒤, 다른 해에도 '같은 월·일까지'로 자른 구간.
// refYear 의 구간 안에서 asOf 가 몇 번째 해(시작 해 기준 0/1)에 있는지 보고 같은 월·일을 다른 해에 적용한다.
export function truncatedPeriod(p, year, refYear, asOf) {
  const ref = resolvePeriod(p, refYear);
  const r = resolvePeriod(p, year);
  if (!ref || !r) return null;
  const shift = +asOf.slice(0, 4) - +ref.start.slice(0, 4);
  const ty = +r.start.slice(0, 4) + shift;
  const [m, d] = clampMd(ty, +asOf.slice(5, 7), +asOf.slice(8, 10), false);
  let end = ymd(ty, m, d);
  if (end > r.end) end = r.end;
  if (end < r.start) return null;
  return { year, start: r.start, end, days: ymdToDn(end) - ymdToDn(r.start) + 1, crossYear: r.crossYear };
}

// ---------------------------------------------------------------- 일자료 저장소(지점 하나)
// rows: 공식 일자료 행(observation_date, avg_temperature, max_temperature, min_temperature, precipitation, avg_humidity, avg_wind_speed …)
// 결측 규칙:
// - 그날 공식 일자료 행이 없으면 모든 항목 = 자료 없음(NaN).
// - 행이 있고 일강수량이 공란(NULL)이면 기상청 일자료 관례대로 무강수(0)로 센다. 단, 그 행의 기온 3개도 모두 비어 있으면 강수도 자료 없음.
// - 그 밖의 NULL 은 그 항목만 자료 없음.
const FIELDS = ["avg", "max", "min", "rain", "hum", "wind", "nsnow", "sdep"];
export function buildDailyStore(stationId, rows) {
  const list = rows
    .map((r) => ({ ...r, dn: ymdToDn(r.observation_date) }))
    .filter((r) => Number.isFinite(r.dn))
    .sort((a, b) => a.dn - b.dn);
  const base = list.length ? list[0].dn : 0;
  const n = list.length ? list[list.length - 1].dn - base + 1 : 0;
  const arr = Object.fromEntries(FIELDS.map((f) => [f, new Float64Array(n).fill(NaN)]));
  const present = new Uint8Array(n);
  const rainBlank = new Uint8Array(n);
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
  for (const r of list) {
    const i = r.dn - base;
    present[i] = 1;
    arr.avg[i] = num(r.avg_temperature);
    arr.max[i] = num(r.max_temperature);
    arr.min[i] = num(r.min_temperature);
    arr.hum[i] = num(r.avg_humidity);
    arr.wind[i] = num(r.avg_wind_speed);
    const hasTemp = Number.isFinite(arr.avg[i]) || Number.isFinite(arr.max[i]) || Number.isFinite(arr.min[i]);
    const rain = num(r.precipitation);
    if (Number.isFinite(rain)) arr.rain[i] = rain;
    else if (hasTemp) {
      arr.rain[i] = 0;
      rainBlank[i] = 1;
    }
    // 눈(최심신적설·최심적설, cm): 강수와 같은 규칙 — 행이 있는데 공란이면 '눈 없음(0)'. 적설 깊이는 더하지 않는다(강설량 아님).
    const ns = num(r.max_new_snow);
    const sd = num(r.max_snow_depth);
    arr.nsnow[i] = Number.isFinite(ns) ? ns : hasTemp ? 0 : NaN;
    arr.sdep[i] = Number.isFinite(sd) ? sd : hasTemp ? 0 : NaN;
  }
  return {
    stationId: String(stationId),
    base,
    n,
    ...arr,
    present,
    rainBlank,
    firstDate: n ? dnToYmd(base) : null,
    lastDate: n ? dnToYmd(base + n - 1) : null,
    rows: list.length,
  };
}
// 지표가 쓰는 일 값(자료 없음 = NaN)
function dayValue(store, field, dn) {
  const i = dn - store.base;
  if (i < 0 || i >= store.n || !store.present[i]) return NaN;
  if (field === "range") {
    const a = store.max[i];
    const b = store.min[i];
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
  }
  return store[field][i];
}

// ---------------------------------------------------------------- 지표(한 곳에서만 정의)
// agg: mean(평균) | max | min(기간 극값, 날짜 포함) | sum | count(조건을 만족한 날 수)
export const METRICS = {
  avg_temp: { label: "평균기온", unit: "℃", chart: "line", group: "temp", field: "avg", agg: "mean", digits: 1, def: "기간 안 하루하루의 일평균기온을 평균한 값" },
  avg_max: { label: "최고기온 평균", unit: "℃", chart: "line", group: "temp", field: "max", agg: "mean", digits: 1, def: "기간 안 일최고기온의 평균 (가장 높았던 하루의 기온이 아님)" },
  avg_min: { label: "최저기온 평균", unit: "℃", chart: "line", group: "temp", field: "min", agg: "mean", digits: 1, def: "기간 안 일최저기온의 평균" },
  period_max: { label: "기간 중 가장 높은 기온", unit: "℃", chart: "line", group: "temp", field: "max", agg: "max", digits: 1, def: "기간 안 일최고기온 중 가장 높은 값(하루, 날짜 표시)" },
  period_min: { label: "기간 중 가장 낮은 기온", unit: "℃", chart: "line", group: "temp", field: "min", agg: "min", digits: 1, def: "기간 안 일최저기온 중 가장 낮은 값(하루, 날짜 표시)" },
  avg_range: { label: "일교차 평균", unit: "℃", chart: "line", group: "temp", field: "range", agg: "mean", digits: 1, def: "하루하루의 (일최고기온 − 일최저기온)을 평균한 값" },
  rain_total: { label: "총강수량", unit: "mm", chart: "bar", group: "rain", field: "rain", agg: "sum", digits: 1, def: "기간 안 일강수량의 합(눈·진눈깨비 등 녹인 양 포함)" },
  rain_days: { label: "강수일수", unit: "일", chart: "bar", group: "rain", field: "rain", agg: "count", test: (v) => v >= 0.1, digits: 0, def: "일강수량 0.1mm 이상인 날 수(기상청 강수일수 정의, 비·눈 등 모든 강수 포함)" },
  rain_max_day: { label: "하루 최대강수량", unit: "mm", chart: "bar", group: "rain", field: "rain", agg: "max", digits: 1, def: "기간 안 일강수량 중 가장 많은 값(하루, 날짜 표시)" },
  rain50_days: { label: "하루 50mm 이상 강수일", unit: "일", chart: "bar", group: "rain", field: "rain", agg: "count", test: (v) => v >= 50, digits: 0, def: "일강수량 50mm 이상인 날 수(서비스 기준이며 호우특보 기준이 아님)" },
  hot30_days: { label: "최고기온 30℃ 이상인 날", unit: "일", chart: "bar", group: "days", field: "max", agg: "count", test: (v) => v >= 30, digits: 0, def: "일최고기온 30℃ 이상인 날 수(서비스 기준이며 여름 시작 기준이 아님)" },
  heatwave_days: { label: "폭염일수", unit: "일", chart: "bar", group: "days", field: "max", agg: "count", test: (v) => v >= 33, digits: 0, def: "일최고기온 33℃ 이상인 날 수(기상청 폭염일수 정의)" },
  frost_days: { label: "최저기온 0℃ 미만인 날", unit: "일", chart: "bar", group: "days", field: "min", agg: "count", test: (v) => v < 0, digits: 0, def: "일최저기온이 0℃ 미만인 날 수" },
  snow_days: { label: "눈이 새로 쌓인 날", unit: "일", chart: "bar", group: "snow", field: "nsnow", agg: "count", test: (v) => v > 0, digits: 0, def: "일 최심신적설이 0cm보다 큰 날 수(그날 새로 내려 쌓인 눈이 관측된 날). 눈이 내렸어도 쌓이지 않은 날은 들어가지 않음" },
  snow_cover_days: { label: "눈이 쌓여 있던 날", unit: "일", chart: "bar", group: "snow", field: "sdep", agg: "count", test: (v) => v > 0, digits: 0, def: "일 최심적설이 0cm보다 큰 날 수(전날 쌓인 눈이 남은 날 포함)" },
  snow_new_max: { label: "하루 신적설 최대", unit: "cm", chart: "bar", group: "snow", field: "nsnow", agg: "max", digits: 1, def: "기간 안 일 최심신적설 중 가장 큰 값(하루, 날짜 표시). 신적설·적설을 더해 강설량을 만들지 않음" },
  snow_depth_max: { label: "최심적설 최대", unit: "cm", chart: "bar", group: "snow", field: "sdep", agg: "max", digits: 1, def: "기간 안 일 최심적설(가장 깊이 쌓인 눈) 중 가장 큰 값" },
  ice_days: { label: "최고기온 0℃ 미만인 날", unit: "일", chart: "bar", group: "days", field: "max", agg: "count", test: (v) => v < 0, digits: 0, def: "일최고기온이 0℃ 미만인 날 수(하루 종일 영하)" },
};
export const METRIC_ORDER = Object.keys(METRICS);
export function getMetric(id) {
  const m = METRICS[id];
  if (!m) throw new StatsError(`알 수 없는 통계 항목입니다: ${String(id).slice(0, 30)}`);
  return { id, ...m };
}
export const round = (v, digits) => (Number.isFinite(v) ? Math.round(v * 10 ** digits + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** digits : null);
// 화면·CSV 공개용 지표 설명(함수 제외)
export function metricInfo(id) {
  const m = getMetric(id);
  return { id, label: m.label, unit: m.unit, chart: m.chart, group: m.group, agg: m.agg, digits: m.digits, def: m.def, field: m.field };
}

// 한 구간 집계. 완전(관측일 = 구간 일수)할 때만 value 가 있다. 합계·일수는 부분 값을 내지 않는다.
// 평균·극값은 참고용 partial 값을 따로 준다(그래프·순위·증감에는 쓰지 않음).
export function aggregate(store, metric, range) {
  const m = typeof metric === "string" ? getMetric(metric) : metric;
  const a = ymdToDn(range.start);
  const b = ymdToDn(range.end);
  let obs = 0;
  let sum = 0;
  let cnt = 0;
  let best = NaN;
  let bestDn = null;
  for (let dn = a; dn <= b; dn++) {
    const v = dayValue(store, m.field, dn);
    if (!Number.isFinite(v)) continue;
    obs++;
    if (m.agg === "mean" || m.agg === "sum") sum += v;
    else if (m.agg === "count") cnt += m.test(v) ? 1 : 0;
    else if (m.agg === "max" ? !(v <= best) : !(v >= best)) {
      // 같은 값이 여러 날이면 가장 이른 날(처음 나온 날)을 날짜로 쓴다
      best = v;
      bestDn = dn;
    }
  }
  const days = b - a + 1;
  const complete = obs === days;
  let raw = null;
  if (obs) raw = m.agg === "mean" ? sum / obs : m.agg === "sum" ? sum : m.agg === "count" ? cnt : best;
  const value = complete ? round(raw, m.digits) : null;
  const partial = !complete && obs && (m.agg === "mean" || m.agg === "max" || m.agg === "min") ? round(raw, m.digits) : null;
  const date = (m.agg === "max" || m.agg === "min") && bestDn != null ? dnToYmd(bestDn) : null;
  return { value, raw: complete ? raw : null, partial, date: complete || partial != null ? date : null, obs, days, missing: days - obs, complete };
}

// ---------------------------------------------------------------- 연도별 같은 기간
// asOf = 자료가 완료된 마지막 날(지점 자료 끝과 공식 최신 날짜 중 이른 날). 끝이 asOf 보다 뒤인 구간은 진행 중(ongoing) 또는 미래.
// status: complete | partial(자료 부족) | ongoing(진행 중) | future | none(보유 자료 밖) | nodate(그 해엔 구간 없음: 평년 2/29)
export function yearRow(store, metric, p, year, asOf) {
  const r = resolvePeriod(p, year);
  if (!r) return { year, status: "nodate", value: null, obs: 0, days: 0 };
  const base = { year, start: r.start, end: r.end, days: r.days };
  if (r.start > asOf) return { ...base, status: "future", value: null, obs: 0 };
  if (r.end > asOf) {
    const cut = { start: r.start, end: asOf };
    const ag = aggregate(store, metric, cut);
    return { ...base, status: "ongoing", value: null, obs: ag.obs, until: asOf };
  }
  if (!store.n || r.end < store.firstDate) return { ...base, status: "none", value: null, obs: 0, missing: r.days };
  const ag = aggregate(store, metric, r);
  const status = ag.complete ? "complete" : ag.obs ? "partial" : "none";
  return { ...base, status, value: ag.value, raw: ag.raw, partial: ag.partial, date: ag.date, obs: ag.obs, missing: ag.missing };
}

export function yearRows(store, metric, p, fromYear, toYear, asOf) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) out.push(yearRow(store, metric, p, y, asOf));
  return out;
}

// 순위: 같은 값은 같은 순위(1,2,2,4). high = 높은 순, low = 낮은 순
export function rankOf(values, x) {
  const v = values.filter((n) => Number.isFinite(n));
  return { high: 1 + v.filter((n) => n > x).length, low: 1 + v.filter((n) => n < x).length, of: v.length };
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export const BASELINE = { from: 1990, to: 1999, minYears: 8 };
export const RECENT = { years: 10, minYears: 8 };

// 1990~1999년 평균 vs 최근 완료된 10개 연도 평균. rows = 1990 이후 전 연도(조회 범위와 무관하게 보유 자료 전체).
// 최근 10개 연도 = 구간이 asOf 까지 끝난 마지막 해부터 거꾸로 10개 해. 두 구간 모두 완전한 연도가 8개 이상일 때만 비교.
// 여러 지점 비교에서는 okYear(year) 로 '모든 지점이 완전한 해'만 쓰게 한다.
export function decadeDelta(metric, rowsByYear, { okYear = null } = {}) {
  const m = typeof metric === "string" ? getMetric(metric) : metric;
  const ended = rowsByYear.filter((r) => r.status !== "ongoing" && r.status !== "future" && r.status !== "nodate");
  const lastEnded = ended.length ? Math.max(...ended.map((r) => r.year)) : null;
  const good = (r) => r.status === "complete" && (!okYear || okYear(r.year));
  const baseRows = rowsByYear.filter((r) => r.year >= BASELINE.from && r.year <= BASELINE.to);
  const baseGood = baseRows.filter(good);
  const res = {
    baseline: { from: BASELINE.from, to: BASELINE.to, years: baseGood.map((r) => r.year), n: baseGood.length, need: BASELINE.minYears },
    recent: null,
    available: false,
    reason: null,
  };
  if (lastEnded == null) {
    res.reason = "비교할 연도가 없습니다";
    return res;
  }
  const rFrom = lastEnded - RECENT.years + 1;
  const recentGood = rowsByYear.filter((r) => r.year >= rFrom && r.year <= lastEnded).filter(good);
  res.recent = { from: rFrom, to: lastEnded, years: recentGood.map((r) => r.year), n: recentGood.length, need: RECENT.minYears };
  if (rFrom <= BASELINE.to) res.reason = `최근 10개 연도(${rFrom}~${lastEnded})가 1990년대와 겹쳐 비교하지 않습니다`;
  else if (baseGood.length < BASELINE.minYears) res.reason = `1990~1999년 중 자료가 온전한 해가 ${baseGood.length}개뿐이라(필요 ${BASELINE.minYears}개) 비교하지 않습니다`;
  else if (recentGood.length < RECENT.minYears) res.reason = `${rFrom}~${lastEnded}년 중 자료가 온전한 해가 ${recentGood.length}개뿐이라(필요 ${RECENT.minYears}개) 비교하지 않습니다`;
  if (res.reason) return res;
  const bm = mean(baseGood.map((r) => r.raw));
  const rm = mean(recentGood.map((r) => r.raw));
  res.available = true;
  res.baseline.mean = round(bm, m.digits + (m.agg === "count" ? 1 : 0));
  res.recent.mean = round(rm, m.digits + (m.agg === "count" ? 1 : 0));
  res.delta = round(rm - bm, m.agg === "count" ? 1 : m.digits);
  res.unit = m.unit;
  // 증감률: 기온 지표는 내지 않고, 기준값이 0이면 계산하지 않는다
  res.pct = m.group !== "temp" && bm !== 0 ? round(((rm - bm) / bm) * 100, 0) : null;
  if (m.group !== "temp" && bm === 0) res.pctNote = "1990년대 평균이 0이라 증감률을 계산하지 않습니다";
  return res;
}

// 진행 중인 해: asOf 까지의 값과, 다른 해의 '같은 월·일까지' 값을 비교
export function ongoingCompare(store, metric, p, year, asOf, fromYear) {
  const m = typeof metric === "string" ? getMetric(metric) : metric;
  const cur = truncatedPeriod(p, year, year, asOf);
  if (!cur) return null;
  const curAg = aggregate(store, m, cur);
  const past = [];
  for (let y = fromYear; y < year; y++) {
    const t = truncatedPeriod(p, y, year, asOf);
    if (!t || t.end < (store.firstDate || "9999")) continue;
    const ag = aggregate(store, m, t);
    past.push({ year: y, start: t.start, end: t.end, days: t.days, value: ag.value, raw: ag.raw, complete: ag.complete, date: ag.date });
  }
  const ok = past.filter((r) => r.complete);
  const res = {
    year,
    start: cur.start,
    end: cur.end,
    days: cur.days,
    obs: curAg.obs,
    complete: curAg.complete,
    value: curAg.value,
    date: curAg.date,
    compareYears: ok.length,
    past: past.map(({ raw, ...r }) => r),
  };
  if (curAg.complete && ok.length) {
    res.rank = rankOf(ok.map((r) => r.raw).concat(curAg.raw), curAg.raw);
    res.pastMean = round(mean(ok.map((r) => r.raw)), m.digits + (m.agg === "count" ? 1 : 0));
  }
  return res;
}

// 연도별 비교 결과 전체(그래프·요약·표·CSV 가 같은 객체를 씀)
export function yearlyCompare(store, metricId, p, { fromYear, toYear, asOf, dataFrom = BASELINE.from }) {
  const m = getMetric(metricId);
  const rows = yearRows(store, m, p, fromYear, toYear, asOf);
  const ok = rows.filter((r) => r.status === "complete");
  const summary = { completeYears: ok.length, totalYears: rows.length };
  if (ok.length) {
    const hi = Math.max(...ok.map((r) => r.raw));
    const lo = Math.min(...ok.map((r) => r.raw));
    summary.highest = { value: round(hi, m.digits), years: ok.filter((r) => r.raw === hi).map((r) => r.year) };
    summary.lowest = { value: round(lo, m.digits), years: ok.filter((r) => r.raw === lo).map((r) => r.year) };
    const last = ok[ok.length - 1];
    summary.latest = { year: last.year, value: last.value, date: last.date || null, rank: rankOf(ok.map((r) => r.raw), last.raw) };
  }
  summary.incomplete = rows.filter((r) => r.status === "partial" || r.status === "none").map((r) => ({ year: r.year, status: r.status, obs: r.obs, days: r.days }));
  const allRows = yearRows(store, m, p, Math.min(dataFrom, fromYear), Math.max(toYear, +asOf.slice(0, 4)), asOf);
  const delta = decadeDelta(m, allRows);
  const ong = rows.find((r) => r.status === "ongoing");
  const ongoing = ong ? ongoingCompare(store, m, p, ong.year, asOf, fromYear) : null;
  return {
    metric: metricInfo(metricId),
    period: { key: p.key, label: periodLabel(p) },
    fromYear,
    toYear,
    asOf,
    rows: rows.map(({ raw, ...r }) => r),
    summary,
    delta,
    ongoing,
    text: yearlyText(m, p, summary, delta, ongoing),
  };
}

// 요약문: 계산 결과에서만 만든다(미리 정한 결론 없음)
const fmtv = (v, m) => `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: m.digits === 0 ? 1 : m.digits })}${m.unit === "일" ? "일" : m.unit}`;
const signed = (v, m, unit = m.unit) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit}`;
export function deltaText(m, d) {
  if (!d || !d.available) return d?.reason || "비교할 자료가 부족합니다";
  const dir = d.delta > 0 ? (m.group === "temp" ? "높습니다" : "많습니다") : d.delta < 0 ? (m.group === "temp" ? "낮습니다" : "적습니다") : "같습니다";
  const pct = d.pct != null ? ` (${d.pct > 0 ? "+" : d.pct < 0 ? "−" : "±"}${Math.abs(d.pct)}%)` : "";
  if (d.delta === 0) return `최근 ${d.recent.from}~${d.recent.to}년 평균은 ${d.baseline.from}~${d.baseline.to}년 평균과 같습니다(${fmtv(d.recent.mean, m)}).`;
  return `최근 ${d.recent.from}~${d.recent.to}년 평균(${fmtv(d.recent.mean, m)})이 ${d.baseline.from}~${d.baseline.to}년 평균(${fmtv(d.baseline.mean, m)})보다 ${signed(d.delta, m)}${pct} ${dir}.`;
}
export const orderWord = (m) => (m.group === "temp" ? "높은 순" : "많은 순");
function yearlyText(m, p, s, d, ong) {
  const out = [];
  if (s.latest) {
    const r = s.latest.rank;
    out.push(`${s.latest.year}년 ${periodLabel(p)} ${m.label}: ${fmtv(s.latest.value, m)} — 자료가 온전한 ${r.of}개 연도 중 ${orderWord(m)} ${r.high}위입니다.`);
  } else out.push("비교할 수 있는(자료가 온전한) 연도가 없습니다.");
  out.push(deltaText(m, d));
  if (ong && ong.complete && ong.rank) {
    out.push(`진행 중인 ${ong.year}년은 ${mdOf(ong.end)}까지 ${fmtv(ong.value, m)} — 같은 날짜(${mdOf(ong.start)}~${mdOf(ong.end)})까지 비교한 ${ong.rank.of}개 연도(올해 포함) 중 ${orderWord(m)} ${ong.rank.high}위입니다.`);
  }
  return out;
}

// ---------------------------------------------------------------- 날짜별 겹쳐보기(최대 4개 연도)
// 기온 지표 → 그 지표가 쓰는 일 값(일평균·일최고·일최저·일교차), 강수 지표 → 기간 시작부터의 누적 강수량.
// 자료 없는 날은 점이 없고, 누적 강수는 자료 없는 날 이후로 끊는다(0으로 채우지 않음).
export function overlay(store, metricId, p, years, asOf) {
  const m = getMetric(metricId);
  if (!years.length || years.length > 4) throw new StatsError("겹쳐 볼 연도는 1~4개를 고르세요");
  const cumulative = m.field === "rain";
  // 축: 윤년(2024) 기준 구간의 월·일 순서 → 2/29 를 포함한 모든 월·일
  const ref = resolvePeriod(p, 2024) || resolvePeriod(p, 2028);
  const keys = [];
  for (let dn = ymdToDn(ref.start); dn <= ymdToDn(ref.end); dn++) keys.push(dnToYmd(dn).slice(5));
  const series = years.map((y) => {
    const r = resolvePeriod(p, y);
    const vals = new Array(keys.length).fill(null);
    let status = "complete";
    let obs = 0;
    if (!r) return { year: y, status: "nodate", values: vals, obs: 0, days: 0 };
    if (r.start > asOf) return { year: y, status: "future", start: r.start, end: r.end, values: vals, obs: 0, days: r.days };
    const end = r.end > asOf ? asOf : r.end;
    if (r.end > asOf) status = "ongoing";
    let acc = 0;
    let broken = false;
    for (let dn = ymdToDn(r.start); dn <= ymdToDn(end); dn++) {
      const md = dnToYmd(dn).slice(5);
      const k = keys.indexOf(md);
      let v = dayValue(store, m.field, dn);
      if (!Number.isFinite(v)) {
        broken = true;
        continue;
      }
      obs++;
      if (cumulative) {
        acc += v;
        v = broken ? NaN : acc;
      }
      if (k >= 0 && Number.isFinite(v)) vals[k] = round(v, 1);
    }
    const days = ymdToDn(end) - ymdToDn(r.start) + 1;
    if (status === "complete" && obs < days) status = obs ? "partial" : "none";
    return { year: y, status, start: r.start, end: r.end, until: end, values: vals, obs, days };
  });
  const what = cumulative ? "누적 강수량" : { avg: "일평균기온", max: "일최고기온", min: "일최저기온", range: "일교차" }[m.field];
  return { metric: metricInfo(metricId), period: { key: p.key, label: periodLabel(p) }, value: { label: what, unit: cumulative ? "mm" : "℃", cumulative }, asOf, keys, series };
}

// ---------------------------------------------------------------- 지역별 비교(2~4개 지점)
// 공통 연도 = 조회 범위 안에서 모든 지점이 그 지표·기간에 대해 온전한(complete) 해. 평균·추이·변화는 공통 연도만으로 같은 분모를 쓴다.
export function commonYears(rowsByStation) {
  const sets = rowsByStation.map((rows) => new Set(rows.filter((r) => r.status === "complete").map((r) => r.year)));
  if (!sets.length) return [];
  return [...sets[0]].filter((y) => sets.every((s) => s.has(y))).sort((a, b) => a - b);
}

export function regionYearly(stores, metricId, p, { fromYear, toYear, asOf }) {
  const m = getMetric(metricId);
  const rowsBy = stores.map((s) => yearRows(s, m, p, fromYear, toYear, asOf));
  const common = commonYears(rowsBy);
  const cset = new Set(common);
  const allBy = stores.map((s) => yearRows(s, m, p, Math.min(BASELINE.from, fromYear), Math.max(toYear, +asOf.slice(0, 4)), asOf));
  const allCommon = new Set(commonYears(allBy));
  const stations = stores.map((s, i) => {
    const rows = rowsBy[i];
    const used = rows.filter((r) => cset.has(r.year));
    const avg = used.length ? round(mean(used.map((r) => r.raw)), m.digits) : null;
    const delta = decadeDelta(m, allBy[i], { okYear: (y) => allCommon.has(y) });
    return {
      station_id: s.stationId,
      mean: avg,
      years: used.length,
      rows: rows.map((r) => ({ year: r.year, value: cset.has(r.year) ? r.value : null, date: cset.has(r.year) ? r.date || null : null, status: r.status, common: cset.has(r.year), obs: r.obs, days: r.days, start: r.start, end: r.end })),
      delta,
    };
  });
  return { metric: metricInfo(metricId), period: { key: p.key, label: periodLabel(p) }, fromYear, toYear, asOf, commonYears: common, stations };
}

// 같은 기간 비교: 여러 지표를 한 번에(지표마다 공통 연도를 따로 구함) — 지점별 평균(얼마나 덥고 추운지)과 1990년대 대비 변화
export const REGION_PERIOD_METRICS = ["avg_temp", "avg_max", "avg_min", "rain_total", "rain_days", "hot30_days", "frost_days"];
export function regionPeriod(stores, p, { fromYear, toYear, asOf, metrics = REGION_PERIOD_METRICS }) {
  return {
    period: { key: p.key, label: periodLabel(p) },
    fromYear,
    toYear,
    asOf,
    metrics: metrics.map((id) => {
      const r = regionYearly(stores, id, p, { fromYear, toYear, asOf });
      return { metric: r.metric, commonYears: r.commonYears, stations: r.stations.map((s) => ({ station_id: s.station_id, mean: s.mean, years: s.years, delta: s.delta })) };
    }),
  };
}

// 월별 특성: 공통 연도(모든 지점·1~12월이 모두 온전한 해)에 대해 월마다 평균
export function regionMonthly(stores, metricId, { fromYear, toYear, asOf }) {
  const m = getMetric(metricId);
  const per = stores.map((s) => Array.from({ length: 12 }, (_, i) => yearRows(s, m, { kind: "month", month: i + 1, key: `month:${i + 1}` }, fromYear, toYear, asOf)));
  const sets = per.flatMap((months) => months.map((rows) => new Set(rows.filter((r) => r.status === "complete").map((r) => r.year))));
  const years = [];
  for (let y = fromYear; y <= toYear; y++) if (sets.every((s) => s.has(y))) years.push(y);
  const ys = new Set(years);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    values: stores.map((s, k) => {
      const used = per[k][i].filter((r) => ys.has(r.year));
      return { station_id: s.stationId, value: used.length ? round(mean(used.map((r) => r.raw)), m.digits) : null, years: used.length };
    }),
  }));
  return { metric: metricInfo(metricId), fromYear, toYear, asOf, commonYears: years, months };
}

// ---------------------------------------------------------------- CSV(현재 조회 결과 — 원자료 다운로드와 별개)
export function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(table, meta = []) {
  const lines = meta.map((x) => `# ${x}`);
  lines.push(table.columns.map((c) => csvEscape(c.label)).join(","));
  for (const r of table.rows) lines.push(table.columns.map((c) => csvEscape(r[c.key])).join(","));
  return `\uFEFF${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- 계산 기준(화면 '계산 기준'과 docs/STATS_RULES.md 에 같은 문장)
export const RULES = [
  "자료: 기상청 지상(종관, ASOS) 공식 일자료(일평균·일최고·일최저기온, 일강수량). 관측지점 한 곳의 값이며 시·도 전체 평균이 아닙니다.",
  "날짜는 한국 시간(Asia/Seoul) 하루(0~24시) 기준입니다. 기상청 공식 일자료의 날짜를 그대로 씁니다.",
  "그날 공식 일자료가 없으면 '자료 없음'입니다. 일자료는 있는데 일강수량이 비어 있으면 기상청 일자료 관례대로 무강수(0mm)로 셉니다. 결측을 0으로 채우지 않습니다.",
  "한 해의 비교 구간에 자료 없는 날이 하루라도 있으면 그해는 '자료 부족'으로 따로 표시하고 그래프·순위·증감 비교에서 뺍니다.",
  "진행 중인 구간(올해 이번 달 등)은 자료가 있는 마지막 날까지만, 다른 해의 같은 월·일까지와 비교합니다.",
  "계절: 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~다음 해 2월. 겨울은 1·2월이 속한 해로 셉니다(예: 2025년 겨울 = 2024.12.1~2025.2.28).",
  "주차는 요일과 상관없이 날짜를 고정합니다: 1주차 1~7일, 2주차 8~14일, 3주차 15~21일, 4주차 22~28일, 5주차 29일~말일(달마다 일수가 다름, 2월 5주차는 윤년의 2/29 하루).",
  "윤년: 월 전체·계절은 그 해의 실제 날짜를 모두 씁니다(윤년 2월 29일, 평년 28일). 직접 지정 구간이 2/29 로 끝나면 평년에는 2/28, 2/29 에 시작하면 평년에는 3/1 부터. 2/29 하루만 고르면 윤년만 비교합니다.",
  "해를 넘는 직접 지정 구간(예: 12/20~1/10)은 끝 날짜가 속한 해로 셉니다.",
  "강수일수 = 일강수량 0.1mm 이상인 날(비·눈·진눈깨비 등 모든 강수 포함, 기상청 정의). 폭염일수 = 일최고기온 33℃ 이상인 날(기상청 정의).",
  "'최고기온 30℃ 이상인 날', '하루 50mm 이상 강수일'은 이 서비스의 기준이며 기상청 특보·계절 시작 기준이 아닙니다.",
  "'최고기온 평균'은 날마다의 최고기온을 평균한 값이고, '기간 중 가장 높은 기온'은 가장 더웠던 하루의 최고기온입니다.",
  "1990년대 대비 변화 = 최근 완료된 10개 연도 평균 − 1990~1999년 평균. 두 구간 모두 자료가 온전한 해가 8개 이상일 때만 계산합니다. 기온 차이는 ℃, 강수량은 mm, 날 수는 일로 표시하고, 기준값이 0이면 증감률을 내지 않습니다.",
  "순위는 같은 값이면 같은 순위입니다. 과거 관측 결과이며 앞으로의 예보·확률이 아닙니다.",
];

// ================================================================ 2단계: 생활 속 날씨 · 날씨 기록
// 아래 함수도 모두 위의 기간 해석(resolvePeriod)·결측 규칙(dayValue)·지표 정의(METRICS)를 그대로 쓴다.
const RAIN_DAY = (v) => METRICS.rain_days.test(v); // 강수일 = 일강수량 0.1mm 이상(한 곳에서만 정의)
const HOT_DAY = (v) => METRICS.hot30_days.test(v); // 최고기온 30℃ 이상(서비스 기준)
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
// 월·일 위치(평년 기준 1/1 = 1). 2/29 는 2/28 과 3/1 사이(59.5). 해를 넘는 기간이면 시작 해의 1/1 부터 센다.
export function mdPos(ymdStr, periodStartYmd = null) {
  const m = +ymdStr.slice(5, 7);
  const d = +ymdStr.slice(8, 10);
  let pos = m === 2 && d === 29 ? 59.5 : ymdToDn(`2001-${p2(m)}-${p2(d)}`) - ymdToDn("2001-01-01") + 1;
  if (periodStartYmd && +ymdStr.slice(0, 4) > +periodStartYmd.slice(0, 4)) pos += 365;
  return pos;
}
export function posToMd(pos) {
  if (pos === 59.5) return "2/29";
  const dn = ymdToDn("2001-01-01") + ((Math.round(pos) - 1) % 365);
  const s = dnToYmd(dn);
  return `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
}

// ---------------------------------------------------------------- 더위가 일찍 올까: 매년 첫·마지막 '최고기온 30℃ 이상' 날짜와 일수
// 값은 그 해 구간이 온전할 때만(빠진 날이 있으면 첫날·마지막 날을 확정할 수 없음). 진행 중인 해는 asOf 까지의 첫날만 참고로.
export function thresholdDatesYear(store, metricId, p, year, asOf) {
  const m = getMetric(metricId);
  if (m.agg !== "count") throw new StatsError("날짜를 셀 수 있는 지표가 아닙니다");
  const r = resolvePeriod(p, year);
  if (!r) return { year, status: "nodate", first: null, last: null, count: null, obs: 0, days: 0 };
  const base = { year, start: r.start, end: r.end, days: r.days };
  if (r.start > asOf) return { ...base, status: "future", first: null, last: null, count: null, obs: 0 };
  const end = r.end > asOf ? asOf : r.end;
  let obs = 0;
  let cnt = 0;
  let first = null;
  let last = null;
  let missingBeforeFirst = false;
  for (let dn = ymdToDn(r.start); dn <= ymdToDn(end); dn++) {
    const v = dayValue(store, m.field, dn);
    if (!Number.isFinite(v)) {
      if (first == null) missingBeforeFirst = true;
      continue;
    }
    obs++;
    if (m.test(v)) {
      cnt++;
      if (first == null) first = dnToYmd(dn);
      last = dnToYmd(dn);
    }
  }
  if (r.end > asOf) return { ...base, status: "ongoing", until: asOf, obs, first: missingBeforeFirst ? null : first, last: null, count: null, countSoFar: cnt };
  if (!store.n || r.end < store.firstDate) return { ...base, status: "none", first: null, last: null, count: null, obs: 0 };
  const complete = obs === r.days;
  if (!complete) return { ...base, status: obs ? "partial" : "none", obs, first: null, last: null, count: null };
  return { ...base, status: "complete", obs, first, last, count: cnt, firstPos: first ? mdPos(first, r.start) : null, lastPos: last ? mdPos(last, r.start) : null };
}
const POS_METRIC = { digits: 0, agg: "mean", group: "date", unit: "일" };
const CNT_METRIC = { digits: 0, agg: "count", group: "days", unit: "일" };
export function thresholdDates(store, metricId, p, { fromYear, toYear, asOf, dataFrom = BASELINE.from }) {
  const m = getMetric(metricId);
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) rows.push(thresholdDatesYear(store, metricId, p, y, asOf));
  const all = [];
  for (let y = Math.min(dataFrom, fromYear); y <= Math.max(toYear, +asOf.slice(0, 4)); y++) all.push(thresholdDatesYear(store, metricId, p, y, asOf));
  // 첫날 비교: 그런 날이 있었던 온전한 해만(없던 해는 '날짜 없음'이라 평균에 넣지 않음)
  const asRows = (key) => all.map((r) => ({ year: r.year, status: r.status === "complete" && r[key] != null ? "complete" : r.status === "complete" ? "noevent" : r.status, raw: r[key] }));
  const firstDelta = decadeDelta(POS_METRIC, asRows("firstPos"));
  const lastDelta = decadeDelta(POS_METRIC, asRows("lastPos"));
  const countDelta = decadeDelta(CNT_METRIC, all.map((r) => ({ year: r.year, status: r.status, raw: r.count })));
  const ok = rows.filter((r) => r.status === "complete");
  const withFirst = ok.filter((r) => r.first);
  const summary = {
    completeYears: ok.length,
    noEventYears: ok.filter((r) => !r.first).map((r) => r.year),
    earliest: withFirst.length ? withFirst.reduce((a, b) => (b.firstPos < a.firstPos ? b : a)) : null,
    latestFirst: withFirst.length ? withFirst.reduce((a, b) => (b.firstPos > a.firstPos ? b : a)) : null,
    latestLast: withFirst.length ? withFirst.reduce((a, b) => (b.lastPos > a.lastPos ? b : a)) : null,
    incomplete: rows.filter((r) => r.status === "partial" || r.status === "none").map((r) => ({ year: r.year, obs: r.obs, days: r.days })),
  };
  const ong = rows.find((r) => r.status === "ongoing") || null;
  const text = [];
  const dayWord = (d, early, late) => (d < 0 ? `${Math.abs(d)}일 ${early}` : d > 0 ? `${d}일 ${late}` : "같은 날");
  if (firstDelta.available) text.push(`첫 ${m.label.replace("인 날", "")} 날은 ${firstDelta.baseline.from}~${firstDelta.baseline.to}년 평균 ${posToMd(firstDelta.baseline.mean)} → ${firstDelta.recent.from}~${firstDelta.recent.to}년 평균 ${posToMd(firstDelta.recent.mean)}로 ${dayWord(firstDelta.delta, "빨라졌습니다", "늦어졌습니다")}.`);
  else text.push(`첫날 비교: ${firstDelta.reason}`);
  if (lastDelta.available) text.push(`마지막 날은 ${posToMd(lastDelta.baseline.mean)} → ${posToMd(lastDelta.recent.mean)}로 ${dayWord(lastDelta.delta, "빨라졌습니다", "늦어졌습니다")}.`);
  if (countDelta.available) text.push(`그런 날 수는 ${countDelta.baseline.mean}일 → ${countDelta.recent.mean}일(${countDelta.delta > 0 ? "+" : countDelta.delta < 0 ? "−" : "±"}${Math.abs(countDelta.delta)}일)입니다.`);
  if (ong && ong.first) text.push(`진행 중인 ${ong.year}년은 ${mdOf(ong.first)}에 처음 기록했습니다(${mdOf(ong.until)}까지 ${ong.countSoFar}일).`);
  return { metric: metricInfo(metricId), period: { key: p.key, label: periodLabel(p) }, fromYear, toYear, asOf, rows, summary, firstDelta, lastDelta, countDelta, ongoing: ong, text };
}

// ---------------------------------------------------------------- 연속 강수·무강수(결측일을 건너뛰어 잇지 않음)
// wet = 강수일(0.1mm 이상)이 이어진 날, dry = 자료가 있고 강수일이 아닌 날(0.1mm 미만·무강수)이 이어진 날.
export const RUN_KINDS = { wet: { label: "연속 강수일", test: (v) => RAIN_DAY(v) }, dry: { label: "연속 무강수일(0.1mm 미만)", test: (v) => !RAIN_DAY(v) } };
// [fromDn, toDn] 안의 연속 구간. 자료 없는 날에서 끊는다. cut: 구간 경계(기간 시작·끝)에서 잘린 경우 표시
export function runsIn(store, kind, fromDn, toDn) {
  const k = RUN_KINDS[kind];
  if (!k) throw new StatsError("연속 종류는 wet·dry 중 하나입니다");
  const out = [];
  let cur = null;
  const close = (endDn, reason) => {
    if (cur) out.push({ start: dnToYmd(cur.s), end: dnToYmd(endDn), len: endDn - cur.s + 1, cutStart: cur.cut, endReason: reason });
    cur = null;
  };
  for (let dn = fromDn; dn <= toDn; dn++) {
    const v = dayValue(store, "rain", dn);
    if (!Number.isFinite(v)) {
      close(dn - 1, "missing");
      continue;
    }
    if (k.test(v)) {
      if (!cur) cur = { s: dn, cut: dn === fromDn };
    } else close(dn - 1, "end");
  }
  close(toDn, "range");
  return out;
}
export function longestRunYear(store, kind, p, year, asOf) {
  const r = resolvePeriod(p, year);
  if (!r) return { year, status: "nodate", len: null };
  const base = { year, start: r.start, end: r.end, days: r.days };
  if (r.start > asOf) return { ...base, status: "future", len: null, obs: 0 };
  const end = r.end > asOf ? asOf : r.end;
  const ag = aggregate(store, "rain_total", { start: r.start, end });
  const runs = runsIn(store, kind, ymdToDn(r.start), ymdToDn(end));
  const best = runs.reduce((a, b) => (!a || b.len > a.len ? b : a), null);
  const status = r.end > asOf ? "ongoing" : !store.n || r.end < store.firstDate ? "none" : ag.complete ? "complete" : ag.obs ? "partial" : "none";
  const val = status === "complete" ? (best ? best.len : 0) : null;
  return { ...base, status, obs: ag.obs, len: val, partialLen: status !== "complete" && best ? best.len : null, runStart: best ? best.start : null, runEnd: best ? best.end : null, until: status === "ongoing" ? asOf : undefined };
}
export function streaks(store, kind, p, { fromYear, toYear, asOf, top = 10 }) {
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) rows.push(longestRunYear(store, kind, p, y, asOf));
  // 보유 전체 기간의 최장 기록(기간 경계로 자르지 않음, 결측일에서만 끊김)
  const all = store.n ? runsIn(store, kind, store.base, Math.min(store.base + store.n - 1, ymdToDn(asOf))) : [];
  all.sort((a, b) => b.len - a.len || a.start.localeCompare(b.start));
  const topList = [];
  for (const x of all) {
    if (topList.length >= top && x.len < topList[topList.length - 1].len) break;
    topList.push({ ...x, rank: 1 + all.filter((y) => y.len > x.len).length });
  }
  const ok = rows.filter((r) => r.status === "complete");
  const allRows = [];
  for (let y = Math.min(BASELINE.from, fromYear); y <= Math.max(toYear, +asOf.slice(0, 4)); y++) {
    const r = longestRunYear(store, kind, p, y, asOf);
    allRows.push({ year: y, status: r.status, raw: r.len });
  }
  const delta = decadeDelta({ digits: 1, agg: "mean", group: "days", unit: "일" }, allRows);
  const summary = { completeYears: ok.length, longest: ok.length ? ok.reduce((a, b) => (b.len > a.len ? b : a)) : null, incomplete: rows.filter((r) => r.status === "partial" || r.status === "none").map((r) => ({ year: r.year, obs: r.obs, days: r.days })) };
  return { kind, kindLabel: RUN_KINDS[kind].label, period: { key: p.key, label: periodLabel(p) }, fromYear, toYear, asOf, rows, top: topList.slice(0, Math.max(top, topList.length)), summary, delta, record: { from: store.firstDate, to: asOf } };
}

// ---------------------------------------------------------------- 주말·평일 강수 비율(분모 = 유효 관측일)
export const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
export function weekdayShare(store, p, { fromYear, toYear, asOf }) {
  const dow = Array.from({ length: 7 }, (_, i) => ({ dow: i, label: DOW_KO[i], valid: 0, hit: 0, missing: 0 }));
  const perYear = [];
  for (let y = fromYear; y <= toYear; y++) {
    const r = resolvePeriod(p, y);
    if (!r || r.start > asOf) continue;
    const end = r.end > asOf ? asOf : r.end;
    const g = { year: y, wdValid: 0, wdHit: 0, weValid: 0, weHit: 0, ongoing: r.end > asOf };
    for (let dn = ymdToDn(r.start); dn <= ymdToDn(end); dn++) {
      const wd = new Date(dn * DAY_MS).getUTCDay();
      const v = dayValue(store, "rain", dn);
      if (!Number.isFinite(v)) {
        dow[wd].missing++;
        continue;
      }
      const hit = RAIN_DAY(v) ? 1 : 0;
      dow[wd].valid++;
      dow[wd].hit += hit;
      if (wd === 0 || wd === 6) {
        g.weValid++;
        g.weHit += hit;
      } else {
        g.wdValid++;
        g.wdHit += hit;
      }
    }
    if (g.wdValid + g.weValid) perYear.push({ ...g, wdShare: g.wdValid ? round((g.wdHit / g.wdValid) * 100, 1) : null, weShare: g.weValid ? round((g.weHit / g.weValid) * 100, 1) : null });
  }
  for (const d of dow) d.share = d.valid ? round((d.hit / d.valid) * 100, 1) : null;
  const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
  const wdList = dow.filter((d) => d.dow >= 1 && d.dow <= 5);
  const weList = dow.filter((d) => d.dow === 0 || d.dow === 6);
  const grp = (list) => {
    const valid = sum(list, "valid");
    const hit = sum(list, "hit");
    return { valid, hit, missing: sum(list, "missing"), share: valid ? round((hit / valid) * 100, 1) : null, raw: valid ? (hit / valid) * 100 : NaN };
  };
  const weekday = grp(wdList);
  const weekend = grp(weList);
  const diff = Number.isFinite(weekday.raw) && Number.isFinite(weekend.raw) ? round(weekend.raw - weekday.raw, 1) : null;
  delete weekday.raw;
  delete weekend.raw;
  const text = [];
  if (diff != null) text.push(`${fromYear}~${toYear}년 ${periodLabel(p)}: 주말(토·일) ${weekend.share}% (${weekend.valid.toLocaleString("ko-KR")}일 중 ${weekend.hit.toLocaleString("ko-KR")}일), 평일(월~금) ${weekday.share}% (${weekday.valid.toLocaleString("ko-KR")}일 중 ${weekday.hit.toLocaleString("ko-KR")}일) — 차이 ${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)}%p.`);
  else text.push("비교할 유효 관측일이 없습니다.");
  return { period: { key: p.key, label: periodLabel(p) }, fromYear, toYear, asOf, dow, weekday, weekend, diff, perYear, text };
}

// ---------------------------------------------------------------- 기념일·생일: 매년 같은 월·일의 날씨(과거 관측, 확률·예보 아님)
export function sameDayHistory(store, md, { fromYear, toYear, asOf }) {
  const p = parsePeriod(`range:${md}:${md}`);
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) {
    const r = resolvePeriod(p, y);
    if (!r) {
      rows.push({ year: y, date: null, status: "nodate" });
      continue;
    }
    if (r.start > asOf) {
      rows.push({ year: y, date: r.start, status: "future" });
      continue;
    }
    const dn = ymdToDn(r.start);
    const v = (f) => {
      const x = dayValue(store, f, dn);
      return Number.isFinite(x) ? round(x, 1) : null;
    };
    const rain = v("rain");
    const i = dn - store.base;
    const blank = i >= 0 && i < store.n && store.rainBlank[i] === 1;
    const present = i >= 0 && i < store.n && store.present[i] === 1;
    rows.push({ year: y, date: r.start, weekday: DOW_KO[new Date(dn * DAY_MS).getUTCDay()], status: present ? "ok" : "none", avg: v("avg"), max: v("max"), min: v("min"), rain, rainBlank: blank, rainy: rain == null ? null : RAIN_DAY(rain), snow: v("nsnow") });
  }
  const valid = rows.filter((r) => r.status === "ok" && r.rainy != null);
  const rainy = valid.filter((r) => r.rainy);
  const tv = rows.filter((r) => r.status === "ok" && r.max != null && r.min != null);
  const pick = (list, k, dir) => (list.length ? list.reduce((a, b) => (dir > 0 ? (b[k] > a[k] ? b : a) : b[k] < a[k] ? b : a)) : null);
  const summary = {
    validYears: valid.length,
    rainyYears: rainy.length,
    share: valid.length ? round((rainy.length / valid.length) * 100, 0) : null,
    meanMax: tv.length ? round(meanOf(tv.map((r) => r.max)), 1) : null,
    meanMin: tv.length ? round(meanOf(tv.map((r) => r.min)), 1) : null,
    hottest: pick(tv, "max", 1),
    coldest: pick(tv, "min", -1),
    wettest: pick(rainy, "rain", 1),
    noDateYears: rows.filter((r) => r.status === "nodate").length,
  };
  const label = periodLabel(p);
  const text = [];
  if (valid.length) text.push(`${fromYear}~${toYear}년 중 자료가 있는 ${valid.length}개 해 가운데 ${label}에 강수(0.1mm 이상)가 있었던 해는 ${rainy.length}개(${summary.share}%)였습니다. 과거 관측 결과이며 앞으로의 강수확률이 아닙니다.`);
  else text.push("자료가 있는 해가 없습니다.");
  if (summary.noDateYears) text.push(`2월 29일은 윤년에만 있어 ${valid.length}개 해(윤년)만 셉니다.`);
  return { md: p.key.split(":")[1], label, fromYear, toYear, asOf, rows, summary, text };
}

// ---------------------------------------------------------------- 날씨 기록: 보유 관측기간의 순위(공식 일자료)
export const RECORDS = [
  { id: "max_high", label: "가장 높은 일최고기온", field: "max", dir: -1, unit: "℃" },
  { id: "min_low", label: "가장 낮은 일최저기온", field: "min", dir: 1, unit: "℃" },
  { id: "rain_high", label: "가장 많은 일강수량", field: "rain", dir: -1, unit: "mm", positive: true },
  { id: "min_high", label: "가장 높은 일최저기온", field: "min", dir: -1, unit: "℃", note: "하루 최저기온 기준(열대야 판정과 다름)" },
  { id: "max_low", label: "가장 낮은 일최고기온", field: "max", dir: 1, unit: "℃" },
  { id: "range_high", label: "가장 큰 일교차", field: "range", dir: -1, unit: "℃" },
  { id: "snow_new_high", label: "가장 많은 일 최심신적설", field: "nsnow", dir: -1, unit: "cm", positive: true, note: "신적설 관측 방식·보유 상태에 따라 연도 간 비교에 한계" },
  { id: "snow_depth_high", label: "가장 깊은 최심적설", field: "sdep", dir: -1, unit: "cm", positive: true },
];
export function recordList(store, rec, p, { asOf, n = 10 }) {
  const days = [];
  let total = 0;
  let missing = 0;
  const visit = (a, b) => {
    for (let dn = a; dn <= b; dn++) {
      total++;
      const v = dayValue(store, rec.field, dn);
      if (!Number.isFinite(v)) {
        missing++;
        continue;
      }
      if (rec.positive && !(v > 0)) continue;
      days.push([v, dn]);
    }
  };
  if (!store.n) return { ...rec, items: [], total: 0, missing: 0 };
  const lastDn = Math.min(store.base + store.n - 1, ymdToDn(asOf));
  if (!p) visit(store.base, lastDn);
  else {
    for (let y = +store.firstDate.slice(0, 4); y <= +asOf.slice(0, 4); y++) {
      const r = resolvePeriod(p, y);
      if (!r) continue;
      const a = Math.max(ymdToDn(r.start), store.base);
      const b = Math.min(ymdToDn(r.end), lastDn);
      if (a <= b) visit(a, b);
    }
  }
  days.sort((x, y) => (rec.dir < 0 ? y[0] - x[0] : x[0] - y[0]) || x[1] - y[1]);
  const items = [];
  for (const [v, dn] of days) {
    const val = round(v, 1);
    if (items.length >= n && val !== items[items.length - 1].value) break;
    const rank = items.length && items[items.length - 1].value === val ? items[items.length - 1].rank : items.length + 1;
    items.push({ rank, value: val, date: dnToYmd(dn) });
  }
  return { id: rec.id, label: rec.label, unit: rec.unit, note: rec.note || null, items, total, missing, observed: total - missing };
}
export function records(store, p, { asOf, n = 10 }) {
  return { period: p ? { key: p.key, label: periodLabel(p) } : { key: "all", label: "보유 기간 전체" }, from: store.firstDate, to: asOf, lists: RECORDS.map((rec) => recordList(store, rec, p, { asOf, n })) };
}

// ================================================================ 시간자료(정시 관측) 기반 통계 — 화면에 '시간자료 집계'로 표시
// 저장소: 1990-01-01 00시부터 시각 번호(시간 단위). 값은 Float32(NaN = 자료 없음). 시각은 기상청 정시(Asia/Seoul 벽시계) 문자열 그대로.
// 결측 규칙: 행이 없으면 모든 항목 없음. 기온은 NULL 이거나 ta_qcflg=9 면 없음.
// 강수: rn_qcflg=9 면 '자료 없음', 공란이고 플래그가 없으면 무강수(0). 같은 시각이 HH:MM / HH:MM:SS 두 형식이면 19자 쪽을 쓴다.
export const HOURLY_FROM = "1990-01-01";
// 값은 0.1 단위 정수(Int16, 자료 없음 = -32768)로 저장한다 — 기상청 시간자료가 0.1 단위라 정확하고(Float32 의 24.9 → 24.8999… 문제 없음) 메모리도 작다.
const H_NA = -32768;
export function hval(arr, i) {
  const v = arr[i];
  return v === H_NA || v === undefined ? NaN : v / 10;
}
const henc = (v) => (Number.isFinite(v) ? Math.max(-32767, Math.min(32767, Math.round(v * 10))) : H_NA);
export function createHourlyStore(stationId, untilYear) {
  const base = ymdToDn(HOURLY_FROM);
  const n = (ymdToDn(`${untilYear}-12-31`) - base + 1) * 24;
  const f = () => new Int16Array(n).fill(H_NA);
  return { stationId: String(stationId), base, n, ta: f(), rn: f(), ws: f(), hm: f(), src: new Uint8Array(n), firstIdx: -1, lastIdx: -1, rows: 0 };
}
const HOUR_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;
export function addHourlyRows(hs, rows) {
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
  let added = 0;
  for (const r of rows) {
    const s = String(r.observation_datetime ?? "");
    const m = HOUR_RE.exec(s);
    if (!m || m[3] !== "00") continue;
    const hh = +m[2];
    if (hh > 23) continue;
    const i = (ymdToDn(m[1]) - hs.base) * 24 + hh;
    if (!(i >= 0 && i < hs.n)) continue;
    const kind = s.length >= 19 ? 2 : 1;
    if (hs.src[i] === 2 && kind === 1) continue; // 이미 19자 형식이 있음
    if (!hs.src[i]) hs.rows++;
    hs.src[i] = kind;
    const ta = num(r.temperature);
    hs.ta[i] = henc(String(r.ta_qcflg ?? "") === "9" ? NaN : ta);
    const rn = num(r.precipitation);
    hs.rn[i] = henc(String(r.rn_qcflg ?? "") === "9" ? NaN : Number.isFinite(rn) ? rn : 0);
    hs.ws[i] = henc(num(r.wind_speed));
    hs.hm[i] = henc(num(r.humidity));
    if (hs.firstIdx < 0 || i < hs.firstIdx) hs.firstIdx = i;
    if (i > hs.lastIdx) hs.lastIdx = i;
    added++;
  }
  return added;
}
export const hourIdx = (hs, ymdStr, hh) => (ymdToDn(ymdStr) - hs.base) * 24 + hh;
// 시간자료가 끝까지(23시) 있는 마지막 날
export function hourlyLastDay(hs) {
  if (hs.lastIdx < 0) return null;
  const dn = hs.base + Math.floor(hs.lastIdx / 24);
  return hs.lastIdx % 24 === 23 ? dnToYmd(dn) : dnToYmd(dn - 1);
}
export const RAIN_HOUR = (v) => v >= 0.1; // 시간 강수 있음 = 1시간 강수량 0.1mm 이상

// ---------------------------------------------------------------- 산책·러닝: 사용자가 정한 조건을 만족한 정시 관측 비율(월별)
export const OUTDOOR_DEFAULT = { tmin: 10, tmax: 25, dry: true, wind: 5, h1: 6, h2: 9, hum: null };
export function parseOutdoor(q) {
  const g = (k, d) => (q[k] === undefined || q[k] === null || q[k] === "" ? d : Number(q[k]));
  const c = {
    tmin: g("tmin", OUTDOOR_DEFAULT.tmin),
    tmax: g("tmax", OUTDOOR_DEFAULT.tmax),
    dry: q.dry === undefined || q.dry === null || q.dry === "" ? OUTDOOR_DEFAULT.dry : q.dry === "1" || q.dry === true,
    wind: q.wind === "" || q.wind === "off" ? null : g("wind", OUTDOOR_DEFAULT.wind),
    h1: g("h1", OUTDOOR_DEFAULT.h1),
    h2: g("h2", OUTDOOR_DEFAULT.h2),
    hum: q.hum === undefined || q.hum === null || q.hum === "" || q.hum === "off" ? null : Number(q.hum),
  };
  const bad = (m) => {
    throw new StatsError(m);
  };
  if (!Number.isFinite(c.tmin) || !Number.isFinite(c.tmax) || c.tmin < -30 || c.tmax > 45 || c.tmin > c.tmax) bad("기온 범위는 -30~45℃ 사이에서 낮은 값 ≤ 높은 값으로 고르세요");
  if (c.wind !== null && (!Number.isFinite(c.wind) || c.wind < 0 || c.wind > 30)) bad("최대 풍속은 0~30m/s 사이입니다");
  if (c.hum !== null && (!Number.isFinite(c.hum) || c.hum < 0 || c.hum > 100)) bad("최대 습도는 0~100% 사이입니다");
  if (![c.h1, c.h2].every((h) => Number.isInteger(h) && h >= 0 && h <= 23) || c.h1 > c.h2) bad("시간대는 0~23시, 시작 ≤ 끝으로 고르세요");
  return c;
}
export function outdoorLabel(c) {
  const parts = [`기온 ${c.tmin}~${c.tmax}℃`];
  if (c.dry) parts.push("강수 없음(1시간 0.1mm 미만)");
  if (c.wind !== null) parts.push(`풍속 ${c.wind}m/s 이하`);
  if (c.hum !== null) parts.push(`습도 ${c.hum}% 이하`);
  parts.push(`${c.h1}~${c.h2}시 정시 관측`);
  return parts.join(" · ");
}
// 한 시각이 조건 판정에 쓸 수 있는가(필요한 항목이 모두 있음) / 조건을 만족하는가
export function outdoorJudge(hs, i, c) {
  if (!hs.src[i]) return null;
  const ta = hval(hs.ta, i);
  if (!Number.isFinite(ta)) return null;
  if (c.dry && !Number.isFinite(hval(hs.rn, i))) return null;
  if (c.wind !== null && !Number.isFinite(hval(hs.ws, i))) return null;
  if (c.hum !== null && !Number.isFinite(hval(hs.hm, i))) return null;
  return ta >= c.tmin && ta <= c.tmax && (!c.dry || !RAIN_HOUR(hval(hs.rn, i))) && (c.wind === null || hval(hs.ws, i) <= c.wind) && (c.hum === null || hval(hs.hm, i) <= c.hum);
}
function hourWalk(hs, fromYear, toYear, lastDay, fn) {
  const a = Math.max(ymdToDn(`${fromYear}-01-01`), hs.base);
  const b = Math.min(ymdToDn(`${toYear}-12-31`), ymdToDn(lastDay));
  for (let dn = a; dn <= b; dn++) {
    const ymdStr = dnToYmd(dn);
    fn(dn, ymdStr, +ymdStr.slice(5, 7), (dn - hs.base) * 24);
  }
}
export function outdoorShare(hs, c, { fromYear, toYear, asOf }) {
  const lastDay = minYmd(hourlyLastDay(hs), asOf);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, slots: 0, valid: 0, ok: 0 }));
  const eras = { base: { from: BASELINE.from, to: BASELINE.to }, recent: null };
  const lastFullYear = lastDay ? (lastDay.slice(5) === "12-31" ? +lastDay.slice(0, 4) : +lastDay.slice(0, 4) - 1) : null;
  if (lastFullYear) eras.recent = { from: lastFullYear - RECENT.years + 1, to: lastFullYear };
  const eraMonths = { base: months.map((m) => ({ month: m.month, valid: 0, ok: 0 })), recent: months.map((m) => ({ month: m.month, valid: 0, ok: 0 })) };
  if (lastDay) {
    hourWalk(hs, Math.min(fromYear, BASELINE.from), Math.max(toYear, lastFullYear || toYear), lastDay, (dn, ymdStr, mo, i0) => {
      const y = +ymdStr.slice(0, 4);
      const inRange = y >= fromYear && y <= toYear;
      const era = y >= eras.base.from && y <= eras.base.to ? "base" : eras.recent && y >= eras.recent.from && y <= eras.recent.to && eras.recent.from > BASELINE.to ? "recent" : null;
      for (let h = c.h1; h <= c.h2; h++) {
        const j = outdoorJudge(hs, i0 + h, c);
        if (inRange) {
          months[mo - 1].slots++;
          if (j !== null) {
            months[mo - 1].valid++;
            if (j) months[mo - 1].ok++;
          }
        }
        if (era && j !== null) {
          eraMonths[era][mo - 1].valid++;
          if (j) eraMonths[era][mo - 1].ok++;
        }
      }
    });
  }
  const pct = (o) => (o.valid ? round((o.ok / o.valid) * 100, 1) : null);
  for (const m of months) {
    m.share = pct(m);
    m.excluded = m.slots - m.valid;
  }
  for (const k of ["base", "recent"]) for (const m of eraMonths[k]) m.share = pct(m);
  const okMonths = months.filter((m) => m.share != null);
  const best = okMonths.length ? okMonths.reduce((a, b) => (b.share > a.share ? b : a)) : null;
  const worst = okMonths.length ? okMonths.reduce((a, b) => (b.share < a.share ? b : a)) : null;
  const total = { valid: months.reduce((a, m) => a + m.valid, 0), ok: months.reduce((a, m) => a + m.ok, 0), slots: months.reduce((a, m) => a + m.slots, 0) };
  total.share = pct(total);
  const text = [];
  if (best) text.push(`${fromYear}~${toYear}년 정시 관측 중 조건(${outdoorLabel(c)})을 만족한 비율은 ${best.month}월이 ${best.share}%로 가장 높고, ${worst.month}월이 ${worst.share}%로 가장 낮았습니다.`);
  else text.push("조건을 판정할 수 있는 관측이 없습니다.");
  if (total.slots && total.slots - total.valid > 0) text.push(`필요한 항목이 없는 ${(total.slots - total.valid).toLocaleString("ko-KR")}개 시각(전체 ${total.slots.toLocaleString("ko-KR")}개 중)은 분모에서 뺐습니다.`);
  if (c.hum !== null) text.push("1990년대 습도는 3시간 간격으로만 있어 그 시기는 판정 가능한 시각이 적습니다.");
  return { cond: c, condLabel: outdoorLabel(c), fromYear, toYear, asOf: lastDay, months, total, eras, eraMonths, best, worst, text };
}
function minYmd(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// ---------------------------------------------------------------- 출퇴근 시간 강수: 사용자가 정한 오전·저녁 시간대의 강수 관측 비율
export function parseHours(s, def) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s ?? ""));
  if (!s) return def;
  if (!m || +m[1] > +m[2] || +m[2] > 23) throw new StatsError("시간대는 '7-9'처럼 시작-끝(0~23시)으로 고르세요");
  return [+m[1], +m[2]];
}
export function commuteShare(hs, { am = [7, 9], pm = [17, 19], weekdays = true }, { fromYear, toYear, asOf }) {
  const lastDay = minYmd(hourlyLastDay(hs), asOf);
  const mk = () => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, hValid: 0, hRain: 0, dValid: 0, dRain: 0 }));
  const win = { am: mk(), pm: mk(), all: mk() };
  const ranges = { am, pm, all: [0, 23] };
  let days = 0;
  if (lastDay) {
    hourWalk(hs, fromYear, toYear, lastDay, (dn, ymdStr, mo, i0) => {
      const wd = new Date(dn * DAY_MS).getUTCDay();
      if (weekdays && (wd === 0 || wd === 6)) return;
      let any = false;
      for (let h = 0; h < 24 && !any; h++) any = hs.src[i0 + h] > 0;
      if (!any) return; // 그날 시간자료가 하나도 없으면 날 수에서도 뺌
      days++;
      for (const k of ["am", "pm", "all"]) {
        const [a, b] = ranges[k];
        let allValid = true;
        let any = false;
        for (let h = a; h <= b; h++) {
          const i = i0 + h;
          const v = hs.src[i] ? hval(hs.rn, i) : NaN;
          if (!Number.isFinite(v)) {
            allValid = false;
            continue;
          }
          win[k][mo - 1].hValid++;
          if (RAIN_HOUR(v)) {
            win[k][mo - 1].hRain++;
            any = true;
          }
        }
        if (allValid) {
          win[k][mo - 1].dValid++;
          if (any) win[k][mo - 1].dRain++;
        }
      }
    });
  }
  const pct = (a, b) => (b ? round((a / b) * 100, 1) : null);
  const out = {};
  for (const k of ["am", "pm", "all"]) {
    const ms = win[k].map((m) => ({ ...m, hShare: pct(m.hRain, m.hValid), dShare: pct(m.dRain, m.dValid) }));
    const t = ms.reduce((a, m) => ({ hValid: a.hValid + m.hValid, hRain: a.hRain + m.hRain, dValid: a.dValid + m.dValid, dRain: a.dRain + m.dRain }), { hValid: 0, hRain: 0, dValid: 0, dRain: 0 });
    out[k] = { range: ranges[k], months: ms, total: { ...t, hShare: pct(t.hRain, t.hValid), dShare: pct(t.dRain, t.dValid) } };
  }
  const text = [];
  if (out.am.total.hValid) {
    text.push(`${fromYear}~${toYear}년 ${weekdays ? "평일(월~금)" : "모든 날"} 기준: 출근 시간(${am[0]}~${am[1]}시) 정시 관측의 ${out.am.total.hShare}%, 퇴근 시간(${pm[0]}~${pm[1]}시)의 ${out.pm.total.hShare}%에서 강수(1시간 0.1mm 이상)가 관측됐습니다. 하루 전체 시각은 ${out.all.total.hShare}%입니다.`);
    text.push(`출근 시간대에 한 번이라도 강수가 관측된 날은 ${out.am.total.dShare}%, 퇴근 시간대는 ${out.pm.total.dShare}%입니다(그 시간대 시각이 모두 있는 날만 분모).`);
  } else text.push("판정할 수 있는 시간자료가 없습니다.");
  return { am, pm, weekdays, fromYear, toYear, asOf: lastDay, days, windows: out, text };
}

// ---------------------------------------------------------------- 열대야(추정): 그날 18:01~다음 날 09:00 의 정시 기온(19~09시, 15개) 최저가 25℃ 이상
// 공식 열대야는 분 단위 밤 최저기온 기준이다. 정시 관측의 최솟값은 실제 최저보다 높을 수 있어 '추정치'로만 쓴다. 15개 중 하나라도 없으면 그 밤은 판정하지 않는다.
export const NIGHT = { hours: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], threshold: 25 };
export function nightMin(hs, ymdStr) {
  const i0 = hourIdx(hs, ymdStr, 0);
  let min = Infinity;
  for (const h of NIGHT.hours) {
    const i = i0 + h;
    if (i < 0 || i >= hs.n || !hs.src[i]) return null;
    const v = hval(hs.ta, i);
    if (!Number.isFinite(v)) return null;
    if (v < min) min = v;
  }
  return min;
}
export function tropicalYear(hs, p, year, lastDay) {
  const r = resolvePeriod(p, year);
  if (!r) return { year, status: "nodate", value: null };
  const base = { year, start: r.start, end: r.end, days: r.days };
  // 밤 D 는 D+1 09시까지 필요 → 판정 가능한 마지막 밤 = lastDay 의 전날
  const lastNight = lastDay ? dnToYmd(ymdToDn(lastDay) - 1) : null;
  if (!lastNight || r.start > lastNight) return { ...base, status: "future", value: null, obs: 0 };
  const end = r.end > lastNight ? lastNight : r.end;
  let valid = 0;
  let cnt = 0;
  let maxMin = -Infinity;
  let maxDate = null;
  for (let dn = ymdToDn(r.start); dn <= ymdToDn(end); dn++) {
    const d = dnToYmd(dn);
    const m = nightMin(hs, d);
    if (m === null) continue;
    valid++;
    if (m >= NIGHT.threshold) cnt++;
    if (m > maxMin) {
      maxMin = m;
      maxDate = d;
    }
  }
  const nights = ymdToDn(end) - ymdToDn(r.start) + 1;
  const status = r.end > lastNight ? "ongoing" : valid === r.days ? "complete" : valid ? "partial" : "none";
  return { ...base, status, obs: valid, nights, value: status === "complete" ? cnt : null, countValid: cnt, warmestNight: maxDate ? { date: maxDate, min: round(maxMin, 1) } : null, until: status === "ongoing" ? end : undefined, raw: status === "complete" ? cnt : null };
}
export function tropicalNights(hs, p, { fromYear, toYear, asOf }) {
  const lastDay = minYmd(hourlyLastDay(hs), asOf);
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) rows.push(tropicalYear(hs, p, y, lastDay));
  const all = [];
  for (let y = Math.min(BASELINE.from, fromYear); y <= Math.max(toYear, lastDay ? +lastDay.slice(0, 4) : toYear); y++) all.push(tropicalYear(hs, p, y, lastDay));
  const delta = decadeDelta({ digits: 0, agg: "count", group: "days", unit: "일" }, all);
  const ok = rows.filter((r) => r.status === "complete");
  const summary = {
    completeYears: ok.length,
    highest: ok.length ? { value: Math.max(...ok.map((r) => r.value)), years: ok.filter((r) => r.value === Math.max(...ok.map((x) => x.value))).map((r) => r.year) } : null,
    latest: ok.length ? { year: ok[ok.length - 1].year, value: ok[ok.length - 1].value, rank: rankOf(ok.map((r) => r.value), ok[ok.length - 1].value) } : null,
    incomplete: rows.filter((r) => r.status === "partial" || r.status === "none").map((r) => ({ year: r.year, obs: r.obs, days: r.days, countValid: r.countValid })),
  };
  const text = [];
  if (summary.latest) text.push(`${summary.latest.year}년 ${periodLabel(p)} 열대야(추정): ${summary.latest.value}일 — 모든 밤을 판정할 수 있었던 ${summary.latest.rank.of}개 연도 중 많은 순 ${summary.latest.rank.high}위입니다.`);
  else text.push("모든 밤의 정시 기온이 갖춰진 연도가 없어 연도 값을 내지 않습니다.");
  const early = summary.incomplete.filter((x) => x.year < 2000).length;
  if (early >= 5) text.push(`${early}개 연도(1990년대)는 새벽 기온 결측(3시간 간격 관측)으로 판정 못 한 밤이 있어 연도 값을 내지 않았습니다.`);
  text.push(delta.available ? `최근 ${delta.recent.from}~${delta.recent.to}년 평균 ${delta.recent.mean}일, ${delta.baseline.from}~${delta.baseline.to}년 평균 ${delta.baseline.mean}일(차이 ${delta.delta > 0 ? "+" : delta.delta < 0 ? "−" : "±"}${Math.abs(delta.delta)}일).` : `1990년대 대비: ${delta.reason}`);
  return { period: { key: p.key, label: periodLabel(p) }, fromYear, toYear, asOf: lastDay, rows: rows.map(({ raw, ...r }) => r), summary, delta, text, estimate: true };
}

// ---------------------------------------------------------------- 생활 속 날씨 계산 기준(화면 '계산 기준'에 그대로)
export const LIFE_RULES = {
  heat: ["'최고기온 30℃ 이상'은 이 서비스의 기준이며 여름 시작·폭염특보 기준이 아닙니다.", "첫날·마지막 날은 그해 구간에 빠진 날이 없을 때만 확정합니다. 그런 날이 없었던 해는 날짜 평균에서 뺍니다.", "날짜 평균은 평년 달력 위치(1/1=1일)로 계산하고 월/일로 바꿔 보여 줍니다."],
  streaks: ["연속 강수일 = 일강수량 0.1mm 이상인 날이 이어진 날 수, 연속 무강수일 = 자료가 있고 0.1mm 미만인 날이 이어진 날 수.", "자료 없는 날이 끼면 그 앞뒤를 잇지 않습니다(결측일을 건너뛰지 않음).", "연도별 값은 그 해 구간 안에서만 셉니다(구간 밖으로 이어진 날은 자름). '보유 기간 최장 기록'은 구간과 상관없이 셉니다."],
  weekend: ["주말 = 토·일, 평일 = 월~금(공휴일은 따로 구분하지 않음).", "비율 = 강수일(0.1mm 이상) ÷ 공식 일자료가 있는 날(유효 관측일). 주말과 평일의 일수가 달라 단순 일수가 아닌 비율로 비교합니다.", "비율 차이는 %p 로 표시합니다."],
  day: ["매년 같은 월·일의 공식 일자료입니다. 2월 29일은 윤년에만 있습니다.", "'강수가 있었던 해의 비율' = 그날 0.1mm 이상 강수가 있었던 해 ÷ 자료가 있는 해. 과거 관측이며 앞으로의 강수확률·예보가 아닙니다."],
  outdoor: ["조건은 사용자가 정한 값이며 공식 건강·안전 기준이 아닙니다.", "시간자료(정시 관측) 집계: 고른 시간대의 정시 관측 중 조건을 모두 만족한 시각의 비율. 필요한 항목이 없는 시각은 분모에서 뺍니다.", "강수 없음 = 1시간 강수량 0.1mm 미만(공란은 무강수, 품질 플래그 9 는 자료 없음)."],
  commute: ["시간자료(정시 관측) 집계: 고른 시간대 정시 관측 중 1시간 강수량 0.1mm 이상인 시각의 비율.", "'강수가 관측된 날'은 그 시간대 정시 관측이 모두 있는 날만 분모로 셉니다.", "평일 = 월~금(공휴일 미반영). 정시 관측만 쓰므로 시각 사이의 짧은 비는 빠질 수 있습니다."],
  tropical: ["추정치: 공식 열대야는 18:01~다음 날 09:00 의 밤 최저기온 25℃ 이상인 날입니다. 공식 밤 최저기온 자료가 없어 정시 기온(19~09시, 15개)의 최솟값으로 셉니다. 실제 최저는 정시 사이에 더 낮을 수 있어 실제보다 많게 셀 수 있습니다.", "15개 정시 중 하나라도 없으면 그 밤은 판정하지 않고, 판정 못 한 밤이 있는 해는 순위·증감에서 뺍니다.", "밤은 시작한 날짜(그날 저녁)로 셉니다.", "1990년대 시간자료는 새벽 01·02시(때때로 04·05·07시) 기온이 결측(품질 플래그 9, 3시간 간격 관측)이라 대부분의 밤을 판정할 수 없습니다. 그래서 1990년대 대비 변화는 계산하지 않습니다."],
  records: ["보유 관측기간(1990년~)의 공식 일자료 순위입니다. 같은 값은 같은 순위이며, 10위와 같은 값이면 함께 보여 줍니다.", "강수량·적설 순위는 0보다 큰 날만 셉니다. '자료 없음'인 날은 빠지며 그 수를 함께 표시합니다.", "관측지점 한 곳의 기록이며 그 지역 전체의 기록이 아닙니다."],
  snow: ["눈 통계는 공식 일자료의 최심신적설(그날 새로 쌓인 눈의 가장 깊은 값)·최심적설(가장 깊이 쌓인 눈)만 씁니다. 적설을 더해 강설량을 만들지 않습니다.", "눈이 내렸어도 쌓이지 않으면 0 입니다. 일자료 행이 있는데 적설이 비어 있으면 '쌓인 눈 없음'으로 봅니다.", "적설 관측 방식 변화(자동 관측 전환 등)로 연도 간 비교에 한계가 있을 수 있습니다."],
};
