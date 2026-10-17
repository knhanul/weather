// 5단계: 기존 메뉴에 '지금·앞으로' 카드 붙이기(기존 화면·계산은 그대로, 아래/위에 따로 붙임) + 시간별·일별 날씨의 실황·예보 원자료 탭.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  const cls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
  const ids = () => (window.NWBasis ? NWBasis.ids(NWBasis.get()) : ["all", "r10", "r5"]);
  const pick = (list) => (list || []).filter((p) => ids().includes(p.id));
  const short = (l) => String(l || "").replace(" 평균", "");
  const hashP = () => new URLSearchParams(location.hash.split("?")[1] || "");
  function station() {
    const h = hashP().get("station");
    if (h && /^\d+$/.test(h)) return h;
    if (window.Stats && Stats.station && Stats.station()) return String(Stats.station());
    try { const v = JSON.parse(localStorage.getItem("nw.station") || "null"); if (v && v.id) return String(v.id); } catch { /* */ }
    return "108";
  }
  const cache = new Map();
  async function get(u) {
    const c = cache.get(u);
    if (c && Date.now() - c.at < 60000) return c.d;
    const r = await fetch(u);
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.message || "불러오지 못했습니다");
    cache.set(u, { at: Date.now(), d });
    return d;
  }
  const cmpRow = (periods, key = "diff", unit = "℃") => `<p class="rt-basis-row">${pick(periods).map((p) => `<span>${esc(short(p.label))} <small>${esc(p.range)}</small> ${p.mean != null ? `${p.mean}${unit} ` : ""}<b class="${cls(p[key])}">${p[key] == null ? "비교 데이터 부족" : sg(p[key], unit)}</b></span>`).join("")}</p>`;
  const head = (t, sub) => `<h2 class="rtx-h">${esc(t)} <span class="rt-badge fc">실황·예보</span>${sub ? `<small>${esc(sub)}</small>` : ""}</h2>`;
  const wrap = (inner) => `<section class="card rtx-card">${inner}</section>`;
  const fail = (e) => wrap(`<p class="rt-ins">${esc(e.message || e)}</p>`);

  // ---------------------------------------------------------------- 탭별 카드
  async function overview(st) {
    const [t, f] = await Promise.all([get(`/api/rt/today?station=${st}`), get(`/api/rt/forecast?station=${st}`)]);
    const c = t.current;
    const now = c?.values && c.freshness.state === "fresh" ? `<div class="rtx-ov-i"><span>지금 ${esc(c.time.slice(11, 16))} 실황</span><b>${c.values.ta}℃</b>${cmpRow(c.compare.ta)}</div>` : `<div class="rtx-ov-i"><span>지금</span><b class="rt-ins">${esc(c?.freshness?.text || "실황 없음")}</b></div>`;
    const w = f.week;
    const wk = w ? `<div class="rtx-ov-i"><span>이번 주(관측 ${w.obsDays}일 + 예보 ${w.fcDays}일) 기온</span><b>${w.anomaly[0].diff == null ? "–" : `${sg(w.anomaly[0].diff)}`}</b>${cmpRow(w.anomaly)}</div>` : "";
    return `<section class="card rtx-card rtx-ov"><div class="rtx-ov-g">${now}${wk}</div><p class="rtx-links"><a href="#/today?station=${st}">오늘 날씨 ›</a><a href="#/forecast?station=${st}">내일 날씨 ›</a></p></section>`;
  }
  async function yearly(st) {
    const d = await get(`/api/rt/ytd?station=${st}`);
    if (!d.items?.length) return wrap(head("올해 지금까지") + `<p class="rt-ins">${esc(d.message || "자료 없음")}</p>`);
    return wrap(head(`올해 1/1~${d.asOf.slice(5)} 누적`, "같은 누적 기간 과거 평균과 비교 · 끝난 날까지만") + d.items.map((it) => `<div class="rtx-row"><span>${esc(it.label)}</span><b>${it.value == null ? `<span class="rt-ins">자료 부족(${it.current.missing}일 결측)</span>` : `${it.value}${it.unit}`}</b>${cmpRow(it.periods, "diff", it.unit)}${it.periods[0].rankHigh ? `<small>1990년 이후 ${it.periods[0].of}개 해 중 높은 쪽 ${it.periods[0].rankHigh}위</small>` : ""}</div>`).join("") + `<p class="rt-note">${esc(d.rule)} 출처: ${esc(d.source)}.</p>`);
  }
  async function region() {
    const d = await get(`/api/rt/regions`);
    // 기준 선택(NWBasis)의 대표 기준으로 순위를 고름(서버가 3개 기준 순위를 모두 줌). 예전 응답이면 1990년 이후
    const id0 = ids()[0] || "all";
    const R = d.rankings?.[id0] || { aboveAvg: d.rankAboveAvg || d.rankAnomaly || [], deviation: d.rankDeviation || [] };
    const per = (d.periods || []).find((p) => p.id === id0);
    const perTxt = per ? `${short(per.label)}(${per.range})` : "1990년 이후";
    const rows = d.rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.temp == null ? `<span class="rt-ins">${esc(r.note)}</span>` : `${r.temp}℃`}</td>${pick(d.periods.map((p) => ({ ...p }))).map((p) => `<td>${r.diffs ? `<span class="${cls(r.diffs[p.id])}">${sg(r.diffs[p.id])}</span>` : "–"}</td>`).join("")}<td>${r.percentile ?? "–"}</td></tr>`).join("");
    // 순위는 글자로(동률 = '공동 n위')
    const rk = (list, f) => list.length ? `<ol class="rtx-rank rtx-rankx">${list.map((x) => { const tie = list.filter((y) => y.rank === x.rank).length > 1; return `<li><span class="rk">${tie ? "공동 " : ""}${x.rank}위</span> ${esc(x.name)} <b>${f(x)}</b></li>`; }).join("")}</ol>` : `<p class="rt-ins">비교 가능한 지점이 없습니다</p>`;
    const of = (list) => `비교 가능한 ${list.length}개 지점 중`;
    const dev = (x) => `${x.direction === "high" ? "더운 쪽" : x.direction === "low" ? "추운 쪽" : "가운데"} · 백분위 ${x.percentile}`;
    const tm = d.time ? `${d.time.slice(11, 16)} 실황` : `${d.now} 실황`;
    const exc = (d.excluded || []).length ? `<p class="rt-ins">${d.excluded.map((x) => `${esc(x.name)}: ${esc(x.reason)}`).join(" · ")}</p>` : "";
    return wrap(head("지금 지역별 기온", tm) + `<div class="rtx-3"><div><h3>지금 기온 높은 순</h3><small>${of(d.rankTemp || [])}</small>${rk(d.rankTemp || [], (x) => `${x.temp}℃`)}</div><div><h3>평균보다 높은 순</h3><small>${of(R.aboveAvg)} · ${esc(perTxt)} 같은 시기·시각 평균과의 차이</small>${rk(R.aboveAvg, (x) => `${sg(x.diff)}`)}</div><div><h3>평소에서 크게 벗어난 순</h3><small>${of(R.deviation)} · 백분위가 50에서 먼 순서(더운 쪽·추운 쪽 모두)</small>${rk(R.deviation, dev)}</div></div>${exc}<div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>지역</th><th>지금</th>${pick(d.periods).map((p) => `<th>${esc(short(p.label))} 대비</th>`).join("")}<th>백분위</th></tr></thead><tbody>${rows}</tbody></table></div><p class="rt-note">${esc(d.note)}</p>`);
  }
  async function life(st) {
    const d = await get(`/api/rt/life?station=${st}`);
    return wrap(head("지금·앞으로의 생활 날씨", `${d.station.name} · ${d.now}`) + `<div class="rtx-qs">${d.items.map((it) => `<article class="rtx-q"><h3>${esc(it.q)}</h3>${it.answer == null ? `<p class="rt-ins">${esc(it.note)}</p>` : `<p class="rtx-a"><b>${esc(it.answer)}</b>${it.value != null ? ` <span>${esc(it.value)}${esc(it.unit || "")}</span>` : ""} <span class="rt-badge ${it.kind === "관측" ? "ok" : "fc"}">${esc(it.kind || "")}</span></p>${it.id === "running" && it.checks ? `<p class="rt-basis-row rtx-checks">${it.checks.map((c) => `<span class="ck-${esc(c.status)}">${esc(c.label)} ${c.status === "pass" ? "✓ 맞음" : c.status === "fail" ? "✗ 맞지 않음" : "? 자료 없음"}${c.value != null ? ` <small>${esc(c.value)}</small>` : ""}</span>`).join("")}</p>` : ""}${it.id === "heat-start" && it.event ? `<p class="rt-note">${it.event.date ? `올해 첫날 ${esc(it.event.date)} · ${it.event.firstConfirmed ? "1/1부터 빠진 날 없이 확인" : `그 전 ${it.event.missingBeforeEvent}일 자료 없음 — 확인 가능한 자료에서 처음`}` : `아직 확인되지 않음(1/1부터 자료 ${Math.round((it.event.coverage ?? 0) * 100)}%)`}${it.exposure && !it.homeEligible ? ` · 오늘 날씨 첫 화면에는 ${esc(it.exposure.reason)}이라 보이지 않음` : ""}</p>` : ""}${it.id === "running" ? `<p class="rt-basis-row">${pick(it.periods).map((p) => `<span>${esc(short(p.label))}: 같은 시기 이 시각 ${p.share == null ? "표본 부족" : `${p.share}%가 조건 만족`}</span>`).join("")}</p>` : it.id === "heat-start" ? `<p class="rt-basis-row">${pick(it.periods).map((p) => `<span>${esc(short(p.label))} 평균 ${p.meanDate ?? "–"} <small>(${p.hitYears}/${p.years}년)</small> ${p.diffDays == null ? "" : `<b class="${cls(-p.diffDays)}">${p.diffDays < 0 ? `${-p.diffDays}일 이름` : p.diffDays > 0 ? `${p.diffDays}일 늦음` : "같음"}</b>`}</span>`).join("")}</p>` : cmpRow(it.periods)}<p class="rt-note">${esc(it.basis || "")}</p>`}</article>`).join("")}</div>`);
  }
  async function records(st) {
    const d = await get(`/api/rt/records?station=${st}`);
    let h = head("지금·앞으로와 기록", "확정 기록 = 과거 관측, 예보는 '예상'");
    if (d.now_rank) h += `<div class="rtx-row"><span>지금 기온(${esc(d.now_rank.time.slice(11, 16))} 실황)</span><b>${d.now_rank.value}℃</b><p class="rt-basis-row">${pick(d.now_rank.periods).map((p) => `<span>${esc(short(p.label))}: ${p.rankHigh == null ? "표본 부족" : `같은 시기 이 시각 ${p.samples}개 중 높은 쪽 ${p.rankHigh}위`} · 최고 ${p.max ? `${p.max.value}℃(${esc(p.max.date)})` : "–"}</span>`).join("")}</p></div>`;
    if (d.rain1h) h += `<div class="rtx-row"><span>지금 1시간 강수량</span><b>${d.rain1h.value ?? "–"}mm</b><p class="rt-basis-row">${pick(d.rain1h.periods).map((p) => `<span>${esc(short(p.label))} 같은 시기 이 시각 최대 ${p.max ? `${p.max.value}mm(${esc(p.max.date)})` : "–"}</span>`).join("")}</p></div>`;
    h += `<div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>날짜</th><th>최고 예보</th>${pick(d.periods).map((p) => `<th>${esc(short(p.label))} 최고 기록</th>`).join("")}<th>최저 예보</th>${pick(d.periods).map((p) => `<th>${esc(short(p.label))} 최저 기록</th>`).join("")}</tr></thead><tbody>${d.days.map((x) => `<tr><th scope="row">${esc(x.date.slice(5))}</th><td>${x.max ?? "–"}℃ <small>예상</small></td>${pick(x.periods).map((p) => `<td>${p.recMax ? `${p.recMax.value}℃ <small>${esc(p.recMax.date)}</small>${p.gapMax != null && p.gapMax >= -1 ? ` <b class="up">${p.gapMax > 0 ? "넘을 수도(예상)" : "근접(예상)"}</b>` : ""}` : "–"}</td>`).join("")}<td>${x.min ?? "–"}℃ <small>예상</small></td>${pick(x.periods).map((p) => `<td>${p.recMin ? `${p.recMin.value}℃ <small>${esc(p.recMin.date)}</small>${p.gapMin != null && p.gapMin <= 1 ? ` <b class="down">${p.gapMin < 0 ? "넘을 수도(예상)" : "근접(예상)"}</b>` : ""}` : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="rt-note">${esc(d.rule)}</p>`;
    return wrap(h);
  }
  async function questions(st) {
    const [t, f] = await Promise.all([get(`/api/rt/today?station=${st}`), get(`/api/rt/forecast?station=${st}`)]);
    const c = t.current;
    const nowA = c?.values && c.freshness.state === "fresh" ? `${c.values.ta}℃ — 1990년 이후 같은 시기 평균보다 ${sg(c.compare.ta[0].diff)}` : "최신 실황이 없습니다";
    const wk = f.week?.anomaly?.[0]?.diff;
    return wrap(head("지금과 앞으로에 대한 질문") + `<div class="rtx-qs">
      <a class="rtx-q" href="#/stats/yearly?station=${st}"><span class="rt-badge ok">과거</span><h3>예전보다 더워졌을까?</h3><p>연도별 비교에서 1990년부터의 변화를 봅니다 ›</p></a>
      <a class="rtx-q" href="#/today?station=${st}"><span class="rt-badge fc">현재</span><h3>지금은 평소보다 얼마나 더울까?</h3><p class="rtx-a"><b>${esc(nowA)}</b></p>${c?.compare?.ta ? cmpRow(c.compare.ta) : ""}</a>
      <a class="rtx-q" href="#/forecast?station=${st}"><span class="rt-badge fc">미래</span><h3>이번 주는 이맘때보다 더울까?</h3><p class="rtx-a"><b>${wk == null ? "비교 데이터 부족" : Math.abs(wk) < 1 ? "이맘때 평균과 비슷할 전망" : wk > 0 ? `이맘때 평균보다 ${sg(wk)} 더울 전망` : `이맘때 평균보다 ${sg(wk)} 쌀쌀할 전망`}</b></p>${f.week ? cmpRow(f.week.anomaly) : ""}<p class="rt-note">관측 ${f.week?.obsDays ?? 0}일 + 예보 ${f.week?.fcDays ?? 0}일</p></a></div>`);
  }
  const RENDER = { overview, yearly, region, life, records, questions };
  let seq = 0;
  async function render(tab) {
    const box = $("rtx"), ov = $("rtxOv");
    if (!box || !ov) return;
    const my = ++seq;
    const st = station();
    box.innerHTML = ""; ov.innerHTML = "";
    const target = tab === "overview" ? ov : box;
    if (!RENDER[tab]) return;
    target.innerHTML = wrap(`<p class="rt-load">지금·앞으로 자료를 불러오는 중…</p>`);
    let html;
    try { html = await RENDER[tab](st); } catch (e) { html = fail(e); }
    if (my === seq) target.innerHTML = html;
  }
  function currentTab() {
    if (!document.querySelector("#dash.on")) return null;
    const h = location.hash.replace("#", "").split("?")[0] || "/";
    return { "/": "overview", "/stats/overview": "overview", "/stats/yearly": "yearly", "/stats/region": "region", "/stats/life": "life", "/stats/records": "records", "/questions": "questions" }[h] || null;
  }
  let lastKey = "";
  function tick() {
    const tab = currentTab();
    const key = tab ? `${tab}|${station()}|${NWBasis?.get?.()}` : "";
    if (key === lastKey) return;
    lastKey = key;
    if (!tab) { if ($("rtx")) $("rtx").innerHTML = ""; if ($("rtxOv")) $("rtxOv").innerHTML = ""; return; }
    render(tab);
  }
  window.addEventListener("hashchange", () => setTimeout(tick, 50));
  document.addEventListener("change", () => setTimeout(tick, 300));
  document.addEventListener("click", () => setTimeout(tick, 300));
  setInterval(tick, 1500); // 다른 스크립트가 주소를 replaceState 로만 바꾸는 경우

  // ---------------------------------------------------------------- 시간별·일별 날씨: 자료 종류 탭(기존 ASOS 원자료 화면은 그대로)
  const RAW = {
    hourly: [["asos", "ASOS 관측(기존)"], ["KMA_ULTRA_NCST", "초단기실황"], ["KMA_ULTRA_FCST", "초단기예보"], ["KMA_VILAGE_FCST", "단기예보"]],
    daily: [["asos", "ASOS 관측(기존)"], ["KMA_MID_TA", "중기기온 예보"], ["KMA_MID_LAND", "중기육상 예보"]],
  };
  // 직접 연 주소의 src= 는 기존 화면이 주소를 다시 쓰기 전에 기억해 둔다
  const pendSrc = {};
  const grab = () => { const h = location.hash.replace("#", "").split("?")[0]; const pg = { "/hourly-weather": "hourly", "/daily-weather": "daily" }[h]; const s = hashP().get("src"); if (pg && s) pendSrc[pg] = s; };
  grab();
  window.addEventListener("hashchange", grab, true);
  function rawSetup(page) {
    const sec = $(page);
    if (!sec || sec.dataset.rtRaw) return;
    sec.dataset.rtRaw = "1";
    const orig = sec.querySelector(":scope > .card");
    const bar = document.createElement("div");
    bar.className = "rtx-src seg";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "자료 종류");
    bar.innerHTML = RAW[page].map(([k, l]) => `<button type="button" role="tab" data-src="${k}" aria-selected="${k === "asos"}" class="${k === "asos" ? "on" : ""}">${esc(l)}</button>`).join("");
    const panel = document.createElement("div");
    panel.className = "card rtx-raw";
    panel.hidden = true;
    sec.insertBefore(bar, orig);
    sec.appendChild(panel);
    const sel = () => (page === "hourly" ? $("hStation") : $("dStation"))?.value || station();
    let src = "asos";
    async function show(k) {
      src = k;
      bar.querySelectorAll("button").forEach((b) => { const on = b.dataset.src === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      orig.hidden = k !== "asos";
      panel.hidden = k === "asos";
      const p = hashP();
      if (k === "asos") p.delete("src"); else p.set("src", k);
      if (location.hash.includes(page === "hourly" ? "hourly-weather" : "daily-weather")) history.replaceState(history.state, "", `${location.hash.split("?")[0]}${p.toString() ? `?${p}` : ""}`);
      if (k === "asos") return;
      const date = panel.querySelector("input[type=date]")?.value || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const st = sel();
      panel.innerHTML = `<div class="rtx-raw-ctl"><label>날짜 <input type="date" value="${date}"></label><span class="rt-badge ${k === "KMA_ULTRA_NCST" ? "ok" : "fc"}">${k === "KMA_ULTRA_NCST" ? "실황(격자)" : "예보"}</span><a class="sec-btn" href="/api/rt/raw?dataset=${k}&station=${st}&date=${date}&format=csv">CSV 내려받기</a></div><p class="rt-load">불러오는 중…</p>`;
      panel.querySelector("input").addEventListener("change", () => show(src));
      try {
        const d = await get(`/api/rt/raw?dataset=${k}&station=${st}&date=${date}`);
        if (src !== k) return;
        const rows = d.rows.slice(0, 2000);
        panel.querySelector(".rt-load").outerHTML = `<p class="rt-note">${esc(d.station.name)}(${esc(d.station.id)}) · ${esc(d.kind)} · ${d.rows.length}행${d.rows.length > rows.length ? " (화면은 2,000행까지, 전체는 CSV)" : ""}. ${esc(d.note)}</p><div class="tbl-wrap rtx-raw-t"><table class="rt-tbl"><thead><tr>${d.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${d.columns.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      } catch (e) { panel.querySelector(".rt-load").outerHTML = `<p class="rt-ins">${esc(e.message)}</p>`; }
    }
    bar.addEventListener("click", (e) => { const b = e.target.closest("[data-src]"); if (b) show(b.dataset.src); });
    const s0 = hashP().get("src") || pendSrc[page]; delete pendSrc[page];
    if (s0 && RAW[page].some((x) => x[0] === s0)) show(s0);
  }
  function rawTick() { if (document.querySelector("#hourly.on")) rawSetup("hourly"); if (document.querySelector("#daily.on")) rawSetup("daily"); }
  window.addEventListener("hashchange", () => setTimeout(rawTick, 50));
  setTimeout(rawTick, 800);
  setInterval(rawTick, 2000);
  window.RTX = { render, tick };
})();
