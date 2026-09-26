// 누니 ID(OIDC) 로그인 모드 테스트 — 가짜 OIDC 제공자(서명 키·JWKS·token)를 띄워 auth.mjs 를 검증한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuth } from "../auth.mjs";
import { createJsonStore } from "../auth-store.mjs";

const CLIENT = { id: "nuni-weather-web", secret: "nuni_cs_weather_test_secret_0123456789abcdef" };
const SUB = { admin: "0190a000-0000-7000-8000-000000000001", viewer: "0190a000-0000-7000-8000-000000000002", padmin: "0190a000-0000-7000-8000-000000000003" };
const b64u = (b) => Buffer.from(b).toString("base64url");
let op, app, tmp;

function startOp() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const kid = "test-kid-1";
  const codes = new Map();
  const state = { claims: {}, tamper: null, revoked: [], tokenCalls: 0 };
  const sign = (payload, key = privateKey) => {
    const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
    const p = b64u(JSON.stringify(payload));
    return `${h}.${p}.${b64u(crypto.sign("sha256", Buffer.from(`${h}.${p}`), key))}`;
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://op");
    const iss = state.base;
    const j = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/.well-known/openid-configuration") return j(200, { issuer: iss, authorization_endpoint: `${iss}/oauth/authorize`, token_endpoint: `${iss}/oauth/token`, jwks_uri: `${iss}/.well-known/jwks.json`, end_session_endpoint: `${iss}/oauth/end_session`, revocation_endpoint: `${iss}/oauth/revoke` });
    if (url.pathname === "/.well-known/jwks.json") return j(200, { keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid, n: jwk.n, e: jwk.e }] });
    if (url.pathname === "/oauth/authorize") {
      const q = url.searchParams;
      assert.equal(q.get("code_challenge_method"), "S256");
      const code = crypto.randomBytes(16).toString("hex");
      codes.set(code, { challenge: q.get("code_challenge"), nonce: q.get("nonce"), redirect: q.get("redirect_uri"), sub: state.claims.sub });
      const to = new URL(q.get("redirect_uri"));
      to.searchParams.set("code", code);
      to.searchParams.set("state", q.get("state"));
      to.searchParams.set("iss", iss);
      res.writeHead(302, { location: to.toString() });
      return res.end();
    }
    if (url.pathname === "/oauth/token") {
      state.tokenCalls += 1;
      let body = "";
      for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      if (req.headers.authorization !== `Basic ${Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString("base64")}`) return j(401, { error: "invalid_client" });
      const c = codes.get(p.get("code"));
      codes.delete(p.get("code"));
      if (!c || c.redirect !== p.get("redirect_uri") || b64u(crypto.createHash("sha256").update(p.get("code_verifier") || "").digest()) !== c.challenge) return j(400, { error: "invalid_grant" });
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss, sub: c.sub, aud: CLIENT.id, azp: CLIENT.id, iat: now, exp: now + 900, auth_time: now, nonce: c.nonce, brand_id: "nuni-weather", brand_role: "customer", platform_admin: false, ...state.claims };
      let idt = sign(claims);
      if (state.tamper === "signature") idt = sign(claims, crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
      return j(200, { access_token: "at-opaque", token_type: "Bearer", expires_in: 900, id_token: idt, refresh_token: "nuni_rt_testrefresh" });
    }
    if (url.pathname === "/oauth/revoke") {
      let body = "";
      for await (const c of req) body += c;
      state.revoked.push(new URLSearchParams(body).get("token"));
      return j(200, {});
    }
    res.writeHead(404).end();
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => {
    state.base = `http://127.0.0.1:${server.address().port}`;
    state.close = () => new Promise((x) => server.close(x));
    r(state);
  }));
}

