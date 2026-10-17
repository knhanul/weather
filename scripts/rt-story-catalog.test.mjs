import test from "node:test";
import assert from "node:assert/strict";
import { createHourlyStore, addHourlyRows, buildDailyStore } from "../stats-engine.mjs";
import { CATALOG, runCatalog, nextCommute, overlapsCommute, rainRuns, TPL, METHOD, Uhi, Ulo, U2 } from "../rt-story-catalog.mjs";
import { selectV2, createMemoryHistory, materialHash, timeValue, freshAndRepeat } from "../rt-story-select.mjs";
import { derivedCompare, firstHotSeasons, firstHotDay } from "../rt-baseline.mjs";
import { hourlyForecast, elementInterval, ELEMENT_TIME } from "../rt-forecast.mjs";
import { backtestCtx } from "./rt-story-backtest.mjs";

const pad = (n) => String(n).padStart(2, "0");
// 결정적 의사난수
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
// 1990~2026 10월(1~31일) 합성 자료. 2026년은 cutDay 까지. opts.mod(y, d, h, row) 로 값 바꾸기
function world({ cutDay = 16, rainEvery = 3, mod = null, dmod = null } = {}) {
  const r = rng(7);
  const hrows = [], drows = [];
  for (let y = 1990; y <= 2026; y++) for (let d = 1; d <= 31; d++) {
    if (y === 2026 && d > cutDay) continue;
    const day = `${y}-10-${pad(d)}`;
    const rainy = d % rainEvery === 0;
    for (let h = 0; h < 24; h++) {
      const row = { observation_datetime: `${day} ${pad(h)}:00:00`, temperature: 12 + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + r() * 2, humidity: 50 + r() * 30, wind_speed: 1 + r() * 3, precipitation: rainy && h % 4 === 0 ? 0.5 + r() * 2.5 : 0 };
      if (mod) mod(y, d, h, row);
      hrows.push(row);
    }
    const row = { observation_date: day, max_temperature: 20 + r() * 3, min_temperature: 10 + r() * 3, avg_temperature: 15, precipitation: rainy ? 2 + r() * 8 : null, max_new_snow: null };
    if (dmod) dmod(y, d, row);
    drows.push(row);
  }
  const hs = createHourlyStore("108", 2026);
  addHourlyRows(hs, hrows);
  const store = buildDailyStore("108", drows);
  return { hs, store };
}
const base = (w, over = {}) => ({ sid: "108", nm: "서울", nowW: "2026-10-17 15:00", ymd: "2026-10-17", hour: 15, hs: w.hs, store: w.store, lastDay: "2026-10-16", current: null, series: [], days: [], fcFresh: true, ...over });
const cur = (o) => ({ time: "2026-10-17 15:00:00", hour: 15, ta: 15, hm: 60, ws: 2, rn1: 0, pty: "없음", fresh: true, ...o });

test("U 식(3-1): Uhi·Ulo·U2", () => {
  assert.equal(Uhi(0.95), 0.8999999999999999);
  assert.equal(Ulo(0.05), 0.9);
  assert.equal(U2(0.5), 0);
  assert.equal(Uhi(0.3), 0);
});

test("H01·W01: 실황 습도·풍속을 같은 시기 같은 시각 분포와 비교(조건 밖이면 안 나옴, 실황 지연이면 안 됨)", () => {
  const w = world();
  const dry = CATALOG.H01(base(w, { current: cur({ hm: 20 }) }));
  assert.equal(dry.fired, true);
  assert.equal(dry.cand.facts.state, "dry");
  assert.ok(dry.cand.U > 0.9);
  assert.match(dry.cand.text, /습도 20%/);
  assert.ok(TPL.H01.some((t) => dry.cand.templateId.startsWith(`H01.${t.id}.`)));
  assert.equal(CATALOG.H01(base(w, { current: cur({ hm: 55 }) })).fired, false);
  assert.equal(CATALOG.H01(base(w, { current: cur({ hm: 20, fresh: false }) })).reason, "실황 없음·지연");
  assert.equal(CATALOG.H01(base(w, { current: cur({ hm: null }) })).reason, "습도 자료 없음");
  const wind = CATALOG.W01(base(w, { current: cur({ ws: 9 }) }));
  assert.equal(wind.fired, true);
  assert.match(wind.cand.title, /바람/);
  assert.equal(CATALOG.W01(base(w, { current: cur({ ws: 4.5 }) })).fired, false); // 5m/s 미만
});

