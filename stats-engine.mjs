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
const FIELDS = ["avg", "max", "min", "rain", "hum", "wind"];
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
    const rain = num(r.precipitation);
    if (Number.isFinite(rain)) arr.rain[i] = rain;
    else if (Number.isFinite(arr.avg[i]) || Number.isFinite(arr.max[i]) || Number.isFinite(arr.min[i])) {
      arr.rain[i] = 0;
      rainBlank[i] = 1;
    }
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
