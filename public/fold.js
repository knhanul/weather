// 좁은 화면(≤800px): 조회 조건 묶음을 한 줄 요약 막대로 접기('서울(108) · 10월 · 평균기온 · 조건 변경 ▾'), 누르면 그 자리에서 펼침.
// 넓은 화면에서는 막대가 보이지 않고(fold.css) 조건도 그대로 보임 → 데스크톱 화면은 바뀌지 않음.
// 요약은 조건 칸의 select·입력값·선택된 버튼에서 읽음(주소·선택값은 원래 코드가 그대로 관리).
(() => {
  const mq = matchMedia("(max-width:800px)");
  // [화면, 감출 조건 묶음(선택자들), 막대 모양(card|in-card), 이 버튼을 누르면 다시 접기]
  const REG = [
    { id: "ov", page: "dash", els: ["#tabOverview .controls"], kind: "in-card" },
    { id: "yx", page: "dash", els: ["#tabYearly > .card:first-child"], kind: "card" },
    { id: "rx", page: "dash", els: ["#tabRegion > .card:first-child"], kind: "card" },
    { id: "lx", page: "dash", els: ["#tabLife > .card:first-child"], kind: "card" },
    { id: "rc", page: "dash", els: ["#tabRecords > .card:first-child"], kind: "card" },
    { id: "h", page: "hourly", els: ["#hourly .card > .row", "#hBar"], kind: "in-card", collapseOn: "#hQuery" },
    { id: "d", page: "daily", els: ["#daily .card > .row", "#dBar"], kind: "in-card", collapseOn: "#dQuery" },
    { id: "x", page: "download", els: ["#download > .card:first-of-type"], kind: "card" },
    { id: "sd", page: "sday", els: ["#dsCtl"], kind: "in-card", collapseOn: "#dsGo" },
    { id: "g", page: "gaps", els: ["#gaps .card:first-child > p.muted:first-of-type", "#gaps .card:first-child > .controls", "#gaps .g-range"], kind: "in-card", collapseOn: "#gApply" },
  ];
  const open = new Map(); // id → 펼침 여부(이번 방문 동안)
  const short = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const stationFmt = (t) => t.replace(/^(\d{2,4}) ([^·\s]+)(?:\s*·.*)?$/, "$2($1)");
  const unitless = (t) => t.replace(/\s*\((?:°C|℃|mm|cm|%|m\/s|일|시간)\)\s*$/, "");
  // 조건 묶음에서 요약 조각 모으기(문서 순서). '~' 로 이어진 두 칸은 'a–b' 로 합침.
  function tokens(root) {
    const out = [];
    const nodes = root.querySelectorAll("select, input[type=date], input[type=datetime-local], input[type=number], input[type=checkbox], .seg button.on, .sx-sub a.on, .vw-toggle button.on, button.on[data-mode]");
    let joinNext = false;
    for (const n of nodes) {
      if (n.closest("[hidden]") || n.closest(".fold-bar") || n.closest(".x-layout-edit") || n.disabled && n.tagName === "INPUT") continue;
      let t = "";
      if (n.tagName === "SELECT") t = n.selectedOptions[0] ? n.selectedOptions[0].textContent : "";
      else if (n.type === "checkbox") { if (!n.checked) continue; t = n.closest("label") ? n.closest("label").textContent : ""; }
      else if (n.tagName === "INPUT") t = n.type === "datetime-local" ? n.value.replace(/^\d{4}-(\d\d)-(\d\d)T(\d\d:\d\d)$/, "$1/$2 $3") : n.type === "date" ? n.value.replace(/^\d{4}-(\d\d)-(\d\d)$/, "$1/$2") : n.value;
      else t = (n.childNodes[0] && n.childNodes[0].nodeType === 3 ? n.childNodes[0].textContent : n.textContent);
      t = unitless(stationFmt(short(t).replace(/(지연|자료 없음)$/, "").trim()));
      if (!t) continue;
      if (joinNext && out.length) out[out.length - 1] += `–${t.replace(/년$/, "")}`;
      else out.push(t.replace(/^(\d{4})년$/, "$1"));
      const nx = n.nextElementSibling;
      joinNext = !!(nx && nx.classList.contains("tilde"));
    }
    return out;
  }
  const SUM = {
    ov: () => {
      const st = document.querySelector("#stSel button.on");
      const pr = document.querySelector("#periodSel button.on");
      const f = document.getElementById("chFrom").value, t = document.getElementById("chTo").value;
      return [st ? stationFmt(short(st.childNodes[0] ? st.childNodes[0].textContent : st.textContent)) : "", pr ? short(pr.textContent) : f && t ? `${f.slice(5).replace("-", "/")}–${t.slice(5).replace("-", "/")}` : ""].filter(Boolean);
    },
    x: (els) => {
      const k = document.getElementById("xKind"), l = document.getElementById("xLayoutSelect");
      const ro = document.getElementById("download").classList.contains("dl-readonly");
      return [k && k.selectedOptions[0] ? short(k.selectedOptions[0].textContent).replace(/\s*\(.*\)$/, "") : "", l && l.selectedOptions[0] ? short(l.selectedOptions[0].textContent) : "", ro ? "읽기 전용 · 로그인하면 편집" : ""].filter(Boolean);
    },
  };
  // 시간별·일별 날씨: '서울(108) · 10/10 00:00–23:00 · 기본 구성 · 카드'
  const viewSum = (k) => () => {
    const $ = (id) => document.getElementById(id);
    const st = $(`${k}Station`), f = $(`${k}From`).value, t = $(`${k}To`).value;
    const md = (v) => v.slice(5, 10).replace("-", "/");
    let range = "";
    if (f && t) {
      if (k === "h") range = f.slice(0, 10) === t.slice(0, 10) ? `${md(f)} ${f.slice(11, 16)}–${t.slice(11, 16)}` : `${md(f)} ${f.slice(11, 16)}–${md(t)} ${t.slice(11, 16)}`;
      else range = f === t ? md(f) : `${f.slice(0, 4) === t.slice(0, 4) ? md(f) : f}–${f.slice(0, 4) === t.slice(0, 4) ? md(t) : t}`;
    }
    const bar = $(`${k}Bar`);
    const lay = bar && bar.querySelector("select");
    const mode = bar && bar.querySelector(".vw-toggle button.on, .vw-toggle [aria-pressed=true]");
    return [st && st.selectedOptions[0] ? stationFmt(short(st.selectedOptions[0].textContent)) : "", range, lay && lay.selectedOptions[0] ? short(lay.selectedOptions[0].textContent) : "", mode ? short(mode.textContent) : ""].filter(Boolean);
  };
  SUM.h = viewSum("h");
  SUM.d = viewSum("d");
  // 날짜로 보는 날씨: '서울(108) · 양력 2025-10-18 · 최근 10년'
  SUM.sd = () => {
    const $ = (id) => document.getElementById(id);
    // 특정일 모드(#/stories/day?...&ev=csat): '서울(108) · 수능일 · 1994년부터'
    const evOn = document.querySelector("#dsCtl [data-evk].on");
    if (evOn && !$("dsDate")) {
      const stE = $("dsSt"), from = $("dsEvFrom"), sel = $("dsEvName");
      const stT = stE && stE.selectedOptions[0] ? short(stE.selectedOptions[0].textContent).replace(/^(.+?) \((\d+)\).*$/, "$1($2)") : "";
      const nm = sel && sel.value ? sel.value : short(evOn.textContent);
      return [stT, nm, from && from.value ? `${from.value}년부터` : ""].filter(Boolean).map((t) => t.replace(/ /g, "\u00a0"));
    }
    const stS = $("dsSt"), per = $("dsPer"), dt = $("dsDate");
    const cal = document.querySelector("#dsCtl [data-cal].on");
    const leap = $("dsLeap");
    const stT = stS && stS.selectedOptions[0] ? short(stS.selectedOptions[0].textContent).replace(/^(.+?) \((\d+)\).*$/, "$1($2)") : "";
    const dT = [cal ? short(cal.textContent) : "", dt ? dt.value : "", leap && leap.checked ? "(윤달)" : ""].filter(Boolean).join(" ");
    const pT = per && per.value === "custom" ? `${($("dsFrom") || {}).value || ""}–${($("dsTo") || {}).value || ""}` : per && per.selectedOptions[0] ? short(per.selectedOptions[0].textContent) : "";
    return [stT, dT, pT].filter(Boolean).map((t) => t.replace(/ /g, "\u00a0")); // 조각 안에서는 줄을 바꾸지 않음
  };
  const BTN = { x: "레이아웃 바꾸기", g: "범위 변경" };
  // 한 번 감싼 뒤에는 막대가 첫 자식이 되어 ':first-child' 선택자가 빗나가므로 잡아 둔 요소를 씀(패널을 새로 그려 떨어져 나가면 다시 찾음)
  const held = new Map();
  function regEls(r) {
    const h = held.get(r.id);
    if (h && h.every((e) => e.isConnected)) return h;
    return r.els.map((s) => document.querySelector(s)).filter(Boolean);
  }
  const READY = "select, input, .seg button, .sx-sub a";
  let seq = 0;
  function wrap(r) {
    const h = held.get(r.id);
    if (h && h.every((e) => e.isConnected)) return h;
    const els = r.els.map((s) => document.querySelector(s)).filter(Boolean);
    if (els.length !== r.els.length || !els.some((e) => e.matches(READY) || e.querySelector(READY))) return null; // 아직 '불러오는 중' 카드
    document.querySelector(`[data-fold-bar="${r.id}"]`)?.remove();
    held.set(r.id, els);
    for (const el of els) { el.dataset.fold = r.id; if (!el.id) el.id = `fold-${r.id}-${++seq}`; }
    const bar = document.createElement("div");
    bar.className = `fold-bar fold-${r.kind}`;
    bar.dataset.foldBar = r.id;
    bar.innerHTML = `<span class="fold-sum" id="foldSum-${r.id}"></span><button type="button" class="fold-btn sec" aria-expanded="false" aria-controls="${els.map((e) => e.id).join(" ")}" aria-describedby="foldSum-${r.id}"><span class="fold-lbl">${BTN[r.id] || "조건 변경"}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
    els[0].before(bar);
    bar.querySelector("button").addEventListener("click", () => setOpen(r, !open.get(r.id)));
    // 조건 칸을 다시 그리는 화면(날짜로 보는 날씨)도 있어 버튼에 직접 달지 않고 문서에서 위임
    if (r.collapseOn && !r.bound) { r.bound = true; document.addEventListener("click", (e) => { if (mq.matches && e.target.closest && e.target.closest(r.collapseOn)) setTimeout(() => setOpen(r, false, true), 0); }); }
    const mo = new MutationObserver(() => schedule(r));
    for (const el of els) {
      mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
      el.addEventListener("change", () => schedule(r));
      el.addEventListener("input", () => schedule(r));
      el.addEventListener("click", () => schedule(r));
    }
    setOpen(r, !!open.get(r.id));
    return els;
  }
  function setOpen(r, v, focusBar) {
    open.set(r.id, v);
    const els = regEls(r);
    const bar = document.querySelector(`[data-fold-bar="${r.id}"]`);
    for (const el of els) el.classList.toggle("fold-collapsed", !v);
    if (bar) {
      const b = bar.querySelector("button");
      b.setAttribute("aria-expanded", String(v));
      bar.classList.toggle("open", v);
      b.querySelector(".fold-lbl").textContent = v ? "접기" : BTN[r.id] || "조건 변경";
      if (focusBar && document.activeElement && document.activeElement.closest && els.some((e) => e.contains(document.activeElement))) b.focus({ preventScroll: true });
    }
    schedule(r);
  }
  const pending = new Set();
  function schedule(r) {
    pending.add(r);
    requestAnimationFrame(() => {
      for (const x of pending) summary(x);
      pending.clear();
    });
  }
  function summary(r) {
    const el = document.getElementById(`foldSum-${r.id}`);
    if (!el) return;
    const els = regEls(r);
    const t = SUM[r.id] ? SUM[r.id](els) : els.flatMap(tokens);
    const txt = t.slice(0, 7).join(" · ") || "조건";
    if (el.textContent !== txt) el.textContent = txt; // 같으면 건드리지 않음(관찰자 되먹임 방지)
    if (el.title !== t.join(" · ")) el.title = t.join(" · ");
  }
  function refresh() {
    for (const r of REG) {
      const was = held.get(r.id);
      const els = wrap(r);
      if (els && els !== was) schedule(r);
    }
  }
  // 공식 최신 시각(머리 칩)을 앱 막대 오른쪽에 작게 — 좁은 화면에서는 조회 화면의 파란 머리를 숨기므로
  function syncMeta() {
    const m = document.getElementById("abMeta");
    const c = document.querySelector("#phChips li:first-child .chip");
    // 5단계: 이 시각은 ASOS 공식 시간자료가 나온 최신 정시(보통 어제 23시)이지 지금 실황 시각이 아님 → 'ASOS' 로 밝혀 씀
    if (!m) return;
    const t = c ? short(c.textContent).replace(/^공식\s*/, "").replace(/^최신\s*/, "") : "";
    m.textContent = t ? `ASOS ${t}` : "";
    m.title = t ? `기상청 ASOS 공식 관측자료가 제공된 최신 시각 ${t} (KST). 지금 실황(초단기실황) 시각과는 달라요.` : "";
    m.setAttribute("aria-label", t ? `ASOS 공식 관측자료 최신 제공 시각 ${t}` : "ASOS 공식 관측자료 최신 제공 시각");
  }
  window.NWFold = { refresh, setOpen: (id, v) => { const r = REG.find((x) => x.id === id); if (r) setOpen(r, v); }, isOpen: (id) => !!open.get(id) };
  const chips = document.getElementById("phChips");
  if (chips) new MutationObserver(syncMeta).observe(chips, { childList: true, subtree: true, characterData: true });
  syncMeta();
  addEventListener("hashchange", () => setTimeout(refresh, 0));
  // stats.js 가 패널을 늦게 그리므로 패널 안이 바뀌면 다시 찾음
  const main = document.querySelector("main");
  if (main) new MutationObserver((list) => {
    if (list.every((m) => m.target.closest && m.target.closest(".fold-bar"))) return; if (REG.some((r) => { const h = held.get(r.id); return !h || !h.every((e) => e.isConnected); })) refresh(); }).observe(main, { childList: true, subtree: true });
  refresh();
})();
