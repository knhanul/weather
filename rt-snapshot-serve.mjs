// astra 5단계(12-4): 완료된 스냅샷을 응답으로 낼 때의 순수 함수 — 입력 지문·source_rev·유효성(지연 상태를 응답 시각으로 다시 판정)·응답 꾸밈.
import { createHash } from "node:crypto";

const H = 3600000, KST = 9 * H;
// 다음 KST 정시(밀리초) — 자정·생활 구간 경계(출근 7·낮 12·퇴근 18·밤 21시 등)는 모두 정시
export const nextHourMs = (ms) => Math.floor((ms + KST) / H + 1) * H - KST;
// 'YYYY-MM-DD HH:MM[:SS]' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD HH:MM:SS'(비교용). 없으면 null
export function normWall(w) {
  if (!w) return null;
  const s = String(w).replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 23:59:59`; // 그날 자료 = 그날 끝까지
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4] || "00"}` : null;
}
// 입력 자료·발표 시각(지점 하나) → sources(항목별) · cutoff(가장 새 입력 시각) · fp(입력 지문)
export function sourcesOf({ today, forecast, dailyLast = null, rulesVersion = "", extra = "" }) {
  const T = today || {}, F = forecast || {};
  const sources = {
    ncst: T.current?.time || null,
    ultra: T.releases?.ultra?.base || F.releases?.ultra?.base || null,
    vilage: F.releases?.vilage?.base || T.releases?.vilage?.base || null,
    midTa: F.releases?.midTa || null,
    midLand: F.releases?.midLand || null,
    outlook: F.outlook?.tmFc || null,
    asosHourly: T.asos?.lastDay || null,
    asosDaily: dailyLast || null,
  };
  const ws = Object.values(sources).map(normWall).filter(Boolean).sort();
  const cutoff = ws.at(-1) || "0000-00-00 00:00:00";
  const fp = createHash("sha1").update(JSON.stringify({ sources, rulesVersion, extra })).digest("hex");
  return { sources, cutoff, fp };
}
// 저장 때의 지연 상태(fresh/stale) — 응답 때 같은 기준으로 다시 판정해 달라지면 스냅샷을 쓰지 않음(요청 계산으로)
export function freshInputs(today, STALE_MIN) {
  const T = today || {};
  const out = {};
  if (T.current?.time && T.current.freshness) out.ncst = { base: T.current.time, lim: STALE_MIN.NCST, state: T.current.freshness.state };
  if (T.releases?.ultra) out.ultra = { base: T.releases.ultra.base, lim: STALE_MIN.ULTRA, state: T.releases.ultra.freshness?.state };
  if (T.releases?.vilage) out.vilage = { base: T.releases.vilage.base, lim: STALE_MIN.VILAGE, state: T.releases.vilage.freshness?.state };
  return out;
}
export function invalidReason(e, nowMs, freshness) {
  if (!e) return "missing";
  if (e.expiresMs <= nowMs) return "expired";
  for (const [k, f] of Object.entries(e.fresh || {})) if (freshness(f.base, nowMs, f.lim).state !== f.state) return `freshness-${k}`;
  return null;
}
// 응답 꾸밈: 지연 문구(n분 전)는 응답 시각으로 다시 계산, 스냅샷 판·발행·만료 시각을 붙임(원본 객체는 바꾸지 않음)
export function decorate(kind, payload, meta, nowMs, freshness, STALE_MIN) {
  const p = { ...payload };
  const rf = (rel, lim) => (rel?.base ? { ...rel, freshness: freshness(rel.base, nowMs, lim) } : rel);
  if (kind === "today" || kind === "forecast") {
    if (p.releases) p.releases = { ...p.releases, ultra: rf(p.releases.ultra, STALE_MIN.ULTRA), vilage: rf(p.releases.vilage, STALE_MIN.VILAGE), ...(p.releases.midTa ? { midTaFreshness: freshness(p.releases.midTa, nowMs, 13 * 60) } : {}) };
  }
  if (kind === "today" && p.current?.time && p.current.freshness) p.current = { ...p.current, freshness: freshness(p.current.time, nowMs, STALE_MIN.NCST) };
  if (kind === "forecast" && p.outlook?.tmFc && p.outlook.freshness) p.outlook = { ...p.outlook, freshness: freshness(p.outlook.tmFc, nowMs, 13 * 60) };
  const iso = (ms) => new Date(ms + KST).toISOString().slice(0, 16).replace("T", " ");
  // 나이(초)는 넣지 않음 — 본문이 매초 바뀌면 ETag(지점·기준·스냅샷 판 + 신선도 분 단위)가 쓸모없어짐
  // 'now'(응답 기준 시각)은 응답 때 시각으로 — 계산 시각은 snapshot.publishedAt
  if (typeof p.now === "string" && p.now.length === 16) p.now = iso(nowMs);
  p.snapshot = { version: meta.version, publishedAt: iso(meta.publishedMs), expiresAt: iso(meta.expiresMs), sourceRev: meta.sourceRev, served: "snapshot" };
  return p;
}
