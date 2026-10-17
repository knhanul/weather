// 새 이야기 규칙 되돌려 보기(읽기 전용): 지난 N일 × 지점마다, 그날 08시·13시·18시 세 번 규칙을 돌려 규칙별로 '그날 한 번이라도 나왔는지' 센다.
// 실행(서버와 같은 DB 환경): node scripts/rt-story-backtest.mjs [days=30] [stations=all]
// 입력 대체(실황 기록이 없는 과거): 지금 값 = 그 시각 ASOS 정시 관측(기온·습도·풍속·1시간 강수, 강수형태 없음),
//   앞 시간 = 그날 저장된 단기예보 발표(08시 → 05시, 13시 → 11시, 18시 → 17시 발표)가 있으면 그 값, 없으면 ASOS 관측(완전 예보 가정, 하늘상태 없음).
//   끝난 일자료 = 전날까지. 기준 분포는 그 해 이전의 끝난 해만(실서비스와 같음). DB 에 쓰지 않는다.
import { initDb, statsDailyRows, statsHourlyStream, statsHourlyRows, listStationsPg, rtStore } from "../db.mjs";
import { buildDailyStore, hval, ymdToDn, dnToYmd } from "../stats-engine.mjs";
import { createStatsHourly } from "../stats-hourly.mjs";
import { hourlyForecast } from "../rt-forecast.mjs";
import { runCatalog, CATALOG } from "../rt-story-catalog.mjs";
import { selectV2 } from "../rt-story-select.mjs";
import { hourlyCompare } from "../rt-baseline.mjs";
import { seasonEvent, forecastCrossing, seasonCands, SEASON_IDS } from "../rt-season.mjs";
import { regionFacts, regionCands } from "../rt-region.mjs";
import { revisionFlow, popRevisions, revisionCands } from "../rt-revision.mjs";
import { bigChanges } from "../rt-changes.mjs";
import { LIFE_VALUE, SEASON_EVENTS, REGION_RULES } from "../rt-story-rules.mjs";

// 4단계 규칙(계절·지역·발표 흐름·가장 큰 변화) 되돌려 보기 — 실서비스와 같은 모듈 함수
const tv0 = () => 0.8;
export function stage4Season({ sid, D, hs, store, days }) {
  const until = dnToYmd(ymdToDn(D) - 1), night = dnToYmd(ymdToDn(D) - 2), m = +D.slice(5, 7);
  const ev = SEASON_IDS.map((id) => { const e = seasonEvent(id, { store, hs, refYmd: D, untilYmd: SEASON_EVENTS[id].hourly ? night : until, retro: id === "last-hot-day" && SEASON_EVENTS[id].retroMonths.includes(m) }); e.forecast = forecastCrossing(id, e, days.filter((d) => d.date >= D)); return e; });
  return seasonCands(ev, { sid, basis: "all", bi: 0, today: D, tv: tv0, LIFE_VALUE, basisName: "1990년 이후" });
}
export function stage4Region({ D, H, all }) {
  const time = `${D} ${pad(H)}:00`;
  const rows = all.map(({ sid, name, hs }) => {
    const t = at(hs, "ta", D, H);
    if (!Number.isFinite(t)) return { id: sid, name, temp: null };
    const cmp = hourlyCompare(hs, D, H, "ta", t);
    return { id: sid, name, time, temp: Math.round(t * 10) / 10, diffs: Object.fromEntries(cmp.map((p) => [p.id, p.diff])), pcts: Object.fromEntries(cmp.map((p) => [p.id, p.percentile ?? null])), samples: Object.fromEntries(cmp.map((p) => [p.id, p.samples])) };
  });
  const F = regionFacts({ rows, time, basis: "all", hsOf: (id) => all.find((x) => x.sid === id)?.hs || null });
  return { F, cands: regionCands(F, { sid: all[0]?.sid, tv: tv0, LIFE_VALUE, basisId: "all" }) };
}

