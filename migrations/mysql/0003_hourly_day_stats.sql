-- 미적재 현황(/api/gaps)의 지점·일자별 시각 수 요약(2026-10-11). 1100일 × 8개 지점을 원본에서 세면 NAS 에서 12초.
-- n = 그날 서로 다른 시각(13자 'YYYY-MM-DD HH') 수, n_rows = 행 수. 저장 때 건드린 지점·월의 날만 다시 센다.
CREATE TABLE IF NOT EXISTS hourly_day_stats (
  station_id VARCHAR(16) NOT NULL,
  d CHAR(10) NOT NULL,
  n INT NOT NULL,
  n_rows INT NOT NULL,
  PRIMARY KEY (station_id, d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
