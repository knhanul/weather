// 기상청 ASOS 관측지점 공식 위·경도 (기상청 관측지점 정보 minwon.kma.go.kr/main/obvStn.do, 2026-10-11 확인).
// DB(weather_stations)에는 위경도 칸이 없어서 /api/stations 응답에만 덧붙인다(새 필드 latitude·longitude·address — 기존 필드는 그대로).
export const STATION_COORDS = {
  108: { latitude: 37.57142, longitude: 126.9658, address: "서울특별시 종로구 송월동" },
  112: { latitude: 37.47772, longitude: 126.6249, address: "인천광역시 중구 전동" },
  119: { latitude: 37.25746, longitude: 126.983, address: "경기도 수원시 권선구 서둔동" },
  133: { latitude: 36.37199, longitude: 127.3721, address: "대전광역시 유성구 구성동" },
  143: { latitude: 35.87797, longitude: 128.65295, address: "대구광역시 동구 효목동" },
  156: { latitude: 35.17294, longitude: 126.89156, address: "광주광역시 북구 운암동" },
  159: { latitude: 35.10468, longitude: 129.03203, address: "부산광역시 중구 대청동1가" },
  184: { latitude: 33.51411, longitude: 126.52969, address: "제주특별자치도 제주시 건입동" },
};
export const withCoords = (list) => list.map((s) => {
  const c = STATION_COORDS[String(s.station_id)];
  return c && s.latitude == null ? { ...s, ...c } : s;
});
