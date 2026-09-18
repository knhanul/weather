const TIMEZONE = "Asia/Seoul" as const;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Instant → KST wall clock parts. Independent of the host locale. */
export function instantToKst(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    second: kst.getUTCSeconds(),
  };
}

export function nowKst(): Date {
  return new Date();
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

export function formatKst(date: Date, withSeconds = true): string {
  const p = instantToKst(date);
  const base = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
  return withSeconds ? `${base}:${pad(p.second)}` : `${base}:00`;
}

export function formatKstDate(date: Date): string {
  const p = instantToKst(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatKstCompactDate(date: Date): string {
  const p = instantToKst(date);
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

export function formatKstHour(date: Date): string {
  return pad(instantToKst(date).hour);
}

/**
 * Parse a KST wall-clock or ISO string into an instant.
 * Accepts `YYYY-MM-DD[ HH:mm[:ss]]`, `YYYY-MM-DDTHH:mm[:ss][+09:00]`,
 * and `+` decoded as space (`… 09:00`). UTC `Z` is converted, not treated as KST.
 */
export function parseKst(value: string): Date {
  const trimmed = value.trim();
  if (/Z$/i.test(trimmed) && /T/i.test(trimmed)) {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) throw new Error(`지원하지 않는 일시 형식: ${value}`);
    return d;
  }
  const cleaned = trimmed
    .replace("T", " ")
    .replace(/\+09:00$/, "")
    .replace(/ 09:00$/, "")
    .replace(/\.\d+$/, "");
  const m = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/,
  );
  if (!m) throw new Error(`지원하지 않는 일시 형식: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4] ?? 0);
  const minute = Number(m[5] ?? 0);
  const second = Number(m[6] ?? 0);
  return kstWallToUtc(year, month, day, hour, minute, second);
}

export function kstWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - KST_OFFSET_MS);
}

/** Normalize any accepted input to `YYYY-MM-DD HH:mm:ss` KST wall clock. */
export function toKstWall(value: string): string {
  return formatKst(parseKst(value));
}

export function addHoursKst(kstWall: string, hours: number): string {
  const d = parseKst(kstWall);
  return formatKst(new Date(d.getTime() + hours * 3600_000));
}

export function addDaysKst(kstWall: string, days: number): string {
  return addHoursKst(kstWall.length === 10 ? `${kstWall} 00:00:00` : kstWall, days * 24);
}

export function toIsoKst(kstWall: string): string {
  const wall = toKstWall(kstWall);
  return `${wall.slice(0, 10)}T${wall.slice(11)}+09:00`;
}

export function ymd(value: string): string {
  return toKstWall(value).slice(0, 10).replaceAll("-", "");
}

export function hh(value: string): string {
  return toKstWall(value).slice(11, 13);
}

export function latestOfficialHour(now = new Date()): string {
  const p = instantToKst(now);
  // Official ASOS hourly is published through D-1, and D-1 itself is
  // queryable after 11:00 KST on the following day.
  const daysBack = p.hour < 11 ? 2 : 1;
  const prev = new Date(kstWallToUtc(p.year, p.month, p.day, 0, 0, 0).getTime() - daysBack * 24 * 3600_000);
  const q = instantToKst(prev);
  return `${q.year}-${pad(q.month)}-${pad(q.day)} 23:00:00`;
}

export function latestOfficialDate(now = new Date()): string {
  return latestOfficialHour(now).slice(0, 10);
}

export { TIMEZONE };
