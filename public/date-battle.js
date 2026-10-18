// 날씨 이야기 › 날씨 배틀(#/stories/battle) v2. 날짜 2~4개(A■B▲C●D◆)를 같은 기간에서 '해마다 그날 실제 날씨'로 비교. 값·문장은 /api/stats/date-battle 그대로.
// 같은 날 평균 없음. (a) 해마다 결과(횟수·누가 더 — 동률 따로) (b) 앞뒤 15일 비교(31일 창) (c) 입력한 날짜의 시간별 실제 관측. 종합점수·전체 승자 없음.
(() => {
  const V = window.DViz;
  const { esc: E, fmt, sgn, fin } = V;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, "0");
  const kst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const THIS_YEAR = +kst().slice(0, 4);
  const IDS = ["A", "B", "C", "D"];
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const solarDim = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const isLeapY = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dot = (ymd) => (ymd ? `${+ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const md = (ymd) => (ymd ? `${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "–");
  const dow = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  const PERIODS = [["recent5", "최근 5년"], ["recent10", "최근 10년"], ["recent20", "최근 20년"], ["recent30", "최근 30년"], ["all", "전체"], ["custom", "직접 지정"]];
  const HM = { ta: ["기온", "℃", 1], rn: ["강수량", "mm", 1], ws: ["풍속", "m/s", 1], hm: ["습도", "%", 0] };
  // 예시: 연도 없이 월·일만 → 끝 기준연도(to)로
  const EXAMPLES = [["5월 5일 vs 10월 9일", [["S", 5, 5, 0], ["S", 10, 9, 0]]], ["양력 1월 1일 vs 음력 1월 1일", [["S", 1, 1, 0], ["L", 1, 1, 0]]], ["추석(음력 8/15) vs 개천절", [["L", 8, 15, 0], ["S", 10, 3, 0]]], ["봄·여름·가을·겨울 1일", [["S", 3, 1, 0], ["S", 6, 1, 0], ["S", 9, 1, 0], ["S", 12, 1, 0]]]];
  const st = { cases: [], diff: false, period: "recent10", to: THIS_YEAR - 1, from: THIS_YEAR - 10, hm: "ta", year: null, all: false };
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
  const dateOf = (c) => `${c.y}-${p2(c.m)}-${p2(c.d)}`;
  const caseText = (c) => (c.cal === "L" ? `음력 ${c.y}.${c.m}.${c.d}${c.leap ? "(윤)" : ""}` : `${c.y}.${c.m}.${c.d}`);
  const tag = (id) => `<span class="db-tag" style="background:${V.CASE[id].color}" aria-label="${id}">${V.CASE[id].shape} ${id}</span>`;
  const stationName = (id) => (meta?.stations || []).find((s) => String(s.station_id) === String(id))?.station_name || id;
  const nameOf = (id) => { const c = st.cases.find((x) => x.id === id); return c ? c.label || caseText(c) : id; };
  // 해마다 비교할 날(연도 없이) — 해마다 결과 문장용
  const dayName = (id) => { const c = st.cases.find((x) => x.id === id); if (!c) return id; return c.label || (c.cal === "L" ? `음력 ${c.m}/${c.d}${c.leap ? "(윤)" : ""}` : `${c.m}월 ${c.d}일`); };

  function parseDate(raw, cal) {
    const t = String(raw || "").trim();
    const m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t);
    if (!m) return { ok: false, message: "날짜를 2025-10-18 처럼 연-월-일로 넣어 주세요" };
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2050) return { ok: false, message: "연도는 1900~2050년 사이로 넣어 주세요" };
    if (mo < 1 || mo > 12) return { ok: false, message: "월은 1~12 사이입니다" };
    const max = cal === "L" ? 30 : solarDim(mo);
    if (d < 1 || d > max) return { ok: false, message: cal === "L" ? "음력 날짜는 1~30일입니다" : `${mo}월은 ${max}일까지입니다` };
    return { ok: true, y, m: mo, d };
  }
  // 주소: cases=A.108.S.5.5.0.2025 (7번째 = 연도). 예전 주소(연도 없음)는 끝 기준연도(to, 기본 작년)
  function readHash() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const labels = String(q.get("labels") || "").split(",").map((s) => { try { return decodeURIComponent(s).slice(0, 30); } catch { return ""; } });
    const def = (window.NWStation && NWStation.stored && NWStation.stored()) || "108";
    const to = Number(q.get("to"));
    st.to = Number.isInteger(to) && to >= 1971 && to <= THIS_YEAR ? to : THIS_YEAR - 1;
    const list = String(q.get("cases") || "").split(",").map((s) => s.split(".")).filter((p) => p.length >= 5 && IDS.includes(p[0]));
    st.cases = list.slice(0, 4).map((p, i) => { const y = Number(p[6]); return { id: IDS[i], station: p[1] || def, cal: p[2] === "L" ? "L" : "S", y: Number.isInteger(y) && y >= 1900 && y <= 2050 ? y : st.to, m: Math.min(12, Math.max(1, +p[3] || 1)), d: Math.max(1, +p[4] || 1), leap: p[2] === "L" && p[5] === "1", label: labels[i] || "" }; });
    for (const c of st.cases) c.d = Math.min(c.d, c.cal === "S" ? solarDim(c.m) : 30);
    if (st.cases.length === 0) st.cases = [{ id: "A", station: def, cal: "S", y: st.to, m: 5, d: 5, leap: false, label: "" }];
    if (st.cases.length === 1) { const a = st.cases[0]; st.cases.push(a.cal === "S" && a.m === 1 && a.d === 1 ? { id: "B", station: a.station, cal: "S", y: a.y, m: 5, d: 5, leap: false, label: "" } : { id: "B", station: a.station, cal: "S", y: a.y, m: 1, d: 1, leap: false, label: "" }); }
    st.diff = q.get("ds") === "1" || new Set(st.cases.map((c) => c.station)).size > 1;
    if (!st.diff) for (const c of st.cases) c.station = st.cases[0].station;
    st.period = PERIODS.some(([p]) => p === q.get("period")) ? q.get("period") : "recent10";
    const fr = Number(q.get("from"));
    st.from = Number.isInteger(fr) && fr >= 1900 && fr <= st.to ? fr : Math.max(1970, st.to - 9);
    if (HM[q.get("hm")]) st.hm = q.get("hm");
    const y = Number(q.get("year"));
    st.year = Number.isInteger(y) && y >= 1900 && y <= THIS_YEAR ? y : null;
  }
  const casesParam = () => st.cases.map((c) => `${c.id}.${c.station}.${c.cal}.${c.m}.${c.d}.${c.leap ? 1 : 0}.${c.y}`).join(",");
  function query(view = true) {
    const q = new URLSearchParams({ cases: casesParam(), period: st.period, to: String(st.to) });
    if (st.period === "custom") q.set("from", String(st.from));
    if (st.diff) q.set("ds", "1");
    if (st.cases.some((c) => c.label)) q.set("labels", st.cases.map((c) => encodeURIComponent(c.label || "")).join(","));
    if (view) { if (st.hm !== "ta") q.set("hm", st.hm); if (st.year) q.set("year", String(st.year)); }
    return q;
  }
  const hashOf = () => `#/stories/battle?${query()}`;
  const go = () => { const h = hashOf(); if (location.hash !== h) location.hash = h; else load(); };
  const replaceView = () => { const h = hashOf(); if (location.hash !== h) history.replaceState(history.state, "", h); };
  const api = (part, extra = {}) => { const q = query(false); q.delete("labels"); q.delete("ds"); q.set("part", part); for (const [k, v] of Object.entries(extra)) q.set(k, String(v)); return `/api/stats/date-battle?${q}`; };

  function shell() {
    const p = $("sbattle");
    if (p.dataset.ready === "2") return;
    p.dataset.ready = "2";
    p.innerHTML = `<div class="card ds-head"><h2 class="sx-q">날씨 배틀<small>날짜 2~4개를 넣으면, 같은 기간 해마다 그날 실제 날씨가 어땠는지 나란히 셉니다. 같은 날 평균·종합 승자는 만들지 않습니다.</small></h2>
        <div class="db-ex"><span class="muted">예시:</span>${EXAMPLES.map(([l], i) => `<button type="button" class="sec" data-ex="${i}">${E(l)}</button>`).join("")}</div>
        <div id="dbCases" class="db-cases"></div>
        <div class="sx-ctl" id="dbCtl"></div><p class="ds-banner" id="dbBanner" role="status"></p><div class="fav-row" id="dbFav"></div><p class="ds-toast" id="dbToast" role="status" hidden></p></div>
      <div class="card" id="dbChosen"></div><div class="card" id="dbYears" data-sec="yearly"></div><div class="card" id="dbAround" data-sec="around"></div><div class="card" id="dbHour" data-sec="hourly"></div>`;
    p.addEventListener("change", onChange);
    p.addEventListener("click", onClick);
    p.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.f === "date") { e.preventDefault(); applyDate(e.target, true); } });
    p.addEventListener("input", (e) => { const t = e.target; if (t.dataset.f === "label") { const c = st.cases.find((x) => x.id === t.dataset.c); c.label = t.value.slice(0, 30); replaceView(); } });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (document.body.dataset.page === "sbattle") { if (HB) renderHour(); if (YB) renderYearDetail(); } }, 200); });
  }
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const seg = (name, list, cur, extra = "") => `<div class="seg ds-seg" role="group">${list.map(([v, l]) => `<button type="button" data-${name}="${v}" ${extra} class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${E(l)}</button>`).join("")}</div>`;
  const PICK_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
  function renderCases() {
    const stations = (meta?.stations || []).map((s) => [s.station_id, `${s.station_name} (${s.station_id})`]);
    $("dbCases").innerHTML = st.cases.map((c) => {
      const pickVal = c.cal === "S" && !(c.m === 2 && c.d === 29 && !isLeapY(c.y)) ? dateOf(c) : "";
      return `<div class="db-case" style="--cc:${V.CASE[c.id].color}"><div class="db-case-h">${tag(c.id)}<input data-c="${c.id}" data-f="label" maxlength="30" placeholder="별칭(선택)" value="${E(c.label)}" aria-label="${c.id} 별칭">${st.cases.length > 2 ? `<button type="button" class="sec db-del" data-del="${c.id}" aria-label="${c.id} 빼기">×</button>` : ""}</div>
      <div class="db-case-b">${seg("cal", [["S", "양력"], ["L", "음력"]], c.cal, `data-c="${c.id}"`)}<span class="sx-inline ds-dateline db-dateline"><input data-c="${c.id}" data-f="date" class="ds-date" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="YYYY-MM-DD" value="${dateOf(c)}" aria-label="${c.id} ${c.cal === "L" ? "음력 " : ""}날짜(연-월-일)">${c.cal === "S" ? `<span class="ds-pick" title="달력에서 고르기">${PICK_SVG}<input type="date" data-c="${c.id}" data-f="pick" aria-label="${c.id} 달력에서 날짜 고르기" min="1900-01-01" max="2050-12-31" value="${pickVal}"></span>` : `<label class="sx-check ds-leapchk"><input type="checkbox" data-c="${c.id}" data-f="leap"${c.leap ? " checked" : ""}> 윤달</label>`}</span>
      ${st.diff ? `<select data-c="${c.id}" data-f="station" aria-label="${c.id} 관측지점">${opt(stations, c.station)}</select>` : ""}
      <a class="db-more" href="${dayHref(c)}">이 날짜 자세히 ›</a></div></div>`;
    }).join("") + (st.cases.length < 4 ? `<button type="button" class="sec db-add" id="dbAdd">+ 날짜 추가 (${st.cases.length}/4)</button>` : "");
    const toYears = []; for (let y = THIS_YEAR; y >= 1971; y--) toYears.push([y, `${y}년`]);
    renderFav();
    $("dbCtl").innerHTML = `<div class="ds-wide"><label title="모든 카드에 같은 기간을 씁니다(해마다 결과·앞뒤 15일). 날짜 칸의 연도는 강조·시간별 맞대결용">공통 기간</label>${seg("period", PERIODS, st.period)}</div>${st.period === "custom" ? `<div><label for="dbFrom">시작 기준연도</label><input id="dbFrom" type="number" class="sx-num" min="1900" max="${st.to}" value="${st.from}"></div>` : ""}<div><label for="dbTo">끝 기준연도</label><select id="dbTo">${opt(toYears, st.to)}</select></div>${st.diff ? "" : `<div><label for="dbSt">관측지점(공통)</label><select id="dbSt">${opt(stations, st.cases[0].station)}</select></div>`}<div><label class="sx-check"><input type="checkbox" id="dbDiff"${st.diff ? " checked" : ""}> 지점도 다르게</label></div><div class="ds-acts"><button type="button" class="sec" id="dbCardImg">카드 이미지</button><button type="button" class="sec" id="dbCopy">공유 링크 복사</button></div>`;
  }
  // ---- 자주 보는 배틀 조합(이 브라우저에만) — v2 는 카드마다 연도 포함(예전 저장은 끝 기준연도로 열림)
  const favKey = () => casesParam();
  function favLabel(x) { const ls = String(x.labels || "").split(",").map((v) => { try { return decodeURIComponent(v); } catch { return ""; } }); return x.cases.split(",").map((c, i) => { const p = c.split("."); const yy = p[6] ? `${p[6]}.` : ""; return ls[i] || (p[2] === "L" ? `음${yy}${p[3]}.${p[4]}${p[5] === "1" ? "윤" : ""}` : `${yy}${p[3]}.${p[4]}`); }).join(" vs ") + (x.ds ? " · 여러 지점" : ` · ${stationName(x.cases.split(".")[1])}`); }
  function favHref(x) { const q = new URLSearchParams({ cases: x.cases, period: st.period, to: String(st.to) }); if (st.period === "custom") q.set("from", String(st.from)); if (x.ds) q.set("ds", "1"); if (x.labels) q.set("labels", x.labels); return `#/stories/battle?${q}`; }
  function renderFav() {
    const el = $("dbFav");
    if (!el || !window.StoryFavs) return;
    const on = StoryFavs.has("battle", favKey());
    el.innerHTML = `<button type="button" class="sec fav-star${on ? " on" : ""}" id="dbFavBtn" aria-pressed="${on}" title="자주 보는 배틀 조합으로 이 브라우저에 저장">${on ? "★ 저장됨" : "☆ 이 조합 저장"}</button><span class="fav-list" aria-label="자주 보는 배틀 조합">${StoryFavs.chips("battle", { label: favLabel, href: favHref, current: favKey() })}</span>`;
  }
  function toast(msg) { const t = $("dbToast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000); }
  const labelsParam = () => (st.cases.some((c) => c.label) ? st.cases.map((c) => encodeURIComponent(c.label || "")).join(",") : "");
  function shareUrl() { const q = new URLSearchParams({ cases: casesParam(), period: st.period, to: String(st.to) }); if (st.period === "custom") q.set("from", String(st.from)); if (st.diff) q.set("ds", "1"); const l = labelsParam(); if (l) q.set("labels", l); return `${location.origin}/s/battle?${q}`; }
  function openCard() {
    if (!B || !window.StoryShare) { toast("자료를 다 불러온 뒤 카드를 만들 수 있습니다"); return; }
    StoryShare.module().then((m) => StoryShare.open({ spec: m.battleSpec(B, { labels: st.cases.map((c) => c.label) }), filename: `inal-battle-${casesParam().replace(/[.,]/g, "")}-${B.window.fromYear}-${B.window.toYear}`, shareUrl: shareUrl(), title: "날씨 배틀 카드" }));
  }
  async function copyLink() { const u = shareUrl(); try { await navigator.clipboard.writeText(u); toast("공유 링크를 복사했습니다 — 메신저 미리보기에 비교 숫자가 나옵니다"); } catch { prompt("이 주소를 복사하세요", u); } }
  // 이 날짜 자세히: 날짜 화면 v2 주소(date=연-월-일)
  function dayHref(c) {
    const q = new URLSearchParams({ station: c.station, cal: c.cal === "L" ? "lunar" : "solar", date: dateOf(c) });
    if (c.cal === "L") q.set("leap", c.leap ? "1" : "0");
    q.set("period", st.period);
    if (st.to !== THIS_YEAR - 1) q.set("to", String(st.to));
    if (st.period === "custom") q.set("from", String(st.from));
    if (c.label) q.set("alias", c.label);
    return `#/stories/day?${q}`;
  }
  function applyDate(el, focus) {
    const c = st.cases.find((x) => x.id === el.dataset.c);
    const r = parseDate(el.value, c.cal);
    if (!r.ok) { el.setAttribute("aria-invalid", "true"); toast(`${c.id}: ${r.message}`); if (focus) el.focus(); return; }
    el.removeAttribute("aria-invalid");
    if (r.y === c.y && r.m === c.m && r.d === c.d) return;
    Object.assign(c, { y: r.y, m: r.m, d: r.d });
    st.year = null;
    go();
  }
  function onChange(e) {
    const t = e.target;
    const c = t.dataset.c ? st.cases.find((x) => x.id === t.dataset.c) : null;
    if (c && t.dataset.f === "date") return applyDate(t, false);
    if (c && t.dataset.f === "pick") { if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return; const el = t.closest(".db-dateline").querySelector('[data-f="date"]'); el.value = t.value; return applyDate(el, true); }
    if (c && t.dataset.f === "leap") c.leap = t.checked;
    else if (c && t.dataset.f === "station") c.station = t.value;
    else if (c && t.dataset.f === "label") return;
    else if (t.id === "dbTo") { st.to = +t.value; if (st.from > st.to) st.from = st.to; }
    else if (t.id === "dbFrom") { const v = +t.value; if (!Number.isInteger(v) || v < 1900 || v > st.to) return; st.from = v; }
    else if (t.id === "dbSt") { for (const x of st.cases) x.station = t.value; if (window.NWStation) NWStation.manual(t.value); }
    else if (t.id === "dbDiff") { st.diff = t.checked; if (!st.diff) for (const x of st.cases) x.station = st.cases[0].station; }
    else return;
    st.year = null;
    go();
  }
  function onClick(e) {
    if (e.target.closest(".ds-pick")) { const pk = e.target.closest(".ds-pick").querySelector("input[type=date]"); try { pk.showPicker(); } catch { /* 투명 입력 위를 직접 누르면 열림 */ } return; }
    const b = e.target.closest("button,tr[data-year]");
    if (!b) return;
    const ds = b.dataset;
    const c = ds.c ? st.cases.find((x) => x.id === ds.c) : null;
    if (c && ds.cal) { if (c.cal === ds.cal) return; c.cal = ds.cal; c.leap = false; c.d = Math.min(c.d, c.cal === "S" ? solarDim(c.m) : 30); st.year = null; return go(); }
    if (ds.period) { st.period = ds.period; st.year = null; return go(); }
    if (ds.del) { st.cases = st.cases.filter((x) => x.id !== ds.del).map((x, i) => ({ ...x, id: IDS[i] })); st.year = null; return go(); }
    if (b.id === "dbAdd") { const a = st.cases[st.cases.length - 1]; st.cases.push({ id: IDS[st.cases.length], station: a.station, cal: "S", y: a.y, m: a.m === 12 ? 1 : a.m + 1, d: 1, leap: false, label: "" }); return go(); }
    if (ds.ex !== undefined) { const ex = EXAMPLES[+ds.ex][1]; const s0 = st.cases[0].station; st.cases = ex.map(([cal, m, d, l], i) => ({ id: IDS[i], station: s0, cal, y: st.to, m, d, leap: !!l, label: "" })); st.diff = false; st.year = null; return go(); }
    if (ds.hm) { st.hm = ds.hm; replaceView(); renderHour(); if (YB) renderYearDetail(); return; }
    if (b.id === "dbAll") { st.all = !st.all; return renderYears(); }
    if (ds.year) { st.year = +ds.year; replaceView(); renderYears(); return loadYear(); }
    if (b.id === "dbYearClose") { st.year = null; YB = null; replaceView(); return renderYears(); }
    if (b.id === "dbRetry") { cache.clear(); return load(); }
    if (b.id === "dbCardImg") return openCard();
    if (b.id === "dbCopy") return copyLink();
    if (b.id === "dbFavBtn") { const on = StoryFavs.toggle("battle", { key: favKey(), cases: casesParam(), labels: labelsParam(), ds: st.diff ? 1 : 0 }); toast(on ? "이 배틀 조합을 이 브라우저에 저장했습니다" : "저장을 지웠습니다"); return renderFav(); }
    if (ds.favdel) { StoryFavs.remove("battle", ds.favdel); return renderFav(); }
  }

  const SECS = ["dbChosen", "dbYears", "dbAround"];
  async function load() {
    const my = ++seq;
    B = null; HB = null; YB = null;
    renderCases();
    $("dbBanner").innerHTML = `<b>해마다 그날 실제 날씨를 셈</b> · ${E(PERIODS.find(([p]) => p === st.period)[1])}${st.period === "custom" ? ` ${st.from}~${st.to}` : ` · 끝 ${st.to}년`}`;
    for (const id of SECS) $(id).innerHTML = `<div class="sx-state">불러오는 중…</div>`;
    $("dbHour").innerHTML = `<div class="sx-state">시간자료 불러오는 중…</div>`;
    const hp = getJson(api("hourly"));
    hp.catch(() => {});
    try {
      const b = await getJson(api("summary"));
      if (my !== seq) return;
      B = b;
      renderBanner(); renderChosen(); renderYears(); renderAround();
      if (st.year) loadYear();
    } catch (e) {
      if (my !== seq) return;
      for (const id of SECS) $(id).innerHTML = `<div class="sx-state err">조회 실패 · ${E(e.message)} <button type="button" class="sec" id="dbRetry">다시 시도</button></div>`;
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
  const STATUS = (s) => B?.statusText?.[s] || HB?.statusText?.[s] || { partial: "자료 부족" }[s] || s;
  function renderBanner() {
    const dup = B.duplicates.length ? ` · <b class="db-dup">같은 조건입니다: ${B.duplicates.map((d) => d.join("·")).join(", ")} (지점·날짜·연도가 모두 같음)</b>` : "";
    $("dbBanner").innerHTML = `<b>해마다 그날 실제 날씨를 셈 · 서로 자료가 있는 같은 해만</b> · ${E(B.window.label)}${B.mixedCalendars ? " · 양력·음력 혼합: 각 달력의 같은 기준연도끼리" : ""}${B.differentStations ? " · 카드마다 다른 관측지점" : ""} <span class="muted">· 같은 날 평균·종합 승자 없음 · 일자료 1970~ / 시간자료 1990~</span>${dup}`;
  }
  // ---- 그날 한 칸(최고/최저 · 강수 · 바람)
  const tv = (v, d = 1) => (fin(v) ? fmt(v, d) : "–");
  function rainMark(x) {
    const v = x.values;
    if (!fin(v.rain)) return `<span class="muted">강수 자료 없음</span>`;
    let t = v.rain >= 0.1 ? `<b class="dy-wet">${fin(v.nsnow) && v.nsnow > 0 ? "❄" : "💧"} ${fmt(v.rain)}mm</b>` : `<span class="muted">강수 없음</span>`;
    if (fin(v.nsnow) && v.nsnow > 0) t += ` <b class="dy-snow">신적설 ${fmt(v.nsnow)}cm</b>`;
    return t;
  }
  const cellBody = (x) => (x.dateStatus !== "ok" ? `<span class="dy-st">${E(STATUS(x.dateStatus))}</span>` : !x.rowPresent ? `<span class="dy-st">자료 없음</span>` : `<span class="db-cv"><b class="dy-hi" title="최고기온">${tv(x.values.max)}°</b><span class="dy-sl">/</span><b class="dy-lo" title="최저기온">${tv(x.values.min)}°</b></span><small class="db-cr">${rainMark(x)}</small>`);
  // ---- ⓪ 입력한 날짜(카드마다 그해 그날)
  function renderChosen() {
    const per = B.window;
    $("dbChosen").innerHTML = `<h3 class="ds-h">입력한 날짜 <small>카드마다 그해 그날의 공식 일자료</small></h3><div class="db-chosen">${B.chosen.map((x) => {
      const c = st.cases.find((y) => y.id === x.case);
      const inPer = x.year >= per.fromYear && x.year <= per.toYear;
      const when = x.dateStatus === "nodate" ? `${x.year}년에는 없는 날짜` : x.solarDate ? `${dot(x.solarDate)}(${dow(x.solarDate)})${c?.cal === "L" && x.lunarText ? ` · ${E(x.lunarText)}` : ""}` : E(STATUS(x.dateStatus));
      const v = x.values;
      const body = x.dateStatus !== "ok" ? `<p class="dy-st">${E(STATUS(x.dateStatus))}</p>` : !x.rowPresent ? `<p class="dy-st">자료 없음</p>` : `<p class="db-chv"><b class="dy-hi">${tv(v.max)}°</b><span class="dy-sl">/</span><b class="dy-lo">${tv(v.min)}°</b> <small>평균 ${tv(v.avg)}℃</small></p><p>${rainMark(x)} <small class="muted">· 바람 ${tv(v.wind)}m/s${fin(v.gust) ? ` · 순간 ${tv(v.gust)}` : ""}${fin(v.hum) ? ` · 습도 ${tv(v.hum, 0)}%` : ""}</small></p>`;
      return `<div class="db-ch" style="--cc:${V.CASE[x.case].color}"><div class="db-ch-h">${tag(x.case)} <b>${E(c?.label || (c?.cal === "L" ? `음력 ${c.m}월 ${c.d}일${c.leap ? "(윤)" : ""}` : `${c?.m}월 ${c?.d}일`))}</b> <small class="muted">${x.year}년</small></div><p class="muted">${when}${B.differentStations ? ` · ${E(stationName(c?.station))}` : ""}${inPer ? "" : ` <em class="dy-tag">기간 밖</em>`}</p>${body}</div>`;
    }).join("")}</div>`;
  }
  // ---- ① 해마다 결과
  function renderYears() {
    if (!B) return;
    const per = `${B.window.fromYear}~${B.window.toYear}년`;
    const cnts = B.counts.filter((c) => c.show);
    const cntHtml = cnts.map((c) => `<div class="db-cnt"><div class="db-cnt-h"><b>${E(c.label)}</b><small>${c.n ? `공통 ${c.n}개 해 중${c.tier === "reference" ? " · 참고" : c.limited ? " · 자료 제한" : ""}` : "공통으로 자료가 있는 해 없음"}</small></div>${c.n ? c.results.map((r) => `<div class="db-cnt-r" title="${E(r.hitYears.join(" "))}">${tag(r.case)}<span class="db-cnt-bar"><i style="width:${(r.k / c.n) * 100}%;background:${V.CASE[r.case].color}"></i></span><b>${r.k}<small>번</small></b></div>`).join("") : ""}<small class="dy-cond">${E(c.cond)}</small></div>`).join("");
    const two = B.cases.length === 2;
    const tl = B.tallies.map((x) => {
      if (!x.n) return `<li><b>${E(x.word)}</b> <span class="muted">— 공통으로 자료가 있는 해 없음</span></li>`;
      const parts = x.results.map((r) => `${tag(r.case)}${two ? ` ${E(dayName(r.case))}` : ""} <b>${r.k}번</b>`);
      const tie = `같음 ${x.ties}번`;
      const none = x.none != null ? ` · 모두 강수 없음 ${x.none}번` : "";
      const lead = `${x.n}개 해 중 <b>${E(x.word)}</b>`;
      return `<li title="${E(x.def)}"><span class="db-tl-t">${lead}</span><span class="db-tl-v">${parts.join(" ")} · ${tie}${none}${x.tier === "reference" ? ` <span class="sx-badge est">참고</span>` : x.limited ? ` <span class="sx-badge est">자료 제한</span>` : ""}</span></li>`;
    }).join("");
    const rows = B.yearly.slice().reverse();
    const LIM = 10;
    const shown = st.all ? rows : rows.slice(0, LIM);
    $("dbYears").innerHTML = `<h3 class="ds-h">해마다 결과 <small>${E(per)} 해마다 각 카드 날짜 하루의 실제 관측 · 같은 날 평균을 내지 않습니다</small></h3>
      <div class="db-cnts">${cntHtml}</div>
      <h4 class="db-sub">해마다 누가 더? <small>소수 1자리로 같으면 '같음' · 한 카드라도 자료가 없는 해는 빼고 셈 · 종합 승자 없음</small></h4><ul class="db-tl">${tl}</ul>
      <div class="sx-table-wrap db-ytab"><table><thead><tr><th>기준연도</th>${B.cases.map((c) => `<th>${tag(c.id)} <small>최고/최저 · 강수</small></th>`).join("")}</tr></thead><tbody>${shown.map((r) => `<tr data-year="${r.referenceYear}" tabindex="0" class="${r.referenceYear === st.year ? "ds-tr-sel" : ""}"><td><button type="button" class="linkish" data-year="${r.referenceYear}">${r.referenceYear}</button></td>${r.cells.map((x) => { const mine = B.cases.find((c) => c.id === x.case)?.year === r.referenceYear; return `<td class="db-yc${mine ? " mine" : ""}"${mine ? ` title="입력한 해"` : ""}>${cellBody(x)}<small class="muted db-yd8">${x.solarDate ? md(x.solarDate) : ""}${mine ? " · 입력한 해" : ""}</small></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      ${rows.length > LIM ? `<button type="button" class="sec dy-all" id="dbAll">${st.all ? "접기" : `${rows.length}개 해 모두 보기`}</button>` : ""}
      <p class="ds-note">연도를 누르면 그해 카드별 실제 시간별 값을 봅니다 · 💧 강수 0.1mm 이상, ❄ 눈이 새로 쌓임 · 횟수 기준은 날짜로 보는 날씨와 같습니다(계절에 맞는 것만, 계절 밖이라도 한 번이라도 있었으면 보여 줌).</p>
      <div id="dbYearDetail"></div>
      <div class="sx-tools"><span class="muted">횟수·표·CSV 는 같은 서버 계산 결과입니다.</span><a class="dl-chip-btn" href="${api("summary")}&format=csv${labelsParam() ? `&labels=${labelsParam()}` : ""}" download>배틀 결과 CSV</a></div>`;
    if (st.year && YB && YB.year === st.year) renderYearDetail();
    else if (st.year) $("dbYearDetail").innerHTML = `<div class="sx-state">${st.year}년 시간별 값 불러오는 중…</div>`;
  }
  function renderYearDetail() {
    const el = $("dbYearDetail");
    if (!el || !YB) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const series = YB.cases.map((c) => ({ label: c.case, color: V.CASE[c.case].color, dash: V.CASE[c.case].dash, mark: V.CASE[c.case].shape + c.case, values: c.series[k], status: c.cellStatus[k] }));
    el.innerHTML = `<div class="db-yd"><h4>${YB.year}년(기준연도) 실제 시간별 ${label} <button type="button" class="sec" id="dbYearClose">닫기</button></h4><p class="ds-note">${YB.cases.map((c) => `${tag(c.case)} ${c.solarDate ? `${dot(c.solarDate)}${c.lunarDate && st.cases.find((x) => x.id === c.case)?.cal === "L" ? ` (음력 ${c.isLeapMonth ? "윤" : ""}${+c.lunarDate.slice(5, 7)}/${+c.lunarDate.slice(8, 10)})` : ""}` : E(STATUS(c.dateStatus))}${c.hourlyStatus !== "ok" && c.solarDate ? ` · 시간자료 ${E(STATUS(c.hourlyStatus))}` : ""}`).join(" · ")}</p><div class="sx-chart" id="dbYearChart"></div><p class="ds-note">아래 '시간별 맞대결'의 지표 선택(${label})을 따릅니다.</p></div>`;
    V.hourChart($("dbYearChart"), { unit, digits: dg, bar: k === "rn", mean: null, series, aria: `${YB.year}년 카드별 실제 ${label}`, tip: (h) => `<b>${k === "rn" ? `${h}~${h + 1}시` : `${h}시`}</b>${YB.cases.map((c) => `<br>${tag(c.case)} ${fin(c.series[k][h]) ? `<b>${fmt(c.series[k][h], dg)}${unit}</b>` : E(STATUS(c.hourlyStatus !== "ok" ? c.hourlyStatus : c.cellStatus[k][h]))}`).join("")}` });
  }
  // ---- ② 앞뒤 15일 비교
  const AROWS = [["avg", "평균기온", "mean"], ["max", "평균 최고기온", "mean"], ["min", "평균 최저기온", "mean"], ["rainDays", "강수일 비율", "ratio"], ["rainSum", "하루 평균 강수량", "perDay"], ["hot30", "최고 30℃ 이상인 날", "count", "hot30"], ["heat33", "최고 33℃ 이상인 날", "count", "heat33"], ["frost", "최저 영하인 날", "count", "frost"], ["ice", "하루 종일 영하인 날", "count", "ice"], ["snow", "눈이 새로 쌓인 날", "count", "snow"]];
  function renderAround() {
    const M = B.around.metrics;
    const per = `${B.window.fromYear}~${B.window.toYear}년`;
    const showRule = Object.fromEntries(B.counts.map((c) => [c.id, c.show]));
    const rows = AROWS.filter(([k, , , rule]) => !rule || showRule[rule] || M[k].results.some((r) => (r.total || 0) > 0));
    const val = (m, r, kind) => {
      if (!m.n || r.mean == null) return `<span class="muted">자료 부족</span>`;
      if (kind === "mean") return `<b>${fmt(r.mean)}℃</b>`;
      if (kind === "ratio") return `<b>${fmt(r.share, 0)}%</b><small>${r.total}/${r.validDays}일</small>`;
      if (kind === "perDay") return `<b>${fmt(r.perDay)}mm</b><small>31일 합 평균 ${fmt(r.mean)}mm</small>`;
      return `<b>${fmt(r.mean, 1)}일</b><small>모두 ${r.total}일</small>`;
    };
    const diffU = { mean: "℃", ratio: "%p", perDay: "mm", count: "일" };
    const dg = { mean: 1, ratio: 0, perDay: 1, count: 1 };
    const diffs = (m, kind) => (!m.n || m.n < 3 ? `<span class="muted">${m.n ? "참고" : "–"}</span>` : m.diffs.map((d) => `<span class="db-df">${tag(d.case)}−${d.vs} <b>${fin(d.value) ? `${sgn(d.value, dg[kind])}${diffU[kind]}` : "–"}</b></span>`).join(""));
    const tagT = (m) => (m.tier === "reference" ? ` <span class="sx-badge est">참고</span>` : m.limited ? ` <span class="sx-badge est">자료 제한</span>` : "");
    const ex = Object.entries(M.avg.excludedYears || {}).map(([y, rs]) => `${y}(${rs.map((x) => `${x.case} ${STATUS(x.reason)}`).join(", ")})`);
    // 입력한 해의 31일 창(카드마다 자기 해)
    const cw = B.chosen.map((x) => { const a = x.around; if (!a || !(a.status === "ok" || a.sofarEnd)) return `${tag(x.case)} ${x.year}년: ${E(STATUS(a ? a.status : x.dateStatus))}`; const g = (k) => a.metrics[k]; const av = g("avg"); const rd = g("rainDays"); return `${tag(x.case)} ${x.year}년 ${md(a.start)}~${md(a.sofarEnd || a.end)}${a.sofarEnd ? "(진행 중)" : ""}: 평균 ${av && av.obs ? `${fmt(av.raw)}℃` : "–"} · 강수일 ${rd && rd.obs ? `${fmt(rd.raw, 0)}/${rd.obs}일` : "–"}${(!a.sofarEnd && (av?.status !== "ok" || rd?.status !== "ok")) ? " (자료 부족)" : ""}`; });
    $("dbAround").innerHTML = `<h3 class="ds-h">앞뒤 15일 비교 <small>해마다 각 카드 날짜 앞뒤 15일(31일) · ${E(per)} · 하루가 아니라 '이 무렵'의 날씨</small></h3>
      <div class="da-wrap"><table class="da-tbl db-atbl"><thead><tr><th>지표</th>${B.cases.map((c) => `<th>${tag(c.id)}</th>`).join("")}<th>차이</th></tr></thead><tbody>
      ${rows.map(([k, label, kind]) => { const m = M[k]; return `<tr><th scope="row">${E(label)}${tagT(m)}<small>${m.n ? `공통 ${m.n}개 해` : ""}</small></th>${m.results.map((r) => `<td class="num">${val(m, r, kind)}</td>`).join("")}<td class="num db-dfs">${diffs(m, kind)}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="ds-note"><b>입력한 해의 31일</b>: ${cw.join(" · ")}</p>
      <p class="ds-note">해 수: 요청 ${M.avg.requested}개 · 모든 카드에 창이 있고 끝난 해 ${M.avg.eligible}개 · 쓴 해 ${M.avg.n}개(기온) / ${M.rainDays.n}개(강수)${ex.length ? ` · 뺀 해: ${E(ex.join(" / "))}` : ""}. 지표마다 모든 카드가 유효한 같은 해만 씁니다. 31일 중 자료 없는 날이 1일 이하인 해만 넣고(남은 날로만 집계, 채우지 않음), 2일 이상 빠지면 '자료 부족'으로 뺍니다. 강수일 비율 = 강수일(0.1mm 이상) ÷ 유효한 날, 하루 평균 강수량 = 강수량 합 ÷ 유효한 날(무강수 0 포함). 차이 = 각 카드 − A (기온 ℃, 강수일 비율 %p, 하루 강수량 mm, 일수는 해마다 평균의 차이). 공통 3개 해 미만이면 차이를 보이지 않습니다.</p>`;
  }
  // ---- ③ 시간별 맞대결(카드마다 입력한 날짜 하루의 실제 정시 관측, 평균 없음)
  function renderHour() {
    if (!HB) return;
    const k = st.hm;
    const [label, unit, dg] = HM[k];
    const C = HB.chosen;
    const series = C.map((x) => ({ label: x.case, color: V.CASE[x.case].color, dash: V.CASE[x.case].dash, mark: V.CASE[x.case].shape + x.case, values: x.series[k], status: x.cellStatus[k] }));
    const anyOk = C.some((x) => x.hourlyStatus === "ok");
    const hl = (h) => (k === "rn" ? `${h}~${h + 1}시` : `${h}시`);
    $("dbHour").innerHTML = `<h3 class="ds-h">시간별 맞대결 <small>카드마다 입력한 날짜 하루의 실제 정시 관측 · 평균 없음 · 시간자료(1990~)</small></h3><div class="ds-tools">${seg("hm", Object.entries(HM).map(([v, x]) => [v, x[0]]), k)}</div>
      ${anyOk ? `<div class="sx-chart" id="dbHourChart"></div>` : `<div class="sx-state">${E(C.map((x) => `${x.case} ${x.year}년: ${STATUS(x.hourlyStatus)}`).join(" · "))}</div>`}
      <div class="sx-legend">${C.map((x) => `<span style="color:${V.CASE[x.case].color}"><i style="background:${V.CASE[x.case].color}"></i>${V.CASE[x.case].shape} ${x.case} ${x.solarDate ? dot(x.solarDate) : x.year + "년"}${x.hourlyStatus !== "ok" ? ` — ${E(STATUS(x.hourlyStatus))}` : ""}</span>`).join("")}<span>선이 끊긴 곳 = 자료 없음(잇지 않음)</span><span>단위 ${unit}</span></div>${k === "rn" ? `<p class="ds-note">강수 막대 = h~h+1시 1시간 강수량(기상청 정시값 = 앞 1시간 누적), 카드별 묶음 막대.</p>` : ""}
      ${anyOk ? `<details class="sx-table"><summary>표로 보기 · ${label}</summary><div class="sx-table-wrap"><table><thead><tr><th>${k === "rn" ? "구간" : "시각"}</th>${C.map((x) => `<th>${tag(x.case)} ${unit}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: 24 }, (_, h) => `<tr><td>${hl(h)}</td>${C.map((x) => `<td class="num">${fin(x.series[k][h]) ? fmt(x.series[k][h], dg) : `<span class="muted">${E(STATUS(x.hourlyStatus !== "ok" ? x.hourlyStatus : x.cellStatus[k][h]))}</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>` : ""}`;
    if (!anyOk) return;
    V.hourChart($("dbHourChart"), { unit, digits: dg, bar: k === "rn", mean: null, series, aria: `${label} 카드별 입력한 날짜 실제 관측`, tip: (h) => `<b>${hl(h)}</b>${C.map((x) => `<br>${tag(x.case)} ${fin(x.series[k][h]) ? `<b>${fmt(x.series[k][h], dg)}${unit}</b>` : E(STATUS(x.hourlyStatus !== "ok" ? x.hourlyStatus : x.cellStatus[k][h]))}`).join("")}` });
  }
  async function show() {
    shell();
    readHash();
    if (!meta) { try { meta = await getJson("/api/stats/meta"); } catch { meta = { stations: [] }; } }
    load();
  }
  window.DateBattle = { show };
})();
