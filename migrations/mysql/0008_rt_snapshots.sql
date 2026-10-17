-- astra 5단계(12장) 사전 계산 저장(2026-10-17). 새 표만 추가 — 기존 표·자료는 건드리지 않는다. MySQL 5.6: JSON 형식·CTE·창 함수 없음.
-- 구조화 자료는 검증한 JSON 문자열을 LONGTEXT 에 두고 JS 에서 해석한다. 긴 복합 키 대신 SHA-1(40자) 기본 키, 색인은 191자 제한 안.
-- ns = 이름공간(운영 main / 시험 컨테이너 test) — 같은 DB 를 써도 시험이 운영 스냅샷·게시 이력을 흔들지 않게.

-- 기준 분포(참조 분포) 스냅샷: 지점·시간/일(kind H/D)·참조일·지표·알고리즘판 → 세 기준기간(1990년 이후·최근 10년·최근 5년)의 도수표.
--   H 는 그날 24개 정시를 한 행에(payload = {"0":[3], ..., "23":[3]}), D 는 그날 일 값(payload = [3]).
--   data_rev = 그 지점의 '끝난 해 자료 수정판'(wx_compute_job 의 datarev 행). 끝난 해 자료가 다시 저장되면 판이 바뀌어 다시 만든다.
CREATE TABLE IF NOT EXISTS wx_baseline_snapshot (
  id CHAR(40) NOT NULL,
  ns VARCHAR(8) NOT NULL,
  station_id VARCHAR(16) NOT NULL,
  kind CHAR(1) NOT NULL,
  ref_date DATE NOT NULL,
  metric VARCHAR(16) NOT NULL,
  algo VARCHAR(16) NOT NULL,
  data_rev VARCHAR(40) NOT NULL,
  source_cutoff DATE NOT NULL,
  payload LONGTEXT NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  built_ms BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY wx_bs_station (ns, station_id, ref_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 화면 스냅샷(지점 × 종류 × 기준의 최신 1행): today·forecast·stories·seasons·regions.
--   source_rev = '입력 중 가장 새 자료 시각|계산 시각' — 늦게 끝난 옛 계산이 새 스냅샷을 덮지 않게 이 값이 작으면 쓰지 않는다.
--   payload = API 응답 그대로(JSON), candidates = 후보·제외 사유, sources = 입력 발표·자료 시각
CREATE TABLE IF NOT EXISTS wx_story_snapshot (
  id CHAR(40) NOT NULL,
  ns VARCHAR(8) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  station_id VARCHAR(16) NOT NULL,
  basis_id VARCHAR(8) NOT NULL,
  version BIGINT NOT NULL,
  rules_version VARCHAR(32) NOT NULL,
  schema_version SMALLINT NOT NULL,
  input_fp CHAR(40) NOT NULL,
  source_rev VARCHAR(48) NOT NULL,
  slot VARCHAR(16) NOT NULL,
  published_ms BIGINT NOT NULL,
  expires_ms BIGINT NOT NULL,
  payload LONGTEXT NOT NULL,
  candidates LONGTEXT NULL,
  sources TEXT NULL,
  bytes INT NOT NULL DEFAULT 0,
  build_ms INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY wx_ss_station (ns, station_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 이야기 게시 이력(재시작 뒤에도 반복 방지): 같은 발행 구간(slot)·사건·내용은 한 행(처음 게시 시각 유지)
CREATE TABLE IF NOT EXISTS wx_story_publication (
  id CHAR(40) NOT NULL,
  ns VARCHAR(8) NOT NULL,
  hist_key VARCHAR(32) NOT NULL,
  slot VARCHAR(16) NOT NULL,
  event_id VARCHAR(191) NOT NULL,
  material_hash VARCHAR(64) NOT NULL,
  rule_id VARCHAR(64) NOT NULL,
  topic VARCHAR(32) NULL,
  score DOUBLE NULL,
  reason VARCHAR(255) NULL,
  snapshot_version BIGINT NULL,
  shown_at CHAR(16) NOT NULL,
  last_seen_at CHAR(16) NOT NULL,
  PRIMARY KEY (id),
  KEY wx_sp_key (ns, hist_key, shown_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 가벼운 작업·상태 표: 지점별 사전 계산 작업(pending/running/done/failed)과 지점별 끝난 해 자료 수정판(kind=datarev)
CREATE TABLE IF NOT EXISTS wx_compute_job (
  job_key VARCHAR(64) NOT NULL,
  ns VARCHAR(8) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  station_id VARCHAR(16) NOT NULL,
  status VARCHAR(12) NOT NULL,
  reason VARCHAR(64) NULL,
  source_rev VARCHAR(48) NULL,
  rules_version VARCHAR(32) NULL,
  attempts INT NOT NULL DEFAULT 0,
  input_ms BIGINT NULL,
  lease_until_ms BIGINT NULL,
  started_ms BIGINT NULL,
  completed_ms BIGINT NULL,
  ms INT NULL,
  error VARCHAR(500) NULL,
  PRIMARY KEY (job_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
