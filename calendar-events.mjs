// 특정일 캘린더(수능일·학력고사일·설날·추석 등) — 순수 규칙 + 저장소. HTTP 는 calendar-api.mjs 가 맡는다.
// 왜 나눴나: 음력 계산은 calendar-resolver.mjs 하나만 쓰고(여기서 새로 만들지 않음), 저장소는 PG·MySQL·JSON 셋을 같은 인터페이스로
// 두어 서버 코드가 저장 방식과 상관없이 같은 함수를 부른다(layouts.mjs 와 같은 패턴).
// 규칙 두 가지:
//  - year=null  → 해마다 되풀이되는 규칙(설날 = 음력 1/1). 해석할 때 기준연도를 인자로 받아 그 해 양력 날짜를 만든다.
//  - year=숫자  → 그 해 한 번뿐인 날(2027학년도 수능 = 2026-11-19). 해석은 그 연도로만 한다(다른 해에 나타나지 않음).
import crypto from "node:crypto";
import fs from "node:fs";
import { resolveYear, parseDateSpec, ymdStr } from "./calendar-resolver.mjs";

export const CALENDAR_EVENT_VERSION = "calendar-events.v1";

// 종류(kind)는 화면 필터·배지에 쓰는 고정 목록. 목록에 없는 값은 custom 으로 본다(가져오기·직접 입력에서 오타가 와도 저장은 되게).
export const CALENDAR_KINDS = [
  { id: "csat", label: "대학수학능력시험" },
  { id: "hakryeok", label: "학력고사" },
  { id: "holiday", label: "명절·기념일" },
  { id: "custom", label: "직접 추가" },
];
const KIND_IDS = new Set(CALENDAR_KINDS.map((k) => k.id));
export const kindOf = (v) => (KIND_IDS.has(String(v)) ? String(v) : "custom");
export const kindLabelOf = (v) => (CALENDAR_KINDS.find((k) => k.id === kindOf(v)) || CALENDAR_KINDS[3]).label;

export const LABEL_MAX = 120;
export const NOTE_MAX = 255;
export const YEAR_LABEL_MAX = 24;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2050;

const newId = () => `cal_${crypto.randomBytes(16).toString("base64url")}`; // cal_ + 22자 = 26자(id 컬럼 40자 안)
const iso = (v) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const boolOf = (v) => v === true || v === 1 || v === "1" || v === "true";

// 저장소가 돌려준 행(스네이크)을 내부 모양(카멜)으로. MySQL 은 TINYINT(1) 을 boolean 으로 캐스팅하지만 JSON 저장소는 0/1 이라 둘 다 받는다.
// DB 는 snake_case(year_label), JSON 파일은 camelCase(yearLabel) 로 남는다 — 저장 방식과 상관없이 같은 모양으로 읽는다.
export function rowOut(r) {
  const yl = r.year_label ?? r.yearLabel;
  return {
    id: String(r.id),
    kind: kindOf(r.kind),
    label: String(r.label ?? ""),
    cal: r.cal === "lunar" ? "lunar" : "solar",
    month: Number(r.month),
    day: Number(r.day),
    leap: boolOf(r.leap),
    year: r.year == null || r.year === "" ? null : Number(r.year),
    yearLabel: yl == null || yl === "" ? null : String(yl),
    note: r.note == null || r.note === "" ? null : String(r.note),
    source: ["seed", "admin", "import"].includes(r.source) ? r.source : "admin",
    createdAt: iso(r.created_at ?? r.createdAt),
    updatedAt: iso(r.updated_at ?? r.updatedAt),
  };
}

const cleanText = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

