-- 기상청 중기예보 적재(2026-10-13). 새 표만 추가.
-- 지점 → 중기 구역(앱 시작 때 kma-mid.mjs MID_REGIONS 로 비어 있는 지점만 채움)
CREATE TABLE IF NOT EXISTS kma_mid_regions (
  station_id VARCHAR(16) NOT NULL,
  mid_stn_id VARCHAR(8) NOT NULL,
  land_reg_id VARCHAR(16) NOT NULL,
  ta_reg_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 발표마다 보관: 키 = (종류, 구역, 발표시각 tm_fc KST, 항목 원래 이름). metric/day_offset/ampm 은 item_key 를 나눈 것(wf4Am → wf, 4, Am). 값은 문자열 그대로.
CREATE TABLE IF NOT EXISTS kma_mid_items (
  dataset VARCHAR(32) NOT NULL,
  region_id VARCHAR(16) NOT NULL,
  tm_fc DATETIME NOT NULL,
  item_key VARCHAR(32) NOT NULL,
  metric VARCHAR(32) NOT NULL,
  day_offset TINYINT NULL,
  ampm VARCHAR(2) NOT NULL DEFAULT '',
  value TEXT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset, region_id, tm_fc, item_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 다 받은 발표 + 원문(item JSON 한 개). 구역별 최신 발표 = (dataset, region_id) 의 MAX(tm_fc), 기본 키로 찾는다.
CREATE TABLE IF NOT EXISTS kma_mid_releases (
  dataset VARCHAR(32) NOT NULL,
  region_id VARCHAR(16) NOT NULL,
  tm_fc DATETIME NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  raw TEXT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset, region_id, tm_fc),
  KEY kma_mid_releases_tm (dataset, tm_fc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
