-- 0003: 기상청 ASOS 시간자료·일자료 API 의 모든 응답 항목을 보관한다.
-- - 기존 컬럼·값·의미는 그대로 둔다(화면·조회 API 응답 변화 없음). 새 컬럼만 추가한다(NULL 허용, 기본값 없음 → 기존 행 재작성 없음).
-- - raw(jsonb): API 가 준 항목(item) 원본 전체. 기상청이 항목을 추가해도 잃지 않는다.
-- - 이 마이그레이션 전에 저장된 행은 새 컬럼이 NULL 이다. 다시 수집(관리자 수동 수집)하면 UPSERT 로 채워진다.
-- - 값은 기상청 단위 그대로. 시각(…_time)은 기상청 hhmi 문자열 그대로(예: '811' = 08:11).
-- 근거: 공공데이터포털 15057210(시간자료), 15059093(일자료) 출력결과 표. 매핑 코드는 kma-fields.mjs.
-- 다시 실행해도 안전하다(IF NOT EXISTS). 앱 시작 시 db.mjs 가 hub_migrations 에 기록하며 한 번만 적용한다.

ALTER TABLE observations_hourly
  ADD COLUMN IF NOT EXISTS ta_qcflg text,
  ADD COLUMN IF NOT EXISTS rn_qcflg text,
  ADD COLUMN IF NOT EXISTS ws_qcflg text,
  ADD COLUMN IF NOT EXISTS wd_qcflg text,
  ADD COLUMN IF NOT EXISTS hm_qcflg text,
  ADD COLUMN IF NOT EXISTS vapor_pressure double precision,
  ADD COLUMN IF NOT EXISTS dew_point double precision,
  ADD COLUMN IF NOT EXISTS pa_qcflg text,
  ADD COLUMN IF NOT EXISTS sea_level_pressure double precision,
  ADD COLUMN IF NOT EXISTS ps_qcflg text,
  ADD COLUMN IF NOT EXISTS sunshine double precision,
  ADD COLUMN IF NOT EXISTS ss_qcflg text,
  ADD COLUMN IF NOT EXISTS solar_radiation double precision,
  ADD COLUMN IF NOT EXISTS snow_depth double precision,
  ADD COLUMN IF NOT EXISTS snow_new_3h double precision,
  ADD COLUMN IF NOT EXISTS total_cloud double precision,
  ADD COLUMN IF NOT EXISTS low_mid_cloud double precision,
  ADD COLUMN IF NOT EXISTS cloud_form text,
  ADD COLUMN IF NOT EXISTS lowest_cloud_height double precision,
  ADD COLUMN IF NOT EXISTS visibility double precision,
  ADD COLUMN IF NOT EXISTS ground_state_code text,
  ADD COLUMN IF NOT EXISTS phenomenon_code text,
  ADD COLUMN IF NOT EXISTS ground_temperature double precision,
  ADD COLUMN IF NOT EXISTS ts_qcflg text,
  ADD COLUMN IF NOT EXISTS soil_temp_5cm double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_10cm double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_20cm double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_30cm double precision,
  ADD COLUMN IF NOT EXISTS raw jsonb;

