// 특정일 캘린더(수능·학력고사·설날·추석) 시험 — 실제 시행일·음력 대응을 확인하고, 가져오기 파서·JSON 저장소 CRUD 를 본다.
// 음력 기대값은 calendar-resolver 의 표(한국천문연구원 자료 기반)와 대조한다. 값이 어긋나면 표가 바뀐 것이므로 여기서 바로 드러난다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CALENDAR_EVENT_VERSION, CALENDAR_KINDS, SEED_EVENTS, seedRows, seedId, resolveEvent, resolveAll,
  parseImport, parseIcs, looksLikeIcs, createJsonEventStore, validateEventFields, kindOf, kindLabelOf,
} from "../calendar-events.mjs";

const rows = seedRows();
const byKind = (k) => rows.filter((r) => r.kind === k);

test("시드: 버전·종류 목록·건수(수능 35 · 학력고사 18 · 규칙 2)", () => {
  assert.equal(CALENDAR_EVENT_VERSION, "calendar-events.v1");
  assert.deepEqual(CALENDAR_KINDS.map((k) => k.id), ["csat", "hakryeok", "holiday", "custom"]);
  assert.equal(SEED_EVENTS.length, 55);
  assert.equal(byKind("csat").length, 35);
  assert.equal(byKind("hakryeok").length, 18);
  assert.deepEqual(byKind("holiday").map((r) => `${r.label}:음력${r.month}/${r.day}`), ["설날:음력1/1", "추석:음력8/15"]);
  // 학년도 표기와 '시행일의 양력 연도'가 어긋나지 않는지(예: 2027학년도 → 2026년 시행)
  const c2027 = byKind("csat").find((r) => r.yearLabel === "2027학년도");
  assert.equal(c2027.year, 2026);
  assert.equal(`${c2027.year}-${String(c2027.month).padStart(2, "0")}-${String(c2027.day).padStart(2, "0")}`, "2026-11-19");
  assert.equal(c2027.label, "2027학년도 대학수학능력시험");
  // 연기 사유가 있는 해만 비고가 붙는다
  assert.equal(byKind("csat").find((r) => r.yearLabel === "2018학년도").note, "포항 지진으로 1주 연기");
  assert.equal(byKind("csat").find((r) => r.yearLabel === "2017학년도").note, null);
  // 1994학년도만 1·2차 두 번
  assert.deepEqual(byKind("csat").filter((r) => r.yearLabel === "1994학년도").map((r) => r.label), ["1994학년도 대학수학능력시험 1차", "1994학년도 대학수학능력시험 2차"]);
});

test("시드 id 는 결정적이다 — 다시 채워도 같은 id(중복 없음)", () => {
  const a = seedRows(), b = seedRows();
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
  assert.equal(new Set(a.map((r) => r.id)).size, 55);
  const rule = a.find((r) => r.label === "설날");
  assert.equal(rule.id, seedId(rule));
  assert.ok(rule.id.startsWith("cal_seed_"));
});

test("음력 규칙: 설날·추석이 실제 양력 날짜로 해석된다(2024~2026)", () => {
  const 설 = rows.find((r) => r.label === "설날"), 추 = rows.find((r) => r.label === "추석");
  const want = [
    ["2024-02-10", 설, 2024], ["2024-09-17", 추, 2024],
    ["2025-01-29", 설, 2025], ["2025-10-06", 추, 2025],
    ["2026-02-17", 설, 2026], ["2026-09-25", 추, 2026],
  ];
  for (const [solar, ev, y] of want) {
    const r = resolveEvent(ev, y);
    assert.equal(r.status, "ok", `${ev.label} ${y}`);
    assert.equal(r.solarDate, solar, `${ev.label} ${y}`);
  }
  // 규칙(year=null)은 어느 해로 불러도 그 해로 계산한다
  assert.equal(resolveEvent(설, 2025).solarDate, "2025-01-29");
  // 고정 연도 항목은 다른 해로 불러도 그 연도로만 해석한다
  const one = rows.find((r) => r.yearLabel === "2027학년도");
  assert.equal(resolveEvent(one, 2030).solarDate, "2026-11-19");
});

