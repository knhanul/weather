// 날씨 이야기 선택 확장: 추가 지표(최대 순간풍속·일조) 품질 확인, 공유 카드 배치·SVG, 공유 경로 HTML — 작은 합성 자료(운영 관측값 아님)
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore, qcGust, qcSun, DAILY_QC } from "../stats-engine.mjs";
import { parseDateSpec } from "../calendar-resolver.mjs";
import { dateWeather, windowYears } from "../date-weather-engine.mjs";
import { battle } from "../date-battle-engine.mjs";
import { layout, toSvg, clip, wrap, textUnits, daySpec, battleSpec, storySpec, fmt } from "../public/share-card.mjs";
import { createShareApi, dayOg, battleOg, shareHtml } from "../share-api.mjs";

const S = (m, d) => parseDateSpec({ calendar: "solar", month: m, day: d }).spec;
const ctx = { today: "2026-10-18", dailyFrom: "1970-01-01", dailyLast: "2026-10-17", hourlyFrom: "1990-01-01", hourlyLast: "2026-10-17" };
const T = (avg, extra = {}) => ({ avg_temperature: avg, max_temperature: avg + 5, min_temperature: avg - 5, precipitation: 0, avg_humidity: 60, avg_wind_speed: 2, max_wind_speed: 6, max_inst_wind_speed: 10, sunshine: 6, possible_sunshine: 11.2, ...extra });

test("품질 확인: 순간풍속 범위·최대풍속 이상, 일조 0~가조시간", () => {
  assert.deepEqual(qcGust(12.3, 7), { v: 12.3, bad: false });
  assert.equal(qcGust(5, 7).bad, true); // 순간풍속 < 10분 평균 최대풍속
  assert.equal(qcGust(80, null).bad, true);
  assert.equal(qcGust(-1, null).bad, true);
  assert.deepEqual(qcGust(NaN, 3), { v: NaN, bad: false }); // 공란 = 자료 없음(품질 제외 아님)
  assert.equal(qcSun(0, 10).bad, false); // 일조 0 은 정상값
  assert.equal(qcSun(10.2, 10).bad, true);
  assert.equal(qcSun(14.8, null).bad, false);
  assert.equal(qcSun(15.1, null).bad, true);
});

test("일자료 저장소·날짜 화면: 공란은 0 아님, 범위 밖은 '품질 확인으로 제외'", () => {
  const rows = [
    { observation_date: "2021-10-18", ...T(10, { max_inst_wind_speed: 12, sunshine: 0 }) },
    { observation_date: "2022-10-18", ...T(11, { max_inst_wind_speed: null, sunshine: null }) },
    { observation_date: "2023-10-18", ...T(12, { max_inst_wind_speed: 3, max_wind_speed: 8, sunshine: 13 }) }, // 둘 다 품질 제외
    { observation_date: "2024-10-18", ...T(13, { max_inst_wind_speed: 16, sunshine: 9 }) },
  ];
  const store = buildDailyStore("1", rows);
  const r = dateWeather({ spec: S(10, 18), store, ctx, years: windowYears({ mode: "custom", fromYear: 2021, toYear: 2024 }), part: "daily" });
  const g = r.daily.metrics.gust;
  const s = r.daily.metrics.sun;
  assert.equal(g.n, 2); assert.equal(g.mean, 14);
  assert.deepEqual(g.excludedYearsByReason, { missing: [2022], qc: [2023] });
  assert.equal(s.n, 2); assert.equal(s.mean, 4.5); // 0 과 9 — 일조 0 은 값으로 셈
  assert.deepEqual(s.excludedYearsByReason, { missing: [2022], qc: [2023] });
  const row23 = r.daily.rows.find((x) => x.referenceYear === 2023);
  assert.equal(row23.fieldStatus.gust, "qc");
  assert.equal(row23.fieldStatus.sun, "qc");
  assert.ok(store.dq.some((b) => b & DAILY_QC.gust));
  // 배틀: 품질 제외 사유가 그대로 남고 공통 연도에서 빠짐
  const store2 = buildDailyStore("2", rows.map((x) => ({ ...x, observation_date: x.observation_date.replace("10-18", "05-05") })));
  const b = battle({ cases: [{ id: "A", stationId: "1", spec: S(10, 18), store }, { id: "B", stationId: "2", spec: S(5, 5), store: store2 }], years: { fromYear: 2021, toYear: 2024 }, ctxOf: () => ctx });
  assert.deepEqual(b.metrics.gust.validYears, [2021, 2024]);
  assert.equal(b.metrics.gust.excludedYears[2023][0].reason, "qc");
  assert.equal(b.metrics.sun.results[0].value, 4.5);
});

