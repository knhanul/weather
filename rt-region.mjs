// 지역 이야기(astra 13장, 4단계): 8개 지점을 같은 공통 정시·같은 기준(basis)으로 맞춰 세 가지 후보를 만든다. 새 모듈.
//   1) 평소와 가장 다른 곳: U2 = |백분위−50|/50 순(부호·실황값·표본수 함께). U2 ≥ topMinU 일 때만 후보.
//   2) 지역 간 기온차 D = max − min(공통시각 유효 지점 집합 S). 과거는 같은 날짜창(±7일)·같은 정시·같은 집합 S 모든 지점 값이 있는 날만.
//      N ≥ 60 + 유효연도 조건 + p(D) ≥ 0.90 일 때 후보. 6개 미만이면 뺌. 집합이 바뀌면 stationSetHash 가 바뀜(캐시 키).
//   3) 같이 따뜻하거나 쌀쌀한 곳: 같은 기준 대비 +3℃ 이상 / −3℃ 이하 지점 수 — '관측 가능한 N개 중 k개'. k ≥ 절반일 때 후보.
//   실황은 격자, 과거는 ASOS 정시라 참고 비교 — 전국 평균·전국 기록이라 하지 않는다.
import { hval, ymdToDn } from "./stats-engine.mjs";
import { derivedCompare } from "./rt-baseline.mjs";
import { REGION_RULES } from "./rt-story-rules.mjs";

