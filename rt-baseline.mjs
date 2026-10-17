// 과거 3개 기준 평균(1990년 이후·최근 10년·최근 5년) 공통 엔진 — 실시간·예보 분석 전용 새 모듈(기존 통계 계산은 바꾸지 않음).
// 기준 연도 = 비교 대상 날짜의 연도(Y). 세 기준 모두 Y-1 년까지의 '끝난 해'만 쓴다(그 해·미래 자료가 섞이지 않음):
//   all = 자료 첫해(HOURLY_FROM, 1990)~Y-1, r10 = Y-10~Y-1, r5 = Y-5~Y-1. 연도는 날짜에서 계산(소스에 고정 연도 없음).
// 같은 시기: 각 해의 같은 월일(2/29 는 평년에 2/28)을 가운데로 ±7일(15일). 창이 연말·연초를 넘으면 앞뒤 해 날짜도 그 해 몫으로 쓰되,
//   기준 끝(Y-1 년 12/31) 뒤의 날짜는 잘라 낸다.
// 연도별 가중: 해마다 그 해 창 안의 유효값 평균을 먼저 내고(해마다 같은 무게), 기준 평균 = 유효한 해 평균들의 산술평균.
//   유효한 해 = 창 안 유효값이 기대 개수의 절반 이상. 유효한 해가 기준 연도 수의 80% 미만이면 '비교 데이터 부족'(평균을 내지 않음).
// 결측: 시간자료 NaN(행 없음·품질 9)은 빼고, 0 은 값(무강수 0)으로 쓴다. 강수확률은 이 엔진에 넣지 않는다.
// 분포(백분위·순위·최고·최저): 유효한 해들의 창 안 값 전체(표본). 표본 60개 미만이면 백분위·순위를 내지 않는다.
import { ymdToDn, dnToYmd, isLeap, hval, HOURLY_FROM, round } from "./stats-engine.mjs";
import { SAMPLE_RULES } from "./rt-story-rules.mjs";
import { describeDifference } from "./rt-story-templates.mjs";

export const BASES = [
  { id: "all", kind: "all" },
  { id: "r10", short: "최근 10년", years: 10 },
  { id: "r5", short: "최근 5년", years: 5 },
];
export const WINDOW_DAYS = SAMPLE_RULES.windowDays; // 7
export const MIN_YEAR_SHARE = SAMPLE_RULES.minYearShare; // 0.8
export const MIN_IN_YEAR_SHARE = SAMPLE_RULES.minInYearShare; // 0.5
export const MIN_SAMPLES_RANK = SAMPLE_RULES.minSamplesRank; // 60
export const DATA_FROM_YEAR = +HOURLY_FROM.slice(0, 4);

