// 관리 화면 보강(예보 자료): 자료수집·미적재 현황에 예보 적재 현황 카드, 수집이력 자료 이름. 다시 받기는 기존 POST /api/collect-forecast 그대로.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const LABEL = { KMA_ULTRA_NCST: "초단기실황", KMA_ULTRA_FCST: "초단기예보", KMA_VILAGE_FCST: "단기예보", KMA_MID_TA: "중기기온", KMA_MID_LAND: "중기육상", KMA_MID_FCST: "중기전망" };
  const hm = (w) => (w ? `${w.slice(5, 10)} ${w.slice(11, 16)}` : "–");
  let busy = false;
  function table(d, withList) {
    const rows = d.datasets.map((x) => `<tr><td class="nw"><b>${esc(x.label)}</b> <small class="muted">${esc(x.kind)}</small></td><td class="nw">${hm(x.latestBase)}${x.stale ? ` <span class="rt-badge bad">지연</span>` : ""}</td><td class="nw">${hm(x.latestCollectedAt)}</td><td class="nw">${x.have}/${x.expected} <small class="muted">(${x.unit} ${x.targets}${x.beforeStart ? ` · 수집 시작 전 ${x.beforeStart}개 제외` : ""})</small></td><td class="nw">${x.missing ? `<b class="bad">${x.missing}</b>${x.missingRecollectable ? ` <small>(다시 받기 가능 ${x.missingRecollectable})</small>` : " <small>(제공 기간 지남)</small>"}` : "0"}</td><td class="nw">${hm(x.nextRelease)}</td>${withList ? "" : `<td><button type="button" class="sec rtad-go" data-ds="${x.dataset}">다시 받기</button></td>`}</tr>`).join("");
    const list = withList ? d.datasets.filter((x) => x.missing).map((x) => `<details class="rtad-miss"><summary>${esc(x.label)} 미적재 ${x.missing}건</summary><ul>${x.missingList.slice(0, 60).map((m) => `<li>${hm(m.base)} 발표 · ${esc(x.unit)} ${esc(m.target)} ${m.recollectable ? "" : "<small class='muted'>(다시 받을 수 없음)</small>"}</li>`).join("")}${x.missingList.length > 60 ? `<li>…외 ${x.missing - 60}건</li>` : ""}</ul></details>`).join("") : "";
    return `<div style="overflow:auto"><table><thead><tr><th>자료</th><th>최신 발표</th><th>받은 시각</th><th>적재/기대</th><th>미적재</th><th>다음 발표</th>${withList ? "" : "<th></th>"}</tr></thead><tbody>${rows}</tbody></table></div>${list}<p class="muted">최근 ${d.hours}시간 · 기준 ${esc(d.now)} KST. ${esc(d.rule)}</p>`;
  }
  async function render(where) {
    const sec = $(where);
    if (!sec) return;
    let box = sec.querySelector(".rtad-card");
    if (!box) {
      box = document.createElement("div");
      box.className = "card rtad-card";
      const first = sec.querySelector(":scope > .card");
      if (first && first.nextSibling) sec.insertBefore(box, first.nextSibling); else sec.appendChild(box);
    }
    box.innerHTML = `<div class="card-head"><h2>예보 자료 적재 현황</h2><a href="#/${where === "collect" ? "gaps" : "collect"}">${where === "collect" ? "미적재 현황 ›" : "자료수집 ›"}</a></div><p class="muted">불러오는 중…</p>`;
    try {
      const r = await fetch("/api/admin/forecast-status?hours=48");
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || `HTTP ${r.status}`);
      box.innerHTML = `<div class="card-head"><h2>예보 자료 적재 현황</h2><a href="#/${where === "collect" ? "gaps" : "collect"}">${where === "collect" ? "미적재 현황 ›" : "자료수집 ›"}</a></div>${where === "collect" ? `<p class="muted">'다시 받기'는 정기 수집과 같은 작업(최근 발표 중 아직 받지 않은 것만, 단기 24시간·중기 36시간)을 지금 한 번 실행합니다.</p>` : ""}${table(d, where === "gaps")}<div class="rtad-log" aria-live="polite"></div>`;
    } catch (e) { box.querySelector("p").textContent = `불러오지 못했습니다: ${e.message}`; }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(".rtad-go");
    if (!b || busy) return;
    busy = true;
    const ds = b.dataset.ds, log = b.closest(".rtad-card").querySelector(".rtad-log");
    document.querySelectorAll(".rtad-go").forEach((x) => (x.disabled = true));
    log.textContent = `${LABEL[ds]} 받는 중…`;
    try {
      const r = await fetch("/api/collect-forecast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset: ds }) });
      const j = await r.json();
      log.innerHTML = `${esc(LABEL[ds])}: <b class="${j.status === "COMPLETED" ? "" : "bad"}">${esc(j.status || j.message)}</b> · 수신 ${j.received ?? 0}/신규 ${j.inserted ?? 0}/갱신 ${j.updated ?? 0} · ${esc(j.message || "")}`;
    } catch (err) { log.textContent = `실패: ${err.message}`; }
    busy = false;
    const keep = log.innerHTML;
    await render("collect");
    const nl = $("collect")?.querySelector(".rtad-log"); if (nl) nl.innerHTML = keep;
  });
  // 수집이력: 예보 작업의 자료 이름을 한글로(코드는 title 로 남김)
  function relabel() {
    for (const td of document.querySelectorAll("#jBody td[title], #cJobs td[title]")) if (LABEL[td.title] && td.textContent === td.title) td.textContent = LABEL[td.title];
  }
  let last = "";
  function tick() {
    const on = ["collect", "gaps", "jobs"].find((p) => document.querySelector(`#${p}.on`)) || "";
    if (on !== last) { last = on; if (on === "collect" || on === "gaps") render(on); }
    if (on === "jobs" || on === "collect") relabel();
  }
  setInterval(tick, 1000);
  window.addEventListener("hashchange", () => setTimeout(tick, 100));
})();
