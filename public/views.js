// 시간별 날씨 · 일별 날씨: 레이아웃(기본 프리셋 + 내 레이아웃)으로 보여 줄 컬럼을 고르고 '그리드 | 카드' 로 본다.
// - 자료: /api/view (고른 레이아웃의 컬럼만, 페이지 단위). 보기 방식만 바꾸면 다시 받지 않고, 이미 받은 컬럼으로 되는 레이아웃도 다시 받지 않는다.
// - 기억: 로그인 = 내 계정(/api/view-prefs), 비로그인 = 이 브라우저(localStorage), 그리고 주소(#/hourly-weather?layout=&view=…).
// - 처음 고르는 레이아웃: 주소 > (이 화면에서 마지막에 고른 것 / 보기 설정의 ★ 기본 중 더 최근 것) > 기본 구성.
// 엄격한 CSP 대비: 외부 파일, 인라인 style·이벤트 속성 없음.
(function () {
  "use strict";
  const NW = () => window.NW;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ROUTE = { hourly: "/hourly-weather", daily: "/daily-weather" };
  const NAME = { hourly: "시간별 날씨", daily: "일별 날씨" };
  const P = {
    hourly: { st: "hStation", from: "hFrom", to: "hTo", bar: "hBar", msg: "hMsg", out: "hResult", pager: "hPager", prev: "hPrev", next: "hNext", info: "hPageInfo", query: "hQuery" },
    daily: { st: "dStation", from: "dFrom", to: "dTo", bar: "dBar", msg: "dMsg", out: "dResult", pager: "dPager", prev: "dPrev", next: "dNext", info: "dPageInfo", query: "dQuery" },
  };
  const PAGE_SIZE = 200;
  const LS = "nuni_weather_view_prefs";
  const DL_LS = "nuni_weather_export_layouts"; // 로그인 기능이 없는 서버(로컬 개발)의 레이아웃 저장 위치(보기 설정 화면과 같음)
  const ID_COLS = new Set(["observation_datetime", "observation_date", "station_id", "station_name"]);
  const REQUIRED = { hourly: ["observation_datetime", "station_id"], daily: ["observation_date", "station_id"] };
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const mk = () => ({ layout: null, view: null, page: 1, cache: null, note: "", seq: 0, fetches: 0, bound: false });
  const st = { hourly: mk(), daily: mk() };
  let fields = null;
  let mine = [];
  let prefs = { hourly: null, daily: null };

  const me = () => NW().me();
  const logged = () => Boolean(me().authEnabled && me().loggedIn && me().role !== "blocked");
  const localMode = () => !me().authEnabled;
  const readJson = (k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  };

  async function ensure() {
    if (!fields) {
      const r = await fetch("/api/export/fields");
      if (!r.ok) throw new Error(`컬럼 정보를 불러오지 못했습니다(HTTP ${r.status})`);
      fields = await r.json();
    }
    if (logged()) {
      const [l, p] = await Promise.all([
        fetch("/api/export/layouts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/view-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      mine = (l && l.layouts) || [];
      prefs = (p && p.prefs) || { hourly: null, daily: null };
    } else {
      mine = localMode() ? Object.values(readJson(DL_LS) || {}).filter((x) => x && x.id && Array.isArray(x.columns)) : [];
      prefs = { hourly: null, daily: null, ...(readJson(LS) || {}) };
    }
  }
  const presetsOf = (kind) => Object.values((fields && fields[kind] && fields[kind].presets) || {});
  const myOf = (kind) => mine.filter((l) => l.kind === kind);
  function resolve(kind, ref) {
    if (!ref || typeof ref !== "string") return null;
    const i = ref.indexOf(":");
    const t = ref.slice(0, i);
    const id = ref.slice(i + 1);
    if (t === "preset") {
      const p = fields[kind].presets[id];
      return p ? { ref, name: p.name, columns: p.columns, preset: true } : null;
    }
    if (t === "custom") {
      const l = myOf(kind).find((x) => x.id === id);
      return l ? { ref, name: l.name, columns: l.columns, isDefault: !!l.isDefault } : null;
    }
    return null;
  }
  const defaultRef = (kind) => {
    const id = `preset_${kind}_default`;
    return fields[kind].presets[id] ? `preset:${id}` : `preset:${presetsOf(kind)[0].id}`;
  };
  const time = (v) => {
    const n = Date.parse(v || "");
    return Number.isFinite(n) ? n : 0;
  };
  function pickInitial(kind, hp) {
    const s = st[kind];
    s.note = "";
    const urlRef = hp.get("layout");
    const pref = prefs[kind];
    const star = myOf(kind).find((l) => l.isDefault);
    // ★ 를 이 화면에서 마지막으로 고른 것보다 나중에 지정했으면 ★ 우선
    const saved = pref && pref.layout && resolve(kind, pref.layout) ? pref.layout : null;
    const starRef = star ? `custom:${star.id}` : null;
    const memory = saved && starRef ? (time(star.updatedAt) > time(pref.updatedAt) ? starRef : saved) : saved || starRef;
    s.layout = null;
    if (urlRef) {
      if (resolve(kind, urlRef)) s.layout = urlRef;
      else s.note = urlRef.startsWith("custom:") ? (logged() ? "주소에 있는 레이아웃은 내 레이아웃이 아니어서 다른 구성으로 보여 줍니다." : "주소에 있는 레이아웃은 만든 사람만 쓸 수 있어 기본 구성으로 보여 줍니다. 로그인하면 내 레이아웃을 쓸 수 있습니다.") : "주소의 레이아웃을 찾을 수 없어 다른 구성으로 보여 줍니다.";
    }
    if (!s.layout) s.layout = memory || defaultRef(kind);
    const v = hp.get("view");
    s.view = v === "grid" || v === "card" ? v : (pref && pref.view) || (window.innerWidth < 640 ? "card" : "grid");
    s.page = Math.max(1, parseInt(hp.get("page"), 10) || 1);
  }
  const hashParams = () => new URLSearchParams((location.hash.split("?")[1] || ""));
  function applyHashInputs(kind, hp) {
    const p = P[kind];
    const sid = hp.get("station");
    const has = (id) => id && [...$(p.st).options].some((o) => o.value === id);
    if (has(sid)) $(p.st).value = sid;
    else if (!$(p.st).dataset.touched) {
      // 주소에 지점이 없으면 기본 지점(저장한 선택 > 서울 108)
      const saved = window.NWStation && NWStation.stored();
      if (saved && has(saved.id)) $(p.st).value = saved.id;
      else if (has("108")) $(p.st).value = "108";
    }
    const okH = (v) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v || "");
    const okD = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
    for (const [k, id] of [["from", p.from], ["to", p.to]]) {
      const v = hp.get(k);
      if (kind === "hourly" ? okH(v) : okD(v)) $(id).value = kind === "hourly" ? v.slice(0, 16).replace(" ", "T") : v;
    }
  }
  const inputVal = (kind, id) => (kind === "hourly" ? NW().fromPicker($(id).value) : $(id).value);
  function syncUrl(kind) {
    const s = st[kind];
    const p = P[kind];
    const q = new URLSearchParams();
    if ($(p.st).value) q.set("station", $(p.st).value);
    const f = inputVal(kind, p.from);
    const t = inputVal(kind, p.to);
    if (f) q.set("from", kind === "hourly" ? f.slice(0, 16) : f);
    if (t) q.set("to", kind === "hourly" ? t.slice(0, 16) : t);
    q.set("layout", s.layout);
    q.set("view", s.view);
    if (s.page > 1) q.set("page", String(s.page));
    const h = `#${ROUTE[kind]}?${q.toString().replace(/\+/g, "%20")}`;
    if (location.hash !== h) history.replaceState(history.state, "", h);
  }
  async function persist(kind, patch) {
    if (logged()) {
      try {
        const r = await fetch("/api/view-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...patch }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.pref) prefs[kind] = d.pref;
      } catch {}
      return;
    }
    const all = readJson(LS) || {};
    all[kind] = { ...(all[kind] || {}), ...patch, updatedAt: new Date().toISOString() };
    prefs[kind] = all[kind];
    try {
      localStorage.setItem(LS, JSON.stringify(all));
    } catch {}
  }

  // ---------- 그리기
  function renderBar(kind) {
    const s = st[kind];
    const p = P[kind];
    const opt = (ref, label) => `<option value="${esc(ref)}"${ref === s.layout ? " selected" : ""}>${esc(label)}</option>`;
    const my = myOf(kind);
    const editHref = `#/view-settings?kind=${kind}&layout=${encodeURIComponent(s.layout)}`;
    const login = !logged() && !localMode();
    $(p.bar).innerHTML = `
      <div class="vw-bar">
        <label class="vw-lay"><span>레이아웃</span><select data-vw="layout" aria-label="${NAME[kind]} 레이아웃">
          <optgroup label="기본 프리셋">${presetsOf(kind).map((x) => opt(`preset:${x.id}`, x.name)).join("")}</optgroup>
          ${my.length ? `<optgroup label="내 레이아웃">${my.map((l) => opt(`custom:${l.id}`, `${l.isDefault ? "★ " : ""}${l.name}`)).join("")}</optgroup>` : ""}
        </select></label>
        <div class="vw-toggle" role="group" aria-label="보기 방식">
          <button type="button" data-vw="grid" aria-pressed="${s.view === "grid"}">그리드</button><button type="button" data-vw="card" aria-pressed="${s.view === "card"}">카드</button>
        </div>
        <a class="vw-edit" href="${esc(editHref)}">${login ? "레이아웃 보기" : "레이아웃 만들기·편집"} <span aria-hidden="true">›</span> <small>보기 설정</small></a>
      </div>
      <div class="vw-dlw" data-vw-dl hidden></div>
      ${s.note ? `<p class="vw-note warn">${esc(s.note)}</p>` : ""}
      ${login ? `<p class="vw-note">지금은 기본 프리셋만 고를 수 있습니다. <a href="${esc(NW().loginHref())}">카카오 로그인</a>하면 원하는 컬럼으로 내 레이아웃을 만들고, 고른 레이아웃·보기 방식이 내 계정에 저장됩니다.</p>` : ""}`;
  }
  function showCols(kind) {
    const s = st[kind];
    const lay = resolve(kind, s.layout) || resolve(kind, defaultRef(kind));
    const out = [];
    for (const c of REQUIRED[kind]) if (!lay.columns.includes(c)) out.push(c);
    for (const c of lay.columns) if (!out.includes(c)) out.push(c);
    return out;
  }
  const isNum = (m) => m && m.type !== "text" && !/time|date|dir|phenomena|name/.test(m.key);
  const stationName = (id) => {
    const x = (NW().stations() || []).find((s) => String(s.station_id) === String(id));
    return x ? x.station_name : "";
  };
  let unitOf = () => "";
  const shownUnit = (m) => (m.unit && m.unit !== "hhmi" && m.key !== "source_kind" ? m.unit : "");
  function fmtVal(key, v) {
    if (v === null || v === undefined || v === "") return null;
    if (key === "source_kind") return v === "OFFICIAL" ? "공식" : v === "DERIVED" ? "시간자료 집계" : String(v);
    if (key === "observation_datetime") return String(v).slice(0, 16);
    if (unitOf(key) === "hhmi" && /^\d{1,4}$/.test(String(v))) { const t = String(v).padStart(4, "0"); return `${t.slice(0, 2)}:${t.slice(2)}`; } // 기상청 hhmi(시분) → HH:MM
    return String(v);
  }
  const dayLabel = (d) => {
    const n = Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(n) ? `${String(d).slice(0, 10)} (${WD[new Date(n).getUTCDay()]})` : String(d);
  };
  // 내려받기(CSV): 지금 조회한 지점·기간 전체를 지금 레이아웃의 컬럼 순서로. 기존 /api/export 를 그대로 쓴다(상한 없음, 비로그인도 프리셋으로 가능).
  const DL_SLOW_ROWS = 100000;
  const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  function exportHref(kind, keys) {
    const d = st[kind].cache.d;
    const q = new URLSearchParams({ kind, stationId: d.stationId, from: d.from, to: d.to, columns: keys.join(",") });
    return `/api/export?${q}`;
  }
  function renderDl(kind, keys) {
    const box = $(P[kind].bar).querySelector("[data-vw-dl]");
    if (!box) return;
    const c = st[kind].cache;
    if (!c || !c.d.total) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const d = c.d;
    const n = d.total.toLocaleString("ko-KR");
    const span = `${d.from.slice(0, kind === "hourly" ? 16 : 10)} ~ ${d.to.slice(0, kind === "hourly" ? 16 : 10)}`;
    box.hidden = false;
    box.innerHTML = `<a class="vw-dl" href="${esc(exportHref(kind, keys))}" download data-rows="${d.total}">${DL_ICON}CSV 내려받기</a>
      <span class="vw-dl-note${d.total > DL_SLOW_ROWS ? " warn" : ""}">${esc(d.stationId)} 지점 · ${esc(span)} 전체 <b>${n}행</b> · 컬럼 ${keys.length}개(지금 레이아웃 순서)${d.pages > 1 ? ` · 화면은 ${PAGE_SIZE}행씩, 파일은 기간 전체` : ""}${d.total > DL_SLOW_ROWS ? " · 행이 많아 파일을 만드는 데 시간이 걸릴 수 있습니다" : ""} · 행 수 상한 없음</span>`;
  }
  function render(kind) {
    const s = st[kind];
    const p = P[kind];
    const c = s.cache;
    const out = $(p.out);
    out.setAttribute("aria-busy", "false");
    if (!c) return;
    const d = c.d;
    const keys = showCols(kind).filter((k) => c.meta.has(k));
    const lay = resolve(kind, s.layout);
    $(p.msg).textContent = `${d.from.slice(0, kind === "hourly" ? 16 : 10)} ~ ${d.to.slice(0, kind === "hourly" ? 16 : 10)} (KST) · 전체 ${d.total.toLocaleString("ko-KR")}건 · ${lay ? lay.name : ""} · ${s.view === "grid" ? "그리드" : "카드"}`;
    $(p.pager).hidden = d.pages <= 1;
    $(p.info).textContent = `${d.page} / ${d.pages}쪽`;
    $(p.prev).disabled = d.page <= 1;
    $(p.next).disabled = d.page >= d.pages;
    out.dataset.view = s.view;
    out.dataset.cols = keys.join(",");
    renderDl(kind, keys);
    if (!d.rows.length) {
      out.innerHTML = `<p class="vw-empty">이 지점·기간에 자료가 없습니다.</p>`;
      return;
    }
    const meta = (k) => c.meta.get(k) || { key: k, label: k, unit: "" };
    unitOf = (k) => meta(k).unit || "";
    const dash = '<span class="vw-null" title="값 없음(NULL)">—</span>';
    if (s.view === "grid") {
      const head = keys.map((k) => { const m = meta(k); return `<th scope="col"${isNum(m) ? ' class="n"' : ""}>${esc(m.label)}${shownUnit(m) ? ` <small>${esc(shownUnit(m))}</small>` : ""}</th>`; }).join("");
      const body = d.rows.map((r) => `<tr${r.source_kind === "DERIVED" ? ' class="vw-derived"' : ""}>${keys.map((k) => { const v = fmtVal(k, r[k]); return `<td${isNum(meta(k)) ? ' class="n"' : ""}>${v == null ? dash : esc(v)}</td>`; }).join("")}</tr>`).join("");
      out.innerHTML = `<div class="vw-grid-wrap"><table class="vw-grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      return;
    }
    const fieldKeys = keys.filter((k) => !ID_COLS.has(k));
    out.innerHTML = `<ul class="vw-cards">${d.rows.map((r) => {
      const t = kind === "hourly" ? `${dayLabel(r.observation_datetime)} ${String(r.observation_datetime).slice(11, 16)}` : dayLabel(r.observation_date);
      const sid = r.station_id;
      const name = r.station_name || stationName(sid);
      const tag = r.source_kind === "DERIVED" && !fieldKeys.includes("source_kind") ? '<span class="vw-tag" title="공식 일자료가 없어 시간자료로 집계한 값">시간자료 집계</span>' : "";
      return `<li class="vw-card"><div class="vw-card-h"><b>${esc(t)}</b><span class="vw-st">${esc(sid)} ${esc(name)}</span>${tag}</div><dl>${fieldKeys.map((k) => {
        const m = meta(k);
        const v = fmtVal(k, r[k]);
        return `<div><dt>${esc(m.label)}</dt><dd>${v == null ? dash : `${esc(v)}${shownUnit(m) ? `<small>${esc(shownUnit(m))}</small>` : ""}`}</dd></div>`;
      }).join("")}</dl></li>`;
    }).join("")}</ul>`;
  }

  // ---------- 자료
  async function load(kind) {
    const s = st[kind];
    const p = P[kind];
    const station = $(p.st).value;
    const from = inputVal(kind, p.from);
    const to = inputVal(kind, p.to);
    const q = `${station}|${from}|${to}|${s.page}`;
    const need = showCols(kind);
    if (s.cache && s.cache.q === q && need.every((k) => s.cache.meta.has(k))) return render(kind); // 이미 받은 컬럼으로 됨
    const seq = ++s.seq;
    $(p.out).setAttribute("aria-busy", "true");
    $(p.msg).textContent = "불러오는 중…";
    const sp = new URLSearchParams({ kind, stationId: station, page: String(s.page), pageSize: String(PAGE_SIZE), columns: need.join(",") });
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    let d;
    try {
      const r = await fetch(`/api/view?${sp}`);
      d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || `HTTP ${r.status}`);
    } catch (e) {
      if (seq !== s.seq) return;
      $(p.out).setAttribute("aria-busy", "false");
      $(p.msg).innerHTML = `<span class="bad">불러오지 못했습니다: ${esc(e.message)}</span>`;
      $(p.out).innerHTML = "";
      $(p.pager).hidden = true;
      s.cache = null;
      renderDl(kind, []);
      return;
    }
    if (seq !== s.seq) return;
    s.fetches += 1;
    if (d.page !== s.page) s.page = d.page;
    s.cache = { q: `${station}|${from}|${to}|${d.page}`, meta: new Map(d.columns.map((c) => [c.key, c])), d };
    if (d.pages < s.page) {
      s.page = d.pages;
      syncUrl(kind);
      return load(kind);
    }
    render(kind);
  }

  function bind(kind) {
    const s = st[kind];
    if (s.bound) return;
    s.bound = true;
    const p = P[kind];
    $(p.st).addEventListener("change", () => {
      $(p.st).dataset.touched = "1";
      if (window.NWStation) NWStation.manual($(p.st).value);
    });
    $(p.bar).addEventListener("change", (e) => {
      if (e.target.dataset.vw !== "layout") return;
      s.layout = e.target.value;
      s.note = "";
      syncUrl(kind);
      persist(kind, { layout: s.layout });
      renderBar(kind);
      load(kind);
    });
    $(p.bar).addEventListener("click", (e) => {
      const b = e.target.closest("button[data-vw]");
      if (!b || b.dataset.vw === s.view) return;
      s.view = b.dataset.vw;
      syncUrl(kind);
      persist(kind, { view: s.view });
      renderBar(kind);
      render(kind); // 다시 받지 않음
    });
    $(p.query).addEventListener("click", () => {
      s.page = 1;
      syncUrl(kind);
      load(kind);
    });
    $(p.prev).addEventListener("click", () => {
      s.page = Math.max(1, s.page - 1);
      syncUrl(kind);
      load(kind);
    });
    $(p.next).addEventListener("click", () => {
      s.page += 1;
      syncUrl(kind);
      load(kind);
    });
  }
  async function show(kind) {
    bind(kind);
    const p = P[kind];
    try {
      await ensure();
    } catch (e) {
      $(p.msg).innerHTML = `<span class="bad">${esc(e.message)}</span>`;
      return;
    }
    const hp = hashParams();
    applyHashInputs(kind, hp);
    pickInitial(kind, hp);
    renderBar(kind);
    syncUrl(kind);
    await load(kind);
  }
  window.Views = { show, ROUTE, _state: st };
})();
