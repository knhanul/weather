// 이야기 선별 2판(astra 5장) — 순수 함수 + 게시 이력 인터페이스. 점수 계산에 쓰는 값은 후보가 가진 값만(새 숫자를 만들지 않음).
// 후보(candidate) 모양: { key, ruleId, eventId, topic, path: "stat"|"life", U(0~1|null), A(0~1), T(0~1), material{...}, lifeDecision?, mergeGroup?,
//   lifeSlot?, exclude?(문자열), samples, minSamples, kind, title, text, basis, ... }
import { SELECT_V2, TIME_VALUE } from "./rt-story-rules.mjs";
import { fnv1a32 } from "./rt-story-templates.mjs";

const r2 = (v) => Math.round(v * 100) / 100;
const H = 3600000;
// KST 벽시계 'YYYY-MM-DD HH:MM[:SS]' → 비교용 ms(UTC 로 읽음 — 차이만 씀)
export const wallMs = (w) => (w ? Date.parse(`${String(w).slice(0, 16).replace(" ", "T")}:00Z`) : NaN);

// 시점 가치 T: 대상 구간 [startW, endW](벽시계), nowW. 둘 다 없으면 시점 없는 설명(0.5)
export function timeValue({ startW = null, endW = null, nowW }) {
  const now = wallMs(nowW), s = wallMs(startW), e = wallMs(endW ?? startW);
  if (!Number.isFinite(s) && !Number.isFinite(e)) return TIME_VALUE.timeless;
  if (Number.isFinite(e) && e < now) {
    const age = now - e;
    return age <= 24 * H ? TIME_VALUE.past24h : age <= 72 * H ? TIME_VALUE.past72h : TIME_VALUE.older;
  }
  if (!Number.isFinite(s) || s <= now) return TIME_VALUE.nowOr6h;
  const lead = s - now;
  return lead <= 6 * H ? TIME_VALUE.nowOr6h : lead <= 24 * H ? TIME_VALUE.in24h : lead <= 72 * H ? TIME_VALUE.in72h : TIME_VALUE.later;
}

// 같은 사건의 '보이는 내용' 해시(5-4): 규칙이 반올림해 둔 material(기온 1℃·강수확률 20%p·시작 시각 2시간·강수형태·단계)만
export function materialHash(ruleId, material) {
  const keys = Object.keys(material || {}).sort();
  return fnv1a32(`${ruleId}|${keys.map((k) => `${k}=${material[k]}`).join(";")}`).toString(16).padStart(8, "0");
}
// 반올림 도우미(5-4 단위)
export const roundTo = (v, unit) => (v == null || !Number.isFinite(v) ? null : Math.round(v / unit) * unit);
export const slot2h = (w) => (w ? `${String(w).slice(0, 10)} ${String(Math.floor(+String(w).slice(11, 13) / 2) * 2).padStart(2, "0")}` : null);

// 게시 이력 저장소 인터페이스: list(station) → [{ eventId, materialHash, ruleId, slot, at(벽시계) }], record(station, slot, entries).
// 지금은 서버 메모리(재시작하면 비워짐). 나중에 DB(5단계)로 바꿀 때 같은 두 함수만 구현하면 된다.
export function createMemoryHistory({ keepDays = SELECT_V2.historyDays } = {}) {
  const m = new Map();
  return {
    kind: "memory",
    async list(station) { return [...(m.get(String(station)) || [])]; },
    async record(station, slot, entries, nowW) {
      const id = String(station);
      const cut = wallMs(nowW) - keepDays * 24 * H;
      const cur = (m.get(id) || []).filter((h) => wallMs(h.at) >= cut);
      for (const e of entries) {
        // 같은 발행 구간에서 같은 eventId·내용은 한 번만(재요청이 이력을 늘리지 않음)
        if (cur.some((h) => h.slot === slot && h.eventId === e.eventId && h.materialHash === e.materialHash)) continue;
        cur.push({ eventId: e.eventId, materialHash: e.materialHash, ruleId: e.ruleId, slot, at: nowW });
      }
      m.set(id, cur);
    },
  };
}

// F·R: 이전 발행 구간(slot ≠ 지금)의 이력만 본다
export function freshAndRepeat(c, history, { slot, nowW, rule = SELECT_V2 }) {
  const prev = history.filter((h) => h.slot !== slot && h.eventId === c.eventId);
  if (!prev.length) return { F: rule.fresh.new, R: 0, seen: null };
  const same = prev.filter((h) => h.materialHash === c.materialHash);
  const F = same.length ? rule.fresh.same : rule.fresh.changed;
  let R = 0;
  if (same.length) {
    const age = wallMs(nowW) - Math.max(...same.map((h) => wallMs(h.at)));
    R = age <= 24 * H ? rule.repeat.within24h : age <= 72 * H ? rule.repeat.within72h : 0;
  }
  return { F, R, seen: same.length ? "same" : "changed" };
}

