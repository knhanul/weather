// 계절 신호(astra 4장, 4단계): 처음/마지막 사건의 날짜를 '완료된 전체 시즌'으로 비교한다. 새 모듈 — 기존 firstHotDay·firstHotSeasons 는 그대로.
//   시즌 = 탐색 구간(첫 30℃·첫 열대야·마지막 30℃ = 1/1~12/31, 첫 영하 = 8/1~다음 7/31, 첫 신적설 = 10/1~다음 9/30). seasonKey = '2026' 또는 '2026-27'.
//   날짜 위치(pos) = 시즌 시작일부터의 평년 달력 위치(윤년 2/29 는 2/28 과 3/1 사이 +0.5) — 해마다 같은 월일이 같은 위치.
//   '처음' 확정: 시즌 시작~사건 사이 결측 0일. 1일 결측 규칙 안이면 '확인 가능한 자료에서 처음'(firstConfirmed=false), 그 이상이면 완전한 시즌이 아님.
//   과거 대표 날짜: 끝난 시즌 전체를 본 완전한 시즌 중 발생한 k개의 평균·중앙값(k ≥ 4). 무발생 시즌은 날짜 0으로 넣지 않고 'n개 시즌 중 k개'로만 셈.
//   순위(몇 번째로 이른)는 발생 시즌 10개 이상일 때만. 마지막 30℃ 는 연말 전에는 '가장 최근 30℃ 이상인 날'(올해 마지막이라 하지 않음).
import { ymdToDn, dnToYmd, hval, missingOk, round } from "./stats-engine.mjs";
import { basePeriods } from "./rt-baseline.mjs";
import { SEASON_EVENTS } from "./rt-story-rules.mjs";

