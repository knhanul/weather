// astra 3단계: 공용 날씨 그림(rt-weather-art.js)·작은 그래프·구간 옷차림(rt-story-visuals.js) — 브라우저 파일을 vm 으로 읽어 순수 함수만 시험
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function load(ls = {}) {
  const win = { localStorage: { getItem: (k) => ls[k] ?? null } };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ["public/info-tip.js", "public/rt-weather-art.js", "public/rt-story-visuals.js"]) vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), ctx);
  return win;
}
const pad = (n) => String(n).padStart(2, "0");
const wall = (base, k) => { const t = new Date(Date.parse(`${base.replace(" ", "T")}Z`) + k * 36e5).toISOString(); return `${t.slice(0, 10)} ${t.slice(11, 13)}:00:00`; };
const fcFrom = (start, n, f = () => ({})) => [...Array(n)].map((_, i) => { const time = wall(start, i); return { time, ta: 15, hm: 50, ws: 2, pty: "없음", pop: 10, items: { pty: { intervalStart: wall(start, i - 1), intervalEnd: time } }, ...f(time, i) }; });

test("장면: 강수형태(실황) → 하늘상태(예보에서 빌리면 그 예보 시각) → 낮/밤", () => {
  const { RTArt: A } = load();
  const rain = A.sceneOf({ obs: { pty: "비", time: "2026-10-17 15:00:00" }, fc: [{ time: "2026-10-17 16:00:00", sky: "맑음", pty: "없음" }], hour: 15 });
  assert.equal(rain.k, "rain"); assert.equal(rain.borrowed, false);
  const sky = A.sceneOf({ obs: { pty: "없음" }, fc: [{ time: "2026-10-17 20:00:00", sky: "구름많음", pty: "없음" }], hour: 19 });
  assert.equal(sky.k, "partly"); assert.equal(sky.night, true); assert.equal(sky.borrowed, true); assert.equal(sky.note, "20시 예보");
  assert.equal(A.sceneOf({ obs: null, fc: [], hour: 12 }).k, null);
  assert.equal(A.kind(null, "비/눈"), "sleet");
  assert.match(A.iconSvg("snow", false, 28, "눈"), /role="img" aria-label="눈"/);
  assert.match(A.sceneSvg("clear", true, { id: "x1" }), /aria-hidden="true"/);
});

test("구간(9-1): 가장 추운 시각 → 겉옷, 가장 따뜻한 시각 → 안, 구간 차 8℃·일교차 10℃ → 벗고 입기 쉬운 겉옷", () => {
  const { RTViz: V } = load();
  const fc = fcFrom("2026-10-18 00:00:00", 24, (t) => { const h = +t.slice(11, 13); return { ta: h === 7 ? 8 : h === 9 ? 17 : 12 }; });
  const am = V.segment(V.SEG_DEFAULT[0], { nowW: "2026-10-17 22:10", fc, days: [] });
  assert.equal(am.date, "2026-10-18");
  assert.equal(am.tmin, 8); assert.equal(am.tmax, 17);
  assert.equal(JSON.stringify(am.wear), JSON.stringify({ outer: "코트·히트텍", inner: "맨투맨·얇은 니트" }));
  assert.equal(am.easyLayer, true); // 9℃ 차
  const flat = V.segment(V.SEG_DEFAULT[0], { nowW: "2026-10-17 22:10", fc: fcFrom("2026-10-18 00:00:00", 24), days: [{ date: "2026-10-18", max: 25, min: 14 }] });
  assert.equal(flat.wear.one, "자켓·가디건");
  assert.ok(flat.items.includes("벗고 입기 쉬운 겉옷")); // 예보 일교차 11℃
  assert.equal(V.segment(V.SEG_DEFAULT[0], { nowW: "2026-10-17 22:10", fc: fcFrom("2026-10-18 00:00:00", 24), days: [{ date: "2026-10-18", max: 20, min: 14 }] }).easyLayer, undefined);
});

