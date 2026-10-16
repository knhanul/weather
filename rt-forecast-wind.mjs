// 날씨 예보 화면의 바람 화살표 띠(읽기 전용 추가 자료) — /api/rt/forecast 는 그대로 두고 따로 낸다.
// 우선순위는 hourlyForecast 와 같다: 초단기예보(T1H 가 있는 시각) > 단기예보. 풍향 VEC(도, 바람이 불어오는 쪽)·풍속 WSD(m/s)
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export function windHours({ vilRows = [], ultraRows = [], fromWall }) {
  const m = new Map();
  const slot = (w) => { if (!m.has(w)) m.set(w, { time: w, v: {}, u: {} }); return m.get(w); };
  for (const r of vilRows) if (r.fcst >= fromWall) { const s = slot(r.fcst); s.v[r.category] = r.value; s.vBase = r.base; }
  for (const r of ultraRows) if (r.fcst >= fromWall) { const s = slot(r.fcst); s.u[r.category] = r.value; s.uBase = r.release || r.base; }
  return [...m.values()].sort((a, b) => (a.time < b.time ? -1 : 1)).map((s) => {
    const useU = s.u.T1H != null;
    const pick = (k) => (useU && s.u[k] != null ? s.u[k] : s.v[k]);
    return { time: s.time, vec: num(pick("VEC")), ws: num(pick("WSD")), source: useU ? "초단기예보" : "단기예보", base: useU ? s.uBase : s.vBase };
  }).filter((h) => h.vec != null || h.ws != null);
}