const pad = (n) => String(n).padStart(2, "0");
const at = (hs, f, D, h) => { const i = (ymdToDn(D) - hs.base) * 24 + h; return i >= 0 && i < hs.n && hs.src[i] ? hval(hs[f], i) : NaN; };
const fin = (v) => (Number.isFinite(v) ? v : null);
export function backtestCtx({ sid, nm, D, H, hs, store, vilRows = [] }) {
  const time = `${D} ${pad(H)}:00:00`;
  const v = (f) => fin(at(hs, f, D, H));
  const current = Number.isFinite(at(hs, "ta", D, H)) ? { time, hour: H, ta: v("ta"), hm: v("hm"), ws: v("ws"), rn1: v("rn"), pty: null, fresh: true } : null;
  const series = [];
  for (let h = 0; h <= H; h++) { const ta = at(hs, "ta", D, h); if (Number.isFinite(ta)) series.push({ time: `${D} ${pad(h)}:00:00`, ta, kind: "obs", source: "ASOS(대체)" }); }
  let fcKind = "none", days = [];
  const D1 = dnToYmd(ymdToDn(D) + 1);
  if (vilRows.length) {
    fcKind = "stored";
    for (const x of hourlyForecast({ vilRows, ultraRows: [], fromWall: wallNext(time) })) series.push({ ...x, kind: "fcst" });
    const ext = {};
    for (const r of vilRows) if (r.category === "TMX" || r.category === "TMN") { const d = r.fcst.slice(0, 10); (ext[d] ||= {})[r.category] = Number(r.value); }
    days = [D, D1].map((d) => ({ date: d, max: fin(ext[d]?.TMX), min: fin(ext[d]?.TMN), maxSource: "단기예보", maxBase: vilRows[0].base, minSource: "단기예보", minBase: vilRows[0].base }));
  } else {
    fcKind = "asos-proxy";
    for (let k = 1; k <= 30; k++) {
      const dn = ymdToDn(D) + Math.floor((H + k) / 24), hh = (H + k) % 24, d = dnToYmd(dn);
      const ta = at(hs, "ta", d, hh);
      if (!Number.isFinite(ta)) continue;
      const rn = at(hs, "rn", d, hh);
      series.push({ time: `${d} ${pad(hh)}:00:00`, ta, hm: fin(at(hs, "hm", d, hh)), ws: fin(at(hs, "ws", d, hh)), pty: Number.isFinite(rn) ? (rn >= 0.1 ? "비" : "없음") : null, sky: null, pop: null, kind: "fcst", source: "ASOS(대체)" });
    }
    const di = (d, f) => { const i = ymdToDn(d) - store.base; return i >= 0 && i < store.n && store.present[i] ? fin(store[f][i]) : null; };
    days = [D, D1].map((d) => ({ date: d, max: di(d, "max"), min: di(d, "min"), maxSource: "ASOS(대체)", minSource: "ASOS(대체)" }));
  }
  series.sort((a, b) => (a.time < b.time ? -1 : 1));
  return { ctx: { sid, nm, nowW: time.slice(0, 16), ymd: D, hour: H, hs, store, lastDay: dnToYmd(ymdToDn(D) - 1), current, series, days, fcFresh: true }, fcKind };
}
function wallNext(w) { const t = new Date(Date.parse(`${w.slice(0, 13).replace(" ", "T")}:00:00Z`) + 3600000).toISOString(); return `${t.slice(0, 10)} ${t.slice(11, 13)}:00:00`; }

