// 날씨 이야기 › 날짜로 보는 날씨(#/stories/day) v2(2026-10-18). 값·문장은 모두 /api/stats/date-weather 응답 그대로(화면에서 다시 계산하지 않음, 반올림·뺄셈 표시만).
// 화면 모델: 날짜 하나(양력·음력 연월일) → ① 해마다 이날(그해 실제 관측 · 횟수·극값, 같은 날 평균 없음) ② 앞뒤 15일 날씨 통계(31일 창)
//   ③ 고른 해의 시간별 관측(+겹쳐 볼 해 최대 2개, 평균 없음) ④ 연도 × 시간 히트맵(관측값) ⑤ 고른 해 그날 상세 ⑥ 짧은 이야기
//   ⑦ 그해 특정일 — 관리 › 캘린더 관리(#/calendar)에 등록한 설날·추석·수능일 등을 그해 날짜 순으로(날씨 값과 무관, 표시만).
//   ⑧ 특정일 모드(ev=csat|hakryeok|holiday|custom 또는 ev=holiday|추석) — 그 특정일이 해마다 '실제로 며칠이었는지'를 따라가며
//      그해 그 날짜 하루의 날씨를 /api/stats/date-series 로 받아 보여 준다(수능일·학력고사일처럼 날짜가 해마다 바뀌는 날용).
//      특정일 모드에서는 ①~⑥(고른 월·일 고정) 카드를 그리지 않고 그 자리를 특정일 카드가 대신한다.
// 주소 = 상태: station·cal·date(YYYY-MM-DD)·leap·cmp·period·to·from(+보기 hm·ym·hk, +특정일 ev). 예전 주소(m·d·year)도 그대로 읽는다.
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
  const st = { station: "108", cal: "solar", y: +today.slice(0, 4), m: +today.slice(5, 7), d: +today.slice(8, 10), leap: false, cmp: [], period: "recent10", to: THIS_YEAR - 1, from: THIS_YEAR - 10, hm: "ta", ym: "max", hk: "ta", alias: "", all: false, ev: "", evFrom: 1994 };
  const EV_KINDS = [["csat", "수능일"], ["hakryeok", "학력고사일"], ["holiday", "명절·기념일"], ["custom", "직접 추가"]];
  const EV_DEFAULT_FROM = { csat: 1994, hakryeok: 1981, holiday: 1990, custom: 1990 }; // 시드 첫 시행 학년도(창 기본값)
  let meta = null;
  let seq = 0;
  let D = null; // 일자료 응답(해마다 이날 · 앞뒤 15일 · 고른 해)
  // 특정일(캘린더 관리에서 등록한 설날·추석·수능일). 날씨 계산과 섞지 않고 '보여 주기만' 한다 — 실패해도 본 화면은 그대로.
  let CAL = { map: new Map(), list: [], ok: false, pending: false }; // map: 양력 날짜 → 그날 특정일들, list: 그해 것(날짜 순)
  let H = null; // 시간자료 응답
  let EV = null; // 특정일 모드 응답(/api/stats/date-series) — 그 특정일이 해마다 실제로 며칠이었는지 + 그날 값
  let EVI = null; // 특정일 이름 목록(종류별) — 이름 고르기 상자 채우기
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
    const idOf = (v) => (window.NWDefaults?.stationIdOf ? NWDefaults.stationIdOf(v) : /^\d{1,6}$/.test(String(v ?? "")) ? String(v) : null);
    const fromUrl = idOf(q.get("station")), savedSt = idOf(window.NWStation?.stored?.()); // stored() = { id, why, at }
    if (fromUrl) st.station = fromUrl;
    else if (savedSt) st.station = savedSt;
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
    // 특정일 모드(ev=kind 또는 ev=kind|이름) — 없으면 ''. 모르는 종류는 무시(주소를 손으로 고쳐도 화면이 깨지지 않게)
    const evRaw = String(q.get("ev") || "");
    const [evK, ...evL] = evRaw.split("|");
    st.ev = EV_KINDS.some(([k]) => k === evK) ? (evL.join("|").trim() ? `${evK}|${evL.join("|").trim().slice(0, 60)}` : evK) : "";
    // 기간 시작: 주소 값 → 그 종류의 기본(수능 1994·학력고사 1981·명절 1990) → 1990. 특정일 모드가 아니면 건드리지 않는다.
    if (st.ev) st.evFrom = n("evfrom", 1900, 2050) ?? EV_DEFAULT_FROM[st.ev.split("|")[0]] ?? 1990;
    if (st.evFrom > THIS_YEAR) st.evFrom = THIS_YEAR;
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
    // 특정일 모드도 주소에 남긴다(새로고침·뒤로 가기·링크 공유가 같은 화면을 다시 연다)
    if (st.ev) { q.set("ev", st.ev); q.set("evfrom", String(st.evFrom)); }
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
  const ICON = {
    pick: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
    battle: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 14 10M14 4h6v6M4 4l6 6M14 14l6 6M17 20h3v-3"/></svg>`,
    link: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
    img: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>`,
  };
  function shell() {
    const p = $("sday");
    if (p.dataset.ready === "3") return;
    p.dataset.ready = "3";
    // 조회 조건: 한 줄(좁은 화면은 fold.js 가 '서울(108) · 양력 2025-10-18 · 최근 10년' 막대로 접음) + 작은 보조 버튼 줄 + 저장한 날짜 칩
    p.innerHTML = `
      <div class="card ds-head">
        <div class="sx-ctl ds-ctl" id="dsCtl"></div>
        <div class="ds-sub"><span class="ds-tools2" id="dsActs"></span></div>
        <div class="fav-row ds-favs" id="dsFav"></div><p class="ds-toast" id="dsToast" role="status" hidden></p></div>
      <div class="card" id="dsCard"></div>
      <div class="card" id="dsEvents" data-sec="events"></div>
      <div class="card" id="dsSeries" data-sec="series" hidden></div>
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
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (document.body.dataset.page === "sday") { if (D) renderYearChart(); if (H) renderHour(); if (EV) renderEvChart(); } }, 200); });
  }
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const seg = (name, list, cur) => `<div class="seg ds-seg" role="group">${list.map(([v, l]) => `<button type="button" data-${name}="${v}" class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${E(l)}</button>`).join("")}</div>`;
  function renderCtl() {
    if (st.ev) return renderEvCtl();
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})${s.region ? ` · ${s.region}` : ""}`]);
    const toYears = []; for (let y = THIS_YEAR; y >= 1971; y--) toYears.push([y, `${y}년`]);
    const pickVal = st.cal === "solar" && !(st.m === 2 && st.d === 29 && !isLeapY(st.y)) ? dateStr() : "";
    const custom = st.period === "custom";
    const toSel = (id) => `<select id="${id}" aria-label="끝 연도">${opt(toYears, st.to)}</select>`;
    $("dsCtl").innerHTML = `
      <div class="ds-f-st"><label for="dsSt">관측지점</label><select id="dsSt">${opt(stations, st.station)}</select></div>
      <div class="ds-f-cal"><label>기준</label>${seg("cal", [["solar", "양력"], ["lunar", "음력"]], st.cal)}</div>
      <div class="ds-datef"><label for="dsDate">${st.cal === "lunar" ? "음력 날짜" : "날짜"}</label><span class="sx-inline ds-dateline"><input id="dsDate" class="ds-date" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="YYYY-MM-DD" value="${dateStr()}" title="연-월-일 (2025-10-18 · 2025.10.18 · 20251018)">${st.cal === "solar" ? `<span class="ds-pick" title="달력에서 고르기">${ICON.pick}<input type="date" id="dsPick" aria-label="달력에서 날짜 고르기" min="1900-01-01" max="2050-12-31" value="${pickVal}"></span>` : `<label class="sx-check ds-leapchk"><input type="checkbox" id="dsLeap"${st.leap ? " checked" : ""}> 윤달</label>`}</span></div>
      <div class="ds-f-per"><label for="dsPer">통계 기간</label><select id="dsPer">${opt(PERIODS, st.period)}</select></div>
      ${custom ? `<div class="ds-f-rng"><label for="dsFrom">기간 (연도)</label><span class="sx-inline"><input id="dsFrom" type="number" class="sx-num" min="1900" max="${st.to}" value="${st.from}" aria-label="시작 연도"><span class="tilde">~</span>${toSel("dsTo")}</span></div>` : ""}
      <div class="ds-f-go"><button type="button" id="dsGo">날씨 보기</button></div>
      <details class="ds-more ds-wide"${(!custom && st.to !== THIS_YEAR - 1) || st.alias ? " open" : ""}><summary>자세히</summary><div class="sx-ctl">${custom ? "" : `<div><label for="dsTo">끝 연도</label>${toSel("dsTo")}</div>`}<div><label for="dsAlias">별칭</label><input id="dsAlias" maxlength="30" placeholder="예: 우리 집 기념일" value="${E(st.alias)}"></div></div></details>`;
    $("dsActs").innerHTML = `<button type="button" class="sec ds-mini" id="dsBattle" title="이 날짜로 날씨 배틀 열기">${ICON.battle}<span>배틀</span></button><button type="button" class="sec ds-mini" id="dsCopyTop" title="공유 링크 복사">${ICON.link}<span>링크 복사</span></button><button type="button" class="sec ds-mini" id="dsCardImg" title="이날의 날씨 카드 이미지">${ICON.img}<span>카드 이미지</span></button>`;
    renderFav();
  }
  // ---- 자주 보는 날짜(이 브라우저에만) — v2: 연-월-일 그대로 저장(예전 저장은 월·일만 → 올해로 열림)
  const favKey = () => `${st.station}|${st.cal}|${dateStr()}|${st.leap ? 1 : 0}`;
  const stName = (id) => (meta?.stations || []).find((s) => String(s.station_id) === String(id))?.station_name || (/^\d{1,6}$/.test(String(id ?? "")) ? String(id) : "서울(기본)");
  function favLabel(x) { const sl = x.y ? `${x.cal === "lunar" ? "음력 " : ""}${x.y}.${x.m}.${x.d}${x.leap ? "(윤)" : ""}` : x.cal === "lunar" ? `음력 ${x.m}/${x.d}${x.leap ? "(윤)" : ""}` : `${x.m}월 ${x.d}일`; return `${x.alias ? `${x.alias} · ` : ""}${sl} · ${stName(x.station)}`; }
  function favHref(x) { const q = new URLSearchParams({ station: x.station, cal: x.cal }); if (x.y) q.set("date", `${x.y}-${p2(x.m)}-${p2(x.d)}`); else { q.set("m", String(x.m)); q.set("d", String(x.d)); } if (x.cal === "lunar") q.set("leap", x.leap ? "1" : "0"); q.set("period", st.period); if (st.period === "custom") { q.set("from", String(st.from)); q.set("to", String(st.to)); } if (x.alias) q.set("alias", x.alias); return `#/stories/day?${q}`; }
  function renderFav() {
    const el = $("dsFav");
    if (!el || !window.StoryFavs) return;
    const on = StoryFavs.has("day", favKey());
    const acts = $("dsActs");
    if (acts) {
      acts.querySelector("#dsFavBtn")?.remove();
      acts.insertAdjacentHTML("afterbegin", `<button type="button" class="sec ds-mini fav-star${on ? " on" : ""}" id="dsFavBtn" aria-pressed="${on}" title="자주 보는 날짜로 이 브라우저에 저장"><b aria-hidden="true">${on ? "★" : "☆"}</b><span>${on ? "저장됨" : "저장"}</span></button>`);
    }
    el.innerHTML = StoryFavs.read("day").length ? `<span class="fav-list" aria-label="자주 보는 날짜">${StoryFavs.chips("day", { label: favLabel, href: favHref, current: favKey() })}</span>` : "";
  }
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
  function applyDate(focus = true) {
    const el = $("dsDate");
    const r = parseDate(el.value, st.cal);
    if (!r.ok) { el.setAttribute("aria-invalid", "true"); toast(r.message); if (focus) el.focus(); return false; }
    if (r.y === st.y && r.m === st.m && r.d === st.d && !focus) return true; // 값이 그대로면 다시 부르지 않음
    el.removeAttribute("aria-invalid");
    Object.assign(st, { y: r.y, m: r.m, d: r.d });
    st.cmp = st.cmp.filter((y) => y !== st.y);
    go();
    return true;
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "dsSt") { st.station = t.value; if (window.NWStation) NWStation.manual(t.value); }
    else if (t.id === "dsDate") { applyDate(false); return; }
    else if (t.id === "dsPick") { if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return; $("dsDate").value = t.value; applyDate(); return; }
    else if (t.id === "dsLeap") st.leap = t.checked;
    else if (t.id === "dsPer") { if (!PERIODS.some(([p]) => p === t.value)) return; st.period = t.value; }
    else if (t.id === "dsTo") { st.to = +t.value; if (st.from > st.to) st.from = st.to; }
    else if (t.id === "dsFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > st.to) return; st.from = v; }
    else if (t.id === "dsEvFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > THIS_YEAR) return; st.evFrom = v; }
    else if (t.id === "dsEvName") { const k = evKind(); st.ev = t.value ? `${k}|${t.value}` : k; }
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
    // 그해 특정일 → 그 양력 날짜로 화면을 옮긴다(기준은 양력으로 두고 연·월·일만 바꿈)
    if (ds.calDate) { const [y, m, d] = ds.calDate.split("-").map(Number); Object.assign(st, { cal: "solar", y, m, d, leap: false }); st.cmp = st.cmp.filter((x) => x !== y); return go(); }
    // 특정일 칩 → 그 특정일의 '해마다 실제 날짜' 모드(월·일을 고정하지 않는다)
    // 수능·학력고사는 모든 시행일이 한 계열이므로 종류 전체로, 명절·직접 추가는 이름까지 좁혀서(설날/추석 구분) 연다.
    if (ds.evGo) { const k = String(ds.evGo).split("|")[0]; return goEv(evTarget(ds.evGo, k)); }
    // 종류 바꾸기(같은 화면에서 ev 만 바꾼다) — 이름은 종류가 다르면 지운다
    if (ds.evk) return switchEvKind(ds.evk);
    if (b.id === "dsEvBack" || b.dataset.evBack) return backToDay();
    if (ds.ov) { const y = +ds.ov; if (st.cmp.includes(y)) st.cmp = st.cmp.filter((x) => x !== y); else if (st.cmp.length < 2) st.cmp.push(y); else { toast("시간 그래프에는 자세히 볼 해 + 2개 해까지 겹칩니다. 하나를 빼고 고르세요"); return; } return go(); }
    if (b.id === "dsAll") { st.all = !st.all; return renderYears(); }
    if (b.id === "dsGo") { applyDate(); return; }
    if (b.id === "dsBattle" || b.id === "dsSelBattle") { location.hash = battleHref(); return; }
    if (b.id === "dsCopy" || b.id === "dsCopyTop") return copyLink();
    if (b.id === "dsCardImg" || b.id === "dsCardImg2") return openCard();
    if (b.id === "dsFavBtn") { const on = StoryFavs.toggle("day", { key: favKey(), station: st.station, cal: st.cal, y: st.y, m: st.m, d: st.d, leap: st.leap, alias: st.alias }); toast(on ? "이 날짜를 이 브라우저에 저장했습니다(위 목록에서 바로 열기)" : "저장을 지웠습니다"); return renderFav(); }
    if (ds.favdel) { StoryFavs.remove("day", ds.favdel); return renderFav(); }
    if (ds.ev !== undefined) { e.preventDefault(); return showEvidence(+ds.ev); }
    if (b.id === "dsRetry") { cache.clear(); return load(); }
  }
  // 목록·그래프에서 해를 누르면: 자세히 볼 해(=날짜의 연도)를 바꾸고 주소의 date 도 바꾼다
  function pickYear(y) { if (y === st.y) return; st.y = y; st.cmp = st.cmp.filter((x) => x !== y); go(); }
  function battleHref() {
    const a = `A.${st.station}.${st.cal === "lunar" ? "L" : "S"}.${st.m}.${st.d}.${st.leap ? 1 : 0}.${st.y}`;
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

  // ---------------------------------------------------------------- 특정일(관리 › 캘린더 관리 #/calendar)
  // 서버가 해석한 양력 날짜를 그대로 쓴다(음력 규칙 → 양력 날짜 계산은 서버 calendar-resolver 가 한다). 화면에서는 다시 계산하지 않는다.
  // 요청 범위는 통계 창(해마다 이날) + 고른 해다 — 고른 해가 창 밖(올해 등)일 수 있어 양옆으로 한 해씩 넓힌다.
  // 연도 배지용 짧은 이름: 수능·학력고사는 줄여 쓰고, 직접 넣은 긴 이름은 12자에서 자른다(줄이 밀리지 않게).
  const CAL_SHORT = (e) => (e.kind === "csat" ? "수능" : e.kind === "hakryeok" ? "학력고사" : [...String(e.label)].length > 12 ? `${[...String(e.label)].slice(0, 12).join("")}…` : e.label);
  async function loadCalendar(win) {
    // 창(해마다 이날) + 고른 해. 고른 해가 창 밖(올해 등)일 수 있어 양옆으로 한 해씩 넓힌다(음력 12월은 양력으로 해를 넘김).
    const fromYear = Number.isInteger(win?.fromYear) ? win.fromYear : st.y - 10;
    const toYear = Number.isInteger(win?.toYear) ? win.toYear : THIS_YEAR - 1;
    const from = Math.max(1900, Math.min(fromYear, st.y - 1)), to = Math.min(2050, Math.max(toYear, st.y + 1));
    const r = await getJson(`/api/calendar/events?from=${from}&to=${to}`);
    const map = new Map();
    for (const e of r.events || []) {
      if (!e.solarDate) continue;
      if (!map.has(e.solarDate)) map.set(e.solarDate, []);
      map.get(e.solarDate).push(e);
    }
    // '그해 특정일' = 고른 해의 양력 날짜. 음력 12월처럼 양력으로 해를 넘기는 날이 있어 기준은 양력 날짜 연도로 둔다.
    const list = (r.events || []).filter((e) => e.solarDate && e.solarDate.slice(0, 4) === String(st.y));
    return { map, list, ok: true };
  }
  const calOf = (ymd) => (ymd && CAL.map.get(ymd)) || [];
  function renderEvents() {
    const el = $("dsEvents");
    if (!el) return;
    if (!CAL.ok) { el.innerHTML = `<h3 class="ds-h">그해 특정일</h3><p class="sx-state">특정일을 불러오지 못했습니다. <a href="#/calendar">캘린더 관리</a></p>`; return; }
    const list = CAL.list;
    const head = `<h3 class="ds-h">그해 특정일 ${window.InfoTip.sub(`${st.y}년 · 설날·추석·수능일 등`, `관리 › 캘린더 관리에 등록한 특정일 · 양력 날짜 순 · 날씨 값과 무관합니다`, { label: "기준" })}</h3>`;
    if (CAL.pending) { el.innerHTML = `${head}<p class="sx-state">특정일을 불러오는 중…</p>`; return; }
    // 칩 = 그 특정일의 '해마다 실제 날짜' 모드로(월·일 고정 화면으로 옮기지 않는다) — 수능일처럼 해마다 날짜가 바뀌는 날이 목적
    const evKey = (e) => `${e.kind}|${e.label}`;
    el.innerHTML = `${head}
      ${list.length
        ? `<div class="ds-evs">${list.map((e) => `<button type="button" class="ds-evchip" data-ev-go="${E(evKey(e))}" title="${E(e.label)}${e.note ? ` · ${E(e.note)}` : ""} — 해마다 실제 날짜의 날씨 보기"><b>${E(md(e.solarDate))}</b> <span>${E(e.label)}</span>${e.note ? ` <small>${E(e.note)}</small>` : ""}</button>`).join("")}</div>`
        : `<p class="ds-note">이 해에 등록된 특정일이 없습니다. <a href="#/calendar">캘린더 관리</a>에서 설날·추석·수능일을 넣어 두면 여기와 '고른 날짜' 카드에 함께 나옵니다.</p>`}
      <p class="ds-note">칩을 누르면 그 특정일이 <b>해마다 실제로 며칠이었는지</b>를 따라가며 그날 날씨를 봅니다(수능일·학력고사일처럼 해마다 날짜가 바뀌는 날용).</p>`;
  }

  // ---------------------------------------------------------------- 불러오기(일자료 먼저, 시간자료 따로)
  const DAILY_SECS = ["dsCard", "dsEvents", "dsYears", "dsAround", "dsSel", "dsStory"];
  const DAY_CARDS = [...DAILY_SECS, "dsHour", "dsHeat"]; // 특정일 모드에서는 이 카드들을 숨기고 dsSeries 가 그 자리를 대신한다
  function setEvMode(on) {
    for (const id of DAY_CARDS) { const el = $(id); if (el) el.hidden = !!on; }
    const el = $("dsSeries");
    if (el) el.hidden = !on;
  }
  async function load() {
    const my = ++seq;
    D = null; H = null; EV = null;
    if (st.ev) return loadSeries(my);
    setEvMode(false);
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
      // 특정일은 덧붙이는 정보라 본 화면을 막지 않는다 — 따로 불러와 그 카드·배지·한 줄만 다시 그린다(6초 뒤 포기).
      // 먼저 '불러오는 중'으로 두고 그리는 이유: 이전 요청의 옛 결과나 실패 문구가 한 번 번쩍이지 않게.
      CAL = { map: new Map(), list: [], ok: false, pending: true };
      renderCard(); renderEvents(); renderYears(); renderAround(); renderSel(); renderStories();
      Promise.race([
        loadCalendar(d.window),
        new Promise((resolve) => setTimeout(() => resolve({ map: new Map(), list: [], ok: false }), 6000)),
      ]).catch(() => ({ map: new Map(), list: [], ok: false })).then((c) => {
        if (my !== seq) return; // 그사이 다른 날짜를 골랐으면 버린다
        CAL = c;
        renderCard(); renderEvents(); renderYears();
      });
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
  // ---------------------------------------------------------------- ⑧ 특정일 모드(해마다 '실제 시행일'을 따라간다)
  // 왜: '날짜로 보는 날씨'는 고른 월·일을 해마다 고정한다. 수능일·학력고사일은 해마다 양력 날짜가 바뀌므로(2024학년도 11/16,
  // 2025학년도 11/14 …) 고정 월·일로는 그해 실제 날씨를 볼 수 없다. 이 모드는 특정일 표(calendar_events)가 해석한
  // '그해 실제 양력 날짜'를 따라가며 하루씩 값을 받는다(/api/stats/date-series). 설날·추석도 같은 방법으로 본다.
  const evKind = () => st.ev.split("|")[0];
  const evLabel = () => st.ev.split("|")[1] || "";
  const evText = () => (EV?.series?.name || evLabel() || (EV_KINDS.find(([k]) => k === evKind()) || [])[1] || "특정일");
  const evQuery = () => {
    const q = new URLSearchParams({ stn: st.station, kind: evKind(), from: String(st.evFrom), to: String(THIS_YEAR) });
    if (evLabel()) q.set("label", evLabel());
    return q;
  };
  const goEv = (ev) => { st.ev = ev; go(); };
  // 종류가 바뀌면 기간 시작을 그 종류의 기본값으로(수능 1994 · 학력고사 1981 · 명절 1990). 같은 종류 안에서만 사용자가 고른 값을 지킨다.
  function switchEvKind(k) {
    const cur = st.ev.split("|")[0];
    if (k !== cur) st.evFrom = EV_DEFAULT_FROM[k] ?? 1990;
    goEv(evTarget(k, k));
  }
  // 칩/버튼이 가리키는 특정일 → 모드 키. 수능·학력고사는 시행일마다 이름이 달라(2027학년도 수능 …) 이름으로 좁히지 않는다.
  function evDefaultFrom(kind) { if (!st.ev) st.evFrom = EV_DEFAULT_FROM[kind] ?? 1990; return st.evFrom; }
  function evTarget(raw, kind) {
    const k = kind || String(raw).split("|")[0];
    const lab = String(raw).split("|").slice(1).join("|");
    evDefaultFrom(k);
    return lab && (k === "holiday" || k === "custom") ? `${k}|${lab}` : k;
  }
  function backToDay() { st.ev = ""; go(); }
  // 이름 목록(추석·설날처럼 같은 kind 안에 여러 이름이 있을 때 고르기) — 실패해도 화면은 그대로(빈 목록)
  async function loadEvNames(kind) {
    if (EVI && EVI.kind === kind && Date.now() - EVI.at < 600000) return EVI.names;
    const names = [];
    try {
      const r = await getJson(`/api/calendar/events?from=1900&to=2050`);
      const seen = new Set();
      for (const e of r.events || []) if (e.kind === kind && e.label && !seen.has(e.label)) { seen.add(e.label); names.push(e.label); }
    } catch { /* 이름 목록은 덧붙이는 정보 */ }
    EVI = { kind, names, at: Date.now() };
    return names;
  }
  async function loadSeries(my) {
    setEvMode(true);
    renderCtl();
    const host = $("dsSeries");
    host.innerHTML = `<div class="sx-state">특정일 날씨를 불러오는 중…</div>`;
    const namesP = loadEvNames(evKind());
    try {
      const r = await getJson(`/api/stats/date-series?${evQuery()}`);
      if (my !== seq) return;
      EV = r;
      // 이름이 비어 있는데 같은 kind 에 이름이 여럿이면(예: holiday) 첫 이름으로 좁히지 않고 전체를 보여 준다 — 아래 '이름' 상자에서 고른다
      renderEv();
      // 이름 상자는 늦게 채워도 되므로 그린 뒤에 갱신(첫 그림이 늦어지지 않게)
      namesP.then((names) => { if (my !== seq) return; const sel = $("dsEvName"); if (sel && names.length) { sel.innerHTML = `<option value="">전체 (${names.length}개)</option>${names.map((n) => `<option value="${E(n)}"${n === evLabel() ? " selected" : ""}>${E(n)}</option>`).join("")}`; sel.closest("div")?.removeAttribute("hidden"); } });
    } catch (e) {
      if (my !== seq) return;
      host.innerHTML = `<div class="sx-state err">특정일 날씨를 불러오지 못했습니다 · ${E(e.message)} <button type="button" id="dsRetry" class="sec">다시 시도</button> <button type="button" class="sec ds-evback" id="dsEvBack">날짜로 돌아가기</button></div>`;
    }
  }
  // 수능·학력고사는 '시행일', 명절·직접 추가는 '날짜'
  const evWord = () => (evKind() === "csat" || evKind() === "hakryeok" ? "실제 시행일" : "실제 날짜");
  const evPointDate = (p) => `${dot(p.solarDate)}(${dow(p.solarDate)})`;
  function renderEvChart() {
    const el = $("dsEvChart");
    if (!EV || !el) return;
    const pts = EV.points;
    if (!pts.length) { el.innerHTML = ""; return; }
    const SER = [{ key: "max", label: "최고기온", color: "#dc2626" }, { key: "min", label: "최저기온", color: "#2563eb" }];
    V.seriesChart(el, {
      unit: "℃", digits: 1, aria: `${evText()} 해마다 실제 날짜의 최고·최저기온`,
      series: SER,
      points: pts.map((p) => ({
        year: p.yearLabel ? p.yearLabel.replace(/학년도$/, "") : String(p.year),
        axis: p.yearLabel ? p.yearLabel.replace(/학년도$/, "") : String(p.year),
        md: md(p.solarDate), solarDate: p.solarDate,
        values: { max: p.dateStatus === "ok" ? p.values.max : null, min: p.dateStatus === "ok" ? p.values.min : null },
        statusText: p.dateStatus === "ok" && !p.rowPresent ? "자료 없음" : STATUS(p.dateStatus),
      })),
      tip: (i) => { const p = pts[i]; const ok = p.dateStatus === "ok"; const st0 = ok && !p.rowPresent ? "자료 없음" : STATUS(p.dateStatus); return `<b>${E(p.yearLabel || `${p.year}년`)}</b> · ${E(evPointDate(p))}${p.lunarText ? `<br><span class="muted">${E(p.lunarText)}</span>` : ""}<br>${ok && fin(p.values.max) ? `<span style="color:#dc2626">최고 <b>${fmt(p.values.max)}℃</b></span> · <span style="color:#2563eb">최저 <b>${fmt(p.values.min)}℃</b></span>` : E(st0)}`; },
      onPick: () => { /* 표에서 같은 줄을 강조하지는 않는다(그래프는 읽기용) */ },
    });
  }
  // 특정일 모드의 조회 조건: 지점 · 특정일 종류 · 기간 시작 연도(날짜 고르기 칸은 쓰지 않는다)
  function renderEvCtl() {
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})${s.region ? ` · ${s.region}` : ""}`]);
    $("dsCtl").innerHTML = `
      <div class="ds-f-st"><label for="dsSt">관측지점</label><select id="dsSt">${opt(stations, st.station)}</select></div>
      <div class="ds-f-ev"><label>특정일</label>${seg2()}</div>
      <div class="ds-f-evfrom"><label for="dsEvFrom">기간</label><span class="sx-inline"><input id="dsEvFrom" type="number" class="sx-num" min="1900" max="${THIS_YEAR}" value="${st.evFrom}" aria-label="시작 연도"><span class="tilde">~</span><span class="ds-evto">${THIS_YEAR}년</span></span></div>
      <div class="ds-f-evname" hidden><label for="dsEvName">이름</label><select id="dsEvName"></select></div>
      <details class="ds-more ds-wide"><summary>자세히</summary><div class="sx-ctl"><div><label for="dsAlias">별칭</label><input id="dsAlias" maxlength="30" placeholder="예: 우리 집 기념일" value="${E(st.alias)}"></div></div></details>`;
    $("dsActs").innerHTML = `<button type="button" class="sec ds-mini" id="dsCopyTop" title="공유 링크 복사">${ICON.link}<span>링크 복사</span></button>`;
    renderFav();
  }
  const seg2 = () => `<div class="seg ds-seg" role="group">${EV_KINDS.map(([k, l]) => `<button type="button" data-evk="${k}" class="${k === evKind() ? "on" : ""}" aria-pressed="${k === evKind()}">${E(l)}</button>`).join("")}</div>`;

  function renderEv() {
    const host = $("dsSeries");
    if (!EV) return;
    const S = EV.summary;
    const W = EV.window;
    const stn = EV.station;
    const pts = EV.points;
    const per = `${W.fromYear}~${W.toYear}년`;
    const hot = S.extremes.hottest;
    const cold = S.extremes.coldest;
    const wet = S.extremes.wettest;
    const r10 = S.recent10;
    const name = evText();
    const yearWord = (x) => (x.yearLabel ? `${x.yearLabel}` : `${x.year}년`);
    const exLine = (x, unit) => (x.value == null ? "" : `<b>${E(yearWord(x))}</b>(${E(evPointDate({ solarDate: x.solarDate }))}) ${fmt(x.value)}${unit}${x.tie ? ` <span class="muted">공동 ${x.years.join("·")}</span>` : ""}`);
    const lines = [];
    if (hot.value != null) lines.push(`가장 더웠던 해는 ${exLine(hot, "℃")}${cold.value != null ? `, 가장 추웠던 해는 ${exLine(cold, "℃")}` : ""}입니다.`);
    if (S.rainCount.n) lines.push(`비나 눈이 온 해는 ${S.rainCount.k}번 / 강수 자료가 있는 ${S.rainCount.n}개 해(${fmt(S.rainCount.share, 0)}%)${S.rainCount.k ? ` — ${S.rainCount.hitYears.join("·")}년` : ""}.`);
    if (wet.value != null) lines.push(`강수가 가장 많았던 해는 ${exLine(wet, "mm")}입니다.`);
    if (r10.max.mean != null) lines.push(`${r10.label || `최근 10년(${r10.fromYear}~${r10.toYear})`} ${r10.points}개 해의 평균은 최고 ${fmt(r10.max.mean)}℃ · 최저 ${fmt(r10.min.mean)}℃${r10.avg.mean != null ? ` · 평균 ${fmt(r10.avg.mean)}℃` : ""}이고, 그중 ${r10.rainCount.k}번 비나 눈이 왔습니다.`);
    const exN = S.excluded.length;
    if (exN) lines.push(`자료가 없어 평균·극값에서 뺀 해 ${exN}개${S.excluded.length <= 6 ? `: ${S.excluded.map((x) => `${x.year}(${x.reasonText})`).join(", ")}` : ""}.`);
    if (EV.missingYears.length) {
      const my = EV.missingYears;
      lines.push(`${per} 중 이 특정일이 없던 해 ${my.length}개${my.length <= 12 ? `: ${my.join("·")}` : ` (${my[0]}~${my[my.length - 1]})`}.`);
    }
    const rows = pts.slice().reverse(); // 최근 해부터
    const num = (v, d = 1) => (fin(v) ? fmt(v, d) : `<span class="muted">–</span>`);
    const stat = (p) => (p.dateStatus === "ok" ? p.rowPresent ? "자료 있음" : "자료 없음" : STATUS(p.dateStatus));
    host.innerHTML = `
      <div class="ds-evhead">
        <h3 class="ds-h">${E(name)} 날씨 ${window.InfoTip.sub(`${W.fromYear}~${W.toYear}년 · ${evWord()} 기준`, `해마다 그 특정일의 실제 양력 날짜를 따라가며 그날 하루의 공식 일자료를 봅니다(주변 날짜를 섞지 않음)`, { label: "기준" })}</h3>
        <p class="ds-evsub"><b>${E(`${W.fromYear}~${W.toYear}년 · ${evWord()} 기준`)}</b> · ${E(stn.station_name)}(${E(stn.station_id)}) 지점 한 곳의 관측 · ${pts.length}개 점${W.dataFrom && W.dataFrom !== W.fromYear ? `(자료 ${W.dataFrom}~${W.dataTo}년)` : ""}${EV.series.label ? ` · 이름 ${E(EV.series.label)}` : ""}</p>
        <div class="ds-evtools">
          <div><button type="button" class="ds-evback" data-ev-back="1">날짜로 돌아가기</button></div>
          ${EV.series.label ? `<div class="ds-evback2"><button type="button" class="sec" data-evk="${E(evKind())}">${E(EV_KINDS.find(([k]) => k === evKind())?.[1] || "")} 전체 보기</button></div>` : ""}
        </div>
      </div>
      ${lines.length ? `<ol class="ds-evsum">${lines.map((t) => `<li>${t}</li>`).join("")}</ol>` : `<p class="muted">이 기간에는 이 특정일이 없습니다 — 기간(시작 연도)을 넓혀 보세요.</p>`}
      ${pts.length ? `<details class="ds-ychart" open><summary>기온 그래프 — 실제 날짜 순서</summary>
        <p class="ds-evlegend"><span><i style="background:#dc2626"></i>최고기온</span><span><i style="background:#2563eb"></i>최저기온</span><span><i class="hatch"></i>자료 없음</span><span class="muted">x축 위 = ${pts.some((p) => p.yearLabel) ? "학년도" : "연도"}, 아래 = 실제 양력 월·일 — 날짜가 해마다 밀린 것이 보입니다</span></p>
        <div class="sx-chart" id="dsEvChart"></div>
        <p class="ds-note">점 하나 = 그해 그 특정일 하루. 날짜가 해마다 달라(수능일·설날 등) 점 사이 간격은 '해'가 아니라 '그날'입니다. 값이 없는 해는 다른 날로 채우지 않습니다.</p></details>` : ""}
      ${pts.length ? `<details class="sx-table ds-evtable" open><summary>표로 보기 · 최근 해부터</summary><div class="sx-table-wrap"><table><thead><tr><th>학년도</th><th>실제 양력 날짜</th><th>음력</th><th>최고(℃)</th><th>최저(℃)</th><th>평균(℃)</th><th>강수(mm)</th><th>신적설(cm)</th><th>상태</th><th>이름</th></tr></thead><tbody>${rows.map((p) => `<tr class="${p.dateStatus !== "ok" || !p.rowPresent ? "dim" : ""}"><td>${E(p.yearLabel || `${p.year}년`)}</td><td>${E(evPointDate(p))}</td><td class="muted">${E(p.lunarText || "–")}</td><td class="num">${p.dateStatus === "ok" ? num(p.values.max) : "–"}</td><td class="num">${p.dateStatus === "ok" ? num(p.values.min) : "–"}</td><td class="num">${p.dateStatus === "ok" ? num(p.values.avg) : "–"}</td><td class="num">${p.dateStatus === "ok" ? num(p.values.rain) : "–"}</td><td class="num">${p.dateStatus === "ok" ? num(p.values.nsnow) : "–"}</td><td>${E(stat(p))}</td><td class="muted">${E(p.note || "")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <div class="sx-tools"><span class="muted">같은 계산 결과${window.InfoTip.btn("그래프·요약·표·CSV 는 같은 서버 계산 결과입니다.", { label: "CSV 안내" })}</span><a class="dl-chip-btn" href="/api/stats/date-series?${evQuery()}&format=csv" download>${E(name)} CSV</a></div>
      <details class="sx-rules"><summary>계산 기준</summary><ul>
        <li>특정일 날짜 = 관리 › 캘린더 관리에 등록한 표를 해석한 <b>그해 실제 양력 날짜</b>(음력 규칙인 설날·추석은 그해 음력 날짜의 양력 날짜). 화면에서 날짜를 다시 계산하지 않습니다.</li>
        <li>값 = 그날 하루의 공식 일자료(최고·최저·평균기온, 일강수량, 신적설). 주변 날짜를 섞지 않고 같은 날 평균도 내지 않습니다.</li>
        <li>그해 그 날짜의 일자료 행이 없으면 '자료 없음'으로 두고 다른 날·다른 해로 채우지 않습니다. 요약(평균·극값·강수 횟수)에서는 빼고 '뺀 해'로 적습니다.</li>
        <li>강수 공란은 그날 행과 기온이 있을 때만 기상청 관례대로 무강수 0으로 셉니다. 비·눈 온 해 = 일강수량 0.1mm 이상인 해의 수(자료가 있는 해 기준).</li>
        <li>극값이 표시 자리수로 같으면 공동으로 적습니다. 최근 10년 = 요청 기간의 끝 10년.</li>
        <li>버전: 특정일 ${E(EV.series.version || "")} · 정책 ${E(EV.policyVersion)} · 달력 ${E(EV.calendarVersion)} · 일자료 판 ${E(EV.dataRevision?.daily)}</li></ul></details>
      ${window.InfoTip.note(`값 = 그해 그 특정일 하루의 공식 일자료(같은 날 평균 없음). 그해 그 날짜의 행이 없으면 '자료 없음'으로 두고 다른 날로 대체하지 않습니다. 강수 공란은 그날 행과 기온이 있을 때만 기상청 관례대로 무강수 0으로 셉니다. '자료가 없어 뺀 해'는 평균·극값에서 빠집니다. 설날·추석처럼 음력 규칙인 날은 그해 음력 날짜의 양력 날짜를 따라갑니다(대한민국 음양력 표).`, { cls: "ds-note", label: "계산 방법" })}`;
    renderEvChart();
  }

  const STATUS = (s) => (D || H || EV)?.statusText?.[s] || { partial: "자료 부족" }[s] || s;
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
    // 그날 특정일(수능일·설날 등). 그해에 없는 날짜(nodate)면 s.solarDate 가 없으니 자연히 표시하지 않는다.
    const evs = calOf(s.solarDate);
    // 고른 날짜가 특정일과 같은 날이면 '수능일 날씨를 해마다 실제 날짜로 보기' 버튼을 함께 둔다(그 특정일 모드로 전환)
    const evLine = evs.length ? `<p class="ds-evline">${evs.map((e) => `<b>${E(e.label)}</b>${e.note ? ` <small>${E(e.note)}</small>` : ""}`).join(" <span class=\"ds-evdot\">·</span> ")}</p>
      <p class="ds-evline ds-evline-b">${evs.map((e) => `<button type="button" class="sec ds-evgo" data-ev-go="${E(evTarget(`${e.kind}|${e.label}`, e.kind))}">${E(`${e.kind === "csat" ? "수능일" : e.kind === "hakryeok" ? "학력고사일" : e.label} 날씨를 해마다 실제 날짜로 보기`)} ›</button>`).join(" ")}</p>` : "";
    $("dsCard").innerHTML = `<div class="ds-card"><div><p class="ds-k">고른 날짜</p><h3 class="ds-title">${title}</h3>${evLine}<p>${when}</p>${warn}</div>
      <dl class="ds-dl"><div><dt>관측지점</dt><dd>${E(stn.station_name)} (${E(stn.station_id)})${stn.region ? ` · ${E(stn.region)}` : ""} <small>지점 한 곳의 관측</small></dd></div><div><dt>해마다 볼 날</dt><dd>${E(specLabel())} <small>· ${E(D.window.label)} ${D.dateCounts.requested}개 해${D.dateCounts.nodate ? ` (그 날짜가 있는 해 ${D.dateCounts.exists}개)` : ""}</small></dd></div><div><dt>자료 범위</dt><dd>일자료 ${D.dailyFrom.slice(0, 4)}~${dot(stn.dailyLast)} / 시간자료 ${D.hourlyFrom.slice(0, 4)}~ ${window.InfoTip.btn("'전체'는 이 서비스가 가진 범위이며 기상청 전체 역사가 아닙니다.", { label: "자료 범위" })}</dd></div></dl></div>`;
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
    // 그 해 그 날짜에 특정일이 있으면 연도 옆에 작은 배지(첫 이름 + '외 n'). 날씨 값과 무관한 표시다.
    const evs = calOf(r.solarDate);
    const evBadge = evs.length ? ` <span class="dy-ev" title="${E(evs.map((e) => e.label).join(" · "))}">${E(CAL_SHORT(evs[0]))}${evs.length > 1 ? ` 외 ${evs.length - 1}` : ""}</span>` : "";
    const canOv = ok && y >= 1990 && y !== st.y && !outside;
    const ov = st.cmp.includes(y);
    return `<li class="dy-row${chosen ? " sel" : ""}${ok ? "" : " na"}"><button type="button" class="dy-pick" data-pick="${y}" aria-pressed="${chosen}" aria-label="${y}년 이날 자세히 보기"><span class="dy-ic">${obsIcon(r)}</span><span class="dy-yr"><b>${y}${evBadge}</b><small>${date}${chosen ? ` <em class="dy-tag">${outside ? "고른 해 · 기간 밖" : "고른 해"}</em>` : ""}</small></span>${body}</button>${canOv ? `<button type="button" class="dy-ov${ov ? " on" : ""}" data-ov="${y}" aria-pressed="${ov}" title="시간 그래프에 겹쳐 보기">${ov ? "✓ 겹침" : "+ 시간"}</button>` : `<span class="dy-ov-sp"></span>`}</li>`;
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
    $("dsYears").innerHTML = `<h3 class="ds-h">해마다 이날 ${window.InfoTip.sub(`${E(per)} · 하루 실제 관측`, `${E(per)} 해마다 ${E(specLabel())} 하루의 실제 관측 · 같은 날 평균을 내지 않습니다`, { label: "기준" })}</h3>
      <div class="dy-cnts">${cnt}</div>
      ${ex.length ? `<p class="dy-ext">${ex.join(" · ")}${[X.hottest, X.coldest, X.wettest].some((x) => x.years.length > 1) ? ` <span class="muted">(같은 값은 공동)</span>` : ""}</p>` : ""}
      <ol class="dy-list" aria-label="해마다 이날 관측(최근 해부터)">${list.join("")}</ol>
      ${rows.length > LIM ? `<button type="button" class="sec dy-all" id="dsAll">${st.all ? "접기" : `${rows.length}개 해 모두 보기`}</button>` : ""}
      ${window.InfoTip.note(`줄 = 그해 자세히 · <b>+ 시간</b> = 겹쳐 보기`, `줄을 누르면 그해를 자세히 봅니다 · <b>+ 시간</b> = 그해 시간별 관측을 아래 그래프에 겹치기(최대 2개) · 그림은 관측값으로만: 물방울 = 강수 0.1mm 이상, 눈 결정 = 눈이 새로 쌓임, 온도계 = 강수 없음(빨강 최고 30℃ 이상 · 파랑 최저 영하) · 횟수는 자료가 있는 해만 셉니다(자료 없음·그해에는 없는 날짜는 빼고 셈).`, { cls: "ds-note", label: "보는 법" })}
      <details class="ds-ychart"${matchMedia("(min-width:801px)").matches ? " open" : ""}><summary>그래프로 보기</summary><div class="ds-tools">${seg("ym", Object.entries(YM).map(([v, x]) => [v, x[0]]), st.ym)}</div><div class="sx-chart" id="dsYearChart"></div><p class="ds-note" id="dsYearNote"></p></details>
      <div class="sx-tools"><span class="muted">같은 계산 결과${window.InfoTip.btn("목록·횟수·그래프·CSV 는 같은 서버 계산 결과입니다.", { label: "CSV 안내" })}</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("daily")}&format=csv" download>해마다 이날 CSV</a></div>`;
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
    $("dsYearNote").innerHTML = `점·막대 = 그해 이날 하루${window.InfoTip.btn("점·막대 하나 = 그해 이날 하루 · 평균선 없음 · 빗금 = 자료 없음·그해에는 없는 날짜 · 하루씩 뽑은 값이라 계절의 추세를 단정하지 않습니다.", { label: "그래프 보는 법" })}`;
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
    $("dsAround").innerHTML = `<h3 class="ds-h">앞뒤 15일 날씨 통계 ${window.InfoTip.sub(`${E(per)} · 앞뒤 15일(31일)`, `해마다 그 날짜 앞뒤 15일(31일) · ${E(per)} · 하루가 아니라 '이 무렵'의 날씨`, { label: "기준" })}</h3>
      ${window.InfoTip.note(E(win), `${st.cal === "lunar" ? "음력은 해마다 그해 음력 날짜의 양력 날짜를 가운데로 · " : ""}연말·연초는 해를 넘겨 이어 셉니다.`, { cls: "ds-note ds-note-top", label: "31일 창" })}
      <div class="da-wrap"><table class="da-tbl"><thead><tr><th>지표</th><th>${E(per)}<small>${M.avg.n}개 해 · 유효 ${M.avg.validDays}일</small></th><th>${selHead}</th><th>차이</th></tr></thead><tbody>
      ${rows.map(([k, label, kind]) => `<tr><th scope="row">${E(label)}</th>${perCell(k, kind)}${selCell(k, kind)}${diffCell(k, kind)}</tr>`).join("")}</tbody></table></div>
      ${window.InfoTip.note(`쓴 해 ${M.avg.n}개(기온) / ${M.rainDays.n}개(강수)`, `해 수: 요청 ${M.avg.requested}개 · 날짜가 있고 끝난 해 ${M.avg.eligible}개 · 쓴 해 ${M.avg.n}개(기온) / ${M.rainDays.n}개(강수)${exText ? ` · 뺀 해: ${E(exText)}` : ""}. 31일 중 자료 없는 날이 1일 이하인 해만 넣고(남은 날로만 집계, 채우지 않음), 2일 이상 빠지면 '자료 부족'으로 뺍니다. 강수일 비율 = 강수일(0.1mm 이상) ÷ 유효한 날, 하루 평균 강수량 = 강수량 합 ÷ 유효한 날(무강수 0 포함). 기온 평균은 해마다 31일 평균을 먼저 낸 뒤 해들끼리 평균합니다.`, { cls: "ds-note", label: "계산 방법" })}
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
    el.innerHTML = `<h3 class="ds-h">시간별 날씨 ${window.InfoTip.sub(`고른 해 실제 정시 관측`, `고른 해 그날의 실제 정시 관측 · 다른 해를 2개까지 겹쳐 볼 수 있습니다(평균 없음)`, { label: "기준" })}</h3>
      <div class="ds-tools">${seg("hm", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}<span class="ds-yrs">${sel.map((s, i) => `<span class="sx-yr" style="background:${V.SEL[i].color}">${V.SEL[i].mark} ${s.referenceYear}년${i ? `<button type="button" data-cmpdel="${s.referenceYear}" aria-label="${s.referenceYear}년 겹치기 빼기">×</button>` : ""}</span>`).join("")}${st.cmp.length < 2 && listYears.length ? `<select id="dsCmpAdd" aria-label="겹쳐 볼 해 더하기"><option value="">+ 겹쳐 볼 해</option>${opt(listYears.map((y) => [y, `${y}년`]), "")}</select>` : ""}</span></div>
      ${anyOk ? `<div class="sx-chart" id="dsHourChart"></div>` : `<div class="sx-state">${E(sel.map((s) => `${s.referenceYear}년: ${STATUS(s.dateStatus)}`).join(" · "))}${sel[0]?.dateStatus === "unsupported" ? " — 시간자료는 1990년부터 씁니다" : ""}</div>`}
      <div class="sx-legend">${sel.map((s, i) => `<span style="color:${V.SEL[i].color}"><i style="background:${V.SEL[i].color}"></i>${V.SEL[i].mark} ${s.referenceYear}년${s.solarDate ? ` ${md(s.solarDate)}` : ""} 실제 관측${s.dateStatus !== "ok" ? ` — ${E(STATUS(s.dateStatus))}` : ""}</span>`).join("")}<span>선이 끊긴 곳 = 자료 없음(잇지 않음)</span><span>단위 ${unit}</span></div>
      ${bar ? `${window.InfoTip.note(`막대 한 칸 = 1시간 강수량`, `막대 한 칸 = h~h+1시 1시간 강수량(기상청 정시값은 앞 1시간 누적 — 23~24시는 다음날 00시 값). 시간값을 더해 하루 강수량을 만들지 않습니다.`, { cls: "ds-note", label: "강수 막대" })}` : ""}
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
    return `<details class="sx-table"><summary>표로 보기 · ${label}</summary><div class="sx-table-wrap"><table><thead><tr><th>${k === "rn" ? "구간" : "시각"}</th>${sel.map((s) => `<th>${s.referenceYear}년(${unit})</th>`).join("")}</tr></thead><tbody>${Array.from({ length: 24 }, (_, h) => `<tr><td>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</td>${sel.map((s) => `<td class="num">${fin(s.series[k][h]) ? fmt(s.series[k][h], dg) : `<span class="muted">${E(STATUS(s.cellStatus[k][h]))}</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="sx-tools"><span class="muted">같은 계산 결과${window.InfoTip.btn("그래프·표·CSV 는 같은 서버 계산 결과입니다.", { label: "CSV 안내" })}</span><a class="dl-chip-btn" href="/api/stats/date-weather?${apiQuery("hourly")}&format=csv" download>시간별 CSV</a></div></details>`;
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
    $("dsHeat").innerHTML = `<h3 class="ds-h">연도 × 시간 히트맵 ${window.InfoTip.sub(`관측값 그대로`, `행 = 해, 열 = 시각 · 관측값 그대로 · 같은 지표는 한 색 범위`, { label: "기준" })}</h3>
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
    $("dsSel").innerHTML = `<h3 class="ds-h">${st.y}년 그날 자세히 ${window.InfoTip.sub(`공식 일자료 + 시간자료`, `공식 일자료 + 시간자료(각각 있는 만큼) · 다른 해는 위 목록에서 누르세요`, { label: "기준" })}</h3>
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
    $("dsStory").innerHTML = `<h3 class="ds-h">짧은 이야기와 근거 ${window.InfoTip.sub(`실제 관측 · 최대 4개`, `조건을 만족할 때만, 실제 관측으로(최대 4개)`, { label: "기준" })}</h3>
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
    if (!/[?&]date=/.test(location.hash)) replaceView(); // 예전 주소(m·d·year) → 새 주소(date=)로 바꿔 둠(기록은 늘리지 않음)
    if (!meta) { try { meta = await getJson("/api/stats/meta"); } catch { meta = { stations: [{ station_id: st.station, station_name: st.station }] }; } }
    if (!(meta.stations || []).some((s) => String(s.station_id) === String(st.station))) st.station = "108";
    load();
  }
  window.DateDay = { show, station: () => st.station, onStation: (id) => { st.station = id; go(); }, parseDate };
})();
