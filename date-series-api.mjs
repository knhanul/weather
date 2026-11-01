// 특정일 · 해마다 실제 날짜 시계열 API: GET /api/stats/date-series
// 왜 새로 만들었나: '날짜로 보는 날씨'는 고른 '월·일'을 해마다 고정한다. 수능일·학력고사일처럼 해마다 양력 날짜가 바뀌는 날은
// 그 해 '실제 시행일'의 날씨를 봐야 하는데, 고정 월·일로는 원리적으로 맞출 수 없다(예: 2024학년도 수능은 11/16 인데 화면은 11/13을 봤다).
// 설날·추석은 음력 규칙(year=null)이라 '그해 음력 날짜의 양력 날짜'를 따라가므로 이 API 로도 같은 결과가 나온다.
//
// 계산은 새로 만들지 않는다:
//  - 특정일 날짜 = calendar-events.mjs resolveAll() 이 해석한 양력 날짜(음력 → 양력은 calendar-resolver.mjs 하나)
//  - 값 = date-weather-engine.mjs dailyYear()  (그해 그 하루 · 주변 날짜를 섞지 않음 · 행이 없으면 대체하지 않고 null)
//  - 요약 = date-weather-engine.mjs summarize()
// 기존 엔드포인트(/api/stats/date-weather 등)의 응답은 건드리지 않는다(새 경로만).
import crypto from "node:crypto";
import { StatsError, unknownStationMsg, toCsv } from "./stats-engine.mjs";
import { CALENDAR_VERSION, LUNAR_RANGE, solarToLunar, ymdStr } from "./calendar-resolver.mjs";
import { dailyYear, summarize, POLICY_VERSION, SAMPLE_POLICY, DAILY_FROM, HOURLY_FROM, STATUS_TEXT } from "./date-weather-engine.mjs";
import { CALENDAR_KINDS, YEAR_MIN, YEAR_MAX, kindOf, resolveAll } from "./calendar-events.mjs";

export const DATE_SERIES_VERSION = "date-series.2026-11-01.v1";
export const DATE_SERIES_PATH = "/api/stats/date-series";
const SOURCE = "기상청 ASOS 공식 일자료(관측지점 한 곳)";
const KIND_IDS = CALENDAR_KINDS.map((k) => k.id); // csat | hakryeok | holiday | custom
const KIND_SET = new Set(KIND_IDS);
const KIND_LABEL = Object.fromEntries(CALENDAR_KINDS.map((k) => [k.id, k.label]));
const MAX_SPAN = 131; // 1900~2050 전체를 한 번에 봐도 되게(음력 변환표 범위와 같음)

export const kstToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
// CSV 칸: 수식으로 읽히지 않게(=,+,-,@ 로 시작하는 사용자 입력) 앞에 ' — 숫자는 그대로
const safeText = (s) => { const t = String(s ?? "").slice(0, 60).replace(/[\r\n]/g, " "); return /^[=+\-@\t]/.test(t) ? `'${t}` : t; };
const uniq = (a) => [...new Set(a)];
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// 종류·이름으로 화면 제목의 앞말을 만든다('수능일'·'학력고사일'·'추석'·'명절·기념일').
export function seriesName(kind, label) {
  if (label) return String(label);
  if (kind === "csat") return "수능일";
  if (kind === "hakryeok") return "학력고사일";
  if (kind === "holiday") return "명절·기념일";
  return "직접 추가한 날";
}