COMMENT ON COLUMN observations_hourly.temperature IS 'KMA ta: 기온(°C) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.precipitation IS 'KMA rn: 강수량(mm) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.humidity IS 'KMA hm: 습도(%) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.wind_speed IS 'KMA ws: 풍속(m/s) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.wind_direction IS 'KMA wd: 풍향(16방위, deg) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.pressure IS 'KMA pa: 현지기압(hPa) (기존 컬럼)';
COMMENT ON COLUMN observations_hourly.ta_qcflg IS 'KMA taQcflg: 기온 품질검사 플래그(원본 값)';
COMMENT ON COLUMN observations_hourly.rn_qcflg IS 'KMA rnQcflg: 강수량 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.ws_qcflg IS 'KMA wsQcflg: 풍속 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.wd_qcflg IS 'KMA wdQcflg: 풍향 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.hm_qcflg IS 'KMA hmQcflg: 습도 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.vapor_pressure IS 'KMA pv: 증기압(hPa)';
COMMENT ON COLUMN observations_hourly.dew_point IS 'KMA td: 이슬점온도(°C)';
COMMENT ON COLUMN observations_hourly.pa_qcflg IS 'KMA paQcflg: 현지기압 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.sea_level_pressure IS 'KMA ps: 해면기압(hPa)';
COMMENT ON COLUMN observations_hourly.ps_qcflg IS 'KMA psQcflg: 해면기압 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.sunshine IS 'KMA ss: 일조(hr)';
COMMENT ON COLUMN observations_hourly.ss_qcflg IS 'KMA ssQcflg: 일조 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.solar_radiation IS 'KMA icsr: 일사(MJ/m2)';
COMMENT ON COLUMN observations_hourly.snow_depth IS 'KMA dsnw: 적설(cm)';
COMMENT ON COLUMN observations_hourly.snow_new_3h IS 'KMA hr3Fhsc: 3시간 신적설(cm)';
COMMENT ON COLUMN observations_hourly.total_cloud IS 'KMA dc10Tca: 전운량(10분위)';
COMMENT ON COLUMN observations_hourly.low_mid_cloud IS 'KMA dc10LmcsCa: 중하층운량(10분위)';
COMMENT ON COLUMN observations_hourly.cloud_form IS 'KMA clfmAbbrCd: 운형(운형 약어)';
COMMENT ON COLUMN observations_hourly.lowest_cloud_height IS 'KMA lcsCh: 최저운고(100m)';
COMMENT ON COLUMN observations_hourly.visibility IS 'KMA vs: 시정(10m)';
COMMENT ON COLUMN observations_hourly.ground_state_code IS 'KMA gndSttCd: 지면상태(지면상태코드)';
COMMENT ON COLUMN observations_hourly.phenomenon_code IS 'KMA dmstMtphNo: 현상번호(국내식)';
COMMENT ON COLUMN observations_hourly.ground_temperature IS 'KMA ts: 지면온도(°C)';
COMMENT ON COLUMN observations_hourly.ts_qcflg IS 'KMA tsQcflg: 지면온도 품질검사 플래그';
COMMENT ON COLUMN observations_hourly.soil_temp_5cm IS 'KMA m005Te: 5cm 지중온도(°C)';
COMMENT ON COLUMN observations_hourly.soil_temp_10cm IS 'KMA m01Te: 10cm 지중온도(°C)';
COMMENT ON COLUMN observations_hourly.soil_temp_20cm IS 'KMA m02Te: 20cm 지중온도(°C)';
COMMENT ON COLUMN observations_hourly.soil_temp_30cm IS 'KMA m03Te: 30cm 지중온도(°C)';
COMMENT ON COLUMN observations_hourly.raw IS 'KMA ASOS 시간자료 API 응답 item 원본 전체(jsonb, 문자열 값 그대로)';

