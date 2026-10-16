import test from "node:test";
import assert from "node:assert/strict";
import { windHours } from "../rt-forecast-wind.mjs";
test("windHours: ultra over vilage, from wall", () => {
  const vil = [{ fcst: "2026-10-16 22:00:00", category: "VEC", value: "90", base: "B1" }, { fcst: "2026-10-16 22:00:00", category: "WSD", value: "2", base: "B1" }, { fcst: "2026-10-17 01:00:00", category: "VEC", value: "180", base: "B1" }, { fcst: "2026-10-16 20:00:00", category: "VEC", value: "1", base: "B1" }];
  const ul = [{ fcst: "2026-10-16 22:00:00", category: "T1H", value: "17", base: "U" }, { fcst: "2026-10-16 22:00:00", category: "VEC", value: "270", base: "U" }];
  const r = windHours({ vilRows: vil, ultraRows: ul, fromWall: "2026-10-16 22:00:00" });
  assert.deepEqual(r, [{ time: "2026-10-16 22:00:00", vec: 270, ws: 2, source: "초단기예보", base: "U" }, { time: "2026-10-17 01:00:00", vec: 180, ws: null, source: "단기예보", base: "B1" }]);
});