// 선별: 점수 전 편집 규칙(5-3) → 점수 → 주제 묶음 → 생활 슬롯 → 대표(현재·가까운 미래) → 최대 max 개
export function selectV2(cands, { history = [], slot, nowW, rule = SELECT_V2 } = {}) {
  const dropped = [];
  const ok = [];
  for (const c0 of cands) {
    if (!c0 || !c0.title) continue;
    const c = { ...c0, materialHash: c0.materialHash || materialHash(c0.ruleId || c0.key, c0.material || {}) };
    if (c.exclude) { dropped.push({ key: c.key, reason: c.exclude }); continue; }
    if (c.path !== "life") {
      if (!(c.samples >= c.minSamples)) { dropped.push({ key: c.key, reason: `표본 부족(${c.samples ?? 0}/${c.minSamples})` }); continue; }
      const minU = c.minU ?? rule.minUnusual;
      if (!(c.U >= minU)) { dropped.push({ key: c.key, reason: `이례성 낮음(${r2(c.U ?? 0)} < ${minU})` }); continue; }
    }
    const { F, R, seen } = freshAndRepeat(c, history, { slot, nowW, rule });
    const U = Math.min(1, c.U ?? 0), A = c.A ?? 0.5, T = c.T ?? TIME_VALUE.timeless;
    const score = rule.w.U * U + rule.w.A * A + rule.w.T * T + rule.w.F * F - R;
    ok.push({ ...c, score: r2(score), parts: { U: r2(U), A, T, F, R }, recent: seen === "same", reasons: [`U ${r2(U)}·A ${A}·T ${T}·F ${F}${R ? `·반복 −${R}` : ""}`] });
  }
  ok.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  // 강수 사건 하나로 모으기(지금 비·출퇴근 비 등): 같은 mergeGroup 은 점수 높은 하나 + related
  const merged = [];
  const groups = new Map();
  for (const c of ok) {
    if (!c.mergeGroup) { merged.push(c); continue; }
    const g = groups.get(c.mergeGroup);
    if (!g) { const m = { ...c, related: [] }; groups.set(c.mergeGroup, m); merged.push(m); continue; }
    g.related.push({ key: c.key, ruleId: c.ruleId, title: c.title, text: c.text });
    dropped.push({ key: c.key, reason: `같은 강수 사건으로 묶음(${g.key})` });
  }
  // 주제: 1개, 다른 생활 결정이면 2개까지
  const out = [];
  const byTopic = new Map();
  const later = [];
  for (const c of merged) {
    const t = c.topic || c.ruleId;
    const used = byTopic.get(t) || [];
    const sep = c.lifeDecision && !used.some((u) => u.lifeDecision === c.lifeDecision) && used.every((u) => u.lifeDecision);
    if (used.length >= rule.perTopic && !(sep && used.length < rule.perTopicSeparateDecision)) { dropped.push({ key: c.key, reason: `같은 주제(${t}) 중복` }); continue; }
    if (out.length >= rule.max) { later.push(c); continue; }
    used.push(c); byTopic.set(t, used);
    out.push(c);
  }
  // 생활 슬롯: 생활 후보가 있는데 하나도 못 들어갔으면 가장 낮은 비생활 이야기와 바꿈
  const lifeIn = out.some((c) => c.lifeSlot);
  const lifeBest = later.find((c) => c.lifeSlot);
  if (!lifeIn && lifeBest && out.length >= rule.max) {
    let j = -1;
    for (let i = out.length - 1; i >= 0; i--) if (!out[i].lifeSlot) { j = i; break; }
    if (j >= 0) { dropped.push({ key: out[j].key, reason: "생활 슬롯 확보로 밀림" }); out[j] = { ...lifeBest, reasons: [...lifeBest.reasons, "생활 슬롯"] }; later.splice(later.indexOf(lifeBest), 1); }
  }
  for (const c of later) dropped.push({ key: c.key, reason: "개수 제한" });
  // 대표(첫 카드): 지금·가까운 미래(T ≥ leadMinT) 중 점수 가장 높은 것 — 며칠 지난 기록이 앞에 서지 않게
  out.sort((a, b) => b.score - a.score);
  const li = out.findIndex((c) => (c.parts?.T ?? 0) >= rule.leadMinT);
  if (li > 0) out.unshift(...out.splice(li, 1));
  return { stories: out, dropped, rule };
}
