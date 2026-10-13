// 실시간·예보 분석 API (/api/rt/*) — 새 엔드포인트만(기존 API 그대로). GET, 로그인 없이 조회(기존 /api/stats 와 같은 정책).
// 자료 모델: obs(관측) = ASOS 시간·일자료(관측소) 또는 초단기실황(격자) — 둘을 같은 곳으로 가정하지 않고 출처를 늘 밝힌다.
//            fcst(예보) = 초단기예보·단기예보(격자, 발표시각 base ≠ 대상시각 fcst). 강수확률(POP)은 더하지 않고 비교 엔진에도 넣지 않는다.
// 같은 시각에 여러 값이 있으면: 실황 > 초단기예보(최신 발표) > 단기예보(최신 발표).
import { ytdCompare, firstHotDay, outdoorWindow, basePeriods, hourlyCompare, dailyCompare, kst, createBaselineCache, HOURLY_FIELDS, DAILY_FIELDS, diffWord, WINDOW_DAYS, MIN_YEAR_SHARE, MIN_IN_YEAR_SHARE, MIN_SAMPLES_RANK } from "./rt-baseline.mjs";
import { StatsError, hourlyLastDay, ymdToDn, OUTDOOR_DEFAULT, outdoorLabel } from "./stats-engine.mjs";
import { hourlyForecast, shortDaySummary, extremesByDate, midByDate, stitchDays, forecastChanges, addDays } from "./rt-forecast.mjs";

