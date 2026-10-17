// 6단계: 오늘의 날씨 — 이야기 엔진(/api/rt/stories)·과거 유사일(/api/rt/similar). rt.js 화면의 #rtsBox·#rtsSim 칸만 채운다.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const memo = new Map();
  const get0 = async (u) => { const r = await fetch(u); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.message || `HTTP ${r.status}`); return d; };
  const get = (u) => { const c = memo.get(u); if (c && Date.now() - c.at < 60000) return c.p; const p = get0(u); memo.set(u, { at: Date.now(), p }); p.catch(() => memo.delete(u)); return p; };
  const ymdK = (s) => `${s.slice(0, 4)}년 ${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
  // 이야기가 없을 때: 서버 emptyReason(normal | insufficient | stale | error)에 따라 말을 다르게. 'normal' 일 때만 '평소와 비슷'
  const EMPTY = {
    normal: (d) => `오늘은 평소와 크게 다른 점이 없어요(후보 ${d.candidates}개 모두 선별 기준 미달).`,
    insufficient: (d) => `비교할 자료가 부족해 오늘의 이야기를 고르지 못했습니다(후보 ${d.candidates}개).`,
    stale: (d) => `실황 자료가 늦어지고 있어 이야기를 고르지 않았습니다${d.staleNote ? ` — ${d.staleNote}` : ""}.`,
    error: (d) => `일부 자료(${(d.failedParts || []).join(", ") || "알 수 없음"})를 불러오지 못해 이야기를 고르지 못했습니다.`,
    loading: () => "이야기를 고르는 중…",
  };
  const shell = (inner) => `<section class="card rt-stories" aria-label="오늘의 날씨 이야기"><h2>오늘의 날씨 이야기</h2>${inner}</section>`;
  const emptyHtml = (reason, d = {}) => shell(`<p class="${reason === "loading" ? "rt-load" : "rt-ins"}" data-empty="${esc(reason)}">${esc((EMPTY[reason] || EMPTY.insufficient)(d))}</p>${d.dropped?.length ? `<details class="rts-why"><summary>빠진 후보</summary><p class="rt-note">${d.dropped.map((x) => `${esc(x.key)}(${esc(x.reason)})`).join(", ")}</p></details>` : ""}`);
  // 평범한 날(emptyReason=normal)의 탐색 카드 하나: 오늘과 닮은 날 / 이맘때의 하루(서버가 고름 — 숫자는 서버 값 그대로)
  const exploreHtml = (x) => (x ? `<article class="rt-story rts-explore" data-explore="${esc(x.type)}"><h3><span class="rt-badge ok">${x.type === "similar" ? "과거" : "이맘때"}</span> ${esc(x.title)}</h3><p>${esc(x.text)}</p><p class="rt-note">${x.more ? `${esc(x.more)} · ` : ""}${esc(x.basis || "")}</p></article>` : "");
  // 이야기 카드: 제목(쉬운 말) → 본문(숫자) → 묶인 강수 항목 → 접힘(방법·근거)
  const storyCard = (s, i, n) => `<article class="rt-story${i === 0 ? " is-lead" : ""}" data-rule="${esc(s.ruleId || "")}"><small class="rts-n">${i + 1}/${n}</small><h3><span class="rt-badge ${s.kind === "관측" ? "ok" : "fc"}">${esc(s.kind)}</span> ${esc(s.title)}</h3><p>${esc(s.text)}</p>${window.RTViz && s.chart ? window.RTViz.slot(s.chart) : ""}${(s.related || []).length ? `<ul class="rts-rel">${s.related.map((r) => `<li>${esc(r.title)}<small> — ${esc(r.text)}</small></li>`).join("")}</ul>` : ""}<details class="rts-how"><summary>어떻게 계산했나요</summary>${s.method ? `<p class="rt-note">${esc(s.method)}</p>` : ""}<p class="rt-note">근거: ${esc(s.basis)}</p></details></article>`;
  function storiesHtml(d) {
    // 예전 응답(emptyReason 없음)은 예전처럼 normal 로 봄
    if (!d.stories.length) {
      const r = d.emptyReason || "normal";
      if (r === "normal" && d.explore) return shell(`<p class="rt-ins" data-empty="normal">${esc(EMPTY.normal(d))} 대신 이런 이야기는 어때요?</p>${exploreHtml(d.explore)}`);
      return emptyHtml(r, d);
    }
    return `<section class="card rt-stories" aria-label="오늘의 날씨 이야기"><h2>오늘의 날씨 이야기 <small class="rts-sub">후보 ${d.candidates}개 중 ${d.stories.length}개 자동 선별</small></h2>${d.staleNote ? `<p class="rt-ins">${esc(d.staleNote)}</p>` : ""}<div class="rts-swipe">${d.stories.map((s, i) => storyCard(s, i, d.stories.length)).join("")}</div><details class="rts-why"><summary>선별 방법</summary><p class="rt-note">${esc(d.rule.text)}</p>${d.dropped.length ? `<p class="rt-note">빠진 후보: ${d.dropped.map((x) => `${esc(x.key)}(${esc(x.reason)})`).join(", ")}</p>` : ""}</details></section>`;
  }
  function simList(r) {
    if (!r.ok) return `<p class="rt-ins">${esc(r.message)}</p>`;
    const b = r.top[0];
    return `<p class="rts-lead">${r.day === "yesterday" ? "어제" : "오늘"}의 기온 변화와 가장 비슷했던 과거의 날은 <b>${ymdK(b.date)}</b>입니다.</p><ol class="rts-sim">${r.top.map((x) => `<li><b>${esc(x.date)}</b> 점수 ${x.score} <small>RMSE ${x.rmse}℃${x.dMax != null ? ` · 최고 ${x.max}℃(${x.dMax > 0 ? "+" : ""}${x.dMax}) · 최저 ${x.min}℃(${x.dMin > 0 ? "+" : ""}${x.dMin})${x.rain != null ? ` · 강수 ${x.rain}mm${x.rainMismatch ? "(강수 여부 다름)" : ""}` : ""}${x.dHm != null ? ` · 습도 ${x.dHm > 0 ? "+" : ""}${x.dHm}%` : ""}` : ""}</small></li>`).join("")}</ol>`;
  }
  function simHtml(t, y) {
    const part = (r, title) => r.unavailable ? `<div class="rts-col"><h3>${title} <span class="rt-badge fc">자료 부족</span></h3><p class="rt-ins">아직 관측 자료 없음 — ${esc(r.message)}</p></div>` : `<div class="rts-col"><h3>${title} <span class="rt-badge ${r.partial ? "fc" : "ok"}">${esc(r.kind || "")}</span></h3>${r.stale ? `<p class="rt-ins">실황이 늦어지고 있어 최신 시각이 빠졌을 수 있습니다</p>` : ""}${simList(r)}${window.RTViz ? window.RTViz.simSlot(r) : ""}${r.termsNote ? `<p class="rt-ins">${esc(r.termsNote)}</p>` : ""}<p class="rt-note">${esc(r.formula)}. 후보: 1990년~, 해마다 같은 월일 ±${r.window}일 ${r.considered ?? 0}일 중 자료 부족 ${r.excluded ?? 0}일 제외. ${esc(r.source || "")}</p></div>`;
    return `<section class="card rts-simcard" aria-label="과거 유사일"><h2>과거 유사일</h2><div class="rts-2">${part(t, "오늘(진행 중)")}${part(y, "어제(하루 전체)")}</div></section>`;
  }
  async function fill() {
    const box = $("rtsBox"), sim = $("rtsSim");
    if (!box || !sim) return;
    const st = window.RT?.station?.() || "108";
    if (box.dataset.done === st) return;
    box.dataset.done = st; sim.dataset.done = st;
    const G = window.RTGet || get;
    // 이야기: 히어로 한 줄에 쓰므로 바로. 과거 유사일(오늘·어제): 그 칸이 보일 때
    if (!box.innerHTML.trim()) box.innerHTML = emptyHtml("loading");
    G(`/api/rt/stories?station=${st}`).then((v) => { if ($("rtsBox") !== box) return; box.innerHTML = storiesHtml(v); if (window.RTViz) window.RTViz.mount(box); document.dispatchEvent(new CustomEvent("rt:stories", { detail: v })); }).catch((e) => { if ($("rtsBox") === box) box.innerHTML = emptyHtml("error", { failedParts: [String(e?.message || "응답 없음").slice(0, 60)] }); });
    sim.innerHTML = `<section class="card"><p class="rt-load">과거 유사일 찾는 중…</p></section>`;
    const run = async () => {
      const [t, y] = await Promise.allSettled([G(`/api/rt/similar?station=${st}&day=today`), G(`/api/rt/similar?station=${st}&day=yesterday`)]);
      if ($("rtsSim") !== sim) return; // 다시 그려졌으면 버림
      // 오늘·어제 중 받은 쪽만 보여 주고, 못 받은 쪽은 사유만 적는다(값을 지어내지 않음)
      const one = (r, day) => r.status === "fulfilled" ? r.value : { ok: false, day, unavailable: true, message: r.reason?.message || "응답 없음" };
      const tv = one(t, "today"), yv = one(y, "yesterday");
      sim.innerHTML = tv.unavailable && yv.unavailable ? `<section class="card"><p class="rt-ins">과거 유사일을 불러오지 못했습니다</p></section>` : simHtml(tv, yv);
    };
    if (window.RTLazy) window.RTLazy("rtsSim", run); else run();
  }
  const watch = () => { const el = $("today"); if (el && !el.dataset.rtsObs) { el.dataset.rtsObs = "1"; new MutationObserver(() => fill()).observe(el, { childList: true, subtree: true }); } fill(); };
  setInterval(watch, 1500);
  watch();
})();
