// 시간별·일별 날씨 화면의 보기 설정(그리드/카드 + 고른 레이아웃)을 로그인 사용자별로 저장.
// - 비로그인: 401 (화면은 브라우저 localStorage 를 씀)
// - layout 은 'preset:<프리셋 id>'(그 종류의 프리셋만) 또는 'custom:<내 레이아웃 id>'(본인 것만 — 남의 id 는 400) 만 받는다.
import fs from "node:fs";

export const PREFS_PATH = "/api/view-prefs";
export const isPrefsPath = (p) => p === PREFS_PATH;
export const VIEW_MODES = new Set(["grid", "card"]);
const KINDS = ["hourly", "daily"];

const rowOut = (r) => ({ view: VIEW_MODES.has(r.view_mode) ? r.view_mode : "grid", layout: r.layout_ref || null, updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at || null });
const toPrefs = (rows) => {
  const out = {};
  for (const k of KINDS) out[k] = null;
  for (const r of rows) if (KINDS.includes(r.kind)) out[r.kind] = rowOut(r);
  return out;
};

export function createPgPrefsStore(pool) {
  return {
    async get(owner) {
      return toPrefs((await pool.query("SELECT kind, view_mode, layout_ref, updated_at FROM view_prefs WHERE owner_id = $1", [owner])).rows);
    },
    async put(owner, kind, { view, layout }) {
      await pool.query(
        `INSERT INTO view_prefs (owner_id, kind, view_mode, layout_ref, updated_at) VALUES ($1, $2, COALESCE($3, 'grid'), $4, now())
         ON CONFLICT (owner_id, kind) DO UPDATE SET view_mode = COALESCE($3, view_prefs.view_mode),
           layout_ref = CASE WHEN $5::boolean THEN $4 ELSE view_prefs.layout_ref END, updated_at = now()`,
        [owner, kind, view ?? null, layout ?? null, layout !== undefined],
      );
      return (await this.get(owner))[kind];
    },
  };
}
export function createMysqlPrefsStore(h) {
  return {
    async get(owner) {
      return toPrefs(await h.read("SELECT kind, view_mode, layout_ref, updated_at FROM view_prefs WHERE owner_id = ?", [owner]));
    },
    async put(owner, kind, { view, layout }) {
      await h.query(
        `INSERT INTO view_prefs (owner_id, kind, view_mode, layout_ref, updated_at) VALUES (?, ?, ?, ?, NOW(6))
         ON DUPLICATE KEY UPDATE view_mode = IF(? IS NULL, view_mode, VALUES(view_mode)), layout_ref = IF(?, VALUES(layout_ref), layout_ref), updated_at = NOW(6)`,
        [owner, kind, view ?? "grid", layout ?? null, view ?? null, layout !== undefined ? 1 : 0],
      );
      return (await this.get(owner))[kind];
    },
  };
}
export function createJsonPrefsStore(file) {
  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  };
  return {
    async get(owner) {
      return toPrefs(load().filter((r) => r.owner_id === owner));
    },
    async put(owner, kind, { view, layout }) {
      const all = load();
      let r = all.find((x) => x.owner_id === owner && x.kind === kind);
      if (!r) all.push((r = { owner_id: owner, kind, view_mode: "grid", layout_ref: null }));
      if (view) r.view_mode = view;
      if (layout !== undefined) r.layout_ref = layout;
      r.updated_at = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(all, null, 2));
      return rowOut(r);
    },
  };
}

// presetIds(kind) → Set of preset ids; layoutStore.get(owner, id) → 본인 레이아웃 또는 null
export async function handlePrefs(req, res, url, { store, layoutStore, ownerOf, presetIds, readBody, json }) {
  if (!isPrefsPath(url.pathname)) return false;
  const owner = await ownerOf(req);
  if (!owner) return json(res, { ok: false, auth: "login", message: "로그인하면 보기 설정이 내 계정에 저장됩니다." }, 401), true;
  if (!store) return json(res, { ok: false, message: "보기 설정 저장소를 쓸 수 없습니다." }, 503), true;
  if (req.method === "GET") return json(res, { ok: true, prefs: await store.get(owner) }), true;
  if (req.method !== "PUT" && req.method !== "POST") return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
  const body = await readBody(req);
  const kind = String(body.kind || "");
  if (!KINDS.includes(kind)) return json(res, { ok: false, message: "kind 는 hourly 또는 daily 입니다." }, 400), true;
  const patch = {};
  if (body.view !== undefined) {
    if (!VIEW_MODES.has(body.view)) return json(res, { ok: false, message: "view 는 grid 또는 card 입니다." }, 400), true;
    patch.view = body.view;
  }
  if (body.layout !== undefined) {
    const v = body.layout === null ? null : String(body.layout);
    if (v !== null) {
      const m = /^(preset|custom):(.{1,64})$/.exec(v);
      if (!m) return json(res, { ok: false, message: "layout 형식이 맞지 않습니다." }, 400), true;
      if (m[1] === "preset" && !presetIds(kind).has(m[2])) return json(res, { ok: false, message: "이 종류의 프리셋이 아닙니다." }, 400), true;
      if (m[1] === "custom") {
        const l = layoutStore ? await layoutStore.get(owner, m[2]) : null; // 본인 것만 찾힌다
        if (!l || l.kind !== kind) return json(res, { ok: false, message: "내 레이아웃이 아니거나 종류가 다릅니다." }, 400), true;
      }
    }
    patch.layout = v;
  }
  if (!("view" in patch) && !("layout" in patch)) return json(res, { ok: false, message: "바꿀 값(view, layout)이 없습니다." }, 400), true;
  return json(res, { ok: true, kind, pref: await store.put(owner, kind, patch) }), true;
}