const pad = (n) => String(n).padStart(2, "0");
const dAt = (store, field, dn) => { const i = dn - store.base; return i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN; };
const hAt = (hs, dn, h) => { const i = (dn - hs.base) * 24 + h; return hs && i >= 0 && i < hs.n && hs.src[i] ? hval(hs.ta, i) : NaN; };
// 밤 최저(저녁이 속한 날짜 기준, 정시 fromHour 부터 hours 개). 하나라도 없으면 NaN
export function nightMin(hs, dn, { fromHour = 19, hours = 15 } = {}) {
  let m = Infinity;
  for (let k = 0; k < hours; k++) { const h = fromHour + k; const v = hAt(hs, dn + Math.floor(h / 24), h % 24); if (!Number.isFinite(v)) return NaN; m = Math.min(m, v); }
  return m;
}
// 시즌: 날짜가 속한 시즌의 시작 연도·키·시작/끝
export function seasonOf(ymd, startMd) {
  const y = +ymd.slice(0, 4);
  const Y = ymd.slice(5) >= startMd ? y : y - 1;
  return seasonByYear(Y, startMd);
}
export function seasonByYear(Y, startMd) {
  const start = `${Y}-${startMd}`;
  const end = dnToYmd(ymdToDn(`${Y + 1}-${startMd}`) - 1);
  return { year: Y, key: startMd === "01-01" ? String(Y) : `${Y}-${String(Y + 1).slice(2)}`, start, end };
}
// 평년 달력 위치(0 = 시즌 첫날). 2/29 → 2/28 위치 + 0.5
export function posOf(ymd, startMd) {
  const md = ymd.slice(5);
  const leapDay = md === "02-29";
  const m = leapDay ? "02-28" : md;
  const ref = ymdToDn(`${m >= startMd ? 2001 : 2002}-${m}`) - ymdToDn(`2001-${startMd}`);
  return ref + (leapDay ? 0.5 : 0);
}
export function mdOfPos(pos, startMd) {
  const dn = ymdToDn(`2001-${startMd}`) + Math.round(pos);
  return dnToYmd(dn).slice(5);
}
// 그 날의 값(사건 판정용)
function valueFn(ev, store, hs) {
  if (ev.hourly) return (dn) => nightMin(hs, dn, ev.night);
  return (dn) => dAt(store, ev.field, dn);
}
// 한 시즌을 a~b 날짜로 훑음. kind=first: 첫 사건, last: 마지막 사건
export function scanSeason(getVal, test, aDn, bDn, kind = "first") {
  let miss = 0, ev = null, missAfter = 0;
  for (let dn = aDn; dn <= bDn; dn++) {
    const v = getVal(dn);
    if (!Number.isFinite(v)) { miss++; if (ev && kind === "last") missAfter++; continue; }
    if (test(v)) {
      if (kind === "first") return { dn, missingBeforeEvent: miss, days: bDn - aDn + 1, missing: miss, scannedTo: dn };
      ev = dn; missAfter = 0;
    }
  }
  const days = bDn - aDn + 1;
  if (kind === "last" && ev != null) return { dn: ev, missingAfterEvent: missAfter, missing: miss, days };
  return { dn: null, missing: miss, days };
}
// 한 사건의 올해(현재 시즌)·과거 기준기간 요약
export function seasonEvent(id, { store, hs, refYmd, untilYmd, retro = false }) {
  const ev = SEASON_EVENTS[id];
  if (!ev) throw new Error(`알 수 없는 계절 신호 ${id}`);
  const getVal = valueFn(ev, store, hs);
  const test = ev.test;
  const kind = ev.kind || "first";
  // 현재 시즌(회고면 지난 시즌 전체)
  let S = seasonOf(refYmd, ev.startMd);
  if (retro) S = seasonByYear(S.year - 1, ev.startMd);
  const aDn = ymdToDn(S.start);
  const until = retro ? S.end : untilYmd < S.end ? untilYmd : S.end;
  const bDn = ymdToDn(until);
  const out = { id, label: ev.label, kind, startMd: ev.startMd, season: S.key, seasonStart: S.start, seasonEnd: S.end, scannedTo: until, retro, threshold: ev.threshold ?? null, unit: ev.unit || "" };
  if (bDn < aDn) Object.assign(out, { current: { date: null, coverage: null, note: "시즌이 막 시작해 살펴본 날이 없음" } });
  else {
    const r = scanSeason(getVal, test, aDn, bDn, kind);
    const days = r.dn != null && kind === "first" ? r.dn - aDn + 1 : bDn - aDn + 1;
    const cov = days > 0 ? round((days - r.missing) / days, 3) : null;
    if (r.dn != null) {
      const date = dnToYmd(r.dn);
      const confirmed = kind === "first" ? r.missingBeforeEvent === 0 : null;
      out.current = { date, pos: posOf(date, ev.startMd), value: round(getVal(r.dn), 1), coverage: cov, missingBeforeEvent: kind === "first" ? r.missingBeforeEvent : null, firstConfirmed: confirmed, usable: kind === "first" ? missingOk(r.dn - aDn + 1, r.missingBeforeEvent) : true, finalForYear: kind === "last" ? retro || S.end <= untilYmd : null };
    } else out.current = { date: null, coverage: cov, missing: r.missing, usable: missingOk(bDn - aDn + 1, r.missing), note: "현재까지 확인되지 않음" };
  }
  // 과거: 현재 시즌 시작 연도 기준 기준기간(끝난 시즌만)
  const periods = basePeriods(`${S.year}-06-01`).map((p) => {
    const rows = [];
    for (let y = p.from; y <= p.to; y++) {
      const s = seasonByYear(y, ev.startMd);
      const a = ymdToDn(s.start), b = ymdToDn(s.end);
      const r = scanSeason(getVal, test, a, b, kind);
      let complete;
      if (r.dn == null) complete = missingOk(r.days, r.missing);
      else if (kind === "first") complete = missingOk(r.dn - a + 1, r.missingBeforeEvent);
      else complete = missingOk(b - r.dn + 1, r.missingAfterEvent);
      const date = r.dn != null ? dnToYmd(r.dn) : null;
      rows.push({ season: s.key, date, pos: date ? posOf(date, ev.startMd) : null, complete });
    }
    const comp = rows.filter((r) => r.complete), hit = comp.filter((r) => r.date);
    const base = { id: p.id, label: p.label, range: p.range, years: p.years, completeSeasons: comp.length, hitSeasons: hit.length, incomplete: rows.filter((r) => !r.complete).map((r) => r.season), rows };
    if (comp.length < p.minYears) return { ...base, meanPos: null, status: "insufficient", statusText: `비교 데이터 부족(완전한 시즌 ${comp.length}개, 필요 ${p.minYears}개)` };
    if (hit.length < ev.minOccur) return { ...base, meanPos: null, status: "insufficient", statusText: `발생한 시즌 ${hit.length}개(${ev.minOccur}개 미만) — 대표 날짜를 내지 않음` };
    const ps = hit.map((r) => r.pos).sort((a, b) => a - b);
    const meanPos = ps.reduce((s, v) => s + v, 0) / ps.length;
    const medianPos = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
    const o = { ...base, meanPos: round(meanPos, 1), meanDate: mdOfPos(meanPos, ev.startMd), medianPos, medianDate: mdOfPos(medianPos, ev.startMd), status: "ok", statusText: `${comp.length}개 완전한 시즌 중 ${hit.length}개 발생 시즌의 평균` };
    const cur = out.current;
    if (cur?.date && cur.usable) {
      o.diffDays = Math.round(cur.pos - meanPos);
      if (hit.length >= ev.minRank) { o.earlier = ps.filter((x) => x < cur.pos).length; o.later = ps.filter((x) => x > cur.pos).length; }
    }
    return o;
  });
  out.periods = periods;
  return out;
}
// 예보로 본 '첫 통과 가능성'(예: 이번 계절 첫 영하 가능성). 이미 사건이 있거나, 시즌 앞부분이 불완전하면 내지 않음
export function forecastCrossing(id, e, days = []) {
  const ev = SEASON_EVENTS[id];
  if (!ev?.fcField || e.current?.date || e.current?.usable === false) return null;
  const d = days.find((x) => x.date > e.scannedTo && x.date <= e.seasonEnd && Number.isFinite(x[ev.fcField]) && ev.test(x[ev.fcField]));
  if (!d) return null;
  return { date: d.date, value: d[ev.fcField], source: d[`${ev.fcField}Source`] || null, base: d[`${ev.fcField}Base`] || null, pos: posOf(d.date, ev.startMd) };
}
// 점그래프 자료(지난 시즌별 날짜, 올해 강조)
export function seasonChart(e, basisId = "all") {
  const p = e.periods.find((x) => x.id === basisId) || e.periods[0];
  return {
    type: "season", event: e.id, label: e.label, kind: e.kind, startMd: e.startMd, season: e.season, basisId: p.id, basisLabel: p.label, range: p.range,
    rows: p.rows.map((r) => ({ season: r.season, pos: r.pos, date: r.date, state: !r.complete ? "incomplete" : r.date ? "hit" : "none" })),
    current: e.current?.date ? { season: e.season, pos: e.current.pos, date: e.current.date, kind: "obs", confirmed: e.current.firstConfirmed } : e.forecast ? { season: e.season, pos: e.forecast.pos, date: e.forecast.date, kind: "fcst" } : null,
    meanPos: p.meanPos ?? null, meanDate: p.meanDate ?? null, medianDate: p.medianDate ?? null, completeSeasons: p.completeSeasons, hitSeasons: p.hitSeasons, statusText: p.statusText,
    r5: (() => { const q = e.periods.find((x) => x.id === "r5"); return q?.meanPos != null ? { meanPos: q.meanPos, meanDate: q.meanDate, hitSeasons: q.hitSeasons, completeSeasons: q.completeSeasons } : null; })(),
  };
}
// 홈 노출(4장 표): 달·사건 뒤 일수. 회고는 다음 1~2월
export function seasonHome(id, e, today) {
  const ev = SEASON_EVENTS[id];
  const m = +today.slice(5, 7);
  if (e.retro) return ev.retroMonths?.includes(m) ? { home: true } : { home: false, reason: "회고 기간 밖" };
  if (!ev.months.includes(m)) return { home: false, reason: `계절 노출 기간 밖(${ev.months.join("·")}월만)` };
  const d = e.current?.date || e.forecast?.date;
  if (!d) return { home: false, reason: "올해(이번 시즌) 아직 확인되지 않음" };
  const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5);
  if (e.current?.date && age > ev.daysAfter) return { home: false, ageDays: age, reason: `확인 뒤 ${ev.daysAfter}일 지남(${age}일 전)` };
  if (e.current?.date && e.current.usable === false) return { home: false, reason: "시즌 앞부분 자료가 빠져 '처음'을 확인할 수 없음" };
  return { home: true, ageDays: age };
}
// 이야기 후보(4장): 사건 확인 → '평균보다 n일 이르/늦', 아직 없고 예보에서 처음 넘으면 '가능성'. basis 는 선택한 기준(bi = 0/1/2)
export function seasonCands(seasons, { sid, basis, bi, today, tv, LIFE_VALUE, basisName }) {
  const C = [];
  for (const e of seasons) {
    const ev = SEASON_EVENTS[e.id];
    const p = e.periods[bi];
    const home = seasonHome(e.id, e, today);
    const cur = e.current;
    const key = e.id === "first-hot-day" ? "heat-start" : `season-${e.id}`;
    const chart = seasonChart(e, basis);
    const dateW = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
    const firstWord = cur?.firstConfirmed === false ? "확인 가능한 자료에서 처음" : "처음";
    const base = { key, ruleId: e.id, topic: "season", path: "stat", phenomenon: "계절 신호", basisId: basis, A: LIFE_VALUE.info, minSamples: ev.minOccur, samples: p.hitSeasons, exclude: home.home ? null : home.reason, method: `${ev.label}(${ev.note || "공식 일자료"}). 시즌 ${e.seasonStart.slice(5)}~${e.seasonEnd.slice(5)}, 끝난 시즌 중 처음~사건 사이 결측 1일 이내인 완전한 시즌만 평균(발생 ${ev.minOccur}개 이상). 무발생 시즌은 날짜로 넣지 않아요.`, basis: "ASOS 공식 일자료", chart, facts: { event: e.id, season: e.season, seasonStart: e.seasonStart, missingBeforeEvent: cur?.missingBeforeEvent ?? null, firstConfirmed: cur?.firstConfirmed ?? null, coverage: cur?.coverage ?? null, meanDate: p.meanDate ?? null, hitSeasons: p.hitSeasons, completeSeasons: p.completeSeasons } };
    if (cur?.date && p.diffDays != null) {
      const d = p.diffDays, near = Math.abs(d) < 3;
      // '가장 최근 30℃'는 시즌이 끝나기 전엔 더 늦어질 수 있음 → '평균보다 늦었다'(이미 확정)만 말하고, 이르다·비슷하다는 말하지 않음
      const premature = e.kind === "last" && !e.retro && d < 3;
      const rel = near ? `${basisName} 평균(${p.meanDate.replace("-", "/")})과 비슷해요` : `${basisName} 평균보다 ${Math.abs(d)}일 ${d < 0 ? "일렀어요" : "늦었어요"}`;
      const what = e.kind === "last" ? (e.retro ? `지난해 마지막 ${ev.short.replace("마지막 ", "")}` : "가장 최근 30℃ 이상인 날") : ev.short;
      C.push({ ...base, ...(premature ? { exclude: base.exclude || "시즌이 끝나지 않아 '평균보다 이르다·비슷하다'고 말할 수 없음(더 늦은 30℃ 날이 올 수 있음)" } : {}), eventId: `${sid}|${e.id}|${e.season}|${cur.date}`, kind: "관측", U: Math.min(1, Math.abs(d) / 14), T: tv(`${cur.date} 00:00`, `${cur.date} 23:59`), material: { d, date: cur.date },
        title: `${what} ${dateW(cur.date)} — ${rel}`,
        text: `${e.kind === "last" ? (e.retro ? `${e.season}년 마지막 ${ev.label.replace(/^가장 최근 /, "")}` : `올해 ${e.scannedTo.slice(5).replace("-", "/")}까지 ${ev.label}`) : `이번 시즌(${e.season}) ${firstWord} ${ev.label.replace(/^(올해|이번 [^ ]+ 계절) (처음 )?/, "")}`}: ${dateW(cur.date)}(${cur.value}${ev.unit}). ${p.range}년 완전한 ${p.completeSeasons}개 시즌 중 ${p.hitSeasons}개 발생 시즌의 평균 ${p.meanDate.replace("-", "/")}${p.earlier != null ? ` — 발생 시즌 ${p.hitSeasons}개 중 이보다 ${e.kind === "last" ? "일찍 끝난" : "이른"} 시즌 ${p.earlier}개` : ""}.${e.kind === "last" && !e.retro ? " 연말 전이라 '올해 마지막'으로 말하지 않아요." : ""}` });
    } else if (!cur?.date && e.forecast && p.meanPos != null) {
      const fc = e.forecast;
      C.push({ ...base, key: `${key}-fc`, eventId: `${sid}|${e.id}|${e.season}|fc|${fc.date}`, kind: "예보", path: "life", U: Math.min(1, Math.abs(fc.pos - p.meanPos) / 14), T: tv(`${fc.date} 00:00`, `${fc.date} 23:59`), material: { fc: fc.date }, samples: p.hitSeasons,
        title: `${dateW(fc.date)} ${ev.short} 가능성(예보 ${fc.value}${ev.unit})`,
        text: `이번 시즌(${e.season}) ${e.scannedTo.slice(5)}까지 관측에서는 현재까지 확인되지 않음. ${fc.source || "예보"} ${String(fc.base || "").slice(5, 16)} 발표에서 ${dateW(fc.date)} ${ev.fcField === "min" ? "최저" : "최고"} ${fc.value}${ev.unit}. ${p.range}년 발생 시즌 평균 ${p.meanDate.replace("-", "/")}. 관측으로 확인되기 전까지는 가능성이에요.` });
    }
  }
  return C;
}
export const SEASON_IDS = Object.keys(SEASON_EVENTS);
export { pad };
