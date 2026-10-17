// 날씨 이야기 API: /api/stats/date-weather · /api/stats/date-battle · /api/stats/calendar-map (GET, 공개 조회 — stats-api 와 같은 정책)
// 기존 API 응답은 바꾸지 않는다(새 경로만). 계산은 date-weather-engine / date-battle-engine, 저장소는 statsData·statsHourly 메모리 그대로.
// 캐시: 응답 JSON 을 키(지점·날짜 기준·윤달·기간·부분·선택 연도·달력/정책 버전·일/시간자료 판 번호·오늘 날짜)로 기억. 자료 저장 시 판 번호가 올라 자동 무효화.
import { StatsError, toCsv, hourlyLastDay } from "./stats-engine.mjs";
import { parseDateSpec, specKey, specLabel, resolveYears, CALENDAR_VERSION, LUNAR_RANGE, switchBasis, solarToLunar } from "./calendar-resolver.mjs";
import { dateWeather, withSelected, windowYears, windowKey, windowLabel, allFromYear, DAILY_FROM, HOURLY_FROM, POLICY_VERSION, STORY_VERSION, DAY_VERSION, SAMPLE_POLICY, DAILY_METRICS, HOURLY_METRICS, STATUS_TEXT, WINDOW_YEARS, bothCalendars, COUNT_RULES, AROUND, AROUND_METRICS } from "./date-weather-engine.mjs";
import { battle, battleYear, BATTLE_METRICS, CORE_METRICS, CASE_IDS, BATTLE_VERSION } from "./date-battle-engine.mjs";

