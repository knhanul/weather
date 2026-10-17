// 날짜로 보는 날씨: 날짜 기준(양력·음력) 하나에 대해 기준연도별 '정확히 그날'의 공식 일자료·시간자료를 뽑아 지표별 표본·상태·통계를 계산한다.
// 순수 함수(DB·HTTP 모름). 날짜 대응은 calendar-resolver.mjs, 저장소는 stats-engine.mjs buildDailyStore()/createHourlyStore() 그대로.
// 화면 그래프·숫자 카드·이야기·표·CSV 는 모두 이 결과 객체 하나를 쓴다. 계산 중간에는 반올림하지 않는다(화면·CSV 에서 반올림).
//
// 원칙(docs/DATE_WEATHER_RULES.md 와 같은 문장):
//  - 각 기준연도의 정확한 해당 날짜만 쓴다(주변 ±n일 섞지 않음). 실시간 화면의 ±7일 평균·표본 60개 기준과 무관하다.
//  - 날짜 상태(그해에는 없는 날짜 / 변환 범위 밖 / 미래 / 오늘 진행 중 / 자료 미제공 / 수집 대기)와 관측 상태(자료 없음 / 품질 확인으로 제외)를 구분한다.
//  - 결측을 0 으로 세지 않는다. 일강수량 공란은 그날 행이 있고 기온이 있을 때만 기상청 관례대로 무강수 0(rainBlank, 사유 기록).
//    시간 강수 공란은 그 시각 행이 있고 rn_qcflg≠9 일 때만 무강수 0(qc 비트 rnBlank). 행 없음·플래그 9 는 자료 없음.
//  - 시간 강수량은 기상청 정시값 = 앞 1시간 누적. 그날 h~h+1시 구간 = (h+1)시 값, 23~24시 = 다음날 00시 값. 하루 강수량으로 더하지 않는다(공식 일강수량을 따로 씀).
//  - 시간 평균은 같은 시각끼리 '해마다 한 값'을 평균(관측이 많은 해에 가중치 없음). 보간하지 않는다.
import { resolveYear, specLabel, specKey, CALENDAR_VERSION, solarToLunar } from "./calendar-resolver.mjs";
import { ymdToDn, dnToYmd, hval, QC_BITS, HOURLY_FROM, DAILY_QC, METRICS, aggregate, MAX_MISSING_DAYS } from "./stats-engine.mjs";

export const POLICY_VERSION = "date-stats.2026-10-17.v1";
export const STORY_VERSION = "date-story.2026-10-18.v2"; // v2: 같은 날 평균 대신 해마다의 횟수·극값·앞뒤 15일 통계로 쓴 이야기
// v2(2026-10-18) 화면 모델: 해마다 이날(횟수·극값, 같은 날 평균 없음) + 앞뒤 15일 날씨 통계(31일 창). 배틀은 POLICY_VERSION 그대로
export const DAY_VERSION = "date-day.2026-10-18.v2";
// 표시 정책(서비스 제안 기준이며 기상청 공식 통계 기준이 아님)
export const SAMPLE_POLICY = {
  minReference: 1, // N 1~2: 개별값 + '참고 평균 · N개 해'(승패·강한 요약·분포 밴드 없음)
  minStats: 3, // N ≥ 3: 기술통계
  limitedBelow: 0.8, // valid/eligible < 80% → '자료 제한' 배지, 강조 문장 생략
  bandMinN: 10, // P10~P90 밴드: 그 시각 N ≥ 10 이고 관측률 ≥ 80%
  quantile: "R-7(선형 보간, Excel PERCENTILE.INC 와 같음)",
};
export const DAILY_FROM = "1970-01-01"; // 서비스가 지원하는 공식 일자료 시작(8개 지점 1970-01-01~ 보유)
export { HOURLY_FROM };
export const WINDOW_YEARS = [5, 10, 20, 30];

export const STATUS_TEXT = {
  ok: "자료 있음",
  nodate: "그해에는 없는 날짜",
  range: "음력 변환 지원 범위 밖",
  future: "아직 관측되지 않음",
  ongoing: "하루 관측 진행 중",
  unsupported: "해당 기간 자료 미제공",
  pending: "수집 대기",
  missing: "자료 없음",
  qc: "품질 확인으로 제외",
  error: "조회 실패 · 재시도",
};
// 날짜 단계에서 표본 후보(eligible)에서 빠지는 사유 — 관측 결측(missing·qc)은 eligible 에 남고 valid 에서만 빠진다
const DATE_EXCLUDE = new Set(["nodate", "range", "future", "ongoing", "unsupported", "pending"]);

