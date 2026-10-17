// 날씨 배틀: 날짜 2~4개(카드 A~D)를 같은 기간·같은 기준연도끼리 비교. 순수 함수.
// - 지표마다 모든 카드에 유효한 값이 있는 '공통 기준연도'만 쓴다(교집합). 한 카드의 2020년 풍속이 없으면 다른 카드의 2020년 풍속도 뺀다.
// - 강수일수·비율·평균 일강수량·누적량은 같은 강수 공통 연도 집합 하나로 계산(식이 서로 맞음).
// - 공통 N=0 → 비교 불가, N 1~2 → 참고값(승패·순위 배지 없음), N≥3 → 비교. 공통 eligible 대비 80% 미만 → 자료 제한(강조 문장 생략).
// - 반올림해서 같으면 '표시 정밀도 내 차이 없음', 정확히 같으면 '같음'. 종합점수·전체 승자·레이더 없음.
// 기준연도 = 각 카드 달력의 연도(양력 카드 2025 = 양력 2025년, 음력 카드 2025 = 음력 2025년). 혼합 배틀은 '각 달력의 같은 기준연도끼리'.
import { resolveYear, specLabel, specKey } from "./calendar-resolver.mjs";
import { dailyYear, hourlyYear, tierOf, SAMPLE_POLICY, POLICY_VERSION, RAIN_DAY, HOURLY_METRICS } from "./date-weather-engine.mjs";
import { CALENDAR_VERSION } from "./calendar-resolver.mjs";

