import { addDaysKst, addHoursKst, hh, parseKst, ymd } from "./timezone";

export type TimeChunk = {
  from: string;
  to: string;
  startDt: string;
  startHh: string;
  endDt: string;
  endHh: string;
};

export function chunkRange(from: string, to: string, chunkDays: number): TimeChunk[] {
  const start = parseKst(from);
  const end = parseKst(to);
  if (end.getTime() < start.getTime()) return [];
  const days = Math.max(1, chunkDays);
  const chunks: TimeChunk[] = [];
  let cursor = from.length === 10 ? `${from} 00:00:00` : from;
  const last = to.length === 10 ? `${to} 23:00:00` : to;
  const lastMs = parseKst(last).getTime();
  let guard = 0;
  while (parseKst(cursor).getTime() <= lastMs && guard < 5000) {
    guard += 1;
    const next = addDaysKst(cursor, days);
    const nextMs = parseKst(next).getTime();
    const chunkEnd = nextMs > lastMs ? last : addHoursKst(next, -1);
    chunks.push({
      from: cursor,
      to: chunkEnd,
      startDt: ymd(cursor),
      startHh: hh(cursor),
      endDt: ymd(chunkEnd),
      endHh: hh(chunkEnd),
    });
    cursor = addHoursKst(chunkEnd, 1);
  }
  return chunks;
}