// 일자료 지표(공식 일자료 한 값/해)
export const DAILY_METRICS = {
  avg: { label: "평균기온", unit: "℃", digits: 1, def: "각 해 그날 공식 일평균기온(최고·최저의 중간값이 아님)" },
  max: { label: "평균 최고기온", unit: "℃", digits: 1, def: "각 해 그날 일최고기온의 평균" },
  min: { label: "평균 최저기온", unit: "℃", digits: 1, def: "각 해 그날 일최저기온의 평균" },
  range: { label: "평균 일교차", unit: "℃", digits: 1, def: "같은 해의 (일최고 − 일최저)를 먼저 계산한 뒤 평균. 두 값이 모두 있는 해만" },
  rain: { label: "평균 일강수량", unit: "mm", digits: 1, def: "유효한 일강수량 합 ÷ N(무강수 0 포함). 비 온 해만의 평균이 아님" },
  wind: { label: "평균 풍속", unit: "m/s", digits: 1, def: "각 해 그날 공식 일평균 풍속의 평균(최대 풍속 아님)" },
  hum: { label: "평균 상대습도", unit: "%", digits: 0, def: "각 해 그날 공식 일평균 상대습도의 평균" },
  // 선택 확장(2026-10-18): 공식 일자료의 최대 순간풍속·합계 일조시간. 공란 = 자료 없음(0 으로 세지 않음), 범위·일관성 확인에서 빠지면 '품질 확인으로 제외'
  gust: { label: "평균 최대 순간풍속", unit: "m/s", digits: 1, extra: true, def: "각 해 그날 공식 일최대 순간풍속의 평균. 0~75m/s 이고 그날 최대 풍속(10분 평균) 이상인 값만" },
  sun: { label: "평균 일조시간", unit: "시간", digits: 1, extra: true, def: "각 해 그날 공식 합계 일조시간의 평균. 0 이상·가조시간(없으면 14.8시간) 이하인 값만" },
};
export const HOURLY_METRICS = {
  ta: { label: "기온", unit: "℃", digits: 1, chart: "line" },
  rn: { label: "강수량", unit: "mm", digits: 1, chart: "bar", def: "h~h+1시 1시간 강수량(기상청 정시값 = 앞 1시간 누적)" },
  ws: { label: "풍속", unit: "m/s", digits: 1, chart: "line" },
  hm: { label: "습도", unit: "%", digits: 0, chart: "line" },
};
const QC_OF = { ta: QC_BITS.ta, rn: QC_BITS.rn, ws: QC_BITS.ws, hm: QC_BITS.hm };
export const RAIN_DAY = (v) => v >= 0.1; // 강수일 = 일강수량 0.1mm 이상(stats-engine 과 같은 정의)

// ---------------------------------------------------------------- 기간
// window: { mode: "recent", years: 5|10|20|30, toYear } | { mode: "all", toYear } | { mode: "custom", fromYear, toYear }
// recent N = toYear−N+1 ~ toYear(고정 구간, 빠진 해가 있어도 늘리지 않음). all 의 시작은 allFrom(지원 범위 안 가장 이른 기준연도)
export function windowYears(win, allFrom) {
  if (win.mode === "recent") return { fromYear: win.toYear - win.years + 1, toYear: win.toYear };
  if (win.mode === "all") return { fromYear: Math.min(allFrom, win.toYear), toYear: win.toYear };
  return { fromYear: win.fromYear, toYear: win.toYear };
}
export const windowKey = (w) => (w.mode === "recent" ? `r${w.years}-${w.toYear}` : w.mode === "all" ? `all-${w.toYear}` : `c${w.fromYear}-${w.toYear}`);
export const windowLabel = (w, yrs) => (w.mode === "recent" ? `최근 ${w.years}년(${yrs.fromYear}~${yrs.toYear})` : w.mode === "all" ? `전체(${yrs.fromYear}~${yrs.toYear})` : `직접 지정(${yrs.fromYear}~${yrs.toYear})`);
// 일자료 기준 '전체' 시작: 그 지점 첫 일자료 날짜 이후에 대응하는 가장 이른 기준연도(음력 연초는 양력 전년 말일 수 있어 한 해 앞부터 확인)
export function allFromYear(spec, firstDate) {
  const fy = +String(firstDate || DAILY_FROM).slice(0, 4);
  const from = firstDate && firstDate > DAILY_FROM ? firstDate : DAILY_FROM;
  for (let y = fy - 1; y <= fy + 8; y++) {
    const r = resolveYear(spec, y);
    if (r.status === "ok" && r.solarDate >= from) return y;
  }
  return fy;
}

// ---------------------------------------------------------------- 기준연도 한 해의 날짜 상태
// ctx: { today: 'YYYY-MM-DD'(한국 시각 실제 오늘), dailyFrom, dailyLast, hourlyFrom, hourlyLast }
function dateState(res, from, last, today) {
  if (res.status !== "ok") return res.status; // nodate | range
  if (res.solarDate > today) return "future";
  if (res.solarDate === today) return "ongoing";
  if (from && res.solarDate < from) return "unsupported";
  if (!last || res.solarDate > last) return "pending";
  return "ok";
}
const fin = (v) => (Number.isFinite(v) ? v : null);

// 일자료 한 해: 값(없으면 null)과 항목별 상태
export function dailyYear(store, res, ctx) {
  const state = dateState(res, ctx.dailyFrom, ctx.dailyLast, ctx.today);
  const out = { referenceYear: res.referenceYear, solarDate: res.solarDate, lunarDate: res.lunarDate, isLeapMonth: res.isLeapMonth, lunarText: res.lunarText || null, dateStatus: state, reason: res.reason || null, values: {}, fieldStatus: {}, rainNorm: null, rowPresent: false };
  if (state !== "ok") {
    for (const k of Object.keys(DAILY_METRICS)) { out.values[k] = null; out.fieldStatus[k] = state; }
    out.values.nsnow = null;
    return out;
  }
  const i = ymdToDn(res.solarDate) - store.base;
  const present = i >= 0 && i < store.n && store.present[i] === 1;
  out.rowPresent = present;
  const get = (f) => (present ? fin(store[f][i]) : null);
  const v = { avg: get("avg"), max: get("max"), min: get("min"), rain: get("rain"), wind: get("wind"), hum: get("hum"), nsnow: get("nsnow"), gust: store.gust ? get("gust") : null, sun: store.sun ? get("sun") : null };
  v.range = v.max != null && v.min != null ? v.max - v.min : null;
  out.values = v;
  const dq = present && store.dq ? store.dq[i] : 0;
  for (const k of Object.keys(DAILY_METRICS)) out.fieldStatus[k] = v[k] != null ? "ok" : DAILY_QC[k] && dq & DAILY_QC[k] ? "qc" : "missing";
  out.rainNorm = !present ? "noRow" : v.rain == null ? "missing" : store.rainBlank[i] === 1 ? "blank0" : "value";
  return out;
}

