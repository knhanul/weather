// 기상청 ASOS(종관기상관측) 시간자료·일자료 API 응답 항목 ↔ DB 컬럼 매핑.
// 근거: 공공데이터포털 "기상청_지상(종관, ASOS) 시간자료 조회서비스"(15057210),
//       "기상청_지상(종관, ASOS) 일자료 조회서비스"(15059093) 출력결과 표와 활용가이드.
// 값은 기상청이 준 단위 그대로 저장한다(변환 없음). 이 목록에 없는 항목도 raw(jsonb)에 원본 그대로 남는다.
//
// type: num = double precision, text = text(코드·시각 HHMM·플래그처럼 앞자리 0이나 문자가 의미 있는 값)
// keys: 응답 키. 문서 표기(…Qcflag, mi10_max_rn)와 실제 응답 표기(…Qcflg, mi10MaxRn)가 달라 둘 다 받는다.
// legacy: 기존 컬럼(화면·조회 API가 쓰는 값). 매핑은 예전과 똑같이 유지한다.

export const HOURLY_FIELDS = [
  // 기존 컬럼 (변경 없음)
  { col: "temperature", keys: ["ta"], type: "num", legacy: true, ko: "기온(°C)" },
  { col: "precipitation", keys: ["rn"], type: "num", legacy: true, ko: "강수량(mm)" },
  { col: "humidity", keys: ["hm"], type: "num", legacy: true, ko: "습도(%)" },
  { col: "wind_speed", keys: ["ws"], type: "num", legacy: true, ko: "풍속(m/s)" },
  { col: "wind_direction", keys: ["wd"], type: "num", legacy: true, ko: "풍향(16방위, deg)" },
  { col: "pressure", keys: ["pa"], type: "num", legacy: true, ko: "현지기압(hPa)" },
  // 새 컬럼
  { col: "ta_qcflg", keys: ["taQcflg", "taQcflag"], type: "text", ko: "기온 품질검사 플래그(원본 값)" },
  { col: "rn_qcflg", keys: ["rnQcflg", "rnQcflag"], type: "text", ko: "강수량 품질검사 플래그" },
  { col: "ws_qcflg", keys: ["wsQcflg", "wsQcflag"], type: "text", ko: "풍속 품질검사 플래그" },
  { col: "wd_qcflg", keys: ["wdQcflg", "wdQcflag"], type: "text", ko: "풍향 품질검사 플래그" },
  { col: "hm_qcflg", keys: ["hmQcflg", "hmQcflag"], type: "text", ko: "습도 품질검사 플래그" },
  { col: "vapor_pressure", keys: ["pv"], type: "num", ko: "증기압(hPa)" },
  { col: "dew_point", keys: ["td"], type: "num", ko: "이슬점온도(°C)" },
  { col: "pa_qcflg", keys: ["paQcflg", "paQcflag"], type: "text", ko: "현지기압 품질검사 플래그" },
  { col: "sea_level_pressure", keys: ["ps"], type: "num", ko: "해면기압(hPa)" },
  { col: "ps_qcflg", keys: ["psQcflg", "psQcflag"], type: "text", ko: "해면기압 품질검사 플래그" },
  { col: "sunshine", keys: ["ss"], type: "num", ko: "일조(hr)" },
  { col: "ss_qcflg", keys: ["ssQcflg", "ssQcflag"], type: "text", ko: "일조 품질검사 플래그" },
  { col: "solar_radiation", keys: ["icsr"], type: "num", ko: "일사(MJ/m2)" },
  { col: "snow_depth", keys: ["dsnw"], type: "num", ko: "적설(cm)" },
  { col: "snow_new_3h", keys: ["hr3Fhsc"], type: "num", ko: "3시간 신적설(cm)" },
  { col: "total_cloud", keys: ["dc10Tca"], type: "num", ko: "전운량(10분위)" },
  { col: "low_mid_cloud", keys: ["dc10LmcsCa"], type: "num", ko: "중하층운량(10분위)" },
  { col: "cloud_form", keys: ["clfmAbbrCd"], type: "text", ko: "운형(운형 약어)" },
  { col: "lowest_cloud_height", keys: ["lcsCh"], type: "num", ko: "최저운고(100m)" },
  { col: "visibility", keys: ["vs"], type: "num", ko: "시정(10m)" },
  { col: "ground_state_code", keys: ["gndSttCd"], type: "text", ko: "지면상태(지면상태코드)" },
  { col: "phenomenon_code", keys: ["dmstMtphNo"], type: "text", ko: "현상번호(국내식)" },
  { col: "ground_temperature", keys: ["ts"], type: "num", ko: "지면온도(°C)" },
  { col: "ts_qcflg", keys: ["tsQcflg", "tsQcflag"], type: "text", ko: "지면온도 품질검사 플래그" },
  { col: "soil_temp_5cm", keys: ["m005Te"], type: "num", ko: "5cm 지중온도(°C)" },
  { col: "soil_temp_10cm", keys: ["m01Te"], type: "num", ko: "10cm 지중온도(°C)" },
  { col: "soil_temp_20cm", keys: ["m02Te"], type: "num", ko: "20cm 지중온도(°C)" },
  { col: "soil_temp_30cm", keys: ["m03Te"], type: "num", ko: "30cm 지중온도(°C)" },
];

