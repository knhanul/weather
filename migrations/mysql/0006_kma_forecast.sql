-- 기상청 단기예보 조회서비스 적재(2026-10-12). 새 테이블만 추가(기존 표 변경 없음). 격자 nx,ny 칸은 db-mysql.mjs 가 weather_stations 에 추가(5.6 은 ADD COLUMN IF NOT EXISTS 가 없음).
-- 발표마다 보관: 키 = (격자, 발표시각, 예보시각, 항목). 값은 문자열 그대로(강수없음 등), raw 는 기상청 item 원문 JSON.
CREATE TABLE IF NOT EXISTS kma_vilage_fcst (
  nx SMALLINT NOT NULL,
  ny SMALLINT NOT NULL,
  base_datetime DATETIME NOT NULL,
  fcst_datetime DATETIME NOT NULL,
  category VARCHAR(8) NOT NULL,
  fcst_value VARCHAR(32) NULL,
  raw TEXT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nx, ny, base_datetime, fcst_datetime, category),
  KEY kma_vilage_fcst_target (nx, ny, fcst_datetime, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS kma_ultra_fcst (
  nx SMALLINT NOT NULL,
  ny SMALLINT NOT NULL,
  base_datetime DATETIME NOT NULL,
  fcst_datetime DATETIME NOT NULL,
  category VARCHAR(8) NOT NULL,
  fcst_value VARCHAR(32) NULL,
  raw TEXT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nx, ny, base_datetime, fcst_datetime, category),
  KEY kma_ultra_fcst_target (nx, ny, fcst_datetime, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS kma_ultra_ncst (
  nx SMALLINT NOT NULL,
  ny SMALLINT NOT NULL,
  base_datetime DATETIME NOT NULL,
  category VARCHAR(8) NOT NULL,
  obsr_value VARCHAR(32) NULL,
  raw TEXT NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nx, ny, base_datetime, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 다 받은 발표 기록(격자별). 지점별 최신 발표 = 이 표에서 (dataset, nx, ny) 의 MAX(base_datetime) — 기본 키로 바로 찾는다.
CREATE TABLE IF NOT EXISTS kma_fcst_releases (
  dataset VARCHAR(32) NOT NULL,
  nx SMALLINT NOT NULL,
  ny SMALLINT NOT NULL,
  base_datetime DATETIME NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset, nx, ny, base_datetime),
  KEY kma_fcst_releases_base (dataset, base_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
