// 날씨 이야기(날짜로 보는 날씨·날씨 배틀) 공용 그래프 — 값은 서버 응답 그대로(보간·채움 없음).
// 색만으로 구분하지 않음: 평균 = 회색 실선(표본 1~2개 시각은 점선·빈 점), 선택 연도 = 색 + 선 모양(실선/긴 점선/점선) + 표식 글자.
// 결측 = 선 끊김·빗금 칸. 터치·마우스·키보드(←→, Home/End)로 값 확인. 자동 움직임 없음.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const rnd = (v, d = 1) => (fin(v) ? Math.round(v * 10 ** d + (v >= 0 ? 1e-9 : -1e-9)) / 10 ** d : null);
  const fmt = (v, d = 1) => (fin(v) ? rnd(v, d).toFixed(d) : "–");
  const sgn = (v, d = 1) => (fin(v) ? `${rnd(v, d) > 0 ? "+" : rnd(v, d) < 0 ? "−" : "±"}${Math.abs(rnd(v, d)).toFixed(d)}` : "–");
  const SEL = [
    { color: "#e8590c", dash: "", mark: "①" },
    { color: "#7c3aed", dash: "7 4", mark: "②" },
    { color: "#0f766e", dash: "2 3", mark: "③" },
  ];
  const CASE = { A: { color: "#026ef8", shape: "■", dash: "" }, B: { color: "#e8590c", shape: "▲", dash: "7 4" }, C: { color: "#0f766e", shape: "●", dash: "2 3" }, D: { color: "#a21caf", shape: "◆", dash: "10 3 2 3" } };
  const MEAN = "#5e7090";
  const BAND = "#d5deeb";
  let uid = 0;
  const hatch = (id) => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f1f4f9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#a7b3c6" stroke-width="1.6"/></pattern>`;
  function niceRange(vals, { zero = false, pad = 0.08 } = {}) {
    const v = vals.filter(fin);
    if (!v.length) return [0, 1];
    let lo = Math.min(...v);
    let hi = Math.max(...v);
    if (zero) lo = Math.min(0, lo);
    if (hi === lo) { hi += 1; if (!zero) lo -= 1; }
    const p = (hi - lo) * pad;
    return [zero && lo >= 0 ? 0 : lo - p, hi + p];
  }
  function ticks(lo, hi, n = 4) {
    const span = hi - lo;
    const raw = span / n;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(6));
    return out;
  }
  // 연속 구간(조건이 참인 칸들)
  function runs(n, ok) {
    const out = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      if (ok(i)) { if (!cur) cur = [i, i]; else cur[1] = i; }
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }
  // 상호작용: svg 위 포인터·키보드 → onMove(i)
  function interact(svg, n, xOf, onMove) {
    let cur = -1;
    const pick = (i) => { i = Math.max(0, Math.min(n - 1, i)); if (i === cur) return; cur = i; onMove(i); };
    const fromEvent = (e) => {
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const x = ((e.clientX - r.left) / r.width) * vb.width;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    svg.addEventListener("pointermove", (e) => pick(fromEvent(e)));
    svg.addEventListener("pointerdown", (e) => pick(fromEvent(e)));
    svg.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); pick(cur < 0 ? 0 : cur + 1); }
      else if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); pick(cur < 0 ? 0 : cur - 1); }
      else if (k === "Home") { e.preventDefault(); pick(0); }
      else if (k === "End") { e.preventDefault(); pick(n - 1); }
    });
    svg.addEventListener("focus", () => { if (cur < 0) pick(0); });
    return { pick, cur: () => cur };
  }
  const widthOf = (el, min = 320) => Math.max(min, Math.min(980, Math.round(el.clientWidth || 700)));

  // ---------------------------------------------------------------- 시간별(00~23시) 평균 + 선택 연도/카드
  // o: { unit, digits, bar, mean: [{mean,n,eligible,tier,limited,p10,p90}] | null, series: [{ key, label, color, dash, mark, values[24], status[24] }], hourLabel(h), tipExtra(h) }
  function hourChart(el, o) {
    const W = widthOf(el);
    const H = W < 500 ? 230 : 260;
    const L = 40, R = 10, T = 14, B = 30;
    const id = `dv${++uid}`;
    const xs = (i) => L + (o.bar ? ((i + 0.5) / 24) : (i / 23)) * (W - L - R);
    const all = [];
    if (o.mean) for (const m of o.mean) { all.push(m.mean); if (o.band) all.push(m.p10, m.p90); }
    for (const s of o.series) all.push(...s.values);
    const [lo, hi] = niceRange(all, { zero: o.bar || o.zero });
    const ys = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let g = `<svg class="dv-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(o.aria || "시간별 그래프")}"><defs>${hatch(`${id}h`)}</defs>`;
    for (const t of ticks(lo, hi)) g += `<line class="dv-grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="dv-ax" x="${L - 5}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`;
    for (let h = 0; h < 24; h += W < 500 ? 3 : 2) g += `<text class="dv-ax" x="${xs(h)}" y="${H - 10}" text-anchor="middle">${o.bar ? `${h}` : `${h}시`}</text>`;
    if (o.bar) g += `<text class="dv-ax" x="${W - R}" y="${H - 1}" text-anchor="end">구간 시작 시각(h~h+1시)</text>`;
    // 자료 없는 시각(평균 표본 0) 빗금
    if (o.mean) for (const [a, b] of runs(24, (i) => !o.mean[i] || o.mean[i].n === 0)) {
      const x0 = o.bar ? xs(a) - (W - L - R) / 48 : Math.max(L, xs(a) - (W - L - R) / 46);
      const x1 = o.bar ? xs(b) + (W - L - R) / 48 : Math.min(W - R, xs(b) + (W - L - R) / 46);
      g += `<rect x="${x0}" y="${T}" width="${x1 - x0}" height="${H - T - B}" fill="url(#${id}h)" opacity=".8"><title>자료 없음</title></rect>`;
    }
    if (o.bar) {
      const k = (o.mean ? 1 : 0) + o.series.length;
      const slot = (W - L - R) / 24;
      const bw = Math.max(2, (slot * 0.82) / Math.max(1, k));
      for (let h = 0; h < 24; h++) {
        let j = 0;
        const x0 = xs(h) - (bw * k) / 2;
        if (o.mean) { const m = o.mean[h]; if (m && fin(m.mean)) g += `<rect x="${x0}" y="${ys(Math.max(0, m.mean))}" width="${bw - 1}" height="${Math.abs(ys(m.mean) - ys(0))}" fill="${MEAN}" opacity="${m.tier === "stats" ? 0.55 : 0.25}"/>`; j++; }
        for (const s of o.series) {
          const v = s.values[h];
          const x = x0 + j * bw;
          if (fin(v)) g += `<rect x="${x}" y="${ys(Math.max(0, v))}" width="${bw - 1}" height="${Math.max(v > 0 ? 1 : 0.6, Math.abs(ys(v) - ys(0)))}" fill="${s.color}"/>`;
          else if (s.status && s.status[h] !== "ok") g += `<rect x="${x}" y="${ys(hi) }" width="${bw - 1}" height="${H - T - B}" fill="url(#${id}h)" opacity=".55"/>`;
          j++;
        }
      }
    } else {
      if (o.mean && o.band) for (const [a, b] of runs(24, (i) => fin(o.mean[i]?.p10) && fin(o.mean[i]?.p90))) {
        let pts = "";
        for (let i = a; i <= b; i++) pts += `${xs(i)},${ys(o.mean[i].p90)} `;
        for (let i = b; i >= a; i--) pts += `${xs(i)},${ys(o.mean[i].p10)} `;
        g += a === b ? `<line x1="${xs(a)}" x2="${xs(a)}" y1="${ys(o.mean[a].p90)}" y2="${ys(o.mean[a].p10)}" stroke="${BAND}" stroke-width="6"/>` : `<polygon points="${pts}" fill="${BAND}" opacity=".85"/>`;
      }
      if (o.mean) {
        for (const [a, b] of runs(24, (i) => fin(o.mean[i]?.mean) && o.mean[i].tier === "stats")) g += `<polyline fill="none" stroke="${MEAN}" stroke-width="2.4" points="${Array.from({ length: b - a + 1 }, (_, k) => `${xs(a + k)},${ys(o.mean[a + k].mean)}`).join(" ")}"/>`;
        for (let i = 0; i < 24; i++) if (o.mean[i] && o.mean[i].tier === "reference" && fin(o.mean[i].mean)) g += `<circle cx="${xs(i)}" cy="${ys(o.mean[i].mean)}" r="3.2" fill="#fff" stroke="${MEAN}" stroke-width="1.6" stroke-dasharray="2 1.5"/>`;
      }
      for (const s of o.series) {
        for (const [a, b] of runs(24, (i) => fin(s.values[i]))) {
          if (a === b) g += `<circle cx="${xs(a)}" cy="${ys(s.values[a])}" r="3.2" fill="${s.color}"/>`;
          else g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.6" stroke-dasharray="${s.dash || ""}" stroke-linejoin="round" points="${Array.from({ length: b - a + 1 }, (_, k) => `${xs(a + k)},${ys(s.values[a + k])}`).join(" ")}"/>`;
        }
        // 선 끝 표식(색 외 구분)
        const last = [...s.values.keys()].reverse().find((i) => fin(s.values[i]));
        if (last != null && s.mark) { const nearR = xs(last) > W - R - 40; g += `<text x="${nearR ? xs(last) - 5 : xs(last) + 4}" y="${ys(s.values[last]) - 6}" text-anchor="${nearR ? "end" : "start"}" font-size="11" font-weight="700" fill="${s.color}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(s.mark)}</text>`; }
      }
    }
    g += `<line class="dv-hv" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
    el.innerHTML = `${g}<div class="dv-tip" aria-live="polite">${esc(o.hint || "그래프를 누르거나 ← → 키로 시각별 값을 확인하세요")}</div>`;
    const svg = el.querySelector("svg");
    const hv = svg.querySelector(".dv-hv");
    const tip = el.querySelector(".dv-tip");
    interact(svg, 24, xs, (i) => {
      hv.setAttribute("x1", xs(i)); hv.setAttribute("x2", xs(i)); hv.setAttribute("visibility", "visible");
      tip.innerHTML = o.tip(i);
    });
    return { svg };
  }

  // ---------------------------------------------------------------- 해마다(기준연도) 값: 점·선 또는 막대 + 강수 칸
  // o: { rows: [{ year, value, status, sub }], bar, unit, digits, selected: [years], onPick(year), tip(i) }
  function yearChart(el, o) {
    const W = widthOf(el);
    const H = W < 500 ? 200 : 230;
    const L = 40, R = 10, T = 14, B = 26;
    const id = `dv${++uid}`;
    const n = o.rows.length;
    const xs = (i) => L + ((i + 0.5) / n) * (W - L - R);
    const [lo, hi] = niceRange(o.rows.map((r) => r.value), { zero: o.bar });
    const ys = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const slot = (W - L - R) / n;
    let g = `<svg class="dv-svg dv-click" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(o.aria || "연도별 그래프")}"><defs>${hatch(`${id}h`)}</defs>`;
    for (const t of ticks(lo, hi)) g += `<line class="dv-grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="dv-ax" x="${L - 5}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`;
    const every = Math.ceil(n / Math.floor((W - L - R) / 34));
    o.rows.forEach((r, i) => {
      const isSel = o.selected?.includes(r.year);
      if (i % every === 0 || isSel) g += `<text class="dv-ax${isSel ? " dv-ax-sel" : ""}" x="${xs(i)}" y="${H - 8}" text-anchor="middle">${String(r.year).slice(n > 12 ? 2 : 0)}</text>`;
      if (isSel) g += `<rect x="${xs(i) - slot / 2}" y="${T}" width="${slot}" height="${H - T - B}" fill="#fff4e6"/>`;
      if (!fin(r.value)) g += `<rect x="${xs(i) - slot * 0.35}" y="${T}" width="${slot * 0.7}" height="${H - T - B}" fill="url(#${id}h)" opacity="${r.status === "nodate" ? 0.35 : 0.8}"><title>${esc(r.statusText || "")}</title></rect>`;
    });
    if (o.bar) o.rows.forEach((r, i) => { if (fin(r.value)) g += `<rect x="${xs(i) - slot * 0.35}" y="${ys(Math.max(0, r.value))}" width="${slot * 0.7}" height="${Math.max(r.value > 0 ? 1.2 : 0.8, Math.abs(ys(r.value) - ys(0)))}" fill="${o.selected?.includes(r.year) ? "#e8590c" : o.color || "#2f6fd6"}" rx="1.5"/>`; });
    else {
      for (const [a, b] of runs(n, (i) => fin(o.rows[i].value))) if (b > a) g += `<polyline fill="none" stroke="${o.color || "#0d1b3d"}" stroke-width="1.8" points="${o.rows.slice(a, b + 1).map((r, k) => `${xs(a + k)},${ys(r.value)}`).join(" ")}"/>`;
      o.rows.forEach((r, i) => { if (fin(r.value)) g += `<circle cx="${xs(i)}" cy="${ys(r.value)}" r="${o.selected?.includes(r.year) ? 5 : 3.2}" fill="${o.selected?.includes(r.year) ? "#e8590c" : "#fff"}" stroke="${o.selected?.includes(r.year) ? "#e8590c" : o.color || "#0d1b3d"}" stroke-width="1.8"/>`; });
    }
    if (fin(o.meanLine)) g += `<line x1="${L}" x2="${W - R}" y1="${ys(o.meanLine)}" y2="${ys(o.meanLine)}" stroke="${MEAN}" stroke-dasharray="5 4" stroke-width="1.4"/><text class="dv-ax" x="${W - R}" y="${ys(o.meanLine) - 4}" text-anchor="end">평균 ${fmt(o.meanLine, o.digits)}</text>`;
    g += `<line class="dv-hv" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
    el.innerHTML = `${g}<div class="dv-tip" aria-live="polite">${esc(o.hint || "점·막대를 누르면 그해가 선택됩니다(← → 로 이동, Enter 로 선택)")}</div>`;
    const svg = el.querySelector("svg");
    const hv = svg.querySelector(".dv-hv");
    const tip = el.querySelector(".dv-tip");
    const it = interact(svg, n, xs, (i) => { hv.setAttribute("x1", xs(i)); hv.setAttribute("x2", xs(i)); hv.setAttribute("visibility", "visible"); tip.innerHTML = o.tip(i); });
    svg.addEventListener("click", () => { const i = it.cur(); if (i >= 0 && o.onPick) o.onPick(o.rows[i].year); });
    svg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const i = it.cur(); if (i >= 0 && o.onPick) o.onPick(o.rows[i].year); } });
  }

  // ---------------------------------------------------------------- 강수 유무 칸(해마다 한 칸): 물방울 = 강수, 빈 원 = 강수 없음, 빗금 = 자료 없음, 흐린 × = 그해 없는 날짜·미래
  function rainCells(rows, { onPick = null, selected = [] } = {}) {
    return `<div class="dv-cells" role="list">${rows.map((r) => {
      const st = r.rainy === true ? "wet" : r.rainy === false ? "dry" : r.status === "ok" || r.status === "missing" ? "miss" : "na";
      const ic = st === "wet" ? `<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M6 1C6 1 1.5 6.6 1.5 9.2a4.5 4.5 0 0 0 9 0C10.5 6.6 6 1 6 1Z" fill="#2f6fd6"/></svg>` : st === "dry" ? `<svg viewBox="0 0 12 14" aria-hidden="true"><circle cx="6" cy="8" r="3.6" fill="none" stroke="#8aa0bd" stroke-width="1.4"/></svg>` : st === "miss" ? `<svg viewBox="0 0 12 14" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="9" fill="#e9eef6" stroke="#a7b3c6"/><path d="M2 12 10 4" stroke="#a7b3c6"/></svg>` : `<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M3 5l6 6M9 5l-6 6" stroke="#c4cddb" stroke-width="1.3"/></svg>`;
      return `<button type="button" role="listitem" class="dv-cell ${st}${selected.includes(r.year) ? " sel" : ""}" data-year="${r.year}" title="${esc(`${r.year}년 ${r.label}`)}" aria-label="${esc(`${r.year}년 ${r.label}`)}">${ic}<small>${String(r.year).slice(2)}</small></button>`;
    }).join("")}</div>`;
  }

  // ---------------------------------------------------------------- 연도 × 시간 히트맵(공통 색 범위)
  // o: { rows: [{ year, label, values[24], status[24], dim }], kind: "ta"|"rn"|"ws"|"hm", diff, unit, digits, onPick(year,h) }
  function colorOf(kind, diff, t) {
    // t: 0~1
    const lerp = (a, b, k) => Math.round(a + (b - a) * k);
    const mix = (c1, c2, k) => `rgb(${lerp(c1[0], c2[0], k)},${lerp(c1[1], c2[1], k)},${lerp(c1[2], c2[2], k)})`;
    if (diff) return t < 0.5 ? mix([37, 99, 235], [248, 250, 252], t * 2) : mix([248, 250, 252], [220, 38, 38], (t - 0.5) * 2);
    if (kind === "ta") return t < 0.5 ? mix([59, 130, 246], [253, 230, 138], t * 2) : mix([253, 230, 138], [220, 38, 38], (t - 0.5) * 2);
    if (kind === "rn") return mix([239, 246, 255], [30, 64, 175], Math.sqrt(t));
    if (kind === "ws") return mix([240, 253, 250], [15, 118, 110], t);
    return mix([247, 254, 231], [21, 128, 61], t);
  }
  function heatmap(el, o) {
    const vals = o.rows.flatMap((r) => r.values.filter(fin));
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (o.diff) { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; }
    if (o.kind === "rn" && !o.diff) lo = 0;
    if (hi === lo) hi = lo + 1;
    const id = `dv${++uid}`;
    const cw = 22, ch = 16, L = 46, T = 18;
    const W = L + cw * 24 + 4;
    const H = T + ch * o.rows.length + 4;
    let g = `<svg class="dv-heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(o.aria || "연도 × 시간 히트맵")}"><defs>${hatch(`${id}h`)}</defs>`;
    for (let h = 0; h < 24; h += 3) g += `<text class="dv-ax" x="${L + h * cw + cw / 2}" y="12" text-anchor="middle">${h}시</text>`;
    o.rows.forEach((r, ri) => {
      const y = T + ri * ch;
      g += `<text class="dv-ax${r.sel ? " dv-ax-sel" : ""}" x="${L - 5}" y="${y + ch - 4}" text-anchor="end">${r.year}</text>`;
      if (r.dim) { g += `<rect x="${L}" y="${y}" width="${cw * 24 - 1}" height="${ch - 1}" fill="url(#${id}h)" opacity=".45"/><text class="dv-ax" x="${L + 6}" y="${y + ch - 4}">${esc(r.dim)}</text>`; return; }
      for (let h = 0; h < 24; h++) {
        const v = r.values[h];
        const x = L + h * cw;
        if (fin(v)) g += `<rect data-r="${ri}" data-h="${h}" x="${x}" y="${y}" width="${cw - 1}" height="${ch - 1}" fill="${colorOf(o.kind, o.diff, (v - lo) / (hi - lo))}"/>`;
        else g += `<rect data-r="${ri}" data-h="${h}" x="${x}" y="${y}" width="${cw - 1}" height="${ch - 1}" fill="url(#${id}h)"/>`;
      }
      if (r.sel) g += `<rect x="${L - 1}" y="${y - 0.5}" width="${cw * 24 + 1}" height="${ch}" fill="none" stroke="#e8590c" stroke-width="1.6"/>`;
    });
    g += `<rect class="dv-hc" x="0" y="0" width="${cw - 1}" height="${ch - 1}" fill="none" stroke="#0d1b3d" stroke-width="2" visibility="hidden"/></svg>`;
    const steps = 6;
    const legend = `<div class="dv-scale"><span>${fmt(lo, o.digits)}${esc(o.unit)}</span>${Array.from({ length: steps }, (_, k) => `<i style="background:${colorOf(o.kind, o.diff, k / (steps - 1))}"></i>`).join("")}<span>${fmt(hi, o.digits)}${esc(o.unit)}</span><span class="dv-lgmiss"><i class="hatch"></i>자료 없음</span>${o.kind === "rn" ? `<span>0mm = 가장 옅은 색(실제 0)</span>` : ""}</div>`;
    el.innerHTML = `${legend}<div class="dv-heat-wrap">${g}</div><div class="dv-tip" aria-live="polite">${esc("칸을 누르거나 방향키로 값을 확인하세요")}</div>`;
    const svg = el.querySelector("svg");
    const hc = svg.querySelector(".dv-hc");
    const tip = el.querySelector(".dv-tip");
    let cr = 0;
    let chh = -1;
    const show = (ri, h) => {
      cr = Math.max(0, Math.min(o.rows.length - 1, ri)); chh = Math.max(0, Math.min(23, h));
      hc.setAttribute("x", L + chh * cw); hc.setAttribute("y", T + cr * ch); hc.setAttribute("visibility", "visible");
      tip.innerHTML = o.tip(o.rows[cr], chh);
    };
    svg.addEventListener("click", (e) => { const t = e.target.closest("rect[data-r]"); if (t) { show(+t.dataset.r, +t.dataset.h); if (o.onPick) o.onPick(o.rows[cr].year, chh); } });
    svg.addEventListener("keydown", (e) => {
      const k = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (k) { e.preventDefault(); show(cr + k[0], (chh < 0 ? 0 : chh) + k[1]); }
    });
    return { lo, hi };
  }
  window.DViz = { esc, fin, rnd, fmt, sgn, SEL, CASE, MEAN, hourChart, yearChart, rainCells, heatmap, niceRange };
})();
