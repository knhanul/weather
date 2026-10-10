-- 대시보드 전체 집계(개수·coverage·지점 요약)용 요약표. 2026-10-11: 백필 뒤 시간자료 250만 행을 매번 훑으면(NAS 5.6, 버퍼 풀 128MB) 5~90초.
-- 지점×월×dataset 한 행. 쓰기 때 건드린 지점·월만 다시 센다(앱 db-mysql.mjs). hours = 그 지점·월의 서로 다른 시각(16자) 수(모든 dataset 합쳐서, 같은 값이 dataset 행마다).
CREATE TABLE IF NOT EXISTS hourly_month_stats (
  station_id VARCHAR(16) NOT NULL,
  ym CHAR(7) NOT NULL,
  dataset VARCHAR(32) NOT NULL,
  n_rows INT NOT NULL,
  hours INT NOT NULL,
  first_dt VARCHAR(32) NOT NULL,
  last_dt VARCHAR(32) NOT NULL,
  PRIMARY KEY (station_id, ym, dataset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS daily_station_stats (
  station_id VARCHAR(16) NOT NULL PRIMARY KEY,
  n_rows INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 요약표가 다 만들어졌는지(앱이 처음 시작할 때 지점별로 채우고 기록). 없으면 예전 전체 집계로 답한다.
CREATE TABLE IF NOT EXISTS hub_stats_meta (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  built_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
