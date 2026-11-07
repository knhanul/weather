// NCST observations only. One selected grid and eight KST dates; never forecasts or ASOS values.
import { ymdToDn, dnToYmd } from "./stats-engine.mjs";
import { shiftDate } from "./season-calendar.mjs";
import { recentContext, validDate } from "./weather-context-engine.mjs";
export const GRID_SOURCE = "기상청 초단기실황 · 동일 격자 비교";
export const GRID_CONTRACT = "grid-v1";
const numeric = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 900 ? n : null;
};
export function parseNcstRain(v) {
  const text = v == null ? "" : String(v).trim();
  const n = numeric(v);
  if (n !== null && n >= 0) return { value: n, kind: "exact", text };
  if (text.replace(/\s/g, "") === "강수없음") return { value: 0, kind: "none", text };
  // A trace, interval or bound is not an exact quantity. Never replace it with 0 or a midpoint.
  if (/(?:[~<>]|미만|이상|초과|이하|trace|흔적|미량)/i.test(text))
    return { value: null, kind: "range", text };
  return { value: null, kind: "missing", text };
}
export const validGrid = (g) =>
  g &&
  Number.isInteger(Number(g.nx)) &&
  Number.isInteger(Number(g.ny)) &&
  Number(g.nx) >= 1 &&
  Number(g.nx) <= 149 &&
  Number(g.ny) >= 1 &&
  Number(g.ny) <= 253;
export function recentGridContext({ daily, today, maxHour = 23, grid, rows = [] }) {
  const base = ymdToDn(shiftDate(today, -7)),
    size = 8 * 24;
  // hval reads tenths. Float64 preserves the NCST numeric value without rounding it to ASOS precision.
  const values = () => new Float64Array(size).fill(NaN);
  const hourly = {
    base,
    src: new Uint8Array(size),
    ta: values(),
    rn: values(),
    ws: values(),
    hm: values(),
  };
  const rain = new Map();
  const fields = { T1H: "ta", RN1: "rn", WSD: "ws", REH: "hm" };
  if (validGrid(grid))
    for (const r of rows) {
      if (
        (r.nx != null && Number(r.nx) !== Number(grid.nx)) ||
        (r.ny != null && Number(r.ny) !== Number(grid.ny))
      )
        continue;
      if (
        (r.dataset != null && r.dataset !== "KMA_ULTRA_NCST") ||
        r.kind === "fcst" ||
        r.fcst != null ||
        r.fcstValue != null
      )
        continue;
      const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):00:00$/.exec(String(r.base || ""));
      if (!m || !validDate(m[1]) || +m[2] > 23 || (m[1] === today && +m[2] > maxHour)) continue;
      const i = (ymdToDn(m[1]) - base) * 24 + +m[2],
        field = fields[r.category];
      if (i < 0 || i >= size || !field) continue;
      let n;
      if (field === "rn") {
        const p = parseNcstRain(r.value);
        rain.set(i, p);
        n = p.value;
      } else {
        n = numeric(r.value);
        if (
          n !== null &&
          ((field === "ta" && (n <= -100 || n >= 100)) ||
            (field === "ws" && n < 0) ||
            (field === "hm" && (n < 0 || n > 100)))
        )
          n = null;
      }
      hourly.src[i] = 1;
      hourly[field][i] = n === null ? NaN : n * 10;
    }
  const result = recentContext({ daily: daily || { base, present: [] }, hourly, today, maxHour });
  const hour = result.hour;
  let latestTemperatureTime = null;
  for (let i = size - 1; i >= 0; i--)
    if (Number.isFinite(hourly.ta[i])) {
      latestTemperatureTime = `${dnToYmd(base + Math.floor(i / 24))} ${String(i % 24).padStart(2, "0")}:00:00`;
      break;
    }
  const rainAt = (date) =>
    hour === null
      ? { value: null, kind: "missing", text: "" }
      : rain.get((ymdToDn(date) - base) * 24 + hour) || { value: null, kind: "missing", text: "" };
  return {
    ...result,
    source: GRID_SOURCE,
    contract: GRID_CONTRACT,
    grid: validGrid(grid)
      ? {
          nx: Number(grid.nx),
          ny: Number(grid.ny),
          note: "동일 5km 격자의 대표 실황입니다. ASOS 관측소 자체의 관측값과 구분합니다.",
        }
      : null,
    basis: {
      kind: "grid_observation",
      dataset: "KMA_ULTRA_NCST",
      time: hour === null ? null : `${today} ${String(hour).padStart(2, "0")}:00:00`,
      timezone: "Asia/Seoul",
    },
    latestTemperatureTime,
    message: !validGrid(grid)
      ? "이 지역의 실황 격자 연결이 없어 비교할 수 없어요."
      : hour === null
        ? "오늘 동일 격자의 실황 기온이 아직 없어 비교 시각을 정하지 못했어요. ASOS·예보로 대체하지 않아요."
        : `${today} ${hour}시 KST · 동일 격자(${Number(grid.nx)},${Number(grid.ny)}) 초단기실황`,
    recent7: {
      ...result.recent7,
      computed: hour !== null,
      days: hour === null ? null : result.recent7.days,
    },
    precipitation: {
      today: rainAt(today),
      yesterday: rainAt(result.yesterday),
      note: "RN1은 직전 1시간 강수량(mm). 범위·미량·결측은 정확한 수치 차이를 계산하지 않습니다. 일누적 강수량 비교가 아닙니다.",
    },
    dailySource: "기상청 ASOS 공식 일자료 · 완료된 과거 날짜만 (위 격자 실황 비교와 별개)",
    policy:
      "오늘·어제·직전 7일은 모두 동일 격자의 같은 KST 정시 초단기실황입니다. 예보·다른 격자·ASOS 값을 섞지 않습니다. 없는 날짜는 표본에서 제외하고 n/7로 표시합니다. 아래 최고·최저 표는 별도 ASOS 공식 일자료이며 오늘의 불완전한 최고·최저나 격자 정시 극값을 일극값으로 쓰지 않습니다.",
  };
}
