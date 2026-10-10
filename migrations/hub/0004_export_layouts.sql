-- 다운로드 레이아웃(컬럼 구성)을 로그인 사용자별로 저장 (2026-10-10). 새 테이블만 추가.
-- owner_id = app_users.kakao_id 와 같은 값 (누니 ID 모드: 'nuni:<누니 회원 ID>'). 개인정보는 저장하지 않는다.
CREATE TABLE IF NOT EXISTS export_layouts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hourly', 'daily')),
  name text NOT NULL,
  columns jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_layouts_owner_idx ON export_layouts (owner_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS export_layouts_one_default_idx ON export_layouts (owner_id, kind) WHERE is_default;
