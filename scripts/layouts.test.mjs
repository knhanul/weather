// 다운로드 레이아웃: 로그인 사용자별 저장, 다른 사용자 것은 id 를 알아도 읽기·수정·삭제 불가(404). + 자료수집 지점 변경 시 날짜 유지.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "../auth.mjs";
import { createJsonStore } from "../auth-store.mjs";
import { handleLayouts, createJsonLayoutStore, LAYOUT_LIMIT } from "../layouts.mjs";
import { getExportCatalog } from "../kma-fields.mjs";

const SECRET = "layout-test-session-secret-0123456789abcdef";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "layouts-"));
let srv, base, store;
const tokens = {};
const keys = (kind) => new Set(getExportCatalog(kind, { fullFields: true }).map((c) => c.key));
const H = getExportCatalog("hourly").map((c) => c.key);

before(async () => {
  store = createJsonStore(path.join(tmp, "auth.json"));
  const auth = createAuth({ env: { KAKAO_REST_API_KEY: "k", KAKAO_CLIENT_SECRET: "s", SESSION_SECRET: SECRET, COOKIE_SECURE: "0" }, store, log: () => {} });
  const layoutStore = createJsonLayoutStore(path.join(tmp, "layouts.json"));
  for (const [name, status] of [["a", "pending"], ["b", "approved"], ["c", "blocked"]]) {
    const kakaoId = `9000${name.charCodeAt(0)}`;
    await store.upsertLogin({ kakaoId, nickname: name, profileImage: null });
    if (status !== "pending") await store.setStatus(kakaoId, status, "test");
    const token = crypto.randomBytes(24).toString("base64url");
    const idHash = crypto.createHmac("sha256", SECRET).update(`session:${token}`).digest("base64url");
    await store.createSession({ idHash, kakaoId, expiresAt: new Date(Date.now() + 3600000) });
    tokens[name] = token;
  }
  const json = (res, d, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(d)); };
  const readBody = async (req) => { let b = ""; for await (const c of req) b += c; try { return JSON.parse(b || "{}"); } catch { return {}; } };
  srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const denied = await auth.guard(req, url);
    if (denied) return json(res, denied.body, denied.status);
    if (await handleLayouts(req, res, url, { store: layoutStore, ownerOf: (r) => auth.ownerOf(r), allowedKeys: keys, readBody, json })) return;
    json(res, { ok: false }, 404);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

async function call(who, method, p, body, { origin = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (who) headers.cookie = `nw_session=${tokens[who]}`;
  if (origin) headers.origin = base;
  const r = await fetch(base + "/api/export/layouts" + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

test("anonymous: list 401, create 401, no csrf bypass", async () => {
  assert.equal((await call(null, "GET", "")).status, 401);
  assert.equal((await call(null, "POST", "", { kind: "hourly", name: "x", columns: H.slice(0, 3) })).status, 401);
  assert.equal((await call("b", "POST", "", { kind: "hourly", name: "x", columns: H.slice(0, 3) }, { origin: false })).data.auth, "csrf");
});

test("each user sees and edits only their own layouts", async () => {
  const a1 = await call("a", "POST", "", { kind: "hourly", name: "A 기온", columns: H.slice(0, 4) });
  assert.equal(a1.status, 201); // 승인 대기 사용자도 개인 레이아웃은 저장 가능(관리 권한 불필요)
  const id = a1.data.layout.id;
  const b1 = await call("b", "POST", "", { kind: "hourly", name: "B 전체", columns: H.slice(0, 2), isDefault: true });
  assert.equal(b1.status, 201);
  assert.deepEqual((await call("a", "GET", "")).data.layouts.map((l) => l.name), ["A 기온"]);
  assert.deepEqual((await call("b", "GET", "")).data.layouts.map((l) => l.name), ["B 전체"]);
  // B 가 A 의 id 로 접근 → 404 (존재 여부도 알려주지 않음)
  assert.equal((await call("b", "GET", `/${id}`)).status, 404);
  assert.equal((await call("b", "PATCH", `/${id}`, { name: "hijack" })).status, 404);
  assert.equal((await call("b", "POST", `/${id}/default`, {})).status, 404);
  assert.equal((await call("b", "DELETE", `/${id}`)).status, 404);
  assert.equal((await call("a", "GET", `/${id}`)).data.layout.name, "A 기온");
  // 본인: 이름 변경·컬럼 수정·기본 지정·삭제
  assert.equal((await call("a", "PATCH", `/${id}`, { name: "A 새이름", columns: H.slice(0, 5) })).data.layout.columns.length, 5);
  const a2 = (await call("a", "POST", "", { kind: "hourly", name: "A 둘째", columns: H.slice(0, 3), isDefault: true })).data.layout;
  assert.equal((await call("a", "POST", `/${id}/default`, {})).data.layout.isDefault, true);
  const list = (await call("a", "GET", "")).data.layouts;
  assert.deepEqual(list.filter((l) => l.isDefault).map((l) => l.id), [id]); // 종류별 기본은 하나
  assert.equal(list.find((l) => l.id === a2.id).isDefault, false);
  assert.equal((await call("a", "POST", `/${id}/default`, { isDefault: false })).data.layout.isDefault, false);
  assert.equal((await call("a", "DELETE", `/${a2.id}`)).status, 200);
  assert.equal((await call("a", "GET", `/${a2.id}`)).status, 404);
  // B 의 기본은 영향 없음
  assert.equal((await call("b", "GET", "")).data.layouts[0].isDefault, true);
});

test("blocked user is refused; validation", async () => {
  assert.equal((await call("c", "GET", "")).status, 401);
  assert.equal((await call("c", "POST", "", { kind: "hourly", name: "x", columns: H.slice(0, 2) })).status, 403);
  assert.equal((await call("b", "POST", "", { kind: "weekly", name: "x", columns: H.slice(0, 2) })).status, 400);
  assert.equal((await call("b", "POST", "", { kind: "hourly", name: "", columns: H.slice(0, 2) })).status, 400);
  assert.equal((await call("b", "POST", "", { kind: "hourly", name: "x".repeat(31), columns: H.slice(0, 2) })).status, 400);
  assert.equal((await call("b", "POST", "", { kind: "hourly", name: "x", columns: [] })).status, 400);
  assert.equal((await call("b", "POST", "", { kind: "hourly", name: "x", columns: ["drop table"] })).status, 400);
  assert.equal((await call("b", "GET", "/../../etc")).status, 404);
  assert.ok(LAYOUT_LIMIT >= 10);
});

test("자료수집: 지점 변경은 시작·종료를 바꾸지 않는다", () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "index.html"), "utf8");
  const m = /\$\("cStation"\)\.addEventListener\("change",\s*([A-Za-z_$][\w$]*)\)/.exec(html);
  assert.ok(m, "cStation change listener");
  assert.notEqual(m[1], "applyCollectDefaults");
  const fn = new RegExp(`function ${m[1]}\\(\\)\\s*\\{([\\s\\S]*?)\\n    \\}`).exec(html);
  assert.ok(fn, "listener body");
  assert.doesNotMatch(fn[1], /cFrom|cTo|applyCollectDefaults/);
  // 주소로 지점이 넘어와도 사용자가 고친 구간은 유지
  assert.match(html, /if \(changed && !collectDatesTouched\) applyCollectDefaults\(\);/);
});
