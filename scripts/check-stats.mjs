#!/usr/bin/env node
// 요약표(hourly_month_stats·daily_station_stats) 값이 원본 전체 집계와 같은지 확인(읽기 전용). 원본 집계는 NAS 에서 수십 초 걸린다.
//   MYSQL_URL=… node scripts/check-stats.mjs
import assert from "node:assert/strict";
const mysql = (await import("mysql2/promise")).default;
const c = await mysql.createConnection(process.env.MYSQL_URL);
const qq = async (sql) => JSON.parse(JSON.stringify((await c.query(sql))[0]));
const pairs = [
  ["countHourly", "SELECT CAST(COALESCE(SUM(n_rows),0) AS SIGNED) AS n FROM hourly_month_stats", "SELECT COUNT(*) AS n FROM observations_hourly"],
  ["countDaily", "SELECT CAST(COALESCE(SUM(n_rows),0) AS SIGNED) AS n FROM daily_station_stats", "SELECT COUNT(*) AS n FROM observations_daily"],
  ["coverage", `SELECT dataset, CAST(SUM(n_rows) AS SIGNED) AS records, COUNT(DISTINCT station_id) AS stations, MIN(first_dt) AS first, MAX(last_dt) AS last FROM hourly_month_stats GROUP BY dataset`,
    `SELECT dataset, COUNT(*) AS records, COUNT(DISTINCT station_id) AS stations, MIN(observation_datetime) AS first, MAX(observation_datetime) AS last FROM observations_hourly GROUP BY dataset`],
  ["summaries", `SELECT station_id, CAST(SUM(n_rows) AS SIGNED) AS n_rows, CAST(SUM(h) AS SIGNED) AS hours, LEFT(MIN(f),16) AS first_observation, LEFT(MAX(l),16) AS last_observation
     FROM (SELECT station_id, ym, SUM(n_rows) AS n_rows, MAX(hours) AS h, MIN(first_dt) AS f, MAX(last_dt) AS l FROM hourly_month_stats GROUP BY station_id, ym) x GROUP BY station_id ORDER BY station_id`,
    `SELECT station_id, COUNT(*) AS n_rows, COUNT(DISTINCT LEFT(observation_datetime,16)) AS hours, LEFT(MIN(observation_datetime),16) AS first_observation, LEFT(MAX(observation_datetime),16) AS last_observation FROM observations_hourly GROUP BY station_id ORDER BY station_id`],
  ["dayCounts", "SELECT station_id, d, n, n_rows AS `rows` FROM hourly_day_stats ORDER BY station_id, d",
    "SELECT station_id, LEFT(observation_datetime,10) AS d, COUNT(DISTINCT LEFT(observation_datetime,13)) AS n, COUNT(*) AS `rows` FROM observations_hourly GROUP BY station_id, d ORDER BY station_id, d"],
];
let bad = 0;
for (const [name, fast, slow] of pairs) {
  let t = Date.now();
  const a = await qq(fast);
  const ta = Date.now() - t;
  t = Date.now();
  const b = await qq(slow);
  const tb = Date.now() - t;
  try {
    assert.deepEqual(a, b);
    console.log(`OK   ${name.padEnd(12)} stats ${ta}ms · full ${tb}ms`);
  } catch {
    bad++;
    console.log(`DIFF ${name}`, JSON.stringify(a).slice(0, 300), "≠", JSON.stringify(b).slice(0, 300));
  }
}
await c.end();
process.exit(bad ? 1 : 0);
