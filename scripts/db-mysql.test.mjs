// MySQL(NAS) 저장소의 순수 함수 테스트 (DB 접속 없음)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitStatements, buildBatches, upsertShape, pickLongestPerT, poolOptions, MYSQL_MIGRATIONS_DIR } from "../db-mysql.mjs";
import { hourGapIntervals, h13ToMs, msToH13, prefixUpper, mergeDailyExport } from "../db-common.mjs";
import { buildUpsert } from "../db.mjs";
import { HOURLY_EXTRA } from "../kma-fields.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("mysql 0001: 문장 8개(표 8개, hub_migrations 는 실행기가 만든다), 모든 표 InnoDB·utf8mb4_bin, 인덱스 열 길이 767바이트 이하", () => {
  const sts = splitStatements(fs.readFileSync(path.join(MYSQL_MIGRATIONS_DIR, "0001_init.sql"), "utf8"));
  assert.equal(sts.length, 8);
  for (const s of sts) {
    assert.match(s, /^CREATE TABLE IF NOT EXISTS /);
    assert.match(s, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin$/);
    for (const m of s.matchAll(/^\s+(\w+) VARCHAR\((\d+)\)/gm)) assert.ok(Number(m[2]) * 4 <= 767, `${m[1]} 너무 김`);
  }
});

test("mysql 0001: pg 의 시간자료 열(기존 + 0003 전체 항목 + raw)이 모두 있다", () => {
  const sql = fs.readFileSync(path.join(MYSQL_MIGRATIONS_DIR, "0001_init.sql"), "utf8");
  const hourly = sql.slice(sql.indexOf("observations_hourly"), sql.indexOf("observations_daily"));
  for (const c of ["provider", "dataset", "station_id", "observation_datetime", "temperature", "quality_temperature", "source_kind", ...HOURLY_EXTRA.map((f) => f.col), "raw"]) {
    assert.match(hourly, new RegExp(`^  ${c} `, "m"), c);
  }
});

test("upsertShape 는 pg buildUpsert 와 같은 열·값을 고른다 (full / 예전 행)", () => {
  const base = [["station_id", "108"], ["observation_datetime", "2026-01-01 00:00"], ["temperature", 1.5]];
  for (const full of [true, false]) {
    const extra = { fields: HOURLY_EXTRA, values: { dew_point: -3.2 }, raw: { tm: "2026-01-01 00:00", ta: "1.5" } };
    const pgQ = buildUpsert({ table: "observations_hourly", base, conflict: "x", update: ["temperature"], extra, full });
    const myQ = upsertShape({ base, extra, full });
    const pgCols = /\(([^)]+)\)\s+VALUES/.exec(pgQ.text)[1].split(",").map((s) => s.trim());
    assert.deepEqual(myQ.cols, pgCols);
    assert.deepEqual(myQ.vals, pgQ.values);
  }
});

test("buildBatches: 같은 열 모양끼리 묶고, 400행·600KB 를 넘지 않게 자른다", () => {
  const big = "x".repeat(1000);
  const shaped = [];
  for (let i = 0; i < 1000; i++) shaped.push({ cols: ["station_id", "observation_datetime", "raw"], vals: ["108", `t${i}`, big], extraUpdate: ["raw"] });
  shaped.push({ cols: ["station_id", "observation_datetime"], vals: ["108", "z"], extraUpdate: [] });
  const b = buildBatches({ table: "observations_hourly", shaped, update: ["station_name"] });
  assert.equal(b.reduce((n, x) => n + x.count, 0), 1001);
  for (const x of b) {
    assert.ok(x.count <= 400);
    assert.ok(x.params.reduce((n, v) => n + String(v).length, 0) < 700 * 1024);
  }
  assert.match(b[0].sql, /ON DUPLICATE KEY UPDATE `station_name` = VALUES\(`station_name`\), `raw` = VALUES\(`raw`\)$/);
  assert.doesNotMatch(b[b.length - 1].sql, /`raw`/);
  assert.equal(b[b.length - 1].count, 1);
});

test("pickLongestPerT: 같은 시각이 HH:MM / HH:MM:SS 로 둘 다 있으면 긴 쪽 (pg DISTINCT ON 과 같음)", () => {
  const rows = [
    { t: "2026-01-01 00:00", v: "short" },
    { t: "2026-01-01 00:00", v: "long" },
    { t: "2026-01-01 01:00", v: "only" },
  ];
  assert.deepEqual(pickLongestPerT(rows).map((r) => r.v), ["long", "only"]);
});

