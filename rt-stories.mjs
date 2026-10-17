// 6단계: 과거 유사일 자동 탐색 + 날씨 이야기 선별 엔진(순수 함수 — 수치는 입력에서만, 지어내지 않음).
import { ymdToDn, dnToYmd, isLeap, hval } from "./stats-engine.mjs";
import { SELECT_RULES } from "./rt-story-rules.mjs";

// ---------------------------------------------------------------- 과거 유사일
// 후보: 1990년부터 대상일 전날까지, 해마다 대상일과 같은 월일 ±SIM_WINDOW일(계절을 맞춤). 2/29 는 평년 2/28.
// 데이터 부족 후보 제외: 비교하는 모든 시각의 ASOS 기온이 있어야 함(하나라도 없으면 제외). full 모드는 강수 24시간 전부·습도 20시간 이상도 필요.
export const SIM_WINDOW = 15;
export const SIM_MIN_HOURS = 6;
export const SIM_FULL_MIN_HOURS = 20;
export const SIM_WEIGHTS = { rmse: 1, dMax: 0.5, dMin: 0.5, rain: 2, dHm: 0.05 };
export const SIM_FORMULA = {
  partial: "점수 = 관측이 끝난 시각들의 시간별 기온 RMSE(℃) — 작을수록 비슷",
  full: "점수 = 1×시간별 기온 RMSE + 0.5×|최고기온 차| + 0.5×|최저기온 차| + 2×(강수 여부 불일치 1/0) + 0.05×|평균습도 차(%)| — 최고·최저는 비교한 정시 기온(20시간 이상)의 최고·최저, 강수 여부는 그 시각들 합 0.1mm 이상. 대상일 강수·습도가 모자라면 그 항은 빼고 표시",
};
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

export function dayVals(hs, dn, field) {
  const out = new Array(24).fill(NaN);
  for (let h = 0; h < 24; h++) {
    const i = (dn - hs.base) * 24 + h;
    if (i >= 0 && i < hs.n && hs.src[i]) out[h] = hval(hs[field], i);
  }
  return out;
}
const finite = (a) => a.filter(Number.isFinite);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
// target: { date, ta[24], hm[24], rn[24] }(NaN = 없음), mode: "partial" | "full"
export function similarDays(hs, target, { mode = "partial", top = 5, window = SIM_WINDOW } = {}) {
  const hours = [];
  for (let h = 0; h < 24; h++) if (Number.isFinite(target.ta[h])) hours.push(h);
  const base = { mode, date: target.date, hoursUsed: hours, formula: SIM_FORMULA[mode], weights: mode === "full" ? SIM_WEIGHTS : { rmse: 1 }, window };
  if (mode === "partial" && hours.length < SIM_MIN_HOURS) return { ...base, ok: false, message: `관측이 끝난 시각이 ${hours.length}개뿐이라 비교하지 않습니다(최소 ${SIM_MIN_HOURS}개)`, considered: 0, excluded: 0, top: [] };
  if (mode === "full" && hours.length < SIM_FULL_MIN_HOURS) return { ...base, ok: false, message: `대상일 기온이 ${hours.length}/24시간뿐이라 하루 전체 비교를 하지 않습니다(최소 ${SIM_FULL_MIN_HOURS}시간)`, considered: 0, excluded: 0, top: [] };
  // 강수 항: 대상일 강수가 비교 시각 모두에 있을 때만(없는 값을 0으로 보지 않음). 없으면 항을 빼고 그 사실을 표시
  const useRain = mode === "full" && hours.every((h) => Number.isFinite(target.rn[h]));
  const tRain = useRain ? hours.map((h) => target.rn[h]) : [];
  const tHm = mode === "full" ? finite(target.hm) : [];
  const useHm = mode === "full" && tHm.length >= 20;
  const tMax = Math.max(...hours.map((h) => target.ta[h])), tMin = Math.min(...hours.map((h) => target.ta[h]));
  const tRainy = tRain.reduce((s, x) => s + x, 0) >= 0.1;
  const tHmMean = useHm ? mean(tHm) : NaN;
  const tDn = ymdToDn(target.date);
  const y0 = 1990, y1 = Number(target.date.slice(0, 4));
  const md = target.date.slice(5, 10);
  let considered = 0, excluded = 0;
  const res = [];
  const seen = new Set();
  for (let y = y0; y <= y1; y++) {
    const c = ymdToDn(`${y}-${md === "02-29" && !isLeap(y) ? "02-28" : md}`);
    for (let o = -window; o <= window; o++) {
      const dn = c + o;
      if (dn >= tDn || seen.has(dn)) continue;
      seen.add(dn);
      considered++;
      const ta = dayVals(hs, dn, "ta");
      if (hours.some((h) => !Number.isFinite(ta[h]))) { excluded++; continue; }
      const rmse = Math.sqrt(mean(hours.map((h) => (ta[h] - target.ta[h]) ** 2)));
      const row = { date: dnToYmd(dn), score: rmse, rmse: r2(rmse), ta: hours.map((h) => ta[h]) };
      if (mode === "full") {
        const rnAll = dayVals(hs, dn, "rn");
        const rn = hours.map((h) => rnAll[h]);
        if (useRain && rn.some((x) => !Number.isFinite(x))) { excluded++; continue; }
        const hm = finite(dayVals(hs, dn, "hm"));
        if (useHm && hm.length < 20) { excluded++; continue; }
        const tah = hours.map((h) => ta[h]);
        const cMax = Math.max(...tah), cMin = Math.min(...tah), cRain = useRain ? rn.reduce((s, x) => s + x, 0) : NaN;
        const mis = useRain && (cRain >= 0.1) !== tRainy ? 1 : 0;
        const dHm = useHm ? Math.abs(mean(hm) - tHmMean) : 0;
        row.score = SIM_WEIGHTS.rmse * rmse + SIM_WEIGHTS.dMax * Math.abs(cMax - tMax) + SIM_WEIGHTS.dMin * Math.abs(cMin - tMin) + SIM_WEIGHTS.rain * mis + (useHm ? SIM_WEIGHTS.dHm * dHm : 0);
        Object.assign(row, { max: r1(cMax), min: r1(cMin), rain: useRain ? r1(cRain) : null, dMax: r1(cMax - tMax), dMin: r1(cMin - tMin), rainMismatch: mis, dHm: useHm ? r1(mean(hm) - tHmMean) : null });
      }
      res.push(row);
    }
  }
  res.sort((a, b) => a.score - b.score || (a.date < b.date ? 1 : -1));
  // 같은 해 3일 안의 후보는 하나만(같은 날씨 흐름이 겹쳐 나오지 않게)
  const pick = [];
  for (const r of res) {
    if (pick.some((p) => Math.abs(ymdToDn(p.date) - ymdToDn(r.date)) <= 3)) continue;
    pick.push({ ...r, score: r2(r.score) });
    if (pick.length >= top) break;
  }
  return { ...base, ok: pick.length > 0, humidityUsed: mode === "full" ? useHm : undefined, rainUsed: mode === "full" ? useRain : undefined, termsNote: mode === "full" ? [useRain ? null : "대상일 강수 자료가 비교 시각에 다 있지 않아 강수 항(2×불일치)을 뺐습니다", useHm ? null : "대상일 습도가 20시간 미만이라 습도 항을 뺐습니다"].filter(Boolean).join(" ") || null : undefined, target: { max: r1(tMax), min: r1(tMin), rainy: useRain ? tRainy : undefined, ta: hours.map((h) => target.ta[h]) }, considered, excluded, valid: res.length, top: pick, message: pick.length ? null : "비교할 수 있는 과거 날짜가 없습니다" };
}