// ---------------------------------------------------------------- 계산(순수 함수 — HTTP·캐시 모름)
// events(원본 행) 또는 resolved(resolveAll 결과) 중 하나를 받는다. 테스트는 events 로, 서버는 캐시 키(지문)를 먼저 만들려고 resolved 로 부른다.
// ctx: date-api.mjs 의 ctxFor() 와 같은 모양 { today, dailyFrom, dailyLast, hourlyFrom, hourlyLast }
export function seriesOf({ events = null, resolved = null, store, ctx, kind = "csat", label = null, fromYear, toYear }) {
  const k = KIND_SET.has(kind) ? kind : "csat";
  const lab = label ? String(label) : null;
  const list = resolved || resolveAll((events || []).filter((e) => kindOf(e.kind) === k && (!lab || e.label === lab)), fromYear, toYear);
  // resolveAll 이 양력 날짜 오름차순으로 주지만, 직접 넘겨받은 목록도 같은 순서로 맞춘다(같은 날은 이름 순 — resolveAll 과 같은 규칙)
  const evs = list.slice().sort((a, b) => (a.solarDate === b.solarDate ? String(a.label).localeCompare(String(b.label), "ko") : a.solarDate < b.solarDate ? -1 : 1));

  const points = evs.map((e) => {
    const solarDate = e.solarDate;
    const l = solarToLunar(solarDate);
    // dailyYear 가 기대하는 res 모양(resolveYear 결과와 같음): 기준연도 = 양력 날짜의 해
    const res = {
      referenceYear: e.year,
      status: "ok",
      solarDate,
      lunarDate: l.status === "ok" ? ymdStr(l.year, l.month, l.day) : null,
      isLeapMonth: l.status === "ok" ? l.leap : false,
      lunarText: e.lunarText || (l.status === "ok" ? l.text : null),
    };
    const d = dailyYear(store, res, ctx);
    return {
      eventId: e.id ?? null,
      kind: e.kind ?? k,
      label: e.label ?? null,
      yearLabel: e.yearLabel ?? null,
      note: e.note ?? null,
      oneOff: !!e.oneOff,
      year: e.year, // 양력 날짜의 해
      solarDate,
      lunarDate: d.lunarDate,
      lunarText: d.lunarText,
      isLeapMonth: !!d.isLeapMonth,
      dateStatus: d.dateStatus,
      rowPresent: d.rowPresent,
      values: d.values,
      fieldStatus: d.fieldStatus,
      rainNorm: d.rainNorm,
    };
  });

  // 지표 하나의 표본: 날짜 상태가 아니면 그 사유, 행이 없으면 'missing' — summarize 가 그대로 세게 한다
  const itemsOf = (pts, f) => pts.map((p) => ({ year: p.year, status: p.dateStatus !== "ok" ? p.dateStatus : p.values?.[f] != null ? "ok" : p.fieldStatus?.[f] || "missing", value: p.values?.[f] ?? null }));
  const summarizeOf = (pts, f, digits = 1) => {
    const s = summarize(itemsOf(pts, f), { digits });
    // 같은 해에 두 번 시행한 날(1994학년도 수능 1·2차, 학력고사 전기·후기)은 연도가 겹친다 → 연도 목록만 중복을 지운다(값·횟수는 점마다 셈)
    return {
      ...s,
      candidateYears: uniq(s.candidateYears),
      validYears: uniq(s.validYears),
      maxYears: uniq(s.maxYears),
      minYears: uniq(s.minYears),
      excludedYearsByReason: Object.fromEntries(Object.entries(s.excludedYearsByReason).map(([a, b]) => [a, uniq(b)])),
    };
  };

  const max = summarizeOf(points, "max");
  const min = summarizeOf(points, "min");
  const avg = summarizeOf(points, "avg");
  const rain = summarizeOf(points, "rain");

  const rainItems = itemsOf(points, "rain");
  const rainyIdx = points.map((p, i) => i).filter((i) => rainItems[i].status === "ok" && rainItems[i].value != null && rainItems[i].value >= 0.1);
  const rainN = rainItems.filter((x) => x.status === "ok" && x.value != null).length;
  const rainCount = { k: rainyIdx.length, n: rainN, share: rainN ? (rainyIdx.length / rainN) * 100 : null, hitYears: uniq(rainyIdx.map((i) => points[i].year)) };

  // 극값: 요약의 최대·최솟값을 낸 점 하나(표시 자리수로 같으면 첫 점). 공동 연도는 years 로 함께 남긴다.
  const pickPoint = (field, summary, which) => {
    const s = summary;
    const v = which === "max" ? s.max : s.min;
    if (v == null || !s.n) return { field, value: null, label: null, yearLabel: null, solarDate: null, year: null, years: [], tie: false };
    const rv = (x) => Math.round(x * 10);
    const hit = points.find((p) => p.values?.[field] != null && rv(p.values[field]) === rv(v)) || null;
    const years = which === "max" ? s.maxYears : s.minYears;
    return { field, value: v, label: hit?.label ?? null, yearLabel: hit?.yearLabel ?? null, solarDate: hit?.solarDate ?? null, year: hit?.year ?? null, years, tie: years.length > 1 };
  };
  const hottest = pickPoint("max", max, "max");
  const coldest = pickPoint("min", min, "min");
  const wettest0 = pickPoint("rain", rain, "max");
  const wettest = wettest0.value != null && wettest0.value >= 0.1 ? wettest0 : { field: "rain", value: null, label: null, yearLabel: null, solarDate: null, year: null, years: [], tie: false };

  // 자료가 없어 요약에서 뺀 점(사유 포함) — 0 으로 세지 않는다는 것을 화면·CSV 에 그대로 보여 준다
  const hasData = (p) => p.dateStatus === "ok" && p.rowPresent && [p.values?.max, p.values?.min, p.values?.avg, p.values?.rain].some((v) => v != null);
  const excluded = points
    .filter((p) => p.dateStatus !== "ok" || !hasData(p))
    .map((p) => {
      const reason = p.dateStatus !== "ok" ? p.dateStatus : "missing";
      return { year: p.year, yearLabel: p.yearLabel, label: p.label, solarDate: p.solarDate, dateStatus: p.dateStatus, reason, reasonText: STATUS_TEXT[reason] || reason };
    });

  // 최근 10년(요청 창의 끝 10년) — 창 안에 점이 없으면 mean 은 null(화면이 '해당 없음'으로 쓴다)
  const recentFrom = Math.max(fromYear, toYear - 9);
  const recentPts = points.filter((p) => p.year >= recentFrom && p.year <= toYear);
  const recent = (f) => { const s = summarizeOf(recentPts, f); return { mean: s.mean, n: s.n, eligible: s.eligible, min: s.min, max: s.max }; };
  const recentRainItems = itemsOf(recentPts, "rain");
  const rN = recentRainItems.filter((x) => x.status === "ok" && x.value != null).length;
  const rK = recentRainItems.filter((x) => x.status === "ok" && x.value != null && x.value >= 0.1).length;
  const full10 = toYear - recentFrom >= 9;
  const recent10 = { fromYear: recentFrom, toYear, label: full10 ? `최근 10년(${recentFrom}~${toYear})` : `이 기간(${recentFrom}~${toYear})`, full10, points: recentPts.length, max: recent("max"), min: recent("min"), avg: recent("avg"), rain: recent("rain"), rainCount: { k: rK, n: rN, share: rN ? (rK / rN) * 100 : null } };

  // 창 안에서 이 특정일이 아예 없던 해(예: 수능 이전 학년도)
  const haveYears = new Set(points.map((p) => p.year));
  const missingYears = [];
  for (let y = fromYear; y <= toYear; y++) if (!haveYears.has(y)) missingYears.push(y);

  const dataFrom = points.length ? points[0].year : null;
  const dataTo = points.length ? points[points.length - 1].year : null;
  const name = seriesName(k, lab);
  // 제목의 기간 = 요청 창(양력 연도 기준). 실제 자료가 있는 범위는 window.dataFrom·dataTo 로 따로 준다
  // (수능은 1994학년도 1차가 1993-08-20 이라 창보다 앞설 수 있다 — 화면은 창을 제목에, 자료 범위를 따로 적는다).
  const title = `${name} 날씨 — ${fromYear}~${toYear}년`;
  const yl = points.map((p) => p.yearLabel).filter(Boolean);
  const yearLabelRange = yl.length >= 2 ? `${yl[0]}~${yl[yl.length - 1]}` : yl.length === 1 ? yl[0] : null;

  return {
    points,
    missingYears,
    series: {
      kind: k,
      kindLabel: KIND_LABEL[k] || "",
      label: lab,
      name,
      title,
      yearLabelFrom: yl.length ? yl[0] : null,
      yearLabelTo: yl.length ? yl[yl.length - 1] : null,
      yearLabelRange,
      version: DATE_SERIES_VERSION,
      counts: { points: points.length, withData: points.filter(hasData).length, missing: missingYears.length, rain: rainCount.k },
    },
    window: { fromYear, toYear, label: `${fromYear}~${toYear}년`, points: points.length, dataFrom, dataTo },
    summary: { max, min, avg, rain, rainCount, extremes: { hottest, coldest, wettest }, excluded, recent10 },
  };
}