const SOURCE = "기상청 ASOS 공식 일자료·시간자료(관측지점 한 곳)";
export const kstToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
// CSV 칸: 수식으로 읽히지 않게(=,+,-,@ 로 시작하는 사용자 입력) 앞에 ' — 숫자는 그대로
// v2 화면 주소: date=YYYY-MM-DD(양력 또는 음력 연월일, cal 로 구분) 하나 → 내부 m·d·years(첫 해 = 그 날짜의 연도, cmp = 겹쳐 볼 해)
// 예전 주소(m·d·year·years)는 그대로 받는다.
export function withDateParam(q0) {
  const q = new URLSearchParams(q0);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(q.get("date") || "").trim());
  if (!m) return q;
  q.set("m", String(+m[2]));
  q.set("d", String(+m[3]));
  if (!q.get("years")) q.set("years", [String(+m[1]), ...String(q.get("cmp") || "").split(",").map((s) => s.trim()).filter(Boolean)].join(","));
  q.delete("date");
  return q;
}
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
  // 배틀 응답은 이번 v2 에서 바꾸지 않음(이야기를 쓰지 않으므로 예전 이야기 판 표기 그대로). 날짜 화면은 아래에서 STORY_VERSION(v2)으로 덮어씀
  const policy = () => ({ policyVersion: POLICY_VERSION, calendarVersion: CALENDAR_VERSION, storyVersion: "date-story.2026-10-17.v1", battleVersion: BATTLE_VERSION, sample: SAMPLE_POLICY, dailyFrom: DAILY_FROM, hourlyFrom: HOURLY_FROM, lunarRange: LUNAR_RANGE, statusText: STATUS_TEXT });

  // ---------------------------------------------------------------- 날짜로 보는 날씨
  // 계산(캐시 포함) — API 와 공유 경로(/s/day)가 같이 쓴다. 반환: { str(JSON 문자열) } 또는 CSV 용 { body, st, part }
  async function dayResult(q0, { csv = false } = {}) {
    const q = withDateParam(q0);
    const st = await stationById(q.get("station") || "108");
    const spec = specParam(q);
    const t = today();
    const thisYear = +t.slice(0, 4);
    const win = windowParam(q, thisYear);
    const part0 = ["daily", "hourly", "all", "around"].includes(q.get("part")) ? q.get("part") : "daily";
    const around = part0 === "around"; // 앞뒤 15일 CSV 용(계산은 daily 와 같은 결과)
    const part = around ? "daily" : part0;
    const sel = yearsList(q.get("years") || q.get("year") || String(thisYear), thisYear);
    const store = await statsData.get(st.station_id);
    if (!store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const needH = part !== "daily";
    if (needH && !statsHourly) throw new StatsError("시간자료 통계를 쓸 수 없습니다", 503);
    const hs = needH ? await statsHourly.get(st.station_id) : null;
    const years = windowYears(win, allFromYear(spec, store.firstDate));
    const baseKey = ["dw", st.station_id, specKey(spec), windowKey(win), years.fromYear, part, CALENDAR_VERSION, POLICY_VERSION, STORY_VERSION, DAY_VERSION, statsData.version(), needH ? statsHourly.version() : 0, store.lastDate, hs ? hs.lastIdx : -1, t].join("|");
    const key = `${baseKey}|${sel.join(".")}|${csv ? "csv" : "json"}`;
    const hit = recall(key);
    if (hit && !csv) return { str: hit };
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
      ...policy(), storyVersion: STORY_VERSION, dayVersion: DAY_VERSION, countRules: COUNT_RULES.map(({ test, ...x }) => x), aroundInfo: { ...AROUND, metrics: AROUND_METRICS }, part, selectedYears: sel, selectedCalendars: r.selected ? r.selected.map((x) => bothCalendars(x.solarDate)) : undefined, official, ...r,
    };
    if (csv) return { body, st, part: around ? "around" : part };
    return { str: remember(key, JSON.stringify(body)) };
  }
  async function dateWeatherApi(url, res) {
    const csv = url.searchParams.get("format") === "csv";
    const r = await dayResult(url.searchParams, { csv });
    if (csv) return dateCsv(res, r.st, r.body, r.part);
    return sendJson(res, r.str);
  }
  function dateCsv(res, st, b, part) {
    const head = [`이날 · 날짜로 보는 날씨 (집계 결과 — 원자료 다운로드 아님)`, `지점 ${st.station_id} ${st.station_name || ""} · 해마다 ${b.specLabel} · ${b.window.label} · 오늘 ${b.today}(Asia/Seoul) · 출처 ${SOURCE}`, `정책 ${POLICY_VERSION} · 달력 ${CALENDAR_VERSION} · 일자료 ${DAILY_FROM.slice(0, 4)}~ / 시간자료 ${HOURLY_FROM.slice(0, 4)}~`];
    head[2] = `화면 ${DAY_VERSION} · 정책 ${POLICY_VERSION} · 달력 ${CALENDAR_VERSION} · 일자료 ${DAILY_FROM.slice(0, 4)}~ / 시간자료 ${HOURLY_FROM.slice(0, 4)}~`;
    const num = (v, d = 3) => (v == null ? "" : +v.toFixed(d));
    if (part === "hourly") {
      // 고른 해(+겹쳐 본 해)의 실제 정시 관측만(같은 시각 평균 없음)
      const mets = Object.entries(HOURLY_METRICS);
      const columns = [{ key: "hour", label: "시각" }];
      for (const s of b.hourly.selected) for (const [k, m] of mets) columns.push({ key: `y${s.referenceYear}_${k}`, label: `${s.referenceYear}년 ${m.label}(${m.unit})${k === "rn" ? " h~h+1시" : ""}${s.solarDate ? ` ${s.solarDate}` : ` ${STATUS_TEXT[s.dateStatus]}`}` });
      const rows = Array.from({ length: 24 }, (_, h) => {
        const o = { hour: `${h}시` };
        for (const s of b.hourly.selected) for (const [k] of mets) o[`y${s.referenceYear}_${k}`] = s.series[k][h] != null ? num(s.series[k][h]) : STATUS_TEXT[s.cellStatus[k][h]] || "";
        return o;
      });
      return sendCsv(res, `inal-date-hourly-${st.station_id}-${b.specKey}-${b.selectedYears.join("_")}`, { columns, rows }, [...head, "강수량 h칸 = h~h+1시 1시간 강수량(기상청 정시값 = 앞 1시간 누적). 하루 강수량으로 더하지 않음", ...((b.hourly.stories || []).map((x) => `이야기: ${x.text}`))]);
    }
    if (part === "around") {
      // 앞뒤 15일: 해마다 31일 창 한 줄 + 기간 요약(머리말)
      const A = b.around;
      const mk = Object.keys(AROUND_METRICS);
      const columns = [{ key: "y", label: "기준연도" }, { key: "center", label: "그해 날짜(양력)" }, { key: "start", label: "창 시작" }, { key: "end", label: "창 끝" }, { key: "status", label: "상태" },
        ...mk.flatMap((k) => [{ key: k, label: `${AROUND_METRICS[k].label}(${AROUND_METRICS[k].unit})` }, { key: `${k}_obs`, label: `${AROUND_METRICS[k].label} 유효일` }])];
      const ST = { ...STATUS_TEXT, partial: "자료 부족(2일 이상 빠짐)" };
      const yr = (y, sel = false) => ({ y: `${y.referenceYear}${sel ? "(고른 해)" : ""}`, center: y.center || "", start: y.start || "", end: y.sofarEnd ? `${y.end}(관측 ${y.sofarEnd}까지)` : y.end || "", status: ST[y.status] || y.status,
        ...Object.fromEntries(mk.flatMap((k) => { const m = y.metrics[k]; if (!m) return [[k, ""], [`${k}_obs`, ""]]; return [[k, m.status === "ok" || y.sofarEnd ? num(m.raw) : ST[m.status] || ""], [`${k}_obs`, m.obs]]; })) });
      const rows = A.years.slice().reverse().map((y) => yr(y));
      if (b.aroundSelected && !A.years.some((y) => y.referenceYear === b.aroundSelected.referenceYear)) rows.unshift(yr(b.aroundSelected, true));
      const sm = mk.map((k) => { const m = A.metrics[k]; const d = AROUND_METRICS[k]; return `${d.label}: 해 ${m.n}/${m.eligible}(요청 ${m.requested}) 유효일 ${m.validDays}${d.kind === "mean" ? ` · 해들의 평균 ${m.mean == null ? "-" : m.mean.toFixed(2)}${d.unit}` : d.kind === "sum" ? ` · 합 ${m.total == null ? "-" : m.total.toFixed(1)}mm · 하루 평균 ${m.perDay == null ? "-" : m.perDay.toFixed(2)}mm` : ` · 합 ${m.total ?? "-"}일 · 해마다 평균 ${m.mean == null ? "-" : m.mean.toFixed(2)}일 · 유효일 대비 ${m.share == null ? "-" : m.share.toFixed(1)}%`}${m.limited ? " · 자료 제한" : ""}${m.tier === "reference" ? " · 참고" : ""}`; });
      return sendCsv(res, `inal-date-around15-${st.station_id}-${b.specKey}-${b.years.fromYear}-${b.years.toYear}`, { columns, rows }, [...head, `앞뒤 15일 = 그해 날짜 ±15일(31일). 자료 없는 날이 ${AROUND.maxMissing}일 이하인 해만 넣음(남은 날로만 집계, 채우지 않음)`, ...sm]);
    }
    const mk = Object.keys(DAILY_METRICS);
    const columns = [{ key: "y", label: "기준연도" }, { key: "solar", label: "실제 양력 날짜" }, { key: "lunar", label: "음력 날짜" }, { key: "leap", label: "윤달" }, { key: "station", label: "지점" }, { key: "status", label: "날짜 상태" },
      ...mk.map((k) => ({ key: k, label: `${DAILY_METRICS[k].label.replace(/^평균 /, "")}(${DAILY_METRICS[k].unit})` })), { key: "nsnow", label: "신적설(cm)" }, { key: "rainy", label: "강수(0.1mm 이상)" }, { key: "rainNorm", label: "강수 정규화" }];
    const NORM = { value: "관측값", blank0: "공란=무강수 0(기상청 관례)", missing: "자료 없음", noRow: "그날 행 없음" };
    const rowOf = (r, sel = false) => ({ y: `${r.referenceYear}${sel ? "(고른 해)" : ""}`, solar: r.solarDate || "", lunar: r.lunarDate || "", leap: r.isLeapMonth ? "윤달" : "", station: st.station_id, status: r.dateStatus === "ok" && !r.rowPresent ? "자료 없음" : STATUS_TEXT[r.dateStatus] || r.dateStatus, ...Object.fromEntries(mk.map((k) => [k, num(r.values[k])])), nsnow: num(r.values.nsnow), rainy: r.values.rain == null ? "" : r.values.rain >= 0.1 ? "예" : "아니오", rainNorm: r.rainNorm ? NORM[r.rainNorm] : "" });
    const rows = b.daily.rows.slice().reverse().map((r) => rowOf(r));
    const s0 = b.selected?.[0];
    if (s0 && !b.daily.rows.some((r) => r.referenceYear === s0.referenceYear)) rows.unshift(rowOf(s0, true));
    const cm = b.counts.rules.filter((c) => c.show).map((c) => `${c.label}(${c.cond}): ${c.k}번 / 자료가 있는 ${c.n}개 해(대상 ${c.eligible}, 요청 ${c.requested})${c.k ? ` — ${c.hitYears.join(" ")}` : ""}`);
    const ex = Object.values(b.counts.extremes).filter((x) => x.value != null).map((x) => `${x.label}: ${x.years.join(" ")} (${x.value.toFixed(1)}${x.field === "rain" ? "mm" : "℃"})`);
    return sendCsv(res, `inal-date-daily-${st.station_id}-${b.specKey}-${b.years.fromYear}-${b.years.toYear}`, { columns, rows }, [...head, "해마다 그날 하루씩의 공식 일자료(같은 날 평균 없음). 횟수 = 자료가 있는 해 중 조건을 만족한 해의 수", ...cm, ...ex, ...(b.stories || []).map((x) => `이야기: ${x.text}`)]);
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
  async function battleResult(q, { csv = false } = {}) {
    const cases0 = casesParam(q.get("cases"));
    const t = today();
    const thisYear = +t.slice(0, 4);
    const win = windowParam(q, thisYear);
    const part = ["summary", "hourly", "year"].includes(q.get("part")) ? q.get("part") : "summary";
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
    if (hit && !csv) return { str: hit };
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
    if (csv && part === "summary") return { body, labels };
    return { str: remember(key, JSON.stringify(body)) };
  }
  async function battleApi(url, res) {
    const csv = url.searchParams.get("format") === "csv";
    const r = await battleResult(url.searchParams, { csv });
    if (r.body) return battleCsv(res, r.body, r.labels);
    return sendJson(res, r.str);
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
  const handleDate = async function handleDate(req, res, url) {
    const fn = ROUTES[url.pathname];
    if (!fn) return false;
    if (req.method !== "GET" && req.method !== "HEAD") { json(res, { ok: false, message: "GET 만 지원합니다" }, 405); return true; }
    const t0 = Date.now();
    try { await fn(url, res); }
    catch (err) { if (err instanceof StatsError) json(res, { ok: false, message: err.message }, err.status); else throw err; }
    finally { const ms = Date.now() - t0; if (ms > 2000) log(`date-api slow ${url.pathname} ${ms}ms`); }
    return true;
  };
  // 공유 경로(share-api.mjs)용: 같은 계산·캐시를 객체로
  handleDate.dayBody = async (q) => JSON.parse((await dayResult(q)).str);
  handleDate.battleBody = async (q) => JSON.parse((await battleResult(q)).str);
  return handleDate;
}
