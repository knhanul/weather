// 4단계까지의 rt-baseline 요약(분포를 나누기 전) 그대로 — 5단계 buildReferenceDistribution/evaluateValue 가 같은 결과를 내는지 대조용(운영 코드에서 쓰지 않음)
import { dnToYmd, hval, round } from "../../stats-engine.mjs";
import { basePeriods, windowFor, WINDOW_DAYS, MIN_IN_YEAR_SHARE, MIN_SAMPLES_RANK, HOURLY_FIELDS } from "../../rt-baseline.mjs";
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

function summarize(period, { years, samples }, value, digits, minRank = MIN_SAMPLES_RANK) {
  const good = years.filter((y) => y.ok);
  const out = {
    id: period.id, label: period.label, from: period.from, to: period.to, yearsInPeriod: period.years,
    validYears: good.length, samples: samples.length, missingYears: years.filter((y) => !y.ok).map((y) => y.year),
    weighting: "연도별 평균의 산술평균(해마다 같은 무게)",
  };
  if (period.years === 0 || good.length < period.minYears) return { ...out, status: "insufficient", statusText: "비교 데이터 부족", mean: null, diff: null };
  const gm = good.filter((y) => y.mean != null); // 조건부 분포에서 그 해에 조건을 만족한 값이 없으면 평균에서만 빠짐(유효한 해로는 셈)
  out.occurrenceYears = gm.length;
  if (!gm.length) return { ...out, status: "insufficient", statusText: "비교 표본 없음", mean: null, diff: null, rankNote: "표본 부족 — 순위·백분위 표시 안 함" };
  const mean = gm.reduce((s, y) => s + y.mean, 0) / gm.length;
  out.status = good.length === period.years ? "ok" : "partial";
  out.statusText = out.status === "ok" ? "" : `${period.years - good.length}개 해 자료 부족 — 나머지 ${good.length}개 해로 계산`;
  out.mean = round(mean, digits);
  out.diff = Number.isFinite(value) ? round(value - mean, digits) : null;
  let mx = null, mn = null;
  for (const x of samples) {
    if (!mx || x.v > mx.v) mx = x;
    if (!mn || x.v < mn.v) mn = x;
  }
  out.max = mx ? { value: round(mx.v, digits), date: dnToYmd(mx.dn) } : null;
  out.min = mn ? { value: round(mn.v, digits), date: dnToYmd(mn.dn) } : null;
  if (Number.isFinite(value) && samples.length >= minRank) {
    let lt = 0, eq = 0, gt = 0;
    for (const x of samples) x.v < value ? lt++ : x.v > value ? gt++ : eq++;
    out.p = (lt + eq / 2) / samples.length; // 0~1(반올림 전) — 이례성 U 계산용
    out.percentile = round(out.p * 100, 1);
    out.rankHigh = gt + 1; // 높은 쪽에서 몇 번째(같은 값 다음)
    out.rankLow = lt + 1;
    const sorted = samples.map((x) => x.v).sort((p, q) => p - q);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    out.p10 = round(q(0.1), digits);
    out.p90 = round(q(0.9), digits);
    out.outside = value > out.p90 ? round(value - out.p90, digits) : value < out.p10 ? round(value - out.p10, digits) : 0; // 평년 범위(10~90%) 밖으로 나간 정도
    out.newHigh = value > mx.v; // 관측값이면 '같은 시기 표본 최고보다 높음', 예보값이면 확정하지 않음(호출 쪽에서 표시)
    out.newLow = value < mn.v;
  } else out.rankNote = "표본 부족 — 순위·백분위 표시 안 함";
  return out;
}

const HOURLY_FIELDS_UNUSED = { ta: { label: "기온", unit: "℃", digits: 1 }, hm: { label: "습도", unit: "%", digits: 0 }, rn: { label: "1시간 강수량", unit: "mm", digits: 1 }, ws: { label: "풍속", unit: "m/s", digits: 1 } };
// 시간자료(ASOS) — 같은 시기(±7일) 같은 시각 hour 의 값
export function hourlyCompareLegacy(hs, ymd, hour, field, value = NaN, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
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
const DAILY_FIELDS_UNUSED = { max: "최고기온", min: "최저기온", avg: "평균기온", rain: "일강수량" };
export function dailyCompareLegacy(store, ymd, field, value = NaN, { periods = basePeriods(ymd), w = WINDOW_DAYS } = {}) {
  const md = ymd.slice(5, 10);
  const get = (dn) => {
    const i = dn - store.base;
    return [i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN];
  };
  return periods.map((p) => summarize(p, collect(p, md, get, 1, w), value, 1));
}

// 파생 분포 비교(astra 3-1): getVal(dn) → [수 또는 NaN, ...] 를 같은 시기(±7일) 해마다 모아 같은 규칙(연도 가중·유효 해 80%·표본 60)으로 요약.
// filter 를 주면 조건부 분포(예: 1시간 강수 0.1mm 이상인 시간만). occurrenceYears = 조건을 만족한 값이 있었던 유효한 해 수.
export function derivedCompareLegacy(getVal, ymd, value = NaN, { digits = 1, filter = null, periods = basePeriods(ymd), w = WINDOW_DAYS, expectedPerDay = 1, minRank = MIN_SAMPLES_RANK } = {}) {
  const md = ymd.slice(5, 10);
  return periods.map((p) => summarize(p, collect(p, md, getVal, expectedPerDay, w, filter), value, digits, minRank));
}