// 시간자료 한 해: 4개 지표 × 24칸(값·상태). 강수 h칸 = h~h+1시 구간
export function hourlyYear(hs, res, ctx) {
  const state = !hs ? "error" : dateState(res, ctx.hourlyFrom, ctx.hourlyLast, ctx.today);
  const out = { referenceYear: res.referenceYear, solarDate: res.solarDate, lunarDate: res.lunarDate, isLeapMonth: res.isLeapMonth, dateStatus: state, series: {}, cellStatus: {}, rainBlankHours: 0 };
  for (const k of Object.keys(HOURLY_METRICS)) { out.series[k] = new Array(24).fill(null); out.cellStatus[k] = new Array(24).fill(state); }
  if (state !== "ok") return out;
  const i0 = (ymdToDn(res.solarDate) - hs.base) * 24;
  for (const k of Object.keys(HOURLY_METRICS)) {
    for (let h = 0; h < 24; h++) {
      const i = k === "rn" ? i0 + h + 1 : i0 + h;
      if (i < 0 || i >= hs.n || i > hs.lastIdx) { out.cellStatus[k][h] = i > hs.lastIdx ? "pending" : "missing"; continue; }
      const v = hval(hs[k], i);
      if (Number.isFinite(v)) {
        out.series[k][h] = v;
        out.cellStatus[k][h] = "ok";
        if (k === "rn" && hs.qc && hs.qc[i] & QC_BITS.rnBlank) out.rainBlankHours++;
      } else out.cellStatus[k][h] = hs.qc && hs.qc[i] & QC_OF[k] ? "qc" : "missing";
    }
  }
  return out;
}

// ---------------------------------------------------------------- 표본·통계
// R-7 분위수(정렬된 배열)
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export function tierOf(n, eligible) {
  const coverage = eligible ? n / eligible : null;
  const tier = n === 0 ? "none" : n < SAMPLE_POLICY.minStats ? "reference" : "stats";
  return { tier, coverage, limited: tier === "stats" && coverage != null && coverage < SAMPLE_POLICY.limitedBelow };
}
// items: [{ year, status, value }] (status: ok|missing|qc|날짜 사유) → 지표 요약
export function summarize(items, { digits = 1, kind = "mean" } = {}) {
  const candidateYears = items.map((x) => x.year);
  const excludedYearsByReason = {};
  const eligibleYears = [];
  const validYears = [];
  const vals = [];
  for (const x of items) {
    if (DATE_EXCLUDE.has(x.status) || x.status === "error") (excludedYearsByReason[x.status] ||= []).push(x.year);
    else {
      eligibleYears.push(x.year);
      if (x.status === "ok" && x.value != null) { validYears.push(x.year); vals.push({ year: x.year, value: x.value }); }
      else (excludedYearsByReason[x.status === "qc" ? "qc" : "missing"] ||= []).push(x.year);
    }
  }
  const n = vals.length;
  const t = tierOf(n, eligibleYears.length);
  const out = { candidateYears, eligibleYears, validYears, excludedYearsByReason, n, eligible: eligibleYears.length, ...t, mean: null, sum: null, min: null, max: null, minYears: [], maxYears: [] };
  if (!n) return out;
  const sum = vals.reduce((a, b) => a + b.value, 0);
  out.sum = sum;
  out.mean = sum / n;
  const rv = (v) => Math.round(v * 10 ** digits);
  let mx = -Infinity;
  let mn = Infinity;
  for (const x of vals) { mx = Math.max(mx, x.value); mn = Math.min(mn, x.value); }
  out.max = mx;
  out.min = mn;
  // 극값 해: 표시 정밀도로 같으면 공동(동률을 숨기지 않음)
  out.maxYears = vals.filter((x) => rv(x.value) === rv(mx)).map((x) => x.year);
  out.minYears = vals.filter((x) => rv(x.value) === rv(mn)).map((x) => x.year);
  if (kind === "band" && n >= SAMPLE_POLICY.bandMinN && !t.limited && t.coverage >= SAMPLE_POLICY.limitedBelow) {
    const s = vals.map((x) => x.value).sort((a, b) => a - b);
    out.p10 = quantile(s, 0.1);
    out.p90 = quantile(s, 0.9);
  }
  return out;
}
// 강수 묶음: 강수일수 k·비율·평균 일강수량·선택 날짜 누적 — 같은 강수 유효 연도 N 하나로 계산(식이 서로 맞음)
export function rainSummary(items) {
  const s = summarize(items, { digits: 1 });
  const rainyYears = s.validYears.filter((y) => RAIN_DAY(items.find((x) => x.year === y).value));
  return { ...s, rainyYears, k: rainyYears.length, share: s.n ? (rainyYears.length / s.n) * 100 : null, total: s.n ? s.sum : null };
}

