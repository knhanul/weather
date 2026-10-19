// astra 6단계: 기기 설정(로그인 없이 localStorage) · 산책·러닝 시간 찾기(9-3) · 겨울 바람 체감 추정(9-2, NWS 공식). 순수 함수 + 저장만(화면은 rt-home.js·my-settings.js).
// 숫자는 모두 /api/rt/forecast·today 응답 값 그대로 판정한다(점수·지어낸 값 없음). 필수 값이 없으면 '판단 보류'(통과로 세지 않음).
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const r1 = (v) => Math.round(v * 10 + (v >= 0 ? 1e-9 : -1e-9)) / 10;
  const hh = (t) => Number(String(t).slice(11, 13));
  const ls = () => { try { return W.localStorage || null; } catch { return null; } };
  const readJ = (k) => { try { return JSON.parse(ls()?.getItem(k) || "null"); } catch { return null; } };
  const writeJ = (k, v) => { try { if (v == null) ls()?.removeItem(k); else ls()?.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  // ---------------------------------------------------------------- 겨울 바람 체감(NWS Wind Chill, 2001) — 참고용, 기상청 공식 체감온도 아님
  // TF = TC×9/5+32, V = m/s × 2.2369362921(mph), WCF = 35.74 + 0.6215TF − 35.75V^0.16 + 0.4275TF·V^0.16. 적용 범위: TF ≤ 50°F(10℃), V > 3mph(약 1.34m/s)
  const MPS_TO_MPH = 2.2369362921;
  function windChill(ta, ws) {
    if (!fin(ta) || !fin(ws)) return { value: null, status: "missing", text: "기온·풍속 자료가 모두 있어야 계산" };
    const tf = (ta * 9) / 5 + 32;
    const v = ws * MPS_TO_MPH;
    if (tf > 50 || v <= 3) return { value: null, status: "range", text: "계산 적용 범위 밖(기온 10℃ 이하이면서 풍속 1.3m/s 초과일 때만)" };
    const p = Math.pow(v, 0.16);
    const wcf = 35.74 + 0.6215 * tf - 35.75 * p + 0.4275 * tf * p;
    const c = ((wcf - 32) * 5) / 9;
    return { value: r1(c), raw: c, status: "ok", text: "바람을 고려한 추정 체감 — NWS 공식, 참고용" };
  }

  // ---------------------------------------------------------------- 산책·러닝 조건(기기 설정)
  const COND_KEY = "nw.activity";
  const COND_DEFAULT = { tMin: 10, tMax: 25, wind: 5, popMax: 30, minRun: 2, prefFrom: 6, prefTo: 21, hours: 24 };
  function loadCond() {
    const v = readJ(COND_KEY);
    const o = { ...COND_DEFAULT };
    if (v && typeof v === "object") {
      const n = (k, lo, hi) => { if (Number.isFinite(+v[k]) && +v[k] >= lo && +v[k] <= hi) o[k] = +v[k]; };
      n("tMin", -20, 35); n("tMax", -10, 40); n("wind", 1, 15); n("popMax", 0, 100); n("minRun", 1, 6); n("prefFrom", 0, 23); n("prefTo", 0, 23); n("hours", 12, 24);
      if (o.tMin >= o.tMax) { o.tMin = COND_DEFAULT.tMin; o.tMax = COND_DEFAULT.tMax; }
    }
    return o;
  }
  const saveCond = (c) => writeJ(COND_KEY, c);
  const isDefaultCond = (c) => Object.keys(COND_DEFAULT).every((k) => c[k] === COND_DEFAULT[k]);
  const condText = (c) => `기온 ${c.tMin}~${c.tMax}℃ · 풍속 ${c.wind}m/s 이하 · 강수형태 없음 · 강수확률 ${c.popMax}% 미만 · 강수량 0 · ${c.minRun}시간 이상 연속`;

  // ---------------------------------------------------------------- 관심사(기기 설정) — 오늘 날씨의 선택 카드 보이기
  const INT_KEY = "nw.interests";
  const INTERESTS = [["walk", "산책·러닝 시간 찾기", "오늘 날씨에 앞으로 24시간 예보로 조건 맞는 시간 카드"], ["chill", "겨울 바람 체감(참고용)", "기온 10℃ 이하·바람 있을 때 지금 날씨 옆에 NWS 공식 추정값"], ["outfit", "하루 구간 옷차림", "12시간 칸 아래 출근·낮·퇴근·밤 구간 카드"], ["share", "이야기 카드 이미지 버튼", "오늘의 이야기마다 이미지 저장·공유 버튼"]];
  const INT_DEFAULT = { walk: true, chill: true, outfit: true, share: true };
  function loadInterests() { const v = readJ(INT_KEY); const o = { ...INT_DEFAULT }; if (v && typeof v === "object") for (const [k] of INTERESTS) if (typeof v[k] === "boolean") o[k] = v[k]; return o; }
  const saveInterests = (o) => writeJ(INT_KEY, o);

  // ---------------------------------------------------------------- 시간 하나 판정: 항목별 pass / fail / unknown(자료 없음)
  // 예보 h: { time, ta, ws, pty, pop, pcp, pcpMm } — 강수량은 숫자 0 또는 '강수없음'만 무강수(‘1mm 미만’은 무강수가 아님)
  const NO_RAIN_TXT = /^강수\s*없음$/;
  function hourCheck(h, c) {
    const checks = [];
    const add = (id, label, st, txt) => checks.push({ id, label, status: st, text: txt });
    if (!fin(h.ta)) add("ta", "기온", "unknown", "기온 자료 없음");
    else add("ta", "기온", h.ta >= c.tMin && h.ta <= c.tMax ? "pass" : "fail", `기온 ${h.ta}℃${h.ta < c.tMin ? `(${c.tMin}℃ 미만)` : h.ta > c.tMax ? `(${c.tMax}℃ 초과)` : ""}`);
    if (!fin(h.ws)) add("ws", "바람", "unknown", "풍속 자료 없음");
    else add("ws", "바람", h.ws <= c.wind ? "pass" : "fail", `풍속 ${h.ws}m/s${h.ws > c.wind ? `(${c.wind}m/s 초과)` : ""}`);
    if (h.pty == null || h.pty === "") add("pty", "강수형태", "unknown", "강수형태 자료 없음");
    else add("pty", "강수형태", h.pty === "없음" ? "pass" : "fail", h.pty === "없음" ? "강수형태 없음" : `${h.pty} 예보`);
    if (!fin(h.pop)) add("pop", "강수확률", "unknown", "강수확률 자료 없음");
    else add("pop", "강수확률", h.pop < c.popMax ? "pass" : "fail", `강수확률 ${h.pop}%${h.pop >= c.popMax ? `(${c.popMax}% 이상)` : ""}`);
    const mm = fin(h.pcpMm) ? h.pcpMm : null;
    if (mm === 0 || (h.pcp != null && NO_RAIN_TXT.test(String(h.pcp).trim()))) add("pcp", "강수량", "pass", "강수량 0(강수없음)");
    else if (mm != null && mm > 0) add("pcp", "강수량", "fail", `강수량 ${h.pcp || `${mm}mm`}`);
    else if (h.pcp != null && h.pcp !== "") add("pcp", "강수량", "fail", `강수량 ${h.pcp}`); // '1mm 미만' 등은 무강수가 아님
    else add("pcp", "강수량", "unknown", "강수량 자료 없음");
    const status = checks.some((x) => x.status === "fail") ? "fail" : checks.some((x) => x.status === "unknown") ? "unknown" : "pass";
    return { time: h.time, hour: hh(h.time), status, checks, ta: h.ta, ws: h.ws, pop: h.pop, pty: h.pty };
  }
  // 앞으로 c.hours 시간(첫 예보 시각부터) 판정 → 연속 pass 구간(minRun 시간 이상). 선호 시간대와 겹치는 구간을 먼저.
  function findWindows(fc, c = loadCond(), { nowW = null } = {}) {
    const list = (fc || []).filter((h) => h && h.time && (!nowW || h.time >= `${nowW.slice(0, 13)}:00:00`)).slice(0, c.hours);
    const hours = list.map((h) => hourCheck(h, c));
    const T = (t) => Date.parse(`${t.replace(" ", "T")}Z`);
    const runs = [];
    let cur = null;
    for (const x of hours) {
      if (x.status === "pass" && cur && T(x.time) - T(cur.hours.at(-1).time) === 36e5) cur.hours.push(x);
      else if (x.status === "pass") { cur = { hours: [x] }; runs.push(cur); }
      else cur = null;
    }
    const inPref = (h) => (c.prefFrom <= c.prefTo ? h >= c.prefFrom && h <= c.prefTo : h >= c.prefFrom || h <= c.prefTo);
    const wins = runs.filter((r) => r.hours.length >= c.minRun).map((r) => {
      const hs = r.hours;
      const tas = hs.map((x) => x.ta), wss = hs.map((x) => x.ws), pops = hs.map((x) => x.pop);
      const pref = hs.filter((x) => inPref(x.hour)).length;
      return { start: hs[0].time, end: hs.at(-1).time, hours: hs.length, taMin: Math.min(...tas), taMax: Math.max(...tas), wsMax: Math.max(...wss), popMax: Math.max(...pops), prefHours: pref, reasons: [`${hs.length}시간 연속 조건 충족(${hh(hs[0].time)}시~${hh(hs.at(-1).time)}시 정시 예보)`, `기온 ${Math.min(...tas) === Math.max(...tas) ? Math.min(...tas) : `${Math.min(...tas)}~${Math.max(...tas)}`}℃ · 풍속 최대 ${Math.max(...wss)}m/s · 강수확률 최대 ${Math.max(...pops)}% · 강수형태 없음`] };
    });
    // 정렬: 선호 시간대와 겹치는 시간이 많은 순 → 이른 순(근거 없는 점수 없음)
    wins.sort((a, b) => (b.prefHours > 0) - (a.prefHours > 0) || (a.start < b.start ? -1 : 1));
    const counts = { pass: hours.filter((x) => x.status === "pass").length, fail: hours.filter((x) => x.status === "fail").length, unknown: hours.filter((x) => x.status === "unknown").length };
    // 가장 흔한 실패 이유(구간이 없을 때 설명)
    const why = {};
    for (const x of hours) for (const k of x.checks) if (k.status === "fail") why[k.label] = (why[k.label] || 0) + 1;
    return { cond: c, hours, windows: wins, counts, failWhy: Object.entries(why).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, hours: n })), from: hours[0]?.time || null, to: hours.at(-1)?.time || null };
  }

  // ---------------------------------------------------------------- 화면 조각(오늘 날씨 카드) — esc 는 여기서
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dayW = (t, today) => { const d = String(t).slice(0, 10); return d === today ? "오늘" : d > today ? "내일" : "어제"; };
  const ST_TXT = { pass: "조건 충족", fail: "조건 밖", unknown: "판단 보류(자료 없음)" };
  function hourDetail(x, today) {
    return `${dayW(x.time, today)} ${x.hour}시 — ${ST_TXT[x.status]}: ${x.checks.map((k) => `${k.status === "fail" ? "✕ " : k.status === "unknown" ? "? " : ""}${k.text}`).join(" · ")}`;
  }
  function walkHtml(res, { today, settingsHref = "#/my" } = {}) {
    const c = res.cond;
    if (!res.hours.length) return `<h2>산책·러닝 시간 찾기 <span class="rt-badge fc">예보</span></h2><p class="rt-ins">예보 자료가 없어 판단할 수 없습니다</p>`;
    const w0 = res.windows[0];
    const lab = (w) => `${dayW(w.start, today)} ${Number(w.start.slice(11, 13))}시~${dayW(w.end, today) !== dayW(w.start, today) ? `${dayW(w.end, today)} ` : ""}${Number(w.end.slice(11, 13)) + 1}시`;
    const best = w0
      ? `<p class="aw-best"><b>${esc(lab(w0))}</b> <small>${w0.hours}시간${w0.prefHours ? ` · 선호 ${c.prefFrom}~${c.prefTo}시와 ${w0.prefHours}시간 겹침` : ` · 선호 ${c.prefFrom}~${c.prefTo}시 밖`}</small></p><ul class="aw-why">${w0.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
      : `<p class="aw-best none"><b>앞으로 ${res.hours.length}시간 안에 조건 맞는 ${c.minRun}시간 연속 구간이 없어요</b></p>${res.failWhy.length ? `<ul class="aw-why">${res.failWhy.slice(0, 3).map((f) => `<li>${esc(f.label)} 조건 밖 ${f.hours}시간</li>`).join("")}${res.counts.unknown ? `<li>자료 없어 판단 보류 ${res.counts.unknown}시간</li>` : ""}</ul>` : ""}`;
    const more = res.windows.slice(1, 4);
    const strip = res.hours.map((x, i) => `<button type="button" class="aw-h ${x.status}" data-awh="${i}" aria-label="${esc(hourDetail(x, today))}" title="${esc(hourDetail(x, today))}"><span>${x.hour}</span><i aria-hidden="true">${x.status === "pass" ? "○" : x.status === "fail" ? "✕" : "?"}</i></button>`).join("");
    return `<h2>산책·러닝 시간 찾기 <span class="rt-badge fc">예보</span></h2>
      ${best}
      ${more.length ? `<p class="aw-more">다른 구간: ${more.map((w) => `${esc(lab(w))}(${w.hours}시간, ${w.taMin === w.taMax ? w.taMin : `${w.taMin}~${w.taMax}`}℃)`).join(" · ")}</p>` : ""}
      <div class="aw-strip" role="group" aria-label="시간별 판정(누르면 이유)">${strip}</div>
      <p class="aw-tip" aria-live="polite">칸을 누르면 그 시각 판정 이유가 나와요 · ○ 충족 ${res.counts.pass} · ✕ 조건 밖 ${res.counts.fail} · ? 판단 보류 ${res.counts.unknown}</p>
      <p class="rt-note">조건: ${esc(condText(c))}${isDefaultCond(c) ? " (기본값)" : " (내 설정)"} · <a href="${esc(settingsHref)}">조건 바꾸기 ›</a>${window.InfoTip.btn("기상청 단기예보 정시 값으로 규칙대로만 판정해요(점수 없음). 강수량 '1mm 미만'은 무강수로 보지 않고, 강수확률·강수형태 등 자료가 없는 시각은 '판단 보류'로 빼요. 대기질·자외선·노면은 보지 않습니다.", { label: "판정 방법" })}</p>`;
  }
  function chillHtml(ta, ws) {
    const r = windChill(ta, ws);
    if (r.status !== "ok") return "";
    return `<small class="rh-chill" title="미국 기상청(NWS) 풍속냉각 공식(2001)으로 기온 ${ta}℃·풍속 ${ws}m/s를 넣어 계산한 추정값입니다. 기상청 공식 체감온도가 아니며 사람·옷·햇볕에 따라 다릅니다."><span class="rh-chill-n">${esc(r.text)}</span><br>바람 고려 추정 체감 <b>${r.value}℃</b> <span class="rt-badge fc">참고용</span></small>`;
  }

  W.RTAct = { walkHtml, hourDetail, chillHtml, windChill, MPS_TO_MPH, COND_KEY, COND_DEFAULT, loadCond, saveCond, isDefaultCond, condText, INT_KEY, INTERESTS, INT_DEFAULT, loadInterests, saveInterests, hourCheck, findWindows, readJ, writeJ };
})();
