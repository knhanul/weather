// 이야기·생활 판정의 사실 계산(순수 함수, astra 지침 1·4·13·15장). 기존 엔진 값만 받아 쓰고 새 숫자를 만들지 않는다.
import { RULES_VERSION, STORY_SCHEMA_VERSION, SEASON_WINDOWS, REGION_RULES, EMPTY_REASONS } from "./rt-story-rules.mjs";

// ---------------------------------------------------------------- 조건 판정: pass / fail / unknown (결측은 통과가 아님)
// checks: [{ id, label, value, test(v) → boolean, failText, missingText }]
// 전체: 알려진 조건 중 하나라도 실패 → fail, 실패 없이 값이 하나라도 없음 → unknown, 모두 확인되어 통과 → pass
export function judgeConditions(checks) {
  const out = checks.map((c) => {
    const known = c.value !== null && c.value !== undefined && Number.isFinite(Number(c.value));
    const status = !known ? "unknown" : c.test(Number(c.value)) ? "pass" : "fail";
    return { id: c.id, label: c.label, value: known ? Number(c.value) : null, status, text: status === "fail" ? c.failText?.(Number(c.value)) ?? c.label : status === "unknown" ? c.missingText ?? `${c.label} 자료 없음` : null };
  });
  const status = out.some((c) => c.status === "fail") ? "fail" : out.some((c) => c.status === "unknown") ? "unknown" : "pass";
  return { status, checks: out, failed: out.filter((c) => c.status === "fail"), missing: out.filter((c) => c.status === "unknown") };
}
// 지금 러닝(산책·러닝 기본 조건) — 실황 값 v{ta,rn1,ws}, cond = OUTDOOR_DEFAULT 모양
export function runningJudgement(v, cond) {
  const checks = [
    { id: "ta", label: "기온", value: v?.ta, test: (t) => t >= cond.tmin && t <= cond.tmax, failText: (t) => (t < cond.tmin ? "기온이 낮음" : "기온이 높음"), missingText: "기온 자료가 없어" },
  ];
  if (cond.dry) checks.push({ id: "rain", label: "비", value: v?.rn1, test: (r) => r < 0.1, failText: () => "비", missingText: "강수 자료가 없어" });
  if (cond.wind !== null && cond.wind !== undefined) checks.push({ id: "wind", label: "바람", value: v?.ws, test: (w) => w <= cond.wind, failText: () => "바람", missingText: "풍속 자료가 없어" });
  const j = judgeConditions(checks);
  const answer = j.status === "pass" ? "선택한 날씨 조건에 맞음" : j.status === "fail" ? `조건에 맞지 않음 — ${j.failed.map((c) => c.text).join("·")}` : `${j.missing.map((c) => c.text).join("·").replace(/어·/g, "고 ")} 판단 보류`;
  return { ...j, answer };
}

// ---------------------------------------------------------------- 지역 순위(1-2·13장)
// 동률 = 같은 순위(1,1,3 방식). key(row) 가 클수록 앞
function competitionRank(rows, key, digits = 3) {
  const f = 10 ** digits;
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  let prev = null, rank = 0;
  return sorted.map((r, i) => {
    const k = Math.round(key(r) * f) / f;
    if (prev === null || k !== prev) { rank = i + 1; prev = k; }
    return { r, rank };
  });
}
// 공통 시각: 실황이 최신인 지점들 중 가장 많은 지점이 가진 정시(같으면 나중 시각). 다른 시각 지점은 순위표에서 뺌
export function commonTime(rows) {
  const cnt = new Map();
  for (const r of rows) if (r.time) cnt.set(r.time, (cnt.get(r.time) || 0) + 1);
  let best = null;
  for (const [t, n] of cnt) if (!best || n > best.n || (n === best.n && t > best.t)) best = { t, n };
  return best?.t ?? null;
}
// '평소에서 얼마나 드문가' 한 가지 잣대(지역 순위·'평소와 가장 다른 곳'·지역 그래프 순서가 모두 이것을 씀)
//   U2 = |백분위−50|/50. 둘 다 백분위 끝(U2 ≥ extremeU, 백분위 97 이상·3 이하)이면 백분위는 표본 몇 개 차이라 겹치므로
//   평소 변동폭 대비 차이 |z| = |지금−평균|/표준편차 로 가른다. 점수: 끝 구간 = 2 + |z|/10(항상 위), 그 밖 = U2.
export function unusualScore(pct, z, R = REGION_RULES) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const U2 = Math.abs(pct - 50) / 50;
  const byZ = U2 >= R.extremeU && Number.isFinite(z);
  return { U2: Math.round(U2 * 1000) / 1000, byZ, score: byZ ? 2 + Math.min(Math.abs(z), 9.99) / 10 : U2 };
}
// rows(regions 행) → 드문 순 [{ id, name, temp, diff, percentile, samples, z, sd, U2, byZ, score }] (같은 점수면 |차이| 큰 쪽)
export function unusualOrder(rows, b = "all", R = REGION_RULES) {
  return rows.filter((r) => r.pcts?.[b] != null).map((r) => {
    const z = r.zs?.[b] ?? null, u = unusualScore(r.pcts[b], z, R);
    return { id: r.id, name: r.name, temp: r.temp, diff: r.diffs?.[b] ?? null, percentile: r.pcts[b], samples: r.samples?.[b] ?? null, z, sd: r.sds?.[b] ?? null, ...u };
  }).sort((a, c) => c.score - a.score || Math.abs(c.diff ?? 0) - Math.abs(a.diff ?? 0));
}
// rows: [{ id, name, time, temp, diffs{all,r10,r5}, pcts{all,r10,r5}, samples{...} }]
export function rankRegions(rows, basisIds = ["all", "r10", "r5"]) {
  const t0 = commonTime(rows.filter((r) => r.temp != null));
  const same = rows.filter((r) => r.temp != null && r.time === t0);
  const rankTemp = competitionRank(same, (r) => r.temp, 1).map(({ r, rank }) => ({ rank, of: same.length, id: r.id, name: r.name, temp: r.temp }));
  const rankings = {};
  for (const b of basisIds) {
    const withDiff = same.filter((r) => r.diffs?.[b] != null);
    const aboveAvg = competitionRank(withDiff, (r) => r.diffs[b], 1).map(({ r, rank }) => ({ rank, of: withDiff.length, id: r.id, name: r.name, diff: r.diffs[b], percentile: r.pcts?.[b] ?? null }));
    const withPct = same.filter((r) => r.pcts?.[b] != null);
    const U = new Map(unusualOrder(withPct, b).map((u) => [u.id, u]));
    const deviation = competitionRank(withPct, (r) => U.get(r.id).score, REGION_RULES.deviationDigits).map(({ r, rank }) => ({ rank, of: withPct.length, id: r.id, name: r.name, deviation: U.get(r.id).U2, byZ: U.get(r.id).byZ, z: U.get(r.id).z, direction: r.pcts[b] > 50 ? "high" : r.pcts[b] < 50 ? "low" : "mid", directionText: r.pcts[b] > 50 ? "평소보다 높은 쪽" : r.pcts[b] < 50 ? "평소보다 낮은 쪽" : "평소 가운데", diff: r.diffs?.[b] ?? null, percentile: r.pcts[b], samples: r.samples?.[b] ?? null }));
    rankings[b] = { aboveAvg, deviation, comparable: { aboveAvg: withDiff.length, deviation: withPct.length } };
  }
  const excluded = rows.filter((r) => r.temp != null && r.time !== t0).map((r) => ({ id: r.id, name: r.name, time: r.time, reason: `실황 시각이 달라(${String(r.time).slice(11, 16)}) 같은 순위표에서 뺌` }));
  return { time: t0, comparable: same.length, rankTemp, rankings, excluded };
}