test("resolveAll: 양력 연도 기준 범위만, 날짜 오름차순, 필요한 항목만", () => {
  const all = resolveAll(rows, 2025, 2026);
  const got = all.map((e) => `${e.solarDate} ${e.label}`);
  assert.deepEqual(got, [
    "2025-01-29 설날",
    "2025-10-06 추석",
    "2025-11-13 2026학년도 대학수학능력시험",
    "2026-02-17 설날",
    "2026-09-25 추석",
    "2026-11-19 2027학년도 대학수학능력시험",
  ]);
  // year 는 해석된 양력 연도, oneOff 는 '그 해 한 번뿐인 날' 표시 — 설날·추석 규칙은 oneOff=false
  assert.ok(all.every((e) => e.kindLabel && e.kind && typeof e.oneOff === "boolean" && Number.isInteger(e.year)));
  assert.equal(all.find((e) => e.label === "설날").oneOff, false);
  assert.equal(all.find((e) => e.label === "추석").oneOff, false);
  assert.equal(all.find((e) => e.kind === "csat").oneOff, true);
  // 한 해만: 그 해 것만 나오고, 고정 연도 항목은 다른 해에 안 나온다
  assert.deepEqual(resolveAll(rows, 2026, 2026).map((e) => e.solarDate), ["2026-02-17", "2026-09-25", "2026-11-19"]);
  assert.equal(resolveAll(rows, 2030, 2030).filter((e) => e.kind === "csat").length, 0);
  // 음력 표가 시작하는 1900년부터는 설날·추석만 나온다(수능·학력고사는 1981년 이후)
  const old = resolveAll(rows, 1900, 1950);
  assert.equal(old[0].solarDate, "1900-01-31"); // 음력 1900-01-01
  assert.ok(old.every((e) => e.kind === "holiday"));
  assert.equal(old.length, 51 * 2); // 1900~1950 해마다 설날·추석
  assert.deepEqual(resolveAll(rows, 1900, 1950).filter((e) => e.solarDate.slice(0, 4) !== String(e.solarDate.slice(0, 4))), []);
  // 없는 날짜·범위 밖 규칙은 조용히 빠진다(전체 실패 없음)
  const bad = [{ id: "cal_x", kind: "custom", label: "2월 30일", cal: "solar", month: 2, day: 30, leap: false, year: null }];
  assert.deepEqual(resolveAll(bad, 2026, 2026), []);
});

test("resolveAll: 같은 날 같은 이름은 한 번만(비고 있는 쪽을 남긴다)", () => {
  const dup = [
    { id: "a", kind: "holiday", label: "설날", cal: "lunar", month: 1, day: 1, leap: false, year: null, note: null },
    { id: "b", kind: "holiday", label: "설날", cal: "lunar", month: 1, day: 1, leap: false, year: null, note: "캘린더 파일에서 가져옴" },
    { id: "c", kind: "custom", label: "창립기념일", cal: "solar", month: 2, day: 17, leap: false, year: 2026, note: null },
  ];
  const got = resolveAll(dup, 2026, 2026);
  assert.deepEqual(got.map((e) => `${e.solarDate} ${e.label}`), ["2026-02-17 설날", "2026-02-17 창립기념일"]);
  assert.equal(got[0].note, "캘린더 파일에서 가져옴");
});

