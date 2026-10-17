import test from "node:test";
import assert from "node:assert/strict";
import { describeDifference, fnv1a32, pickTemplate, render, fill, warmWord } from "../rt-story-templates.mjs";
import { runningJudgement, rankRegions, seasonExposure, emptyReasonOf, toStory, commonTime } from "../rt-story-facts.mjs";
import { RULES_VERSION, SELECT_RULES } from "../rt-story-rules.mjs";
import { diffWord, firstHotDay, MIN_SAMPLES_RANK, WINDOW_DAYS } from "../rt-baseline.mjs";
import { STORY_RULE, selectStories } from "../rt-stories.mjs";
import { OUTDOOR_DEFAULT, buildDailyStore } from "../stats-engine.mjs";

test("규칙 모듈: 기존 상수와 같은 값(숫자 바뀌지 않음)", () => {
  assert.equal(MIN_SAMPLES_RANK, 60);
  assert.equal(WINDOW_DAYS, 7);
  assert.deepEqual(STORY_RULE, { minUnusual: 0.3, wUnusual: 0.6, wInfo: 0.4, forecastFactor: 0.9, recentFactor: 0.5, max: 4 });
  assert.equal(STORY_RULE, SELECT_RULES);
  assert.match(RULES_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test("describeDifference: 기온·습도·풍속 단계 경계(8장), 강수는 고정 mm 등급 없음", () => {
  const lv = (m, d) => describeDifference(m, d).level;
  assert.equal(lv("ta", 0.99), "similar");
  assert.equal(lv("ta", -1), "slight");
  assert.equal(lv("ta", 2.99), "slight");
  assert.equal(lv("ta", 3), "notable");
  assert.equal(lv("ta", -5), "large");
  assert.equal(describeDifference("ta", -5).direction, "down");
  assert.equal(describeDifference("ta", 0.4).direction, "flat");
  assert.equal(lv("hm", 4.9), "similar");
  assert.equal(lv("hm", 10), "notable");
  assert.equal(describeDifference("hm", 20).unit, "%p");
  assert.equal(lv("ws", 1.5), "slight");
  assert.equal(describeDifference("ws", 4).level, "large");
  assert.equal(describeDifference("ta", null), null);
  assert.equal(describeDifference("ta", NaN), null);
  assert.equal(describeDifference("rn", 3, { samplesOk: false }).level, null);
  assert.equal(describeDifference("rn", null, { samplesOk: true, percentile: 95 }).phrase, "많은 편");
  assert.equal(describeDifference("rn", null, { samplesOk: true, percentile: 99.5 }).level, "veryMany");
});

test("diffWord 는 예전과 같은 말(단계를 describeDifference 에서)", () => {
  assert.equal(diffWord(0.9), "비슷");
  assert.equal(diffWord(1), "조금 높음");
  assert.equal(diffWord(-3, "높", "낮"), "꽤 낮음");
  assert.equal(diffWord(5), "상당히 높음");
  assert.equal(diffWord(NaN), null);
  assert.equal(warmWord(5.7), "평소보다 상당히 더워요(+5.7℃)");
  assert.equal(warmWord(-0.5), "평소와 비슷해요(-0.5℃)");
});

test("문장 틀: 같은 키면 늘 같은 틀, 빈 값이 있는 틀은 건너뜀", () => {
  assert.equal(fnv1a32("abc"), 440920331);
  const T = [{ id: "a", title: "A {x}" }, { id: "b", title: "B {x}" }, { id: "c", title: "C {y}" }];
  const k = { station: "108", date: "2026-10-17", ruleId: "r", eventId: "e" };
  const r1 = render(k, T, { x: 1 }), r2 = render(k, T, { x: 1 });
  assert.deepEqual(r1, r2);
  assert.ok(!/C /.test(r1.title)); // y 가 없으니 C 는 못 씀
  assert.match(r1.templateId, /^r\.[ab]\.v\d+$/);
  const days = new Set(); for (let d = 10; d < 30; d++) days.add(pickTemplate({ ...k, date: `2026-10-${d}` }, T).id);
  assert.ok(days.size > 1); // 날짜가 바뀌면 다른 틀도 나옴
  assert.equal(fill("{a}℃", { a: null }), null);
  assert.equal(fill("{a}℃", { a: 0 }), "0℃"); // 0 은 값
  assert.equal(render(k, [{ id: "z", title: "{q}", when: () => false }], {}), null);
});

test("러닝 판정: 결측은 '판단 보류', 0 은 값, 알려진 실패는 실패", () => {
  const c = OUTDOOR_DEFAULT;
  const u = runningJudgement({ ta: 18, rn1: null, ws: 2 }, c);
  assert.equal(u.status, "unknown");
  assert.equal(u.answer, "강수 자료가 없어 판단 보류");
  assert.equal(runningJudgement({ ta: 18, rn1: 0, ws: 2 }, c).status, "pass");
  assert.equal(runningJudgement({ ta: 18, rn1: 0, ws: 2 }, c).answer, "선택한 날씨 조건에 맞음");
  const f = runningJudgement({ ta: 18, rn1: 0.5, ws: null }, c);
  assert.equal(f.status, "fail"); // 비가 확인되면 풍속이 없어도 실패
  assert.equal(f.answer, "조건에 맞지 않음 — 비");
  assert.equal(runningJudgement({ ta: 30, rn1: 0, ws: 7 }, c).answer, "조건에 맞지 않음 — 기온이 높음·바람");
  assert.equal(runningJudgement({ ta: 18, rn1: null, ws: null }, c).answer, "강수 자료가 없고 풍속 자료가 없어 판단 보류");
  assert.equal(runningJudgement({ ta: null, rn1: 0, ws: 1 }, c).status, "unknown");
});

test("지역 순위: 동률 같은 순위, 추운 쪽도 '벗어난 순'에, 다른 실황 시각은 뺌", () => {
  const T = "2026-10-17 15:00:00";
  const row = (id, temp, diff, pct, time = T) => ({ id, name: id, time, temp, diffs: { all: diff }, pcts: { all: pct }, samples: { all: 540 } });
  const rows = [row("a", 20, 3, 90), row("b", 22, 3, 92), row("c", 10, -6, 2), row("d", 15, 0.5, 55), row("e", 30, 9, 99.9, "2026-10-17 14:00:00"), { id: "f", name: "f", temp: null }];
  const r = rankRegions(rows, ["all"]);
  assert.equal(r.time, T);
  assert.equal(r.comparable, 4);
  assert.deepEqual(r.excluded.map((x) => x.id), ["e"]);
  const up = r.rankings.all.aboveAvg;
  assert.deepEqual(up.map((x) => [x.id, x.rank]), [["a", 1], ["b", 1], ["d", 3], ["c", 4]]);
  assert.ok(up.every((x) => x.of === 4));
  const dv = r.rankings.all.deviation;
  assert.equal(dv[0].id, "c"); // 백분위 2 → 추운 쪽으로 가장 크게 벗어남
  assert.equal(dv[0].direction, "low");
  assert.equal(dv[0].deviation, 0.96);
  assert.deepEqual(r.rankTemp.map((x) => x.rank), [1, 2, 3, 4]);
  assert.equal(commonTime([{ time: "x" }, { time: "y" }, { time: "y" }]), "y");
});

test("계절 노출: 3~9월·사건 뒤 7일, '처음' 확정 못 하면 홈 제외", () => {
  assert.equal(seasonExposure("first-hot-day", { date: "2026-06-10", firstConfirmed: true }, "2026-10-17").home, false);
  assert.match(seasonExposure("first-hot-day", { date: "2026-06-10", firstConfirmed: true }, "2026-10-17").reason, /노출 기간 밖/);
  assert.equal(seasonExposure("first-hot-day", { date: "2026-07-01", firstConfirmed: true }, "2026-07-08").home, true);
  assert.equal(seasonExposure("first-hot-day", { date: "2026-07-01", firstConfirmed: true }, "2026-07-09").home, false);
  assert.equal(seasonExposure("first-hot-day", { date: "2026-07-01", firstConfirmed: false }, "2026-07-02").home, false);
  assert.equal(seasonExposure("first-hot-day", { date: null }, "2026-07-02").home, false);
});

test("firstHotDay: 기존 date·doy 그대로 + 사건 전 결측·확정·자료 비율", () => {
  const rows = [];
  for (let d = 1; d <= 30; d++) if (d !== 5) rows.push({ observation_date: `2026-01-${String(d).padStart(2, "0")}`, max_temperature: d === 20 ? 31 : 5, min_temperature: 0, avg_temperature: 2 });
  const s = buildDailyStore("108", rows);
  const r = firstHotDay(s, 2026, "01-30");
  assert.equal(r.date, "2026-01-20");
  assert.equal(r.doy, 20);
  assert.equal(r.missingBeforeEvent, 1);
  assert.equal(r.firstConfirmed, false);
  assert.equal(r.coverage, 0.95);
  const n = firstHotDay(s, 2026, "01-10");
  assert.equal(n.date, null);
  assert.equal(n.missing, 1);
  assert.equal(n.coverage, 0.9);
});

test("빈 이야기 사유: normal 은 판단 가능한 자료가 있을 때만", () => {
  const none = { stories: [] };
  const ok = { key: "now-anomaly", samples: 540, minSamples: 60 };
  assert.equal(emptyReasonOf({ stories: [{}] }, { fresh: true, candidates: [] }), null);
  assert.equal(emptyReasonOf(none, { fresh: true, candidates: [ok] }), "normal");
  assert.equal(emptyReasonOf(none, { fresh: true, candidates: [{ ...ok, samples: 10 }] }), "insufficient");
  assert.equal(emptyReasonOf(none, { fresh: true, candidates: [] }), "insufficient");
  assert.equal(emptyReasonOf(none, { fresh: false, candidates: [ok] }), "stale");
  assert.equal(emptyReasonOf(none, { fresh: true, candidates: [ok], failedParts: ["regions"] }), "error");
});

test("selectStories: exclude 사유는 점수 전에 빠짐 / toStory 는 기존 필드를 지키고 계약 필드를 더함", () => {
  const r = selectStories([{ key: "x", phenomenon: "p", kind: "관측", unusual: 1, samples: 100, minSamples: 60, info: 1, text: "t", exclude: "계절 노출 기간 밖" }]);
  assert.equal(r.stories.length, 0);
  assert.deepEqual(r.dropped, [{ key: "x", reason: "계절 노출 기간 밖" }]);
  const s = toStory({ key: "rec-obs-2026-10-12", kind: "관측", title: "T", text: "B", basis: "ASOS", samples: 100, minSamples: 60, score: 0.5 }, { station: "108", asOf: "2026-10-17 15:00" });
  assert.equal(s.key, "rec-obs-2026-10-12");
  assert.equal(s.kind, "관측");
  assert.equal(s.kindId, "observation");
  assert.equal(s.ruleId, "rec-obs");
  assert.equal(s.body, "B");
  assert.equal(s.evidence.status, "ok");
  assert.equal(s.rulesVersion, RULES_VERSION);
  assert.equal(s.selection.score, 0.5);
});
