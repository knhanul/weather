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