// ---------------------------------------------------------------- 날짜 하나 계산
// opts: { spec, store, hs, ctx, win: {fromYear,toYear}, windowInfo, selectedYears: [..최대 3], part: daily|hourly|all }
export function dateWeather({ spec, store, hs = null, ctx, years, selectedYears = [], part = "all" }) {
  const resolved = [];
  for (let y = years.fromYear; y <= years.toYear; y++) resolved.push(resolveYear(spec, y));
  const sel = selectedYears.slice(0, 3).map((y) => resolveYear(spec, y));
  const out = { spec, specKey: specKey(spec), specLabel: specLabel(spec), compareText: `매년 ${specLabel(spec)}을 비교 중`, years, policy: { version: POLICY_VERSION, calendarVersion: CALENDAR_VERSION, storyVersion: STORY_VERSION, sample: SAMPLE_POLICY, dailyFrom: ctx.dailyFrom, hourlyFrom: ctx.hourlyFrom }, dateMap: resolved.map((r) => ({ referenceYear: r.referenceYear, status: r.status, reason: r.reason || null, solarDate: r.solarDate, lunarDate: r.lunarDate, isLeapMonth: r.isLeapMonth, lunarText: r.lunarText || null })) };
  out.dateCounts = { requested: resolved.length, exists: resolved.filter((r) => r.status === "ok").length, nodate: resolved.filter((r) => r.status === "nodate").length, range: resolved.filter((r) => r.status === "range").length };
  if (part !== "hourly") {
    const rows = resolved.map((r) => dailyYear(store, r, ctx));
    out.daily = { rows, metrics: {} };
    for (const [k, m] of Object.entries(DAILY_METRICS)) {
      const items = rows.map((r) => ({ year: r.referenceYear, status: r.dateStatus === "ok" ? r.fieldStatus[k] : r.dateStatus, value: r.values[k] }));
      out.daily.metrics[k] = k === "rain" ? rainSummary(items) : summarize(items, { digits: m.digits });
    }
    out.counts = yearCounts(rows);
    out.around = aroundPart(store, resolved, ctx);
    out.selected = sel.map((r) => ({ ...dailyYear(store, r, ctx) }));
    out.aroundSelected = sel.length ? aroundYear(store, sel[0], ctx) : null;
    out.stories = dailyStories(out);
  }
  if (part !== "daily") out.hourly = hourlyPart(hs, resolved, sel, ctx);
  return out;
}

export function hourlyPart(hs, resolved, sel, ctx) {
  const rows = resolved.map((r) => hourlyYear(hs, r, ctx));
  const metrics = {};
  for (const [k, m] of Object.entries(HOURLY_METRICS)) {
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const items = rows.map((r) => ({ year: r.referenceYear, status: r.dateStatus === "ok" ? r.cellStatus[k][h] : r.dateStatus, value: r.series[k][h] }));
      const s = summarize(items, { digits: m.digits, kind: k === "ta" ? "band" : "mean" });
      hours.push({ hour: h, n: s.n, eligible: s.eligible, tier: s.tier, limited: s.limited, coverage: s.coverage, mean: s.mean, p10: s.p10 ?? null, p90: s.p90 ?? null, min: s.min, max: s.max, excluded: Object.fromEntries(Object.entries(s.excludedYearsByReason).map(([a, b]) => [a, b.length])) });
    }
    metrics[k] = { ...m, hours, interval: k === "rn" ? "h~h+1시" : "정시" };
  }
  // 히트맵: 행 = 기준연도, 열 = 시각, 값 = 원값(차이는 화면에서 같은 시각 평균을 빼서 — 같은 서버 평균)
  const heat = rows.map((r) => ({ referenceYear: r.referenceYear, solarDate: r.solarDate, lunarDate: r.lunarDate, isLeapMonth: r.isLeapMonth, dateStatus: r.dateStatus, series: r.series, cellStatus: r.cellStatus }));
  const selected = sel.map((r) => hourlyYear(hs, r, ctx));
  const out = { metrics, heat, selected, rainBlankHours: rows.reduce((a, r) => a + r.rainBlankHours, 0) };
  out.stories = hourlyStories(out, metrics, selected);
  return out;
}

