// 공용 날씨 그림(SVG) — 예보 화면(rt-forecast-visual.js)과 오늘 날씨(rt-home.js)가 같은 그림을 씀(astra 2장).
//   그림은 날씨 종류를 알아보는 용도(값 비교는 그래프). 장면 순서: 강수형태(PTY) → 하늘상태(SKY) → 낮/밤.
//   자외선·대기질·일조를 해 그림으로 암시하지 않음, 적설 예보로 쌓인 눈을 그리지 않음. 움직임 없음(자동 회전·애니메이션 없음).
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const night = (h) => h < 6 || h >= 18;
  // 날씨 종류: 강수형태 > 하늘상태(단기) / 중기 wf 글자
  function kind(sky, pty) {
    const t = pty && pty !== "없음" ? pty : sky || "";
    if (!t) return null;
    if (/비\/눈|눈\/비|진눈/.test(t)) return "sleet";
    if (/눈/.test(t)) return "snow";
    if (/소나기/.test(t)) return "shower";
    if (/비|빗방울/.test(t)) return "rain";
    if (/흐/.test(t)) return "cloud";
    if (/구름/.test(t)) return "partly";
    if (/맑/.test(t)) return "clear";
    return null;
  }
  const wfKind = (x) => kind(x.sky || (x.wf || "").split(" / ").pop(), x.wf && /비|눈|소나기/.test(x.wf) ? x.wf.split(" / ").find((s) => /비|눈|소나기/.test(s)) : null);
  // SVG 날씨 그림(크기 s, 중심 0,0 기준 그룹)
  const SUN = (r) => `<circle r="${r}" fill="#ffc531"/>${[...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${(Math.cos(a) * r * 1.35).toFixed(1)}" y1="${(Math.sin(a) * r * 1.35).toFixed(1)}" x2="${(Math.cos(a) * r * 1.75).toFixed(1)}" y2="${(Math.sin(a) * r * 1.75).toFixed(1)}" stroke="#ffb100" stroke-width="${(r / 4).toFixed(1)}" stroke-linecap="round"/>`; }).join("")}`;
  const MOON = (r) => `<path d="M${r * 0.3},${-r} a${r},${r} 0 1,0 ${r * 0.7},${r * 1.55} a${r * 0.85},${r * 0.85} 0 1,1 ${-r * 0.7},${-r * 1.55}z" fill="#f4e7a1"/>`;
  const CLOUD = (s, c = "#fff", o = 1) => `<path d="M${-s},${s * 0.45} h${s * 2} a${s * 0.5},${s * 0.5} 0 0,0 0,${-s} a${s * 0.6},${s * 0.6} 0 0,0 ${-s * 0.75},${-s * 0.45} a${s * 0.75},${s * 0.75} 0 0,0 ${-s * 1.3},${s * 0.2} a${s * 0.55},${s * 0.55} 0 0,0 ${s * 0.05},${s * 1.25}z" fill="${c}" opacity="${o}" stroke="#9fb3cc" stroke-width="${(s / 14).toFixed(2)}"/>`;
  const DROPS = (s, n = 3, c = "#2f7cf6") => [...Array(n)].map((_, i) => `<line x1="${(-s * 0.6 + i * s * 0.6).toFixed(1)}" y1="${s * 0.7}" x2="${(-s * 0.75 + i * s * 0.6).toFixed(1)}" y2="${s * 1.1}" stroke="${c}" stroke-width="${(s / 7).toFixed(1)}" stroke-linecap="round"/>`).join("");
  const FLAKES = (s, n = 3) => [...Array(n)].map((_, i) => `<text x="${(-s * 0.6 + i * s * 0.6).toFixed(1)}" y="${s * 1.15}" font-size="${(s * 0.55).toFixed(1)}" text-anchor="middle" fill="#6aa6ff">✱</text>`).join("");
  function icon(k, isNight, s = 12) {
    const body = isNight ? MOON(s * 0.75) : SUN(s * 0.62);
    switch (k) {
      case "clear": return body;
      case "partly": return `<g transform="translate(${-s * 0.35},${-s * 0.35})">${body}</g><g transform="translate(${s * 0.25},${s * 0.2}) scale(.8)">${CLOUD(s)}</g>`;
      case "cloud": return `<g transform="translate(${s * 0.25},${-s * 0.3}) scale(.7)">${CLOUD(s, "#dfe7f2")}</g>${CLOUD(s, "#eef2f7")}`;
      case "rain": return `${CLOUD(s, "#d6dee9")}${DROPS(s)}`;
      case "shower": return `<g transform="translate(${-s * 0.4},${-s * 0.4}) scale(.7)">${body}</g>${CLOUD(s, "#e3e9f1")}${DROPS(s, 2)}`;
      case "snow": return `${CLOUD(s, "#e6ecf4")}${FLAKES(s)}`;
      case "sleet": return `${CLOUD(s, "#d6dee9")}${DROPS(s, 2)}<text x="${s * 0.55}" y="${s * 1.15}" font-size="${(s * 0.55).toFixed(1)}" text-anchor="middle" fill="#6aa6ff">✱</text>`;
      default: return `<text y="${s * 0.35}" font-size="${s}" text-anchor="middle" fill="#8a9bb5">–</text>`;
    }
  }
  const iconSvg = (k, n, px = 28, label = "") => `<svg viewBox="-16 -16 32 34" width="${px}" height="${px}" style="width:${px}px;height:${px}px" role="img" aria-label="${esc(label || "자료 없음")}">${icon(k, n, 12)}</svg>`;
  // 장면 배경색(종류·밤)
  function sceneBg(k, n) {
    const bg = k === "rain" || k === "shower" || k === "sleet" ? ["#5b6f8c", "#9aaac0"] : k === "snow" ? ["#8ea4c4", "#dbe5f2"] : k === "cloud" ? (n ? ["#2b3954", "#56688a"] : ["#8fa3bf", "#cfdaea"]) : n ? ["#0d1b3d", "#2c4a86"] : ["#3d8cff", "#a9d2ff"];
    const dark = n || k === "rain" || k === "shower" || k === "sleet" || (k === "cloud" && n);
    return { bg, dark };
  }
  // 하늘 장면 SVG(장식 — aria-hidden; 글은 따로 씀). 빗줄기는 그림 안 배경으로만(글자 위를 덮지 않게 오른쪽 그림 영역에 둠)
  function sceneSvg(k, n, { cls = "wa-art", id = "waSky", w = 360, h = 160, at = [285, 62], scale = 3.1 } = {}) {
    const { bg } = sceneBg(k, n);
    const stars = n && (k === "clear" || k === "partly") ? [...Array(14)].map((_, i) => `<circle cx="${(i * 53) % w + 10}" cy="${(i * 37) % 70 + 8}" r="${i % 3 ? 0.9 : 1.4}" fill="#fff" opacity=".8"/>`).join("") : "";
    const rainBg = k === "rain" || k === "shower" || k === "sleet" ? [...Array(26)].map((_, i) => `<line x1="${(i * 29) % (w + 20)}" y1="${(i * 17) % 120}" x2="${(i * 29) % (w + 20) - 5}" y2="${(i * 17) % 120 + 14}" stroke="#dbe7ff" stroke-width="1.2" opacity=".55"/>`).join("") : "";
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMin slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>${stars}${rainBg}<g transform="translate(${at[0]},${at[1]}) scale(${scale})">${icon(k, n, 12)}</g></svg>`;
  }
  const hh = (t) => +String(t || "").slice(11, 13);
  // 장면 고르기: ① 실황 강수형태(있으면) ② 실황에 하늘상태가 없으므로 예보 하늘상태를 빌림(그 예보 시각을 함께 밝힘) ③ 낮/밤은 지금 시각
  //   obs: {pty, time}  fc: [{time, sky, pty}] (가까운 시각 순). 둘 다 없으면 k=null(그림 대신 '자료 없음')
  function sceneOf({ obs = null, fc = [], hour = new Date().getHours() } = {}) {
    const n = night(hour);
    if (obs && obs.pty && obs.pty !== "없음") return { k: kind(null, obs.pty), night: n, text: obs.pty, source: "obs", time: obs.time || null, borrowed: false };
    const f = (fc || []).find((x) => x && (x.sky || (x.pty && x.pty !== "없음")));
    if (f) {
      const usePty = f.pty && f.pty !== "없음";
      return { k: kind(f.sky, f.pty), night: n, text: usePty ? f.pty : f.sky, source: "fcst", time: f.time, borrowed: true, note: `${hh(f.time)}시 예보` };
    }
    return { k: null, night: n, text: "하늘 자료 없음", source: null, time: null, borrowed: false };
  }
  // 시간 칸의 강수 한 줄(그림·숫자·문장이 같은 자료를 따르게). 강수확률(POP)은 단기예보에만 있고,
  //   앞 6시간의 강수형태·강수량은 더 늦게 나온 초단기예보로 바뀜 → 두 발표가 어긋날 수 있음(예: 초단기 18:30 '비 1mm 미만', 단기 17:00 강수확률 0%).
  //   규칙: 강수형태(비·눈) 예보가 있는 칸 = 그림과 같은 자료의 강수형태·강수량을 보여 줌(강수확률은 설명에만).
  //         없는 칸 = 강수확률(☂n%). 강수확률을 같이 말하는 건 강수형태와 같은 발표일 때만(sameRelease).
  //   없는 값은 0 으로 채우지 않음(pop null → 표시 없음).
  const hm5 = (b) => (b ? String(b).slice(11, 16) : "");
  const srcTxt = (it) => (it ? `${it.source}${it.base ? ` ${hm5(it.base)} 발표` : ""}` : "");
  function rainOf(h) {
    const at = `${Number(String(h?.time || "").slice(11, 13))}시`;
    const it = h?.items || {}, pty = h?.pty, wet = !!(pty && pty !== "없음");
    const pop = Number.isFinite(h?.pop) ? h.pop : null, popHigh = pop != null && pop >= 60;
    const popTxt = pop == null ? "강수확률 자료 없음" : `강수확률 ${pop}%`;
    const same = !!(it.pop && it.pty && it.pop.source === it.pty.source && it.pop.base === it.pty.base);
    const snowy = wet && /눈/.test(pty);
    // 예상 강수량(1시간): 기상청 표기 그대로('1mm 미만', '1.0mm', '30~50mm'). 칸이 없으면 '—'(0 아님)
    const pcpT = h?.pcp == null ? null : String(h.pcp);
    const snoT = h?.sno == null ? null : String(h.sno);
    const amtOf = () => { const a = []; if (pcpT != null && pcpT !== "강수 없음") a.push(pcpT); if (snowy && snoT != null && snoT !== "적설 없음") a.push(`눈 ${snoT}`); return a.length ? a.join(" · ") : null; };
    const amtTip = `예상 강수량 ${pcpT == null ? "자료 없음" : pcpT}${it.pcp ? `(${srcTxt(it.pcp)})` : ""}${snowy || (snoT && snoT !== "적설 없음") ? ` · 신적설 ${snoT == null ? "자료 없음" : snoT}${it.sno ? `(${srcTxt(it.sno)})` : ""}` : ""}`;
    if (!wet) {
      // 비·눈 예보는 없지만 강수확률 60% 이상: 강수량 줄도 같이(기상청 표기 그대로, 없으면 —)
      const amt = popHigh ? (pcpT == null ? "—" : pcpT) : "";
      return { wet: false, mismatch: false, sameRelease: same, text: pop == null ? "" : `☂${pop}%`, amt, popHigh, tip: `${at} ${pty == null ? "강수형태 자료 없음" : "비·눈 예보 없음"} · ${popTxt}${it.pop ? `(${srcTxt(it.pop)})` : ""}${popHigh ? ` · ${amtTip}` : ""}` };
    }
    const mismatch = !same && pop != null && pop < 60;
    const tip = `${at} ${pty} 예보(${srcTxt(it.pty) || "예보"}) · ${amtTip}` + (pop == null ? " · 강수확률 자료 없음" : same ? ` · ${popTxt}` : ` · ${popTxt}는 ${srcTxt(it.pop) || "다른 발표"} 값`) + (mismatch ? ". 강수확률은 단기예보에만 있어 더 늦게 나온 초단기예보와 다를 수 있어요. 비·눈 표시는 더 최신 발표를 따릅니다." : "");
    return { wet: true, mismatch, sameRelease: same, text: ({ 빗방울눈날림: "비/눈", 눈날림: "눈" })[pty] || pty, amt: amtOf() ?? "—", popHigh, tip };
  }
  window.RTArt = { kind, wfKind, icon, iconSvg, sceneBg, sceneSvg, sceneOf, night, rainOf, SUN, MOON, CLOUD, DROPS, FLAKES };
})();