// auth.guard/handle 을 감싼 작은 서버 (관리 API 자리에 더미 응답)
async function startApp(extraEnv = {}) {
  const a = { auth: null, logs: [] };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const denied = await a.auth.guard(req, url);
    if (denied) { res.writeHead(denied.status, { "content-type": "application/json" }); return res.end(JSON.stringify(denied.body)); }
    if (await a.auth.handle(req, res, url)) return;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: url.pathname }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  a.base = `http://127.0.0.1:${server.address().port}`;
  a.file = path.join(tmp, `auth-${crypto.randomUUID()}.json`);
  a.store = createJsonStore(a.file);
  a.auth = createAuth({
    env: { AUTH_PROVIDER: "nuni-id", NUNI_ID_ISSUER: op.base, NUNI_ID_CLIENT_ID: CLIENT.id, NUNI_ID_CLIENT_SECRET: CLIENT.secret, NUNI_ID_REDIRECT_URI: `${a.base}/auth/nuni/callback`, SESSION_SECRET: "weather-test-session-secret-0123456789abcdef", ...extraEnv },
    store: a.store,
    log: (m) => a.logs.push(m),
  });
  a.close = () => new Promise((r) => server.close(r));
  return a;
}

function jar() {
  const j = new Map();
  return {
    j,
    header: () => [...j].map(([k, v]) => `${k}=${v}`).join("; "),
    take(res) {
      for (const line of res.headers.getSetCookie()) {
        const [nv] = line.split(";");
        const i = nv.indexOf("=");
        if (/Max-Age=0/i.test(line) || nv.slice(i + 1) === "") j.delete(nv.slice(0, i));
        else j.set(nv.slice(0, i), nv.slice(i + 1));
      }
    },
  };
}
async function req(a, cj, p, { method = "GET", origin } = {}) {
  const headers = { cookie: cj.header() };
  if (origin) headers.origin = origin;
  if (method === "POST") headers["content-type"] = "application/json";
  const res = await fetch(p.startsWith("http") ? p : a.base + p, { method, headers, body: method === "POST" ? "{}" : undefined, redirect: "manual" });
  cj.take(res);
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, loc: res.headers.get("location"), data, res };
}
async function login(a, claims, next = "#/gaps") {
  op.claims = claims;
  const cj = jar();
  const r1 = await req(a, cj, `/auth/nuni/login?next=${encodeURIComponent(next)}`);
  const r2 = await fetch(r1.loc, { redirect: "manual" });
  const r3 = await req(a, cj, r2.headers.get("location"));
  return { cj, r1, r3 };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wh-nuni-"));
  op = await startOp();
  app = await startApp();
});
after(async () => {
  await app.close();
  await op.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("kakao mode (default) is unchanged: /api/me has no provider field, login goes to Kakao", async () => {
  const k = createAuth({ env: { KAKAO_REST_API_KEY: "k", KAKAO_CLIENT_SECRET: "s", SESSION_SECRET: "x".repeat(40) }, store: createJsonStore(path.join(tmp, "k.json")), log: () => {} });
  assert.equal(k.provider, "kakao");
  assert.match(k.startupLine, /kakao login/);
  const off = createAuth({ env: {}, store: null, log: () => {} });
  assert.equal(off.enabled, false);
  assert.match(off.startupLine, /auth disabled/);
});

test("login start: redirect to NUNI ID authorize with PKCE S256 + state + nonce; state cookie scoped to /auth/nuni", async () => {
  const cj = jar();
  const me = await req(app, cj, "/api/me");
  assert.deepEqual({ ...me.data }, { authEnabled: true, loggedIn: false, role: "none", provider: "nuni-id", loginUrl: "/auth/nuni/login", accountUrl: `${op.base}/me`, adminConsoleUrl: `${op.base}/admin/users` });
  const r = await req(app, cj, "/auth/nuni/login?next=%23%2Fgaps");
  assert.equal(r.status, 302);
  const u = new URL(r.loc);
  assert.equal(u.origin + u.pathname, `${op.base}/oauth/authorize`);
  for (const k of ["state", "nonce", "code_challenge"]) assert.ok(u.searchParams.get(k), k);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("client_id"), CLIENT.id);
  assert.equal(u.searchParams.get("scope"), "openid");
  const sc = r.res.headers.getSetCookie().find((c) => c.startsWith("nw_oidc="));
  assert.match(sc, /Path=\/auth\/nuni/);
  assert.match(sc, /HttpOnly/);
  assert.ok(!r.loc.includes(CLIENT.secret));
});

test("brand_admin → 관리 unlocked; writes need same Origin (CSRF); refresh token revoked (not kept)", async () => {
  const { cj, r3 } = await login(app, { sub: SUB.admin, brand_role: "brand_admin" });
  assert.equal(r3.status, 302);
  assert.equal(r3.loc, "/#/gaps");
  assert.ok(cj.j.get("nw_session"));
  const me = await req(app, cj, "/api/me");
  assert.equal(me.data.loggedIn, true);
  assert.equal(me.data.role, "admin");
  assert.equal(me.data.nuniUserId, SUB.admin);
  assert.equal((await req(app, cj, "/api/gaps")).status, 200);
  assert.equal((await req(app, cj, "/api/stations/toggle", { method: "POST", origin: app.base })).status, 200);
  const csrf = await req(app, cj, "/api/stations/toggle", { method: "POST" });
  assert.equal(csrf.status, 403);
  assert.equal(csrf.data.auth, "csrf");
  const evil = await req(app, cj, "/api/stations/toggle", { method: "POST", origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(op.revoked.includes("nuni_rt_testrefresh"));
  const users = await req(app, cj, "/api/admin/users");
  assert.equal(users.data.managedBy, "nuni-id");
  assert.equal((await req(app, cj, "/api/admin/users/status", { method: "POST", origin: app.base })).status, 410);
  const logs = app.logs.join("\n");
  assert.ok(!logs.includes(CLIENT.secret) && !logs.includes("nuni_rt_testrefresh"));
});

test("staff → admin; platform_admin → admin; customer → 조회 only with clear message", async () => {
  const staff = await login(app, { sub: SUB.admin, brand_role: "staff" });
  assert.equal((await req(app, staff.cj, "/api/me")).data.role, "admin");
  const pa = await login(app, { sub: SUB.padmin, brand_role: "customer", platform_admin: true });
  assert.equal((await req(app, pa.cj, "/api/me")).data.role, "admin");
  const v = await login(app, { sub: SUB.viewer, brand_role: "customer" });
  const me = await req(app, v.cj, "/api/me");
  assert.equal(me.data.role, "viewer");
  const g = await req(app, v.cj, "/api/gaps");
  assert.equal(g.status, 403);
  assert.equal(g.data.auth, "viewer");
  assert.equal(g.data.message, "관리 권한이 없습니다 (누니 ID 관리자에게 요청)");
  assert.equal((await req(app, v.cj, "/api/stations/toggle", { method: "POST", origin: app.base })).status, 403);
  assert.equal((await req(app, v.cj, "/api/hourly")).status, 200, "조회 API 는 열려 있음");
  // 권한이 올라가면 다음 로그인 때 반영
  const v2 = await login(app, { sub: SUB.viewer, brand_role: "staff" });
  assert.equal((await req(app, v2.cj, "/api/me")).data.role, "admin");
});

test("id_token checks: bad signature / wrong nonce / wrong brand / wrong aud / state mismatch / error=access_denied", async () => {
  op.tamper = "signature";
  let r = await login(app, { sub: SUB.admin, brand_role: "brand_admin" });
  op.tamper = null;
  assert.match(r.r3.loc, /login=failed/);
  assert.ok(!r.cj.j.get("nw_session"));
  for (const bad of [{ nonce: "wrong" }, { brand_id: "other-brand" }, { aud: "other-client", azp: "other-client" }, { iss: "https://evil.example" }, { exp: Math.floor(Date.now() / 1000) - 3600 }, { sub: "not-a-uuid" }]) {
    r = await login(app, { sub: SUB.admin, brand_role: "brand_admin", ...bad });
    assert.match(r.r3.loc, /login=failed/, JSON.stringify(bad));
    assert.ok(!r.cj.j.get("nw_session"));
  }
  const cj = jar();
  const r1 = await req(app, cj, "/auth/nuni/login");
  const r2 = await fetch(r1.loc, { redirect: "manual" });
  const cb = new URL(r2.headers.get("location"));
  cb.searchParams.set("state", "forged");
  assert.equal((await req(app, cj, cb.toString())).status, 400);
  const cj2 = jar();
  await req(app, cj2, "/auth/nuni/login");
  const st = new URL((await req(app, jar(), "/auth/nuni/login")).loc).searchParams.get("state");
  assert.ok(st);
  const r4 = await req(app, cj2, `/auth/nuni/callback?error=access_denied&state=${encodeURIComponent(new URL((await req(app, cj2, "/auth/nuni/login")).loc).searchParams.get("state"))}`);
  assert.match(r4.loc, /login=cancelled/);
});

test("logout deletes local session; NUNI_ID_LOGOUT_SSO=1 returns end_session URL; pre-switch kakao sessions are ignored", async () => {
  const { cj } = await login(app, { sub: SUB.admin, brand_role: "brand_admin" });
  const out = await req(app, cj, "/auth/logout", { method: "POST", origin: app.base });
  assert.equal(out.data.ok, true);
  assert.equal(out.data.endSessionUrl, null);
  assert.equal((await req(app, cj, "/api/me")).data.loggedIn, false);
  const sso = await startApp({ NUNI_ID_LOGOUT_SSO: "1", NUNI_ID_POST_LOGOUT_URI: "http://127.0.0.1/after" });
  try {
    const l = await login(sso, { sub: SUB.admin, brand_role: "brand_admin" });
    const o = await req(sso, l.cj, "/auth/logout", { method: "POST", origin: sso.base });
    const u = new URL(o.data.endSessionUrl);
    assert.equal(u.origin + u.pathname, `${op.base}/oauth/end_session`);
    assert.equal(u.searchParams.get("client_id"), CLIENT.id);
    assert.equal(u.searchParams.get("post_logout_redirect_uri"), "http://127.0.0.1/after");
    // 카카오 모드에서 만든 (승인된) 세션은 nuni-id 모드에서 통하지 않음
    await sso.store.upsertLogin({ kakaoId: "5107991059", nickname: "k", profileImage: null });
    await sso.store.setStatus("5107991059", "approved", "t");
    const token = "kakao-session-token-0123456789abcdef";
    const hash = crypto.createHmac("sha256", "weather-test-session-secret-0123456789abcdef").update(`session:${token}`).digest("base64url");
    await sso.store.createSession({ idHash: hash, kakaoId: "5107991059", expiresAt: new Date(Date.now() + 3600000) });
    const cj2 = jar();
    cj2.j.set("nw_session", token);
    assert.equal((await req(sso, cj2, "/api/me")).data.loggedIn, false);
    assert.equal((await req(sso, cj2, "/api/gaps")).status, 401);
  } finally {
    await sso.close();
  }
});

test("AUTH_PROVIDER=nuni-id without client settings fails closed (관리 locked, not public)", async () => {
  const a = createAuth({ env: { AUTH_PROVIDER: "nuni-id" }, store: null, log: () => {} });
  assert.match(a.startupLine, /LOCKED/);
  const fakeReq = (method, url) => ({ method, headers: {}, url });
  assert.equal((await a.guard(fakeReq("GET", "/api/gaps"), new URL("http://x/api/gaps"))).status, 503);
  assert.equal((await a.guard(fakeReq("POST", "/api/collect"), new URL("http://x/api/collect"))).status, 503);
  assert.equal(await a.guard(fakeReq("GET", "/api/hourly"), new URL("http://x/api/hourly")), null);
  assert.equal(await a.isAdmin(fakeReq("GET", "/")), false);
});