export const CASE_IDS = ["A", "B", "C", "D"];
export const BATTLE_VERSION = "date-battle.2026-10-17.v1";
// 지표: field = 일자료 항목, kind = mean | count | share | sum | rainMean
export const BATTLE_METRICS = {
  avg: { label: "평균기온", unit: "℃", digits: 1, field: "avg", kind: "mean", group: "temp", core: true, more: "더 따뜻했던 날", less: "더 쌀쌀했던 날", diffUnit: "℃", def: "각 해 공식 일평균기온의 산술평균" },
  rain_days: { label: "강수일수", unit: "개 해", digits: 0, field: "rain", kind: "count", group: "rain", core: true, more: "강수가 잦았던 날", less: "강수가 적었던 날", diffUnit: "개 해", def: "선택한 날의 일강수량이 0.1mm 이상인 해의 수(비·눈 등 강수가 있었던 날)" },
  rain_mean: { label: "평균 일강수량", unit: "mm", digits: 1, field: "rain", kind: "rainMean", group: "rain", core: true, more: "강수량이 많았던 날", less: "강수량이 적었던 날", diffUnit: "mm", def: "유효한 일강수량 합 ÷ N(무강수 0 포함)" },
  wind: { label: "평균 풍속", unit: "m/s", digits: 1, field: "wind", kind: "mean", group: "wind", core: true, more: "바람이 강했던 날", less: "바람이 약했던 날", diffUnit: "m/s", def: "각 해 공식 일평균 풍속의 평균(최대 풍속 아님)" },
  max: { label: "평균 최고기온", unit: "℃", digits: 1, field: "max", kind: "mean", group: "temp", more: "낮 기온이 높았던 날", less: "낮 기온이 낮았던 날", diffUnit: "℃", def: "각 해 일최고기온의 평균" },
  min: { label: "평균 최저기온", unit: "℃", digits: 1, field: "min", kind: "mean", group: "temp", more: "아침 기온이 높았던 날", less: "아침 기온이 낮았던 날", diffUnit: "℃", def: "각 해 일최저기온의 평균" },
  range: { label: "평균 일교차", unit: "℃", digits: 1, field: "range", kind: "mean", group: "temp", more: "일교차가 컸던 날", less: "일교차가 작았던 날", diffUnit: "℃", def: "같은 해의 최고−최저를 계산한 뒤 평균(두 값이 모두 있는 해만)" },
  rain_share: { label: "강수 관측 비율", unit: "%", digits: 0, field: "rain", kind: "share", group: "rain", more: "강수 비율이 높았던 날", less: "강수 비율이 낮았던 날", diffUnit: "%p", def: "강수일수 ÷ N × 100(과거 비율, 앞으로의 강수확률 아님)" },
  rain_sum: { label: "선택 날짜 누적 강수량", unit: "mm", digits: 1, field: "rain", kind: "sum", group: "rain", more: "누적 강수량이 많았던 날", less: "누적 강수량이 적었던 날", diffUnit: "mm", def: "공통 N개 날짜의 일강수량 합(그 기간 모든 날의 강수량이 아님)" },
  hum: { label: "평균 상대습도", unit: "%", digits: 0, field: "hum", kind: "mean", group: "hum", more: "습도가 높았던 날", less: "습도가 낮았던 날", diffUnit: "%p", def: "각 해 공식 일평균 상대습도의 평균" },
  gust: { label: "평균 최대 순간풍속", unit: "m/s", digits: 1, field: "gust", kind: "mean", group: "wind", more: "돌풍이 강했던 날", less: "돌풍이 약했던 날", diffUnit: "m/s", def: "각 해 공식 일최대 순간풍속의 평균(0~75m/s, 그날 최대 풍속 이상인 값만)" },
  sun: { label: "평균 일조시간", unit: "시간", digits: 1, field: "sun", kind: "mean", group: "sun", more: "햇볕이 길었던 날", less: "햇볕이 짧았던 날", diffUnit: "시간", def: "각 해 공식 합계 일조시간의 평균(0~가조시간 범위 값만)" },
};
export const CORE_METRICS = Object.keys(BATTLE_METRICS).filter((k) => BATTLE_METRICS[k].core);
const WORDS = { temp: ["높음", "낮음"], hum: ["높음", "낮음"], share: ["높음", "낮음"], rain: ["많음", "적음"], wind: ["강함", "약함"], sun: ["김", "짧음"] };
const rnd = (v, d) => (v == null ? null : Math.round(v * 10 ** d + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** d);
const DATE_EXCLUDE = new Set(["nodate", "range", "future", "ongoing", "unsupported", "pending", "error"]);

// cases: [{ id, stationId, spec, label?, store, hs? }]
export function caseYears(c, years, ctxOf) {
  const out = [];
  for (let y = years.fromYear; y <= years.toYear; y++) out.push(dailyYear(c.store, resolveYear(c.spec, y), ctxOf(c)));
  return out;
}
// 같은 조건(같은 날짜 기준 + 같은 지점) 카드 묶음
export function duplicates(cases) {
  const seen = new Map();
  const dup = [];
  for (const c of cases) {
    const k = `${c.stationId}|${specKey(c.spec)}`;
    if (seen.has(k)) dup.push([seen.get(k), c.id]);
    else seen.set(k, c.id);
  }
  return dup;
}

// 지표 하나의 공통 연도 비교
export function compareMetric(metricId, cases, rowsByCase) {
  const m = BATTLE_METRICS[metricId];
  const years = rowsByCase[0].map((r) => r.referenceYear);
  const excluded = {}; // year -> [{ case, reason }]
  const eligibleCommon = [];
  const validCommon = [];
  years.forEach((y, i) => {
    const reasons = [];
    let eligible = true;
    let valid = true;
    cases.forEach((c, ci) => {
      const r = rowsByCase[ci][i];
      if (DATE_EXCLUDE.has(r.dateStatus)) { eligible = false; valid = false; reasons.push({ case: c.id, reason: r.dateStatus }); }
      else if (r.values[m.field] == null) { valid = false; reasons.push({ case: c.id, reason: r.fieldStatus?.[m.field] === "qc" ? "qc" : "missing" }); }
    });
    if (eligible) eligibleCommon.push(y);
    if (valid) validCommon.push(y);
    else excluded[y] = reasons;
  });
  const n = validCommon.length;
  const t = tierOf(n, eligibleCommon.length);
  const idx = validCommon.map((y) => years.indexOf(y));
  const results = cases.map((c, ci) => {
    const vals = idx.map((i) => rowsByCase[ci][i].values[m.field]);
    const k = vals.filter((v) => RAIN_DAY(v)).length;
    let value = null;
    if (n) {
      if (m.kind === "mean" || m.kind === "rainMean") value = vals.reduce((a, b) => a + b, 0) / n;
      else if (m.kind === "count") value = k;
      else if (m.kind === "share") value = (k / n) * 100;
      else if (m.kind === "sum") value = vals.reduce((a, b) => a + b, 0);
    }
    return { case: c.id, value, k: m.group === "rain" ? k : undefined, n };
  });
  const out = { metric: metricId, label: m.label, unit: m.unit, digits: m.digits, def: m.def, group: m.group, candidateYears: years, eligibleYears: eligibleCommon, validYears: validCommon, excludedYears: excluded, n, eligible: eligibleCommon.length, ...t, results };
  out.comparison = compareValues(m, results, t, cases);
  out.perYear = validCommon.map((y) => {
    const i = years.indexOf(y);
    return { referenceYear: y, values: cases.map((c, ci) => ({ case: c.id, solarDate: rowsByCase[ci][i].solarDate, lunarDate: rowsByCase[ci][i].lunarDate, isLeapMonth: rowsByCase[ci][i].isLeapMonth, value: rowsByCase[ci][i].values[m.field] })) };
  });
  return out;
}

// 차이·순위. 2개: 'A가 B보다 x 높음' / 3~4개: 표시값 순서와 공동 순위. 배지는 N≥3 이고 자료 제한이 아닐 때만.
export function compareValues(m, results, t, cases) {
  const shown = results.map((r) => ({ case: r.case, value: r.value, shown: rnd(r.value, m.digits) }));
  if (t.tier === "none") return { status: "noCommon", text: "공통으로 비교할 연도가 없습니다", badges: false };
  const badges = t.tier === "stats" && !t.limited;
  if (shown.length === 2) {
    const [a, b] = shown;
    const diff = a.value - b.value;
    const dShown = rnd(Math.abs(diff), m.digits);
    let text;
    let status;
    if (a.value === b.value) { status = "equal"; text = `${a.case}와 ${b.case}가 같습니다`; }
    else if (a.shown === b.shown || dShown === 0) { status = "roundEqual"; text = `${a.case}와 ${b.case}는 표시 정밀도 안에서 차이가 없습니다`; }
    else { status = "diff"; const [up, down] = WORDS[m.group === "rain" && m.kind === "share" ? "share" : m.group] || WORDS.rain; text = `${a.case}가 ${b.case}보다 ${dShown.toFixed(m.digits)}${m.diffUnit} ${diff > 0 ? up : down}`; }
    const winner = status === "diff" ? (diff > 0 ? a.case : b.case) : null;
    return { status, text, diff, diffShown: status === "diff" ? dShown : 0, badges: badges && status === "diff", more: winner, moreLabel: m.more, lessLabel: m.less, reference: t.tier === "reference" };
  }
  // 3~4개: 표시값 내림차순, 같은 표시값은 공동 순위
  const order = [...shown].sort((x, y) => y.shown - x.shown);
  let rank = 0;
  let prev = null;
  order.forEach((x, i) => { if (prev === null || x.shown !== prev) rank = i + 1; x.rank = rank; prev = x.shown; });
  const allSame = order.every((x) => x.shown === order[0].shown);
  return { status: allSame ? "roundEqual" : "rank", text: allSame ? "모든 날짜가 표시 정밀도 안에서 같습니다" : order.map((x) => `${x.rank}위 ${x.case}`).join(" · "), ranks: order.map((x) => ({ case: x.case, rank: x.rank, shown: x.shown, tied: order.filter((o) => o.rank === x.rank).length > 1 })), badges: badges && !allSame, moreLabel: m.more, lessLabel: m.less, reference: t.tier === "reference" };
}

// 시간별 맞대결: 지표·시각마다 모든 카드에 값이 있는 공통 연도로 평균
export function hourlyBattle(cases, hourlyRowsByCase) {
  const out = {};
  const years = hourlyRowsByCase[0].map((r) => r.referenceYear);
  for (const [k, m] of Object.entries(HOURLY_METRICS)) {
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const common = [];
      let eligible = 0;
      years.forEach((y, i) => {
        const rows = hourlyRowsByCase.map((rs) => rs[i]);
        if (rows.some((r) => DATE_EXCLUDE.has(r.dateStatus) || DATE_EXCLUDE.has(r.cellStatus[k][h]))) return;
        eligible++;
        if (rows.every((r) => r.series[k][h] != null)) common.push(i);
      });
      const n = common.length;
      const t = tierOf(n, eligible);
      hours.push({ hour: h, n, eligible, tier: t.tier, limited: t.limited, values: cases.map((c, ci) => ({ case: c.id, mean: n ? common.reduce((a, i) => a + hourlyRowsByCase[ci][i].series[k][h], 0) / n : null })) });
    }
    out[k] = { ...m, hours, interval: k === "rn" ? "h~h+1시" : "정시" };
  }
  return out;
}

