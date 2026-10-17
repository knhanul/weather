// 이날 공유 카드(PNG·SVG) — 브라우저와 서버가 같이 쓰는 순수 모듈(ESM, 의존성 없음).
// 숫자·문장은 모두 서버 API 응답(date-weather · date-battle · rt 이야기)에서 그대로 가져온다. 카드에서 다시 계산하지 않음(반올림만).
// layout(spec) → 그리기 목록(ops) 하나 → toSvg(ops) (서버 /s/*.svg) · drawCanvas(ctx, ops) (브라우저 PNG 저장). 글자 폭은 둘 다 같은 근사로 자른다.
export const CARD_W = 1080;
export const CARD_H = 1350;
export const CARD_VERSION = "share-card.2026-10-18.v1";
export const FONT = "Pretendard, 'Pretendard Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', sans-serif";
export const SITE = "weather.nuni.co.kr";
const CASE_COLORS = { A: "#2563eb", B: "#e8590c", C: "#0f766e", D: "#9333ea" };

const fin = (v) => typeof v === "number" && Number.isFinite(v);
export function fmt(v, d = 1) {
  if (!fin(v)) return "–";
  const r = Math.round(v * 10 ** d + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** d;
  return r.toFixed(d);
}
const dot = (ymd) => (ymd ? `${+ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

// 글자 폭 근사(em): 한글·전각 1.0, 영숫자·기호 0.58, 공백 0.3
export function textUnits(s) {
  let u = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    u += c === 32 ? 0.3 : c > 0x2e80 ? 1 : c >= 0x41 && c <= 0x5a ? 0.66 : 0.58;
  }
  return u;
}
export function clip(s, size, maxW) {
  const str = String(s ?? "");
  if (textUnits(str) * size <= maxW) return str;
  let out = "";
  for (const ch of str) { if ((textUnits(out + ch) + 1) * size > maxW) break; out += ch; }
  return `${out}…`;
}
// 줄바꿈(단어 단위, 한글은 글자 단위로도) — 최대 lines 줄
export function wrap(s, size, maxW, lines = 3) {
  const words = String(s ?? "").split(/(\s+)/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (textUnits(cur + w) * size <= maxW) { cur += w; continue; }
    if (cur.trim()) out.push(cur.trim());
    cur = w.trimStart();
    while (textUnits(cur) * size > maxW) { // 긴 낱말
      let part = "";
      for (const ch of cur) { if (textUnits(part + ch) * size > maxW) break; part += ch; }
      out.push(part); cur = cur.slice(part.length);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  if (out.length > lines) { const keep = out.slice(0, lines); keep[lines - 1] = clip(`${keep[lines - 1]} ${out[lines]}`, size, maxW); return keep; }
  return out;
}

// ---------------------------------------------------------------- 공통 배치
// spec: { kind, eyebrow, title, subtitle, chips:[..], rows:[{label, value, note, color}], table?:{cols:[{id,label,color}], rows:[{label, values:[..], note}]}, story?, foot:[..], accent }
export function layout(spec) {
  const W = CARD_W, H = CARD_H, P = 72;
  const ops = [];
  const accent = spec.accent || "#026ef8";
  const tl = wrap(spec.title, 56, W - P * 2, 2);
  const bandH = 300 + (tl.length - 1) * 64;
  ops.push({ t: "rect", x: 0, y: 0, w: W, h: H, fill: "#f4f8ff" });
  ops.push({ t: "rect", x: 0, y: 0, w: W, h: bandH, fill: accent });
  ops.push({ t: "rect", x: 0, y: bandH - 10, w: W, h: 10, fill: "#0d1b3d", o: 0.08 });
  // 브랜드
  ops.push({ t: "circle", x: P + 22, y: 82, r: 22, fill: "#fff" });
  ops.push({ t: "text", x: P + 22, y: 91, s: 22, w: 800, fill: accent, a: "middle", v: "이" });
  ops.push({ t: "text", x: P + 58, y: 92, s: 28, w: 800, fill: "#fff", v: "이날" });
  ops.push({ t: "text", x: P + 126, y: 92, s: 22, w: 500, fill: "#fff", o: 0.85, v: clip(spec.eyebrow || "이야기가 있는 날씨", 22, W - P * 2 - 130) });
  // 제목
  tl.forEach((line, i) => ops.push({ t: "text", x: P, y: 178 + i * 64, s: 56, w: 800, fill: "#fff", v: line }));
  let y = 178 + (tl.length - 1) * 64 + 54;
  if (spec.subtitle) { ops.push({ t: "text", x: P, y, s: 26, w: 500, fill: "#fff", o: 0.92, v: clip(spec.subtitle, 26, W - P * 2) }); }
  y = bandH + 40;
  // 칩(지점·기간·표본)
  let cx = P;
  for (const c of spec.chips || []) {
    const label = clip(c, 22, 600);
    const w = textUnits(label) * 22 + 36;
    if (cx + w > W - P) { cx = P; y += 54; }
    ops.push({ t: "rect", x: cx, y, w, h: 42, r: 21, fill: "#fff", stroke: "#cfe0fb" });
    ops.push({ t: "text", x: cx + 18, y: y + 29, s: 22, w: 600, fill: "#28406e", v: label });
    cx += w + 10;
  }
  y += 72;
  // 이야기 문장(선택)
  if (spec.story) {
    const sl = wrap(spec.story, 34, W - P * 2 - 56, 4);
    const h = sl.length * 48 + 56;
    ops.push({ t: "rect", x: P, y, w: W - P * 2, h, r: 24, fill: "#fff", stroke: "#dbe6f7" });
    ops.push({ t: "rect", x: P, y: y + 24, w: 8, h: h - 48, r: 4, fill: accent });
    sl.forEach((line, i) => ops.push({ t: "text", x: P + 36, y: y + 64 + i * 48, s: 34, w: 700, fill: "#0d1b3d", v: line }));
    y += h + 24;
  }
  const foot = spec.foot || [];
  const footTop = H - 64 - (foot.length - 1) * 32 - 44 - 24; // 바닥 구분선 위 여백
  // 숫자 줄: 남은 높이에 맞춰 줄 높이를 줄인다(최소 72)
  const rows = spec.rows || [];
  if (rows.length) {
    const rh = Math.max(52, Math.min(112, Math.floor((footTop - y - 20) / rows.length)));
    const showNote = rh >= 84; // 좁으면 보조 글은 빼고 값만
    const boxH = rows.length * rh + 20;
    ops.push({ t: "rect", x: P, y, w: W - P * 2, h: boxH, r: 24, fill: "#fff", stroke: "#dbe6f7" });
    rows.forEach((r, i) => {
      const ry = y + 10 + i * rh;
      if (i) ops.push({ t: "line", x1: P + 28, y1: ry, x2: W - P - 28, y2: ry, stroke: "#e6edf8" });
      if (r.color) ops.push({ t: "circle", x: P + 44, y: ry + rh / 2 - 4, r: 10, fill: r.color });
      const lx = P + (r.color ? 68 : 32);
      const note = showNote ? r.note : "";
      ops.push({ t: "text", x: lx, y: ry + rh / 2 - (note ? 6 : -10), s: 28, w: 600, fill: "#28406e", v: clip(r.label, 28, 460) });
      if (note) ops.push({ t: "text", x: lx, y: ry + rh / 2 + 30, s: 21, w: 500, fill: "#6b7a99", v: clip(r.note, 21, 520) });
      ops.push({ t: "text", x: W - P - 32, y: ry + rh / 2 + (rh < 84 ? 12 : 14), s: rh < 84 ? 34 : r.value && textUnits(r.value) > 9 ? 34 : 44, w: 800, fill: "#0d1b3d", a: "end", v: clip(r.value, 44, 420) });
    });
    y += boxH + 24;
  }
  // 비교 표(배틀)
  if (spec.table) {
    const t = spec.table;
    const n = t.cols.length;
    const labelW = 300;
    const colW = (W - P * 2 - labelW - 32) / n;
    const rh = Math.max(60, Math.min(92, Math.floor((footTop - y - 82 - (t.legend ? t.legend.length * 34 + 16 : 0)) / t.rows.length)));
    const boxH = 70 + t.rows.length * rh + 12;
    ops.push({ t: "rect", x: P, y, w: W - P * 2, h: boxH, r: 24, fill: "#fff", stroke: "#dbe6f7" });
    t.cols.forEach((c, i) => {
      const x = P + labelW + i * colW + colW / 2;
      ops.push({ t: "rect", x: x - 34, y: y + 20, w: 68, h: 36, r: 18, fill: c.color });
      ops.push({ t: "text", x, y: y + 46, s: 22, w: 800, fill: "#fff", a: "middle", v: c.id });
    });
    t.rows.forEach((r, ri) => {
      const ry = y + 70 + ri * rh;
      ops.push({ t: "line", x1: P + 24, y1: ry, x2: W - P - 24, y2: ry, stroke: "#e6edf8" });
      ops.push({ t: "text", x: P + 28, y: ry + rh / 2 + (r.note ? -4 : 9), s: 25, w: 600, fill: "#28406e", v: clip(r.label, 25, labelW - 36) });
      if (r.note) ops.push({ t: "text", x: P + 28, y: ry + rh / 2 + 26, s: 19, w: 500, fill: "#6b7a99", v: clip(r.note, 19, labelW - 36) });
      r.values.forEach((v, i) => {
        const x = P + labelW + i * colW + colW / 2;
        ops.push({ t: "text", x, y: ry + rh / 2 + 12, s: n > 3 ? 28 : 34, w: r.best === i ? 800 : 700, fill: r.best === i ? t.cols[i].color : "#0d1b3d", a: "middle", v: clip(v, n > 3 ? 28 : 34, colW - 12) });
      });
    });
    y += boxH + 24;
    if (t.legend) t.legend.forEach((l, i) => { ops.push({ t: "text", x: P, y: y + 8 + i * 34, s: 22, w: 600, fill: t.cols[i]?.color || "#28406e", v: clip(l, 22, W - P * 2) }); });
  }
  // 바닥: 출처·기준
  const fy = H - 64 - (foot.length - 1) * 32;
  ops.push({ t: "line", x1: P, y1: fy - 44, x2: W - P, y2: fy - 44, stroke: "#cfdcf0" });
  foot.forEach((f, i) => ops.push({ t: "text", x: P, y: fy + i * 32, s: 21, w: i === foot.length - 1 ? 700 : 500, fill: i === foot.length - 1 ? accent : "#52617f", v: clip(f, 21, W - P * 2) }));
  return { w: W, h: H, ops };
}

const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
export function toSvg({ w, h, ops }, title = "") {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${xmlEsc(FONT)}">`];
  if (title) out.push(`<title>${xmlEsc(title)}</title>`);
  for (const o of ops) {
    const op = o.o != null ? ` opacity="${o.o}"` : "";
    if (o.t === "rect") out.push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"${o.r ? ` rx="${o.r}"` : ""} fill="${o.fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="2"` : ""}${op}/>`);
    else if (o.t === "circle") out.push(`<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="${o.fill}"${op}/>`);
    else if (o.t === "line") out.push(`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="2"/>`);
    else if (o.t === "text") out.push(`<text x="${o.x}" y="${o.y}" font-size="${o.s}" font-weight="${o.w || 400}" fill="${o.fill}"${o.a ? ` text-anchor="${o.a}"` : ""}${op}>${xmlEsc(o.v)}</text>`);
  }
  out.push("</svg>");
  return out.join("");
}
export function drawCanvas(ctx, { ops }) {
  const rr = (o) => { ctx.beginPath(); if (o.r && ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.h, o.r); else ctx.rect(o.x, o.y, o.w, o.h); };
  for (const o of ops) {
    ctx.save();
    ctx.globalAlpha = o.o ?? 1;
    if (o.t === "rect") { rr(o); ctx.fillStyle = o.fill; ctx.fill(); if (o.stroke) { ctx.lineWidth = 2; ctx.strokeStyle = o.stroke; ctx.stroke(); } }
    else if (o.t === "circle") { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fillStyle = o.fill; ctx.fill(); }
    else if (o.t === "line") { ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.lineWidth = 2; ctx.strokeStyle = o.stroke; ctx.stroke(); }
    else if (o.t === "text") { ctx.font = `${o.w || 400} ${o.s}px ${FONT}`; ctx.fillStyle = o.fill; ctx.textAlign = o.a === "middle" ? "center" : o.a === "end" ? "right" : "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(o.v, o.x, o.y); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 날짜로 보는 날씨 카드(/api/stats/date-weather part=daily 응답)
const nOf = (m) => `${m.n}개 해${m.eligible !== m.n ? ` / 대상 ${m.eligible}` : ""}`;
const tierNote = (m) => (m.tier === "reference" ? " · 참고" : m.limited ? " · 자료 제한" : "");
// v2: 해마다 그날의 '횟수'(평균 없음) + 앞뒤 15일 통계(표본 해·유효일 함께). 고른 해 그날 값은 story 줄.
export function selDateText(D) {
  const s = D.selected?.[0];
  if (!s) return D.specLabel;
  if (!s.solarDate) return `${s.referenceYear}년 ${D.specLabel.replace(/^양력 /, "")}`;
  const lunar = D.spec?.calendar === "lunar" && s.lunarText ? ` · ${s.lunarText}` : "";
  return `${dot(s.solarDate)}(${dow(s.solarDate)})${lunar}`;
}
export function daySpec(D, { alias = "" } = {}) {
  const stn = D.station;
  const rows = [];
  const C = D.counts;
  const rc = C?.rules.find((c) => c.id === "rain");
  const baseN = rc ? rc.n : null;
  if (C) {
    // 카드가 좁아 보조 글이 빠질 수 있으므로 표본은 위 칩(자료 있는 해 N)에 두고, N 이 다른 줄만 이름 뒤에 붙인다
    for (const c of C.rules.filter((x) => x.show).slice(0, 3)) rows.push({ label: `이날 ${c.label}${c.n !== baseN ? ` (${c.n}개 해 중)` : ""}`, value: c.n ? `${c.k}번` : "자료 부족", note: c.n ? `자료가 있는 ${c.n}개 해 중${c.tier === "reference" ? " · 참고" : c.limited ? " · 자료 제한" : ""} · ${c.cond}` : "자료가 있는 해 없음" });
  }
  const A = D.around?.metrics;
  const aN = A ? A.avg.n : null;
  if (A) {
    const nn = (m) => `${m.n}개 해 · 유효 ${m.validDays}일${m.tier === "reference" ? " · 참고" : m.limited ? " · 자료 제한" : ""}`;
    const add = (label, m, val) => rows.push({ label: `${label}${m.n !== aN ? ` (${m.n}개 해)` : ""}`, value: m.n ? val : "자료 부족", note: m.n ? nn(m) : "자료가 있는 해 없음" });
    add("앞뒤 15일 평균기온", A.avg, `${fmt(A.avg.mean)}℃`);
    add("앞뒤 15일 강수일 비율", A.rainDays, `${fmt(A.rainDays.share, 0)}%`);
    add("앞뒤 15일 하루 평균 강수량", A.rainSum, `${fmt(A.rainSum.perDay)}mm`);
  }
  const s = D.selected?.[0];
  let sel = "";
  if (s && s.dateStatus === "ok" && s.rowPresent) {
    const v = s.values;
    sel = `${selDateText(D)} 그날: 최고 ${fin(v.max) ? `${fmt(v.max)}℃` : "자료 없음"} · 최저 ${fin(v.min) ? `${fmt(v.min)}℃` : "자료 없음"} · 강수 ${fin(v.rain) ? `${fmt(v.rain)}mm` : "자료 없음"}`;
  } else if (s) sel = `${selDateText(D)}: ${D.statusText?.[s.dateStatus] || (s.dateStatus === "ok" ? "자료 없음" : s.dateStatus)}`;
  const title = alias ? `${alias}` : `${selDateText(D)}의 날씨`;
  const chips = [`${stn.station_name} (${stn.station_id})`, D.window.label];
  if (baseN != null) chips.push(`이날 자료 있는 해 ${baseN}/${D.dateCounts.requested}`);
  if (A) chips.push(`앞뒤 15일 ${aN}개 해 · 유효 ${A.avg.validDays}일`);
  return {
    kind: "day", accent: "#026ef8", eyebrow: "날짜로 보는 날씨",
    title, subtitle: `해마다 ${D.specLabel} · 과거 관측(예보 아님)`,
    chips, rows, story: sel || null,
    foot: [`출처 기상청 ASOS 공식 일자료 · 관측지점 한 곳 · 횟수 = 자료가 있는 해 중 조건을 만족한 해`, `앞뒤 15일 = 해마다 그 날짜 ±15일(31일) · ${D.today} 기준`, `이날 · ${SITE}`],
  };
}
// ---------------------------------------------------------------- 배틀 카드(/api/stats/date-battle part=summary 응답)
export function battleSpec(B, { labels = [] } = {}) {
  const ids = B.cases.map((c) => c.id);
  const cols = ids.map((id) => ({ id, label: id, color: CASE_COLORS[id] }));
  const keys = ["avg", "max", "min", "rain_days", "rain_mean", "wind", ...(B.metrics.sun ? ["sun"] : [])];
  const rows = keys.filter((k) => B.metrics[k]).map((k) => {
    const m = B.metrics[k];
    const cmp = m.comparison || {};
    let best = null;
    if (cmp.badges && cmp.more) best = ids.indexOf(cmp.more);
    else if (cmp.badges && cmp.ranks) { const r1 = cmp.ranks.filter((r) => r.rank === 1); if (r1.length === 1) best = ids.indexOf(r1[0].case); }
    const unit = m.unit === "개 해" ? "" : m.unit;
    return { label: m.label, note: m.tier === "none" ? "공통 연도 없음" : `공통 ${m.n}개 해${m.tier === "reference" ? " · 참고" : m.limited ? " · 자료 제한" : ""}`, values: m.results.map((r) => (m.tier === "none" || !fin(r.value) ? "–" : `${fmt(r.value, m.digits)}${unit}`)), best };
  });
  const stName = (id) => B.stations.find((s) => s.id === id)?.station_name || "";
  const legend = B.cases.map((c, i) => `${c.id}  ${labels[i] ? `${labels[i]} · ` : ""}${c.specLabel}${B.differentStations ? ` · ${stName(c.id)}` : ""}`);
  const st0 = B.stations[0];
  return {
    kind: "battle", accent: "#0d1b3d", eyebrow: "날씨 배틀",
    title: B.cases.map((c, i) => labels[i] || c.specLabel.replace(/^양력 /, "")).join(" vs "),
    subtitle: "서로 자료가 있는 같은 기준연도끼리만 비교 · 종합 승자 없음",
    chips: [B.differentStations ? "카드마다 다른 관측지점" : `${st0.station_name} (${st0.station_id})`, B.window.label, ...(B.mixedCalendars ? ["양력·음력 혼합"] : [])],
    table: { cols, rows, legend },
    foot: [`출처 기상청 ASOS 공식 일자료 · 색 글자 = 공통 3개 해 이상에서 가장 큰 값(좋고 나쁨 아님)`, `강수일수 = 일강수량 0.1mm 이상인 해의 수 · ${B.today} 기준`, `이날 · ${SITE}`],
  };
}
// ---------------------------------------------------------------- 오늘 날씨 이야기 카드(rt 이야기 객체)
// story: { title, text|body, numbers?:[{label,value,note}] }, ctx: { stationName, stationId, asOf, basisLabel }
export function storySpec(story, ctx = {}) {
  const rows = (story.numbers || []).slice(0, 5).map((n) => ({ label: n.label, value: n.value, note: n.note || "" }));
  return {
    kind: "story", accent: "#0f766e", eyebrow: "오늘 날씨 이야기",
    title: story.title || "오늘의 이야기",
    subtitle: ctx.subtitle || "",
    chips: [ctx.stationName ? `${ctx.stationName}${ctx.stationId ? ` (${ctx.stationId})` : ""}` : "", ctx.asOf ? `${ctx.asOf} 기준` : "", ctx.basisLabel || ""].filter(Boolean),
    story: story.text || story.body || "", rows,
    foot: [ctx.sourceLine || "출처 기상청 ASOS 관측·단기예보 · 비교 기준은 같은 지점 과거 관측", ctx.note || "숫자는 화면과 같은 서버 계산 결과입니다", `이날 · ${SITE}`],
  };
}

// ---------------------------------------------------------------- 브라우저: PNG 만들기·저장·공유
export async function toPngBlob(spec, scale = 1) {
  const L = layout(spec);
  const c = document.createElement("canvas");
  c.width = L.w * scale; c.height = L.h * scale;
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  try { if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(`800 40px Pretendard`, "이날가"), document.fonts.load(`500 22px Pretendard`, "이날가")]); } catch {}
  drawCanvas(ctx, L);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했습니다"))), "image/png"));
}
export const safeName = (s) => String(s || "inal").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60);
