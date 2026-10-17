// 날씨 이야기 › 날씨 배틀(#/stories/battle). 날짜 2~4개(A~D 고정 색·글자)를 같은 기간·같은 기준연도끼리 비교. 값·문장은 /api/stats/date-battle 그대로.
// 종합점수·전체 승자·레이더 없음. 지표별 차이만, 표본이 적으면 참고값, 공통 연도가 없으면 비교하지 않는다.
(() => {
  const V = window.DViz;
  const { esc: E, fmt, sgn, fin } = V;
  const $ = (id) => document.getElementById(id);
  const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const THIS_YEAR = +kst().slice(0, 4);
  const IDS = ["A", "B", "C", "D"];
  const solarDim = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const dot = (ymd) => (ymd ? `${+ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const PERIODS = [["recent5", "최근 5년"], ["recent10", "최근 10년"], ["recent20", "최근 20년"], ["recent30", "최근 30년"], ["all", "전체"], ["custom", "직접 지정"]];
  const HM = { ta: ["기온", "℃", 1], rn: ["강수량", "mm", 1], ws: ["풍속", "m/s", 1], hm: ["습도", "%", 0] };
  const YR = { avg: "평균기온", rain_mean: "일강수량", wind: "평균 풍속", max: "최고기온", min: "최저기온", hum: "습도", gust: "순간풍속", sun: "일조시간" };
  const EXAMPLES = [["5월 5일 vs 10월 9일", [["S", 5, 5, 0], ["S", 10, 9, 0]]], ["양력 1월 1일 vs 음력 1월 1일", [["S", 1, 1, 0], ["L", 1, 1, 0]]], ["추석(음력 8/15) vs 개천절", [["L", 8, 15, 0], ["S", 10, 3, 0]]], ["봄·여름·가을·겨울 1일", [["S", 3, 1, 0], ["S", 6, 1, 0], ["S", 9, 1, 0], ["S", 12, 1, 0]]]];
  const st = { cases: [], diff: false, period: "recent10", to: THIS_YEAR - 1, from: THIS_YEAR - 10, hm: "ta", yr: "avg", year: null };
  let meta = null;
  let seq = 0;
  let B = null;
  let HB = null;
  let YB = null;
  const cache = new Map();
  const getJson = (url) => {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(async (r) => { const j = await r.json().catch(() => ({ ok: false, message: "응답을 읽지 못했습니다" })); if (!r.ok || !j.ok) throw new Error(j.message || `조회 실패(${r.status})`); return j; }).catch((e) => { cache.delete(url); throw e; });
    cache.set(url, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return p;
  };
  const caseLabel = (c) => (c.cal === "L" ? `음력 ${c.m}월 ${c.d}일${c.leap ? "·윤달" : ""}` : `양력 ${c.m}월 ${c.d}일`);
  const tag = (id) => `<span class="db-tag" style="background:${V.CASE[id].color}" aria-label="${id}">${V.CASE[id].shape} ${id}</span>`;
  const stationName = (id) => (meta?.stations || []).find((s) => String(s.station_id) === String(id))?.station_name || id;

  function readHash() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const labels = String(q.get("labels") || "").split(",").map((s) => { try { return decodeURIComponent(s).slice(0, 30); } catch { return ""; } });
    const def = (window.NWStation && NWStation.stored && NWStation.stored()) || "108";
    const list = String(q.get("cases") || "").split(",").map((s) => s.split(".")).filter((p) => p.length >= 5 && IDS.includes(p[0]));
    st.cases = list.slice(0, 4).map((p, i) => ({ id: IDS[i], station: p[1] || def, cal: p[2] === "L" ? "L" : "S", m: Math.min(12, Math.max(1, +p[3] || 1)), d: Math.max(1, +p[4] || 1), leap: p[2] === "L" && p[5] === "1", label: labels[i] || "" }));
    for (const c of st.cases) c.d = Math.min(c.d, c.cal === "S" ? solarDim(c.m) : 30);
    if (st.cases.length === 0) st.cases = [{ id: "A", station: def, cal: "S", m: 5, d: 5, leap: false, label: "" }];
    if (st.cases.length === 1) { const a = st.cases[0]; st.cases.push(a.cal === "S" && a.m === 1 && a.d === 1 ? { id: "B", station: a.station, cal: "S", m: 5, d: 5, leap: false, label: "" } : { id: "B", station: a.station, cal: "S", m: 1, d: 1, leap: false, label: "" }); }
    st.diff = q.get("ds") === "1" || new Set(st.cases.map((c) => c.station)).size > 1;
    if (!st.diff) for (const c of st.cases) c.station = st.cases[0].station;
    st.period = PERIODS.some(([p]) => p === q.get("period")) ? q.get("period") : "recent10";
    const to = Number(q.get("to"));
    st.to = Number.isInteger(to) && to >= 1971 && to <= THIS_YEAR ? to : THIS_YEAR - 1;
    const fr = Number(q.get("from"));
    st.from = Number.isInteger(fr) && fr >= 1900 && fr <= st.to ? fr : Math.max(1970, st.to - 9);
    if (HM[q.get("hm")]) st.hm = q.get("hm");
    if (YR[q.get("yr")]) st.yr = q.get("yr");
    const y = Number(q.get("year"));
    st.year = Number.isInteger(y) && y >= 1900 && y <= THIS_YEAR ? y : null;
  }
  const casesParam = () => st.cases.map((c) => `${c.id}.${c.station}.${c.cal}.${c.m}.${c.d}.${c.leap ? 1 : 0}`).join(",");
  function query(view = true) {
    const q = new URLSearchParams({ cases: casesParam(), period: st.period, to: String(st.to) });
    if (st.period === "custom") q.set("from", String(st.from));
    if (st.diff) q.set("ds", "1");
    if (st.cases.some((c) => c.label)) q.set("labels", st.cases.map((c) => encodeURIComponent(c.label || "")).join(","));
    if (view) { if (st.hm !== "ta") q.set("hm", st.hm); if (st.yr !== "avg") q.set("yr", st.yr); if (st.year) q.set("year", String(st.year)); }
    return q;
  }
  const hashOf = () => `#/stories/battle?${query()}`;
  const go = () => { const h = hashOf(); if (location.hash !== h) location.hash = h; else load(); };
  const replaceView = () => { const h = hashOf(); if (location.hash !== h) history.replaceState(history.state, "", h); };
  const api = (part, extra = {}) => { const q = query(false); q.delete("labels"); q.delete("ds"); q.set("part", part); for (const [k, v] of Object.entries(extra)) q.set(k, String(v)); return `/api/stats/date-battle?${q}`; };

  function shell() {
    const p = $("sbattle");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `<div class="card ds-head"><h2 class="sx-q">날씨 배틀<small>날짜 2~4개를 같은 기간, 서로 자료가 있는 같은 기준연도끼리 비교합니다. 생일·기념일 등록 없이 날짜만 넣으면 됩니다.</small></h2>
        <div class="db-ex"><span class="muted">예시:</span>${EXAMPLES.map(([l], i) => `<button type="button" class="sec" data-ex="${i}">${E(l)}</button>`).join("")}</div>
        <div id="dbCases" class="db-cases"></div>
        <div class="sx-ctl" id="dbCtl"></div><p class="ds-banner" id="dbBanner" role="status"></p><div class="fav-row" id="dbFav"></div><p class="ds-toast" id="dbToast" role="status" hidden></p></div>
      <div class="card" id="dbCore"></div><div class="card" id="dbHour"></div><div class="card" id="dbYears"></div><div class="card" id="dbPeriods"></div>`;
    p.addEventListener("change", onChange);
    p.addEventListener("click", onClick);
    p.addEventListener("input", (e) => { const t = e.target; if (t.dataset.f === "label") { const c = st.cases.find((x) => x.id === t.dataset.c); c.label = t.value.slice(0, 30); replaceView(); } });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (document.body.dataset.page === "sbattle") { if (HB) renderHour(); if (YB) renderYearDetail(); } }, 200); });
  }
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const seg = (name, list, cur, extra = "") => `<div class="seg ds-seg" role="group">${list.map(([v, l]) => `<button type="button" data-${name}="${v}" ${extra} class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${E(l)}</button>`).join("")}</div>`;
  function renderCases() {
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})`]);
    $("dbCases").innerHTML = st.cases.map((c) => `<div class="db-case" style="--cc:${V.CASE[c.id].color}"><div class="db-case-h">${tag(c.id)}<input data-c="${c.id}" data-f="label" maxlength="30" placeholder="별칭(선택)" value="${E(c.label)}" aria-label="${c.id} 별칭">${st.cases.length > 2 ? `<button type="button" class="sec db-del" data-del="${c.id}" aria-label="${c.id} 빼기">×</button>` : ""}</div>
      <div class="db-case-b">${seg("cal", [["S", "양력"], ["L", "음력"]], c.cal, `data-c="${c.id}"`)}<span class="sx-inline"><select data-c="${c.id}" data-f="m" aria-label="${c.id} 월">${opt(Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}월`]), c.m)}</select><select data-c="${c.id}" data-f="d" aria-label="${c.id} 일">${opt(Array.from({ length: c.cal === "S" ? solarDim(c.m) : 30 }, (_, i) => [i + 1, `${i + 1}일`]), c.d)}</select></span>
      ${c.cal === "L" ? seg("leap", [["0", "평달"], ["1", "윤달"]], c.leap ? "1" : "0", `data-c="${c.id}"`) : ""}
      ${st.diff ? `<select data-c="${c.id}" data-f="station" aria-label="${c.id} 관측지점">${opt(stations, c.station)}</select>` : ""}
      <a class="db-more" href="${dayHref(c)}">이 날짜 자세히 ›</a></div></div>`).join("") + (st.cases.length < 4 ? `<button type="button" class="sec db-add" id="dbAdd">+ 날짜 추가 (${st.cases.length}/4)</button>` : "");
    const toYears = []; for (let y = THIS_YEAR; y >= 1971; y--) toYears.push([y, `${y}년`]);
    renderFav();
    $("dbCtl").innerHTML = `<div class="ds-wide"><label>공통 기간(모든 카드)</label>${seg("period", PERIODS, st.period)}</div>${st.period === "custom" ? `<div><label for="dbFrom">시작 기준연도</label><input id="dbFrom" type="number" class="sx-num" min="1900" max="${st.to}" value="${st.from}"></div>` : ""}<div><label for="dbTo">끝 기준연도</label><select id="dbTo">${opt(toYears, st.to)}</select></div>${st.diff ? "" : `<div><label for="dbSt">관측지점(공통)</label><select id="dbSt">${opt(stations, st.cases[0].station)}</select></div>`}<div><label class="sx-check"><input type="checkbox" id="dbDiff"${st.diff ? " checked" : ""}> 지점도 다르게</label></div><div class="ds-acts"><button type="button" class="sec" id="dbCardImg">카드 이미지</button><button type="button" class="sec" id="dbCopy">공유 링크 복사</button></div>`;
  }
  // ---- 자주 보는 배틀 조합(이 브라우저에만)
  const favKey = () => casesParam();
  function favLabel(x) { const ls = String(x.labels || "").split(",").map((v) => { try { return decodeURIComponent(v); } catch { return ""; } }); return x.cases.split(",").map((c, i) => { const p = c.split("."); return ls[i] || (p[2] === "L" ? `음${p[3]}/${p[4]}${p[5] === "1" ? "윤" : ""}` : `${p[3]}/${p[4]}`); }).join(" vs ") + (x.ds ? " · 여러 지점" : ` · ${stationName(x.cases.split(".")[1])}`); }
  function favHref(x) { const q = new URLSearchParams({ cases: x.cases, period: st.period, to: String(st.to) }); if (st.period === "custom") q.set("from", String(st.from)); if (x.ds) q.set("ds", "1"); if (x.labels) q.set("labels", x.labels); return `#/stories/battle?${q}`; }
  function renderFav() {
    const el = $("dbFav");
    if (!el || !window.StoryFavs) return;
    const on = StoryFavs.has("battle", favKey());
    el.innerHTML = `<button type="button" class="sec fav-star${on ? " on" : ""}" id="dbFavBtn" aria-pressed="${on}" title="이 브라우저에 저장">${on ? "★ 저장됨" : "☆ 이 조합 저장"}</button><span class="fav-list" aria-label="자주 보는 배틀 조합">${StoryFavs.chips("battle", { label: favLabel, href: favHref, current: favKey() })}</span>`;
  }
  function toast(msg) { const t = $("dbToast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000); }
  const labelsParam = () => (st.cases.some((c) => c.label) ? st.cases.map((c) => encodeURIComponent(c.label || "")).join(",") : "");
  function shareUrl() { const q = new URLSearchParams({ cases: casesParam(), period: st.period, to: String(st.to) }); if (st.period === "custom") q.set("from", String(st.from)); if (st.diff) q.set("ds", "1"); const l = labelsParam(); if (l) q.set("labels", l); return `${location.origin}/s/battle?${q}`; }
  function openCard() {
    if (!B || !window.StoryShare) { toast("자료를 다 불러온 뒤 카드를 만들 수 있습니다"); return; }
    StoryShare.module().then((m) => StoryShare.open({ spec: m.battleSpec(B, { labels: st.cases.map((c) => c.label) }), filename: `inal-battle-${casesParam().replace(/[.,]/g, "")}-${B.window.fromYear}-${B.window.toYear}`, shareUrl: shareUrl(), title: "날씨 배틀 카드" }));
  }
  async function copyLink() { const u = shareUrl(); try { await navigator.clipboard.writeText(u); toast("공유 링크를 복사했습니다 — 메신저 미리보기에 비교 숫자가 나옵니다"); } catch { prompt("이 주소를 복사하세요", u); } }
  function dayHref(c) {
    const q = new URLSearchParams({ station: c.station, cal: c.cal === "L" ? "lunar" : "solar", m: String(c.m), d: String(c.d) });
    if (c.cal === "L") q.set("leap", c.leap ? "1" : "0");
    q.set("period", st.period); q.set("to", String(st.to));
    if (st.period === "custom") q.set("from", String(st.from));
    if (c.label) q.set("alias", c.label);
    return `#/stories/day?${q}`;
  }
  function onChange(e) {
    const t = e.target;
    const c = t.dataset.c ? st.cases.find((x) => x.id === t.dataset.c) : null;
    if (c && t.dataset.f === "m") { c.m = +t.value; c.d = Math.min(c.d, c.cal === "S" ? solarDim(c.m) : 30); }
    else if (c && t.dataset.f === "d") c.d = +t.value;
    else if (c && t.dataset.f === "station") c.station = t.value;
    else if (c && t.dataset.f === "label") return;
    else if (t.id === "dbTo") { st.to = +t.value; if (st.from > st.to) st.from = st.to; }
    else if (t.id === "dbFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > st.to) return; st.from = v; }
    else if (t.id === "dbSt") for (const x of st.cases) x.station = t.value;
    else if (t.id === "dbDiff") { st.diff = t.checked; if (!st.diff) for (const x of st.cases) x.station = st.cases[0].station; }
    else return;
    st.year = null;
    go();
  }
  function onClick(e) {
    const b = e.target.closest("button,tr[data-year]");
    if (!b) return;
    const ds = b.dataset;
    const c = ds.c ? st.cases.find((x) => x.id === ds.c) : null;
    if (c && ds.cal) { if (c.cal === ds.cal) return; c.cal = ds.cal; c.leap = false; c.d = Math.min(c.d, c.cal === "S" ? solarDim(c.m) : 30); st.year = null; return go(); }
    if (c && ds.leap !== undefined) { c.leap = ds.leap === "1"; st.year = null; return go(); }
    if (ds.period) { st.period = ds.period; st.year = null; return go(); }
    if (ds.del) { st.cases = st.cases.filter((x) => x.id !== ds.del).map((x, i) => ({ ...x, id: IDS[i] })); st.year = null; return go(); }
    if (b.id === "dbAdd") { const a = st.cases[st.cases.length - 1]; st.cases.push({ id: IDS[st.cases.length], station: a.station, cal: "S", m: a.m === 12 ? 1 : a.m + 1, d: 1, leap: false, label: "" }); return go(); }
    if (ds.ex !== undefined) { const ex = EXAMPLES[+ds.ex][1]; const s0 = st.cases[0].station; st.cases = ex.map(([cal, m, d, l], i) => ({ id: IDS[i], station: s0, cal, m, d, leap: !!l, label: "" })); st.diff = false; st.year = null; return go(); }
    if (ds.hm) { st.hm = ds.hm; replaceView(); return renderHour(); }
    if (ds.yr) { st.yr = ds.yr; replaceView(); return renderYears(); }
    if (ds.year) { st.year = +ds.year; replaceView(); renderYears(); return loadYear(); }
    if (b.id === "dbYearClose") { st.year = null; YB = null; replaceView(); return renderYears(); }
    if (b.id === "dbRetry") { cache.clear(); return load(); }
    if (b.id === "dbCardImg") return openCard();
    if (b.id === "dbCopy") return copyLink();
    if (b.id === "dbFavBtn") { const on = StoryFavs.toggle("battle", { key: favKey(), cases: casesParam(), labels: labelsParam(), ds: st.diff ? 1 : 0 }); toast(on ? "이 배틀 조합을 이 브라우저에 저장했습니다" : "저장을 지웠습니다"); return renderFav(); }
    if (ds.favdel) { StoryFavs.remove("battle", ds.favdel); return renderFav(); }
  }

  async function load() {
    const my = ++seq;
    B = null; HB = null; YB = null;
    renderCases();
    $("dbBanner").innerHTML = `<b>서로 자료가 있는 같은 연도만 비교</b> · ${E(PERIODS.find(([p]) => p === st.period)[1])}${st.period === "custom" ? ` ${st.from}~${st.to}` : ` · 끝 ${st.to}년`}`;
    for (const id of ["dbCore", "dbYears", "dbPeriods"]) $(id).innerHTML = `<div class="sx-state">불러오는 중…</div>`;
    $("dbHour").innerHTML = `<div class="sx-state">시간자료 불러오는 중…</div>`;
    const hp = getJson(api("hourly"));
    hp.catch(() => {});
    try {
      const b = await getJson(api("summary"));
      if (my !== seq) return;
      B = b;
      renderBanner(); renderCore(); renderYears(); renderPeriods();
      if (st.year) loadYear();
    } catch (e) {
      if (my !== seq) return;
      for (const id of ["dbCore", "dbYears", "dbPeriods"]) $(id).innerHTML = `<div class="sx-state err">조회 실패 · ${E(e.message)} <button type="button" class="sec" id="dbRetry">다시 시도</button></div>`;
    }
    try { const h = await hp; if (my !== seq) return; HB = h; renderHour(); }
    catch (e) { if (my !== seq) return; $("dbHour").innerHTML = `<div class="sx-state err">시간자료 조회 실패 · ${E(e.message)} <button type="button" class="sec" id="dbRetry">다시 시도</button></div>`; }
  }
  async function loadYear() {
    const my = seq;
    const y = st.year;
    try { const r = await getJson(api("year", { year: y })); if (my !== seq || st.year !== y) return; YB = r; renderYearDetail(); }
    catch (e) { const el = $("dbYearDetail"); if (el) el.innerHTML = `<div class="sx-state err">조회 실패 · ${E(e.message)}</div>`; }
  }
  const STATUS = (s) => B?.statusText?.[s] || s;
  function renderBanner() {
    const n = (k) => B.metrics[k].n;
    const dup = B.duplicates.length ? ` · <b class="db-dup">같은 조건입니다: ${B.duplicates.map((d) => d.join("·")).join(", ")}</b>` : "";
    $("dbBanner").innerHTML = `<b>서로 자료가 있는 같은 연도만 비교</b> · ${E(B.window.label)}${B.mixedCalendars ? " · 양력·음력 혼합: 각 달력의 같은 기준연도끼리" : ""}${B.differentStations ? " · 카드마다 다른 관측지점" : ""}<br><span class="muted">공통 연도 — 기온 ${n("avg")}개 해 / 강수 ${n("rain_days")}개 해 / 풍속 ${n("wind")}개 해 / 습도 ${n("hum")}개 해 · 단일 날짜 화면의 평균과 다를 수 있습니다(같은 연도만 쓰기 때문)</span>${dup}`;
  }
  // 지표 카드: 값 막대(0 기준) 또는 점(기온 — 음수 포함)
  function metricCard(k) {
    const m = B.metrics[k];
    const info = B.metricsInfo[k];
    const dg = m.digits;
    const vals = m.results.map((r) => r.value).filter(fin);
    const isTemp = info.group === "temp";
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (isTemp && vals.length) { lo = Math.min(...vals); hi = Math.max(...vals); const p = (hi - lo) * 0.25 || 1; lo -= p; hi += p; }
    if (hi === lo) hi = lo + 1;
    const pos = (v) => ((v - lo) / (hi - lo)) * 100;
    const cmp = m.comparison;
    const winner = cmp.badges && cmp.more ? cmp.more : null;
    const ranks = cmp.ranks ? Object.fromEntries(cmp.ranks.map((r) => [r.case, r])) : {};
    const state = m.tier === "none" ? `<p class="sx-warn">공통으로 비교할 연도가 없습니다 — 각자 다른 연도 평균으로 승자를 정하지 않습니다.</p>` : m.tier === "reference" ? `<p class="ds-note"><span class="sx-badge est">참고 평균 · ${m.n}개 해</span> 표본이 적어 승패를 표시하지 않습니다.</p>` : m.limited ? `<p class="ds-note"><span class="sx-badge est">자료 제한</span> 공통 대상 ${m.eligible}개 해 중 ${m.n}개 해만 자료가 있어 강조 문장을 생략합니다.</p>` : "";
    const rows = m.results.map((r) => {
      const c = B.cases.find((x) => x.id === r.case);
      const cs = st.cases.find((x) => x.id === r.case);
      const v = r.value;
      const bar = !fin(v) ? `<span class="muted">–</span>` : isTemp ? `<span class="db-dot" style="left:${pos(v)}%;background:${V.CASE[r.case].color}"></span>${lo < 0 && hi > 0 ? `<span class="db-zero" style="left:${pos(0)}%"></span>` : ""}` : `<i style="width:${Math.max(0.8, pos(v) - pos(0))}%;margin-left:${pos(0)}%;background:${V.CASE[r.case].color}"></i>`;
      const extra = info.kind === "count" || info.kind === "share" ? (r.k != null && m.n ? ` <small>${r.k}/${m.n}</small>` : "") : "";
      return `<div class="db-row">${tag(r.case)}<span class="db-name" title="${E(c.specLabel)}">${E(cs?.label || c.specLabel)}${B.differentStations ? ` · ${E(stationName(c.stationId))}` : ""}</span><span class="db-track${isTemp ? " dot" : ""}">${bar}</span><b>${fin(v) ? `${fmt(v, dg)}${E(m.unit)}` : "–"}${extra}</b>${ranks[r.case] && cmp.badges ? `<small class="db-rank">${ranks[r.case].tied ? "공동 " : ""}${ranks[r.case].rank}위</small>` : ""}${winner === r.case ? `<span class="sx-badge">${E(cmp.moreLabel)}</span>` : ""}</div>`;
    }).join("");
    const exYears = Object.entries(m.excludedYears);
    return `<div class="db-mc"><h4>${E(m.label)} <small>공통 ${m.n}개 해${m.eligible !== m.n ? ` / 대상 ${m.eligible}` : ""}</small></h4>${rows}
      ${m.tier !== "none" ? `<p class="db-cmp">${E(cmp.status === "diff" || cmp.status === "rank" ? cmp.text : cmp.text)}${cmp.status === "roundEqual" ? " (같음 — 과장된 승패 없음)" : ""}</p>` : ""}${state}
      <details class="sx-rules"><summary>계산 · 제외 연도${exYears.length ? ` ${exYears.length}개` : ""}</summary><ul><li>${E(info.def)}</li><li>공통 연도: ${m.validYears.length ? m.validYears.join("·") : "없음"}</li>${exYears.map(([y, rs]) => `<li>${y}년 제외: ${rs.map((x) => `${x.case} ${E(STATUS(x.reason))}`).join(", ")}</li>`).join("")}</ul></details></div>`;
  }
  function renderCore() {
    const core = B.coreMetrics;
    const more = Object.keys(B.metrics).filter((k) => !core.includes(k));
    $("dbCore").innerHTML = `<h3 class="ds-h">핵심 비교 <small>지표마다 따로 비교 · 종합점수·전체 승자 없음</small></h3><div class="db-grid">${core.map(metricCard).join("")}</div>
      <details class="db-moremc"><summary>다른 지표 펼쳐 보기(최고·최저기온, 일교차, 강수 관측 비율, 선택 날짜 누적 강수량, 습도, 최대 순간풍속, 일조시간)</summary><div class="db-grid">${more.map(metricCard).join("")}</div></details>
      <div class="sx-tools"><span class="muted">카드·그래프·표·CSV 는 같은 서버 계산입니다. 강수일수·비율·평균·누적은 같은 강수 공통 연도로 계산합니다.</span><a class="dl-chip-btn" href="${api("summary")}&format=csv${st.cases.some((c) => c.label) ? `&labels=${st.cases.map((c) => encodeURIComponent(c.label || "")).join(",")}` : ""}" download>배틀 결과 CSV</a></div>`;
  }
  function renderHour() {
    if (!HB) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const M = HB.hourly[k];
    const series = HB.stations.map((s, i) => ({ label: s.id, color: V.CASE[s.id].color, dash: V.CASE[s.id].dash, mark: V.CASE[s.id].shape + s.id, values: M.hours.map((h) => h.values[i].mean) }));
    const ns = new Set(M.hours.map((h) => h.n));
    $("dbHour").innerHTML = `<h3 class="ds-h">시간별 평균 맞대결 <small>시각마다 모든 카드에 값이 있는 공통 연도의 평균 · 시간자료(1990~)</small></h3><div class="ds-tools">${seg("hm", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}</div><div class="sx-chart" id="dbHourChart"></div>
      <div class="sx-legend">${HB.stations.map((s) => `<span style="color:${V.CASE[s.id].color}"><i style="background:${V.CASE[s.id].color}"></i>${V.CASE[s.id].shape} ${s.id}</span>`).join("")}<span>단위 ${unit}</span>${ns.size > 1 ? `<span>시각마다 공통 연도 수가 다릅니다(${Math.min(...ns)}~${Math.max(...ns)}개 해 — 툴팁에 표시)</span>` : `<span>공통 ${[...ns][0]}개 해</span>`}</div>${k === "rn" ? `<p class="ds-note">강수 막대 = h~h+1시 1시간 강수량, 카드별 묶음 막대.</p>` : ""}`;
    V.hourChart($("dbHourChart"), { unit, digits: dg, bar: k === "rn", mean: null, series, aria: `${label} 시간별 카드 평균`, tip: (h) => { const x = M.hours[h]; return `<b>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</b> · 공통 ${x.n}개 해${x.tier === "reference" ? " (참고)" : x.limited ? " (자료 제한)" : ""}${x.values.map((v) => `<br>${tag(v.case)} ${fin(v.mean) ? `<b>${fmt(v.mean, dg)}${unit}</b>` : "–"}`).join("")}`; } });
  }
  function renderYears() {
    if (!B) return;
    const m = B.metrics[st.yr];
    const dg = m.digits;
    const two = B.cases.length === 2;
    $("dbYears").innerHTML = `<h3 class="ds-h">해마다 결과 보기 <small>공통 기준연도의 실제 값 · 연도를 누르면 그해 실제 시간별 값</small></h3><div class="ds-tools">${seg("yr", Object.entries(YR), st.yr)}</div>
      ${m.perYear.length ? `<div class="sx-table-wrap db-ytab"><table><thead><tr><th>기준연도</th>${B.cases.map((c) => `<th>${tag(c.id)} ${E(m.unit)}</th>`).join("")}${two ? "<th>A − B</th>" : ""}</tr></thead><tbody>${m.perYear.slice().reverse().map((py) => `<tr data-year="${py.referenceYear}" tabindex="0" class="${py.referenceYear === st.year ? "ds-tr-sel" : ""}" title="${py.values.map((v) => `${v.case} ${v.solarDate}`).join(" / ")}"><td><button type="button" class="linkish" data-year="${py.referenceYear}">${py.referenceYear}</button></td>${py.values.map((v) => `<td class="num">${fmt(v.value, dg)}<small class="muted"> ${v.solarDate ? `${+v.solarDate.slice(5, 7)}/${+v.solarDate.slice(8, 10)}` : ""}</small></td>`).join("")}${two ? `<td class="num">${sgn(py.values[0].value - py.values[1].value, dg)}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="sx-state">공통으로 비교할 연도가 없습니다.</div>`}
      <div id="dbYearDetail"></div>`;
    if (st.year && YB && YB.year === st.year) renderYearDetail();
    else if (st.year) $("dbYearDetail").innerHTML = `<div class="sx-state">${st.year}년 시간별 값 불러오는 중…</div>`;
  }
  function renderYearDetail() {
    const el = $("dbYearDetail");
    if (!el || !YB) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const series = YB.cases.map((c) => ({ label: c.case, color: V.CASE[c.case].color, dash: V.CASE[c.case].dash, mark: V.CASE[c.case].shape + c.case, values: c.series[k], status: c.cellStatus[k] }));
    el.innerHTML = `<div class="db-yd"><h4>${YB.year}년(기준연도) 실제 시간별 ${label} <button type="button" class="sec" id="dbYearClose">닫기</button></h4><p class="ds-note">${YB.cases.map((c) => `${tag(c.case)} ${c.solarDate ? `${dot(c.solarDate)}${c.lunarDate && st.cases.find((x) => x.id === c.case)?.cal === "L" ? ` (음력 ${c.isLeapMonth ? "윤" : ""}${+c.lunarDate.slice(5, 7)}/${+c.lunarDate.slice(8, 10)})` : ""}` : E(STATUS(c.dateStatus))}${c.hourlyStatus !== "ok" && c.solarDate ? ` · 시간자료 ${E(STATUS(c.hourlyStatus))}` : ""}`).join(" · ")}</p><div class="sx-table-wrap"><table class="db-ydaily"><thead><tr><th></th><th>평균</th><th>최고</th><th>최저</th><th>일강수량</th><th>풍속</th><th>습도</th></tr></thead><tbody>${YB.cases.map((c) => { const d = c.daily || {}; return `<tr><th>${tag(c.case)}</th><td>${fmt(d.avg, 1)}℃</td><td>${fmt(d.max, 1)}℃</td><td>${fmt(d.min, 1)}℃</td><td>${fin(d.rain) ? `${fmt(d.rain, 1)}mm` : "–"}</td><td>${fmt(d.wind, 1)}m/s</td><td>${fmt(d.hum, 0)}%</td></tr>`; }).join("")}</tbody></table></div><div class="sx-chart" id="dbYearChart"></div><p class="ds-note">위 '시간별 평균 맞대결'의 지표 선택(${label})을 따릅니다.</p></div>`;
    V.hourChart($("dbYearChart"), { unit, digits: dg, bar: k === "rn", mean: null, series, aria: `${YB.year}년 카드별 실제 ${label}`, tip: (h) => `<b>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</b>${YB.cases.map((c) => `<br>${tag(c.case)} ${fin(c.series[k][h]) ? `<b>${fmt(c.series[k][h], dg)}${unit}</b>` : E(STATUS(c.hourlyStatus !== "ok" ? c.hourlyStatus : c.cellStatus[k][h]))}`).join("")}` });
  }
  function renderPeriods() {
    const core = [...B.coreMetrics, "max", "min"];
    $("dbPeriods").innerHTML = `<h3 class="ds-h">기간별 비교 <small>같은 카드 조합을 최근 5·10·20·30년·전체로 · 각 구간의 시작·끝 연도와 공통 표본 수</small></h3>
      <div class="sx-table-wrap"><table class="db-ptab"><thead><tr><th>기간</th>${core.map((k) => `<th>${E(B.metricsInfo[k].label)}</th>`).join("")}</tr></thead><tbody>${B.periods.map((p) => `<tr class="${p.window.key === (B.window.mode === "recent" ? `r${B.window.years}-${B.window.toYear}` : B.window.mode === "all" ? `all-${B.window.toYear}` : "") ? "ds-tr-sel" : ""}"><th>${E(p.window.label)}</th>${core.map((k) => { const m = p.metrics[k]; const info = B.metricsInfo[k]; return `<td>${m.n ? m.results.map((r) => `<span class="db-pv">${tag(r.case)} ${fmt(r.value, info.digits)}</span>`).join("") : ""}<small class="muted">${m.n ? `N=${m.n}${m.firstYear ? ` · ${m.firstYear}~${m.lastYear}` : ""}${m.tier === "reference" ? " · 참고" : m.limited ? " · 자료 제한" : ""}` : "공통 연도 없음"}</small>${m.n && m.tier === "stats" ? `<small>${E(m.comparison.text)}</small>` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <details class="sx-rules"><summary>계산 기준</summary><ul><li>지표마다 모든 카드에 유효한 값이 있는 공통 기준연도만 씁니다(예: A 의 2020년 풍속이 없으면 B 의 2020년 풍속도 뺍니다. 그해 기온이 있으면 기온 비교에는 씁니다).</li><li>기준연도 = 각 카드 달력의 연도. 양력·음력 혼합은 각 달력의 같은 기준연도끼리 비교하며 실제 양력 날짜는 '해마다 결과 보기'에서 확인할 수 있습니다.</li><li>공통 0개 → 비교하지 않음. 1~2개 → 참고 평균(승패·순위 배지 없음). 3개 이상 → 비교. 공통 대상 대비 80% 미만 → 자료 제한(강조 문장 생략).</li><li>표시 정밀도로 반올림해 같으면 '표시 정밀도 안에서 차이 없음'. 온도 차이 ℃, 풍속 m/s, 비율 %p. 3~4개는 값 순서와 공동 순위.</li><li>더 덥거나 건조하다고 '좋은 날씨'라고 하지 않습니다. 통계 기간·표본 정책: ${E(B.policyVersion)} · ${E(B.battleVersion)} · 달력 ${E(B.calendarVersion)}</li></ul></details>`;
  }
  async function show() {
    shell();
    readHash();
    if (!meta) { try { meta = await getJson("/api/stats/meta"); } catch { meta = { stations: [] }; } }
    load();
  }
  window.DateBattle = { show };
})();
