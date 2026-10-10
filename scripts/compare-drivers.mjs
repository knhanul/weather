#!/usr/bin/env node
// PostgreSQL 과 MySQL 저장소 함수 결과 비교 (같은 입력 → 같은 출력). 관리자 전용 화면(gaps·jobs)처럼 HTTP 로 비교하기 어려운 것 포함.
//   DATABASE_URL=… MYSQL_URL=… node scripts/compare-drivers.mjs
import assert from "node:assert/strict";
import * as pgdb from "../db.mjs";
import * as mydb from "../db-mysql.mjs";

delete process.env.DB_DRIVER;
await pgdb.initDb();
await mydb.init(process.env.MYSQL_URL);

const IDS = ["108", "112", "119", "133", "143", "156", "159", "184"];
const sortRows = (rows) => [...rows].map((r) => JSON.stringify(r)).sort();
const RANGES = [
  IDS.map((id) => ({ station_id: id, a: "2023-10-06 00", b: "2026-10-09 23" })),
  IDS.map((id) => ({ station_id: id, a: "2026-09-10 00", b: "2026-10-09 23" })),
  IDS.map((id) => ({ station_id: id, a: "2019-12-25 05", b: "2020-01-05 17" })),
  [{ station_id: "108", a: "2026-10-01 00", b: "2026-10-09 23" }],
];
const cases = [
  ["countHourly", []], ["countDaily", []], ["coverageHourly", []], ["seriesSeoul", []], ["stationSummariesPg", []],
  ["listJobs", []], ["listStationsPg", []],
  ...IDS.map((id) => ["latestHourPg", [id]]),
  ["seriesPg", ["108", "2026-09-01 00:00", "2026-10-09 23:00"]],
  ["seriesPg", ["159", "2020-01-01 00:00", "2020-12-31 23:00"]],
  ["queryHourlyPg", [{ stationId: "143", from: "2021-01-01 00:00:00", to: "2021-12-31 23:00:00", page: 2, pageSize: 3000 }]],
  ["gapBoundsPg", [IDS]],
  ...RANGES.map((r) => ["gapDayCountsPg", [r], true]),
  ...RANGES.map((r) => ["gapHourIntervalsPg", [r]]),
  ["gapOfficialDaysPg", [IDS, "2020-01-01", "2026-10-09"], true],
  ["hourlyForDaily", ["184", "2024-02-27", "2024-03-02"]],
  ["listDailyOfficial", ["108"]],
];
let bad = 0;
for (const [fn, args, unordered] of cases) {
  const t0 = Date.now();
  const a = await pgdb[fn](...args);
  const t1 = Date.now();
  const b = await mydb[fn](...args);
  const t2 = Date.now();
  try {
    if (unordered) assert.deepEqual(sortRows(b), sortRows(a));
    else assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
    console.log(`SAME ${fn}(${JSON.stringify(args).slice(0, 70)}) pg=${t1 - t0}ms mysql=${t2 - t1}ms n=${Array.isArray(a) ? a.length : typeof a === "object" && a ? Object.keys(a).length : a}`);
  } catch (e) {
    bad += 1;
    console.log(`DIFF ${fn}(${JSON.stringify(args).slice(0, 70)}) ${String(e.message).slice(0, 600)}`);
  }
}
console.log(bad ? `FAIL ${bad}` : "OK: 모든 함수 결과 같음");
await mydb.close();
process.exit(bad ? 1 : 0);
