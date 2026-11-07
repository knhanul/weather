import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailyStore, createHourlyStore, addHourlyRows } from "../stats-engine.mjs";
import {
  recentContext,
  contextBattle,
  opponentDate,
  criterionResult,
  seasonStory,
  seasonalContext,
  validDate,
} from "../weather-context-engine.mjs";
import { seasonDates, TERM_NAMES, shiftDate } from "../season-calendar.mjs";
import { createWeatherContextApi } from "../weather-context-api.mjs";
const today = "2026-11-08";
const row = (d, avg = 15) => ({
  station_id: "108",
  observation_date: d,
  avg_temperature: avg,
  min_temperature: avg - 5,
  max_temperature: avg + 5,
  precipitation: 0,
  avg_wind_speed: 2,
});
const daily = buildDailyStore("108", [row("2026-11-06", 12), row("2026-11-07", 14)]);
const hours = (rows) => {
  const h = createHourlyStore("108", 2026);
  addHourlyRows(
    h,
    rows.map(([d, t, ta, ws = 2, hm = 60, rn = 0]) => ({
      observation_datetime: `${d} ${t}:00:00`,
      temperature: ta,
      wind_speed: ws,
      humidity: hm,
      precipitation: rn,
    })),
  );
  return h;
};
test("same station same time, seven previous days, not adjacent hours or forecast", () => {
  const h = hours([
    [today, "07", 10],
    ["2026-11-07", "06", 90],
    ["2026-11-07", "07", 12],
    ["2026-11-06", "07", 14],
    [today, "09", 100],
  ]);
  const r = recentContext({ daily, hourly: h, today, maxHour: 7 });
  assert.equal(r.hour, 7);
  assert.equal(r.diff, -2);
  assert.equal(r.recent7.mean, 13);
  assert.equal(r.recent7.days, 2);
  assert.equal(r.recent7.diff, -3);
  assert.equal(r.series[9].today, null);
});
test("no today observations: never stale yesterday labeled today, no null-to-zero", () => {
  const r = recentContext({ daily, hourly: hours([["2026-11-07", "07", 12]]), today });
  assert.equal(r.available, false);
  assert.equal(r.value, null);
  assert.equal(r.previous, null);
  assert.equal(r.recent7.mean, null);
  assert.equal(r.recent7.days, 0);
});
test("meaningful extra differences include threshold boundary, omit small differences", () => {
  const r = recentContext({
    daily,
    hourly: hours([
      [today, "07", 10, 4, 70, 1],
      ["2026-11-07", "07", 12, 2, 60, 0],
    ]),
    today,
  });
  assert.deepEqual(
    r.extras.map((x) => x.key),
    ["rn", "ws", "hm"],
  );
  const s = recentContext({
    daily,
    hourly: hours([
      [today, "07", 10, 3, 65, 0.5],
      ["2026-11-07", "07", 12, 2, 60, 0],
    ]),
    today,
  });
  assert.equal(s.extras.length, 0);
});
test("opponent presets use calendar arithmetic, leap-day is not silently March 1", () => {
  assert.equal(opponentDate("2024-03-01", "yesterday"), "2024-02-29");
  assert.equal(opponentDate("2026-01-03", "week"), "2025-12-27");
  assert.equal(opponentDate("2024-02-29", "year"), null);
  assert.equal(validDate("2025-02-29"), false);
});
test("draw thresholds inclusive, direction is user chosen, missing not loss", () => {
  assert.equal(criterionResult("warmer", 12.5, 12).winner, "draw");
  assert.equal(criterionResult("dry", 0.1, 0).winner, "draw");
  assert.equal(criterionResult("cooler", 12, 15).winner, "A");
  assert.equal(criterionResult("warmer", 12, 15).winner, "B");
  assert.equal(criterionResult("calm", null, 0).winner, "unavailable");
});
test("completed-day battle shows both numbers, secondary tally and invalid criteria fail", () => {
  const r = contextBattle({
    daily,
    hourly: null,
    today,
    date1: "2026-11-07",
    date2: "2026-11-06",
    criteria: ["warmer", "dry"],
  });
  assert.equal(r.rows[0].a, 14);
  assert.equal(r.rows[0].b, 12);
  assert.equal(r.rows[0].winner, "A");
  assert.equal(r.wins.draw, 1);
  assert.throws(
    () => contextBattle({ daily, today, date1: today, date2: "2025-02-29" }),
    RangeError,
  );
  assert.throws(
    () => contextBattle({ daily, today, date1: today, date2: today, criteria: [] }),
    RangeError,
  );
});
test("ongoing today battle uses same single hour, not full previous-day totals", () => {
  const hourly = hours([
    [today, "07", 10, 4, 60, 1],
    ["2026-11-07", "07", 12, 3, 60, 0],
  ]);
  const r = contextBattle({
    daily,
    hourly,
    today,
    maxHour: 7,
    date1: today,
    date2: "2026-11-07",
    criteria: ["cooler", "dry"],
  });
  assert.equal(r.hour, 7);
  assert.equal(r.rows[0].winner, "A");
  assert.equal(r.rows[1].a, 1);
  assert.equal(r.rows[1].b, 0);
  assert.match(r.fieldNote, /하루 전체 대결이 아닙니다/);
});
test("5y/10y/all periods use actual observed years, exclude target and no padded zeroes", () => {
  const d = buildDailyStore("108", [
    row("2010-05-05", 10),
    row("2021-05-05", 11),
    row("2025-05-05", 15),
    row("2026-05-05", 20),
  ]);
  for (const [period, n, avg] of [
    ["recent5", 2, 13],
    ["recent10", 2, 13],
    ["all", 3, 12],
  ]) {
    const r = contextBattle({
      daily: d,
      today,
      date1: "2026-05-05",
      date2: "2025-05-05",
      period,
      criteria: ["warmer"],
    });
    assert.equal(r.rows[0].samples, n);
    assert.equal(r.rows[0].b, avg);
  }
  const r = contextBattle({
    daily: d,
    today,
    date1: "2026-05-05",
    date2: "2025-06-05",
    period: "all",
    criteria: ["warmer"],
  });
  assert.equal(r.rows[0].winner, "unavailable");
});
test("year-specific KST terms and boknal agree with published recent calendars", () => {
  assert.equal(TERM_NAMES.length, 24);
  for (const [y, dates] of [
    [2024, ["2024-07-15", "2024-07-25", "2024-08-14"]],
    [2025, ["2025-07-20", "2025-07-30", "2025-08-09"]],
    [2026, ["2026-07-15", "2026-07-25", "2026-08-14"]],
  ]) {
    const ds = seasonDates(y);
    assert.deepEqual(
      ["초복", "중복", "말복"].map((k) => ds[k]),
      dates,
    );
    assert.equal(Object.keys(ds).length, 27);
  }
  assert.equal(seasonDates(2024)["입춘"], "2024-02-04");
  assert.equal(seasonDates(2025)["입춘"], "2025-02-03");
  assert.equal(seasonDates(2025)["동지"], "2025-12-22");
  assert.equal(seasonDates(2026)["입동"], "2026-11-07");
  assert.throws(() => seasonDates(1969), RangeError);
});
test("all supported years produce actual valid dates (no approximate fixed dates)", () => {
  for (let y = 1970; y <= 2050; y++)
    for (const d of Object.values(seasonDates(y))) assert.ok(validDate(d));
});
test("selected year separated from paired multi-year means, incomplete windows excluded", () => {
  const date = seasonDates(2025)["입동"];
  const rows = Array.from({ length: 15 }, (_, i) => row(shiftDate(date, i - 7), i === 7 ? 20 : 10));
  const r = seasonStory({ daily: buildDailyStore("108", rows), today, year: 2026, name: "입동" });
  assert.equal(r.thisYear, true);
  assert.equal(r.selected.value, null);
  assert.equal(r.history.years, 1);
  assert.equal(r.history.meanDiff, 10);
  const s = seasonStory({
    daily: buildDailyStore("108", rows.slice(1)),
    today,
    year: 2025,
    name: "입동",
  });
  assert.equal(s.history.years, 0);
  assert.equal(s.history.meanDiff, null);
});
test("winter window includes leap day and future winter excluded", () => {
  const d = buildDailyStore("108", [row("2023-12-22", 0), row("2024-02-29", -10)]);
  const s = seasonalContext({ daily: d, today, year: 2023, name: "동지" });
  assert.equal(s.winter.expected, 91);
  assert.equal(s.winter.min, -15);
  assert.deepEqual(s.winter.dates, ["2024-02-29"]);
  const f = seasonalContext({ daily: d, today, year: 2026, name: "동지" });
  assert.equal(f.value, null);
  assert.equal(f.winter.min, null);
});
test("API station validation, read-only methods, unavailable evidence, three routes", async () => {
  const hourly = hours([
    [today, "07", 10],
    ["2026-11-07", "07", 12],
  ]);
  let result, status;
  const api = createWeatherContextApi({
    statsData: { get: async () => daily },
    statsHourly: { get: async () => hourly },
    stations: async () => [{ station_id: "108", station_name: "서울" }],
    now: () => new Date(today + "T07:00:00+09:00"),
    json: (res, b, s = 200) => {
      result = b;
      status = s;
    },
  });
  for (const path of ["context-today", "context-battle", "context-season"]) {
    assert.equal(
      await api({ method: "GET" }, {}, new URL(`http://local/api/stats/${path}?station=108`)),
      true,
    );
    assert.equal(status, 200);
    assert.equal(result.station.name, "서울");
  }
  await api({ method: "GET" }, {}, new URL("http://local/api/stats/context-today?station=999"));
  assert.equal(status, 400);
  await api({ method: "POST" }, {}, new URL("http://local/api/stats/context-today"));
  assert.equal(status, 405);
  await api(
    { method: "GET" },
    {},
    new URL("http://local/api/stats/context-battle?date1=2024-02-29&opponent=year"),
  );
  assert.equal(status, 400);
  const seed = createWeatherContextApi({
    statsData: {},
    stations: async () => [{ station_id: "108" }],
    json: (r, b, s) => {
      status = s;
    },
    sourceAllowed: async () => false,
  });
  await seed({ method: "GET" }, {}, new URL("http://local/api/stats/context-today"));
  assert.equal(status, 503);
});

