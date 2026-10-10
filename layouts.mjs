// 다운로드 레이아웃(컬럼 구성) — 로그인 사용자별 저장. 다른 사용자의 레이아웃은 id 를 알아도 읽거나 바꿀 수 없다(404).
// 기본 프리셋(EXPORT_PRESETS)은 코드에 있는 읽기 전용 공용 구성이며 여기서 다루지 않는다.
import crypto from "node:crypto";
import fs from "node:fs";

export const LAYOUT_LIMIT = 50; // 사용자·종류 합계
export const NAME_MAX = 30;
const KINDS = new Set(["hourly", "daily"]);
const ID_RE = /^lay_[A-Za-z0-9_-]{8,40}$/;
export const LAYOUT_PATH = "/api/export/layouts";
export const isLayoutPath = (p) => p === LAYOUT_PATH || p.startsWith(`${LAYOUT_PATH}/`);

const newId = () => `lay_${crypto.randomBytes(12).toString("base64url")}`;
const out = (r) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  columns: Array.isArray(r.columns) ? r.columns : [],
  isDefault: Boolean(r.is_default),
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
});

export function createPgLayoutStore(pool) {
  return {
    kind: "postgresql",
    async list(owner) {
      const { rows } = await pool.query("SELECT * FROM export_layouts WHERE owner_id = $1 ORDER BY kind, created_at, id", [owner]);
      return rows.map(out);
    },
    async count(owner) {
      return Number((await pool.query("SELECT count(*)::int n FROM export_layouts WHERE owner_id = $1", [owner])).rows[0].n);
    },
    async get(owner, id) {
      const { rows } = await pool.query("SELECT * FROM export_layouts WHERE id = $1 AND owner_id = $2", [id, owner]);
      return rows[0] ? out(rows[0]) : null;
    },
    async create(owner, { kind, name, columns, isDefault }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (isDefault) await client.query("UPDATE export_layouts SET is_default = false, updated_at = now() WHERE owner_id = $1 AND kind = $2 AND is_default", [owner, kind]);
        const { rows } = await client.query(
          "INSERT INTO export_layouts (id, owner_id, kind, name, columns, is_default) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING *",
          [newId(), owner, kind, name, JSON.stringify(columns), Boolean(isDefault)],
        );
        await client.query("COMMIT");
        return out(rows[0]);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async update(owner, id, { name, columns, isDefault }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cur = (await client.query("SELECT * FROM export_layouts WHERE id = $1 AND owner_id = $2 FOR UPDATE", [id, owner])).rows[0];
        if (!cur) {
          await client.query("ROLLBACK");
          return null;
        }
        if (isDefault === true) await client.query("UPDATE export_layouts SET is_default = false, updated_at = now() WHERE owner_id = $1 AND kind = $2 AND is_default AND id <> $3", [owner, cur.kind, id]);
        const { rows } = await client.query(
          `UPDATE export_layouts SET name = COALESCE($3, name), columns = COALESCE($4::jsonb, columns),
             is_default = COALESCE($5, is_default), updated_at = now() WHERE id = $1 AND owner_id = $2 RETURNING *`,
          [id, owner, name ?? null, columns ? JSON.stringify(columns) : null, typeof isDefault === "boolean" ? isDefault : null],
        );
        await client.query("COMMIT");
        return out(rows[0]);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async remove(owner, id) {
      return (await pool.query("DELETE FROM export_layouts WHERE id = $1 AND owner_id = $2", [id, owner])).rowCount > 0;
    },
  };
}

// 로컬 개발(DATABASE_URL 없음)용 JSON 파일 저장소
export function createJsonLayoutStore(file) {
  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  };
  const save = (all) => fs.writeFileSync(file, JSON.stringify(all, null, 2));
  const now = () => new Date().toISOString();
  return {
    kind: "json",
    async list(owner) {
      return load().filter((r) => r.owner_id === owner).map(out);
    },
    async count(owner) {
      return load().filter((r) => r.owner_id === owner).length;
    },
    async get(owner, id) {
      const r = load().find((x) => x.id === id && x.owner_id === owner);
      return r ? out(r) : null;
    },
    async create(owner, { kind, name, columns, isDefault }) {
      const all = load();
      if (isDefault) for (const r of all) if (r.owner_id === owner && r.kind === kind) r.is_default = false;
      const r = { id: newId(), owner_id: owner, kind, name, columns, is_default: Boolean(isDefault), created_at: now(), updated_at: now() };
      all.push(r);
      save(all);
      return out(r);
    },
    async update(owner, id, { name, columns, isDefault }) {
      const all = load();
      const r = all.find((x) => x.id === id && x.owner_id === owner);
      if (!r) return null;
      if (isDefault === true) for (const x of all) if (x.owner_id === owner && x.kind === r.kind && x.id !== id) x.is_default = false;
      if (name != null) r.name = name;
      if (columns) r.columns = columns;
      if (typeof isDefault === "boolean") r.is_default = isDefault;
      r.updated_at = now();
      save(all);
      return out(r);
    },
    async remove(owner, id) {
      const all = load();
      const next = all.filter((x) => !(x.id === id && x.owner_id === owner));
      if (next.length === all.length) return false;
      save(next);
      return true;
    },
  };
}

function cleanName(v) {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!s) return { error: "레이아웃 이름을 입력해 주세요." };
  if ([...s].length > NAME_MAX) return { error: `레이아웃 이름은 ${NAME_MAX}자까지입니다.` };
  return { value: s };
}
function cleanColumns(v, kind, allowedKeys) {
  if (!Array.isArray(v) || v.length === 0) return { error: "컬럼을 1개 이상 고르세요." };
  const allowed = allowedKeys(kind);
  const seen = new Set();
  const cols = [];
  for (const c of v) {
    const k = String(c);
    if (!allowed.has(k)) return { error: `알 수 없는 컬럼: ${k.slice(0, 40)}` };
    if (!seen.has(k)) {
      seen.add(k);
      cols.push(k);
    }
  }
  return { value: cols };
}