export const DAILY_FIELDS = [
  // 기존 컬럼 (변경 없음)
  { col: "avg_temperature", keys: ["avgTa"], type: "num", legacy: true, ko: "평균기온(°C)" },
  { col: "min_temperature", keys: ["minTa"], type: "num", legacy: true, ko: "최저기온(°C)" },
  { col: "max_temperature", keys: ["maxTa"], type: "num", legacy: true, ko: "최고기온(°C)" },
  { col: "precipitation", keys: ["sumRn"], type: "num", legacy: true, ko: "일강수량(mm)" },
  { col: "avg_humidity", keys: ["avgRhm"], type: "num", legacy: true, ko: "평균 상대습도(%)" },
  // 새 컬럼
  { col: "min_temperature_time", keys: ["minTaHrmt"], type: "text", ko: "최저기온 시각(hhmi)" },
  { col: "max_temperature_time", keys: ["maxTaHrmt"], type: "text", ko: "최고기온 시각(hhmi)" },
  { col: "max_precip_10min", keys: ["mi10MaxRn", "mi10_max_rn"], type: "num", ko: "10분 최다강수량(mm)" },
  { col: "max_precip_10min_time", keys: ["mi10MaxRnHrmt"], type: "text", ko: "10분 최다강수량 시각(hhmi)" },
  { col: "max_precip_1h", keys: ["hr1MaxRn"], type: "num", ko: "1시간 최다강수량(mm)" },
  { col: "max_precip_1h_time", keys: ["hr1MaxRnHrmt"], type: "text", ko: "1시간 최다강수량 시각(hhmi)" },
  { col: "precip_duration", keys: ["sumRnDur"], type: "num", ko: "강수 계속시간(hr)" },
  { col: "max_inst_wind_speed", keys: ["maxInsWs"], type: "num", ko: "최대 순간풍속(m/s)" },
  { col: "max_inst_wind_dir", keys: ["maxInsWsWd"], type: "num", ko: "최대 순간풍속 풍향(16방위)" },
  { col: "max_inst_wind_time", keys: ["maxInsWsHrmt"], type: "text", ko: "최대 순간풍속 시각(hhmi)" },
  { col: "max_wind_speed", keys: ["maxWs"], type: "num", ko: "최대 풍속(m/s)" },
  { col: "max_wind_dir", keys: ["maxWsWd"], type: "num", ko: "최대 풍속 풍향(16방위)" },
  { col: "max_wind_time", keys: ["maxWsHrmt"], type: "text", ko: "최대 풍속 시각(hhmi)" },
  { col: "avg_wind_speed", keys: ["avgWs"], type: "num", ko: "평균 풍속(m/s)" },
  { col: "wind_run", keys: ["hr24SumRws"], type: "num", ko: "풍정합(100m)" },
  { col: "most_frequent_wind_dir", keys: ["maxWd"], type: "num", ko: "최다풍향(16방위)" },
  { col: "avg_dew_point", keys: ["avgTd"], type: "num", ko: "평균 이슬점온도(°C)" },
  { col: "min_humidity", keys: ["minRhm"], type: "num", ko: "최소 상대습도(%)" },
  { col: "min_humidity_time", keys: ["minRhmHrmt"], type: "text", ko: "최소 상대습도 시각(hhmi)" },
  { col: "avg_vapor_pressure", keys: ["avgPv"], type: "num", ko: "평균 증기압(hPa)" },
  { col: "avg_pressure", keys: ["avgPa"], type: "num", ko: "평균 현지기압(hPa)" },
  { col: "max_sea_level_pressure", keys: ["maxPs"], type: "num", ko: "최고 해면기압(hPa)" },
  { col: "max_sea_level_pressure_time", keys: ["maxPsHrmt"], type: "text", ko: "최고 해면기압 시각(hhmi)" },
  { col: "min_sea_level_pressure", keys: ["minPs"], type: "num", ko: "최저 해면기압(hPa)" },
  { col: "min_sea_level_pressure_time", keys: ["minPsHrmt"], type: "text", ko: "최저 해면기압 시각(hhmi)" },
  { col: "avg_sea_level_pressure", keys: ["avgPs"], type: "num", ko: "평균 해면기압(hPa)" },
  { col: "possible_sunshine", keys: ["ssDur"], type: "num", ko: "가조시간(hr)" },
  { col: "sunshine", keys: ["sumSsHr"], type: "num", ko: "합계 일조시간(hr)" },
  { col: "max_solar_1h_time", keys: ["hr1MaxIcsrHrmt"], type: "text", ko: "1시간 최다일사 시각(hhmi)" },
  { col: "max_solar_1h", keys: ["hr1MaxIcsr"], type: "num", ko: "1시간 최다일사량(MJ/m2)" },
  { col: "solar_radiation", keys: ["sumGsr"], type: "num", ko: "합계 일사량(MJ/m2)" },
  { col: "max_new_snow", keys: ["ddMefs"], type: "num", ko: "일 최심신적설(cm)" },
  { col: "max_new_snow_time", keys: ["ddMefsHrmt"], type: "text", ko: "일 최심신적설 시각(hhmi)" },
  { col: "max_snow_depth", keys: ["ddMes"], type: "num", ko: "일 최심적설(cm)" },
  { col: "max_snow_depth_time", keys: ["ddMesHrmt"], type: "text", ko: "일 최심적설 시각(hhmi)" },
  { col: "snow_new_3h_sum", keys: ["sumDpthFhsc"], type: "num", ko: "합계 3시간 신적설(cm)" },
  { col: "avg_total_cloud", keys: ["avgTca"], type: "num", ko: "평균 전운량(10분위)" },
  { col: "avg_low_mid_cloud", keys: ["avgLmac"], type: "num", ko: "평균 중하층운량(10분위)" },
  { col: "avg_ground_temperature", keys: ["avgTs"], type: "num", ko: "평균 지면온도(°C)" },
  { col: "min_grass_temperature", keys: ["minTg"], type: "num", ko: "최저 초상온도(°C)" },
  { col: "avg_soil_temp_5cm", keys: ["avgCm5Te"], type: "num", ko: "평균 5cm 지중온도(°C)" },
  { col: "avg_soil_temp_10cm", keys: ["avgCm10Te"], type: "num", ko: "평균 10cm 지중온도(°C)" },
  { col: "avg_soil_temp_20cm", keys: ["avgCm20Te"], type: "num", ko: "평균 20cm 지중온도(°C)" },
  { col: "avg_soil_temp_30cm", keys: ["avgCm30Te"], type: "num", ko: "평균 30cm 지중온도(°C)" },
  { col: "soil_temp_0_5m", keys: ["avgM05Te"], type: "num", ko: "0.5m 지중온도(°C)" },
  { col: "soil_temp_1_0m", keys: ["avgM10Te"], type: "num", ko: "1.0m 지중온도(°C)" },
  { col: "soil_temp_1_5m", keys: ["avgM15Te"], type: "num", ko: "1.5m 지중온도(°C)" },
  { col: "soil_temp_3_0m", keys: ["avgM30Te"], type: "num", ko: "3.0m 지중온도(°C)" },
  { col: "soil_temp_5_0m", keys: ["avgM50Te"], type: "num", ko: "5.0m 지중온도(°C)" },
  { col: "evaporation_large", keys: ["sumLrgEv"], type: "num", ko: "합계 대형증발량(mm)" },
  { col: "evaporation_small", keys: ["sumSmlEv"], type: "num", ko: "합계 소형증발량(mm)" },
  { col: "precip_9to9", keys: ["n99Rn"], type: "num", ko: "9-9 강수(mm, 전날 09시~당일 09시)" },
  { col: "weather_phenomena", keys: ["iscs"], type: "text", ko: "일기현상(원문)" },
  { col: "fog_duration", keys: ["sumFogDur"], type: "num", ko: "안개 계속시간(hr)" },
];