test("parseImport: 한 번뿐인 날·매년 양력·음력·윤달·주석·오류 줄", () => {
  const text = [
    "# 역대 수능 (주석 줄은 건너뛴다)",
    "",
    "2026-11-19 2027학년도 수능",
    "11-19 수능",
    "음력 08-15 추석",
    "음력 윤 04-15 윤달 라벨",
    "2026-13-01 달이 없는 줄",
    "날짜가 아예 없는 줄",
  ].join("\n");
  const { rows: got, errors } = parseImport(text, { kind: "csat" });
  assert.equal(got.length, 4);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map((e) => e.line), [7, 8]);
  assert.match(errors[0].message, /날짜|월은/); // 13월은 '월은 1~12 사이'로 걸린다
  assert.deepEqual(
    got.map((r) => [r.cal, r.month, r.day, r.leap, r.year, r.label, r.kind, r.source]),
    [
      ["solar", 11, 19, false, 2026, "2027학년도 수능", "csat", "import"],
      ["solar", 11, 19, false, null, "수능", "csat", "import"],
      ["lunar", 8, 15, false, null, "추석", "csat", "import"],
      ["lunar", 4, 15, true, null, "윤달 라벨", "csat", "import"],
    ],
  );
  // 알 수 없는 종류는 custom 으로
  assert.equal(parseImport("01-01 새해", { kind: "???" }).rows[0].kind, "custom");
  // 이름 없는 줄도 오류로(전체 실패 아님)
  const r2 = parseImport("11-19 수능\n12-25", { kind: "holiday" });
  assert.equal(r2.rows.length, 1);
  assert.equal(r2.errors.length, 1);
});

test("parseImport: 한글·점·빗금 표기도 읽는다(사람이 쓰는 그대로 붙여넣기)", () => {
  const { rows: got, errors } = parseImport([
    "2026년 11월 19일 2027학년도 수능",
    "11월 19일 수능",
    "음력 8월 15일 추석",
    "음력 윤 4월 15일 윤달",
    "2026.11.19 점 표기",
    "2026/12/25 크리스마스",
  ].join("\n"), { kind: "holiday" });
  assert.equal(errors.length, 0);
  assert.deepEqual(got.map((r) => [r.cal, r.month, r.day, r.leap, r.year, r.label]), [
    ["solar", 11, 19, false, 2026, "2027학년도 수능"],
    ["solar", 11, 19, false, null, "수능"],
    ["lunar", 8, 15, false, null, "추석"],
    ["lunar", 4, 15, true, null, "윤달"],
    ["solar", 11, 19, false, 2026, "점 표기"],
    ["solar", 12, 25, false, 2026, "크리스마스"],
  ]);
});

test("parseIcs: 캘린더 파일(.ics) — 종일·시각·반복·이어 붙은 줄·오류", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260217",
    "SUMMARY:설날",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20261118T150000Z", // UTC 15:00 = 한국 11/19 00:00 → 날짜가 하루 넘어간다
    "SUMMARY:2027학년도 대학수학능력시험",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260301",
    "RRULE:FREQ=YEARLY",
    "SUMMARY:삼일절\\, 기념일",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261006",
    "SUMMARY:추석 연휴가 길게",
    " 이어지는 이름",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:날짜 없음",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  assert.equal(looksLikeIcs(ics), true);
  assert.equal(looksLikeIcs("2026-11-19 수능"), false);
  const { rows: got, errors } = parseIcs(ics, { kind: "holiday" });
  assert.deepEqual(got.map((r) => [r.year, r.month, r.day, r.label, r.kind, r.source]), [
    [2026, 2, 17, "설날", "holiday", "import"],
    [2026, 11, 19, "2027학년도 대학수학능력시험", "holiday", "import"],
    [null, 3, 1, "삼일절, 기념일", "holiday", "import"], // RRULE:FREQ=YEARLY → 매년 규칙
    // .ics 는 75바이트마다 줄을 접는다(RFC 5545). 접힌 줄은 앞 공백만 떼고 그대로 잇는다(단어 중간에서 끊기는 게 보통이라).
    [2026, 10, 6, "추석 연휴가 길게이어지는 이름", "holiday", "import"],
  ]);
  assert.equal(errors.length, 1); // 날짜 없는 일정만 오류
  // 이벤트가 하나도 없으면 빈 결과(오류 아님)
  assert.deepEqual(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR", {}), { rows: [], errors: [] });
});