const hAt = (hs, dn, h) => { const i = (dn - hs.base) * 24 + h; return hs && i >= 0 && i < hs.n && hs.src[i] ? hval(hs.ta, i) : NaN; };
const BI = { all: 0, r10: 1, r5: 2 };
// 받침에 따라 이/가
export const iga = (w) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가"; };
export function stationSetHash(ids) {
  const s = [...ids].map(String).sort().join(",");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// rows = regions().rows, time = 공통 정시, hsOf(id) → 시간자료 저장소(동기, 미리 읽어 둔 것)
export function regionFacts({ rows, time, basis = "all", hsOf, R = REGION_RULES }) {
  const S = rows.filter((r) => r.temp != null && r.time === time);
  const ids = S.map((r) => r.id);
  const out = { time, basis, N: S.length, stationSetHash: stationSetHash(ids), ids, enough: S.length >= R.minStationsStory, minStations: R.minStationsStory };
  if (!time) return { ...out, enough: false };
  const ymd = time.slice(0, 10), hour = +time.slice(11, 13);
  // 1) 평소와 가장 다른 곳
  const dev = S.filter((r) => r.pcts?.[basis] != null).map((r) => ({ id: r.id, name: r.name, temp: r.temp, diff: r.diffs?.[basis] ?? null, percentile: r.pcts[basis], samples: r.samples?.[basis] ?? null, U2: Math.round((Math.abs(r.pcts[basis] - 50) / 50) * 1000) / 1000 }))
    .sort((a, b) => b.U2 - a.U2 || Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
  out.top = dev[0] || null;
  out.deviation = dev;
  // 2) 지역 간 기온차
  const temps = S.map((r) => r.temp);
  const D = temps.length ? Math.round((Math.max(...temps) - Math.min(...temps)) * 10) / 10 : null;
  out.spread = { D, hi: S.find((r) => r.temp === Math.max(...temps)) || null, lo: S.find((r) => r.temp === Math.min(...temps)) || null, cmp: null };
  if (out.enough && hsOf) {
    const stores = ids.map((id) => hsOf(id));
    if (stores.every(Boolean)) {
      const get = (dn) => {
        let mx = -Infinity, mn = Infinity;
        for (const hs of stores) { const v = hAt(hs, dn, hour); if (!Number.isFinite(v)) return [NaN]; if (v > mx) mx = v; if (v < mn) mn = v; }
        return [mx - mn];
      };
      const cmp = derivedCompare(get, ymd, D, { digits: 1 })[BI[basis] ?? 0];
      out.spread.cmp = { mean: cmp.mean, p: cmp.p ?? null, percentile: cmp.percentile ?? null, samples: cmp.samples, validYears: cmp.validYears, range: `${cmp.from}~${cmp.to}`, status: cmp.status, statusText: cmp.statusText, p90: cmp.p90 ?? null, max: cmp.max ?? null };
    }
  }
  // 3) 같이 따뜻·쌀쌀
  const withDiff = S.filter((r) => r.diffs?.[basis] != null);
  out.together = { N: withDiff.length, warm: withDiff.filter((r) => r.diffs[basis] >= R.togetherDelta).map((r) => r.name), cold: withDiff.filter((r) => r.diffs[basis] <= -R.togetherDelta).map((r) => r.name), delta: R.togetherDelta };
  // 8행 가로 점그래프 자료(0 = 평소)
  out.chart = { type: "regions", time, basis, unit: "℃", rows: S.map((r) => ({ id: r.id, name: r.name, temp: r.temp, diff: r.diffs?.[basis] ?? null, percentile: r.pcts?.[basis] ?? null, samples: r.samples?.[basis] ?? null })).sort((a, b) => (b.diff ?? -99) - (a.diff ?? -99)), N: S.length };
  return out;
}
// 후보(이야기 선별 입력) — sid = 지금 보는 지점(강조용), U 계산은 각 규칙에서
export function regionCands(F, { sid, nm, tv, LIFE_VALUE, basisId, R = REGION_RULES }) {
  const C = [];
  if (!F?.time) return C;
  const why = F.enough ? null : `비교 가능한 지점 ${F.N}개(${R.minStationsStory}개 미만)`;
  const chart = { ...F.chart, highlight: sid };
  const hhmm = F.time.slice(11, 16);
  const sg = (d) => (d > 0 ? `+${d}` : `${d}`);
  const t = F.top;
  if (t && t.U2 >= R.topMinU) C.push({ key: "region-top", ruleId: "G01", eventId: `G01|${F.time.slice(0, 10)}|${t.id}|${t.diff > 0 ? "hi" : "lo"}|${F.stationSetHash}`, topic: "region", path: "stat", phenomenon: "평소와 가장 다른 곳", kind: "관측", basisId, U: t.U2, A: t.id === sid ? 0.7 : 0.3, T: tv(F.time), material: { id: t.id, dir: t.diff > 0 ? 1 : -1 }, samples: t.samples ?? 0, minSamples: 60, exclude: why, title: `지금 평소와 가장 다른 곳은 ${t.name}(${sg(t.diff)}℃)`, text: `${hhmm} 같은 시각 관측 가능한 ${F.N}개 지점 중 ${t.name}${iga(t.name)} 같은 시기 평균에서 가장 멀어요 — 지금 ${t.temp}℃, 평균 대비 ${sg(t.diff)}℃, 백분위 ${t.percentile}(표본 ${t.samples}개).`, method: "공통 최신 정시의 지점별 |백분위−50|/50 순. 실황은 격자, 과거는 ASOS 정시라 참고 비교예요.", basis: `같은 실황 시각 ${hhmm} · ${F.N}개 지점`, facts: { name: t.name, id: t.id, diff: t.diff, percentile: t.percentile, U2: t.U2, N: F.N, mine: t.id === sid }, chart });
  const sp = F.spread;
  if (sp?.cmp && sp.cmp.p != null && sp.cmp.p >= R.spreadP) C.push({ key: "region-spread", ruleId: "G02", eventId: `G02|${F.time.slice(0, 10)}|${F.stationSetHash}`, topic: "region", path: "stat", phenomenon: "지역 간 기온차", kind: "관측", basisId, U: Math.max(0, 2 * sp.cmp.p - 1), A: 0.3, T: tv(F.time), material: { D: Math.round(sp.D) }, samples: sp.cmp.samples, minSamples: 60, exclude: why, title: `지금은 지역 간 기온 차가 평소보다 큰 시간이에요(${sp.D}℃)`, text: `${hhmm} 관측 가능한 ${F.N}개 지점 중 가장 따뜻한 ${sp.hi?.name} ${sp.hi?.temp}℃, 가장 쌀쌀한 ${sp.lo?.name} ${sp.lo?.temp}℃ — 차이 ${sp.D}℃. 같은 ${F.N}개 지점의 ${sp.cmp.range}년 같은 시기·같은 시각 평균 차이 ${sp.cmp.mean}℃, 백분위 ${sp.cmp.percentile}.`, method: "같은 지점 집합의 모든 지점 값이 있는 과거 날만 같은 정시 max−min 을 계산(표본 60개 이상, 유효 해 80%).", basis: `같은 실황 시각 ${hhmm} · 지점 집합 ${F.stationSetHash}`, facts: { D: sp.D, mean: sp.cmp.mean, percentile: sp.cmp.percentile, N: F.N }, chart });
  const tg = F.together;
  for (const [side, list, word] of [["warm", tg.warm, "높아요"], ["cold", tg.cold, "낮아요"]]) {
    if (tg.N && list.length >= Math.ceil(tg.N * R.togetherShare)) C.push({ key: `region-together-${side}`, ruleId: "G03", eventId: `G03|${F.time.slice(0, 10)}|${side}|${F.stationSetHash}`, topic: "region", path: "stat", phenomenon: "같이 따뜻·쌀쌀", kind: "관측", basisId, U: list.length / tg.N, A: LIFE_VALUE.info, T: tv(F.time), material: { k: list.length, side }, samples: tg.N, minSamples: R.minStationsStory, exclude: why, title: `관측 가능한 ${tg.N}개 중 ${list.length}개 지점이 평소보다 ${tg.delta}℃ 이상 ${word}`, text: `${hhmm} 기준 ${list.join("·")} — 같은 시기·같은 시각 평균 대비 ${side === "warm" ? "+" : "−"}${tg.delta}℃ ${side === "warm" ? "이상" : "이하"}.`, method: "공통 최신 정시의 지점별 (실황 − 같은 시기 평균) 차이. 실황은 격자, 과거는 ASOS 정시라 참고 비교예요.", basis: `같은 실황 시각 ${hhmm} · ${tg.N}개 지점`, facts: { k: list.length, N: tg.N, side, names: list }, chart });
  }
  return C;
}
