-- 로그인 사용자의 기본 관측지점(지점 번호만). 위치·좌표는 저장하지 않는다 (2026-10-11). 새 테이블만 추가.
CREATE TABLE IF NOT EXISTS station_prefs (
  owner_id VARCHAR(160) NOT NULL,
  station_id VARCHAR(16) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