test("카드 배치: 글자 자르기·줄바꿈, SVG 이스케이프", () => {
  assert.equal(textUnits("가a "), 1 + 0.58 + 0.3);
  assert.equal(clip("짧은 제목", 20, 1000), "짧은 제목");
  assert.ok(clip("가".repeat(100), 20, 200).endsWith("…"));
  assert.ok(wrap("가나다 라마바 사아자 차카타 파하", 20, 70, 2).length <= 2);
  const L = layout({ title: `<script>alert(1)</script>&"`, chips: ["a<b"], rows: [{ label: "x", value: "1℃", note: "n" }], foot: ["f1", "이날"] });
  const svg = toSvg(L, "t<");
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
  assert.equal(fmt(2.25, 1), "2.3");
  assert.equal(fmt(null), "–");
  // 줄이 많아도 바닥 출처 구분선 위에서 끝남
  const many = layout({ title: "가".repeat(30), story: "이야기", chips: ["a"], rows: Array.from({ length: 8 }, (_, i) => ({ label: `r${i}`, value: "1", note: "n" })), foot: ["a", "b", "c"] });
  const footLine = many.ops.filter((o) => o.t === "line").pop();
  const box = many.ops.filter((o) => o.t === "rect" && o.stroke === "#dbe6f7").pop();
  assert.ok(box.y + box.h <= footLine.y1, `${box.y + box.h} <= ${footLine.y1}`);
});

// API 응답과 같은 모양의 작은 객체(값은 합성)
const M = (n, mean, extra = {}) => ({ n, eligible: n, mean, tier: n === 0 ? "none" : n < 3 ? "reference" : "stats", limited: false, candidateYears: [], ...extra });
const D = {
  specLabel: "양력 10월 18일", station: { station_id: "108", station_name: "서울", dailyLast: "2026-10-17" }, window: { label: "최근 10년(2016~2025)", fromYear: 2016, toYear: 2025 },
  dateCounts: { requested: 10, exists: 10, nodate: 0 }, dailyFrom: "1970-01-01", today: "2026-10-18",
  daily: { metrics: { avg: M(10, 14.94), max: M(10, 20.1), min: M(10, 9.9), rain: M(10, 1.25, { k: 3, share: 30 }), wind: M(0, null), sun: M(9, 6.04) } },
  selected: [{ referenceYear: 2025, dateStatus: "ok", rowPresent: true, solarDate: "2025-10-18", values: { avg: 13.2, rain: 0 } }],
};
// v2 카드: 횟수 + 앞뒤 15일(표본 해·유효일)
D.spec = { calendar: "solar", month: 10, day: 18 };
D.counts = { rules: [
  { id: "rain", label: "비·눈 온 해", cond: "일강수량 0.1mm 이상", k: 3, n: 10, tier: "stats", limited: false, show: true },
  { id: "hot30", label: "최고 30℃ 이상", cond: "일최고기온 30℃ 이상", k: 0, n: 10, tier: "stats", show: false },
  { id: "frost", label: "최저 영하", cond: "일최저기온 0℃ 미만", k: 1, n: 10, tier: "stats", limited: false, show: true },
], extremes: {} };
const AM = (n, o) => ({ n, validDays: n * 31, tier: n >= 3 ? "stats" : n ? "reference" : "none", limited: false, ...o });
D.around = { metrics: { avg: AM(10, { mean: 14.44 }), rainDays: AM(10, { share: 24.5 }), rainSum: AM(0, { perDay: null }) } };
test("날짜 카드 v2: 날짜·횟수·앞뒤 15일 표본, 자료 없는 지표는 '자료 부족', 같은 날 평균 없음", () => {
  const sp = daySpec(D, { alias: "우리 기념일" });
  assert.equal(sp.title, "우리 기념일");
  const byLabel = Object.fromEntries(sp.rows.map((r) => [r.label, r]));
  assert.equal(byLabel["이날 비·눈 온 해"].value, "3번");
  assert.match(byLabel["이날 비·눈 온 해"].note, /자료가 있는 10개 해 중/);
  assert.equal(byLabel["이날 최고 30℃ 이상"], undefined); // 계절 밖·0번 → 숨김
  assert.equal(byLabel["이날 최저 영하"].value, "1번");
  assert.equal(byLabel["앞뒤 15일 평균기온"].value, "14.4℃");
  assert.match(byLabel["앞뒤 15일 평균기온"].note, /10개 해 · 유효 310일/);
  assert.equal(byLabel["앞뒤 15일 강수일 비율"].value, "25%");
  assert.ok(!sp.rows.some((r) => r.label === "평균기온"));
  assert.ok(sp.chips.includes("서울 (108)") && sp.chips.includes("최근 10년(2016~2025)"));
  assert.ok(sp.chips.includes("이날 자료 있는 해 10/10") && sp.chips.includes("앞뒤 15일 10개 해 · 유효 310일"));
  assert.equal(byLabel["앞뒤 15일 하루 평균 강수량 (0개 해)"].value, "자료 부족");
  assert.match(sp.foot.join(" "), /기상청 ASOS/);
  assert.equal(daySpec(D).title, "2025.10.18(토)의 날씨");
  const og = dayOg(D, "");
  assert.match(og.title, /2025\.10\.18\(토\)의 날씨 — 서울 최근 10년/);
  assert.match(og.desc, /이날 비·눈 온 해 3번\(10개 해 중\) · 최저 영하 1번 · 앞뒤 15일 평균기온 14\.4℃·강수일 25%\(10개 해\)/);
});