// ---------------------------------------------------------------- v2: 해마다 이날 — 평균 없이 '몇 번'(횟수)과 극값 해
// 기준값은 stats-engine METRICS 의 정의를 그대로 쓴다(강수일 0.1mm·30℃·33℃ 폭염·최저 0℃ 미만·최고 0℃ 미만·신적설 > 0).
// months = 이 날짜(양력 월)가 이 계절에 들 때 항상 보여 줌. 계절 밖이어도 한 번이라도 있었으면 보여 줌(없는 일을 0번이라고 늘어놓지 않음).
export const COUNT_RULES = [
  { id: "rain", field: "rain", test: METRICS.rain_days.test, label: "비·눈 온 해", cond: "일강수량 0.1mm 이상(비·눈 등 모든 강수)", months: null },
  { id: "hot30", field: "max", test: METRICS.hot30_days.test, label: "최고 30℃ 이상", cond: "일최고기온 30℃ 이상", months: [5, 6, 7, 8, 9] },
  { id: "heat33", field: "max", test: METRICS.heatwave_days.test, label: "최고 33℃ 이상", cond: "일최고기온 33℃ 이상(기상청 폭염일수 기준)", months: [6, 7, 8, 9] },
  { id: "frost", field: "min", test: METRICS.frost_days.test, label: "최저 영하", cond: "일최저기온 0℃ 미만", months: [10, 11, 12, 1, 2, 3, 4] },
  { id: "ice", field: "max", test: METRICS.ice_days.test, label: "하루 종일 영하", cond: "일최고기온 0℃ 미만", months: [11, 12, 1, 2, 3] },
  { id: "snow", field: "nsnow", test: METRICS.snow_days.test, label: "눈이 새로 쌓인 해", cond: "일 최심신적설 0cm 초과(그날 행이 있고 공란이면 눈 없음)", months: [11, 12, 1, 2, 3] },
];
const fieldItems = (rows, f) => rows.map((r) => ({ year: r.referenceYear, status: r.dateStatus !== "ok" ? r.dateStatus : r.values[f] != null ? "ok" : r.fieldStatus[f] || "missing", value: r.values[f] }));
export function yearCounts(rows) {
  const months = new Set(rows.filter((r) => r.solarDate).map((r) => +r.solarDate.slice(5, 7)));
  const counts = COUNT_RULES.map((rule) => {
    const items = fieldItems(rows, rule.field);
    const s = summarize(items, { digits: 1 });
    const hitYears = s.validYears.filter((y) => rule.test(items.find((x) => x.year === y).value));
    const seasonal = !rule.months || rule.months.some((m) => months.has(m));
    return { id: rule.id, label: rule.label, cond: rule.cond, field: rule.field, k: hitYears.length, n: s.n, eligible: s.eligible, requested: items.length, hitYears, validYears: s.validYears, excludedYearsByReason: s.excludedYearsByReason, tier: s.tier, limited: s.limited, seasonal, show: seasonal || hitYears.length > 0 };
  });
  const ext = (f, which, cond = () => true) => {
    const s = summarize(fieldItems(rows, f), { digits: 1 });
    if (!s.n) return { n: 0, value: null, years: [] };
    const v = which === "max" ? s.max : s.min;
    if (!cond(v)) return { n: s.n, value: null, years: [] };
    return { n: s.n, eligible: s.eligible, value: v, years: which === "max" ? s.maxYears : s.minYears, tier: s.tier, limited: s.limited };
  };
  const extremes = {
    hottest: { label: "가장 더웠던 해", def: "일최고기온이 가장 높았던 해(표시 자리수로 같으면 공동)", field: "max", ...ext("max", "max") },
    coldest: { label: "가장 추웠던 해", def: "일최저기온이 가장 낮았던 해(공동 포함)", field: "min", ...ext("min", "min") },
    wettest: { label: "강수가 가장 많았던 해", def: "일강수량이 가장 많았던 해(0.1mm 이상일 때만, 공동 포함)", field: "rain", ...ext("rain", "max", (v) => v >= 0.1) },
  };
  return { rules: counts, extremes, months: [...months].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- v2: 앞뒤 15일 날씨 통계(그해 날짜 ±15일 = 31일 창)
// 한 해의 창 = 그해 실제 양력 날짜(음력이면 그해 음력 날짜의 양력) 앞뒤 15일. 연말·연초를 넘으면 그대로 이어서(1/5 → 전년 12/21~1/20).
// 그해에 날짜가 없으면(평년 2/29·윤달 없음·음력 30일 없음) 다른 날로 바꾸지 않고 창도 만들지 않는다(그해에는 없는 날짜).
// 지표마다 stats-engine aggregate() 를 그대로 씀: 31일 중 자료 없는 날이 1일 이하면 그 해를 넣고(남은 날로만 집계), 2일 이상이면 '자료 부족'으로 뺀다.
export const AROUND = { before: 15, after: 15, days: 31, maxMissing: MAX_MISSING_DAYS };
export const AROUND_METRICS = {
  avg: { id: "avg_temp", label: "평균기온", unit: "℃", digits: 1, kind: "mean", def: "31일 일평균기온의 평균 → 해마다 한 값 → 해들의 평균" },
  max: { id: "avg_max", label: "평균 최고기온", unit: "℃", digits: 1, kind: "mean", def: "31일 일최고기온의 평균 → 해들의 평균" },
  min: { id: "avg_min", label: "평균 최저기온", unit: "℃", digits: 1, kind: "mean", def: "31일 일최저기온의 평균 → 해들의 평균" },
  rainDays: { id: "rain_days", label: "강수일", unit: "일", digits: 0, kind: "count", def: "일강수량 0.1mm 이상인 날 수" },
  rainSum: { id: "rain_total", label: "강수량", unit: "mm", digits: 1, kind: "sum", def: "31일 일강수량 합" },
  hot30: { id: "hot30_days", label: "최고 30℃ 이상인 날", unit: "일", digits: 0, kind: "count", def: "일최고기온 30℃ 이상" },
  heat33: { id: "heatwave_days", label: "최고 33℃ 이상인 날", unit: "일", digits: 0, kind: "count", def: "일최고기온 33℃ 이상(폭염일)" },
  frost: { id: "frost_days", label: "최저 영하인 날", unit: "일", digits: 0, kind: "count", def: "일최저기온 0℃ 미만" },
  ice: { id: "ice_days", label: "하루 종일 영하인 날", unit: "일", digits: 0, kind: "count", def: "일최고기온 0℃ 미만" },
  snow: { id: "snow_days", label: "눈이 새로 쌓인 날", unit: "일", digits: 0, kind: "count", def: "일 최심신적설 0cm 초과" },
};
export function aroundYear(store, res, ctx) {
  const out = { referenceYear: res.referenceYear, center: res.solarDate || null, start: null, end: null, status: res.status === "ok" ? "ok" : res.status, metrics: {} };
  if (res.status !== "ok") return out;
  const c = ymdToDn(res.solarDate);
  out.start = dnToYmd(c - AROUND.before);
  out.end = dnToYmd(c + AROUND.after);
  const from = ctx.dailyFrom;
  const last = ctx.dailyLast;
  if (out.start >= ctx.today) out.status = "future";
  else if (out.end >= ctx.today) out.status = "ongoing";
  else if (from && out.start < from) out.status = "unsupported";
  else if (!last || out.end > last) out.status = "pending";
  // 진행 중: 어제(또는 최신 자료)까지 관측된 만큼만 따로(sofar) — 완료된 창과 섞지 않음
  let range = { start: out.start, end: out.end };
  if (out.status === "ongoing" || out.status === "pending") {
    const asOf = [last, dnToYmd(ymdToDn(ctx.today) - 1)].filter(Boolean).sort()[0];
    if (!asOf || asOf < out.start) return out;
    range = { start: out.start, end: asOf };
    out.sofarEnd = asOf;
  } else if (out.status !== "ok") return out;
  for (const [k, m] of Object.entries(AROUND_METRICS)) {
    const ag = aggregate(store, m.id, range);
    out.metrics[k] = { raw: ag.raw, obs: ag.obs, days: ag.days, missing: ag.missing, missingDates: ag.missingDates, status: ag.complete ? "ok" : ag.obs ? "partial" : "missing" };
  }
  return out;
}
export function aroundPart(store, resolved, ctx) {
  const years = resolved.map((r) => aroundYear(store, r, ctx));
  const metrics = {};
  for (const [k, m] of Object.entries(AROUND_METRICS)) {
    const items = years.map((y) => ({ year: y.referenceYear, status: y.status !== "ok" ? y.status : y.metrics[k].status === "ok" ? "ok" : y.metrics[k].status === "partial" ? "partial" : "missing", value: y.status === "ok" && y.metrics[k].status === "ok" ? y.metrics[k].raw : null }));
    const s = summarize(items.map((x) => ({ ...x, status: x.status === "partial" ? "missing" : x.status })), { digits: m.digits });
    const partialYears = items.filter((x) => x.status === "partial").map((x) => x.year);
    const ex = { ...s.excludedYearsByReason };
    if (partialYears.length) { ex.missing = (ex.missing || []).filter((y) => !partialYears.includes(y)); if (!ex.missing.length) delete ex.missing; ex.partial = partialYears; }
    const okYears = years.filter((y) => s.validYears.includes(y.referenceYear));
    const obs = okYears.reduce((a, y) => a + y.metrics[k].obs, 0);
    const o = { n: s.n, eligible: s.eligible, requested: items.length, tier: s.tier, limited: s.limited, coverage: s.coverage, validYears: s.validYears, excludedYearsByReason: ex, validDays: obs, mean: s.mean, min: s.min, max: s.max, minYears: s.minYears, maxYears: s.maxYears };
    if (m.kind === "count") { o.total = s.n ? s.sum : null; o.share = obs ? (s.sum / obs) * 100 : null; o.yearsWith = okYears.filter((y) => y.metrics[k].raw > 0).map((y) => y.referenceYear); }
    if (m.kind === "sum") { o.total = s.n ? s.sum : null; o.perDay = obs ? s.sum / obs : null; }
    metrics[k] = o;
  }
  // 강수일 비율·평균 일강수량은 같은 해들(강수 유효)로: 강수일 ÷ 유효일, 강수량 합 ÷ 유효일
  const rd = metrics.rainDays;
  rd.ratioDef = "강수일 수 ÷ 유효한 날 수(자료가 있는 해들의 31일 창을 모두 합쳐서)";
  metrics.rainSum.perDayDef = "강수량 합 ÷ 유효한 날 수(무강수 0 포함)";
  return { window: AROUND, years: years.map((y) => ({ referenceYear: y.referenceYear, center: y.center, start: y.start, end: y.end, status: y.status, metrics: y.metrics })), metrics };
}

// ---------------------------------------------------------------- 규칙 기반 이야기 v2(평균 대신 횟수·순위·극값·앞뒤 15일)
const r1 = (v, d = 1) => (v == null ? null : (Math.round(v * 10 ** d + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** d));
const fmt = (v, d = 1) => (v == null ? "-" : r1(v, d).toFixed(d));
const yearWord = (spec, y) => (spec.calendar === "lunar" ? `${y}년(음력 기준연도)` : `${y}년`);
const yearList = (ys, max = 6) => (ys.length > max ? `${ys.slice(-max).join("·")} 등` : ys.join("·"));
// 순위(같은 표시값은 공동): high=true 면 높은 순
export function rankAmong(values, x, digits = 1, high = true) {
  const rv = (v) => Math.round(v * 10 ** digits);
  const better = values.filter((v) => (high ? rv(v) > rv(x) : rv(v) < rv(x))).length;
  const same = values.filter((v) => rv(v) === rv(x)).length;
  return { rank: better + 1, tie: same > 1, of: values.length };
}
export function dailyStories(o) {
  const st = [];
  const { spec, years, daily, dateCounts, counts } = o;
  const req = dateCounts.requested;
  const per = `${years.fromYear}~${years.toYear}년`;
  if (dateCounts.nodate > 0 && (spec.leapMonth || (spec.calendar === "solar" && spec.month === 2 && spec.day === 29) || (spec.calendar === "lunar" && spec.day === 30))) {
    const what = spec.calendar === "solar" ? "양력 2월 29일" : spec.leapMonth ? "음력 윤달 날짜" : "음력 30일";
    st.push({ id: "D-exist", priority: 1, text: `이 ${what}는 요청한 ${req}개 해 중 ${dateCounts.exists}개 해에만 존재합니다.`, evidence: { metric: "date", years: o.dateMap.filter((r) => r.status === "ok").map((r) => r.referenceYear), formula: "기준연도마다 실제 날짜 대응을 계산(없는 해는 대체하지 않음)", excluded: o.dateMap.filter((r) => r.status === "nodate").map((r) => r.referenceYear) }, target: "yearly" });
  }
  if (!counts) return st;
  const C = Object.fromEntries(counts.rules.map((c) => [c.id, c]));
  const rc = C.rain;
  if (rc.n >= 1) {
    const yrs = rc.k ? ` (${yearList(rc.hitYears)})` : "";
    st.push({ id: "D-rainCount", priority: 2, text: `${per} 중 자료가 있는 ${rc.n}개 해에서, 이날 비나 눈이 온 해는 ${rc.k}번${yrs}이었습니다.${rc.tier === "reference" ? ` (참고 · ${rc.n}개 해)` : ""}`, evidence: { metric: "rain", years: rc.hitYears, formula: "일강수량 0.1mm 이상인 해를 셈(과거 관측 횟수이며 강수확률이 아님)", excluded: rc.excludedYearsByReason }, target: "yearly", metric: "rain" });
  }
  const tempLines = ["heat33", "hot30", "ice", "frost", "snow"].map((id) => C[id]).filter((c) => c.show && c.n >= 3 && !c.limited && c.k >= 1);
  // 같은 방향(더위·추위)은 더 강한 기준이 0번이 아닐 때 그것만
  const pickT = [];
  if (tempLines.find((c) => c.id === "heat33")) pickT.push(tempLines.find((c) => c.id === "heat33")); else if (tempLines.find((c) => c.id === "hot30")) pickT.push(tempLines.find((c) => c.id === "hot30"));
  if (tempLines.find((c) => c.id === "ice")) pickT.push(tempLines.find((c) => c.id === "ice")); else if (tempLines.find((c) => c.id === "frost")) pickT.push(tempLines.find((c) => c.id === "frost"));
  if (tempLines.find((c) => c.id === "snow")) pickT.push(tempLines.find((c) => c.id === "snow"));
  if (pickT.length) {
    st.push({ id: "D-tempCount", priority: 4, text: `같은 기간 ${pickT.map((c) => `${c.label}${c.id === "snow" ? "" : "이었던 해"}는 ${c.k}번(${yearList(c.hitYears, 4)})`).join(", ")}입니다.`, evidence: { metric: pickT[0].field, years: pickT.flatMap((c) => c.hitYears), formula: pickT.map((c) => `${c.label}: ${c.cond}, 자료가 있는 ${c.n}개 해 중`).join(" / "), excluded: pickT[0].excludedYearsByReason }, target: "yearly", metric: pickT[0].field });
  }
  const E = counts.extremes;
  if (E.hottest.value != null && E.coldest.value != null && E.hottest.n >= 3 && !E.hottest.limited) {
    let text = `가장 더웠던 해는 ${E.hottest.years.map((y) => yearWord(spec, y)).join("·")}(최고 ${fmt(E.hottest.value)}℃), 가장 추웠던 해는 ${E.coldest.years.map((y) => yearWord(spec, y)).join("·")}(최저 ${fmt(E.coldest.value)}℃)입니다.`;
    if (E.wettest.value != null) text += ` 강수가 가장 많았던 해는 ${E.wettest.years.map((y) => yearWord(spec, y)).join("·")}(${fmt(E.wettest.value)}mm)입니다.`;
    st.push({ id: "D-extremes", priority: 5, text, evidence: { metric: "max", years: [...E.hottest.years, ...E.coldest.years, ...E.wettest.years], formula: "그날 일최고기온 최댓값·일최저기온 최솟값·일강수량 최댓값의 해(표시 자리수로 같으면 공동)" }, target: "yearly", metric: "max" });
  }
  // 고른 해: 같은 기간의 해들 사이에서 몇 번째(공동 포함)
  const s = o.selected?.[0];
  if (s && s.dateStatus === "ok" && s.values.max != null) {
    const vals = daily.rows.filter((r) => r.dateStatus === "ok" && r.values.max != null && r.referenceYear !== s.referenceYear).map((r) => r.values.max);
    if (vals.length >= 4) {
      const all = [...vals, s.values.max];
      const hi = rankAmong(all, s.values.max, 1, true);
      const lo = rankAmong(all, s.values.max, 1, false);
      const inPer = s.referenceYear >= years.fromYear && s.referenceYear <= years.toYear;
      const scope = inPer ? `${per} ${all.length}개 해 중` : `${per} ${vals.length}개 해와 ${s.referenceYear}년을 합친 ${all.length}개 해 중`;
      const word = hi.rank <= lo.rank ? `${hi.rank}번째로 높았습니다${hi.tie ? "(공동)" : ""}` : `${lo.rank}번째로 낮았습니다${lo.tie ? "(공동)" : ""}`;
      st.push({ id: "D-selRank", priority: 3, text: `${yearWord(spec, s.referenceYear)} 이날 최고기온 ${fmt(s.values.max)}℃는 ${scope} ${word}.`, evidence: { metric: "max", years: [s.referenceYear], formula: "그날 일최고기온을 해마다 비교한 순위(같은 표시값은 공동 순위)", n: all.length }, target: "yearly", metric: "max" });
    }
  }
  // 앞뒤 15일: 고른 해와 기간 비교(강수일 비율)
  const A = o.around;
  const as = o.aroundSelected;
  if (A && as && as.status === "ok" && as.metrics.rainDays?.status === "ok" && A.metrics.rainDays.n >= 3 && !A.metrics.rainDays.limited) {
    const m = A.metrics.rainDays;
    const sel = as.metrics.rainDays;
    st.push({ id: "A-rainDays", priority: 6, text: `앞뒤 15일(31일)로 넓혀 보면 ${per} ${m.n}개 해는 유효한 ${m.validDays}일 중 ${fmt(m.total, 0)}일(${fmt(m.share, 0)}%)에 비나 눈이 왔고, ${s ? `${s.referenceYear}년` : "고른 해"}은 ${sel.obs}일 중 ${fmt(sel.raw, 0)}일이었습니다.`, evidence: { metric: "rain", years: m.validYears, formula: "강수일(일강수량 0.1mm 이상) 수 ÷ 유효한 날 수, 31일 창(그해 날짜 ±15일)", excluded: m.excludedYearsByReason }, target: "around", metric: "rain" });
  }
  return st;
}
// 시간 이야기: 고른 해 하루의 실제 시간 관측만(평균과 비교하지 않음)
export function hourlyStories(h, metrics, selected) {
  const st = [];
  const s = selected[0];
  if (!s || s.dateStatus !== "ok") return st;
  const ta = s.series.ta;
  const idx = ta.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (idx.length >= 12) {
    let hi = idx[0], lo = idx[0];
    for (const x of idx) { if (x[0] > hi[0]) hi = x; if (x[0] < lo[0]) lo = x; }
    const part = idx.length < 24 ? `관측된 ${idx.length}개 정시 중 ` : "";
    let text = `${s.referenceYear}년 이날은 ${part}${lo[1]}시 ${fmt(lo[0])}℃가 가장 낮았고 ${hi[1]}시 ${fmt(hi[0])}℃가 가장 높았습니다.`;
    const rn = s.series.rn;
    const valid = rn.filter((v) => v != null).length;
    const wet = rn.map((v, i) => [v, i]).filter(([v]) => v != null && v >= 0.1);
    if (valid >= 12) text += wet.length ? ` 1시간 강수 0.1mm 이상인 구간은 ${wet.length}개(${wet.slice(0, 4).map(([, i]) => `${i}~${i + 1}시`).join("·")}${wet.length > 4 ? " 등" : ""})였습니다.` : ` 시간 강수 자료가 있는 ${valid}개 구간에 강수가 없었습니다.`;
    st.push({ id: "H-selDay", priority: 3.5, text, evidence: { metric: "ta", years: [s.referenceYear], hours: [lo[1], hi[1]], formula: "고른 해 그날 정시 기온의 최저·최고 시각(평균과 비교하지 않음), 강수 구간 h~h+1시 = (h+1)시 값" }, target: "hourly", metric: "ta" });
  }
  return st;
}

// 선택 연도만 바뀔 때: 이미 계산한 과거 평균(base = selectedYears 없이 계산한 결과)을 그대로 두고 선택 연도 부분과 이야기만 새로 만든다
export function withSelected(base, { spec, store, hs = null, ctx, selectedYears = [] }) {
  const sel = selectedYears.slice(0, 3).map((y) => resolveYear(spec, y));
  const out = { ...base };
  if (base.daily) {
    out.selected = sel.map((r) => dailyYear(store, r, ctx));
    out.aroundSelected = sel.length ? aroundYear(store, sel[0], ctx) : null;
    out.stories = dailyStories(out);
  }
  if (base.hourly) {
    const selected = sel.map((r) => hourlyYear(hs, r, ctx));
    out.hourly = { ...base.hourly, selected, stories: hourlyStories(base.hourly, base.hourly.metrics, selected) };
  }
  return out;
}

// 선택 연도 표시용 양력·음력 병기(기준 전환 없이 표시만)
export function bothCalendars(solarDate) {
  if (!solarDate) return null;
  const l = solarToLunar(solarDate);
  return { solar: solarDate, lunar: l.status === "ok" ? { year: l.year, month: l.month, day: l.day, leap: l.leap, text: l.text } : null };
}
export { dnToYmd };
