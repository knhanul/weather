-- 로그인 사용자의 기본 관측지점(지점 번호만). 위치·좌표는 저장하지 않는다 (2026-10-11). 새 테이블만 추가.
CREATE TABLE IF NOT EXISTS station_prefs (
  owner_id text PRIMARY KEY,
  station_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
