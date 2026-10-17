// 예보가 바뀐 흐름(astra 14장, 4단계) — '예보 신뢰도 %' 를 만들지 않고 발표 이력의 모양만 분류한다. 새 모듈.
//   같은 상품(단기/중기)·지점·대상일·지표(최고/최저)의 발표값. 단기는 최근 24시간, 중기는 최근 48시간 이력창.
//   계속 상향/하향: 최근 4회, 3개 변화가 모두 같은 방향·각각 |Δ| ≥ 0.5℃·총변화 ≥ 2℃
//   발표마다 변동: 최근 4~8회 범위 ≥ 3℃, |Δ| ≥ 0.5℃ 변화의 방향 반전 ≥ 2회
//   큰 단일 수정: 직전 대비 |Δ| ≥ 3℃ / 강수확률 수정: 같은 대상 시각·같은 상품의 POP |Δ| ≥ 20%p
//   큰 수정 없음: 최근 4회 범위 ≤ 1℃ — '정확·확실'로 바꾸지 않음
//   예정 회차가 빠지면(간격 > 상품 주기) '연속' 대신 '확보된 최근 n회'. 단기↔중기 전환은 선을 끊는다(points 의 source 가 바뀌는 곳).
export const REVISION_RULES = { trendN: 4, trendStep: 0.5, trendTotal: 2, oscMin: 4, oscMax: 8, oscRange: 3, oscStep: 0.5, oscReversals: 2, big: 3, pop: 20, steadyN: 4, steadyRange: 1, windowH: { "단기예보": 24, "중기예보": 48 }, cycleH: { "단기예보": 3, "중기예보": 12 } };
const R = REVISION_RULES;
const ms = (w) => Date.parse(`${String(w).slice(0, 10)}T${String(w).slice(11, 19) || "00:00:00"}Z`);
const r1 = (v) => Math.round(v * 10) / 10;
const METRIC = { max: "최고기온", min: "최저기온" };
// 한 대상일·지표의 발표 목록(시간순, source 섞임) → 분류
export function classifySeries(list, { date, metric }) {
  const all = (list || []).filter((x) => Number.isFinite(+x.value)).map((x) => ({ base: x.base, value: +x.value, source: x.source }));
  if (all.length < 2) return null;
  const src = all.at(-1).source;
  const lastMs = ms(all.at(-1).base);
  const win = all.filter((x) => x.source === src && lastMs - ms(x.base) <= R.windowH[src] * 3600e3);
  const gap = win.some((x, i) => i > 0 && ms(x.base) - ms(win[i - 1].base) > R.cycleH[src] * 3600e3);
  const out = { date, metric, label: METRIC[metric], source: src, n: win.length, gap, windowH: R.windowH[src], last: win.at(-1)?.value ?? null, points: all, switchAt: all.findIndex((x, i) => i > 0 && x.source !== all[i - 1].source) };
  if (win.length < 2) return { ...out, kind: "few", text: `${src} 발표 ${win.length}회뿐이라 흐름을 말하지 않아요` };
  const nWord = gap ? `확보된 최근 ${win.length}회` : `최근 ${win.length}회`;
  const prev = win.at(-2), last = win.at(-1);
  const d = r1(last.value - prev.value);
  const diffs = (a) => a.slice(1).map((x, i) => r1(x.value - a[i].value));
  const range = (a) => { const v = a.map((x) => x.value); return { lo: Math.min(...v), hi: Math.max(...v) }; };
  if (Math.abs(d) >= R.big) return { ...out, kind: "big", delta: d, prev: prev.value, prevBase: prev.base, lastBase: last.base, text: `${METRIC[metric]} 예보가 직전 발표보다 ${Math.abs(d)}℃ ${d > 0 ? "올랐어요" : "내렸어요"}(${prev.value}→${last.value}℃)` };
  const t4 = win.slice(-R.trendN);
  if (t4.length === R.trendN) {
    const ds = diffs(t4);
    const tot = r1(t4.at(-1).value - t4[0].value);
    if (ds.every((x) => Math.abs(x) >= R.trendStep) && (ds.every((x) => x > 0) || ds.every((x) => x < 0)) && Math.abs(tot) >= R.trendTotal) {
      const word = gap ? `확보된 최근 ${R.trendN}회 발표에서 ${METRIC[metric]} 예보가 계속 ${tot > 0 ? "올랐어요" : "내렸어요"}` : `최근 ${R.trendN}회 발표에서 ${METRIC[metric]} 예보가 연속 ${tot > 0 ? "상향" : "하향"}됐어요`;
      return { ...out, kind: tot > 0 ? "up" : "down", delta: tot, from: t4[0].value, text: `${word}(${t4[0].value}→${t4.at(-1).value}℃)` };
    }
  }
  const o = win.slice(-R.oscMax);
  if (o.length >= R.oscMin) {
    const { lo, hi } = range(o);
    const ds = diffs(o).filter((x) => Math.abs(x) >= R.oscStep);
    let rev = 0;
    for (let i = 1; i < ds.length; i++) if (Math.sign(ds[i]) !== Math.sign(ds[i - 1])) rev++;
    if (r1(hi - lo) >= R.oscRange && rev >= R.oscReversals) return { ...out, kind: "osc", lo, hi, reversals: rev, text: `${nWord} 발표의 ${METRIC[metric]} 예보 범위 ${lo}~${hi}℃ — 발표마다 오르내렸어요` };
  }
  const s4 = win.slice(-R.steadyN);
  if (s4.length === R.steadyN) { const { lo, hi } = range(s4); if (r1(hi - lo) <= R.steadyRange) return { ...out, kind: "steady", lo, hi, text: `${gap ? `확보된 최근 ${R.steadyN}회` : `최근 ${R.steadyN}회`} 발표 사이 큰 수정 없음(${lo}~${hi}℃)` }; }
  return { ...out, kind: "mixed", delta: d, text: `${nWord} 발표 사이 작은 변화(직전 대비 ${d > 0 ? "+" : ""}${d}℃)` };
}
// changes = forecastChanges 결과. today 이후 날짜만
export function revisionFlow(changes, { today } = {}) {
  const items = [];
  for (const c of changes || []) {
    if (today && c.date < today) continue;
    for (const m of ["max", "min"]) { const r = classifySeries(c[m], { date: c.date, metric: m }); if (r) items.push(r); }
  }
  return items;
}
// 강수확률: 같은 상품(단기)·같은 대상 시각의 현재 발표 vs 직전 발표
export function popRevisions(curRows, prevRows, { fromWall } = {}) {
  const pick = (rows) => new Map(rows.filter((r) => r.category === "POP" && (!fromWall || r.fcst >= fromWall)).map((r) => [r.fcst, +r.value]));
  const a = pick(prevRows || []), b = pick(curRows || []);
  const list = [];
  for (const [t, v] of b) if (a.has(t) && Number.isFinite(v) && Number.isFinite(a.get(t)) && Math.abs(v - a.get(t)) >= R.pop) list.push({ time: t, prev: a.get(t), value: v, delta: v - a.get(t) });
  const base = curRows?.[0]?.base || null, prevBase = prevRows?.[0]?.base || null;
  return { base, prevBase, compared: [...b.keys()].filter((t) => a.has(t)).length, list, threshold: R.pop };
}
// 이야기 후보(ruleId F01). 오늘·내일 최고/최저 중 가장 뚜렷한 하나 + POP 수정
const RANK = { big: 4, up: 3, down: 3, osc: 2, steady: 0, mixed: 0, few: 0 };
export function revisionCands(flow, pop, { sid, tv, ymd, LIFE_VALUE }) {
  const C = [];
  const pickable = flow.filter((x) => RANK[x.kind] >= 2 && x.date <= addDay(ymd, 2));
  pickable.sort((a, b) => RANK[b.kind] - RANK[a.kind] || (a.date < b.date ? -1 : 1));
  const x = pickable[0];
  if (x) {
    const U = x.kind === "big" ? Math.min(1, Math.abs(x.delta) / 6) : x.kind === "osc" ? Math.min(1, (x.hi - x.lo) / 6) : Math.min(1, Math.abs(x.delta) / 4);
    const dl = x.date === ymd ? "오늘" : x.date === addDay(ymd, 1) ? "내일" : x.date.slice(5);
    C.push({ key: "forecast-revision", ruleId: "F01", eventId: `${sid}|F01|${x.date}|${x.metric}|${x.kind}`, topic: "forecast-revision", path: "life", phenomenon: "예보 변화", kind: "예보", basisId: null, basisFixed: "발표 이력 비교(과거 평균과 비교하지 않음)", U, A: LIFE_VALUE.info, T: tv(`${x.date} 00:00`, `${x.date} 23:59`), material: { k: x.kind, v: x.last }, samples: x.n, minSamples: 2, title: `${dl} ${x.text}`, text: `${x.source} ${x.n}회 발표(최근 ${x.windowH}시간${x.gap ? ", 중간 회차 빠짐" : ""}) — 마지막 ${x.last}℃. 예보가 틀렸다는 뜻이 아니라 발표 사이 값이 바뀐 흐름이에요.`, method: "같은 상품·대상일·지표의 발표값 비교(단기 24시간·중기 48시간 이력). 신뢰도 %는 내지 않아요.", basis: `${x.source} 발표 이력`, facts: { date: x.date, metric: x.metric, kind: x.kind }, chart: { type: "revision", date: x.date, metric: x.metric, label: x.label, unit: "℃", points: x.points, kind: x.kind } });
  }
  const p = pop?.list?.length ? pop.list.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] : null;
  if (p && p.time.slice(0, 10) <= addDay(ymd, 1)) C.push({ key: "forecast-revision-pop", ruleId: "F01", eventId: `${sid}|F01|pop|${p.time}|${p.delta > 0 ? "up" : "down"}`, topic: "forecast-revision", path: "life", phenomenon: "강수확률 수정", kind: "예보", basisId: null, basisFixed: "발표 이력 비교", U: Math.min(1, Math.abs(p.delta) / 40), A: LIFE_VALUE.info, T: tv(p.time), material: { t: p.time, d: Math.round(p.delta / 10) }, samples: 2, minSamples: 2, title: `${p.time.slice(0, 10) === ymd ? "오늘" : "내일"} ${+p.time.slice(11, 13)}시 강수확률 예보가 직전 발표보다 ${Math.abs(p.delta)}%p ${p.delta > 0 ? "올랐어요" : "내렸어요"}`, text: `단기예보 ${String(pop.prevBase).slice(11, 16)} 발표 ${p.prev}% → ${String(pop.base).slice(11, 16)} 발표 ${p.value}% (같은 대상 시각). 같은 기준으로 ${pop.list.length}개 시각이 ${R.pop}%p 이상 바뀌었어요.`, method: "단기예보 직전 발표와 같은 대상 시각의 강수확률 비교.", basis: `단기예보 ${pop.prevBase}·${pop.base} 발표`, facts: { time: p.time, prev: p.prev, value: p.value }, chart: { type: "revision", metric: "pop", label: "강수확률", unit: "%", date: p.time.slice(0, 10), points: [{ base: pop.prevBase, value: p.prev, source: "단기예보" }, { base: pop.base, value: p.value, source: "단기예보" }], kind: p.delta > 0 ? "up" : "down", target: p.time } });
  return C;
}
function addDay(ymd, n) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
