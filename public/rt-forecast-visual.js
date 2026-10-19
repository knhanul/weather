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
  // 날씨 그림은 공용 모듈(rt-weather-art.js)에서 — 오늘 날씨 화면과 같은 그림
  const { kind, wfKind, icon, iconSvg } = window.RTArt;

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
    const noPcp = span.filter((x) => x.pcp == null).length; // 강수량 칸이 아예 없는 시각(없음 ≠ 0)
    const k = kind(h0.sky, h0.pty), n = night(h0h);
    const { dark } = window.RTArt.sceneBg(k, n);
    const art = window.RTArt.sceneSvg(k, n, { cls: "fv-art", id: "fvSky" });
    const strip = span.filter((x, i) => i % (span.length > 10 ? 2 : 1) === 0).slice(0, 9).map((x) => `<div class="fv-hc"><span>${hh(x.time)}시</span>${iconSvg(kind(x.sky, x.pty), night(hh(x.time)), 26, x.pty && x.pty !== "없음" ? x.pty : x.sky)}<b>${x.ta ?? "–"}°</b>${((r) => `<small${r.wet ? ' class="wet"' : ""}${r.tip ? ` title="${esc(r.tip)}" aria-label="${esc(r.tip)}"` : ""}>${esc(r.text)}</small>${r.amt ? `<small class="fv-amt" aria-hidden="true">${esc(r.amt)}</small>` : ""}`)(window.RTArt.rainOf(x))}</div>`).join("");
    const rel = d.releases || {};
    return `<section class="card fv-hero${dark ? " dark" : ""}" aria-label="지금부터 오늘 밤까지">${art}<div class="fv-hin">
      <p class="fv-meta">${esc(d.station.name)} · 지금부터 ${h0h >= 18 ? "내일 아침" : "오늘 밤"}까지 <span class="rt-badge fc">예보</span></p>
      <p class="fv-big">${h0.ta ?? "–"}<span>℃</span></p>
      <p class="fv-sky">${esc(h0.pty && h0.pty !== "없음" ? h0.pty : h0.sky || "하늘 자료 없음")} · ${hh(h0.time)}시</p>
      <p class="fv-sum">${tas.length ? `${Math.min(...tas)}~${Math.max(...tas)}℃` : "기온 자료 없음"} · 강수확률 최대 ${pops.length ? `${Math.max(...pops)}%` : "자료 없음"} · ${mm > 0 || lt1 ? `예상 강수량 ${mm > 0 ? `${Math.round(mm * 10) / 10}mm` : ""}${lt1 ? `${mm > 0 ? " + " : ""}1mm 미만 ${lt1}시간` : ""}` : noPcp === span.length ? "강수량 예보 없음" : "강수 없음 예보"}${noPcp && noPcp < span.length ? ` (${noPcp}시간 강수량 자료 없음)` : ""}</p></div>
      <div class="fv-hstrip">${strip}</div>
      <p class="rt-note fv-rel">발표: 초단기 ${esc(hm(rel.ultra?.base) || "없음")} · 단기 ${esc(hm(rel.vilage?.base) || "없음")}${[rel.ultra, rel.vilage].some((x) => x?.freshness?.state === "stale") ? ` <span class="rt-badge bad">지연</span>` : ""}</p></section>`;
  }
  const nextYmd = (ymd) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

  // 2) 가장 큰 변화(규칙): ① 강수 — 강수형태(PTY) 예보가 있는 시각과 강수확률 60% 이상인 시각을 구별(확률만으로 '비 시작'이라 하지 않음)
  //    ② 이웃한 날 최고기온 5℃ 이상 변화(가장 큰 것) ③ 3시간 안 기온 4℃ 이상 하강. 값은 rt-story-rules FORECAST_RULES 와 같음
  const R = { popHigh: 60, drop3h: 4, dayJump: 5, fullHours: 72 };
  const hasPty = (x) => !!(x.pty && x.pty !== "없음");
  const highPop = (x) => x.pop != null && x.pop >= R.popHigh;
  // 정시 연속 확인: 앞뒤가 정확히 1시간 간격인 칸만 이어진 것으로 봄
  const wallMs = (t) => Date.parse(`${t.replace(" ", "T")}+09:00`);
  const continuousHours = (hs) => hs.every((x, i) => i === 0 || wallMs(x.time) - wallMs(hs[i - 1].time) === 36e5);
  // 연속 구간 [i, j]: 조건 f 를 만족하며 1시간 간격으로 이어진 칸
  const runEnd = (hs, i, f) => { let j = i; while (j + 1 < hs.length && f(hs[j + 1]) && wallMs(hs[j + 1].time) - wallMs(hs[j].time) === 36e5) j++; return j; };
  function changes(d) {
    const out = [], hs = d.hours || [];
    if (hs.length) {
      const allTxt = hs.length >= R.fullHours && continuousHours(hs.slice(0, R.fullHours)) ? `${R.fullHours}시간 내내` : `제공된 ${hs.length}시간 내내`;
      const src = (x) => `${x.source} ${hm(x.base)} 발표`;
      if (hasPty(hs[0])) {
        // 지금 강수형태 예보가 있음 → 강수형태가 '없음'으로 바뀌는 첫 시각
        const j = runEnd(hs, 0, hasPty);
        out.push({ ico: kind(null, hs[0].pty) || "rain", t: j + 1 < hs.length ? `${dayWord(hs[j + 1].time.slice(0, 10), d.date)} ${hh(hs[j + 1].time)}시 무렵부터 강수형태 예보 없음` : `${allTxt} 강수형태(${hs[0].pty}) 예보`, sub: `지금 ${esc(hs[0].pty)} 예보${hs[0].pop != null ? ` · 강수확률 ${hs[0].pop}%` : ""}`, src: src(hs[0]) });
      } else {
        const i = hs.findIndex(hasPty);
        if (i > 0) {
          const s0 = hs[i], j = runEnd(hs, i, hasPty);
          const mm = hs.slice(i, j + 1).reduce((a, x) => a + (x.pcpMm > 0 ? x.pcpMm : 0), 0);
          out.push({ ico: kind(null, s0.pty) || "rain", t: `${dayWord(s0.time.slice(0, 10), d.date)} ${hh(s0.time)}시 무렵부터 ${s0.pty} 예보`, sub: `강수형태 예보 ${j - i + 1}시간 이어짐(${hh(hs[j].time)}시까지)${s0.pop != null ? ` · 강수확률 ${s0.pop}%` : ""}${mm > 0 ? ` · 숫자로 나온 강수량 합 ${Math.round(mm * 10) / 10}mm` : ""}`, src: src(s0) });
        } else {
          // 강수형태 예보는 없고 강수확률만 높은 시간대
          const p = hs.findIndex(highPop);
          if (p >= 0) { const j = runEnd(hs, p, highPop); out.push({ ico: "rain", t: p === 0 && j === hs.length - 1 ? `${allTxt} 강수확률 ${R.popHigh}% 이상` : `${dayWord(hs[p].time.slice(0, 10), d.date)} ${hh(hs[p].time)}시~${hh(hs[j].time)}시 강수확률 ${R.popHigh}% 이상`, sub: `강수형태 예보는 없음 · 최대 ${Math.max(...hs.slice(p, j + 1).map((x) => x.pop))}%`, src: src(hs[p]) }); }
        }
      }
    let best = null;
      const byT = new Map(hs.map((x) => [x.time, x])), plus3 = (t) => { const d0 = new Date(`${t.replace(" ", "T")}+09:00`); d0.setTime(d0.getTime() + 3 * 36e5); const k = new Date(d0.getTime() + 9 * 36e5).toISOString(); return `${k.slice(0, 10)} ${k.slice(11, 13)}:00:00`; };
      for (let i = 0; i < hs.length; i++) { const nx = byT.get(plus3(hs[i].time)); if (!nx) continue; const a = hs[i].ta, b = nx.ta; if (a != null && b != null && a - b >= R.drop3h && (!best || a - b > best.dv)) best = { dv: Math.round((a - b) * 10) / 10, a: hs[i], b: nx }; }
      if (best) out.push({ ico: "drop", t: `${dayWord(best.a.time.slice(0, 10), d.date)} ${hh(best.a.time)}시→${hh(best.b.time)}시 기온 ${best.a.ta}℃ → ${best.b.ta}℃ (${Math.abs(best.dv)}℃ 하강)`, sub: "3시간 사이 가장 큰 하강", src: `${best.b.source} ${hm(best.b.base)} 발표` });
    }
    const ds = (d.days || []).filter((x) => !x.none && x.max != null);
    let jump = null;
    for (let i = 1; i < ds.length; i++) { if (Math.round((Date.parse(ds[i].date) - Date.parse(ds[i - 1].date)) / 864e5) !== 1) continue; const dv = Math.round((ds[i].max - ds[i - 1].max) * 10) / 10; if (Math.abs(dv) >= R.dayJump && (!jump || Math.abs(dv) > Math.abs(jump.dv))) jump = { dv, a: ds[i - 1], b: ds[i] }; }
    if (jump) out.push({ ico: jump.dv < 0 ? "drop" : "rise", t: `${dayWord(jump.b.date, d.date)} 최고기온 ${jump.b.max}℃ — 전날(${jump.a.max}℃)보다 ${Math.abs(jump.dv)}℃ ${jump.dv < 0 ? "낮아요" : "높아요"}`, sub: `이웃한 두 날 최고기온 차이가 가장 큰 날${jump.a.maxSource !== jump.b.maxSource ? ` (전날은 ${jump.a.maxSource}, 이날은 ${jump.b.maxSource} 값)` : ""}`, src: `${jump.b.maxSource} ${hm(jump.b.maxBase)} 발표` });
    return out;
  }
  // 4단계 '가장 큰 변화'(6장): 서버 bigChanges(크기 M 큰 순 3개 → 시간순) 를 시간선으로. 누르면 72시간 그래프에서 그 구간 강조
  const BC_ICON = { ta3h: (x) => (x.delta < 0 ? "drop" : "rise"), tmn: (x) => (x.delta < 0 ? "drop" : "rise"), range: () => "rise", wind: () => "wind", rh: () => "rh", pty: () => "pty", weekend: () => "weekend" };
  const BC_WORD = { ta3h: "3시간 기온", tmn: "아침 최저", range: "일교차", wind: "바람", rh: "습도", pty: "강수형태", weekend: "주말" };
  function bigCard(d, sel) {
    const B = d.bigChanges, it = B.items || [];
    const old = changes(d);
    const ic = (x) => { const k = (BC_ICON[x.kind] || (() => ""))(x); return k === "drop" ? `<b class="fv-arrow down">↓</b>` : k === "rise" ? `<b class="fv-arrow up">↑</b>` : k === "pty" ? iconSvg(/눈/.test(x.title) ? "snow" : "rain", false, 28, x.title) : `<b class="fv-tlk">${esc(BC_WORD[x.kind] || "")}</b>`; };
    const when = (w) => `${dayWord(w.slice(0, 10), d.date)} ${hh(w)}시`;
    const tl = it.length ? `<ol class="fv-tl" aria-label="큰 변화 시간선(누르면 72시간 그래프에서 그 구간 강조)">${it.map((x, i) => `<li><button type="button" class="fv-tli${sel === i ? " on" : ""}" data-bc="${i}" aria-pressed="${sel === i}"><span class="fv-tlt">${esc(when(x.startW))}</span>${ic(x)}<span class="fv-tlb"><b>${esc(x.title).replace(/(\d(?:℃|%p|m\/s)) (상승|하강)/g, "$1\u00a0$2")}</b><small>${esc(x.sub)}${x.source ? ` · ${esc(x.source)}` : ""}</small></span><span class="fv-m" title="크기 M ${x.M}(통계적 희귀도 아님)"><i style="width:${Math.round(x.M * 100)}%"></i></span></button></li>`).join("")}</ol>` : `<p class="rt-ins">앞으로 72시간 큰 변화 없음(규칙에 해당하는 변화가 없어요)</p>`;
    const more = old.length ? `<details class="fv-more"><summary>규칙별 예보 변화 ${old.length}개 더 보기</summary><ul>${old.map((c) => `<li><div><b>${esc(c.t)}</b><small>${esc(c.sub)} · ${esc(c.src)}</small></div></li>`).join("")}</ul></details>` : "";
    return `<section class="card fv-chg" aria-label="가장 큰 변화"><h2>가장 큰 변화 <span class="rt-badge fc">예보</span>${B.found > it.length ? ` <small class="rh-sub">${B.found}개 중 큰 ${it.length}개</small>` : ""}</h2>${tl}${more}${window.InfoTip.note(`막대 = 변화 크기(드문 정도 아님)`, `막대 = 변화 크기 M(기준 대비 변화량: 3시간 기온 8℃, 최저기온 10℃, 바람 6m/s, 습도 40%p 등) — 드문 정도가 아닙니다. 규칙: 3시간 기온 4℃ 이상(아침 오름·저녁 내림 방향은 6℃), 이웃한 날 최저 5℃ 이상, 3시간 풍속 3m/s 이상 늘어 5m/s 이상, 다음 날 일교차 10℃ 이상이고 5℃ 이상 커짐, 습도 3시간 20%p 이상(같은 하루 흐름 방향은 30%p), 강수형태가 2시간 이상씩 바뀜, 주말 중 하루만 바깥 활동 조건. 시각은 예보 정시 기준.`, { cls: "rt-note", label: "변화 규칙" })}</section>`;
  }
  function changeCard(d, sel = null) {
    if (d.bigChanges) return bigCard(d, sel);
    const cs = changes(d);
    const ic = (k) => (k === "drop" ? `<b class="fv-arrow down">↓</b>` : k === "rise" ? `<b class="fv-arrow up">↑</b>` : iconSvg(k, false, 34, k));
    return `<section class="card fv-chg" aria-label="가장 큰 변화"><h2>가장 큰 변화 <span class="rt-badge fc">예보</span></h2>${cs.length ? `<ul>${cs.map((c) => `<li>${ic(c.ico)}<div><b>${esc(c.t)}</b><small>${esc(c.sub)} · ${esc(c.src)}</small></div></li>`).join("")}</ul>` : `<p class="rt-ins">앞으로 큰 변화 없음</p>`}${window.InfoTip.note(`예보 정시 기준 · 해당하는 것만`, `규칙: 강수형태(비·눈 등) 예보가 시작·끝나는 시각, 강수형태 예보 없이 강수확률만 60% 이상인 시간대(따로 표시), 3시간 사이 기온 4℃ 이상 하강, 이웃한 날 최고기온 5℃ 이상 변화. 시각은 예보 정시 기준이라 정확한 시작 시각이 아닙니다. 해당하는 것만 보입니다.`, { cls: "rt-note", label: "변화 규칙" })}</section>`;
  }
  // 기상청 중기전망(10장): 원문 그대로(이스케이프), 발표시각·구역·지연 표시. 낱말 표지는 문장으로 가는 길잡이일 뿐
  const OL_KEYS = ["비", "눈", "기온", "바람"];
  // 낱말 단위로만(비슷·비교·눈금 같은 말은 빼려고): 앞이 한글이 아니고 뒤가 조사·문장부호·공백
  const OL_RE = { 비: /(^|[^가-힣])비(?=[\s,.)·가는와나도소]|$)/, 눈: /(^|[^가-힣])눈(?=[\s,.)·이은과나도소]|$)/, 기온: /기온/, 바람: /바람/ };
  const olKeys = (t) => OL_KEYS.filter((k) => OL_RE[k].test(t));
  function outlookFold(d) {
    const o = d.outlook;
    if (!o) return "";
    if (!o.text) return `<details class="card rh-fold fv-fold fv-outlook"><summary>기상청 중기전망 — 자료 없음</summary><p class="rt-ins">${esc(o.note || "중기전망 자료 없음")}</p></details>`;
    // 원문 줄바꿈 중 ○·* 로 시작하지 않는 줄은 앞 문장의 이어짐
    const lines = String(o.text).split(/\n+/).map((l) => l.trim()).filter(Boolean).reduce((a, l) => { if (a.length && !/^[○*※\-]/.test(l)) a[a.length - 1] += ` ${l}`; else a.push(l); return a; }, []);
    const sents = lines.flatMap((l) => l.split(/(?<=다\.)\s+/));
    const has = (k) => sents.some((x) => OL_RE[k].test(x));
    const stale = o.freshness?.state === "stale";
    const tags = OL_KEYS.filter(has).map((k) => `<button type="button" class="fv-olk" data-olk="${esc(k)}">${esc(k)}</button>`).join("");
    return `<details class="card rh-fold fv-fold fv-outlook"><summary>기상청 중기전망 — ${esc(o.region || o.regionId || "")} ${esc(hm(o.tmFc))} 발표${stale ? ` <span class="rt-badge bad">지연</span>` : ""}</summary><section>${stale ? `<p class="rt-ins">${esc(o.freshness.text)} — 최신 전망이 아닐 수 있습니다.</p>` : ""}${tags ? `<p class="fv-olks">문장 찾기: ${tags}</p>` : ""}<div class="fv-oltext">${sents.map((x) => `<p class="fv-ols" data-k="${esc(olKeys(x).join(" "))}">${esc(x)}</p>`).join("")}</div>${window.InfoTip.note(`${esc(o.source || "")} 원문 그대로`, `${esc(o.source || "")} 원문을 그대로 보여 줍니다(구역 ${esc(o.region || "")} 전체에 대한 문장이며, 이 지점 값으로 바꾸지 않았습니다). 낱말 단추는 그 낱말이 든 문장을 표시할 뿐 판단이 아닙니다.`, { cls: "rt-note", label: "원문 안내" })}</section></details>`;
  }
  // 3) 72시간 그래프: 위 날씨 그림 띠, 가운데 기온선(예보 점선)+기준 평균선, 아래 강수확률 막대·강수량, 맨 아래 바람 화살표. 밤(18~6시) 음영
  const PAD = { L: 34, R: 10 };
  const xOf = (i, n, W) => PAD.L + (i / Math.max(1, n - 1)) * (W - PAD.L - PAD.R);
  const idxAt = (fr, n, W) => Math.max(0, Math.min(n - 1, Math.round(((fr * W - PAD.L) / (W - PAD.L - PAD.R)) * Math.max(1, n - 1))));
  function chart72(hrs, lines, colors, wind, W, H, sel, hl = null) {
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
    // 강조 구간(가장 큰 변화에서 고른 것): startW~endW 정시 칸
    if (hl) {
      const key = (w) => String(w).slice(0, 13);
      let a = hrs.findIndex((x) => key(x.time) >= key(hl.startW)), b = -1;
      for (let i = hrs.length - 1; i >= 0; i--) if (key(hrs[i].time) <= key(hl.endW)) { b = i; break; }
      if (a >= 0 && b >= a) s += `<rect class="fv-hl" x="${(X(a) - step / 2).toFixed(1)}" y="0" width="${(X(b) - X(a) + step).toFixed(1)}" height="${H}" fill="#fff1c2" stroke="#c98a00" stroke-width="1.4" opacity=".9"/><text x="${(X(a) - step / 2 + 3).toFixed(1)}" y="${H - 3}" font-size="10.5" font-weight="700" fill="#8a4b00">${esc(hl.label || "")}</text>`;
    }
    for (let t = Math.ceil(lo / 2) * 2; t <= hi; t += 2) s += `<line x1="${PAD.L}" x2="${W - PAD.R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e0e8f4"/><text x="${PAD.L - 5}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#5e7090">${t}</text>`;
    // 날짜 표시: 0시 + 그래프 첫 칸(0시가 아니면 첫 날짜가 안 보이던 문제). 날짜 글자와 겹치는 'N시' 는 뺌(5단계)
    const dayX = []; // [시작 x, 끝 x]
    hrs.forEach((x, i) => {
      const h = hh(x.time);
      if (h !== 0 && i !== 0) return;
      const lab = dlab(x.time.slice(0, 10)), x0 = h === 0 ? X(i) + 4 : Math.max(2, X(i) - step / 2 + 2);
      if (h === 0) s += `<line x1="${X(i)}" x2="${X(i)}" y1="0" y2="${H}" stroke="#b9c8de"/>`;
      else if (hrs.some((y, j) => j > 0 && j * step < 64 && hh(y.time) === 0)) return; // 곧 0시 날짜가 나오면 첫 칸 날짜는 생략
      s += `<text class="fv-day" x="${x0.toFixed(1)}" y="${tB + 14}" font-size="11" font-weight="700" fill="#0d1b3d">${esc(lab)}</text>`;
      dayX.push([x0 - 2, x0 + lab.length * 6.6 + 4]);
    });
    hrs.forEach((x, i) => { const h = hh(x.time); if (h === 0 || h % 6 !== 0) return; const c = X(i); if (dayX.some(([a, b]) => c + 9 > a && c - 9 < b)) return; s += `<text x="${c}" y="${tB + 14}" text-anchor="middle" font-size="10.5" fill="#5e7090">${h}시</text>`; });
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
        <span class="fv-v lo">${x.none ? "" : x.min ?? "–"}°</span><span class="fv-track">${base}${bar}</span><span class="fv-v hi">${x.none ? "" : x.max ?? "–"}°${dm != null && Math.abs(dm) >= 1 ? `<em class="${cls(dm)}" title="최고기온 평균 대비 ${sg(dm)}" aria-label="최고기온 평균 대비 ${sg(dm)}">${sg(dm)}</em>` : ""}</span>${x.none ? `<span class="fv-none rt-ins">예보 없음</span>` : ""}<small class="fv-src">${esc((x.maxSource || x.minSource || x.wxSource || "").replace("예보", ""))}</small></li>`;
    }).join("");
    return `<section class="card fv-pills" aria-label="10일 예보"><h2>${ds.length}일 예보 <span class="rt-badge fc">예보</span></h2><div class="rt-legend"><span><i class="fv-key rng"></i> 예보 최저~최고</span><span><i class="fv-key base"></i> ${esc(per ? `${per.label.replace(" 평균", "")}(${per.range}) 평균` : "기준 평균")} 같은 시기 최저~최고</span></div><ul>${rows}</ul>${window.InfoTip.note(`단기 → 중기(발표 ${esc(hm(d.releases?.midTa) || "없음")})`, `최고기온 옆 숫자 = 기준 평균 최고기온과의 차이(1℃ 이상만). 단기 = 단기예보(대략 3일), 중기 = 중기예보(발표 ${esc(hm(d.releases?.midTa) || "없음")}). 강수확률은 하루 중 가장 큰 값.`, { cls: "rt-note", label: "보는 법" })}</section>`;
  }
  window.RTFV = { hero, changeCard, outlookFold, chart72, pills, xOf, idxAt, iconSvg, kind, dlab };
})();