// 새로 추가된(기존 화면이 쓰지 않는) 컬럼만
export const HOURLY_EXTRA = HOURLY_FIELDS.filter((f) => !f.legacy);
export const DAILY_EXTRA = DAILY_FIELDS.filter((f) => !f.legacy);

// 기존 화면·조회 API가 돌려주던 컬럼(순서 포함). SELECT * 대신 이 목록을 써서 응답이 바뀌지 않게 한다.
export const HOURLY_LEGACY_COLUMNS = [
  "provider", "dataset", "station_id", "station_name", "observation_datetime", "timezone",
  "temperature", "precipitation", "humidity", "wind_speed", "wind_direction", "pressure",
  "quality_temperature", "source_kind",
];
export const DAILY_LEGACY_COLUMNS = [
  "station_id", "station_name", "observation_date", "avg_temperature", "min_temperature", "max_temperature",
  "precipitation", "avg_humidity", "source_kind", "note",
];

function pick(it, keys) {
  for (const k of keys) if (it && Object.prototype.hasOwnProperty.call(it, k)) return it[k];
  return undefined;
}

// 빈 문자열·null·공백·숫자가 아닌 값 → null. (기존 Number("") 처리와 같은 결과를 내되 NaN은 저장하지 않음)
export function toNum(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function toText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function extras(fields, it) {
  const out = {};
  for (const f of fields) {
    const v = pick(it, f.keys);
    out[f.col] = f.type === "num" ? toNum(v) : toText(v);
  }
  return out;
}

export function hourlyExtras(it) {
  return extras(HOURLY_EXTRA, it);
}
export function dailyExtras(it) {
  return extras(DAILY_EXTRA, it);
}

// 원본 항목을 그대로(키·값 모두 문자열 그대로) jsonb 로 저장하기 위한 사본
export function rawItem(it) {
  return it && typeof it === "object" ? JSON.parse(JSON.stringify(it)) : null;
}

// ---- 수집기 매핑 ----
// 기존 필드(temperature 등)는 예전 server.mjs 코드와 한 글자도 다르지 않게 계산한다(화면·조회 API 값 유지).
// extra: 새 컬럼 값, raw: 원본 항목. JSON 대체 저장소에서는 server.mjs 가 extra/raw 를 떼고 저장한다.
export function mapHourlyItem(it, stationId) {
  let tm = String(it.tm || "");
  if (tm.length === 13) tm = `${tm}:00`;
  if (tm.length === 16) tm = `${tm}:00`;
  return {
    provider: "KMA",
    dataset: "ASOS_HOURLY",
    station_id: String(it.stnId ?? stationId),
    station_name: it.stnNm || stationId,
    observation_datetime: tm,
    timezone: "Asia/Seoul",
    temperature: it.ta === "" || it.ta == null ? null : Number(it.ta),
    precipitation: it.rn === "" || it.rn == null ? null : Number(it.rn),
    humidity: it.hm === "" || it.hm == null ? null : Number(it.hm),
    wind_speed: it.ws === "" || it.ws == null ? null : Number(it.ws),
    wind_direction: it.wd === "" || it.wd == null ? null : Number(it.wd),
    pressure: it.pa === "" || it.pa == null ? null : Number(it.pa),
    quality_temperature: !it.taQcflg || it.taQcflg === "0" ? "NORMAL" : it.taQcflg === "1" ? "INVALID" : it.taQcflg === "9" ? "MISSING" : "SUSPECT",
    source_kind: "OFFICIAL",
    extra: hourlyExtras(it),
    raw: rawItem(it),
  };
}

export function mapDailyItem(it, stationId) {
  return {
    station_id: String(it.stnId ?? stationId),
    station_name: it.stnNm || stationId,
    observation_date: String(it.tm || "").slice(0, 10),
    avg_temperature: it.avgTa === "" || it.avgTa == null ? null : Number(it.avgTa),
    min_temperature: it.minTa === "" || it.minTa == null ? null : Number(it.minTa),
    max_temperature: it.maxTa === "" || it.maxTa == null ? null : Number(it.maxTa),
    precipitation: it.sumRn === "" || it.sumRn == null ? null : Number(it.sumRn),
    avg_humidity: it.avgRhm === "" || it.avgRhm == null ? null : Number(it.avgRhm),
    source_kind: "OFFICIAL",
    extra: dailyExtras(it),
    raw: rawItem(it),
  };
}

// JSON 대체 저장소(로컬 개발)는 예전 모양 그대로 저장한다.
export function withoutExtras(row) {
  if (!row || (row.extra === undefined && row.raw === undefined)) return row;
  const { extra: _e, raw: _r, ...rest } = row;
  return rest;
}

// ----------------- 다운로드(내보내기) 카탈로그 및 포맷 -----------------

export const HOURLY_DEFAULT_EXPORT = [
  "observation_datetime", "station_id", "station_name", "temperature", "precipitation", "humidity", "wind_speed", "source_kind",
];

export const DAILY_DEFAULT_EXPORT = [
  "observation_date", "station_id", "avg_temperature", "min_temperature", "max_temperature", "precipitation", "avg_humidity", "source_kind",
];

export const HOURLY_EXPORT_CATALOG = [
  // 기본 식별 (필수 식별 및 기본 정보)
  { col: "observation_datetime", label: "관측일시", unit: "", desc: "관측 일시 (KST, YYYY-MM-DD HH:MM:SS). 시간별 관측값을 식별하는 필수 항목입니다.", group: "기본 식별", required: true, defaultOn: true, type: "text" },
  { col: "station_id", label: "지점번호", unit: "", desc: "기상청 종관기상관측(ASOS) 지점 코드. 관측소를 식별하는 필수 항목입니다.", group: "기본 식별", required: true, defaultOn: true, type: "text" },
  { col: "station_name", label: "지점명", unit: "", desc: "관측소 지점 명칭 (예: 서울, 부산, 대구 등)", group: "기본 식별", required: false, defaultOn: true, type: "text" },
  { col: "source_kind", label: "자료출처", unit: "", desc: "자료 출처 구분 (OFFICIAL: 기상청 공식 수집, SEED: 초기 시드 데이터)", group: "기본 식별", required: false, defaultOn: true, type: "text" },

  // 기온 · 체감
  { col: "temperature", label: "기온", unit: "°C", desc: "지상 1.5m 대기 온도", group: "기온·체감", required: false, defaultOn: true, type: "num" },
  { col: "dew_point", label: "이슬점온도", unit: "°C", desc: "공기 중의 수증기가 물방울로 응결하기 시작하는 온도", group: "기온·체감", required: false, defaultOn: false, type: "num" },
  { col: "vapor_pressure", label: "증기압", unit: "hPa", desc: "대기 중 수증기가 나타내는 부분 압력", group: "기온·체감", required: false, defaultOn: false, type: "num" },

  // 강수
  { col: "precipitation", label: "1시간 강수량", unit: "mm", desc: "관측 시각 직전 1시간 동안 내린 강수량 (NULL: 무강수/미관측)", group: "강수", required: false, defaultOn: true, type: "num" },

  // 눈 (적설·신적설) - 강수량과 구분
  { col: "snow_depth", label: "적설", unit: "cm", desc: "관측 시점에 지면에 쌓여 있는 눈의 전체 깊이 (기존 눈 포함)", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "num" },
  { col: "snow_new_3h", label: "3시간 신적설", unit: "cm", desc: "최근 3시간 동안 새로 내려 쌓인 눈의 깊이 (신적설)", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "num" },

  // 바람
  { col: "wind_speed", label: "풍속", unit: "m/s", desc: "지상 10m 높이에서 측정한 10분 평균 풍속", group: "바람", required: false, defaultOn: true, type: "num" },
  { col: "wind_direction", label: "풍향", unit: "deg", desc: "바람이 불어오는 방향 (16방위 각도 0~360°)", group: "바람", required: false, defaultOn: false, type: "num" },

  // 습도 · 기압
  { col: "humidity", label: "상대습도", unit: "%", desc: "현재 수증기압의 포화 수증기압에 대한 백분율", group: "습도·기압", required: false, defaultOn: true, type: "num" },
  { col: "pressure", label: "현지기압", unit: "hPa", desc: "관측소 해발고도 위치에서 측정한 대기압", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "sea_level_pressure", label: "해면기압", unit: "hPa", desc: "현지기압을 해수면(0m) 높이 기준으로 보정한 기압", group: "습도·기압", required: false, defaultOn: false, type: "num" },

  // 일조 · 일사
  { col: "sunshine", label: "일조", unit: "hr", desc: "직달일사량이 120W/m² 이상인 1시간 동안의 시간", group: "일조·일사", required: false, defaultOn: false, type: "num" },
  { col: "solar_radiation", label: "일사", unit: "MJ/m²", desc: "1시간 동안 단위면적(1m²)에 도달한 태양 복사에너지", group: "일조·일사", required: false, defaultOn: false, type: "num" },

  // 구름 · 시정 · 기상현상
  { col: "total_cloud", label: "전운량", unit: "10분위", desc: "하늘 전체 중 구름이 덮고 있는 비율 (0~10)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "low_mid_cloud", label: "중하층운량", unit: "10분위", desc: "하늘 전체 중 중·하층 구름이 덮고 있는 비율 (0~10)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "cloud_form", label: "운형약어", unit: "코드", desc: "관측된 대표 구름의 10종 운형 약어 (Ci, Sc, Cu 등)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "text" },
  { col: "lowest_cloud_height", label: "최저운고", unit: "100m", desc: "가장 낮은 구름 기저의 높이 (단위: 100m)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "visibility", label: "시정", unit: "10m", desc: "목표물을 식별할 수 있는 최대 수평 거리 (단위: 10m)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "phenomenon_code", label: "현상번호", unit: "코드", desc: "기상청 국내식 기상현상 분류 코드", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "text" },
  { col: "ground_state_code", label: "지면상태", unit: "코드", desc: "관측소 노장의 지면 상태 분류 코드 (건조, 젖음, 결빙 등)", group: "구름·시정·기상현상", required: false, defaultOn: false, type: "text" },

  // 지면 · 지중온도
  { col: "ground_temperature", label: "지면온도", unit: "°C", desc: "지표면(맨땅)의 온도", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_5cm", label: "5cm 지중온도", unit: "°C", desc: "지하 5cm 깊이 토양 온도", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_10cm", label: "10cm 지중온도", unit: "°C", desc: "지하 10cm 깊이 토양 온도", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_20cm", label: "20cm 지중온도", unit: "°C", desc: "지하 20cm 깊이 토양 온도", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_30cm", label: "30cm 지중온도", unit: "°C", desc: "지하 30cm 깊이 토양 온도", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },

  // 품질검사 플래그
  { col: "quality_temperature", label: "기온 품질판정", unit: "상태", desc: "시스템 기온 품질 판정 (NORMAL/INVALID/MISSING/SUSPECT)", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "ta_qcflg", label: "기온 플래그", unit: "코드", desc: "기상청 원본 기온 QC 플래그 (0:정상, 1:오류, 9:결측)", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "rn_qcflg", label: "강수량 플래그", unit: "코드", desc: "기상청 원본 강수량 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "ws_qcflg", label: "풍속 플래그", unit: "코드", desc: "기상청 원본 풍속 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "wd_qcflg", label: "풍향 플래그", unit: "코드", desc: "기상청 원본 풍향 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "hm_qcflg", label: "습도 플래그", unit: "코드", desc: "기상청 원본 습도 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "pa_qcflg", label: "현지기압 플래그", unit: "코드", desc: "기상청 원본 현지기압 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "ps_qcflg", label: "해면기압 플래그", unit: "코드", desc: "기상청 원본 해면기압 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "ss_qcflg", label: "일조 플래그", unit: "코드", desc: "기상청 원본 일조 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
  { col: "ts_qcflg", label: "지면온도 플래그", unit: "코드", desc: "기상청 원본 지면온도 QC 플래그", group: "품질검사 플래그", required: false, defaultOn: false, type: "text" },
];

export const DAILY_EXPORT_CATALOG = [
  // 기본 식별 (필수 식별 및 기본 정보)
  { col: "observation_date", label: "관측일자", unit: "", desc: "관측 일자 (YYYY-MM-DD). 일별 관측값을 식별하는 필수 항목입니다.", group: "기본 식별", required: true, defaultOn: true, type: "text" },
  { col: "station_id", label: "지점번호", unit: "", desc: "기상청 종관기상관측(ASOS) 지점 코드. 관측소를 식별하는 필수 항목입니다.", group: "기본 식별", required: true, defaultOn: true, type: "text" },
  { col: "station_name", label: "지점명", unit: "", desc: "관측소 지점 명칭 (예: 서울, 부산, 대구 등)", group: "기본 식별", required: false, defaultOn: false, type: "text" },
  { col: "source_kind", label: "자료출처", unit: "", desc: "자료 출처 구분 (OFFICIAL: 기상청 공식 수집, DERIVED: 시간자료 집계)", group: "기본 식별", required: false, defaultOn: true, type: "text" },
  { col: "note", label: "비고", unit: "", desc: "자료 생성 관련 비고 메모", group: "기본 식별", required: false, defaultOn: false, type: "text" },

  // 기온
  { col: "avg_temperature", label: "평균기온", unit: "°C", desc: "하루 24시간 관측 기온의 산술평균", group: "기온", required: false, defaultOn: true, type: "num" },
  { col: "min_temperature", label: "최저기온", unit: "°C", desc: "하루 중 관측된 가장 낮은 기온", group: "기온", required: false, defaultOn: true, type: "num" },
  { col: "min_temperature_time", label: "최저기온 시각", unit: "hhmi", desc: "최저기온이 나타난 시각 (기상청 hhmi 형식, 예: 0811)", group: "기온", required: false, defaultOn: false, type: "text" },
  { col: "max_temperature", label: "최고기온", unit: "°C", desc: "하루 중 관측된 가장 높은 기온", group: "기온", required: false, defaultOn: true, type: "num" },
  { col: "max_temperature_time", label: "최고기온 시각", unit: "hhmi", desc: "최고기온이 나타난 시각 (기상청 hhmi 형식, 예: 1435)", group: "기온", required: false, defaultOn: false, type: "text" },

  // 강수
  { col: "precipitation", label: "일강수량", unit: "mm", desc: "하루 동안 내린 총 강수량의 합계 (NULL: 무강수/미관측)", group: "강수", required: false, defaultOn: true, type: "num" },
  { col: "max_precip_10min", label: "10분 최다강수량", unit: "mm", desc: "하루 중 임의의 10분간 내린 가장 많은 강수량", group: "강수", required: false, defaultOn: false, type: "num" },
  { col: "max_precip_10min_time", label: "10분 최다강수 시각", unit: "hhmi", desc: "10분 최다강수량이 발생한 시각", group: "강수", required: false, defaultOn: false, type: "text" },
  { col: "max_precip_1h", label: "1시간 최다강수량", unit: "mm", desc: "하루 중 임의의 60분간 내린 가장 많은 강수량", group: "강수", required: false, defaultOn: false, type: "num" },
  { col: "max_precip_1h_time", label: "1시간 최다강수 시각", unit: "hhmi", desc: "1시간 최다강수량이 발생한 시각", group: "강수", required: false, defaultOn: false, type: "text" },
  { col: "precip_duration", label: "강수 계속시간", unit: "hr", desc: "강수 현상이 지속된 총 시간", group: "강수", required: false, defaultOn: false, type: "num" },
  { col: "precip_9to9", label: "9-9 강수", unit: "mm", desc: "전날 09시부터 당일 09시까지 24시간 동안 내린 강수량", group: "강수", required: false, defaultOn: false, type: "num" },

  // 바람
  { col: "avg_wind_speed", label: "평균 풍속", unit: "m/s", desc: "하루 동안 관측된 풍속의 평균값", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "max_wind_speed", label: "최대 풍속", unit: "m/s", desc: "하루 중 가장 강한 10분 평균 풍속", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "max_wind_dir", label: "최대 풍속 풍향", unit: "16방위", desc: "최대 풍속 발생 시의 풍향 (16방위)", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "max_wind_time", label: "최대 풍속 시각", unit: "hhmi", desc: "최대 풍속이 나타난 시각", group: "바람", required: false, defaultOn: false, type: "text" },
  { col: "max_inst_wind_speed", label: "최대 순간풍속", unit: "m/s", desc: "하루 중 순간적으로 가장 강하게 분 바람의 속도", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "max_inst_wind_dir", label: "최대 순간풍향", unit: "16방위", desc: "최대 순간풍속 발생 시의 풍향", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "max_inst_wind_time", label: "최대 순간풍속 시각", unit: "hhmi", desc: "최대 순간풍속이 나타난 시각", group: "바람", required: false, defaultOn: false, type: "text" },
  { col: "wind_run", label: "풍정합", unit: "100m", desc: "하루 동안 공기가 이동한 총 거리 (풍속 적산값)", group: "바람", required: false, defaultOn: false, type: "num" },
  { col: "most_frequent_wind_dir", label: "최다 풍향", unit: "16방위", desc: "하루 중 가장 빈번하게 불어온 바람의 방향", group: "바람", required: false, defaultOn: false, type: "num" },

  // 습도 · 기압
  { col: "avg_humidity", label: "평균 상대습도", unit: "%", desc: "하루 24시간 상대습도의 산술평균", group: "습도·기압", required: false, defaultOn: true, type: "num" },
  { col: "min_humidity", label: "최소 상대습도", unit: "%", desc: "하루 중 가장 낮았던 상대습도", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "min_humidity_time", label: "최소 상대습도 시각", unit: "hhmi", desc: "최소 상대습도가 나타난 시각", group: "습도·기압", required: false, defaultOn: false, type: "text" },
  { col: "avg_dew_point", label: "평균 이슬점온도", unit: "°C", desc: "하루 이슬점온도의 산술평균", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "avg_vapor_pressure", label: "평균 증기압", unit: "hPa", desc: "하루 수증기압의 산술평균", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "avg_pressure", label: "평균 현지기압", unit: "hPa", desc: "관측소 위치에서 측정한 하루 현지기압 평균", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "avg_sea_level_pressure", label: "평균 해면기압", unit: "hPa", desc: "해수면 기준으로 보정한 하루 해면기압 평균", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "max_sea_level_pressure", label: "최고 해면기압", unit: "hPa", desc: "하루 중 가장 높았던 해면기압", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "max_sea_level_pressure_time", label: "최고 해면기압 시각", unit: "hhmi", desc: "최고 해면기압이 나타난 시각", group: "습도·기압", required: false, defaultOn: false, type: "text" },
  { col: "min_sea_level_pressure", label: "최저 해면기압", unit: "hPa", desc: "하루 중 가장 낮았던 해면기압", group: "습도·기압", required: false, defaultOn: false, type: "num" },
  { col: "min_sea_level_pressure_time", label: "최저 해면기압 시각", unit: "hhmi", desc: "최저 해면기압이 나타난 시각", group: "습도·기압", required: false, defaultOn: false, type: "text" },

  // 일조 · 일사
  { col: "possible_sunshine", label: "가조시간", unit: "hr", desc: "일출부터 일몰까지 지형 차폐가 없을 때 해가 뜰 수 있는 총 시간", group: "일조·일사", required: false, defaultOn: false, type: "num" },
  { col: "sunshine", label: "합계 일조시간", unit: "hr", desc: "실제 태양광선이 지표면에 도달한 총 시간 합계", group: "일조·일사", required: false, defaultOn: false, type: "num" },
  { col: "solar_radiation", label: "합계 일사량", unit: "MJ/m²", desc: "하루 동안 지표면에 도달한 태양 복사에너지 총량", group: "일조·일사", required: false, defaultOn: false, type: "num" },
  { col: "max_solar_1h", label: "1시간 최다일사량", unit: "MJ/m²", desc: "하루 중 1시간 동안 도달한 태양 복사에너지 최대치", group: "일조·일사", required: false, defaultOn: false, type: "num" },
  { col: "max_solar_1h_time", label: "1시간 최다일사 시각", unit: "hhmi", desc: "1시간 최다일사량이 발생한 시각", group: "일조·일사", required: false, defaultOn: false, type: "text" },

  // 눈 (적설·신적설) - 강수량과 구분
  { col: "max_new_snow", label: "일 최심신적설", unit: "cm", desc: "하루 동안 새로 내려 쌓인 눈(신적설)의 최고 깊이", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "num" },
  { col: "max_new_snow_time", label: "일 최심신적설 시각", unit: "hhmi", desc: "일 최심신적설이 관측된 시각", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "text" },
  { col: "max_snow_depth", label: "일 최심적설", unit: "cm", desc: "지면에 쌓여 있는 눈(기존 적설 포함)의 하루 중 최고 깊이", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "num" },
  { col: "max_snow_depth_time", label: "일 최심적설 시각", unit: "hhmi", desc: "일 최심적설이 관측된 시각", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "text" },
  { col: "snow_new_3h_sum", label: "합계 3시간 신적설", unit: "cm", desc: "하루 동안 관측된 3시간 신적설의 합계", group: "눈 (적설·신적설)", required: false, defaultOn: false, type: "num" },

  // 구름 · 안개 · 증발 · 기상현상
  { col: "avg_total_cloud", label: "평균 전운량", unit: "10분위", desc: "하늘 전체 중 구름이 덮인 비율의 일평균 (0~10)", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "avg_low_mid_cloud", label: "평균 중하층운량", unit: "10분위", desc: "하늘 전체 중 중·하층 구름이 덮인 비율의 일평균 (0~10)", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "weather_phenomena", label: "일기현상", unit: "원문", desc: "당일 발생한 주요 기상현상 기록 (비, 눈, 안개, 천둥번개 등)", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "text" },
  { col: "fog_duration", label: "안개 계속시간", unit: "hr", desc: "안개(시정 1km 미만) 현상이 지속된 총 시간", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "evaporation_large", label: "합계 대형증발량", unit: "mm", desc: "대형 증발계로 측정한 하루 수분 증발량 합계", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "num" },
  { col: "evaporation_small", label: "합계 소형증발량", unit: "mm", desc: "소형 증발계로 측정한 하루 수분 증발량 합계", group: "구름·안개·증발·기상현상", required: false, defaultOn: false, type: "num" },

  // 지면 · 지중온도
  { col: "avg_ground_temperature", label: "평균 지면온도", unit: "°C", desc: "지표면 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "min_grass_temperature", label: "최저 초상온도", unit: "°C", desc: "지표면 잔디 풀끝 위에서 측정한 최저온도 (서리 발생 지표)", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "avg_soil_temp_5cm", label: "5cm 지중온도", unit: "°C", desc: "지하 5cm 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "avg_soil_temp_10cm", label: "10cm 지중온도", unit: "°C", desc: "지하 10cm 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "avg_soil_temp_20cm", label: "20cm 지중온도", unit: "°C", desc: "지하 20cm 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "avg_soil_temp_30cm", label: "30cm 지중온도", unit: "°C", desc: "지하 30cm 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_0_5m", label: "0.5m 지중온도", unit: "°C", desc: "지하 0.5m 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_1_0m", label: "1.0m 지중온도", unit: "°C", desc: "지하 1.0m 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_1_5m", label: "1.5m 지중온도", unit: "°C", desc: "지하 1.5m 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_3_0m", label: "3.0m 지중온도", unit: "°C", desc: "지하 3.0m 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
  { col: "soil_temp_5_0m", label: "5.0m 지중온도", unit: "°C", desc: "지하 5.0m 깊이 토양 온도의 일평균", group: "지면·지중온도", required: false, defaultOn: false, type: "num" },
];

export const EXPORT_PRESETS = [
  {
    id: "preset_hourly_default",
    name: "기본 구성 (시간자료)",
    kind: "hourly",
    columns: [...HOURLY_DEFAULT_EXPORT],
    isPreset: true,
  },
  {
    id: "preset_daily_default",
    name: "기본 구성 (일자료)",
    kind: "daily",
    columns: [...DAILY_DEFAULT_EXPORT],
    isPreset: true,
  },
  {
    id: "preset_hourly_temp",
    name: "기온·체감 심화 (시간)",
    kind: "hourly",
    columns: ["observation_datetime", "station_id", "station_name", "temperature", "dew_point", "vapor_pressure", "humidity", "ground_temperature"],
    isPreset: true,
  },
  {
    id: "preset_daily_temp",
    name: "기온·한난 요약 (일)",
    kind: "daily",
    columns: ["observation_date", "station_id", "station_name", "avg_temperature", "min_temperature", "min_temperature_time", "max_temperature", "max_temperature_time", "min_grass_temperature"],
    isPreset: true,
  },
  {
    id: "preset_hourly_rain_snow",
    name: "강수·적설 분석 (시간)",
    kind: "hourly",
    columns: ["observation_datetime", "station_id", "station_name", "precipitation", "snow_depth", "snow_new_3h", "humidity"],
    isPreset: true,
  },
  {
    id: "preset_daily_rain_snow",
    name: "강수·적설 요약 (일)",
    kind: "daily",
    columns: ["observation_date", "station_id", "station_name", "precipitation", "max_precip_10min", "max_precip_1h", "precip_duration", "max_new_snow", "max_snow_depth", "snow_new_3h_sum"],
    isPreset: true,
  },
  {
    id: "preset_hourly_wind_press",
    name: "바람·기압 분석 (시간)",
    kind: "hourly",
    columns: ["observation_datetime", "station_id", "station_name", "wind_speed", "wind_direction", "pressure", "sea_level_pressure"],
    isPreset: true,
  },
  {
    id: "preset_daily_wind_press",
    name: "바람·기압 요약 (일)",
    kind: "daily",
    columns: ["observation_date", "station_id", "station_name", "avg_wind_speed", "max_wind_speed", "max_wind_dir", "max_inst_wind_speed", "max_inst_wind_dir", "avg_pressure", "avg_sea_level_pressure"],
    isPreset: true,
  },
];

export function getExportCatalog(kind, { fullFields = true } = {}) {
  const catalog = kind === "daily" ? DAILY_EXPORT_CATALOG : HOURLY_EXPORT_CATALOG;
  const legacySet = new Set(kind === "daily" ? DAILY_LEGACY_COLUMNS : HOURLY_LEGACY_COLUMNS);
  return catalog.map((item) => {
    const isLegacy = legacySet.has(item.col) || item.required || item.defaultOn;
    return {
      ...item,
      key: item.col,
      name_ko: item.label,
      category: item.group,
      available: fullFields ? true : isLegacy,
      avail: fullFields ? true : isLegacy,
    };
  });
}

export function validateExportColumns(kind, cols) {
  const catalog = kind === "daily" ? DAILY_EXPORT_CATALOG : HOURLY_EXPORT_CATALOG;
  const validMap = new Map(catalog.map((c) => [c.col, c]));
  const defaultCols = kind === "daily" ? DAILY_DEFAULT_EXPORT : HOURLY_DEFAULT_EXPORT;
  if (!cols || !Array.isArray(cols) || !cols.length) {
    return [...defaultCols];
  }
  const seen = new Set();
  const res = [];
  for (const c of cols) {
    const trimmed = typeof c === "string" ? c.trim() : "";
    if (trimmed && validMap.has(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      res.push(trimmed);
    }
  }
  // 필수 식별 컬럼(관측시각/일자, 지점번호)은 누락되지 않도록 보장 (카탈로그 순서대로 앞에 오도록 역순 unshift)
  const reqCols = catalog.filter((c) => c.required).map((c) => c.col);
  for (const r of reqCols.slice().reverse()) {
    if (!seen.has(r)) {
      res.unshift(r);
      seen.add(r);
    }
  }
  return res.length ? res : [...defaultCols];
}

export function escapeCsvValue(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function formatCsvRow(row, cols) {
  return cols.map((col) => escapeCsvValue(row[col])).join(",");
}

