// 2026-10-19 광주 19시 사례: 초단기예보(18:30 발표)는 '비 1mm 미만', 단기예보(17:00 발표)는 강수확률 0%·강수없음.
// 그림(비)·칸 아래 글자·문장이 같은 자료를 따르고, 다른 발표의 강수확률을 한 발표처럼 섞지 않는지 시험.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { hourlyForecast } from "../rt-forecast.mjs";
import { CATALOG } from "../rt-story-catalog.mjs";

function art() {
  const win = {}; win.window = win;
  vm.createContext(win);
  vm.runInContext(readFileSync(new URL("../public/rt-weather-art.js", import.meta.url), "utf8"), win);
  return win.RTArt;
}
const V = "2026-10-19 17:00:00", U = "2026-10-19 18:00:00";
const vil = (t, o) => Object.entries(o).map(([category, value]) => ({ fcst: t, category, value, base: V }));
const ult = (t, o) => Object.entries(o).map(([category, value]) => ({ fcst: t, category, value, base: U, release: "2026-10-19 18:30:00" }));
const hours = hourlyForecast({
  fromWall: "2026-10-19 19:00:00",
  vilRows: [...vil("2026-10-19 19:00:00", { TMP: 17, POP: 0, PTY: 0, PCP: "강수없음", SKY: 1, REH: 70, WSD: 1 }), ...vil("2026-10-19 20:00:00", { TMP: 16, POP: 30, PTY: 0, PCP: "강수없음", SKY: 3, REH: 70, WSD: 1 }), ...vil("2026-10-20 03:00:00", { TMP: 12, POP: 70, PTY: 1, PCP: "1mm", SKY: 4, REH: 90, WSD: 2 })],
  ultraRows: [...ult("2026-10-19 19:00:00", { T1H: 17, PTY: 1, RN1: "1mm 미만", SKY: 4, REH: 80, WSD: 1 }), ...ult("2026-10-19 20:00:00", { T1H: 16, PTY: 0, RN1: "강수없음", SKY: 4, REH: 80, WSD: 1 })],
});
const at = (t) => hours.find((h) => h.time === t);

test("자료 그대로: 19시 강수형태·강수량은 초단기, 강수확률은 단기(0%) — 없는 값을 지어내지 않음", () => {
  const h = at("2026-10-19 19:00:00");
  assert.equal(h.pty, "비"); assert.equal(h.items.pty.source, "초단기예보");
  assert.equal(h.pop, 0); assert.equal(h.items.pop.source, "단기예보"); assert.equal(h.items.pop.base, V);
});

test("칸 아래 글자: 비 예보 칸은 그림과 같은 초단기 강수량, 우산+0% 를 같이 보이지 않음", () => {
  const A = art();
  const r = A.rainOf(at("2026-10-19 19:00:00"));
  assert.equal(r.wet, true); assert.equal(r.mismatch, true); assert.equal(r.sameRelease, false);
  assert.equal(r.text, "비"); assert.equal(r.amt, "1mm 미만"); // 기상청 표기 그대로
  assert.doesNotMatch(r.text + r.amt, /%/);
  assert.match(r.tip, /초단기예보 18:30 발표/); assert.match(r.tip, /강수확률 0%는 단기예보 17:00 발표 값/);
  // 비 없는 칸은 강수확률 그대로
  const d = A.rainOf(at("2026-10-19 20:00:00"));
  assert.equal(d.wet, false); assert.equal(d.text, "☂30%");
  // 같은 발표(단기)의 비 + 강수확률 70% 는 어긋남 아님
  const s = A.rainOf(at("2026-10-20 03:00:00"));
  assert.equal(s.wet, true); assert.equal(s.sameRelease, true); assert.equal(s.mismatch, false); assert.equal(s.text, "비"); assert.equal(s.amt, "1mm");
  assert.match(s.tip, /예상 강수량 1mm\(단기예보 17:00 발표\)/);
  // 강수확률 없음 ≠ 0
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "없음", pop: null, items: {} }).text, "");
  // 강수량 칸 없음 → '—'(0 아님), 범위 표기 그대로, 눈은 신적설
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "비", pop: 80, pcp: null, items: {} }).amt, "—");
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "비", pop: 80, pcp: "30.0~50.0mm", items: {} }).amt, "30.0~50.0mm");
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "눈", pop: 80, pcp: "1mm 미만", sno: "1cm 미만", items: {} }).amt, "1mm 미만 · 눈 1cm 미만");
  // 강수형태 없음 + 강수확률 60% 이상: 강수량 줄(없으면 —), 60% 미만은 줄 없음
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "없음", pop: 60, pcp: "강수 없음", items: {} }).amt, "강수 없음");
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "없음", pop: 60, pcp: null, items: {} }).amt, "—");
  assert.equal(A.rainOf({ time: "2026-10-19 21:00:00", pty: "없음", pop: 30, pcp: "강수 없음", items: {} }).amt, "");
});

test("신적설(SNO): 단기예보 값 그대로, 없으면 null", () => {
  assert.equal(at("2026-10-19 19:00:00").sno, null);
  const h = hourlyForecast({ fromWall: "2026-12-01 00:00:00", vilRows: vil("2026-12-01 03:00:00", { TMP: -2, POP: 80, PTY: 3, PCP: "1mm 미만", SNO: "1cm 미만", SKY: 4 }).map((r) => ({ ...r })) })[0];
  assert.equal(h.sno, "1cm 미만"); assert.equal(h.items.sno.source, "단기예보");
  assert.equal(hourlyForecast({ fromWall: "2026-12-01 00:00:00", vilRows: vil("2026-12-01 03:00:00", { TMP: 1, POP: 20, PTY: 0, SNO: "적설없음" }) })[0].sno, "적설 없음");
});

test("L01 문장: 초단기 비 + 단기 강수확률이면 강수확률의 발표를 따로 밝힘", () => {
  const series = hours.map((h) => ({ ...h, kind: "fcst" }));
  const r = CATALOG.L01({ sid: "156", nm: "광주", nowW: "2026-10-19 18:40", ymd: "2026-10-19", hour: 18, series, days: [], fcFresh: true, current: null });
  assert.equal(r.fired, true); assert.equal(r.cand.facts.state, "pty");
  assert.match(r.cand.text, /강수확률 최고 30%\(단기예보 10-19 17:00 발표\)\. 초단기예보 10-19 18:30 발표\./);
});