// 레이아웃 API 처리. 처리했으면 true. ownerOf(req) → 로그인 사용자의 owner id (없으면 null).
// 쓰기 요청의 같은 사이트(CSRF)·차단 계정 검사는 auth.guard 가 먼저 한다.
export async function handleLayouts(req, res, url, { store, ownerOf, allowedKeys, readBody, json }) {
  if (!isLayoutPath(url.pathname)) return false;
  const owner = await ownerOf(req);
  if (!owner) return json(res, { ok: false, auth: "login", message: "로그인하면 나만의 레이아웃을 저장할 수 있습니다." }, 401), true;
  if (!store) return json(res, { ok: false, message: "레이아웃 저장소를 쓸 수 없습니다." }, 503), true;
  const rest = url.pathname.slice(LAYOUT_PATH.length); // "" | "/<id>" | "/<id>/default"
  const m = /^\/([^/]+)(\/default)?$/.exec(rest);
  if (rest === "" || rest === "/") {
    if (req.method === "GET") return json(res, { ok: true, layouts: await store.list(owner), limit: LAYOUT_LIMIT }), true;
    if (req.method === "POST") {
      const body = await readBody(req);
      const kind = String(body.kind || "");
      if (!KINDS.has(kind)) return json(res, { ok: false, message: "kind 는 hourly 또는 daily 입니다." }, 400), true;
      const n = cleanName(body.name);
      if (n.error) return json(res, { ok: false, message: n.error }, 400), true;
      const c = cleanColumns(body.columns, kind, allowedKeys);
      if (c.error) return json(res, { ok: false, message: c.error }, 400), true;
      if ((await store.count(owner)) >= LAYOUT_LIMIT) return json(res, { ok: false, message: `레이아웃은 ${LAYOUT_LIMIT}개까지 저장할 수 있습니다.` }, 400), true;
      const layout = await store.create(owner, { kind, name: n.value, columns: c.value, isDefault: body.isDefault === true });
      return json(res, { ok: true, layout }, 201), true;
    }
    return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
  }
  if (!m || !ID_RE.test(m[1])) return json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
  const id = m[1];
  if (m[2]) {
    if (req.method !== "POST") return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
    const body = await readBody(req);
    const layout = await store.update(owner, id, { isDefault: body.isDefault !== false });
    return layout ? json(res, { ok: true, layout }) : json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
  }
  if (req.method === "GET") {
    const layout = await store.get(owner, id);
    return layout ? json(res, { ok: true, layout }) : json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
  }
  if (req.method === "PATCH" || req.method === "PUT") {
    const cur = await store.get(owner, id);
    if (!cur) return json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
    const body = await readBody(req);
    const patch = {};
    if (body.name !== undefined) {
      const n = cleanName(body.name);
      if (n.error) return json(res, { ok: false, message: n.error }, 400), true;
      patch.name = n.value;
    }
    if (body.columns !== undefined) {
      const c = cleanColumns(body.columns, cur.kind, allowedKeys);
      if (c.error) return json(res, { ok: false, message: c.error }, 400), true;
      patch.columns = c.value;
    }
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    const layout = await store.update(owner, id, patch);
    return layout ? json(res, { ok: true, layout }) : json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
  }
  if (req.method === "DELETE") {
    return (await store.remove(owner, id)) ? json(res, { ok: true }) : json(res, { ok: false, message: "레이아웃을 찾을 수 없습니다." }, 404), true;
  }
  return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
}
