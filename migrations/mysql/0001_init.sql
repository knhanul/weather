-- MySQL 5.6+ (NAS hae.nuni.co.kr) 용 누니날씨 전체 스키마 (2026-10-10). DB_DRIVER=mysql 일 때만 쓰인다.
-- PostgreSQL 의 schema.sql + migrations/hub/0003·0004 + auth-schema.sql 과 같은 테이블·컬럼·의미 (컬럼 설명은 0003_asos_all_fields.sql 참고).
-- 다른 점:
-- - text 키 컬럼은 VARCHAR(utf8mb4_bin: PostgreSQL C 정렬과 같은 바이트 순서). 5.6 의 767바이트 인덱스 제한 안쪽 길이.
-- - jsonb(raw, columns) 는 LONGTEXT(JSON 문자열). 앱이 읽을 때 JSON.parse.
-- - timestamptz 는 DATETIME(6) 에 UTC 로 저장 (앱 연결은 time_zone=+00:00).
-- - observations_hourly 의 기본키 순서를 (station_id, observation_datetime, provider, dataset) 로 둔다. 같은 열 집합이라 유일성은 같고,
--   지점·기간 조회가 클러스터드 인덱스 범위 읽기가 된다. 좁은 보조 인덱스는 개수·최소·최대 집계용(커버링).
-- - export_layouts 의 "종류별 기본 1개" 부분 유일 인덱스(WHERE is_default)는 default_marker(1 또는 NULL) + 유일 인덱스로 대신한다.
-- - CHECK 제약은 5.6 이 무시하므로 앱 코드가 검사한다(기존과 같음).
-- 문장 구분은 줄 끝의 ";" (db-mysql.mjs 가 나눠서 실행). 다시 실행해도 안전(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS observations_hourly (
  provider VARCHAR(16) NOT NULL DEFAULT 'KMA',
  dataset VARCHAR(32) NOT NULL DEFAULT 'ASOS_HOURLY',
  station_id VARCHAR(16) NOT NULL,
  station_name VARCHAR(100) NULL,
  observation_datetime VARCHAR(32) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
  temperature DOUBLE NULL,
  precipitation DOUBLE NULL,
  humidity DOUBLE NULL,
  wind_speed DOUBLE NULL,
  wind_direction DOUBLE NULL,
  pressure DOUBLE NULL,
  quality_temperature VARCHAR(32) NULL,
  source_kind VARCHAR(32) NULL,
  ta_qcflg TEXT NULL,
  rn_qcflg TEXT NULL,
  ws_qcflg TEXT NULL,
  wd_qcflg TEXT NULL,
  hm_qcflg TEXT NULL,
  vapor_pressure DOUBLE NULL,
  dew_point DOUBLE NULL,
  pa_qcflg TEXT NULL,
  sea_level_pressure DOUBLE NULL,
  ps_qcflg TEXT NULL,
  sunshine DOUBLE NULL,
  ss_qcflg TEXT NULL,
  solar_radiation DOUBLE NULL,
  snow_depth DOUBLE NULL,
  snow_new_3h DOUBLE NULL,
  total_cloud DOUBLE NULL,
  low_mid_cloud DOUBLE NULL,
  cloud_form TEXT NULL,
  lowest_cloud_height DOUBLE NULL,
  visibility DOUBLE NULL,
  ground_state_code TEXT NULL,
  phenomenon_code TEXT NULL,
  ground_temperature DOUBLE NULL,
  ts_qcflg TEXT NULL,
  soil_temp_5cm DOUBLE NULL,
  soil_temp_10cm DOUBLE NULL,
  soil_temp_20cm DOUBLE NULL,
  soil_temp_30cm DOUBLE NULL,
  raw LONGTEXT NULL,
  PRIMARY KEY (station_id, observation_datetime, provider, dataset),
  KEY observations_hourly_station_dt (station_id, observation_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS observations_daily (
  station_id VARCHAR(16) NOT NULL,
  station_name VARCHAR(100) NULL,
  observation_date VARCHAR(32) NOT NULL,
  avg_temperature DOUBLE NULL,
  min_temperature DOUBLE NULL,
  max_temperature DOUBLE NULL,
  precipitation DOUBLE NULL,
  avg_humidity DOUBLE NULL,
  source_kind VARCHAR(32) NULL,
  note TEXT NULL,
  min_temperature_time TEXT NULL,
  max_temperature_time TEXT NULL,
  max_precip_10min DOUBLE NULL,
  max_precip_10min_time TEXT NULL,
  max_precip_1h DOUBLE NULL,
  max_precip_1h_time TEXT NULL,
  precip_duration DOUBLE NULL,
  max_inst_wind_speed DOUBLE NULL,
  max_inst_wind_dir DOUBLE NULL,
  max_inst_wind_time TEXT NULL,
  max_wind_speed DOUBLE NULL,
  max_wind_dir DOUBLE NULL,
  max_wind_time TEXT NULL,
  avg_wind_speed DOUBLE NULL,
  wind_run DOUBLE NULL,
  most_frequent_wind_dir DOUBLE NULL,
  avg_dew_point DOUBLE NULL,
  min_humidity DOUBLE NULL,
  min_humidity_time TEXT NULL,
  avg_vapor_pressure DOUBLE NULL,
  avg_pressure DOUBLE NULL,
  max_sea_level_pressure DOUBLE NULL,
  max_sea_level_pressure_time TEXT NULL,
  min_sea_level_pressure DOUBLE NULL,
  min_sea_level_pressure_time TEXT NULL,
  avg_sea_level_pressure DOUBLE NULL,
  possible_sunshine DOUBLE NULL,
  sunshine DOUBLE NULL,
  max_solar_1h_time TEXT NULL,
  max_solar_1h DOUBLE NULL,
  solar_radiation DOUBLE NULL,
  max_new_snow DOUBLE NULL,
  max_new_snow_time TEXT NULL,
  max_snow_depth DOUBLE NULL,
  max_snow_depth_time TEXT NULL,
  snow_new_3h_sum DOUBLE NULL,
  avg_total_cloud DOUBLE NULL,
  avg_low_mid_cloud DOUBLE NULL,
  avg_ground_temperature DOUBLE NULL,
  min_grass_temperature DOUBLE NULL,
  avg_soil_temp_5cm DOUBLE NULL,
  avg_soil_temp_10cm DOUBLE NULL,
  avg_soil_temp_20cm DOUBLE NULL,
  avg_soil_temp_30cm DOUBLE NULL,
  soil_temp_0_5m DOUBLE NULL,
  soil_temp_1_0m DOUBLE NULL,
  soil_temp_1_5m DOUBLE NULL,
  soil_temp_3_0m DOUBLE NULL,
  soil_temp_5_0m DOUBLE NULL,
  evaporation_large DOUBLE NULL,
  evaporation_small DOUBLE NULL,
  precip_9to9 DOUBLE NULL,
  weather_phenomena TEXT NULL,
  fog_duration DOUBLE NULL,
  raw LONGTEXT NULL,
  PRIMARY KEY (station_id, observation_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS collect_jobs (
  id BIGINT NOT NULL,
  dataset VARCHAR(64) NULL,
  status VARCHAR(32) NULL,
  `trigger` VARCHAR(32) NULL,
  station_id VARCHAR(16) NULL,
  range_from VARCHAR(32) NULL,
  range_to VARCHAR(32) NULL,
  received INT NULL DEFAULT 0,
  inserted INT NULL DEFAULT 0,
  updated INT NULL DEFAULT 0,
  chunks INT NULL DEFAULT 0,
  message TEXT NULL,
  created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS weather_stations (
  station_id VARCHAR(16) NOT NULL,
  station_name VARCHAR(100) NULL,
  region VARCHAR(100) NULL,
  enabled TINYINT(1) NULL DEFAULT 1,
  favorite TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS hub_settings (
  k VARCHAR(191) NOT NULL,
  v TEXT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS export_layouts (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(160) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  columns LONGTEXT NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  default_marker TINYINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY export_layouts_owner_idx (owner_id, kind),
  UNIQUE KEY export_layouts_one_default_idx (owner_id, kind, default_marker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS app_users (
  kakao_id VARCHAR(160) NOT NULL,
  nickname TEXT NULL,
  profile_image TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_login_at DATETIME(6) NULL,
  status_changed_at DATETIME(6) NULL,
  status_changed_by VARCHAR(160) NULL,
  PRIMARY KEY (kakao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS app_sessions (
  id_hash VARCHAR(128) NOT NULL,
  kakao_id VARCHAR(160) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  user_agent TEXT NULL,
  PRIMARY KEY (id_hash),
  KEY app_sessions_expires_idx (expires_at),
  KEY app_sessions_user_idx (kakao_id),
  CONSTRAINT app_sessions_user_fk FOREIGN KEY (kakao_id) REFERENCES app_users (kakao_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
