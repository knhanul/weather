import test from "node:test";
import assert from "node:assert/strict";
import { forecastStatus } from "../rt-admin.mjs";

const now = Date.parse("2026-10-13T12:00:00Z"); // KST 21:00
test("예보 적재 현황: 기대 발표 × 격자 − 있는 발표 = 미적재, 아직 안 된 발표는 다음 발표", () => {
  const grids = [{ nx: 60, ny: 127 }, { nx: 98, ny: 76 }];
  const regions = [{ station_id: "108", ta_reg_id: "11B10101", land_reg_id: "11B00000", mid_stn_id: "109" }];
  const short = [];
  // 단기예보 48시간 발표(3시간 간격) 중 60,127 은 전부, 98,76 은 20시 발표만 빠짐
  for (let h = 0; h < 48; h++) {
    const t = new Date(now - h * 3600000 + 9 * 3600000);
    const H = t.getUTCHours();
    if (H % 3 !== 2) continue;
    const b = `${t.toISOString().slice(0, 10)} ${String(H).padStart(2, "0")}:00:00`;
    short.push({ dataset: "KMA_VILAGE_FCST", nx: 60, ny: 127, base: b, collectedAt: "2026-10-13T11:20:00.000Z" });
    if (b !== "2026-10-13 20:00:00") short.push({ dataset: "KMA_VILAGE_FCST", nx: 98, ny: 76, base: b, collectedAt: null });
  }
  const r = forecastStatus({ nowMs: now, hours: 48, grids, regions, releases: { short, mid: [{ dataset: "KMA_MID_TA", region: "11B10101", base: "2026-10-13 18:00:00", collectedAt: "2026-10-13T09:15:00Z" }] } });
  const v = r.datasets.find((d) => d.dataset === "KMA_VILAGE_FCST");
  assert.equal(v.expected, 16 * 2); assert.equal(v.missing, 1); assert.equal(v.have, 31);
  assert.deepEqual(v.missingList[0], { base: "2026-10-13 20:00:00", target: "98,76", recollectable: true });
  assert.equal(v.latestBase, "2026-10-13 20:00:00"); assert.equal(v.stale, false); assert.equal(v.nextRelease, "2026-10-13 23:00:00");
  const ta = r.datasets.find((d) => d.dataset === "KMA_MID_TA");
  assert.equal(ta.targets, 1); assert.equal(ta.missing, ta.expected - 1); assert.equal(ta.nextRelease, "2026-10-14 06:00:00");
  assert.ok(ta.missingList.some((m) => !m.recollectable), "24시간 넘은 발표는 다시 받을 수 없음");
  // 수집 시작 전 발표는 미적재로 세지 않음
  const r2 = forecastStatus({ nowMs: now, hours: 48, grids, regions, releases: { short, mid: [] }, firstBase: { KMA_VILAGE_FCST: "2026-10-13 02:00:00" } });
  const v2 = r2.datasets.find((d) => d.dataset === "KMA_VILAGE_FCST");
  assert.equal(v2.expected, 7 * 2); assert.equal(v2.missing, 1); assert.equal(v2.beforeStart, 9); assert.equal(v2.collectingSince, "2026-10-13 02:00:00");
  const nc = r.datasets.find((d) => d.dataset === "KMA_ULTRA_NCST");
  assert.equal(nc.have, 0); assert.equal(nc.stale, true); assert.equal(nc.latestBase, null);
});
