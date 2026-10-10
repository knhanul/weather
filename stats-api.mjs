// 날씨 통계 API (/api/stats/*). 공개 조회 API(/api/series·/api/daily)와 같은 접근 정책: GET 만, 로그인 없이 조회 가능
// (auth.guard 가 관리자 전용으로 막는 경로는 /api/gaps·/api/jobs·/api/admin/* 뿐). 계산은 모두 stats-engine.mjs.
import {
  StatsError, parsePeriod, periodLabel, getMetric, metricInfo, METRIC_ORDER, SEASONS, WEEKS, RULES, BASELINE, RECENT,
  yearlyCompare, overlay, regionYearly, regionPeriod, regionMonthly, REGION_PERIOD_METRICS, toCsv, deltaText, yearRows, decadeDelta, daysInMonth,
  thresholdDates, streaks, RUN_KINDS, weekdayShare, sameDayHistory, records, RECORDS, parseOutdoor, outdoorShare, OUTDOOR_DEFAULT, parseHours,
  commuteShare, tropicalNights, LIFE_RULES, posToMd, isLeap,
} from "./stats-engine.mjs";

const STATUS_KO = { complete: "온전", partial: "자료 부족", none: "자료 없음", ongoing: "진행 중", future: "아직 없음", nodate: "그 해엔 없는 날짜" };
const SOURCE = "기상청 ASOS 공식 일자료";
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function yearsParam(url, asOfYear) {
  const f = url.searchParams.get("from");
  const t = url.searchParams.get("to");
  const from = f == null || f === "" ? BASELINE.from : Number(f);
  const to = t == null || t === "" ? asOfYear : Number(t);
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new StatsError("비교 연도는 숫자(예: 1990)로 지정하세요");
  if (from < 1900 || to > asOfYear) throw new StatsError(`비교 연도는 1900~${asOfYear} 사이여야 합니다`);
  if (from > to) throw new StatsError("시작 연도가 종료 연도보다 늦습니다");
  return { fromYear: from, toYear: to };
}
const stationLabel = (s) => `${s.station_id} ${s.station_name || ""}`.trim();

