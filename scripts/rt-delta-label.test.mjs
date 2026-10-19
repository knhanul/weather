// 가장 큰 변화 제목: 변화량(Δ)이 절대 기온처럼 보이면 안 됨 — '아침 최저 −7℃' 대신 '아침 최저 8℃, 7℃ 하강'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bigChanges, deltaWord } from "../rt-changes.mjs";

const hrs = (from, tas, extra = {}) => tas.map((ta, i) => { const d = new Date(Date.parse(`${from}:00Z`) + i * 36e5).toISOString(); return { time: `${d.slice(0, 10)} ${d.slice(11, 16)}:00`, ta, ws: 2, hm: 60, pop: 10, pty: "없음", source: "단기예보", ...extra }; });
// 숫자 바로 앞 부호(+·−·-) + ℃ 꼴은 변화량을 절대값처럼 보이게 함
const SIGNED = /(^|[^\d])[+−-]\d+(\.\d+)?\s*[℃°]/;

test("deltaWord: 부호 대신 말", () => {
  assert.equal(deltaWord(-7), "7℃ 하강");
  assert.equal(deltaWord(5.2), "5.2℃ 상승");
  assert.equal(deltaWord(25, "%p"), "25%p 상승");
});

test("아침 최저 변화: 제목은 절대 최저 + 하강 폭(광주 10/22 사례)", () => {
  const days = [{ date: "2026-10-19", min: 14, max: 22 }, { date: "2026-10-20", min: 15, max: 23 }, { date: "2026-10-21", min: 15, max: 22 }, { date: "2026-10-22", min: 8, max: 18, minSource: "단기예보" }];
  const r = bigChanges({ hours: [], days, today: "2026-10-19", nowW: "2026-10-19 21:00" });
  const x = r.items.find((i) => i.kind === "tmn");
  assert.ok(x, "tmn 후보");
  assert.equal(x.title, "10/22 아침 최저 8℃, 7℃ 하강");
  assert.equal(x.short, "최저 15→8℃ (7℃↓)");
  assert.match(x.sub, /최저 15℃ → 10\/22 8℃/);
  assert.doesNotMatch(x.title, /−7|-7/);
});

test("모든 변화 제목·요약·짧은 표지에 부호 붙은 ℃ 가 없음", () => {
  const hours = [...hrs("2026-10-19T22:00", [20, 20, 20, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 22, 22, 22, 22])];
  hours.forEach((h, i) => { if (i >= 6) { h.hm = 95; h.ws = i >= 9 ? 9 : 2; } });
  const days = [{ date: "2026-10-19", min: 14, max: 18 }, { date: "2026-10-20", min: 4, max: 20 }, { date: "2026-10-21", min: 12, max: 22 }];
  const r = bigChanges({ hours, days, today: "2026-10-19", nowW: "2026-10-19 21:00" });
  assert.ok(r.found >= 3);
  for (const x of r.items) for (const k of ["title", "sub", "short"]) if (x[k]) assert.doesNotMatch(x[k], SIGNED, `${x.kind}.${k}: ${x[k]}`);
});

test("화면 코드: 규칙별 예보 변화 목록·T03 이야기 문장에 부호 변화량 없음", () => {
  const v = readFileSync(new URL("../public/rt-forecast-visual.js", import.meta.url), "utf8");
  assert.doesNotMatch(v, /\(\$\{sg\(-best\.dv\)\}\)/);
  assert.doesNotMatch(v, /보다 \$\{sg\(jump\.dv\)\}/);
  const c = readFileSync(new URL("../rt-story-catalog.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(c, /\{sd\}℃/);
});
