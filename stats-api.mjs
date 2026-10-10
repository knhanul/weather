// 날씨 통계 API (/api/stats/*). 공개 조회 API(/api/series·/api/daily)와 같은 접근 정책: GET 만, 로그인 없이 조회 가능
// (auth.guard 가 관리자 전용으로 막는 경로는 /api/gaps·/api/jobs·/api/admin/* 뿐). 계산은 모두 stats-engine.mjs.
import {
  StatsError, parsePeriod, periodLabel, getMetric, metricInfo, METRIC_ORDER, SEASONS, WEEKS, RULES, BASELINE, RECENT,
  yearlyCompare, overlay, regionYearly, regionPeriod, regionMonthly, REGION_PERIOD_METRICS, toCsv, deltaText, yearRows, decadeDelta, daysInMonth,
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

export function createStatsApi({ statsData, stations, officialDate, json }) {
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
  async function highlights(url, res) {
    const st = await stationById(url.searchParams.get("station") || "108");
    const store = await statsData.get(st.station_id);
    const asOf = asOfFor([store]);
    if (!asOf || !store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const asOfYear = +asOf.slice(0, 4);
    const cards = CARDS.map((c) => {
      const p = parsePeriod(c.period);
      const m = getMetric(c.metric);
      const d = decadeDelta(m, yearRows(store, m, p, BASELINE.from, asOfYear, asOf));
      return { ...c, periodLabel: periodLabel(p), metricInfo: metricInfo(c.metric), delta: d, text: deltaText(m, d) };
    });
    return json(res, { ok: true, station: { station_id: st.station_id, station_name: st.station_name }, asOf, source: SOURCE, dataVersion: statsData.version(), cards });
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
    });
  }

  const ROUTES = { "/api/stats/meta": meta, "/api/stats/yearly": yearly, "/api/stats/overlay": overlayApi, "/api/stats/region": region, "/api/stats/highlights": highlights };
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