test("R01·R02: 연속 무강수·강수 일수, 결측이 끼면 '확인된 최소 n일'로 순위를 내지 않음", () => {
  // 2026-10-05~16 비 없음(12일), 과거는 3일마다 비
  const w = world({ dmod: (y, d, row) => { if (y === 2026 && d >= 5) row.precipitation = 0; } });
  const r = CATALOG.R01(base(w));
  assert.equal(r.fired, true);
  assert.equal(r.cand.facts.n, 13); // 10/4(비 없는 날)부터
  assert.match(r.cand.title + r.cand.text, /13일/);
  // 지금 비가 오면 끊겼을 수 있음 → 제외 사유
  assert.match(CATALOG.R01(base(w, { current: cur({ rn1: 1.2 }) })).cand.exclude, /끊겼을 수/);
  // 10/10 결측 → 확인된 최소 6일 → 안 나옴
  const w2 = world({ dmod: (y, d, row) => { if (y === 2026 && d >= 5) row.precipitation = 0; if (y === 2026 && d === 10) { row.max_temperature = null; row.min_temperature = null; row.avg_temperature = null; row.precipitation = null; } } });
  const r2 = CATALOG.R01(base(w2));
  assert.equal(r2.fired, false);
  assert.match(r2.reason, /6일|결측/);
  const runs = rainRuns(w.store);
  assert.ok(runs.dry.some((x) => Number.isNaN(x)) || runs.dry.length > 0);
  // 연속 강수 4일(과거엔 3일마다 하루)
  const w3 = world({ dmod: (y, d, row) => { if (y === 2026 && d >= 13) row.precipitation = 5; } });
  const r3 = CATALOG.R02(base(w3));
  assert.equal(r3.fired, true);
  assert.equal(r3.cand.facts.n, 5); // 10/12(원래 비 오는 날)부터
});

test("R03: 최근 7일 합(7일 모두 있어야), 강수는 분포로만 말함", () => {
  const w = world({ dmod: (y, d, row) => { if (y === 2026 && d >= 10) row.precipitation = 30; } });
  const r = CATALOG.R03(base(w));
  assert.equal(r.fired, true);
  assert.equal(r.cand.facts.sum, 210);
  assert.doesNotMatch(r.cand.text, /년 만에|빈도/);
  const w2 = world({ dmod: (y, d, row) => { if (y === 2026 && d === 12) { row.max_temperature = null; row.min_temperature = null; row.avg_temperature = null; row.precipitation = null; } } });
  assert.equal(CATALOG.R03(base(w2)).reason, "7일 중 결측");
});

test("R04: 지금 비 — 비 온 시간만의 분포(30개·4개 해 이상)로 많음 판단, 아니면 양만(생활 경로)", () => {
  const w = world();
  const big = CATALOG.R04(base(w, { current: cur({ hour: 16, time: "2026-10-17 16:00:00", rn1: 12 }) }));
  assert.equal(big.fired, true);
  assert.equal(big.cand.facts.state, "rare");
  assert.equal(big.cand.path, "stat");
  assert.match(big.cand.text, /비가 온 비율/);
  const small = CATALOG.R04(base(w, { current: cur({ hour: 16, time: "2026-10-17 16:00:00", rn1: 0.5 }) }));
  assert.equal(small.cand.path, "life");
  assert.equal(small.cand.U, null);
  // 15시에는 과거 비 온 시간이 없음(4시간마다) → 표본 없음 → 양만
  const none = CATALOG.R04(base(w, { current: cur({ rn1: 3 }) }));
  assert.equal(none.cand.facts.state, "plain");
  assert.match(none.cand.text, /3mm/);
  assert.equal(CATALOG.R04(base(w, { current: cur({ rn1: 0 }) })).fired, false);
  assert.equal(CATALOG.R04(base(w, { current: cur({ rn1: null, pty: null }) })).reason, "강수 자료 없음");
});