test("hourGapIntervals: 빈 시각을 연속 구간으로 (양 끝 포함, 월말·연말 넘김)", () => {
  const have = new Set(["2025-12-31 22", "2026-01-01 01"]);
  const iv = hourGapIntervals("108", "2025-12-31 21", "2026-01-01 03", have);
  assert.deepEqual(iv, [
    { station_id: "108", s: "2025-12-31 21", e: "2025-12-31 21", n: 1 },
    { station_id: "108", s: "2025-12-31 23", e: "2026-01-01 00", n: 2 },
    { station_id: "108", s: "2026-01-01 02", e: "2026-01-01 03", n: 2 },
  ]);
  assert.equal(msToH13(h13ToMs("2024-02-29 23") + 3600000), "2024-03-01 00");
  assert.deepEqual(hourGapIntervals("1", "2026-01-01 00", "2026-01-01 02", new Set(["2026-01-01 00", "2026-01-01 01", "2026-01-01 02"])), []);
});

test("prefixUpper: left(x, len(p)) <= p 를 인덱스 범위 x <= p~ 로", () => {
  const p = "2026-01-01 05:00";
  for (const x of ["2026-01-01 05:00", "2026-01-01 05:00:00", "2026-01-01 04:59:59"]) assert.ok(x <= prefixUpper(p), x);
  for (const x of ["2026-01-01 05:01", "2026-01-01 06:00:00"]) assert.ok(!(x <= prefixUpper(p)), x);
});

test("mergeDailyExport: 공식 일자료만 있고 시간자료가 없으면 공식 행 그대로", () => {
  const official = [{ station_id: "108", observation_date: "2026-01-01", avg_temperature: 1 }];
  assert.equal(mergeDailyExport({ stationId: "108", officialRows: official, hourlyRows: [] }), official);
});

test("poolOptions: URL 분해, UTC·바이트 정렬·FOUND_ROWS 끔", () => {
  const o = poolOptions("mysql://u%40x:p%2Fw@db.example:3307/weatherhub");
  assert.equal(o.user, "u@x");
  assert.equal(o.password, "p/w");
  assert.equal(o.host, "db.example");
  assert.equal(o.port, 3307);
  assert.equal(o.database, "weatherhub");
  assert.equal(o.timezone, "Z");
  assert.equal(o.charset, "UTF8MB4_BIN");
  assert.deepEqual(o.flags, ["-FOUND_ROWS"]);
});

test("db.mjs: DB_DRIVER 없으면 pg, mysql 이면 mysql", async () => {
  const db = await import("../db.mjs");
  const prev = process.env.DB_DRIVER;
  delete process.env.DB_DRIVER;
  assert.equal(db.dbDriver(), "pg");
  process.env.DB_DRIVER = "MySQL";
  assert.equal(db.dbDriver(), "mysql");
  if (prev === undefined) delete process.env.DB_DRIVER;
  else process.env.DB_DRIVER = prev;
  assert.equal(db.storageKind(), "json");
  void root;
});

test("mergeDailyExport: 공식 일자료가 없는 날은 시간자료로 보충하고 요청한 컬럼만 담는다 (예전 'cols is not defined' 500 수정)", () => {
  const hourlyRows = [
    { observation_datetime: "2026-09-01 00:00:00", station_name: "서울", temperature: 20, precipitation: 0.5, humidity: 60 },
    { observation_datetime: "2026-09-01 01:00:00", station_name: "서울", temperature: 21, precipitation: 1, humidity: 70 },
    { observation_datetime: "2026-09-02 00:00:00", station_name: "서울", temperature: 18, precipitation: null, humidity: 80 },
  ];
  const officialRows = [{ station_id: "108", observation_date: "2026-09-02", avg_temperature: 17.9 }];
  const out = mergeDailyExport({ stationId: "108", cols: ["observation_date", "avg_temperature", "precipitation", "source_kind", "dew_point_avg"], officialRows, hourlyRows });
  assert.deepEqual(out, [
    { observation_date: "2026-09-01", avg_temperature: 20.5, precipitation: 1.5, source_kind: "DERIVED", dew_point_avg: null },
    officialRows[0],
  ]);
  assert.equal(mergeDailyExport({ stationId: "108", cols: ["observation_date"], officialRows: [], hourlyRows, limit: 1 }).length, 1);
});
