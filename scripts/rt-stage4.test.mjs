// 4단계(astra 4·6·13·14장) 새 모듈 시험: 계절 신호·가장 큰 변화·예보가 바뀐 흐름·지역 이야기
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore, createHourlyStore, addHourlyRows } from "../stats-engine.mjs";
import { seasonEvent, seasonOf, posOf, mdOfPos, forecastCrossing, seasonChart, seasonHome, nightMin, seasonCands } from "../rt-season.mjs";
import { bigChanges } from "../rt-changes.mjs";
import { classifySeries, revisionFlow, popRevisions, revisionCands } from "../rt-revision.mjs";
import { regionFacts, regionCands, stationSetHash, iga } from "../rt-region.mjs";

const pad = (n) => String(n).padStart(2, "0");
const days = (from, to, f) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) { const d = new Date(t).toISOString().slice(0, 10); const r = f(d); if (r) out.push(r); } return out; };

test("seasonKey·평년 달력 위치(윤년 2/29)", () => {
  assert.equal(seasonOf("2027-01-05", "08-01").key, "2026-27");
  assert.equal(seasonOf("2026-08-01", "08-01").key, "2026-27");
  assert.equal(seasonOf("2026-07-31", "08-01").key, "2025-26");
  assert.equal(seasonOf("2026-05-01", "01-01").key, "2026");
  assert.equal(posOf("2024-02-29", "01-01"), 58.5);
  assert.equal(posOf("2023-03-01", "01-01"), posOf("2024-03-01", "01-01")); // 윤년에도 3/1 위치 같음
  assert.equal(posOf("2027-07-31", "08-01"), 364);
  assert.equal(mdOfPos(0, "08-01"), "08-01");
});

// 1990~2026: 해마다 첫 30℃ = 6/1 + (y%10)일, 마지막 30℃ = 9/1 − (y%5)일, 첫 영하 = 11/20 + (y%7)일. 2026년은 10/16까지
function world({ gap2026 = false, noHot = [] } = {}) {
  const rows = days("1990-01-01", "2026-10-16", (d) => {
    const y = +d.slice(0, 4), md = d.slice(5);
    const first = `06-${pad(1 + (y % 10))}`, last = `09-${pad(1 + (5 - (y % 5)))}`, frost = `11-${pad(20 + (y % 7))}`;
    let max = 20, min = 5;
    if (!noHot.includes(y) && (md === first || md === last || (md > first && md < last && md.endsWith("-15")))) max = 31;
    if (md >= frost || md < "02-20") min = -2;
    if (gap2026 && d >= "2026-02-01" && d <= "2026-02-03") return null; // 시즌 앞부분 결측 3일
    return { observation_date: d, max_temperature: max, min_temperature: min, avg_temperature: (max + min) / 2, precipitation: 0, max_new_snow: null };
  });
  return buildDailyStore("108", rows);
}

test("계절 신호: 첫 30℃ — 완전한 시즌 평균·무발생 시즌은 날짜에 안 넣음·순위 10개 이상", () => {
  const store = world({ noHot: [2020] });
  const e = seasonEvent("first-hot-day", { store, hs: null, refYmd: "2026-10-17", untilYmd: "2026-10-16" });
  assert.equal(e.season, "2026");
  assert.equal(e.current.date, "2026-06-07");
  assert.equal(e.current.firstConfirmed, true);
  const all = e.periods[0], r5 = e.periods[2];
  assert.equal(all.completeSeasons, 36);
  assert.equal(all.hitSeasons, 35); // 2020 무발생 → k of n
  assert.ok(all.meanDate && all.earlier != null);
  assert.equal(r5.range, "2021~2025");
  assert.equal(r5.hitSeasons, 5);
  assert.equal(r5.earlier, undefined); // 발생 시즌 10개 미만이면 순위 없음
  const ch = seasonChart(e, "all");
  assert.equal(ch.type, "season");
  assert.equal(ch.rows.length, 36);
  assert.equal(ch.rows.find((r) => r.season === "2020").state, "none");
  assert.equal(ch.current.date, "2026-06-07");
});

test("계절 신호: 시즌 앞부분 결측이 있으면 '처음' 확정 안 함", () => {
  const store = world({ gap2026: true });
  const e = seasonEvent("first-hot-day", { store, hs: null, refYmd: "2026-10-17", untilYmd: "2026-10-16" });
  assert.equal(e.current.firstConfirmed, false);
  assert.equal(e.current.missingBeforeEvent, 3);
  assert.equal(e.current.usable, false);
  assert.equal(e.periods[0].diffDays, undefined);
});