ALTER TABLE observations_daily
  ADD COLUMN IF NOT EXISTS min_temperature_time text,
  ADD COLUMN IF NOT EXISTS max_temperature_time text,
  ADD COLUMN IF NOT EXISTS max_precip_10min double precision,
  ADD COLUMN IF NOT EXISTS max_precip_10min_time text,
  ADD COLUMN IF NOT EXISTS max_precip_1h double precision,
  ADD COLUMN IF NOT EXISTS max_precip_1h_time text,
  ADD COLUMN IF NOT EXISTS precip_duration double precision,
  ADD COLUMN IF NOT EXISTS max_inst_wind_speed double precision,
  ADD COLUMN IF NOT EXISTS max_inst_wind_dir double precision,
  ADD COLUMN IF NOT EXISTS max_inst_wind_time text,
  ADD COLUMN IF NOT EXISTS max_wind_speed double precision,
  ADD COLUMN IF NOT EXISTS max_wind_dir double precision,
  ADD COLUMN IF NOT EXISTS max_wind_time text,
  ADD COLUMN IF NOT EXISTS avg_wind_speed double precision,
  ADD COLUMN IF NOT EXISTS wind_run double precision,
  ADD COLUMN IF NOT EXISTS most_frequent_wind_dir double precision,
  ADD COLUMN IF NOT EXISTS avg_dew_point double precision,
  ADD COLUMN IF NOT EXISTS min_humidity double precision,
  ADD COLUMN IF NOT EXISTS min_humidity_time text,
  ADD COLUMN IF NOT EXISTS avg_vapor_pressure double precision,
  ADD COLUMN IF NOT EXISTS avg_pressure double precision,
  ADD COLUMN IF NOT EXISTS max_sea_level_pressure double precision,
  ADD COLUMN IF NOT EXISTS max_sea_level_pressure_time text,
  ADD COLUMN IF NOT EXISTS min_sea_level_pressure double precision,
  ADD COLUMN IF NOT EXISTS min_sea_level_pressure_time text,
  ADD COLUMN IF NOT EXISTS avg_sea_level_pressure double precision,
  ADD COLUMN IF NOT EXISTS possible_sunshine double precision,
  ADD COLUMN IF NOT EXISTS sunshine double precision,
  ADD COLUMN IF NOT EXISTS max_solar_1h_time text,
  ADD COLUMN IF NOT EXISTS max_solar_1h double precision,
  ADD COLUMN IF NOT EXISTS solar_radiation double precision,
  ADD COLUMN IF NOT EXISTS max_new_snow double precision,
  ADD COLUMN IF NOT EXISTS max_new_snow_time text,
  ADD COLUMN IF NOT EXISTS max_snow_depth double precision,
  ADD COLUMN IF NOT EXISTS max_snow_depth_time text,
  ADD COLUMN IF NOT EXISTS snow_new_3h_sum double precision,
  ADD COLUMN IF NOT EXISTS avg_total_cloud double precision,
  ADD COLUMN IF NOT EXISTS avg_low_mid_cloud double precision,
  ADD COLUMN IF NOT EXISTS avg_ground_temperature double precision,
  ADD COLUMN IF NOT EXISTS min_grass_temperature double precision,
  ADD COLUMN IF NOT EXISTS avg_soil_temp_5cm double precision,
  ADD COLUMN IF NOT EXISTS avg_soil_temp_10cm double precision,
  ADD COLUMN IF NOT EXISTS avg_soil_temp_20cm double precision,
  ADD COLUMN IF NOT EXISTS avg_soil_temp_30cm double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_0_5m double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_1_0m double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_1_5m double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_3_0m double precision,
  ADD COLUMN IF NOT EXISTS soil_temp_5_0m double precision,
  ADD COLUMN IF NOT EXISTS evaporation_large double precision,
  ADD COLUMN IF NOT EXISTS evaporation_small double precision,
  ADD COLUMN IF NOT EXISTS precip_9to9 double precision,
  ADD COLUMN IF NOT EXISTS weather_phenomena text,
  ADD COLUMN IF NOT EXISTS fog_duration double precision,
  ADD COLUMN IF NOT EXISTS raw jsonb;

