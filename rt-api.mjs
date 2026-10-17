import { createHash } from "node:crypto";
// 실시간·예보 분석 API (/api/rt/*) — 새 엔드포인트만(기존 API 그대로). GET, 로그인 없이 조회(기존 /api/stats 와 같은 정책).
// 자료 모델: obs(관측) = ASOS 시간·일자료(관측소) 또는 초단기실황(격자) — 둘을 같은 곳으로 가정하지 않고 출처를 늘 밝힌다.
//            fcst(예보) = 초단기예보·단기예보(격자, 발표시각 base ≠ 대상시각 fcst). 강수확률(POP)은 더하지 않고 비교 엔진에도 넣지 않는다.
// 같은 시각에 여러 값이 있으면: 실황 > 초단기예보(최신 발표) > 단기예보(최신 발표).
import { ytdCompare, firstHotDay, firstHotSeasons, derivedCompare, outdoorWindow, basePeriods, hourlyCompare, dailyCompare, kst, createBaselineCache, HOURLY_FIELDS, DAILY_FIELDS, diffWord, WINDOW_DAYS, MIN_YEAR_SHARE, MIN_IN_YEAR_SHARE, MIN_SAMPLES_RANK } from "./rt-baseline.mjs";
import { StatsError, hourlyLastDay, ymdToDn, OUTDOOR_DEFAULT, outdoorLabel } from "./stats-engine.mjs";
import { windHours } from "./rt-forecast-wind.mjs";
import { hourlyForecast, shortDaySummary, extremesByDate, midByDate, stitchDays, forecastChanges, addDays } from "./rt-forecast.mjs";

const pad = (n) => String(n).padStart(2, "0");
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
const fin = (v) => (Number.isFinite(v) ? v : null);
// 지연 판정(분): 실황은 정시 + 약 15분에 받는다 → 90분 넘으면 '지연', 초단기예보 2시간, 단기예보 4시간(3시간 간격 + 여유)
export const STALE_MIN = { NCST: 90, ULTRA: 120, VILAGE: 240 };
const wallMs = (w) => Date.parse(`${w.replace(" ", "T")}Z`) - 9 * 3600000; // KST 벽시계 → 실제 시각
import { similarDays, dayVals, selectStories, unusualFromPct, unusualFromRank, unusualFromDiff, STORY_RULE, SIM_WINDOW } from "./rt-stories.mjs";
import { PTY, SKY, windDir, rainText } from "./rt-api-shared.mjs";
import { RULES_VERSION, REGION_RULES, SEASON_WINDOWS, SELECT_V2, LIFE_VALUE, TIME_VALUE } from "./rt-story-rules.mjs";
import { selectV2, createMemoryHistory, timeValue, roundTo } from "./rt-story-select.mjs";
import { runCatalog } from "./rt-story-catalog.mjs";
import { runningJudgement, rankRegions, seasonExposure, emptyReasonOf, emptyText, toStory } from "./rt-story-facts.mjs";
import { render as renderTpl, warmWord, describeDifference, fnv1a32 } from "./rt-story-templates.mjs";
export { PTY, SKY, windDir, rainText };
export function freshness(baseWall, nowMs, limitMin) {
  if (!baseWall) return { state: "none", text: "자료 없음" };
  const age = Math.round((nowMs - wallMs(baseWall)) / 60000);
  const stale = age > limitMin;
  const h = Math.floor(age / 60), m = age % 60;
  return { state: stale ? "stale" : "fresh", ageMin: age, text: stale ? `${h ? `${h}시간 ` : ""}${m}분 전 자료 — 최신 자료가 늦어지고 있습니다` : "최신" };
}

