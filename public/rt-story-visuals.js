// 작은 그래프(astra 2장·9-1, 3단계): 이야기 카드(story.chart)·히어로 분포 띠·과거 유사일 겹쳐 보기·앞으로 12시간 공용 시간축·구간별 옷차림.
//   값은 서버 응답 그대로(지어내지 않음). 색만으로 구분하지 않음: 관측 = 실선·채움, 예보 = 점선·빈 칸, 결측 = 끊김·빗금. 그림 설명(aria-label)은 사실 문장.
//   움직임 없음(자동 회전 없음, 탭으로 고름). 카드 그래프는 화면에 들어올 때 그림(추가 요청 없음 — 이미 받은 응답만 씀).
(() => {
  const W = (typeof window !== "undefined" ? window : globalThis);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const f1 = (v) => (fin(v) ? String(r1(v)) : "–");
  const hh = (t) => +String(t).slice(11, 13);
  const md = (ymd) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}`;
  const C = { obs: "#0d1b3d", fc: "#026ef8", band: "#9cc4ff", mean: "#5e7090", grid: "#e0e8f4", muted: "#5e7090", wet: "#2f6fd6", warn: "#c0262d", seg: "#fff4d6" };
  let uid = 0;
  const hatch = (id) => `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#9aa8bd" stroke-width="1.6"/></pattern>`;
  const svgOpen = (w, h, label, extraDefs = "") => { const id = `vz${++uid}`; return { id, s: `<svg class="vz-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><defs>${hatch(`${id}h`)}${extraDefs}</defs>` }; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fig = (svg, cap, cls = "") => `<figure class="vz ${cls}">${svg}${cap ? `<figcaption class="vz-cap">${cap}</figcaption>` : ""}</figure>`;
  const LEG = {
    obs: `<span class="vz-lg"><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="${C.obs}" stroke-width="2.4"/></svg>관측</span>`,
    fc: `<span class="vz-lg"><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="${C.fc}" stroke-width="2.4" stroke-dasharray="4 3"/></svg>예보</span>`,
    miss: `<span class="vz-lg"><svg width="12" height="10" aria-hidden="true"><defs>${hatch("lgh")}</defs><rect x="1" y="1" width="10" height="8" fill="url(#lgh)" stroke="#9aa8bd"/></svg>자료 없음</span>`,
  };
  const legend = (...ks) => `<span class="vz-lgs">${ks.map((k) => LEG[k] || k).join("")}</span>`;

  // ---------------------------------------------------------------- 1) 분포 띠(p10~p90 보통 범위·평균·지금 값·최저/최고)
  function dist(c, { width = 340, lead = false } = {}) {
    if (!c || !fin(c.p10) || !fin(c.p90) || !fin(c.value)) return fig("", `<span class="rt-ins">분포 비교: 자료 부족${c?.N != null ? `(표본 ${c.N}개)` : ""}</span>`);
    const u = c.unit || "", lo0 = Math.min(...[c.min, c.p10, c.value].filter(fin)), hi0 = Math.max(...[c.max, c.p90, c.value].filter(fin));
    const pad = (hi0 - lo0) * 0.04 || 1, lo = lo0 - pad, hi = hi0 + pad;
    const L = 8, R = 8, x = (v) => L + ((v - lo) / (hi - lo)) * (width - L - R);
    const fc = c.valueKind === "fcst";
    const word = c.word || (fc ? "예보" : "지금");
    const label = `${c.label || "값"} ${word} ${f1(c.value)}${u}. ${c.range ? `${c.range}년 ` : ""}같은 시기 ${c.N}개 중 보통 범위(10~90%) ${c.p10}~${c.p90}${u}, 평균 ${f1(c.mean)}${u}${fin(c.min) && fin(c.max) ? `, 최저 ${c.min}${u}·최고 ${c.max}${u}` : ""}.`;
    const o = svgOpen(width, 58, label);
    let s = o.s;
    if (fin(c.min) && fin(c.max)) s += `<rect x="${x(c.min)}" y="24" width="${Math.max(1, x(c.max) - x(c.min))}" height="8" rx="4" fill="#e3ecf8"/>`;
    s += `<rect x="${x(c.p10)}" y="21" width="${Math.max(2, x(c.p90) - x(c.p10))}" height="14" rx="4" fill="${C.band}" fill-opacity=".55" stroke="#4d79b8" stroke-width="1"/>`;
    s += `<text x="${(x(c.p10) + x(c.p90)) / 2}" y="31.5" font-size="9.5" text-anchor="middle" fill="#163d73">${x(c.p90) - x(c.p10) > 74 ? "보통 범위" : ""}</text>`;
    if (fin(c.mean)) s += `<line x1="${x(c.mean)}" x2="${x(c.mean)}" y1="17" y2="39" stroke="${C.mean}" stroke-width="2"/>`;
    const vx = x(c.value);
    s += fc ? `<circle cx="${vx}" cy="28" r="6.5" fill="#fff" stroke="${C.fc}" stroke-width="2.4" stroke-dasharray="3 2"/>` : `<circle cx="${vx}" cy="28" r="6.5" fill="${C.obs}" stroke="#fff" stroke-width="2"/>`;
    const ta = (px, w) => (px < w ? "start" : px > width - w ? "end" : "middle");
    s += `<text x="${clamp(vx, 2, width - 2)}" y="12" font-size="11.5" font-weight="700" text-anchor="${ta(vx, 30)}" fill="${fc ? C.fc : C.obs}">${word} ${f1(c.value)}${u}</text>`;
    const bottom = [];
    if (fin(c.mean)) bottom.push([x(c.mean), `평균 ${f1(c.mean)}`]);
    bottom.push([x(c.p10), String(c.p10)], [x(c.p90), String(c.p90)]);
    // 아래 줄: 평균 우선, 10·90% 값은 겹치지 않을 때만
    const placed = [];
    for (const [px, t] of bottom) { const w = t.length * 6 + 6; if (placed.some(([q, qw]) => Math.abs(q - px) < (w + qw) / 2)) continue; placed.push([px, w]); s += `<text x="${clamp(px, 2, width - 2)}" y="52" font-size="10.5" text-anchor="${ta(px, w / 2)}" fill="${C.muted}">${esc(t)}</text>`; }
    s += `</svg>`;
    const cap = `<span class="vz-key"><i class="k-band"></i>보통 범위(10~90%) ${c.p10}~${c.p90}${esc(u)}</span><span class="vz-key"><i class="k-mean"></i>평균 ${f1(c.mean)}${esc(u)}</span><span class="vz-key"><i class="k-dot${fc ? " fc" : ""}"></i>${word} ${f1(c.value)}${esc(u)}</span>${fin(c.min) && fin(c.max) ? `<span class="vz-key">최저 ${c.min}${esc(u)}${c.minDate ? `(${esc(c.minDate.slice(0, 4))})` : ""} ~ 최고 ${c.max}${esc(u)}${c.maxDate ? `(${esc(c.maxDate.slice(0, 4))})` : ""}</span>` : ""}<span class="vz-key">${c.range ? `${esc(c.range)}년 ` : ""}같은 시기 표본 ${c.N}개</span>`;
    return fig(s, cap, `vz-dist${lead ? " is-lead" : ""}`);
  }

  // ---------------------------------------------------------------- 2) 최근 30일 강수 달력(R01·R02): 비 온 날 채움·안 온 날 빈 칸·결측 빗금·오늘(아직) 점선
  function calendar(c, { width = 340 } = {}) {
    const ds = c.days || []; if (!ds.length) return "";
    const n = ds.length, L = 4, cw = (width - L * 2) / n, sz = Math.min(cw - 1.5, 12);
    const cnt = (k) => ds.filter((d) => d.state === k).length;
    const runN = ds.filter((d) => d.date >= c.from && d.date <= c.to).length;
    const label = `최근 ${n}일 강수: 비 온 날 ${cnt("wet")}일, 안 온 날 ${cnt("dry")}일, 자료 없음 ${cnt("missing")}일, 오늘은 아직 끝나지 않음. ${md(c.from)}~${md(c.to)} ${runN}일 연속 ${c.side === "wet" ? "강수" : "무강수"}.`;
    const o = svgOpen(width, 56, label);
    let s = o.s;
    const i0 = ds.findIndex((d) => d.date === c.from), i1 = ds.findIndex((d) => d.date === c.to);
    if (i0 >= 0 && i1 >= 0) { const xa = L + i0 * cw, xb = L + (i1 + 1) * cw; s += `<path d="M${xa + 1},14 v-5 H${xb - 1} v5" fill="none" stroke="${C.warn}" stroke-width="1.6"/><text x="${(xa + xb) / 2}" y="7" font-size="10" text-anchor="middle" fill="${C.warn}" font-weight="700">${runN}일 연속</text>`; }
    ds.forEach((d, i) => {
      const x = L + i * cw + (cw - sz) / 2, y = 18;
      const st = d.state;
      s += st === "wet" ? `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" rx="2" fill="${C.wet}"/>`
        : st === "dry" ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${sz - 1}" height="${sz - 1}" rx="2" fill="#fff" stroke="#9aa8bd"/>`
        : st === "missing" ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${sz - 1}" height="${sz - 1}" rx="2" fill="url(#${o.id}h)" stroke="#9aa8bd"/>`
        : `<rect x="${x + 0.5}" y="${y + 0.5}" width="${sz - 1}" height="${sz - 1}" rx="2" fill="none" stroke="${C.fc}" stroke-dasharray="2 1.5"/>`;
      s += `<title>${esc(d.date)} ${st === "wet" ? `비 ${d.mm}mm` : st === "dry" ? "강수 없음(0.1mm 미만)" : st === "missing" ? "자료 없음" : "오늘 — 아직 끝나지 않음"}</title>`;
    });
    const tick = (i) => `<text x="${L + i * cw + cw / 2}" y="46" font-size="10" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" fill="${C.muted}">${i === n - 1 ? "오늘" : md(ds[i].date)}</text>`;
    s += tick(0) + tick(Math.floor(n / 2)) + tick(n - 1) + `</svg>`;
    const sw = (inner) => `<svg width="11" height="11" aria-hidden="true"><defs>${hatch(`cl${uid}`)}</defs>${inner}</svg>`;
    const cap = `<span class="vz-key">${sw(`<rect x="1" y="1" width="9" height="9" rx="2" fill="${C.wet}"/>`)}강수일 ${cnt("wet")}</span><span class="vz-key">${sw(`<rect x="1.5" y="1.5" width="8" height="8" rx="2" fill="#fff" stroke="#9aa8bd"/>`)}무강수 ${cnt("dry")}</span><span class="vz-key">${sw(`<rect x="1.5" y="1.5" width="8" height="8" rx="2" fill="url(#cl${uid})" stroke="#9aa8bd"/>`)}결측 ${cnt("missing")}</span><span class="vz-key">${sw(`<rect x="1.5" y="1.5" width="8" height="8" rx="2" fill="none" stroke="${C.fc}" stroke-dasharray="2 1.5"/>`)}아직 안 온 날</span><span class="vz-key"><svg width="16" height="9" aria-hidden="true"><path d="M1,8 v-6 H15 v6" fill="none" stroke="#c0262d" stroke-width="1.6"/></svg>${md(c.from)}~${md(c.to)} 연속 ${runN}일</span>`;
    return fig(s, cap, "vz-cal");
  }

  // ---------------------------------------------------------------- 3) 최고·최저 막대(T01·T02): 예보(점선 테) vs 같은 시기 평균(실선)
  function range(c, { width = 340 } = {}) {
    const vals = [c.max, c.min, c.meanMax, c.meanMin, c.lowest].filter(fin); if (vals.length < 2) return "";
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1), L = 54, R = 30, x = (v) => L + ((v - lo) / (hi - lo)) * (width - L - R);
    const label = `${md(c.date)} 예보 최저 ${f1(c.min)}℃ · 최고 ${f1(c.max)}℃, 같은 시기 평균 최저 ${f1(c.meanMin)}℃ · 최고 ${f1(c.meanMax)}℃${fin(c.lowest) ? `, 같은 시기 가장 낮았던 최저 ${c.lowest}℃` : ""}.`;
    const o = svgOpen(width, 74, label);
    let s = o.s;
    const row = (y, a, b, name, fc) => {
      s += `<text x="0" y="${y + 4}" font-size="11" fill="${C.muted}">${name}</text>`;
      if (!fin(a) || !fin(b)) { s += `<rect x="${L}" y="${y - 6}" width="${width - L - R}" height="12" fill="url(#${o.id}h)" opacity=".6"/><text x="${L + 4}" y="${y + 4}" font-size="10.5">자료 없음</text>`; return; }
      s += fc ? `<rect x="${x(a)}" y="${y - 6}" width="${Math.max(2, x(b) - x(a))}" height="12" rx="6" fill="#e8f1ff" stroke="${C.fc}" stroke-width="2" stroke-dasharray="4 3"/>` : `<rect x="${x(a)}" y="${y - 6}" width="${Math.max(2, x(b) - x(a))}" height="12" rx="6" fill="#b9c6d8"/>`;
      s += `<text x="${x(a) - 3}" y="${y + 4}" font-size="11" text-anchor="end" font-weight="${fc ? 700 : 400}">${f1(a)}</text><text x="${x(b) + 3}" y="${y + 4}" font-size="11" font-weight="${fc ? 700 : 400}">${f1(b)}</text>`;
    };
    row(18, c.min, c.max, `${md(c.date)} 예보`, true);
    row(44, c.meanMin, c.meanMax, "평균", false);
    if (fin(c.lowest)) s += `<line x1="${x(c.lowest)}" x2="${x(c.lowest)}" y1="34" y2="54" stroke="${C.obs}" stroke-width="1.5"/><text x="${clamp(x(c.lowest), 2, width - 2)}" y="68" font-size="10" text-anchor="${x(c.lowest) < 110 ? "start" : x(c.lowest) > width - 110 ? "end" : "middle"}" fill="${C.muted}">같은 시기 가장 낮은 최저 ${c.lowest}℃${c.lowestDate ? `(${c.lowestDate.slice(0, 4)})` : ""}</text>`;
    s += `</svg>`;
    return fig(s, `${legend("fc")}<span class="vz-key"><i class="k-mean2"></i>${c.range ? `${esc(c.range)}년 ` : ""}같은 시기 평균(관측${c.N ? ` ${c.N}개` : ""})</span>${fin(c.d) ? `<span class="vz-key">예보 일교차 ${f1(c.d)}℃${fin(c.meanD) ? ` · 평균 ${f1(c.meanD)}℃` : ""}</span>` : ""}`, "vz-range");
  }

  // ---------------------------------------------------------------- 4) 시간 선(T03 강조 구간, N01 25℃ 선): 관측 실선·예보 점선, 결측은 끊김
  function line(c, { width = 340 } = {}) {
    const ps = (c.points || []); if (ps.length < 2) return "";
    const vals = ps.map((p) => p.ta).filter(fin).concat(fin(c.threshold) ? [c.threshold] : []); if (!vals.length) return "";
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1), L = 26, R = 8, T = c.hl ? 20 : 10, B = 20, H = c.hl ? 106 : 96;
    const t0 = Date.parse(ps[0].time.replace(" ", "T") + "Z"), span = (Date.parse(ps.at(-1).time.replace(" ", "T") + "Z") - t0) / 36e5 || 1;
    const x = (t) => L + ((Date.parse(t.replace(" ", "T") + "Z") - t0) / 36e5 / span) * (width - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ms = (t) => Date.parse(t.replace(" ", "T") + "Z");
    const path = (kind) => { let d = "", pen = false, pt = null; for (const p of ps) { if (p.kind !== kind || !fin(p.ta)) { pen = false; pt = null; continue; } const gap = pt && ms(p.time) - ms(pt) > 36e5; d += `${pen && !gap ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.ta).toFixed(1)}`; pen = true; pt = p.time; } return d; };
    let label;
    if (c.type === "night") { const lowP = ps.filter((p) => fin(p.ta)).reduce((a, b) => (b.ta < a.ta ? b : a)); label = `${hh(ps[0].time)}시~다음 날 ${hh(ps.at(-1).time)}시 기온, 가장 낮은 ${hh(lowP.time)}시 ${lowP.ta}℃ — ${c.threshold}℃ 선 위(추정).`; }
    else { const a = ps.find((p) => p.time === c.hl?.[0]), b = ps.find((p) => p.time === c.hl?.[1]); label = a && b ? `${hh(a.time)}시 ${a.ta}℃에서 ${hh(b.time)}시 ${b.ta}℃로 3시간 ${c.d > 0 ? "+" : ""}${c.d}℃${fin(c.usual) ? `(같은 시각 평소 변화 평균 ${c.usual > 0 ? "+" : ""}${c.usual}℃)` : ""}.` : "시간별 기온"; }
    const o = svgOpen(width, H, label);
    let s = o.s;
    const step = hi - lo > 10 ? 4 : 2;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) s += `<line x1="${L}" x2="${width - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${L - 4}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="${C.muted}">${v}</text>`;
    if (c.hl) { const xa = x(c.hl[0]), xb = x(c.hl[1]); s += `<rect x="${xa}" y="${T}" width="${xb - xa}" height="${H - T - B}" fill="#ffe7c2" opacity=".75"/><rect x="${xa}" y="${T - 14}" width="${xb - xa}" height="14" fill="#ffe7c2" opacity=".75"/><text x="${clamp((xa + xb) / 2, L + 30, width - 40)}" y="${T - 3}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#8a4b00">3시간 ${c.d > 0 ? "+" : ""}${c.d}℃</text>`; }
    if (fin(c.threshold)) s += `<line x1="${L}" x2="${width - R}" y1="${y(c.threshold)}" y2="${y(c.threshold)}" stroke="${C.warn}" stroke-width="1.4" stroke-dasharray="1 0"/><text x="${width - R}" y="${y(c.threshold) - 3}" font-size="10.5" text-anchor="end" fill="${C.warn}" font-weight="700">${c.threshold}℃</text>`;
    s += `<path d="${path("obs")}" fill="none" stroke="${C.obs}" stroke-width="2.6"/><path d="${path("fcst")}" fill="none" stroke="${C.fc}" stroke-width="2.4" stroke-dasharray="5 4"/>`;
    ps.forEach((p, i) => { if (i % 3 === 0 || i === ps.length - 1) s += `<text x="${x(p.time)}" y="${H - 6}" font-size="10" text-anchor="${i === 0 ? "start" : i === ps.length - 1 ? "end" : "middle"}" fill="${C.muted}">${hh(p.time)}시</text>`; });
    s += `</svg>`;
    return fig(s, legend(...(ps.some((p) => p.kind === "obs") ? ["obs"] : []), ...(ps.some((p) => p.kind === "fcst") ? ["fc"] : [])) + (ps.some((p) => !fin(p.ta)) ? legend("빈 곳 = 자료 없음") : ""), `vz-line${c.type === "night" ? " vz-night" : ""}`);
  }

  // ---------------------------------------------------------------- 5) 출퇴근 시간 띠(L01): 구간 음영, 시간마다 강수형태(채움)·강수확률(높이), 확률 없음 빗금 — 모두 예보
  function commute(c, { width = 340 } = {}) {
    const hs = c.hours || []; if (!hs.length) return "";
    const L = 34, R = 6, n = hs.length, cw = (width - L - R) / n, H = 82;
    const ptyH = hs.filter((h) => h.overlap && h.pty && h.pty !== "없음");
    const popMax = Math.max(-1, ...hs.filter((h) => h.overlap && fin(h.pop)).map((h) => h.pop));
    const label = `${c.leg === "am" ? "출근" : "퇴근"} ${c.a}~${c.b}시 예보: ${ptyH.length ? `${ptyH.map((h) => `${hh(h.intervalStart)}~${hh(h.intervalEnd)}시 ${h.pty}`).join(", ")}` : "강수형태 없음"}${popMax >= 0 ? `, 강수확률 최고 ${popMax}%` : ""}.`;
    const o = svgOpen(width, H, label);
    let s = o.s;
    const xi = (i) => L + i * cw;
    const i0 = hs.findIndex((h) => h.overlap), i1 = hs.length - 1 - [...hs].reverse().findIndex((h) => h.overlap);
    if (i0 >= 0) s += `<rect x="${xi(i0)}" y="2" width="${(i1 - i0 + 1) * cw}" height="${H - 18}" fill="${C.seg}" stroke="#e0b44c"/><text x="${xi(i0) + 3}" y="12" font-size="10.5" font-weight="700" fill="#8a4b00">${c.leg === "am" ? "출근" : "퇴근"} ${c.a}~${c.b}시</text>`;
    s += `<text x="0" y="34" font-size="10.5" fill="${C.muted}">강수</text><text x="0" y="58" font-size="10.5" fill="${C.muted}">확률</text>`;
    hs.forEach((h, i) => {
      const x = xi(i) + 2, w = cw - 4, wet = h.pty && h.pty !== "없음";
      s += wet ? `<rect x="${x}" y="22" width="${w}" height="16" rx="3" fill="${C.wet}"/><text x="${x + w / 2}" y="34" font-size="10" fill="#fff" text-anchor="middle">${esc(h.pty.length > 2 ? h.pty.slice(0, 2) : h.pty)}</text>` : h.pty == null ? `<rect x="${x}" y="22" width="${w}" height="16" rx="3" fill="url(#${o.id}h)"/>` : `<rect x="${x + 0.5}" y="22.5" width="${w - 1}" height="15" rx="3" fill="#fff" stroke="#c7d2e2" stroke-dasharray="3 2"/>`;
      if (fin(h.pop)) { const bh = (h.pop / 100) * 18; s += `<rect x="${x}" y="${64 - bh}" width="${w}" height="${bh}" fill="${h.pop >= (c.popHigh || 60) ? C.fc : "#a9c6f5"}" stroke="${C.fc}" stroke-dasharray="2 1.5"/><text x="${x + w / 2}" y="${44 + 9}" font-size="9" text-anchor="middle" fill="${C.muted}">${cw > 24 || i % 2 === 0 ? h.pop : ""}</text>`; }
      else s += `<rect x="${x}" y="46" width="${w}" height="18" fill="url(#${o.id}h)"/>`;
      if (i % (cw < 22 ? 2 : 1) === 0) s += `<text x="${xi(i) + cw}" y="${H - 4}" font-size="9.5" text-anchor="middle" fill="${C.muted}">${hh(h.intervalEnd)}</text>`;
    });
    s += `</svg>`;
    return fig(s, `<span class="vz-key"><i class="k-wet"></i>강수형태 예보(그 시각 앞 1시간)</span><span class="vz-key">막대 = 강수확률(%)·짙은 막대 ${c.popHigh || 60}% 이상</span>${legend("miss")}<span class="vz-key">모두 예보</span>`, "vz-commute");
  }

  // ---------------------------------------------------------------- 6) 하늘 바뀜 띠(C01): 시간마다 하늘 그림, 바뀌는 시각 테두리
  function sky(c) {
    const hs = c.hours || []; if (!hs.length || !W.RTArt) return "";
    const A = W.RTArt;
    const label = `하늘상태 예보: ${hs.map((h) => `${hh(h.time)}시 ${h.pty && h.pty !== "없음" ? h.pty : h.sky || "자료 없음"}`).join(", ")}.`;
    return `<figure class="vz vz-sky" role="img" aria-label="${esc(label)}"><div class="vz-skyrow">${hs.map((h) => { const t = h.pty && h.pty !== "없음" ? h.pty : h.sky; return `<div class="vz-skyc${h.time === c.at ? " at" : ""}${t ? "" : " miss"}"><span>${hh(h.time)}시</span>${t ? A.iconSvg(A.kind(h.sky, h.pty), A.night(hh(h.time)), 24, t) : `<i class="vz-hx" aria-hidden="true"></i>`}<small>${esc(t || "자료 없음")}</small></div>`; }).join("")}</div><figcaption class="vz-cap"><span class="vz-key">테두리 = 바뀌는 시각</span><span class="vz-key">모두 예보</span></figcaption></figure>`;
  }

  function chart(c) {
    if (!c) return "";
    try {
      switch (c.type) {
        case "dist": return dist(c);
        case "calendar": return calendar(c);
        case "range": return range(c);
        case "line": case "night": return line(c);
        case "commute": return commute(c);
        case "sky": return sky(c);
        default: return "";
      }
    } catch (e) { return ""; }
  }
  // 카드 안 자리표시(data-viz)에 보일 때 그리기
  const store = new Map();
  let vid = 0;
  const slot = (c) => { if (!c) return ""; const k = `v${++vid}`; store.set(k, c); return `<div class="rts-viz" data-viz="${k}"></div>`; };
  function mount(root = document) {
    const els = [...root.querySelectorAll("[data-viz]:not([data-vz-done])")];
    const draw = (el) => { el.dataset.vzDone = "1"; const c = store.get(el.dataset.viz); el.innerHTML = chart(c); store.delete(el.dataset.viz); };
    if (!("IntersectionObserver" in W)) return els.forEach(draw);
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); draw(e.target); } }, { rootMargin: "200px 200px" });
    els.forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------- 7) 과거 유사일 겹쳐 보기: 오늘(굵은 실선) vs 고른 과거 날(가는 실선 + 끝 표지), 1~3위 중 탭으로 고름
  function simOverlay(r, i = 0, { width = 340 } = {}) {
    const b = r?.top?.[i], tg = r?.target?.ta, hu = r?.hoursUsed;
    if (!b || !Array.isArray(tg) || !Array.isArray(hu) || !Array.isArray(b.ta)) return "";
    const vals = tg.concat(b.ta).filter(fin); if (!vals.length) return "";
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1), L = 26, R = 50, T = 8, B = 20, H = 120;
    const x = (h) => L + (h / 23) * (width - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const path = (arr) => { let d = "", pen = false, ph = null; arr.forEach((v, k) => { const h = hu[k]; if (!fin(v) || (ph != null && h - ph > 1)) pen = false; if (!fin(v)) { ph = null; return; } d += `${pen ? "L" : "M"}${x(h).toFixed(1)},${y(v).toFixed(1)}`; pen = true; ph = h; }); return d; };
    const lastK = (arr) => { for (let k = arr.length - 1; k >= 0; k--) if (fin(arr[k])) return k; return -1; };
    const tk = lastK(tg), bk = lastK(b.ta);
    const dayW = r.day === "yesterday" ? "어제" : "오늘";
    const label = `${dayW} ${hu[0]}~${hu.at(-1)}시 기온과 ${b.date}의 같은 시각 기온 겹쳐 보기, 차이(RMSE) ${b.rmse}℃.`;
    const o = svgOpen(width, H, label);
    let s = o.s;
    const step = hi - lo > 10 ? 4 : 2;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) s += `<line x1="${L}" x2="${width - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${L - 4}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="${C.muted}">${v}</text>`;
    for (let h = 0; h <= 23; h += 6) s += `<text x="${x(h)}" y="${H - 5}" font-size="10" text-anchor="middle" fill="${C.muted}">${h}시</text>`;
    s += `<path d="${path(b.ta)}" fill="none" stroke="#8a4b00" stroke-width="1.8"/><path d="${path(tg)}" fill="none" stroke="${C.obs}" stroke-width="3"/>`;
    if (tk >= 0) s += `<circle cx="${x(hu[tk])}" cy="${y(tg[tk])}" r="3.5" fill="${C.obs}"/><text x="${x(hu[tk]) + 5}" y="${y(tg[tk]) + (bk >= 0 && tg[tk] >= b.ta[bk] ? -4 : 12)}" font-size="10.5" font-weight="700" fill="${C.obs}">${dayW}</text>`;
    if (bk >= 0) s += `<rect x="${x(hu[bk]) - 3}" y="${y(b.ta[bk]) - 3}" width="6" height="6" fill="#8a4b00"/><text x="${x(hu[bk]) + 5}" y="${y(b.ta[bk]) + (tk >= 0 && tg[tk] >= b.ta[bk] ? 12 : -4)}" font-size="10.5" fill="#8a4b00">${b.date.slice(0, 4)}</text>`;
    s += `</svg>`;
    const btns = r.top.slice(0, 3).map((x2, k) => `<button type="button" class="vz-pick" data-simpick="${k}" aria-pressed="${k === i}">${k + 1}위 ${esc(x2.date)}</button>`).join("");
    return `<div class="vz-simov"><div class="vz-picks" role="group" aria-label="겹쳐 볼 과거 날 고르기">${btns}</div>${fig(s, `<span class="vz-key"><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="${C.obs}" stroke-width="3"/></svg>${dayW}(관측, ●)</span><span class="vz-key"><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="#8a4b00" stroke-width="1.8"/></svg>${esc(b.date)}(관측, ■)</span><span class="vz-key">RMSE ${b.rmse}℃${b.max != null ? ` · 그날 최고 ${b.max}℃ · 최저 ${b.min}℃` : ""}</span>${hu.length < 24 ? `<span class="vz-key">${hu[0]}~${hu.at(-1)}시만 비교</span>` : ""}`, "vz-sim")}</div>`;
  }

  // ---------------------------------------------------------------- 8) 하루 구간(9-1): 출근·낮·퇴근·밤, 나중에 기기 설정(6단계)으로 바꿀 수 있게 localStorage 모양
  const SEG_KEY = "nw.segments";
  const SEG_DEFAULT = [{ id: "am", label: "출근", from: 7, to: 9 }, { id: "day", label: "낮", from: 12, to: 15 }, { id: "pm", label: "퇴근", from: 18, to: 20 }, { id: "night", label: "밤", from: 21, to: 6 }];
  function loadSegs() {
    try {
      const v = JSON.parse(W.localStorage?.getItem(SEG_KEY) || "null");
      if (Array.isArray(v) && v.length && v.every((s) => s && typeof s.label === "string" && Number.isInteger(s.from) && Number.isInteger(s.to) && s.from >= 0 && s.from < 24 && s.to >= 0 && s.to < 24 && s.from !== s.to)) return v.slice(0, 6).map((s, i) => ({ id: String(s.id || `s${i}`), label: s.label.slice(0, 8), from: s.from, to: s.to }));
    } catch {}
    return SEG_DEFAULT.map((s) => ({ ...s }));
  }
  const WEAR = [[28, "민소매·반바지"], [23, "반팔·얇은 셔츠"], [20, "얇은 가디건·긴팔"], [17, "맨투맨·얇은 니트"], [12, "자켓·가디건"], [9, "트렌치코트·야상"], [5, "코트·히트텍"], [-99, "패딩·목도리"]];
  const wearOf = (t) => WEAR.find(([lo]) => t >= lo)[1];
  const pad = (n) => String(n).padStart(2, "0");
  const addDay = (ymd, k) => new Date(Date.parse(`${ymd}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);
  const RULE = { easyLayerSeg: 8, easyLayerDay: 10, wind: 5, hotT: 25, hotRH: 70, popHigh: 60 };
  // obsHours: [{time, ta}] (오늘 실황·관측), fc: 예보 hours[{time, ta, hm, ws, pty, pop, items}], days: 예보 일자료[{date, max, min}]
  function segOccurrence(seg, nowW) {
    const ymd = nowW.slice(0, 10);
    for (const k of [-1, 0, 1]) {
      const d = addDay(ymd, k);
      const startW = `${d} ${pad(seg.from)}:00:00`, endW = `${seg.to < seg.from ? addDay(d, 1) : d} ${pad(seg.to)}:00:00`;
      if (endW > `${nowW}:00`.slice(0, 19)) return { ...seg, date: d, startW, endW };
    }
    return null;
  }
  function segment(seg, { nowW, obsHours = [], fc = [], days = [], current = null }) {
    const occ = segOccurrence(seg, nowW); if (!occ) return null;
    const inT = (t) => t >= occ.startW && t <= occ.endW;
    const hrs = new Map();
    for (const o of obsHours) if (inT(o.time) && fin(o.ta)) hrs.set(o.time, { time: o.time, ta: o.ta, kind: "obs" });
    if (current && inT(current.time) && fin(current.ta)) hrs.set(current.time, { time: current.time, ta: current.ta, hm: current.hm, ws: current.ws, kind: "obs" });
    for (const h of fc) if (inT(h.time) && !hrs.has(h.time)) hrs.set(h.time, { ...h, kind: "fcst" });
    const list = [...hrs.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const expected = (seg.to < seg.from ? seg.to + 24 : seg.to) - seg.from + 1;
    const tas = list.filter((h) => fin(h.ta));
    const out = { ...occ, hours: list.length, expected, items: [], reasons: [], missing: [] };
    if (tas.length) {
      const cold = tas.reduce((a, b) => (b.ta < a.ta ? b : a)), warm = tas.reduce((a, b) => (b.ta > a.ta ? b : a));
      out.tmin = cold.ta; out.tmax = warm.ta; out.coldAt = cold.time; out.warmAt = warm.time;
      const outer = wearOf(cold.ta), inner = wearOf(warm.ta);
      out.wear = outer === inner ? { one: outer } : { outer, inner };
      out.reasons.push(outer === inner ? `구간 기온 ${cold.ta === warm.ta ? f1(cold.ta) : `${f1(cold.ta)}~${f1(warm.ta)}`}℃ → ${outer}` : `가장 추운 ${hh(cold.time)}시 ${f1(cold.ta)}℃ → 겉옷 ${outer} · 가장 따뜻한 ${hh(warm.time)}시 ${f1(warm.ta)}℃ → 안 ${inner}`);
      const segR = r1(warm.ta - cold.ta);
      const dd = days.find((d) => d.date === occ.date), dayR = dd && fin(dd.max) && fin(dd.min) ? r1(dd.max - dd.min) : null;
      if (segR >= RULE.easyLayerSeg || (dayR != null && dayR >= RULE.easyLayerDay)) { out.easyLayer = true; out.items.push("벗고 입기 쉬운 겉옷"); out.reasons.push(segR >= RULE.easyLayerSeg ? `구간 안 기온 차 ${segR}℃(8℃ 이상)` : `${md(occ.date)} 예보 최저 ${dd.min}℃·최고 ${dd.max}℃, 일교차 ${dayR}℃(10℃ 이상)`); }
      if (tas.length < expected) out.missing.push(`기온 ${expected}시간 중 ${tas.length}시간`);
    } else out.missing.push("기온");
    const wsH = list.filter((h) => fin(h.ws));
    if (wsH.length) { const w = wsH.reduce((a, b) => (b.ws > a.ws ? b : a)); out.wsMax = w.ws; if (w.ws >= RULE.wind) { out.items.push(`바람 최대 ${w.ws}m/s`); out.reasons.push(`${hh(w.time)}시 풍속 ${w.ws}m/s(5m/s 이상)`); } } else out.missing.push("바람");
    const hmH = list.filter((h) => fin(h.hm));
    if (hmH.length) { out.hmMin = Math.min(...hmH.map((h) => h.hm)); out.hmMax = Math.max(...hmH.map((h) => h.hm)); const hot = list.filter((h) => fin(h.ta) && fin(h.hm) && h.ta >= RULE.hotT && h.hm >= RULE.hotRH); if (hot.length) { const x = hot.reduce((a, b) => (b.ta > a.ta ? b : a)); out.items.push(`기온 ${f1(x.ta)}℃·습도 ${x.hm}%`); out.reasons.push(`${hh(x.time)}시 기온 ${f1(x.ta)}℃·습도 ${x.hm}%(25℃·70% 이상, 체감온도는 따로 계산하지 않음)`); } } else out.missing.push("습도");
    // 우산: 강수형태(그 정시 앞 1시간 구간)가 구간과 겹치거나, 강수확률 60% 이상일 때만
    const ov = (h) => { const it = h.items?.pty, a = it?.intervalStart || h.time, b = it?.intervalEnd || h.time; return a === b ? inT(a) : b > occ.startW && a < occ.endW; };
    const fcIn = fc.filter(ov);
    const ptyH = fcIn.filter((h) => h.pty && h.pty !== "없음"), popH = fcIn.filter((h) => fin(h.pop));
    out.popMax = popH.length ? Math.max(...popH.map((h) => h.pop)) : null;
    if (ptyH.length) { const snow = ptyH.some((h) => /눈/.test(h.pty)); out.rain = snow ? "snow" : "rain"; out.items.unshift(snow ? "눈 예보 · 우산" : "우산"); out.reasons.push(`${ptyH.map((h) => `${hh(h.time)}시 ${h.pty}`).join("·")} 예보${snow ? "(쌓임·결빙은 예보로 알 수 없음)" : ""}`); }
    else if (out.popMax != null && out.popMax >= RULE.popHigh) { out.rain = "pop"; out.items.unshift(`강수확률 ${out.popMax}% · 우산 챙기기`); out.reasons.push(`강수확률 최고 ${out.popMax}%(강수형태 예보는 없음)`); }
    else if (!fcIn.length) out.missing.push("강수 예보");
    return out;
  }
  function segments(o, segs = loadSegs()) { return segs.map((s) => segment(s, o)).filter(Boolean).sort((a, b) => (a.startW < b.startW ? -1 : 1)); }
  const dayW = (d, today) => (d === today ? "오늘" : d === addDay(today, 1) ? "내일" : d === addDay(today, -1) ? "어제" : md(d));
  function segCard(s, today, on) {
    const wear = s.wear ? (s.wear.one || `겉 ${s.wear.outer} / 안 ${s.wear.inner}`) : "기온 자료 없음";
    return `<button type="button" class="vz-seg${on ? " on" : ""}" data-seg="${esc(s.id)}" aria-pressed="${on}"><span class="vz-segh"><b>${esc(s.label)}</b> <small>${dayW(s.date, today)} ${s.from}~${s.to}시</small></span><span class="vz-segw">${esc(wear)}</span>${s.items.length ? `<small class="vz-segi">${s.items.map(esc).join(" · ")}</small>` : ""}${fin(s.tmin) ? `<small>${s.tmin === s.tmax ? f1(s.tmin) : `${f1(s.tmin)}~${f1(s.tmax)}`}℃</small>` : ""}</button>`;
  }
  function segPanel(s, today) {
    if (!s) return "";
    return `<div class="vz-segp" role="region" aria-live="polite"><b>${esc(s.label)} ${dayW(s.date, today)} ${s.from}~${s.to}시 — 이렇게 정했어요</b><ul>${s.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}${s.wsMax != null && s.wsMax < RULE.wind ? `<li>바람 최대 ${s.wsMax}m/s</li>` : ""}${s.hmMin != null ? `<li>습도 ${s.hmMin === s.hmMax ? `${s.hmMin}` : `${s.hmMin}~${s.hmMax}`}%</li>` : ""}${!s.rain && s.popMax != null ? `<li>강수형태 예보 없음 · 강수확률 최고 ${s.popMax}%</li>` : ""}${s.missing.length ? `<li class="rt-ins">자료 없음: ${s.missing.map(esc).join(", ")} — 그 항목만 빼고 판단</li>` : ""}</ul><p class="rt-note">옷차림은 기온별 일반 기준(참고용)이며 공식·의학 지수가 아닙니다. 가장 추운 시각 기온으로 겉옷, 가장 따뜻한 시각 기온으로 안에 입을 옷을 골랐어요. 구간 기온은 정시 값(실황·예보)이며 공식 최저·최고(TMN·TMX)와 다를 수 있어요.</p></div>`;
  }

  // ---------------------------------------------------------------- 9) 앞으로 12시간 공용 시간축: 기온 선 · 강수 띠 · 바람 띠 + 구간 음영(탭하면 이유)
  function axis12(o, segs, sel, { width = 340 } = {}) {
    const fc = (o.fc || []).slice(0, 12); if (!fc.length) return `<p class="rt-ins">예보 자료가 없습니다</p>`;
    const cur = o.current && fin(o.current.ta) ? o.current : null;
    const pts = (cur ? [{ time: cur.time, ta: cur.ta, kind: "obs", ws: cur.ws }] : []).concat(fc.map((h) => ({ ...h, kind: "fcst" })));
    const t0 = Date.parse(pts[0].time.replace(" ", "T") + "Z"), span = Math.max(1, (Date.parse(pts.at(-1).time.replace(" ", "T") + "Z") - t0) / 36e5);
    const L = 34, R = 10, H = 168;
    const xt = (t) => L + ((Date.parse(t.replace(" ", "T") + "Z") - t0) / 36e5 / span) * (width - L - R);
    const cw = (width - L - R) / span;
    const tas = pts.map((p) => p.ta).filter(fin);
    const lo = tas.length ? Math.floor(Math.min(...tas) - 1) : 0, hi = tas.length ? Math.ceil(Math.max(...tas) + 1) : 1;
    const TT = 18, TB = 78, y = (v) => TT + (1 - (v - lo) / (hi - lo)) * (TB - TT);
    const minP = tas.length ? pts.filter((p) => fin(p.ta)).reduce((a, b) => (b.ta < a.ta ? b : a)) : null, maxP = tas.length ? pts.filter((p) => fin(p.ta)).reduce((a, b) => (b.ta > a.ta ? b : a)) : null;
    const wet = fc.filter((h) => h.pty && h.pty !== "없음"), windy = fc.filter((h) => fin(h.ws) && h.ws >= RULE.wind);
    const label = `앞으로 12시간: 기온 ${minP ? `${hh(minP.time)}시 ${minP.ta}℃ ~ ${hh(maxP.time)}시 ${maxP.ta}℃` : "자료 없음"}, ${wet.length ? `강수형태 예보 ${wet.map((h) => `${hh(h.time)}시 ${h.pty}`).join(", ")}` : "강수형태 예보 없음"}, ${windy.length ? `풍속 5m/s 이상 ${windy.map((h) => `${hh(h.time)}시`).join(", ")}` : "풍속 5m/s 미만"}.`;
    const og = svgOpen(width, H, label);
    let s = og.s;
    // 구간 음영(맨 뒤) — 탭 가능
    const endT = pts.at(-1).time;
    for (const sg of segs) {
      const a = sg.startW < pts[0].time ? pts[0].time : sg.startW, b = sg.endW > endT ? endT : sg.endW;
      if (a >= b && !(a === b && sg.startW <= a && sg.endW >= a)) continue;
      const xa = xt(a), xb = Math.max(xt(b), xa + 4);
      s += `<g class="vz-segz" data-seg="${esc(sg.id)}" tabindex="-1"><rect x="${xa}" y="2" width="${xb - xa}" height="${H - 18}" fill="${sg.id === sel ? "#ffe7a8" : C.seg}" stroke="${sg.id === sel ? "#c98a00" : "#ecd393"}"/><text x="${xa + 3}" y="12" font-size="10.5" font-weight="700" fill="#8a4b00">${esc(sg.label)}</text></g>`;
    }
    // 기온
    s += `<text x="0" y="${TT + 6}" font-size="10" fill="${C.muted}">기온</text>`;
    let d = "", pen = false, prev = null;
    for (const p of fc) { if (!fin(p.ta) || (prev && Date.parse(p.time.replace(" ", "T") + "Z") - Date.parse(prev.replace(" ", "T") + "Z") > 36e5)) pen = false; if (fin(p.ta)) { d += `${pen ? "L" : "M"}${xt(p.time).toFixed(1)},${y(p.ta).toFixed(1)}`; pen = true; } prev = p.time; }
    s += `<path d="${d}" fill="none" stroke="${C.fc}" stroke-width="2.4" stroke-dasharray="5 4"/>`;
    if (cur) s += `<circle cx="${xt(cur.time)}" cy="${y(cur.ta)}" r="4" fill="${C.obs}"/><text x="${xt(cur.time) + 2}" y="${y(cur.ta) - 7}" font-size="10.5" font-weight="700" fill="${C.obs}">지금 ${cur.ta}</text>`;
    fc.forEach((p, i) => { if (fin(p.ta) && (i % 3 === 2 || p === minP || p === maxP)) s += `<text x="${xt(p.time)}" y="${y(p.ta) + (p === minP ? 13 : -6)}" font-size="10" text-anchor="middle" fill="${p === minP || p === maxP ? C.obs : C.muted}" font-weight="${p === minP || p === maxP ? 700 : 400}">${p.ta}</text>`; });
    // 강수 띠: 강수형태(채움) / 없음(점선 빈 칸) / 칸 없음(빗금), 위에 강수확률 숫자(60% 이상 굵게)
    const RY = 96, WY = 126;
    s += `<text x="0" y="${RY + 10}" font-size="10" fill="${C.muted}">강수</text><text x="0" y="${WY + 10}" font-size="10" fill="${C.muted}">바람</text>`;
    fc.forEach((h, i) => {
      const xb = xt(h.time), xa = xb - cw, w = cw - 2, x = xa + 1;
      const w2 = h.pty && h.pty !== "없음";
      s += w2 ? `<rect x="${x}" y="${RY}" width="${w}" height="14" rx="2" fill="${/눈/.test(h.pty) ? "#6aa6ff" : C.wet}"/>` : h.pty == null ? `<rect x="${x}" y="${RY}" width="${w}" height="14" rx="2" fill="url(#${og.id}h)"/>` : `<rect x="${x + 0.5}" y="${RY + 0.5}" width="${w - 1}" height="13" rx="2" fill="#fff" stroke="#c7d2e2" stroke-dasharray="3 2"/>`;
      if (w2) s += `<text x="${x + w / 2}" y="${RY + 10.5}" font-size="9.5" fill="#fff" text-anchor="middle">${esc(/눈/.test(h.pty) ? "눈" : "비")}</text>`;
      else if (fin(h.pop) && h.pop >= 20) s += `<text x="${x + w / 2}" y="${RY + 10.5}" font-size="9.5" text-anchor="middle" fill="${h.pop >= RULE.popHigh ? C.fc : C.muted}" font-weight="${h.pop >= RULE.popHigh ? 700 : 400}">${h.pop}</text>`;
      const ws = h.ws;
      s += fin(ws) ? `<rect x="${x}" y="${WY}" width="${w}" height="14" rx="2" fill="${ws >= RULE.wind ? "#5e7090" : "#eef2f7"}"/><text x="${x + w / 2}" y="${WY + 10.5}" font-size="9.5" text-anchor="middle" fill="${ws >= RULE.wind ? "#fff" : C.muted}" font-weight="${ws >= RULE.wind ? 700 : 400}">${cw > 22 || i % 2 === 0 || ws >= RULE.wind ? r1(ws) : ""}</text>` : `<rect x="${x}" y="${WY}" width="${w}" height="14" rx="2" fill="url(#${og.id}h)"/>`;
    });
    pts.forEach((p, i) => { if (i % 2 === 0 || i === pts.length - 1) s += `<text x="${clamp(xt(p.time), 8, width - 8)}" y="${H - 4}" font-size="10" text-anchor="middle" fill="${C.muted}">${i === 0 && cur ? "지금" : `${hh(p.time)}시`}</text>`; });
    s += `</svg>`;
    return fig(s, `${cur ? legend("obs") : ""}${legend("fc")}<span class="vz-key"><i class="k-wet"></i>강수형태 예보</span><span class="vz-key">숫자 = 강수확률%</span><span class="vz-key"><i class="k-wind"></i>바람 5m/s 이상</span>${legend("miss")}<span class="vz-key"><i class="k-seg"></i>구간(누르면 이유)</span>`, "vz-axis");
  }
  // 12시간 칸 전체(그래프 + 구간 카드 + 이유) 그리기·탭 처리
  const DAY = { o: null, segs: [], sel: null };
  function dayPaint(el) {
    const { o, segs, sel } = DAY, today = o.nowW.slice(0, 10);
    const s0 = segs.find((x) => x.id === sel) || segs[0];
    el.innerHTML = `${axis12(o, segs, s0?.id)}<div class="vz-segs" role="group" aria-label="하루 구간별 옷차림">${segs.map((x) => segCard(x, today, x === s0)).join("")}</div>${segPanel(s0, today)}`;
  }
  function day(el, o) { DAY.o = o; DAY.segs = segments(o); DAY.sel = DAY.segs[0]?.id ?? null; dayPaint(el); el.dataset.vzDay = "1"; }
  if (typeof document !== "undefined") document.addEventListener("click", (e) => {
    const sb = e.target.closest?.("[data-vz-day] [data-seg]");
    if (sb) { DAY.sel = sb.dataset.seg; dayPaint(sb.closest("[data-vz-day]")); return; }
    const pk = e.target.closest?.("[data-simov] [data-simpick]");
    if (pk) { const host = pk.closest("[data-simov]"); const r = SIM.get(host.dataset.simov); if (r) host.innerHTML = simOverlay(r, +pk.dataset.simpick); }
  });
  const SIM = new Map();
  let sid = 0;
  const simSlot = (r) => { if (!r?.ok || !r.top?.length || !r.target?.ta) return ""; const k = `s${++sid}`; SIM.set(k, r); return `<div class="vz-simhost" data-simov="${k}">${simOverlay(r, 0)}</div>`; };

  W.RTViz = { chart, dist, calendar, range, line, commute, sky, slot, mount, simOverlay, simSlot, axis12, day, segments, segment, segOccurrence, loadSegs, SEG_DEFAULT, SEG_KEY, RULE, wearOf };
})();