test("계절 신호: 첫 영하(8/1 시작) 아직 없음 → '현재까지 확인되지 않음', 예보 첫 통과는 '가능성'", () => {
  const store = world();
  const e = seasonEvent("first-frost", { store, hs: null, refYmd: "2026-10-17", untilYmd: "2026-10-16" });
  assert.equal(e.season, "2026-27");
  assert.equal(e.current.date, null);
  assert.equal(e.current.note, "현재까지 확인되지 않음");
  assert.ok(e.periods[0].meanDate >= "11-20" && e.periods[0].meanDate <= "11-26");
  const fc = forecastCrossing("first-frost", e, [{ date: "2026-10-18", min: 3 }, { date: "2026-10-19", min: -1, minSource: "단기예보", minBase: "2026-10-17 05:00:00" }]);
  assert.equal(fc.date, "2026-10-19");
  e.forecast = fc;
  assert.equal(seasonHome("first-frost", e, "2026-10-17").home, true);
  assert.equal(seasonChart(e, "all").current.kind, "fcst");
});

test("계절 신호: 마지막 30℃ 는 연말 전 '가장 최근'(finalForYear=false), 1~2월은 지난해 회고", () => {
  const store = world();
  const e = seasonEvent("last-hot-day", { store, hs: null, refYmd: "2026-10-17", untilYmd: "2026-10-16" });
  assert.equal(e.current.date, "2026-09-05");
  assert.equal(e.current.finalForYear, false);
  const r = seasonEvent("last-hot-day", { store, hs: null, refYmd: "2027-01-10", untilYmd: "2026-10-16", retro: true });
  assert.equal(r.season, "2026");
  assert.equal(r.current.finalForYear, true);
  assert.equal(seasonHome("last-hot-day", r, "2027-01-10").home, true);
  assert.equal(seasonHome("last-hot-day", e, "2026-10-17").home, false); // 9/5 → 7일 지남
});

test("계절 신호: 열대야 추정은 저녁 날짜(19시~다음 날 9시 15개), 하나라도 없으면 판단 안 함", () => {
  const hs = createHourlyStore("108", 2026);
  const rows = [];
  for (let h = 0; h < 24; h++) { rows.push({ observation_datetime: `2026-07-10 ${pad(h)}:00:00`, temperature: 27 }); rows.push({ observation_datetime: `2026-07-11 ${pad(h)}:00:00`, temperature: h === 5 ? 24.9 : 27 }); }
  addHourlyRows(hs, rows);
  assert.equal(nightMin(hs, Date.parse("2026-07-10T00:00:00Z") / 864e5), 24.9);
  assert.ok(Number.isNaN(nightMin(hs, Date.parse("2026-07-11T00:00:00Z") / 864e5)));
});

const H = (time, o) => ({ time, ta: 15, hm: 60, ws: 2, pop: 10, pty: "없음", source: "단기예보", ...o });
test("가장 큰 변화: 3시간 상승·풍속·습도·강수형태(2시간씩, 빈 시각 안 이음)·M·최대 3개 시간순", () => {
  const hours = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(Date.parse("2026-10-17T15:00:00Z") + i * 3600e3).toISOString();
    const t = `${d.slice(0, 10)} ${d.slice(11, 16)}`;
    const o = {};
    if (i >= 10 && i <= 13) o.ta = 15 + (i - 10) * 2.5; // 3시간 +7.5
    if (i > 13) o.ta = 22.5;
    if (i === 20) o.ws = 2; if (i === 23) o.ws = 7; // +5, 7m/s
    if (i >= 30 && i <= 31) o.pty = "비";
    if (i >= 32 && i <= 33) o.pty = "눈"; // 비→눈
    hours.push(H(t, o));
  }
  const r = bigChanges({ hours, days: [], today: "2026-10-17", nowW: "2026-10-17 15:00" });
  assert.ok(r.items.length <= 3);
  const kinds = r.items.map((x) => x.kind);
  assert.ok(kinds.includes("ta3h") && kinds.includes("pty"));
  const ta = r.items.find((x) => x.kind === "ta3h");
  assert.equal(ta.delta, 7.5);
  assert.equal(ta.M, 0.94);
  assert.deepEqual(r.items.map((x) => x.startW), r.items.map((x) => x.startW).slice().sort());
  const pty = r.items.find((x) => x.kind === "pty");
  assert.match(pty.title, /비→눈/);
  // 빈 시각이 끼면 강수형태를 잇지 않음
  const h2 = hours.map((h, i) => (i === 32 ? { ...h, pty: null } : h));
  assert.ok(!bigChanges({ hours: h2, days: [], today: "2026-10-17" }).items.some((x) => x.kind === "pty" && /비→눈/.test(x.title)));
});

