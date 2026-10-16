// 오늘의 날씨(#/today) — /api/rt/today. 과거 3개 기준(1990년 이후·최근 10년·최근 5년) 선택은 NWBasis(공통, 주소 ?basis= + localStorage nw.basis).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  const v1 = (v, u = "℃") => (v == null ? "–" : `${v}${u}`);
  const COLORS = { obs: "#0d1b3d", fcst: "#026ef8", all: "#8a4b00", r10: "#0e7a3e", r5: "#c0262d" };
  // ---------------------------------------------------------------- 공통: 기준 선택
  const BASIS = [["cmp", "전체 비교"], ["all", "1990년 이후"], ["r10", "최근 10년"], ["r5", "최근 5년"]];
  const NWBasis = {
    get() {
      const u = new URLSearchParams(location.hash.split("?")[1] || "").get("basis");
      if (BASIS.some((b) => b[0] === u)) return u;
      try { const s = localStorage.getItem("nw.basis"); if (BASIS.some((b) => b[0] === s)) return s; } catch { /* */ }
      return "cmp";
    },
    set(v) { try { localStorage.setItem("nw.basis", v); } catch { /* */ } },
    html(cur, labels, skip) {
      return `<div class="seg rt-basis" role="radiogroup" aria-label="비교 기준">${BASIS.filter((b) => !(skip || []).includes(b[0])).map(([id, l]) => `<button type="button" role="radio" aria-checked="${id === cur}" class="${id === cur ? "on" : ""}" data-basis="${id}">${esc(labels?.[id] || l)}</button>`).join("")}</div>`;
    },
    ids: (cur) => (cur === "cmp" ? ["all", "r10", "r5"] : [cur]),
  };
  // 오늘의 날씨: '1990년 이후' 단독 선택 없음 — 예전 주소·저장값 all 은 전체 비교로
  NWBasis.today = () => { const v = NWBasis.get(); return v === "all" ? "cmp" : v; };
  window.NWBasis = NWBasis;

  const state = { station: null, data: null, show: { all: true, r10: true, r5: true }, sel: null, stations: [] };
  function hashParams() { return new URLSearchParams(location.hash.split("?")[1] || ""); }
  function setHash(p) { const q = p.toString(); history.replaceState(history.state, "", `#/today${q ? `?${q}` : ""}`); }
  function pickStation() {
    const u = hashParams().get("station");
    const ids = state.stations.map((s) => String(s.station_id));
    if (u && ids.includes(u)) return u;
    try { const v = JSON.parse(localStorage.getItem("nw.station") || "null"); if (v && ids.includes(String(v.id))) return String(v.id); } catch { /* */ }
    return ids.includes("108") ? "108" : ids[0];
  }
  async function loadStations() {
    if (state.stations.length) return;
    const r = await (window.NWPre?.stations || fetch("/api/stations").then((x) => x.json())).catch(() => []);
    const list = Array.isArray(r) ? r : r.data || r.stations || [];
    state.stations = list.filter((s) => s.enabled !== false);
  }
  async function show() {
    const root = $("today");
    if (!root.dataset.init) {
      root.dataset.init = "1";
      root.innerHTML = `<div class="rt-ctl card"><label class="rt-st"><span class="sr">관측지점</span><select id="rtStation" aria-label="관측지점"></select></label><div id="rtBasis"></div></div><div id="rtOut" aria-live="polite"><div class="card rt-load">불러오는 중…</div></div>`;
      $("rtStation").addEventListener("change", (e) => {
        state.station = e.target.value;
        if (window.NWStation && NWStation.manual) NWStation.manual(state.station);
        const p = hashParams(); p.set("station", state.station); setHash(p); load();
      });
      root.addEventListener("click", onClick);
    }
    // 지점 목록을 기다리는 동안 짐작한 지점(주소·저장값·108)의 히어로·오늘 자료를 먼저 요청(index.html 머리에서 이미 시작했을 수 있음)
    const guess = window.NWPre?.guess?.() || "108";
    prefetch(guess);
    await loadStations();
    state.station = pickStation();
    $("rtStation").innerHTML = state.stations.map((s) => `<option value="${esc(s.station_id)}"${String(s.station_id) === state.station ? " selected" : ""}>${esc(s.station_name)}(${esc(s.station_id)})</option>`).join("");
    renderBasis();
    load();
  }
  function renderBasis() { $("rtBasis").innerHTML = NWBasis.html(NWBasis.today(), null, ["all"]); }
  function onClick(e) {
    const b = e.target.closest("[data-basis]");
    if (b) {
      NWBasis.set(b.dataset.basis);
      const p = hashParams(); p.set("basis", b.dataset.basis); setHash(p);
      renderBasis(); render(); return;
    }
    const t = e.target.closest("[data-line]");
    if (t) { state.show[t.dataset.line] = !state.show[t.dataset.line]; render(); return; }
  }
  let seq = 0;
  const G = (u) => (window.RTGet ? window.RTGet(u) : fetch(u).then(async (r) => { const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.message || "불러오지 못했습니다"); return d; }));
  const pre = new Map(); // station → { now, today } 약속
  function prefetch(st) {
    if (pre.has(st)) return pre.get(st);
    const p0 = window.NWPre?.now && window.NWPre.nowStation === st ? window.NWPre.now : null;
    const x = { now: p0 || G(`/api/rt/now?station=${encodeURIComponent(st)}`), today: G(`/api/rt/today?station=${encodeURIComponent(st)}`) };
    x.now.catch(() => {}); x.today.catch(() => {});
    pre.set(st, x);
    return x;
  }
  let readySent = false;
  async function load() {
    const my = ++seq;
    const st = state.station;
    $("rtOut").innerHTML = `<div class="card rt-load">불러오는 중…</div>`;
    const x = prefetch(st);
    pre.delete(st); // 다음 load(지점 다시 고름 등)는 새로 요청(60초 안이면 RTGet 캐시)
    state.data = null;
    // 1) 히어로 먼저(/api/rt/now): 오늘 전체 자료가 아직이면 히어로·다음 12시간 칸만 그림
    x.now.then((n) => { if (my === seq && !state.data && window.RTHome) { $("rtOut").innerHTML = window.RTHome.hero(n, "") + `<div class="card rt-load">그래프와 이야기를 불러오는 중…</div>`; window.RTHome.fill(n); } }).catch(() => {});
    try {
      const d = await x.today;
      if (my !== seq) return;
      state.data = d;
      state.sel = null;
      render();
      if (!readySent) { readySent = true; document.dispatchEvent(new Event("rt:ready")); }
    } catch (e) {
      if (my === seq) $("rtOut").innerHTML = `<div class="card result bad">${esc(e.message)}</div>`;
      if (!readySent) { readySent = true; document.dispatchEvent(new Event("rt:ready")); }
    }
  }
  // 서버 '준비 중'(막 시작함)이면 안내만 — 다시 요청은 RTGet 이 함
  document.addEventListener("rt:warming", () => { const el = $("rtOut")?.querySelector(".rt-load"); if (el && !state.data) el.textContent = "준비 중입니다 — 서버가 막 시작해 과거 자료를 읽고 있어요. 잠시 뒤 자동으로 불러옵니다."; });
  // ---------------------------------------------------------------- 그리기
  function render() {
    const d = state.data;
    if (!d) return;
    const basis = NWBasis.today();
    const ids = NWBasis.ids(basis);
    const c = d.current;
    const fresh = c.freshness || {};
    const v = c.values;
    const ta = c.compare?.ta;
    const head = v
      ? `<section class="card rt-now ${fresh.state === "stale" ? "is-stale" : ""}" aria-label="현재 기상">
          <div class="rt-now-main">
            <div><p class="rt-time">${esc(c.time.slice(11, 16))} 실황 · ${esc(d.station.name)}${fresh.state === "stale" ? ` <span class="rt-badge bad">지연</span>` : ` <span class="rt-badge ok">최신</span>`}</p>
            <p class="rt-temp">${v1(v.ta)}</p></div>
            <dl class="rt-vals"><div><dt>습도</dt><dd>${v1(v.hm, "%")}</dd></div><div><dt>1시간 강수</dt><dd>${v1(v.rn1, "mm")}</dd></div><div><dt>강수형태</dt><dd>${esc(v.pty ?? "–")}</dd></div><div><dt>바람</dt><dd>${esc(v.windDir ?? "")} ${v1(v.ws, "m/s")}</dd></div></dl>
          </div>
          ${fresh.state === "stale" ? `<p class="result bad rt-stale">${esc(fresh.text)}. 아래 값은 지금 날씨가 아닙니다.</p>` : ""}
          ${ta ? `<div class="rt-cmp">${ta.filter((p) => ids.includes(p.id)).map((p) => `<div class="rt-cmp-i"><span>${esc(p.label)}<small>${esc(p.range)}</small></span><b>${p.mean == null ? `<em class="rt-ins">${esc(p.statusText)}</em>` : `${p.mean}℃`}</b><i class="${p.diff > 0 ? "up" : p.diff < 0 ? "down" : ""}">${p.mean == null ? "" : sg(p.diff)}</i></div>`).join("")}</div>` : ""}
          <p class="rt-src">출처: ${esc(c.source)} ${esc(c.time.slice(0, 16))} · ${esc(d.grid?.note || "")}</p>
        </section>`
      : `<section class="card rt-now"><p class="result bad">${esc(c.message || "오늘 실황 자료가 없습니다")}</p></section>`;
    const story = d.stories.length ? `<section class="card rt-stories" aria-label="오늘의 날씨 이야기"><h2>오늘의 날씨 이야기</h2>${d.stories.map((s) => `<article class="rt-story"><h3>${esc(s.title)} <b>${esc(s.value)}</b></h3><p>${esc(s.text)}</p><p class="rt-basis-row">${s.periods.filter((p) => ids.includes(idOf(p.label))).map((p) => `<span>${esc(p.label.replace(" 평균", ""))} ${p.mean != null ? `${p.mean}℃(${sg(p.diff)})` : p.percentile != null ? `${p.percentile}백분위` : "비교 데이터 부족"}</span>`).join("")}</p><p class="rt-note">근거: ${esc(s.basis)} · 기준 ${esc(s.asOf || "")}</p></article>`).join("")}</section>` : "";
    // 첫 화면: 히어로·다음 12시간·옷차림 참고·생활 질문 → 이야기(넘겨 보기) → 이번 주 → 이맘때의 기록 → 그래프 → 기존 상세(접힘)
    const H = window.RTHome;
    const fold = (t, html) => (html ? `<details class="card rh-fold"><summary>${t}</summary>${html.replace(/^<section class="card[^"]*"[^>]*>|<\/section>$/g, "")}</details>` : "");
    $("rtOut").innerHTML = H
      ? H.hero(d, chartCard(d, ids)) + `<div id="rtsBox">${story}</div>` + `<p class="card rh-wklink" id="rhWeekLink"><a href="#/forecast">이번 주 예보 · 내일 날씨에서 보기 ›</a></p>` + window.RTGroups.group("nat", `<section class="card rh-nation" id="rhNation" aria-label="지금 전국은?"><h2>지금 전국은?</h2><p class="rt-load">불러오는 중…</p></section><div id="rhHist" class="rh-lazy"></div>`) + window.RTGroups.group("past", `<div id="rtsSim" class="rh-lazy"></div><section class="card rh-life" id="rhLife" aria-label="생활 질문"><h2>궁금한 날씨, 바로 답</h2><p class="rt-load">불러오는 중…</p></section>`) + fold("지금 값과 3개 기준 평균 비교", head) + fold("같은 시기·같은 시각 분포에서 지금 위치", distCard(d, ids)) + fold("오늘 최고·최저기온과 과거 평균", dayCard(d, ids)) + fold("습도·강수·바람도 비교", otherCard(d, ids)) + methodCard(d)
      : head + `<div id="rtsBox">${story}</div>` + chartCard(d, ids) + `<div id="rtsSim"></div>` + distCard(d, ids) + dayCard(d, ids) + otherCard(d, ids) + methodCard(d);
    bindChart();
    if (H) H.fill(d);
  }
  const idOf = (label) => (/1990|이후/.test(label) ? "all" : /10년/.test(label) ? "r10" : "r5");
  function distCard(d, ids) {
    const ta = d.current.compare?.ta;
    if (!ta) return "";
    const rows = ta.filter((p) => ids.includes(p.id)).map((p) => `<tr><th scope="row">${esc(p.label)}<small>${esc(p.range)}</small></th><td>${p.percentile == null ? `<span class="rt-ins">${esc(p.rankNote || p.statusText || "표본 부족")}</span>` : `${p.percentile}`}</td><td>${p.percentile == null ? "–" : `높은 쪽 ${p.rankHigh}위 / ${p.samples}`}</td><td>${p.p10 == null ? "–" : `${p.p10}~${p.p90}℃`}${p.outside ? ` <b class="${p.outside > 0 ? "up" : "down"}">(${sg(p.outside)} 벗어남)</b>` : ""}</td><td>${p.max ? `${p.max.value}℃ <small>${esc(p.max.date)}</small>` : "–"}</td><td>${p.min ? `${p.min.value}℃ <small>${esc(p.min.date)}</small>` : "–"}</td></tr>`).join("");
    return `<section class="card rt-dist"><h2>같은 시기·같은 시각 분포에서 지금 위치</h2><div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>기준</th><th>백분위</th><th>순위</th><th>보통 범위(10~90%)</th><th>과거 최고</th><th>과거 최저</th></tr></thead><tbody>${rows}</tbody></table></div><p class="rt-note">${esc(d.current.hour)}시 정시 관측, 같은 월일 ±7일. 실황은 격자 값이고 분포는 ASOS 관측소 값이라 장소가 조금 다를 수 있습니다.</p></section>`;
  }
  function dayCard(d, ids) {
    const it = [["max", "최고기온"], ["min", "최저기온"]].map(([k, l]) => {
      const x = d.day[k];
      return `<div class="rt-day-i"><h3>오늘 ${l} <span class="rt-badge fc">예보</span></h3><p class="rt-big">${x.value == null ? "예보 없음" : `${x.value}℃`}</p><ul>${x.compare.filter((p) => ids.includes(p.id)).map((p) => `<li>${esc(p.label)} <small>${esc(p.range)}</small>: ${p.mean == null ? esc(p.statusText) : `${p.mean}℃${x.value == null ? "" : ` (${sg(p.diff)})`}`}</li>`).join("")}</ul><p class="rt-note">${x.base ? `단기예보 ${esc(x.base.slice(5, 16))} 발표` : "이 날짜의 최고·최저 예보가 저장된 발표가 없습니다"} · 비교: 공식 일자료 ${l}</p></div>`;
    }).join("");
    return `<section class="card rt-day"><h2>오늘 최고·최저기온</h2><div class="rt-day-g">${it}</div></section>`;
  }
  function otherCard(d, ids) {
    const c = d.current.compare;
    if (!c) return "";
    const row = (label, list, u, val) => (list ? `<tr><th scope="row">${label}</th><td>${v1(val, u)}</td>${list.filter((p) => ids.includes(p.id)).map((p) => `<td>${p.mean == null ? `<span class="rt-ins">${esc(p.statusText)}</span>` : `${p.mean}${u} <small>(${sg(p.diff, u)})</small>`}</td>`).join("")}</tr>` : "");
    const hd = c.ta.filter((p) => ids.includes(p.id)).map((p) => `<th>${esc(p.label)}</th>`).join("");
    return `<section class="card"><h2>습도·강수·바람도 비교</h2><div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>항목</th><th>지금</th>${hd}</tr></thead><tbody>${row("습도", c.hm, "%", d.current.values.hm)}${row("1시간 강수량", c.rn, "mm", d.current.values.rn1)}${row("풍속", c.ws, "m/s", d.current.values.ws)}</tbody></table></div><p class="rt-note">강수량 평균은 같은 시각 1시간 강수량(비 안 온 시간 0 포함)의 평균입니다. 결측은 0으로 넣지 않습니다.</p></section>`;
  }
  function methodCard(d) {
    const st = d.baseStatus || {};
    return `<details class="card rt-method"><summary>계산 기준</summary><ul>
      <li>${esc(d.method.rule)}</li><li>${esc(d.method.note)}</li>
      <li>기준기간(오늘 ${esc(d.date)} 기준): ${d.periods.map((p) => `${esc(p.label)} ${esc(p.range)}(유효 ${st[p.id]?.validYears ?? "?"}/${p.years}년, 15시 표본 ${st[p.id]?.samples ?? "?"}개)`).join(" · ")}. 진행 중인 올해는 넣지 않습니다.</li>
      <li>현재값: 기상청 초단기실황, ${esc(d.grid?.note || "격자 없음")}. 예보: 실황이 있는 시각은 실황, 그 뒤는 초단기예보(최신 발표 ${esc(d.releases?.ultra?.base?.slice(5, 16) || "없음")}), 그 뒤는 단기예보(최신 발표 ${esc(d.releases?.vilage?.base?.slice(5, 16) || "없음")}).</li>
      <li>${esc(d.asos.note)} — ASOS 마지막 날: ${esc(d.asos.lastDay || "없음")}.</li></ul></details>`;
  }
  // 시간별 그래프(SVG): 관측 = 실선, 예보 = 점선 + 음영 + '지금' 세로선, 과거 평균 3선(켜고 끄기)
  function chartCard(d, ids) {
    const svg = todaySvg(d, ids, 720, 260, state.sel);
    if (!svg) return `<section class="card"><h2>오늘 시간별 기온</h2><p class="rt-ins">그릴 자료가 없습니다</p></section>`;
    const names = { all: d.periods[0].label, r10: d.periods[1].label, r5: d.periods[2].label };
    const legend = `<div class="rt-legend"><span class="lg-obs">━ 실황(관측)</span><span class="lg-fc">┅ 예보</span>${["all", "r10", "r5"].filter((k) => ids.includes(k)).map((k) => `<button type="button" data-line="${k}" aria-pressed="${state.show[k]}" style="--c:${COLORS[k]}" class="${state.show[k] ? "on" : ""}">${esc(names[k])}</button>`).join("")}</div>`;
    return `<section class="card rt-chart"><h2>오늘 시간별 기온과 과거 평균</h2>${legend}<div class="rt-svg-wrap" id="rtChartHost">${svg}${window.ChartFull ? window.ChartFull.button() : ""}</div><div id="rtTip" class="rt-tip">${tipHtml(d, state.sel ?? lastObsHour(d) ?? 12, ids)}</div><p class="rt-note">관측과 예보는 이어 그리지 않습니다. 그래프를 누르거나 마우스를 올리면 그 시각의 값과 기준별 차이를 보여 줍니다.</p></section>`;
  }
  const lastObsHour = (d) => { const h = [...d.hours].reverse().find((x) => x.obs != null); return h ? h.hour : null; };
  // 시간별 기온 SVG(카드 = 720×260 viewBox, 크게 보기 = 겹친 화면 크기로 다시 그림). 가로 위치 → 시각은 todayHourAt
  const TL = 38, TR = 10;
  const todayHourAt = (fr, W) => Math.max(0, Math.min(23, Math.round(((fr * W - TL) / (W - TL - TR)) * 23)));
  function todaySvg(d, ids, W, H, sel) {
    const L = TL, R = TR, T = 14, B = 26;
    const hrs = d.hours;
    const lines = ["all", "r10", "r5"].filter((k) => ids.includes(k) && state.show[k]);
    const vals = [];
    for (const h of hrs) { if (h.obs != null) vals.push(h.obs); if (h.fcst != null) vals.push(h.fcst); for (const k of lines) if (h.base[k] != null) vals.push(h.base[k]); }
    if (!vals.length) return "";
    let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
    const x = (h) => L + (h / 23) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const path = (pts) => { let s = "", pen = false; for (const [h, v] of pts) { if (v == null) { pen = false; continue; } s += `${pen ? "L" : "M"}${x(h).toFixed(1)},${y(v).toFixed(1)}`; pen = true; } return s; };
    const lastObs = [...hrs].reverse().find((h) => h.obs != null);
    const nowH = lastObs ? lastObs.hour : null;
    const ticks = []; const step = hi - lo > 12 ? 4 : 2;
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    const fpts = hrs.map((h) => [h.hour, h.fcst]);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="rt-svg" role="img" aria-label="오늘 시간별 기온: 관측 실선, 예보 점선, 과거 평균">`;
    if (nowH != null && nowH < 23) svg += `<rect x="${x(nowH)}" y="${T}" width="${x(23) - x(nowH)}" height="${H - T - B}" fill="#e8f3ff" opacity=".6"/><line x1="${x(nowH)}" x2="${x(nowH)}" y1="${T}" y2="${H - B}" stroke="#026ef8" stroke-dasharray="2 3"/><text x="${x(nowH) + 4}" y="${T + 11}" font-size="11" fill="#026ef8">지금 · 이후 예보</text>`;
    for (const t of ticks) svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e0e8f4"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5e7090">${t}</text>`;
    for (let h = 0; h < 24; h += 3) svg += `<text x="${x(h)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5e7090">${h}시</text>`;
    for (const k of lines) svg += `<path d="${path(hrs.map((h) => [h.hour, h.base[k]]))}" fill="none" stroke="${COLORS[k]}" stroke-width="1.6" opacity=".85"/>`;
    svg += `<path d="${path(fpts)}" fill="none" stroke="${COLORS.fcst}" stroke-width="2.4" stroke-dasharray="6 4"/>`;
    for (const h of hrs) if (h.fcst != null) svg += `<circle cx="${x(h.hour)}" cy="${y(h.fcst)}" r="2.6" fill="#fff" stroke="${COLORS.fcst}" stroke-width="1.5"/>`;
    svg += `<path d="${path(hrs.map((h) => [h.hour, h.obs]))}" fill="none" stroke="${COLORS.obs}" stroke-width="2.6"/>`;
    for (const h of hrs) if (h.obs != null) svg += `<circle cx="${x(h.hour)}" cy="${y(h.obs)}" r="2.6" fill="${COLORS.obs}"/>`;
    if (sel != null) svg += `<line class="rt-sel" x1="${x(sel)}" x2="${x(sel)}" y1="${T}" y2="${H - B}" stroke="#0d1b3d" opacity=".35"/>`;
    svg += `<rect class="rt-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
    return svg;
  }
  function tipHtml(d, hour, ids) {
    const h = d.hours[hour];
    if (!h) return "";
    const v = h.obs ?? h.fcst;
    const kind = h.obs != null ? "실황" : h.fcst != null ? `${h.fcstSource}(${h.fcstBase.slice(11, 16)} 발표)` : "자료 없음";
    return `<b>${hour}시</b> ${kind}${v != null ? ` <b>${v}℃</b>` : ""} · ${["all", "r10", "r5"].filter((k) => ids.includes(k)).map((k, i) => `${esc(d.periods[["all", "r10", "r5"].indexOf(k)].label.replace(" 평균", ""))} ${h.base[k] == null ? "부족" : `${h.base[k]}℃${v != null ? `(${sg(Math.round((v - h.base[k]) * 10) / 10)})` : ""}`}`).join(" · ")}`;
  }
  function bindChart() {
    const hit = document.querySelector("#rtOut .rt-hit");
    if (!hit) return;
    const svg = hit.ownerSVGElement;
    const pick = (ev) => {
      const r = svg.getBoundingClientRect();
      const h = todayHourAt((ev.clientX - r.left) / r.width, 720);
      if (h === state.sel) return;
      state.sel = h;
      $("rtTip").innerHTML = tipHtml(state.data, h, NWBasis.ids(NWBasis.today()));
    };
    svg.addEventListener("pointermove", pick);
    svg.addEventListener("pointerdown", pick);
    // 크게 보기(chart-full.js 공통): 겹친 화면 크기로 다시 그리고, 툴팁은 그래프 위에
    const host = $("rtChartHost");
    if (host && window.ChartFull) {
      window.ChartFull.register(host, {
        hostClass: "rt-fs",
        title: () => `오늘 시간별 기온과 과거 평균 — ${state.data.station.name}`,
        sub: () => `${state.data.date} · 관측 실선, 예보 점선 · 단위 ℃`,
        legend: () => window.RTFull.legend(host.closest(".card")),
        source: () => "자료: 기상청 초단기실황·초단기/단기예보, 과거 평균 ASOS · 시간대 Asia/Seoul",
        render: (el, size) => {
          const d = state.data, ids = NWBasis.ids(NWBasis.today());
          const W = size.width, sel = state.sel ?? lastObsHour(d) ?? 12;
          window.RTFull.draw(el, todaySvg(d, ids, W, size.height, sel), (fr) => todayHourAt(fr, W), (h) => (TL + (h / 23) * (W - TL - TR)).toFixed(1), (h) => tipHtml(d, h, ids), sel);
        },
      });
    }
  }
  // rt.js·rt-forecast.js 가 함께 쓰는 '크게 보기' 그리기(겹친 화면 안 SVG + 툴팁 + 탭/마우스로 시각 고르기)
  window.RTFull = {
    legend(card) {
      const lg = card && card.querySelector(".rt-legend");
      if (!lg) return null;
      const c = lg.cloneNode(true);
      c.querySelectorAll("button").forEach((b) => { const sp = document.createElement("span"); sp.className = `rt-lgk ${b.className}`; sp.setAttribute("style", b.getAttribute("style") || ""); sp.textContent = b.textContent; b.replaceWith(sp); });
      return c;
    },
    // svg: sel 세로선(.rt-sel)을 포함해 그린 문자열, idxAt(가로 비율) → 칸, xAt(칸) → viewBox x
    draw(el, svg, idxAt, xAt, tipAt, sel0) {
      el.innerHTML = `${svg}<div class="rt-fs-tip" role="status">${tipAt(sel0)}</div>`;
      const s = el.querySelector("svg"), tip = el.querySelector(".rt-fs-tip"), ln = s.querySelector(".rt-sel");
      let cur = sel0;
      const pick = (ev) => {
        const i = idxAt(window.ChartFull.frac(ev, s));
        if (i === cur) return;
        cur = i;
        tip.innerHTML = tipAt(i);
        if (ln) { ln.setAttribute("x1", xAt(i)); ln.setAttribute("x2", xAt(i)); }
      };
      s.addEventListener("pointermove", pick);
      s.addEventListener("pointerdown", pick);
    },
  };
  window.RT = { show, station: () => state.station };
})();