const KST_MS = 9 * 3600000;
const pad = (n) => String(n).padStart(2, "0");
// 지금(또는 ms) 의 한국 시각
export function kst(ms = Date.now()) {
  const d = new Date(ms + KST_MS);
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { ymd, year: d.getUTCFullYear(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), text: `${ymd} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

// 비교 날짜(YYYY-MM-DD) → 세 기준기간. 이름은 자료 첫해에서 만든다(1990년 이후).
export function basePeriods(refYmd, { dataFrom = DATA_FROM_YEAR } = {}) {
  const Y = +String(refYmd).slice(0, 4);
  const to = Y - 1;
  return BASES.map((b) => {
    const from = b.kind === "all" ? dataFrom : Math.max(dataFrom, Y - b.years);
    const n = Math.max(0, to - from + 1);
    const label = b.kind === "all" ? `${dataFrom}년 이후 평균` : `${b.short} 평균`;
    return { id: b.id, label, from, to, years: n, minYears: Math.max(1, Math.ceil(n * MIN_YEAR_SHARE)), range: `${from}~${to}` };
  });
}

// 해 y 에서 월일 md 의 가운데 날(2/29 → 평년 2/28)
export function centerDn(y, md) {
  const d = md === "02-29" && !isLeap(y) ? "02-28" : md;
  return ymdToDn(`${y}-${d}`);
}
// 해 y 의 창 [a, b] (기준 끝 날 넘지 않게)
export function windowFor(y, md, toYear, w = WINDOW_DAYS) {
  const c = centerDn(y, md);
  return { a: c - w, b: Math.min(c + w, ymdToDn(`${toYear}-12-31`)) };
}

// 공통: getVal(dn) → 수 또는 NaN. 기준기간 하나의 연도별 평균·표본.
// filter(v) 가 있으면(조건부 분포 — 예: 비가 온 시간만) 해의 유효 여부는 전체 유효값으로 판단하고, 표본·해 평균은 조건을 만족한 값만
function collect(period, md, getVal, expectedPerDay, w, filter = null) {
  const years = [];
  const samples = [];
  for (let y = period.from; y <= period.to; y++) {
    const { a, b } = windowFor(y, md, period.to, w);
    let s = 0, n = 0, all = 0;
    const vals = [];
    for (let dn = a; dn <= b; dn++) {
      for (const v of getVal(dn)) {
        if (!Number.isFinite(v)) continue;
        all++;
        if (filter && !filter(v)) continue;
        s += v; n++; vals.push({ v, dn });
      }
    }
    const expected = (b - a + 1) * expectedPerDay;
    const ok = all > 0 && all >= expected * MIN_IN_YEAR_SHARE;
    years.push({ year: y, n, all, expected, mean: n ? s / n : null, ok });
    if (ok) for (const x of vals) samples.push(x);
  }
  return { years, samples };
}

// ---- 5단계(12-2): 분포를 먼저 만들고(buildReferenceDistribution, 현재값과 무관) 현재값을 대입(evaluateValue).
// 참조 분포 = 기준기간 정보 + 연도 상태 + 평균(반올림 전) + 최고·최저(값·날짜) + p10·p90(반올림 전) + 값별 도수표(오름차순 vals·cnts).
// 정렬 표본 대신 도수표: 같은 값이 많아(0.1℃ 단위) 작고, lt/eq/gt·분위수를 그대로 재현한다. JSON 왕복해도 같은 수(배정밀도 문자열 왕복).
export const BASELINE_ALGO = "ref1";
export function buildReferenceDistribution(period, { years, samples }, digits, minRank = MIN_SAMPLES_RANK) {
  const good = years.filter((y) => y.ok);
  const ref = {
    algo: BASELINE_ALGO, id: period.id, label: period.label, from: period.from, to: period.to, yearsInPeriod: period.years, minYears: period.minYears,
    validYears: good.length, samples: samples.length, missingYears: years.filter((y) => !y.ok).map((y) => y.year), digits, minRank,
  };
  if (period.years === 0 || good.length < period.minYears) return { ...ref, state: "insufficient" };
  const gm = good.filter((y) => y.mean != null);
  ref.occurrenceYears = gm.length;
  if (!gm.length) return { ...ref, state: "nosample" };
  ref.state = good.length === period.years ? "ok" : "partial";
  ref.meanRaw = gm.reduce((s, y) => s + y.mean, 0) / gm.length;
  let mx = null, mn = null;
  for (const x of samples) {
    if (!mx || x.v > mx.v) mx = x;
    if (!mn || x.v < mn.v) mn = x;
  }
  ref.max = mx ? [mx.v, mx.dn] : null;
  ref.min = mn ? [mn.v, mn.dn] : null;
  const sorted = samples.map((x) => x.v).sort((p, q) => p - q);
  const vals = [], cnts = [];
  for (const v of sorted) { if (vals.length && vals[vals.length - 1] === v) cnts[cnts.length - 1]++; else { vals.push(v); cnts.push(1); } }
  ref.vals = vals; ref.cnts = cnts;
  if (sorted.length) {
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    ref.q10 = q(0.1); ref.q90 = q(0.9);
  }
  return ref;
}
// 도수표에서 lt(작은 값 수)·eq(같은 값 수) — 이진 탐색
function ltEq(ref, value) {
  const { vals, cnts } = ref;
  let lo = 0, hi = vals.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < value) lo = m + 1; else hi = m; }
  let lt = 0;
  for (let i = 0; i < lo; i++) lt += cnts[i];
  const eq = lo < vals.length && vals[lo] === value ? cnts[lo] : 0;
  return { lt, eq };
}
export function evaluateValue(ref, value) {
  const digits = ref.digits;
  const out = {
    id: ref.id, label: ref.label, from: ref.from, to: ref.to, yearsInPeriod: ref.yearsInPeriod,
    validYears: ref.validYears, samples: ref.samples, missingYears: ref.missingYears.slice(),
    weighting: "연도별 평균의 산술평균(해마다 같은 무게)",
  };
  if (ref.state === "insufficient") return { ...out, status: "insufficient", statusText: "비교 데이터 부족", mean: null, diff: null };
  out.occurrenceYears = ref.occurrenceYears;
  if (ref.state === "nosample") return { ...out, status: "insufficient", statusText: "비교 표본 없음", mean: null, diff: null, rankNote: "표본 부족 — 순위·백분위 표시 안 함" };
  const mean = ref.meanRaw;
  out.status = ref.state;
  out.statusText = out.status === "ok" ? "" : `${ref.yearsInPeriod - ref.validYears}개 해 자료 부족 — 나머지 ${ref.validYears}개 해로 계산`;
  out.mean = round(mean, digits);
  out.diff = Number.isFinite(value) ? round(value - mean, digits) : null;
  out.max = ref.max ? { value: round(ref.max[0], digits), date: dnToYmd(ref.max[1]) } : null;
  out.min = ref.min ? { value: round(ref.min[0], digits), date: dnToYmd(ref.min[1]) } : null;
  if (Number.isFinite(value) && ref.samples >= ref.minRank) {
    const { lt, eq } = ltEq(ref, value);
    const gt = ref.samples - lt - eq;
    out.p = (lt + eq / 2) / ref.samples;
    out.percentile = round(out.p * 100, 1);
    out.rankHigh = gt + 1;
    out.rankLow = lt + 1;
    out.p10 = round(ref.q10, digits);
    out.p90 = round(ref.q90, digits);
    out.outside = value > out.p90 ? round(value - out.p90, digits) : value < out.p10 ? round(value - out.p10, digits) : 0;
    out.newHigh = value > ref.max[0];
    out.newLow = value < ref.min[0];
  } else out.rankNote = "표본 부족 — 순위·백분위 표시 안 함";
  return out;
}
// 예전 summarize 와 같은 결과(분포 → 대입)
function summarize(period, coll, value, digits, minRank = MIN_SAMPLES_RANK) {
  return evaluateValue(buildReferenceDistribution(period, coll, digits, minRank), value);
}
// 참조 분포만(값 없이) — 사전 계산·DB 저장용. 세 기준기간 배열
export function hourlyReference(hs, ymd, hour, field, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  const arr = hs[field];
  const get = (dn) => { const i = (dn - hs.base) * 24 + hour; return i >= 0 && i < hs.n && hs.src[i] ? [hval(arr, i)] : [NaN]; };
  const digits = HOURLY_FIELDS[field]?.digits ?? 1;
  return periods.map((p) => buildReferenceDistribution(p, collect(p, md, get, 1, w), digits));
}
export function dailyReference(store, ymd, field, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  const get = (dn) => { const i = dn - store.base; return [i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN]; };
  return periods.map((p) => buildReferenceDistribution(p, collect(p, md, get, 1, w), 1));
}
export const evaluateRefs = (refs, value = NaN) => refs.map((r) => evaluateValue(r, value));

export const HOURLY_FIELDS = { ta: { label: "기온", unit: "℃", digits: 1 }, hm: { label: "습도", unit: "%", digits: 0 }, rn: { label: "1시간 강수량", unit: "mm", digits: 1 }, ws: { label: "풍속", unit: "m/s", digits: 1 } };
// 시간자료(ASOS) — 같은 시기(±7일) 같은 시각 hour 의 값
export function hourlyCompare(hs, ymd, hour, field, value = NaN, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  const arr = hs[field];
  const get = (dn) => {
    const i = (dn - hs.base) * 24 + hour;
    return i >= 0 && i < hs.n && hs.src[i] ? [hval(arr, i)] : [NaN];
  };
  const digits = HOURLY_FIELDS[field]?.digits ?? 1;
  return periods.map((p) => summarize(p, collect(p, md, get, 1, w), value, digits));
}

// 공식 일자료 — 같은 시기(±7일) 일 값(max·min·avg·rain). 일 강수 공란 = 무강수 0(기존 규칙), 행 없음 = 결측.
export const DAILY_FIELDS = { max: "최고기온", min: "최저기온", avg: "평균기온", rain: "일강수량" };
export function dailyCompare(store, ymd, field, value = NaN, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  const get = (dn) => {
    const i = dn - store.base;
    return [i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN];
  };
  return periods.map((p) => summarize(p, collect(p, md, get, 1, w), value, 1));
}

// 파생 분포 비교(astra 3-1): getVal(dn) → [수 또는 NaN, ...] 를 같은 시기(±7일) 해마다 모아 같은 규칙(연도 가중·유효 해 80%·표본 60)으로 요약.
// filter 를 주면 조건부 분포(예: 1시간 강수 0.1mm 이상인 시간만). occurrenceYears = 조건을 만족한 값이 있었던 유효한 해 수.
export function derivedCompare(getVal, ymd, value = NaN, { digits = 1, filter = null, periods = basePeriods(ymd), w = WINDOW_DAYS, expectedPerDay = 1, minRank = MIN_SAMPLES_RANK } = {}) {
  const md = ymd.slice(5, 10);
  return periods.map((p) => summarize(p, collect(p, md, getVal, expectedPerDay, w, filter), value, digits, minRank));
}

// 메모 캐시: 키 = 지점|자료|지표|월일|시각|기준기간|자료 판
export function createBaselineCache(max = 4000) {
  const m = new Map();
  return {
    get(key, fn) {
      if (m.has(key)) return m.get(key);
      const v = fn();
      if (m.size >= max) m.delete(m.keys().next().value);
      m.set(key, v);
      return v;
    },
    size: () => m.size,
  };
}

// 차이 → 말(과장하지 않음): |차| < 1 비슷, < 3 조금, < 5 꽤, 그 이상 상당히 — 단계는 describeDifference(ta)와 같음(rt-story-rules DIFF_LEVELS)
export function diffWord(d, unitHot = "높", unitCold = "낮") {
  if (!Number.isFinite(d)) return null;
  const x = describeDifference("ta", d);
  if (x.level === "similar") return "비슷";
  return `${x.levelWord} ${d > 0 ? unitHot : unitCold}음`;
}

// ---------------------------------------------------------------- 5단계 확장(누적·계절 시작·조건 비율)
import { missingOk, outdoorJudge } from "./stats-engine.mjs";
const dayVal = (store, field, dn) => {
  const i = dn - store.base;
  return i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN;
};
// 해 y 의 1/1 ~ 같은 월일(2/29 → 평년 2/28) 누적: avg = 일평균기온의 평균, rain = 일강수량 합. 결측 1일까지 허용(기존 1일 결측 규칙).
export function cumulativeYear(store, y, md, field) {
  const a = ymdToDn(`${y}-01-01`), b = centerDn(y, md);
  let s = 0, n = 0, miss = 0;
  for (let dn = a; dn <= b; dn++) {
    const v = dayVal(store, field, dn);
    if (Number.isFinite(v)) { s += v; n++; } else miss++;
  }
  const days = b - a + 1;
  if (!missingOk(days, miss)) return { year: y, value: null, days, missing: miss, ok: false };
  return { year: y, value: field === "rain" ? round(s, 1) : round(s / n, 2), days, missing: miss, ok: true };
}
// 올해 1/1 ~ asOf(끝난 마지막 날) 누적 vs 3개 기준의 같은 누적 기간
export function ytdCompare(store, asOfYmd, field) {
  const Y = +asOfYmd.slice(0, 4), md = asOfYmd.slice(5, 10);
  const cur = cumulativeYear(store, Y, md, field);
  const periods = basePeriods(asOfYmd).map((p) => {
    const rows = [];
    for (let y = p.from; y <= p.to; y++) rows.push(cumulativeYear(store, y, md, field));
    const good = rows.filter((r) => r.ok);
    const base = { id: p.id, label: p.label, range: p.range, validYears: good.length, yearsInPeriod: p.years, missingYears: rows.filter((r) => !r.ok).map((r) => r.year) };
    if (good.length < p.minYears) return { ...base, mean: null, diff: null, status: "insufficient", statusText: "비교 데이터 부족" };
    const mean = good.reduce((s, r) => s + r.value, 0) / good.length;
    const higher = good.filter((r) => cur.value != null && r.value > cur.value).length;
    return { ...base, mean: round(mean, 1), diff: cur.value == null ? null : round(cur.value - mean, 1), status: "ok", rankHigh: cur.value == null ? null : higher + 1, of: good.length + 1 };
  });
  return { year: Y, from: `${Y}-01-01`, to: asOfYmd, field, value: cur.value == null ? null : round(cur.value, 1), current: cur, periods };
}
// 그 해 처음으로 일최고기온 ≥ th 인 날(1/1 ~ 같은 월일까지만 봄 — 진행 중인 해와 공정하게)
// 덧붙인 값(기존 date·doy 는 그대로): seasonStart, missingBeforeEvent(사건 전 결측 일수), firstConfirmed(사건 전 결측 0일 때만 '처음' 확정),
//   coverage(살펴본 날 중 자료가 있는 비율, 0~1). 사건이 없으면 missing(기존)·coverage.
export function firstHotDay(store, y, untilMd, th = 30) {
  const a = ymdToDn(`${y}-01-01`), b = centerDn(y, untilMd);
  let miss = 0;
  for (let dn = a; dn <= b; dn++) {
    const v = dayVal(store, "max", dn);
    if (!Number.isFinite(v)) { miss++; continue; }
    if (v >= th) { const days = dn - a + 1; return { year: y, date: dnToYmd(dn), doy: days, seasonStart: `${y}-01-01`, missingBeforeEvent: miss, firstConfirmed: miss === 0, coverage: round((days - miss) / days, 3) }; }
  }
  const days = b - a + 1;
  return { year: y, date: null, doy: null, missing: miss, seasonStart: `${y}-01-01`, missingBeforeEvent: null, firstConfirmed: null, coverage: days > 0 ? round((days - miss) / days, 3) : null };
}
// 같은 시기 ±7일 같은 정시에 조건(산책·러닝)을 만족한 비율 — 기준별
export function outdoorWindow(hs, ymd, hour, cond, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  return periods.map((p) => {
    let valid = 0, okN = 0;
    for (let y = p.from; y <= p.to; y++) {
      const { a, b } = windowFor(y, md, p.to, w);
      for (let dn = a; dn <= b; dn++) {
        const i = (dn - hs.base) * 24 + hour;
        if (i < 0 || i >= hs.n) continue;
        const j = outdoorJudge(hs, i, cond);
        if (j === null) continue;
        valid++;
        if (j) okN++;
      }
    }
    return { id: p.id, label: p.label, range: p.range, samples: valid, share: valid >= MIN_SAMPLES_RANK ? round((okN / valid) * 100, 0) : null };
  });
}

// 첫 30℃ 날의 기준 평균(astra 4장 — 선택 편향 수정): 끝난 해는 한 해 전체(1/1~12/31)를 보고 '완전한 시즌'만 쓴다.
//   완전 = 사건이 있으면 사건 전 결측이 1일 결측 규칙 안, 없으면 한 해 전체 결측이 1일 결측 규칙 안. 완전한 시즌이 기준 연도 수의 80% 미만이면 비교 데이터 부족.
//   평균 날짜 = 발생한 시즌(k개)의 연중 일차 평균. k < 4 이면 평균을 내지 않음. 발생하지 않은 시즌은 n 에만 셈('n개 시즌 중 k개 발생').
export const SEASON_MIN_OCCUR = 4;
export function firstHotSeasons(store, refYmd, th = 30) {
  return basePeriods(refYmd).map((p) => {
    const rows = [];
    for (let y = p.from; y <= p.to; y++) {
      const r = firstHotDay(store, y, "12-31", th);
      const days = ymdToDn(`${y}-12-31`) - ymdToDn(`${y}-01-01`) + 1;
      const complete = r.date ? missingOk(r.doy, r.missingBeforeEvent) : missingOk(days, r.missing);
      rows.push({ year: y, date: r.date, doy: r.doy, complete });
    }
    const comp = rows.filter((r) => r.complete), hit = comp.filter((r) => r.doy != null);
    const base = { id: p.id, label: p.label, range: p.range, years: p.years, completeSeasons: comp.length, hitYears: hit.length, incompleteYears: rows.filter((r) => !r.complete).map((r) => r.year), method: "complete-seasons" };
    if (comp.length < p.minYears) return { ...base, meanDoy: null, status: "insufficient", statusText: "비교 데이터 부족(완전한 시즌 부족)" };
    if (hit.length < SEASON_MIN_OCCUR) return { ...base, meanDoy: null, status: "insufficient", statusText: `발생한 시즌 ${hit.length}개(${SEASON_MIN_OCCUR}개 미만) — 평균 날짜를 내지 않음` };
    return { ...base, meanDoy: Math.round(hit.reduce((s, r) => s + r.doy, 0) / hit.length), status: "ok", statusText: `${comp.length}개 시즌 중 ${hit.length}개 발생 시즌의 평균` };
  });
}
