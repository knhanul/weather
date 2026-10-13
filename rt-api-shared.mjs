// 실시간·예보 공용 도움 함수(rt-api·rt-forecast)
export const PTY = { 0: "없음", 1: "비", 2: "비/눈", 3: "눈", 4: "소나기", 5: "빗방울", 6: "빗방울눈날림", 7: "눈날림" };
export const SKY = { 1: "맑음", 3: "구름많음", 4: "흐림" };
const DIRS = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"];
export const windDir = (deg) => (Number.isFinite(deg) ? `${DIRS[Math.round(deg / 22.5) % 16]}풍` : null);
// 강수량 문자열(기상청 표기: '강수없음', '1mm 미만', '30.0~50.0mm', '50.0mm 이상', 숫자)
export function rainText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "강수없음" || s === "0" || s === "0.0") return { mm: 0, text: "강수 없음" };
  const n = Number(s.replace(/mm$/, ""));
  if (Number.isFinite(n)) return { mm: n, text: `${n}mm` };
  return { mm: null, text: s };
}
