// 날씨 예보 — 그림·그래프 중심 화면(히어로 하늘 그림, 72시간 그래프, 10일 알약 그래프, 바람 띠, '가장 큰 변화'). 값은 /api/rt/forecast(+ 읽기 전용 /api/rt/forecast-wind) 그대로.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  const cls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
  const DOW = "일월화수목금토";
  const dow = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  const dlab = (ymd) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}(${dow(ymd)})`;
  const hm = (w) => (w ? `${+w.slice(5, 7)}/${+w.slice(8, 10)} ${w.slice(11, 16)}` : "");
  const hh = (t) => +t.slice(11, 13);
  const night = (h) => h < 6 || h >= 18;
  const dayWord = (ymd, today) => { const n = Math.round((Date.parse(ymd) - Date.parse(today)) / 864e5); return n === 0 ? "오늘" : n === 1 ? "내일" : n === 2 ? "모레" : dlab(ymd); };
  // 날씨 종류: 강수형태 > 하늘상태(단기) / 중기 wf 글자
  function kind(sky, pty) {
    const t = pty && pty !== "없음" ? pty : sky || "";
    if (!t) return null;
    if (/비\/눈|눈\/비|진눈/.test(t)) return "sleet";
    if (/눈/.test(t)) return "snow";
    if (/소나기/.test(t)) return "shower";
    if (/비|빗방울/.test(t)) return "rain";
    if (/흐/.test(t)) return "cloud";
    if (/구름/.test(t)) return "partly";
    if (/맑/.test(t)) return "clear";
    return null;
  }
  const wfKind = (x) => kind(x.sky || (x.wf || "").split(" / ").pop(), x.wf && /비|눈|소나기/.test(x.wf) ? x.wf.split(" / ").find((s) => /비|눈|소나기/.test(s)) : null);
  // SVG 날씨 그림(크기 s, 중심 0,0 기준 그룹)
  const SUN = (r) => `<circle r="${r}" fill="#ffc531"/>${[...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${(Math.cos(a) * r * 1.35).toFixed(1)}" y1="${(Math.sin(a) * r * 1.35).toFixed(1)}" x2="${(Math.cos(a) * r * 1.75).toFixed(1)}" y2="${(Math.sin(a) * r * 1.75).toFixed(1)}" stroke="#ffb100" stroke-width="${(r / 4).toFixed(1)}" stroke-linecap="round"/>`; }).join("")}`;
  const MOON = (r) => `<path d="M${r * 0.3},${-r} a${r},${r} 0 1,0 ${r * 0.7},${r * 1.55} a${r * 0.85},${r * 0.85} 0 1,1 ${-r * 0.7},${-r * 1.55}z" fill="#f4e7a1"/>`;
  const CLOUD = (s, c = "#fff", o = 1) => `<path d="M${-s},${s * 0.45} h${s * 2} a${s * 0.5},${s * 0.5} 0 0,0 0,${-s} a${s * 0.6},${s * 0.6} 0 0,0 ${-s * 0.75},${-s * 0.45} a${s * 0.75},${s * 0.75} 0 0,0 ${-s * 1.3},${s * 0.2} a${s * 0.55},${s * 0.55} 0 0,0 ${s * 0.05},${s * 1.25}z" fill="${c}" opacity="${o}" stroke="#9fb3cc" stroke-width="${(s / 14).toFixed(2)}"/>`;
  const DROPS = (s, n = 3, c = "#2f7cf6") => [...Array(n)].map((_, i) => `<line x1="${(-s * 0.6 + i * s * 0.6).toFixed(1)}" y1="${s * 0.7}" x2="${(-s * 0.75 + i * s * 0.6).toFixed(1)}" y2="${s * 1.1}" stroke="${c}" stroke-width="${(s / 7).toFixed(1)}" stroke-linecap="round"/>`).join("");
  const FLAKES = (s, n = 3) => [...Array(n)].map((_, i) => `<text x="${(-s * 0.6 + i * s * 0.6).toFixed(1)}" y="${s * 1.15}" font-size="${(s * 0.55).toFixed(1)}" text-anchor="middle" fill="#6aa6ff">✱</text>`).join("");
  function icon(k, isNight, s = 12) {
    const body = isNight ? MOON(s * 0.75) : SUN(s * 0.62);
    switch (k) {
      case "clear": return body;
      case "partly": return `<g transform="translate(${-s * 0.35},${-s * 0.35})">${body}</g><g transform="translate(${s * 0.25},${s * 0.2}) scale(.8)">${CLOUD(s)}</g>`;
      case "cloud": return `<g transform="translate(${s * 0.25},${-s * 0.3}) scale(.7)">${CLOUD(s, "#dfe7f2")}</g>${CLOUD(s, "#eef2f7")}`;
      case "rain": return `${CLOUD(s, "#d6dee9")}${DROPS(s)}`;
      case "shower": return `<g transform="translate(${-s * 0.4},${-s * 0.4}) scale(.7)">${body}</g>${CLOUD(s, "#e3e9f1")}${DROPS(s, 2)}`;
      case "snow": return `${CLOUD(s, "#e6ecf4")}${FLAKES(s)}`;
      case "sleet": return `${CLOUD(s, "#d6dee9")}${DROPS(s, 2)}<text x="${s * 0.55}" y="${s * 1.15}" font-size="${(s * 0.55).toFixed(1)}" text-anchor="middle" fill="#6aa6ff">✱</text>`;
      default: return `<text y="${s * 0.35}" font-size="${s}" text-anchor="middle" fill="#8a9bb5">–</text>`;
    }
  }
  const iconSvg = (k, n, px = 28, label = "") => `<svg viewBox="-16 -16 32 34" width="${px}" height="${px}" style="width:${px}px;height:${px}px" role="img" aria-label="${esc(label || "자료 없음")}">${icon(k, n, 12)}</svg>`;

  // 1) 히어로: 지금부터 오늘 밤까지
  function hero(d) {
    const hs = d.hours || [];
    if (!hs.length) return `<section class="card fv-hero none"><p class="rt-ins">시간별 예보 자료가 없습니다</p></section>`;
    const h0 = hs[0], h0h = hh(h0.time);
    // 오늘 밤까지 = 오늘 23시까지(이미 18시 이후면 내일 아침 6시까지)
    const endWall = h0h >= 18 ? `${nextYmd(d.date)} 06:00:00` : `${d.date} 23:00:00`;
    const span = hs.filter((x) => x.time <= endWall);
    const tas = span.map((x) => x.ta).filter((v) => v != null);
    const pops = span.map((x) => x.pop).filter((v) => v != null);
    const mm = span.reduce((s, x) => s + (x.pcpMm > 0 ? x.pcpMm : 0), 0), lt1 = span.filter((x) => x.pcpMm == null && x.pcp && x.pcp !== "강수 없음").length;
    const k = kind(h0.sky, h0.pty), n = night(h0h);
    const bg = k === "rain" || k === "shower" || k === "sleet" ? ["#5b6f8c", "#9aaac0"] : k === "snow" ? ["#8ea4c4", "#dbe5f2"] : k === "cloud" ? (n ? ["#2b3954", "#56688a"] : ["#8fa3bf", "#cfdaea"]) : n ? ["#0d1b3d", "#2c4a86"] : ["#3d8cff", "#a9d2ff"];
    const dark = n || k === "rain" || k === "shower" || k === "sleet" || (k === "cloud" && n);
    const stars = n && (k === "clear" || k === "partly") ? [...Array(14)].map((_, i) => `<circle cx="${(i * 53) % 360 + 10}" cy="${(i * 37) % 70 + 8}" r="${i % 3 ? 0.9 : 1.4}" fill="#fff" opacity=".8"/>`).join("") : "";
    const rainBg = k === "rain" || k === "shower" || k === "sleet" ? [...Array(26)].map((_, i) => `<line x1="${(i * 29) % 380}" y1="${(i * 17) % 120}" x2="${(i * 29) % 380 - 5}" y2="${(i * 17) % 120 + 14}" stroke="#dbe7ff" stroke-width="1.2" opacity=".55"/>`).join("") : "";
    const art = `<svg class="fv-art" viewBox="0 0 360 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="fvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="360" height="160" fill="url(#fvSky)"/>${stars}${rainBg}<g transform="translate(285,62) scale(3.1)">${icon(k, n, 12)}</g></svg>`;
    const strip = span.filter((x, i) => i % (span.length > 10 ? 2 : 1) === 0).slice(0, 9).map((x) => `<div class="fv-hc"><span>${hh(x.time)}시</span>${iconSvg(kind(x.sky, x.pty), night(hh(x.time)), 26, x.pty && x.pty !== "없음" ? x.pty : x.sky)}<b>${x.ta ?? "–"}°</b><small>${x.pop == null ? "" : `☂${x.pop}%`}</small></div>`).join("");
    const rel = d.releases || {};
    return `<section class="card fv-hero${dark ? " dark" : ""}" aria-label="지금부터 오늘 밤까지">${art}<div class="fv-hin">
      <p class="fv-meta">${esc(d.station.name)} · 지금부터 ${h0h >= 18 ? "내일 아침" : "오늘 밤"}까지 <span class="rt-badge fc">예보</span></p>
      <p class="fv-big">${h0.ta ?? "–"}<span>℃</span></p>
      <p class="fv-sky">${esc(h0.pty && h0.pty !== "없음" ? h0.pty : h0.sky || "하늘 자료 없음")} · ${hh(h0.time)}시</p>
      <p class="fv-sum">${tas.length ? `${Math.min(...tas)}~${Math.max(...tas)}℃` : "기온 자료 없음"} · 강수확률 최대 ${pops.length ? `${Math.max(...pops)}%` : "자료 없음"} · ${mm > 0 || lt1 ? `예상 강수량 ${mm > 0 ? `${Math.round(mm * 10) / 10}mm` : ""}${lt1 ? `${mm > 0 ? " + " : ""}1mm 미만 ${lt1}시간` : ""}` : "강수 없음"}</p></div>
      <div class="fv-hstrip">${strip}</div>
      <p class="rt-note fv-rel">발표: 초단기 ${esc(hm(rel.ultra?.base) || "없음")} · 단기 ${esc(hm(rel.vilage?.base) || "없음")}${[rel.ultra, rel.vilage].some((x) => x?.freshness?.state === "stale") ? ` <span class="rt-badge bad">지연</span>` : ""}</p></section>`;
  }
  const nextYmd = (ymd) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

  // 2) 가장 큰 변화(규칙): ① 비·눈 시작(지금 건조 → 처음 강수형태가 있거나 강수확률 60% 이상인 시각) ② 이웃한 날 최고기온 5℃ 이상 변화(가장 큰 것) ③ 3시간 안 기온 4℃ 이상 하강
  function changes(d) {
    const out = [], hs = d.hours || [];
    const wet = (x) => (x.pty && x.pty !== "없음") || (x.pop ?? 0) >= 60;
    if (hs.length) {
      if (!wet(hs[0])) {
        const i = hs.findIndex(wet);
        if (i > 0) {
          const s = hs[i]; let j = i; while (j + 1 < hs.length && wet(hs[j + 1])) j++;
          const mm = hs.slice(i, j + 1).reduce((a, x) => a + (x.pcpMm > 0 ? x.pcpMm : 0), 0);
          out.push({ ico: kind(null, s.pty !== "없음" ? s.pty : "비") || "rain", t: `${dayWord(s.time.slice(0, 10), d.date)} ${hh(s.time)}시쯤 ${s.pty && s.pty !== "없음" ? s.pty : "비"} 시작`, sub: `강수확률 ${s.pop ?? "–"}% · ${hh(hs[j].time)}시까지 ${j - i + 1}시간${mm > 0 ? ` · 숫자로 나온 강수량 합 ${Math.round(mm * 10) / 10}mm` : ""}`, src: `${s.source} ${hm(s.base)} 발표` });
        }
      } else {
        const j = hs.findIndex((x) => !wet(x));
        out.push({ ico: kind(null, hs[0].pty !== "없음" ? hs[0].pty : "비") || "rain", t: j > 0 ? `${dayWord(hs[j].time.slice(0, 10), d.date)} ${hh(hs[j].time)}시쯤 비·눈 그침` : "72시간 내내 비·눈 또는 강수확률 60% 이상", sub: `지금 ${esc(hs[0].pty !== "없음" ? hs[0].pty : `강수확률 ${hs[0].pop}%`)}`, src: `${hs[0].source} ${hm(hs[0].base)} 발표` });
      }
      let best = null;
      for (let i = 0; i + 3 < hs.length; i++) { const a = hs[i].ta, b = hs[i + 3].ta; if (a != null && b != null && a - b >= 4 && (!best || a - b > best.dv)) best = { dv: Math.round((a - b) * 10) / 10, a: hs[i], b: hs[i + 3] }; }
      if (best) out.push({ ico: "drop", t: `${dayWord(best.a.time.slice(0, 10), d.date)} ${hh(best.a.time)}시→${hh(best.b.time)}시 기온 ${best.a.ta}℃ → ${best.b.ta}℃ (${sg(-best.dv)})`, sub: "3시간 사이 가장 큰 하강", src: `${best.b.source} ${hm(best.b.base)} 발표` });
    }
    const ds = (d.days || []).filter((x) => !x.none && x.max != null);
    let jump = null;
    for (let i = 1; i < ds.length; i++) { if (Math.round((Date.parse(ds[i].date) - Date.parse(ds[i - 1].date)) / 864e5) !== 1) continue; const dv = Math.round((ds[i].max - ds[i - 1].max) * 10) / 10; if (Math.abs(dv) >= 5 && (!jump || Math.abs(dv) > Math.abs(jump.dv))) jump = { dv, a: ds[i - 1], b: ds[i] }; }
    if (jump) out.push({ ico: jump.dv < 0 ? "drop" : "rise", t: `${dayWord(jump.b.date, d.date)} 최고기온 ${jump.b.max}℃ — 전날(${jump.a.max}℃)보다 ${sg(jump.dv)}`, sub: "이웃한 두 날 최고기온 차이가 가장 큰 날", src: `${jump.b.maxSource} ${hm(jump.b.maxBase)} 발표` });
    return out;
  }
  function changeCard(d) {
    const cs = changes(d);
    const ic = (k) => (k === "drop" ? `<b class="fv-arrow down">↓</b>` : k === "rise" ? `<b class="fv-arrow up">↑</b>` : iconSvg(k, false, 34, k));
    return `<section class="card fv-chg" aria-label="가장 큰 변화"><h2>가장 큰 변화 <span class="rt-badge fc">예보</span></h2>${cs.length ? `<ul>${cs.map((c) => `<li>${ic(c.ico)}<div><b>${esc(c.t)}</b><small>${esc(c.sub)} · ${esc(c.src)}</small></div></li>`).join("")}</ul>` : `<p class="rt-ins">앞으로 큰 변화 없음</p>`}<p class="rt-note">규칙: 비·눈 시작(강수형태가 있거나 강수확률 60% 이상인 첫 시각), 3시간 사이 기온 4℃ 이상 하강, 이웃한 날 최고기온 5℃ 이상 변화. 해당하는 것만 보입니다.</p></section>`;
  }
  // 발표별 변화 한 줄: 이웃한 두 발표 사이 3℃ 이상 바뀐 경우만
  function releaseJumps(d) {
    const out = [];
    for (const c of d.changes || []) for (const [k, lab] of [["max", "최고"], ["min", "최저"]]) {
      const a = c[k] || [];
      for (let i = 1; i < a.length; i++) { const dv = Math.round((a[i].value - a[i - 1].value) * 10) / 10; if (Math.abs(dv) >= 3) out.push({ date: c.date, lab, from: a[i - 1], to: a[i], dv }); }
    }
    return out.sort((x, y) => Math.abs(y.dv) - Math.abs(x.dv));
  }
  function releaseLine(d) {
    const j = releaseJumps(d)[0];
    if (!j) return "";
    const n = releaseJumps(d).length;
    return `<p class="card fv-rel-line">🔁 <b>${esc(dlab(j.date))} ${j.lab}기온 예보가 ${j.from.value}℃ → ${j.to.value}℃(${sg(j.dv)})</b> <small>${esc(hm(j.from.base))} → ${esc(hm(j.to.base))} 발표${n > 1 ? ` · 3℃ 이상 바뀐 경우 모두 ${n}번` : ""}</small></p>`;
  }

  // 3) 72시간 그래프: 위 날씨 그림 띠, 가운데 기온선(예보 점선)+기준 평균선, 아래 강수확률 막대·강수량, 맨 아래 바람 화살표. 밤(18~6시) 음영
  const PAD = { L: 34, R: 10 };
  const xOf = (i, n, W) => PAD.L + (i / Math.max(1, n - 1)) * (W - PAD.L - PAD.R);
  const idxAt = (fr, n, W) => Math.max(0, Math.min(n - 1, Math.round(((fr * W - PAD.L) / (W - PAD.L - PAD.R)) * Math.max(1, n - 1))));
  function chart72(hrs, lines, colors, wind, W, H, sel) {
    const n = hrs.length, X = (i) => xOf(i, n, W);
    const iconH = 30, tT = iconH + 8, tB = Math.round(H * 0.58), pT = tB + 22, pB = H - (wind ? 52 : 22), wY = H - 30;
    const vals = []; for (const x of hrs) { if (x.ta != null) vals.push(x.ta); for (const k of lines) if (x.avg?.[k] != null) vals.push(x.avg[k]); }
    if (!vals.length) return `<p class="rt-ins">기온 자료 없음</p>`;
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1), Y = (v) => tT + (1 - (v - lo) / (hi - lo)) * (tB - tT);
    const mmMax = Math.max(5, ...hrs.map((x) => x.pcpMm || 0)), step = W / n;
    const path = (g) => { let s = "", pen = false; hrs.forEach((x, i) => { const v = g(x); if (v == null) { pen = false; return; } s += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }); return s; };
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="rt-svg-h fv-svg" style="width:${W}px;height:${H}px" role="img" aria-label="72시간 예보: 날씨, 기온, 강수확률·강수량${wind ? ", 바람" : ""}">`;
    // 밤 음영
    hrs.forEach((x, i) => { if (night(hh(x.time))) s += `<rect x="${(X(i) - step / 2).toFixed(1)}" y="0" width="${(step + 0.6).toFixed(1)}" height="${H}" fill="#eef2fa"/>`; });
    for (let t = Math.ceil(lo / 2) * 2; t <= hi; t += 2) s += `<line x1="${PAD.L}" x2="${W - PAD.R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e0e8f4"/><text x="${PAD.L - 5}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#5e7090">${t}</text>`;
    hrs.forEach((x, i) => { const h = hh(x.time); if (h === 0) s += `<line x1="${X(i)}" x2="${X(i)}" y1="0" y2="${H}" stroke="#b9c8de"/><text x="${X(i) + 4}" y="${tB + 14}" font-size="11" font-weight="700" fill="#0d1b3d">${esc(dlab(x.time.slice(0, 10)))}</text>`; else if (h % 6 === 0) s += `<text x="${X(i)}" y="${tB + 14}" text-anchor="middle" font-size="10.5" fill="#5e7090">${h}시</text>`; });
    // 날씨 그림 띠(3시간마다)
    hrs.forEach((x, i) => { if (hh(x.time) % 3 === 0 || i === 0) s += `<g transform="translate(${X(i).toFixed(1)},15) scale(.95)"><title>${esc(hm(x.time))} ${esc(x.pty && x.pty !== "없음" ? x.pty : x.sky || "자료 없음")}</title>${icon(kind(x.sky, x.pty), night(hh(x.time)), 11)}</g>`; });
    for (const k of lines) s += `<path d="${path((x) => x.avg?.[k])}" fill="none" stroke="${colors[k]}" stroke-width="1.5" opacity=".85"/>`;
    s += `<path d="${path((x) => x.ta)}" fill="none" stroke="${colors.fc}" stroke-width="2.6" stroke-dasharray="6 4"/>`;
    // 기온 숫자(6시간마다)
    hrs.forEach((x, i) => { if (x.ta != null && hh(x.time) % 6 === 0) s += `<text x="${X(i)}" y="${Y(x.ta) - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${colors.fc}">${x.ta}°</text>`; });
    // 강수확률 막대 + 강수량
    s += `<text x="${PAD.L - 5}" y="${pT + 4}" text-anchor="end" font-size="9.5" fill="#5e7090">100%</text><text x="${PAD.L - 5}" y="${pB}" text-anchor="end" font-size="9.5" fill="#5e7090">0</text><line x1="${PAD.L}" x2="${W - PAD.R}" y1="${pB}" y2="${pB}" stroke="#c9d6ea"/>`;
    const bw = Math.max(2, step * 0.62);
    hrs.forEach((x, i) => {
      if (x.pop == null) return;
      const ph = (x.pop / 100) * (pB - pT);
      s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(pB - ph).toFixed(1)}" width="${bw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${x.pop >= 60 ? "#2f7cf6" : "#9cc2fb"}" opacity=".8"/>`;
      if (x.pcpMm > 0) { const rh = Math.min(1, x.pcpMm / mmMax) * (pB - pT); s += `<rect x="${(X(i) - bw / 4).toFixed(1)}" y="${(pB - rh).toFixed(1)}" width="${(bw / 2).toFixed(1)}" height="${rh.toFixed(1)}" fill="#0d3b8c"/>`; if (x.pcpMm >= 1 && (i === 0 || hrs[i - 1].pcpMm !== x.pcpMm)) s += `<text x="${X(i)}" y="${(pB - rh - 3).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#0d3b8c">${x.pcpMm}</text>`; }
      else if (x.pcpMm == null && x.pcp && x.pcp !== "강수 없음") s += `<circle cx="${X(i).toFixed(1)}" cy="${pB - 3}" r="2" fill="#0d3b8c"/>`;
    });
    // 바람 화살표(3시간마다): 바람이 불어 가는 쪽, 굵기·숫자 = 풍속
    if (wind) {
      const by = new Map(wind.map((w) => [w.time, w]));
      s += `<text x="${PAD.L - 5}" y="${wY + 4}" text-anchor="end" font-size="9.5" fill="#5e7090">바람</text>`;
      hrs.forEach((x, i) => { if (hh(x.time) % 3 !== 0) return; const w = by.get(x.time); if (!w || w.vec == null) { s += `<text x="${X(i)}" y="${wY + 4}" text-anchor="middle" font-size="9" fill="#8a9bb5">–</text>`; return; } const sw = Math.min(3.2, 1 + (w.ws || 0) * 0.35); s += `<g transform="translate(${X(i).toFixed(1)},${wY}) rotate(${(w.vec + 180) % 360})"><title>${esc(hm(x.time))} 풍향 ${w.vec}° 풍속 ${w.ws ?? "–"}m/s</title><line x1="0" y1="7" x2="0" y2="-6" stroke="#36507a" stroke-width="${sw}" stroke-linecap="round"/><path d="M-4,-2 L0,-8 L4,-2z" fill="#36507a"/></g><text x="${X(i)}" y="${wY + 20}" text-anchor="middle" font-size="9" fill="#36507a">${w.ws ?? "–"}</text>`; });
    }
    if (sel != null) s += `<line class="rt-sel" x1="${X(sel).toFixed(1)}" x2="${X(sel).toFixed(1)}" y1="0" y2="${H}" stroke="#0d1b3d" opacity=".35"/>`;
    return s + `</svg>`;
  }
  // 4) 10일 알약: 예보 최저~최고 막대(색) 뒤에 선택 기준 평균 최저~최고(회색 알약)
  function pills(d, main) {
    const ds = d.days || [];
    const pi = ["all", "r10", "r5"].indexOf(main);
    const xs = []; for (const x of ds) { for (const v of [x.max, x.min, x.maxCmp?.[pi]?.mean, x.minCmp?.[pi]?.mean]) if (v != null) xs.push(v); }
    if (!xs.length) return `<section class="card"><h2>10일 예보</h2><p class="rt-ins">예보 자료가 없습니다</p></section>`;
    const lo = Math.floor(Math.min(...xs) - 1), hi = Math.ceil(Math.max(...xs) + 1), P = (v) => ((v - lo) / (hi - lo)) * 100;
    const per = d.periods?.[pi];
    const rows = ds.map((x) => {
      const k = x.none ? null : wfKind(x);
      const bm = x.maxCmp?.[pi]?.mean, bn = x.minCmp?.[pi]?.mean;
      const base = bm != null && bn != null ? `<i class="fv-base" style="left:${P(bn).toFixed(1)}%;width:${(P(bm) - P(bn)).toFixed(1)}%" title="평균 ${bn}~${bm}℃"></i>` : "";
      const bar = x.max != null && x.min != null ? `<i class="fv-rng" style="left:${P(x.min).toFixed(1)}%;width:${Math.max(1.5, P(x.max) - P(x.min)).toFixed(1)}%"></i>` : x.max != null || x.min != null ? `<i class="fv-dot" style="left:${P(x.max ?? x.min).toFixed(1)}%"></i>` : "";
      const dm = x.maxCmp?.[pi]?.diff;
      return `<li${x.offset === 0 ? ' class="today"' : ""}><span class="fv-d"><b>${x.offset === 0 ? "오늘" : x.offset === 1 ? "내일" : `${+x.date.slice(8, 10)}일`}</b><small>${dow(x.date)}</small></span><span class="fv-i">${x.none ? "–" : iconSvg(k, false, 28, x.wf || x.sky || "")}</span><span class="fv-p">${x.pop == null ? "" : `<small class="${x.pop >= 60 ? "wet" : ""}">☂${x.pop}%</small>`}</span>
        <span class="fv-v lo">${x.none ? "" : x.min ?? "–"}°</span><span class="fv-track">${base}${bar}</span><span class="fv-v hi">${x.none ? "" : x.max ?? "–"}°${dm != null && Math.abs(dm) >= 1 ? `<em class="${cls(dm)}">${sg(dm)}</em>` : ""}</span>${x.none ? `<span class="fv-none rt-ins">예보 없음</span>` : ""}<small class="fv-src">${esc((x.maxSource || x.minSource || x.wxSource || "").replace("예보", ""))}</small></li>`;
    }).join("");
    return `<section class="card fv-pills" aria-label="10일 예보"><h2>${ds.length}일 예보 <span class="rt-badge fc">예보</span></h2><div class="rt-legend"><span><i class="fv-key rng"></i> 예보 최저~최고</span><span><i class="fv-key base"></i> ${esc(per ? `${per.label} ${per.range}` : "기준 평균")} 같은 시기 최저~최고</span></div><ul>${rows}</ul><p class="rt-note">최고기온 옆 숫자 = 기준 평균 최고기온과의 차이(1℃ 이상만). 단기 = 단기예보(대략 3일), 중기 = 중기예보(발표 ${esc(hm(d.releases?.midTa) || "없음")}). 강수확률은 하루 중 가장 큰 값.</p></section>`;
  }
  window.RTFV = { hero, changeCard, releaseLine, chart72, pills, xOf, idxAt, iconSvg, kind };
})();
