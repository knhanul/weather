// 오늘의 날씨 '과거와 비교' 묶음 카드(astra 4단계): 계절 신호 · 최근 30일 비 달력 · 내가 기억하는 이날.
//   계절 신호·비 달력은 이미 받은 /api/rt/stories 응답(rt:stories)의 seasons·rainCalendar 만 쓰고, 이날 카드는 기존 '매년 같은 날' 통계(/api/stats/life/day)를 다시 씀.
//   숫자는 서버 값 그대로. 자료 없는 날은 0 으로 보지 않음(빗금), 오늘은 집계 전.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const mdK = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
  const ymdK = (d) => `${d.slice(0, 4)}년 ${mdK(d)}`;
  const get = (u) => (window.RTGet ? window.RTGet(u) : fetch(u).then((r) => r.json()));
  // ---------------------------------------------------------------- 계절 신호
  const SEL = { id: null };
  function seasonLine(e) {
    const c = e.chart || {};
    const cur = e.current || {};
    const st = cur.date ? `${mdK(cur.date)}${cur.firstConfirmed === false ? " <small>(확인 가능한 자료에서 처음)</small>" : ""}` : e.forecast ? `<span class="rt-badge fc">가능성</span> ${mdK(e.forecast.date)} 예보` : `<span class="rt-ins">현재까지 확인되지 않음</span>`;
    const mean = c.meanDate ? `${esc(c.basisLabel || "")} ${c.meanDate.replace("-", "/")}` : `<span class="rt-ins">${esc(c.statusText || "비교 데이터 부족")}</span>`;
    return `<button type="button" class="rhc-sev${SEL.id === e.id ? " on" : ""}" data-sev="${esc(e.id)}" aria-pressed="${SEL.id === e.id}"><b>${esc(SHORT[e.id] || e.label)}</b><span>${st}</span><small>${mean} · 발생 ${c.hitSeasons ?? "–"}/${c.completeSeasons ?? "–"}시즌</small></button>`;
  }
  const SHORT = { "first-hot-day": "첫 30℃", "first-frost": "첫 영하(최저 0℃ 미만)", "first-snow": "첫 신적설", "first-warm-night": "첫 열대야(추정)", "last-hot-day": "가장 최근 30℃" };
  const NOTE = { "first-frost": "일최저기온 0℃ 미만 — 서리 관측과 다릅니다.", "first-snow": "새로 쌓인 눈(신적설 > 0) — 기상청 첫눈 관측과 다릅니다.", "first-warm-night": "저녁 19시~다음 날 9시 정시 15개가 모두 25℃ 이상인 밤(그 저녁 날짜) — 공식 열대야 확정이 아닌 추정입니다.", "last-hot-day": "연말 전에는 '올해 마지막'이라 하지 않고 '가장 최근'으로만 말합니다.", "first-hot-day": "일최고기온 30℃ 이상 첫날." };
  function seasonHtml(d) {
    const ev = d.seasons || [];
    if (!ev.length) return "";
    if (!SEL.id || !ev.some((e) => e.id === SEL.id)) SEL.id = (ev.find((e) => e.home?.home) || ev.find((e) => e.current?.date && e.id !== "last-hot-day") || ev[0]).id;
    const e = ev.find((x) => x.id === SEL.id);
    const viz = window.RTViz && e.chart ? window.RTViz.season(e.chart) : "";
    return `<section class="card rhc-season" aria-label="계절 신호"><h2>계절 신호 <small class="rh-sub">끝난 시즌과 비교 · ${esc(d.basisName || "")} 기준</small></h2><div class="rhc-sevs" role="group" aria-label="계절 신호 고르기">${ev.map(seasonLine).join("")}</div>${viz}<p class="rt-note">${esc(NOTE[e.id] || "")} 시즌 ${esc(e.chart?.startMd?.replace("-", "/") || "")}부터. 평균은 처음~사건 사이 결측 1일 이내인 끝난 시즌 중 사건이 있었던 시즌만(${4}개 이상일 때), 사건 없던 시즌은 날짜로 넣지 않고 따로 셉니다.</p></section>`;
  }
  // ---------------------------------------------------------------- 30일 비 달력
  function rainHtml(d) {
    const days = d.rainCalendar?.days || [];
    if (!days.length) return "";
    const wet = days.filter((x) => x.state === "wet"), miss = days.filter((x) => x.state === "missing").length;
    const sum = Math.round(wet.reduce((a, x) => a + (x.mm || 0), 0) * 10) / 10;
    let run = 0; for (let i = days.length - 2; i >= 0 && days[i].state === "dry"; i--) run++;
    const last = [...days].reverse().find((x) => x.state === "wet");
    const viz = window.RTViz ? window.RTViz.calendar({ type: "calendar", days }) : "";
    return `<section class="card rhc-rain" aria-label="최근 30일 비 달력"><h2>최근 30일 비 달력 <small class="rh-sub">${esc(d.station?.name || "")} ASOS 공식 일자료</small></h2><p class="rhc-sum">비 온 날 <b>${wet.length}일</b>${wet.length ? ` · 합계 ${sum}mm` : ""}${last ? ` · 마지막 비 ${mdK(last.date)}(${last.mm}mm)` : ""}${run ? ` · 어제까지 ${run}일째 비 없음` : ""}${miss ? ` · <span class="rt-ins">자료 없는 날 ${miss}일(0으로 보지 않음)</span>` : ""}</p>${viz}<p class="rt-note">${esc(d.rainCalendar.note || "")}</p></section>`;
  }
  // ---------------------------------------------------------------- 내가 기억하는 이날
  const MEMO_KEY = "nw.memoDate";
  const memoDate = () => { const q = new URLSearchParams(location.hash.split("?")[1] || "").get("memo"); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q; try { const v = localStorage.getItem(MEMO_KEY); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; } catch {} return ""; };
  function memoChart(r, ymd) {
    const rows = (r.rows || []).filter((x) => x.status === "ok" && fin(x.max));
    if (rows.length < 2) return "";
    const W = 340, H = 120, L = 30, R = 10, T = 14, B = 22;
    const y0 = rows[0].year, y1 = rows.at(-1).year, vs = rows.flatMap((x) => [x.max, x.min].filter(fin));
    const lo = Math.floor(Math.min(...vs) - 1), hi = Math.ceil(Math.max(...vs) + 1);
    const x = (yy) => L + ((yy - y0) / Math.max(1, y1 - y0)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const me = +ymd.slice(0, 4);
    let s = `<svg class="vz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`매년 ${mdK(ymd)} 최고·최저기온(${rows.length}개 해), ${me}년 강조`)}">`;
    for (const v of [lo + 1, Math.round((lo + hi) / 2), hi - 1]) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e0e8f4"/><text x="${L - 4}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="#5e7090">${v}</text>`;
    for (const r0 of rows) {
      const hl = r0.year === me;
      if (fin(r0.min)) s += `<line x1="${x(r0.year)}" x2="${x(r0.year)}" y1="${y(r0.max)}" y2="${y(r0.min)}" stroke="${hl ? "#c0262d" : "#b9c6d8"}" stroke-width="${hl ? 3 : 1.6}"/>`;
      s += `<circle cx="${x(r0.year)}" cy="${y(r0.max)}" r="${hl ? 5 : 2.6}" fill="${hl ? "#c0262d" : r0.rainy ? "#2f6fd6" : "#0d1b3d"}"${r0.rainy && !hl ? "" : ""}><title>${r0.year} 최고 ${r0.max}℃ 최저 ${r0.min ?? "–"}℃${r0.rain != null ? ` 강수 ${r0.rain}mm` : ""}</title></circle>`;
    }
    const hr = rows.find((r0) => r0.year === me);
    if (hr) s += `<text x="${Math.min(W - 40, Math.max(40, x(me)))}" y="${Math.max(10, y(hr.max) - 8)}" font-size="11" font-weight="700" text-anchor="middle" fill="#c0262d">${me}</text>`;
    s += `<text x="${L}" y="${H - 5}" font-size="10" fill="#5e7090">${y0}</text><text x="${W - R}" y="${H - 5}" font-size="10" text-anchor="end" fill="#5e7090">${y1}</text></svg>`;
    return `<figure class="vz">${s}<figcaption class="vz-cap"><span class="vz-key"><i style="background:#0d1b3d;border-radius:50%"></i>최고(비 없음)</span><span class="vz-key"><i style="background:#2f6fd6;border-radius:50%"></i>최고(비 온 해)</span><span class="vz-key"><i class="k-mean2"></i>최저~최고</span><span class="vz-key"><i style="background:#c0262d;border-radius:50%"></i>고른 해</span></figcaption></figure>`;
  }
  function memoBody(r, ymd, st) {
    const row = (r.rows || []).find((x) => x.date === ymd);
    const S = r.summary || {};
    const one = !row ? `<p class="rt-ins">${ymd.slice(0, 4)}년은 이 지점 보유 자료 범위(${r.fromYear}~${r.toYear}년) 밖이에요.</p>` : row.status === "future" ? `<p class="rt-ins">아직 오지 않은 날이에요.</p>` : row.status !== "ok" ? `<p class="rt-ins">${ymdK(ymd)}: 자료 부족(관측 자료 없음)</p>` : `<p class="rhc-memo1"><b>${ymdK(ymd)}(${esc(row.weekday || "")})</b> 최고 <b>${row.max ?? "–"}℃</b> · 최저 <b>${row.min ?? "–"}℃</b> · ${row.rain == null ? `<span class="rt-ins">강수 자료 없음</span>` : row.rainy ? `강수 ${row.rain}mm` : "강수 없음(0.1mm 미만)"}</p>`;
    const share = `${location.origin}${location.pathname}#/today?${new URLSearchParams({ station: st, memo: ymd })}`;
    const stats = `#/stats/life?${new URLSearchParams({ view: "day", station: st, date: ymd.slice(5) })}`;
    return `${one}${memoChart(r, ymd)}<p class="rt-note">매년 ${mdK(ymd)}: 자료가 있는 ${S.validYears ?? 0}개 해 중 강수가 있었던 해 ${S.rainyYears ?? 0}개${S.share != null ? `(${S.share}%)` : ""}, 평균 최고 ${S.meanMax ?? "–"}℃ · 최저 ${S.meanMin ?? "–"}℃. 과거 관측이며 예보가 아닙니다.</p><p class="rhc-links"><button type="button" class="rhc-share" data-share="${esc(share)}">이날 링크 복사</button> <a href="${esc(stats)}">매년 같은 날 표 보기 ›</a></p>`;
  }
  function memoHtml(st) {
    const v = memoDate();
    return `<section class="card rhc-memo" aria-label="내가 기억하는 이날"><h2>내가 기억하는 이날 <small class="rh-sub">기념일·생일의 그날 날씨</small></h2><div class="rhc-pick"><label for="rhcDate">날짜</label><input type="date" id="rhcDate" min="1990-01-01" value="${esc(v)}"></div><div id="rhcMemoBody">${v ? `<p class="rt-load">불러오는 중…</p>` : `<p class="rt-note">기억하는 날짜를 고르면 그날과 매년 같은 날의 날씨를 보여 줘요(ASOS 공식 일자료).</p>`}</div></section>`;
  }
  async function memoLoad(st) {
    const el = $("rhcDate"), body = $("rhcMemoBody"); if (!el || !body) return;
    const v = el.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    try { localStorage.setItem(MEMO_KEY, v); } catch {}
    body.innerHTML = `<p class="rt-load">불러오는 중…</p>`;
    try { const r = await get(`/api/stats/life/day?station=${encodeURIComponent(st)}&date=${v.slice(5)}`); if ($("rhcDate")?.value === v) body.innerHTML = memoBody(r, v, st); } catch (e) { body.innerHTML = `<p class="rt-ins">불러오지 못했습니다 — ${esc(e.message)}</p>`; }
  }
  // ---------------------------------------------------------------- 채우기
  let last = null;
  function paint() {
    const d = last; if (!d) return;
    const st = d.station?.id || window.RT?.station?.() || "108";
    const se = $("rhSeason"), ra = $("rhRain"), me = $("rhMemo");
    if (se) { const h = seasonHtml(d); se.innerHTML = h; se.hidden = !h; }
    if (ra) { const h = rainHtml(d); ra.innerHTML = h; ra.hidden = !h; }
    if (me && me.dataset.st !== st) { me.dataset.st = st; me.innerHTML = memoHtml(st); if (memoDate()) memoLoad(st); }
  }
  document.addEventListener("rt:stories", (e) => { last = e.detail; paint(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("#rhSeason [data-sev]"); if (b) { SEL.id = b.dataset.sev; paint(); return; }
    const sh = e.target.closest?.(".rhc-share");
    if (sh) { const u = sh.dataset.share; const done = () => { sh.textContent = "복사했어요"; setTimeout(() => { sh.textContent = "이날 링크 복사"; }, 1600); }; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(u).then(done, () => window.prompt("이 링크를 복사하세요", u)); else window.prompt("이 링크를 복사하세요", u); }
  });
  document.addEventListener("change", (e) => { if (e.target?.id === "rhcDate") memoLoad(last?.station?.id || window.RT?.station?.() || "108"); });
  window.RTHomeCards = { seasonHtml, rainHtml, memoBody, memoChart };
})();