// ---------------------------------------------------------------- 이야기 선별
// 후보: { key, phenomenon, kind: "관측"|"예보", unusual(0~1), samples, minSamples, info(0~1), title, text, basis }
// 선별: 표본 부족(samples < minSamples) 제외 → unusual < MIN_UNUSUAL 제외 → 점수 = 0.6×unusual + 0.4×info,
//       예보 ×0.9, 최근 게시(recent 에 같은 key) ×0.5 → 같은 현상(phenomenon)은 점수 높은 하나만 → 상위 max 개.
// c.exclude(문자열)가 있으면 점수 전에 그 사유로 뺌(계절 노출 기간 밖·비교 지점 부족 등)
export const STORY_RULE = SELECT_RULES;
export function selectStories(cands, { recent = new Set(), rule = STORY_RULE } = {}) {
  const dropped = [];
  const kept = [];
  for (const c of cands) {
    if (!c || !c.text) continue;
    if (c.exclude) { dropped.push({ key: c.key, reason: c.exclude }); continue; }
    if (!(c.samples >= c.minSamples)) { dropped.push({ key: c.key, reason: `표본 부족(${c.samples ?? 0}/${c.minSamples})` }); continue; }
    if (!(c.unusual >= rule.minUnusual)) { dropped.push({ key: c.key, reason: `이례성 낮음(${r2(c.unusual ?? 0)})` }); continue; }
    let score = rule.wUnusual * Math.min(1, c.unusual) + rule.wInfo * Math.min(1, c.info ?? 0.5);
    if (c.kind === "예보") score *= rule.forecastFactor;
    const isRecent = recent.has(c.key);
    if (isRecent) score *= rule.recentFactor;
    kept.push({ ...c, score: r2(score), recent: isRecent });
  }
  kept.sort((a, b) => b.score - a.score);
  const byPh = new Set();
  const out = [];
  for (const c of kept) {
    if (byPh.has(c.phenomenon)) { dropped.push({ key: c.key, reason: `같은 현상(${c.phenomenon}) 중복` }); continue; }
    if (out.length >= rule.max) { dropped.push({ key: c.key, reason: "개수 제한" }); continue; }
    byPh.add(c.phenomenon);
    out.push(c);
  }
  return { stories: out, dropped, rule };
}
// 이례성 도우미
export const unusualFromPct = (p) => (p == null ? null : Math.abs(p - 50) / 50);
export const unusualFromRank = (rank, of) => (rank == null || !of ? null : 1 - (Math.min(rank, of - rank + 1) - 1) / (of / 2));
export const unusualFromDiff = (d, full) => (d == null ? null : Math.min(1, Math.abs(d) / full));
