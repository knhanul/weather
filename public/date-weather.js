// 날씨 이야기 › 날짜로 보는 날씨(#/stories/day). 값·문장은 모두 /api/stats/date-weather 응답 그대로(화면에서 다시 계산하지 않음, 반올림만).
// 일자료 요약을 먼저 그리고 시간자료(그래프·히트맵·시간표)는 따로 불러온다. 빠른 조건 변경은 순번 검사로 마지막 선택만 그린다.
// 주소 = 상태: station·cal·m·d·leap·year·cmp·period·to·from(+보기 상태 hm·ym·hk·hd). 새로고침·뒤로 가기·공유가 같은 화면을 복원한다.
(() => {
  const V = window.DViz;
  const { esc: E, fmt, sgn, fin } = V;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, "0");
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const THIS_YEAR = +kst().slice(0, 4);
  const solarDim = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const dow = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  const dot = (ymd) => (ymd ? `${+ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const HM = { ta: ["기온", "℃", 1], rn: ["강수량", "mm", 1], ws: ["풍속", "m/s", 1], hm: ["습도", "%", 0] };
  const YM = { avg: ["평균기온", "℃", 1, "line"], max: ["최고기온", "℃", 1, "line"], min: ["최저기온", "℃", 1, "line"], rain: ["일강수량", "mm", 1, "bar"], wind: ["평균 풍속", "m/s", 1, "line"], hum: ["평균 습도", "%", 0, "line"], gust: ["최대 순간풍속", "m/s", 1, "line"], sun: ["일조시간", "시간", 1, "bar"] };
  const PERIODS = [["recent5", "최근 5년"], ["recent10", "최근 10년"], ["recent20", "최근 20년"], ["recent30", "최근 30년"], ["all", "전체"], ["custom", "직접 지정"]];
  const st = { station: "108", cal: "solar", m: 10, d: 17, leap: false, year: THIS_YEAR, cmp: [], period: "recent10", to: THIS_YEAR - 1, from: THIS_YEAR - 10, hm: "ta", ym: "avg", hk: "ta", hd: "raw", alias: "", showLunar: true };
  let meta = null;
  let seq = 0;
  let D = null; // 일자료 응답
  let H = null; // 시간자료 응답
  const cache = new Map();
  const getJson = (url) => {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(async (r) => { const j = await r.json().catch(() => ({ ok: false, message: "응답을 읽지 못했습니다" })); if (!r.ok || !j.ok) { cache.delete(url); throw new Error(j.message || `조회 실패(${r.status})`); } return j; }).catch((e) => { cache.delete(url); throw e; });
    cache.set(url, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return p;
  };
  const specLabel = () => (st.cal === "lunar" ? `음력 ${st.m}월 ${st.d}일·${st.leap ? "윤달" : "평달"}` : `양력 ${st.m}월 ${st.d}일`);
  const aliasKey = () => `nw.dateAlias.${st.cal}${p2(st.m)}${p2(st.d)}${st.leap ? "L" : ""}`;

  // ---------------------------------------------------------------- 주소 ↔ 상태
  function readHash() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const n = (k, lo, hi) => { const v = Number(q.get(k)); return Number.isInteger(v) && v >= lo && v <= hi ? v : null; };
    if (q.get("station")) st.station = q.get("station");
    else if (window.NWStation && NWStation.stored && NWStation.stored()) st.station = NWStation.stored();
    st.cal = q.get("cal") === "lunar" ? "lunar" : "solar";
    const today = kst();
    st.m = n("m", 1, 12) ?? +today.slice(5, 7);
    st.d = n("d", 1, 31) ?? +today.slice(8, 10);
    if (st.cal === "solar" && st.d > solarDim(st.m)) st.d = solarDim(st.m);
    if (st.cal === "lunar" && st.d > 30) st.d = 30;
    st.leap = st.cal === "lunar" && q.get("leap") === "1";
    st.year = n("year", 1900, 2050) ?? THIS_YEAR;
    st.cmp = String(q.get("cmp") || "").split(",").map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2050 && y !== st.year).slice(0, 2);
    st.period = PERIODS.some(([p]) => p === q.get("period")) ? q.get("period") : "recent10";
    st.to = n("to", 1971, THIS_YEAR) ?? THIS_YEAR - 1;
    st.from = n("from", 1900, st.to) ?? Math.max(1970, st.to - 9);
    if (HM[q.get("hm")]) st.hm = q.get("hm");
    if (YM[q.get("ym")]) st.ym = q.get("ym");
    if (HM[q.get("hk")]) st.hk = q.get("hk");
    st.hd = q.get("hd") === "diff" ? "diff" : "raw";
    const saved = (() => { try { return localStorage.getItem(aliasKey()) || ""; } catch { return ""; } })();
    st.alias = (q.get("alias") || saved || "").slice(0, 30);
  }
  function query({ view = true, alias = false } = {}) {
    const q = new URLSearchParams({ station: st.station, cal: st.cal, m: String(st.m), d: String(st.d) });
    if (st.cal === "lunar") q.set("leap", st.leap ? "1" : "0");
    q.set("year", String(st.year));
    if (st.cmp.length) q.set("cmp", st.cmp.join(","));
    q.set("period", st.period);
    q.set("to", String(st.to));
    if (st.period === "custom") q.set("from", String(st.from));
    if (view) { if (st.hm !== "ta") q.set("hm", st.hm); if (st.ym !== "avg") q.set("ym", st.ym); if (st.hk !== "ta") q.set("hk", st.hk); if (st.hd !== "raw") q.set("hd", st.hd); }
    if (alias && st.alias) q.set("alias", st.alias);
    return q;
  }
  const hashOf = (o) => `#/stories/day?${query(o)}`;
  // 조건 변경 = 새 기록(뒤로 가기로 이전 조건), 보기 전환 = 같은 기록 고침
  const go = () => { const h = hashOf(); if (location.hash !== h) location.hash = h; else load(); };
  const replaceView = () => { const h = hashOf(); if (location.hash !== h) history.replaceState(history.state, "", h); };
  const apiQuery = (part) => {
    const q = new URLSearchParams({ station: st.station, cal: st.cal, m: String(st.m), d: String(st.d), leap: st.leap ? "1" : "0", period: st.period, to: String(st.to), part, years: [st.year, ...st.cmp].join(",") });
    if (st.period === "custom") q.set("from", String(st.from));
    return q;
  };

  // ---------------------------------------------------------------- 뼈대
  const ART = `<svg class="ds-art" viewBox="0 0 120 64" aria-hidden="true"><rect x="6" y="10" width="40" height="44" rx="6" fill="#fff" stroke="#9cc4ff" stroke-width="2"/><rect x="6" y="10" width="40" height="12" rx="6" fill="#026ef8"/><rect x="6" y="16" width="40" height="6" fill="#026ef8"/><circle cx="16" cy="9" r="2.5" fill="#0050e0"/><circle cx="36" cy="9" r="2.5" fill="#0050e0"/><text x="26" y="46" text-anchor="middle" font-size="18" font-weight="800" fill="#0d1b3d" id="dsArtDay"></text><rect x="58" y="12" width="7" height="30" rx="3.5" fill="#fff" stroke="#e8590c" stroke-width="2"/><circle cx="61.5" cy="46" r="6" fill="#e8590c"/><rect x="60" y="24" width="3" height="20" fill="#e8590c"/><path d="M84 14c0 0-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13z" fill="#2f6fd6"/><path d="M78 44h26M82 50h30M76 56h20" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  function shell() {
    const p = $("sday");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `
      <div class="card ds-head"><div class="ds-head-t">${ART}<div><h2 class="sx-q">날짜로 보는 날씨<small>아무 날짜나 양력·음력으로 넣으면 해마다 그날의 날씨를 과거 관측으로 보여 줍니다. 예보·확률이 아닙니다.</small></h2></div></div>
        <div class="sx-ctl ds-ctl" id="dsCtl"></div>
        <p class="ds-banner" id="dsBanner" role="status"></p><div class="fav-row" id="dsFav"></div><p class="ds-toast" id="dsToast" role="status" hidden></p></div>
      <div class="card" id="dsCard"></div>
      <div class="card" id="dsKey"></div>
      <div class="card" id="dsHour" data-sec="hourly"></div>
      <div class="card" id="dsYear" data-sec="yearly"></div>
      <div class="card" id="dsHeat" data-sec="heatmap"></div>
      <div class="card" id="dsSel" data-sec="selected"></div>
      <div class="card" id="dsStory"></div>`;
    p.addEventListener("change", onChange);
    p.addEventListener("click", onClick);
    p.addEventListener("input", (e) => { if (e.target.id === "dsAlias") { st.alias = e.target.value.slice(0, 30); renderCard(); } });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (document.body.dataset.page === "sday") { if (D) { renderYear(); } if (H) { renderHour(); renderHeat(); } } }, 200); });
  }
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const seg = (name, list, cur) => `<div class="seg ds-seg" role="group">${list.map(([v, l]) => `<button type="button" data-${name}="${v}" class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${E(l)}</button>`).join("")}</div>`;
  function renderCtl() {
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})${s.region ? ` · ${s.region}` : ""}`]);
    const dmax = st.cal === "solar" ? solarDim(st.m) : 30;
    const years = []; for (let y = THIS_YEAR; y >= 1970; y--) years.push([y, `${y}년`]);
    const toYears = []; for (let y = THIS_YEAR; y >= 1971; y--) toYears.push([y, `${y}년`]);
    const solarVal = st.cal === "solar" && !(st.m === 2 && st.d === 29 && !(st.year % 4 === 0 && (st.year % 100 !== 0 || st.year % 400 === 0))) ? `${st.year}-${p2(st.m)}-${p2(st.d)}` : "";
    $("dsCtl").innerHTML = `
      <div><label for="dsSt">관측지점</label><select id="dsSt">${opt(stations, st.station)}</select></div>
      <div><label>날짜 기준</label>${seg("cal", [["solar", "양력"], ["lunar", "음력"]], st.cal)}</div>
      <div><label for="dsM">월·일</label><span class="sx-inline"><select id="dsM" aria-label="월">${opt(Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}월`]), st.m)}</select><select id="dsD" aria-label="일">${opt(Array.from({ length: dmax }, (_, i) => [i + 1, `${i + 1}일`]), st.d)}</select>${st.cal === "solar" ? `<input type="date" id="dsPick" aria-label="달력에서 날짜 고르기" min="1970-01-01" max="2050-12-31" value="${solarVal}">` : ""}</span></div>
      ${st.cal === "lunar" ? `<div><label>평달 / 윤달</label>${seg("leap", [["0", "평달"], ["1", "윤달"]], st.leap ? "1" : "0")}</div>` : ""}
      <div><label for="dsYr">선택 연도</label><span class="sx-inline"><button type="button" class="sec ds-yb" data-ystep="-1" aria-label="이전 연도">‹</button><select id="dsYr">${opt(years.some(([y]) => y === st.year) ? years : [[st.year, `${st.year}년`], ...years], st.year)}</select><button type="button" class="sec ds-yb" data-ystep="1" aria-label="다음 연도">›</button></span></div>
      <div class="ds-wide"><label>통계 기간</label>${seg("period", PERIODS, st.period)}</div>
      ${st.period === "custom" ? `<div><label for="dsFrom">시작 기준연도</label><input id="dsFrom" type="number" class="sx-num" min="1900" max="${st.to}" value="${st.from}"></div>` : ""}
      <div><label for="dsTo">끝 기준연도</label><select id="dsTo">${opt(toYears, st.to)}</select></div>
      <div><label for="dsAlias">별칭(선택)</label><input id="dsAlias" maxlength="30" placeholder="예: 우리 집 기념일" value="${E(st.alias)}"></div>
      <div class="ds-acts"><button type="button" id="dsGo">날씨 보기</button><button type="button" class="sec" id="dsBattle">이 날짜로 배틀</button><button type="button" class="sec" id="dsCardImg">카드 이미지</button></div>`;
    $("dsBanner").innerHTML = `<b>매년 ${E(specLabel())}을 비교 중</b> · ${E(periodText())} · 선택 연도 ${st.year}년${st.cmp.length ? ` + 비교 ${st.cmp.join("·")}년` : ""} <span class="muted">· 일자료 1970~ / 시간자료 1990~</span>`;
    const art = document.getElementById("dsArtDay");
    if (art) art.textContent = String(st.d);
    renderFav();
  }
  // ---- 자주 보는 날짜(이 브라우저에만)
  const favKey = () => `${st.station}|${st.cal}|${st.m}|${st.d}|${st.leap ? 1 : 0}`;
  const stName = (id) => (meta?.stations || []).find((s) => String(s.station_id) === String(id))?.station_name || id;
  function favLabel(x) { const sl = x.cal === "lunar" ? `음력 ${x.m}/${x.d}${x.leap ? "(윤)" : ""}` : `${x.m}월 ${x.d}일`; return `${x.alias ? `${x.alias} · ` : ""}${sl} · ${stName(x.station)}`; }
  function favHref(x) { const q = new URLSearchParams({ station: x.station, cal: x.cal, m: String(x.m), d: String(x.d) }); if (x.cal === "lunar") q.set("leap", x.leap ? "1" : "0"); q.set("period", st.period); q.set("to", String(st.to)); if (st.period === "custom") q.set("from", String(st.from)); if (x.alias) q.set("alias", x.alias); return `#/stories/day?${q}`; }
  function renderFav() {
    const el = $("dsFav");
    if (!el || !window.StoryFavs) return;
    const on = StoryFavs.has("day", favKey());
    el.innerHTML = `<button type="button" class="sec fav-star${on ? " on" : ""}" id="dsFavBtn" aria-pressed="${on}" title="이 브라우저에 저장">${on ? "★ 저장됨" : "☆ 이 날짜 저장"}</button><span class="fav-list" aria-label="자주 보는 날짜">${StoryFavs.chips("day", { label: favLabel, href: favHref, current: favKey() })}</span>`;
  }
  const periodText = () => { const p = PERIODS.find(([x]) => x === st.period)[1]; if (st.period === "custom") return `${st.from}~${st.to}년`; if (st.period === "all") return `전체(~${st.to}년)`; const n = +st.period.slice(6); return `${p}(${st.to - n + 1}~${st.to})`; };
  function toast(msg) { const t = $("dsToast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000); }

  async function switchCal(to) {
    if (to === st.cal) return;
    try {
      const q = new URLSearchParams({ cal: st.cal, m: String(st.m), d: String(st.d), leap: st.leap ? "1" : "0", period: "recent5", to: String(Math.min(st.to, THIS_YEAR)), year: String(st.year), switchTo: to });
      const r = await getJson(`/api/stats/calendar-map?${q}`);
      if (!r.switch || !r.switch.ok) { toast(r.switch?.message || "기준을 바꿀 수 없습니다. 실제로 있는 날짜를 고르세요"); return; }
      Object.assign(st, { cal: r.switch.spec.calendar, m: r.switch.spec.month, d: r.switch.spec.day, leap: r.switch.spec.leapMonth, year: r.switch.selectedYear });
      st.cmp = st.cmp.filter((y) => y !== st.year);
      toast(`이제 매년 ${specLabel()}을 비교합니다 (${dot(r.switch.solarDate)}의 ${to === "lunar" ? "음력" : "양력"} 날짜). 다른 연도의 대응 날짜도 새로 계산합니다.`);
      go();
    } catch (e) { toast(`조회 실패 · ${e.message}`); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "dsSt") { st.station = t.value; if (window.NWStation) NWStation.manual(t.value); }
    else if (t.id === "dsM") { st.m = +t.value; const max = st.cal === "solar" ? solarDim(st.m) : 30; if (st.d > max) st.d = max; }
    else if (t.id === "dsD") st.d = +t.value;
    else if (t.id === "dsPick") { if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return; st.year = +t.value.slice(0, 4); st.m = +t.value.slice(5, 7); st.d = +t.value.slice(8, 10); st.cmp = st.cmp.filter((y) => y !== st.year); }
    else if (t.id === "dsYr") { st.year = +t.value; st.cmp = st.cmp.filter((y) => y !== st.year); }
    else if (t.id === "dsTo") { st.to = +t.value; if (st.from > st.to) st.from = st.to; }
    else if (t.id === "dsFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > st.to) return; st.from = v; }
    else if (t.id === "dsLunarCol") { st.showLunar = t.checked; renderTable(); return; }
    else if (t.id === "dsAliasSave") { try { if (t.checked && st.alias) localStorage.setItem(aliasKey(), st.alias); else localStorage.removeItem(aliasKey()); } catch {} return; }
    else if (t.id === "dsCmpAdd") { const y = +t.value; if (y && !st.cmp.includes(y) && y !== st.year && st.cmp.length < 2) st.cmp.push(y); }
    else return;
    go();
  }
  function onClick(e) {
    const b = e.target.closest("button,a[data-ev]");
    if (!b) return;
    const ds = b.dataset;
    if (ds.cal) return switchCal(ds.cal);
    if (ds.leap !== undefined && b.closest("#dsCtl")) { st.leap = ds.leap === "1"; return go(); }
    if (ds.period) { st.period = ds.period; return go(); }
    if (ds.ystep) { st.year += +ds.ystep; st.cmp = st.cmp.filter((y) => y !== st.year); return go(); }
    if (ds.hm) { st.hm = ds.hm; replaceView(); return renderHour(); }
    if (ds.ym) { st.ym = ds.ym; replaceView(); return renderYear(); }
    if (ds.hk) { st.hk = ds.hk; if (st.hk !== "ta" && st.hd === "diff") st.hd = "diff"; replaceView(); return renderHeat(); }
    if (ds.hd) { st.hd = ds.hd; replaceView(); return renderHeat(); }
    if (ds.cmpdel) { st.cmp = st.cmp.filter((y) => y !== +ds.cmpdel); return go(); }
    if (ds.year && b.classList.contains("dv-cell")) { pickYear(+ds.year); return; }
    if (b.id === "dsGo") return go();
    if (b.id === "dsBattle" || b.id === "dsSelBattle") { location.hash = battleHref(b.id === "dsSelBattle"); return; }
    if (b.id === "dsCopy") return copyLink();
    if (b.id === "dsCardImg" || b.id === "dsCardImg2") return openCard();
    if (b.id === "dsFavBtn") { const on = StoryFavs.toggle("day", { key: favKey(), station: st.station, cal: st.cal, m: st.m, d: st.d, leap: st.leap, alias: st.alias }); toast(on ? "이 날짜를 이 브라우저에 저장했습니다(위 목록에서 바로 열기)" : "저장을 지웠습니다"); return renderFav(); }
    if (ds.favdel) { StoryFavs.remove("day", ds.favdel); return renderFav(); }
    if (ds.ev !== undefined) { e.preventDefault(); return showEvidence(+ds.ev); }
    if (b.id === "dsRetry") { cache.clear(); return load(); }
  }
  function pickYear(y) { if (y === st.year) return; st.year = y; st.cmp = st.cmp.filter((x) => x !== y); go(); }
  function battleHref() {
    const a = `A.${st.station}.${st.cal === "lunar" ? "L" : "S"}.${st.m}.${st.d}.${st.leap ? 1 : 0}`;
    const q = new URLSearchParams({ cases: a, period: st.period, to: String(st.to) });
    if (st.period === "custom") q.set("from", String(st.from));
    if (st.alias) q.set("labels", encodeURIComponent(st.alias));
    return `#/stories/battle?${q}`;
  }
  // 공유 링크 = 서버가 읽는 /s/day?…(미리보기 문구에 숫자) → 열면 같은 화면(#/stories/day?…)으로 이동
  const shareUrl = (withAlias) => `${location.origin}/s/day?${query({ view: false, alias: !!withAlias })}`;
  function openCard() {
    if (!D || !window.StoryShare) { toast("자료를 다 불러온 뒤 카드를 만들 수 있습니다"); return; }
    StoryShare.module().then((m) => {
      const withAlias = !!st.alias;
      StoryShare.open({ spec: m.daySpec(D, { alias: st.alias }), filename: `inal-${st.station}-${st.cal === "lunar" ? "L" : "S"}${p2(st.m)}${p2(st.d)}-${D.window.fromYear}-${D.window.toYear}`, shareUrl: shareUrl(withAlias && $("dsShareAlias")?.checked), title: "이날의 날씨 카드" });
    });
  }
  async function copyLink() {
    const withAlias = $("dsShareAlias")?.checked;
    const url = shareUrl(withAlias);
    try { await navigator.clipboard.writeText(url); toast("링크를 복사했습니다" + (withAlias ? " (별칭 포함)" : "")); } catch { prompt("이 주소를 복사하세요", url); }
  }

  // ---------------------------------------------------------------- 불러오기(일자료 먼저, 시간자료 따로)
  async function load() {
    const my = ++seq;
    D = null; H = null;
    renderCtl();
    for (const id of ["dsCard", "dsKey", "dsYear", "dsSel", "dsStory"]) $(id).innerHTML = `<div class="sx-state">불러오는 중…</div>`;
    for (const id of ["dsHour", "dsHeat"]) $(id).innerHTML = `<div class="sx-state">시간자료 불러오는 중…</div>`;
    const dUrl = `/api/stats/date-weather?${apiQuery("daily")}`;
    const hUrl = `/api/stats/date-weather?${apiQuery("hourly")}`;
    const hp = getJson(hUrl); // 함께 시작(일자료가 먼저 끝나면 먼저 그림)
    hp.catch(() => {});
    try {
      const d = await getJson(dUrl);
      if (my !== seq) return;
      D = d;
      renderCard(); renderKey(); renderYear(); renderSel(); renderStories(); 
    } catch (e) {
      if (my !== seq) return;
      for (const id of ["dsCard", "dsKey", "dsYear", "dsSel", "dsStory"]) $(id).innerHTML = `<div class="sx-state err">조회 실패 · ${E(e.message)} <button type="button" id="dsRetry" class="sec">다시 시도</button></div>`;
    }
    try {
      const h = await hp;
      if (my !== seq) return;
      H = h;
      renderHour(); renderHeat(); renderSel(); renderStories();
    } catch (e) {
      if (my !== seq) return;
      for (const id of ["dsHour", "dsHeat"]) $(id).innerHTML = `<div class="sx-state err">시간자료 조회 실패 · ${E(e.message)} <button type="button" id="dsRetry" class="sec">다시 시도</button></div>`;
    }
  }
  const STATUS = (s) => (D || H)?.statusText?.[s] || s;
  const badge = (m) => (m.tier === "reference" ? `<span class="sx-badge est">참고 평균 · ${m.n}개 해</span>` : m.limited ? `<span class="sx-badge est">자료 제한</span>` : "");
  const nText = (m) => `${m.n}개 해${m.eligible !== m.n ? ` / 대상 ${m.eligible}` : ""}${m.candidateYears.length !== m.eligible ? ` / 요청 ${m.candidateYears.length}` : ""}`;

  function renderCard() {
    if (!D) return;
    const s = D.selected[0];
    const cal = D.selectedCalendars?.[0];
    const stn = D.station;
    const title = st.alias ? `${E(st.alias)} <small>${E(D.specLabel)}</small>` : E(D.specLabel);
    let when;
    if (s.dateStatus === "nodate") when = `<b>${st.year}년에는 없는 날짜</b>${st.cal === "solar" ? " (2월 29일은 윤년에만 있습니다)" : st.leap ? " (그해에는 이 달의 윤달이 없습니다)" : " (그해 이 달은 29일까지)"}`;
    else if (s.dateStatus === "range") when = `<b>${STATUS("range")}</b>`;
    else when = `<b>${dot(s.solarDate)}(${dow(s.solarDate)})</b> · ${cal?.lunar ? `${E(cal.lunar.text)}` : ""}`;
    $("dsCard").innerHTML = `<div class="ds-card"><div><p class="ds-k">선택한 날짜</p><h3 class="ds-title">${title}</h3><p>${st.year}년${st.cal === "lunar" ? "(음력 기준연도)" : ""}: ${when}</p>
      ${s.dateStatus === "future" || s.dateStatus === "ongoing" ? `<p class="sx-warn">${STATUS(s.dateStatus)} — 과거 통계는 그대로 볼 수 있습니다.</p>` : ""}${s.dateStatus === "pending" ? `<p class="sx-warn">${STATUS("pending")} — 지난 날이지만 아직 공식 일자료가 들어오지 않았습니다(최신 ${dot(stn.dailyLast)}).</p>` : ""}</div>
      <dl class="ds-dl"><div><dt>관측지점</dt><dd>${E(stn.station_name)} (${E(stn.station_id)})${stn.region ? ` · ${E(stn.region)}` : ""} <small>지점 한 곳의 관측</small></dd></div><div><dt>통계 기간</dt><dd>${E(D.window.label)} · 기준연도 ${D.dateCounts.requested}개${D.dateCounts.nodate ? ` (그 날짜가 있는 해 ${D.dateCounts.exists}개)` : ""}</dd></div><div><dt>자료 범위</dt><dd>일자료 ${D.dailyFrom.slice(0, 4)}~${dot(stn.dailyLast)} / 시간자료 ${D.hourlyFrom.slice(0, 4)}~ <small>'전체'는 서비스가 보유한 범위이며 기상청 전체 역사가 아닙니다</small></dd></div></dl></div>`;
  }
  function renderKey() {
    const M = D.daily.metrics;
    const card = (label, m, unit, d, extra = "") => `<div><span>${label} ${badge(m)}</span><b>${m.n ? `${fmt(m.mean, d)}${unit}` : "–"}</b><small>${m.n ? nText(m) : "자료가 있는 해 없음"}${extra}</small></div>`;
    const rn = M.rain;
    const rows = D.daily.rows.map((r) => ({ year: r.referenceYear, rainy: r.dateStatus === "ok" && r.values.rain != null ? r.values.rain >= 0.1 : null, status: r.dateStatus === "ok" ? (r.values.rain == null ? "missing" : "ok") : r.dateStatus, label: r.dateStatus !== "ok" ? STATUS(r.dateStatus) : r.values.rain == null ? "자료 없음" : r.values.rain >= 0.1 ? `강수 ${fmt(r.values.rain)}mm` : `강수 없음(${r.rainNorm === "blank0" ? "공란=무강수" : "0mm"})` }));
    $("dsKey").innerHTML = `<h3 class="ds-h">핵심 숫자 <small>매년 ${E(D.specLabel)} 하루씩 · 공식 일자료</small></h3>
      <div class="sx-key ds-key">${card("평균기온", M.avg, "℃", 1)}
      <div><span>평균 최고 · 최저 ${badge(M.max)}</span><b>${M.max.n ? `${fmt(M.max.mean)} · ${fmt(M.min.mean)}℃` : "–"}</b><small>${M.max.n ? nText(M.max) : "자료 없음"}</small></div>
      <div><span>강수 있었던 해 ${badge(rn)}</span><b>${rn.n ? `${rn.k}<small class="ds-of">/ ${rn.n}개 해</small>` : "–"}</b><small>${rn.n ? `${fmt(rn.share, 0)}% · 일강수량 0.1mm 이상(비·눈 등) — 과거 비율이며 강수확률이 아님` : "자료 없음"}</small></div>
      ${card("평균 일강수량", rn, "mm", 1, rn.n ? ` · 무강수 0 포함` : "")}${card("평균 풍속", M.wind, "m/s", 1)}${M.gust ? card("평균 최대 순간풍속", M.gust, "m/s", 1) : ""}${M.sun ? card("평균 일조시간", M.sun, "시간", 1) : ""}</div>
      ${V.rainCells(rows, { selected: [st.year] })}<p class="ds-note">물방울 = 강수 있음 · 빈 원 = 강수 없음 · 빗금 = 자료 없음 · × = 그해 없는 날짜·아직 관측 전·자료 미제공</p>`;
  }
  // ---- 시간별 날씨 변화
  function renderHour() {
    const el = $("dsHour");
    if (!H) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const M = H.hourly.metrics[k];
    const sel = H.hourly.selected;
    const series = sel.map((s, i) => ({ label: `${s.referenceYear}년`, color: V.SEL[i].color, dash: V.SEL[i].dash, mark: V.SEL[i].mark, values: s.series[k], status: s.cellStatus[k] }));
    const bar = k === "rn";
    const band = k === "ta" && M.hours.some((h) => fin(h.p10));
    const hl = (h) => (bar ? `${h}~${h + 1}시` : `${h}시`);
    const lowN = M.hours.filter((h) => h.tier === "reference").length;
    el.innerHTML = `<h3 class="ds-h">시간별 날씨 변화 <small>${E(H.window.label)} 같은 시각 평균(해마다 한 값) + 선택 연도 실제 관측 · 시간자료(정시)</small></h3>
      <div class="ds-tools">${seg("hm", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}<span class="ds-yrs">${sel.map((s, i) => `<span class="sx-yr" style="background:${V.SEL[i].color}">${V.SEL[i].mark} ${s.referenceYear}년${i ? `<button type="button" data-cmpdel="${s.referenceYear}" aria-label="${s.referenceYear}년 비교 빼기">×</button>` : ""}</span>`).join("")}${st.cmp.length < 2 ? `<select id="dsCmpAdd" aria-label="비교 연도 더하기"><option value="">+ 비교 연도</option>${opt(Array.from({ length: THIS_YEAR - 1989 }, (_, i) => THIS_YEAR - i).filter((y) => y !== st.year && !st.cmp.includes(y)).map((y) => [y, `${y}년`]), "")}</select>` : ""}</span></div>
      <div class="sx-chart" id="dsHourChart"></div>
      <div class="sx-legend"><span><i style="background:${V.MEAN}"></i>과거 평균(${E(H.window.label)}) · 실선</span>${band ? `<span><i style="background:#d5deeb;height:10px"></i>과거 관측값의 가운데 80% 범위(P10~P90, 그 시각 10개 해 이상)</span>` : ""}${lowN ? `<span><i class="dash"></i>빈 점 = 표본 1~2개 해(참고)</span>` : ""}${sel.map((s, i) => `<span style="color:${V.SEL[i].color}"><i style="background:${V.SEL[i].color}"></i>${V.SEL[i].mark} ${s.referenceYear}년 실제 관측${s.dateStatus !== "ok" ? ` — ${E(STATUS(s.dateStatus))}` : ""}</span>`).join("")}<span><i class="box"></i>빗금 = 자료 없음(선을 잇지 않음)</span><span>단위 ${unit}</span></div>
      ${bar ? `<p class="ds-note">강수량 막대 한 칸 = h~h+1시 1시간 강수량(기상청 정시값은 앞 1시간 누적 — 23~24시는 다음날 00시 값). 시간값을 더해 하루 강수량을 만들지 않습니다(공식 일강수량은 위 '핵심 숫자').</p>` : ""}
      ${hourTable()}`;
    V.hourChart($("dsHourChart"), {
      unit, digits: dg, bar, band, mean: M.hours, series, aria: `${label} 시간별 평균과 선택 연도`,
      tip: (h) => {
        const m = M.hours[h];
        let t = `<b>${hl(h)}</b> · 평균 <b>${m.n ? `${fmt(m.mean, dg)}${unit}` : "자료 없음"}</b> <span class="muted">(${m.n}/${m.eligible}개 해${m.tier === "reference" ? " · 참고" : ""}${m.limited ? " · 자료 제한" : ""})</span>${fin(m.p10) ? ` · 가운데 80% ${fmt(m.p10, dg)}~${fmt(m.p90, dg)}` : ""}`;
        sel.forEach((s, i) => { const v = s.series[k][h]; t += `<br><span style="color:${V.SEL[i].color}">${V.SEL[i].mark} ${s.referenceYear}년</span> ${fin(v) ? `<b>${fmt(v, dg)}${unit}</b>${m.n ? ` (평균과 ${sgn(v - m.mean, dg)}${unit})` : ""}` : E(STATUS(s.cellStatus[k][h]))}`; });
        return t;
      },
    });
  }
  function hourTable() {
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const M = H.hourly.metrics[k];
    const sel = H.hourly.selected;
    return `<details class="sx-table"><summary>표로 보기 · ${label}</summary><div class="sx-table-wrap"><table><thead><tr><th>${k === "rn" ? "구간" : "시각"}</th><th>평균(${unit})</th><th>유효/대상 연도</th>${k === "ta" ? "<th>P10</th><th>P90</th>" : ""}${sel.map((s) => `<th>${s.referenceYear}년</th>`).join("")}</tr></thead><tbody>${M.hours.map((m, h) => `<tr><td>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</td><td class="num">${m.n ? fmt(m.mean, dg) : "–"}</td><td class="num">${m.n}/${m.eligible}</td>${k === "ta" ? `<td class="num">${fmt(m.p10, dg)}</td><td class="num">${fmt(m.p90, dg)}</td>` : ""}${sel.map((s) => `<td class="num">${fin(s.series[k][h]) ? fmt(s.series[k][h], dg) : E(STATUS(s.cellStatus[k][h]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="sx-tools"><span class="muted">그래프·표·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("hourly")}&format=csv" download>시간별 CSV</a></div></details>`;
  }
  // ---- 해마다 달라진 이날
  function renderYear() {
    if (!D) return;
    const k = st.ym;
    const [label, unit, dg, kind] = YM[k];
    const m = D.daily.metrics[k === "max" || k === "min" ? k : k];
    const rows = D.daily.rows.map((r) => ({ year: r.referenceYear, value: r.dateStatus === "ok" ? r.values[k] : null, status: r.dateStatus === "ok" ? r.fieldStatus[k] : r.dateStatus, statusText: STATUS(r.dateStatus === "ok" ? r.fieldStatus[k] : r.dateStatus), r }));
    const ext = m.n ? `가장 ${kind === "bar" || k === "wind" || k === "gust" || k === "hum" ? "많았던/강했던" : "높았던"} 해 ${m.maxYears.join("·")}년(${fmt(m.max, dg)}${unit}) · 가장 ${kind === "bar" ? "적었던" : "낮았던"} 해 ${m.minYears.join("·")}년(${fmt(m.min, dg)}${unit})${m.maxYears.length > 1 || m.minYears.length > 1 ? " · 동률 포함" : ""}` : "";
    $("dsYear").innerHTML = `<h3 class="ds-h">해마다 달라진 이날 <small>기준연도마다 정확히 하루씩 뽑은 값 · 점·막대를 누르면 그해가 선택됩니다</small></h3>
      <div class="ds-tools">${seg("ym", Object.entries(YM).map(([v, x]) => [v, x[0]]), k)}</div>
      <div class="sx-chart" id="dsYearChart"></div>
      <div class="sx-legend"><span><i style="background:#0d1b3d"></i>${label}(${unit}) · ${kind === "bar" ? "막대" : "점·선"}</span><span><i class="dash" style="color:${V.MEAN}"></i>기간 평균</span><span style="color:#e8590c"><i style="background:#e8590c"></i>선택 연도</span><span><i class="box"></i>빗금 = 자료 없음·그해 없는 날짜</span></div>
      <p class="ds-note">${E(ext)}${ext ? " · " : ""}하루씩 뽑은 자료라 이 그래프만으로 계절·지역의 기후 추세를 단정할 수 없습니다.</p>`;
    V.yearChart($("dsYearChart"), {
      rows, bar: kind === "bar", unit, digits: dg, selected: [st.year, ...st.cmp], meanLine: m.n >= 3 ? m.mean : null, aria: `기준연도별 ${label}`, onPick: pickYear,
      tip: (i) => { const x = rows[i]; return `<b>${x.year}년</b>${st.cal === "lunar" ? "(음력 기준연도)" : ""} · ${x.r.solarDate ? `${dot(x.r.solarDate)}(${dow(x.r.solarDate)})${x.r.lunarText ? ` · ${E(x.r.lunarText)}` : ""}` : ""}<br>${fin(x.value) ? `${label} <b>${fmt(x.value, dg)}${unit}</b>${k === "rain" && x.r.rainNorm === "blank0" ? " (공란=무강수)" : ""}` : E(x.statusText)} <span class="muted">— Enter·클릭으로 선택</span>`; },
    });
  }
  // ---- 연도 × 시간 히트맵
  function renderHeat() {
    if (!H) return;
    const k = st.hk;
    const [label, unit, dg] = HM[k];
    const M = H.hourly.metrics[k];
    const diff = st.hd === "diff";
    const pre = H.hourly.heat.filter((r) => r.dateStatus === "unsupported");
    const rows = H.hourly.heat.filter((r) => r.dateStatus !== "unsupported").map((r) => ({
      year: r.referenceYear, sel: r.referenceYear === st.year, solar: r.solarDate, lunar: r.lunarDate, leap: r.isLeapMonth, status: r.cellStatus[k],
      dim: r.dateStatus !== "ok" ? STATUS(r.dateStatus) : null,
      values: r.series[k].map((v, h) => (fin(v) ? (diff ? (fin(M.hours[h].mean) ? v - M.hours[h].mean : null) : v) : null)),
    })).reverse();
    $("dsHeat").innerHTML = `<h3 class="ds-h">연도 × 시간 히트맵 <small>행 = 기준연도, 열 = 시각 · 같은 지표는 한 색 범위</small></h3>
      <div class="ds-tools">${seg("hk", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}${seg("hd", [["raw", "관측값"], ["diff", "같은 시각 평균과의 차이"]], st.hd)}</div>
      ${pre.length ? `<p class="ds-note">${pre[0].referenceYear}~${pre[pre.length - 1].referenceYear}년은 시간자료 미제공(일자료만 있음) — 행을 그리지 않았습니다.</p>` : ""}
      <div id="dsHeatChart"></div>${k === "rn" ? `<p class="ds-note">강수 칸 = h~h+1시 1시간 강수량.</p>` : ""}`;
    if (!rows.length) { $("dsHeatChart").innerHTML = `<div class="sx-state">이 기간에는 시간자료가 있는 해가 없습니다.</div>`; return; }
    V.heatmap($("dsHeatChart"), {
      rows, kind: k, diff, unit, digits: dg, aria: `${label} 연도 × 시간`, onPick: (y) => { if (y !== st.year) pickYear(y); },
      tip: (r, h) => { const raw = H.hourly.heat.find((x) => x.referenceYear === r.year); const v = raw.series[k][h]; return `<b>${r.year}년 ${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</b> · ${r.solar ? `${dot(r.solar)}(${dow(r.solar)})` : ""}${r.lunar ? ` · 음력 ${r.leap ? "윤" : ""}${+r.lunar.slice(5, 7)}월 ${+r.lunar.slice(8, 10)}일` : ""}<br>${fin(v) ? `${label} <b>${fmt(v, dg)}${unit}</b>${fin(M.hours[h].mean) ? ` · 같은 시각 평균과 ${sgn(v - M.hours[h].mean, dg)}${unit}` : ""}` : E(STATUS(raw.dateStatus === "ok" ? raw.cellStatus[k][h] : raw.dateStatus))} <span class="muted">— 누르면 그해 선택</span>`; },
    });
  }
  // ---- 선택 연도의 그날
  function renderSel() {
    if (!D) return;
    const s = D.selected[0];
    const v = s.values;
    const o = D.official;
    const hs = H ? H.hourly.selected[0] : null;
    const row = (k, val, note = "") => `<div><dt>${k}</dt><dd>${val}${note ? ` <small>${note}</small>` : ""}</dd></div>`;
    let body;
    if (s.dateStatus !== "ok") body = `<div class="sx-state">${E(STATUS(s.dateStatus))}${s.dateStatus === "nodate" ? " — 다른 연도로 자동 이동하지 않습니다" : ""}</div>`;
    else {
      const daily = s.rowPresent ? `<dl class="ds-dl ds-dl2">${row("일평균기온", v.avg != null ? `<b>${fmt(v.avg)}℃</b>` : "자료 없음", "공식 일평균")}${row("최고기온", v.max != null ? `<b>${fmt(v.max)}℃</b>${o?.maxTime ? ` (${o.maxTime})` : ""}` : "자료 없음")}${row("최저기온", v.min != null ? `<b>${fmt(v.min)}℃</b>${o?.minTime ? ` (${o.minTime})` : ""}` : "자료 없음")}${row("일강수량", v.rain != null ? `<b>${fmt(v.rain)}mm</b>` : "자료 없음", s.rainNorm === "blank0" ? "공란 = 기상청 관례상 무강수" : "")}${row("평균 풍속", v.wind != null ? `${fmt(v.wind)}m/s` : "자료 없음", o?.maxInstWindSpeed != null ? `최대 순간 ${fmt(+o.maxInstWindSpeed)}m/s` : "")}${row("평균 습도", v.hum != null ? `${fmt(v.hum, 0)}%` : "자료 없음")}${o?.sunshine != null ? row("일조", `${fmt(+o.sunshine)}시간`) : ""}</dl>` : `<p class="sx-warn">이날 공식 일자료 행이 없습니다(자료 없음). 시간자료는 아래처럼 있는 만큼만 보여 줍니다 — 시간값 평균을 공식 일평균으로 대신하지 않습니다.</p>`;
      const hourly = !hs ? `<div class="sx-state">시간자료 불러오는 중…</div>` : hs.dateStatus !== "ok" ? `<p class="ds-note">시간자료: ${E(STATUS(hs.dateStatus))}</p>` : `<details class="sx-table"${matchMedia("(min-width:801px)").matches ? " open" : ""}><summary>그날 시간별 관측표(정시)</summary><div class="sx-table-wrap"><table><thead><tr><th>시각</th><th>기온(℃)</th><th>강수(mm, h~h+1시)</th><th>풍속(m/s)</th><th>습도(%)</th></tr></thead><tbody>${Array.from({ length: 24 }, (_, h) => `<tr><td>${h}시</td>${["ta", "rn", "ws", "hm"].map((k) => `<td class="num">${fin(hs.series[k][h]) ? fmt(hs.series[k][h], k === "hm" ? 0 : 1) : `<span class="muted">${E(STATUS(hs.cellStatus[k][h]))}</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
      body = daily + hourly;
    }
    const cal = D.selectedCalendars?.[0];
    $("dsSel").innerHTML = `<h3 class="ds-h">선택 연도의 그날 <small>공식 일자료 + 시간자료(각각 있는 만큼)</small></h3>
      <div class="ds-selbar"><button type="button" class="sec" data-ystep="-1">‹ ${st.year - 1}년</button><b>${st.year}년${s.solarDate ? ` · ${dot(s.solarDate)}(${dow(s.solarDate)})` : ""}${cal?.lunar ? ` · ${E(cal.lunar.text)}` : ""}</b><button type="button" class="sec" data-ystep="1">${st.year + 1}년 ›</button></div>
      ${body}
      <div class="sx-tools"><span class="ds-acts"><button type="button" class="sec" id="dsSelBattle">배틀에 추가</button><button type="button" class="sec" id="dsCopy">링크 복사</button><button type="button" class="sec" id="dsCardImg2">카드 이미지</button><label class="sx-check"><input type="checkbox" id="dsShareAlias"> 링크에 별칭 넣기</label><label class="sx-check"><input type="checkbox" id="dsAliasSave"${(() => { try { return localStorage.getItem(aliasKey()) ? " checked" : ""; } catch { return ""; } })()}> 별칭을 이 브라우저에 저장</label></span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("daily")}&format=csv" download>연도별 CSV</a></div>`;
  }
  // ---- 이야기 + 근거 + 표
  let STORIES = [];
  function renderStories() {
    if (!D) return;
    STORIES = [...(D.stories || []), ...((H && H.hourly.stories) || [])].sort((a, b) => a.priority - b.priority).slice(0, 3);
    const ex = D.daily.metrics.avg.excludedYearsByReason;
    const exAll = {};
    for (const m of Object.values(D.daily.metrics)) for (const [r, ys] of Object.entries(m.excludedYearsByReason)) for (const y of ys) (exAll[r] ||= new Set()).add(y);
    $("dsStory").innerHTML = `<h3 class="ds-h">짧은 이야기와 근거 <small>조건을 만족할 때만, 실제 계산값으로(최대 3개)</small></h3>
      ${STORIES.length ? `<ol class="ds-stories">${STORIES.map((s, i) => `<li><p>${E(s.text)}</p><a href="#" data-ev="${i}" class="ds-ev">근거 보기 ›</a><div class="ds-evbox" id="dsEv${i}" hidden></div></li>`).join("")}</ol>` : `<p class="muted">조건을 만족하는 이야기가 없습니다(표본이 적거나 자료 제한).</p>`}
      <details class="sx-rules"><summary>유효 연도 · 제외 사유</summary><ul>${Object.entries(D.daily.metrics).map(([k, m]) => `<li><b>${E(YM[k]?.[0] || { range: "일교차", gust: "최대 순간풍속", sun: "일조시간" }[k] || k)}</b>: 유효 ${m.n}개 해(${m.validYears.length ? `${m.validYears[0]}~${m.validYears[m.validYears.length - 1]}` : "-"}) / 대상 ${m.eligible} / 요청 ${m.candidateYears.length}${Object.keys(m.excludedYearsByReason).length ? ` — ${Object.entries(m.excludedYearsByReason).map(([r, ys]) => `${E(STATUS(r))} ${ys.join("·")}`).join(" / ")}` : ""}</li>`).join("")}</ul></details>
      ${tableHtml()}
      <details class="sx-rules"><summary>계산 기준</summary><ul>
        <li>각 기준연도의 정확히 그 날짜(${E(D.specLabel)})만 씁니다. 주변 날짜를 섞지 않고, 빠진 해가 있어도 기간을 늘려 표본을 채우지 않습니다.</li>
        <li>평균기온 = 공식 일평균기온의 평균(최고·최저의 중간값이 아님). 일교차 = 같은 해 최고−최저를 먼저 계산한 뒤 평균. 강수 있었던 해 = 일강수량 0.1mm 이상.</li>
        <li>평균 일강수량 = 유효한 일강수량 합 ÷ N(무강수 0 포함). 일강수량 공란은 그날 행과 기온이 있을 때만 기상청 관례대로 무강수 0, 행 없음·전부 공란은 자료 없음.</li>
        <li>최대 순간풍속 = 공식 일최대 순간풍속(0~75m/s 이고 그날 최대 풍속 이상인 값만). 일조시간 = 공식 합계 일조시간(0 이상·가조시간 이하, 가조시간이 없으면 14.8시간 이하). 공란은 0 으로 세지 않고 자료 없음, 범위를 벗어나면 '품질 확인으로 제외'.</li>
        <li>시간 평균 = 같은 시각끼리 해마다 한 값을 평균(관측이 많은 해에 가중치 없음). 시간 강수 공란은 그 시각 행이 있고 품질 플래그가 결측(9)이 아닐 때만 무강수 0. 기온·강수·풍속·습도 플래그 9 는 '품질 확인으로 제외'.</li>
        <li>표본 정책(서비스 기준, 기상청 공식 기준 아님): N 1~2 = 참고 평균(승패·강한 요약·분포 밴드 없음), N≥3 = 통계, 유효/대상 80% 미만 = 자료 제한, P10~P90 밴드는 그 시각 N≥10·관측률 80% 이상(${E(D.sample.quantile)}).</li>
        <li>음력: 대한민국 음양력(한국천문연구원 자료 기반 표, ${E(D.lunarRange.solarFrom)}~${E(D.lunarRange.solarTo)}). 윤달은 그해 실제 있을 때만, 음력 30일이 없는 해·평년 2월 29일은 '그해에는 없는 날짜'(대체 없음). 기준연도 = 고른 달력의 연도.</li>
        <li>버전: 정책 ${E(D.policyVersion)} · 달력 ${E(D.calendarVersion)} · 이야기 ${E(D.storyVersion)} · 일자료 판 ${E(D.dataRevision.daily)}</li></ul></details>`;
    void ex; void exAll;
  }
  function tableHtml() {
    const lunar = st.showLunar;
    return `<details class="sx-table"><summary>표로 보기 · 기준연도별 그날</summary><label class="sx-check"><input type="checkbox" id="dsLunarCol"${lunar ? " checked" : ""}> 음력 날짜도 보기(표시만, 비교 기준은 그대로)</label><div class="sx-table-wrap"><table><thead><tr><th>기준연도</th><th>양력 날짜</th>${lunar ? "<th>음력</th>" : ""}<th>상태</th><th>평균(℃)</th><th>최고</th><th>최저</th><th>강수(mm)</th><th>풍속</th><th>습도</th><th>순간풍속</th><th>일조(시간)</th></tr></thead><tbody>${D.daily.rows.slice().reverse().map((r) => `<tr class="${r.dateStatus !== "ok" || !r.rowPresent ? "dim" : ""}${r.referenceYear === st.year ? " ds-tr-sel" : ""}"><td>${r.referenceYear}</td><td>${r.solarDate ? `${r.solarDate}(${dow(r.solarDate)})` : "–"}</td>${lunar ? `<td>${r.lunarDate ? `${r.isLeapMonth ? "윤" : ""}${r.lunarDate}` : "–"}</td>` : ""}<td>${E(r.dateStatus === "ok" ? (r.rowPresent ? (r.rainNorm === "blank0" ? "자료 있음(강수 공란=무강수)" : "자료 있음") : "자료 없음") : STATUS(r.dateStatus))}</td>${["avg", "max", "min", "rain", "wind", "hum", "gust", "sun"].map((k) => `<td class="num">${r.values[k] != null ? fmt(r.values[k], k === "hum" ? 0 : 1) : r.fieldStatus?.[k] === "qc" ? `<span class="muted" title="품질 확인으로 제외">QC</span>` : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="sx-tools"><span class="muted">그래프·숫자·이야기·표·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("daily")}&format=csv" download>연도별 CSV</a></div></details>`;
  }
  function showEvidence(i) {
    const s = STORIES[i];
    const box = $(`dsEv${i}`);
    if (!s || !box) return;
    const ev = s.evidence || {};
    const exc = ev.excluded && !Array.isArray(ev.excluded) ? Object.entries(ev.excluded).map(([r, ys]) => `${STATUS(r)} ${ys.join("·")}`).join(" / ") : Array.isArray(ev.excluded) ? ev.excluded.join("·") : "";
    box.innerHTML = `<ul><li>지표: ${E({ rain: "일강수량", avg: "일평균기온", ta: "정시 기온", date: "날짜 대응" }[ev.metric] || ev.metric)}</li><li>계산: ${E(ev.formula || "")}</li>${ev.years?.length ? `<li>해당 연도: ${ev.years.join("·")}</li>` : ""}${ev.hours?.length ? `<li>시각: ${ev.hours.map((h) => `${h}시`).join("·")}</li>` : ""}${exc ? `<li>제외: ${E(exc)}</li>` : ""}</ul>`;
    box.hidden = !box.hidden;
    const target = document.querySelector(`#sday [data-sec="${s.target}"]`);
    if (target && !box.hidden) {
      if (s.metric && s.target === "yearly" && YM[s.metric] && st.ym !== s.metric) { st.ym = s.metric; replaceView(); renderYear(); }
      if (s.metric && s.target === "hourly" && HM[s.metric] && st.hm !== s.metric) { st.hm = s.metric; replaceView(); renderHour(); }
      target.classList.remove("ds-flash"); void target.offsetWidth; target.classList.add("ds-flash");
      target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }

  async function show() {
    shell();
    readHash();
    if (!meta) { try { meta = await getJson("/api/stats/meta"); } catch { meta = { stations: [{ station_id: st.station, station_name: st.station }] }; } }
    if (!(meta.stations || []).some((s) => String(s.station_id) === String(st.station))) st.station = "108";
    load();
  }
  window.DateDay = { show, station: () => st.station, onStation: (id) => { st.station = id; go(); } };
})();
