// 날씨 이야기 API: /api/stats/date-weather · /api/stats/date-battle · /api/stats/calendar-map (GET, 공개 조회 — stats-api 와 같은 정책)
// 기존 API 응답은 바꾸지 않는다(새 경로만). 계산은 date-weather-engine / date-battle-engine, 저장소는 statsData·statsHourly 메모리 그대로.
// 캐시: 응답 JSON 을 키(지점·날짜 기준·윤달·기간·부분·선택 연도·달력/정책 버전·일/시간자료 판 번호·오늘 날짜)로 기억. 자료 저장 시 판 번호가 올라 자동 무효화.
import { StatsError, toCsv, hourlyLastDay } from "./stats-engine.mjs";
import { parseDateSpec, specKey, specLabel, resolveYears, CALENDAR_VERSION, LUNAR_RANGE, switchBasis, solarToLunar } from "./calendar-resolver.mjs";
import { dateWeather, withSelected, windowYears, windowKey, windowLabel, allFromYear, DAILY_FROM, HOURLY_FROM, POLICY_VERSION, STORY_VERSION, SAMPLE_POLICY, DAILY_METRICS, HOURLY_METRICS, STATUS_TEXT, WINDOW_YEARS, bothCalendars } from "./date-weather-engine.mjs";
import { battle, battleYear, BATTLE_METRICS, CORE_METRICS, CASE_IDS, BATTLE_VERSION } from "./date-battle-engine.mjs";

const SOURCE = "기상청 ASOS 공식 일자료·시간자료(관측지점 한 곳)";
export const kstToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
// CSV 칸: 수식으로 읽히지 않게(=,+,-,@ 로 시작하는 사용자 입력) 앞에 ' — 숫자는 그대로
const safeText = (s) => { const t = String(s ?? "").slice(0, 40).replace(/[\r\n]/g, " "); return /^[=+\-@\t]/.test(t) ? `'${t}` : t; };