test("validateEventFields: 이름·기준·월·일·연도 검증", () => {
  assert.equal(validateEventFields({ label: "", cal: "solar", month: 1, day: 1 }).ok, false);
  assert.equal(validateEventFields({ label: "x", cal: "julian", month: 1, day: 1 }).ok, false);
  assert.equal(validateEventFields({ label: "x", cal: "solar", month: 2, day: 29 }).ok, true); // 윤년 날짜는 허용
  assert.equal(validateEventFields({ label: "x", cal: "solar", month: 4, day: 31 }).ok, false);
  assert.equal(validateEventFields({ label: "x", cal: "lunar", month: 4, day: 31 }).ok, false);
  assert.equal(validateEventFields({ label: "x", cal: "solar", month: 1, day: 1, year: 1899 }).ok, false);
  assert.equal(validateEventFields({ label: "x", cal: "solar", month: 1, day: 1, year: "" }).value.year, null);
  const v = validateEventFields({ label: "  설날  ", cal: "lunar", month: 1, day: 1, leap: true, year: null });
  assert.deepEqual(v.value, { kind: "custom", label: "설날", cal: "lunar", month: 1, day: 1, leap: true, year: null, yearLabel: null, note: null });
  assert.equal(kindOf("csat"), "csat");
  assert.equal(kindOf("없는종류"), "custom");
  assert.equal(kindLabelOf("hakryeok"), "학력고사");
});

test("JSON 저장소: 추가·수정·삭제·같은 id 덮어쓰기", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cal-ev-"));
  const file = path.join(dir, "calendar-events.json");
  try {
    const store = createJsonEventStore(file);
    assert.deepEqual(await store.list(), []);
    const a = await store.create({ kind: "custom", label: "창립기념일", cal: "solar", month: 5, day: 1, leap: false, year: null, yearLabel: null, note: null, source: "admin" });
    assert.ok(a.id.startsWith("cal_"));
    assert.equal(a.year, null);
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.get(a.id)).label, "창립기념일");
    // 학년도 표기·비고는 저장소를 거쳐도 그대로 살아 있어야 한다(JSON 파일은 camelCase, DB 는 snake_case)
    const withLabel = await store.create({ kind: "csat", label: "2027학년도 수학능력시험", cal: "solar", month: 11, day: 19, leap: false, year: 2026, yearLabel: "2027학년도", note: "시험", source: "admin" });
    assert.equal(withLabel.yearLabel, "2027학년도");
    assert.equal(withLabel.note, "시험");
    assert.equal((await store.get(withLabel.id)).yearLabel, "2027학년도");
    const u = await store.update(a.id, { label: "창립 기념일", year: 2026 });
    assert.equal(u.label, "창립 기념일");
    assert.equal(u.year, 2026);
    assert.equal((await store.get(a.id)).label, "창립 기념일");
    assert.equal(await store.remove(withLabel.id), true);
    assert.equal(await store.update("cal_none", { label: "x" }), null);
    // upsertMany: 같은 id 는 갱신, 새 id 는 추가
    const seed = seedRows().slice(0, 3);
    assert.deepEqual(await store.upsertMany(seed), { added: 3, updated: 0 });
    assert.deepEqual(await store.upsertMany(seed), { added: 0, updated: 3 });
    assert.equal((await store.list()).length, 4); // 창립기념일 + 시드 3
    assert.equal(await store.remove(a.id), true);
    assert.equal(await store.remove(a.id), false);
    assert.equal((await store.list()).length, 3);
    // 파일에 그대로 남는다(서버를 다시 띄워도 같은 목록)
    const again = createJsonEventStore(file);
    assert.equal((await again.list()).length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