export function createRtApi({ rt: rtSrc, statsHourly, statsData, stations, json, now = () => Date.now() }) {
  const cache = createBaselineCache();
  const todayCache = new Map();
  // 60초 캐시. 60초~5분 지난 값은 바로 돌려주고 뒤에서 새로 계산(stale-while-revalidate), 5분 넘으면 기다려 새로 계산.
  // 같은 키를 동시에 계산하지 않음(in-flight 공유). 저장(version 변경) 뒤에는 키가 달라져 새로 계산.
  const inflight = new Map();
  function compute(kk, fn) {
    if (inflight.has(kk)) return inflight.get(kk);
    const p = Promise.resolve().then(fn).then((data) => {
      todayCache.delete(kk); todayCache.set(kk, { at: now(), data });
      while (todayCache.size > 160) todayCache.delete(todayCache.keys().next().value);
      return data;
    }).finally(() => inflight.delete(kk));
    inflight.set(kk, p);
    return p;
  }
  async function cached(key, fn) {
    const kk = `${key}|${statsHourly.version()}|${statsData.version()}`;
    const c = todayCache.get(kk);
    const age = c ? now() - c.at : Infinity;
    if (age < 60000) return c.data;
    if (age < 300000) { compute(kk, fn).catch(() => {}); return c.data; }
    return compute(kk, fn);
  }
  async function stationParam(url) {
    const id = String(url.searchParams.get("station") || "108").trim();
    const st = (await stations()).find((s) => String(s.station_id) === id);
    if (!st) throw new StatsError(`알 수 없는 관측지점입니다: ${id.slice(0, 20)}`);
    return st;
  }
  // 시간 비교(캐시: 지점|자료판|지표|날짜|시각)
  function hourBase(hs, stId, ymd, hour, field, value) {
    const key = `H|${stId}|${statsHourly.version()}|${hs.lastIdx}|${field}|${ymd}|${hour}`;
    const base = cache.get(key, () => hourlyCompare(hs, ymd, hour, field, NaN));
    return Number.isFinite(value) ? hourlyCompare(hs, ymd, hour, field, value) : base;
  }
  function dayBase(store, stId, ymd, field, value) {
    if (!Number.isFinite(value)) return cache.get(`D|${stId}|${statsData.version()}|${store.lastDate}|${field}|${ymd}`, () => dailyCompare(store, ymd, field, NaN));
    return dailyCompare(store, ymd, field, value);
  }
  const brief = (list) => list.map((b) => ({ id: b.id, label: b.label, range: `${b.from}~${b.to}`, mean: b.mean, diff: b.diff, status: b.status, statusText: b.statusText, validYears: b.validYears, yearsInPeriod: b.yearsInPeriod, samples: b.samples, missingYears: b.missingYears, percentile: b.percentile ?? null, rankHigh: b.rankHigh ?? null, rankLow: b.rankLow ?? null, p10: b.p10 ?? null, p90: b.p90 ?? null, outside: b.outside ?? null, max: b.max ?? null, min: b.min ?? null, newHigh: b.newHigh ?? null, newLow: b.newLow ?? null, rankNote: b.rankNote ?? null }));

  const method = {
    windowDays: WINDOW_DAYS,
    rule: `같은 월일 ±${WINDOW_DAYS}일(15일), 같은 정시. 해마다 평균을 먼저 낸 뒤 해끼리 같은 무게로 평균. 해 안의 유효값이 ${MIN_IN_YEAR_SHARE * 100}% 미만인 해는 빼고, 유효한 해가 기준 연도 수의 ${MIN_YEAR_SHARE * 100}% 미만이면 '비교 데이터 부족'. 백분위·순위는 유효한 해의 표본 ${MIN_SAMPLES_RANK}개 이상일 때만.`,
    note: "'1990년 이후 평균'은 이날이 ASOS 관측으로 직접 계산한 값이며 기상청 공식 기후평년값(30년 평년)이 아닙니다.",
  };

  // GET /api/rt/baseline?station=&date=YYYY-MM-DD&hour=0~23&field=ta|hm|rn|ws  또는 &daily=max|min|avg|rain  [&value=]
  async function baseline(url) {
    const st = await stationParam(url);
    const k = kst(now());
    const date = url.searchParams.get("date") || k.ymd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new StatsError("date 는 YYYY-MM-DD 입니다");
    const value = num(url.searchParams.get("value"));
    const daily = url.searchParams.get("daily");
    if (daily) {
      if (!DAILY_FIELDS[daily]) throw new StatsError("daily 는 max|min|avg|rain 입니다");
      const store = await statsData.get(st.station_id);
      return { ok: true, station: { id: String(st.station_id), name: st.station_name }, date, kind: "daily", field: daily, fieldLabel: DAILY_FIELDS[daily], source: "기상청 ASOS 공식 일자료", value: fin(value), periods: brief(dayBase(store, st.station_id, date, daily, value)), method };
    }
    const field = url.searchParams.get("field") || "ta";
    if (!HOURLY_FIELDS[field]) throw new StatsError("field 는 ta|hm|rn|ws 입니다");
    const hour = Number(url.searchParams.get("hour") ?? k.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new StatsError("hour 는 0~23 입니다");
    const hs = await statsHourly.get(st.station_id);
    return { ok: true, station: { id: String(st.station_id), name: st.station_name }, date, hour, kind: "hourly", field, fieldLabel: HOURLY_FIELDS[field].label, unit: HOURLY_FIELDS[field].unit, source: "기상청 ASOS 시간자료(정시)", value: fin(value), periods: brief(hourBase(hs, st.station_id, date, hour, field, value)), method };
  }

  // GET /api/rt/today?station=
  async function today(url, lite = false) {
    const rt = typeof rtSrc === "function" ? rtSrc() : rtSrc;
    const st = await stationParam(url);
    const nowMs = now();
    const k = kst(nowMs);
    const out = { ok: true, now: k.text, date: k.ymd, station: { id: String(st.station_id), name: st.station_name }, method, periods: basePeriods(k.ymd) };
    const grid = rt ? await rt.gridOf(st.station_id) : null;
    out.grid = grid && grid.nx != null ? { nx: Number(grid.nx), ny: Number(grid.ny), note: `동네예보 5km 격자(${grid.nx},${grid.ny}) — ASOS 관측소 위치와 같지 않을 수 있습니다` } : null;
    const hs = await statsHourly.get(st.station_id);
    // NAS 왕복을 줄이려고 서로 기대지 않는 조회는 한꺼번에
    const G = out.grid;
    const [ncstRows, ultraRel, vilRel, ext] = G && rt
      ? await Promise.all([rt.ncst(G.nx, G.ny, `${k.ymd} 00:00:00`, `${k.ymd} 23:59:59`), lite ? null : rt.latestRelease("KMA_ULTRA_FCST", G.nx, G.ny), lite ? null : rt.latestRelease("KMA_VILAGE_FCST", G.nx, G.ny), rt.dayExtremes(G.nx, G.ny, k.ymd)])
      : [[], null, null, {}];
    const [ultraRows, vilRows] = lite ? [[], []] : await Promise.all([ultraRel ? rt.fcst("KMA_ULTRA_FCST", G.nx, G.ny, ultraRel.base) : [], vilRel ? rt.fcst("KMA_VILAGE_FCST", G.nx, G.ny, vilRel.base) : []]);
    out.asos = { lastDay: hourlyLastDay(hs), note: "ASOS 시간자료는 매일 11시 30분에 전날까지 받습니다(오늘 관측은 아직 없음)" };
    // 실황(오늘 00시 ~ 지금)
    const obs = new Map();
    let lastBase = null;
    {
      for (const r of ncstRows) {
        if (!obs.has(r.base)) obs.set(r.base, {});
        obs.get(r.base)[r.category] = r.value;
        if (!lastBase || r.base > lastBase) lastBase = r.base;
      }
    }
    const fr = freshness(lastBase, nowMs, STALE_MIN.NCST);
    let cur = null;
    if (lastBase) {
      const o = obs.get(lastBase);
      const hour = +lastBase.slice(11, 13);
      const ta = num(o.T1H), hm = num(o.REH), rn = num(o.RN1), ws = num(o.WSD), vec = num(o.VEC), pty = num(o.PTY);
      const cmp = (field, v) => (Number.isFinite(v) ? brief(hourBase(hs, st.station_id, k.ymd, hour, field, v)) : null);
      cur = {
        time: lastBase, hour, kind: "obs", source: "기상청 초단기실황(격자)", freshness: fr,
        values: { ta: fin(ta), hm: fin(hm), rn1: fin(rn), ws: fin(ws), vec: fin(vec), windDir: windDir(vec), pty: Number.isFinite(pty) ? PTY[pty] ?? String(pty) : null },
        compare: { ta: cmp("ta", ta), hm: cmp("hm", hm), rn: cmp("rn", rn), ws: cmp("ws", ws) },
      };
    }
    out.current = cur || { freshness: fr, values: null, message: "오늘 실황 자료가 없습니다" };
    // 시간별: 관측(실황) + 예보(초단기 → 단기), 과거 평균 3종
    const fc = new Map(); // fcst 벽시계 → { value, source, base }
    const put = (rows, source, base, cat) => { for (const r of rows) if (r.category === cat && !fc.has(r.fcst)) fc.set(r.fcst, { value: num(r.value), source, base: r.release || base }); };
    if (ultraRel) put(ultraRows, "초단기예보", ultraRel.base, "T1H");
    if (vilRel) put(vilRows, "단기예보", vilRel.base, "TMP");
    out.releases = {
      ultra: ultraRel ? { base: ultraRel.base, freshness: freshness(ultraRel.base, nowMs, STALE_MIN.ULTRA) } : null,
      vilage: vilRel ? { base: vilRel.base, freshness: freshness(vilRel.base, nowMs, STALE_MIN.VILAGE) } : null,
    };
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const w = `${k.ymd} ${pad(h)}:00:00`;
      const o = obs.get(w);
      const b = hourBase(hs, st.station_id, k.ymd, h, "ta", NaN);
      const row = { hour: h, time: w, obs: o && Number.isFinite(num(o.T1H)) ? num(o.T1H) : null, fcst: null, fcstSource: null, fcstBase: null, base: Object.fromEntries(b.map((x) => [x.id, x.mean])) };
      if (row.obs === null && (!lastBase || w > lastBase)) {
        const f = fc.get(w);
        if (f && Number.isFinite(f.value)) Object.assign(row, { fcst: f.value, fcstSource: f.source, fcstBase: f.base });
      }
      hours.push(row);
    }
    out.hours = hours;
    out.baseStatus = Object.fromEntries(hourBase(hs, st.station_id, k.ymd, 15, "ta", NaN).map((x) => [x.id, { status: x.status, statusText: x.statusText, validYears: x.validYears, yearsInPeriod: x.yearsInPeriod, samples: x.samples }]));
    // 오늘 최고·최저 예보(단기예보 TMX·TMN) vs 공식 일자료 최고·최저 과거 평균
    const store = await statsData.get(st.station_id);
    const dayOut = {};
    for (const [cat, field] of [["TMX", "max"], ["TMN", "min"]]) {
      const v = ext[cat] ? num(ext[cat].value) : NaN;
      dayOut[field] = { kind: "fcst", source: "단기예보", base: ext[cat]?.base ?? null, value: fin(v), compare: brief(dayBase(store, st.station_id, k.ymd, field, v)), note: "예보값 — 기록 경신 여부는 관측으로만 확정" };
    }
    out.day = dayOut;
    // /api/rt/now(히어로 먼저): 같은 계산의 앞부분만(현재 실황·3개 기준 비교·오늘 최고·최저 예보). 예보 시간표·이야기는 /api/rt/today
    if (lite) return { ok: true, now: out.now, date: out.date, station: out.station, method: out.method, periods: out.periods, grid: out.grid, current: out.current, day: out.day, part: "now" };
    out.stories = stories(out);
    return out;
  }

  // GET /api/rt/forecast-wind?station= — 시간별 풍향·풍속(읽기 전용, 예보 화면 바람 띠용). /api/rt/forecast 와 같은 최신 발표
  async function forecastWind(url) {
    const rt = typeof rtSrc === "function" ? rtSrc() : rtSrc;
    const st = await stationParam(url);
    const k = kst(now());
    const out = { ok: true, now: k.text, station: { id: String(st.station_id), name: st.station_name }, hours: [] };
    const g = rt ? await rt.gridOf(st.station_id) : null;
    if (!g || g.nx == null) return { ...out, message: "이 지점에는 예보 격자가 없습니다" };
    const [ultraRel, vilRel] = await Promise.all([rt.latestRelease("KMA_ULTRA_FCST", g.nx, g.ny), rt.latestRelease("KMA_VILAGE_FCST", g.nx, g.ny)]);
    const [ultraRows, vilRows] = await Promise.all([ultraRel ? rt.fcst("KMA_ULTRA_FCST", g.nx, g.ny, ultraRel.base) : [], vilRel ? rt.fcst("KMA_VILAGE_FCST", g.nx, g.ny, vilRel.base) : []]);
    out.hours = windHours({ vilRows, ultraRows, fromWall: `${k.ymd} ${pad(k.hour)}:00:00` });
    out.note = "풍향 = 바람이 불어오는 쪽(도, 기상청 VEC), 화살표는 바람이 불어 가는 쪽. 풍속 WSD(m/s). 6시간 안은 초단기예보, 그 뒤는 단기예보.";
    return out;
  }
  // GET /api/rt/forecast?station= — 시간별·주간 예보 + 3개 기준 비교 + 이번 주 예년 대비 + 발표별 예보 변화
  async function forecast(url) {
    const rt = typeof rtSrc === "function" ? rtSrc() : rtSrc;
    const st = await stationParam(url);
    const nowMs = now();
    const k = kst(nowMs);
    const out = { ok: true, now: k.text, date: k.ymd, station: { id: String(st.station_id), name: st.station_name }, method, periods: basePeriods(k.ymd) };
    const g = rt ? await rt.gridOf(st.station_id) : null;
    if (!g || g.nx == null) return { ...out, message: "이 지점에는 예보 격자가 없습니다", hours: [], days: [], week: null, changes: [] };
    out.mapping = { grid: `${g.nx},${g.ny}`, midTa: g.ta_reg_id, midLand: g.land_reg_id, note: `단기예보 = 5km 격자(${g.nx},${g.ny}), 중기기온 = 도시 ${g.ta_reg_id}, 중기육상 = 광역 ${g.land_reg_id}. ASOS ${st.station_name}(${st.station_id}) 관측소와 같은 곳이 아닙니다.` };
    const weekStart = addDays(k.ymd, -((new Date(`${k.ymd}T00:00:00Z`).getUTCDay() + 6) % 7)); // 월요일
    const [ultraRel, vilRel, ext, ta, land] = await Promise.all([
      rt.latestRelease("KMA_ULTRA_FCST", g.nx, g.ny), rt.latestRelease("KMA_VILAGE_FCST", g.nx, g.ny),
      rt.extremesAll(g.nx, g.ny, weekStart < k.ymd ? weekStart : k.ymd, addDays(k.ymd, 12)),
      g.ta_reg_id ? rt.midItems("KMA_MID_TA", g.ta_reg_id, `${addDays(k.ymd, -3)} 00:00:00`) : [],
      g.land_reg_id ? rt.midItems("KMA_MID_LAND", g.land_reg_id, `${addDays(k.ymd, -1)} 00:00:00`) : [],
    ]);
    const [ultraRows, vilRows] = await Promise.all([ultraRel ? rt.fcst("KMA_ULTRA_FCST", g.nx, g.ny, ultraRel.base) : [], vilRel ? rt.fcst("KMA_VILAGE_FCST", g.nx, g.ny, vilRel.base) : []]);
    out.releases = {
      ultra: ultraRel ? { base: ultraRel.base, freshness: freshness(ultraRel.base, nowMs, STALE_MIN.ULTRA) } : null,
      vilage: vilRel ? { base: vilRel.base, freshness: freshness(vilRel.base, nowMs, STALE_MIN.VILAGE) } : null,
      midTa: ta.length ? ta.reduce((m, x) => (x.tmFc > m ? x.tmFc : m), "") : null,
      midLand: land.length ? land.reduce((m, x) => (x.tmFc > m ? x.tmFc : m), "") : null,
    };
    if (out.releases.midTa) out.releases.midTaFreshness = freshness(out.releases.midTa, nowMs, 13 * 60);
    const hs = await statsHourly.get(st.station_id);
    const store = await statsData.get(st.station_id);
    const hours = hourlyForecast({ vilRows, ultraRows, fromWall: `${k.ymd} ${pad(k.hour)}:00:00` });
    for (const h of hours) {
      const b = hourBase(hs, st.station_id, h.time.slice(0, 10), +h.time.slice(11, 13), "ta", NaN);
      h.avg = Object.fromEntries(b.map((x) => [x.id, x.mean])); // 과거 평균(h.base 는 예보 발표시각)
      h.diff = Object.fromEntries(b.map((x) => [x.id, x.mean != null && h.ta != null ? Math.round((h.ta - x.mean) * 10) / 10 : null]));
    }
    out.hours = hours;
    const extremes = extremesByDate(ext);
    const mid = midByDate(ta, land);
    const days = stitchDays({ today: k.ymd, extremes, shortDays: shortDaySummary(hours), mid });
    const cmpDay = (d, field, v) => brief(dayBase(store, st.station_id, d, field, Number.isFinite(v) ? v : NaN));
    for (const d of days) {
      d.maxCmp = cmpDay(d.date, "max", d.max);
      d.minCmp = cmpDay(d.date, "min", d.min);
      const rec = d.maxCmp[0];
      d.nearRecord = d.max != null && rec.max && d.max >= rec.max.value - 1 ? { kind: "high", record: rec.max, note: "예보값 — 기록은 관측으로만 확정" } : null;
    }
    out.days = days;
    // 이번 주(월~일): 지난 날 = 공식 일자료 관측, 오늘부터 = 예보
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      let max = null, min = null, src = null, base = null;
      if (d < k.ymd) {
        const j = ymdToDn(d) - store.base;
        if (j >= 0 && j < store.n && store.present[j]) { max = fin(store.max[j]); min = fin(store.min[j]); src = "관측"; }
        if (max == null && min == null) {
          const e = extremes.get(d);
          const tx = e?.TMX?.at(-1), tn = e?.TMN?.at(-1);
          if (tx || tn) { max = tx?.value ?? null; min = tn?.value ?? null; src = "예보(관측 아직 없음)"; base = tx?.base || tn?.base; }
        }
      } else {
        const r = days.find((x) => x.date === d);
        if (r && (r.max != null || r.min != null)) { max = r.max; min = r.min; src = r.maxSource || r.minSource; base = r.maxBase || r.minBase; }
      }
      week.push({ date: d, max, min, source: src, base, maxCmp: cmpDay(d, "max", max ?? NaN), minCmp: cmpDay(d, "min", min ?? NaN) });
    }
    const anom = out.periods.map((p, idx) => {
      const ds = [];
      for (const w of week) for (const [v, c] of [[w.max, w.maxCmp[idx]], [w.min, w.minCmp[idx]]]) if (v != null && c.mean != null) ds.push(v - c.mean);
      return { id: p.id, label: p.label, range: p.range, diff: ds.length ? Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10 : null, values: ds.length };
    });
    const obsDays = week.filter((w) => w.source === "관측").length, fcDays = week.filter((w) => w.source && w.source !== "관측").length;
    out.week = { from: weekStart, to: addDays(weekStart, 6), days: week, anomaly: anom, obsDays, fcDays, note: `관측 ${obsDays}일 + 예보 ${fcDays}일. 최고·최저기온 각각의 (값 − 같은 시기 평균)을 평균한 것` };
    out.changes = forecastChanges(extremes, mid, days.map((d) => d.date)).filter((c) => c.max.length + c.min.length > 1);
    return out;
  }

  // ---------------------------------------------------------------- 5단계: 기존 메뉴에 붙는 실시간·예보 확장
  const todayOf = (st) => cached(`T|${st}`, () => today(new URL(`http://x/?station=${st}`)));
  // /api/rt/now: today 캐시가 있으면 그 값에서 잘라 주고(숫자 같음), 없으면 가벼운 계산
  const nowPart = (t) => ({ ok: true, now: t.now, date: t.date, station: t.station, method: t.method, periods: t.periods, grid: t.grid, current: t.current, day: t.day, part: "now" });
  async function nowOf(st) {
    const kk = `T|${st}|${statsHourly.version()}|${statsData.version()}`;
    const c = todayCache.get(kk);
    if (c && now() - c.at < 300000) return nowPart(c.data);
    if (inflight.has(kk)) return nowPart(await inflight.get(kk));
    return cached(`N|${st}`, () => today(new URL(`http://x/?station=${st}`), true));
  }
  const forecastOf = (st) => cached(`F|${st}`, () => forecast(new URL(`http://x/?station=${st}`)));
  const avgOf = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

  // 연도별: 올해 1/1 ~ 끝난 마지막 날(공식 일자료) 누적 평균기온·강수량
  async function ytd(url) {
    const st = await stationParam(url);
    const store = await statsData.get(st.station_id);
    const k = kst(now());
    const yesterday = addDays(k.ymd, -1);
    const asOf = store.lastDate && store.lastDate < k.ymd ? (store.lastDate < yesterday ? store.lastDate : yesterday) : yesterday;
    if (asOf.slice(0, 4) !== k.ymd.slice(0, 4)) return { ok: true, station: { id: String(st.station_id), name: st.station_name }, message: "올해 끝난 날이 아직 없습니다", items: [] };
    return { ok: true, station: { id: String(st.station_id), name: st.station_name }, asOf, source: "기상청 ASOS 공식 일자료(끝난 날까지만)", items: [{ id: "avg", label: "누적 평균기온", unit: "℃", ...ytdCompare(store, asOf, "avg") }, { id: "rain", label: "누적 강수량", unit: "mm", ...ytdCompare(store, asOf, "rain") }], rule: "해마다 1/1~같은 월일(2/29 는 윤년이 아닌 해에 2/28) 누적. 빠진 날 1일까지는 나머지 날로 계산(1일 결측 규칙), 그 이상이면 그 해 제외. 유효한 해 80% 미만이면 비교 데이터 부족." };
  }

  // 지역별: 지금 실황 기온(절대 순위)과 평소 대비 차이(이례성 순위)를 따로
  // GET /api/rt/nation-hours — 관측소별 오늘 0~23시 기온(실황 obs·예보 fcst·3개 기준 평균 base). /api/rt/today 와 같은 값(같은 캐시)을 모아 줄인 것, 새 계산 없음
  async function nationHours() {
    const list = (await stations()).filter((s) => s.enabled !== false);
    await eachLimit(list, 3, (s) => todayOf(String(s.station_id)).catch(() => null)); // 3곳씩 미리 채움, 같은 캐시 재사용
    const rows = [];
    for (const s of list) rows.push(await (async () => {
      try {
        const t = await todayOf(String(s.station_id));
        return { id: String(s.station_id), name: s.station_name, lat: s.latitude ?? null, freshness: t.current?.freshness?.state ?? null, hours: t.hours.map((h) => ({ hour: h.hour, obs: h.obs, fcst: h.fcst, fcstSource: h.fcstSource, base: h.base })) };
      } catch (e) { return { id: String(s.station_id), name: s.station_name, error: String(e.message || e), hours: [] }; }
    })());
    const any = await todayOf(String(list[0]?.station_id || "108")).catch(() => null);
    return { ok: true, date: any?.date ?? null, now: any?.now ?? null, periods: any?.periods ?? [], rows, note: "실황 = 기상청 초단기실황, 이후 = 초단기·단기예보(오늘의 날씨와 같은 값). 빈 시각은 자료 없음." };
  }
  // 오래된 값은 바로 돌려주고 뒤에서 새로 고침(60초 지나면). 처음 한 번만 기다림
  const NH = { data: null, at: 0, p: null };
  function nhRefresh() { if (!NH.p) NH.p = nationHours().then((d) => { NH.data = d; NH.at = now(); return d; }).finally(() => { NH.p = null; }); return NH.p; }
  async function nationHoursSWR() {
    if (NH.data) { if (now() - NH.at > 60000) nhRefresh().catch(() => {}); return { ...NH.data, cachedAt: new Date(NH.at).toISOString() }; }
    return nhRefresh();
  }
  // 관측소 여러 곳: 2~3곳씩(NAS 부담 제한), 결과 순서는 관측소 순서 그대로
  async function eachLimit(list, n, fn) {
    const out = new Array(list.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const j = i++; out[j] = await fn(list[j], j); } }));
    return out;
  }
  async function regions() {
    const list = (await stations()).filter((s) => s.enabled !== false);
    await eachLimit(list, 3, (s) => todayOf(String(s.station_id)).catch(() => null)); // 미리 3곳씩 채움(아래는 캐시에서)
    const rows = [];
    for (const s of list) {
      try {
        const t = await todayOf(String(s.station_id));
        const c = t.current;
        if (!c?.values || c.freshness?.state !== "fresh") { rows.push({ id: String(s.station_id), name: s.station_name, temp: null, note: c?.freshness?.text || "실황 없음" }); continue; }
        const cmp = c.compare.ta;
        rows.push({ id: String(s.station_id), name: s.station_name, time: c.time, temp: c.values.ta, grid: t.grid?.nx != null ? `${t.grid.nx},${t.grid.ny}` : null, diffs: Object.fromEntries(cmp.map((p) => [p.id, p.diff])), means: Object.fromEntries(cmp.map((p) => [p.id, p.mean])), percentile: cmp[0].percentile ?? null, pcts: Object.fromEntries(cmp.map((p) => [p.id, p.percentile ?? null])), samples: Object.fromEntries(cmp.map((p) => [p.id, p.samples ?? null])) });
      } catch (e) { rows.push({ id: String(s.station_id), name: s.station_name, temp: null, note: "불러오지 못함" }); }
    }
    // 같은 실황 시각의 지점끼리만 순위(다른 시각은 excluded). 동률 = 같은 순위.
    // rankAboveAvg = 평균보다 높은 순(부호 있는 차이), rankDeviation = 평소에서 크게 벗어난 순(|백분위−50|/50, 방향 함께)
    const R = rankRegions(rows);
    const A = R.rankings.all;
    return {
      ok: true, now: kst(now()).text, time: R.time, comparable: R.comparable, rows,
      rankTemp: R.rankTemp, rankAboveAvg: A.aboveAvg, rankDeviation: A.deviation, rankings: R.rankings, excluded: R.excluded,
      rankAnomaly: A.aboveAvg, // 예전 이름(값 = 평균보다 높은 순). 새 화면은 rankAboveAvg·rankDeviation 을 씀
      periods: basePeriods(kst(now()).ymd), rulesVersion: RULES_VERSION,
      note: `비교 가능한 ${R.comparable}개 지점(같은 실황 시각${R.time ? ` ${R.time.slice(11, 16)}` : ""})끼리의 순위이며 전국 순위가 아닙니다. '평균보다 높은 순'은 같은 시기·시각 평균과의 차이(℃) 순서, '평소에서 크게 벗어난 순'은 백분위가 50에서 먼 순서(더운 쪽·추운 쪽 모두)입니다. 같은 값은 같은 순위. 현재값은 각 지점 격자 초단기실황, 평균은 각 ASOS 관측소(참고 비교).`,
    };
  }

  // 생활 속 날씨: 출근길·퇴근길·오늘 밤·주말·지금 러닝·더위 시작
  async function life(url) {
    const st = await stationParam(url);
    const id = String(st.station_id);
    const [t, f] = await Promise.all([todayOf(id), forecastOf(id)]);
    const hs = await statsHourly.get(st.station_id);
    const store = await statsData.get(st.station_id);
    const k = kst(now());
    // 시각별 값: 오늘 실황 > 예보(오늘 그래프 + 앞 시간별 예보)
    const val = new Map();
    for (const h of t.hours) { if (h.obs != null) val.set(h.time, { v: h.obs, kind: "실황" }); else if (h.fcst != null) val.set(h.time, { v: h.fcst, kind: `예보(${h.fcstSource})` }); }
    for (const h of f.hours || []) if (!val.has(h.time) && h.ta != null) val.set(h.time, { v: h.ta, kind: `예보(${h.source})` });
    function span(label, q, ymdHours) {
      const vals = [], kinds = new Set(), base = { all: [], r10: [], r5: [] };
      for (const [d, hh] of ymdHours) {
        const w = `${d} ${pad(hh)}:00:00`;
        const x = val.get(w);
        if (!x) continue;
        vals.push(x.v); kinds.add(x.kind.startsWith("실황") ? "실황" : "예보");
        for (const b of hourBase(hs, id, d, hh, "ta", NaN)) if (b.mean != null) base[b.id].push(b.mean);
      }
      const need = ymdHours.length;
      if (vals.length < need) return { id: label.id, q, answer: null, note: `자료 부족(${vals.length}/${need}시간)` };
      const v = avgOf(vals);
      const periods = t.periods.map((p) => ({ id: p.id, label: p.label, range: p.range, mean: base[p.id].length === need ? avgOf(base[p.id]) : null }));
      for (const p of periods) p.diff = p.mean == null ? null : Math.round((v - p.mean) * 10) / 10;
      const d0 = periods[0].diff;
      const word = d0 == null ? "비교 데이터 부족" : warmWord(d0);
      return { id: label.id, q, value: v, unit: "℃", answer: word, diffLevel: describeDifference("ta", d0), kind: [...kinds].join("+"), periods, basis: label.basis };
    }
    const hrs = (d, a, b) => Array.from({ length: b - a + 1 }, (_, i) => [d, a + i]);
    const out = [];
    const amDay = k.hour > 9 ? addDays(k.ymd, 1) : k.ymd, pmDay = k.hour > 20 ? addDays(k.ymd, 1) : k.ymd;
    out.push(span({ id: "commute-am", basis: `${amDay} 7~9시 평균기온` }, `${amDay === k.ymd ? "오늘" : "내일"} 출근길(7~9시)은 평소보다 더울까?`, hrs(amDay, 7, 9)));
    out.push(span({ id: "commute-pm", basis: `${pmDay} 18~20시 평균기온` }, `${pmDay === k.ymd ? "오늘" : "내일"} 퇴근길(18~20시)은 평소보다 추울까?`, hrs(pmDay, 18, 20)));
    const nightDay = k.hour < 6 ? addDays(k.ymd, -1) : k.ymd;
    out.push(span({ id: "tonight", basis: `${nightDay} 21시~다음 날 6시 평균기온` }, "오늘 밤은 평소보다 더울까?", [...hrs(nightDay, 21, 23), ...hrs(addDays(nightDay, 1), 0, 6)]));
    // 주말(가장 가까운 토·일; 오늘이 토·일이면 이번 주말)
    const dow = new Date(`${k.ymd}T00:00:00Z`).getUTCDay();
    const sat = dow === 0 ? addDays(k.ymd, -1) : addDays(k.ymd, (6 - dow + 7) % 7);
    const wk = [sat, addDays(sat, 1)].map((d) => f.days?.find((x) => x.date === d)).filter(Boolean);
    const wkMax = wk.filter((x) => x.max != null);
    if (wkMax.length === 2) {
      const periods = t.periods.map((p, i) => { const m = wkMax.map((x) => x.maxCmp[i].mean); return { id: p.id, label: p.label, range: p.range, mean: m.every((x) => x != null) ? avgOf(m) : null }; });
      const v = avgOf(wkMax.map((x) => x.max));
      for (const p of periods) p.diff = p.mean == null ? null : Math.round((v - p.mean) * 10) / 10;
      const d0 = periods[0].diff;
      out.push({ id: "weekend", q: `이번 주말(${sat.slice(5)}~${addDays(sat, 1).slice(5)})은 이맘때보다 따뜻할까?`, value: v, unit: "℃", answer: d0 == null ? "비교 데이터 부족" : warmWord(d0, { prefix: "이맘때 평균보다", hot: "따뜻할 전망", cold: "쌀쌀할 전망", same: "이맘때 평균과 비슷할 전망" }), diffLevel: describeDifference("ta", d0), kind: "예보", periods, basis: `토·일 최고기온 예보(${wkMax.map((x) => x.maxSource).join("·")}) vs 같은 시기 공식 일자료 최고기온 평균` });
    } else out.push({ id: "weekend", q: "이번 주말은 이맘때보다 따뜻할까?", answer: null, note: "주말 최고기온 예보가 아직 없습니다" });
    // 지금 러닝(기존 산책·러닝 기본 조건)
    const c = t.current;
    if (c?.values && c.freshness?.state === "fresh") {
      const cond = { ...OUTDOOR_DEFAULT };
      const v = c.values;
      // pass / fail / unknown — 강수·풍속이 없으면 '판단 보류'(없는 값을 0·통과로 보지 않음)
      const j = runningJudgement(v, cond);
      const share = outdoorWindow(hs, k.ymd, c.hour, cond);
      out.push({ id: "running", q: "지금 러닝 조건에 맞을까?", answer: j.answer, judgement: j.status, checks: j.checks, kind: "실황", value: v.ta, unit: "℃", periods: share.map((p) => ({ id: p.id, label: p.label, range: p.range, share: p.share, samples: p.samples })), basis: `조건: ${outdoorLabel({ ...cond, h1: c.hour, h2: c.hour })} — 과거 같은 시기 ${c.hour}시에 조건을 만족한 비율과 비교` });
    } else out.push({ id: "running", q: "지금 러닝 조건에 맞을까?", answer: null, judgement: "unknown", note: "최신 실황이 없어 판단 보류" });
    // 더위 시작(일최고 30℃ 첫날): 올해 vs 기준기간 해마다 같은 날짜까지
    {
      const asOf = store.lastDate < k.ymd ? store.lastDate : addDays(k.ymd, -1);
      const Y = +asOf.slice(0, 4), md = asOf.slice(5);
      const cur = firstHotDay(store, Y, md);
      // 기준 평균: 끝난 해 전체를 본 '완전한 시즌'만(선택 편향 수정, astra 4장) — 발생한 k개 시즌의 평균, k < 4 면 내지 않음
      const periods = firstHotSeasons(store, asOf, SEASON_WINDOWS["first-hot-day"].threshold);
      const doyTxt = (n) => (n == null ? null : addDays(`${Y}-01-01`, n - 1).slice(5));
      for (const p of periods) { p.meanDate = doyTxt(p.meanDoy); p.diffDays = cur.doy != null && p.meanDoy != null ? cur.doy - p.meanDoy : null; }
      const r5 = periods[2];
      // 홈 노출: 3~9월, 첫 30℃ 확인 뒤 7일까지(rt-story-rules SEASON_WINDOWS). 이 질문 화면(#/stats/life)에는 늘 보임
      const exposure = seasonExposure("first-hot-day", cur, k.ymd);
      out.push({ id: "heat-start", q: "최근 5년과 비교하면 올해 더위는 일찍 시작했을까?", value: cur.date, event: { date: cur.date, seasonStart: cur.seasonStart, firstConfirmed: cur.firstConfirmed, missingBeforeEvent: cur.missingBeforeEvent, coverage: cur.coverage, threshold: SEASON_WINDOWS["first-hot-day"].threshold }, homeEligible: exposure.home, exposure, answer: cur.date == null ? "올해는 아직 30℃ 넘은 날이 없어요" : r5.diffDays == null ? (r5.statusText || "비교 데이터 부족") : Math.abs(r5.diffDays) < 3 ? "최근 5년 평균과 비슷했어요" : r5.diffDays < 0 ? `최근 5년 평균보다 ${-r5.diffDays}일 일렀어요(${r5.completeSeasons}개 시즌 중 ${r5.hitYears}개 발생 시즌 평균)` : `최근 5년 평균보다 ${r5.diffDays}일 늦었어요(${r5.completeSeasons}개 시즌 중 ${r5.hitYears}개 발생 시즌 평균)`, kind: "관측", periods, basis: `일최고기온 30℃ 이상 첫날(공식 일자료). 올해는 1/1~${md}, 기준 평균은 끝난 해마다 1/1~12/31 전체를 본 완전한 시즌(사건 전 결측 1일 이내) 중 30℃가 있었던 시즌의 평균 날짜 — ${r5.statusText || ""}` });
    }
    return { ok: true, station: { id, name: st.station_name }, now: k.text, items: out };
  }

  // 날씨 기록: 지금 순위, 오늘·앞날 최고·최저 예보의 기록 접근(예상), 1시간 강수 기록, 기준별 최고·최저 기록(확정)
  async function recordsRt(url) {
    const st = await stationParam(url);
    const id = String(st.station_id);
    const [t, f] = await Promise.all([todayOf(id), forecastOf(id)]);
    const out = { ok: true, station: { id, name: st.station_name }, now: t.now, periods: t.periods };
    const c = t.current;
    out.now_rank = c?.values && c.freshness?.state === "fresh" ? { kind: "실황(확정 아님 — 정시 실황)", time: c.time, value: c.values.ta, periods: c.compare.ta.map((p) => ({ id: p.id, label: p.label, range: p.range, rankHigh: p.rankHigh, rankLow: p.rankLow, samples: p.samples, percentile: p.percentile, max: p.max, min: p.min })) } : null;
    out.rain1h = c?.values && c.compare?.rn ? { value: c.values.rn1, time: c.time, periods: c.compare.rn.map((p) => ({ id: p.id, label: p.label, range: p.range, max: p.max, samples: p.samples })) } : null;
    out.days = (f.days || []).filter((d) => d.max != null || d.min != null).slice(0, 10).map((d) => ({
      date: d.date, kind: "예상(예보)", max: d.max, min: d.min, maxSource: d.maxSource, maxBase: d.maxBase,
      periods: d.maxCmp.map((p, i) => ({ id: p.id, label: p.label, range: p.range, recMax: p.max, recMin: d.minCmp[i].min, gapMax: d.max != null && p.max ? Math.round((d.max - p.max.value) * 10) / 10 : null, gapMin: d.min != null && d.minCmp[i].min ? Math.round((d.min - d.minCmp[i].min.value) * 10) / 10 : null })),
    }));
    out.rule = "기록 = 같은 시기(±7일) 공식 일자료 최고·최저(확정 관측). 예보값은 '예상'으로만 표시하고 기록 경신을 확정하지 않습니다. 근접 = 기록과 1℃ 이내.";
    return out;
  }

  // 원자료(실황·예보) — 기존 시간별·일별 원자료와 따로. format=csv 면 CSV
  async function raw(url, res) {
    const rt = typeof rtSrc === "function" ? rtSrc() : rtSrc;
    const st = await stationParam(url);
    const ds = url.searchParams.get("dataset") || "KMA_ULTRA_NCST";
    const date = url.searchParams.get("date") || kst(now()).ymd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new StatsError("date 는 YYYY-MM-DD 입니다");
    if (!rt) throw new StatsError("실황·예보 원자료는 MySQL 저장소에서만 봅니다");
    const g = await rt.gridOf(st.station_id);
    let rows, cols;
    if (ds === "KMA_MID_TA" || ds === "KMA_MID_LAND") {
      const reg = ds === "KMA_MID_TA" ? g.ta_reg_id : g.land_reg_id;
      rows = (await rt.midItems(ds, reg, `${date} 00:00:00`)).filter((r) => r.tmFc < `${addDays(date, 1)} 00:00:00`).map((r) => ({ tm_fc: r.tmFc, target_date: r.day == null ? "" : addDays(r.tmFc.slice(0, 10), r.day), item: r.key, value: r.value, region: reg }));
      cols = ["tm_fc", "target_date", "item", "value", "region"];
    } else if (["KMA_ULTRA_NCST", "KMA_ULTRA_FCST", "KMA_VILAGE_FCST"].includes(ds)) {
      const r = await rt.raw(ds, g.nx, g.ny, date);
      if (ds === "KMA_ULTRA_NCST") { rows = r.map((x) => ({ base_time: x.base, category: x.category, value: x.value, grid: `${g.nx},${g.ny}` })); cols = ["base_time", "category", "value", "grid"]; }
      else { rows = r.map((x) => ({ base_time: x.base, fcst_time: x.fcst, category: x.category, value: x.value, grid: `${g.nx},${g.ny}` })); cols = ["base_time", "fcst_time", "category", "value", "grid"]; }
    } else throw new StatsError("dataset 은 KMA_ULTRA_NCST|KMA_ULTRA_FCST|KMA_VILAGE_FCST|KMA_MID_TA|KMA_MID_LAND");
    if (url.searchParams.get("format") === "csv") {
      const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${ds}_${st.station_id}_${date}.csv"`, "cache-control": "no-store" });
      res.end("\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"));
      return null;
    }
    return { ok: true, station: { id: String(st.station_id), name: st.station_name }, dataset: ds, date, columns: cols, rows, kind: ds === "KMA_ULTRA_NCST" ? "실황(관측, 격자)" : "예보", note: "발표시각(base_time)과 예보 대상시각(fcst_time)은 다릅니다. 값은 기상청 응답 그대로입니다." };
  }

  // 오늘의 날씨 이야기(규칙 기반, 수치는 위에서 계산한 값만)
  function stories(o) {
    const s = [];
    const nm = o.station.name;
    const c = o.current;
    if (c && c.values && c.compare?.ta && c.freshness.state === "fresh") {
      const [all, r10, r5] = c.compare.ta;
      const t = c.values.ta;
      if (all.mean != null) {
        const w = diffWord(all.diff, "높", "낮");
        const lead = w === "비슷" ? `${all.range}년 같은 시기 같은 시각 평균 ${all.mean}℃와 비슷합니다(${sign(all.diff)}℃).` : `${all.range}년 같은 시기 같은 시각 평균 ${all.mean}℃보다 ${Math.abs(all.diff)}℃ ${all.diff > 0 ? "높습니다" : "낮습니다"}.`;
        let text = `지금(${c.hour}시) ${nm} 기온 ${t}℃는 ${lead}`;
        if (r5.mean != null && w !== "비슷" && Math.sign(r5.diff) === Math.sign(all.diff) && Math.abs(r5.diff) < Math.abs(all.diff) - 0.9) text += ` 다만 최근 5년 평균(${r5.mean}℃)과 비교하면 차이가 ${sign(r5.diff)}℃로 더 작습니다.`;
        else if (r5.mean != null) text += ` 최근 5년 평균(${r5.mean}℃) 대비 ${sign(r5.diff)}℃입니다.`;
        s.push({ id: "now-temp", title: w === "비슷" ? "지금 기온은 이맘때 평균과 비슷" : `지금 기온, 이맘때 평균보다 ${w.replace(/음$/, "아요")}`, value: `${t}℃`, periods: [all, r10, r5].map((x) => ({ label: x.label, range: x.range, mean: x.mean, diff: x.diff })), text, basis: `실황 ${c.time.slice(0, 16)} (격자) vs ASOS ${nm}(${o.station.id}) 정시 관측`, asOf: c.time.slice(0, 16), weight: Math.abs(all.diff ?? 0) });
      }
      if (all.percentile != null && (all.percentile >= 90 || all.percentile <= 10)) {
        const hi = all.percentile >= 90;
        s.push({ id: "now-rank", title: hi ? "같은 시기로는 드문 높은 기온" : "같은 시기로는 드문 낮은 기온", value: `${hi ? "상위" : "하위"} ${hi ? round1(100 - all.percentile) : all.percentile}%`, periods: [all, r10, r5].map((x) => ({ label: x.label, range: x.range, percentile: x.percentile })), text: `${all.range}년 같은 시기(±${WINDOW_DAYS}일) ${c.hour}시 관측 ${all.samples}개 중 ${hi ? `높은 쪽 ${all.rankHigh}번째` : `낮은 쪽 ${all.rankLow}번째`}입니다.`, basis: "ASOS 정시 관측 분포(유효한 해)", asOf: c.time.slice(0, 16), weight: 10 });
      }
    }
    const mx = o.day?.max;
    if (mx && mx.value != null && mx.compare[0].mean != null) {
      const a = mx.compare[0];
      const w = diffWord(a.diff);
      s.push({ id: "day-max", title: `오늘 최고기온 예보 ${mx.value}℃`, value: `${mx.value}℃`, periods: mx.compare.map((x) => ({ label: x.label, range: x.range, mean: x.mean, diff: x.diff })), text: `${a.range}년 같은 시기 최고기온 평균 ${a.mean}℃와 ${w === "비슷" ? `비슷합니다(${sign(a.diff)}℃)` : `비교해 ${sign(a.diff)}℃입니다`}.${a.max && mx.value >= a.max.value ? " 같은 시기 과거 최고에 근접하거나 넘는 예보입니다(예보값이라 기록은 확정하지 않음)." : ""}`, basis: `단기예보 ${mx.base?.slice(0, 16)} 발표 vs ASOS 공식 일자료`, asOf: mx.base?.slice(0, 16), weight: Math.abs(a.diff ?? 0) - 0.5 });
    }
    return s.sort((a, b) => b.weight - a.weight).map(({ weight, ...x }) => x);
  }

  // ---------------------------------------------------------------- 6단계: 과거 유사일·이야기 엔진
  const U = (id) => new URL(`http://x/?station=${encodeURIComponent(id)}`);
  async function similar(id, day) {
    const st = await stationParam(U(id));
    const sid = String(st.station_id);
    const hs = await statsHourly.get(st.station_id);
    const k = kst(now());
    const head = { ok: true, station: { id: sid, name: st.station_name }, day };
    if (day === "yesterday") {
      const date = dnToYmdLocal(ymdToDn(k.ymd) - 1);
      const dn = ymdToDn(date);
      const tgt = { date, ta: dayVals(hs, dn, "ta"), hm: dayVals(hs, dn, "hm"), rn: dayVals(hs, dn, "rn") };
      const r = similarDays(hs, tgt, { mode: "full" });
      return { ...head, source: `대상일·후보일 모두 ASOS ${st.station_name}(${sid}) 정시 관측`, kind: "관측(하루 전체)", ...r };
    }
    const t = await todayOf(sid);
    const ta = (t.hours || []).map((h) => (h.obs == null ? NaN : h.obs));
    const r = similarDays(hs, { date: k.ymd, ta, hm: [], rn: [] }, { mode: "partial" });
    const last = r.hoursUsed.length ? r.hoursUsed[r.hoursUsed.length - 1] : null;
    return { ...head, source: `오늘: 초단기실황(격자 ${t.grid?.nx},${t.grid?.ny}) 정시 기온 / 과거: ASOS ${st.station_name}(${sid}) 정시 관측 — 위치가 같지 않을 수 있음`, kind: `진행 중 — 0시~${last ?? "-"}시 관측만 비교(예보 미포함)`, partial: true, stale: t.current?.freshness?.state === "stale", ...r };
  }
  const dnToYmdLocal = (dn) => { const d = new Date(dn * 86400000); return d.toISOString().slice(0, 10); };
  const history = createMemoryHistory(); // 게시 이력(지금은 서버 메모리 — 재시작하면 비워짐, 5단계에서 DB 로 같은 인터페이스)
  async function storiesRt(id) {
    const st = await stationParam(U(id));
    const sid = String(st.station_id), nm = st.station_name;
    const k = kst(now());
    const nowW = k.text;
    // 오늘 자료는 꼭 필요, 나머지는 하나가 실패해도 다른 이야기는 고름(실패한 부분은 failedParts 로 밝힘)
    const t = await todayOf(sid);
    const PARTS = ["forecast", "ytd", "regions", "life", "records", "similar"];
    const settled = await Promise.allSettled([forecastOf(sid), ytd(U(sid)), cached("R", () => regions()), life(U(sid)), recordsRt(U(sid)), cached(`S|${sid}|today`, () => similar(sid, "today"))]);
    const failedParts = settled.map((x, i) => (x.status === "rejected" ? PARTS[i] : null)).filter(Boolean);
    const [f, y, g, l, , sm] = settled.map((x) => (x.status === "fulfilled" && x.value ? x.value : {}));
    const hs = await statsHourly.get(st.station_id);
    const store = await statsData.get(st.station_id);
    const C = [];
    const tk = (ruleId, eventId) => ({ station: sid, date: k.ymd, ruleId, eventId });
    const sg = (d) => (d > 0 ? `+${d}` : `${d}`);
    const tv = (startW, endW) => timeValue({ startW, endW, nowW });
    const c = t.current;
    const fresh = c?.freshness?.state === "fresh";
    if (c?.values && c.compare?.ta && fresh) {
      const [all, , r5] = c.compare.ta;
      if (all.mean != null) {
        const dd = describeDifference("ta", all.diff);
        const facts = { nm, t: c.values.ta, hour: c.hour, sd: sg(all.diff), abs: Math.abs(all.diff), mean: all.mean, range: all.range, percentile: all.percentile ?? null, samples: all.samples, level: dd?.level ?? null, levelWord: dd?.levelWord ?? null, warmWord: dd?.direction === "up" ? "따뜻해요" : "쌀쌀해요", dirWord: dd?.direction === "up" ? "높아요" : "낮아요" };
        const eventId = `${sid}|now-anomaly|${k.ymd}`;
        const tpl = renderTpl(tk("now-anomaly", eventId), NOW_TPL, facts);
        if (tpl) C.push({ key: "now-anomaly", ruleId: "now-anomaly", eventId, topic: "temperature", lifeDecision: "outfit", path: "stat", phenomenon: "지금 기온", kind: "관측", U: unusualFromPct(all.percentile) ?? unusualFromDiff(all.diff, 5), A: dd && (dd.level === "notable" || dd.level === "large") ? LIFE_VALUE.decision : LIFE_VALUE.day, T: tv(c.time), material: { d: roundTo(all.diff, 1), level: dd?.level ?? "" }, samples: all.samples, validYears: all.validYears, minSamples: MIN_SAMPLES_RANK, title: tpl.title, templateId: tpl.templateId, facts: { ...facts, diff: all.diff, diffLevel: dd }, text: `${c.hour}시 실황 ${c.values.ta}℃ — ${all.range}년 같은 시기(±${WINDOW_DAYS}일) 같은 시각 평균 ${all.mean}℃${all.percentile != null ? `, 백분위 ${all.percentile}` : ""}.`, method: "초단기실황 기온(격자) vs ASOS 정시 기온, 같은 월일 ±7일·같은 시각. 해마다 평균을 먼저 낸 뒤 같은 무게로 평균, 백분위는 표본 60개 이상일 때만.", basis: `초단기실황 ${c.time.slice(0, 16)} vs ASOS 정시 관측`, asOf: c.time.slice(0, 16), chart: all.p10 != null ? { type: "dist", metric: "ta", unit: "℃", value: c.values.ta, valueKind: "obs", label: `${c.hour}시 기온`, mean: all.mean, p10: all.p10, p90: all.p90, min: all.min?.value ?? null, minDate: all.min?.date ?? null, max: all.max?.value ?? null, maxDate: all.max?.date ?? null, N: all.samples, range: all.range } : null });
      }
      if (all.mean != null && r5?.mean != null) { const d = round1(r5.mean - all.mean); C.push({ key: "r5-vs-all", ruleId: "r5-vs-all", eventId: `${sid}|r5-vs-all|${k.ymd}`, topic: "climate", path: "stat", phenomenon: "최근 5년 변화", kind: "관측", U: unusualFromDiff(d, 1.5), A: LIFE_VALUE.climate, T: TIME_VALUE.timeless, material: { d: roundTo(d, 1) }, samples: r5.validYears, minSamples: 4, title: `최근 5년 이맘때 이 시각은 장기 평균보다 ${d > 0 ? "따뜻했어요" : d < 0 ? "서늘했어요" : "비슷했어요"}`, text: `${c.hour}시 기준 최근 5년(${r5.range}) 평균 ${r5.mean}℃, 1990년 이후(${all.range}) 평균 ${all.mean}℃ — 차이 ${sg(d)}℃.`, method: "ASOS 정시 관측, 같은 월일 ±7일·같은 시각, 해마다 평균 후 같은 무게.", basis: "ASOS 정시 관측, 해마다 평균 후 같은 무게" }); }
    }
    const w = f.week;
    if (w?.anomaly?.[0]?.diff != null) { const a = w.anomaly[0]; C.push({ key: `week-${w.from}`, ruleId: "week", eventId: `${sid}|week|${w.from}`, topic: "temperature", lifeDecision: "week", path: "stat", phenomenon: "이번 주 기온", kind: w.fcDays ? (w.obsDays ? "혼합" : "예보") : "관측", U: unusualFromDiff(a.diff, 3), A: LIFE_VALUE.day, T: tv(`${w.from} 00:00`, `${w.to} 23:59`), material: { d: roundTo(a.diff, 1) }, samples: a.values, minSamples: 5, title: `이번 주(${w.from.slice(5)}~${w.to.slice(5)})는 이맘때보다 ${a.diff > 0 ? "따뜻한" : "쌀쌀한"} 편${w.fcDays ? "일 전망" : ""}`, text: `관측 ${w.obsDays}일 + 예보 ${w.fcDays}일의 최고·최저기온을 ${a.range}년 같은 날 평균과 비교한 평균 차이 ${sg(a.diff)}℃.`, method: "지난 날 ASOS 공식 일자료, 오늘부터 단기·중기예보. 최고·최저기온 각각의 (값 − 같은 시기 평균)을 평균.", basis: "지난 날 ASOS 공식 일자료, 오늘부터 단기·중기예보" }); }
    for (const d of w?.days || []) {
      const a = d.maxCmp?.[0];
      if (d.source === "관측" && a?.newHigh) C.push({ key: `rec-obs-${d.date}`, ruleId: "rec-obs", eventId: `${sid}|rec-obs|${d.date}`, topic: "temperature", lifeDecision: "record", path: "stat", phenomenon: "기록", kind: "관측", U: 1, A: LIFE_VALUE.climate, T: tv(`${d.date} 00:00`, `${d.date} 23:59`), material: { v: d.max }, samples: a.samples, minSamples: MIN_SAMPLES_RANK, title: `${d.date.slice(5)} 최고기온 ${d.max}℃, 같은 시기 보유 표본 범위 밖`, text: `${a.range}년 같은 시기(±${WINDOW_DAYS}일) 최고기온 ${a.samples}개 중 가장 높았던 ${a.max.value}℃(${a.max.date})보다 높아요(관측 확정).`, method: "ASOS 공식 일자료 최고기온, 같은 월일 ±7일 표본(60개 이상).", basis: "ASOS 공식 일자료" });
    }
    for (const d of f.days || []) if (d.nearRecord) C.push({ key: `rec-fc-${d.date}`, ruleId: "rec-fc", eventId: `${sid}|rec-fc|${d.date}`, topic: "temperature", lifeDecision: "record", path: "stat", phenomenon: "기록", kind: "예보", U: 0.9, A: LIFE_VALUE.day, T: tv(`${d.date} 00:00`, `${d.date} 23:59`), material: { v: roundTo(d.max, 1) }, samples: d.maxCmp?.[0]?.samples ?? 0, minSamples: MIN_SAMPLES_RANK, title: `${d.date.slice(5)} 낮 기온, 같은 시기 가장 높았던 값에 가까운 예보`, text: `최고 ${d.max}℃ 예보 — 같은 시기 보유 표본 최고 ${d.nearRecord.record.value}℃(${d.nearRecord.record.date}). 예보값이라 기록으로 말하지 않아요.`, method: "단기·중기예보 최고기온 vs ASOS 공식 일자료 같은 월일 ±7일 최고값, 1℃ 이내면 근접.", basis: `${d.maxSource} ${String(d.maxBase || "").slice(0, 16)} 발표` });
    // 지역: '평소에서 크게 벗어난 순'(|백분위−50|/50, 더운 쪽·추운 쪽 모두) — 같은 실황 시각의 비교 가능한 지점끼리, 전국 순위라 하지 않음
    const row = (g.rows || []).find((r) => r.id === sid);
    const dev = (g.rankDeviation || []).find((r) => r.id === sid);
    if (row && dev) {
      const N = (g.rankDeviation || []).length, up = (g.rankAboveAvg || []).find((r) => r.id === sid);
      const facts = { nm, N, rank: dev.rank, dirText: dev.direction === "high" ? "더운 쪽" : dev.direction === "low" ? "추운 쪽" : "가운데", sd: sg(dev.diff), temp: row.temp, percentile: dev.percentile, time: g.time, aboveRank: up?.rank ?? null, aboveOf: (g.rankAboveAvg || []).length };
      const eventId = `${sid}|region-deviation|${k.ymd}|${dev.direction}`;
      const tpl = renderTpl(tk("region-deviation", eventId), REGION_TPL, facts);
      if (tpl) C.push({ key: "region-anomaly", ruleId: "region-deviation", eventId, topic: "region", path: "stat", phenomenon: "지역 이상기온", kind: "관측", U: unusualFromPct(dev.percentile), A: LIFE_VALUE.climate, T: tv(g.time), material: { rank: dev.rank, dir: dev.direction }, samples: dev.samples, minSamples: MIN_SAMPLES_RANK, exclude: N < REGION_RULES.minStationsStory ? `비교 가능한 지점 ${N}개(${REGION_RULES.minStationsStory}개 미만)` : null, title: tpl.title, templateId: tpl.templateId, facts, text: `지금 ${row.temp}℃, 같은 시기·시각 평균 대비 ${sg(dev.diff)}℃(백분위 ${dev.percentile}).${up ? ` 평균보다 높은 순으로는 ${(g.rankAboveAvg || []).length}개 지점 중 ${up.rank}위.` : ""}`, method: "같은 실황 시각의 비교 가능한 지점끼리 |백분위−50|/50 순. 각 지점 격자 실황 vs 각 ASOS 관측소. 전국 순위가 아니에요.", basis: `같은 실황 시각(${String(g.time || "").slice(11, 16)}) 비교 가능한 ${N}개 지점 · 각 지점 격자 실황 vs 각 ASOS 관측소(백분위는 표본 60개 이상일 때만)` });
    }
    for (const it of y.items || []) { const a = it.periods?.[0]; if (a?.rankHigh && a.status !== "insufficient") { const hiSide = a.rankHigh <= (a.of + 1) / 2; C.push({ key: `ytd-${it.id}`, ruleId: `ytd-${it.id}`, eventId: `${sid}|ytd-${it.id}|${y.asOf.slice(0, 4)}`, topic: "climate", path: "stat", phenomenon: it.id === "rain" ? "올해 누적 강수" : "올해 누적 기온", kind: "관측", U: unusualFromRank(a.rankHigh, a.of), A: LIFE_VALUE.climate, T: TIME_VALUE.timeless, material: { rank: a.rankHigh }, samples: a.validYears, minSamples: Math.ceil(a.yearsInPeriod * MIN_YEAR_SHARE), title: it.id === "rain" ? `올해 지금까지 비가 ${hiSide ? "많이" : "적게"} 온 편이에요` : `올해 지금까지 ${hiSide ? "따뜻한" : "서늘한"} 편이에요`, text: `올해 ${it.label} ${it.value}${it.unit}, 1990년 이후 ${a.of}개 해 중 ${hiSide ? `${it.id === "rain" ? "많은" : "높은"} 쪽 ${a.rankHigh}위` : `${it.id === "rain" ? "적은" : "낮은"} 쪽 ${a.of - a.rankHigh + 1}위`}. 1/1~${y.asOf.slice(5)} 같은 누적 기간 평균 ${a.mean}${it.unit}(${sg(a.diff)}${it.unit}).`, method: "ASOS 공식 일자료 1/1~끝난 날 누적. 빠진 날 1일까지 허용, 유효한 해 80% 미만이면 비교하지 않아요.", basis: "ASOS 공식 일자료, 끝난 날까지" }); } }
    // 계절 신호: 올해 처음 30℃ 이상 — 3~9월, 확인 뒤 7일까지만 홈 후보(그 밖은 사유와 함께 뺌)
    const hsI = (l.items || []).find((x) => x.id === "heat-start");
    const p5 = hsI?.periods?.find((p) => p.id === "r5");
    if (p5?.diffDays != null) C.push({ key: "heat-start", ruleId: "first-hot-day", eventId: `${sid}|first-hot-day|${hsI.value}`, topic: "season", path: "stat", phenomenon: "계절 시작", kind: "관측", basisId: "r5", U: unusualFromDiff(p5.diffDays, 10), A: LIFE_VALUE.info, T: tv(`${hsI.value} 00:00`, `${hsI.value} 23:59`), material: { d: p5.diffDays }, samples: p5.hitYears, minSamples: 4, exclude: hsI.homeEligible ? null : hsI.exposure?.reason || "계절 노출 기간 밖", facts: { date: hsI.value, diffDays: p5.diffDays, meanDate: p5.meanDate, hitYears: p5.hitYears, years: p5.years, completeSeasons: p5.completeSeasons, ...hsI.event }, title: `올해 첫 30℃, 최근 5년보다 ${Math.abs(p5.diffDays)}일 ${p5.diffDays < 0 ? "일렀어요" : "늦었어요"}`, text: `올해 처음 최고 30℃ 이상: ${String(hsI.value).slice(5)}. 최근 5년 ${p5.completeSeasons}개 시즌 중 ${p5.hitYears}개 발생 시즌의 평균 ${p5.meanDate}.`, method: hsI.basis || "", basis: "ASOS 공식 일자료" });
    // 새 규칙(rt-story-catalog: H01·W01·T01·T02·R01~R04·S01·C01·N01·T03·L01) — 같은 ctx 를 되돌려 보기 스크립트도 씀
    const ctx = storyCtx({ sid, nm, k, t, f, hs, store });
    const cat = runCatalog(ctx);
    C.push(...cat.cands);
    const hist = await history.list(sid);
    const sel = selectV2(C, { history: hist, slot: k.ymd, nowW });
    const emptyReason = emptyReasonOf(sel, { fresh, candidates: C, failedParts });
    await history.record(sid, k.ymd, sel.stories.map((x) => ({ eventId: x.eventId, materialHash: x.materialHash, ruleId: x.ruleId })), nowW);
    const explore = exploreCard({ sid, k, sm, store });
    return { ok: true, station: { id: sid, name: nm }, now: k.text, rulesVersion: RULES_VERSION, basisId: "all", basisNote: "이야기 선별은 1990년 이후 기준(전체 비교)으로 합니다", stale: !fresh, staleNote: fresh ? null : `실황 ${c?.freshness?.text || "없음"} — 지금 기온 이야기는 뺐습니다`, candidates: C.length, stories: sel.stories.map((x) => toStory(x, { station: sid, asOf: k.text })), emptyReason, emptyText: emptyText(emptyReason), explore: emptyReason === "normal" ? explore : null, exploreAlt: explore, failedParts, dropped: sel.dropped, rules: cat.diag, history: { kind: history.kind, slot: k.ymd }, rule: { ...SELECT_V2, text: "점수 전: 노출 기간 밖·지연·만료 제외 → 통계 경로는 표본 조건과 이례성 U ≥ 0.3, 생활·전환 경로는 규칙 조건만 → 점수 = 0.35U + 0.35A(생활 관련성) + 0.15T(시점) + 0.15F(새 정보) − R(반복) → 강수 사건은 하나로 묶음 → 같은 주제 1개(다른 생활 결정이면 2개) → 생활 슬롯 확보 → 첫 카드는 지금·가까운 미래 → 최대 4개. 예보 일괄 감점 없음." } };
  }
  // 새 규칙의 입력(ctx) — 오늘 실황·예보·끝난 일자료. 같은 모양을 scripts/rt-story-backtest.mjs 가 지난 날로 만든다
  function storyCtx({ sid, nm, k, t, f, hs, store }) {
    const c = t.current;
    const fresh = c?.freshness?.state === "fresh";
    const series = [];
    let lastObs = null;
    for (const h of t.hours || []) if (h.obs != null) { series.push({ time: h.time, ta: h.obs, kind: "obs", source: "초단기실황" }); lastObs = h.time; }
    for (const h of f.hours || []) if (!lastObs || h.time > lastObs) series.push({ time: h.time, ta: h.ta, hm: h.hm, ws: h.ws, pty: h.pty, sky: h.sky, pop: h.pop, pcpMm: h.pcpMm, kind: "fcst", source: h.source, base: h.base, items: h.items });
    series.sort((a, b) => (a.time < b.time ? -1 : 1));
    const yest = addDays(k.ymd, -1);
    const lastDay = store.lastDate ? (store.lastDate < yest ? store.lastDate : yest) : null;
    return {
      sid, nm, nowW: k.text, ymd: k.ymd, hour: k.hour, hs, store, lastDay, series,
      current: c?.values ? { time: c.time, hour: c.hour, ta: c.values.ta, hm: c.values.hm, ws: c.values.ws, rn1: c.values.rn1, pty: c.values.pty, fresh } : null,
      days: (f.days || []).filter((d) => d.date >= k.ymd).slice(0, 2), fcFresh: f.releases?.vilage?.freshness ? f.releases.vilage.freshness.state !== "stale" : null,
    };
  }
  // 평범한 날의 탐색 카드(오늘과 닮은 날 / 이맘때의 하루) — 숫자는 유사일 결과·ASOS 일자료 분포에서만
  function exploreCard({ sid, k, sm, store }) {
    const cards = [];
    if (sm?.ok && sm.top?.[0]) {
      const b = sm.top[0];
      cards.push({ type: "similar", title: `오늘과 닮은 날: ${b.date.slice(0, 4)}년 ${Number(b.date.slice(5, 7))}월 ${Number(b.date.slice(8, 10))}일`, text: `0시~${sm.hoursUsed[sm.hoursUsed.length - 1]}시 기온 흐름이 가장 비슷했던 날이에요(시간별 기온 RMSE ${b.rmse}℃, 후보 ${sm.valid}일 중).`, link: null, more: "아래 '과거 유사일'에서 더 볼 수 있어요", basis: sm.formula });
    }
    const mx = dailyCompare(store, k.ymd, "max")[0], mn = dailyCompare(store, k.ymd, "min")[0];
    const rainy = derivedCompare((dn) => { const i = dn - store.base; const v = i >= 0 && i < store.n && store.present[i] ? store.rain[i] : NaN; return [Number.isFinite(v) ? (v >= 0.1 ? 100 : 0) : NaN]; }, k.ymd, NaN, { digits: 0 })[0];
    if (mx.mean != null && mn.mean != null) cards.push({ type: "season", title: "이맘때의 하루", text: `${mx.from}~${mx.to}년 같은 시기(±${WINDOW_DAYS}일) 하루는 평균 최고 ${mx.mean}℃·최저 ${mn.mean}℃${rainy.mean != null ? `, 비 온 날(0.1mm 이상) ${rainy.mean}%` : ""}였어요.`, link: null, more: null, basis: "ASOS 공식 일자료, 해마다 평균 후 같은 무게" });
    if (!cards.length) return null;
    return cards[fnv1a32(`${sid}|${k.ymd}|explore`) % cards.length];
  }
  // 문장 틀(날짜·사건마다 고정 선택 — rt-story-templates). 숫자는 facts 에서만. 제목은 쉬운 말, 숫자는 본문
  const NOW_TPL = [
    { id: "a", title: "지금 {nm}, 이맘때 이 시각보다 {levelWord} {warmWord}", when: (f) => f.level !== "similar" && f.levelWord },
    { id: "b", title: "{nm} 지금 {t}℃ — 같은 시각 평소보다 {sd}℃" },
    { id: "c", title: "이 시각 {nm}, 같은 시기 평균보다 {abs}℃ {dirWord}", when: (f) => f.level !== "similar" },
    { id: "d", title: "지금 {nm} 기온은 이맘때 이 시각과 비슷해요", when: (f) => f.level === "similar" },
  ];
  const REGION_TPL = [
    { id: "a", title: "지금 {nm}, 비교 가능한 {N}개 지점 중 평소에서 가장 크게 벗어났어요({dirText})", when: (f) => f.rank === 1 },
    { id: "b", title: "{nm}, 비교 가능한 {N}개 지점 중 평소에서 벗어난 정도 {rank}위({dirText})" },
    { id: "c", title: "같은 시각 {nm}의 평소 대비 차이 {sd}℃ — 비교 가능한 {N}개 지점 중 {rank}위" },
  ];
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  const round1 = (v) => Math.round(v * 10) / 10;

  // 응답: 짧은 캐시 + 약한 ETag(본문 해시) → 같은 내용이면 304. 오류는 저장하지 않음
  const send = (req, res, data, status = 200) => {
    if (typeof res.writeHead !== "function") return json(res, data, status); // 시험용 가짜 응답
    if (status !== 200) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); return res.end(JSON.stringify(data)); }
    const body = JSON.stringify(data);
    const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 22)}"`;
    const h = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30, stale-while-revalidate=60", etag, vary: "Accept-Encoding" };
    if (String(req.headers?.["if-none-match"] || "").split(/\s*,\s*/).includes(etag)) { res.writeHead(304, h); return res.end(); }
    res.writeHead(200, h);
    res.end(body);
  };
  // 서버를 막 시작해 과거 시간자료를 읽는 동안: 4초 안에 끝나지 않으면 '준비 중'(503)으로 답하고 계산은 뒤에서 계속(캐시에 남음)
  let warming = false;
  const WARM_WAIT_MS = 4000;
  const station = (url) => String(url.searchParams.get("station") || "108").trim();
  async function route(url, res) {
    const p = url.pathname;
    if (p === "/api/rt/now") return nowOf(station(url));
    if (p === "/api/rt/today") return todayOf(station(url));
    if (p === "/api/rt/forecast") return forecastOf(station(url));
    if (p === "/api/rt/forecast-wind") return cached(`FW|${station(url)}`, () => forecastWind(url));
    if (p === "/api/rt/ytd") return cached(`Y|${url.search}`, () => ytd(url));
    if (p === "/api/rt/nation-hours") return nationHoursSWR();
    if (p === "/api/rt/regions") return cached("R", () => regions());
    if (p === "/api/rt/life") return cached(`L|${url.search}`, () => life(url));
    if (p === "/api/rt/records") return cached(`C|${url.search}`, () => recordsRt(url));
    if (p === "/api/rt/similar") { const id = station(url); const day = url.searchParams.get("day") === "yesterday" ? "yesterday" : "today"; return cached(`S|${id}|${day}`, () => similar(id, day)); }
    if (p === "/api/rt/stories") { const id = station(url); return cached(`ST|${id}`, () => storiesRt(id)); }
    if (p === "/api/rt/baseline") return cached(`B|${url.search}`, () => baseline(url));
    return undefined;
  }
  const handle = async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/rt/")) return false;
    if (req.method !== "GET") return json(res, { ok: false, message: "GET 만 됩니다" }, 405), true;
    try {
      if (url.pathname !== "/api/rt/raw") {
        const job = route(url, res);
        let data;
        if (warming) {
          let timer;
          const t = new Promise((r) => { timer = setTimeout(() => r(WARM), WARM_WAIT_MS); });
          job.catch(() => {});
          data = await Promise.race([job, t]).finally(() => clearTimeout(timer));
          if (data === WARM) return send(req, res, { ok: false, warming: true, retryAfterSec: 5, message: "준비 중입니다 — 서버를 막 시작해 과거 자료를 읽고 있습니다. 잠시 뒤 다시 불러옵니다." }, 503), true;
        } else data = await job;
        if (data === undefined) return json(res, { ok: false, message: "없는 주소" }, 404), true;
        return send(req, res, data), true;
      }
      if (url.pathname === "/api/rt/today") return json(res, await todayOf(String(url.searchParams.get("station") || "108").trim())), true;
      if (url.pathname === "/api/rt/forecast") return json(res, await forecastOf(String(url.searchParams.get("station") || "108").trim())), true;
      if (url.pathname === "/api/rt/ytd") return json(res, await ytd(url)), true;
      if (url.pathname === "/api/rt/nation-hours") return json(res, await nationHoursSWR()), true;
      if (url.pathname === "/api/rt/regions") return json(res, await cached("R", () => regions())), true;
      if (url.pathname === "/api/rt/life") return json(res, await life(url)), true;
      if (url.pathname === "/api/rt/records") return json(res, await recordsRt(url)), true;
      if (url.pathname === "/api/rt/raw") { const r = await raw(url, res); if (r) json(res, r); return true; }
      if (url.pathname === "/api/rt/similar") { const id = String(url.searchParams.get("station") || "108").trim(); const day = url.searchParams.get("day") === "yesterday" ? "yesterday" : "today"; return json(res, await cached(`S|${id}|${day}`, () => similar(id, day))), true; }
      if (url.pathname === "/api/rt/stories") { const id = String(url.searchParams.get("station") || "108").trim(); return json(res, await storiesRt(id)), true; }
      if (url.pathname === "/api/rt/baseline") return json(res, await baseline(url)), true;
      return json(res, { ok: false, message: "없는 주소" }, 404), true;
    } catch (e) {
      if (e instanceof StatsError) return json(res, { ok: false, message: e.message }, 400), true;
      throw e;
    }
  };
  handle.setWarming = (v) => { warming = Boolean(v); };
  handle.warmNation = () => nhRefresh().catch(() => null);
  handle.warmStations = (ids) => eachLimit(ids, 3, (id) => todayOf(String(id)).catch(() => null));
  return handle;
}
const WARM = Symbol("warm");
