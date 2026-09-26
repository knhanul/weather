// 카카오 로그인 사용자·세션 저장소. Postgres(운영) 또는 JSON 파일(로컬 개발) 두 가지 구현이 같은 메서드를 가진다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATUSES = ["pending", "approved", "blocked"];

const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
function userOut(r) {
  if (!r) return null;
  return {
    kakao_id: String(r.kakao_id),
    nickname: r.nickname ?? null,
    profile_image: r.profile_image ?? null,
    status: r.status,
    created_at: iso(r.created_at),
    last_login_at: iso(r.last_login_at),
    status_changed_at: iso(r.status_changed_at),
    status_changed_by: r.status_changed_by ?? null,
  };
}

export function createPgStore(pool) {
  return {
    kind: "postgresql",
    async ensureSchema() {
      await pool.query(fs.readFileSync(path.join(__dirname, "auth-schema.sql"), "utf8"));
    },
    async upsertLogin({ kakaoId, nickname, profileImage }) {
      const r = await pool.query(
        `INSERT INTO app_users (kakao_id, nickname, profile_image, status, created_at, last_login_at)
         VALUES ($1, $2, $3, 'pending', now(), now())
         ON CONFLICT (kakao_id) DO UPDATE SET
           nickname = EXCLUDED.nickname, profile_image = EXCLUDED.profile_image, last_login_at = now()
         RETURNING *`,
        [kakaoId, nickname, profileImage],
      );
      return userOut(r.rows[0]);
    },
    async getUser(kakaoId) {
      const r = await pool.query(`SELECT * FROM app_users WHERE kakao_id = $1`, [kakaoId]);
      return userOut(r.rows[0]);
    },
    async listUsers() {
      const r = await pool.query(`SELECT * FROM app_users ORDER BY (status = 'pending') DESC, last_login_at DESC NULLS LAST, created_at DESC`);
      return r.rows.map(userOut);
    },
    async setStatus(kakaoId, status, by) {
      if (!STATUSES.includes(status)) throw new Error("bad status");
      const r = await pool.query(
        `UPDATE app_users SET status = $2, status_changed_at = now(), status_changed_by = $3 WHERE kakao_id = $1 RETURNING *`,
        [kakaoId, status, by || null],
      );
      if (r.rows[0] && status === "blocked") await pool.query(`DELETE FROM app_sessions WHERE kakao_id = $1`, [kakaoId]);
      return userOut(r.rows[0]);
    },
    async createSession({ idHash, kakaoId, expiresAt, userAgent }) {
      await pool.query(
        `INSERT INTO app_sessions (id_hash, kakao_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
        [idHash, kakaoId, expiresAt, userAgent || null],
      );
    },
    async getSession(idHash) {
      const r = await pool.query(
        `SELECT s.expires_at, u.* FROM app_sessions s JOIN app_users u ON u.kakao_id = s.kakao_id
         WHERE s.id_hash = $1 AND s.expires_at > now()`,
        [idHash],
      );
      const row = r.rows[0];
      return row ? { expires_at: iso(row.expires_at), user: userOut(row) } : null;
    },
    async deleteSession(idHash) {
      await pool.query(`DELETE FROM app_sessions WHERE id_hash = $1`, [idHash]);
    },
    async deleteExpired() {
      const r = await pool.query(`DELETE FROM app_sessions WHERE expires_at <= now()`);
      return r.rowCount || 0;
    },
  };
}

// 로컬 개발용(DATABASE_URL 없음). 파일 권한 600, 임시 파일에 쓴 뒤 교체.
export function createJsonStore(file) {
  const load = () => {
    try {
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      return { users: d.users || {}, sessions: d.sessions || {} };
    } catch {
      return { users: {}, sessions: {} };
    }
  };
  const save = (d) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const now = () => new Date().toISOString();
  return {
    kind: "json",
    async ensureSchema() {},
    async upsertLogin({ kakaoId, nickname, profileImage }) {
      const d = load();
      const u = d.users[kakaoId] || { kakao_id: kakaoId, status: "pending", created_at: now() };
      Object.assign(u, { nickname, profile_image: profileImage, last_login_at: now() });
      d.users[kakaoId] = u;
      save(d);
      return userOut(u);
    },
    async getUser(kakaoId) {
      return userOut(load().users[kakaoId]);
    },
    async listUsers() {
      return Object.values(load().users)
        .sort((a, b) => (b.status === "pending") - (a.status === "pending") || String(b.last_login_at || "").localeCompare(String(a.last_login_at || "")))
        .map(userOut);
    },
    async setStatus(kakaoId, status, by) {
      if (!STATUSES.includes(status)) throw new Error("bad status");
      const d = load();
      const u = d.users[kakaoId];
      if (!u) return null;
      Object.assign(u, { status, status_changed_at: now(), status_changed_by: by || null });
      if (status === "blocked") for (const [h, s] of Object.entries(d.sessions)) if (s.kakao_id === kakaoId) delete d.sessions[h];
      save(d);
      return userOut(u);
    },
    async createSession({ idHash, kakaoId, expiresAt, userAgent }) {
      const d = load();
      d.sessions[idHash] = { kakao_id: kakaoId, created_at: now(), expires_at: iso(expiresAt), user_agent: userAgent || null };
      save(d);
    },
    async getSession(idHash) {
      const d = load();
      const s = d.sessions[idHash];
      if (!s || Date.parse(s.expires_at) <= Date.now() || !d.users[s.kakao_id]) return null;
      return { expires_at: s.expires_at, user: userOut(d.users[s.kakao_id]) };
    },
    async deleteSession(idHash) {
      const d = load();
      if (d.sessions[idHash]) {
        delete d.sessions[idHash];
        save(d);
      }
    },
    async deleteExpired() {
      const d = load();
      let n = 0;
      for (const [h, s] of Object.entries(d.sessions)) if (Date.parse(s.expires_at) <= Date.now()) { delete d.sessions[h]; n += 1; }
      if (n) save(d);
      return n;
    },
  };
}
