// 공유 경로(서버가 읽는 주소): 해시 주소(#/stories/...)는 링크 미리보기 봇이 못 읽으므로 따로 둔다.
//   GET /s/day?<날짜 화면과 같은 조건>     → HTML(og:title·og:description = 서버 계산 숫자) + 사람은 #/stories/day?... 로 바로 이동
//   GET /s/day.svg?...                     → 같은 숫자로 그린 '이날의 날씨 카드' SVG(1080×1350, 브라우저 PNG 저장과 같은 배치)
//   GET /s/battle?cases=...  · /s/battle.svg?cases=...  → 배틀 카드
// og:image 는 정적 PNG(/brand/og.png): 메신저·SNS 미리보기는 대부분 SVG 를 받지 않고, 서버 PNG 래스터화에는 글꼴·네이티브 모듈이 필요해 넣지 않았다.
// 사용자 입력(별칭)은 HTML·SVG 모두 이스케이프하고 30자로 자른다. 숫자는 date-api 의 같은 계산·캐시(dayBody·battleBody)에서만 가져온다.
import { daySpec, battleSpec, layout, toSvg, fmt, selDateText } from "./public/share-card.mjs";
import { StatsError } from "./stats-engine.mjs";

const ORIGIN = process.env.PUBLIC_ORIGIN || "https://weather.nuni.co.kr";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 30);
// 화면 주소로 넘길 조건(허용한 키만, 순서 고정)
const DAY_KEYS = ["station", "cal", "date", "m", "d", "leap", "year", "cmp", "period", "to", "from", "alias"];
const BATTLE_KEYS = ["cases", "period", "to", "from", "ds", "labels"];
const pick = (q, keys) => { const o = new URLSearchParams(); for (const k of keys) { const v = q.get(k); if (v != null && v !== "") o.set(k, k === "alias" ? clean(v) : String(v).slice(0, 200)); } return o; };

