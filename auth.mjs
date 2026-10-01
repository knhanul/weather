// 로그인 + 관리 기능 접근 제어. 두 가지 방식(AUTH_PROVIDER):
//  - kakao (기본): 카카오 로그인 + 누니날씨 자체 승인. KAKAO_REST_API_KEY·KAKAO_CLIENT_SECRET 이 있을 때만 켜진다.
//  - nuni-id: 누니 ID(OIDC) 로그인. 권한은 누니 ID 의 brand_role(brand_admin/staff) 또는 platform_admin 으로 결정.
//    NUNI_ID_ISSUER·NUNI_ID_CLIENT_ID·NUNI_ID_CLIENT_SECRET 이 있을 때만 켜진다.
// 꺼져 있으면 guard/handle은 아무것도 막지 않는다(기존과 동일). 토큰·인가 코드·시크릿·세션 id는 로그에 남기지 않는다.
import crypto from "node:crypto";
import { nuniConfig, nuniConfigured, createNuniClient, nuniRoleIsAdmin } from "./auth-nuni.mjs";

export const authProvider = (env = process.env) => (String(env.AUTH_PROVIDER || "").trim().toLowerCase() === "nuni-id" ? "nuni-id" : "kakao");
// 이 서버에서 로그인 기능이 켜지는지 (저장소를 만들지 판단)
export function authConfigured(env = process.env) {
  if (authProvider(env) === "nuni-id") return nuniConfigured(env);
  return Boolean(env.KAKAO_REST_API_KEY?.trim() && env.KAKAO_CLIENT_SECRET?.trim());
}
const NUNI_PREFIX = "nuni:"; // nuni-id 모드 사용자는 app_users.kakao_id 에 'nuni:<누니 회원 ID>' 로 저장(개인정보 없음)

const SESSION_DAYS = 30;
const STATE_MAX_AGE = 600; // 10분
// 관리 화면에서만 쓰는 조회 API (공개 화면에는 필요 없음)
const ADMIN_GET = new Set(["/api/gaps", "/api/jobs"]);

