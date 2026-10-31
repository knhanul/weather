-- 특정일 캘린더(수능일·학력고사일·설날·추석 등) 저장 (2026-11-01). 새 표만 추가 — 기존 표·자료는 건드리지 않는다.
-- 왜 표로 두나: 수능일처럼 해마다 달라지는 날은 규칙으로 계산할 수 없어 실제 시행일을 행으로 쌓고, 관리 화면에서 고칠 수 있어야 한다.
-- 음력 명절(설날·추석)은 날짜를 박지 않고 규칙(year NULL, cal='lunar', month/day)으로 저장한다 — 실제 양력 날짜는 조회할 때
-- calendar-resolver.mjs 가 계산한다(표를 매년 손으로 고치지 않아도 되고, 음력 표가 바뀌면 자동으로 따라간다).
-- year = NULL 이면 '해마다 되풀이되는 규칙', 값이 있으면 '그 해 한 번뿐인 날'(예: 2027학년도 수능 = 2026-11-19).
-- MySQL 5.6: 생성 열·CHECK 제약·부분 인덱스 없음, PK 는 767바이트 이하 → id VARCHAR(40) 단일 PK.
-- year·kind 색인은 연도 필터·종류 필터에 쓴다(행 수가 적어도 화면이 매번 전체를 훑지 않게).
CREATE TABLE IF NOT EXISTS calendar_events (
  id VARCHAR(40) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  label VARCHAR(120) NOT NULL,
  cal VARCHAR(8) NOT NULL DEFAULT 'solar',
  `month` TINYINT NOT NULL,
  `day` TINYINT NOT NULL,
  leap TINYINT(1) NOT NULL DEFAULT 0,
  `year` SMALLINT NULL,
  year_label VARCHAR(24) NULL,
  note VARCHAR(255) NULL,
  source VARCHAR(12) NOT NULL DEFAULT 'admin',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY cal_ev_year (`year`),
  KEY cal_ev_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