export function dayOg(D, alias = "") {
  const stn = D.station;
  const title = `${alias ? `${alias} · ` : ""}${selDateText(D)}의 날씨 — ${stn.station_name} ${D.window.label}`;
  const parts = [];
  const rc = D.counts?.rules.find((c) => c.id === "rain");
  if (rc && rc.n) parts.push(`이날 비·눈 온 해 ${rc.k}번(${rc.n}개 해 중)`);
  for (const c of (D.counts?.rules || []).filter((x) => x.id !== "rain" && x.show && x.n).slice(0, 2)) parts.push(`${c.label} ${c.k}번`);
  const A = D.around?.metrics;
  if (A && A.avg.n) parts.push(`앞뒤 15일 평균기온 ${fmt(A.avg.mean)}℃·강수일 ${fmt(A.rainDays.share, 0)}%(${A.avg.n}개 해)`);
  if (!parts.length) parts.push("자료 부족");
  return { title, desc: `${parts.join(" · ")} — 기상청 ASOS 공식 일자료, 해마다 그 날짜의 과거 관측(예보 아님)` };
}
export function battleOg(B, labels = []) {
  const name = (c, i) => labels[i] || c.specLabel;
  const title = `날씨 배틀: ${B.cases.map(name).join(" vs ")} — ${B.window.label}`;
  const parts = [];
  const r = (B.counts || []).find((c) => c.id === "rain");
  if (r && r.n) parts.push(`비·눈 온 해 ${r.results.map((x) => `${x.case} ${x.k}번`).join(" · ")} (공통 ${r.n}개 해)`);
  const t = (B.tallies || []).find((x) => x.id === "avg");
  if (t && t.n) parts.push(`더 따뜻했던 해 ${t.results.map((x) => `${x.case} ${x.k}번`).join(" · ")} · 같음 ${t.ties}번`);
  const a = B.around?.metrics?.avg;
  if (a && a.n) parts.push(`앞뒤 15일 평균기온 ${a.results.map((x) => `${x.case} ${fmt(x.mean)}℃`).join(" · ")}`);
  if (!parts.length) parts.push("공통으로 비교할 연도가 없습니다");
  return { title, desc: `${parts.join(" · ")} — 기상청 ASOS 공식 일자료, 해마다 그날 실제 관측` };
}
export function shareHtml({ title, desc, url, target, svg }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 이날</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="이날">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${ORIGIN}/brand/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${ORIGIN}/brand/og.png">
<link rel="canonical" href="${esc(url)}"><meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{margin:0;padding:24px;background:#f4f8ff;color:#0d1b3d;font:15px/1.6 Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;text-align:center}img{max-width:min(420px,100%);height:auto;border-radius:16px;box-shadow:0 6px 24px #0d1b3d22}a{color:#026ef8;font-weight:700}</style>
</head><body><p><a href="${esc(target)}">이날에서 보기 ›</a></p><p>${esc(desc)}</p><p><img src="${esc(svg)}" alt="${esc(title)}" width="1080" height="1350"></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script></body></html>`;
}

export function createShareApi({ dateApi, log = () => {} }) {
  const send = (res, status, type, body, cache = "public, max-age=600") => { res.writeHead(status, { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff" }); res.end(body); };
  async function day(url, res, asSvg) {
    const q = url.searchParams;
    const api = new URLSearchParams(q);
    api.set("part", "daily");
    if (q.get("year") && !q.get("years")) api.set("years", [q.get("year"), ...String(q.get("cmp") || "").split(",").filter(Boolean)].join(","));
    const D = await dateApi.dayBody(api);
    const alias = clean(q.get("alias"));
    const keep = pick(q, DAY_KEYS);
    if (asSvg) return send(res, 200, "image/svg+xml; charset=utf-8", toSvg(layout(daySpec(D, { alias })), dayOg(D, alias).title));
    const og = dayOg(D, alias);
    return send(res, 200, "text/html; charset=utf-8", shareHtml({ ...og, url: `${ORIGIN}/s/day?${keep}`, target: `/#/stories/day?${keep}`, svg: `/s/day.svg?${keep}` }));
  }
  async function battle(url, res, asSvg) {
    const q = url.searchParams;
    const api = new URLSearchParams();
    for (const k of ["cases", "period", "to", "from"]) if (q.get(k)) api.set(k, q.get(k));
    api.set("part", "summary");
    const B = await dateApi.battleBody(api);
    const labels = String(q.get("labels") || "").split(",").map((s) => { try { return clean(decodeURIComponent(s)); } catch { return ""; } });
    const keep = pick(q, BATTLE_KEYS);
    if (asSvg) return send(res, 200, "image/svg+xml; charset=utf-8", toSvg(layout(battleSpec(B, { labels })), battleOg(B, labels).title));
    const og = battleOg(B, labels);
    return send(res, 200, "text/html; charset=utf-8", shareHtml({ ...og, url: `${ORIGIN}/s/battle?${keep}`, target: `/#/stories/battle?${keep}`, svg: `/s/battle.svg?${keep}` }));
  }
  const ROUTES = { "/s/day": [day, false], "/s/day.svg": [day, true], "/s/battle": [battle, false], "/s/battle.svg": [battle, true] };
  return async function handleShare(req, res, url) {
    const r = ROUTES[url.pathname];
    if (!r) return false;
    if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, "text/plain; charset=utf-8", "GET only", "no-store"); return true; }
    try { await r[0](url, res, r[1]); }
    catch (err) {
      if (!(err instanceof StatsError)) log(`share failed ${url.pathname} ${err?.message}`);
      const msg = err instanceof StatsError ? err.message : "카드를 만들지 못했습니다";
      // 조건이 잘못돼도 사람은 화면으로 보내 고칠 수 있게
      const target = url.pathname.startsWith("/s/battle") ? "/#/stories/battle" : "/#/stories/day";
      if (r[1]) send(res, err instanceof StatsError ? err.status || 400 : 500, "text/plain; charset=utf-8", msg, "no-store");
      else send(res, err instanceof StatsError ? err.status || 400 : 500, "text/html; charset=utf-8", shareHtml({ title: "이날 · 날씨 이야기", desc: msg, url: `${ORIGIN}${target}`, target, svg: "/brand/og.png" }), "no-store");
    }
    return true;
  };
}
