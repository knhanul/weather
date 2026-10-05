import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  HOURLY_EXPORT_CATALOG,
  DAILY_EXPORT_CATALOG,
  HOURLY_DEFAULT_EXPORT,
  DAILY_DEFAULT_EXPORT,
  EXPORT_PRESETS,
  validateExportColumns,
  getExportCatalog,
  formatCsvRow,
  escapeCsvValue
} from "../kma-fields.mjs";
import * as db from "../db.mjs";

const TEST_PORT = 8089;
let serverProcess;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 401) return true;
    } catch {
      await wait(250);
    }
  }
  throw new Error("Server failed to start at " + url);
}

before(async () => {
  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATABASE_URL: "" // Test JSON fallback mode
    },
    stdio: "inherit"
  });
  await waitForServer(`http://127.0.0.1:${TEST_PORT}/api/dashboard`);
});

after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test("kma-fields: catalog structure and snow distinction", () => {
  assert.ok(HOURLY_EXPORT_CATALOG.length >= 20, "Hourly catalog has all official fields");
  assert.ok(DAILY_EXPORT_CATALOG.length >= 25, "Daily catalog has all official fields");

  // Required columns
  const hourlyReq = HOURLY_EXPORT_CATALOG.filter((f) => f.required).map((f) => f.col);
  assert.deepEqual(hourlyReq, ["observation_datetime", "station_id"]);

  const dailyReq = DAILY_EXPORT_CATALOG.filter((f) => f.required).map((f) => f.col);
  assert.deepEqual(dailyReq, ["observation_date", "station_id"]);

  // Snow distinction
  const hr3Snow = HOURLY_EXPORT_CATALOG.find((f) => f.col === "snow_new_3h");
  const snow = HOURLY_EXPORT_CATALOG.find((f) => f.col === "snow_depth");
  assert.ok(hr3Snow.desc.includes("새로"), "snow_new_3h clearly describes newly fallen snow");
  assert.ok(snow.desc.includes("쌓여 있는 눈"), "snow_depth clearly describes snow on ground");

  const dailyNewSnow = DAILY_EXPORT_CATALOG.find((f) => f.col === "max_new_snow");
  const dailySnow = DAILY_EXPORT_CATALOG.find((f) => f.col === "max_snow_depth");
  assert.ok(dailyNewSnow.desc.includes("새로"), "Daily new snow clearly marked");
  assert.ok(dailySnow.desc.includes("쌓여 있는 눈"), "Daily total snow clearly marked");

  // getExportCatalog provides key and name_ko aliases
  const hourlyFull = getExportCatalog("hourly");
  assert.equal(hourlyFull[0].key, hourlyFull[0].col);
  assert.equal(hourlyFull[0].name_ko, hourlyFull[0].label);
  assert.equal(hourlyFull[0].category, hourlyFull[0].group);
});

test("kma-fields: validateExportColumns and presets", () => {
  // Empty or invalid input falls back to default columns
  assert.deepEqual(validateExportColumns("hourly", null), HOURLY_DEFAULT_EXPORT);
  assert.deepEqual(validateExportColumns("hourly", ""), HOURLY_DEFAULT_EXPORT);
  assert.deepEqual(validateExportColumns("daily", []), DAILY_DEFAULT_EXPORT);

  // Missing required columns are prepended in catalog order
  const custom = validateExportColumns("hourly", ["temperature", "humidity"]);
  assert.deepEqual(custom, ["observation_datetime", "station_id", "temperature", "humidity"]);

  // Custom ordering is preserved
  const reordered = validateExportColumns("hourly", [
    "station_id",
    "observation_datetime",
    "wind_speed",
    "temperature"
  ]);
  assert.deepEqual(reordered, [
    "station_id",
    "observation_datetime",
    "wind_speed",
    "temperature"
  ]);

  // SQL injection attempt or unknown columns are stripped
  const malicious = validateExportColumns("hourly", [
    "temperature",
    "station_id; DROP TABLE weather_hourly; --",
    "non_existent_column"
  ]);
  assert.deepEqual(malicious, ["observation_datetime", "station_id", "temperature"]);
});

test("kma-fields: CSV formatting preserves NULL vs 0", () => {
  const cols = ["station_id", "temperature", "precipitation", "notes"];
  const row = {
    station_id: "108",
    temperature: 0,
    precipitation: null,
    notes: '맑음, "구름조금"'
  };
  const csvLine = formatCsvRow(row, cols);
  // temperature 0 is "0", precipitation null is "", notes is escaped
  assert.equal(csvLine, '108,0,,"맑음, ""구름조금"""');
});

test("db: PostgreSQL export query generation with safe whitelisting", () => {
  const hourlyRes = db.buildHourlyExportSql({
    columns: ["observation_datetime", "station_id", "temperature", "dew_point"],
    stationId: "108",
    from: "2026-09-20 00:00:00",
    to: "2026-09-21 23:00:00",
    isFull: false // Legacy table without dew_point column
  });

  assert.ok(hourlyRes.sql.includes('SELECT "observation_datetime", "station_id", "temperature", NULL AS "dew_point"'));
  assert.ok(hourlyRes.sql.includes('FROM observations_hourly'));
  assert.deepEqual(hourlyRes.params, ["108", "2026-09-20 00:00:00", "2026-09-21 23:00:00"]);

  const dailyRes = db.buildDailyExportSql({
    columns: ["observation_date", "station_id", "avg_temperature", "max_temperature_time"],
    stationId: "108",
    from: "2026-09-01",
    to: "2026-09-10",
    isFull: false // Legacy daily table
  });
  assert.ok(dailyRes.sql.includes('SELECT "observation_date", "station_id", "avg_temperature", NULL AS "max_temperature_time"'));
  assert.ok(dailyRes.sql.includes('FROM observations_daily'));
});

