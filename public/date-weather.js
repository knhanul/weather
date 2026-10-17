// 날씨 이야기 › 날짜로 보는 날씨(#/stories/day) v2(2026-10-18). 값·문장은 모두 /api/stats/date-weather 응답 그대로(화면에서 다시 계산하지 않음, 반올림·뺄셈 표시만).
// 화면 모델: 날짜 하나(양력·음력 연월일) → ① 해마다 이날(그해 실제 관측 · 횟수·극값, 같은 날 평균 없음) ② 앞뒤 15일 날씨 통계(31일 창)
//   ③ 고른 해의 시간별 관측(+겹쳐 볼 해 최대 2개, 평균 없음) ④ 연도 × 시간 히트맵(관측값) ⑤ 고른 해 그날 상세 ⑥ 짧은 이야기.
// 주소 = 상태: station·cal·date(YYYY-MM-DD)·leap·cmp·period·to·from(+보기 hm·ym·hk). 예전 주소(m·d·year)도 그대로 읽는다.
(() => {
  const V = window.DViz;
  const { esc: E, fmt, sgn, fin } = V;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, "0");
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const THIS_YEAR = +kst().slice(0, 4);
  const solarDimMax = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; // 2월 29일은 입력 가능(평년이면 '그해에는 없는 날짜')
  const isLeapY = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dow = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  const dot = (ymd) => (ymd ? `${+ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const md = (ymd) => (ymd ? `${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const HM = { ta: ["기온", "℃", 1], rn: ["강수량", "mm", 1], ws: ["풍속", "m/s", 1], hm: ["습도", "%", 0] };
  const YM = { max: ["최고기온", "℃", 1, "line"], min: ["최저기온", "℃", 1, "line"], avg: ["평균기온", "℃", 1, "line"], rain: ["일강수량", "mm", 1, "bar"], wind: ["평균 풍속", "m/s", 1, "line"], gust: ["최대 순간풍속", "m/s", 1, "line"], sun: ["일조시간", "시간", 1, "bar"] };
  const PERIODS = [["recent5", "최근 5년"], ["recent10", "최근 10년"], ["recent20", "최근 20년"], ["recent30", "최근 30년"], ["all", "전체"], ["custom", "직접 지정"]];
  const today = kst();
  const st = { station: "108", cal: "solar", y: +today.slice(0, 4), m: +today.slice(5, 7), d: +today.slice(8, 10), leap: false, cmp: [], period: "recent10", to: THIS_YEAR - 1, from: THIS_YEAR - 10, hm: "ta", ym: "max", hk: "ta", alias: "", all: false };
  let meta = null;
  let seq = 0;
  let D = null; // 일자료 응답(해마다 이날 · 앞뒤 15일 · 고른 해)
  let H = null; // 시간자료 응답
  const cache = new Map();
  const getJson = (url) => {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(async (r) => { const j = await r.json().catch(() => ({ ok: false, message: "응답을 읽지 못했습니다" })); if (!r.ok || !j.ok) { cache.delete(url); throw new Error(j.message || `조회 실패(${r.status})`); } return j; }).catch((e) => { cache.delete(url); throw e; });
    cache.set(url, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return p;
  };
  const dateStr = () => `${st.y}-${p2(st.m)}-${p2(st.d)}`;
  const specLabel = () => (st.cal === "lunar" ? `음력 ${st.m}월 ${st.d}일${st.leap ? "(윤달)" : ""}` : `양력 ${st.m}월 ${st.d}일`);
  const aliasKey = () => `nw.dateAlias.${st.cal}${p2(st.m)}${p2(st.d)}${st.leap ? "L" : ""}`;

  // ---------------------------------------------------------------- 날짜 입력 해석(YYYY-MM-DD · YYYY.MM.DD · YYYY/MM/DD · YYYYMMDD · 2025년 10월 18일)
  function parseDate(raw, cal) {
    const t = String(raw || "").trim();
    const m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t);
    if (!m) return { ok: false, message: "날짜를 2025-10-18 처럼 연-월-일로 넣어 주세요" };
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2050) return { ok: false, message: "연도는 1900~2050년 사이로 넣어 주세요" };
    if (mo < 1 || mo > 12) return { ok: false, message: "월은 1~12 사이입니다" };
    const max = cal === "lunar" ? 30 : solarDimMax(mo);
    if (d < 1 || d > max) return { ok: false, message: cal === "lunar" ? "음력 날짜는 1~30일입니다" : `${mo}월은 ${max}일까지입니다` };
    return { ok: true, y, m: mo, d };
  }

  // ---------------------------------------------------------------- 주소 ↔ 상태
  function readHash() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const n = (k, lo, hi) => { const v = Number(q.get(k)); return q.get(k) != null && Number.isInteger(v) && v >= lo && v <= hi ? v : null; };
    if (q.get("station")) st.station = q.get("station");
    else if (window.NWStation && NWStation.stored && NWStation.stored()) st.station = NWStation.stored();
    st.cal = q.get("cal") === "lunar" ? "lunar" : "solar";
    const t = kst();
    const pd = q.get("date") ? parseDate(q.get("date"), st.cal) : null;
    if (pd && pd.ok) Object.assign(st, { y: pd.y, m: pd.m, d: pd.d });
    else {
      // 예전 주소: m·d(·year) — 연도가 없으면 올해
      st.m = n("m", 1, 12) ?? +t.slice(5, 7);
      st.d = n("d", 1, 31) ?? +t.slice(8, 10);
      st.y = n("year", 1900, 2050) ?? THIS_YEAR;
      const max = st.cal === "lunar" ? 30 : solarDimMax(st.m);
      if (st.d > max) st.d = max;
    }
    st.leap = st.cal === "lunar" && q.get("leap") === "1";
    st.cmp = String(q.get("cmp") || "").split(",").map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2050 && y !== st.y).slice(0, 2);
    st.period = PERIODS.some(([p]) => p === q.get("period")) ? q.get("period") : "recent10";
    st.to = n("to", 1971, THIS_YEAR) ?? THIS_YEAR - 1;
    st.from = n("from", 1900, st.to) ?? Math.max(1970, st.to - 9);
    if (HM[q.get("hm")]) st.hm = q.get("hm");
    if (YM[q.get("ym")]) st.ym = q.get("ym");
    if (HM[q.get("hk")]) st.hk = q.get("hk");
    const saved = (() => { try { return localStorage.getItem(aliasKey()) || ""; } catch { return ""; } })();
    st.alias = (q.get("alias") || saved || "").slice(0, 30);
  }
  function query({ view = true, alias = false } = {}) {
    const q = new URLSearchParams({ station: st.station, cal: st.cal, date: dateStr() });
    if (st.cal === "lunar") q.set("leap", st.leap ? "1" : "0");
    if (st.cmp.length) q.set("cmp", st.cmp.join(","));
    q.set("period", st.period);
    if (st.to !== THIS_YEAR - 1 || !view) q.set("to", String(st.to));
    if (st.period === "custom") q.set("from", String(st.from));
    if (view) { if (st.hm !== "ta") q.set("hm", st.hm); if (st.ym !== "max") q.set("ym", st.ym); if (st.hk !== "ta") q.set("hk", st.hk); }
    if (alias && st.alias) q.set("alias", st.alias);
    return q;
  }
  const hashOf = (o) => `#/stories/day?${query(o)}`;
  const go = () => { const h = hashOf(); if (location.hash !== h) location.hash = h; else load(); };
  const replaceView = () => { const h = hashOf(); if (location.hash !== h) history.replaceState(history.state, "", h); };
  const apiQuery = (part) => {
    const q = new URLSearchParams({ station: st.station, cal: st.cal, m: String(st.m), d: String(st.d), leap: st.leap ? "1" : "0", period: st.period, to: String(st.to), part, years: [st.y, ...st.cmp].join(",") });
    if (st.period === "custom") q.set("from", String(st.from));
    return q;
  };

  // ---------------------------------------------------------------- 뼈대
  const ART = `<svg class="ds-art" viewBox="0 0 120 64" aria-hidden="true"><rect x="6" y="10" width="40" height="44" rx="6" fill="#fff" stroke="#9cc4ff" stroke-width="2"/><rect x="6" y="10" width="40" height="12" rx="6" fill="#026ef8"/><rect x="6" y="16" width="40" height="6" fill="#026ef8"/><circle cx="16" cy="9" r="2.5" fill="#0050e0"/><circle cx="36" cy="9" r="2.5" fill="#0050e0"/><text x="26" y="46" text-anchor="middle" font-size="18" font-weight="800" fill="#0d1b3d" id="dsArtDay"></text><rect x="58" y="12" width="7" height="30" rx="3.5" fill="#fff" stroke="#e8590c" stroke-width="2"/><circle cx="61.5" cy="46" r="6" fill="#e8590c"/><rect x="60" y="24" width="3" height="20" fill="#e8590c"/><path d="M84 14c0 0-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13z" fill="#2f6fd6"/><path d="M78 44h26M82 50h30M76 56h20" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  function shell() {
    const p = $("sday");
    if (p.dataset.ready === "2") return;
    p.dataset.ready = "2";
    p.innerHTML = `
      <div class="card ds-head"><div class="ds-head-t">${ART}<div><h2 class="sx-q">날짜로 보는 날씨<small>날짜 하나를 넣으면 해마다 그날 날씨가 어땠는지 실제 관측으로 보여 줍니다. 예보·확률이 아닙니다.</small></h2></div></div>
        <div class="sx-ctl ds-ctl" id="dsCtl"></div>
        <p class="ds-banner" id="dsBanner" role="status"></p><div class="fav-row" id="dsFav"></div><p class="ds-toast" id="dsToast" role="status" hidden></p></div>
      <div class="card" id="dsCard"></div>
      <div class="card" id="dsYears" data-sec="yearly"></div>
      <div class="card" id="dsAround" data-sec="around"></div>
      <div class="card" id="dsHour" data-sec="hourly"></div>
      <div class="card" id="dsHeat" data-sec="heatmap"></div>
      <div class="card" id="dsSel" data-sec="selected"></div>
      <div class="card" id="dsStory"></div>`;
    p.addEventListener("change", onChange);
    p.addEventListener("click", onClick);
    p.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "dsDate") { e.preventDefault(); applyDate(); } });
    p.addEventListener("input", (e) => { if (e.target.id === "dsAlias") { st.alias = e.target.value.slice(0, 30); renderCard(); } });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (document.body.dataset.page === "sday") { if (D) renderYearChart(); if (H) renderHour(); } }, 200); });
  }
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const seg = (name, list, cur) => `<div class="seg ds-seg" role="group">${list.map(([v, l]) => `<button type="button" data-${name}="${v}" class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${E(l)}</button>`).join("")}</div>`;
  function renderCtl() {
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})${s.region ? ` · ${s.region}` : ""}`]);
    const toYears = []; for (let y = THIS_YEAR; y >= 1971; y--) toYears.push([y, `${y}년`]);
    const pickVal = st.cal === "solar" && !(st.m === 2 && st.d === 29 && !isLeapY(st.y)) ? dateStr() : "";
    $("dsCtl").innerHTML = `
      <div><label for="dsSt">관측지점</label><select id="dsSt">${opt(stations, st.station)}</select></div>
      <div><label>날짜 기준</label>${seg("cal", [["solar", "양력"], ["lunar", "음력"]], st.cal)}</div>
      <div class="ds-datef"><label for="dsDate">${st.cal === "lunar" ? "음력 날짜" : "날짜"}</label><span class="sx-inline ds-dateline"><input id="dsDate" class="ds-date" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="YYYY-MM-DD" value="${dateStr()}" aria-describedby="dsDateHelp">${st.cal === "solar" ? `<span class="ds-pick" title="달력에서 고르기"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><input type="date" id="dsPick" aria-label="달력에서 날짜 고르기" min="1900-01-01" max="2050-12-31" value="${pickVal}"></span>` : `<label class="sx-check ds-leapchk"><input type="checkbox" id="dsLeap"${st.leap ? " checked" : ""}> 윤달</label>`}</span><small class="ds-help" id="dsDateHelp">${st.cal === "lunar" ? "음력 연-월-일 · 그해 음력 날짜를 양력으로 바꿔 찾습니다" : "연-월-일 · 연도 = 자세히 볼 해, 월·일 = 해마다 비교할 날"}</small></div>
      <div class="ds-wide"><label>통계 기간 <small class="muted">· 몇 해를 볼지(해마다 이날·앞뒤 15일 공통)</small></label>${seg("period", PERIODS, st.period)}</div>
      ${st.period === "custom" ? `<div><label for="dsFrom">시작 연도</label><input id="dsFrom" type="number" class="sx-num" min="1900" max="${st.to}" value="${st.from}"></div>` : ""}
      <details class="ds-more ds-wide"${st.to !== THIS_YEAR - 1 || st.alias ? " open" : ""}><summary>자세히</summary><div class="sx-ctl"><div><label for="dsTo">끝 연도</label><select id="dsTo">${opt(toYears, st.to)}</select></div><div><label for="dsAlias">별칭(선택)</label><input id="dsAlias" maxlength="30" placeholder="예: 우리 집 기념일" value="${E(st.alias)}"></div></div></details>
      <div class="ds-acts"><button type="button" id="dsGo">날씨 보기</button><button type="button" class="sec" id="dsBattle">이 날짜로 배틀</button><button type="button" class="sec" id="dsCardImg">카드 이미지</button></div>`;
    $("dsBanner").innerHTML = `<b>해마다 ${E(specLabel())}</b> · ${E(periodText())} · 자세히 볼 해 ${st.y}년${st.cmp.length ? ` · 시간 겹쳐 보기 ${st.cmp.join("·")}년` : ""} <span class="muted">· 일자료 1970~ / 시간자료 1990~</span>`;
    const art = document.getElementById("dsArtDay");
    if (art) art.textContent = String(st.d);
    renderFav();
  }
  // ---- 자주 보는 날짜(이 브라우저에만) — v2: 연-월-일 그대로 저장(예전 저장은 월·일만 → 올해로 열림)
  const favKey = () => `${st.station}|${st.cal}|${dateStr()}|${st.leap ? 1 : 0}`;
  const stName = (id) => (meta?.stations || []).find((s) => String(s.station_id) === String(id))?.station_name || id;
  function favLabel(x) { const sl = x.y ? `${x.cal === "lunar" ? "음력 " : ""}${x.y}.${x.m}.${x.d}${x.leap ? "(윤)" : ""}` : x.cal === "lunar" ? `음력 ${x.m}/${x.d}${x.leap ? "(윤)" : ""}` : `${x.m}월 ${x.d}일`; return `${x.alias ? `${x.alias} · ` : ""}${sl} · ${stName(x.station)}`; }
  function favHref(x) { const q = new URLSearchParams({ station: x.station, cal: x.cal }); if (x.y) q.set("date", `${x.y}-${p2(x.m)}-${p2(x.d)}`); else { q.set("m", String(x.m)); q.set("d", String(x.d)); } if (x.cal === "lunar") q.set("leap", x.leap ? "1" : "0"); q.set("period", st.period); if (st.period === "custom") { q.set("from", String(st.from)); q.set("to", String(st.to)); } if (x.alias) q.set("alias", x.alias); return `#/stories/day?${q}`; }
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
      const q = new URLSearchParams({ cal: st.cal, m: String(st.m), d: String(st.d), leap: st.leap ? "1" : "0", period: "recent5", to: String(Math.min(st.to, THIS_YEAR)), year: String(st.y), switchTo: to });
      const r = await getJson(`/api/stats/calendar-map?${q}`);
      if (!r.switch || !r.switch.ok) { toast(r.switch?.message || "기준을 바꿀 수 없습니다. 실제로 있는 날짜를 고르세요"); return; }
      Object.assign(st, { cal: r.switch.spec.calendar, m: r.switch.spec.month, d: r.switch.spec.day, leap: r.switch.spec.leapMonth, y: r.switch.selectedYear });
      st.cmp = st.cmp.filter((y) => y !== st.y);
      toast(`같은 날 ${dot(r.switch.solarDate)}을 ${to === "lunar" ? "음력" : "양력"}으로 바꿨습니다. 이제 해마다 ${specLabel()}을 봅니다.`);
      go();
    } catch (e) { toast(`조회 실패 · ${e.message}`); }
  }
  function applyDate() {
    const el = $("dsDate");
    const r = parseDate(el.value, st.cal);
    if (!r.ok) { el.setAttribute("aria-invalid", "true"); toast(r.message); el.focus(); return false; }
    el.removeAttribute("aria-invalid");
    Object.assign(st, { y: r.y, m: r.m, d: r.d });
    st.cmp = st.cmp.filter((y) => y !== st.y);
    go();
    return true;
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "dsSt") { st.station = t.value; if (window.NWStation) NWStation.manual(t.value); }
    else if (t.id === "dsDate") { applyDate(); return; }
    else if (t.id === "dsPick") { if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return; $("dsDate").value = t.value; applyDate(); return; }
    else if (t.id === "dsLeap") st.leap = t.checked;
    else if (t.id === "dsTo") { st.to = +t.value; if (st.from > st.to) st.from = st.to; }
    else if (t.id === "dsFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > st.to) return; st.from = v; }
    else if (t.id === "dsAliasSave") { try { if (t.checked && st.alias) localStorage.setItem(aliasKey(), st.alias); else localStorage.removeItem(aliasKey()); } catch {} return; }
    else if (t.id === "dsCmpAdd") { const y = +t.value; if (y && !st.cmp.includes(y) && y !== st.y && st.cmp.length < 2) st.cmp.push(y); }
    else return;
    go();
  }
  function onClick(e) {
    if (e.target.id === "dsPick" || e.target.closest(".ds-pick")) { const pk = $("dsPick"); try { pk.showPicker(); } catch { /* 투명 입력 위를 직접 누르면 열림 */ } return; }
    const b = e.target.closest("button,a[data-ev]");
    if (!b) return;
    const ds = b.dataset;
    if (ds.cal) return switchCal(ds.cal);
    if (ds.period) { st.period = ds.period; return go(); }
    if (ds.hm) { st.hm = ds.hm; replaceView(); return renderHour(); }
    if (ds.ym) { st.ym = ds.ym; replaceView(); return renderYearChart(); }
    if (ds.hk) { st.hk = ds.hk; replaceView(); return renderHeat(); }
    if (ds.cmpdel) { st.cmp = st.cmp.filter((y) => y !== +ds.cmpdel); return go(); }
    if (ds.pick) { pickYear(+ds.pick); return; }
    if (ds.ov) { const y = +ds.ov; if (st.cmp.includes(y)) st.cmp = st.cmp.filter((x) => x !== y); else if (st.cmp.length < 2) st.cmp.push(y); else { toast("시간 그래프에는 자세히 볼 해 + 2개 해까지 겹칩니다. 하나를 빼고 고르세요"); return; } return go(); }
    if (b.id === "dsAll") { st.all = !st.all; return renderYears(); }
    if (b.id === "dsGo") { applyDate(); return; }
    if (b.id === "dsBattle" || b.id === "dsSelBattle") { location.hash = battleHref(); return; }
    if (b.id === "dsCopy") return copyLink();
    if (b.id === "dsCardImg" || b.id === "dsCardImg2") return openCard();
    if (b.id === "dsFavBtn") { const on = StoryFavs.toggle("day", { key: favKey(), station: st.station, cal: st.cal, y: st.y, m: st.m, d: st.d, leap: st.leap, alias: st.alias }); toast(on ? "이 날짜를 이 브라우저에 저장했습니다(위 목록에서 바로 열기)" : "저장을 지웠습니다"); return renderFav(); }
    if (ds.favdel) { StoryFavs.remove("day", ds.favdel); return renderFav(); }
    if (ds.ev !== undefined) { e.preventDefault(); return showEvidence(+ds.ev); }
    if (b.id === "dsRetry") { cache.clear(); return load(); }
  }
  // 목록·그래프에서 해를 누르면: 자세히 볼 해(=날짜의 연도)를 바꾸고 주소의 date 도 바꾼다
  function pickYear(y) { if (y === st.y) return; st.y = y; st.cmp = st.cmp.filter((x) => x !== y); go(); }
  function battleHref() {
    const a = `A.${st.station}.${st.cal === "lunar" ? "L" : "S"}.${st.m}.${st.d}.${st.leap ? 1 : 0}`;
    const q = new URLSearchParams({ cases: a, period: st.period, to: String(st.to) });
    if (st.period === "custom") q.set("from", String(st.from));
    if (st.alias) q.set("labels", encodeURIComponent(st.alias));
    return `#/stories/battle?${q}`;
  }
  const shareUrl = (withAlias) => `${location.origin}/s/day?${query({ view: false, alias: !!withAlias })}`;
  function openCard() {
    if (!D || !window.StoryShare) { toast("자료를 다 불러온 뒤 카드를 만들 수 있습니다"); return; }
    StoryShare.module().then((m) => {
      StoryShare.open({ spec: m.daySpec(D, { alias: st.alias }), filename: `inal-${st.station}-${st.cal === "lunar" ? "L" : "S"}${st.y}${p2(st.m)}${p2(st.d)}-${D.window.fromYear}-${D.window.toYear}`, shareUrl: shareUrl(!!st.alias && $("dsShareAlias")?.checked), title: "이날의 날씨 카드" });
    });
  }
  async function copyLink() {
    const withAlias = $("dsShareAlias")?.checked;
    const url = shareUrl(withAlias);
    try { await navigator.clipboard.writeText(url); toast("링크를 복사했습니다" + (withAlias ? " (별칭 포함)" : "")); } catch { prompt("이 주소를 복사하세요", url); }
  }

  // ---------------------------------------------------------------- 불러오기(일자료 먼저, 시간자료 따로)
  const DAILY_SECS = ["dsCard", "dsYears", "dsAround", "dsSel", "dsStory"];
  async function load() {
    const my = ++seq;
    D = null; H = null;
    renderCtl();
    for (const id of DAILY_SECS) $(id).innerHTML = `<div class="sx-state">불러오는 중…</div>`;
    for (const id of ["dsHour", "dsHeat"]) $(id).innerHTML = `<div class="sx-state">시간자료 불러오는 중…</div>`;
    const dUrl = `/api/stats/date-weather?${apiQuery("daily")}`;
    const hUrl = `/api/stats/date-weather?${apiQuery("hourly")}`;
    const hp = getJson(hUrl);
    hp.catch(() => {});
    try {
      const d = await getJson(dUrl);
      if (my !== seq) return;
      D = d;
      renderCard(); renderYears(); renderAround(); renderSel(); renderStories();
    } catch (e) {
      if (my !== seq) return;
      for (const id of DAILY_SECS) $(id).innerHTML = `<div class="sx-state err">조회 실패 · ${E(e.message)} <button type="button" id="dsRetry" class="sec">다시 시도</button></div>`;
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
  const STATUS = (s) => (D || H)?.statusText?.[s] || { partial: "자료 부족" }[s] || s;
  const yword = (y) => `${y}년${st.cal === "lunar" ? "(음력)" : ""}`;
  function selWhen(s) {
    if (!s) return "";
    if (s.dateStatus === "nodate") return `${st.y}년에는 없는 날짜${st.cal === "solar" ? " (2월 29일은 윤년에만 있습니다)" : st.leap ? " (그해에는 이 달의 윤달이 없습니다)" : " (그해 이 달은 29일까지)"}`;
    if (s.dateStatus === "range") return STATUS("range");
    return `${dot(s.solarDate)}(${dow(s.solarDate)})${s.lunarText && st.cal === "lunar" ? ` · ${s.lunarText}` : ""}`;
  }

  function renderCard() {
    if (!D) return;
    const s = D.selected[0];
    const cal = D.selectedCalendars?.[0];
    const stn = D.station;
    const head = st.cal === "lunar" ? `음력 ${st.y}년 ${st.leap ? "윤" : ""}${st.m}월 ${st.d}일` : `${st.y}년 ${st.m}월 ${st.d}일`;
    const title = st.alias ? `${E(st.alias)} <small>${E(head)}</small>` : E(head);
    let when = `<b>${E(selWhen(s))}</b>`;
    if (s.dateStatus === "ok" && st.cal === "solar" && cal?.lunar) when += ` · ${E(cal.lunar.text)}`;
    const warn = s.dateStatus === "future" ? `<p class="sx-warn">${E(STATUS("future"))} — 그해 칸만 비워 두고, 지난 해들은 그대로 보여 줍니다.</p>` : s.dateStatus === "ongoing" ? `<p class="sx-warn">${E(STATUS("ongoing"))} — 오늘 하루 자료는 내일 공식 일자료가 들어오면 채워집니다.</p>` : s.dateStatus === "pending" ? `<p class="sx-warn">${E(STATUS("pending"))} — 지난 날이지만 아직 공식 일자료가 들어오지 않았습니다(최신 ${dot(stn.dailyLast)}).</p>` : "";
    $("dsCard").innerHTML = `<div class="ds-card"><div><p class="ds-k">고른 날짜</p><h3 class="ds-title">${title}</h3><p>${when}</p>${warn}</div>
      <dl class="ds-dl"><div><dt>관측지점</dt><dd>${E(stn.station_name)} (${E(stn.station_id)})${stn.region ? ` · ${E(stn.region)}` : ""} <small>지점 한 곳의 관측</small></dd></div><div><dt>해마다 볼 날</dt><dd>${E(specLabel())} <small>· ${E(D.window.label)} ${D.dateCounts.requested}개 해${D.dateCounts.nodate ? ` (그 날짜가 있는 해 ${D.dateCounts.exists}개)` : ""}</small></dd></div><div><dt>자료 범위</dt><dd>일자료 ${D.dailyFrom.slice(0, 4)}~${dot(stn.dailyLast)} / 시간자료 ${D.hourlyFrom.slice(0, 4)}~ <small>'전체'는 이 서비스가 가진 범위이며 기상청 전체 역사가 아닙니다</small></dd></div></dl></div>`;
  }

  // ---- 관측값만으로 고른 작은 그림(하늘 상태는 추정하지 않음): 신적설 > 0 → 눈 결정, 강수 0.1mm 이상 → 물방울, 그 밖 → 온도계(30℃↑ 빨강·영하 파랑)
  function obsIcon(r) {
    const v = r?.values || {};
    const svg = (body, label) => `<svg viewBox="0 0 24 24" width="26" height="26" role="img" aria-label="${E(label)}">${body}</svg>`;
    if (!r || r.dateStatus !== "ok" || !r.rowPresent) return svg(`<circle cx="12" cy="12" r="8" fill="#f1f4f9" stroke="#a7b3c6" stroke-dasharray="2 2"/>`, "자료 없음");
    if (fin(v.nsnow) && v.nsnow > 0) return svg(`<g stroke="#4c8df6" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></g>`, "눈이 새로 쌓임");
    if (fin(v.rain) && v.rain >= 0.1) return svg(`<path d="M12 3c0 0-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-6-11-6-11z" fill="${v.rain >= 30 ? "#1d4ed8" : v.rain >= 5 ? "#2f6fd6" : "#7fb0f5"}"/>`, `강수 ${fmt(v.rain)}mm`);
    const c = fin(v.max) && v.max >= 30 ? "#dc2626" : fin(v.min) && v.min < 0 ? "#2563eb" : "#e8590c";
    return svg(`<rect x="9.5" y="3" width="5" height="13" rx="2.5" fill="#fff" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="18" r="3.6" fill="${c}"/><rect x="11.2" y="8" width="1.6" height="9" fill="${c}"/>`, "강수 없음");
  }
  const tv = (v, d = 1) => (fin(v) ? fmt(v, d) : "–");
  function rainText(r) {
    const v = r.values;
    if (r.dateStatus !== "ok") return "";
    if (!fin(v.rain)) return `<span class="muted">강수 자료 없음</span>`;
    let t = v.rain >= 0.1 ? `<b class="dy-wet">강수 ${fmt(v.rain)}mm</b>` : `<span class="muted" title="${r.rainNorm === "blank0" ? "일강수량 공란 = 기상청 관례상 무강수" : "0mm"}">강수 없음</span>`;
    if (fin(v.nsnow) && v.nsnow > 0) t += ` <b class="dy-snow">신적설 ${fmt(v.nsnow)}cm</b>`;
    return t;
  }
  function yearRow(r, { chosen = false, outside = false } = {}) {
    const y = r.referenceYear;
    const v = r.values || {};
    const ok = r.dateStatus === "ok" && r.rowPresent;
    const date = r.solarDate ? `${md(r.solarDate)}(${dow(r.solarDate)})${st.cal === "lunar" && r.lunarText ? ` <span class="muted">${E(r.lunarText.replace(/^음력 \d+년 /, "음 "))}</span>` : ""}` : "";
    let body;
    if (r.dateStatus !== "ok") body = `<span class="dy-st">${E(STATUS(r.dateStatus))}</span>`;
    else if (!r.rowPresent) body = `<span class="dy-st">자료 없음</span>`;
    else body = `<span class="dy-t"><b class="dy-hi" title="최고기온">${tv(v.max)}°</b><span class="dy-sl">/</span><b class="dy-lo" title="최저기온">${tv(v.min)}°</b><small>평균 ${tv(v.avg)}℃</small></span><span class="dy-r">${rainText(r)}</span><span class="dy-w"><small>바람 ${tv(v.wind)}m/s${fin(v.gust) ? ` · 순간 ${tv(v.gust)}` : ""}${fin(v.sun) ? ` · 일조 ${tv(v.sun)}시간` : ""}</small></span>`;
    const canOv = ok && y >= 1990 && y !== st.y && !outside;
    const ov = st.cmp.includes(y);
    return `<li class="dy-row${chosen ? " sel" : ""}${ok ? "" : " na"}"><button type="button" class="dy-pick" data-pick="${y}" aria-pressed="${chosen}" aria-label="${y}년 이날 자세히 보기"><span class="dy-ic">${obsIcon(r)}</span><span class="dy-yr"><b>${y}</b><small>${date}${chosen ? ` <em class="dy-tag">${outside ? "고른 해 · 기간 밖" : "고른 해"}</em>` : ""}</small></span>${body}</button>${canOv ? `<button type="button" class="dy-ov${ov ? " on" : ""}" data-ov="${y}" aria-pressed="${ov}" title="시간 그래프에 겹쳐 보기">${ov ? "✓ 겹침" : "+ 시간"}</button>` : `<span class="dy-ov-sp"></span>`}</li>`;
  }
  // ---- ① 해마다 이날
  function renderYears() {
    if (!D) return;
    const C = D.counts;
    const s = D.selected[0];
    const rows = D.daily.rows.slice().reverse();
    const inPer = rows.some((r) => r.referenceYear === s.referenceYear);
    const per = `${D.window.fromYear}~${D.window.toYear}년`;
    const shown = C.rules.filter((c) => c.show);
    const cnt = shown.map((c) => `<div class="dy-cnt${c.k ? " hit" : ""}"><span>${E(c.label)}</span><b>${c.n ? `${c.k}<small>번</small>` : "–"}</b><small>${c.n ? `자료가 있는 ${c.n}개 해 중${c.tier === "reference" ? " · 참고" : c.limited ? " · 자료 제한" : ""}` : "자료가 있는 해 없음"}</small><small class="dy-cond">${E(c.cond)}</small></div>`).join("");
    const X = C.extremes;
    const ex = [X.hottest.value != null ? `가장 더웠던 해 <b>${X.hottest.years.map(yword).join("·")}</b>(최고 ${fmt(X.hottest.value)}℃)` : "", X.coldest.value != null ? `가장 추웠던 해 <b>${X.coldest.years.map(yword).join("·")}</b>(최저 ${fmt(X.coldest.value)}℃)` : "", X.wettest.value != null ? `강수가 가장 많았던 해 <b>${X.wettest.years.map(yword).join("·")}</b>(${fmt(X.wettest.value)}mm)` : ""].filter(Boolean);
    const LIM = 10;
    const list = [...(inPer ? [] : [yearRow(s, { chosen: true, outside: true })]), ...rows.slice(0, st.all ? rows.length : LIM).map((r) => yearRow(r, { chosen: r.referenceYear === st.y }))];
    $("dsYears").innerHTML = `<h3 class="ds-h">해마다 이날 <small>${E(per)} 해마다 ${E(specLabel())} 하루의 실제 관측 · 같은 날 평균을 내지 않습니다</small></h3>
      <div class="dy-cnts">${cnt}</div>
      ${ex.length ? `<p class="dy-ext">${ex.join(" · ")}${[X.hottest, X.coldest, X.wettest].some((x) => x.years.length > 1) ? ` <span class="muted">(같은 값은 공동)</span>` : ""}</p>` : ""}
      <ol class="dy-list" aria-label="해마다 이날 관측(최근 해부터)">${list.join("")}</ol>
      ${rows.length > LIM ? `<button type="button" class="sec dy-all" id="dsAll">${st.all ? "접기" : `${rows.length}개 해 모두 보기`}</button>` : ""}
      <p class="ds-note">줄을 누르면 그해를 자세히 봅니다 · <b>+ 시간</b> = 그해 시간별 관측을 아래 그래프에 겹치기(최대 2개) · 그림은 관측값으로만: 물방울 = 강수 0.1mm 이상, 눈 결정 = 눈이 새로 쌓임, 온도계 = 강수 없음(빨강 최고 30℃ 이상 · 파랑 최저 영하) · 횟수는 자료가 있는 해만 셉니다(자료 없음·그해에는 없는 날짜는 빼고 셈).</p>
      <details class="ds-ychart"${matchMedia("(min-width:801px)").matches ? " open" : ""}><summary>그래프로 보기</summary><div class="ds-tools">${seg("ym", Object.entries(YM).map(([v, x]) => [v, x[0]]), st.ym)}</div><div class="sx-chart" id="dsYearChart"></div><p class="ds-note" id="dsYearNote"></p></details>
      <div class="sx-tools"><span class="muted">목록·횟수·그래프·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("daily")}&format=csv" download>해마다 이날 CSV</a></div>`;
    const det = $("dsYears").querySelector(".ds-ychart");
    det.addEventListener("toggle", () => { if (det.open) renderYearChart(); });
    if (det.open) renderYearChart();
  }
  function renderYearChart() {
    const el = $("dsYearChart");
    if (!D || !el || !el.closest("details").open) return;
    const k = st.ym;
    const [label, unit, dg, kind] = YM[k];
    const rows = D.daily.rows.map((r) => ({ year: r.referenceYear, value: r.dateStatus === "ok" ? r.values[k] : null, status: r.dateStatus === "ok" ? r.fieldStatus[k] : r.dateStatus, statusText: STATUS(r.dateStatus === "ok" ? (r.rowPresent ? r.fieldStatus[k] : "missing") : r.dateStatus), r }));
    V.yearChart(el, {
      rows, bar: kind === "bar", unit, digits: dg, selected: [st.y, ...st.cmp], meanLine: null, aria: `해마다 이날 ${label}`, onPick: pickYear,
      tip: (i) => { const x = rows[i]; return `<b>${x.year}년</b>${st.cal === "lunar" ? "(음력)" : ""} · ${x.r.solarDate ? `${dot(x.r.solarDate)}(${dow(x.r.solarDate)})` : ""}<br>${fin(x.value) ? `${label} <b>${fmt(x.value, dg)}${unit}</b>` : E(x.statusText)} <span class="muted">— 누르면 그해 자세히</span>`; },
    });
    $("dsYearNote").textContent = `점·막대 하나 = 그해 이날 하루 · 평균선 없음 · 빗금 = 자료 없음·그해에는 없는 날짜 · 하루씩 뽑은 값이라 계절의 추세를 단정하지 않습니다.`;
  }

  // ---- ② 앞뒤 15일 날씨 통계
  const AROWS = [
    ["avg", "평균기온", "mean"], ["max", "평균 최고기온", "mean"], ["min", "평균 최저기온", "mean"],
    ["rainDays", "강수일 비율", "ratio"], ["rainDaysN", "강수일 수", "count"], ["rainSum", "하루 평균 강수량", "perDay"],
    ["hot30", "최고 30℃ 이상인 날", "count", "hot30"], ["heat33", "최고 33℃ 이상인 날", "count", "heat33"], ["frost", "최저 영하인 날", "count", "frost"], ["ice", "하루 종일 영하인 날", "count", "ice"], ["snow", "눈이 새로 쌓인 날", "count", "snow"],
  ];
  function renderAround() {
    if (!D || !D.around) return;
    const A = D.around;
    const M = A.metrics;
    const S = D.aroundSelected;
    const s0 = D.selected[0];
    const showRule = Object.fromEntries(D.counts.rules.map((c) => [c.id, c.show]));
    const per = `${D.window.fromYear}~${D.window.toYear}년`;
    const selOk = S && (S.status === "ok" || S.sofarEnd);
    const sofar = S && S.sofarEnd;
    const met = (k) => (k === "rainDaysN" ? "rainDays" : k);
    const perCell = (k, kind) => {
      const m = M[met(k)];
      if (!m.n) return `<td class="num muted">자료 부족</td>`;
      const tag = m.tier === "reference" ? ` <span class="sx-badge est">참고</span>` : m.limited ? ` <span class="sx-badge est">자료 제한</span>` : "";
      if (kind === "mean") return `<td class="num"><b>${fmt(m.mean)}℃</b>${tag}<small>${m.n}개 해</small></td>`;
      if (kind === "ratio") return `<td class="num"><b>${fmt(m.share, 0)}%</b>${tag}<small>${m.total}/${m.validDays}일</small></td>`;
      if (kind === "perDay") return `<td class="num"><b>${fmt(m.perDay)}mm</b>${tag}<small>31일 합 해마다 평균 ${fmt(m.mean)}mm</small></td>`;
      return `<td class="num"><b>${fmt(m.mean, 1)}일</b>${tag}<small>해마다 평균 · 모두 ${m.total}일${m.yearsWith ? ` · ${m.yearsWith.length}개 해에 있음` : ""}</small></td>`;
    };
    const selCell = (k, kind) => {
      if (!selOk) return `<td class="num muted">${E(S ? STATUS(S.status) : "–")}</td>`;
      const x = S.metrics[met(k)];
      if (!x || (!sofar && x.status !== "ok") || (sofar && !x.obs)) return `<td class="num muted">${E(STATUS(x ? x.status : "missing"))}</td>`;
      const v = x.raw;
      if (kind === "mean") return `<td class="num"><b>${fmt(v)}℃</b></td>`;
      if (kind === "ratio") return `<td class="num"><b>${fmt((v / x.obs) * 100, 0)}%</b><small>${fmt(v, 0)}/${x.obs}일</small></td>`;
      if (kind === "perDay") return `<td class="num"><b>${fmt(v / x.obs)}mm</b><small>합 ${fmt(v)}mm</small></td>`;
      return `<td class="num"><b>${fmt(v, 0)}일</b>${x.obs < 31 ? `<small>${x.obs}일 중</small>` : ""}</td>`;
    };
    const diffCell = (k, kind) => {
      const m = M[met(k)];
      if (!selOk || sofar || m.n < 3) return `<td class="num muted">–</td>`;
      const x = S.metrics[met(k)];
      if (!x || x.status !== "ok") return `<td class="num muted">–</td>`;
      if (kind === "mean") return `<td class="num">${sgn(x.raw - m.mean)}℃</td>`;
      if (kind === "ratio") return `<td class="num">${sgn((x.raw / x.obs) * 100 - m.share, 0)}%p</td>`;
      if (kind === "perDay") return `<td class="num">${sgn(x.raw / x.obs - m.perDay)}mm</td>`;
      return `<td class="num">${sgn(x.raw - m.mean)}일</td>`;
    };
    const rows = AROWS.filter(([k, , , rule]) => {
      if (!rule) return true;
      const m = M[k];
      const sel = selOk && S.metrics[k]?.raw > 0;
      return showRule[rule] || (m.total || 0) > 0 || sel;
    });
    const selHead = S ? `${S.referenceYear}년${sofar ? ` <small>진행 중 · ${md(S.sofarEnd)}까지</small>` : ""}` : "고른 해";
    const exAll = {};
    for (const k of ["avg", "rainDays"]) for (const [r, ys] of Object.entries(M[k].excludedYearsByReason || {})) for (const y of ys) (exAll[r] ||= new Set()).add(y);
    const exText = Object.entries(exAll).map(([r, ys]) => `${STATUS(r)} ${[...ys].sort().join("·")}`).join(" / ");
    const win = S && S.start ? `${S.referenceYear}년 기준 ${dot(S.start)} ~ ${dot(S.end)}` : (A.years.find((y) => y.start) ? `예: ${dot(A.years.find((y) => y.start).start)} ~ ${dot(A.years.find((y) => y.start).end)}` : "");
    $("dsAround").innerHTML = `<h3 class="ds-h">앞뒤 15일 날씨 통계 <small>해마다 그 날짜 앞뒤 15일(31일) · ${E(per)} · 하루가 아니라 '이 무렵'의 날씨</small></h3>
      <p class="ds-note ds-note-top">${E(win)}${st.cal === "lunar" ? " · 음력은 해마다 그해 음력 날짜의 양력 날짜를 가운데로" : ""} · 연말·연초는 해를 넘겨 이어 셉니다.</p>
      <div class="sx-table-wrap"><table class="da-tbl"><thead><tr><th>지표</th><th>${E(per)}<small>${M.avg.n}개 해 · 유효 ${M.avg.validDays}일</small></th><th>${selHead}</th><th>차이</th></tr></thead><tbody>
      ${rows.map(([k, label, kind]) => `<tr><th scope="row">${E(label)}</th>${perCell(k, kind)}${selCell(k, kind)}${diffCell(k, kind)}</tr>`).join("")}</tbody></table></div>
      <p class="ds-note">해 수: 요청 ${M.avg.requested}개 · 날짜가 있고 끝난 해 ${M.avg.eligible}개 · 쓴 해 ${M.avg.n}개(기온) / ${M.rainDays.n}개(강수)${exText ? ` · 뺀 해: ${E(exText)}` : ""}. 31일 중 자료 없는 날이 1일 이하인 해만 넣고(남은 날로만 집계, 채우지 않음), 2일 이상 빠지면 '자료 부족'으로 뺍니다. 강수일 비율 = 강수일(0.1mm 이상) ÷ 유효한 날, 하루 평균 강수량 = 강수량 합 ÷ 유효한 날(무강수 0 포함). 기온 평균은 해마다 31일 평균을 먼저 낸 뒤 해들끼리 평균합니다.</p>
      <details class="sx-table"><summary>해마다 31일 창 보기</summary><div class="sx-table-wrap"><table><thead><tr><th>연도</th><th>기간</th><th>평균(℃)</th><th>최고</th><th>최저</th><th>강수일</th><th>강수량(mm)</th><th>30℃↑</th><th>영하</th><th>상태</th></tr></thead><tbody>${[...(S && !A.years.some((y) => y.referenceYear === S.referenceYear) ? [S] : []), ...A.years.slice().reverse()].map((y) => { const g = (k, d = 1) => { const x = y.metrics[k]; return x && (x.status === "ok" || (y.sofarEnd && x.obs)) ? fmt(x.raw, d) : `<span class="muted">${x ? E(STATUS(x.status)) : "–"}</span>`; }; return `<tr class="${y.referenceYear === st.y ? "ds-tr-sel" : ""}"><td>${y.referenceYear}</td><td>${y.start ? `${md(y.start)}~${md(y.end)}${y.start.slice(0, 4) !== y.end.slice(0, 4) ? " <small>(해 넘김)</small>" : ""}` : "–"}</td><td class="num">${g("avg")}</td><td class="num">${g("max")}</td><td class="num">${g("min")}</td><td class="num">${g("rainDays", 0)}</td><td class="num">${g("rainSum")}</td><td class="num">${g("hot30", 0)}</td><td class="num">${g("frost", 0)}</td><td>${E(y.sofarEnd ? `진행 중(${md(y.sofarEnd)}까지)` : STATUS(y.status))}</td></tr>`; }).join("")}</tbody></table></div><div class="sx-tools"><span class="muted">표·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("around")}&format=csv" download>앞뒤 15일 CSV</a></div></details>`;
    void s0;
  }

  // ---- ③ 시간별(고른 해 + 겹쳐 볼 해, 평균 없음)
  function renderHour() {
    const el = $("dsHour");
    if (!H) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const sel = H.hourly.selected;
    const series = sel.map((s, i) => ({ label: `${s.referenceYear}년`, color: V.SEL[i].color, dash: V.SEL[i].dash, mark: V.SEL[i].mark, values: s.series[k], status: s.cellStatus[k] }));
    const bar = k === "rn";
    const hl = (h) => (bar ? `${h}~${h + 1}시` : `${h}시`);
    const listYears = (D ? D.daily.rows.map((r) => r.referenceYear) : []).filter((y) => y >= 1990 && y !== st.y && !st.cmp.includes(y)).reverse();
    const anyOk = sel.some((s) => s.dateStatus === "ok");
    el.innerHTML = `<h3 class="ds-h">시간별 날씨 <small>고른 해 그날의 실제 정시 관측 · 다른 해를 2개까지 겹쳐 볼 수 있습니다(평균 없음)</small></h3>
      <div class="ds-tools">${seg("hm", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}<span class="ds-yrs">${sel.map((s, i) => `<span class="sx-yr" style="background:${V.SEL[i].color}">${V.SEL[i].mark} ${s.referenceYear}년${i ? `<button type="button" data-cmpdel="${s.referenceYear}" aria-label="${s.referenceYear}년 겹치기 빼기">×</button>` : ""}</span>`).join("")}${st.cmp.length < 2 && listYears.length ? `<select id="dsCmpAdd" aria-label="겹쳐 볼 해 더하기"><option value="">+ 겹쳐 볼 해</option>${opt(listYears.map((y) => [y, `${y}년`]), "")}</select>` : ""}</span></div>
      ${anyOk ? `<div class="sx-chart" id="dsHourChart"></div>` : `<div class="sx-state">${E(sel.map((s) => `${s.referenceYear}년: ${STATUS(s.dateStatus)}`).join(" · "))}${sel[0]?.dateStatus === "unsupported" ? " — 시간자료는 1990년부터 씁니다" : ""}</div>`}
      <div class="sx-legend">${sel.map((s, i) => `<span style="color:${V.SEL[i].color}"><i style="background:${V.SEL[i].color}"></i>${V.SEL[i].mark} ${s.referenceYear}년${s.solarDate ? ` ${md(s.solarDate)}` : ""} 실제 관측${s.dateStatus !== "ok" ? ` — ${E(STATUS(s.dateStatus))}` : ""}</span>`).join("")}<span>선이 끊긴 곳 = 자료 없음(잇지 않음)</span><span>단위 ${unit}</span></div>
      ${bar ? `<p class="ds-note">막대 한 칸 = h~h+1시 1시간 강수량(기상청 정시값은 앞 1시간 누적 — 23~24시는 다음날 00시 값). 시간값을 더해 하루 강수량을 만들지 않습니다.</p>` : ""}
      ${anyOk ? hourTable() : ""}`;
    if (!anyOk) return;
    V.hourChart($("dsHourChart"), {
      unit, digits: dg, bar, band: false, mean: null, series, aria: `${label} 시간별 관측`,
      tip: (h) => `<b>${hl(h)}</b>${sel.map((s, i) => { const v = s.series[k][h]; return `<br><span style="color:${V.SEL[i].color}">${V.SEL[i].mark} ${s.referenceYear}년</span> ${fin(v) ? `<b>${fmt(v, dg)}${unit}</b>` : E(STATUS(s.cellStatus[k][h]))}`; }).join("")}`,
    });
  }
  function hourTable() {
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const sel = H.hourly.selected;
    return `<details class="sx-table"><summary>표로 보기 · ${label}</summary><div class="sx-table-wrap"><table><thead><tr><th>${k === "rn" ? "구간" : "시각"}</th>${sel.map((s) => `<th>${s.referenceYear}년(${unit})</th>`).join("")}</tr></thead><tbody>${Array.from({ length: 24 }, (_, h) => `<tr><td>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</td>${sel.map((s) => `<td class="num">${fin(s.series[k][h]) ? fmt(s.series[k][h], dg) : `<span class="muted">${E(STATUS(s.cellStatus[k][h]))}</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="sx-tools"><span class="muted">그래프·표·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("hourly")}&format=csv" download>시간별 CSV</a></div></details>`;
  }
  // ---- ④ 연도 × 시간 히트맵(관측값만)
  function renderHeat() {
    if (!H) return;
    const k = st.hk;
    const [label, unit, dg] = HM[k];
    const pre = H.hourly.heat.filter((r) => r.dateStatus === "unsupported");
    const rows = H.hourly.heat.filter((r) => r.dateStatus !== "unsupported").map((r) => ({
      year: r.referenceYear, sel: r.referenceYear === st.y, solar: r.solarDate, lunar: r.lunarDate, leap: r.isLeapMonth, status: r.cellStatus[k],
      dim: r.dateStatus !== "ok" ? STATUS(r.dateStatus) : null, values: r.series[k].map((v) => (fin(v) ? v : null)),
    })).reverse();
    $("dsHeat").innerHTML = `<h3 class="ds-h">연도 × 시간 히트맵 <small>행 = 해, 열 = 시각 · 관측값 그대로 · 같은 지표는 한 색 범위</small></h3>
      <div class="ds-tools">${seg("hk", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}</div>
      ${pre.length ? `<p class="ds-note">${pre[0].referenceYear}~${pre[pre.length - 1].referenceYear}년은 시간자료를 쓰지 않습니다(1990년부터) — 행을 그리지 않았습니다.</p>` : ""}
      <div id="dsHeatChart"></div>${k === "rn" ? `<p class="ds-note">강수 칸 = h~h+1시 1시간 강수량.</p>` : ""}`;
    if (!rows.length) { $("dsHeatChart").innerHTML = `<div class="sx-state">이 기간에는 시간자료가 있는 해가 없습니다.</div>`; return; }
    V.heatmap($("dsHeatChart"), {
      rows, kind: k, diff: false, unit, digits: dg, aria: `${label} 연도 × 시간`, onPick: (y) => { if (y !== st.y) pickYear(y); },
      tip: (r, h) => { const raw = H.hourly.heat.find((x) => x.referenceYear === r.year); const v = raw.series[k][h]; return `<b>${r.year}년 ${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</b> · ${r.solar ? `${dot(r.solar)}(${dow(r.solar)})` : ""}<br>${fin(v) ? `${label} <b>${fmt(v, dg)}${unit}</b>` : E(STATUS(raw.dateStatus === "ok" ? raw.cellStatus[k][h] : raw.dateStatus))} <span class="muted">— 누르면 그해 자세히</span>`; },
    });
  }
  // ---- ⑤ 고른 해의 그날
  function renderSel() {
    if (!D) return;
    const s = D.selected[0];
    const v = s.values;
    const o = D.official;
    const hs = H ? H.hourly.selected[0] : null;
    const row = (k, val, note = "") => `<div><dt>${k}</dt><dd>${val}${note ? ` <small>${note}</small>` : ""}</dd></div>`;
    let body;
    if (s.dateStatus !== "ok") body = `<div class="sx-state">${E(STATUS(s.dateStatus))}${s.dateStatus === "nodate" ? " — 다른 날로 바꾸지 않습니다" : ""}</div>`;
    else {
      const daily = s.rowPresent ? `<dl class="ds-dl ds-dl2">${row("최고기온", v.max != null ? `<b>${fmt(v.max)}℃</b>${o?.maxTime ? ` (${o.maxTime})` : ""}` : "자료 없음")}${row("최저기온", v.min != null ? `<b>${fmt(v.min)}℃</b>${o?.minTime ? ` (${o.minTime})` : ""}` : "자료 없음")}${row("일평균기온", v.avg != null ? `${fmt(v.avg)}℃` : "자료 없음", "공식 일평균")}${row("일강수량", v.rain != null ? `<b>${fmt(v.rain)}mm</b>` : "자료 없음", s.rainNorm === "blank0" ? "공란 = 기상청 관례상 무강수" : "")}${fin(v.nsnow) && v.nsnow > 0 ? row("신적설", `${fmt(v.nsnow)}cm`) : ""}${row("평균 풍속", v.wind != null ? `${fmt(v.wind)}m/s` : "자료 없음", o?.maxInstWindSpeed != null ? `최대 순간 ${fmt(+o.maxInstWindSpeed)}m/s` : "")}${row("평균 습도", v.hum != null ? `${fmt(v.hum, 0)}%` : "자료 없음")}${o?.sunshine != null ? row("일조", `${fmt(+o.sunshine)}시간`) : ""}${o?.phenomena ? row("일기 현상", E(o.phenomena), "기상청 기록 그대로") : ""}</dl>` : `<p class="sx-warn">이날 공식 일자료 행이 없습니다(자료 없음). 시간자료는 아래처럼 있는 만큼만 보여 줍니다.</p>`;
      const hourly = !hs ? `<div class="sx-state">시간자료 불러오는 중…</div>` : hs.dateStatus !== "ok" ? `<p class="ds-note">시간자료: ${E(STATUS(hs.dateStatus))}</p>` : `<details class="sx-table"${matchMedia("(min-width:801px)").matches ? " open" : ""}><summary>그날 시간별 관측표(정시)</summary><div class="sx-table-wrap"><table><thead><tr><th>시각</th><th>기온(℃)</th><th>강수(mm, h~h+1시)</th><th>풍속(m/s)</th><th>습도(%)</th></tr></thead><tbody>${Array.from({ length: 24 }, (_, h) => `<tr><td>${h}시</td>${["ta", "rn", "ws", "hm"].map((k) => `<td class="num">${fin(hs.series[k][h]) ? fmt(hs.series[k][h], k === "hm" ? 0 : 1) : `<span class="muted">${E(STATUS(hs.cellStatus[k][h]))}</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
      body = daily + hourly;
    }
    $("dsSel").innerHTML = `<h3 class="ds-h">${st.y}년 그날 자세히 <small>공식 일자료 + 시간자료(각각 있는 만큼) · 다른 해는 위 목록에서 누르세요</small></h3>
      <p class="ds-selbar"><b>${E(selWhen(s))}</b></p>
      ${body}
      <div class="sx-tools"><span class="ds-acts"><button type="button" class="sec" id="dsSelBattle">배틀에 추가</button><button type="button" class="sec" id="dsCopy">링크 복사</button><button type="button" class="sec" id="dsCardImg2">카드 이미지</button><label class="sx-check"><input type="checkbox" id="dsShareAlias"> 링크에 별칭 넣기</label><label class="sx-check"><input type="checkbox" id="dsAliasSave"${(() => { try { return localStorage.getItem(aliasKey()) ? " checked" : ""; } catch { return ""; } })()}> 별칭을 이 브라우저에 저장</label></span></div>`;
  }
  // ---- ⑥ 이야기 + 근거
  let STORIES = [];
  function renderStories() {
    if (!D) return;
    STORIES = [...(D.stories || []), ...((H && H.hourly.stories) || [])].sort((a, b) => a.priority - b.priority).slice(0, 4);
    const C = D.counts;
    $("dsStory").innerHTML = `<h3 class="ds-h">짧은 이야기와 근거 <small>조건을 만족할 때만, 실제 관측으로(최대 4개)</small></h3>
      ${STORIES.length ? `<ol class="ds-stories">${STORIES.map((s, i) => `<li><p>${E(s.text)}</p><a href="#" data-ev="${i}" class="ds-ev">근거 보기 ›</a><div class="ds-evbox" id="dsEv${i}" hidden></div></li>`).join("")}</ol>` : `<p class="muted">조건을 만족하는 이야기가 없습니다(자료가 적음).</p>`}
      <details class="sx-rules"><summary>센 해 · 뺀 해</summary><ul>${C.rules.map((c) => `<li><b>${E(c.label)}</b>(${E(c.cond)}): ${c.k}번 / 자료가 있는 ${c.n}개 해${c.k ? ` — ${c.hitYears.join("·")}` : ""}${Object.keys(c.excludedYearsByReason).length ? ` · 뺀 해: ${Object.entries(c.excludedYearsByReason).map(([r, ys]) => `${E(STATUS(r))} ${ys.join("·")}`).join(" / ")}` : ""}${c.show ? "" : " <span class=\"muted\">(이 계절이 아니고 0번이라 위에는 숨김)</span>"}</li>`).join("")}</ul></details>
      <details class="sx-rules"><summary>계산 기준</summary><ul>
        <li>해마다 이날 = 해마다 정확히 그 날짜(${E(specLabel())}) 하루의 공식 일자료. 같은 날의 평균은 내지 않고, 조건을 만족한 해를 셉니다. 주변 날짜를 섞지 않고, 빠진 해가 있어도 기간을 늘리지 않습니다.</li>
        <li>횟수 기준(서비스 통계와 같은 정의): 비·눈 = 일강수량 0.1mm 이상 · 30℃ = 일최고 30℃ 이상 · 33℃ = 일최고 33℃ 이상(기상청 폭염일수 기준) · 영하 = 일최저 0℃ 미만 · 하루 종일 영하 = 일최고 0℃ 미만 · 눈 쌓임 = 일 최심신적설 0cm 초과. 5~9월 날짜는 더위, 10~4월 날짜는 추위 기준을 늘 보여 주고, 계절 밖이라도 한 번이라도 있으면 보여 줍니다.</li>
        <li>일강수량 공란은 그날 행과 기온이 있을 때만 기상청 관례대로 무강수 0, 행 없음·전부 공란은 자료 없음(세지 않음). 그해에 없는 날짜(평년 2월 29일·윤달 없음·음력 30일 없음)는 다른 날로 바꾸지 않고 빼고 셉니다.</li>
        <li>앞뒤 15일 = 해마다 그 날짜 ±15일(31일, 연말·연초는 해를 넘겨 이어 셈). 31일 중 자료 없는 날이 1일 이하인 해만 넣습니다(채우지 않음). 기온은 해마다 31일 평균 → 해들의 평균, 강수일 비율·하루 평균 강수량은 유효한 날 전체로 나눕니다. 고른 해의 창이 아직 끝나지 않았으면 어제까지 관측만 '진행 중'으로 따로 보여 주고 차이는 계산하지 않습니다.</li>
        <li>시간별 = 고른 해(와 겹쳐 본 해)의 정시 관측 그대로. 시간 강수 공란은 그 시각 행이 있고 품질 플래그가 결측(9)이 아닐 때만 무강수 0. 시간자료는 1990년부터 씁니다.</li>
        <li>음력: 대한민국 음양력(한국천문연구원 자료 기반 표, ${E(D.lunarRange.solarFrom)}~${E(D.lunarRange.solarTo)}). 연도 = 고른 달력의 연도.</li>
        <li>버전: 화면 ${E(D.dayVersion || "")} · 정책 ${E(D.policyVersion)} · 달력 ${E(D.calendarVersion)} · 이야기 ${E(D.storyVersion)} · 일자료 판 ${E(D.dataRevision.daily)}</li></ul></details>`;
  }
  function showEvidence(i) {
    const s = STORIES[i];
    const box = $(`dsEv${i}`);
    if (!s || !box) return;
    const ev = s.evidence || {};
    const exc = ev.excluded && !Array.isArray(ev.excluded) ? Object.entries(ev.excluded).map(([r, ys]) => `${STATUS(r)} ${ys.join("·")}`).join(" / ") : Array.isArray(ev.excluded) ? ev.excluded.join("·") : "";
    box.innerHTML = `<ul><li>지표: ${E({ rain: "일강수량", avg: "일평균기온", max: "일최고기온", min: "일최저기온", nsnow: "신적설", ta: "정시 기온", date: "날짜 대응" }[ev.metric] || ev.metric)}</li><li>계산: ${E(ev.formula || "")}</li>${ev.years?.length ? `<li>해당 연도: ${[...new Set(ev.years)].join("·")}</li>` : ""}${ev.hours?.length ? `<li>시각: ${ev.hours.map((h) => `${h}시`).join("·")}</li>` : ""}${exc ? `<li>뺀 해: ${E(exc)}</li>` : ""}</ul>`;
    box.hidden = !box.hidden;
    const target = document.querySelector(`#sday [data-sec="${s.target}"]`);
    if (target && !box.hidden) {
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
  window.DateDay = { show, station: () => st.station, onStation: (id) => { st.station = id; go(); }, parseDate };
})();
