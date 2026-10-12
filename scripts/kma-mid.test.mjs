// 기상청 중기예보 적재(kma-mid.mjs): 발표시각, 항목 나누기, 응답 판정(99 조회기간), 수집(건너뛰기·실패 집계)
import { test } from "node:test";
import assert from "node:assert/strict";
import { midReleaseTimes, parseMidItem, readMidResponse, collectMid, MID_REGIONS } from "../kma-mid.mjs";

const kst = (s) => Date.parse(s.replace(" ", "T") + "+09:00");

test("releases: 06·18시, 발표 10분 뒤부터, 최근 36시간", () => {
  assert.deepEqual(midReleaseTimes(kst("2026-10-13 08:31"), 36), ["2026-10-12 06:00:00", "2026-10-12 18:00:00", "2026-10-13 06:00:00"]);
  assert.deepEqual(midReleaseTimes(kst("2026-10-13 06:05"), 24), ["2026-10-12 18:00:00"]);
  assert.deepEqual(midReleaseTimes(kst("2026-10-13 18:15"), 13), ["2026-10-13 06:00:00", "2026-10-13 18:00:00"]);
});

test("parse: item keys split into metric/day/ampm, values as strings", () => {
  const rows = parseMidItem("KMA_MID_TA", { regId: "11B10101", taMin4: 14, taMin4Low: 1, taMax10High: 3 }, "11B10101", "2026-10-13 06:00:00");
  assert.deepEqual(rows.map((r) => [r.item_key, r.metric, r.day_offset, r.ampm, r.value]), [["taMin4", "taMin", 4, "", "14"], ["taMin4Low", "taMinLow", 4, "", "1"], ["taMax10High", "taMaxHigh", 10, "", "3"]]);
  const land = parseMidItem("KMA_MID_LAND", { regId: "11B00000", rnSt4Am: 10, wf5Pm: "흐리고 비", wf8: "맑음", rnSt9: 10 }, "11B00000", "2026-10-13 06:00:00");
  assert.deepEqual(land.map((r) => [r.metric, r.day_offset, r.ampm, r.value]), [["rnSt", 4, "Am", "10"], ["wf", 5, "Pm", "흐리고 비"], ["wf", 8, "", "맑음"], ["rnSt", 9, "", "10"]]);
  const [sv] = parseMidItem("KMA_MID_FCST", { wfSv: "○ (강수) …" }, "109", "2026-10-13 06:00:00");
  assert.deepEqual([sv.item_key, sv.metric, sv.day_offset, sv.ampm], ["wfSv", "wfSv", null, ""]);
});

test("response: 99 조회기간 = none, other 99 = error, 03 = none", () => {
  const h = (c, m) => JSON.stringify({ response: { header: { resultCode: c, resultMsg: m } } });
  assert.equal(readMidResponse(200, h("99", "최대 조회 기간은 오늘 기준으로 1일 전까지입니다.")).none, "OUT_OF_RANGE");
  assert.throws(() => readMidResponse(200, h("99", "UNKNOWN_ERROR")), /99/);
  assert.equal(readMidResponse(200, h("03", "NO_DATA")).none, "NO_DATA");
  assert.throws(() => readMidResponse(403, "Forbidden"), /Forbidden/);
});

test("regions: 8 stations, 6 forecast areas", () => {
  assert.equal(Object.keys(MID_REGIONS).length, 8);
  assert.equal(new Set(Object.values(MID_REGIONS).map((r) => r.land_reg_id)).size, 6);
  assert.equal(new Set(Object.values(MID_REGIONS).map((r) => r.ta_reg_id)).size, 8);
  assert.deepEqual(MID_REGIONS[108], { mid_stn_id: "109", land_reg_id: "11B00000", ta_reg_id: "11B10101" });
});

test("collect: skips completed, counts none/failed, failed release retried next run", async () => {
  const marks = new Map([["11B10101|2026-10-12 18:00:00", 1]]);
  const store = {
    completedMid: async () => new Set(marks.keys()),
    upsertMid: async (rows) => ({ inserted: rows.length, updated: 0 }),
    markMid: async (_d, r, t, n, raw) => { assert.ok(JSON.parse(raw)); marks.set(`${r}|${t}`, n); },
  };
  let bad = true;
  const fetchImpl = async (url) => {
    const p = Object.fromEntries(url.searchParams);
    const ok = (item) => ({ status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: 1, items: { item: [item] } } } }) });
    if (p.tmFc === "202610120600") return { status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }) };
    if (p.regId === "11H20201" && p.tmFc === "202610130600" && bad) return { status: 403, text: async () => "Forbidden" };
    return ok({ regId: p.regId, taMin4: 1, taMax4: 2 });
  };
  const args = { dataset: "KMA_MID_TA", key: "k", regions: ["11B10101", "11H20201"], store, nowMs: kst("2026-10-13 08:31"), hours: 36, fetchImpl };
  const r = await collectMid(args);
  assert.deepEqual([r.skipped, r.none, r.releases, r.failed, r.received], [1, 2, 2, 1, 4]);
  assert.match(r.errors[0], /11H20201 2026-10-13 06:00: .*Forbidden/);
  bad = false;
  const r2 = await collectMid(args);
  assert.deepEqual([r2.skipped, r2.none, r2.releases, r2.failed], [3, 2, 1, 0]);
});