test("S01: 신적설 > 0 이면 사실만, 표본(눈 온 날 30개·4개 해)이 없으면 많고 적음을 말하지 않음, '첫눈'이라 하지 않음", () => {
  const w = world({ dmod: (y, d, row) => { if (y === 2026 && d === 16) row.max_new_snow = 3.2; } });
  const r = CATALOG.S01(base(w));
  assert.equal(r.fired, true);
  assert.equal(r.cand.path, "life");
  assert.doesNotMatch(r.cand.title + r.cand.text, /첫눈/);
  assert.match(r.cand.text, /3\.2cm/);
  assert.equal(CATALOG.S01(base(world())).reason, "신적설 없음");
});

const fcH = (time, o = {}) => ({ time, ta: 15, pty: "없음", sky: "맑음", pop: 10, kind: "fcst", source: "단기예보", base: "2026-10-17 14:00:00", items: hourlyForecast({ vilRows: [{ fcst: time, category: "SKY", value: "1", base: "2026-10-17 14:00:00" }, { fcst: time, category: "PTY", value: "0", base: "2026-10-17 14:00:00" }, { fcst: time, category: "TMP", value: "15", base: "2026-10-17 14:00:00" }], fromWall: "2000-01-01 00:00:00" })[0].items, ...o });
const hoursFrom = (start, n, f) => Array.from({ length: n }, (_, i) => { const t = new Date(Date.parse(`${start.replace(" ", "T")}Z`) + i * 3600000).toISOString(); const w = `${t.slice(0, 10)} ${t.slice(11, 13)}:00:00`; return fcH(w, f ? f(w, i) : {}); });

test("L01: 다음 출퇴근 구간과 겹치는 강수형태(그 정시 앞 1시간 구간) → 우산, 강수확률만 높으면 따로", () => {
  assert.equal(ELEMENT_TIME.convention, "preceding-hour");
  assert.deepEqual(elementInterval("2026-10-17 08:00:00", "pty"), { intervalStart: "2026-10-17 07:00:00", intervalEnd: "2026-10-17 08:00:00" });
  const win = nextCommute("2026-10-17 21:10");
  assert.equal(win.leg, "am"); assert.equal(win.date, "2026-10-18");
  assert.equal(nextCommute("2026-10-17 08:30").leg, "am");
  assert.equal(nextCommute("2026-10-17 09:00").leg, "pm");
  assert.equal(overlapsCommute("2026-10-18 07:00:00", "pty", win), false); // 06~07시 구간 — 7시 출근 전
  assert.equal(overlapsCommute("2026-10-18 08:00:00", "pty", win), true);
  assert.equal(overlapsCommute("2026-10-18 10:00:00", "pty", win), false);
  const w = world();
  const ctx = base(w, { nowW: "2026-10-17 21:10", hour: 21, series: hoursFrom("2026-10-17 22:00:00", 14, (t) => (t === "2026-10-18 09:00:00" ? { pty: "비", pop: 70 } : {})) });
  const r = CATALOG.L01(ctx);
  assert.equal(r.fired, true);
  assert.equal(r.cand.facts.state, "pty");
  assert.match(r.cand.title, /내일 출근길/);
  assert.match(r.cand.text, /8~9시/);
  assert.equal(r.cand.mergeGroup, "rain");
  const p = CATALOG.L01(base(w, { nowW: "2026-10-17 21:10", hour: 21, series: hoursFrom("2026-10-17 22:00:00", 14, (t) => (t === "2026-10-18 08:00:00" ? { pop: 60 } : {})) }));
  assert.equal(p.cand.facts.state, "pop");
  assert.match(p.cand.title, /강수확률/);
  assert.equal(CATALOG.L01(base(w, { nowW: "2026-10-17 21:10", hour: 21, series: hoursFrom("2026-10-17 22:00:00", 14, (t) => (t === "2026-10-18 07:00:00" ? { pty: "비" } : {})) })).fired, false);
  assert.equal(CATALOG.L01(base(w, { nowW: "2026-10-17 21:10", series: [] })).reason, "출퇴근 구간 예보 없음");
});

