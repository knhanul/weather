-- 시간별·일별 날씨 화면의 보기 방식(그리드/카드)과 고른 레이아웃을 로그인 사용자별로 저장 (2026-10-11). 새 테이블만 추가.
-- owner_id = export_layouts.owner_id 와 같은 값. layout_ref = 'preset:<프리셋 id>' 또는 'custom:<내 레이아웃 id>'.
CREATE TABLE IF NOT EXISTS view_prefs (
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hourly', 'daily')),
  view_mode text NOT NULL DEFAULT 'grid' CHECK (view_mode IN ('grid', 'card')),
  layout_ref text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, kind)
);