const b64u = (buf) => Buffer.from(buf).toString("base64url");
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// 로그인 후 돌아갈 화면: '#/...' 형태의 해시만 허용(외부 주소로 보내지 않음)
export function safeNext(v) {
  const s = String(v || "");
  return /^#\/[A-Za-z0-9/?=&%._:~+\- ]{0,300}$/.test(s) ? s : "#/";
}
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function createAuth({ env = process.env, store, log = console.log, fetchImpl = fetch } = {}) {
  const provider = authProvider(env);
  const nuni = provider === "nuni-id" ? createNuniClient(nuniConfig(env), { fetchImpl, log }) : null;
  const restKey = (env.KAKAO_REST_API_KEY || "").trim();
  const clientSecret = (env.KAKAO_CLIENT_SECRET || "").trim();
  const enabled = Boolean(store && (nuni ? nuniConfigured(env) : restKey && clientSecret));
  // nuni-id 를 골랐는데 설정이 빠졌으면 관리 기능을 열지 않고 잠근다(fail closed)
  const locked = Boolean(nuni) && !enabled;
  const redirectUri = nuni ? nuni.cfg.redirectUri : (env.KAKAO_REDIRECT_URI || "https://weather.nuni.co.kr/auth/kakao/callback").trim();
  const authBase = (env.KAKAO_AUTH_BASE || "https://kauth.kakao.com").replace(/\/+$/, "");
  const apiBase = (env.KAKAO_API_BASE || "https://kapi.kakao.com").replace(/\/+$/, "");
  const adminIds = new Set(String(env.ADMIN_KAKAO_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const secure = env.COOKIE_SECURE === "0" ? false : env.COOKIE_SECURE === "1" ? true : redirectUri.startsWith("https://");
  const SESSION_COOKIE = secure ? "__Host-nw_session" : "nw_session";
  const STATE_COOKIE = "nw_oauth_state";
  let secret = (env.SESSION_SECRET || "").trim();
  let secretNote = "";
  if (enabled && secret.length < 32) {
    secret = b64u(crypto.randomBytes(48));
    secretNote = " · SESSION_SECRET 없음/짧음: 임시 값 생성(재시작하면 로그인이 풀림)";
  }
  const hmac = (v) => crypto.createHmac("sha256", secret).update(v).digest("base64url");
  const hashSession = (token) => hmac(`session:${token}`);

  function cookie(name, value, { maxAge, path = "/" } = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
    if (secure) parts.push("Secure");
    if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
    return parts.join("; ");
  }
  const clearCookie = (name, path = "/") => cookie(name, "", { maxAge: 0, path });

  function roleOf(user) {
    if (!user) return "none";
    if (nuni) return user.status === "approved" ? "admin" : user.status === "blocked" ? "blocked" : "viewer";
    if (adminIds.has(String(user.kakao_id)) || user.status === "approved") return "admin";
    if (user.status === "blocked") return "blocked";
    return "pending";
  }

  async function sessionUser(req) {
    if (!enabled) return null;
    if (req._authChecked) return req._authUser;
    req._authChecked = true;
    req._authUser = null;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token && token.length >= 20 && token.length <= 200) {
      const s = await store.getSession(hashSession(token));
      // 모드가 다른 세션(전환 전 카카오 세션 등)은 무시
      if (s?.user && String(s.user.kakao_id).startsWith(NUNI_PREFIX) === Boolean(nuni)) req._authUser = s.user;
    }
    return req._authUser;
  }
  // 인증이 꺼져 있으면 모두 관리자처럼(기존 동작) 취급
  async function isAdmin(req) {
    if (locked) return false;
    if (!enabled) return true;
    return roleOf(await sessionUser(req)) === "admin";
  }

  // 상태를 바꾸는 요청은 같은 사이트에서 온 것만 허용(Origin, 없으면 Referer의 host가 요청 Host와 같아야 함)
  function sameOrigin(req) {
    let src = req.headers.origin;
    if (!src || src === "null") src = req.headers.referer;
    if (!src) return false;
    let host;
    try {
      host = new URL(src).host;
    } catch {
      return false;
    }
    const allowed = new Set([String(req.headers.host || "")]);
    try {
      allowed.add(new URL(redirectUri).host);
    } catch {
      /* ignore */
    }
    return allowed.has(host);
  }

  async function requireAdmin(req) {
    const user = await sessionUser(req);
    if (!user) return { status: 401, body: { ok: false, auth: "login", message: "로그인이 필요합니다." } };
    const role = roleOf(user);
    if (role === "admin") return null;
    if (role === "viewer") return { status: 403, body: { ok: false, auth: "viewer", message: "관리 권한이 없습니다. 관리자에게 요청하세요" } };
    return {
      status: 403,
      body: { ok: false, auth: role, message: role === "blocked" ? "사용이 차단된 계정입니다." : "관리자 승인 대기 중입니다." },
    };
  }

  // 요청 차단 여부. null이면 통과.
  async function guard(req, url) {
    if (locked) {
      const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (write || ADMIN_GET.has(url.pathname) || url.pathname.startsWith("/api/admin/")) return { status: 503, body: { ok: false, auth: "login", message: "로그인 설정이 완료되지 않아 관리 기능을 잠갔습니다." } };
      return null;
    }
    if (!enabled) return null;
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (write) {
      if (!sameOrigin(req)) return { status: 403, body: { ok: false, auth: "csrf", message: "다른 사이트에서 보낸 요청은 처리하지 않습니다." } };
      if (url.pathname === "/auth/logout") return null;
      return requireAdmin(req);
    }
    if (ADMIN_GET.has(url.pathname) || url.pathname.startsWith("/api/admin/")) return requireAdmin(req);
    return null;
  }

  function redirect(res, location, cookies = []) {
    res.writeHead(302, { location, "set-cookie": cookies, "cache-control": "no-store" });
    res.end();
  }
  function page(res, status, title, text, cookies = []) {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", "set-cookie": cookies, "cache-control": "no-store" });
    res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)} · 누니날씨</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4f8ff;color:#0d1b3d;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.c{background:#fff;border:1px solid #e0e8f4;border-radius:16px;padding:28px 26px;max-width:420px;margin:16px;box-shadow:0 16px 42px rgba(0,80,224,.08)}h1{font-size:19px;margin:0 0 8px}p{margin:0 0 18px;color:#5e7090}a{display:inline-block;background:#026ef8;color:#fff;text-decoration:none;padding:9px 16px;border-radius:10px;font-weight:600}</style></head>
<body><div class="c"><h1>${escHtml(title)}</h1><p>${escHtml(text)}</p><a href="/">누니날씨로 돌아가기</a></div></body></html>`);
  }
  const json = (res, data, status = 200, cookies = []) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": cookies });
    res.end(JSON.stringify(data));
  };
  const readJson = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size < 65536) chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch {
          resolve({});
        }
      });
    });

  async function kakaoFetchJson(u, init) {
    const r = await fetch(u, { ...init, signal: AbortSignal.timeout(10000) });
    let body = null;
    try {
      body = await r.json();
    } catch {
      /* ignore */
    }
    return { ok: r.ok, status: r.status, body };
  }

  async function login(req, res, url) {
    const next = safeNext(url.searchParams.get("next"));
    const state = b64u(crypto.randomBytes(24));
    const payload = `${state}.${b64u(next)}`;
    const q = new URLSearchParams({ response_type: "code", client_id: restKey, redirect_uri: redirectUri, state });
    redirect(res, `${authBase}/oauth/authorize?${q}`, [cookie(STATE_COOKIE, `${payload}.${hmac(`state:${payload}`)}`, { maxAge: STATE_MAX_AGE, path: "/auth/kakao" })]);
  }

  async function callback(req, res, url) {
    const clear = clearCookie(STATE_COOKIE, "/auth/kakao");
    const raw = parseCookies(req.headers.cookie)[STATE_COOKIE] || "";
    const [cState, cNext, sig] = raw.split(".");
    const qState = url.searchParams.get("state") || "";
    const validCookie = cState && cNext && sig && safeEqual(sig, hmac(`state:${cState}.${cNext}`));
    if (!validCookie || !qState || !safeEqual(cState, qState)) {
      log("kakao login rejected: state mismatch or expired");
      return page(res, 400, "로그인을 완료하지 못했습니다", "로그인 요청이 만료되었거나 올바르지 않습니다. 누니날씨에서 다시 로그인해 주세요.", [clear]);
    }
    const next = safeNext(Buffer.from(cNext, "base64url").toString("utf8"));
    if (url.searchParams.get("error")) {
      return redirect(res, `/?login=cancelled${next}`, [clear]);
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 2000) return redirect(res, `/?login=failed${next}`, [clear]);
    try {
      const tok = await kakaoFetchJson(`${authBase}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams({ grant_type: "authorization_code", client_id: restKey, client_secret: clientSecret, redirect_uri: redirectUri, code }),
      });
      if (!tok.ok || !tok.body?.access_token) {
        log(`kakao login failed: token exchange HTTP ${tok.status} ${String(tok.body?.error || "").slice(0, 40)}`);
        return redirect(res, `/?login=failed${next}`, [clear]);
      }
      const me = await kakaoFetchJson(`${apiBase}/v2/user/me`, { headers: { authorization: `Bearer ${tok.body.access_token}` } });
      if (!me.ok || me.body?.id == null) {
        log(`kakao login failed: user/me HTTP ${me.status}`);
        return redirect(res, `/?login=failed${next}`, [clear]);
      }
      const prof = me.body.kakao_account?.profile || {};
      const props = me.body.properties || {};
      const nickname = String(prof.nickname || props.nickname || "카카오 사용자").slice(0, 60);
      let image = prof.is_default_image ? null : prof.thumbnail_image_url || props.thumbnail_image || null;
      if (image && (!/^https?:\/\//.test(image) || image.length > 500)) image = null;
      const kakaoId = String(me.body.id);
      const user = await store.upsertLogin({ kakaoId, nickname, profileImage: image });
      if (roleOf(user) === "blocked") {
        log(`kakao login blocked user kakao_id=${kakaoId}`);
        return redirect(res, `/?login=blocked${next}`, [clear]);
      }
      // 세션 교체: 기존 세션이 있으면 지우고 새로 발급
      const old = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (old) await store.deleteSession(hashSession(old));
      const token = b64u(crypto.randomBytes(32));
      await store.createSession({
        idHash: hashSession(token),
        kakaoId,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
        userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
      });
      log(`kakao login ok kakao_id=${kakaoId} role=${roleOf(user)}`);
      return redirect(res, `/${next}`, [clear, cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 })]);
    } catch (err) {
      log(`kakao login failed: ${err?.name === "TimeoutError" ? "timeout" : "error"}`);
      return redirect(res, `/?login=failed${next}`, [clear]);
    }
  }

  // ---- 누니 ID(OIDC) ----
  const OIDC_COOKIE = "nw_oidc";
  // 로그아웃용 id_token_hint (POST /auth/logout 에만 전송, HttpOnly). 서명은 누니 ID 가 검증한다.
  const IDT_COOKIE = "nw_idt";
  // 명시적 로그아웃 표시(값 '1', 개인정보 없음). 다음 로그인 1회만 prompt=login 으로 카카오 계정을 다시 묻고, 로그인 성공 시 지운다.
  const RELOGIN_COOKIE = "nw_relogin";
  const RELOGIN_MAX_AGE = 30 * 24 * 3600;
  async function nuniLogin(req, res, url) {
    const next = safeNext(url.searchParams.get("next"));
    const state = b64u(crypto.randomBytes(24));
    const nonce = b64u(crypto.randomBytes(24));
    const verifier = b64u(crypto.randomBytes(48));
    let location;
    try {
      const forceLogin = parseCookies(req.headers.cookie)[RELOGIN_COOKIE] === "1";
      location = await nuni.authorizeUrl({ state, nonce, verifier, forceLogin });
    } catch (err) {
      log(`nuni-id login unavailable: ${err?.message || "error"} ${err?.detail || ""}`);
      return page(res, 503, "로그인 서버에 연결하지 못했습니다", "잠시 후 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.");
    }
    const payload = `${state}.${nonce}.${verifier}.${b64u(next)}`;
    redirect(res, location, [cookie(OIDC_COOKIE, `${payload}.${hmac(`oidc:${payload}`)}`, { maxAge: STATE_MAX_AGE, path: "/auth/nuni" })]);
  }

  async function nuniCallback(req, res, url) {
    const clear = clearCookie(OIDC_COOKIE, "/auth/nuni");
    const raw = parseCookies(req.headers.cookie)[OIDC_COOKIE] || "";
    const [cState, cNonce, cVerifier, cNext, sig] = raw.split(".");
    const qState = url.searchParams.get("state") || "";
    const validCookie = cState && cNonce && cVerifier && cNext && sig && safeEqual(sig, hmac(`oidc:${cState}.${cNonce}.${cVerifier}.${cNext}`));
    if (!validCookie || !qState || !safeEqual(cState, qState)) {
      log("nuni-id login rejected: state mismatch or expired");
      return page(res, 400, "로그인을 완료하지 못했습니다", "로그인 요청이 만료되었거나 올바르지 않습니다. 누니날씨에서 다시 로그인해 주세요.", [clear]);
    }
    const next = safeNext(Buffer.from(cNext, "base64url").toString("utf8"));
    const qIss = url.searchParams.get("iss");
    if (qIss && qIss !== nuni.cfg.issuer) {
      log("nuni-id login rejected: iss mismatch");
      return redirect(res, `/?login=failed${next}`, [clear]);
    }
    const error = url.searchParams.get("error");
    if (error) {
      log(`nuni-id login error=${String(error).slice(0, 40)}`);
      return redirect(res, `/?login=${error === "access_denied" ? (/banned|not available/.test(String(url.searchParams.get("error_description") || "")) ? "blocked" : "cancelled") : "failed"}${next}`, [clear]);
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 2000) return redirect(res, `/?login=failed${next}`, [clear]);
    let claims;
    try {
      claims = await nuni.exchange({ code, verifier: cVerifier, nonce: cNonce });
    } catch (err) {
      log(`nuni-id login failed: ${err?.name === "TimeoutError" ? "timeout" : `${err?.message || "error"} ${err?.detail || ""}`}`);
      return redirect(res, `/?login=failed${next}`, [clear]);
    }
    const id = `${NUNI_PREFIX}${claims.sub}`;
    const admin = nuniRoleIsAdmin(claims);
    // 역할 스냅샷: approved(관리) / pending(조회 전용). 누니 ID 에서 권한이 바뀌면 다음 로그인 때 반영
    let user = await store.upsertLogin({ kakaoId: id, nickname: null, profileImage: null });
    const want = admin ? "approved" : "pending";
    if (user.status !== want) user = await store.setStatus(id, want, "nuni-id");
    const old = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (old) await store.deleteSession(hashSession(old));
    const token = b64u(crypto.randomBytes(32));
    const hours = nuni.cfg.sessionHours;
    await store.createSession({ idHash: hashSession(token), kakaoId: id, expiresAt: new Date(Date.now() + hours * 3600000), userAgent: null });
    log(`nuni-id login ok user=${claims.sub} role=${roleOf(user)} brand_role=${claims.brandRole || "-"}${claims.platformAdmin ? " platform_admin" : ""}`);
    const idt = claims.idToken && claims.idToken.length < 3500 ? [cookie(IDT_COOKIE, claims.idToken, { maxAge: hours * 3600, path: "/auth/logout" })] : [clearCookie(IDT_COOKIE, "/auth/logout")];
    return redirect(res, `/${next}`, [clear, cookie(SESSION_COOKIE, token, { maxAge: hours * 3600 }), ...idt, clearCookie(RELOGIN_COOKIE, "/auth/nuni")]);
  }

  const userJson = (u, adminList = false) => ({
    kakaoId: u.kakao_id,
    nickname: u.nickname,
    profileImage: u.profile_image,
    status: u.status,
    role: roleOf(u),
    ...(adminList
      ? { envAdmin: adminIds.has(u.kakao_id), createdAt: u.created_at, lastLoginAt: u.last_login_at, statusChangedAt: u.status_changed_at, statusChangedBy: u.status_changed_by }
      : {}),
  });

  // /auth/*, /api/me, /api/admin/* 처리. 처리했으면 true.
  async function handle(req, res, url) {
    const p = url.pathname;
    if (p === "/api/me" && req.method === "GET") {
      if (locked) return json(res, { authEnabled: true, provider: "nuni-id", loggedIn: false, role: "none", misconfigured: true, loginUrl: "/auth/nuni/login" }), true;
      if (!enabled) return json(res, { authEnabled: false, loggedIn: false, role: "none" }), true;
      const u = await sessionUser(req);
      if (nuni) {
        const links = { provider: "nuni-id", loginUrl: "/auth/nuni/login", accountUrl: `${nuni.cfg.issuer}/me`, adminConsoleUrl: `${nuni.cfg.issuer}/admin/users` };
        return json(res, u ? { authEnabled: true, loggedIn: true, ...links, nuniUserId: String(u.kakao_id).slice(NUNI_PREFIX.length), role: roleOf(u) } : { authEnabled: true, loggedIn: false, role: "none", ...links }), true;
      }
      return json(res, u ? { authEnabled: true, loggedIn: true, ...userJson(u) } : { authEnabled: true, loggedIn: false, role: "none" }), true;
    }
    if (locked && p.startsWith("/auth/")) return page(res, 503, "로그인 설정이 완료되지 않았습니다", "누니 ID 연동 설정(NUNI_ID_ISSUER/CLIENT_ID/CLIENT_SECRET)이 빠져 있어 관리 기능을 잠갔습니다."), true;
    if (!enabled) {
      if (p.startsWith("/auth/") || p.startsWith("/api/admin/")) {
        if (p.startsWith("/api/")) json(res, { ok: false, message: "로그인 기능이 꺼져 있습니다." }, 404);
        else page(res, 404, "로그인 기능이 꺼져 있습니다", "이 누니날씨 서버에는 카카오 로그인이 아직 설정되지 않았습니다.");
        return true;
      }
      return false;
    }
    if (nuni) {
      if (p === "/auth/nuni/login" && req.method === "GET") return await nuniLogin(req, res, url), true;
      if (p === "/auth/nuni/callback" && req.method === "GET") return await nuniCallback(req, res, url), true;
      if (p === "/auth/kakao/login" && req.method === "GET") return redirect(res, `/auth/nuni/login${url.search}`), true; // 예전 링크
      if (p === "/auth/logout" && req.method === "POST") {
        const ck = parseCookies(req.headers.cookie);
        const token = ck[SESSION_COOKIE];
        if (token) await store.deleteSession(hashSession(token));
        // 누니 ID 세션도 끝냄(id_token_hint → 확인 화면 없이 로그아웃 후 누니날씨 / 로 복귀). 힌트가 없으면 SSO 로그아웃은 생략하고
        // 다음 로그인의 prompt=login 으로 계정을 다시 묻는다. 카카오계정 자체는 로그아웃하지 않는다.
        let endSessionUrl = null;
        const hint = ck[IDT_COOKIE];
        if (nuni.cfg.logoutSso && hint) endSessionUrl = await nuni.endSessionUrl(hint).catch(() => null);
        return json(res, { ok: true, endSessionUrl }, 200, [clearCookie(SESSION_COOKIE), clearCookie(IDT_COOKIE, "/auth/logout"), cookie(RELOGIN_COOKIE, "1", { maxAge: RELOGIN_MAX_AGE, path: "/auth/nuni" })]), true;
      }
      // 사용자 승인/차단은 누니 ID 관리 콘솔에서 한다
      if (p === "/api/admin/users" && req.method === "GET") return json(res, { managedBy: "nuni-id", adminConsoleUrl: `${nuni.cfg.issuer}/admin/users`, users: [] }), true;
      if (p === "/api/admin/users/status" && req.method === "POST") return json(res, { ok: false, message: "사용자 권한은 통합 관리 콘솔에서 바꿉니다." }, 410), true;
      if (p.startsWith("/auth/") || p.startsWith("/api/admin/")) return json(res, { ok: false, message: "not found" }, 404), true;
      return false;
    }
    if (p === "/auth/kakao/login" && req.method === "GET") return await login(req, res, url), true;
    if (p === "/auth/kakao/callback" && req.method === "GET") return await callback(req, res, url), true;
    if (p === "/auth/logout" && req.method === "POST") {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) await store.deleteSession(hashSession(token));
      return json(res, { ok: true }, 200, [clearCookie(SESSION_COOKIE)]), true;
    }
    if (p === "/api/admin/users" && req.method === "GET") {
      const me = await sessionUser(req);
      const users = (await store.listUsers()).filter((u) => !String(u.kakao_id).startsWith(NUNI_PREFIX));
      return json(res, { me: me?.kakao_id || null, users: users.map((u) => userJson(u, true)) }), true;
    }
    if (p === "/api/admin/users/status" && req.method === "POST") {
      const me = await sessionUser(req);
      const body = await readJson(req);
      const kakaoId = String(body.kakaoId || "");
      if (!["approved", "blocked", "pending"].includes(body.status)) return json(res, { ok: false, message: "상태 값이 올바르지 않습니다." }, 400), true;
      if (me && kakaoId === me.kakao_id) return json(res, { ok: false, message: "내 계정의 상태는 여기서 바꿀 수 없습니다." }, 400), true;
      const u = await store.setStatus(kakaoId, body.status, me ? `${me.nickname || ""} (${me.kakao_id})` : null);
      if (!u) return json(res, { ok: false, message: "사용자를 찾지 못했습니다." }, 404), true;
      log(`auth user status kakao_id=${kakaoId} -> ${body.status} by=${me?.kakao_id || "?"}`);
      return json(res, { ok: true, user: userJson(u, true) }), true;
    }
    if (p.startsWith("/auth/") || p.startsWith("/api/admin/")) return json(res, { ok: false, message: "not found" }, 404), true;
    return false;
  }

  async function cleanup() {
    if (!enabled) return 0;
    try {
      return await store.deleteExpired();
    } catch {
      return 0;
    }
  }

  const startupLine = enabled
    ? nuni
      ? `auth enabled · nuni-id login (issuer=${nuni.cfg.issuer} client=${nuni.cfg.clientId} brand=${nuni.cfg.brand} session=${nuni.cfg.sessionHours}h${nuni.cfg.logoutSso ? " sso-logout" : ""}) · store=${store.kind} · cookie=${SESSION_COOKIE}${secure ? " (Secure)" : ""}${secretNote}`
      : `auth enabled · kakao login · store=${store.kind} · cookie=${SESSION_COOKIE}${secure ? " (Secure)" : ""} · admin ids=${adminIds.size}${secretNote}`
    : locked
      ? "auth LOCKED (AUTH_PROVIDER=nuni-id 이지만 NUNI_ID_ISSUER/NUNI_ID_CLIENT_ID/NUNI_ID_CLIENT_SECRET 없음) · 관리 기능 잠김"
      : "auth disabled (KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET not set) · 관리 기능 공개 상태";
  return { enabled, provider, guard, handle, isAdmin, sessionUser, cleanup, startupLine, roleOf };
}
