import test from "node:test";
import assert from "node:assert/strict";
import { recentGridContext, parseNcstRain, GRID_SOURCE } from "../grid-context.mjs";
import { createWeatherContextApi } from "../weather-context-api.mjs";
import { buildDailyStore } from "../stats-engine.mjs";
import { shiftDate } from "../season-calendar.mjs";
const today = "2026-11-08",
  grid = { nx: 60, ny: 127 };
const item = (date, hour, value, category = "T1H", extra = {}) => ({
  base: `${date} ${String(hour).padStart(2, "0")}:00:00`,
  category,
  value,
  ...extra,
});
const context = (rows, opts = {}) =>
  recentGridContext({ daily: buildDailyStore("108", []), today, maxHour: 8, grid, rows, ...opts });
const samples = [7.5, 7.9, 6.7, 9.3, 11.1, 5.6, 0.9];
const realShape = [
  ...samples.map((n, i) => item(`2026-11-0${i + 1}`, 8, String(n))),
  item(today, 8, "4.4"),
];
test("ASOS lag does not block complete same-grid NCST: current/yesterday/recent7", () => {
  const d = context(realShape);
  assert.equal(d.source, GRID_SOURCE);
  assert.equal(d.value, 4.4);
  assert.equal(d.previous, 0.9);
  assert.ok(Math.abs(d.diff - 3.5) < 1e-9);
  assert.equal(d.recent7.mean, 7);
  assert.equal(d.recent7.days, 7);
  assert.ok(Math.abs(d.recent7.diff + 2.6) < 1e-9);
  assert.equal(d.basis.time, "2026-11-08 08:00:00");
  assert.deepEqual([d.grid.nx, d.grid.ny], [60, 127]);
});
test("same grid and same hour only; no adjacent hour, ASOS or forecast substitute", () => {
  const d = context([
    ...realShape,
    item(today, 9, "999"),
    item(today, 8, "80", "T1H", { nx: 61, ny: 127 }),
    item(today, 8, "70", "T1H", { dataset: "ASOS_HOURLY" }),
    item(today, 8, "60", "T1H", { dataset: "KMA_ULTRA_FCST" }),
    item(today, 8, "50", "T1H", { fcst: "2026-11-08 09:00:00" }),
    item("2026-11-07", 7, "90"),
  ]);
  assert.equal(d.value, 4.4);
  assert.equal(d.previous, 0.9);
  assert.equal(d.series[9].today, null);
});
test("missing yesterday does not replace its value or pad recent sample count", () => {
  const d = context(realShape.filter((r) => !r.base.startsWith("2026-11-07")));
  assert.equal(d.previous, null);
  assert.equal(d.diff, null);
  assert.equal(d.recent7.days, 6);
  assert.equal(d.recent7.mean, 48.1 / 6);
  assert.equal(d.available, true);
});
test("no current grid temperature is unavailable even with ASOS daily values; recent7 is uncomputed not zero days", () => {
  const daily = buildDailyStore("108", [
    {
      observation_date: today,
      avg_temperature: 80,
      min_temperature: 70,
      max_temperature: 90,
      source_kind: "OFFICIAL",
    },
  ]);
  const d = context(
    realShape.filter((r) => !r.base.startsWith(today)),
    { daily },
  );
  assert.equal(d.available, false);
  assert.equal(d.value, null);
  assert.equal(d.hour, null);
  assert.equal(d.recent7.computed, false);
  assert.equal(d.recent7.days, null);
  assert.equal(d.latestTemperatureTime, "2026-11-07 08:00:00");
  assert.ok(d.recentDays.every((r) => r.date < today));
});
test("unmapped grid never uses station or another grid as a fallback", () => {
  const d = context(realShape, { grid: null });
  assert.equal(d.available, false);
  assert.equal(d.grid, null);
  assert.match(d.message, /격자 연결/);
});
test("KST midnight year transition and leap day have exactly seven calendar dates", () => {
  for (const date of ["2027-01-01", "2024-03-01"]) {
    const rows = Array.from({ length: 8 }, (_, i) => item(shiftDate(date, -i), 0, String(10 - i)));
    const d = context(rows, { today: date, maxHour: 0 });
    assert.equal(d.hour, 0);
    assert.equal(d.previous, 9);
    assert.equal(d.recent7.days, 7);
    assert.deepEqual(
      d.recent7.points.map((p) => p.date),
      Array.from({ length: 7 }, (_, i) => shiftDate(date, -i - 1)),
    );
    assert.equal(d.series[1].today, null);
  }
});
test("invalid dates/minutes, blank/sentinel/physically invalid numbers are unavailable not zero", () => {
  const rows = [
    item(today, 8, ""),
    item(today, 7, "-999"),
    { base: today + " 06:30:00", category: "T1H", value: 20 },
    item("2026-02-29", 8, "30"),
    item(today, 5, "4"),
  ];
  const d = context(rows);
  assert.equal(d.hour, 5);
  assert.equal(d.value, 4);
  assert.equal(d.series[8].today, null);
  assert.equal(d.series[7].today, null);
});
test("RN1 exact decimals retain rain below1mm; missing/ranges/trace never become zero", () => {
  assert.equal(parseNcstRain("0.5").value, 0.5);
  assert.equal(parseNcstRain("0").value, 0);
  assert.equal(parseNcstRain("강수없음").value, 0);
  for (const v of [null, "", undefined, "-999", "999", "bad"]) {
    assert.equal(parseNcstRain(v).value, null);
    assert.equal(parseNcstRain(v).kind, "missing");
  }
  for (const v of ["1.0mm 미만", "30.0~50.0mm", "50mm 이상", "trace", "미량"]) {
    assert.equal(parseNcstRain(v).value, null);
    assert.equal(parseNcstRain(v).kind, "range");
  }
  const d = context([
    ...realShape,
    item(today, 8, "1.0mm 미만", "RN1"),
    item("2026-11-07", 8, "0", "RN1"),
  ]);
  assert.equal(d.precipitation.today.kind, "range");
  assert.equal(d.precipitation.today.value, null);
  assert.ok(!d.extras.some((x) => x.key === "rn"));
});
test("rain is same one-hour period, wind decimal threshold inclusive, invalid humidity unavailable", () => {
  const rows = [
    ...realShape,
    item(today, 8, "1.2", "RN1"),
    item("2026-11-07", 8, "0.2", "RN1"),
    item(today, 8, "3.8", "WSD"),
    item("2026-11-07", 8, "1.8", "WSD"),
    item(today, 8, "999", "REH"),
    item("2026-11-07", 8, "0", "REH"),
    item("2026-11-07", 23, "100", "RN1"),
  ];
  const d = context(rows);
  assert.deepEqual(
    d.extras.map((x) => x.key),
    ["rn", "ws"],
  );
  assert.equal(d.extras[0].today, 1.2);
  assert.equal(d.extras[0].yesterday, 0.2);
  assert.match(d.precipitation.note, /日|일누적/);
});
test("ASOS completed-day extrema remain separate and never include partial today", () => {
  const daily = buildDailyStore("108", [
    {
      observation_date: "2026-11-07",
      avg_temperature: 10,
      min_temperature: 2,
      max_temperature: 15,
    },
    { observation_date: today, avg_temperature: 80, min_temperature: 70, max_temperature: 90 },
  ]);
  const d = context(realShape, { daily });
  assert.match(d.dailySource, /ASOS/);
  assert.ok(!d.recentDays.some((x) => x.date === today));
  assert.equal(d.recentDays.at(-1).max, 15);
  assert.equal(d.recentDays.at(-1).min, 2);
});
test("API uses existing gridOf/ncst abstraction, bounded one read cached30s, never hourly/forecast/summary getter", async () => {
  let now = new Date("2026-11-07T23:21:00Z"),
    reads = 0;
  const calls = [];
  const api = createWeatherContextApi({
    statsData: { get: async () => buildDailyStore("108", []) },
    statsHourly: {
      get: () => {
        throw Error("must not load ASOS hourly");
      },
    },
    stations: async () => [{ station_id: "108", station_name: "서울" }],
    now: () => now,
    rt: () => ({
      gridOf: async (id) => {
        assert.equal(id, "108");
        return grid;
      },
      ncst: async (...args) => {
        reads++;
        calls.push(args);
        await Promise.resolve();
        return realShape;
      },
    }),
    json: (res, body, status = 200) => {
      res.body = body;
      res.status = status;
    },
  });
  const run = async () => {
    const res = {};
    await api(
      { method: "GET" },
      res,
      new URL("http://local/api/stats/context-today?station=108&basis=grid-v1"),
    );
    assert.equal(res.status, 200);
    return res.body;
  };
  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(reads, 1);
  assert.equal(a.value, 4.4);
  assert.equal(b.value, 4.4);
  assert.deepEqual(calls[0], [60, 127, "2026-11-01 00:00:00", "2026-11-08 08:00:00"]);
  now = new Date(now.getTime() + 31000);
  await run();
  assert.equal(reads, 2);
  now = new Date("2026-11-08T00:00:00Z");
  await run();
  assert.equal(reads, 3);
  assert.equal(calls[2][3], "2026-11-08 09:00:00");
});
test("API today does not expose seed ASOS extrema and KST Jan1 hour0 query is correct", async () => {
  const date = "2027-01-01",
    res = {};
  let args;
  const api = createWeatherContextApi({
    sourceAllowed: async () => false,
    statsData: {
      get: () => {
        throw Error("seed must not be loaded");
      },
    },
    stations: async () => [{ station_id: "108" }],
    now: () => new Date("2026-12-31T15:05:00Z"),
    rt: {
      gridOf: async () => grid,
      ncst: async (...a) => {
        args = a;
        return [item(date, 0, "5"), item("2026-12-31", 0, "4")];
      },
    },
    json: (r, b, s = 200) => Object.assign(r, { body: b, status: s }),
  });
  await api({ method: "GET" }, res, new URL("http://local/api/stats/context-today"));
  assert.equal(res.status, 200);
  assert.equal(res.body.today, date);
  assert.equal(res.body.diff, 1);
  assert.equal(res.body.hour, 0);
  assert.deepEqual(args, [60, 127, "2026-12-25 00:00:00", "2027-01-01 00:00:00"]);
  assert.ok(res.body.recentDays.every((d) => d.max === null && d.min === null));
});
