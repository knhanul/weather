// 날씨 예보(4단계) 조립 — 순수 함수(입력은 DB 에서 읽은 행). 관측과 예보는 따로, 발표시각은 값마다 같이 둔다.
// 우선순위(같은 대상 시각·날짜):
//   시간별: 초단기예보(최신 발표, 6시간 앞) > 단기예보(최신 발표).
//   일별 최고·최저: 단기예보(그 날 TMX·TMN 이 들어 있는 가장 최근 발표) > 중기기온(가장 최근 발표). 단기가 있는 날은 중기를 쓰지 않는다
//     (단기가 더 촘촘하고 늦게 갱신됨). 둘 다 없으면 '예보 없음'.
//   이번 주: 지난 날 = ASOS 공식 일자료(관측), 오늘·앞날 = 예보. 관측이 있는 날은 예보를 쓰지 않는다.
// 강수확률(POP)은 더하지 않는다(하루 최댓값만). 예상 강수량(PCP)은 숫자인 시간만 더하고 '1mm 미만' 같은 범위 표기는 시간 수로 따로 센다.
import { rainText, PTY, SKY } from "./rt-api-shared.mjs";
import { ymdToDn, dnToYmd } from "./stats-engine.mjs";

export const addDays = (ymd, n) => dnToYmd(ymdToDn(ymd) + n);
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
const fin = (v) => (Number.isFinite(v) ? v : null);

// 예보 항목의 시간 의미(astra 2단계). 기온·습도·풍속 = 그 정시의 값(순간), 강수량·강수형태·강수확률·하늘 = 그 정시 앞 1시간 구간(이전 1시간)으로 둔다.
// 기상청 안내가 자료마다 달라(공공데이터 해설은 '그 시각부터 1시간'으로 읽히기도 함) 한곳(이 상수)에서만 정하고, 생활 판단(L01 출퇴근 비)은 이 구간으로 겹침을 계산한다.
export const ELEMENT_TIME = {
  convention: "preceding-hour",
  note: "기온·습도·풍속은 정시 값, 강수량·강수형태·강수확률·하늘상태는 그 정시 앞 1시간(예: 15시 = 14~15시)으로 해석",
  instant: ["ta", "hm", "ws"],
  interval: ["pcp", "pty", "pop", "sky"],
};
const wallAdd = (w, h) => { const t = new Date(Date.parse(`${w.replace(" ", "T")}Z`) + h * 3600000).toISOString(); return `${t.slice(0, 10)} ${t.slice(11, 19)}`; };
export function elementInterval(time, el) {
  if (!ELEMENT_TIME.interval.includes(el)) return { intervalStart: time, intervalEnd: time };
  return ELEMENT_TIME.convention === "preceding-hour" ? { intervalStart: wallAdd(time, -1), intervalEnd: time } : { intervalStart: time, intervalEnd: wallAdd(time, 1) };
}

