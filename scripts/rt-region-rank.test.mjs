// '평소와 가장 다른 곳' 제목·문장·그래프 순서가 한 잣대(unusualOrder)로 맞는지 — 2026-10-19 09:00 부산/대구 사례
import { test } from "node:test";
import assert from "node:assert/strict";
import { regionFacts, regionCands } from "../rt-region.mjs";
import { rankRegions, unusualScore, unusualOrder } from "../rt-story-facts.mjs";
import { evaluateValue } from "../rt-baseline.mjs";

const T = "2026-10-19 09:00:00";
const mk = (id, name, temp, diff, pct, z, n = 540) => ({ id, name, time: T, temp, diffs: { all: diff }, pcts: { all: pct }, samples: { all: n }, zs: { all: z }, sds: { all: z ? Math.abs(diff / z) : null } });
// 운영 DB 값(1990~2025, ±7일, 09시 표본 540개) — z 는 배포 뒤 같은 표본 표준편차로 계산한 값
const LIVE = [mk("108", "서울", 12.5, -0.5, 37.7, -0.17), mk("112", "인천", 12.7, -1, 33.3, -0.33, 538), mk("119", "수원", 14.1, 1, 60, 0.33), mk("133", "대전", 14.9, 2.5, 79.4, 0.83), mk("143", "대구", 19.7, 5.8, 97.9, 2.09), mk("156", "광주", 17.8, 3.6, 90.6, 1.27), mk("159", "부산", 22.5, 5.2, 98.1, 1.8), mk("184", "제주", 20.9, 2.3, 86.3, 1.0)];
const ctx = { sid: "108", nm: "서울", tv: () => 1, LIFE_VALUE: { info: 0.5 }, basisId: "all" };
const top = (rows) => regionCands(regionFacts({ rows, time: T, basis: "all" }), ctx).find((c) => c.ruleId === "G01");

test("백분위 끝(97 이상)끼리는 평소 변동폭 대비(|z|)로 가름 — 부산 98.1 vs 대구 97.9 → 대구", () => {
  const c = top(LIVE);
  assert.equal(c.facts.id, "143");
  assert.match(c.title, /대구\(\+5\.8℃\)/);
  assert.match(c.text, /대구가 같은 시기 평소 분포에서 가장 드문 쪽/);
  assert.match(c.text, /부산이 백분위 98\.1로 거의 같아/);
  assert.doesNotMatch(c.text, /가장 멀어요/);
});

test("고른 지점 = 그래프 맨 위 = 강조 = 지역 순위 1위(같은 잣대)", () => {
  const cases = [
    LIVE,
    // 백분위 끝이 아니면 백분위 순: 가(96, +2℃)가 나(95, +4℃)보다 위 — 그래프도 광주가 맨 위
    [mk("1", "가", 10, 2, 96, 1.4), mk("2", "나", 10, 4, 95, 1.3), mk("3", "다", 10, 0, 50, 0), mk("4", "라", 10, -1, 30, -0.4), mk("5", "마", 10, 1, 60, 0.3), mk("6", "바", 10, 0.5, 55, 0.1)],
    // 추운 쪽: 백분위 1.5(z −2.5) vs 2.5(z −3.0) → z 가 더 큰 쪽
    [mk("1", "가", 0, -6, 1.5, -2.5), mk("2", "나", 0, -5, 2.5, -3.0), mk("3", "다", 10, 0, 50, 0), mk("4", "라", 10, -1, 30, -0.4), mk("5", "마", 10, 1, 60, 0.3), mk("6", "바", 10, 0.5, 55, 0.1)],
  ];
  for (const rows of cases) {
    const c = top(rows);
    assert.ok(c, "후보 있음");
    assert.equal(c.chart.order, "unusual");
    assert.equal(c.chart.rows[0].id, c.facts.id, "그래프 맨 위 = 고른 지점");
    assert.equal(c.chart.highlight, c.facts.id, "강조 = 고른 지점");
    assert.deepEqual(c.chart.rows.map((r) => r.id), unusualOrder(rows).map((r) => r.id));
    const rk = rankRegions(rows, ["all"]).rankings.all.deviation;
    assert.equal(rk[0].id, c.facts.id, "지역 순위 1위 = 고른 지점");
    assert.equal(rk[0].rank, 1);
  }
  assert.equal(top(cases[1]).facts.id, "1");
  assert.doesNotMatch(top(cases[1]).text, /거의 같아/);
  assert.equal(top(cases[2]).facts.id, "2");
  assert.match(top(cases[2]).text, /가가 백분위 1\.5로 거의 같아/);
});

test("unusualScore: 끝 구간은 언제나 그 밖보다 위, z 없으면 백분위만", () => {
  assert.ok(unusualScore(97, 1.5).score > unusualScore(96.9, 9).score);
  assert.equal(unusualScore(98, null).byZ, false);
  assert.equal(unusualScore(null, 2), null);
});

test("evaluateValue: 표본 표준편차·z(평균 대비 차이 ÷ 표준편차)", () => {
  const ref = { state: "ok", digits: 1, minRank: 3, samples: 4, validYears: 1, yearsInPeriod: 1, missingYears: [], meanRaw: 12, vals: [10, 12, 14], cnts: [1, 2, 1], max: [14, 0], min: [10, 0], q10: 10, q90: 14 };
  const o = evaluateValue(ref, 15);
  assert.equal(o.sd, 1.63); // √(8/3)
  assert.equal(o.z, 1.84);
});