// 입력 검증. partial=true 면 넘어온 항목만 본다(PUT 부분 수정). 값은 저장에 쓰는 모양으로 돌려준다.
export function validateEventFields(input, { partial = false } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined;

  if (has("kind") || !partial) out.kind = kindOf(src.kind);
  if (has("source")) out.source = ["seed", "admin", "import"].includes(src.source) ? src.source : "admin";

  if (has("label") || !partial) {
    const s = cleanText(src.label);
    if (!s) return { ok: false, message: "이름을 입력해 주세요." };
    if ([...s].length > LABEL_MAX) return { ok: false, message: `이름은 ${LABEL_MAX}자까지입니다.` };
    out.label = s;
  }

  // 기준(양력·음력)은 'cal' 키로 받는다(화면·저장 모두 같은 이름). 잘못된 값이면 조용히 solar 로 바꾸지 않고 알린다.
  const calRaw = has("cal") ? src.cal : has("calendar") ? src.calendar : undefined;
  if (calRaw !== undefined || !partial) {
    if (calRaw !== undefined && !["solar", "lunar"].includes(String(calRaw))) return { ok: false, message: "기준은 양력(solar) 또는 음력(lunar)입니다." };
    out.cal = String(calRaw || "solar") === "lunar" ? "lunar" : "solar";
  }

  const leapRaw = has("leap") ? src.leap : undefined;
  if (leapRaw !== undefined) out.leap = boolOf(leapRaw);

  if (has("month") || has("day") || !partial) {
    // parseDateSpec 이 양력 2/29 는 허용하고 4/31 처럼 없는 날은 거절한다(음력은 1~30). 달력 계산 규칙을 여기서 다시 쓰지 않는다.
    const d = parseDateSpec({ calendar: out.cal || "solar", month: has("month") ? src.month : NaN, day: has("day") ? src.day : NaN, leap: out.leap });
    if (!d.ok) return { ok: false, message: d.message };
    out.month = d.spec.month;
    out.day = d.spec.day;
    if (out.cal === "solar") out.leap = false; // 양력에는 윤달 개념이 없다
  }

  if (has("year") || !partial) {
    const y = src.year;
    if (y === null || y === "" || y === undefined) out.year = null;
    else {
      const n = Number(y);
      if (!Number.isInteger(n) || n < YEAR_MIN || n > YEAR_MAX) return { ok: false, message: `연도는 비우거나 ${YEAR_MIN}~${YEAR_MAX} 사이 숫자입니다.` };
      out.year = n;
    }
  }

  if (has("yearLabel") || !partial) {
    const s = cleanText(src.yearLabel);
    if ([...s].length > YEAR_LABEL_MAX) return { ok: false, message: `학년도 표기는 ${YEAR_LABEL_MAX}자까지입니다.` };
    out.yearLabel = s || null;
  }

  if (has("note") || !partial) {
    const s = cleanText(src.note);
    if ([...s].length > NOTE_MAX) return { ok: false, message: `비고는 ${NOTE_MAX}자까지입니다.` };
    out.note = s || null;
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------- 시드(실제 시행일)
// 수능: [학년도, 시행일, 차수]. 1994학년도만 1·2차 두 번 시행. 연도(year)는 시행일의 양력 연도(예: 2027학년도 → 2026).
const CSAT_SEED = [
  ["1994", "1993-08-20", "1차"], ["1994", "1993-11-16", "2차"],
  ["1995", "1994-11-23"], ["1996", "1995-11-22"], ["1997", "1996-11-13"], ["1998", "1997-11-19"],
  ["1999", "1998-11-18"], ["2000", "1999-11-17"], ["2001", "2000-11-15"], ["2002", "2001-11-07"],
  ["2003", "2002-11-06"], ["2004", "2003-11-05"], ["2005", "2004-11-17"], ["2006", "2005-11-23"],
  ["2007", "2006-11-16"], ["2008", "2007-11-15"], ["2009", "2008-11-13"], ["2010", "2009-11-12"],
  ["2011", "2010-11-18"], ["2012", "2011-11-10"], ["2013", "2012-11-08"], ["2014", "2013-11-07"],
  ["2015", "2014-11-13"], ["2016", "2015-11-12"], ["2017", "2016-11-17"], ["2018", "2017-11-23"],
  ["2019", "2018-11-15"], ["2020", "2019-11-14"], ["2021", "2020-12-03"], ["2022", "2021-11-18"],
  ["2023", "2022-11-17"], ["2024", "2023-11-16"], ["2025", "2024-11-14"], ["2026", "2025-11-13"],
  ["2027", "2026-11-19"],
];
// 학력고사: [학년도, 시행일, 전기/후기]. 1988~1993학년도는 전기·후기 두 번.
const HAKRYEOK_SEED = [
  ["1982", "1981-11-24"], ["1983", "1982-12-02"], ["1984", "1983-11-22"], ["1985", "1984-11-23"],
  ["1986", "1985-11-20"], ["1987", "1986-11-20"],
  ["1988", "1987-12-22", "전기"], ["1988", "1988-01-28", "후기"],
  ["1989", "1988-12-16", "전기"], ["1989", "1989-01-23", "후기"],
  ["1990", "1989-12-15", "전기"], ["1990", "1990-01-22", "후기"],
  ["1991", "1990-12-18", "전기"], ["1991", "1991-01-22", "후기"],
  ["1992", "1991-12-17", "전기"], ["1992", "1992-02-10", "후기"],
  ["1993", "1992-12-22", "전기"], ["1993", "1993-01-29", "후기"],
];
// 연기 사유 — 실제로 날짜가 밀린 해만 적는다(다른 해는 비고 없음).
const CSAT_NOTE = {
  "2006": "부산 APEC 정상회의로 연기",
  "2011": "서울 G20 정상회의로 연기",
  "2018": "포항 지진으로 1주 연기",
  "2021": "코로나19로 12월 3일로 연기",
};

const oneOff = (kind, yearLabel, date, suffix, note) => {
  const [y, m, d] = date.split("-").map(Number);
  return { kind, year: y, month: m, day: d, cal: "solar", leap: false, yearLabel: `${yearLabel}학년도`, label: `${yearLabel}학년도 ${kind === "csat" ? "대학수학능력시험" : "대학입학 학력고사"}${suffix ? ` ${suffix}` : ""}`, note: note || null };
};

export const SEED_EVENTS = [
  ...CSAT_SEED.map(([yl, date, round]) => oneOff("csat", yl, date, round || "", CSAT_NOTE[yl])),
  ...HAKRYEOK_SEED.map(([yl, date, round]) => oneOff("hakryeok", yl, date, round || "", null)),
  // 해마다 되풀이되는 규칙 — year=null. 실제 양력 날짜는 해석할 때 음력 표로 계산한다.
  { kind: "holiday", year: null, cal: "lunar", month: 1, day: 1, leap: false, yearLabel: null, label: "설날", note: null },
  { kind: "holiday", year: null, cal: "lunar", month: 8, day: 15, leap: false, yearLabel: null, label: "추석", note: null },
];

// 시드 id 는 내용에서 결정적으로 만든다 — '기본 자료 채우기'를 여러 번 눌러도 같은 행이 갱신될 뿐 중복이 생기지 않는다.
export function seedId(e) {
  const key = e.year == null ? `${e.kind}|rule|${e.cal}|${e.leap ? "L" : "P"}|${e.month}|${e.day}` : `${e.kind}|${e.year}|${ymdStr(e.year, e.month, e.day)}`;
  return `cal_seed_${crypto.createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
}
export function seedRows() {
  return SEED_EVENTS.map((e) => ({ id: seedId(e), ...e, source: "seed" }));
}

// ---------------------------------------------------------------- 해석
// ev 하나를 기준연도 year 로 해석. year=null 규칙이면 year 로, 고정 연도면 그 연도로만 계산한다.
export function resolveEvent(ev, year) {
  // 저장된 행이 언제나 검증을 거친다고 가정하지 않는다(가져온 자료·손으로 고친 JSON). 4/31 처럼 없는 날짜는
  // resolveYear 가 그대로 문자열을 만들어 버리므로 여기서 먼저 parseDateSpec 으로 거른다.
  const d = parseDateSpec({ calendar: ev.cal === "lunar" ? "lunar" : "solar", month: ev.month, day: ev.day, leap: !!ev.leap });
  const y = ev.year == null ? Number(year) : ev.year;
  if (!d.ok || !Number.isInteger(y)) return { status: "nodate", solarDate: null, lunarText: null, referenceYear: null };
  const r = resolveYear(d.spec, y);
  return { status: r.status, solarDate: r.solarDate || null, lunarText: r.lunarText || null, referenceYear: y };
}

// [fromYear, toYear] 안의 특정일을 양력 날짜 오름차순으로. 범위 판정은 '해석된 양력 날짜의 연도' 기준이다
// (음력 12월처럼 양력으로 해를 넘기는 날이 있어, 규칙은 한 해 앞뒤로 더 계산해 보고 범위 밖이면 버린다).
export function resolveAll(events, fromYear, toYear) {
  const a = Number.isInteger(fromYear) ? fromYear : YEAR_MIN;
  const b = Number.isInteger(toYear) ? toYear : a;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const out = [];
  for (const ev of events || []) {
    if (!ev || !Number.isInteger(ev.month) || !Number.isInteger(ev.day)) continue;
    const years = ev.year == null ? Array.from({ length: hi - lo + 3 }, (_, i) => lo - 1 + i) : [ev.year];
    for (const y of years) {
      const r = resolveEvent(ev, y);
      if (r.status !== "ok" || !r.solarDate) continue;
      const sy = Number(r.solarDate.slice(0, 4));
      if (sy < lo || sy > hi) continue;
      out.push({
        id: ev.id,
        kind: kindOf(ev.kind),
        kindLabel: kindLabelOf(ev.kind),
        label: ev.label,
        note: ev.note ?? null,
        oneOff: ev.year != null,
        year: sy,
        yearLabel: ev.yearLabel ?? null,
        solarDate: r.solarDate,
        lunarText: r.lunarText ?? null,
      });
    }
  }
  out.sort((x, y) => (x.solarDate === y.solarDate ? x.label.localeCompare(y.label, "ko") : x.solarDate < y.solarDate ? -1 : 1));
  // 같은 날 같은 이름이 두 번 들어와도(예: 기본 자료의 설날 + 캘린더 파일의 설날) 화면에는 한 번만 보여 준다.
  // 비고가 있는 행을 남긴다 — '포항 지진으로 연기' 같은 설명이 붙은 쪽이 더 쓸모 있다.
  const byKey = new Map();
  for (const e of out) {
    const k = `${e.solarDate}|${e.label}`;
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, e);
    else if (!prev.note && e.note) byKey.set(k, e);
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------- 붙여넣기 가져오기
// 한 줄 = 한 항목. 형식(날짜 뒤 나머지 전체가 이름):
//   2026-11-19 2027학년도 수능      → 한 번뿐인 양력 날
//   11-19 수능                      → 해마다 양력 11/19
//   음력 08-15 추석                 → 해마다 음력 8/15
//   음력 윤 04-15 라벨              → 해마다 음력 윤4/15
// 빈 줄과 '#' 로 시작하는 줄은 건너뛴다. 잘못된 줄은 errors 에 모으고 나머지는 계속 처리한다(전체 실패 금지).
// 날짜 표기: 2026-11-19 · 2026.11.19 · 2026/11/19 · 2026년 11월 19일 (연도가 있으면 그날 한 번, 없으면 해마다)
// 구분자 뒤에 '년·월'도 받는다 — 사람이 쓰는 표기를 그대로 붙여넣게 하기 위해서다.
const RE_ONE = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\s+(.+)$/;
const RE_MD = /^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\s+(.+)$/;
const RE_LUNAR = /^음력\s*(윤\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\s+(.+)$/;

// ---------------------------------------------------------------- 캘린더 파일(.ics) 가져오기
// 왜 필요한가: 구글·아이폰 캘린더의 '공휴일'이나 관공서 배포 캘린더는 .ics 로 받는다. 연초에 그 파일을 그대로 넣으면
// 그 해 설날·추석·공휴일이 한 번에 들어온다(사람이 표를 손으로 옮겨 적지 않게).
const icsText = (s) => String(s).replace(/\\[nN]/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").replace(/\s+/g, " ").trim();

// ICS 날짜 → { year, month, day }. VALUE=DATE(종일)는 그대로, 시각이 UTC(Z)면 한국 시간으로 옮겨 날짜를 정한다.
function icsDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v || "").trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (m[4] && m[7] === "Z") {
    const t = Date.UTC(y, mo - 1, d, +m[4], +m[5], +(m[6] || 0)) + 9 * 3600000; // UTC → KST(날짜만 필요)
    const k = new Date(t);
    return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate() };
  }
  return { year: y, month: mo, day: d };
}

export function parseIcs(text, { kind } = {}) {
  const rows = [], errors = [];
  const k = kindOf(kind);
  // 줄 펼치기: 다음 줄이 공백·탭으로 시작하면 앞 줄에 이어 붙인다(RFC 5545 3.1).
  const lines = [];
  String(text ?? "").split(/\r?\n/).forEach((raw) => {
    if (/^[ \t]/.test(raw) && lines.length) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  });
  let cur = null;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) { cur = { __line: i + 1 }; return; }
    if (/^END:VEVENT$/i.test(t)) {
      if (cur) {
        const at = cur.__line;
        const d = icsDate(cur.dtstart);
        const yearly = /FREQ=YEARLY/.test(cur.rrule || "");
        if (!d) errors.push({ line: at, message: "일정에 날짜(DTSTART)가 없습니다." });
        else if (!cur.summary) errors.push({ line: at, message: "일정에 이름(SUMMARY)이 없습니다." });
        else {
          const v = validateEventFields({ kind: k, label: cur.summary, cal: "solar", month: d.month, day: d.day, year: yearly ? null : d.year, note: null });
          if (v.ok) rows.push({ ...v.value, source: "import" });
          else errors.push({ line: at, message: v.message });
        }
      }
      cur = null;
      return;
    }
    if (!cur) return;
    const idx = line.indexOf(":");
    if (idx < 0) return;
    const key = line.slice(0, idx);
    const val = line.slice(idx + 1);
    const name = key.split(";")[0].trim().toUpperCase();
    if (name === "DTSTART") cur.dtstart = val.trim();
    else if (name === "SUMMARY") cur.summary = icsText(val);
    else if (name === "RRULE") cur.rrule = val.trim().toUpperCase();
  });
  return { rows, errors };
}
export const looksLikeIcs = (text) => /BEGIN:(VCALENDAR|VEVENT)/i.test(String(text ?? ""));

export function parseImport(text, { kind } = {}) {
  const rows = [], errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  const k = kindOf(kind);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const no = i + 1;
    let m;
    let row;
    if ((m = RE_LUNAR.exec(line))) {
      row = { kind: k, label: m[4], cal: "lunar", month: +m[2], day: +m[3], leap: !!(m[1] && m[1].trim() === "윤"), year: null, yearLabel: null, note: null, source: "import" };
    } else if ((m = RE_ONE.exec(line))) {
      row = { kind: k, label: m[4], cal: "solar", month: +m[2], day: +m[3], leap: false, year: +m[1], yearLabel: null, note: null, source: "import" };
    } else if ((m = RE_MD.exec(line))) {
      row = { kind: k, label: m[3], cal: "solar", month: +m[1], day: +m[2], leap: false, year: null, yearLabel: null, note: null, source: "import" };
    } else {
      errors.push({ line: no, message: "날짜 형식을 알아보지 못했습니다(예: 2026-11-19 2027학년도 수능 · 11-19 수능 · 음력 08-15 추석)." });
      return;
    }
    const v = validateEventFields(row);
    if (!v.ok) {
      errors.push({ line: no, message: v.message });
      return;
    }
    rows.push({ ...v.value, label: v.value.label });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- 저장소 3종(같은 인터페이스)
// list() 전체 · get(id) · create(row) · update(id, patch) · remove(id) · upsertMany(rows)
const COLS_PG = "id, kind, label, cal, month, day, leap, year, year_label, note, source, created_at, updated_at";
const COLS_MY = "id, kind, label, cal, `month`, `day`, leap, `year`, year_label, note, source, created_at, updated_at";

export function createPgEventStore(pool) {
  const ins = (client, r) =>
    client.query(
      `INSERT INTO calendar_events (id, kind, label, cal, month, day, leap, year, year_label, note, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET kind = $2, label = $3, cal = $4, month = $5, day = $6, leap = $7,
         year = $8, year_label = $9, note = $10, source = $11, updated_at = now()`,
      [r.id, kindOf(r.kind), r.label, r.cal === "lunar" ? "lunar" : "solar", r.month, r.day, !!r.leap, r.year ?? null, r.yearLabel ?? null, r.note ?? null, r.source || "admin"],
    );
  return {
    kind: "postgresql",
    async list() {
      const { rows } = await pool.query(`SELECT ${COLS_PG} FROM calendar_events ORDER BY (year IS NULL) DESC, year, month, day, id`);
      return rows.map(rowOut);
    },
    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLS_PG} FROM calendar_events WHERE id = $1`, [id]);
      return rows[0] ? rowOut(rows[0]) : null;
    },
    async create(row) {
      const id = row.id || newId();
      const { rows } = await pool.query(
        `INSERT INTO calendar_events (id, kind, label, cal, month, day, leap, year, year_label, note, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS_PG}`,
        [id, kindOf(row.kind), row.label, row.cal === "lunar" ? "lunar" : "solar", row.month, row.day, !!row.leap, row.year ?? null, row.yearLabel ?? null, row.note ?? null, row.source || "admin"],
      );
      return rowOut(rows[0]);
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const m = { ...cur, ...patch };
      const { rows } = await pool.query(
        `UPDATE calendar_events SET kind=$2, label=$3, cal=$4, month=$5, day=$6, leap=$7, year=$8, year_label=$9, note=$10, updated_at=now()
         WHERE id=$1 RETURNING ${COLS_PG}`,
        [id, kindOf(m.kind), m.label, m.cal === "lunar" ? "lunar" : "solar", m.month, m.day, !!m.leap, m.year ?? null, m.yearLabel ?? null, m.note ?? null],
      );
      return rows[0] ? rowOut(rows[0]) : null;
    },
    async remove(id) {
      return (await pool.query("DELETE FROM calendar_events WHERE id = $1", [id])).rowCount > 0;
    },
    async upsertMany(rows) {
      const client = await pool.connect();
      let added = 0, updated = 0;
      try {
        await client.query("BEGIN");
        const ids = new Set((await client.query("SELECT id FROM calendar_events")).rows.map((r) => r.id));
        for (const r of rows) {
          const row = { ...r, id: r.id || newId() };
          if (ids.has(row.id)) updated++;
          else { added++; ids.add(row.id); }
          await ins(client, row);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      return { added, updated };
    },
  };
}

// MySQL 5.6: UPSERT 는 INSERT ... ON DUPLICATE KEY UPDATE. 5.6 에는 VALUES() 만 있으므로 그대로 쓴다.
export function createMysqlEventStore(h) {
  const up = (run, r) =>
    run(
      `INSERT INTO calendar_events (id, kind, label, cal, \`month\`, \`day\`, leap, \`year\`, year_label, note, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
       ON DUPLICATE KEY UPDATE kind=VALUES(kind), label=VALUES(label), cal=VALUES(cal), \`month\`=VALUES(\`month\`), \`day\`=VALUES(\`day\`),
         leap=VALUES(leap), \`year\`=VALUES(\`year\`), year_label=VALUES(year_label), note=VALUES(note), source=VALUES(source), updated_at=NOW(6)`,
      [r.id, kindOf(r.kind), r.label, r.cal === "lunar" ? "lunar" : "solar", r.month, r.day, r.leap ? 1 : 0, r.year ?? null, r.yearLabel ?? null, r.note ?? null, r.source || "admin"],
    );
  return {
    kind: "mysql",
    async list() {
      return (await h.read(`SELECT ${COLS_MY} FROM calendar_events ORDER BY (\`year\` IS NULL) DESC, \`year\`, \`month\`, \`day\`, id`)).map(rowOut);
    },
    async get(id) {
      const r = await h.read(`SELECT ${COLS_MY} FROM calendar_events WHERE id = ?`, [id]);
      return r[0] ? rowOut(r[0]) : null;
    },
    async create(row) {
      const id = row.id || newId();
      await h.query(
        "INSERT INTO calendar_events (id, kind, label, cal, `month`, `day`, leap, `year`, year_label, note, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))",
        [id, kindOf(row.kind), row.label, row.cal === "lunar" ? "lunar" : "solar", row.month, row.day, row.leap ? 1 : 0, row.year ?? null, row.yearLabel ?? null, row.note ?? null, row.source || "admin"],
      );
      return this.get(id);
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const m = { ...cur, ...patch };
      await h.query(
        "UPDATE calendar_events SET kind=?, label=?, cal=?, `month`=?, `day`=?, leap=?, `year`=?, year_label=?, note=?, updated_at=NOW(6) WHERE id=?",
        [kindOf(m.kind), m.label, m.cal === "lunar" ? "lunar" : "solar", m.month, m.day, m.leap ? 1 : 0, m.year ?? null, m.yearLabel ?? null, m.note ?? null, id],
      );
      return this.get(id);
    },
    async remove(id) {
      return (await h.query("DELETE FROM calendar_events WHERE id = ?", [id])).affectedRows > 0;
    },
    async upsertMany(rows) {
      return h.tx(async (run) => {
        let added = 0, updated = 0;
        const ids = new Set((await run("SELECT id FROM calendar_events")).map((r) => r.id));
        for (const r of rows) {
          const row = { ...r, id: r.id || newId() };
          if (ids.has(row.id)) updated++;
          else { added++; ids.add(row.id); }
          await up(run, row);
        }
        return { added, updated };
      });
    },
  };
}

// 로컬 개발(DATABASE_URL 없음)용 JSON 파일 저장소. layouts.mjs 와 같은 방식(작은 파일, 통째로 읽고 씀).
export function createJsonEventStore(file) {
  const load = () => {
    try {
      const a = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  };
  const save = (all) => fs.writeFileSync(file, JSON.stringify(all, null, 2));
  const now = () => new Date().toISOString();
  const key = (r) => (r.year == null ? 1 : 0); // 목록 순서: 규칙(해마다) 먼저, 그다음 연도·월·일
  const sorted = (all) => all.slice().sort((a, b) => key(b) - key(a) || (a.year ?? 0) - (b.year ?? 0) || a.month - b.month || a.day - b.day || String(a.id).localeCompare(String(b.id)));
  const put = (all, r) => {
    const id = r.id || newId();
    const i = all.findIndex((x) => x.id === id);
    const row = {
      id, kind: kindOf(r.kind), label: r.label, cal: r.cal === "lunar" ? "lunar" : "solar",
      month: r.month, day: r.day, leap: !!r.leap, year: r.year ?? null,
      yearLabel: r.yearLabel ?? r.year_label ?? null, note: r.note ?? null, source: r.source || "admin",
      created_at: i >= 0 ? all[i].created_at || now() : now(), updated_at: now(),
    };
    if (i >= 0) all[i] = row; else all.push(row);
    return row;
  };
  return {
    kind: "json",
    async list() {
      return sorted(load()).map(rowOut);
    },
    async get(id) {
      const r = load().find((x) => x.id === id);
      return r ? rowOut(r) : null;
    },
    async create(row) {
      const all = load();
      const saved = put(all, row);
      save(all);
      return rowOut(saved);
    },
    async update(id, patch) {
      const all = load();
      const cur = all.find((x) => x.id === id);
      if (!cur) return null;
      const m = { ...rowOut(cur), ...patch }; // 저장 전에 정규화해 두면 patch 가 일부만 와도 이전 값이 남는다
      cur.kind = kindOf(m.kind);
      cur.label = m.label;
      cur.cal = m.cal === "lunar" ? "lunar" : "solar";
      cur.month = m.month;
      cur.day = m.day;
      cur.leap = !!m.leap;
      cur.year = m.year ?? null;
      cur.yearLabel = m.yearLabel ?? null;
      cur.note = m.note ?? null;
      cur.updated_at = now();
      save(all);
      return rowOut(cur);
    },
    async remove(id) {
      const all = load();
      const next = all.filter((x) => x.id !== id);
      if (next.length === all.length) return false;
      save(next);
      return true;
    },
    async upsertMany(rows) {
      const all = load();
      let added = 0, updated = 0;
      for (const r of rows) {
        const id = r.id || newId();
        if (all.some((x) => x.id === id)) updated++;
        else added++;
        put(all, { ...r, id });
      }
      save(all);
      return { added, updated };
    },
  };
}
