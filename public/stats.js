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
    const groups = [["temp", "기온"], ["rain", "강수"], ["days", "기온 조건을 넘은 날 수"]];
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
      .map((r, i) => `<tr${dimRow(r, i) ? ' class="dim"' : ""}>${table.columns.map((c) => `<td${isNum(r[c.key]) ? ' class="num"' : ""}>${r[c.key] === null || r[c.key] === undefined || r[c.key] === "" ? "—" : E(isNum(r[c.key]) ? num(r[c.key], 1) : r[c.key])}</td>`).join("")}</tr>`)
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
    drawChart(host);
  }
  function drawChart(host) {
    const cfg = host.__cfg;
    if (!cfg || !host.isConnected) {
      charts.delete(host);
      return;
    }
    const W = Math.round(host.clientWidth);
    if (!W) return;
    if (host.__w === W && host.querySelector("svg")) return;
    host.__w = W;
    const narrow = W < 560;
    const H = narrow ? 230 : 290;
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
    const step = niceStep((hi - lo) / (narrow ? 4 : 5));
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
      g += `<line class="grid" x1="${ml}" x2="${ml + iw}" y1="${y}" y2="${y}"/><text class="ax" x="${ml - 6}" y="${y + 4}" text-anchor="end">${num(f(v), dec)}${E(cfg.unit)}</text>`;
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
    g += `<line class="hv" id="${host.id}Hv" x1="0" x2="0" y1="${mt}" y2="${mt + ih}" visibility="hidden"/>`;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${E(cfg.aria || "")}">${g}<rect x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent" data-hit="1"/></svg><div class="tip"></div>`;
    const svg = host.querySelector("svg");
    const tip = host.querySelector(".tip");
    const hv = svg.querySelector(`#${CSS.escape(host.id)}Hv`);
    const move = (ev) => {
      const box = svg.getBoundingClientRect();
      const x = ((ev.clientX - box.left) / box.width) * W;
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
    svg.addEventListener("pointerleave", hide);
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
    try {
      await loadMeta();
      r = await getJson(`/api/stats/highlights?station=${encodeURIComponent(st)}`);
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
    host.innerHTML = r.cards.map(card).join("") + `<a class="q-card" href="${regionHref}"><span class="q">다른 지역과 비교하면?</span><small>관측지점 2~4곳의 같은 시기 평균기온·강수량·강수일수와 1990년대 대비 변화를 나란히 봅니다.</small><span class="go">지역별 비교에서 보기 ›</span></a>`;
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
      <div class="sx-tools"><span class="muted">${E(m.label)} 대신 그 지표가 쓰는 하루 값을 보여 줍니다.</span><a class="dl-chip-btn" href="${E(url)}&format=csv" download>통계 결과 CSV 내려받기</a></div>
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
      <div class="sx-bars" role="img" aria-label="${E(q)} 지점별 막대">${blocks}</div>
      ${regionFoot(r, url, null)}`;
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

  // ------------------------------------------------------------ 생활 속 날씨·날씨 기록(1단계: 지금 볼 수 있는 연결만, 숫자 없음)
  function linkYearly(metric, period) {
    return `#/stats/yearly?${new URLSearchParams({ station: state.station || "108", metric, period, from: "1990", to: String(asOfYear()) })}`;
  }
  function renderLife() {
    $id("tabLife").innerHTML = `<div class="card sx-soon">
      <h2 class="sx-q">생활 속 날씨 <span class="sx-badge">준비 중</span><small>주말·산책·러닝·출퇴근·기념일 통계는 다음 단계에서 추가합니다. 아래 질문은 지금 연도별 비교에서 바로 볼 수 있습니다.</small></h2>
      <ul>
        <li><a href="${linkYearly("rain_days", "year")}">비가 더 자주 올까? — 해마다 강수일수 ›</a></li>
        <li><a href="${linkYearly("rain50_days", "year")}">한꺼번에 쏟아지는 비가 늘었을까? — 하루 50mm 이상 강수일 ›</a></li>
        <li><a href="${linkYearly("avg_range", "year")}">일교차가 커졌을까? — 일교차 평균 ›</a></li>
        <li><a href="${linkYearly("rain_days", "range:05-05:05-05")}">어린이날(5/5)에 비가 왔던 해는? — 5/5 강수일 ›</a></li>
        <li><a href="${linkYearly("hot30_days", "season:summer")}">여름에 30℃ 넘는 날은? — 최고기온 30℃ 이상인 날 ›</a></li>
      </ul>
      <p class="muted" style="margin-top:12px">다음 단계에서 추가할 항목(아직 계산하지 않아 숫자를 보여 주지 않습니다): 주말·평일 강수일 비율, 조건을 정해 보는 산책·러닝하기 좋은 시간 비율, 출퇴근 시간대 강수 관측 비율, 첫 30℃·마지막 30℃ 날짜, 연속 강수·무강수 최장 기간, 열대야(정시 자료로 계산한 추정치), 기념일·생일의 강수가 있었던 해의 비율.</p>
    </div>`;
  }
  function renderRecords() {
    $id("tabRecords").innerHTML = `<div class="card sx-soon">
      <h2 class="sx-q">날씨 기록 <span class="sx-badge">준비 중</span><small>보유 관측기간(1990년~)의 최고·최저 기록 순위와 특정 날짜의 과거 날씨는 다음 단계에서 추가합니다.</small></h2>
      <ul>
        <li><a href="${linkYearly("period_max", "season:summer")}">해마다 여름 중 가장 더웠던 하루는? — 기간 중 가장 높은 기온 ›</a></li>
        <li><a href="${linkYearly("period_min", "season:winter")}">해마다 겨울 중 가장 추웠던 하루는? — 기간 중 가장 낮은 기온 ›</a></li>
        <li><a href="${linkYearly("rain_max_day", "year")}">해마다 비가 가장 많이 온 하루는? — 하루 최대강수량 ›</a></li>
        <li><a href="${linkYearly("avg_temp", "range:05-05:05-05")}">특정 날짜의 과거 날씨 — 연도별 비교에서 '직접 지정'으로 월·일을 같게 고르면 해마다 그날 값을 볼 수 있습니다 ›</a></li>
      </ul>
    </div>`;
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
    } else if (tab === "life") renderLife();
    else if (tab === "records") renderRecords();
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