// 배틀 전체(한 기간). ctxOf(c) → dateWeather ctx(지점별 자료 범위)
export function battle({ cases, years, ctxOf, withHourly = false, metrics = Object.keys(BATTLE_METRICS) }) {
  const rowsByCase = cases.map((c) => caseYears(c, years, ctxOf));
  const out = {
    version: BATTLE_VERSION, policyVersion: POLICY_VERSION, calendarVersion: CALENDAR_VERSION, sample: SAMPLE_POLICY, years,
    mixedCalendars: new Set(cases.map((c) => c.spec.calendar)).size > 1,
    differentStations: new Set(cases.map((c) => c.stationId)).size > 1,
    duplicates: duplicates(cases),
    cases: cases.map((c, ci) => ({ id: c.id, stationId: c.stationId, spec: c.spec, specKey: specKey(c.spec), specLabel: specLabel(c.spec), label: c.label || null, dateMap: rowsByCase[ci].map((r) => ({ referenceYear: r.referenceYear, solarDate: r.solarDate, lunarDate: r.lunarDate, isLeapMonth: r.isLeapMonth, dateStatus: r.dateStatus })) })),
    metrics: Object.fromEntries(metrics.map((k) => [k, compareMetric(k, cases, rowsByCase)])),
  };
  if (withHourly) {
    const hr = cases.map((c) => { const out2 = []; for (let y = years.fromYear; y <= years.toYear; y++) out2.push(hourlyYear(c.hs, resolveYear(c.spec, y), ctxOf(c))); return out2; });
    out.hourly = hourlyBattle(cases, hr);
  }
  return out;
}
// 특정 기준연도의 카드별 실제 시간값(해마다 결과 보기 → 연도 클릭)
export function battleYear({ cases, year, ctxOf }) {
  return cases.map((c) => {
    const res = resolveYear(c.spec, year);
    const d = dailyYear(c.store, res, ctxOf(c));
    const h = hourlyYear(c.hs, res, ctxOf(c));
    return { case: c.id, referenceYear: year, solarDate: res.solarDate, lunarDate: res.lunarDate, isLeapMonth: res.isLeapMonth, dateStatus: d.dateStatus, daily: d.values, hourlyStatus: h.dateStatus, series: h.series, cellStatus: h.cellStatus };
  });
}