test("구간: 바람 5m/s, 기온 25℃·습도 70% 함께 표기(체감온도 지어내지 않음), 우산은 강수형태·확률만, 눈은 쌓임 말 안 함", () => {
  const { RTViz: V } = load();
  const fc = fcFrom("2026-10-18 00:00:00", 24, (t) => { const h = +t.slice(11, 13); return h === 13 ? { ta: 27, hm: 75, ws: 6 } : h === 14 ? { pty: "비", pop: 70 } : {}; });
  const day = V.segment(V.SEG_DEFAULT[1], { nowW: "2026-10-17 22:10", fc, days: [] });
  assert.ok(day.items.includes("바람 최대 6m/s"));
  assert.ok(day.items.includes("기온 27℃·습도 75%"));
  assert.ok(day.items.every((x) => !/체감/.test(x)));
  assert.equal(day.rain, "rain"); assert.equal(day.items[0], "우산");
  const pop = V.segment(V.SEG_DEFAULT[1], { nowW: "2026-10-17 22:10", fc: fcFrom("2026-10-18 00:00:00", 24, (t) => (+t.slice(11, 13) === 13 ? { pop: 60 } : {})), days: [] });
  assert.equal(pop.rain, "pop"); assert.match(pop.items[0], /강수확률 60%/);
  // 출근 7~9시: 7시 강수형태는 6~7시 구간 → 겹치지 않음
  assert.equal(V.segment(V.SEG_DEFAULT[0], { nowW: "2026-10-17 22:10", fc: fcFrom("2026-10-18 00:00:00", 24, (t) => (+t.slice(11, 13) === 7 ? { pty: "비" } : {})), days: [] }).rain, undefined);
  const snow = V.segment(V.SEG_DEFAULT[1], { nowW: "2026-10-17 22:10", fc: fcFrom("2026-10-18 00:00:00", 24, (t) => (+t.slice(11, 13) === 13 ? { pty: "눈" } : {})), days: [] });
  assert.equal(snow.rain, "snow"); assert.match(snow.reasons.join(" "), /쌓임·결빙은 예보로 알 수 없음/);
});

test("구간: 빠진 값은 그 항목만 보류(0으로 보지 않음), 지난 구간은 다음 날, 밤은 21~06시", () => {
  const { RTViz: V } = load();
  const fc = fcFrom("2026-10-17 16:00:00", 30, () => ({ hm: null, ws: null }));
  const s = V.segment(V.SEG_DEFAULT[2], { nowW: "2026-10-17 15:40", fc, days: [] });
  assert.equal(s.date, "2026-10-17");
  assert.ok(s.wear); assert.equal(s.missing.join(), "바람,습도");
  assert.equal(s.wsMax, undefined);
  const night = V.segment(V.SEG_DEFAULT[3], { nowW: "2026-10-17 15:40", fc, days: [] });
  assert.equal(night.startW, "2026-10-17 21:00:00"); assert.equal(night.endW, "2026-10-18 06:00:00"); assert.equal(night.expected, 10);
  assert.equal(V.segment(V.SEG_DEFAULT[1], { nowW: "2026-10-17 15:40", fc, days: [] }).date, "2026-10-18"); // 낮 12~15시 지남
  const none = V.segment(V.SEG_DEFAULT[0], { nowW: "2026-10-17 15:40", fc: [], days: [] });
  assert.equal(none.wear, undefined); assert.ok(none.missing.includes("기온"));
  // 지금 진행 중 구간: 이미 지난 시각은 실황 기온
  const now = V.segment(V.SEG_DEFAULT[1], { nowW: "2026-10-17 13:20", obsHours: [{ time: "2026-10-17 12:00:00", ta: 30 }], current: { time: "2026-10-17 13:00:00", ta: 29, hm: 40, ws: 1 }, fc: fcFrom("2026-10-17 14:00:00", 3), days: [] });
  assert.equal(now.tmax, 30); assert.equal(now.tmin, 15);
});

test("구간 설정: localStorage 'nw.segments' 모양(6단계 기기 설정), 잘못된 값이면 기본", () => {
  const ok = load({ "nw.segments": JSON.stringify([{ id: "a", label: "등교", from: 8, to: 9 }]) }).RTViz;
  assert.equal(ok.loadSegs().map((s) => s.label).join(), "등교");
  const bad = load({ "nw.segments": JSON.stringify([{ label: "x", from: 30, to: 2 }]) }).RTViz;
  assert.equal(bad.loadSegs().map((s) => `${s.label}${s.from}-${s.to}`).join(), "출근7-9,낮12-15,퇴근18-20,밤21-6");
  assert.equal(ok.SEG_KEY, "nw.segments");
});