export function createStatsApi({ statsData, statsHourly = null, dayRow = null, stations, officialDate, json }) {
  async function stationById(id) {
    const list = await stations();
    const st = list.find((s) => String(s.station_id) === String(id ?? "").trim());
    if (!st) throw new StatsError(`알 수 없는 관측지점입니다: ${String(id ?? "").slice(0, 20)}`);
    return st;
  }
  function periodParam(url, asOf) {
    const raw = url.searchParams.get("period");
    if (raw) return parsePeriod(raw);
    // 기본: 자료가 다 찬 마지막 달
    const y = +asOf.slice(0, 4);
    const m = +asOf.slice(5, 7);
    const lastDay = daysInMonth(y, m);
    const mm = +asOf.slice(8, 10) === lastDay ? m : m === 1 ? 12 : m - 1;
    return parsePeriod(`month:${mm}`);
  }
  const metricParam = (url, def = "avg_temp") => getMetric(url.searchParams.get("metric") || def).id;
  const asOfFor = (stores) => stores.reduce((d, s) => minDate(d, s.lastDate), officialDate());

  function sendCsv(res, name, table, meta) {
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" });
    res.end(toCsv(table, meta));
  }
  const fileKey = (s) => String(s).replace(/[^0-9A-Za-z_-]+/g, "");

  function yearlyTable(r, st) {
    const m = r.metric;
    const ext = m.agg === "max" || m.agg === "min";
    const columns = [
      { key: "year", label: "연도" },
      { key: "start", label: "시작일" },
      { key: "end", label: "종료일" },
      { key: "days", label: "일수" },
      { key: "obs", label: "관측일수" },
      { key: "value", label: `${m.label}(${m.unit})` },
      ...(ext ? [{ key: "date", label: "날짜" }] : []),
      { key: "status", label: "상태" },
    ];
    const rows = r.rows.map((x) => ({
      year: x.year, start: x.start ?? "", end: x.end ?? "", days: x.days, obs: x.obs, value: x.value, date: x.date ?? "",
      status: x.status === "ongoing" ? `진행 중(${x.until}까지)` : STATUS_KO[x.status] || x.status,
    }));
    return { columns, rows, station: stationLabel(st) };
  }

  async function yearly(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const p = periodParam(url, asOf);
    const metric = metricParam(url);
    const { fromYear, toYear } = yearsParam(url, +asOf.slice(0, 4));
    const r = yearlyCompare(store, metric, p, { fromYear, toYear, asOf });
    const table = yearlyTable(r, st);
    if (url.searchParams.get("format") === "csv") {
      const meta = [
        `누니날씨 날씨 통계 · 연도별 같은 기간 비교 (원자료 다운로드가 아닌 집계 결과)`,
        `지점 ${stationLabel(st)} · 기간 ${r.period.label} · 항목 ${r.metric.label}(${r.metric.unit}) — ${r.metric.def}`,
        `연도 ${fromYear}~${toYear} · 자료 ${asOf}까지 · 출처 ${SOURCE} · 시간대 Asia/Seoul`,
        ...r.text,
      ];
      return sendCsv(res, `weather-stats-yearly-${fileKey(st.station_id)}-${fileKey(p.key)}-${metric}-${fromYear}-${toYear}`, table, meta);
    }
    return json(res, { ok: true, station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null }, source: SOURCE, timezone: "Asia/Seoul", dataVersion: statsData.version(), ...r, table });
  }

  async function overlayApi(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const p = periodParam(url, asOf);
    const metric = metricParam(url);
    const years = [...new Set(String(url.searchParams.get("years") || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number))];
    if (years.some((y) => !Number.isInteger(y) || y < 1900 || y > +asOf.slice(0, 4))) throw new StatsError("연도 형식이 올바르지 않습니다");
    if (!years.length) years.push(+asOf.slice(0, 4));
    const r = overlay(store, metric, p, years.sort((a, b) => a - b), asOf);
    const columns = [{ key: "md", label: "월-일" }, ...r.series.map((s) => ({ key: `y${s.year}`, label: `${s.year}년 ${r.value.label}(${r.value.unit})` }))];
    const rows = r.keys.map((k, i) => Object.fromEntries([["md", k], ...r.series.map((s) => [`y${s.year}`, s.values[i]])]));
    const table = { columns, rows };
    if (url.searchParams.get("format") === "csv") {
      return sendCsv(res, `weather-stats-overlay-${fileKey(st.station_id)}-${fileKey(p.key)}-${metric}`, table, [
        `누니날씨 날씨 통계 · 날짜별 겹쳐보기 (집계 결과)`,
        `지점 ${stationLabel(st)} · 기간 ${r.period.label} · ${r.value.label}(${r.value.unit}) · 자료 ${asOf}까지 · 출처 ${SOURCE}`,
      ]);
    }
    return json(res, { ok: true, station: { station_id: st.station_id, station_name: st.station_name }, source: SOURCE, timezone: "Asia/Seoul", dataVersion: statsData.version(), ...r, table });
  }

  async function region(url, res) {
    const ids = [...new Set(String(url.searchParams.get("stations") || "").split(",").map((s) => s.trim()).filter(Boolean))];
    if (ids.length < 2 || ids.length > 4) throw new StatsError("관측지점을 2~4곳 고르세요");
    const sts = [];
    for (const id of ids) sts.push(await stationById(id));
    const stores = await Promise.all(sts.map((s) => statsData.get(s.station_id)));
    const asOf = asOfFor(stores);
    if (!asOf || stores.some((s) => !s.n)) throw new StatsError("공식 일자료가 없는 지점이 있습니다", 404);
    const view = url.searchParams.get("view") || "period";
    const { fromYear, toYear } = yearsParam(url, +asOf.slice(0, 4));
    const label = new Map(sts.map((s) => [String(s.station_id), stationLabel(s)]));
    const stationsOut = sts.map((s, i) => ({ station_id: s.station_id, station_name: s.station_name, region: s.region || null, firstDate: stores[i].firstDate, lastDate: stores[i].lastDate }));
    let r;
    let table;
    let meta;
    if (view === "yearly") {
      const p = periodParam(url, asOf);
      const metric = metricParam(url);
      r = regionYearly(stores, metric, p, { fromYear, toYear, asOf });
      table = {
        columns: [{ key: "year", label: "연도" }, ...r.stations.map((s) => ({ key: `s${s.station_id}`, label: `${label.get(s.station_id)} ${r.metric.label}(${r.metric.unit})` })), { key: "common", label: "공통 연도" }],
        rows: r.stations[0].rows.map((row, i) => ({
          year: row.year,
          ...Object.fromEntries(r.stations.map((s) => [`s${s.station_id}`, s.rows[i].value])),
          common: row.common ? "예" : "아니오(" + r.stations.filter((s) => !s.rows[i].common || s.rows[i].status !== "complete").map((s) => `${s.station_id} ${STATUS_KO[s.rows[i].status] || s.rows[i].status}`).join(", ") + ")",
        })),
      };
      meta = [`기간 ${r.period.label} · 항목 ${r.metric.label}(${r.metric.unit}) · 공통 연도 ${r.commonYears.length}개`];
    } else if (view === "monthly") {
      const metric = metricParam(url);
      r = regionMonthly(stores, metric, { fromYear, toYear, asOf });
      table = {
        columns: [{ key: "month", label: "월" }, ...sts.map((s) => ({ key: `s${s.station_id}`, label: `${label.get(String(s.station_id))} ${r.metric.label}(${r.metric.unit})` }))],
        rows: r.months.map((mo) => ({ month: mo.month, ...Object.fromEntries(mo.values.map((v) => [`s${v.station_id}`, v.value])) })),
      };
      meta = [`월별 평균 · 항목 ${r.metric.label}(${r.metric.unit}) · 공통 연도 ${r.commonYears.length}개(${r.commonYears[0] ?? "-"}~${r.commonYears[r.commonYears.length - 1] ?? "-"})`];
    } else if (view === "period") {
      const p = periodParam(url, asOf);
      r = regionPeriod(stores, p, { fromYear, toYear, asOf });
      table = {
        columns: [
          { key: "metric", label: "항목" },
          { key: "unit", label: "단위" },
          { key: "years", label: "공통 연도 수" },
          ...sts.flatMap((s) => [
            { key: `m${s.station_id}`, label: `${label.get(String(s.station_id))} 평균` },
            { key: `d${s.station_id}`, label: `${label.get(String(s.station_id))} 1990년대 대비` },
          ]),
        ],
        rows: r.metrics.map((x) => ({
          metric: x.metric.label,
          unit: x.metric.unit,
          years: x.commonYears.length,
          ...Object.fromEntries(x.stations.flatMap((s) => [[`m${s.station_id}`, s.mean], [`d${s.station_id}`, s.delta.available ? s.delta.delta : ""]])),
        })),
      };
      meta = [`기간 ${r.period.label} · 지표마다 모든 지점에 자료가 온전한 공통 연도의 평균`];
    } else throw new StatsError("보기는 period·monthly·yearly 중 하나입니다");
    if (url.searchParams.get("format") === "csv") {
      return sendCsv(res, `weather-stats-region-${view}-${ids.map(fileKey).join("_")}`, table, [
        `누니날씨 날씨 통계 · 지역별 비교 (${view}) — 집계 결과(원자료 아님)`,
        `지점 ${sts.map(stationLabel).join(", ")} · 연도 ${fromYear}~${toYear} · 자료 ${asOf}까지 · 출처 ${SOURCE}`,
        ...meta,
      ]);
    }
    return json(res, { ok: true, view, source: SOURCE, timezone: "Asia/Seoul", dataVersion: statsData.version(), stationsInfo: stationsOut, ...r, table });
  }

  // 첫 화면 질문 카드: 질문 → 핵심 결과(1990년대 대비 변화) → 연결할 화면
  const CARDS = [
    { id: "warmer", q: "예전보다 더워졌을까?", period: "year", metric: "avg_temp" },
    { id: "may", q: "우리 동네 5월은 얼마나 더워졌을까?", period: "month:5", metric: "avg_temp" },
    { id: "heat", q: "여름 폭염일은 늘었을까?", period: "season:summer", metric: "heatwave_days" },
    { id: "winter", q: "겨울이 덜 추워졌을까?", period: "season:winter", metric: "frost_days" },
    { id: "rainy", q: "비가 더 자주 올까?", period: "year", metric: "rain_days" },
    { id: "heavy", q: "한꺼번에 쏟아지는 비가 늘었을까?", period: "year", metric: "rain50_days" },
    { id: "range", q: "일교차가 커졌을까?", period: "year", metric: "avg_range" },
  ];
  // 생활 속 날씨 첫 목록: 연도별 비교로 답하는 질문(같은 계산, 연결만 다름)
  const LIFE_CARDS = [
    { id: "warm", q: "예전보다 더워졌을까? (연 평균기온)", period: "year", metric: "avg_temp" },
    { id: "warm_max", q: "낮 기온은? (연 최고기온 평균)", period: "year", metric: "avg_max" },
    { id: "warm_min", q: "아침 기온은? (연 최저기온 평균)", period: "year", metric: "avg_min" },
    { id: "winter_frost", q: "겨울이 덜 추워졌을까? (최저기온 0℃ 미만인 날)", period: "season:winter", metric: "frost_days" },
    { id: "winter_ice", q: "하루 종일 영하인 날은? (최고기온 0℃ 미만)", period: "season:winter", metric: "ice_days" },
    { id: "rain_total", q: "비가 더 많이 올까? (연 총강수량)", period: "year", metric: "rain_total" },
    { id: "rain_days", q: "비가 더 자주 올까? (연 강수일수)", period: "year", metric: "rain_days" },
    { id: "rain50", q: "한꺼번에 쏟아지는 비가 늘었을까? (하루 50mm 이상)", period: "year", metric: "rain50_days" },
    { id: "rain_max", q: "가장 많이 온 하루는? (연 하루 최대강수량)", period: "year", metric: "rain_max_day" },
    { id: "range", q: "일교차가 커졌을까? (연 일교차 평균)", period: "year", metric: "avg_range" },
    { id: "snow", q: "눈 쌓이는 날이 줄었을까? (겨울 신적설이 있었던 날)", period: "season:winter", metric: "snow_days" },
  ];
  async function highlights(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const asOfYear = +asOf.slice(0, 4);
    const cards = (url.searchParams.get("set") === "life" ? LIFE_CARDS : CARDS).map((c) => {
      const p = parsePeriod(c.period);
      const m = getMetric(c.metric);
      const d = decadeDelta(m, yearRows(store, m, p, BASELINE.from, asOfYear, asOf));
      return { ...c, periodLabel: periodLabel(p), metricInfo: metricInfo(c.metric), delta: d, text: deltaText(m, d) };
    });
    return json(res, { ok: true, station: { station_id: st.station_id, station_name: st.station_name }, asOf, source: SOURCE, dataVersion: statsData.version(), cards });
  }

  // ---------------------------------------------------------------- 2단계: 생활 속 날씨 · 날씨 기록
  const csvOr = (url, res, name, table, metaLines, body) => (url.searchParams.get("format") === "csv" ? sendCsv(res, name, table, metaLines) : json(res, { ok: true, source: SOURCE, timezone: "Asia/Seoul", dataVersion: statsData.version(), ...body, table }));
  async function dailyCtx(url) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const { fromYear, toYear } = yearsParam(url, +asOf.slice(0, 4));
    return { st, store, asOf, fromYear, toYear, station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null } };
  }
  async function hourlyCtx(url) {
    if (!statsHourly) throw new StatsError("시간자료 통계를 쓸 수 없습니다", 503);
    const st = await stationById(url.searchParams.get("station") || "108");
    const hs = await statsHourly.get(st.station_id);
    if (!hs || hs.lastIdx < 0) throw new StatsError("이 지점에는 시간자료가 없습니다", 404);
    const asOf = officialDate();
    const { fromYear, toYear } = yearsParam(url, +asOf.slice(0, 4));
    return { st, hs, asOf, fromYear, toYear, station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null } };
  }
  const STATUS_TXT = (x) => (x.status === "ongoing" ? `진행 중(${x.until}까지)` : STATUS_KO[x.status] || x.status);
  const head = (kind, st, extra) => [`누니날씨 날씨 통계 · ${kind} (원자료 다운로드가 아닌 집계 결과)`, `지점 ${stationLabel(st)} · ${extra} · 출처 ${SOURCE} · 시간대 Asia/Seoul`];

  async function lifeHeat(url, res) {
    const c = await dailyCtx(url);
    const p = parsePeriod(url.searchParams.get("period") || "year");
    const r = thresholdDates(c.store, "hot30_days", p, c);
    const table = {
      columns: [{ key: "year", label: "연도" }, { key: "first", label: "첫 30℃ 이상" }, { key: "last", label: "마지막 30℃ 이상" }, { key: "count", label: "일수(일)" }, { key: "obs", label: "관측일수" }, { key: "days", label: "구간 일수" }, { key: "status", label: "상태" }],
      rows: r.rows.map((x) => ({ year: x.year, first: x.first || "", last: x.last || "", count: x.count, obs: x.obs, days: x.days, status: x.status === "complete" && !x.first ? "온전(그런 날 없음)" : STATUS_TXT(x) })),
    };
    return csvOr(url, res, `weather-stats-heat-${fileKey(c.st.station_id)}`, table, [...head("더위가 일찍 올까(최고기온 30℃ 이상 첫날·마지막 날)", c.st, `기간 ${r.period.label} · 연도 ${c.fromYear}~${c.toYear} · 자료 ${c.asOf}까지`), ...r.text], { station: c.station, ...r, rules: LIFE_RULES.heat });
  }
  async function lifeStreaks(url, res) {
    const c = await dailyCtx(url);
    const kind = url.searchParams.get("kind") || "wet";
    if (!RUN_KINDS[kind]) throw new StatsError("kind 는 wet·dry 중 하나입니다");
    const p = parsePeriod(url.searchParams.get("period") || "year");
    const r = streaks(c.store, kind, p, c);
    const table = {
      columns: [{ key: "year", label: "연도" }, { key: "len", label: `가장 긴 ${r.kindLabel}(일)` }, { key: "runStart", label: "시작" }, { key: "runEnd", label: "끝" }, { key: "obs", label: "관측일수" }, { key: "days", label: "구간 일수" }, { key: "status", label: "상태" }],
      rows: r.rows.map((x) => ({ year: x.year, len: x.len, runStart: x.status === "complete" ? x.runStart || "" : "", runEnd: x.status === "complete" ? x.runEnd || "" : "", obs: x.obs, days: x.days, status: STATUS_TXT(x) })),
    };
    const lines = [...head(`가장 오래 이어진 때(${r.kindLabel})`, c.st, `기간 ${r.period.label} · 연도 ${c.fromYear}~${c.toYear} · 자료 ${c.asOf}까지`), `보유 기간 최장: ${r.top.map((t) => `${t.rank}위 ${t.len}일(${t.start}~${t.end})`).join(" / ")}`];
    return csvOr(url, res, `weather-stats-streaks-${kind}-${fileKey(c.st.station_id)}`, table, lines, { station: c.station, ...r, rules: LIFE_RULES.streaks });
  }
  async function lifeWeekend(url, res) {
    const c = await dailyCtx(url);
    const p = parsePeriod(url.searchParams.get("period") || "year");
    const r = weekdayShare(c.store, p, c);
    const table = {
      columns: [{ key: "label", label: "요일" }, { key: "valid", label: "유효 관측일" }, { key: "hit", label: "강수일(0.1mm 이상)" }, { key: "share", label: "강수일 비율(%)" }, { key: "missing", label: "자료 없는 날" }],
      rows: [...r.dow.slice(1), r.dow[0]].map((d) => ({ label: d.label, valid: d.valid, hit: d.hit, share: d.share, missing: d.missing })).concat([
        { label: "평일(월~금)", valid: r.weekday.valid, hit: r.weekday.hit, share: r.weekday.share, missing: r.weekday.missing },
        { label: "주말(토·일)", valid: r.weekend.valid, hit: r.weekend.hit, share: r.weekend.share, missing: r.weekend.missing },
      ]),
    };
    return csvOr(url, res, `weather-stats-weekend-${fileKey(c.st.station_id)}`, table, [...head("정말 주말마다 비가 올까", c.st, `기간 ${r.period.label} · 연도 ${c.fromYear}~${c.toYear}`), ...r.text], { station: c.station, ...r, rules: LIFE_RULES.weekend });
  }
  async function lifeDay(url, res) {
    const c = await dailyCtx(url);
    const raw = String(url.searchParams.get("date") || "05-05");
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (!m) throw new StatsError("날짜는 월-일(예: 05-05) 형식입니다");
    const md = `${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
    parsePeriod(`range:${md}:${md}`); // 없는 날짜(4/31 등) 거부
    const r = sameDayHistory(c.store, md, c);
    const table = {
      columns: [{ key: "year", label: "연도" }, { key: "date", label: "날짜" }, { key: "weekday", label: "요일" }, { key: "avg", label: "평균기온(℃)" }, { key: "max", label: "최고기온(℃)" }, { key: "min", label: "최저기온(℃)" }, { key: "rain", label: "강수량(mm)" }, { key: "rainy", label: "강수(0.1mm 이상)" }, { key: "status", label: "상태" }],
      rows: r.rows.filter((x) => x.status !== "nodate").map((x) => ({ year: x.year, date: x.date || "", weekday: x.weekday || "", avg: x.avg ?? null, max: x.max ?? null, min: x.min ?? null, rain: x.rain ?? null, rainy: x.rainy == null ? "" : x.rainy ? "예" : "아니오", status: x.status === "ok" ? (x.rainBlank ? "자료 있음(강수 공란=무강수)" : "자료 있음") : STATUS_KO[x.status] || x.status })),
    };
    return csvOr(url, res, `weather-stats-day-${fileKey(c.st.station_id)}-${md}`, table, [...head(`매년 ${r.label}의 날씨`, c.st, `연도 ${c.fromYear}~${c.toYear} · 자료 ${c.asOf}까지`), ...r.text], { station: c.station, ...r, rules: LIFE_RULES.day });
  }
  async function lifeOutdoor(url, res) {
    const cond = parseOutdoor(Object.fromEntries(url.searchParams));
    const c = await hourlyCtx(url);
    const r = outdoorShare(c.hs, cond, c);
    const table = {
      columns: [{ key: "month", label: "월" }, { key: "share", label: "조건 만족 비율(%)" }, { key: "ok", label: "만족 시각" }, { key: "valid", label: "판정 시각" }, { key: "excluded", label: "자료 없어 뺀 시각" }, { key: "base", label: `${r.eras.base.from}~${r.eras.base.to}년 비율(%)` }, { key: "recent", label: r.eras.recent ? `${r.eras.recent.from}~${r.eras.recent.to}년 비율(%)` : "최근 10년 비율(%)" }],
      rows: r.months.map((m, i) => ({ month: m.month, share: m.share, ok: m.ok, valid: m.valid, excluded: m.excluded, base: r.eraMonths.base[i].share, recent: r.eraMonths.recent[i].share })),
    };
    return csvOr(url, res, `weather-stats-outdoor-${fileKey(c.st.station_id)}`, table, [...head("산책·러닝하기 좋은 시기(시간자료 집계, 사용자 조건)", c.st, `조건 ${r.condLabel} · 연도 ${c.fromYear}~${c.toYear} · 자료 ${r.asOf}까지`), ...r.text], { station: c.station, ...r, hourly: true, rules: LIFE_RULES.outdoor });
  }
  async function lifeCommute(url, res) {
    const am = parseHours(url.searchParams.get("am"), [7, 9]);
    const pm = parseHours(url.searchParams.get("pm"), [17, 19]);
    const weekdays = url.searchParams.get("weekdays") !== "0";
    const c = await hourlyCtx(url);
    const r = commuteShare(c.hs, { am, pm, weekdays }, c);
    const w = r.windows;
    const table = {
      columns: [
        { key: "month", label: "월" },
        { key: "amH", label: `출근 ${am[0]}~${am[1]}시 강수 시각 비율(%)` },
        { key: "pmH", label: `퇴근 ${pm[0]}~${pm[1]}시 강수 시각 비율(%)` },
        { key: "allH", label: "하루 전체 강수 시각 비율(%)" },
        { key: "amD", label: "출근 시간대 강수 관측 날 비율(%)" },
        { key: "pmD", label: "퇴근 시간대 강수 관측 날 비율(%)" },
        { key: "amV", label: "출근 판정 시각" },
        { key: "pmV", label: "퇴근 판정 시각" },
      ],
      rows: w.am.months.map((m, i) => ({ month: m.month, amH: m.hShare, pmH: w.pm.months[i].hShare, allH: w.all.months[i].hShare, amD: m.dShare, pmD: w.pm.months[i].dShare, amV: m.hValid, pmV: w.pm.months[i].hValid })),
    };
    return csvOr(url, res, `weather-stats-commute-${fileKey(c.st.station_id)}`, table, [...head("출퇴근 시간에 강수가 잦을까(시간자료 집계)", c.st, `${weekdays ? "평일" : "모든 날"} · 연도 ${c.fromYear}~${c.toYear} · 자료 ${r.asOf}까지`), ...r.text], { station: c.station, ...r, hourly: true, rules: LIFE_RULES.commute });
  }
  async function lifeTropical(url, res) {
    const p = parsePeriod(url.searchParams.get("period") || "range:06-01:09-30");
    const c = await hourlyCtx(url);
    const r = tropicalNights(c.hs, p, c);
    const table = {
      columns: [{ key: "year", label: "연도" }, { key: "value", label: "열대야 추정(일)" }, { key: "countValid", label: "판정한 밤 중 25℃ 이상" }, { key: "obs", label: "판정한 밤" }, { key: "days", label: "구간 밤 수" }, { key: "warm", label: "가장 더운 밤(정시 최저)" }, { key: "status", label: "상태" }],
      rows: r.rows.map((x) => ({ year: x.year, value: x.value, countValid: x.countValid ?? null, obs: x.obs ?? 0, days: x.days ?? 0, warm: x.warmestNight ? `${x.warmestNight.date} ${x.warmestNight.min}℃` : "", status: STATUS_TXT(x) })),
    };
    return csvOr(url, res, `weather-stats-tropical-${fileKey(c.st.station_id)}`, table, [...head("열대야(추정, 시간자료 집계)", c.st, `기간 ${r.period.label} · 연도 ${c.fromYear}~${c.toYear} · 자료 ${r.asOf}까지`), ...r.text], { station: c.station, ...r, hourly: true, rules: LIFE_RULES.tropical });
  }
  async function recordsApi(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const pr = url.searchParams.get("period") || "all";
    const p = pr === "all" ? null : parsePeriod(pr);
    const n = Math.min(20, Math.max(3, Number(url.searchParams.get("n")) || 10));
    const r = records(store, p, { asOf, n });
    const table = {
      columns: [{ key: "record", label: "기록" }, { key: "rank", label: "순위" }, { key: "value", label: "값" }, { key: "unit", label: "단위" }, { key: "date", label: "날짜" }],
      rows: r.lists.flatMap((l) => l.items.map((x) => ({ record: l.label, rank: x.rank, value: x.value, unit: l.unit, date: x.date }))),
    };
    return csvOr(url, res, `weather-stats-records-${fileKey(st.station_id)}-${fileKey(pr)}`, table, head("날씨 기록(보유 관측기간 순위)", st, `기간 ${r.period.label} · ${r.from}~${r.to}`), { station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null }, ...r, rules: LIFE_RULES.records });
  }
  const DATE_FIELDS = [
    ["avg_temperature", "평균기온", "℃"], ["max_temperature", "최고기온", "℃"], ["max_temperature_time", "최고기온 시각", ""], ["min_temperature", "최저기온", "℃"], ["min_temperature_time", "최저기온 시각", ""],
    ["precipitation", "일강수량", "mm"], ["precip_duration", "강수 계속시간", "시간"], ["max_precip_1h", "1시간 최다강수량", "mm"], ["avg_humidity", "평균 상대습도", "%"], ["min_humidity", "최소 상대습도", "%"],
    ["avg_wind_speed", "평균 풍속", "m/s"], ["max_wind_speed", "최대 풍속", "m/s"], ["max_inst_wind_speed", "최대 순간 풍속", "m/s"], ["sunshine", "합계 일조시간", "hr"], ["avg_total_cloud", "평균 전운량", "1/10"],
    ["max_new_snow", "일 최심신적설", "cm"], ["max_snow_depth", "일 최심적설", "cm"], ["weather_phenomena", "일기현상", ""],
  ];
  async function dateApi(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const date = String(url.searchParams.get("date") || "");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > daysInMonth(+m[1], +m[2])) throw new StatsError("날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다");
    if (!dayRow) throw new StatsError("이 저장소에서는 날짜 조회를 쓸 수 없습니다", 503);
    const row = await dayRow(st.station_id, date);
    const fields = DATE_FIELDS.map(([k, label, unit]) => {
      let v = row ? row[k] : null;
      if (v !== null && v !== undefined && v !== "" && unit && k !== "max_temperature_time" && k !== "min_temperature_time") v = Number.isFinite(Number(v)) ? Number(v) : v;
      let note = "";
      if (row && (v === null || v === undefined || v === "")) {
        if (k === "precipitation") note = "공란(기상청 일자료 관례상 무강수)";
        else if (k === "max_new_snow" || k === "max_snow_depth") note = "공란(쌓인 눈 없음)";
        else if (k === "max_precip_1h") note = "공란(무강수 또는 4~10월 외 미제공)";
        else if (k === "precip_duration") note = row.precipitation === null || row.precipitation === undefined ? "공란(무강수)" : "자료 없음";
        else if (k === "weather_phenomena") note = "기록 없음";
        else note = "자료 없음";
      }
      if ((k === "max_temperature_time" || k === "min_temperature_time") && v) v = String(v).padStart(4, "0").replace(/^(\d\d)(\d\d)$/, "$1:$2");
      return { key: k, label, unit, value: v === undefined || v === "" ? null : v, note };
    });
    const table = { columns: [{ key: "label", label: "항목" }, { key: "value", label: "값" }, { key: "unit", label: "단위" }, { key: "note", label: "비고" }], rows: fields.map((f) => ({ label: f.label, value: f.value, unit: f.unit, note: f.note })) };
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T00:00:00Z`).getUTCDay()];
    return csvOr(url, res, `weather-stats-date-${fileKey(st.station_id)}-${date}`, table, head(`그날의 날씨 ${date}`, st, `공식 일자료 한 행`), { station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null }, date, weekday: wd, found: !!row, fields, rules: ["기상청 ASOS 공식 일자료 그대로입니다(관측지점 한 곳의 값).", "일강수량·적설이 비어 있으면 기상청 일자료 관례대로 무강수·쌓인 눈 없음으로 읽습니다. 그날 일자료 행이 없으면 '자료 없음'입니다."] });
  }

  async function meta(url, res) {
    const list = (await stations()).filter((s) => s.enabled !== false && s.enabled !== 0);
    const stores = await Promise.all(list.map((s) => statsData.get(s.station_id).catch(() => null)));
    const asOf = asOfFor(stores.filter(Boolean));
    return json(res, {
      ok: true,
      timezone: "Asia/Seoul",
      source: SOURCE,
      asOf,
      officialDate: officialDate(),
      dataVersion: statsData.version(),
      stations: list.map((s, i) => ({ station_id: s.station_id, station_name: s.station_name, region: s.region || null, firstDate: stores[i]?.firstDate || null, lastDate: stores[i]?.lastDate || null, days: stores[i]?.rows || 0 })),
      metrics: METRIC_ORDER.map(metricInfo),
      regionPeriodMetrics: REGION_PERIOD_METRICS,
      seasons: Object.entries(SEASONS).map(([id, s]) => ({ id, label: s.label, months: s.months })),
      weeks: WEEKS.map(([a, b], i) => ({ week: i + 1, from: a, to: b === 31 ? "말일" : b })),
      baseline: BASELINE,
      recent: RECENT,
      rules: RULES,
      lifeRules: LIFE_RULES,
      outdoorDefault: OUTDOOR_DEFAULT,
      records: RECORDS.map((r) => ({ id: r.id, label: r.label, unit: r.unit })),
      hourlyLoaded: statsHourly ? list.map((s) => statsHourly.isLoaded(s.station_id)) : null,
    });
  }

  const ROUTES = {
    "/api/stats/meta": meta, "/api/stats/yearly": yearly, "/api/stats/overlay": overlayApi, "/api/stats/region": region, "/api/stats/highlights": highlights,
    "/api/stats/life/heat": lifeHeat, "/api/stats/life/streaks": lifeStreaks, "/api/stats/life/weekend": lifeWeekend, "/api/stats/life/day": lifeDay,
    "/api/stats/life/outdoor": lifeOutdoor, "/api/stats/life/commute": lifeCommute, "/api/stats/life/tropical": lifeTropical,
    "/api/stats/records": recordsApi, "/api/stats/date": dateApi,
  };
  return async function handleStats(req, res, url) {
    const fn = ROUTES[url.pathname];
    if (!fn) return false;
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, { ok: false, message: "GET 만 지원합니다" }, 405);
      return true;
    }
    const t0 = Date.now();
    try {
      await fn(url, res);
    } catch (err) {
      if (err instanceof StatsError) json(res, { ok: false, message: err.message }, err.status);
      else throw err;
    } finally {
      const ms = Date.now() - t0;
      if (ms > 2000) console.log(`stats slow ${url.pathname} ${ms}ms`);
    }
    return true;
  };
}