const Bm = (label, vals, n, cmp, unit = "℃", digits = 1) => ({ label, unit, digits, n, tier: n === 0 ? "none" : n < 3 ? "reference" : "stats", limited: false, results: vals.map((v, i) => ({ case: "AB"[i], value: v })), comparison: cmp });
const B = {
  cases: [{ id: "A", specLabel: "양력 5월 5일" }, { id: "B", specLabel: "양력 10월 9일" }], stations: [{ id: "A", station_id: "108", station_name: "서울" }, { id: "B", station_id: "108", station_name: "서울" }],
  window: { label: "최근 10년(2016~2025)" }, today: "2026-10-18", differentStations: false, mixedCalendars: false,
  metrics: { avg: Bm("평균기온", [18.2, 16.0], 10, { badges: true, more: "A" }), max: Bm("평균 최고기온", [24, 22], 10, { badges: false }), min: Bm("평균 최저기온", [12, 11], 2, { badges: false }), rain_days: Bm("강수일수", [3, 2], 10, { badges: true, more: "A" }, "개 해", 0), rain_mean: Bm("평균 일강수량", [null, null], 0, {}, "mm"), wind: Bm("평균 풍속", [2.2, 2.0], 10, { badges: false }, "m/s") },
};
test("배틀 카드: 공통 표본, 굵은 색은 배지 조건일 때만, 공통 없음은 –", () => {
  const sp = battleSpec(B, { labels: ["어린이날", ""] });
  assert.equal(sp.title, "어린이날 vs 10월 9일");
  const rows = Object.fromEntries(sp.table.rows.map((r) => [r.label, r]));
  assert.equal(rows["평균기온"].best, 0);
  assert.equal(rows["평균 최고기온"].best, null);
  assert.deepEqual(rows["평균 일강수량"].values, ["–", "–"]);
  assert.equal(rows["평균 일강수량"].note, "공통 연도 없음");
  assert.deepEqual(rows["강수일수"].values, ["3", "2"]);
  assert.match(rows["평균 최저기온"].note, /참고/);
  assert.match(battleOg(B, ["어린이날"]).title, /날씨 배틀: 어린이날 vs 양력 10월 9일/);
  const st = storySpec({ title: "t", text: "본문", numbers: [{ label: "기온", value: "3℃" }] }, { stationName: "서울", stationId: "108" });
  assert.equal(st.rows[0].value, "3℃");
});

test("공유 경로: og 메타·이동 주소, 별칭 이스케이프, 잘못된 조건은 400 HTML", async () => {
  const calls = [];
  const api = createShareApi({ dateApi: { dayBody: async (q) => { calls.push(String(q)); return D; }, battleBody: async () => B } });
  const mkRes = () => { const r = { status: 0, headers: null, body: "" }; r.writeHead = (s, h) => { r.status = s; r.headers = h; }; r.end = (b) => { r.body = b || ""; }; return r; };
  let res = mkRes();
  assert.equal(await api({ method: "GET" }, res, new URL("http://x/s/day?station=108&cal=solar&m=10&d=18&year=2025&period=recent10&to=2025&alias=%3Cb%3E%22hi&evil=1")), true);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.match(res.body, /property="og:title" content="b&quot;hi · 2025\.10\.18\(토\)의 날씨/);
  assert.ok(!res.body.includes("<b>\"hi"));
  assert.match(res.body, /location\.replace\("\/#\/stories\/day\?station=108&cal=solar&m=10&d=18&year=2025&period=recent10&to=2025&alias=b%22hi"\)/);
  assert.ok(!res.body.includes("evil"));
  assert.match(calls[0], /part=daily/);
  res = mkRes();
  await api({ method: "GET" }, res, new URL("http://x/s/day.svg?station=108&m=10&d=18"));
  assert.match(res.headers["content-type"], /image\/svg\+xml/);
  assert.ok(res.body.startsWith("<svg"));
  res = mkRes();
  await api({ method: "GET" }, res, new URL("http://x/s/battle?cases=A.108.S.5.5.0,B.108.S.10.9.0&labels=%25EC%2596%25B4"));
  assert.match(res.body, /날씨 배틀/);
  const { StatsError } = await import("../stats-engine.mjs");
  const bad = createShareApi({ dateApi: { dayBody: async () => { throw new StatsError("월·일을 확인하세요"); } } });
  res = mkRes();
  await bad({ method: "GET" }, res, new URL("http://x/s/day?m=13"));
  assert.equal(res.status, 400);
  assert.match(res.body, /월·일을 확인하세요/);
  assert.equal(await api({ method: "GET" }, mkRes(), new URL("http://x/s/other")), false);
  assert.match(shareHtml({ title: "a", desc: "b", url: "u", target: "/#/x</script>", svg: "s" }), /\\u003c\/script>/);
});