// ---------------------------------------------------------------- HTTP
export function createDateSeriesApi({ statsData, calendarStore, stations, json, today = () => kstToday(), cacheSize = 120, log = () => {} }) {
  // date-api.mjs 와 같은 문자열 캐시(응답 JSON 통째로 기억) — 키에 판 번호·오늘 날짜·특정일 목록 지문을 넣어 자료·표·날짜가 바뀌면 저절로 새로 계산
  const cache = new Map();
  let bytes = 0;
  const MAX_BYTES = 4 * 1024 * 1024;
  const remember = (k, v) => {
    if (cache.has(k)) bytes -= cache.get(k).length;
    cache.set(k, v); bytes += v.length;
    while ((bytes > MAX_BYTES || cache.size > cacheSize) && cache.size > 1) { const [k0, v0] = cache.entries().next().value; cache.delete(k0); bytes -= v0.length; }
    return v;
  };
  const recall = (k) => {
    if (!cache.has(k)) return undefined;
    const v = cache.get(k); cache.delete(k); cache.set(k, v); return v;
  };
  async function stationById(id) {
    const list = await stations();
    const st = list.find((s) => String(s.station_id) === String(id ?? "").trim());
    if (!st) throw new StatsError(unknownStationMsg(id));
    return st;
  }
  function kindParam(q) {
    const raw = String(q.get("kind") ?? "").trim() || "csat";
    if (!KIND_SET.has(raw)) throw new StatsError("특정일 종류(kind)는 csat·hakryeok·holiday·custom 중 하나입니다");
    return raw;
  }
  const labelParam = (q) => { const s = String(q.get("label") ?? "").trim().slice(0, 120); return s || null; };
  function rangeParam(q, thisYear) {
    const f = q.get("from"), t = q.get("to");
    const fromYear = f == null || f === "" ? 1990 : Number(f);
    const toYear = t == null || t === "" ? thisYear : Number(t);
    if (!Number.isInteger(fromYear) || fromYear < YEAR_MIN || fromYear > YEAR_MAX) throw new StatsError(`시작 연도(from)는 ${YEAR_MIN}~${YEAR_MAX} 사이 숫자입니다`);
    if (!Number.isInteger(toYear) || toYear < YEAR_MIN || toYear > YEAR_MAX) throw new StatsError(`끝 연도(to)는 ${YEAR_MIN}~${YEAR_MAX} 사이 숫자입니다`);
    if (fromYear > toYear) throw new StatsError("시작 연도(from)는 끝 연도(to)보다 앞이어야 합니다");
    if (toYear - fromYear > MAX_SPAN) throw new StatsError(`기간은 ${MAX_SPAN + 1}년 이내로 고르세요`);
    return { fromYear, toYear };
  }
  const policy = () => ({ policyVersion: POLICY_VERSION, calendarVersion: CALENDAR_VERSION, sample: SAMPLE_POLICY, dailyFrom: DAILY_FROM, hourlyFrom: HOURLY_FROM, lunarRange: LUNAR_RANGE, statusText: STATUS_TEXT });
  const sendJson = (res, body) => { res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(body); };
  const sendCsv = (res, name, table, meta) => {
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" });
    res.end(toCsv(table, meta));
  };

  async function seriesResult(q, { csv = false } = {}) {
    const st = await stationById(q.get("stn") || q.get("station") || "108");
    const kind = kindParam(q);
    const label = labelParam(q);
    const t = today();
    const thisYear = +t.slice(0, 4);
    const { fromYear, toYear } = rangeParam(q, thisYear);
    if (!calendarStore) throw new StatsError("특정일 저장소를 쓸 수 없습니다", 503);
    const all = await calendarStore.list();
    const picked = all.filter((e) => e.kind === kind && (!label || e.label === label));
    const resolved = resolveAll(picked, fromYear, toYear);
    const store = await statsData.get(st.station_id);
    if (!store.n) throw new StatsError("이 지점에는 공식 일자료가 없습니다", 404);
    const ctx = { today: t, dailyFrom: store.firstDate && store.firstDate > DAILY_FROM ? store.firstDate : DAILY_FROM, dailyLast: store.lastDate || null, hourlyFrom: HOURLY_FROM, hourlyLast: null };
    // 특정일 표(관리 화면에서 고칠 수 있다)가 바뀌면 캐시가 저절로 빗나가게 목록 지문을 키에 넣는다
    const fp = crypto.createHash("sha1").update(resolved.map((e) => `${e.id}|${e.solarDate}`).join(",")).digest("base64url").slice(0, 10);
    const key = ["ds", st.station_id, kind, label || "", fromYear, toYear, CALENDAR_VERSION, POLICY_VERSION, DATE_SERIES_VERSION, statsData.version(), store.lastDate, fp, t].join("|");
    const hit = recall(key);
    if (hit && !csv) return { str: hit };
    const core = seriesOf({ resolved, store, ctx, kind, label, fromYear, toYear });
    const body = {
      ok: true, source: SOURCE, timezone: "Asia/Seoul", today: t,
      station: { station_id: st.station_id, station_name: st.station_name, region: st.region || null, dailyFirst: store.firstDate || null, dailyLast: store.lastDate || null },
      ...core,
      // 기존 날짜 API(/api/stats/date-weather)와 같은 키: policyVersion·calendarVersion·sample·lunarRange·statusText·dataRevision
      ...policy(),
      dataRevision: { daily: statsData.version(), dailyLast: store.lastDate },
    };
    if (csv) return { body, st, kind, label, fromYear, toYear };
    return { str: remember(key, JSON.stringify(body)) };
  }

  async function seriesApi(url, res) {
    const csv = url.searchParams.get("format") === "csv";
    const r = await seriesResult(url.searchParams, { csv });
    if (csv) return seriesCsv(res, r);
    return sendJson(res, r.str);
  }
  // CSV: 점 한 줄씩(최근 해부터가 아니라 시간 순 — 날짜가 밀리는 흐름을 위에서 아래로 읽기 쉽게)
  function seriesCsv(res, { body: b, st, kind, label, fromYear, toYear }) {
    const num = (v, d = 1) => (v == null ? "" : +v.toFixed(d));
    const columns = [
      { key: "y", label: "연도" },
      { key: "yl", label: "학년도" },
      { key: "solar", label: "실제 양력 날짜" },
      { key: "lunar", label: "음력" },
      { key: "max", label: "최고기온(℃)" },
      { key: "min", label: "최저기온(℃)" },
      { key: "avg", label: "평균기온(℃)" },
      { key: "rain", label: "강수량(mm)" },
      { key: "nsnow", label: "신적설(cm)" },
      { key: "status", label: "상태" },
      { key: "name", label: "이름" },
    ];
    const rows = b.points.map((p) => ({
      y: p.year, yl: p.yearLabel || "", solar: p.solarDate || "", lunar: p.lunarText || "",
      max: p.dateStatus === "ok" ? num(p.values.max) : "", min: p.dateStatus === "ok" ? num(p.values.min) : "", avg: p.dateStatus === "ok" ? num(p.values.avg) : "",
      rain: p.dateStatus === "ok" ? num(p.values.rain) : "", nsnow: p.dateStatus === "ok" ? num(p.values.nsnow) : "",
      status: p.dateStatus === "ok" && !p.rowPresent ? "자료 없음" : STATUS_TEXT[p.dateStatus] || p.dateStatus,
      name: safeText(p.label),
    }));
    const S = b.summary;
    const f = (s, d = 1) => (s.n ? `평균 ${s.mean.toFixed(d)} · 최소 ${s.min.toFixed(d)} · 최대 ${s.max.toFixed(d)} · ${s.n}개 점` : "자료 없음");
    const ex = (x, unit) => (x.value == null ? "자료 없음" : `${x.label || ""} ${x.solarDate || ""} ${x.value.toFixed(1)}${unit}${x.tie ? ` (공동 ${x.years.join("·")})` : ""}`);
    const meta = [
      "특정일 · 해마다 실제 날짜 (집계 결과 — 원자료 다운로드 아님)",
      `지점 ${st.station_id} ${st.station_name || ""} · ${b.series.title} · 실제 시행일 기준 · 오늘 ${b.today}(Asia/Seoul) · 출처 ${SOURCE}`,
      `화면 ${DATE_SERIES_VERSION} · 정책 ${POLICY_VERSION} · 달력 ${CALENDAR_VERSION} · 일자료 ${DAILY_FROM.slice(0, 4)}~`,
      "해마다 그해 실제 날짜 하루의 공식 일자료(같은 날 평균 없음). 그해 행이 없으면 빈칸(다른 날로 대체하지 않음).",
      `최고기온 ${f(S.max)} / 최저기온 ${f(S.min)} / 평균기온 ${f(S.avg)} / 일강수량 ${f(S.rain)}`,
      `비·눈 온 해 ${S.rainCount.k}번 / 강수 자료가 있는 ${S.rainCount.n}개 점${S.rainCount.share == null ? "" : ` (${S.rainCount.share.toFixed(1)}%)`}`,
      `가장 더웠던 해 ${ex(S.extremes.hottest, "℃")} · 가장 추웠던 해 ${ex(S.extremes.coldest, "℃")} · 강수가 가장 많았던 해 ${ex(S.extremes.wettest, "mm")}`,
      `${S.recent10.label} ${S.recent10.points}개 점 · 최고 ${S.recent10.max.mean == null ? "-" : S.recent10.max.mean.toFixed(1)}℃ · 최저 ${S.recent10.min.mean == null ? "-" : S.recent10.min.mean.toFixed(1)}℃`,
      b.missingYears.length ? `이 기간에 이 특정일이 없던 해: ${b.missingYears.join(" ")}` : "이 기간에 이 특정일이 없던 해 없음",
      ...(S.excluded.length ? [`자료가 없어 요약에서 뺀 점: ${S.excluded.map((x) => `${x.year}(${x.reasonText})`).join(", ")}`] : []),
    ];
    return sendCsv(res, `inal-date-series-${st.station_id}-${kind}-${fromYear}-${toYear}`, { columns, rows }, meta);
  }

  const handle = async function handleDateSeries(req, res, url) {
    if (url.pathname !== DATE_SERIES_PATH) return false;
    if (req.method !== "GET" && req.method !== "HEAD") { json(res, { ok: false, message: "GET 만 지원합니다" }, 405); return true; }
    const t0 = Date.now();
    try { await seriesApi(url, res); }
    catch (err) { if (err instanceof StatsError) json(res, { ok: false, message: err.message }, err.status); else throw err; }
    finally { const ms = Date.now() - t0; if (ms > 2000) log(`date-series slow ${url.search} ${ms}ms`); }
    return true;
  };
  return handle;
}
