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
import { ymdToDn, dnToYmd, hval, QC_BITS, HOURLY_FROM } from "./stats-engine.mjs";

export const POLICY_VERSION = "date-stats.2026-10-17.v1";
export const STORY_VERSION = "date-story.2026-10-17.v1";
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
  const v = { avg: get("avg"), max: get("max"), min: get("min"), rain: get("rain"), wind: get("wind"), hum: get("hum"), nsnow: get("nsnow") };
  v.range = v.max != null && v.min != null ? v.max - v.min : null;
  out.values = v;
  for (const k of Object.keys(DAILY_METRICS)) out.fieldStatus[k] = v[k] == null ? "missing" : "ok";
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
    out.selected = sel.map((r) => ({ ...dailyYear(store, r, ctx) }));
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

// ---------------------------------------------------------------- 규칙 기반 이야기(조건과 실제 계산값만, 최대 3개를 화면에서 우선순위로 고름)
const r1 = (v, d = 1) => (v == null ? null : (Math.round(v * 10 ** d + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** d));
const fmt = (v, d = 1) => (v == null ? "-" : r1(v, d).toFixed(d));
const yearWord = (spec, y) => (spec.calendar === "lunar" ? `${y}년(음력 기준연도)` : `${y}년`);
export function dailyStories(o) {
  const st = [];
  const { spec, years, daily, dateCounts } = o;
  const req = dateCounts.requested;
  // 윤달·2월 29일: 존재하는 해 수
  if (dateCounts.nodate > 0 && (spec.leapMonth || (spec.calendar === "solar" && spec.month === 2 && spec.day === 29) || (spec.calendar === "lunar" && spec.day === 30))) {
    const what = spec.calendar === "solar" ? "양력 2월 29일" : spec.leapMonth ? "음력 윤달 날짜" : "음력 30일";
    st.push({ id: "D-exist", priority: 1, text: `이 ${what}는 요청한 ${req}개 해 중 ${dateCounts.exists}개 해에만 존재합니다.`, evidence: { metric: "date", years: o.dateMap.filter((r) => r.status === "ok").map((r) => r.referenceYear), formula: "기준연도마다 실제 날짜 대응을 계산(없는 해는 대체하지 않음)", excluded: o.dateMap.filter((r) => r.status === "nodate").map((r) => r.referenceYear) }, target: "yearly" });
  }
  const rs = daily.metrics.rain;
  if (rs.n >= 1) {
    const ref = rs.tier === "reference" ? ` (참고 · ${rs.n}개 해)` : "";
    st.push({ id: "D-rainy", priority: 2, text: `${years.fromYear}~${years.toYear}년 ${req}개 기준연도 중 자료가 있는 ${rs.n}개 해에서, 이날 강수가 있었던 해는 ${rs.k}개였습니다.${ref}`, evidence: { metric: "rain", years: rs.rainyYears, formula: "일강수량 0.1mm 이상인 해의 수 ÷ 자료가 있는 해의 수(과거 관측 비율이며 강수확률이 아님)", excluded: rs.excludedYearsByReason }, target: "yearly", metric: "rain" });
  }
  if (rs.tier === "stats" && !rs.limited && rs.k >= 1) {
    const wet = rs.maxYears;
    const share = rs.total > 0 ? (rs.max / rs.total) * 100 : 0;
    let text = `강수량은 평균 ${fmt(rs.mean)}mm였고, 가장 많았던 해는 ${wet.map((y) => yearWord(spec, y)).join("·")}(${fmt(rs.max)}mm)입니다.`;
    if (rs.n >= 3 && share >= 50 && wet.length === 1) text += ` 그 한 해가 ${rs.n}개 해 강수량 합의 ${Math.round(share)}%를 차지해 평균을 크게 끌어올렸습니다. 연도별 그래프로 해마다의 차이를 확인해 보세요.`;
    else text += " 평균과 함께 해마다의 차이도 확인해 보세요.";
    st.push({ id: "D-rainAmt", priority: 4, text, evidence: { metric: "rain", years: rs.validYears, formula: "평균 일강수량 = 유효한 일강수량 합 ÷ N(무강수 0 포함)", excluded: rs.excludedYearsByReason }, target: "yearly", metric: "rain" });
  }
  const ts = daily.metrics.avg;
  if (ts.tier === "stats" && !ts.limited && ts.n >= 3 && ts.maxYears.length && ts.minYears.length) {
    st.push({ id: "D-tempRange", priority: 5, text: `${ts.n}개 해의 이날 일평균기온은 ${fmt(ts.min)}℃(${ts.minYears.map((y) => yearWord(spec, y)).join("·")})부터 ${fmt(ts.max)}℃(${ts.maxYears.map((y) => yearWord(spec, y)).join("·")})까지였고, 평균은 ${fmt(ts.mean)}℃입니다. 하루씩 뽑은 값이라 계절 전체의 추세를 뜻하지는 않습니다.`, evidence: { metric: "avg", years: ts.validYears, formula: "각 해 공식 일평균기온의 산술평균", excluded: ts.excludedYearsByReason }, target: "yearly", metric: "avg" });
  }
  return st;
}
export function hourlyStories(h, metrics, selected) {
  const st = [];
  const s = selected[0];
  if (!s || s.dateStatus !== "ok") return st;
  let best = null;
  for (let hh = 0; hh < 24; hh++) {
    const m = metrics.ta.hours[hh];
    const v = s.series.ta[hh];
    if (v == null || m.tier !== "stats" || m.limited || m.mean == null) continue;
    const d = v - m.mean;
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { hh, v, d, m };
  }
  if (best && Math.abs(r1(best.d)) >= 0.1) {
    st.push({ id: "H-selDiff", priority: 3, text: `${s.referenceYear}년 이날 ${best.hh}시 기온은 ${fmt(best.v)}℃로, 비교 기간의 같은 시각 평균(${fmt(best.m.mean)}℃, ${best.m.n}개 해)보다 ${fmt(Math.abs(best.d))}℃ ${best.d > 0 ? "높았습니다" : "낮았습니다"}. 하루 중 평균과 가장 크게 달랐던 시각입니다.`, evidence: { metric: "ta", years: [s.referenceYear], hours: [best.hh], formula: "선택 연도 정시 기온 − 같은 시각 비교 기간 평균(해마다 한 값)", n: best.m.n }, target: "hourly", metric: "ta" });
  }
  return st;
}

// 선택 연도 표시용 양력·음력 병기(기준 전환 없이 표시만)
export function bothCalendars(solarDate) {
  if (!solarDate) return null;
  const l = solarToLunar(solarDate);
  return { solar: solarDate, lunar: l.status === "ok" ? { year: l.year, month: l.month, day: l.day, leap: l.leap, text: l.text } : null };
}
export { dnToYmd };
