-- 카카오 로그인 사용자·세션 (KAKAO_REST_API_KEY·KAKAO_CLIENT_SECRET이 설정된 경우에만 서버 시작 시 생성)
CREATE TABLE IF NOT EXISTS app_users (
  kakao_id text PRIMARY KEY,
  nickname text,
  profile_image text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  status_changed_at timestamptz,
  status_changed_by text
);

-- 세션 id 원문은 쿠키에만 있고, DB에는 HMAC-SHA256 해시만 저장한다.
CREATE TABLE IF NOT EXISTS app_sessions (
  id_hash text PRIMARY KEY,
  kakao_id text NOT NULL REFERENCES app_users (kakao_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text
);
CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions (expires_at);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (kakao_id);
