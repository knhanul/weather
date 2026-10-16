// 오늘의 날씨 첫 화면(히어로·다음 시간·옷차림 참고·생활 질문·주간·이날의 기록). 기존 API(/api/rt/today·forecast·life·stories·similar)만 읽고 숫자는 지어내지 않는다.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sg = (d, u = "℃") => (d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}${u}`);
  const memo = new Map();
  const get = async (u) => { const c = memo.get(u); if (c && Date.now() - c.at < 60000) return c.p; const p = (async () => { const r = await fetch(u); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.message || `HTTP ${r.status}`); return d; })(); memo.set(u, { at: Date.now(), p }); p.catch(() => memo.delete(u)); return p; };
  // 선택 기준(NWBasis): 전체 비교 = 1990년 이후가 대표, 10년·5년은 작게
  const basis = () => (window.NWBasis ? NWBasis.get() : "cmp");
  const mainId = () => (basis() === "cmp" ? "all" : basis());
  const pickP = (list, id = mainId()) => (list || []).find((p) => p.id === id) || null;
  const others = (list) => (basis() === "cmp" ? (list || []).filter((p) => p.id !== "all") : []);
  const nm = (p) => `${String(p.label).replace(" 평균", "")} ${p.range}`;
  const ICON = { 맑음: "☀️", 구름많음: "⛅", 흐림: "☁️", 비: "🌧️", "비/눈": "🌨️", 눈: "❄️", 소나기: "🌦️", 빗방울: "🌦️", "빗방울눈날림": "🌨️", 눈날림: "🌨️" };
  const iconTxt = (t) => (!t ? "" : ICON[t] || (/눈/.test(t) ? "❄️" : /비|소나기/.test(t) ? "🌧️" : /흐/.test(t) ? "☁️" : /구름/.test(t) ? "⛅" : /맑/.test(t) ? "☀️" : ""));
  const icon = (h) => iconTxt(h?.pty && h.pty !== "없음" ? h.pty : h?.sky) || "·";
  const wx = (h) => (h?.pty && h.pty !== "없음" ? h.pty : h?.sky) || null;
  const ymdK = (s) => `${s.slice(0, 4)}년 ${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
  const DOW = "일월화수목금토";
  const dow = (s) => DOW[new Date(`${s}T12:00:00+09:00`).getUTCDay()];
  // 기온별 옷차림 — 널리 쓰이는 일반 기준(규칙). 값은 예보·실황 기온 그대로, 안내는 참고용
  const WEAR = [[28, "민소매·반바지"], [23, "반팔·얇은 셔츠"], [20, "얇은 가디건·긴팔"], [17, "맨투맨·얇은 니트"], [12, "자켓·가디건"], [9, "트렌치코트·야상"], [5, "코트·히트텍"], [-99, "패딩·목도리"]];
  const wearOf = (t) => WEAR.find(([lo]) => t >= lo)[1];
  function mood(diff) {
    if (diff == null) return null;
    const a = Math.abs(diff);
    if (a < 1) return "평소와 비슷한";
    return `평소보다 ${a}℃ ${diff > 0 ? "따뜻한" : "쌀쌀한"}`;
  }
  const part = (h) => (h < 6 ? "새벽" : h < 11 ? "아침" : h < 14 ? "한낮" : h < 18 ? "오후" : "저녁");
  // 히어로(동기, /api/rt/today 만으로)
  function hero(d, chart = "") {
    const c = d.current, v = c.values;
    if (!v) return `<section class="card rh-hero"><p class="result bad">${esc(c.message || "오늘 실황 자료가 없습니다")}</p></section>`;
    const stale = c.freshness?.state === "stale";
    const p = pickP(c.compare?.ta);
    const m = p && p.mean != null ? mood(p.diff) : null;
    const line = stale ? esc(c.freshness.text) : m ? `${p.id === "all" ? m : m.replace("평소와", `${p.label}과`).replace("평소보다", `${p.label}보다`)} ${part(c.hour)}` : `${p ? esc(nm(p)) + " " : ""}비교 데이터 부족`;
    // 분포 띠: 같은 시기·시각 과거 최저~최고, 10·90백분위, 지금 위치(표본 60개 이상일 때만)
    let meter = "";
    if (p && (p.percentile == null || !p.min || !p.max)) meter = `<p class="rt-ins rh-meter">${esc(nm(p))} 분포·순위: 비교 데이터 부족${p.samples != null ? `(표본 ${p.samples}개, 60개 이상 필요)` : ""}</p>`;
    else if (p) {
      const lo = p.min.value, hi = p.max.value, pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
      meter = `<div class="rh-meter" aria-label="과거 같은 시기 이 시각 분포에서 지금 위치"><div class="rh-bar"><i class="rh-band" style="left:${pos(p.p10)}%;width:${pos(p.p90) - pos(p.p10)}%"></i><i class="rh-avg" style="left:${pos(p.mean)}%"></i><b class="rh-dot" style="left:${pos(v.ta)}%"></b></div><div class="rh-ends"><span>${lo}℃ <small>${esc(p.min.date.slice(0, 4))}</small></span><span>${esc(nm(p))} 같은 시기 이 시각 ${p.samples}개 중 따뜻한 쪽 ${p.rankHigh}위</span><span>${hi}℃ <small>${esc(p.max.date.slice(0, 4))}</small></span></div></div>`;
    }
    return `<section class="card rh-hero${stale ? " is-stale" : ""}" aria-label="지금 날씨">
      <p class="rh-meta">${esc(d.station.name)} · ${esc(c.time.slice(11, 16))} 실황 ${stale ? `<span class="rt-badge bad">지연</span>` : `<span class="rt-badge ok">최신</span>`}</p>
      <div class="rh-main"><div><p class="rh-temp">${v.ta}<span>℃</span></p><p class="rh-sky" id="rhSky"></p></div>
        <div class="rh-side">${p && p.mean != null ? `<b class="rh-diff ${p.diff > 0 ? "up" : p.diff < 0 ? "down" : ""}">${sg(p.diff)}</b><small>${esc(nm(p))} 같은 시기 이 시각 평균 ${p.mean}℃</small>${others(c.compare?.ta).map((o) => `<small>${esc(nm(o))} ${o.mean == null ? "비교 데이터 부족" : `${o.mean}℃(<b class="${o.diff > 0 ? "up" : o.diff < 0 ? "down" : ""}">${sg(o.diff)}</b>)`}</small>`).join("")}` : `<small class="rt-ins">${esc(p ? nm(p) + " " : "")}${esc(p?.statusText || "비교 데이터 부족")}</small>`}
          <small>습도 ${v.hm ?? "–"}% · ${esc(v.windDir || "")} ${v.ws ?? "–"}m/s${v.rn1 ? ` · 1시간 ${v.rn1}mm` : ""}</small>
          ${d.day?.max?.value != null || d.day?.min?.value != null ? `<small>오늘 최저 ${d.day.min.value ?? "–"}℃ / 최고 ${d.day.max.value ?? "–"}℃ <span class="rt-badge fc">예보</span></small>` : ""}</div></div>
      <h2 class="rh-line">${line}</h2><p class="rh-story" id="rhStory"></p>
      ${meter}
    </section>
    <section class="card rh-nation" id="rhNation" aria-label="지금 전국은?"><h2>지금 전국은?</h2><p class="rt-load">불러오는 중…</p></section>
    <section class="card rh-hours" aria-label="앞으로 12시간"><h2>앞으로 12시간 <span class="rt-badge fc">예보</span></h2><div class="rh-chips" id="rhHours"><p class="rt-load">불러오는 중…</p></div></section>
    ${chart}
    <section class="card rh-tip" id="rhTip" aria-label="옷차림·우산 참고" hidden></section>
    <section class="card rh-life" id="rhLife" aria-label="생활 질문" hidden></section>`;
  }
  function hoursHtml(f) {
    const hs = (f.hours || []).slice(0, 12);
    if (!hs.length) return `<p class="rt-ins">예보 자료가 없습니다</p>`;
    return hs.map((h) => `<div class="rh-chip${h.pop >= 60 ? " wet" : ""}"><span>${Number(h.time.slice(11, 13))}시</span><i aria-label="${esc(wx(h) || "")}">${icon(h)}</i><b>${h.ta ?? "–"}°</b><small>${h.pop == null ? "" : `☂${h.pop}%`}</small></div>`).join("");
  }
  function tipHtml(t, f) {
    const hs = (f.hours || []).slice(0, 12);
    const max = t.day?.max?.value, min = t.day?.min?.value, now = t.current?.values?.ta;
    const items = [];
    if (now != null) items.push(`<li><b>지금 ${now}℃</b> — ${esc(wearOf(now))}</li>`);
    if (max != null && min != null) {
      items.push(`<li>낮 최고 ${max}℃엔 ${esc(wearOf(max))}, 아침·밤 최저 ${min}℃엔 ${esc(wearOf(min))}</li>`);
      if (max - min >= 10) items.push(`<li>일교차 ${Math.round((max - min) * 10) / 10}℃ — 겉옷을 챙기면 좋아요</li>`);
    }
    const wet = hs.filter((h) => (h.pop ?? 0) >= 60 || (h.pty && h.pty !== "없음"));
    if (wet.length) { const h = wet[0]; items.push(`<li>☂ ${Number(h.time.slice(11, 13))}시쯤 ${esc(h.pty && h.pty !== "없음" ? h.pty : "비")} 예보(강수확률 ${h.pop ?? "–"}%) — 우산 챙기세요</li>`); }
    else if (hs.length) items.push(`<li>앞으로 12시간 강수확률 60% 이상인 시간 없음</li>`);
    if (!items.length) return "";
    return `<h2>오늘 뭐 입지? <span class="rt-badge fc">참고용 안내</span></h2><ul class="rh-list">${items.join("")}</ul><p class="rt-note">기온별 옷차림 일반 기준을 실황·단기예보 기온에 규칙으로 맞춘 참고 안내입니다. 체감은 바람·습도·사람마다 다릅니다.</p>`;
  }
  function lifeRow(x) {
    const ps = (x.periods || []).filter((p) => "diff" in p && (basis() === "cmp" || p.id === basis()));
    if (!ps.length) return "";
    return `<small class="rh-qb">${ps.map((p) => `${esc(nm(p))} ${p.diff == null ? "비교 데이터 부족" : sg(p.diff)}`).join(" · ")}</small>`;
  }
  function lifeHtml(l) {
    const it = (l.items || []).filter((x) => x.answer != null);
    if (!it.length) return "";
    return `<h2>궁금한 날씨, 바로 답</h2><div class="rh-qa">${it.map((x) => `<a class="rh-q" href="#/stats/life?station=${esc(l.station?.id || "")}"><span>${esc(x.q)}</span><b>${esc(x.answer)}</b>${lifeRow(x)}<small class="rt-badge ${x.kind === "관측" || x.kind === "실황" ? "ok" : "fc"}">${esc(x.kind || "")}</small></a>`).join("")}</div>`;
  }
  function weekHtml(f) {
    const ds = (f.days || []).filter((x) => x.max != null || x.min != null);
    if (!ds.length) return "";
    return `<section class="card rh-week" aria-label="이번 주 예보"><h2>이번 주 <span class="rt-badge fc">예보</span> <a class="rh-more" href="#/forecast">날씨 예보 ›</a></h2><div class="rh-chips">${ds.map((x) => { const c = pickP(x.maxCmp); return `<div class="rh-chip day"><span>${x.offset === 0 ? "오늘" : x.offset === 1 ? "내일" : `${Number(x.date.slice(8))}(${dow(x.date)})`}</span><i>${iconTxt(x.sky || x.wf) || "–"}</i><b>${x.max ?? "–"}°</b><small>${x.min ?? "–"}°</small>${c && c.diff != null && Math.abs(c.diff) >= 1 ? `<em class="${c.diff > 0 ? "up" : "down"}">${sg(c.diff)}</em>` : ""}${x.pop != null ? `<small>☂${x.pop}%</small>` : ""}</div>`; }).join("")}</div><p class="rt-note">최고기온 옆 숫자는 ${esc(pickP(ds[0].maxCmp) ? nm(pickP(ds[0].maxCmp)) : "선택 기준")} 같은 시기 최고기온 평균과의 차이(1℃ 이상만). 단기예보·중기예보.</p></section>`;
  }
  function histHtml(t, sim) {
    const p = pickP(t.current?.compare?.ta);
    const rows = [];
    if (p?.max) rows.push(`<li><span class="up">가장 더웠던</span> ${ymdK(p.max.date)} 이 시각 <b>${p.max.value}℃</b></li>`);
    if (p?.min) rows.push(`<li><span class="down">가장 추웠던</span> ${ymdK(p.min.date)} 이 시각 <b>${p.min.value}℃</b></li>`);
    if (sim?.ok && sim.top?.[0]) { const b = sim.top[0]; rows.push(`<li><span>오늘과 가장 닮은 날</span> ${ymdK(b.date)}${b.max != null ? ` — 그날 최고 ${b.max}℃ · 최저 ${b.min}℃` : ""} <small>(지금까지 기온 흐름 RMSE ${b.rmse}℃)</small></li>`); }
    if (!rows.length) return "";
    return `<section class="card rh-hist" aria-label="이맘때의 기록"><h2>이맘때의 기록 <span class="rt-badge ok">과거 관측</span></h2><ul class="rh-list">${rows.join("")}</ul><p class="rt-note">${esc(p ? nm(p) : "")}: 같은 월일 ±7일, 같은 정시(${t.current.hour}시) ASOS 관측 중. 자세한 유사일 목록은 아래 ‘과거 유사일’.</p></section>`;
  }
  // 지금 전국은? — /api/rt/regions(관측소별 초단기실황 + 3개 기준 평균) 그대로. 위치는 대략적인 지도 배치(열, 행)
  const POS = { 112: [1, 1], 108: [2, 1], 119: [2, 2], 133: [2, 3], 156: [1, 4], 143: [3, 4], 159: [3, 5], 184: [1, 6] };
  function nationHtml(r, cur) {
    const id = mainId(), per = (r.periods || []).find((p) => p.id === id);
    const cells = (r.rows || []).map((x) => {
      const [c, w] = POS[x.id] || [3, 6];
      const dv = x.diffs ? x.diffs[id] : null;
      return `<button type="button" class="rh-st${String(x.id) === String(cur) ? " on" : ""}" data-st="${esc(x.id)}" style="grid-column:${c};grid-row:${w}" aria-label="${esc(x.name)}으로 바꾸기"><span>${esc(x.name)}</span>${x.temp == null ? `<em class="rt-ins">자료 없음</em>` : `<b>${x.temp}℃</b><small class="${dv > 0 ? "up" : dv < 0 ? "down" : ""}">${dv == null ? "비교 데이터 부족" : sg(dv)}</small>`}</button>`;
    }).join("");
    const t = (r.rows || []).find((x) => x.time)?.time;
    return `<h2>지금 전국은? <small class="rh-sub">${t ? `${esc(t.slice(11, 16))} 실황` : ""}</small></h2><div class="rh-map">${cells}</div><p class="rt-note">기온 아래 숫자: ${per ? esc(`${per.label.replace(" 평균", "")} ${per.range}`) : "선택 기준"} 같은 시기 이 시각 평균과의 차이. 누르면 그 관측소로 바뀝니다. 출처: 기상청 초단기실황(관측소 격자). 하늘 상태는 관측소별 자료가 없어 표시하지 않습니다.</p>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#rhNation [data-st]"); if (!b) return;
    const sel = document.getElementById("rtStation"); if (!sel || sel.value === b.dataset.st) return;
    sel.value = b.dataset.st; sel.dispatchEvent(new Event("change", { bubbles: true }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  let seq = 0;
  async function fill(t) {
    const my = ++seq, st = t.station.id;
    get("/api/rt/regions").then((r) => { const el = document.getElementById("rhNation"); if (my === seq && el) el.innerHTML = nationHtml(r, st); }).catch((e) => { const el = document.getElementById("rhNation"); if (el) el.innerHTML = `<h2>지금 전국은?</h2><p class="rt-ins">자료 없음 — ${esc(e.message)}</p>`; });
    const [f, l, s] = await Promise.allSettled([get(`/api/rt/forecast?station=${st}`), get(`/api/rt/life?station=${st}`), get(`/api/rt/similar?station=${st}&day=today`)]);
    if (my !== seq || !document.getElementById("rhHours")) return;
    const fv = f.status === "fulfilled" ? f.value : null;
    document.getElementById("rhHours").innerHTML = fv ? hoursHtml(fv) : `<p class="rt-ins">예보를 불러오지 못했습니다</p>`;
    if (fv?.hours?.[0] && wx(fv.hours[0])) document.getElementById("rhSky").innerHTML = `${icon(fv.hours[0])} ${esc(wx(fv.hours[0]))} <small>${Number(fv.hours[0].time.slice(11, 13))}시 예보</small>`;
    const tip = document.getElementById("rhTip"), th = fv ? tipHtml(t, fv) : "";
    if (th) { tip.innerHTML = th; tip.hidden = false; }
    const life = document.getElementById("rhLife"), lh = l.status === "fulfilled" ? lifeHtml(l.value) : "";
    if (lh) { life.innerHTML = lh; life.hidden = false; }
    const wk = document.getElementById("rhWeek"); if (wk && fv) wk.innerHTML = weekHtml(fv);
    paintStory();
    const hi = document.getElementById("rhHist"); if (hi) hi.innerHTML = histHtml(t, s.status === "fulfilled" ? s.value : null);
  }
  // rt-stories.js 가 이야기를 받으면 맨 위 이야기를 히어로 한 줄로
  async function storyLine(s, st) {
    const badge = `<span class="rt-badge ${s.kind === "관측" ? "ok" : "fc"}">${esc(s.kind)}</span> `;
    const m = /^ytd-(\w+)$/.exec(s.key || "");
    if (!m) return badge + esc(s.title) + (mainId() !== "all" ? ` <small>(이야기는 1990년 이후 기준)</small>` : "");
    const y = await get(`/api/rt/ytd?station=${st}`).catch(() => null);
    const it = y?.items?.find((x) => x.id === m[1]);
    const p = pickP(it?.periods);
    if (!it || !p) return badge + esc(s.title);
    const big = it.id === "rain" ? "많은" : "높은", small = it.id === "rain" ? "적은" : "낮은";
    const rank = p.rankHigh && p.of ? (p.rankHigh <= (p.of + 1) / 2 ? `${big} 쪽 ${p.rankHigh}위` : `${small} 쪽 ${p.of - p.rankHigh + 1}위`) : null;
    const extra = others(it.periods).map((o) => `${nm(o)} ${o.diff == null ? "비교 데이터 부족" : sg(o.diff, it.unit)}`).join(" · ");
    return badge + esc(`올해 ${it.label} ${it.value}${it.unit} — ${nm(p)} 같은 누적 기간 평균 ${p.mean == null ? "비교 데이터 부족" : `${p.mean}${it.unit}(${sg(p.diff, it.unit)})`}${rank ? `, ${p.of}개 해 중 ${rank}` : ""}`) + (extra ? ` <small>${esc(extra)}</small>` : "");
  }
  let lastStories = null;
  const paintStory = async () => { const el = document.getElementById("rhStory"), s = lastStories?.stories?.[0]; if (!el || !s) return; const h = await storyLine(s, lastStories.station?.id || window.RT?.station?.() || "108"); if (el.isConnected) el.innerHTML = h; };
  document.addEventListener("rt:stories", (e) => { lastStories = e.detail; paintStory(); });
  window.RTHome = { hero, fill };
})();