COMMENT ON COLUMN observations_daily.avg_temperature IS 'KMA avgTa: 평균기온(°C) (기존 컬럼)';
COMMENT ON COLUMN observations_daily.min_temperature IS 'KMA minTa: 최저기온(°C) (기존 컬럼)';
COMMENT ON COLUMN observations_daily.max_temperature IS 'KMA maxTa: 최고기온(°C) (기존 컬럼)';
COMMENT ON COLUMN observations_daily.precipitation IS 'KMA sumRn: 일강수량(mm) (기존 컬럼)';
COMMENT ON COLUMN observations_daily.avg_humidity IS 'KMA avgRhm: 평균 상대습도(%) (기존 컬럼)';
COMMENT ON COLUMN observations_daily.min_temperature_time IS 'KMA minTaHrmt: 최저기온 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_temperature_time IS 'KMA maxTaHrmt: 최고기온 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_precip_10min IS 'KMA mi10MaxRn: 10분 최다강수량(mm)';
COMMENT ON COLUMN observations_daily.max_precip_10min_time IS 'KMA mi10MaxRnHrmt: 10분 최다강수량 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_precip_1h IS 'KMA hr1MaxRn: 1시간 최다강수량(mm)';
COMMENT ON COLUMN observations_daily.max_precip_1h_time IS 'KMA hr1MaxRnHrmt: 1시간 최다강수량 시각(hhmi)';
COMMENT ON COLUMN observations_daily.precip_duration IS 'KMA sumRnDur: 강수 계속시간(hr)';
COMMENT ON COLUMN observations_daily.max_inst_wind_speed IS 'KMA maxInsWs: 최대 순간풍속(m/s)';
COMMENT ON COLUMN observations_daily.max_inst_wind_dir IS 'KMA maxInsWsWd: 최대 순간풍속 풍향(16방위)';
COMMENT ON COLUMN observations_daily.max_inst_wind_time IS 'KMA maxInsWsHrmt: 최대 순간풍속 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_wind_speed IS 'KMA maxWs: 최대 풍속(m/s)';
COMMENT ON COLUMN observations_daily.max_wind_dir IS 'KMA maxWsWd: 최대 풍속 풍향(16방위)';
COMMENT ON COLUMN observations_daily.max_wind_time IS 'KMA maxWsHrmt: 최대 풍속 시각(hhmi)';
COMMENT ON COLUMN observations_daily.avg_wind_speed IS 'KMA avgWs: 평균 풍속(m/s)';
COMMENT ON COLUMN observations_daily.wind_run IS 'KMA hr24SumRws: 풍정합(100m)';
COMMENT ON COLUMN observations_daily.most_frequent_wind_dir IS 'KMA maxWd: 최다풍향(16방위)';
COMMENT ON COLUMN observations_daily.avg_dew_point IS 'KMA avgTd: 평균 이슬점온도(°C)';
COMMENT ON COLUMN observations_daily.min_humidity IS 'KMA minRhm: 최소 상대습도(%)';
COMMENT ON COLUMN observations_daily.min_humidity_time IS 'KMA minRhmHrmt: 최소 상대습도 시각(hhmi)';
COMMENT ON COLUMN observations_daily.avg_vapor_pressure IS 'KMA avgPv: 평균 증기압(hPa)';
COMMENT ON COLUMN observations_daily.avg_pressure IS 'KMA avgPa: 평균 현지기압(hPa)';
COMMENT ON COLUMN observations_daily.max_sea_level_pressure IS 'KMA maxPs: 최고 해면기압(hPa)';
COMMENT ON COLUMN observations_daily.max_sea_level_pressure_time IS 'KMA maxPsHrmt: 최고 해면기압 시각(hhmi)';
COMMENT ON COLUMN observations_daily.min_sea_level_pressure IS 'KMA minPs: 최저 해면기압(hPa)';
COMMENT ON COLUMN observations_daily.min_sea_level_pressure_time IS 'KMA minPsHrmt: 최저 해면기압 시각(hhmi)';
COMMENT ON COLUMN observations_daily.avg_sea_level_pressure IS 'KMA avgPs: 평균 해면기압(hPa)';
COMMENT ON COLUMN observations_daily.possible_sunshine IS 'KMA ssDur: 가조시간(hr)';
COMMENT ON COLUMN observations_daily.sunshine IS 'KMA sumSsHr: 합계 일조시간(hr)';
COMMENT ON COLUMN observations_daily.max_solar_1h_time IS 'KMA hr1MaxIcsrHrmt: 1시간 최다일사 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_solar_1h IS 'KMA hr1MaxIcsr: 1시간 최다일사량(MJ/m2)';
COMMENT ON COLUMN observations_daily.solar_radiation IS 'KMA sumGsr: 합계 일사량(MJ/m2)';
COMMENT ON COLUMN observations_daily.max_new_snow IS 'KMA ddMefs: 일 최심신적설(cm)';
COMMENT ON COLUMN observations_daily.max_new_snow_time IS 'KMA ddMefsHrmt: 일 최심신적설 시각(hhmi)';
COMMENT ON COLUMN observations_daily.max_snow_depth IS 'KMA ddMes: 일 최심적설(cm)';
COMMENT ON COLUMN observations_daily.max_snow_depth_time IS 'KMA ddMesHrmt: 일 최심적설 시각(hhmi)';
COMMENT ON COLUMN observations_daily.snow_new_3h_sum IS 'KMA sumDpthFhsc: 합계 3시간 신적설(cm)';
COMMENT ON COLUMN observations_daily.avg_total_cloud IS 'KMA avgTca: 평균 전운량(10분위)';
COMMENT ON COLUMN observations_daily.avg_low_mid_cloud IS 'KMA avgLmac: 평균 중하층운량(10분위)';
COMMENT ON COLUMN observations_daily.avg_ground_temperature IS 'KMA avgTs: 평균 지면온도(°C)';
COMMENT ON COLUMN observations_daily.min_grass_temperature IS 'KMA minTg: 최저 초상온도(°C)';
COMMENT ON COLUMN observations_daily.avg_soil_temp_5cm IS 'KMA avgCm5Te: 평균 5cm 지중온도(°C)';
COMMENT ON COLUMN observations_daily.avg_soil_temp_10cm IS 'KMA avgCm10Te: 평균 10cm 지중온도(°C)';
COMMENT ON COLUMN observations_daily.avg_soil_temp_20cm IS 'KMA avgCm20Te: 평균 20cm 지중온도(°C)';
COMMENT ON COLUMN observations_daily.avg_soil_temp_30cm IS 'KMA avgCm30Te: 평균 30cm 지중온도(°C)';
COMMENT ON COLUMN observations_daily.soil_temp_0_5m IS 'KMA avgM05Te: 0.5m 지중온도(°C)';
COMMENT ON COLUMN observations_daily.soil_temp_1_0m IS 'KMA avgM10Te: 1.0m 지중온도(°C)';
COMMENT ON COLUMN observations_daily.soil_temp_1_5m IS 'KMA avgM15Te: 1.5m 지중온도(°C)';
COMMENT ON COLUMN observations_daily.soil_temp_3_0m IS 'KMA avgM30Te: 3.0m 지중온도(°C)';
COMMENT ON COLUMN observations_daily.soil_temp_5_0m IS 'KMA avgM50Te: 5.0m 지중온도(°C)';
COMMENT ON COLUMN observations_daily.evaporation_large IS 'KMA sumLrgEv: 합계 대형증발량(mm)';
COMMENT ON COLUMN observations_daily.evaporation_small IS 'KMA sumSmlEv: 합계 소형증발량(mm)';
COMMENT ON COLUMN observations_daily.precip_9to9 IS 'KMA n99Rn: 9-9 강수(mm, 전날 09시~당일 09시)';
COMMENT ON COLUMN observations_daily.weather_phenomena IS 'KMA iscs: 일기현상(원문)';
COMMENT ON COLUMN observations_daily.fog_duration IS 'KMA sumFogDur: 안개 계속시간(hr)';
COMMENT ON COLUMN observations_daily.raw IS 'KMA ASOS 일자료 API 응답 item 원본 전체(jsonb, 문자열 값 그대로)';

COMMENT ON COLUMN observations_hourly.quality_temperature IS 'KMA taQcflg 를 NORMAL/INVALID/MISSING/SUSPECT 로 바꾼 값 (기존 컬럼, 원본 값은 ta_qcflg)';
COMMENT ON COLUMN observations_hourly.station_id IS 'KMA stnId: 지점번호';
COMMENT ON COLUMN observations_hourly.station_name IS 'KMA stnNm: 지점명';
COMMENT ON COLUMN observations_hourly.observation_datetime IS 'KMA tm: 일시(KST, YYYY-MM-DD HH:MM[:SS])';
COMMENT ON COLUMN observations_daily.station_id IS 'KMA stnId: 지점번호';
COMMENT ON COLUMN observations_daily.station_name IS 'KMA stnNm: 지점명';
COMMENT ON COLUMN observations_daily.observation_date IS 'KMA tm: 일자(YYYY-MM-DD)';
