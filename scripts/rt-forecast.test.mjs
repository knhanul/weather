import test from "node:test";
import assert from "node:assert/strict";
import { hourlyForecast, shortDaySummary, extremesByDate, midByDate, stitchDays, forecastChanges } from "../rt-forecast.mjs";

const vil = [];
for (const d of ["2026-10-13", "2026-10-14"]) for (let h = 0; h < 24; h++) {
  const t = `${d} ${String(h).padStart(2, "0")}:00:00`;
  vil.push({ fcst: t, category: "TMP", value: "10", base: "2026-10-13 17:00:00" }, { fcst: t, category: "POP", value: h === 15 ? "60" : "20", base: "2026-10-13 17:00:00" }, { fcst: t, category: "PCP", value: h === 15 ? "2.5mm" : h === 16 ? "1mm 미만" : "강수없음", base: "2026-10-13 17:00:00" }, { fcst: t, category: "SKY", value: "3", base: "x" });
}
const ultra = [{ fcst: "2026-10-13 20:00:00", category: "T1H", value: "12", base: "2026-10-13 18:00:00", release: "2026-10-13 18:30:00" }];

test("시간별: 초단기 > 단기, 발표시각 보존", () => {
  const h = hourlyForecast({ vilRows: vil, ultraRows: ultra, fromWall: "2026-10-13 19:00:00" });
  assert.equal(h[0].time, "2026-10-13 19:00:00");
  assert.equal(h[0].source, "단기예보");
  assert.equal(h[1].ta, 12);
  assert.equal(h[1].source, "초단기예보");
  assert.equal(h[1].base, "2026-10-13 18:30:00");
  assert.equal(h[1].pop, 20); // 강수확률은 단기예보 값
});

test("날짜 요약: 강수확률은 최댓값(더하지 않음), 강수량은 숫자만 더하고 범위 표기는 시간 수", () => {
  const h = hourlyForecast({ vilRows: vil, ultraRows: [], fromWall: "2026-10-14 00:00:00" });
  const s = shortDaySummary(h).get("2026-10-14");
  assert.equal(s.popMax, 60);
  assert.equal(s.rainMm, 2.5);
  assert.equal(s.rainRangeHours, 1);
  assert.equal(s.rainHours, 2);
});

test("이어 붙이기: 단기가 있으면 단기, 없으면 중기 / 중기 날짜 = 발표일 + day", () => {
  const ext = extremesByDate([
    { category: "TMX", base: "2026-10-13 05:00:00", fcst: "2026-10-14 15:00:00", value: "20.0" },
    { category: "TMX", base: "2026-10-13 17:00:00", fcst: "2026-10-14 15:00:00", value: "21.0" },
  ]);
  const ta = [
    { tmFc: "2026-10-13 06:00:00", metric: "taMax", day: 4, value: "18" },
    { tmFc: "2026-10-13 18:00:00", metric: "taMax", day: 4, value: "19" },
    { tmFc: "2026-10-13 18:00:00", metric: "taMin", day: 4, value: "8" },
    { tmFc: "2026-10-13 18:00:00", metric: "taMax", day: 1, value: "99" }, // 단기와 겹치는 날 — 쓰지 않음
  ];
  const land = [{ tmFc: "2026-10-13 18:00:00", metric: "wf", day: 4, ampm: "Am", value: "맑음" }, { tmFc: "2026-10-13 18:00:00", metric: "wf", day: 4, ampm: "Pm", value: "구름많음" }, { tmFc: "2026-10-13 18:00:00", metric: "rnSt", day: 4, ampm: "Am", value: "10" }, { tmFc: "2026-10-13 18:00:00", metric: "rnSt", day: 4, ampm: "Pm", value: "30" }];
  const mid = midByDate(ta, land);
  const days = stitchDays({ today: "2026-10-13", extremes: ext, shortDays: new Map(), mid, days: 6 });
  assert.equal(days[1].max, 21);
  assert.equal(days[1].maxSource, "단기예보");
  assert.equal(days[1].maxBase, "2026-10-13 17:00:00");
  assert.equal(days[4].date, "2026-10-17");
  assert.equal(days[4].max, 19);
  assert.equal(days[4].maxSource, "중기예보");
  assert.equal(days[4].pop, 30);
  assert.equal(days[4].wf, "맑음 / 구름많음");
  assert.ok(days[5].none);
  const ch = forecastChanges(ext, mid, ["2026-10-14", "2026-10-17"]);
  assert.deepEqual(ch[0].max.map((x) => [x.source, x.value]), [["단기예보", 20], ["단기예보", 21], ["중기예보", 99]]); // 변화 이력은 출처를 붙여 모두 보여 줌
  assert.deepEqual(ch[1].max.map((x) => [x.source, x.value]), [["중기예보", 18], ["중기예보", 19]]);
});
