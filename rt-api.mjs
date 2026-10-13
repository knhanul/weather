// 실시간·예보 분석 API (/api/rt/*) — 새 엔드포인트만(기존 API 그대로). GET, 로그인 없이 조회(기존 /api/stats 와 같은 정책).
// 자료 모델: obs(관측) = ASOS 시간·일자료(관측소) 또는 초단기실황(격자) — 둘을 같은 곳으로 가정하지 않고 출처를 늘 밝힌다.
//            fcst(예보) = 초단기예보·단기예보(격자, 발표시각 base ≠ 대상시각 fcst). 강수확률(POP)은 더하지 않고 비교 엔진에도 넣지 않는다.
// 같은 시각에 여러 값이 있으면: 실황 > 초단기예보(최신 발표) > 단기예보(최신 발표).
import { basePeriods, hourlyCompare, dailyCompare, kst, createBaselineCache, HOURLY_FIELDS, DAILY_FIELDS, diffWord, WINDOW_DAYS, MIN_YEAR_SHARE, MIN_IN_YEAR_SHARE, MIN_SAMPLES_RANK } from "./rt-baseline.mjs";
import { StatsError, hourlyLastDay, ymdToDn } from "./stats-engine.mjs";
import { hourlyForecast, shortDaySummary, extremesByDate, midByDate, stitchDays, forecastChanges, addDays } from "./rt-forecast.mjs";

const pad = (n) => String(n).padStart(2, "0");
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
const fin = (v) => (Number.isFinite(v) ? v : null);
// 지연 판정(분): 실황은 정시 + 약 15분에 받는다 → 90분 넘으면 '지연', 초단기예보 2시간, 단기예보 4시간(3시간 간격 + 여유)
export const STALE_MIN = { NCST: 90, ULTRA: 120, VILAGE: 240 };
const wallMs = (w) => Date.parse(`${w.replace(" ", "T")}Z`) - 9 * 3600000; // KST 벽시계 → 실제 시각
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
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  const round1 = (v) => Math.round(v * 10) / 10;

  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/rt/")) return false;
    if (req.method !== "GET") return json(res, { ok: false, message: "GET 만 됩니다" }, 405), true;
    try {
      if (url.pathname === "/api/rt/today") {
        // 같은 지점은 60초 동안 같은 답(실황·예보는 길어야 30분마다 바뀜). 키 = 지점|시간·일 통계 자료판
        const key = `${url.searchParams.get("station") || "108"}|${statsHourly.version()}|${statsData.version()}`;
        const c = todayCache.get(key);
        if (c && now() - c.at < 60000) return json(res, c.data), true;
        const data = await today(url);
        todayCache.set(key, { at: now(), data });
        if (todayCache.size > 50) todayCache.delete(todayCache.keys().next().value);
        return json(res, data), true;
      }
      if (url.pathname === "/api/rt/forecast") return json(res, await cached(`F|${url.searchParams.get("station") || "108"}`, () => forecast(url))), true;
      if (url.pathname === "/api/rt/baseline") return json(res, await baseline(url)), true;
      return json(res, { ok: false, message: "없는 주소" }, 404), true;
    } catch (e) {
      if (e instanceof StatsError) return json(res, { ok: false, message: e.message }, 400), true;
      throw e;
    }
  };
}
