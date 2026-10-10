/* 누니날씨 · 날씨 통계 탭(한눈에 보기의 질문 카드, 연도별 비교, 지역별 비교, 생활 속 날씨·날씨 기록 안내).
   계산은 모두 서버(/api/stats/*, stats-engine.mjs)에서 한다. 이 파일은 조건 고르기·그리기·주소 상태만 맡는다.
   그래프·표·CSV 는 같은 응답 값을 쓴다(그래프 점 = 응답 rows, 표 = 응답 table, CSV = 같은 주소 + format=csv). */
(function () {
  "use strict";
  const $id = (id) => document.getElementById(id);
  const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const COLORS = ["#026ef8", "#ea580c", "#16a34a", "#9333ea"];
  const num = (v, d = 1) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d }));
  const fv = (v, m) => (v === null || v === undefined ? "—" : `${num(v, m.digits === 0 ? 1 : m.digits)}${m.unit}`);
  const signed = (v, unit) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${num(Math.abs(v), 1)}${unit}`);
  const md = (ymd) => (ymd ? `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}` : "");
  const ymdDot = (ymd) => (ymd ? `${ymd.slice(0, 4)}.${+ymd.slice(5, 7)}.${+ymd.slice(8, 10)}` : "");
  const STATUS = { complete: "온전", partial: "자료 부족", none: "자료 없음", ongoing: "진행 중", future: "아직 없음", nodate: "그 해엔 없는 날짜" };
  const PERIOD_KINDS = [["year", "연 전체"], ["month", "월 전체"], ["week", "월 안의 날짜 구간"], ["season", "계절"], ["range", "직접 지정"]];
  const SEASON_IDS = ["spring", "summer", "autumn", "winter"];
  const TABS = ["overview", "yearly", "region", "life", "records"];
  const PANEL = { overview: "tabOverview", yearly: "tabYearly", region: "tabRegion", life: "tabLife", records: "tabRecords" };
  const SOURCE = "기상청 ASOS 공식 일자료";

  const state = {
    tab: "overview",
    station: null,
    metric: "avg_temp",
    period: null,
    from: 1990,
    to: null,
    mode: "trend",
    years: null,
    rStations: null,
    rView: "period",
  };
  let meta = null;
  let metaP = null;
  const reqs = { y: 0, r: 0, h: 0 };

  async function getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    let res;
    try {
      res = await fetch(url, { signal: ctl.signal });
    } catch (e) {
      throw new Error(e && e.name === "AbortError" ? "응답이 늦어 중단했습니다" : "서버에 연결하지 못했습니다");
    } finally {
      clearTimeout(timer);
    }
    let j = null;
    try {
      j = await res.json();
    } catch {
      /* 아래 */
    }
    if (!res.ok || !j || j.ok === false) throw new Error((j && j.message) || `HTTP ${res.status}`);
    return j;
  }
  function loadMeta() {
    if (meta) return Promise.resolve(meta);
    if (!metaP) metaP = getJson("/api/stats/meta").then((m) => (meta = m)).finally(() => (metaP = null));
    return metaP;
  }
  const metricOf = (id) => (meta ? meta.metrics.find((m) => m.id === id) : null) || null;
  const stationOf = (id) => (meta ? meta.stations.find((s) => String(s.station_id) === String(id)) : null);
  const stName = (id) => {
    const s = stationOf(id);
    return s ? `${s.station_name}(${s.station_id})` : String(id);
  };
  const stShort = (id) => {
    const s = stationOf(id);
    return s ? `${s.station_id} ${s.station_name}` : String(id);
  };
  const asOfYear = () => (meta && meta.asOf ? +meta.asOf.slice(0, 4) : new Date().getFullYear());
  function defaultPeriod() {
    if (!meta || !meta.asOf) return "month:5";
    const y = +meta.asOf.slice(0, 4);
    const m = +meta.asOf.slice(5, 7);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `month:${+meta.asOf.slice(8, 10) === last ? m : m === 1 ? 12 : m - 1}`;
  }

  // ------------------------------------------------------------ 주소 상태
  function hp() {
    return new URLSearchParams(location.hash.split("?")[1] || "");
  }
  function readHash(tab) {
    const q = hp();
    const known = (id) => !!stationOf(id);
    const st = q.get("station");
    if (st && known(st)) state.station = st;
    if (!state.station) state.station = (typeof dashState !== "undefined" && dashState.station && known(dashState.station) ? dashState.station : null) || (known("108") ? "108" : meta?.stations?.[0]?.station_id);
    const mt = q.get("metric");
    if (mt && metricOf(mt)) state.metric = mt;
    const pr = q.get("period");
    if (pr) state.period = pr;
    if (!state.period) state.period = defaultPeriod();
    const f = Number(q.get("from"));
    const t = Number(q.get("to"));
    if (Number.isInteger(f) && f >= 1900 && f <= asOfYear()) state.from = f;
    if (Number.isInteger(t) && t >= 1900 && t <= asOfYear()) state.to = t;
    if (!state.to) state.to = asOfYear();
    if (state.from > state.to) state.from = state.to;
    if (tab === "yearly") {
      state.mode = q.get("mode") === "overlay" ? "overlay" : "trend";
      const ys = (q.get("years") || "").split(",").map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= asOfYear());
      if (ys.length) state.years = [...new Set(ys)].slice(0, 4);
    }
    if (tab === "region") {
      const ids = (q.get("stations") || "").split(",").filter(known);
      if (ids.length) state.rStations = [...new Set(ids)].slice(0, 4);
      const v = q.get("view");
      if (["period", "monthly", "yearly"].includes(v)) state.rView = v;
    }
    if (!state.years) state.years = [asOfYear(), asOfYear() - 1];
    if (!state.rStations) {
      const other = state.station === "159" ? "108" : "159";
      state.rStations = [state.station, known(other) ? other : meta.stations.find((s) => s.station_id !== state.station)?.station_id].filter(Boolean);
    }
  }
  function yearlyQuery(extra = {}) {
    const q = new URLSearchParams({ station: state.station, metric: state.metric, period: state.period, from: String(state.from), to: String(state.to) });
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q;
  }
  function regionQuery() {
    const q = new URLSearchParams({ stations: state.rStations.join(","), view: state.rView, from: String(state.from), to: String(state.to) });
    if (state.rView !== "monthly") q.set("period", state.period);
    if (state.rView !== "period") q.set("metric", state.metric);
    return q;
  }
  function syncHash() {
    let want = null;
    if (state.tab === "yearly") {
      const q = yearlyQuery();
      if (state.mode === "overlay") {
        q.set("mode", "overlay");
        q.set("years", state.years.join(","));
      }
      want = `#/stats/yearly?${q}`;
    } else if (state.tab === "region") want = `#/stats/region?${regionQuery()}`;
    if (want && location.hash !== want) history.replaceState(null, "", want);
    updateTabLinks();
  }
  function updateTabLinks() {
    const st = state.station || (typeof dashState !== "undefined" ? dashState.station : null);
    document.querySelectorAll("#stTabs a[data-tab]").forEach((a) => {
      const t = a.dataset.tab;
      a.classList.toggle("on", t === state.tab);
      if (t === state.tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
      if (!st) return;
      if (t === "overview") a.href = `#/?station=${encodeURIComponent(st)}`;
      if (t === "yearly") a.href = `#/stats/yearly?${new URLSearchParams({ station: st, metric: state.metric, period: state.period || defaultPeriod(), from: String(state.from), to: String(state.to || asOfYear()) })}`;
      if (t === "life") a.href = `#/stats/life?${new URLSearchParams({ view: "cards", station: st })}`;
      if (t === "records") a.href = `#/stats/records?${new URLSearchParams({ view: "records", station: st })}`;
      if (t === "region" && state.rStations) a.href = `#/stats/region?${new URLSearchParams({ stations: state.rStations.join(","), view: state.rView })}`;
    });
  }

  // ------------------------------------------------------------ 공통 조건 고르기
  function parsePeriodKey(key) {
    const p = String(key || "").split(":");
    if (p[0] === "month") return { kind: "month", month: +p[1] || 5 };
    if (p[0] === "week") return { kind: "week", month: +p[1] || 5, week: +p[2] || 1 };
    if (p[0] === "season") return { kind: "season", season: SEASON_IDS.includes(p[1]) ? p[1] : "summer" };
    if (p[0] === "range") {
      const a = (p[1] || "04-25").split("-").map(Number);
      const b = (p[2] || "05-05").split("-").map(Number);
      return { kind: "range", sm: a[0] || 4, sd: a[1] || 25, em: b[0] || 5, ed: b[1] || 5 };
    }
    return { kind: "year" };
  }
  const p2 = (n) => String(n).padStart(2, "0");
  const dim = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; // 윤년 기준(2/29 고를 수 있게)
  function periodKeyOf(o) {
    if (o.kind === "month") return `month:${o.month}`;
    if (o.kind === "week") return `week:${o.month}:${o.week}`;
    if (o.kind === "season") return `season:${o.season}`;
    if (o.kind === "range") return `range:${p2(o.sm)}-${p2(Math.min(o.sd, dim(o.sm)))}:${p2(o.em)}-${p2(Math.min(o.ed, dim(o.em)))}`;
    return "year";
  }
  const opts = (list, cur) => list.map(([v, l]) => `<option value="${E(v)}"${String(v) === String(cur) ? " selected" : ""}>${E(l)}</option>`).join("");
  const MONTHS = Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}월`]);
  const dayList = (m) => Array.from({ length: dim(m) }, (_, i) => [i + 1, `${i + 1}일`]);
  function periodPickerHtml(prefix) {
    const o = parsePeriodKey(state.period);
    const kinds = opts(PERIOD_KINDS, o.kind);
    let extra = "";
    if (o.kind === "month" || o.kind === "week") extra += `<div><label for="${prefix}Pm">월</label><select id="${prefix}Pm" data-pk="month">${opts(MONTHS, o.month)}</select></div>`;
    if (o.kind === "week") {
      const last = dim(o.month);
      const wl = (meta?.weeks || []).map((w) => [w.week, `${w.week}주차 · ${o.month}/${w.from}~${o.month}/${w.week === 5 ? (o.month === 2 ? "29(윤년)" : last) : w.to}`]);
      extra += `<div><label for="${prefix}Pw">날짜 구간</label><select id="${prefix}Pw" data-pk="week">${opts(wl, o.week)}</select></div>`;
    }
    if (o.kind === "season") extra += `<div><label for="${prefix}Ps">계절</label><select id="${prefix}Ps" data-pk="season">${opts((meta?.seasons || []).map((s) => [s.id, `${s.label}(${s.months})`]), o.season)}</select></div>`;
    if (o.kind === "range") {
      extra += `<div><label>시작(월·일)</label><span class="sx-inline"><select data-pk="sm" aria-label="시작 월">${opts(MONTHS, o.sm)}</select><select data-pk="sd" aria-label="시작 일">${opts(dayList(o.sm), o.sd)}</select></span></div>
        <div><label>끝(월·일)</label><span class="sx-inline"><select data-pk="em" aria-label="끝 월">${opts(MONTHS, o.em)}</select><select data-pk="ed" aria-label="끝 일">${opts(dayList(o.em), o.ed)}</select></span></div>`;
    }
    return `<div><label for="${prefix}Pk">비교할 시기</label><select id="${prefix}Pk" data-pk="kind">${kinds}</select></div>${extra}`;
  }
  function readPeriodPicker(host) {
    const g = (k) => host.querySelector(`[data-pk="${k}"]`);
    const kind = g("kind").value;
    const prev = parsePeriodKey(state.period);
    const o = { kind };
    const val = (k, d) => (g(k) ? +g(k).value : d);
    o.month = val("month", prev.month || 5);
    o.week = val("week", prev.week || 1);
    o.season = g("season") ? g("season").value : prev.season || "summer";
    o.sm = val("sm", prev.sm || 4);
    o.sd = val("sd", prev.sd || 25);
    o.em = val("em", prev.em || 5);
    o.ed = val("ed", prev.ed || 5);
    return periodKeyOf(o);
  }
  function metricSelectHtml(id, cur) {
    const groups = [["temp", "기온"], ["rain", "강수"], ["days", "기온 조건을 넘은 날 수"], ["snow", "눈(적설 — 더하지 않음)"]];
    return `<select id="${id}">${groups
      .map(([g, label]) => `<optgroup label="${label}">${(meta?.metrics || []).filter((m) => m.group === g).map((m) => `<option value="${m.id}"${m.id === cur ? " selected" : ""}>${E(m.label)} (${E(m.unit)})</option>`).join("")}</optgroup>`)
      .join("")}</select>`;
  }
  function yearSelects(prefix) {
    const ys = [];
    for (let y = asOfYear(); y >= 1990; y--) ys.push([y, `${y}년`]);
    return `<div><label>비교 연도</label><span class="sx-inline"><select id="${prefix}From" aria-label="시작 연도">${opts(ys.slice().reverse(), state.from)}</select><span class="tilde">~</span><select id="${prefix}To" aria-label="종료 연도">${opts(ys, state.to)}</select></span></div>`;
  }
  function rulesHtml(m, extra = []) {
    const lines = [...(m ? [`${m.label}: ${m.def}`] : []), ...extra, ...(meta?.rules || [])];
    return `<details class="sx-rules"><summary>계산 기준</summary><ul>${lines.map((l) => `<li>${E(l)}</li>`).join("")}</ul></details>`;
  }
  function tableHtml(table, dimRow = () => false) {
    if (!table || !table.rows?.length) return "";
    const isNum = (v) => typeof v === "number";
    return `<details class="sx-table" open><summary>요약표 (${table.rows.length}행)</summary><div class="sx-table-wrap"><table><thead><tr>${table.columns.map((c) => `<th>${E(c.label)}</th>`).join("")}</tr></thead><tbody>${table.rows
      .map((r, i) => `<tr${dimRow(r, i) ? ' class="dim"' : ""}>${table.columns.map((c, ci) => `<td${isNum(r[c.key]) || ((r[c.key] === null || r[c.key] === "") && ci > 0) ? ' class="num"' : ""}>${r[c.key] === null || r[c.key] === undefined || r[c.key] === "" ? "—" : E(isNum(r[c.key]) ? r[c.key].toLocaleString("ko-KR", { maximumFractionDigits: 1, useGrouping: false }) : r[c.key])}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div></details>`;
  }
  const stateHtml = (msg, cls = "") => `<div class="sx-state ${cls}">${msg}</div>`;
  function errorHtml(msg, retryId) {
    return stateHtml(`불러오지 못했습니다: ${E(msg)} <button type="button" class="sec" id="${retryId}">다시 시도</button>`, "err");
  }

  // ------------------------------------------------------------ SVG 그래프(가로축 = 범주: 연도·월·월일)
  const charts = new Set();
  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }
  // cfg: { labels, type: line|bar, unit, series: [{ name, color, values }], shade: [{ i, label }], refs: [{ from, to, value, color, label }], tip(i), xLabel(i), aria }
  function chart(host, cfg) {
    host.__cfg = cfg;
    charts.add(host);
    if (window.ChartFull) {
      // 크게 보기: 같은 cfg 로 겹친 화면 크기에 맞춰 다시 그림(그림 확대 아님)
      const card = host.closest(".card");
      const h2 = card && card.querySelector("h2");
      const mainTitle = h2 ? [...h2.childNodes].filter((x) => x.nodeType === 3 || (x.tagName !== "SMALL" && !x.classList?.contains("sx-badge"))).map((x) => x.textContent).join("").trim() : "";
      const badges = h2 ? [...h2.querySelectorAll(".sx-badge")].map((b) => b.textContent).join(" · ") : "";
      const small = h2 && h2.querySelector("small");
      window.ChartFull.register(host, {
        hostClass: "sx-chart",
        title: () => {
          // 그래프 설명(aria)이 카드 제목을 이미 담고 있으면 남는 부분만 덧붙인다
          const extra = !cfg.aria ? "" : mainTitle && cfg.aria.includes(mainTitle) ? cfg.aria.replace(mainTitle, "").trim() : cfg.aria;
          return mainTitle ? `${mainTitle}${extra ? ` — ${extra}` : ""}` : extra || "그래프";
        },
        sub: () => [badges, small ? small.textContent.trim() : "", cfg.unit ? `단위 ${cfg.unit}` : ""].filter(Boolean).join(" · "),
        legend: () => {
          const lg = host.nextElementSibling;
          return lg && lg.classList.contains("sx-legend") ? lg.cloneNode(true) : null;
        },
        source: () => cfg.source || "자료: 기상청 ASOS · 시간대 Asia/Seoul",
        render: (el, size) => {
          el.__cfg = cfg;
          drawChart(el, { W: size.width, H: size.height, full: true });
        },
      });
    }
    drawChart(host);
  }
  function drawChart(host, opt = {}) {
    const cfg = host.__cfg;
    if (!cfg || !host.isConnected) {
      charts.delete(host);
      return;
    }
    const W = Math.round(opt.W || host.clientWidth);
    if (!W) return;
    if (!opt.full && host.__w === W && host.querySelector("svg")) return;
    host.__w = W;
    const narrow = W < 560;
    const H = opt.H ? Math.round(opt.H) : narrow ? 230 : 290;
    const n = cfg.labels.length;
    const ml = 50, mr = 12, mt = 16, mb = 32;
    const iw = W - ml - mr, ih = H - mt - mb;
    const all = [];
    cfg.series.forEach((s) => s.values.forEach((v) => v != null && all.push(v)));
    (cfg.refs || []).forEach((r) => all.push(r.value));
    let lo = all.length ? Math.min(...all) : 0;
    let hi = all.length ? Math.max(...all) : 1;
    if (cfg.type === "bar") {
      lo = Math.min(0, lo);
      hi = Math.max(hi, lo + 1);
    } else if (hi - lo < 1) {
      const c = (hi + lo) / 2;
      lo = c - 0.5;
      hi = c + 0.5;
    }
    const step = cfg.yStep ? cfg.yStep(hi - lo) : niceStep((hi - lo) / (narrow ? 4 : 5));
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    if (hi === lo) hi = lo + step;
    const Y = (v) => mt + ih - ((v - lo) / (hi - lo)) * ih;
    const bw = iw / Math.max(1, n);
    const X = (i) => ml + bw * (i + 0.5);
    const f = (v) => Math.round(v * 10) / 10;
    let g = "";
    for (const s of cfg.shade || []) {
      g += `<rect class="miss" x="${f(ml + bw * s.i)}" y="${mt}" width="${f(Math.max(1, bw))}" height="${ih}"/>`;
      if (s.label && bw >= 14) g += `<text class="miss-t" x="${f(X(s.i))}" y="${mt + 10}" text-anchor="middle">${E(s.label)}</text>`;
    }
    const dec = step < 1 ? 1 : 0;
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const y = f(Y(v));
      g += `<line class="grid" x1="${ml}" x2="${ml + iw}" y1="${y}" y2="${y}"/><text class="ax" x="${ml - 6}" y="${y + 4}" text-anchor="end">${cfg.yFmt ? E(cfg.yFmt(v)) : `${num(f(v), dec)}${E(cfg.unit)}`}</text>`;
    }
    const minGap = narrow ? 34 : 42;
    const stride = Math.max(1, Math.ceil(minGap / bw));
    for (let i = 0; i < n; i++) {
      if (i % stride && i !== n - 1) continue;
      if (i === n - 1 && i % stride && (i % stride) * bw < minGap * 0.8) continue;
      g += `<text class="ax" x="${f(X(i))}" y="${H - 10}" text-anchor="middle">${E(cfg.xLabel ? cfg.xLabel(i) : cfg.labels[i])}</text>`;
    }
    const k = cfg.series.length;
    if (cfg.type === "bar") {
      const gw = bw * (k > 1 ? 0.86 : 0.7);
      const w1 = gw / k;
      cfg.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          if (v == null) return;
          const y0 = Y(Math.max(lo, 0));
          const y1 = Y(v);
          g += `<rect x="${f(X(i) - gw / 2 + w1 * si)}" y="${f(Math.min(y0, y1))}" width="${f(Math.max(1, w1 - (k > 1 ? 0.5 : 0)))}" height="${f(Math.max(v === 0 ? 1 : 0.5, Math.abs(y0 - y1)))}" fill="${s.color}" opacity="${v === 0 ? 0.5 : 0.85}"/>`;
        });
      });
    }
    for (const r of cfg.refs || []) {
      const y = f(Y(r.value));
      g += `<line class="ref" stroke="${r.color}" x1="${f(ml + bw * r.from)}" x2="${f(ml + bw * (r.to + 1))}" y1="${y}" y2="${y}"/>`;
    }
    if (cfg.type === "line") {
      cfg.series.forEach((s) => {
        let path = "";
        let dots = "";
        s.values.forEach((v, i) => {
          if (v == null) return;
          const join = i > 0 && s.values[i - 1] != null;
          path += `${join ? "L" : "M"}${f(X(i))},${f(Y(v))}`;
          if (n <= 80 || !(join && s.values[i + 1] != null)) dots += `<circle cx="${f(X(i))}" cy="${f(Y(v))}" r="${n <= 40 ? 3 : 2.2}" fill="${s.color}"/>`;
        });
        g += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
      });
    }
    g += `<line class="hv" x1="0" x2="0" y1="${mt}" y2="${mt + ih}" visibility="hidden"/>`;
    const btn = !opt.full && window.ChartFull ? window.ChartFull.button() : "";
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${E(cfg.aria || "")}">${g}<rect x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent" data-hit="1"/></svg><div class="tip"></div>${btn}`;
    const svg = host.querySelector("svg");
    const tip = host.querySelector(".tip");
    const hv = svg.querySelector("line.hv");
    // 포인터 → 그래프 안 가로 위치. 돌린 '크게 보기' 화면에서도 맞게(ChartFull.frac)
    const fracOf = (ev) => (window.ChartFull ? window.ChartFull.frac(ev, host) : (ev.clientX - host.getBoundingClientRect().left) / host.clientWidth);
    const move = (ev) => {
      const box = { width: host.clientWidth };
      const x = fracOf(ev) * W;
      const i = Math.floor((x - ml) / bw);
      if (i < 0 || i >= n) return hide();
      const html = cfg.tip ? cfg.tip(i) : "";
      if (!html) return hide();
      hv.setAttribute("x1", f(X(i)));
      hv.setAttribute("x2", f(X(i)));
      hv.setAttribute("visibility", "visible");
      tip.innerHTML = html;
      tip.style.display = "block";
      const tw = tip.offsetWidth;
      const px = (X(i) / W) * box.width;
      let left = px + 12;
      if (left + tw > box.width) left = Math.max(0, px - tw - 12);
      tip.style.left = `${left}px`;
      tip.style.top = `8px`;
    };
    const hide = () => {
      tip.style.display = "none";
      hv.setAttribute("visibility", "hidden");
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    // 터치는 손을 떼면 pointerleave 가 바로 와서 툴팁이 사라진다 → 터치는 다음 탭까지 남겨 둔다
    svg.addEventListener("pointerleave", (ev) => ev.pointerType !== "touch" && hide());
  }
  let rsT = null;
  window.addEventListener("resize", () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => charts.forEach((h) => drawChart(h)), 120);
  });
  const legendHtml = (items) => `<div class="sx-legend">${items.map((x) => `<span><i class="${x.cls || ""}" style="${x.color ? `background:${x.color};color:${x.color}` : ""}"></i>${E(x.label)}</span>`).join("")}</div>`;

  // ------------------------------------------------------------ 한눈에 보기: 질문 카드
  async function loadCards() {
    const host = $id("qCards");
    if (!host) return;
    const st = (typeof dashState !== "undefined" && dashState.station) || state.station || "108";
    const my = ++reqs.h;
    host.innerHTML = stateHtml("질문 카드를 계산하는 중…");
    let r;
    let extra = [null, null, null];
    try {
      await loadMeta();
      const enc = encodeURIComponent(st);
      [r, ...extra] = await Promise.all([
        getJson(`/api/stats/highlights?station=${enc}`),
        getJson(`/api/stats/life/heat?station=${enc}`).catch(() => null),
        getJson(`/api/stats/life/weekend?station=${enc}`).catch(() => null),
        getJson(`/api/stats/records?station=${enc}`).catch(() => null),
      ]);
    } catch (e) {
      if (my !== reqs.h) return;
      host.innerHTML = errorHtml(e.message, "qRetry");
      $id("qRetry").onclick = loadCards;
      return;
    }
    if (my !== reqs.h) return;
    $id("qCardsNote").textContent = `${stName(st)} 관측값 · 1990~1999년 평균과 최근 완료된 10개 연도 평균의 차이 · 자료 ${r.asOf}까지`;
    const card = (c) => {
      const d = c.delta;
      const m = c.metricInfo;
      const href = `#/stats/yearly?${new URLSearchParams({ station: st, metric: c.metric, period: c.period, from: "1990", to: String(+r.asOf.slice(0, 4)) })}`;
      const val = d.available
        ? `<span class="v ${d.delta > 0 ? "up" : d.delta < 0 ? "down" : ""}">${signed(d.delta, m.unit)}</span><small>${E(c.periodLabel)} ${E(m.label)} · ${d.baseline.from}~${d.baseline.to}년 ${num(d.baseline.mean, 1)}${E(m.unit)} → ${d.recent.from}~${d.recent.to}년 ${num(d.recent.mean, 1)}${E(m.unit)}</small>`
        : `<span class="v na">비교할 자료가 부족합니다</span><small>${E(d.reason || "")}</small>`;
      return `<a class="q-card" href="${href}"><span class="q">${E(c.q)}</span>${val}<span class="go">연도별 비교에서 보기 ›</span></a>`;
    };
    const other = st === "159" ? "108" : "159";
    const regionHref = `#/stats/region?${new URLSearchParams({ stations: `${st},${other}`, view: "period", period: "season:summer" })}`;
    const [heat, wk, recs] = extra;
    const lq = (view) => `#/stats/life?${new URLSearchParams({ view, station: st })}`;
    const extraCards = [];
    if (heat) {
      const d = heat.firstDelta;
      extraCards.push(`<a class="q-card" href="${lq("heat")}"><span class="q">더위가 더 일찍 찾아올까?</span>${d.available ? `<span class="v ${d.delta < 0 ? "up" : ""}">${d.delta < 0 ? `${Math.abs(d.delta)}일 빨라짐` : d.delta > 0 ? `${d.delta}일 늦어짐` : "같음"}</span><small>첫 30℃ 이상 날 평균 ${d.baseline.from}~${d.baseline.to}년 ${posToMdC(d.baseline.mean)} → ${d.recent.from}~${d.recent.to}년 ${posToMdC(d.recent.mean)}</small>` : `<span class="v na">비교할 자료가 부족합니다</span><small>${E(d.reason || "")}</small>`}<span class="go">생활 속 날씨에서 보기 ›</span></a>`);
    }
    if (wk && wk.diff != null) extraCards.push(`<a class="q-card" href="${lq("weekend")}"><span class="q">정말 주말마다 비가 올까?</span><span class="v">${signed(wk.diff, "%p")}</span><small>주말 ${wk.weekend.share}% · 평일 ${wk.weekday.share}% (${wk.fromYear}~${wk.toYear}년, 유효 관측일 중 강수일 비율)</small><span class="go">생활 속 날씨에서 보기 ›</span></a>`);
    const top = recs?.lists?.find((l) => l.id === "max_high")?.items?.[0];
    if (top) extraCards.push(`<a class="q-card" href="#/stats/records?${new URLSearchParams({ view: "records", station: st })}"><span class="q">우리 동네 날씨 기록은?</span><span class="v up">${num(top.value, 1)}℃</span><small>보유 기간(${E(recs.from.slice(0, 4))}년~) 가장 높은 일최고기온 · ${ymdDot(top.date)}</small><span class="go">날씨 기록에서 보기 ›</span></a>`);
    host.innerHTML = r.cards.map(card).join("") + extraCards.join("") + `<a class="q-card" href="${regionHref}"><span class="q">다른 지역과 비교하면?</span><small>관측지점 2~4곳의 같은 시기 평균기온·강수량·강수일수와 1990년대 대비 변화를 나란히 봅니다.</small><span class="go">지역별 비교에서 보기 ›</span></a>`;
  }

  // ------------------------------------------------------------ 연도별 비교
  function yearlyShell() {
    const p = $id("tabYearly");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `<div class="card"><div class="sx-ctl" id="yxCtl"></div></div><div class="card" id="yxOut"></div>`;
    p.addEventListener("change", (e) => {
      const t = e.target;
      if (t.closest("#yxCtl")) onYearlyCtl(t);
    });
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode],button[data-rmyear],#yxAddYear");
      if (!b) return;
      if (b.dataset.mode) {
        state.mode = b.dataset.mode;
        renderYearlyCtl();
        loadYearly();
      } else if (b.dataset.rmyear) {
        state.years = state.years.filter((y) => y !== +b.dataset.rmyear);
        if (!state.years.length) state.years = [asOfYear()];
        renderYearlyCtl();
        loadYearly();
      } else if (b.id === "yxAddYear") {
        const y = +$id("yxYearPick").value;
        if (y && !state.years.includes(y) && state.years.length < 4) {
          state.years = [...state.years, y].sort((a, c) => a - c);
          renderYearlyCtl();
          loadYearly();
        }
      }
    });
  }
  function renderYearlyCtl() {
    const st = (meta.stations || []).map((s) => [s.station_id, `${s.station_id} ${s.station_name}${s.region ? ` · ${s.region}` : ""}`]);
    const yearsChips =
      state.mode === "overlay"
        ? `<div><label>겹쳐 볼 연도 (최대 4개)</label><span class="sx-yrs">${state.years
            .map((y, i) => `<span class="sx-yr" style="background:${COLORS[i % 4]}">${y}년<button type="button" data-rmyear="${y}" aria-label="${y}년 빼기">×</button></span>`)
            .join("")}${state.years.length < 4 ? `<select id="yxYearPick" aria-label="추가할 연도">${opts(Array.from({ length: asOfYear() - 1989 }, (_, i) => asOfYear() - i).filter((y) => !state.years.includes(y)).map((y) => [y, `${y}년`]), "")}</select><button type="button" class="sec sm-btn" id="yxAddYear">추가</button>` : ""}</span></div>`
        : yearSelects("yx");
    $id("yxCtl").innerHTML = `
      <div><label for="yxSt">관측지점</label><select id="yxSt">${opts(st, state.station)}</select></div>
      <div><label for="yxMetric">통계 항목</label>${metricSelectHtml("yxMetric", state.metric)}</div>
      ${periodPickerHtml("yx")}
      ${yearsChips}
      <div><label>보기</label><div class="seg"><button type="button" data-mode="trend" class="${state.mode === "trend" ? "on" : ""}">연도별 추이</button><button type="button" data-mode="overlay" class="${state.mode === "overlay" ? "on" : ""}">날짜별 겹쳐보기</button></div></div>`;
  }
  function onYearlyCtl(t) {
    if (t.id === "yxSt") state.station = t.value;
    else if (t.id === "yxMetric") state.metric = t.value;
    else if (t.id === "yxFrom" || t.id === "yxTo") {
      state.from = +$id("yxFrom").value;
      state.to = +$id("yxTo").value;
      if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
    } else if (t.id === "yxYearPick") return;
    else if (t.dataset.pk) state.period = readPeriodPicker($id("yxCtl"));
    renderYearlyCtl();
    loadYearly();
  }
  async function loadYearly() {
    syncHash();
    const out = $id("yxOut");
    const my = ++reqs.y;
    out.innerHTML = stateHtml("계산하는 중…");
    const overlayMode = state.mode === "overlay";
    const url = overlayMode ? `/api/stats/overlay?${yearlyQuery({ years: state.years.join(",") })}` : `/api/stats/yearly?${yearlyQuery()}`;
    let r;
    try {
      r = await getJson(url);
    } catch (e) {
      if (my !== reqs.y) return;
      out.innerHTML = errorHtml(e.message, "yxRetry");
      $id("yxRetry").onclick = loadYearly;
      return;
    }
    if (my !== reqs.y) return;
    if (overlayMode) renderOverlay(out, r, url);
    else renderYearly(out, r, url);
  }
  function renderYearly(out, r, url) {
    const m = r.metric;
    const s = r.summary;
    const d = r.delta;
    const isTemp = m.group === "temp";
    const hiW = isTemp ? "가장 높은 해" : "가장 많은 해";
    const loW = isTemp ? "가장 낮은 해" : "가장 적은 해";
    const ord = isTemp ? "높은 순" : "많은 순";
    const ext = m.agg === "max" || m.agg === "min";
    const rowBy = new Map(r.rows.map((x) => [x.year, x]));
    const obsSum = r.rows.filter((x) => x.status === "complete").reduce((a, x) => a + x.obs, 0);
    const q = `${stName(r.station.station_id)}의 ${r.period.label} ${m.label}, 해마다 어떻게 달라졌을까?`;
    const yrs = (list) => list.map((y) => `${y}년`).join(", ");
    const dateOf = (y) => (ext && rowBy.get(y)?.date ? ` (${md(rowBy.get(y).date)})` : "");
    const key = [];
    if (s.highest) key.push(`<div><span>${hiW}</span><b>${fv(s.highest.value, m)}</b><small>${E(yrs(s.highest.years.slice(0, 3)))}${s.highest.years.length > 3 ? ` 외 ${s.highest.years.length - 3}개` : ""}${s.highest.years.length === 1 ? dateOf(s.highest.years[0]) : ""}</small></div>`);
    if (s.lowest) key.push(`<div><span>${loW}</span><b>${fv(s.lowest.value, m)}</b><small>${E(yrs(s.lowest.years.slice(0, 3)))}${s.lowest.years.length > 3 ? ` 외 ${s.lowest.years.length - 3}개` : ""}${s.lowest.years.length === 1 ? dateOf(s.lowest.years[0]) : ""}</small></div>`);
    if (s.latest) key.push(`<div><span>최근 비교 가능한 해 · ${s.latest.year}년</span><b>${fv(s.latest.value, m)}</b><small>${s.latest.rank.of}개 연도 중 ${ord} ${s.latest.rank.high}위${s.latest.date ? ` · ${md(s.latest.date)}` : ""}</small></div>`);
    key.push(
      d.available
        ? `<div><span>1990년대 대비 변화</span><b class="${d.delta > 0 ? "up" : d.delta < 0 ? "down" : ""}">${signed(d.delta, m.unit)}${d.pct != null ? ` <small style="display:inline">(${d.pct > 0 ? "+" : d.pct < 0 ? "−" : "±"}${Math.abs(d.pct)}%)</small>` : ""}</b><small>${d.baseline.from}~${d.baseline.to}년 ${num(d.baseline.mean, 1)}${E(m.unit)} (${d.baseline.n}개 연도) → ${d.recent.from}~${d.recent.to}년 ${num(d.recent.mean, 1)}${E(m.unit)} (${d.recent.n}개 연도)</small></div>`
        : `<div><span>1990년대 대비 변화</span><b style="font-size:14px">비교하지 않음</b><small>${E(d.reason || "자료 부족")}</small></div>`,
    );
    key.push(`<div><span>계산에 쓴 자료</span><b>${s.completeYears}개 연도</b><small>${r.fromYear}~${r.toYear}년 중 · 관측일 ${num(obsSum, 0)}일 · 자료 ${E(r.asOf)}까지</small></div>`);
    const warn = [];
    if (s.incomplete.length) warn.push(`자료 부족으로 그래프·순위·평균에서 뺀 연도: ${s.incomplete.slice(0, 8).map((x) => `${x.year}년(관측 ${x.obs}/${x.days}일)`).join(", ")}${s.incomplete.length > 8 ? ` 외 ${s.incomplete.length - 8}개` : ""}`);
    const nod = r.rows.filter((x) => x.status === "nodate");
    if (nod.length) warn.push(`평년에는 이 날짜가 없어 ${nod.length}개 연도를 비교하지 않았습니다(2월 29일).`);
    const ong = r.ongoing;
    if (ong) {
      if (ong.complete && ong.rank) warn.push(`진행 중인 ${ong.year}년은 ${ymdDot(ong.start)}~${ymdDot(ong.end)}(${ong.days}일)만 집계해 ${fv(ong.value, m)}입니다. 같은 날짜까지의 다른 해 평균은 ${fv(ong.pastMean, m)}, ${ong.rank.of}개 연도 중 ${ord} ${ong.rank.high}위입니다. 이 값은 아래 그래프의 연도 값(구간 전체)과 다릅니다.`);
      else warn.push(`진행 중인 ${ong.year}년은 ${ymdDot(ong.end)}까지 자료가 ${ong.obs}/${ong.days}일이라 같은 날짜 비교를 하지 않습니다.`);
    }
    const ok = r.rows.filter((x) => x.status === "complete").length;
    const labels = r.rows.map((x) => String(x.year));
    const shade = [];
    r.rows.forEach((x, i) => {
      if (x.status === "partial" || x.status === "none") shade.push({ i, label: "부족" });
      if (x.status === "ongoing") shade.push({ i, label: "진행" });
    });
    const refs = [];
    if (d.available) {
      const idx = (y) => r.rows.findIndex((x) => x.year === y);
      const bi = [idx(d.baseline.from), idx(d.baseline.to)];
      const ri = [idx(d.recent.from), idx(d.recent.to)];
      if (bi[0] >= 0 && bi[1] >= 0) refs.push({ from: bi[0], to: bi[1], value: d.baseline.mean, color: "#64748b" });
      if (ri[0] >= 0 && ri[1] >= 0) refs.push({ from: ri[0], to: ri[1], value: d.recent.mean, color: "#c2410c" });
    }
    const tip = (i) => {
      const x = r.rows[i];
      if (!x || x.status === "nodate" || x.status === "future") return x ? `<b>${x.year}년</b><br>${E(STATUS[x.status])}` : "";
      const v = x.status === "complete" ? `${E(m.label)} <b>${fv(x.value, m)}</b>${x.date ? ` · ${md(x.date)}` : ""}` : x.status === "ongoing" ? `진행 중(${E(x.until)}까지) · 구간 전체 값 없음` : `<span>${E(STATUS[x.status])} — 값을 내지 않음</span>`;
      return `<b>${x.year}년</b> <span class="tip-sub">${ymdDot(x.start)}~${ymdDot(x.end)} · ${x.days}일</span><br>${v}<br><span class="tip-sub">관측 ${x.obs}/${x.days}일 · ${SOURCE}</span>`;
    };
    out.innerHTML = `
      <h2 class="sx-q">${E(q)}<small>${E(r.fromYear)}~${E(r.toYear)}년 · 해마다 같은 날짜 구간(${E(r.period.label)})을 집계 · ${E(m.def)}</small></h2>
      <div class="sx-key">${key.join("")}</div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>
      ${warn.map((w) => `<p class="sx-warn">${E(w)}</p>`).join("")}
      ${ok ? `<div class="sx-chart" id="yxChart"></div>${legendHtml([
        { label: `${m.label}(${m.unit}) · ${m.chart === "line" ? "선" : "막대"}`, color: COLORS[0], cls: m.chart === "bar" ? "bar" : "" },
        ...(refs.length ? [{ label: `${d.baseline.from}~${d.baseline.to}년 평균`, color: "#64748b", cls: "dash" }, { label: `${d.recent.from}~${d.recent.to}년 평균`, color: "#c2410c", cls: "dash" }] : []),
        ...(shade.length ? [{ label: "자료 부족·진행 중(값 없음)", cls: "box" }] : []),
      ])}` : stateHtml("이 조건에서 자료가 온전한 연도가 없어 그래프를 그리지 않습니다.")}
      <div class="sx-tools"><span class="muted">그래프·요약표·CSV 는 같은 계산 결과입니다.</span><a class="dl-chip-btn" href="${E(url)}&format=csv" download>통계 결과 CSV 내려받기</a></div>
      ${tableHtml(r.table, (row, i) => r.rows[i].status !== "complete")}
      <p class="muted">원자료(일자료·시간자료 전체)는 <a href="#/download">다운로드</a> 메뉴에서 받습니다. 출처: ${SOURCE}.</p>
      ${rulesHtml(m, [`1990년대 대비: ${BASE_TEXT()}`])}`;
    if (ok)
      chart($id("yxChart"), {
        labels,
        type: m.chart,
        unit: m.unit,
        series: [{ name: m.label, color: COLORS[0], values: r.rows.map((x) => (x.status === "complete" ? x.value : null)) }],
        shade,
        refs,
        tip,
        xLabel: (i) => (labels.length > 12 ? `'${labels[i].slice(2)}` : labels[i]),
        aria: `${q} 연도별 ${m.label} 그래프`,
      });
  }
  const BASE_TEXT = () => `1990~1999년 평균과, 구간이 끝난 마지막 해부터 거꾸로 10개 연도의 평균을 비교(각각 자료가 온전한 해 8개 이상일 때만)`;

  function renderOverlay(out, r, url) {
    const m = r.metric;
    const v = r.value;
    const q = `${stName(r.station.station_id)}의 ${r.period.label}, 해마다 날짜별로 어땠을까?`;
    const notes = r.series.filter((s) => s.status !== "complete").map((s) => `${s.year}년: ${s.status === "ongoing" ? `진행 중 — ${ymdDot(s.until)}까지` : s.status === "future" ? "아직 자료가 없는 기간" : s.status === "nodate" ? "그 해엔 없는 날짜" : `자료 부족(관측 ${s.obs}/${s.days}일)${v.cumulative ? " — 자료 없는 날 이후 누적은 끊김" : ""}`}`);
    const has = r.series.some((s) => s.values.some((x) => x != null));
    const labels = r.keys;
    const tip = (i) => {
      const lines = r.series.map((s, k) => `<span style="color:${COLORS[k % 4]}">●</span> ${s.year}년 <b>${s.values[i] == null ? "—" : `${num(s.values[i], 1)}${E(v.unit)}`}</b>`);
      return `<b>${md(`2000-${labels[i]}`)}</b> <span class="tip-sub">${E(v.label)}</span><br>${lines.join("<br>")}<br><span class="tip-sub">${SOURCE}</span>`;
    };
    const keyBoxes = r.series
      .map((s, k) => {
        const vals = s.values.filter((x) => x != null);
        const last = [...s.values].reverse().find((x) => x != null);
        const main = v.cumulative ? (last != null ? `${num(last, 1)}mm` : "—") : vals.length ? `${num(Math.max(...vals), 1)}℃ / ${num(Math.min(...vals), 1)}℃` : "—";
        return `<div><span style="color:${COLORS[k % 4]}">● ${s.year}년 ${v.cumulative ? "누적 강수량" : `${E(v.label)} 최고/최저`}</span><b>${main}</b><small>${s.start ? `${ymdDot(s.start)}~${ymdDot(s.until || s.end)}` : ""} · 관측 ${s.obs}/${s.days}일</small></div>`;
      })
      .join("");
    out.innerHTML = `
      <h2 class="sx-q">${E(q)}<small>가로축은 ${E(r.period.label)}의 월·일, 고른 연도의 ${E(v.label)}(${E(v.unit)})을 겹쳐 봅니다${v.cumulative ? " · 강수 지표는 기간 시작부터 쌓은 강수량" : ""}.</small></h2>
      <div class="sx-key">${keyBoxes}</div>
      ${notes.map((w) => `<p class="sx-warn">${E(w)}</p>`).join("")}
      ${has ? `<div class="sx-chart" id="yxChart"></div>${legendHtml(r.series.map((s, k) => ({ label: `${s.year}년`, color: COLORS[k % 4] })))}` : stateHtml("고른 연도에 표시할 자료가 없습니다.")}
      <div class="sx-tools"><span class="muted">겹쳐보기는 연도 집계값(${E(m.label)})이 아니라 하루하루의 ${E(v.label)}입니다.</span><a class="dl-chip-btn" href="${E(url)}&format=csv" download>통계 결과 CSV 내려받기</a></div>
      ${tableHtml(r.table)}
      ${rulesHtml(m, ["겹쳐보기: 2월 29일은 윤년에만 값이 있습니다. 자료 없는 날은 점이 없고, 누적 강수는 그날 이후 끊습니다."])}`;
    if (has)
      chart($id("yxChart"), {
        labels,
        type: "line",
        unit: v.unit,
        series: r.series.map((s, k) => ({ name: `${s.year}년`, color: COLORS[k % 4], values: s.values })),
        tip,
        xLabel: (i) => md(`2000-${labels[i]}`),
        aria: q,
      });
  }

  // ------------------------------------------------------------ 지역별 비교
  function regionShell() {
    const p = $id("tabRegion");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `<div class="card"><div class="sx-ctl" id="rxCtl"></div><p class="muted" id="rxHint"></p></div><div class="card" id="rxOut"></div>`;
    p.addEventListener("change", (e) => {
      const t = e.target;
      if (!t.closest("#rxCtl")) return;
      if (t.id === "rxMetric") state.metric = t.value;
      else if (t.id === "rxFrom" || t.id === "rxTo") {
        state.from = +$id("rxFrom").value;
        state.to = +$id("rxTo").value;
        if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      } else if (t.dataset.pk) state.period = readPeriodPicker($id("rxCtl"));
      renderRegionCtl();
      loadRegion();
    });
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-rst],button[data-rview]");
      if (!b) return;
      if (b.dataset.rview) state.rView = b.dataset.rview;
      else {
        const id = b.dataset.rst;
        const on = state.rStations.includes(id);
        if (on && state.rStations.length <= 2) {
          $id("rxHint").textContent = "지점은 2곳 이상 골라야 합니다.";
          return;
        }
        if (!on && state.rStations.length >= 4) {
          $id("rxHint").textContent = "지점은 최대 4곳까지 고를 수 있습니다. 먼저 하나를 빼 주세요.";
          return;
        }
        state.rStations = on ? state.rStations.filter((x) => x !== id) : [...state.rStations, id];
      }
      renderRegionCtl();
      loadRegion();
    });
  }
  function renderRegionCtl() {
    const chips = (meta.stations || [])
      .map((s) => {
        const i = state.rStations.indexOf(String(s.station_id));
        return `<button type="button" data-rst="${E(s.station_id)}" class="${i >= 0 ? "on" : ""}" aria-pressed="${i >= 0}"${i >= 0 ? ` style="background:${COLORS[i % 4]}"` : ""}>${E(s.station_id)} ${E(s.station_name)}<small>${E(s.region || "")}</small></button>`;
      })
      .join("");
    const views = [["period", "같은 기간 비교"], ["monthly", "월별 특성"], ["yearly", "연도별 변화"]];
    $id("rxCtl").innerHTML = `
      <div style="flex-basis:100%"><label>관측지점 (2~4곳)</label><div class="sx-st">${chips}</div></div>
      <div><label>보기</label><div class="seg">${views.map(([v, l]) => `<button type="button" data-rview="${v}" class="${state.rView === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${state.rView !== "period" ? `<div><label for="rxMetric">통계 항목</label>${metricSelectHtml("rxMetric", state.metric)}</div>` : ""}
      ${state.rView !== "monthly" ? periodPickerHtml("rx") : ""}
      ${yearSelects("rx")}`;
    $id("rxHint").textContent = "관측지점 한 곳의 값이며, 그 시·도 전체의 평균이 아닙니다. 지점끼리는 모두 자료가 온전한 공통 연도만 비교합니다.";
  }
  async function loadRegion() {
    syncHash();
    const out = $id("rxOut");
    const my = ++reqs.r;
    out.innerHTML = stateHtml("계산하는 중…");
    const url = `/api/stats/region?${regionQuery()}`;
    let r;
    try {
      r = await getJson(url);
    } catch (e) {
      if (my !== reqs.r) return;
      out.innerHTML = errorHtml(e.message, "rxRetry");
      $id("rxRetry").onclick = loadRegion;
      return;
    }
    if (my !== reqs.r) return;
    if (r.view === "period") renderRegionPeriod(out, r, url);
    else if (r.view === "monthly") renderRegionMonthly(out, r, url);
    else renderRegionYearly(out, r, url);
  }
  const colorOf = (r, id) => COLORS[r.stationsInfo.findIndex((s) => String(s.station_id) === String(id)) % 4];
  const yearsText = (ys) => (ys.length ? `${ys[0]}~${ys[ys.length - 1]}년 중 ${ys.length}개 연도` : "공통 연도 없음");
  function regionFoot(r, url, m) {
    return `<div class="sx-tools"><span class="muted">지점: ${r.stationsInfo.map((s) => `${E(s.station_name)}(${E(s.station_id)}${s.region ? `, ${E(s.region)}` : ""})`).join(" · ")}</span><a class="dl-chip-btn" href="${E(url)}&format=csv" download>통계 결과 CSV 내려받기</a></div>
      ${tableHtml(r.table)}
      ${rulesHtml(m, ["지역 비교: 모든 지점에 그 지표·기간 자료가 온전한 연도(공통 연도)만 써서 지점마다 같은 연도·같은 분모로 평균합니다. 공통이 아닌 연도는 그래프에서 비웁니다.", "관측지점 값은 그 지점 한 곳의 관측이며 시·도 평균이 아닙니다."])}`;
  }
  function renderRegionPeriod(out, r, url) {
    const ids = r.stationsInfo.map((s) => String(s.station_id));
    const q = `${r.period.label}, 지역마다 날씨는 얼마나 다를까?`;
    const byId = (x, id) => x.stations.find((s) => String(s.station_id) === id);
    const t = r.metrics.find((x) => x.metric.id === "avg_temp");
    const rain = r.metrics.find((x) => x.metric.id === "rain_total");
    const key = [];
    const best = (x, f, want) => {
      const list = x.stations.filter((s) => f(s) != null);
      if (!list.length) return null;
      const v = want === "max" ? Math.max(...list.map(f)) : Math.min(...list.map(f));
      return { v, ids: list.filter((s) => f(s) === v).map((s) => s.station_id) };
    };
    if (t && t.commonYears.length) {
      const h = best(t, (s) => s.mean, "max");
      const c = best(t, (s) => s.mean, "min");
      key.push(`<div><span>가장 따뜻한 곳(평균기온)</span><b>${E(h.ids.map(stShort).join(", "))}</b><small>${num(h.v, 1)}℃ · ${yearsText(t.commonYears)} 평균</small></div>`);
      key.push(`<div><span>가장 서늘한 곳(평균기온)</span><b>${E(c.ids.map(stShort).join(", "))}</b><small>${num(c.v, 1)}℃</small></div>`);
      const dd = best({ stations: t.stations }, (s) => (s.delta.available ? s.delta.delta : null), "max");
      if (dd) key.push(`<div><span>1990년대보다 가장 많이 오른 곳</span><b>${E(dd.ids.map(stShort).join(", "))}</b><small>평균기온 ${signed(dd.v, "℃")} (공통 연도 기준)</small></div>`);
      else key.push(`<div><span>1990년대 대비 변화</span><b style="font-size:14px">비교하지 않음</b><small>${E(t.stations[0].delta.reason || "자료 부족")}</small></div>`);
    }
    if (rain && rain.commonYears.length) {
      const w = best(rain, (s) => s.mean, "max");
      key.push(`<div><span>강수량이 가장 많은 곳</span><b>${E(w.ids.map(stShort).join(", "))}</b><small>평균 ${num(w.v, 1)}mm</small></div>`);
    }
    if (!key.length) key.push(`<div><span>결과</span><b style="font-size:14px">공통 연도가 없습니다</b><small>모든 지점에 자료가 온전한 연도가 없어 비교하지 않습니다.</small></div>`);
    const blocks = r.metrics
      .map((x) => {
        const m = x.metric;
        const vals = ids.map((id) => byId(x, id)?.mean).filter((v) => v != null);
        if (!x.commonYears.length || !vals.length) return `<div><p class="sx-bar-h">${E(m.label)} <small>공통 연도가 없어 비교하지 않음</small></p></div>`;
        const lo = Math.min(0, ...vals);
        const hi = Math.max(...vals, lo + 1e-9);
        return `<div><p class="sx-bar-h">${E(m.label)} (${E(m.unit)}) <small>${yearsText(x.commonYears)} 평균 · 오른쪽: 1990년대 대비</small></p>${ids
          .map((id) => {
            const s = byId(x, id);
            const w = s.mean == null ? 0 : ((s.mean - lo) / (hi - lo)) * 100;
            const dl = s.delta.available ? `<span class="d ${s.delta.delta > 0 ? "up" : s.delta.delta < 0 ? "down" : ""}">${signed(s.delta.delta, m.unit)}</span>` : `<span class="d" title="${E(s.delta.reason || "")}">변화 비교 안 함</span>`;
            return `<div class="sx-bar-row"><span>${E(stShort(id))}</span><span class="sx-bar-track"><i style="width:${Math.max(1, w).toFixed(1)}%;background:${colorOf(r, id)}"></i></span><b>${fv(s.mean, m)}</b>${dl}</div>`;
          })
          .join("")}</div>`;
      })
      .join("");
    out.innerHTML = `
      <h2 class="sx-q">${E(q)}<small>${E(r.fromYear)}~${E(r.toYear)}년 · 지표마다 모든 지점에 자료가 온전한 공통 연도의 평균 — 각 지점이 원래 얼마나 덥고 추운지(평균)와 1990년대 대비 변화를 따로 봅니다.</small></h2>
      <div class="sx-key">${key.join("")}</div>
      <div class="sx-bars" role="img" aria-label="${E(q)} 지점별 막대">${blocks}${window.ChartFull ? window.ChartFull.button() : ""}</div>
      ${regionFoot(r, url, null)}`;
    // 크게 보기: HTML 막대는 겹친 화면 폭에 맞춰 그대로 다시 배치(그림 확대 아님)
    const bars = out.querySelector(".sx-bars");
    if (window.ChartFull && bars) {
      window.ChartFull.register(bars, {
        hostClass: "cf-html",
        title: () => q,
        sub: () => `${r.fromYear}~${r.toYear}년 · 공통 연도 평균 · 오른쪽: 1990년대 대비`,
        legend: () => null,
        source: () => "자료: 기상청 ASOS 공식 일자료 · 시간대 Asia/Seoul",
        render: (el) => {
          el.textContent = "";
          el.appendChild(bars.cloneNode(true));
        },
      });
    }
  }
  function renderRegionMonthly(out, r, url) {
    const m = r.metric;
    const ids = r.stationsInfo.map((s) => String(s.station_id));
    const q = `지역마다 1년 동안 ${m.label}은 어떻게 다를까?`;
    const has = r.commonYears.length > 0;
    const series = ids.map((id) => ({ name: stShort(id), color: colorOf(r, id), values: r.months.map((mo) => mo.values.find((v) => String(v.station_id) === id)?.value ?? null) }));
    const key = has
      ? series
          .map((s) => {
            const vals = s.values.map((v, i) => [v, i + 1]).filter(([v]) => v != null);
            const hi = vals.reduce((a, b) => (b[0] > a[0] ? b : a));
            const lo = vals.reduce((a, b) => (b[0] < a[0] ? b : a));
            return `<div><span style="color:${s.color}">● ${E(s.name)}</span><b>${hi[1]}월 ${fv(hi[0], m)}</b><small>가장 ${m.group === "temp" ? "높은" : "많은"} 달 · 가장 ${m.group === "temp" ? "낮은" : "적은"} 달 ${lo[1]}월 ${fv(lo[0], m)}</small></div>`;
          })
          .join("")
      : "";
    out.innerHTML = `
      <h2 class="sx-q">${E(q)}<small>공통 연도 ${E(yearsText(r.commonYears))}(모든 지점·1~12월 자료가 온전한 해)의 월별 평균 · ${E(m.def)}</small></h2>
      ${has ? `<div class="sx-key">${key}</div><div class="sx-chart" id="rxChart"></div>${legendHtml(series.map((s) => ({ label: s.name, color: s.color, cls: m.chart === "bar" ? "bar" : "" })))}` : stateHtml("모든 지점의 자료가 온전한 공통 연도가 없어 비교하지 않습니다.")}
      ${regionFoot(r, url, m)}`;
    if (has)
      chart($id("rxChart"), {
        labels: r.months.map((mo) => `${mo.month}월`),
        type: m.chart,
        unit: m.unit,
        series,
        tip: (i) => `<b>${i + 1}월</b> <span class="tip-sub">${E(m.label)} · 공통 ${r.commonYears.length}개 연도 평균</span><br>${series.map((s) => `<span style="color:${s.color}">●</span> ${E(s.name)} <b>${fv(s.values[i], m)}</b>`).join("<br>")}<br><span class="tip-sub">${SOURCE}</span>`,
        aria: q,
      });
  }
  function renderRegionYearly(out, r, url) {
    const m = r.metric;
    const ids = r.stationsInfo.map((s) => String(s.station_id));
    const q = `${r.period.label} ${m.label}, 지역마다 해마다 어떻게 달라졌을까?`;
    const rows0 = r.stations[0].rows;
    const labels = rows0.map((x) => String(x.year));
    const series = r.stations.map((s) => ({ name: stShort(s.station_id), color: colorOf(r, s.station_id), values: s.rows.map((x) => x.value) }));
    const shade = rows0.map((x, i) => ({ i, x })).filter(({ x }) => !x.common && x.status !== "nodate").map(({ i }) => ({ i, label: "" }));
    const key = r.stations
      .map((s) => {
        const d = s.delta;
        return `<div><span style="color:${colorOf(r, s.station_id)}">● ${E(stShort(s.station_id))}</span><b>${fv(s.mean, m)}</b><small>공통 ${s.years}개 연도 평균 · 1990년대 대비 ${d.available ? signed(d.delta, m.unit) : "비교 안 함"}</small></div>`;
      })
      .join("");
    const has = r.commonYears.length > 0;
    const tip = (i) => {
      const x = rows0[i];
      const lines = r.stations.map((s) => `<span style="color:${colorOf(r, s.station_id)}">●</span> ${E(stShort(s.station_id))} <b>${s.rows[i].common ? fv(s.rows[i].value, m) : E(STATUS[s.rows[i].status] || "")}</b>${s.rows[i].date ? ` · ${md(s.rows[i].date)}` : ""}`);
      return `<b>${x.year}년</b> <span class="tip-sub">${x.start ? `${ymdDot(x.start)}~${ymdDot(x.end)} · ${x.days}일` : ""}</span><br>${lines.join("<br>")}<br><span class="tip-sub">${x.common ? "공통 연도" : "공통 연도 아님(값 숨김)"} · ${SOURCE}</span>`;
    };
    out.innerHTML = `
      <h2 class="sx-q">${E(q)}<small>공통 연도 ${E(yearsText(r.commonYears))}만 표시 · ${E(m.def)}</small></h2>
      <div class="sx-key">${key}</div>
      ${has ? `<div class="sx-chart" id="rxChart"></div>${legendHtml([...series.map((s) => ({ label: s.name, color: s.color, cls: m.chart === "bar" ? "bar" : "" })), ...(shade.length ? [{ label: "공통 연도 아님·진행 중(값 없음)", cls: "box" }] : [])])}` : stateHtml("모든 지점의 자료가 온전한 공통 연도가 없어 비교하지 않습니다.")}
      ${regionFoot(r, url, m)}`;
    if (has)
      chart($id("rxChart"), {
        labels,
        type: m.chart,
        unit: m.unit,
        series,
        shade,
        tip,
        xLabel: (i) => (labels.length > 12 ? `'${labels[i].slice(2)}` : labels[i]),
        aria: q,
      });
  }

  // ------------------------------------------------------------ 생활 속 날씨 · 날씨 기록 (2단계)
  const LIFE_VIEWS = [
    ["cards", "질문 모아 보기"],
    ["heat", "더위가 일찍 올까"],
    ["streaks", "비·맑음이 이어진 때"],
    ["weekend", "주말마다 비?"],
    ["outdoor", "산책·러닝", "시간자료"],
    ["commute", "출퇴근 비", "시간자료"],
    ["day", "기념일·생일"],
    ["tropical", "열대야", "추정"],
  ];
  const REC_VIEWS = [["records", "기록 순위"], ["day", "매년 같은 날"], ["date", "그날의 날씨"]];
  const PRESET_DAYS = [["01-01", "새해 첫날"], ["03-01", "삼일절"], ["05-05", "어린이날"], ["06-06", "현충일"], ["08-15", "광복절"], ["10-03", "개천절"], ["10-09", "한글날"], ["12-25", "성탄절"], ["02-29", "2/29"]];
  const life = { view: "cards", kind: "wet", md: "05-05", wperiod: "year", tperiod: "range:06-01:09-30", o: { tmin: 10, tmax: 25, dry: true, wind: 5, h1: 6, h2: 9, hum: null }, am: [7, 9], pm: [17, 19], weekdays: true };
  const rec = { view: "records", period: "all", date: null };
  const reqL = { n: 0 };
  const hoursOpts = Array.from({ length: 24 }, (_, h) => [h, `${h}시`]);
  const pct = (v) => (v === null || v === undefined ? "—" : `${num(v, 1)}%`);
  const stSelect = (id) => `<div><label for="${id}">관측지점</label><select id="${id}">${opts((meta.stations || []).map((s) => [s.station_id, `${s.station_id} ${s.station_name}${s.region ? ` · ${s.region}` : ""}`]), state.station)}</select></div>`;
  const subNav = (views, cur, hrefOf) => `<nav class="sx-sub" aria-label="세부 질문">${views.map(([v, l, b]) => `<a href="${hrefOf(v)}" class="${v === cur ? "on" : ""}"${v === cur ? ' aria-current="true"' : ""}>${E(l)}${b ? `<small>${E(b)}</small>` : ""}</a>`).join("")}</nav>`;
  const rulesList = (rules, extra = []) => `<details class="sx-rules"><summary>계산 기준</summary><ul>${[...(rules || []), ...extra].map((l) => `<li>${E(l)}</li>`).join("")}</ul></details>`;
  const DAILY_RULES = () => (meta?.rules || []).slice(0, 3);
  const HOURLY_NOTE = "자료: 기상청 ASOS 시간자료(정시 관측) — '시간자료 집계'이며 공식 일자료 통계와 다릅니다. 시각은 한국 시간(Asia/Seoul) 정시입니다.";
  const csvLink = (url) => `<div class="sx-tools"><span class="muted">그래프·요약표·CSV 는 같은 계산 결과입니다. 원자료는 <a href="#/download">다운로드</a> 메뉴.</span><a class="dl-chip-btn" href="${E(url)}${url.includes("?") ? "&" : "?"}format=csv" download>통계 결과 CSV 내려받기</a></div>`;
  function lifeQuery(extra = {}) {
    const q = new URLSearchParams({ station: state.station, from: String(state.from), to: String(state.to) });
    for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined) q.set(k, String(v));
    return q;
  }
  function lifeHref(view) {
    const q = lifeQuery({ view });
    return `#/stats/life?${q}`;
  }
  function recHref(view, extra = {}) {
    const q = new URLSearchParams({ view, station: state.station });
    if (rec.period !== "all") q.set("period", rec.period);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `#/stats/records?${q}`;
  }
  function readLifeHash() {
    const q = hp();
    const v = q.get("view");
    if (LIFE_VIEWS.some(([x]) => x === v)) life.view = v;
    if (["wet", "dry"].includes(q.get("kind"))) life.kind = q.get("kind");
    const md = q.get("date");
    if (md && /^\d{2}-\d{2}$/.test(md)) life.md = md;
    if (q.get("period")) {
      if (life.view === "weekend") life.wperiod = q.get("period");
      if (life.view === "tropical") life.tperiod = q.get("period");
    }
    for (const k of ["tmin", "tmax", "wind", "h1", "h2", "hum"]) {
      if (!q.has(k)) continue;
      const raw = q.get(k);
      life.o[k] = raw === "off" ? null : Number(raw);
    }
    if (q.has("dry")) life.o.dry = q.get("dry") !== "0";
    const hr = (s) => (/^\d{1,2}-\d{1,2}$/.test(s || "") ? s.split("-").map(Number) : null);
    if (hr(q.get("am"))) life.am = hr(q.get("am"));
    if (hr(q.get("pm"))) life.pm = hr(q.get("pm"));
    if (q.has("weekdays")) life.weekdays = q.get("weekdays") !== "0";
  }
  function lifeApi() {
    const v = life.view;
    if (v === "cards") return `/api/stats/highlights?station=${encodeURIComponent(state.station)}&set=life`;
    if (v === "heat") return `/api/stats/life/heat?${lifeQuery()}`;
    if (v === "streaks") return `/api/stats/life/streaks?${lifeQuery({ kind: life.kind })}`;
    if (v === "weekend") return `/api/stats/life/weekend?${lifeQuery({ period: life.wperiod })}`;
    if (v === "day") return `/api/stats/life/day?${lifeQuery({ date: life.md })}`;
    if (v === "tropical") return `/api/stats/life/tropical?${lifeQuery({ period: life.tperiod })}`;
    if (v === "outdoor") {
      const o = life.o;
      return `/api/stats/life/outdoor?${lifeQuery({ tmin: o.tmin, tmax: o.tmax, dry: o.dry ? 1 : 0, wind: o.wind === null ? "off" : o.wind, h1: o.h1, h2: o.h2, hum: o.hum === null ? "off" : o.hum })}`;
    }
    if (v === "commute") return `/api/stats/life/commute?${lifeQuery({ am: life.am.join("-"), pm: life.pm.join("-"), weekdays: life.weekdays ? 1 : 0 })}`;
    return null;
  }
  function syncLifeHash() {
    const api = lifeApi();
    const q = new URLSearchParams(api.split("?")[1] || "");
    q.delete("set");
    q.set("view", life.view);
    if (!q.has("from")) {
      q.set("from", String(state.from));
      q.set("to", String(state.to));
    }
    const want = `#/stats/life?${q}`;
    if (location.hash !== want) history.replaceState(null, "", want);
    updateTabLinks();
  }
  function lifeShell() {
    const p = $id("tabLife");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `<div class="card"><h2 class="sx-q">생활 속 날씨<small>주말·산책·러닝·출퇴근·기념일처럼 생활과 가까운 질문을 과거 관측으로 봅니다. 앞으로의 예보·확률이 아닙니다.</small></h2><div class="sx-ctl" id="lxCtl"></div><div id="lxNav"></div><div class="sx-ctl" id="lxCtl2" style="margin-top:10px"></div></div><div class="card" id="lxOut"></div>`;
    p.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "lxSt") state.station = t.value;
      else if (t.id === "lxFrom" || t.id === "lxTo") {
        state.from = +$id("lxFrom").value;
        state.to = +$id("lxTo").value;
        if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      } else if (t.dataset.pk) {
        const key = readPeriodPicker($id("lxCtl2"));
        if (life.view === "weekend") life.wperiod = key;
        else life.tperiod = key;
      } else if (t.dataset.o) {
        const k = t.dataset.o;
        if (k === "dry") life.o.dry = t.checked;
        else if (k === "windOn") life.o.wind = t.checked ? 5 : null;
        else if (k === "humOn") life.o.hum = t.checked ? 80 : null;
        else life.o[k] = t.value === "" ? null : Number(t.value);
      } else if (t.dataset.c) {
        const k = t.dataset.c;
        if (k === "weekdays") life.weekdays = t.checked;
        else {
          const [w, i] = k.split(".");
          life[w][+i] = +t.value;
          if (life[w][0] > life[w][1]) life[w] = [life[w][1], life[w][0]];
        }
      } else if (t.id === "lxM" || t.id === "lxD") {
        const m = +$id("lxM").value;
        const d = Math.min(+$id("lxD").value, dim(m));
        life.md = `${p2(m)}-${p2(d)}`;
      } else return;
      renderLifeCtl();
      loadLife();
    });
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-kind],button[data-md]");
      if (!b) return;
      if (b.dataset.kind) life.kind = b.dataset.kind;
      if (b.dataset.md) life.md = b.dataset.md;
      renderLifeCtl();
      loadLife();
    });
  }
  function mdPicker(cur, idM, idD) {
    const m = +cur.slice(0, 2);
    const d = +cur.slice(3, 5);
    return `<div><label>월·일</label><span class="sx-inline"><select id="${idM}" aria-label="월">${opts(MONTHS, m)}</select><select id="${idD}" aria-label="일">${opts(dayList(m), d)}</select></span></div>`;
  }
  function renderLifeCtl() {
    $id("lxCtl").innerHTML = `${stSelect("lxSt")}${yearSelects("lx")}`;
    $id("lxNav").innerHTML = subNav(LIFE_VIEWS, life.view, lifeHref);
    const v = life.view;
    let c2 = "";
    if (v === "streaks") c2 = `<div><label>무엇이 이어졌나</label><div class="seg"><button type="button" data-kind="wet" class="${life.kind === "wet" ? "on" : ""}">비(강수일)</button><button type="button" data-kind="dry" class="${life.kind === "dry" ? "on" : ""}">비 없는 날</button></div></div>`;
    if (v === "weekend" || v === "tropical") {
      const keep = state.period;
      state.period = v === "weekend" ? life.wperiod : life.tperiod;
      c2 = periodPickerHtml("lx");
      state.period = keep;
    }
    if (v === "day") c2 = `${mdPicker(life.md, "lxM", "lxD")}<div><label>바로 고르기</label><div class="sx-presets">${PRESET_DAYS.map(([md, l]) => `<button type="button" data-md="${md}">${E(l)}</button>`).join("")}</div></div>`;
    if (v === "outdoor") {
      const o = life.o;
      c2 = `<div><label>기온 범위(℃)</label><span class="sx-inline"><input class="sx-num" type="number" step="0.5" min="-30" max="45" data-o="tmin" value="${o.tmin}" aria-label="최저"><span class="tilde">~</span><input class="sx-num" type="number" step="0.5" min="-30" max="45" data-o="tmax" value="${o.tmax}" aria-label="최고"></span></div>
        <div><label>시간대(정시)</label><span class="sx-inline"><select data-o="h1" aria-label="시작 시각">${opts(hoursOpts, o.h1)}</select><span class="tilde">~</span><select data-o="h2" aria-label="끝 시각">${opts(hoursOpts, o.h2)}</select></span></div>
        <div><label>강수</label><label class="sx-check"><input type="checkbox" data-o="dry"${o.dry ? " checked" : ""}>비 없는 시각만</label></div>
        <div><label>바람</label><span class="sx-inline"><label class="sx-check"><input type="checkbox" data-o="windOn"${o.wind !== null ? " checked" : ""}>최대</label>${o.wind !== null ? `<input class="sx-num" type="number" step="0.5" min="0" max="30" data-o="wind" value="${o.wind}" aria-label="최대 풍속">m/s` : ""}</span></div>
        <div><label>습도(선택)</label><span class="sx-inline"><label class="sx-check"><input type="checkbox" data-o="humOn"${o.hum !== null ? " checked" : ""}>최대</label>${o.hum !== null ? `<input class="sx-num" type="number" step="5" min="0" max="100" data-o="hum" value="${o.hum}" aria-label="최대 습도">%` : ""}</span></div>`;
    }
    if (v === "commute") {
      const w = (k, label) => `<div><label>${label}</label><span class="sx-inline"><select data-c="${k}.0" aria-label="${label} 시작">${opts(hoursOpts, life[k][0])}</select><span class="tilde">~</span><select data-c="${k}.1" aria-label="${label} 끝">${opts(hoursOpts, life[k][1])}</select></span></div>`;
      c2 = `${w("am", "출근 시간대")}${w("pm", "퇴근 시간대")}<div><label>요일</label><label class="sx-check"><input type="checkbox" data-c="weekdays"${life.weekdays ? " checked" : ""}>평일(월~금)만</label></div>`;
    }
    $id("lxCtl2").innerHTML = c2;
    $id("lxCtl2").hidden = !c2;
  }
  async function loadLife() {
    syncLifeHash();
    const out = $id("lxOut");
    const my = ++reqL.n;
    const hourly = ["outdoor", "commute", "tropical"].includes(life.view);
    out.innerHTML = stateHtml(hourly ? "시간자료로 계산하는 중… (서버가 막 켜진 직후에는 처음 한 번 10초쯤 걸릴 수 있습니다)" : "계산하는 중…");
    const url = lifeApi();
    let r;
    try {
      r = await getJson(url);
    } catch (e) {
      if (my !== reqL.n) return;
      out.innerHTML = errorHtml(e.message, "lxRetry");
      $id("lxRetry").onclick = loadLife;
      return;
    }
    if (my !== reqL.n) return;
    const fn = { cards: lifeCards, heat: lifeHeatView, streaks: lifeStreaksView, weekend: lifeWeekendView, day: dayView, outdoor: outdoorView, commute: commuteView, tropical: tropicalView }[life.view];
    fn(out, r, url, "lx");
  }
  const yrShade = (rows) => rows.map((x, i) => ({ x, i })).filter(({ x }) => ["partial", "none", "ongoing"].includes(x.status)).map(({ x, i }) => ({ i, label: x.status === "ongoing" ? "진행" : "부족" }));
  const incWarn = (list) => (list && list.length ? `<p class="sx-warn">${E(`자료 부족으로 값·순위에서 뺀 연도: ${list.slice(0, 8).map((x) => `${x.year}년(${x.obs}/${x.days}일)`).join(", ")}${list.length > 8 ? ` 외 ${list.length - 8}개` : ""}`)}</p>` : "");
  const yrLabel = (labels) => (i) => (labels.length > 12 ? `'${labels[i].slice(2)}` : labels[i]);
  const signedPlain = (v, unit) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${num(Math.abs(v), 1)}${unit}`);

  function lifeCards(out, r) {
    const st = state.station;
    const card = (c) => {
      const d = c.delta;
      const m = c.metricInfo;
      const href = `#/stats/yearly?${new URLSearchParams({ station: st, metric: c.metric, period: c.period, from: "1990", to: String(asOfYear()) })}`;
      const val = d.available
        ? `<span class="v ${d.delta > 0 ? "up" : d.delta < 0 ? "down" : ""}">${signed(d.delta, m.unit)}</span><small>${E(c.periodLabel)} · ${d.baseline.from}~${d.baseline.to}년 ${num(d.baseline.mean, 1)}${E(m.unit)} → ${d.recent.from}~${d.recent.to}년 ${num(d.recent.mean, 1)}${E(m.unit)}</small>`
        : `<span class="v na">비교할 자료가 부족합니다</span><small>${E(d.reason || "")}</small>`;
      return `<a class="q-card" href="${href}"><span class="q">${E(c.q)}</span>${val}<span class="go">연도별 비교에서 보기 ›</span></a>`;
    };
    const more = LIFE_VIEWS.filter(([v]) => v !== "cards").map(([v, l, b]) => `<a class="q-card" href="${lifeHref(v)}"><span class="q">${E(l)}${b ? ` <span class="sx-badge${b === "추정" ? " est" : ""}">${E(b)}</span>` : ""}</span><small>${E({ heat: "매년 처음·마지막으로 최고기온 30℃ 이상이었던 날과 그 일수", streaks: "강수일·무강수일이 가장 오래 이어진 기록(결측일에서 끊음)", weekend: "주말과 평일의 '유효 관측일 중 강수일 비율'", outdoor: "직접 정한 기온·강수·바람·시간대 조건을 만족한 시각 비율(월별)", commute: "출근·퇴근 시간대 정시 관측 중 강수가 관측된 비율", day: "어린이날·생일 등 매년 같은 날의 기온·강수와 강수가 있었던 해의 비율", tropical: "정시 기온으로 센 열대야 추정치(공식 값 아님)" }[v])}</small><span class="go">보기 ›</span></a>`).join("");
    out.innerHTML = `<h2 class="sx-q">${E(stName(st))} · 생활 속 질문<small>숫자는 1990~1999년 평균과 최근 완료된 10개 연도 평균의 차이(공식 일자료) · 자료 ${E(r.asOf)}까지</small></h2>
      <div class="q-cards">${r.cards.map(card).join("")}</div>
      <h3 style="margin:18px 0 0;font-size:15px">더 자세한 생활 통계</h3><div class="q-cards">${more}</div>
      ${rulesList(DAILY_RULES(), ["눈 통계는 공식 일자료의 최심신적설·최심적설만 쓰고 적설을 더해 강설량을 만들지 않습니다(관측 방식 변화로 연도 간 비교에 한계가 있을 수 있음)."])}`;
  }

  function lifeHeatView(out, r, url) {
    const rows = r.rows;
    const labels = rows.map((x) => String(x.year));
    const ok = (x) => x.status === "complete";
    const fd = r.firstDelta;
    const s = r.summary;
    const shiftTxt = (d) => (d.available ? (d.delta < 0 ? `${Math.abs(d.delta)}일 빨라짐` : d.delta > 0 ? `${d.delta}일 늦어짐` : "같음") : "비교 안 함");
    const key = [
      `<div><span>첫 30℃ 이상 날(평균)</span><b class="${fd.available && fd.delta < 0 ? "up" : ""}">${E(shiftTxt(fd))}</b><small>${fd.available ? `${fd.baseline.from}~${fd.baseline.to}년 ${posToMdC(fd.baseline.mean)} → ${fd.recent.from}~${fd.recent.to}년 ${posToMdC(fd.recent.mean)}` : E(fd.reason || "")}</small></div>`,
      `<div><span>마지막 30℃ 이상 날(평균)</span><b>${E(shiftTxt(r.lastDelta))}</b><small>${r.lastDelta.available ? `${posToMdC(r.lastDelta.baseline.mean)} → ${posToMdC(r.lastDelta.recent.mean)}` : E(r.lastDelta.reason || "")}</small></div>`,
      `<div><span>30℃ 이상인 날 수(평균)</span><b class="${r.countDelta.available && r.countDelta.delta > 0 ? "up" : ""}">${r.countDelta.available ? signedPlain(r.countDelta.delta, "일") : "비교 안 함"}</b><small>${r.countDelta.available ? `${num(r.countDelta.baseline.mean, 1)}일 → ${num(r.countDelta.recent.mean, 1)}일` : E(r.countDelta.reason || "")}</small></div>`,
      s.earliest ? `<div><span>가장 일찍 온 해</span><b>${s.earliest.year}년 ${md(s.earliest.first)}</b><small>온전한 ${s.completeYears}개 연도 중</small></div>` : "",
      r.ongoing && r.ongoing.first ? `<div><span>올해(${r.ongoing.year}년, 진행 중)</span><b>${md(r.ongoing.first)}</b><small>${md(r.ongoing.until)}까지 ${r.ongoing.countSoFar}일</small></div>` : "",
    ].join("");
    const has = rows.some((x) => ok(x) && x.first);
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 더위가 더 일찍 찾아올까?<small>매년 처음·마지막으로 일최고기온 30℃ 이상이었던 날(서비스 기준 — 여름 시작·폭염특보 기준 아님) · 공식 일자료</small></h2>
      <div class="sx-key">${key}</div><ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>${incWarn(s.incomplete)}
      ${s.noEventYears.length ? `<p class="sx-warn">30℃ 이상인 날이 없었던 해(날짜 평균에서 뺌): ${E(s.noEventYears.join(", "))}</p>` : ""}
      ${has ? `<div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: "첫 30℃ 이상 날", color: COLORS[1] }, { label: "마지막 30℃ 이상 날", color: COLORS[0] }, { label: "자료 부족·진행 중", cls: "box" }])}<div class="sx-chart" id="lxChart2"></div>${legendHtml([{ label: "30℃ 이상인 날 수(일) · 막대", color: "#c2410c", cls: "bar" }])}` : stateHtml("표시할 연도가 없습니다.")}
      ${csvLink(url)}${tableHtml(r.table, (row, i) => rows[i].status !== "complete")}${rulesList(r.rules, DAILY_RULES())}`;
    if (!has) return;
    chart($id("lxChart"), {
      labels, type: "line", unit: "", shade: yrShade(rows),
      series: [{ name: "첫날", color: COLORS[1], values: rows.map((x) => (ok(x) ? x.firstPos : null)) }, { name: "마지막 날", color: COLORS[0], values: rows.map((x) => (ok(x) ? x.lastPos : null)) }],
      yFmt: posToMdC, yStep: (span) => (span > 150 ? 30 : span > 60 ? 15 : 7),
      tip: (i) => { const x = rows[i]; return `<b>${x.year}년</b><br>${ok(x) ? `첫날 <b>${x.first ? md(x.first) : "없음"}</b> · 마지막 <b>${x.last ? md(x.last) : "없음"}</b><br>30℃ 이상 ${x.count}일` : E(STATUS[x.status] || "")}<br><span class="tip-sub">관측 ${x.obs ?? 0}/${x.days ?? 0}일 · ${SOURCE}</span>`; },
      xLabel: yrLabel(labels), aria: "연도별 첫·마지막 30℃ 이상 날짜",
    });
    chart($id("lxChart2"), { labels, type: "bar", unit: "일", shade: yrShade(rows), series: [{ name: "일수", color: "#c2410c", values: rows.map((x) => (ok(x) ? x.count : null)) }], tip: (i) => `<b>${rows[i].year}년</b><br>30℃ 이상 <b>${ok(rows[i]) ? `${rows[i].count}일` : E(STATUS[rows[i].status] || "")}</b>`, xLabel: yrLabel(labels), aria: "연도별 30℃ 이상인 날 수" });
  }
  function posToMdC(pos) {
    if (pos === null || pos === undefined || !Number.isFinite(pos)) return "";
    if (pos === 59.5) return "2/29";
    const p = ((Math.round(pos) - 1) % 365) + 1;
    const d = new Date(Date.UTC(2001, 0, p));
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }

  function lifeStreaksView(out, r, url) {
    const rows = r.rows;
    const labels = rows.map((x) => String(x.year));
    const ok = (x) => x.status === "complete";
    const wet = r.kind === "wet";
    const q = wet ? "비가 가장 오래 이어진 때는?" : "비가 오지 않은 날이 가장 오래 이어진 때는?";
    const top = r.top.slice(0, 10);
    const d = r.delta;
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, ${q}<small>${E(r.kindLabel)} · 자료 없는 날이 끼면 앞뒤를 잇지 않음 · 공식 일자료 ${E(r.record.from)}~${E(r.record.to)}</small></h2>
      <div class="sx-key">${top[0] ? `<div><span>보유 기간 최장</span><b>${top[0].len}일</b><small>${ymdDot(top[0].start)}~${ymdDot(top[0].end)}${top.filter((t) => t.rank === 1).length > 1 ? " 외 동률" : ""}</small></div>` : ""}
        ${r.summary.longest ? `<div><span>연도별 가장 긴 해</span><b>${r.summary.longest.len}일</b><small>${r.summary.longest.year}년 (${md(r.summary.longest.runStart)}~${md(r.summary.longest.runEnd)})</small></div>` : ""}
        <div><span>해마다 가장 긴 기간(평균) · 1990년대 대비</span><b>${d.available ? signedPlain(d.delta, "일") : "비교 안 함"}</b><small>${d.available ? `${num(d.baseline.mean, 1)}일 → ${num(d.recent.mean, 1)}일 (${d.recent.from}~${d.recent.to})` : E(d.reason || "")}</small></div></div>
      <div class="sx-rec"><div><h3>보유 기간 최장 기록 10위<small>구간·연도 경계와 상관없이 셈</small></h3><ol>${top.map((t) => `<li><span class="r">${t.rank}위</span><span>${ymdDot(t.start)}~${ymdDot(t.end)}${t.endReason === "missing" ? " <small class=\"muted\">(다음 날 자료 없음)</small>" : t.endReason === "range" ? ' <small class="muted">(진행 중)</small>' : ""}</span><b>${t.len}일</b></li>`).join("")}</ol></div></div>
      ${incWarn(r.summary.incomplete)}
      <div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: `해마다 가장 긴 ${r.kindLabel}(일) · ${r.period.label}`, color: wet ? COLORS[0] : "#ca8a04", cls: "bar" }, { label: "자료 부족·진행 중(값 없음)", cls: "box" }])}
      ${csvLink(url)}${tableHtml(r.table, (row, i) => rows[i].status !== "complete")}${rulesList(r.rules, DAILY_RULES())}`;
    chart($id("lxChart"), { labels, type: "bar", unit: "일", shade: yrShade(rows), series: [{ name: r.kindLabel, color: wet ? COLORS[0] : "#ca8a04", values: rows.map((x) => (ok(x) ? x.len : null)) }], tip: (i) => { const x = rows[i]; return `<b>${x.year}년</b><br>${ok(x) ? `가장 긴 ${E(r.kindLabel)} <b>${x.len}일</b>${x.runStart ? `<br>${md(x.runStart)}~${md(x.runEnd)}` : ""}` : E(STATUS[x.status] || "")}<br><span class="tip-sub">관측 ${x.obs ?? 0}/${x.days ?? 0}일 · ${SOURCE}</span>`; }, xLabel: yrLabel(labels), aria: q });
  }

  function lifeWeekendView(out, r, url) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const dow = order.map((i) => r.dow[i]);
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 정말 주말마다 비가 올까?<small>${E(r.period.label)} · ${r.fromYear}~${r.toYear}년 · 유효 관측일 중 강수일(0.1mm 이상) 비율</small></h2>
      <div class="sx-key"><div><span>주말(토·일)</span><b>${pct(r.weekend.share)}</b><small>${num(r.weekend.valid, 0)}일 중 ${num(r.weekend.hit, 0)}일</small></div>
        <div><span>평일(월~금)</span><b>${pct(r.weekday.share)}</b><small>${num(r.weekday.valid, 0)}일 중 ${num(r.weekday.hit, 0)}일</small></div>
        <div><span>차이(주말 − 평일)</span><b>${r.diff == null ? "—" : signedPlain(r.diff, "%p")}</b><small>자료 없는 날 ${num(r.weekday.missing + r.weekend.missing, 0)}일은 분모에서 뺌</small></div></div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>
      <div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: "요일별 강수일 비율(%) · 막대", color: COLORS[0], cls: "bar" }])}
      ${csvLink(url)}${tableHtml(r.table)}${rulesList(r.rules, DAILY_RULES())}`;
    chart($id("lxChart"), { labels: dow.map((d) => `${d.label}요일`), type: "bar", unit: "%", series: [{ name: "비율", color: COLORS[0], values: dow.map((d) => d.share) }], tip: (i) => `<b>${dow[i].label}요일</b><br>강수일 비율 <b>${pct(dow[i].share)}</b><br><span class="tip-sub">유효 관측 ${num(dow[i].valid, 0)}일 중 ${num(dow[i].hit, 0)}일 · ${E(r.period.label)} ${r.fromYear}~${r.toYear} · ${SOURCE}</span>`, aria: "요일별 강수일 비율" });
  }

  function dayView(out, r, url, prefix) {
    const rows = r.rows.filter((x) => x.status !== "nodate");
    const labels = rows.map((x) => String(x.year));
    const sm = r.summary;
    const okR = (x) => x.status === "ok";
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 매년 ${E(r.label)}의 날씨는?<small>${r.fromYear}~${r.toYear}년 같은 날짜의 공식 일자료 · 과거 관측이며 강수확률·예보가 아닙니다</small></h2>
      <div class="sx-key"><div><span>강수가 있었던 해</span><b>${sm.validYears ? `${sm.rainyYears}/${sm.validYears}개 해` : "—"}</b><small>${sm.share == null ? "" : `자료가 있는 해의 ${sm.share}%`}</small></div>
        <div><span>최고·최저기온 평균</span><b>${sm.meanMax == null ? "—" : `${num(sm.meanMax, 1)}℃ / ${num(sm.meanMin, 1)}℃`}</b><small>${sm.validYears}개 해 평균</small></div>
        ${sm.hottest ? `<div><span>가장 더웠던 해</span><b>${sm.hottest.year}년 ${num(sm.hottest.max, 1)}℃</b><small>최고기온</small></div>` : ""}
        ${sm.coldest ? `<div><span>가장 추웠던 해</span><b>${sm.coldest.year}년 ${num(sm.coldest.min, 1)}℃</b><small>최저기온</small></div>` : ""}
        ${sm.wettest ? `<div><span>비가 가장 많았던 해</span><b>${sm.wettest.year}년 ${num(sm.wettest.rain, 1)}mm</b><small>일강수량</small></div>` : ""}</div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>
      ${rows.some(okR) ? `<div class="sx-chart" id="${prefix}Chart"></div>${legendHtml([{ label: "최고기온(℃)", color: "#ea580c" }, { label: "최저기온(℃)", color: COLORS[0] }])}<div class="sx-chart" id="${prefix}Chart2"></div>${legendHtml([{ label: "일강수량(mm) · 막대", color: "#0891b2", cls: "bar" }])}` : stateHtml("이 날짜의 자료가 없습니다.")}
      ${csvLink(url)}${tableHtml(r.table, (row) => row.status !== "자료 있음" && !String(row.status).startsWith("자료 있음"))}${rulesList(r.rules, DAILY_RULES())}`;
    if (!rows.some(okR)) return;
    const tip = (i) => { const x = rows[i]; return `<b>${x.date ? ymdDot(x.date) : x.year}${x.weekday ? ` (${x.weekday})` : ""}</b><br>${okR(x) ? `최고 <b>${fv(x.max, { unit: "℃", digits: 1 })}</b> · 최저 <b>${fv(x.min, { unit: "℃", digits: 1 })}</b><br>강수 <b>${x.rain == null ? "—" : `${num(x.rain, 1)}mm`}</b>${x.rainBlank ? " (공란=무강수)" : ""}` : E(STATUS[x.status] || "자료 없음")}<br><span class="tip-sub">${SOURCE}</span>`; };
    chart($id(`${prefix}Chart`), { labels, type: "line", unit: "℃", series: [{ name: "최고", color: "#ea580c", values: rows.map((x) => (okR(x) ? x.max : null)) }, { name: "최저", color: COLORS[0], values: rows.map((x) => (okR(x) ? x.min : null)) }], tip, xLabel: yrLabel(labels), aria: `매년 ${r.label} 기온` });
    chart($id(`${prefix}Chart2`), { labels, type: "bar", unit: "mm", series: [{ name: "강수", color: "#0891b2", values: rows.map((x) => (okR(x) ? x.rain : null)) }], tip, xLabel: yrLabel(labels), aria: `매년 ${r.label} 강수량` });
  }

  function outdoorView(out, r, url) {
    const labels = r.months.map((m) => `${m.month}월`);
    const hasEra = r.eras.recent && r.eraMonths.base.some((m) => m.share != null) && r.eraMonths.recent.some((m) => m.share != null);
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 산책·러닝하기 좋은 시기는? <span class="sx-badge">시간자료 집계</span><small>내가 정한 조건: ${E(r.condLabel)} — 공식 건강·안전 기준이 아닙니다 · ${r.fromYear}~${r.toYear}년 · 자료 ${E(r.asOf || "")}까지</small></h2>
      <div class="sx-key">${r.best ? `<div><span>조건을 가장 자주 만족한 달</span><b>${r.best.month}월 ${pct(r.best.share)}</b><small>판정 ${num(r.best.valid, 0)}시각 중 ${num(r.best.ok, 0)}시각</small></div><div><span>가장 드문 달</span><b>${r.worst.month}월 ${pct(r.worst.share)}</b><small>판정 ${num(r.worst.valid, 0)}시각</small></div>` : ""}
        <div><span>전체</span><b>${pct(r.total.share)}</b><small>판정 ${num(r.total.valid, 0)} / 전체 ${num(r.total.slots, 0)}시각</small></div></div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>
      ${r.total.valid ? `<div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: "조건 만족 비율(%) · 막대", color: "#16a34a", cls: "bar" }])}` : stateHtml("판정할 수 있는 시각이 없습니다.")}
      ${hasEra ? `<h3 style="margin:16px 0 0;font-size:14.5px">예전과 비교 — ${r.eras.base.from}~${r.eras.base.to}년 vs ${r.eras.recent.from}~${r.eras.recent.to}년</h3><div class="sx-chart" id="lxChart2"></div>${legendHtml([{ label: `${r.eras.base.from}~${r.eras.base.to}년`, color: "#94a3b8", cls: "bar" }, { label: `${r.eras.recent.from}~${r.eras.recent.to}년`, color: "#16a34a", cls: "bar" }])}` : ""}
      ${csvLink(url)}${tableHtml(r.table)}${rulesList(r.rules, [HOURLY_NOTE])}`;
    if (!r.total.valid) return;
    chart($id("lxChart"), { labels, type: "bar", unit: "%", series: [{ name: "비율", color: "#16a34a", values: r.months.map((m) => m.share) }], tip: (i) => { const m = r.months[i]; return `<b>${m.month}월</b> <span class="tip-sub">${r.fromYear}~${r.toYear}년</span><br>조건 만족 <b>${pct(m.share)}</b><br><span class="tip-sub">판정 ${num(m.valid, 0)}시각 중 ${num(m.ok, 0)} · 자료 없어 뺀 ${num(m.excluded, 0)}시각 · 시간자료 집계</span>`; }, aria: "월별 조건 만족 비율" });
    if (hasEra) chart($id("lxChart2"), { labels, type: "bar", unit: "%", series: [{ name: "예전", color: "#94a3b8", values: r.eraMonths.base.map((m) => m.share) }, { name: "최근", color: "#16a34a", values: r.eraMonths.recent.map((m) => m.share) }], tip: (i) => `<b>${i + 1}월</b><br>${r.eras.base.from}~${r.eras.base.to}년 <b>${pct(r.eraMonths.base[i].share)}</b> <span class="tip-sub">(${num(r.eraMonths.base[i].valid, 0)}시각)</span><br>${r.eras.recent.from}~${r.eras.recent.to}년 <b>${pct(r.eraMonths.recent[i].share)}</b> <span class="tip-sub">(${num(r.eraMonths.recent[i].valid, 0)}시각)</span>`, aria: "예전과 최근의 월별 비율" });
  }

  function commuteView(out, r, url) {
    const w = r.windows;
    const labels = w.am.months.map((m) => `${m.month}월`);
    const C = { am: "#026ef8", pm: "#9333ea", all: "#94a3b8" };
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 출퇴근 시간에 비가 잦을까? <span class="sx-badge">시간자료 집계</span><small>${r.weekdays ? "평일(월~금, 공휴일 미반영)" : "모든 요일"} · 출근 ${r.am[0]}~${r.am[1]}시, 퇴근 ${r.pm[0]}~${r.pm[1]}시 정시 관측 · ${r.fromYear}~${r.toYear}년 · 자료 ${E(r.asOf || "")}까지</small></h2>
      <div class="sx-key"><div><span>출근 시간 강수 관측 비율</span><b>${pct(w.am.total.hShare)}</b><small>판정 ${num(w.am.total.hValid, 0)}시각 · 강수 관측 날 ${pct(w.am.total.dShare)}</small></div>
        <div><span>퇴근 시간 강수 관측 비율</span><b>${pct(w.pm.total.hShare)}</b><small>판정 ${num(w.pm.total.hValid, 0)}시각 · 강수 관측 날 ${pct(w.pm.total.dShare)}</small></div>
        <div><span>하루 전체(비교 기준)</span><b>${pct(w.all.total.hShare)}</b><small>같은 날들의 모든 정시</small></div></div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>
      ${w.am.total.hValid ? `<div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: "출근 시간", color: C.am, cls: "bar" }, { label: "퇴근 시간", color: C.pm, cls: "bar" }, { label: "하루 전체", color: C.all, cls: "bar" }])}` : stateHtml("판정할 수 있는 시간자료가 없습니다.")}
      ${csvLink(url)}${tableHtml(r.table)}${rulesList(r.rules, [HOURLY_NOTE])}`;
    if (!w.am.total.hValid) return;
    chart($id("lxChart"), { labels, type: "bar", unit: "%", series: [{ name: "출근", color: C.am, values: w.am.months.map((m) => m.hShare) }, { name: "퇴근", color: C.pm, values: w.pm.months.map((m) => m.hShare) }, { name: "하루", color: C.all, values: w.all.months.map((m) => m.hShare) }], tip: (i) => `<b>${i + 1}월</b> <span class="tip-sub">강수 관측 시각 비율</span><br>출근 <b>${pct(w.am.months[i].hShare)}</b> <span class="tip-sub">(${num(w.am.months[i].hValid, 0)}시각)</span><br>퇴근 <b>${pct(w.pm.months[i].hShare)}</b> <span class="tip-sub">(${num(w.pm.months[i].hValid, 0)}시각)</span><br>하루 <b>${pct(w.all.months[i].hShare)}</b><br><span class="tip-sub">시간자료 집계</span>`, aria: "월별 출퇴근 시간 강수 관측 비율" });
  }

  function tropicalView(out, r, url) {
    const rows = r.rows;
    const labels = rows.map((x) => String(x.year));
    const ok = (x) => x.status === "complete";
    const s = r.summary;
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}, 열대야는 얼마나 될까? <span class="sx-badge est">추정치</span> <span class="sx-badge">시간자료 집계</span><small>${E(r.period.label)} · 그날 19시~다음 날 09시 정시 기온(15개)의 최저가 25℃ 이상인 밤 — 공식 열대야일수(분 단위 밤 최저기온)와 다릅니다</small></h2>
      <div class="sx-key">${s.latest ? `<div><span>최근 판정 가능한 해 · ${s.latest.year}년</span><b>${s.latest.value}일</b><small>${s.latest.rank.of}개 연도 중 많은 순 ${s.latest.rank.high}위</small></div>` : ""}
        ${s.highest ? `<div><span>가장 많았던 해</span><b>${s.highest.value}일</b><small>${E(s.highest.years.join(", "))}년</small></div>` : ""}
        <div><span>1990년대 대비</span><b style="font-size:14px">${r.delta.available ? signedPlain(r.delta.delta, "일") : "비교하지 않음"}</b><small>${E(r.delta.available ? `${r.delta.baseline.mean}일 → ${r.delta.recent.mean}일` : r.delta.reason || "")}</small></div>
        <div><span>판정 가능한 연도</span><b>${s.completeYears}개</b><small>${r.fromYear}~${r.toYear}년 중</small></div></div>
      <ul class="sx-text">${r.text.map((t) => `<li>${E(t)}</li>`).join("")}</ul>${incWarn(s.incomplete)}
      ${s.completeYears ? `<div class="sx-chart" id="lxChart"></div>${legendHtml([{ label: "열대야 추정(일) · 막대", color: "#9333ea", cls: "bar" }, { label: "판정 못 한 밤이 있는 해(값 없음)", cls: "box" }])}` : stateHtml("모든 밤을 판정할 수 있는 연도가 없습니다.")}
      ${csvLink(url)}${tableHtml(r.table, (row, i) => rows[i].status !== "complete")}${rulesList(r.rules, [HOURLY_NOTE])}`;
    if (!s.completeYears) return;
    chart($id("lxChart"), { labels, type: "bar", unit: "일", shade: yrShade(rows), series: [{ name: "열대야", color: "#9333ea", values: rows.map((x) => (ok(x) ? x.value : null)) }], tip: (i) => { const x = rows[i]; return `<b>${x.year}년</b> <span class="tip-sub">${x.start ? `${ymdDot(x.start)}~${ymdDot(x.end)}` : ""}</span><br>${ok(x) ? `열대야(추정) <b>${x.value}일</b>` : `${E(STATUS[x.status] || "")}${x.countValid != null ? ` — 판정한 밤 중 ${x.countValid}일` : ""}`}<br><span class="tip-sub">판정한 밤 ${x.obs ?? 0}/${x.days ?? 0} · ${x.warmestNight ? `가장 더운 밤 ${md(x.warmestNight.date)} ${x.warmestNight.min}℃ · ` : ""}시간자료 집계</span>`; }, xLabel: yrLabel(labels), aria: "연도별 열대야 추정" });
  }

  // ---- 날씨 기록 탭
  function readRecHash() {
    const q = hp();
    const v = q.get("view");
    if (REC_VIEWS.some(([x]) => x === v)) rec.view = v;
    const pr = q.get("period");
    rec.period = pr && (/^month:\d{1,2}$/.test(pr) || /^season:\w+$/.test(pr)) ? pr : "all";
    const d = q.get("date") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) rec.date = d;
    if (/^\d{2}-\d{2}$/.test(d)) life.md = d;
    if (!rec.date) rec.date = meta.asOf;
  }
  function recApi() {
    if (rec.view === "records") return `/api/stats/records?station=${encodeURIComponent(state.station)}${rec.period !== "all" ? `&period=${encodeURIComponent(rec.period)}` : ""}`;
    if (rec.view === "day") return `/api/stats/life/day?${lifeQuery({ date: life.md })}`;
    return `/api/stats/date?station=${encodeURIComponent(state.station)}&date=${encodeURIComponent(rec.date)}`;
  }
  function syncRecHash() {
    const want = recHref(rec.view, rec.view === "date" ? { date: rec.date } : rec.view === "day" ? { date: life.md, from: String(state.from), to: String(state.to) } : {});
    if (location.hash !== want) history.replaceState(null, "", want);
    updateTabLinks();
  }
  function recShell() {
    const p = $id("tabRecords");
    if (p.dataset.ready) return;
    p.dataset.ready = "1";
    p.innerHTML = `<div class="card"><h2 class="sx-q">날씨 기록<small>보유 관측기간(1990년~)의 최고·최저 기록과, 특정 날짜의 과거 날씨 · 관측지점 한 곳의 공식 일자료</small></h2><div class="sx-ctl" id="rcCtl"></div><div id="rcNav"></div></div><div class="card" id="rcOut"></div>`;
    p.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "rcSt") state.station = t.value;
      else if (t.id === "rcPeriod") rec.period = t.value;
      else if (t.id === "rcDate") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return;
        rec.date = t.value;
      } else if (t.id === "rcM" || t.id === "rcD") {
        const m = +$id("rcM").value;
        life.md = `${p2(m)}-${p2(Math.min(+$id("rcD").value, dim(m)))}`;
      } else if (t.id === "rcFrom" || t.id === "rcTo") {
        state.from = +$id("rcFrom").value;
        state.to = +$id("rcTo").value;
        if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      } else return;
      renderRecCtl();
      loadRec();
    });
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-md],a[data-date]");
      if (!b) return;
      if (b.dataset.md) life.md = b.dataset.md;
      if (b.dataset.date) {
        e.preventDefault();
        rec.view = "date";
        rec.date = b.dataset.date;
      }
      renderRecCtl();
      loadRec();
    });
  }
  function renderRecCtl() {
    let c = stSelect("rcSt");
    if (rec.view === "records") c += `<div><label for="rcPeriod">기간</label><select id="rcPeriod">${opts([["all", "보유 기간 전체"], ...MONTHS.map(([m, l]) => [`month:${m}`, `매년 ${l}`]), ...(meta.seasons || []).map((s) => [`season:${s.id}`, `매년 ${s.label}(${s.months})`])], rec.period)}</select></div>`;
    if (rec.view === "day") c += `${mdPicker(life.md, "rcM", "rcD")}${yearSelects("rc")}<div><label>바로 고르기</label><div class="sx-presets">${PRESET_DAYS.map(([md, l]) => `<button type="button" data-md="${md}">${E(l)}</button>`).join("")}</div></div>`;
    if (rec.view === "date") c += `<div><label for="rcDate">날짜</label><input type="date" id="rcDate" min="1990-01-01" max="${E(meta.asOf || "")}" value="${E(rec.date || "")}"></div>`;
    $id("rcCtl").innerHTML = c;
    $id("rcNav").innerHTML = subNav(REC_VIEWS, rec.view, (v) => recHref(v, v === "date" ? { date: rec.date } : v === "day" ? { date: life.md } : {}));
  }
  async function loadRec() {
    syncRecHash();
    const out = $id("rcOut");
    const my = ++reqL.n;
    out.innerHTML = stateHtml("불러오는 중…");
    const url = recApi();
    let r;
    try {
      r = await getJson(url);
    } catch (e) {
      if (my !== reqL.n) return;
      out.innerHTML = errorHtml(e.message, "rcRetry");
      $id("rcRetry").onclick = loadRec;
      return;
    }
    if (my !== reqL.n) return;
    if (rec.view === "records") recordsView(out, r, url);
    else if (rec.view === "day") dayView(out, r, url, "rc");
    else dateView(out, r, url);
  }
  function recordsView(out, r, url) {
    const list = (l) => `<div><h3>${E(l.label)} (${E(l.unit)})<small>${l.note ? `${E(l.note)} · ` : ""}관측 ${num(l.observed, 0)}일${l.missing ? ` · 자료 없음 ${num(l.missing, 0)}일` : ""}</small></h3>${l.items.length ? `<ol>${l.items.map((x) => `<li><span class="r">${x.rank}위</span><span><a href="#" data-date="${x.date}" title="그날의 날씨 보기">${ymdDot(x.date)}</a></span><b>${num(x.value, 1)}${E(l.unit)}</b></li>`).join("")}</ol>` : `<p class="muted">기록 없음(0보다 큰 날이 없음)</p>`}</div>`;
    const top = r.lists.find((l) => l.id === "max_high")?.items[0];
    const low = r.lists.find((l) => l.id === "min_low")?.items[0];
    const rain = r.lists.find((l) => l.id === "rain_high")?.items[0];
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))}의 날씨 기록은?<small>${E(r.period.label)} · ${E(r.from)}~${E(r.to)} 공식 일자료 · 같은 값은 같은 순위</small></h2>
      <div class="sx-key">${top ? `<div><span>가장 더웠던 날</span><b class="up">${num(top.value, 1)}℃</b><small>${ymdDot(top.date)}</small></div>` : ""}${low ? `<div><span>가장 추웠던 날</span><b class="down">${num(low.value, 1)}℃</b><small>${ymdDot(low.date)}</small></div>` : ""}${rain ? `<div><span>비가 가장 많이 온 날</span><b>${num(rain.value, 1)}mm</b><small>${ymdDot(rain.date)}</small></div>` : ""}</div>
      <div class="sx-rec">${r.lists.map(list).join("")}</div>
      ${csvLink(url)}${rulesList(r.rules, DAILY_RULES())}`;
  }
  function dateView(out, r, url) {
    const val = (f) => (f.value === null ? `<span class="muted">${E(f.note || "—")}</span>` : `<b>${E(typeof f.value === "number" ? num(f.value, 1) : f.value)}</b>${f.unit && typeof f.value === "number" ? ` ${E(f.unit)}` : ""}${f.note ? ` <small class="muted">${E(f.note)}</small>` : ""}`);
    const g = (k) => r.fields.find((f) => f.key === k);
    const mdOfDate = r.date.slice(5);
    out.innerHTML = `<h2 class="sx-q">${E(stName(state.station))} · ${ymdDot(r.date)} (${E(r.weekday)})의 날씨<small>기상청 ASOS 공식 일자료 한 행 그대로</small></h2>
      ${r.found ? `<div class="sx-key"><div><span>최고 / 최저기온</span><b>${g("max_temperature").value ?? "—"}℃ / ${g("min_temperature").value ?? "—"}℃</b><small>평균 ${g("avg_temperature").value ?? "—"}℃</small></div><div><span>일강수량</span><b>${g("precipitation").value === null ? "0mm" : `${num(g("precipitation").value, 1)}mm`}</b><small>${E(g("precipitation").value === null ? "공란 = 무강수" : "")}</small></div><div><span>평균 습도 · 풍속</span><b>${g("avg_humidity").value ?? "—"}% · ${g("avg_wind_speed").value ?? "—"}m/s</b></div></div>
      <div class="sx-table-wrap" style="max-height:none"><table><tbody>${r.fields.map((f) => `<tr><th scope="row">${E(f.label)}</th><td>${val(f)}</td></tr>`).join("")}</tbody></table></div>` : stateHtml("이 날짜의 공식 일자료가 없습니다(보유 기간 1990-01-01~ 또는 아직 들어오지 않은 날).")}
      <p><a href="${recHref("day", { date: mdOfDate })}" data-md-link="1">매년 ${+mdOfDate.slice(0, 2)}월 ${+mdOfDate.slice(3)}일의 날씨 보기 ›</a></p>
      ${csvLink(url)}${rulesList(r.rules)}`;
  }

  // ------------------------------------------------------------ 라우팅
  function showTab(tab) {
    state.tab = tab;
    for (const t of TABS) {
      const el = $id(PANEL[t]);
      if (el) el.hidden = t !== tab;
    }
    updateTabLinks();
  }
  async function route(tab) {
    if (!TABS.includes(tab)) tab = "overview";
    showTab(tab);
    if (tab === "overview") {
      const st = (typeof dashState !== "undefined" && dashState.station) || null;
      if (st) state.station = st;
      const host = $id("qCards");
      if (host && (host.dataset.st !== String(st) || !host.innerHTML)) {
        host.dataset.st = String(st);
        loadCards();
      }
      return;
    }
    const panel = $id(PANEL[tab]);
    if (!meta) panel.innerHTML = `<div class="card">${stateHtml("통계 정보를 불러오는 중…")}</div>`;
    try {
      await loadMeta();
    } catch (e) {
      panel.innerHTML = `<div class="card">${errorHtml(e.message, "sxMetaRetry")}</div>`;
      $id("sxMetaRetry").onclick = () => route(tab);
      return;
    }
    if (state.tab !== tab) return;
    readHash(tab);
    if (tab === "yearly") {
      yearlyShell();
      renderYearlyCtl();
      loadYearly();
    } else if (tab === "region") {
      regionShell();
      renderRegionCtl();
      loadRegion();
    } else if (tab === "life") {
      readLifeHash();
      lifeShell();
      renderLifeCtl();
      loadLife();
    } else if (tab === "records") {
      readRecHash();
      recShell();
      renderRecCtl();
      loadRec();
    }
  }
  function onStation(id) {
    state.station = id;
    if (state.tab === "overview") {
      const host = $id("qCards");
      if (host) host.dataset.st = String(id);
      loadCards();
    }
    updateTabLinks();
  }
  window.Stats = { route, onStation };
  // 본문 스크립트의 첫 route() 가 이 파일보다 먼저 돌았으면 지금 탭을 맞춘다
  if (typeof route === "function") {
    const h = location.hash.replace("#", "").split("?")[0] || "/";
    const tab = { "/": "overview", "/stats/yearly": "yearly", "/stats/region": "region", "/stats/life": "life", "/stats/records": "records" }[h];
    if (tab && document.querySelector("#dash.on")) window.Stats.route(tab);
  }
})();