test("가장 큰 변화: 이웃한 날 최저 ≥5, 일교차 ≥10 이고 5 이상 커짐, 큰 예보 수정은 '발표 변경'", () => {
  const days = [{ date: "2026-10-17", max: 20, min: 12 }, { date: "2026-10-18", max: 21, min: 5, minSource: "단기예보", maxSource: "단기예보" }];
  const rev = [{ kind: "big", date: "2026-10-18", metric: "max", label: "최고기온", prev: 17, last: 21, delta: 4, source: "단기예보", prevBase: "2026-10-17 11:00:00", lastBase: "2026-10-17 14:00:00" }];
  const r = bigChanges({ hours: [], days, revisions: rev, today: "2026-10-17" });
  const k = r.items.map((x) => x.kind).sort();
  assert.deepEqual(k, ["range", "revision", "tmn"]);
  assert.match(r.items.find((x) => x.kind === "revision").title, /^발표 변경/);
  assert.equal(r.items.find((x) => x.kind === "tmn").M, 0.7);
});

const P = (v, h, src = "단기예보") => ({ base: `2026-10-17 ${pad(h)}:00:00`, value: v, source: src });
test("예보가 바뀐 흐름: 연속 상향·변동·큰 단일 수정·큰 수정 없음·빠진 회차·전환 끊기", () => {
  assert.equal(classifySeries([P(15, 2), P(16, 5), P(17, 8), P(18, 11)], { date: "2026-10-18", metric: "max" }).kind, "up");
  const gap = classifySeries([P(15, 2), P(16, 5), P(17, 11), P(18, 14)], { date: "2026-10-18", metric: "max" });
  assert.equal(gap.kind, "up"); assert.equal(gap.gap, true); assert.match(gap.text, /확보된 최근 4회/);
  assert.equal(classifySeries([P(15, 2), P(18, 5), P(15.5, 8), P(18, 11), P(15.4, 14)], { date: "2026-10-18", metric: "max" }).kind, "osc");
  const big = classifySeries([P(15, 2), P(15, 5), P(18.5, 8)], { date: "2026-10-18", metric: "max" });
  assert.equal(big.kind, "big"); assert.equal(big.delta, 3.5);
  const st = classifySeries([P(15, 2), P(15.5, 5), P(15, 8), P(16, 11)], { date: "2026-10-18", metric: "max" });
  assert.equal(st.kind, "steady"); assert.doesNotMatch(st.text, /정확|확실/);
  const sw = classifySeries([{ base: "2026-10-15 06:00:00", value: 14, source: "중기예보" }, { base: "2026-10-15 18:00:00", value: 18, source: "중기예보" }, P(15, 5), P(15.2, 8)], { date: "2026-10-18", metric: "max" });
  assert.equal(sw.source, "단기예보"); assert.equal(sw.n, 2); assert.equal(sw.switchAt, 2); // 중기 값으로 '큰 수정'을 만들지 않음
  assert.notEqual(sw.kind, "big");
  const flow = revisionFlow([{ date: "2026-10-16", max: [P(1, 1), P(9, 2)], min: [] }, { date: "2026-10-18", max: [P(15, 2), P(15, 5), P(18.5, 8)], min: [] }], { today: "2026-10-17" });
  assert.equal(flow.length, 1);
  const cand = revisionCands(flow, null, { sid: "108", tv: () => 0.8, ymd: "2026-10-17", LIFE_VALUE: { info: 0.5 } });
  assert.equal(cand[0].ruleId, "F01"); assert.equal(cand[0].chart.type, "revision"); assert.equal(cand[0].basisId, null);
});

test("강수확률 수정: 같은 대상 시각·같은 상품만, 20%p 이상", () => {
  const cur = [{ base: "2026-10-17 14:00:00", category: "POP", fcst: "2026-10-18 09:00:00", value: "60" }, { base: "2026-10-17 14:00:00", category: "POP", fcst: "2026-10-18 10:00:00", value: "30" }];
  const prev = [{ base: "2026-10-17 11:00:00", category: "POP", fcst: "2026-10-18 09:00:00", value: "30" }, { base: "2026-10-17 11:00:00", category: "POP", fcst: "2026-10-18 10:00:00", value: "20" }];
  const r = popRevisions(cur, prev, { fromWall: "2026-10-17 15:00:00" });
  assert.equal(r.compared, 2);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].delta, 30);
});