test("그래프: 분포 띠 이름표(보통 범위·평균·지금), 표본 부족이면 '자료 부족', 달력은 결측 빗금·오늘 점선, NaN 없음", () => {
  const { RTViz: V } = load();
  const d = V.dist({ type: "dist", unit: "℃", value: 25.7, mean: 19.3, p10: 14.7, p90: 23.3, min: 8, max: 27.9, minDate: "2002-10-22", maxDate: "2014-10-12", N: 539, range: "1990~2025", label: "16시 기온" });
  assert.match(d, /보통 범위\(10~90%\) 14\.7~23\.3℃/); assert.match(d, /평균 19\.3/); assert.match(d, /지금 25\.7℃/);
  assert.match(d, /aria-label="16시 기온 지금 25\.7℃\. 1990~2025년 같은 시기 539개 중/);
  assert.match(V.dist({ type: "dist", value: 3, p10: null, N: 12 }), /자료 부족\(표본 12개\)/);
  const cal = V.calendar({ type: "calendar", from: "2026-10-14", to: "2026-10-16", side: "dry", days: [{ date: "2026-10-13", state: "wet", mm: 3 }, { date: "2026-10-14", state: "dry", mm: 0 }, { date: "2026-10-15", state: "missing", mm: null }, { date: "2026-10-16", state: "dry", mm: 0 }, { date: "2026-10-17", state: "pending", mm: null }] });
  assert.match(cal, /fill="url\(#vz\d+h\)"/); assert.match(cal, /stroke-dasharray="2 1\.5"/); assert.match(cal, /결측 1/);
  const fcst = V.dist({ type: "dist", unit: "℃", value: 4, valueKind: "fcst", mean: 9, p10: 5, p90: 13, N: 300 });
  assert.match(fcst, /예보 4℃/); assert.match(fcst, /stroke-dasharray="3 2"/);
  const fc = fcFrom("2026-10-17 16:00:00", 12, (t, i) => (i === 4 ? { ta: null, pop: null, pty: null } : {}));
  const ax = V.axis12({ nowW: "2026-10-17 15:40", current: { time: "2026-10-17 15:00:00", ta: 16 }, fc }, V.segments({ nowW: "2026-10-17 15:40", fc, days: [] }), "pm");
  assert.match(ax, /data-seg="pm"/); assert.match(ax, /stroke-dasharray="5 4"/);
  for (const html of [d, cal, fcst, ax]) assert.doesNotMatch(html, /NaN|undefined/);
});

test("과거 유사일 겹쳐 보기: 오늘(hoursUsed 만)과 고른 날, 1~3위 고르기", () => {
  const { RTViz: V } = load();
  const r = { ok: true, day: "today", hoursUsed: [0, 1, 2, 3], target: { ta: [10, 9, null, 8] }, top: [{ date: "2003-10-10", rmse: 0.4, ta: [10, 9, 9, 8], max: 20, min: 8 }, { date: "1999-10-12", rmse: 0.6, ta: [11, 10, 9, 9] }, { date: "2011-10-20", rmse: 0.7, ta: [9, 9, 8, 8] }] };
  const h = V.simOverlay(r, 1);
  assert.match(h, /1999-10-12의 같은 시각 기온/); assert.match(h, /data-simpick="1" aria-pressed="true"/);
  assert.equal((h.match(/data-simpick=/g) || []).length, 3);
  assert.equal(V.simOverlay({ ok: true, top: [] }, 0), "");
});

test("4단계 그림: 계절 점그래프·발표 흐름(전환에서 끊김)·지역 8행·이번 주·해마다 점·신적설 달력", () => {
  const { RTViz: V } = load();
  const rows = [...Array(36)].map((_, i) => ({ season: String(1990 + i), pos: i % 5 === 0 ? null : 150 + (i % 9), date: i % 5 === 0 ? null : `${1990 + i}-06-0${1 + (i % 9) % 9}`, state: i % 5 === 0 ? "none" : "hit" }));
  const se = V.season({ type: "season", label: "첫 30℃", startMd: "01-01", rows, current: { pos: 156, date: "2026-06-06", kind: "obs" }, meanPos: 154, meanDate: "06-04", completeSeasons: 36, hitSeasons: 28, basisId: "all", basisLabel: "1990년 이후 평균", range: "1990~2025" });
  assert.match(se, /class="vz vz-season"/); assert.match(se, /이번 6\/6/); assert.match(se, /사건 없던 시즌 8개/);
  const none = V.season({ type: "season", label: "첫 영하", startMd: "08-01", rows, current: null, meanPos: 120, meanDate: "11-29", completeSeasons: 36, hitSeasons: 28, basisId: "all", range: "1990~2025" });
  assert.match(none, /현재까지 확인되지 않음/);
  const rv = V.revision({ type: "revision", label: "최고기온", date: "2026-10-18", unit: "℃", points: [{ base: "2026-10-15 06:00:00", value: 18, source: "중기예보" }, { base: "2026-10-15 18:00:00", value: 19, source: "중기예보" }, { base: "2026-10-16 05:00:00", value: 16, source: "단기예보" }, { base: "2026-10-16 08:00:00", value: 17, source: "단기예보" }] });
  assert.match(rv, /단기예보로 바뀜/); assert.equal((rv.match(/<path /g) || []).length, 2); // 전환에서 선 두 개
  const rg = V.regions({ type: "regions", time: "2026-10-17 15:00", highlight: "108", rows: [{ id: "108", name: "서울", temp: 20, diff: 3.2 }, { id: "143", name: "대구", temp: 22, diff: -1 }, { id: "184", name: "제주", temp: 23, diff: null }] });
  assert.match(rg, /평소\(0\)/); assert.match(rg, /제주 비교 데이터 부족/);
  const wk = V.week({ type: "week", from: "2026-10-12", to: "2026-10-18", today: "2026-10-17", range: "1990~2025", days: [{ date: "2026-10-16", max: 20, min: 10, source: "관측", meanMax: 21, meanMin: 11 }, { date: "2026-10-17", max: 19, min: 9, source: "단기예보", meanMax: 21, meanMin: 11 }, { date: "2026-10-18", max: null, min: null, source: null }] });
  assert.match(wk, /stroke-dasharray="4 3"/); assert.match(wk, /오늘/);
  const yr = V.years({ type: "years", metric: "avg", unit: "℃", label: "누적 평균기온", value: 14.2, year: 2026, mean: 13.5, range: "1990~2025", upTo: "10-16", rows: [{ year: 1990, value: 13 }, { year: 1991, value: null }, { year: 2025, value: 14 }] });
  assert.match(yr, /올해 14.2℃/); assert.match(yr, /자료 부족한 해 1개/);
  const sc = V.calendar({ type: "calendar", metric: "snow", days: [{ date: "2026-01-10", state: "wet", mm: 3 }, { date: "2026-01-11", state: "dry", mm: 0 }, { date: "2026-01-12", state: "pending", mm: null }], from: "2026-01-10", to: "2026-01-10", side: "wet" });
  assert.match(sc, /눈 쌓인 날 1/); assert.doesNotMatch(sc, /연속 1일/);
  assert.equal(V.chart({ type: "season", rows: [], label: "x", startMd: "01-01" }).includes("지난 시즌 자료 부족"), true);
});

test("4단계 시간축: 칩과 같은 열 폭(colW) — 너비 = 54 + 10 + 시간 수 × colW", () => {
  const { RTViz: V } = load();
  const fc = fcFrom("2026-10-17 16:00:00", 12);
  const a = V.axis12({ nowW: "2026-10-17 15:20", fc, current: { time: "2026-10-17 15:00:00", ta: 15 } }, [], null, { colW: 62, parts: true });
  assert.equal(a.width, 54 + 10 + 12 * 62);
  assert.match(a.svg, /viewBox="0 0 808 /);
  assert.match(a.svg, />강수확률<\/text>/); assert.match(a.svg, />\(m\/s\)<\/text>/);
  assert.match(a.svg, /<title>\d+시 (강수형태 예보 없음|비 예보|강수 예보 자료 없음)/); assert.match(a.svg, /<title>\d+시 (풍속 [\d.]+m\/s|바람 예보 자료 없음)/);
  assert.match(a.cap, /바람 줄 숫자 = 풍속 m\/s/);
});