const pad = (n) => String(n).padStart(2, "0");
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
const fin = (v) => (Number.isFinite(v) ? v : null);
// 지연 판정(분): 실황은 정시 + 약 15분에 받는다 → 90분 넘으면 '지연', 초단기예보 2시간, 단기예보 4시간(3시간 간격 + 여유)
export const STALE_MIN = { NCST: 90, ULTRA: 120, VILAGE: 240 };
const wallMs = (w) => Date.parse(`${w.replace(" ", "T")}Z`) - 9 * 3600000; // KST 벽시계 → 실제 시각
import { similarDays, dayVals, selectStories, unusualFromPct, unusualFromRank, unusualFromDiff, STORY_RULE, SIM_WINDOW } from "./rt-stories.mjs";
import { PTY, SKY, windDir, rainText } from "./rt-api-shared.mjs";
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
  async function cached(key, fn) {
    const kk = `${key}|${statsHourly.version()}|${statsData.version()}`;
    const c = todayCache.get(kk);
    if (c && now() - c.at < 60000) return c.data;
    const data = await fn();
    todayCache.set(kk, { at: now(), data });
    if (todayCache.size > 80) todayCache.delete(todayCache.keys().next().value);
    return data;
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
    note: "'1990년 이후 평균'은 누니날씨가 ASOS 관측으로 직접 계산한 값이며 기상청 공식 기후평년값(30년 평년)이 아닙니다.",
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
  async function today(url) {
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
      ? await Promise.all([rt.ncst(G.nx, G.ny, `${k.ymd} 00:00:00`, `${k.ymd} 23:59:59`), rt.latestRelease("KMA_ULTRA_FCST", G.nx, G.ny), rt.latestRelease("KMA_VILAGE_FCST", G.nx, G.ny), rt.dayExtremes(G.nx, G.ny, k.ymd)])
      : [[], null, null, {}];
    const [ultraRows, vilRows] = await Promise.all([ultraRel ? rt.fcst("KMA_ULTRA_FCST", G.nx, G.ny, ultraRel.base) : [], vilRel ? rt.fcst("KMA_VILAGE_FCST", G.nx, G.ny, vilRel.base) : []]);
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
    out.stories = stories(out);
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
    return { ok: true, station: { id: String(st.station_id), name: st.station_name }, asOf, source: "기상청 ASOS 공식 일자료(끝난 날까지만)", items: [{ id: "avg", label: "누적 평균기온", unit: "℃", ...ytdCompare(store, asOf, "avg") }, { id: "rain", label: "누적 강수량", unit: "mm", ...ytdCompare(store, asOf, "rain") }], rule: "해마다 1/1~같은 월일(2/29 는 평년 2/28) 누적. 빠진 날 1일까지는 나머지 날로 계산(1일 결측 규칙), 그 이상이면 그 해 제외. 유효한 해 80% 미만이면 비교 데이터 부족." };
  }

  // 지역별: 지금 실황 기온(절대 순위)과 평소 대비 차이(이례성 순위)를 따로
  async function regions() {
    const list = (await stations()).filter((s) => s.enabled !== false);
    const rows = [];
    for (const s of list) {
      try {
        const t = await todayOf(String(s.station_id));
        const c = t.current;
        if (!c?.values || c.freshness?.state !== "fresh") { rows.push({ id: String(s.station_id), name: s.station_name, temp: null, note: c?.freshness?.text || "실황 없음" }); continue; }
        const cmp = c.compare.ta;
        rows.push({ id: String(s.station_id), name: s.station_name, time: c.time, temp: c.values.ta, grid: t.grid?.nx != null ? `${t.grid.nx},${t.grid.ny}` : null, diffs: Object.fromEntries(cmp.map((p) => [p.id, p.diff])), means: Object.fromEntries(cmp.map((p) => [p.id, p.mean])), percentile: cmp[0].percentile ?? null });
      } catch (e) { rows.push({ id: String(s.station_id), name: s.station_name, temp: null, note: "불러오지 못함" }); }
    }
    const have = rows.filter((r) => r.temp != null);
    const byTemp = [...have].sort((a, b) => b.temp - a.temp).map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, temp: r.temp }));
    const byAnom = [...have].filter((r) => r.diffs.all != null).sort((a, b) => b.diffs.all - a.diffs.all).map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, diff: r.diffs.all, percentile: r.percentile }));
    return { ok: true, now: kst(now()).text, rows, rankTemp: byTemp, rankAnomaly: byAnom, periods: basePeriods(kst(now()).ymd), note: "절대기온 순위(지금 가장 더운 곳)와 이례성 순위(그 지역 평소 같은 시기·시각보다 얼마나 더운가)는 다릅니다. 현재값은 각 지점 격자 초단기실황, 평균은 각 ASOS 관측소." };
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
      const word = d0 == null ? "비교 데이터 부족" : Math.abs(d0) < 1 ? "평소와 비슷해요" : d0 > 0 ? `평소보다 ${Math.abs(d0)}℃ 더워요` : `평소보다 ${Math.abs(d0)}℃ 추워요`;
      return { id: label.id, q, value: v, unit: "℃", answer: word, kind: [...kinds].join("+"), periods, basis: label.basis };
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
      out.push({ id: "weekend", q: `이번 주말(${sat.slice(5)}~${addDays(sat, 1).slice(5)})은 예년보다 따뜻할까?`, value: v, unit: "℃", answer: d0 == null ? "비교 데이터 부족" : Math.abs(d0) < 1 ? "예년과 비슷할 전망" : d0 > 0 ? `예년보다 ${Math.abs(d0)}℃ 따뜻할 전망` : `예년보다 ${Math.abs(d0)}℃ 쌀쌀할 전망`, kind: "예보", periods, basis: `토·일 최고기온 예보(${wkMax.map((x) => x.maxSource).join("·")}) vs 같은 시기 공식 일자료 최고기온 평균` });
    } else out.push({ id: "weekend", q: "이번 주말은 예년보다 따뜻할까?", answer: null, note: "주말 최고기온 예보가 아직 없습니다" });
    // 지금 러닝(기존 산책·러닝 기본 조건)
    const c = t.current;
    if (c?.values && c.freshness?.state === "fresh") {
      const cond = { ...OUTDOOR_DEFAULT };
      const v = c.values;
      const good = v.ta != null && v.ta >= cond.tmin && v.ta <= cond.tmax && (v.rn1 ?? 0) < 0.1 && (v.ws == null || v.ws <= cond.wind);
      const share = outdoorWindow(hs, k.ymd, c.hour, cond);
      out.push({ id: "running", q: "지금 러닝하기 좋은 날씨인가?", answer: good ? "좋아요" : "조건에 맞지 않아요", kind: "실황", value: v.ta, unit: "℃", periods: share.map((p) => ({ id: p.id, label: p.label, range: p.range, share: p.share, samples: p.samples })), basis: `조건: ${outdoorLabel({ ...cond, h1: c.hour, h2: c.hour })} — 과거 같은 시기 ${c.hour}시에 조건을 만족한 비율과 비교` });
    } else out.push({ id: "running", q: "지금 러닝하기 좋은 날씨인가?", answer: null, note: "최신 실황이 없습니다" });
    // 더위 시작(일최고 30℃ 첫날): 올해 vs 기준기간 해마다 같은 날짜까지
    {
      const asOf = store.lastDate < k.ymd ? store.lastDate : addDays(k.ymd, -1);
      const Y = +asOf.slice(0, 4), md = asOf.slice(5);
      const cur = firstHotDay(store, Y, md);
      const periods = basePeriods(asOf).map((p) => {
        const ys = [];
        for (let y = p.from; y <= p.to; y++) ys.push(firstHotDay(store, y, md));
        const hit = ys.filter((x) => x.doy != null);
        return { id: p.id, label: p.label, range: p.range, years: ys.length, hitYears: hit.length, meanDoy: hit.length ? Math.round(hit.reduce((s, x) => s + x.doy, 0) / hit.length) : null };
      });
      const doyTxt = (n) => (n == null ? null : addDays(`${Y}-01-01`, n - 1).slice(5));
      for (const p of periods) { p.meanDate = doyTxt(p.meanDoy); p.diffDays = cur.doy != null && p.meanDoy != null ? cur.doy - p.meanDoy : null; }
      const r5 = periods[2];
      out.push({ id: "heat-start", q: "최근 5년과 비교하면 올해 더위는 일찍 시작했을까?", value: cur.date, answer: cur.date == null ? "올해는 아직 30℃ 넘은 날이 없어요" : r5.diffDays == null ? "비교 데이터 부족" : Math.abs(r5.diffDays) < 3 ? "최근 5년 평균과 비슷했어요" : r5.diffDays < 0 ? `최근 5년 평균보다 ${-r5.diffDays}일 일렀어요` : `최근 5년 평균보다 ${r5.diffDays}일 늦었어요`, kind: "관측", periods, basis: `일최고기온 30℃ 이상 첫날(공식 일자료, 1/1~${md} 사이에서). 평균 날짜는 그 기간 안에 30℃가 있었던 해만으로 계산` });
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
        s.push({ id: "now-temp", title: w === "비슷" ? "지금 기온은 예년과 비슷" : `지금 기온, 예년보다 ${w.replace(/음$/, "아요").replace("높아요", "높아요")}`, value: `${t}℃`, periods: [all, r10, r5].map((x) => ({ label: x.label, range: x.range, mean: x.mean, diff: x.diff })), text, basis: `실황 ${c.time.slice(0, 16)} (격자) vs ASOS ${nm}(${o.station.id}) 정시 관측`, asOf: c.time.slice(0, 16), weight: Math.abs(all.diff ?? 0) });
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
  const published = new Map(); // 지점 → [{date, keys}] (서버 메모리, 최근 3일 — 재시작하면 비워짐)
  async function storiesRt(id) {
    const st = await stationParam(U(id));
    const sid = String(st.station_id), nm = st.station_name;
    const k = kst(now());
    const [t, f, y, g, l, rc, sm] = await Promise.all([todayOf(sid), forecastOf(sid), ytd(U(sid)), cached("R", () => regions()), life(U(sid)), recordsRt(U(sid)), cached(`S|${sid}|today`, () => similar(sid, "today"))]);
    const C = [];
    const sg = (d) => (d > 0 ? `+${d}` : `${d}`);
    const c = t.current;
    const fresh = c?.freshness?.state === "fresh";
    if (c?.values && c.compare?.ta && fresh) {
      const [all, , r5] = c.compare.ta;
      if (all.mean != null) C.push({ key: "now-anomaly", phenomenon: "지금 기온", kind: "관측", unusual: unusualFromPct(all.percentile) ?? unusualFromDiff(all.diff, 5), samples: all.samples, minSamples: MIN_SAMPLES_RANK, info: 0.8, title: `지금 ${nm} ${c.values.ta}℃, 같은 시각 평소보다 ${sg(all.diff)}℃`, text: `${c.hour}시 실황 ${c.values.ta}℃ — ${all.range}년 같은 시기(±${WINDOW_DAYS}일) 같은 시각 평균 ${all.mean}℃${all.percentile != null ? `, 백분위 ${all.percentile}` : ""}.`, basis: `초단기실황 ${c.time.slice(0, 16)} vs ASOS 정시 관측` });
      if (all.mean != null && r5?.mean != null) { const d = round1(r5.mean - all.mean); C.push({ key: "r5-vs-all", phenomenon: "최근 5년 변화", kind: "관측", unusual: unusualFromDiff(d, 1.5), samples: r5.validYears, minSamples: 4, info: 0.6, title: `최근 5년 이 시기·시각은 장기 평균보다 ${sg(d)}℃`, text: `${c.hour}시 기준 최근 5년(${r5.range}) 평균 ${r5.mean}℃, 1990년 이후(${all.range}) 평균 ${all.mean}℃.`, basis: "ASOS 정시 관측, 해마다 평균 후 같은 무게" }); }
    }
    const w = f.week;
    if (w?.anomaly?.[0]?.diff != null) { const a = w.anomaly[0]; C.push({ key: `week-${w.from}`, phenomenon: "이번 주 기온", kind: w.fcDays ? "예보" : "관측", unusual: unusualFromDiff(a.diff, 3), samples: a.values, minSamples: 5, info: 0.7, title: `이번 주(${w.from.slice(5)}~${w.to.slice(5)}) 기온, 예년보다 ${sg(a.diff)}℃${w.fcDays ? " 전망" : ""}`, text: `관측 ${w.obsDays}일 + 예보 ${w.fcDays}일의 최고·최저기온을 ${a.range}년 같은 날 평균과 비교한 평균 차이.`, basis: "지난 날 ASOS 공식 일자료, 오늘부터 단기·중기예보" }); }
    for (const d of w?.days || []) {
      const a = d.maxCmp?.[0];
      if (d.source === "관측" && a?.newHigh) C.push({ key: `rec-obs-${d.date}`, phenomenon: "기록", kind: "관측", unusual: 1, samples: a.samples, minSamples: MIN_SAMPLES_RANK, info: 1, title: `${d.date.slice(5)} 최고기온 ${d.max}℃, 같은 시기 과거 최고(${a.max.value}℃, ${a.max.date})보다 높음`, text: `${a.range}년 같은 시기(±${WINDOW_DAYS}일) 최고기온 ${a.samples}개 중 가장 높습니다(관측 확정).`, basis: "ASOS 공식 일자료" });
    }
    for (const d of f.days || []) if (d.nearRecord) C.push({ key: `rec-fc-${d.date}`, phenomenon: "기록", kind: "예보", unusual: 0.9, samples: d.maxCmp?.[0]?.samples ?? 0, minSamples: MIN_SAMPLES_RANK, info: 0.9, title: `${d.date.slice(5)} 최고 ${d.max}℃ 예보 — 같은 시기 기록(${d.nearRecord.record.value}℃) 근접`, text: "예보값이라 기록 경신은 관측으로만 확정합니다.", basis: `${d.maxSource} ${String(d.maxBase || "").slice(0, 16)} 발표` });
    const row = (g.rows || []).find((r) => r.id === sid);
    if (row?.percentile != null) { const rk = (g.rankAnomaly || []).find((r) => r.id === sid); C.push({ key: "region-anomaly", phenomenon: "지역 이상기온", kind: "관측", unusual: unusualFromPct(row.percentile), samples: MIN_SAMPLES_RANK, minSamples: MIN_SAMPLES_RANK, info: 0.5, title: `${nm}, 평소 대비 이례성 전국 ${rk?.rank ?? "-"}위/${(g.rankAnomaly || []).length}`, text: `지금 ${row.temp}℃, 같은 시기·시각 평균 대비 ${sg(row.diffs?.all)}℃(백분위 ${row.percentile}).`, basis: "각 지점 격자 실황 vs 각 ASOS 관측소(백분위는 표본 60개 이상일 때만 계산)" }); }
    for (const it of y.items || []) { const a = it.periods?.[0]; if (a?.rankHigh && a.status !== "insufficient") C.push({ key: `ytd-${it.id}`, phenomenon: it.id === "rain" ? "올해 누적 강수" : "올해 누적 기온", kind: "관측", unusual: unusualFromRank(a.rankHigh, a.of), samples: a.validYears, minSamples: Math.ceil(a.yearsInPeriod * MIN_YEAR_SHARE), info: 0.6, title: `올해 ${it.label} ${it.value}${it.unit}, 1990년 이후 ${a.of}개 해 중 많은/높은 쪽 ${a.rankHigh}위`, text: `1/1~${y.asOf.slice(5)} 같은 누적 기간 평균 ${a.mean}${it.unit}(${sg(a.diff)}${it.unit}).`, basis: "ASOS 공식 일자료, 끝난 날까지" }); }
    const hs = (l.items || []).find((x) => x.id === "heat-start");
    const p5 = hs?.periods?.find((p) => p.id === "r5");
    if (p5?.diffDays != null) C.push({ key: "heat-start", phenomenon: "계절 시작", kind: "관측", unusual: unusualFromDiff(p5.diffDays, 10), samples: p5.hitYears, minSamples: 4, info: 0.5, title: `올해 더위 시작, 최근 5년 평균보다 ${Math.abs(p5.diffDays)}일 ${p5.diffDays < 0 ? "이름" : "늦음"}`, text: hs.basis || "", basis: "ASOS 공식 일자료" });
    const r1h = rc.rain1h, rp = r1h?.periods?.[0];
    if (r1h?.value > 0 && rp?.max) C.push({ key: `rain1h-${r1h.time}`, phenomenon: "강수", kind: "관측", unusual: Math.min(1, r1h.value / rp.max.value), samples: rp.samples, minSamples: MIN_SAMPLES_RANK, info: 0.7, title: `지금 1시간 강수 ${r1h.value}mm`, text: `${rp.range}년 같은 시기 이 시각 최대 ${rp.max.value}mm(${rp.max.date}).`, basis: "초단기실황 vs ASOS 정시 관측" });
    if (sm.ok && sm.top?.[0]) { const b = sm.top[0]; C.push({ key: `similar-${b.date}`, phenomenon: "과거 유사일", kind: "관측", unusual: 0.4, samples: sm.valid, minSamples: 30, info: 0.5, title: `오늘 기온 변화와 가장 비슷했던 날은 ${b.date.slice(0, 4)}년 ${Number(b.date.slice(5, 7))}월 ${Number(b.date.slice(8, 10))}일`, text: `0시~${sm.hoursUsed[sm.hoursUsed.length - 1]}시 관측만 비교(진행 중), 시간별 기온 RMSE ${b.rmse}℃. 후보 ${sm.valid}일 중.`, basis: sm.formula }); }
    // 최근 게시 이력(어제·그제 고른 key) — 같은 이야기가 날마다 반복되지 않게
    const hist = (published.get(sid) || []).filter((h) => h.date >= dnToYmdLocal(ymdToDn(k.ymd) - 3));
    const recent = new Set(hist.filter((h) => h.date !== k.ymd).flatMap((h) => h.keys));
    const sel = selectStories(C, { recent });
    const todayH = hist.find((h) => h.date === k.ymd);
    if (todayH) todayH.keys = [...new Set([...todayH.keys, ...sel.stories.map((x) => x.key)])]; else hist.push({ date: k.ymd, keys: sel.stories.map((x) => x.key) });
    published.set(sid, hist);
    return { ok: true, station: { id: sid, name: nm }, now: k.text, stale: !fresh, staleNote: fresh ? null : `실황 ${c?.freshness?.text || "없음"} — 지금 기온 이야기는 뺐습니다`, candidates: C.length, stories: sel.stories, dropped: sel.dropped, rule: { ...STORY_RULE, text: "표본 부족 제외 → 이례성 0.3 미만 제외 → 점수 = 0.6×이례성 + 0.4×정보 가치, 예보 ×0.9, 최근 3일 안에 고른 이야기 ×0.5 → 같은 현상은 하나만 → 최대 4개. 이례성: 백분위 |p−50|/50, 순위 양끝 근접도, 차이는 기준폭(기온 3℃·5년 변화 1.5℃·10일)으로 나눔. 과거 유사일은 고정 0.4." } };
  }
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  const round1 = (v) => Math.round(v * 10) / 10;

  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/rt/")) return false;
    if (req.method !== "GET") return json(res, { ok: false, message: "GET 만 됩니다" }, 405), true;
    try {
      if (url.pathname === "/api/rt/today") return json(res, await todayOf(String(url.searchParams.get("station") || "108").trim())), true;
      if (url.pathname === "/api/rt/forecast") return json(res, await forecastOf(String(url.searchParams.get("station") || "108").trim())), true;
      if (url.pathname === "/api/rt/ytd") return json(res, await ytd(url)), true;
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
}