// ---------------------------------------------------------------- 계절 신호 노출(4장)
// event = { date: 'YYYY-MM-DD' | null, firstConfirmed }, today = 'YYYY-MM-DD'
export function seasonExposure(type, event, today) {
  const w = SEASON_WINDOWS[type];
  if (!w) return { home: false, reason: "노출 규칙 없음" };
  if (!event?.date) return { home: false, reason: "올해 아직 확인되지 않음" };
  const m = +today.slice(5, 7);
  const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${event.date}T00:00:00Z`)) / 864e5);
  if (!w.months.includes(m)) return { home: false, ageDays: age, reason: `계절 노출 기간 밖(${w.months[0]}~${w.months.at(-1)}월만)` };
  if (age > w.daysAfter) return { home: false, ageDays: age, reason: `계절 노출 기간 밖(확인 뒤 ${w.daysAfter}일 지남, ${age}일 전)` };
  if (event.firstConfirmed === false) return { home: false, ageDays: age, reason: "시즌 앞부분 자료가 빠져 '처음'을 확정할 수 없음" };
  return { home: true, ageDays: age, reason: null };
}

// ---------------------------------------------------------------- 빈 이야기 사유(1-3)
// sel = selectStories 결과, ctx = { fresh, candidates, failedParts }
export function emptyReasonOf(sel, { fresh, candidates, failedParts = [] }) {
  if (sel.stories.length) return null;
  if (failedParts.length) return "error";
  if (!fresh) return "stale";
  const judged = candidates.filter((c) => !c.exclude && c.samples >= c.minSamples);
  const core = judged.some((c) => c.key === "now-anomaly");
  return !judged.length || !core ? "insufficient" : "normal";
}
export const emptyText = (reason) => EMPTY_REASONS[reason] ?? null;

// ---------------------------------------------------------------- 이야기 객체(15장 일부) — 기존 필드(key·title·text·basis·kind·score)는 그대로 두고 덧붙임
const KIND_ID = { 관측: "observation", 예보: "forecast", 혼합: "mixed", 과거: "historical" };
export function toStory(c, { station, asOf }) {
  const ruleId = c.ruleId || c.key.replace(/-\d{4}-\d{2}-\d{2}.*$/, "");
  return {
    ...c,
    schemaVersion: STORY_SCHEMA_VERSION,
    id: c.key,
    eventId: c.eventId || `${station}|${c.key}`,
    ruleId,
    rulesVersion: RULES_VERSION,
    kindId: KIND_ID[c.kind] || "observation",
    basisId: c.basisId === null ? null : c.basisId || "all",
    basisFixed: c.basisFixed || null, // 선택한 기준과 상관없이 정해진 기준으로 비교하는 카드의 짧은 이유(11장)
    asOf: c.asOf || asOf,
    facts: c.facts || {},
    evidence: {
      samples: c.samples ?? null, validYears: c.validYears ?? null, expected: c.expected ?? null, missing: c.missing ?? null,
      status: c.evidenceStatus || (c.samples >= c.minSamples ? "ok" : "insufficient"), methodId: c.methodId || ruleId, sourceRefs: c.sourceRefs || [c.basis].filter(Boolean),
    },
    templateId: c.templateId || `${ruleId}.base.v1`,
    body: c.text,
    scene: c.scene ?? null,
    chart: c.chart ?? null,
    selection: { score: c.score ?? null, reasons: c.reasons || [] },
  };
}