test("C01·N01·T03: 하늘 전환, 열대야 추정, 3시간 4℃ 급변(양쪽, 분포 끝 10% 안일 때만)", () => {
  const w = world();
  const sky = CATALOG.C01(base(w, { nowW: "2026-10-17 07:10", hour: 7, series: hoursFrom("2026-10-17 08:00:00", 10, (t, i) => ({ sky: i < 3 ? "맑음" : "흐림" })) }));
  assert.equal(sky.fired, true);
  assert.equal(sky.cand.facts.toWord, "흐려져요");
  assert.equal(sky.cand.facts.hourWord, "11시");
  assert.equal(sky.cand.path, "life");
  // 강수형태가 있으면 전환으로 보지 않음
  assert.equal(CATALOG.C01(base(w, { nowW: "2026-10-17 07:10", hour: 7, series: hoursFrom("2026-10-17 08:00:00", 10, (t, i) => ({ sky: i < 3 ? "맑음" : "흐림", pty: "비" })) })).fired, false);
  const night = CATALOG.N01(base(w, { series: hoursFrom("2026-10-17 15:00:00", 20, () => ({ ta: 26 })) }));
  assert.equal(night.fired, true);
  assert.match(night.cand.title + night.cand.text, /추정/);
  assert.equal(CATALOG.N01(base(w, { series: hoursFrom("2026-10-17 15:00:00", 20, (t, i) => ({ ta: i === 10 ? 24.9 : 26 })) })).fired, false);
  // 오전(평소 오르는 시각)에 8℃ 내림 → 급변
  const drop = CATALOG.T03(base(w, { series: hoursFrom("2026-10-18 08:00:00", 6, (t, i) => ({ ta: i < 1 ? 18 : 10 })) }));
  assert.equal(drop.fired, true);
  // 저녁(평소 내리는 시각)의 큰 내림은 보통 하루 변화로 보고 뺌
  const eve = CATALOG.T03(base(w, { series: hoursFrom("2026-10-17 16:00:00", 10, (t, i) => ({ ta: i < 2 ? 18 : 10 })) }));
  assert.equal(eve.fired, false);
  assert.equal(eve.reason, "평소 같은 시각 변화 범위 안");
  assert.equal(drop.cand.facts.dirShort, "내림");
  assert.equal(drop.cand.minU, 0.8);
});

test("T01·T02: 예보 일교차·최저기온(예보값 — 기록이라 하지 않음)", () => {
  const w = world();
  const big = CATALOG.T01(base(w, { days: [{ date: "2026-10-18", max: 25, min: 5, maxBase: "2026-10-17 14:00:00", minBase: "2026-10-17 14:00:00" }] }));
  assert.equal(big.fired, true);
  assert.equal(big.cand.facts.state, "big");
  const cold = CATALOG.T02(base(w, { days: [{ date: "2026-10-18", max: 18, min: 4, minBase: "2026-10-17 14:00:00" }] }));
  assert.equal(cold.fired, true);
  assert.doesNotMatch(cold.cand.title + cold.cand.text, /기록(?!으로 말하지)/);
  assert.equal(CATALOG.T02(base(w, { days: [{ date: "2026-10-18", max: 18, min: 11.5 }] })).fired, false);
});

test("runCatalog: 모든 규칙 진단(fired·reason), 방법 설명·틀 3개 이상", () => {
  const w = world();
  const r = runCatalog(base(w, { current: cur({ hm: 20 }) }));
  assert.deepEqual(Object.keys(r.diag).sort(), Object.keys(CATALOG).sort());
  assert.ok(r.cands.some((c) => c.ruleId === "H01"));
  for (const id of Object.keys(CATALOG)) { assert.ok(METHOD[id], id); assert.ok(TPL[id].length >= 3, id); }
});

