// '가장 큰 변화'(astra 6장, 4단계) — 앞으로 72시간 예보에서 변화 후보를 모두 찾고, 크기 M = min(1, |Δ|/기준) 으로 최대 3개를 고른 뒤 시간순.
//   M 은 통계적 희귀도가 아니다(같은 시기 분포와 비교하지 않음). 후보마다 72시간 그래프에서 강조할 구간(startW~endW)을 준다.
//   규칙(초기값): 3시간 기온 변화 |Δ| ≥ 4℃(기준 8; 하루 흐름 방향이면 6℃ — CHANGE_RULES.diurnal) / 이웃한 날 최저기온 |Δ| ≥ 5℃(기준 10) / 풍속 W(t+3)−W(t) ≥ 3 이고 W(t+3) ≥ 5 m/s(기준 6, '돌풍'이라 하지 않음)
//   / 다음 날 일교차 D ≥ 10 이고 전날보다 5 이상 큼(기준 10) / 습도 3시간 |Δ| ≥ 20%p(기준 40, 건조·안개로 해석하지 않음)
//   / 강수형태가 각각 2시간 이상 이어진 두 형태로 바뀜(빈 시각을 건너 잇지 않음) / 주말: 토·일 중 하루만 활동 조건 2시간 이상 연속
//   / 큰 예보 수정: 직전 발표 대비 기온 ≥ 3℃ 또는 강수확률 ≥ 20%p — '발표 변경'으로 표시
export const CHANGE_RULES = {
  rise3h: { delta: 4, ref: 8 }, tmn: { delta: 5, ref: 10 }, wind: { delta: 3, min: 5, ref: 6 }, range: { min: 10, up: 5, ref: 10 }, rh: { delta: 20, ref: 40 },
  pty: { run: 2, mStart: 0.7, mSwitch: 1 }, weekend: { run: 2, from: 7, to: 20, tmin: 10, tmax: 25, wind: 5, popMax: 60, m: 0.5 }, revision: { ta: 3, taRef: 6, pop: 20, popRef: 40 },
  max: 3, hours: 72,
  // 4단계 되돌려 보기 조정: 아침 오름(5~12시 시작 기온 상승·습도 하강)·저녁 내림(15~21시 시작 기온 하강·습도 상승)은
  //   매일 있는 하루 흐름이라 초기 기준(4℃·20%p)으로는 거의 매일 걸림 → 그 방향·시간대에만 기준 × 1.5(6℃·30%p)
  diurnal: { riseFrom: 5, riseTo: 12, fallFrom: 15, fallTo: 21, factor: 1.5 },
};
// 하루 흐름 방향(기온 기준): +1 = 아침 오름 시간대, −1 = 저녁 내림 시간대, 0 = 그 밖
const diurnalDir = (t) => { const h = +t.slice(11, 13), D = CHANGE_RULES.diurnal; return h >= D.riseFrom && h <= D.riseTo ? 1 : h >= D.fallFrom && h <= D.fallTo ? -1 : 0; };
const need = (base, d, t, sign = 1) => (Math.sign(d) * sign === diurnalDir(t) ? base * CHANGE_RULES.diurnal.factor : base);
const CR = CHANGE_RULES;
const fin = (v) => v != null && Number.isFinite(+v);
const r1 = (v) => Math.round(v * 10) / 10;
const hh = (t) => `${+t.slice(11, 13)}시`;
const dayWord = (d, today) => { const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5); return n === 0 ? "오늘" : n === 1 ? "내일" : n === 2 ? "모레" : `${+d.slice(5, 7)}/${+d.slice(8, 10)}`; };
const plus = (t, h) => { const d = new Date(Date.parse(`${t.slice(0, 10)}T${t.slice(11, 16)}:00Z`) + h * 3600e3); return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`; };
// 3시간 간격 비교: 같은 묶음(이어진 시각들) 안에서 가장 큰 것 하나
function threeHour(hours, key, test, mk) {
  const at = new Map(hours.map((h) => [h.time.slice(0, 16), h]));
  const hits = [];
  for (const h of hours) {
    const b = at.get(plus(h.time, 3));
    if (!b || !fin(h[key]) || !fin(b[key])) continue;
    const d = r1(b[key] - h[key]);
    if (test(d, h, b)) hits.push({ a: h, b, d });
  }
  const groups = [];
  for (const x of hits) {
    const g = groups.at(-1);
    if (g && Math.sign(g.at(-1).d) === Math.sign(x.d) && x.a.time.slice(0, 16) <= plus(g.at(-1).a.time, 1)) g.push(x); else groups.push([x]);
  }
  return groups.map((g) => mk(g.reduce((m, x) => (Math.abs(x.d) > Math.abs(m.d) ? x : m))));
}
export function bigChanges({ hours = [], days = [], revisions = [], pop = null, today, nowW }) {
  const H = hours.slice(0, CR.hours);
  const C = [];
  const src = (h) => h.items?.ta?.source || h.source;
  // 1) 3시간 기온
  C.push(...threeHour(H, "ta", (d, a) => Math.abs(d) >= need(CR.rise3h.delta, d, a.time), ({ a, b, d }) => ({ kind: "ta3h", M: Math.min(1, Math.abs(d) / CR.rise3h.ref), delta: d, unit: "℃", startW: a.time.slice(0, 16), endW: b.time.slice(0, 16), title: `${dayWord(a.time.slice(0, 10), today)} ${hh(a.time)}→${hh(b.time)} 기온 ${d > 0 ? "상승" : "하강"} ${Math.abs(d)}℃`, sub: `${a.ta}℃ → ${b.ta}℃(3시간)`, source: src(b) })));
  // 2) 풍속
  C.push(...threeHour(H, "ws", (d, a, b) => d >= CR.wind.delta && b.ws >= CR.wind.min, ({ a, b, d }) => ({ kind: "wind", M: Math.min(1, d / CR.wind.ref), delta: d, unit: "m/s", startW: a.time.slice(0, 16), endW: b.time.slice(0, 16), title: `${dayWord(a.time.slice(0, 10), today)} ${hh(b.time)}쯤 바람 강해짐`, sub: `풍속 ${a.ws}→${b.ws}m/s(3시간, 평균 풍속 예보)`, source: b.items?.ws?.source || b.source })));
  // 3) 습도
  C.push(...threeHour(H, "hm", (d, a) => Math.abs(d) >= need(CR.rh.delta, d, a.time, -1), ({ a, b, d }) => ({ kind: "rh", M: Math.min(1, Math.abs(d) / CR.rh.ref), delta: d, unit: "%p", startW: a.time.slice(0, 16), endW: b.time.slice(0, 16), title: `${dayWord(a.time.slice(0, 10), today)} ${hh(a.time)}→${hh(b.time)} 습도 ${Math.abs(d)}%p ${d > 0 ? "상승" : "하강"}`, sub: `${a.hm}% → ${b.hm}%(3시간)`, source: b.items?.hm?.source || b.source })));
  // 4) 강수형태: 각 형태가 2시간 이상 이어진 두 묶음이 바로 붙어 있을 때(빈 시각에서 끊음)
  const runs = [];
  for (const h of H) {
    const p = h.pty;
    const last = runs.at(-1);
    const contiguous = last && plus(last.end, 1) === h.time.slice(0, 16);
    if (p == null) { runs.push({ p: null, start: h.time.slice(0, 16), end: h.time.slice(0, 16), n: 1 }); continue; }
    if (last && contiguous && last.p === p) { last.end = h.time.slice(0, 16); last.n++; } else runs.push({ p, start: h.time.slice(0, 16), end: h.time.slice(0, 16), n: 1 });
  }
  for (let i = 1; i < runs.length; i++) {
    const a = runs[i - 1], b = runs[i];
    if (a.p == null || b.p == null || a.p === b.p || a.n < CR.pty.run || b.n < CR.pty.run || plus(a.end, 1) !== b.start) continue;
    const sw = a.p !== "없음" && b.p !== "없음";
    const word = b.p === "없음" ? `${a.p} 그침` : a.p === "없음" ? `${b.p} 시작` : `${a.p}→${b.p}`;
    C.push({ kind: "pty", M: sw ? CR.pty.mSwitch : CR.pty.mStart, delta: null, unit: "", startW: a.end, endW: plus(b.start, Math.min(b.n, 3) - 1), title: `${dayWord(b.start.slice(0, 10), today)} ${hh(b.start)}쯤 ${word}`, sub: `강수형태 예보 ${a.p} ${a.n}시간 → ${b.p} ${b.n}시간`, source: "단기예보" });
  }
  // 5) 이웃한 날 최저기온 / 6) 다음 날 일교차
  const D = days.filter((d) => d.date >= today).slice(0, 4);
  for (let i = 1; i < D.length; i++) {
    const a = D[i - 1], b = D[i];
    if (fin(a.min) && fin(b.min) && Math.abs(b.min - a.min) >= CR.tmn.delta) { const d = r1(b.min - a.min); C.push({ kind: "tmn", M: Math.min(1, Math.abs(d) / CR.tmn.ref), delta: d, unit: "℃", startW: `${b.date} 03:00`, endW: `${b.date} 08:00`, title: `${dayWord(b.date, today)} 아침 최저 ${d > 0 ? "+" : "−"}${Math.abs(d)}℃`, sub: `${dayWord(a.date, today)} ${a.min}℃ → ${dayWord(b.date, today)} ${b.min}℃`, source: b.minSource }); }
    if (i === 1 && fin(a.max) && fin(a.min) && fin(b.max) && fin(b.min)) {
      const da = r1(a.max - a.min), db = r1(b.max - b.min);
      if (db >= CR.range.min && db - da >= CR.range.up) C.push({ kind: "range", M: Math.min(1, (db - da) / CR.range.ref), delta: r1(db - da), unit: "℃", startW: `${b.date} 05:00`, endW: `${b.date} 16:00`, title: `${dayWord(b.date, today)} 일교차 ${db}℃(전날보다 ${r1(db - da)}℃ 큼)`, sub: `최저 ${b.min}℃ · 최고 ${b.max}℃`, source: b.maxSource });
    }
  }
  // 7) 주말: 토·일 중 하루만 활동 조건 2시간 이상 연속
  const W = CR.weekend;
  const okH = (h) => fin(h.ta) && fin(h.ws) && fin(h.pop) && h.ta >= W.tmin && h.ta <= W.tmax && h.ws <= W.wind && h.pop < W.popMax && (h.pty == null || h.pty === "없음") ? true : fin(h.ta) && fin(h.ws) && fin(h.pop) ? false : null;
  const byDay = new Map();
  for (const h of H) { const d = h.time.slice(0, 10); const hr = +h.time.slice(11, 13); if (hr < W.from || hr > W.to) continue; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(h); }
  for (const [d, list] of byDay) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 6) continue;
    const sun = byDay.get(plus(`${d} 00:00`, 24).slice(0, 10));
    const need = W.to - W.from + 1;
    if (!sun || list.length < need || sun.length < need) continue;
    const best = (L) => { let run = 0, mx = 0, unk = false; for (const h of L) { const o = okH(h); if (o == null) unk = true; run = o ? run + 1 : 0; mx = Math.max(mx, run); } return { mx, unk }; };
    const s = best(list), u = best(sun);
    if (s.unk || u.unk) continue;
    const sOk = s.mx >= W.run, uOk = u.mx >= W.run;
    if (sOk !== uOk) C.push({ kind: "weekend", M: W.m, delta: null, unit: "", startW: `${(sOk ? d : sun[0].time.slice(0, 10))} ${String(W.from).padStart(2, "0")}:00`, endW: `${(sOk ? d : sun[0].time.slice(0, 10))} ${W.to}:00`, title: `주말은 ${sOk ? "토요일" : "일요일"}만 바깥 활동 조건`, sub: `${W.tmin}~${W.tmax}℃·풍속 ${W.wind}m/s 이하·강수확률 ${W.popMax}% 미만·강수 없음이 ${W.run}시간 이상 이어지는 날(${W.from}~${W.to}시)`, source: "단기예보" });
  }
  // 8) 큰 예보 수정(발표 변경)
  for (const r of revisions) if (r.kind === "big" && r.date >= today) C.push({ kind: "revision", M: Math.min(1, Math.abs(r.delta) / CR.revision.taRef), delta: r.delta, unit: "℃", startW: `${r.date} ${r.metric === "max" ? "12:00" : "04:00"}`, endW: `${r.date} ${r.metric === "max" ? "16:00" : "08:00"}`, title: `발표 변경: ${dayWord(r.date, today)} ${r.label} ${r.prev}→${r.last}℃`, sub: `${r.source} ${String(r.prevBase).slice(5, 16)} → ${String(r.lastBase).slice(5, 16)} 발표`, source: r.source });
  for (const p of (pop?.list || []).slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 1)) C.push({ kind: "revision", M: Math.min(1, Math.abs(p.delta) / CR.revision.popRef), delta: p.delta, unit: "%p", startW: p.time.slice(0, 16), endW: p.time.slice(0, 16), title: `발표 변경: ${dayWord(p.time.slice(0, 10), today)} ${hh(p.time)} 강수확률 ${p.prev}→${p.value}%`, sub: `단기예보 ${String(pop.prevBase).slice(11, 16)} → ${String(pop.base).slice(11, 16)} 발표(같은 대상 시각)`, source: "단기예보" });
  const all = C.filter((x) => !nowW || x.endW >= nowW.slice(0, 13));
  // 종류가 겹치지 않게 먼저 종류마다 하나씩, 모자라면 나머지에서 채움
  const ord = all.slice().sort((a, b) => b.M - a.M || (a.startW < b.startW ? -1 : 1));
  const seen = new Set(), pick = [];
  for (const x of ord) if (pick.length < CR.max && !seen.has(x.kind)) { seen.add(x.kind); pick.push(x); }
  for (const x of ord) if (pick.length < CR.max && !pick.includes(x)) pick.push(x);
  const top = pick.sort((a, b) => (a.startW < b.startW ? -1 : 1));
  return { items: top.map((x) => ({ ...x, M: Math.round(x.M * 100) / 100 })), found: all.length, rule: "크기 M = min(1, |변화|/기준) — 통계적 희귀도가 아님. 종류마다 큰 것 하나씩 먼저, 최대 3개를 시간순으로" };
}
