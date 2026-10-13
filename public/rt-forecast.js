// 날씨 예보(#/forecast) — /api/rt/forecast. 기준 선택은 NWBasis(rt.js) 공통.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  const cls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const dlab = (ymd) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}(${DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()]})`;
  const hm = (w) => (w ? `${+w.slice(5, 7)}/${+w.slice(8, 10)} ${w.slice(11, 16)}` : "");
  const COLORS = { all: "#8a4b00", r10: "#0e7a3e", r5: "#c0262d", fc: "#026ef8" };
  const state = { station: null, data: null, stations: [], show: { all: true, r10: true, r5: true } };
  const hp = () => new URLSearchParams(location.hash.split("?")[1] || "");
  const setHash = (p) => history.replaceState(history.state, "", `#/forecast${p.toString() ? `?${p}` : ""}`);
  async function show() {
    const root = $("forecast");
    if (!root.dataset.init) {
      root.dataset.init = "1";
      root.innerHTML = `<div class="rt-ctl card"><select id="fcStation" aria-label="관측지점"></select><div id="fcBasis"></div></div><div id="fcOut" aria-live="polite"><div class="card rt-load">불러오는 중…</div></div>`;
      $("fcStation").addEventListener("change", (e) => { state.station = e.target.value; if (window.NWStation?.manual) NWStation.manual(state.station); const p = hp(); p.set("station", state.station); setHash(p); load(); });
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-basis]");
        if (b) { NWBasis.set(b.dataset.basis); const p = hp(); p.set("basis", b.dataset.basis); setHash(p); $("fcBasis").innerHTML = NWBasis.html(NWBasis.get()); render(); return; }
        const t = e.target.closest("[data-line]");
        if (t) { state.show[t.dataset.line] = !state.show[t.dataset.line]; render(); }
      });
    }
    if (!state.stations.length) {
      const r = await fetch("/api/stations").then((x) => x.json()).catch(() => ({}));
      state.stations = (Array.isArray(r) ? r : r.data || []).filter((s) => s.enabled !== false);
    }
    const ids = state.stations.map((s) => String(s.station_id));
    let st = hp().get("station");
    if (!ids.includes(st)) { try { const v = JSON.parse(localStorage.getItem("nw.station") || "null"); st = v && ids.includes(String(v.id)) ? String(v.id) : null; } catch { st = null; } }
    state.station = st || (ids.includes("108") ? "108" : ids[0]);
    $("fcStation").innerHTML = state.stations.map((s) => `<option value="${esc(s.station_id)}"${String(s.station_id) === state.station ? " selected" : ""}>${esc(s.station_name)}(${esc(s.station_id)})</option>`).join("");
    $("fcBasis").innerHTML = NWBasis.html(NWBasis.get());
    load();
  }
  let seq = 0;
  async function load() {
    const my = ++seq;
    $("fcOut").innerHTML = `<div class="card rt-load">불러오는 중…</div>`;
    try {
      const r = await fetch(`/api/rt/forecast?station=${encodeURIComponent(state.station)}`);
      const d = await r.json();
      if (my !== seq) return;
      if (!r.ok || !d.ok) throw new Error(d.message || "불러오지 못했습니다");
      state.data = d; render();
    } catch (e) { if (my === seq) $("fcOut").innerHTML = `<div class="card result bad">${esc(e.message)}</div>`; }
  }
  function render() {
    const d = state.data;
    if (!d) return;
    const ids = NWBasis.ids(NWBasis.get());
    const pi = (id) => ["all", "r10", "r5"].indexOf(id);
    const stale = [d.releases?.vilage, d.releases?.ultra].filter((x) => x && x.freshness.state === "stale");
    let h = "";
    if (d.message) h += `<div class="card result bad">${esc(d.message)}</div>`;
    if (stale.length) h += `<div class="card result bad">예보 발표가 늦어지고 있습니다(${stale.map((x) => `${esc(hm(x.base))} 발표 · ${esc(x.freshness.text)}`).join(" / ")}). 최신 예보가 아닐 수 있습니다.</div>`;
    // 1) 이번 주 예년 대비
    if (d.week) {
      const w = d.week;
      const main = w.anomaly[0];
      const word = main.diff == null ? "비교 데이터 부족" : Math.abs(main.diff) < 1 ? "예년과 비슷할 전망" : main.diff > 0 ? "예년보다 더울 전망" : "예년보다 추울 전망";
      h += `<section class="card rt-now"><p class="rt-time">이번 주 ${esc(dlab(w.from))}~${esc(dlab(w.to))} · ${esc(d.station.name)}</p><p class="rt-temp" style="font-size:28px">${esc(word)}</p>
        <div class="rt-cmp">${w.anomaly.filter((a) => ids.includes(a.id)).map((a) => `<div class="rt-cmp-i"><span>${esc(a.label)}<small>${esc(a.range)}</small></span><b class="${cls(a.diff)}">${a.diff == null ? `<em class="rt-ins">비교 데이터 부족</em>` : sg(a.diff)}</b><i></i></div>`).join("")}</div>
        <div class="rt-week">${w.days.map((x) => `<div class="rt-wd ${x.date === d.date ? "today" : ""}"><b>${esc(dlab(x.date))}</b><span>${x.max ?? "–"} / ${x.min ?? "–"}</span><small class="src-${x.source === "관측" ? "obs" : "fc"}">${esc(x.source || "자료 없음")}</small></div>`).join("")}</div>
        <p class="rt-note">${esc(w.note)}. 각 날짜의 같은 시기(±7일) 공식 일자료 최고·최저기온 평균과 비교.</p></section>`;
    }
    // 2) 주간 예보
    h += `<section class="card"><h2>주간 예보와 과거 평균</h2><div class="tbl-wrap rt-desk"><table class="rt-tbl"><thead><tr><th>날짜</th><th>날씨</th><th>강수확률</th><th>예상 강수량</th><th>최고</th><th>최저</th><th>출처·발표</th></tr></thead><tbody>${d.days.map((x) => {
      if (x.none) return `<tr><th scope="row">${esc(dlab(x.date))}</th><td colspan="6" class="rt-ins">예보 없음</td></tr>`;
      const cell = (v, cmp) => `${v == null ? "–" : `<b>${v}℃</b>`}${ids.map((id) => { const c = cmp[pi(id)]; return `<br><small>${esc(c.label.replace(" 평균", ""))} ${c.mean == null ? "부족" : `${c.mean}℃${v == null ? "" : ` <span class="${cls(c.diff)}">${sg(c.diff)}</span>`}`}</small>`; }).join("")}`;
      const rain = x.rain ? (x.rain.rainHours ? `${x.rain.mm ? `${x.rain.mm}mm` : ""}${x.rain.rangeHours ? `${x.rain.mm ? " + " : ""}1mm 미만 ${x.rain.rangeHours}시간` : ""}` : "강수 없음") : "–";
      return `<tr${x.offset === 0 ? ' class="today"' : ""}><th scope="row">${esc(dlab(x.date))}${x.offset === 0 ? " 오늘" : ""}</th><td>${esc(x.wf || x.sky || "–")}</td><td>${x.pop == null ? "–" : `${x.pop}%`}</td><td>${esc(rain)}</td><td>${cell(x.max, x.maxCmp)}${x.nearRecord ? `<br><small class="up">같은 시기 과거 최고 ${x.nearRecord.record.value}℃(${esc(x.nearRecord.record.date)})에 근접 — 예상</small>` : ""}</td><td>${cell(x.min, x.minCmp)}</td><td><small>${esc(x.maxSource || x.minSource || x.wxSource || "")} ${esc(hm(x.maxBase || x.minBase || x.wxBase))}</small></td></tr>`;
    }).join("")}</tbody></table></div>${mobileDays(d, ids, pi)}<p class="rt-note">단기예보가 있는 날은 단기예보, 그 뒤(대략 4일 이후)는 중기예보. 강수확률은 하루 중 가장 큰 값이며 더하지 않습니다. 예상 강수량은 숫자로 나온 시간만 더하고 '1mm 미만'은 시간 수로 따로 적습니다.</p></section>`;
    // 3) 시간별
    h += hourlyCard(d, ids);
    // 4) 예보 변화
    if (d.changes.length) h += `<section class="card"><h2>발표마다 바뀐 최고·최저기온 예보</h2><div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>날짜</th><th>최고기온 (발표 → 값)</th><th>최저기온</th></tr></thead><tbody>${d.changes.map((c) => `<tr><th scope="row">${esc(dlab(c.date))}</th><td>${seqTxt(c.max)}</td><td>${seqTxt(c.min)}</td></tr>`).join("")}</tbody></table></div><p class="rt-note">저장된 발표 회차별 값(단기예보 TMX·TMN, 중기기온 taMax·taMin). 맨 오른쪽이 가장 최근 발표.</p></section>`;
    h += `<details class="card rt-method"><summary>계산 기준</summary><ul><li>${esc(d.method.rule)}</li><li>${esc(d.method.note)}</li><li>${esc(d.mapping?.note || "")}</li><li>최신 발표: 단기 ${esc(hm(d.releases?.vilage?.base) || "없음")}, 초단기 ${esc(hm(d.releases?.ultra?.base) || "없음")}, 중기기온 ${esc(hm(d.releases?.midTa) || "없음")}, 중기육상 ${esc(hm(d.releases?.midLand) || "없음")}.</li><li>시간별 기온 비교 = 같은 날짜 ±7일·같은 정시 ASOS 평균, 일별 = 공식 일자료 최고·최저기온 평균. 예보값으로 기록 경신을 확정하지 않습니다.</li></ul></details>`;
    $("fcOut").innerHTML = h;
  }
  // 값이 바뀐 발표만(첫 발표 + 바뀐 회차), 최근 6개
  const changesOnly = (a) => a.filter((x, i) => i === 0 || x.value !== a[i - 1].value || x.source !== a[i - 1].source);
  // 좁은 화면: 날짜마다 한 줄 카드(표 가로 스크롤 대신)
  function mobileDays(d, ids, pi) {
    return `<ul class="rt-dlist">${d.days.map((x) => {
      if (x.none) return `<li><b>${esc(dlab(x.date))}</b> <span class="rt-ins">예보 없음</span></li>`;
      const df = (cmp) => ids.map((id) => { const c = cmp[pi(id)]; return c.diff == null ? "" : `<span class="${cls(c.diff)}">${sg(c.diff)}</span>`; }).join(" ");
      return `<li${x.offset === 0 ? ' class="today"' : ""}><div class="r1"><b>${esc(dlab(x.date))}</b><span>${esc(x.wf || x.sky || "")}${x.pop != null ? ` · ${x.pop}%` : ""}</span></div><div class="r2"><span>최고 <b>${x.max ?? "–"}</b> ${x.max != null ? df(x.maxCmp) : ""}</span><span>최저 <b>${x.min ?? "–"}</b> ${x.min != null ? df(x.minCmp) : ""}</span></div><small>${esc(x.maxSource || x.minSource || x.wxSource || "")} ${esc(hm(x.maxBase || x.minBase || x.wxBase))}${x.nearRecord ? ` · <span class="up">과거 최고 ${x.nearRecord.record.value}℃ 근접(예상)</span>` : ""}</small></li>`;
    }).join("")}</ul><p class="rt-note rt-mob">차이는 ${ids.map((id) => esc(d.periods[pi(id)].label.replace(" 평균", ""))).join(" · ")} 평균 대비(℃).</p>`;
  }
  const seqTxt = (a0) => { const a = changesOnly(a0); return a.length ? a.slice(-6).map((x, i, arr) => `<span title="${esc(x.source)}">${esc(hm(x.base))} <b${i && x.value !== arr[i - 1].value ? ` class="${cls(x.value - arr[i - 1].value)}"` : ""}>${x.value}</b>${x.source === "중기예보" ? "<sup>중기</sup>" : ""}</span>`).join(" → ") + (a0.length > a.length ? ` <small>(발표 ${a0.length}회 중 값이 바뀐 회차만)</small>` : "") : "–"; };
  function hourlyCard(d, ids) {
    const hrs = d.hours.slice(0, 72);
    if (!hrs.length) return `<section class="card"><h2>시간별 예보</h2><p class="rt-ins">예보 자료가 없습니다</p></section>`;
    const W = Math.max(720, hrs.length * 14), H = 220, L = 34, R = 8, T = 12, B = 26;
    const lines = ["all", "r10", "r5"].filter((k) => ids.includes(k) && state.show[k]);
    const vals = [];
    for (const x of hrs) { if (x.ta != null) vals.push(x.ta); for (const k of lines) if (x.avg[k] != null) vals.push(x.avg[k]); }
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
    const X = (i) => L + (i / Math.max(1, hrs.length - 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const path = (get) => { let s = "", pen = false; hrs.forEach((x, i) => { const v = get(x); if (v == null) { pen = false; return; } s += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }); return s; };
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" class="rt-svg-h" role="img" aria-label="시간별 예보기온과 과거 평균">`;
    for (let t = Math.ceil(lo / 2) * 2; t <= hi; t += 2) svg += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e0e8f4"/><text x="${L - 5}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#5e7090">${t}</text>`;
    hrs.forEach((x, i) => { const hh = +x.time.slice(11, 13); if (hh === 0) svg += `<line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${H - B}" stroke="#c9d6ea"/><text x="${X(i) + 3}" y="${T + 10}" font-size="11" fill="#5e7090">${esc(dlab(x.time.slice(0, 10)))}</text>`; if (hh % 6 === 0) svg += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#5e7090">${hh}시</text>`; });
    for (const k of lines) svg += `<path d="${path((x) => x.avg[k])}" fill="none" stroke="${COLORS[k]}" stroke-width="1.5" opacity=".85"/>`;
    svg += `<path d="${path((x) => x.ta)}" fill="none" stroke="${COLORS.fc}" stroke-width="2.4" stroke-dasharray="6 4"/></svg>`;
    const names = Object.fromEntries(d.periods.map((p) => [p.id, p.label]));
    const legend = `<div class="rt-legend"><span class="lg-fc">┅ 예보기온</span>${["all", "r10", "r5"].filter((k) => ids.includes(k)).map((k) => `<button type="button" data-line="${k}" aria-pressed="${state.show[k]}" style="--c:${COLORS[k]}" class="${state.show[k] ? "on" : ""}">${esc(names[k])}</button>`).join("")}</div>`;
    const rows = hrs.map((x) => `<tr><th scope="row">${esc(hm(x.time))}</th><td>${esc(x.pty && x.pty !== "없음" ? x.pty : x.sky || "–")}</td><td><b>${x.ta ?? "–"}℃</b> ${ids.map((id) => `<small class="${cls(x.diff[id])}">${sg(x.diff[id])}</small>`).join(" ")}</td><td>${x.pop == null ? "–" : `${x.pop}%`}</td><td>${esc(x.pcp ?? "–")}</td><td>${x.hm ?? "–"}%</td><td>${x.ws ?? "–"}m/s</td><td><small>${esc(x.source)} ${esc(hm(x.base))}</small></td></tr>`).join("");
    return `<section class="card rt-chart"><h2>시간별 예보</h2>${legend}<div class="rt-hscroll">${svg}</div><details class="rt-hdet"><summary>시간별 표 보기 (${hrs.length}시간)</summary><div class="tbl-wrap"><table class="rt-tbl"><thead><tr><th>시각</th><th>하늘·강수</th><th>기온 (기준별 차이)</th><th>강수확률</th><th>강수량</th><th>습도</th><th>풍속</th><th>출처·발표</th></tr></thead><tbody>${rows}</tbody></table></div></details><p class="rt-note">차이 = 예보기온 − 같은 날짜 ±7일·같은 정시 ASOS 평균(${ids.map((id) => esc(names[id])).join(", ")} 순). 6시간 안은 초단기예보, 그 뒤는 단기예보.</p></section>`;
  }
  window.RTF = { show, station: () => state.station };
})();