const C = (o) => ({ key: o.ruleId, eventId: `e|${o.ruleId}`, title: "t", text: "x", path: "stat", samples: 100, minSamples: 60, U: 0.5, A: 0.5, T: 1, material: {}, ...o });
test("selectV2: 점수 0.35U+0.35A+0.15T+0.15F−R, 생활 경로는 U 기준 없음, 예보 일괄 감점 없음", () => {
  const s = selectV2([C({ ruleId: "A", U: 1, A: 1, T: 1, kind: "예보" }), C({ ruleId: "B", U: 0.2 }), C({ ruleId: "L", path: "life", U: null, A: 1, T: 1, samples: 0, minSamples: 0 })], { slot: "2026-10-17", nowW: "2026-10-17 10:00" });
  assert.equal(s.stories[0].score, 1);
  assert.ok(s.dropped.some((d) => d.key === "B" && /이례성/.test(d.reason)));
  assert.equal(s.stories.find((x) => x.key === "L").score, 0.65);
});
test("selectV2: 같은 주제 1개(다른 생활 결정이면 2개), 강수 사건 하나로, 생활 슬롯, 첫 카드는 지금·가까운 미래", () => {
  const list = [
    C({ ruleId: "rec", topic: "temperature", U: 1, A: 0.3, T: 0.2 }),
    C({ ruleId: "now", topic: "temperature", lifeDecision: "outfit", U: 0.6, A: 1, T: 1 }),
    C({ ruleId: "t01", topic: "temperature", lifeDecision: "layering", U: 0.9, A: 1, T: 0.8 }),
    C({ ruleId: "t02", topic: "temperature", lifeDecision: "morning", U: 0.9, A: 1, T: 0.8 }),
    C({ ruleId: "R04", topic: "precipitation", mergeGroup: "rain", path: "life", U: null, A: 1, T: 1, lifeSlot: true }),
    C({ ruleId: "L01", topic: "precipitation", mergeGroup: "rain", path: "life", U: null, A: 1, T: 0.8, lifeSlot: true }),
    C({ ruleId: "reg", topic: "region", U: 0.9, A: 0.3, T: 1 }),
    C({ ruleId: "ytd", topic: "climate", U: 0.9, A: 0.3, T: 0.5 }),
  ];
  const s = selectV2(list, { slot: "d", nowW: "2026-10-17 10:00" });
  const keys = s.stories.map((x) => x.key);
  assert.equal(keys.length, 4);
  assert.equal(keys.filter((k) => ["rec", "now", "t01", "t02"].includes(k)).length, 2);
  assert.ok(keys.includes("R04"));
  assert.ok(!keys.includes("L01"));
  assert.equal(s.stories.find((x) => x.key === "R04").related[0].key, "L01");
  assert.ok((s.stories[0].parts.T) >= 0.8);
  assert.ok(s.dropped.some((d) => /같은 강수 사건/.test(d.reason)));
});
test("이력: 같은 발행 구간 재요청은 이력에 새로 세지 않음, 이전 구간에 같은 내용이면 F 0.2·R 0.2, 내용이 바뀌면 F 0.6", async () => {
  const h = createMemoryHistory();
  const c = { eventId: "e1", materialHash: materialHash("X", { a: 1 }), ruleId: "X" };
  await h.record("108", "2026-10-16", [c], "2026-10-16 20:00");
  await h.record("108", "2026-10-16", [c], "2026-10-16 21:00");
  assert.equal((await h.list("108")).length, 1);
  const hist = await h.list("108");
  assert.deepEqual(freshAndRepeat(c, hist, { slot: "2026-10-16", nowW: "2026-10-16 22:00" }), { F: 1, R: 0, seen: null });
  const same = freshAndRepeat(c, hist, { slot: "2026-10-17", nowW: "2026-10-17 08:00" });
  assert.equal(same.F, 0.2); assert.equal(same.R, 0.2);
  const changed = freshAndRepeat({ ...c, materialHash: materialHash("X", { a: 2 }) }, hist, { slot: "2026-10-17", nowW: "2026-10-17 08:00" });
  assert.equal(changed.F, 0.6); assert.equal(changed.R, 0);
  assert.equal(timeValue({ endW: "2026-10-12 23:59", nowW: "2026-10-17 10:00" }), 0.2);
  assert.equal(timeValue({ startW: "2026-10-17 12:00", nowW: "2026-10-17 10:00" }), 1);
});