// 시간별: rows = 단기예보 최신 발표 전부 + 초단기예보 최신 발표 전부(각 { fcst, category, value, base })
export function hourlyForecast({ vilRows = [], ultraRows = [], fromWall }) {
  const m = new Map();
  const slot = (w) => { if (!m.has(w)) m.set(w, { time: w, v: {}, u: {} }); return m.get(w); };
  for (const r of vilRows) if (r.fcst >= fromWall) { const s = slot(r.fcst); s.v[r.category] = r.value; s.vBase = r.base; }
  for (const r of ultraRows) if (r.fcst >= fromWall) { const s = slot(r.fcst); s.u[r.category] = r.value; s.uBase = r.release || r.base; }
  return [...m.values()].sort((a, b) => (a.time < b.time ? -1 : 1)).map((s) => {
    const useU = s.u.T1H != null;
    const ta = useU ? num(s.u.T1H) : num(s.v.TMP);
    const pick = (uk, vk) => (useU && s.u[uk] != null ? s.u[uk] : s.v[vk]);
    const pty = num(pick("PTY", "PTY")), sky = num(pick("SKY", "SKY"));
    const pcp = rainText(useU ? s.u.RN1 ?? s.v.PCP : s.v.PCP);
    // 항목별 출처·발표·대상 구간(같은 시각이라도 항목마다 출처가 다를 수 있음 — 예: 기온은 초단기, 강수확률은 단기)
    const U = { source: "초단기예보", base: s.uBase }, V = { source: "단기예보", base: s.vBase };
    const from = (uk, vk) => (useU && s.u[uk] != null ? U : s.v[vk] != null ? V : null);
    const iv = (src, el) => (src ? { ...src, ...elementInterval(s.time, el) } : null);
    const items = {
      ta: iv(useU ? U : s.v.TMP != null ? V : null, "ta"), pop: iv(s.v.POP != null ? V : null, "pop"),
      pcp: iv(useU && s.u.RN1 != null ? U : s.v.PCP != null ? V : null, "pcp"), pty: iv(from("PTY", "PTY"), "pty"), sky: iv(from("SKY", "SKY"), "sky"),
      hm: iv(from("REH", "REH"), "hm"), ws: iv(from("WSD", "WSD"), "ws"),
    };
    return {
      time: s.time, ta: fin(ta), pop: fin(num(s.v.POP)), // 강수확률은 단기예보에만 있음
      pcp: pcp ? pcp.text : null, pcpMm: pcp ? pcp.mm : null, pty: Number.isFinite(pty) ? PTY[pty] ?? String(pty) : null, sky: Number.isFinite(sky) ? SKY[sky] ?? String(sky) : null,
      hm: fin(num(pick("REH", "REH"))), ws: fin(num(pick("WSD", "WSD"))),
      source: useU ? "초단기예보" : "단기예보", base: useU ? s.uBase : s.vBase,
      items,
    };
  }).filter((h) => h.ta != null || h.pop != null);
}

// 날짜별 단기 요약(최신 발표 시간별에서): 최대 강수확률, 숫자 강수량 합, 범위 표기 시간 수, 낮(12~15시) 하늘·강수형태
export function shortDaySummary(hours) {
  const by = new Map();
  for (const h of hours) {
    const d = h.time.slice(0, 10);
    if (!by.has(d)) by.set(d, { date: d, popMax: null, rainMm: 0, rainRangeHours: 0, rainHours: 0, sky: null, pty: null, hours: 0 });
    const x = by.get(d);
    x.hours++;
    if (h.pop != null) x.popMax = Math.max(x.popMax ?? 0, h.pop);
    if (h.pcpMm != null && h.pcpMm > 0) { x.rainMm += h.pcpMm; x.rainHours++; } else if (h.pcpMm == null && h.pcp) { x.rainRangeHours++; x.rainHours++; }
    const hh = +h.time.slice(11, 13);
    if (hh >= 12 && hh <= 15 && !x.sky) { x.sky = h.sky; x.pty = h.pty; }
  }
  for (const x of by.values()) x.rainMm = Math.round(x.rainMm * 10) / 10;
  return by;
}

// 최고·최저 예보 이력 → 날짜별 최신값 + 발표별 변화
export function extremesByDate(rows) {
  const out = new Map();
  for (const r of rows) {
    const d = r.fcst.slice(0, 10);
    if (!out.has(d)) out.set(d, { TMX: [], TMN: [] });
    const v = num(r.value);
    if (Number.isFinite(v)) out.get(d)[r.category].push({ base: r.base, value: v });
  }
  for (const x of out.values()) for (const k of ["TMX", "TMN"]) x[k].sort((a, b) => (a.base < b.base ? -1 : 1));
  return out;
}