test("지역 이야기: U2 순·기온차 분포는 같은 지점 집합·6개 미만 제외·±3℃ 지점 수", () => {
  const t = "2026-10-17 15:00";
  const mk = (id, name, temp, diff, pct) => ({ id, name, time: t, temp, diffs: { all: diff, r10: diff, r5: diff }, pcts: { all: pct, r10: pct, r5: pct }, samples: { all: 500, r10: 150, r5: 75 } });
  const rows = [mk("108", "서울", 20, 3.2, 95), mk("133", "대전", 21, 3.5, 97), mk("143", "대구", 22, 4.1, 99), mk("156", "광주", 21, 3.1, 93), mk("159", "부산", 22, 1, 70), mk("184", "제주", 23, -0.5, 40), { id: "999", name: "늦음", time: "2026-10-17 14:00", temp: 10 }];
  // 과거: 같은 지점 집합 시간자료 — 해마다 15시 지점 간 차이 2~3℃
  const hsOf = new Map();
  for (const [i, r] of rows.slice(0, 6).entries()) {
    const hs = createHourlyStore(r.id, 2026);
    const hr = [];
    for (let y = 1990; y <= 2025; y++) for (let d = 5; d <= 30; d++) hr.push({ observation_datetime: `${y}-10-${pad(d)} 15:00:00`, temperature: 18 + i * 0.5 + (d % 3) * 0.1 });
    addHourlyRows(hs, hr);
    hsOf.set(r.id, hs);
  }
  const F = regionFacts({ rows, time: t, basis: "all", hsOf: (id) => hsOf.get(id) });
  assert.equal(F.N, 6);
  assert.equal(F.top.id, "143");
  assert.equal(F.spread.D, 3);
  assert.ok(F.spread.cmp.samples >= 60);
  assert.ok(F.spread.cmp.p >= 0.9);
  assert.equal(F.together.warm.length, 4);
  assert.equal(F.chart.rows.length, 6);
  assert.equal(F.stationSetHash, stationSetHash(["184", "159", "156", "143", "133", "108"]));
  const C = regionCands(F, { sid: "108", nm: "서울", tv: () => 1, LIFE_VALUE: { info: 0.5 }, basisId: "all" });
  assert.deepEqual(C.map((c) => c.ruleId).sort(), ["G01", "G02", "G03"]);
  assert.ok(C.every((c) => c.exclude == null));
  assert.match(C.find((c) => c.ruleId === "G03").title, /관측 가능한 6개 중 4개/);
  assert.match(C.find((c) => c.ruleId === "G01").text, /대구가 같은/);
  const few = regionFacts({ rows: rows.slice(0, 5), time: t, basis: "all", hsOf: (id) => hsOf.get(id) });
  assert.equal(few.enough, false);
  assert.ok(regionCands(few, { sid: "108", tv: () => 1, LIFE_VALUE: { info: 0.5 }, basisId: "all" }).every((c) => c.exclude));
  assert.equal(iga("서울"), "이"); assert.equal(iga("제주"), "가");
});

test("계절 후보: 선택 기준(bi)의 평균, '올해 마지막' 금지, 예보 첫 통과는 '가능성'", () => {
  const store = world();
  const hot = seasonEvent("first-hot-day", { store, hs: null, refYmd: "2026-06-10", untilYmd: "2026-06-09" });
  const last = seasonEvent("last-hot-day", { store, hs: null, refYmd: "2026-09-08", untilYmd: "2026-09-07" });
  const frost = seasonEvent("first-frost", { store, hs: null, refYmd: "2026-10-17", untilYmd: "2026-10-16" });
  frost.forecast = forecastCrossing("first-frost", frost, [{ date: "2026-10-19", min: -1, minSource: "단기예보", minBase: "2026-10-17 05:00:00" }]);
  const o = { sid: "108", today: "2026-06-10", tv: () => 0.8, LIFE_VALUE: { info: 0.5 } };
  const a = seasonCands([hot], { ...o, basis: "r5", bi: 2, basisName: "최근 5년" });
  assert.equal(a[0].key, "heat-start"); assert.equal(a[0].basisId, "r5"); assert.match(a[0].title, /최근 5년/); assert.equal(a[0].exclude, null);
  const b = seasonCands([last], { ...o, today: "2026-09-08", basis: "all", bi: 0, basisName: "1990년 이후" });
  assert.match(b[0].title, /가장 최근 30℃ 이상인 날/); assert.doesNotMatch(`${b[0].title} ${b[0].text}`, /올해 마지막 30/);
  const c = seasonCands([frost], { ...o, today: "2026-10-17", basis: "all", bi: 0, basisName: "1990년 이후" });
  assert.equal(c[0].kind, "예보"); assert.match(c[0].title, /가능성/); assert.match(c[0].text, /현재까지 확인되지 않음/);
  assert.equal(c[0].chart.current.kind, "fcst");
});

test("'가장 최근 30℃'는 연말 전 '이르다'를 말하지 않음(제외)", () => {
  const store = world();
  const last = seasonEvent("last-hot-day", { store, hs: null, refYmd: "2026-08-20", untilYmd: "2026-08-19" });
  const c = seasonCands([last], { sid: "108", today: "2026-08-20", tv: () => 0.8, LIFE_VALUE: { info: 0.5 }, basis: "all", bi: 0, basisName: "1990년 이후" });
  for (const x of c) if (x.kind === "관측" && x.material?.d < 3) assert.ok(x.exclude);
});
