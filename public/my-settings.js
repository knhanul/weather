// astra 6단계: 내 설정(#/my) — 로그인 없이 이 기기(localStorage)에만 저장. 하루 구간(nw.segments)·산책·러닝 조건(nw.activity)·관심 카드(nw.interests)·기본 지점(nw.station).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const A = () => window.RTAct;
  const V = () => window.RTViz;
  let stations = null;
  const hourOpts = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? " selected" : ""}>${h}시</option>`).join("");
  const numIn = (id, v, lo, hi, step = 1, unit = "") => `<label class="ms-num"><input type="number" id="${id}" value="${v}" min="${lo}" max="${hi}" step="${step}" inputmode="decimal"> ${unit}</label>`;
  const SEGK = "nw.segments";
  const readSegs = () => (V() ? V().loadSegs() : []);
  function segRows(segs) {
    return segs.map((s, i) => `<div class="ms-seg" data-i="${i}"><input type="text" class="ms-seglab" maxlength="8" value="${esc(s.label)}" aria-label="${i + 1}번째 구간 이름"><select class="ms-segf" aria-label="${esc(s.label)} 시작 시각">${hourOpts(s.from)}</select><span>~</span><select class="ms-segt" aria-label="${esc(s.label)} 끝 시각">${hourOpts(s.to)}</select><button type="button" class="sec ms-segdel" data-msdel="${i}" aria-label="${esc(s.label)} 구간 지우기"${segs.length <= 1 ? " disabled" : ""}>지우기</button></div>`).join("");
  }
  function html() {
    const act = A(), c = act.loadCond(), it = act.loadInterests(), segs = readSegs();
    const cur = window.NWStation?.storedId?.() || window.NWStation?.stored?.()?.id || ""; // stored() = { id, why, at }
    const favN = (k) => { try { return (JSON.parse(localStorage.getItem(k) || "[]") || []).length; } catch { return 0; } };
    return `<div class="ms-wrap">
      <section class="card ms-card"><h2>이 기기에만 저장돼요</h2>${window.InfoTip.note(`이 브라우저에만 저장 · 서버로 보내지 않음`, `로그인 없이 이 브라우저(localStorage)에 저장하고 서버로 보내지 않아요. 다른 기기·브라우저에는 따로 설정해야 합니다. 바꾸면 바로 저장돼요.`, { cls: "rt-note", label: "저장 방식" })}<p class="ms-msg" id="msMsg" role="status" aria-live="polite"></p></section>
      <section class="card ms-card" aria-labelledby="msStT"><h2 id="msStT">기본 관측지점</h2>
        <p><select id="msStation" aria-label="기본 관측지점">${(stations || []).map((s) => `<option value="${esc(s.station_id)}"${String(s.station_id) === cur ? " selected" : ""}>${esc(s.station_name)}(${esc(s.station_id)})</option>`).join("") || `<option value="">불러오는 중…</option>`}</select></p>
        ${window.InfoTip.note(`처음 열 때 이 지점으로 시작`, `오늘 날씨·내일 날씨·날씨 이야기를 열 때 이 지점으로 시작해요. ${cur ? "" : "지금은 저장된 지점이 없어 위치(허용 시) 또는 서울(108)로 시작합니다."}`, { cls: "rt-note", label: "자세히" })}</section>
      <section class="card ms-card" aria-labelledby="msSegT"><h2 id="msSegT">하루 구간 <small>오늘 날씨 12시간 칸의 구간 옷차림</small></h2>
        <div id="msSegs">${segRows(segs)}</div>
        <p class="ms-acts"><button type="button" class="sec" id="msSegAdd"${segs.length >= 6 ? " disabled" : ""}>구간 더하기</button><button type="button" class="sec" id="msSegReset">기본값(출근 7~9 · 낮 12~15 · 퇴근 18~20 · 밤 21~6)</button></p>
        ${window.InfoTip.note(`이름 8자 · 최대 6개`, `이름은 8자까지, 최대 6개. 끝 시각이 시작보다 이르면 다음 날까지(예: 밤 21~6시). 시작과 끝이 같으면 저장하지 않아요.`, { cls: "rt-note", label: "자세히" })}</section>
      <section class="card ms-card" aria-labelledby="msActT"><h2 id="msActT">산책·러닝 조건 <small>오늘 날씨 ‘산책·러닝 시간 찾기’</small></h2>
        <div class="ms-grid">
          <span>기온</span><span>${numIn("msTMin", c.tMin, -20, 35, 1, "℃")} ~ ${numIn("msTMax", c.tMax, -10, 40, 1, "℃")}</span>
          <span>풍속</span><span>${numIn("msWind", c.wind, 1, 15, 0.5, "m/s 이하")}</span>
          <span>강수확률</span><span>${numIn("msPop", c.popMax, 0, 100, 10, "% 미만")}</span>
          <span>연속 시간</span><span>${numIn("msRun", c.minRun, 1, 6, 1, "시간 이상")}</span>
          <span>선호 시간대</span><span><select id="msPf" aria-label="선호 시작 시각">${hourOpts(c.prefFrom)}</select> ~ <select id="msPt" aria-label="선호 끝 시각">${hourOpts(c.prefTo)}</select></span>
          <span>찾을 범위</span><span><select id="msHours" aria-label="앞으로 몇 시간"><option value="12"${c.hours === 12 ? " selected" : ""}>앞으로 12시간</option><option value="24"${c.hours === 24 ? " selected" : ""}>앞으로 24시간</option></select></span>
        </div>
        <p class="ms-acts"><button type="button" class="sec" id="msActReset">기본값(10~25℃ · 5m/s · 30% · 2시간 · 6~21시 · 24시간)</button></p>
        ${window.InfoTip.note(`강수 없음은 늘 조건`, `강수형태 ‘없음’과 강수량 0(강수없음)은 늘 조건이에요. 선호 시간대는 순서만 바꿔요(맞는 구간이 선호 시간과 겹치면 먼저 보여 줌).`, { cls: "rt-note", label: "자세히" })}</section>
      <section class="card ms-card" aria-labelledby="msIntT"><h2 id="msIntT">관심 카드 <small>오늘 날씨에 보일 것</small></h2>
        <div class="ms-ints">${act.INTERESTS.map(([k, lab, why]) => `<label class="ms-int"><input type="checkbox" data-int="${k}"${it[k] ? " checked" : ""}> <b>${esc(lab)}</b><small>${esc(why)}</small></label>`).join("")}</div></section>
      <section class="card ms-card" aria-labelledby="msFavT"><h2 id="msFavT">즐겨찾기</h2><p class="rt-note">날짜로 보는 날씨 ${favN("nw.fav.day")}개 · 날씨 배틀 ${favN("nw.fav.battle")}개 — 각 화면의 ☆ 버튼으로 더하고 지워요.</p>
        <p class="ms-acts"><button type="button" class="sec" id="msClear">이 기기 설정 모두 지우기</button></p><p class="rt-note">하루 구간·산책 조건·관심 카드를 기본값으로 되돌려요(즐겨찾기·지점은 그대로).</p></section>
    </div>`;
  }
  const say = (t) => { const m = $("msMsg"); if (m) { m.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { if (m.isConnected) m.textContent = ""; }, 2600); } };
  function saveSegs() {
    const rows = [...document.querySelectorAll("#msSegs .ms-seg")];
    const segs = rows.map((r, i) => ({ id: `s${i}`, label: r.querySelector(".ms-seglab").value.trim().slice(0, 8) || `구간${i + 1}`, from: +r.querySelector(".ms-segf").value, to: +r.querySelector(".ms-segt").value }));
    const bad = segs.find((s) => s.from === s.to);
    if (bad) { say(`‘${bad.label}’ 시작과 끝이 같아 저장하지 않았어요`); return false; }
    A().writeJ(SEGK, segs);
    say("하루 구간을 저장했어요");
    return true;
  }
  function saveAct() {
    const g = (id) => Number($(id).value);
    const c = { tMin: g("msTMin"), tMax: g("msTMax"), wind: g("msWind"), popMax: g("msPop"), minRun: g("msRun"), prefFrom: g("msPf"), prefTo: g("msPt"), hours: g("msHours") };
    if (![c.tMin, c.tMax, c.wind, c.popMax, c.minRun].every(Number.isFinite)) { say("숫자를 확인해 주세요"); return; }
    if (c.tMin >= c.tMax) { say("기온 범위: 아래 값이 위 값보다 작아야 해요"); return; }
    A().saveCond(c);
    const back = A().loadCond(); // 범위 밖 값은 기본값으로 되돌려 저장된 값을 보여 줌
    const changed = Object.keys(c).some((k) => c[k] !== back[k]);
    say(changed ? "일부 값이 허용 범위를 벗어나 기본값으로 저장했어요" : "산책·러닝 조건을 저장했어요");
    if (changed) { A().saveCond(back); render(); }
  }
  function render() { const el = $("mysettings"); if (el) el.innerHTML = html(); }
  function wire(el) {
    if (el.dataset.wired) return; el.dataset.wired = "1";
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "msStation") { if (t.value && window.NWStation) { NWStation.manual(t.value); say("기본 관측지점을 저장했어요"); } return; }
      if (t.closest("#msSegs")) { saveSegs(); return; }
      if (/^ms(TMin|TMax|Wind|Pop|Run|Pf|Pt|Hours)$/.test(t.id)) { saveAct(); return; }
      if (t.dataset.int) { const it = A().loadInterests(); it[t.dataset.int] = t.checked; A().saveInterests(it); say("관심 카드를 저장했어요"); }
    });
    el.addEventListener("click", (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.msdel != null) { const segs = readSegs(); segs.splice(+t.dataset.msdel, 1); A().writeJ(SEGK, segs); render(); say("구간을 지웠어요"); }
      else if (t.id === "msSegAdd") { const segs = readSegs(); if (segs.length < 6) { segs.push({ id: `s${segs.length}`, label: "새 구간", from: 10, to: 11 }); A().writeJ(SEGK, segs); render(); say("구간을 더했어요 — 이름·시각을 바꿔 보세요"); } }
      else if (t.id === "msSegReset") { A().writeJ(SEGK, null); render(); say("하루 구간을 기본값으로 되돌렸어요"); }
      else if (t.id === "msActReset") { A().saveCond(null); render(); say("산책·러닝 조건을 기본값으로 되돌렸어요"); }
      else if (t.id === "msClear") { if (!confirm("하루 구간·산책 조건·관심 카드를 이 기기에서 지울까요? (즐겨찾기·지점은 그대로)")) return; A().writeJ(SEGK, null); A().saveCond(null); A().saveInterests(null); render(); say("이 기기 설정을 지웠어요"); }
    });
  }
  async function show() {
    const el = $("mysettings"); if (!el || !A()) return;
    wire(el);
    render();
    if (!stations) {
      try { const r = await (window.NWPre?.stations || fetch("/api/stations").then((x) => x.json())); stations = (Array.isArray(r) ? r : r.data || []).filter((s) => s.enabled !== false); } catch { stations = []; }
      render();
    }
  }
  window.MySettings = { show };
})();
