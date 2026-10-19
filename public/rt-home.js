// 오늘의 날씨 첫 화면(히어로·다음 시간·옷차림 참고·생활 질문·주간·이날의 기록). 기존 API(/api/rt/today·forecast·life·stories·similar)만 읽고 숫자는 지어내지 않는다.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  // 오늘의 날씨 화면 공통 읽기(rt.js·rt-stories.js 도 같이 씀): 같은 주소는 60초 동안 한 번만 요청.
  // 서버가 막 시작해 '준비 중'(503 warming)이면 5초 뒤 다시(최대 2분)
  const memo = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchJ(u) {
    for (let i = 0; ; i++) {
      const r = await fetch(u);
      const d = await r.json().catch(() => ({}));
      if (r.status === 503 && d.warming && i < 24) { document.dispatchEvent(new CustomEvent("rt:warming", { detail: { url: u, message: d.message } })); await sleep((d.retryAfterSec || 5) * 1000); continue; }
      if (!r.ok || d.ok === false) throw new Error(d.message || `HTTP ${r.status}`);
      return d;
    }
  }
  const get = (u) => { const c = memo.get(u); if (c && Date.now() - c.at < 60000) return c.p; const p = fetchJ(u); memo.set(u, { at: Date.now(), p }); p.catch(() => memo.delete(u)); return p; };
  window.RTGet = get;
  // 화면 아래 칸: 보일 때(300px 앞) 읽기
  function lazy(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!("IntersectionObserver" in window)) return void fn(el);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); if (el.isConnected) fn(el); } }, { rootMargin: "300px 0px" });
    io.observe(el);
  }
  window.RTLazy = lazy;
  // 선택 기준(NWBasis): 전체 비교 = 1990년 이후가 대표, 10년·5년은 작게
  const basis = () => (window.NWBasis ? (NWBasis.today ? NWBasis.today() : NWBasis.get()) : "cmp");
  const mainId = () => (basis() === "cmp" ? "all" : basis());
  const pickP = (list, id = mainId()) => (list || []).find((p) => p.id === id) || null;
  const others = (list) => (basis() === "cmp" ? (list || []).filter((p) => p.id !== "all") : []);
  const nm = (p) => `${String(p.label).replace(" 평균", "")} ${p.range}`;
  const ICON = { 맑음: "☀️", 구름많음: "⛅", 흐림: "☁️", 비: "🌧️", "비/눈": "🌨️", 눈: "❄️", 소나기: "🌦️", 빗방울: "🌦️", "빗방울눈날림": "🌨️", 눈날림: "🌨️" };
  const iconTxt = (t) => (!t ? "" : ICON[t] || (/눈/.test(t) ? "❄️" : /비|소나기/.test(t) ? "🌧️" : /흐/.test(t) ? "☁️" : /구름/.test(t) ? "⛅" : /맑/.test(t) ? "☀️" : ""));
  const icon = (h) => iconTxt(h?.pty && h.pty !== "없음" ? h.pty : h?.sky) || "·";
  const wx = (h) => (h?.pty && h.pty !== "없음" ? h.pty : h?.sky) || null;
  // 날씨 그림: 예보 화면과 같은 공용 SVG(rt-weather-art.js), 없으면 예전 글자 그림
  const art = (h, px = 26) => (window.RTArt && wx(h) ? window.RTArt.iconSvg(window.RTArt.kind(h.sky, h.pty), window.RTArt.night(Number(h.time.slice(11, 13))), px, wx(h)) : icon(h));
  const ymdK = (s) => `${s.slice(0, 4)}년 ${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
  const DOW = "일월화수목금토";
  const dow = (s) => DOW[new Date(`${s}T12:00:00+09:00`).getUTCDay()];
  // 기온별 옷차림 — 널리 쓰이는 일반 기준(규칙). 값은 예보·실황 기온 그대로, 안내는 참고용
  const WEAR = [[28, "민소매·반바지"], [23, "반팔·얇은 셔츠"], [20, "얇은 가디건·긴팔"], [17, "맨투맨·얇은 니트"], [12, "자켓·가디건"], [9, "트렌치코트·야상"], [5, "코트·히트텍"], [-99, "패딩·목도리"]];
  const wearOf = (t) => WEAR.find(([lo]) => t >= lo)[1];
  function mood(diff) {
    if (diff == null) return null;
    const a = Math.abs(diff);
    if (a < 1) return "평소와 비슷한";
    return `평소보다 ${a}℃ ${diff > 0 ? "따뜻한" : "쌀쌀한"}`;
  }
  const part = (h) => (h < 6 ? "새벽" : h < 11 ? "아침" : h < 14 ? "한낮" : h < 18 ? "오후" : "저녁");
  // 히어로(동기, /api/rt/today 만으로)
  function hero(d, chart = "") {
    const c = d.current, v = c.values;
    if (!v) return `<section class="card rh-hero"><p class="result bad">${esc(c.message || "오늘 실황 자료가 없습니다")}</p></section>`;
    const stale = c.freshness?.state === "stale";
    const p = pickP(c.compare?.ta);
    const m = p && p.mean != null ? mood(p.diff) : null;
    const line = stale ? esc(c.freshness.text) : m ? `${p.id === "all" ? m : m.replace("평소와", `${p.label}과`).replace("평소보다", `${p.label}보다`)} ${part(c.hour)}` : `${p ? esc(nm(p)) + " " : ""}비교 데이터 부족`;
    // 분포 띠: 같은 시기·시각 과거 최저~최고, 10·90백분위, 지금 위치(표본 60개 이상일 때만)
    let meter = "";
    if (p && (p.percentile == null || !p.min || !p.max)) meter = `<p class="rt-ins rh-meter">${esc(nm(p))} 분포·순위: 비교 데이터 부족${p.samples != null ? `(표본 ${p.samples}개, 60개 이상 필요)` : ""}</p>`;
    else if (p) {
      const lo = p.min.value, hi = p.max.value, pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
      if (window.RTViz) meter = `<div class="rh-meter rh-meter2" id="rhMeter">${window.RTViz.dist({ type: "dist", metric: "ta", unit: "℃", value: v.ta, valueKind: "obs", label: `${c.hour}시 기온`, mean: p.mean, p10: p.p10, p90: p.p90, min: lo, minDate: p.min.date, max: hi, maxDate: p.max.date, N: p.samples, range: p.range })}<p class="rh-ends rh-ends2"><span>${esc(nm(p))} 같은 시기 이 시각 ${p.samples}개 중 따뜻한 쪽 ${p.rankHigh}위</span></p></div>`;
      else meter = `<div class="rh-meter" aria-label="과거 같은 시기 이 시각 분포에서 지금 위치"><div class="rh-bar"><i class="rh-band" style="left:${pos(p.p10)}%;width:${pos(p.p90) - pos(p.p10)}%"></i><i class="rh-avg" style="left:${pos(p.mean)}%"></i><b class="rh-dot" style="left:${pos(v.ta)}%"></b></div><div class="rh-ends"><span>${lo}℃ <small>${esc(p.min.date.slice(0, 4))}</small></span><span>${esc(nm(p))} 같은 시기 이 시각 ${p.samples}개 중 따뜻한 쪽 ${p.rankHigh}위</span><span>${hi}℃ <small>${esc(p.max.date.slice(0, 4))}</small></span></div></div>`;
    }
    return `<section class="card rh-hero${stale ? " is-stale" : ""}" aria-label="지금 날씨">
      <p class="rh-meta">${esc(d.station.name)} · ${esc(c.time.slice(11, 16))} 실황 ${stale ? `<span class="rt-badge bad">지연</span>` : `<span class="rt-badge ok">최신</span>`}</p>
      <div class="rh-main"><div><p class="rh-temp">${v.ta}<span>℃</span></p><p class="rh-sky" id="rhSky"></p></div>
        <div class="rh-side">${p && p.mean != null ? `<b class="rh-diff ${p.diff > 0 ? "up" : p.diff < 0 ? "down" : ""}">${sg(p.diff)}</b><small>${esc(nm(p))} 같은 시기 이 시각 평균 ${p.mean}℃</small>${others(c.compare?.ta).map((o) => `<small>${esc(nm(o))} ${o.mean == null ? "비교 데이터 부족" : `${o.mean}℃(<b class="${o.diff > 0 ? "up" : o.diff < 0 ? "down" : ""}">${sg(o.diff)}</b>)`}</small>`).join("")}` : `<small class="rt-ins">${esc(p ? nm(p) + " " : "")}${esc(p?.statusText || "비교 데이터 부족")}</small>`}
          <small>습도 ${v.hm ?? "–"}% · ${esc(v.windDir || "")} ${v.ws ?? "–"}m/s${v.rn1 ? ` · 1시간 ${v.rn1}mm` : ""}</small>
          ${window.RTAct && RTAct.loadInterests().chill ? RTAct.chillHtml(v.ta, v.ws) : ""}
          ${d.day?.max?.value != null || d.day?.min?.value != null ? `<small title="실황(지금 기온)과 따로, 단기예보 발표 당시의 오늘 최저·최고 예보입니다">오늘 최저 ${d.day.min.value ?? "–"}℃ / 최고 ${d.day.max.value ?? "–"}℃ <span class="rt-badge fc">예보${(d.day.max.base || d.day.min.base) ? ` ${esc(String(d.day.max.base || d.day.min.base).slice(11, 16))} 발표` : ""}</span></small>` : ""}</div></div>
      <h2 class="rh-line">${line}</h2><p class="rh-story" id="rhStory"></p><div class="rh-storyviz" id="rhStoryViz" hidden></div>
      ${meter}
      <p class="rh-wear" id="rhTip" hidden></p>
    </section>
    <section class="card rh-hours lite" aria-label="앞으로 12시간"><h2>앞으로 12시간 <span class="rt-badge fc">예보</span></h2><div class="rh-chips" id="rhHours"><p class="rt-load">불러오는 중…</p></div><div class="rh-day" id="rhDay"></div></section>
    <section class="card rh-walk" id="rhWalk" aria-label="산책·러닝 시간 찾기" hidden></section>
    ${chart}`;
  }
  function hoursHtml(f) {
    const hs = (f.hours || []).slice(0, 12);
    if (!hs.length) return `<p class="rt-ins">예보 자료가 없습니다</p>`;
    return hs.map((h) => chipCol(h)).join("") + `<a class="rh-chip rh-chip-more" href="#/forecast">72시간<br>예보 보기 ›</a>`;
  }
  // 아래 줄: 비·눈 예보가 있는 칸은 그림과 같은 자료(초단기 우선)의 강수형태·강수량, 없는 칸은 강수확률(RTArt.rainOf). 누르면/올리면 출처·발표
  const rainLine = (h) => (window.RTArt?.rainOf ? window.RTArt.rainOf(h) : { wet: false, popHigh: h.pop >= 60, text: h.pop == null ? "" : `☂${h.pop}%`, amt: "", tip: "" });
  const chipIn = (h) => { const r = rainLine(h); return `<span>${Number(h.time.slice(11, 13))}시</span><i aria-label="${esc(wx(h) || "")}">${art(h)}</i><b>${h.ta ?? "–"}°</b><small${r.tip ? ` title="${esc(r.tip)}" aria-label="${esc(r.tip)}"` : ""}>${esc(r.text)}</small>${r.amt ? `<small class="rh-amt" aria-hidden="true">${esc(r.amt)}</small>` : ""}`; };
  // 비·눈 칸이 있으면 칸 아래 글자의 뜻을 ⓘ 로(초단기 비 + 단기 강수확률이 어긋날 때 그 까닭까지)
  function rainNote(f) {
    const ws = (f.hours || []).slice(0, 12).map((h) => [h, rainLine(h)]).filter(([, r]) => r.wet || r.popHigh);
    if (!ws.length || !window.InfoTip) return "";
    const mis = ws.filter(([, r]) => r.mismatch);
    const d = `비·눈 예보가 있는 칸(그리고 강수확률 60% 이상인 칸)은 아래에 예상 강수량(1시간, 기상청 표기 그대로 · 눈은 신적설)을 적었습니다. 강수량 자료가 없으면 —(0 아님)입니다. 그림·강수량은 더 늦게 나온 예보(앞 6시간은 초단기예보)를 따릅니다. 강수확률은 단기예보에만 있어서${mis.length ? ` ${mis.map(([h]) => `${Number(h.time.slice(11, 13))}시`).join("·")}처럼` : ""} 초단기예보가 비를 예보해도 앞선 단기예보의 강수확률은 낮게 남아 있을 수 있습니다. 칸마다의 강수확률과 발표 시각은 72시간 예보 표에 있습니다.${mis.length ? `<br>${mis.map(([, r]) => esc(r.tip.split(". ")[0])).join("<br>")}` : ""}`;
    return window.InfoTip.note("비·눈 칸 아래 = 예상 강수량", d, { cls: "rt-note rh-rainnote", label: "강수 표시 기준" });
  }
  // 시간축과 같은 열에 맞춘 칩(rt-story-visuals day 의 o.chip)
  const chipCol = (h) => { const r = rainLine(h); return `<div class="rh-chip${r.wet || r.popHigh ? " wet" : ""}">${chipIn(h)}</div>`; };
  // 오늘 뭐 입지? — 같은 규칙(기온별 옷차림 일반 기준·일교차 10℃·강수확률 60%)을 히어로 안 한 줄로
  // 강수형태(PTY) 예보가 있는 시각과 강수확률만 60% 이상인 시각을 구별해서 말함(확률만으로 '비'라고 하지 않음)
  const POP_HIGH = 60; // rt-story-rules FORECAST_RULES.popHigh
  function tipHtml(t, f) {
    const hs = (f.hours || []).slice(0, 12);
    const max = t.day?.max?.value, min = t.day?.min?.value, now = t.current?.values?.ta;
    const items = [];
    if (now != null) items.push(esc(wearOf(now)));
    if (max != null && min != null && max - min >= 10) items.push(`일교차 ${Math.round((max - min) * 10) / 10}℃, 겉옷`);
    const ptyH = hs.find((h) => h.pty && h.pty !== "없음"), popH = hs.find((h) => h.pop != null && h.pop >= POP_HIGH);
    const first = ptyH && (!popH || ptyH.time <= popH.time) ? ptyH : popH;
    // 강수확률은 강수형태와 같은 발표일 때만 같이 말함(초단기 '비' + 단기 '0%' 를 한 문장에 섞지 않음)
    if (first === ptyH && ptyH) { const r = rainLine(ptyH), amt = ptyH.pcp && ptyH.pcp !== "강수 없음" ? ` ${ptyH.pcp}` : ""; items.push(`☂ ${Number(ptyH.time.slice(11, 13))}시 ${esc(ptyH.pty)}${esc(amt)} 예보${r.sameRelease && ptyH.pop != null ? `(강수확률 ${ptyH.pop}%)` : ptyH.items?.pty?.source ? `(${esc(ptyH.items.pty.source)})` : ""}, 우산`); }
    else if (popH) items.push(`☂ ${Number(popH.time.slice(11, 13))}시 강수확률 ${popH.pop}%, 우산 챙기기`);
    if (!items.length) return "";
    return `<b>오늘 뭐 입지?</b> ${items.join(" · ")} <span class="rt-badge fc">참고용</span>${window.InfoTip.btn("기온별 옷차림 일반 기준을 실황·단기예보 기온에 규칙으로 맞춘 참고 안내입니다. 체감은 바람·습도·사람마다 다릅니다.", { label: "옷차림 기준" })}`;
  }
  function lifeRow(x) {
    const ps = (x.periods || []).filter((p) => "diff" in p && (basis() === "cmp" || p.id === basis()));
    if (!ps.length) return "";
    return `<small class="rh-qb">${ps.map((p) => `${esc(nm(p))} ${p.diff == null ? "비교 데이터 부족" : sg(p.diff)}`).join(" · ")}</small>`;
  }
  function lifeHtml(l) {
    // 계절 신호(더위 시작 등)는 노출 기간 안일 때만 첫 화면에(서버 homeEligible). 생활 질문 화면에는 그대로
    const it = (l.items || []).filter((x) => x.answer != null && x.homeEligible !== false);
    if (!it.length) return "";
    return `<h2>궁금한 날씨, 바로 답</h2><div class="rh-qa">${it.map((x) => `<a class="rh-q" href="#/stats/life?station=${esc(l.station?.id || "")}"><span>${esc(x.q)}</span><b>${esc(x.answer)}</b>${lifeRow(x)}<small class="rt-badge ${x.judgement === "unknown" ? "bad" : x.kind === "관측" || x.kind === "실황" ? "ok" : "fc"}">${esc(x.judgement === "unknown" ? "판단 보류" : x.kind || "")}</small></a>`).join("")}</div>`;
  }
  function histHtml(t, sim) {
    const p = pickP(t.current?.compare?.ta);
    const rows = [];
    if (p?.max) rows.push(`<li><span class="up">가장 더웠던</span> ${ymdK(p.max.date)} 이 시각 <b>${p.max.value}℃</b></li>`);
    if (p?.min) rows.push(`<li><span class="down">가장 추웠던</span> ${ymdK(p.min.date)} 이 시각 <b>${p.min.value}℃</b></li>`);
    if (sim?.ok && sim.top?.[0]) { const b = sim.top[0]; rows.push(`<li><span>오늘과 가장 닮은 날</span> ${ymdK(b.date)}${b.max != null ? ` — 그날 최고 ${b.max}℃ · 최저 ${b.min}℃` : ""} <small>(지금까지 기온 흐름 RMSE ${b.rmse}℃)</small></li>`); }
    if (!rows.length) return "";
    return `<section class="card rh-hist" aria-label="이맘때의 기록"><h2>보유 자료의 같은 시기 기록 <span class="rt-badge ok">과거 관측</span></h2><ul class="rh-list">${rows.join("")}</ul>${window.InfoTip.note(`${esc(p ? nm(p) : "")} · 같은 시기 ${t.current.hour}시`, `${esc(p ? nm(p) : "")}: 같은 월일 ±7일, 같은 정시(${t.current.hour}시) ASOS 관측 중. 자세한 목록은 아래 ‘기온 흐름이 닮은 날’.`, { cls: "rt-note" })}</section>`;
  }
  // 지금 전국은? — /api/rt/nation-hours(관측소별 오늘 0~23시, 오늘의 날씨 그래프와 같은 값). 실황 실선·예보 점선(잇지 않음), '지금' 세로선
  const NC = ["#0d1b3d", "#c0262d", "#0e7a3e", "#8a4b00", "#026ef8", "#7c3aed", "#0891b2", "#db2777"];
  const NAT = { data: null, hide: new Set(), sel: null };
  const NL = 38, NR = 10;
  const nHourAt = (fr, W) => Math.max(0, Math.min(23, Math.round(((fr * W - NL) / (W - NL - NR)) * 23)));
  function nSvg(rows, cur, W, H, sel) {
    const L = NL, R = NR, T = 14, B = 26, vis = rows.filter((r) => !NAT.hide.has(r.id));
    const vals = []; for (const r of vis) for (const h of r.hours) { if (h.obs != null) vals.push(h.obs); if (h.fcst != null) vals.push(h.fcst); }
    if (!vals.length) return `<p class="rt-ins">표시할 자료 없음</p>`;
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
    const x = (h) => L + (h / 23) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const path = (pts) => { let s = "", pen = false; for (const [h, v] of pts) { if (v == null) { pen = false; continue; } s += `${pen ? "L" : "M"}${x(h).toFixed(1)},${y(v).toFixed(1)}`; pen = true; } return s; };
    const lastObs = Math.max(-1, ...rows.flatMap((r) => r.hours.filter((h) => h.obs != null).map((h) => h.hour)));
    const ticks = []; const step = hi - lo > 12 ? 4 : 2;
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="rt-svg" role="img" aria-label="관측소별 오늘 시간별 기온: 실황 실선, 예보 점선">`;
    if (lastObs >= 0 && lastObs < 23) svg += `<rect x="${x(lastObs)}" y="${T}" width="${x(23) - x(lastObs)}" height="${H - T - B}" fill="#e8f3ff" opacity=".6"/><line x1="${x(lastObs)}" x2="${x(lastObs)}" y1="${T}" y2="${H - B}" stroke="#026ef8" stroke-dasharray="2 3"/><text x="${x(lastObs) + 4}" y="${T + 11}" font-size="11" fill="#026ef8">지금 · 이후 예보</text>`;
    for (const t of ticks) svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e0e8f4"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5e7090">${t}</text>`;
    for (let h = 0; h < 24; h += 3) svg += `<text x="${x(h)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5e7090">${h}시</text>`;
    rows.forEach((r, i) => {
      if (NAT.hide.has(r.id)) return;
      const c = NC[i % NC.length], me = String(r.id) === String(cur), w = me ? 3.2 : 1.6, op = me ? 1 : 0.8;
      svg += `<path d="${path(r.hours.map((h) => [h.hour, h.fcst]))}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="6 4" opacity="${op}"/>`;
      svg += `<path d="${path(r.hours.map((h) => [h.hour, h.obs]))}" fill="none" stroke="${c}" stroke-width="${w}" opacity="${op}"/>`;
    });
    if (sel != null) svg += `<line class="rt-sel" x1="${x(sel)}" x2="${x(sel)}" y1="${T}" y2="${H - B}" stroke="#0d1b3d" opacity=".35"/>`;
    return svg + `<rect class="rt-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
  }
  function nTip(hour) {
    const d = NAT.data; if (!d) return "";
    const id = mainId(), per = (d.periods || []).find((p) => p.id === id);
    const items = d.rows.map((r, i) => {
      if (NAT.hide.has(r.id)) return "";
      const h = r.hours.find((x) => x.hour === hour), v = h ? (h.obs ?? h.fcst) : null, b = h?.base?.[id];
      return `<span><i style="background:${NC[i % NC.length]}"></i>${esc(r.name)} ${v == null ? "자료 없음" : `<b>${v}℃</b>${h.obs == null ? "<small>예보</small>" : ""}${b == null ? " <small>비교 데이터 부족</small>" : ` <small class="${v - b > 0 ? "up" : v - b < 0 ? "down" : ""}">${sg(Math.round((v - b) * 10) / 10)}</small>`}`}</span>`;
    }).join("");
    return `<b>${hour}시</b> <small>${per ? esc(`${per.label.replace(" 평균", "")} ${per.range}`) : ""} 같은 시기 이 시각 평균 대비</small><div class="rh-ntip">${items}</div>`;
  }
  const nLast = () => { const d = NAT.data; const m = Math.max(-1, ...d.rows.flatMap((r) => r.hours.filter((h) => h.obs != null).map((h) => h.hour))); return m < 0 ? 12 : m; };
  function nationPaint(cur) {
    const el = document.getElementById("rhNation"), d = NAT.data; if (!el || !d) return;
    const legend = `<div class="rt-legend rh-nlg"><span class="lg-obs">━ 실황</span><span class="lg-fc">┅ 예보</span>${d.rows.map((r, i) => `<button type="button" data-nt="${esc(r.id)}" aria-pressed="${!NAT.hide.has(r.id)}" style="--c:${NC[i % NC.length]}" class="${NAT.hide.has(r.id) ? "" : "on"}${String(r.id) === String(cur) ? " me" : ""}">${esc(r.name)}</button>`).join("")}</div>`;
    const sel = NAT.sel ?? nLast();
    el.innerHTML = `<h2>지금 전국은? <small class="rh-sub">8개 관측소 오늘 시간별 기온</small></h2>${legend}<div class="rt-svg-wrap" id="rhNatHost">${nSvg(d.rows, cur, 720, 260, sel)}${window.ChartFull ? window.ChartFull.button() : ""}</div><div class="rt-tip" id="rhNatTip">${nTip(sel)}</div>${window.InfoTip.note("실황 + 초단기·단기예보", "이름을 누르면 선을 숨기거나 보입니다(굵은 선 = 지금 보는 관측소). 실황 = 기상청 초단기실황, 이후 = 초단기·단기예보이며 서로 잇지 않습니다. 빈 시각은 자료 없음.", { cls: "rt-note", label: "그래프 보는 법" })}`;
    const svg = el.querySelector("svg.rt-svg");
    if (svg) { const pick = (ev) => { const r = svg.getBoundingClientRect(); const h = nHourAt((ev.clientX - r.left) / r.width, 720); if (h === NAT.sel) return; NAT.sel = h; document.getElementById("rhNatTip").innerHTML = nTip(h); }; svg.addEventListener("pointermove", pick); svg.addEventListener("pointerdown", pick); }
    const host = document.getElementById("rhNatHost");
    if (host && window.ChartFull && window.RTFull) window.ChartFull.register(host, {
      hostClass: "rt-fs", title: () => "지금 전국은? — 8개 관측소 오늘 시간별 기온", sub: () => `${d.date} · 실황 실선, 예보 점선 · 단위 ℃`,
      legend: () => window.RTFull.legend(host.closest(".card")), source: () => "자료: 기상청 초단기실황·초단기/단기예보, 과거 평균 ASOS · 시간대 Asia/Seoul",
      render: (box, size) => { const W = size.width, s0 = NAT.sel ?? nLast(); window.RTFull.draw(box, nSvg(d.rows, cur, W, size.height, s0), (fr) => nHourAt(fr, W), (h) => (NL + (h / 23) * (W - NL - NR)).toFixed(1), (h) => nTip(h), s0); },
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#rhNation [data-nt]"); if (!b) return;
    const id = b.dataset.nt; NAT.hide.has(id) ? NAT.hide.delete(id) : NAT.hide.add(id);
    nationPaint(window.RT?.station?.());
  });
  // 접는 주제 묶음: 열림 상태는 localStorage, 닫힌 머리말엔 이미 받은 실제 자료로 한 줄 미리보기
  const GK = "nw.rhGroups";
  const gState = () => { try { return JSON.parse(localStorage.getItem(GK)) || {}; } catch { return {}; } };
  // 예전 '이번 주 예보' 묶음(내일 날씨와 겹쳐 뺌)의 저장값은 지운다
  try { const s0 = JSON.parse(localStorage.getItem(GK) || "null"); if (s0 && "week" in s0) { delete s0.week; localStorage.setItem(GK, JSON.stringify(s0)); } } catch {}
  const GROUPS = { nat: ["전국과 기록", "8개 관측소 기온 · 보유 자료의 같은 시기 기록"], past: ["과거와 비교", "기온 흐름이 닮은 날 · 계절 신호 · 30일 비 달력 · 내가 기억하는 이날"] };
  function group(id, inner) {
    const [t, pv] = GROUPS[id];
    return `<details class="card rh-grp" data-grp="${id}"${gState()[id] ? " open" : ""}><summary><span class="rh-gt">${t}</span><small class="rh-pv" id="rhPv-${id}">${pv}</small></summary>${inner}</details>`;
  }
  document.addEventListener("toggle", (e) => { const g = e.target?.dataset?.grp; if (!g) return; const s0 = gState(); s0[g] = e.target.open; try { localStorage.setItem(GK, JSON.stringify(s0)); } catch {} }, true);
  const pv = (id, txt) => { const el = document.getElementById(`rhPv-${id}`); if (el && txt) el.textContent = txt; };
  function weekPv(f) {
    const ds = (f?.days || []).filter((x) => x.max != null || x.min != null);
    if (!ds.length) return null;
    const hi = ds.reduce((a, b) => ((b.max ?? -99) > (a.max ?? -99) ? b : a));
    const wet = ds.filter((x) => x.pop != null && x.pop >= POP_HIGH);
    const dn = (x) => (x.offset === 0 ? "오늘" : x.offset === 1 ? "내일" : `${Number(x.date.slice(8))}일(${dow(x.date)})`);
    // 강수확률 60% 이상인 첫날이 있으면 그것(확률만이라 '비 온다'고 하지 않음), 없으면 가장 더운 날
    return wet.length ? `강수확률 높은 날 ${dn(wet[0])}${wet.length > 1 ? ` 외 ${wet.length - 1}일` : ""} · 최대 ${wet[0].pop}%` : hi.max != null ? `가장 더운 날 ${dn(hi)} ${hi.max}℃` : null;
  }
  function natPv(d) {
    const xs = (d?.rows || []).map((r) => { const h = [...r.hours].reverse().find((x) => x.obs != null); return h ? { n: r.name, v: h.obs, h: h.hour } : null; }).filter(Boolean);
    if (xs.length < 2) return null;
    const w = xs.reduce((a, b) => (b.v > a.v ? b : a)), c = xs.reduce((a, b) => (b.v < a.v ? b : a));
    return `지금 전국은 · ${w.n} ${w.v}℃ 가장 따뜻 · ${c.n} ${c.v}℃ 가장 쌀쌀`;
  }
  function pastPv(sim) { const b = sim?.ok && sim.top?.[0]; return b ? `오늘과 가장 닮은 날 · ${ymdK(b.date)}` : null; }
  window.RTGroups = { group };
  let seq = 0;
  async function fill(t) {
    const my = ++seq, st = t.station.id;
    // 미리보기용: 전국 시간별(서버 60초 캐시, 약 3KB)만 바로. 지도·그래프는 묶음을 열어 보일 때 그린다
    get("/api/rt/nation-hours").then((r) => { if (my === seq) pv("nat", natPv(r)); }).catch(() => {});
    lazy("rhNation", (el) => get("/api/rt/nation-hours").then((r) => { if (my !== seq) return; NAT.data = r; NAT.sel = null; nationPaint(st); }).catch((e) => { if (el.isConnected) el.innerHTML = `<h2>지금 전국은?</h2><p class="rt-ins">자료 없음 — ${esc(e.message)}</p>`; }));
    lazy("rhLife", (el) => get(`/api/rt/life?station=${st}`).then((l) => { if (my !== seq || !el.isConnected) return; const lh = lifeHtml(l); if (lh) el.innerHTML = lh; else el.hidden = true; }).catch(() => { if (el.isConnected) el.hidden = true; }));
    lazy("rhHist", (el) => get(`/api/rt/similar?station=${st}&day=today`).catch(() => null).then((s) => { if (my === seq && el.isConnected) { el.innerHTML = histHtml(t, s); pv("past", pastPv(s)); } }));
    const fv = await get(`/api/rt/forecast?station=${st}`).catch(() => null);
    if (my !== seq || !document.getElementById("rhHours")) return;
    document.getElementById("rhHours").innerHTML = fv ? hoursHtml(fv) : `<p class="rt-ins">예보를 불러오지 못했습니다</p>`;
    paintSky(t, fv);
    // 앞으로 12시간 공용 시간축 + 하루 구간 옷차림: 이미 받은 예보·실황만으로, 보일 때 그림
    if (fv && window.RTViz) lazy("rhDay", (el) => { if (my !== seq) return; const v = t.current?.values || {}; window.RTViz.day(el, { nowW: t.now || `${t.date} ${String(t.current?.hour ?? 0).padStart(2, "0")}:00`, obsHours: (t.hours || []).filter((h) => h.obs != null).map((h) => ({ time: h.time, ta: h.obs })), current: t.current?.time && v.ta != null ? { time: t.current.time, ta: v.ta, hm: v.hm, ws: v.ws } : null, fc: fv.hours || [], days: fv.days || [], chip: chipCol, noSegs: !!(window.RTAct && !RTAct.loadInterests().outfit), more: `${rainNote(fv)}<p class="rh-more12"><a href="#/forecast?station=${esc(st)}">72시간 예보 보기 ›</a> · <a href="#/my">구간 시간 바꾸기 ›</a></p>` }); const hh = document.getElementById("rhHours"); if (hh && el.querySelector(".vz-sync")) hh.hidden = true; });
    paintWalk(t, fv);
    const tip = document.getElementById("rhTip"), th = fv ? tipHtml(t, fv) : "";
    if (tip && th) { tip.innerHTML = th; tip.hidden = false; }
    const wl = document.getElementById("rhWeekLink"), wt = fv ? weekPv(fv) : null; if (wl && wt) wl.innerHTML = `<a href="#/forecast?station=${esc(st)}">${esc(wt)} · 내일 날씨에서 보기 ›</a>`;
    paintStory();
  }
  // 산책·러닝 시간 찾기(astra 9-3): 이미 받은 예보로 앞으로 24시간, 규칙 판정(rt-activity.js)
  function paintWalk(t, fv) {
    const el = document.getElementById("rhWalk");
    if (!el || !window.RTAct) return;
    if (!fv || !RTAct.loadInterests().walk) { el.hidden = true; return; }
    const nowW = t.now || `${t.date} ${String(t.current?.hour ?? 0).padStart(2, "0")}:00`;
    const res = RTAct.findWindows(fv.hours || [], RTAct.loadCond(), { nowW });
    el.innerHTML = RTAct.walkHtml(res, { today: nowW.slice(0, 10) });
    el.hidden = false;
    el.onclick = (ev) => {
      const b = ev.target.closest("[data-awh]"); if (!b) return;
      const x = res.hours[+b.dataset.awh]; if (!x) return;
      el.querySelectorAll(".aw-h.sel").forEach((q) => q.classList.remove("sel")); b.classList.add("sel");
      const tp = el.querySelector(".aw-tip"); if (tp) tp.textContent = RTAct.hourDetail(x, nowW.slice(0, 10));
    };
  }
  // 하늘 그림: 강수형태(실황) → 하늘상태(실황엔 없어 예보에서 빌림 — 그 예보 시각을 함께) → 낮/밤
  function paintSky(t, fv) {
    const el = document.getElementById("rhSky"); if (!el) return;
    const c = t.current || {}, v = c.values || {};
    if (!window.RTArt) { if (fv?.hours?.[0] && wx(fv.hours[0])) el.innerHTML = `${icon(fv.hours[0])} ${esc(wx(fv.hours[0]))} <small>${Number(fv.hours[0].time.slice(11, 13))}시 예보</small>`; return; }
    const sc = window.RTArt.sceneOf({ obs: v.pty ? { pty: v.pty, time: c.time } : null, fc: fv?.hours || [], hour: c.hour ?? new Date().getHours() });
    if (!sc.k) { el.innerHTML = `<small>하늘 자료 없음</small>`; return; }
    el.innerHTML = `${window.RTArt.iconSvg(sc.k, sc.night, 34, sc.text)} <span>${esc(sc.text)}</span> <small>${sc.borrowed ? `하늘은 ${esc(sc.note)}` : `${esc(String(c.time || "").slice(11, 16))} 실황`}</small>`;
  }
  // rt-stories.js 가 이야기를 받으면 맨 위 이야기를 히어로 한 줄로
  async function storyLine(s, st) {
    const badge = `<span class="rt-badge ${s.kind === "관측" ? "ok" : "fc"}">${esc(s.kind)}</span> `;
    const m = /^ytd-(\w+)$/.exec(s.key || "");
    // 이야기는 선택한 기준을 따름(4단계). 기준이 정해진 카드만 짧은 이유를 붙임
    const fixed = s.basisFixed ? ` <small class="rh-bfix">(${esc(s.basisFixed)})</small>` : lastStories?.basisId && s.basisId && s.basisId !== lastStories.basisId ? ` <small class="rh-bfix">(${esc({ all: "1990년 이후", r10: "최근 10년", r5: "최근 5년" }[s.basisId] || s.basisId)} 기준)</small>` : "";
    if (!m) return badge + esc(s.title) + fixed;
    const y = await get(`/api/rt/ytd?station=${st}`).catch(() => null);
    const it = y?.items?.find((x) => x.id === m[1]);
    const p = pickP(it?.periods);
    if (!it || !p) return badge + esc(s.title);
    const big = it.id === "rain" ? "많은" : "높은", small = it.id === "rain" ? "적은" : "낮은";
    const rank = p.rankHigh && p.of ? (p.rankHigh <= (p.of + 1) / 2 ? `${big} 쪽 ${p.rankHigh}위` : `${small} 쪽 ${p.of - p.rankHigh + 1}위`) : null;
    const extra = others(it.periods).map((o) => `${nm(o)} ${o.diff == null ? "비교 데이터 부족" : sg(o.diff, it.unit)}`).join(" · ");
    return badge + esc(`올해 ${it.label} ${it.value}${it.unit} — ${nm(p)} 같은 누적 기간 평균 ${p.mean == null ? "비교 데이터 부족" : `${p.mean}${it.unit}(${sg(p.diff, it.unit)})`}${rank ? `, ${p.of}개 해 중 ${rank}` : ""}`) + (extra ? ` <small>${esc(extra)}</small>` : "");
  }
  let lastStories = null;
  // 대표 이야기와 그림 잇기: 지금 기온 이야기면 히어로 분포 띠를 근거로 강조, 다른 이야기면 그 이야기 그래프를 한 줄 아래에
  const paintStory = async () => {
    const el = document.getElementById("rhStory"), s = lastStories?.stories?.[0]; if (!el || !s) return;
    const h = await storyLine(s, lastStories.station?.id || window.RT?.station?.() || "108");
    if (!el.isConnected) return;
    const meter = document.getElementById("rhMeter"), box = document.getElementById("rhStoryViz");
    const useMeter = s.ruleId === "now-anomaly" && meter;
    if (meter) meter.classList.toggle("is-lead", !!useMeter);
    el.innerHTML = h + (useMeter ? ` <small class="rh-lk">↓ 아래 분포 띠가 이 이야기의 근거</small>` : "");
    if (box) { const ch = !useMeter && s.chart && window.RTViz ? window.RTViz.chart(s.chart) : ""; box.innerHTML = ch ? `<p class="rh-lk">↓ 이 이야기의 근거</p>${ch}` : ""; box.hidden = !ch; box.classList.toggle("is-lead", !!ch); }
  };
  document.addEventListener("rt:stories", (e) => { lastStories = e.detail; paintStory(); });
  window.RTHome = { hero, fill };
})();
