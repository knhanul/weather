import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyToNull, normalizeQc, parseNullableNumber } from "./qc.ts";
import { addHoursKst, formatKst, kstWallToUtc, latestOfficialHour, parseKst, toIsoKst, toKstWall } from "./timezone.ts";
import { mapKmaResult } from "./errors.ts";

describe("qc flags from official guide", () => {
  it("maps null/empty/0 to NORMAL without inventing extra codes", () => {
    assert.equal(normalizeQc(null), "NORMAL");
    assert.equal(normalizeQc(""), "NORMAL");
    assert.equal(normalizeQc("0"), "NORMAL");
    assert.equal(normalizeQc("1"), "INVALID");
    assert.equal(normalizeQc("9"), "MISSING");
    assert.equal(normalizeQc("7"), "SUSPECT");
  });

  it("never coerces missing numeric values to zero", () => {
    assert.equal(parseNullableNumber(""), null);
    assert.equal(parseNullableNumber(null), null);
    assert.equal(parseNullableNumber("0.0"), 0);
    assert.equal(parseNullableNumber("10.5"), 10.5);
    assert.equal(emptyToNull("  "), null);
  });
});

describe("timezone Asia/Seoul", () => {
  it("parses KST wall clocks independently of host locale", () => {
    const d = parseKst("2026-09-12 16:00:00");
    assert.equal(formatKst(d), "2026-09-12 16:00:00");
    assert.equal(toIsoKst("2026-09-12 16:00:00"), "2026-09-12T16:00:00+09:00");
    const utc = kstWallToUtc(2026, 9, 12, 0, 0, 0);
    assert.equal(utc.toISOString(), "2026-09-11T15:00:00.000Z");
  });

  it("adds hours across day boundaries", () => {
    assert.equal(addHoursKst("2026-09-12 23:00:00", 1), "2026-09-13 00:00:00");
  });

  it("accepts ISO KST and plus-decoded-as-space without double wrapping", () => {
    assert.equal(toKstWall("2026-09-11T12:10:00+09:00"), "2026-09-11 12:10:00");
    assert.equal(toKstWall("2026-09-11 12:10:00 09:00"), "2026-09-11 12:10:00");
    assert.equal(toIsoKst("2026-09-10T00:00:00+09:00"), "2026-09-10T00:00:00+09:00");
    assert.equal(toIsoKst("2026-09-10"), "2026-09-10T00:00:00+09:00");
  });

  it("converts UTC Z to KST wall rather than treating Z as KST", () => {
    assert.equal(toKstWall("2026-09-11T15:00:00Z"), "2026-09-12 00:00:00");
  });

  it("uses D-2 before 11:00 KST and D-1 after, per official publication rule", () => {
    assert.equal(latestOfficialHour(new Date("2026-09-12T01:00:00.000Z")), "2026-09-10 23:00:00");
    assert.equal(latestOfficialHour(new Date("2026-09-12T02:00:00.000Z")), "2026-09-11 23:00:00");
  });
});

describe("kma error mapping", () => {
  it("translates official result codes", () => {
    assert.equal(mapKmaResult("00").ok, true);
    assert.equal(mapKmaResult("30").code, "AUTH");
    assert.equal(mapKmaResult("22").code, "RATE_LIMIT");
    assert.equal(mapKmaResult("03").code, "NO_DATA");
    assert.equal(mapKmaResult("10").code, "BAD_REQUEST");
  });
});
