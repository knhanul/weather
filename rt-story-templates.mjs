// 문장 틀 고르기와 차이 표현(astra 지침 7·8장). 순수 함수 — 숫자는 facts 에서만, 같은 날·같은 사건이면 같은 문장.
import { DIFF_LEVELS, RAIN_PCT_LEVELS, TEMPLATE_VERSION } from "./rt-story-rules.mjs";

// FNV-1a 32비트(고정 해시 — 바꾸면 TEMPLATE_VERSION 을 올림)
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
// hash(station + KST 날짜 + ruleId + eventId + templateVersion) % 틀 수
export function pickTemplate({ station, date, ruleId, eventId, templateVersion = TEMPLATE_VERSION }, templates, facts = {}) {
  const list = (templates || []).filter((t) => !t.when || t.when(facts));
  if (!list.length) return null;
  const i = fnv1a32(`${station}|${date}|${ruleId}|${eventId}|${templateVersion}`) % list.length;
  return list[i];
}
// 틀 채우기: {name} 자리에 facts 값. 값이 없으면(null/undefined/NaN) 그 틀은 쓰지 않음(null 반환)
export function fill(text, facts) {
  let bad = false;
  const out = String(text).replace(/\{(\w+)\}/g, (_, k) => {
    const v = facts[k];
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) { bad = true; return ""; }
    return String(v);
  });
  return bad ? null : out;
}
// 틀 목록에서 결정적으로 하나 골라 채움. 고른 틀에 빈 값이 있으면 다음 틀(순서 고정)로 넘어감
export function render(key, templates, facts) {
  const list = (templates || []).filter((t) => !t.when || t.when(facts));
  if (!list.length) return null;
  const start = fnv1a32(`${key.station}|${key.date}|${key.ruleId}|${key.eventId}|${key.templateVersion ?? TEMPLATE_VERSION}`) % list.length;
  for (let j = 0; j < list.length; j++) {
    const t = list[(start + j) % list.length];
    const title = fill(t.title, facts);
    const text = t.text == null ? "" : fill(t.text, facts);
    if (title != null && text != null) return { templateId: `${key.ruleId}.${t.id}.v${key.templateVersion ?? TEMPLATE_VERSION}`, title, text };
  }
  return null;
}

const LEVEL_WORD = { similar: "비슷", slight: "조금", notable: "꽤", large: "상당히" };
const DIR_WORD = {
  ta: { up: "높", down: "낮" },
  hm: { up: "높", down: "낮" },
  ws: { up: "강하", down: "약하" },
};
// 평균 대비 차이 → 단계(8장). metric: ta|hm|ws. 소수 반올림은 호출 쪽 값 그대로(여기서 숫자를 바꾸지 않음)
// 반환: { metric, delta, abs, unit, level: similar|slight|notable|large, levelWord, direction: up|down|flat, phrase }
export function describeDifference(metric, delta, ctx = {}) {
  if (metric === "rn" || metric === "rain") return describeRain(ctx);
  const L = DIFF_LEVELS[metric];
  if (!L || delta === null || delta === undefined || !Number.isFinite(Number(delta))) return null;
  const d = Number(delta), a = Math.abs(d);
  const level = a < L.similar ? "similar" : a < L.slight ? "slight" : a < L.notable ? "notable" : "large";
  const direction = level === "similar" ? "flat" : d > 0 ? "up" : "down";
  const dw = DIR_WORD[metric] || DIR_WORD.ta;
  const phrase = level === "similar" ? "비슷" : `${LEVEL_WORD[level]} ${direction === "up" ? dw.up : dw.down}음`;
  return { metric, delta: d, abs: a, unit: L.unit, level, levelWord: LEVEL_WORD[level], direction, phrase };
}
// 강수량: 고정 mm 등급 없음. 같은 집계기간 분포의 백분위(ctx.percentile, 0~100)와 표본 조건(ctx.samplesOk)이 있을 때만
function describeRain({ percentile = null, samplesOk = false, mean = null } = {}) {
  if (!samplesOk || percentile == null) return { metric: "rn", level: null, phrase: null, note: "강수 비교 표본 부족 — 양만 표시" };
  const level = percentile >= RAIN_PCT_LEVELS.veryMany ? "veryMany" : percentile >= RAIN_PCT_LEVELS.many ? "many" : null;
  return { metric: "rn", level, percentile, phrase: level === "veryMany" ? "보유 표본에서 매우 많은 편" : level === "many" ? "많은 편" : null, ratio: null, note: mean === 0 ? "평균이 0mm라 배수·증감률을 계산하지 않음" : null };
}
// 생활 문구용: '평소보다 꽤 더워요(+3.2℃)' — 숫자는 그대로 붙임
export function warmWord(delta, { hot = "더워요", cold = "추워요", same = "평소와 비슷해요", prefix = "평소보다" } = {}) {
  const x = describeDifference("ta", delta);
  if (!x) return null;
  if (x.level === "similar") return `${same}(${x.delta > 0 ? "+" : ""}${x.delta}℃)`;
  return `${prefix} ${x.levelWord} ${x.direction === "up" ? hot : cold}(${x.delta > 0 ? "+" : ""}${x.delta}℃)`;
}