test("API: GET /api/export/fields returns complete catalogs and presets", async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export/fields`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.storage, "json");
  assert.ok(data.hourly && data.hourly.catalog.length > 0);
  assert.ok(data.daily && data.daily.catalog.length > 0);
  assert.deepEqual(data.hourly.defaultColumns, HOURLY_DEFAULT_EXPORT);
  assert.deepEqual(data.daily.defaultColumns, DAILY_DEFAULT_EXPORT);
  assert.ok(data.presets && data.presets.length > 0);
});

test("API: GET /api/export/preview returns row limit, count, and column headers", async () => {
  // Query existing data in local JSON storage (dates: 2026-09-05 ~ 2026-09-07)
  const q = new URLSearchParams({
    kind: "hourly",
    stationId: "108",
    from: "2026-09-05 00:00:00",
    to: "2026-09-07 23:00:00",
    columns: "observation_datetime,station_id,temperature,humidity,wind_speed"
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export/preview?` + q);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(typeof data.totalCount === "number");
  assert.ok(data.totalCount > 0, "Finds records in September 2026");
  assert.ok(Array.isArray(data.rows));
  assert.ok(Array.isArray(data.columns));
  assert.deepEqual(data.columns.map((c) => c.key), [
    "observation_datetime",
    "station_id",
    "temperature",
    "humidity",
    "wind_speed"
  ]);

  if (data.rows.length > 0) {
    const firstRow = data.rows[0];
    assert.ok("observation_datetime" in firstRow);
    assert.ok("temperature" in firstRow);
  }
});

test("API: GET /api/export/preview handles empty range cleanly", async () => {
  const q = new URLSearchParams({
    kind: "hourly",
    stationId: "108",
    from: "1900-01-01 00:00:00",
    to: "1900-01-02 00:00:00",
    columns: "observation_datetime,station_id,temperature"
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export/preview?` + q);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.totalCount, 0);
  assert.equal(data.previewCount, 0);
  assert.deepEqual(data.rows, []);
});

test("API: GET /api/export (Legacy default) preserves 8 legacy columns and BOM", async () => {
  // Query with explicit range covering local sample data
  const q = new URLSearchParams({
    kind: "hourly",
    stationId: "108",
    from: "2026-09-05 00:00:00",
    to: "2026-09-06 23:00:00"
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export?` + q);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-type").includes("text/csv"));
  assert.ok(res.headers.get("content-disposition").includes(".csv"));

  const buffer = await res.arrayBuffer();
  const text = Buffer.from(buffer).toString("utf-8");

  // UTF-8 BOM check
  assert.equal(text.charCodeAt(0), 0xFEFF, "Starts with UTF-8 BOM");

  // First non-comment line is header
  const lines = text.slice(1).split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length >= 1, "Has header line");
  assert.equal(
    lines[0],
    "observation_datetime,station_id,station_name,temperature,precipitation,humidity,wind_speed,source_kind",
    "Default header matches legacy 8 columns exactly"
  );
});

test("API: GET /api/export (Custom columns and custom order)", async () => {
  const customCols = "station_id,observation_datetime,wind_speed,temperature";
  const q = new URLSearchParams({
    kind: "hourly",
    stationId: "108",
    from: "2026-09-05 00:00:00",
    to: "2026-09-06 23:00:00",
    columns: customCols
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export?` + q);
  assert.equal(res.status, 200);

  const buffer = await res.arrayBuffer();
  const text = Buffer.from(buffer).toString("utf-8");
  assert.equal(text.charCodeAt(0), 0xFEFF, "Starts with UTF-8 BOM");

  const lines = text.slice(1).split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length >= 1);
  assert.equal(lines[0], customCols, "Header reflects exact custom column selection and order");

  if (lines.length > 1) {
    const dataParts = lines[1].split(",");
    assert.equal(dataParts.length, 4, "Data row has exactly 4 columns");
  }
});

test("API: GET /api/export (Daily with custom columns)", async () => {
  const customCols = "observation_date,station_id,avg_temperature,max_temperature,min_temperature";
  const q = new URLSearchParams({
    kind: "daily",
    stationId: "108",
    from: "2026-09-05",
    to: "2026-09-07",
    columns: customCols
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export?` + q);
  assert.equal(res.status, 200);

  const buffer = await res.arrayBuffer();
  const text = Buffer.from(buffer).toString("utf-8");
  const lines = text.slice(1).split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length >= 1);
  assert.equal(lines[0], customCols, "Daily header matches custom columns");
});

test("API: GET /api/export handles 0 matching rows with 404 JSON", async () => {
  const q = new URLSearchParams({
    kind: "hourly",
    stationId: "108",
    from: "1900-01-01 00:00:00",
    to: "1900-01-02 00:00:00"
  });
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/export?` + q);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(data.message.includes("없습니다"));
});