async function main() {
  const days = Number(process.argv[2] || 30);
  if (!(await initDb())) throw new Error("DB 없음");
  const rt = rtStore();
  let list = (await listStationsPg()).filter((s) => s.enabled !== false && s.enabled !== 0);
  if (process.argv[3]) list = list.filter((s) => process.argv[3].split(",").includes(String(s.station_id)));
  const hsMaker = createStatsHourly({ loadStream: (id, from, onRows) => statsHourlyStream(id, from, onRows), loadRange: (id, f, t) => statsHourlyRows(id, f, t) });
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const ids = Object.keys(CATALOG);
  const tot = Object.fromEntries(ids.map((id) => [id, 0]));
  const sel = Object.fromEntries(ids.map((id) => [id, 0]));
  const per = [];
  let stDays = 0, storedFc = 0;
  const charts = {};
  // 4단계: 지점 저장소를 미리(지역 이야기는 같은 시각 모든 지점이 필요)
  const ALL = [];
  for (const s of list) { const sid = String(s.station_id); ALL.push({ sid, name: s.station_name, store: buildDailyStore(sid, await statsDailyRows(sid)), hs: await hsMaker.get(sid), g: rt ? await rt.gridOf(sid) : null }); }
  const S4 = { season: {}, region: {}, F01: 0, F01pop: 0, big: {}, bigDays: 0, revDays: 0, regionSnaps: 0, regionDays: 0 };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const regionDaySet = {};
  const G01U = [];
  for (let k = days; k >= 1; k--) {
    const D = dnToYmd(ymdToDn(today) - k);
    const fired = new Set();
    for (const H of [8, 13, 18]) { const r = stage4Region({ D, H, all: ALL }); if (r.F.N) S4.regionSnaps++; for (const c of r.cands) if (!c.exclude) { fired.add(c.ruleId); if (process.env.DUMP?.split(",").includes(c.ruleId)) console.error(`  ${D} ${H}시 ${c.ruleId} U=${c.U.toFixed(2)} ${c.title}`); if (process.env.CHARTS && c.chart && !charts[c.ruleId]) charts[c.ruleId] = { station: "8개 지점", at: `${D} ${pad(H)}:00`, title: c.title, text: c.text, kind: c.kind, chart: c.chart }; } }
    for (const id of fired) bump(S4.region, id);
    S4.regionDays++;
    // 5단계: G01 문턱 점검 — 그날 세 시각 중 G01(문턱 0 으로 다시 계산, 다른 제외 사유는 그대로) U 최대
    let mu = null;
    for (const H of [8, 13, 18]) { const r = stage4Region({ D, H, all: ALL }); const g = regionCands(r.F, { sid: ALL[0]?.sid, tv: tv0, LIFE_VALUE, basisId: "all", R: { ...REGION_RULES, topMinU: 0 } }).find((c) => c.ruleId === "G01" && !c.exclude); if (g && (mu == null || g.U > mu)) mu = g.U; }
    G01U.push([D, mu == null ? null : Math.round(mu * 1000) / 1000]);
  }
  for (const s of list) {
    const sid = String(s.station_id);
    const { store, hs, g } = ALL.find((x) => x.sid === sid);
    const extAll = g?.nx != null ? await rt.extremesAll(g.nx, g.ny, dnToYmd(ymdToDn(today) - days), dnToYmd(ymdToDn(today) + 3)).catch(() => []) : [];
    const row = { sid, name: s.station_name, fired: Object.fromEntries(ids.map((id) => [id, 0])), selected: 0, days: 0 };
    for (let k = days; k >= 1; k--) {
      const D = dnToYmd(ymdToDn(today) - k);
      const firedToday = new Set(), selToday = new Set();
      let any = false;
      for (const [H, base] of [[8, "05"], [13, "11"], [18, "17"]]) {
        const vilRows = g?.nx != null ? await rt.fcst("KMA_VILAGE_FCST", g.nx, g.ny, `${D} ${base}:00:00`).catch(() => []) : [];
        const { ctx, fcKind } = backtestCtx({ sid, nm: s.station_name, D, H, hs, store, vilRows });
        if (H === 13) {
          // 계절 신호(그날 13시 기준, 끝난 일자료 = 전날)
          for (const c of stage4Season({ sid, D, hs, store, days: ctx.days })) if (!c.exclude) { firedToday.add(`S:${c.ruleId}${c.kind === "예보" ? "(가능성)" : ""}`); if (process.env.CHARTS && !charts[`season:${c.ruleId}`]) charts[`season:${c.ruleId}`] = { station: s.station_name, at: ctx.nowW, title: c.title, text: c.text, kind: c.kind, chart: c.chart }; if (process.env.DUMP?.split(",").includes("season")) console.error(`  ${D} ${sid} ${c.ruleId} ${c.title}`); }
          // 발표 흐름: 그 시각까지 받은 단기 TMX·TMN 발표만
          const wall = `${D} 13:00:00`;
          const dates = [0, 1, 2].map((j) => dnToYmd(ymdToDn(D) + j));
          const changes = dates.map((d) => { const L = extAll.filter((r) => r.base <= wall && r.fcst.slice(0, 10) === d); const pick = (cat) => L.filter((r) => r.category === cat).map((r) => ({ base: r.base, value: Number(r.value), source: "단기예보" })); return { date: d, max: pick("TMX"), min: pick("TMN") }; }).filter((c) => c.max.length + c.min.length > 1);
          const flow = revisionFlow(changes, { today: D });
          const prev = g?.nx != null && vilRows.length ? await rt.fcst("KMA_VILAGE_FCST", g.nx, g.ny, `${D} 08:00:00`).catch(() => []) : [];
          const pop = prev.length && prev[0].base !== vilRows[0]?.base ? popRevisions(vilRows, prev, { fromWall: wall }) : null;
          if (flow.length || pop) S4.revDays++;
          for (const c of revisionCands(flow, pop, { sid, tv: tv0, ymd: D, LIFE_VALUE })) { firedToday.add(c.key === "forecast-revision-pop" ? "F01(강수확률)" : `F01(${c.facts.kind})`); if (process.env.CHARTS && !charts[c.key]) charts[c.key] = { station: s.station_name, at: ctx.nowW, title: c.title, text: c.text, kind: c.kind, chart: c.chart }; if (process.env.DUMP?.split(",").includes("F01")) console.error(`  ${D} ${sid} F01 ${c.title}`); }
          // 가장 큰 변화(앞 시간 = 저장된 단기예보 또는 ASOS 대체)
          const B = bigChanges({ hours: ctx.series.filter((x) => x.kind === "fcst"), days: ctx.days, revisions: flow, pop, today: D, nowW: ctx.nowW });
          S4.bigDays++;
          for (const x of B.items) firedToday.add(`B:${x.kind}${fcKind === "stored" ? "" : "*"}`);
          if (process.env.DUMP?.split(",").includes("big")) for (const x of B.items) console.error(`  ${D} ${sid} [${fcKind}] big ${x.kind} M=${x.M} ${x.title}`);
        }
        if (fcKind === "stored") storedFc++;
        if (!ctx.current) continue;
        any = true;
        const r = runCatalog(ctx);
        if (process.env.DUMP) for (const c of r.cands) if (process.env.DUMP.split(",").includes(c.ruleId)) console.error(`  ${D} ${H}시 [${fcKind}] ${c.ruleId} U=${c.U == null ? "-" : c.U.toFixed(2)} ${c.title} | ${c.text}`);
        // CHARTS=1: 규칙마다 그래프 자료가 있는 첫 후보(실제 과거 자료)를 모아 화면 점검용으로 출력
        if (process.env.CHARTS) for (const c of r.cands) if (c.chart && !charts[c.ruleId]) charts[c.ruleId] = { station: s.station_name, at: ctx.nowW, title: c.title, text: c.text, kind: c.kind, chart: c.chart };
        for (const id of ids) if (r.diag[id]?.fired) firedToday.add(id);
        const v = selectV2(r.cands, { history: [], slot: D, nowW: ctx.nowW });
        for (const c of v.stories) selToday.add(c.ruleId);
      }
      if (!any) continue;
      row.days++; stDays++;
      for (const id of firedToday) { if (!(id in row.fired)) row.fired[id] = 0; if (!(id in tot)) tot[id] = 0; row.fired[id]++; tot[id]++; }
      for (const id of selToday) sel[id]++;
      row.selected += selToday.size;
    }
    per.push(row);
    console.error(`${sid} ${s.station_name}: ${row.days}일 ` + Object.keys(row.fired).map((id) => `${id}=${row.fired[id]}`).join(" "));
  }
  if (process.env.CHARTS) console.log(`CHARTS ${JSON.stringify(charts)}`);
  console.log(JSON.stringify({ days, stations: per.length, stationDays: stDays, snapshotsWithStoredForecast: storedFc, firedDays: tot, selectedDays: sel, perStation: per, stage4: { regionFiredDays: S4.region, regionDays: S4.regionDays, regionSnapshots: S4.regionSnaps, revisionDaysWithData: S4.revDays, g01: { current: REGION_RULES.topMinU, firedDaysAt: Object.fromEntries([0.8, 0.85, 0.9, 0.95].map((th) => [th, G01U.filter(([, u]) => u != null && u >= th).length])), daysWithCandidate: G01U.filter(([, u]) => u != null).length, maxUByDay: G01U }, note: "S:* = 계절 신호 후보(노출 기간 안), F01(*) = 발표 흐름, B:* = 가장 큰 변화 항목(* = ASOS 대체 앞 시간 — 완전 예보 가정)" } }, null, 1));
  process.exit(0);
}
if (process.argv[1] && process.argv[1].endsWith("rt-story-backtest.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