export function createDateApi({ statsData, statsHourly = null, dayRow = null, stations, json, today = () => kstToday(), cacheSize = 300, log = () => {} }) {
  // 응답 문자열 캐시(합계 약 8MB 이하) + 계산 base 캐시(최대 40개) — 운영 컨테이너 메모리 192MB 안에서
  const cache = new Map();
  let bytes = 0;
  const MAX_BYTES = 8 * 1024 * 1024;
  const baseCache = new Map();
  const remember = (k, v) => {
    if (typeof v !== "string") { baseCache.set(k, v); if (baseCache.size > 40) baseCache.delete(baseCache.keys().next().value); return v; }
    if (cache.has(k)) bytes -= cache.get(k).length;
    cache.set(k, v); bytes += v.length;
    while ((bytes > MAX_BYTES || cache.size > cacheSize) && cache.size > 1) { const [k0, v0] = cache.entries().next().value; cache.delete(k0); bytes -= v0.length; }
    return v;
  };
  const recall = (k) => {
    const m = baseCache.has(k) ? baseCache : cache.has(k) ? cache : null;
    if (!m) return undefined;
    const v = m.get(k); m.delete(k); m.set(k, v); return v;
  };
  async function stationById(id) {
    const list = await stations();
    const st = list.find((s) => String(s.station_id) === String(id ?? "").trim());
    if (!st) throw new StatsError(`알 수 없는 관측지점입니다: ${String(id ?? "").slice(0, 20)}`);
    return st;
  }
  const stOut = (st, store) => ({ station_id: st.station_id, station_name: st.station_name, region: st.region || null, dailyFirst: store?.firstDate || null, dailyLast: store?.lastDate || null });
  function specParam(q, prefix = "") {
    const r = parseDateSpec({ calendar: q.get(`${prefix}cal`) || "solar", month: q.get(`${prefix}m`), day: q.get(`${prefix}d`), leap: q.get(`${prefix}leap`) });
    if (!r.ok) throw new StatsError(r.message);
    return r.spec;
  }
  function windowParam(q, thisYear) {
    const period = q.get("period") || "recent10";
    const toRaw = q.get("to");
    const toYear = toRaw == null || toRaw === "" ? thisYear - 1 : Number(toRaw);
    if (!Number.isInteger(toYear) || toYear < 1971 || toYear > thisYear) throw new StatsError(`끝 기준연도는 1971~${thisYear} 사이여야 합니다`);
    const m = /^recent(\d+)$/.exec(period);
    if (m) {
      const years = +m[1];
      if (!WINDOW_YEARS.includes(years)) throw new StatsError("최근 기간은 5·10·20·30년 중 하나입니다");
      return { mode: "recent", years, toYear };
    }
    if (period === "all") return { mode: "all", toYear };
    if (period === "custom") {
      const fromYear = Number(q.get("from"));
      if (!Number.isInteger(fromYear) || fromYear < LUNAR_RANGE.fromYear || fromYear > toYear) throw new StatsError(`시작 기준연도는 ${LUNAR_RANGE.fromYear}~${toYear} 사이여야 합니다`);
      if (toYear - fromYear > 80) throw new StatsError("직접 지정 기간은 81년 이내로 고르세요");
      return { mode: "custom", fromYear, toYear };
    }
    throw new StatsError("기간은 recent5·recent10·recent20·recent30·all·custom 중 하나입니다");
  }
  function yearsList(raw, thisYear) {
    const ys = [...new Set(String(raw || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number))];
    if (ys.some((y) => !Number.isInteger(y) || y < LUNAR_RANGE.fromYear || y > LUNAR_RANGE.toYear)) throw new StatsError(`선택 연도는 ${LUNAR_RANGE.fromYear}~${LUNAR_RANGE.toYear} 사이 숫자입니다`);
    return ys.slice(0, 3);
  }
  function ctxFor(store, hs, t) {
    return { today: t, dailyFrom: store?.firstDate && store.firstDate > DAILY_FROM ? store.firstDate : DAILY_FROM, dailyLast: store?.lastDate || null, hourlyFrom: HOURLY_FROM, hourlyLast: hs ? hourlyLastDay(hs) : null };
  }
  const sendCsv = (res, name, table, meta) => {
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" });
    res.end(toCsv(table, meta));
  };
  const sendJson = (res, body) => { res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(body); };
  const policy = () => ({ policyVersion: POLICY_VERSION, calendarVersion: CALENDAR_VERSION, storyVersion: STORY_VERSION, battleVersion: BATTLE_VERSION, sample: SAMPLE_POLICY, dailyFrom: DAILY_FROM, hourlyFrom: HOURLY_FROM, lunarRange: LUNAR_RANGE, statusText: STATUS_TEXT });

  // ---------------------------------------------------------------- 날짜로 보는 날씨
  async function dateWeatherApi(url, res) {
    const q = url.searchParams;
    const st = await stationById(q.get("station") || "108");
    const spec = specParam(q);
    const t = today();
    const thisYear = +t.slice(0, 4);
    const win = windowParam(q, thisYear);
    const part = ["daily", "hourly", "all"].includes(q.get("part")) ? q.get("part") : "daily";
    const sel = yearsList(q.get("years") || q.get("year") || String(thisYear), thisYear);
    const csv = q.get("format") === "csv";
    const store = await statsData.get(st.station_id);
    if (!store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const needH = part !== "daily";
    if (needH && !statsHourly) throw new StatsError("시간자료 통계를 쓸 수 없습니다", 503);
    const hs = needH ? await statsHourly.get(st.station_id) : null;
    const years = windowYears(win, allFromYear(spec, store.firstDate));
    const baseKey = ["dw", st.station_id, specKey(spec), windowKey(win), years.fromYear, part, CALENDAR_VERSION, POLICY_VERSION, STORY_VERSION, statsData.version(), needH ? statsHourly.version() : 0, store.lastDate, hs ? hs.lastIdx : -1, t].join("|");
    const key = `${baseKey}|${sel.join(".")}|${csv ? "csv" : "json"}`;
    const hit = recall(key);
    if (hit && !csv) return sendJson(res, hit);
    const ctx = ctxFor(store, hs, t);
    // 과거 평균(base)은 선택 연도와 무관 → 따로 기억해 선택 연도만 바뀌면 재사용
    let base = recall(baseKey);
    if (!base) base = remember(baseKey, dateWeather({ spec, store, hs, ctx, years, selectedYears: [], part }));
    const r = withSelected(base, { spec, store, hs, ctx, selectedYears: sel });
    // 선택 연도(첫 번째)의 공식 일자료 한 행(최고·최저 발생 시각 등) — 일자료 부분에서만
    let official = null;
    if (part !== "hourly" && dayRow && r.selected?.[0]?.dateStatus === "ok") {
      try {
        const row = await dayRow(st.station_id, r.selected[0].solarDate);
        const tm = (v) => (v == null || v === "" ? null : String(v).padStart(4, "0").replace(/^(\d\d)(\d\d)$/, "$1:$2"));
        if (row) official = { maxTime: tm(row.max_temperature_time), minTime: tm(row.min_temperature_time), maxWindSpeed: row.max_wind_speed ?? null, maxInstWindSpeed: row.max_inst_wind_speed ?? null, sunshine: row.sunshine ?? null, minHumidity: row.min_humidity ?? null, maxPrecip1h: row.max_precip_1h ?? null, phenomena: row.weather_phenomena || null };
      } catch (e) { log(`date-weather dayRow failed ${e?.code || e?.message}`); official = { error: true }; }
    }
    const body = {
      ok: true, source: SOURCE, timezone: "Asia/Seoul", today: t, station: stOut(st, store), window: { ...win, ...years, label: windowLabel(win, years), allFrom: allFromYear(spec, store.firstDate) },
      hourlyInfo: hs ? { from: HOURLY_FROM, last: hourlyLastDay(hs) } : null, dataRevision: { daily: statsData.version(), hourly: statsHourly ? statsHourly.version() : null, dailyLast: store.lastDate },
      ...policy(), part, selectedYears: sel, selectedCalendars: r.selected ? r.selected.map((x) => bothCalendars(x.solarDate)) : undefined, official, ...r,
    };
    if (csv) return dateCsv(res, st, body, part);
    return sendJson(res, remember(key, JSON.stringify(body)));
  }
  function dateCsv(res, st, b, part) {
    const head = [`이날 · 날짜로 보는 날씨 (집계 결과 — 원자료 다운로드 아님)`, `지점 ${st.station_id} ${st.station_name || ""} · ${b.compareText} · ${b.window.label} · 오늘 ${b.today}(Asia/Seoul) · 출처 ${SOURCE}`, `정책 ${POLICY_VERSION} · 달력 ${CALENDAR_VERSION} · 일자료 ${DAILY_FROM.slice(0, 4)}~ / 시간자료 ${HOURLY_FROM.slice(0, 4)}~`];
    if (part === "hourly") {
      const mets = Object.entries(HOURLY_METRICS);
      const columns = [{ key: "hour", label: "시각" }];
      for (const [k, m] of mets) columns.push({ key: `${k}_mean`, label: `${m.label} 평균(${m.unit})${k === "rn" ? " h~h+1시" : ""}` }, { key: `${k}_n`, label: `${m.label} 유효 연도` }, { key: `${k}_e`, label: `${m.label} 대상 연도` });
      columns.push({ key: "ta_p10", label: "기온 P10(℃)" }, { key: "ta_p90", label: "기온 P90(℃)" });
      for (const s of b.hourly.selected) columns.push({ key: `y${s.referenceYear}`, label: `${s.referenceYear}년 기온(℃) ${s.solarDate || STATUS_TEXT[s.dateStatus]}` });
      const rows = Array.from({ length: 24 }, (_, h) => {
        const o = { hour: `${h}시` };
        for (const [k] of mets) { const x = b.hourly.metrics[k].hours[h]; o[`${k}_mean`] = x.mean == null ? "" : +x.mean.toFixed(3); o[`${k}_n`] = x.n; o[`${k}_e`] = x.eligible; }
        const tx = b.hourly.metrics.ta.hours[h];
        o.ta_p10 = tx.p10 == null ? "" : +tx.p10.toFixed(3); o.ta_p90 = tx.p90 == null ? "" : +tx.p90.toFixed(3);
        for (const s of b.hourly.selected) o[`y${s.referenceYear}`] = s.series.ta[h] ?? (s.cellStatus.ta[h] === "ok" ? "" : STATUS_TEXT[s.cellStatus.ta[h]] || "");
        return o;
      });
      return sendCsv(res, `inal-date-hourly-${st.station_id}-${b.specKey}-${b.years.fromYear}-${b.years.toYear}`, { columns, rows }, [...head, "강수량 h칸 = h~h+1시 1시간 강수량(기상청 정시값 = 앞 1시간 누적). 하루 강수량으로 더하지 않음"]);
    }
    const mk = Object.keys(DAILY_METRICS);
    const columns = [{ key: "y", label: "기준연도" }, { key: "solar", label: "실제 양력 날짜" }, { key: "lunar", label: "음력 날짜" }, { key: "leap", label: "윤달" }, { key: "station", label: "지점" }, { key: "status", label: "날짜 상태" },
      ...mk.map((k) => ({ key: k, label: `${DAILY_METRICS[k].label.replace(/^평균 /, "")}(${DAILY_METRICS[k].unit})` })), { key: "rainy", label: "강수(0.1mm 이상)" }, { key: "rainNorm", label: "강수 정규화" }];
    const NORM = { value: "관측값", blank0: "공란=무강수 0(기상청 관례)", missing: "자료 없음", noRow: "그날 행 없음" };
    const rows = b.daily.rows.map((r) => ({ y: r.referenceYear, solar: r.solarDate || "", lunar: r.lunarDate || "", leap: r.isLeapMonth ? "윤달" : "", station: st.station_id, status: STATUS_TEXT[r.dateStatus] || r.dateStatus, ...Object.fromEntries(mk.map((k) => [k, r.values[k] == null ? "" : +r.values[k].toFixed(3)])), rainy: r.values.rain == null ? "" : r.values.rain >= 0.1 ? "예" : "아니오", rainNorm: r.rainNorm ? NORM[r.rainNorm] : "" }));
    const sm = mk.map((k) => { const s = b.daily.metrics[k]; return `${DAILY_METRICS[k].label}: N=${s.n}/${s.eligible}(요청 ${s.candidateYears.length}) 평균 ${s.mean == null ? "-" : s.mean.toFixed(2)}${DAILY_METRICS[k].unit}${s.limited ? " · 자료 제한" : ""}${s.tier === "reference" ? " · 참고 평균" : ""}`; });
    const rs = b.daily.metrics.rain;
    return sendCsv(res, `inal-date-daily-${st.station_id}-${b.specKey}-${b.years.fromYear}-${b.years.toYear}`, { columns, rows }, [...head, ...sm, `강수일수 ${rs.k}개 해 / N ${rs.n} · 비율 ${rs.share == null ? "-" : rs.share.toFixed(1)}% · 누적 ${rs.total == null ? "-" : rs.total.toFixed(1)}mm`, ...(b.stories || []).map((s) => `이야기: ${s.text}`)]);
  }

  // ---------------------------------------------------------------- 달력 대응표
  async function calendarMap(url, res) {
    const q = url.searchParams;
    if (q.get("solar")) {
      const s = String(q.get("solar"));
      const l = solarToLunar(s);
      const to = q.get("toCal");
      const cal = { solar: s, lunar: l.status === "ok" ? l : null, status: l.status };
      if (to === "lunar" || to === "solar") {
        const y = +s.slice(0, 4);
        const sw = switchBasis({ calendar: "solar", month: +s.slice(5, 7), day: +s.slice(8, 10), leapMonth: false }, y, to);
        cal.switch = sw;
      }
      return json(res, { ok: true, calendarVersion: CALENDAR_VERSION, ...cal });
    }
    const spec = specParam(q);
    const t = today();
    const win = windowParam(q, +t.slice(0, 4));
    const years = windowYears(win, allFromYear(spec, DAILY_FROM));
    const swTo = q.get("switchTo");
    const sy = Number(q.get("year"));
    const sw = swTo && Number.isInteger(sy) ? switchBasis(spec, sy, swTo) : null;
    return json(res, { ok: true, calendarVersion: CALENDAR_VERSION, spec, specLabel: specLabel(spec), years, map: resolveYears(spec, years.fromYear, years.toYear), switch: sw });
  }

  // ---------------------------------------------------------------- 날씨 배틀
  // cases=A.108.S.10.17.0,B.108.L.8.15.0  (id.지점.S|L.월.일.윤달0|1) — 2~4개, id 는 A~D 고정
  function casesParam(raw) {
    const parts = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) throw new StatsError("비교할 날짜는 2~4개입니다");
    const seen = new Set();
    return parts.map((p) => {
      const [id, stationId, cal, m, d, leap] = p.split(".");
      if (!CASE_IDS.includes(id) || seen.has(id)) throw new StatsError("카드 표식은 A~D 중 서로 다른 글자입니다");
      seen.add(id);
      const r = parseDateSpec({ calendar: cal === "L" ? "lunar" : cal === "S" ? "solar" : "x", month: m, day: d, leap: leap === "1" });
      if (!r.ok) throw new StatsError(`${id}: ${r.message}`);
      return { id, stationId: String(stationId || ""), spec: r.spec };
    });
  }
  async function battleApi(url, res) {
    const q = url.searchParams;
    const cases0 = casesParam(q.get("cases"));
    const t = today();
    const thisYear = +t.slice(0, 4);
    const win = windowParam(q, thisYear);
    const part = ["summary", "hourly", "year"].includes(q.get("part")) ? q.get("part") : "summary";
    const csv = q.get("format") === "csv";
    const labels = String(q.get("labels") || "").split(",").map((s) => safeText(decodeURIComponent(s)));
    const sts = [];
    for (const c of cases0) sts.push(await stationById(c.stationId));
    const stores = await Promise.all(sts.map((s) => statsData.get(s.station_id)));
    if (stores.some((s) => !s.n)) throw new StatsError("공식 일자료가 없는 지점이 있습니다", 404);
    const needH = part !== "summary";
    if (needH && !statsHourly) throw new StatsError("시간자료 통계를 쓸 수 없습니다", 503);
    const hss = needH ? await Promise.all(sts.map((s) => statsHourly.get(s.station_id))) : sts.map(() => null);
    const cases = cases0.map((c, i) => ({ ...c, stationId: String(sts[i].station_id), store: stores[i], hs: hss[i] }));
    const ctxOf = (c) => ctxFor(c.store, c.hs, t);
    // 전체: 카드들의 지원 범위 안 가장 이른 기준연도(공통 끝 E)
    const allFrom = Math.min(...cases.map((c) => allFromYear(c.spec, c.store.firstDate)));
    const years = windowYears(win, allFrom);
    const year = Number(q.get("year"));
    const key = ["db", cases.map((c) => `${c.id}${c.stationId}${specKey(c.spec)}`).join(""), windowKey(win), years.fromYear, part, part === "year" ? year : "", CALENDAR_VERSION, POLICY_VERSION, BATTLE_VERSION, statsData.version(), needH ? statsHourly.version() : 0, t, csv ? `csv${labels.join("~")}` : "json"].join("|");
    const hit = recall(key);
    if (hit && !csv) return sendJson(res, hit);
    const stInfo = cases.map((c, i) => ({ id: c.id, ...stOut(sts[i], c.store) }));
    let body;
    if (part === "year") {
      if (!Number.isInteger(year) || year < LUNAR_RANGE.fromYear || year > thisYear) throw new StatsError("연도를 확인하세요");
      body = { ok: true, part, year, cases: battleYear({ cases, year, ctxOf }) };
    } else if (part === "hourly") {
      const b = battle({ cases, years, ctxOf, withHourly: true, metrics: [] });
      body = { ok: true, part, years, hourly: b.hourly };
    } else {
      const b = battle({ cases, years, ctxOf });
      // 기간별 비교 표: 같은 카드 조합의 최근 5·10·20·30년·전체(핵심 지표)
      const periods = [...WINDOW_YEARS.map((n) => ({ mode: "recent", years: n, toYear: win.toYear })), { mode: "all", toYear: win.toYear }].map((w) => {
        const ys = windowYears(w, allFrom);
        const bb = battle({ cases, years: ys, ctxOf, metrics: [...CORE_METRICS, "max", "min"] });
        return { window: { ...w, ...ys, label: windowLabel(w, ys), key: windowKey(w) }, metrics: Object.fromEntries(Object.entries(bb.metrics).map(([k, m]) => [k, { n: m.n, eligible: m.eligible, tier: m.tier, limited: m.limited, results: m.results, comparison: m.comparison, firstYear: m.validYears[0] ?? null, lastYear: m.validYears[m.validYears.length - 1] ?? null }])) };
      });
      body = { ok: true, part, ...b, periods };
    }
    Object.assign(body, { source: SOURCE, timezone: "Asia/Seoul", today: t, window: { ...win, ...years, label: windowLabel(win, years), allFrom }, stations: stInfo, metricsInfo: BATTLE_METRICS, coreMetrics: CORE_METRICS, ...policy(), dataRevision: { daily: statsData.version(), hourly: statsHourly ? statsHourly.version() : null } });
    if (csv && part === "summary") return battleCsv(res, body, labels);
    return sendJson(res, remember(key, JSON.stringify(body)));
  }
  function battleCsv(res, b, labels) {
    const ids = b.cases.map((c) => c.id);
    const columns = [{ key: "metric", label: "지표" }, { key: "unit", label: "단위" }, { key: "n", label: "공통 연도 수" }, { key: "e", label: "공통 대상 연도" }, { key: "years", label: "공통 연도" }, ...ids.map((id) => ({ key: id, label: `${id} 값` })), { key: "cmp", label: "비교" }, { key: "state", label: "표본 상태" }];
    const rows = Object.values(b.metrics).map((m) => ({ metric: m.label, unit: m.unit, n: m.n, e: m.eligible, years: m.validYears.join(" "), ...Object.fromEntries(m.results.map((r) => [r.case, r.value == null ? "" : +r.value.toFixed(3)])), cmp: m.comparison.text, state: m.tier === "none" ? "비교 불가" : m.tier === "reference" ? `참고 · ${m.n}개 해` : m.limited ? "자료 제한" : "" }));
    const yr = [];
    for (const k of ["avg", "rain_mean", "wind"]) for (const py of b.metrics[k].perYear) yr.push(`${b.metrics[k].label} ${py.referenceYear}: ${py.values.map((v) => `${v.case}=${v.value == null ? "" : +v.value.toFixed(2)}(${v.solarDate}${v.lunarDate && b.cases.find((c) => c.id === v.case).spec.calendar === "lunar" ? ` 음력 ${v.isLeapMonth ? "윤" : ""}${v.lunarDate.slice(5)}` : ""})`).join(" ")}`);
    const meta = [`이날 · 날씨 배틀 (집계 결과) · ${b.window.label} · 서로 자료가 있는 같은 연도만 비교${b.mixedCalendars ? " · 각 달력의 같은 기준연도끼리" : ""}`,
      ...b.cases.map((c, i) => `${c.id}: ${c.specLabel} · 지점 ${c.stationId}${labels[i] ? ` · 별칭 ${labels[i]}` : ""}`), `정책 ${POLICY_VERSION} · ${BATTLE_VERSION} · 달력 ${CALENDAR_VERSION} · 출처 ${SOURCE}`, ...yr];
    return sendCsv(res, `inal-battle-${b.cases.map((c) => `${c.id}${c.stationId}${c.specKey}`).join("_")}-${b.window.fromYear}-${b.window.toYear}`, { columns, rows }, meta);
  }

  const ROUTES = { "/api/stats/date-weather": dateWeatherApi, "/api/stats/date-battle": battleApi, "/api/stats/calendar-map": calendarMap };
  return async function handleDate(req, res, url) {
    const fn = ROUTES[url.pathname];
    if (!fn) return false;
    if (req.method !== "GET" && req.method !== "HEAD") { json(res, { ok: false, message: "GET 만 지원합니다" }, 405); return true; }
    const t0 = Date.now();
    try { await fn(url, res); }
    catch (err) { if (err instanceof StatsError) json(res, { ok: false, message: err.message }, err.status); else throw err; }
    finally { const ms = Date.now() - t0; if (ms > 2000) log(`date-api slow ${url.pathname} ${ms}ms`); }
    return true;
  };
}