test("derivedCompare: 조건부 분포(비 온 시간만) — 해 유효 여부는 전체 값으로, occurrenceYears", () => {
  const w = world();
  const get = (dn) => { const i = (dn - w.hs.base) * 24 + 16; return [w.hs.src[i] ? w.hs.rn[i] / 10 : NaN]; };
  const all = derivedCompare(get, "2026-10-17", NaN)[0];
  const wet = derivedCompare(get, "2026-10-17", 2, { filter: (v) => v >= 0.1, minRank: 30 })[0];
  assert.equal(all.validYears, wet.validYears);
  assert.ok(wet.samples < all.samples);
  assert.ok(wet.occurrenceYears >= 30);
  assert.ok(wet.p > 0 && wet.p < 1);
});

test("첫 30℃ 평균: 끝난 해 전체를 본 완전한 시즌만, k개 발생 시즌, 4개 미만이면 평균 없음", () => {
  const rows = [];
  for (let y = 2016; y <= 2026; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) {
    if (y === 2026 && m > 6) continue;
    // 홀수 해: 6/10 처음 30℃, 짝수 해: 8/5 처음 30℃(오늘 6월 기준 '같은 날짜까지'만 보면 짝수 해가 빠지는 편향)
    const hot = y % 2 ? m === 6 && d === 10 : m === 8 && d === 5;
    rows.push({ observation_date: `${y}-${pad(m)}-${pad(d)}`, max_temperature: hot ? 31 : 20, min_temperature: 10, avg_temperature: 15 });
  }
  const store = buildDailyStore("1", rows);
  // 29~31일은 행이 없음(결측) → 한 해에 결측이 많아 '완전한 시즌'이 아님 → 평균 없음
  const p = firstHotSeasons(store, "2026-06-20");
  assert.equal(p[2].status, "insufficient");
  // 모든 날이 있는 자료로 다시
  const rows2 = [];
  for (let y = 2016; y <= 2026; y++) { const a = Date.UTC(y, 0, 1); for (let t = a; t < Date.UTC(y + 1, 0, 1); t += 864e5) { const ymd = new Date(t).toISOString().slice(0, 10); if (ymd > "2026-06-20") break; const hot = y % 2 ? ymd.slice(5) === "06-10" : ymd.slice(5) === "08-05"; rows2.push({ observation_date: ymd, max_temperature: hot ? 31 : 20, min_temperature: 10, avg_temperature: 15 }); } }
  const s2 = buildDailyStore("1", rows2);
  const q = firstHotSeasons(s2, "2026-06-20");
  const r5 = q[2];
  assert.equal(r5.completeSeasons, 5); assert.equal(r5.hitYears, 5);
  const doy = (y, md) => firstHotDay(s2, y, "12-31").doy;
  assert.equal(r5.meanDoy, Math.round([2021, 2022, 2023, 2024, 2025].reduce((s, y) => s + doy(y), 0) / 5));
  assert.match(r5.statusText, /5개 시즌 중 5개 발생/);
});

test("되돌려 보기 ctx: 저장된 예보가 없으면 ASOS 대체(하늘상태 없음), 지금 값은 ASOS 정시", () => {
  const w = world();
  const { ctx, fcKind } = backtestCtx({ sid: "108", nm: "서울", D: "2026-10-15", H: 8, hs: w.hs, store: w.store });
  assert.equal(fcKind, "asos-proxy");
  assert.equal(ctx.lastDay, "2026-10-14");
  assert.equal(ctx.current.hour, 8);
  assert.ok(ctx.series.some((h) => h.kind === "fcst" && h.sky === null));
  const r = runCatalog(ctx);
  assert.equal(Object.keys(r.diag).length, 13);
});
