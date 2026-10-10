-- 시간별·일별 날씨 화면의 보기 방식(그리드/카드)과 고른 레이아웃을 로그인 사용자별로 저장 (2026-10-11). 새 테이블만 추가.
-- owner_id = export_layouts.owner_id 와 같은 값. layout_ref = 'preset:<프리셋 id>' 또는 'custom:<내 레이아웃 id>'. 기본 키 길이 (160+16)×4 = 704바이트 ≤ 767.
CREATE TABLE IF NOT EXISTS view_prefs (
  owner_id VARCHAR(160) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  view_mode VARCHAR(8) NOT NULL DEFAULT 'grid',
  layout_ref VARCHAR(100) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (owner_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