test("untrusted criterion prototype names are rejected, never interpreted as metrics", () => {
  for (const id of ["__proto__", "constructor", "toString"])
    assert.throws(
      () =>
        contextBattle({ daily, today, date1: "2026-11-07", date2: "2026-11-06", criteria: [id] }),
      RangeError,
    );
});

test("empty historical samples have no invented or reversed observed-year range", () => {
  const d = buildDailyStore("108", []);
  const b = contextBattle({
    daily: d,
    today,
    date1: "2026-11-07",
    date2: "2026-11-06",
    period: "all",
    criteria: ["cooler"],
  });
  assert.equal(b.window.expected, 0);
  assert.equal(b.window.fromYear, null);
  assert.equal(b.rows[0].winner, "unavailable");
  const s = seasonStory({ daily: d, today, year: 2026, name: "입춘" });
  assert.equal(s.history.years, 0);
  assert.equal(s.history.from, null);
  assert.equal(s.history.to, null);
});

test("hourly battle uses actual hourly history even when daily history is absent", () => {
  const d = buildDailyStore("108", []);
  const h = hours([
    [today, "07", 10],
    ["2025-11-07", "07", 12],
    ["2021-11-07", "07", 14],
  ]);
  const r = contextBattle({
    daily: d,
    hourly: h,
    today,
    maxHour: 7,
    date1: today,
    date2: "2026-11-07",
    period: "all",
    criteria: ["cooler"],
  });
  assert.equal(r.available.kind, "시간자료");
  assert.equal(r.available.first, "2021-11-07");
  assert.equal(r.window.fromYear, 2021);
  assert.equal(r.window.expected, 5);
  assert.equal(r.rows[0].samples, 2);
  assert.equal(r.rows[0].b, 13);
  assert.equal(r.rows[0].winner, "A");
  assert.equal(r.available.lastCompleted, null);
});
test("history candidates outside actual observed date boundaries are not counted", () => {
  const d = buildDailyStore("108", [
    row("2021-12-01"),
    row("2022-01-05", 10),
    row("2023-01-05", 12),
    row("2023-06-01"),
  ]);
  const r = contextBattle({
    daily: d,
    today,
    date1: "2023-06-01",
    date2: "2026-01-05",
    period: "all",
    criteria: ["warmer"],
  });
  assert.equal(r.window.expected, 2);
  assert.equal(r.rows[0].samples, 2);
  assert.equal(r.rows[0].b, 11);
});
test("first-freeze season crosses New Year and includes leap day, not following September", () => {
  const d = buildDailyStore("108", [
    row("2023-09-01", 10),
    row("2024-01-02", -1),
    row("2024-02-29", -10),
    row("2024-09-01", -20),
  ]);
  const r = seasonalContext({ daily: d, today, year: 2023, name: "입동" });
  assert.equal(r.firstFreeze.date, "2024-01-02");
  assert.equal(r.firstFreeze.expected, 182);
  assert.equal(r.firstFreeze.days, 3);
});
test("missing spring observations do not imply zero freezing days", () => {
  const d = buildDailyStore("108", []),
    r = seasonalContext({ daily: d, today, year: 2025, name: "입춘" });
  assert.equal(r.laterCold.days, 0);
  assert.equal(r.laterCold.daysBelowZero, null);
});
test("multi-year story loads one station daily store, never a query per year or hourly data", async () => {
  let dailyCalls = 0,
    hourlyCalls = 0,
    body;
  const api = createWeatherContextApi({
    statsData: {
      get: async () => {
        dailyCalls++;
        return daily;
      },
    },
    statsHourly: {
      get: async () => {
        hourlyCalls++;
        throw Error("unneeded hourly query");
      },
    },
    stations: async () => [{ station_id: "108", station_name: "서울" }],
    json: (r, b) => (body = b),
    now: () => new Date(today + "T07:00:00+09:00"),
  });
  await api(
    { method: "GET" },
    {},
    new URL("http://local/api/stats/context-season?station=108&year=2025&name=입동"),
  );
  assert.equal(body.ok, true);
  assert.equal(dailyCalls, 1);
  assert.equal(hourlyCalls, 0);
});