// 중기: 가장 최근 발표의 날짜별 값. items = 한 구역의 최근 발표 행들(여러 tm_fc)
export function midByDate(taItems, landItems) {
  const latest = (items) => items.reduce((m, x) => (x.tmFc > m ? x.tmFc : m), "");
  const out = new Map();
  const get = (d) => { if (!out.has(d)) out.set(d, { date: d }); return out.get(d); };
  const lt = latest(taItems), ll = latest(landItems);
  for (const x of taItems) {
    if (x.tmFc !== lt || x.day == null) continue;
    const d = addDays(x.tmFc.slice(0, 10), x.day);
    const o = get(d);
    if (x.metric === "taMax") o.max = num(x.value);
    if (x.metric === "taMin") o.min = num(x.value);
    if (x.metric === "taMaxLow") o.maxLow = num(x.value);
    if (x.metric === "taMaxHigh") o.maxHigh = num(x.value);
    o.taBase = lt;
  }
  for (const x of landItems) {
    if (x.tmFc !== ll || x.day == null) continue;
    const o = get(addDays(x.tmFc.slice(0, 10), x.day));
    if (x.metric === "wf") o[`wf${x.ampm}`] = x.value;
    if (x.metric === "rnSt") o[`pop${x.ampm}`] = num(x.value);
    o.landBase = ll;
  }
  // 중기 기온 발표별 변화(taMax·taMin)
  const hist = new Map();
  for (const x of taItems) {
    if (x.day == null || (x.metric !== "taMax" && x.metric !== "taMin")) continue;
    const d = addDays(x.tmFc.slice(0, 10), x.day);
    if (!hist.has(d)) hist.set(d, { TMX: [], TMN: [] });
    hist.get(d)[x.metric === "taMax" ? "TMX" : "TMN"].push({ base: x.tmFc, value: num(x.value), source: "중기" });
  }
  return { byDate: out, hist };
}

// 날짜별 이어 붙이기: today ~ today+10
export function stitchDays({ today, extremes, shortDays, mid, obsDaily = new Map(), days = 11 }) {
  const list = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const e = extremes.get(d);
    const sd = shortDays.get(d);
    const md = mid.byDate.get(d);
    const lastOf = (a) => (a && a.length ? a[a.length - 1] : null);
    const tmx = lastOf(e?.TMX), tmn = lastOf(e?.TMN);
    const row = { date: d, offset: i, max: null, min: null, maxSource: null, minSource: null, maxBase: null, minBase: null, pop: null, popNote: null, rain: null, sky: null, wf: null };
    if (tmx) Object.assign(row, { max: tmx.value, maxSource: "단기예보", maxBase: tmx.base });
    else if (md && Number.isFinite(md.max)) Object.assign(row, { max: md.max, maxSource: "중기예보", maxBase: md.taBase, maxRange: Number.isFinite(md.maxLow) ? [md.maxLow, md.maxHigh] : null });
    if (tmn) Object.assign(row, { min: tmn.value, minSource: "단기예보", minBase: tmn.base });
    else if (md && Number.isFinite(md.min)) Object.assign(row, { min: md.min, minSource: "중기예보", minBase: md.taBase });
    if (sd && sd.hours >= 6) {
      Object.assign(row, { pop: sd.popMax, popNote: "단기예보 하루 중 최대 강수확률", sky: sd.pty && sd.pty !== "없음" ? sd.pty : sd.sky, rain: { mm: sd.rainMm, rangeHours: sd.rainRangeHours, rainHours: sd.rainHours }, wxSource: "단기예보" });
    } else if (md && (md.wfAm || md.wf)) {
      Object.assign(row, { pop: Math.max(md.popAm ?? -1, md.popPm ?? -1, md.pop ?? -1) >= 0 ? Math.max(md.popAm ?? -1, md.popPm ?? -1, md.pop ?? -1) : null, popNote: "중기예보 오전·오후 중 큰 강수확률", wf: md.wfAm ? `${md.wfAm} / ${md.wfPm}` : md.wf, wxSource: "중기예보", wxBase: md.landBase });
    }
    if (row.max == null && row.min == null && row.pop == null && !row.wf) row.none = true;
    list.push(row);
  }
  return list;
}

// 예보 변화: 날짜별 단기(TMX/TMN 발표별) + 중기 발표별, 시간순
export function forecastChanges(extremes, mid, dates) {
  return dates.map((d) => {
    const e = extremes.get(d) || { TMX: [], TMN: [] };
    const h = mid.hist.get(d) || { TMX: [], TMN: [] };
    const merge = (a, b) => [...b.map((x) => ({ ...x, source: "중기예보" })), ...a.map((x) => ({ ...x, source: "단기예보" }))].sort((p, q) => (p.base < q.base ? -1 : p.base > q.base ? 1 : 0));
    return { date: d, max: merge(e.TMX, h.TMX), min: merge(e.TMN, h.TMN) };
  });
}
