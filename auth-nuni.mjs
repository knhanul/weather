// 누니 ID(OIDC) 클라이언트 — AUTH_PROVIDER=nuni-id 일 때만 쓰인다.
// Authorization Code + PKCE(S256) + state + nonce. id_token 은 JWKS(RS256)로 검증. Node 내장 crypto 만 사용.
// 토큰·코드·시크릿·code_verifier 는 로그에 남기지 않는다. 누니 ID 토큰에는 개인정보가 없다(sub = 누니 회원 ID).
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADMIN_BRAND_ROLES = new Set(["brand_admin", "staff"]);

export function nuniConfig(env) {
  const issuer = String(env.NUNI_ID_ISSUER || "https://id.nuni.co.kr").trim().replace(/\/+$/, "");
  return {
    issuer,
    clientId: String(env.NUNI_ID_CLIENT_ID || "").trim(),
    clientSecret: String(env.NUNI_ID_CLIENT_SECRET || "").trim(),
    redirectUri: String(env.NUNI_ID_REDIRECT_URI || "https://weather.nuni.co.kr/auth/nuni/callback").trim(),
    postLogoutUri: String(env.NUNI_ID_POST_LOGOUT_URI || "https://weather.nuni.co.kr/").trim(),
    brand: String(env.NUNI_ID_BRAND || "nuni-weather").trim(),
    // 로그아웃하면 누니 ID 세션도 끝낸다(기본). NUNI_ID_LOGOUT_SSO=0 이면 누니날씨 세션만 끝냄
    logoutSso: env.NUNI_ID_LOGOUT_SSO !== "0",
    sessionHours: Math.max(1, Math.min(Number(env.NUNI_ID_SESSION_HOURS || 12), 24 * 30)),
    // 누니 ID 로그인 화면을 건너뛰고 바로 카카오로 (사용자에게는 카카오 로그인만 보임). 빈 값이면 누니 ID 화면 표시
    idpHint: String(env.NUNI_ID_IDP_HINT ?? "kakao").trim(),
  };
}
export const nuniConfigured = (env) => {
  const c = nuniConfig(env);
  return Boolean(c.issuer && c.clientId && c.clientSecret);
};

// brand_role/platform_admin → 누니날씨 관리 권한
// verifyIdToken 결과(camelCase) 또는 원본 id_token claims(snake_case) 모두 받음
export const nuniRoleIsAdmin = (c) => c.platformAdmin === true || c.platform_admin === true || ADMIN_BRAND_ROLES.has(c.brandRole ?? c.brand_role);

export function createNuniClient(cfg, { fetchImpl = fetch } = {}) {
  let disco = null;
  let discoAt = 0;
  let jwks = null;
  let jwksAt = 0;

  async function getJson(u, init = {}) {
    const r = await fetchImpl(u, { ...init, signal: AbortSignal.timeout(10000) });
    let body = null;
    try {
      body = await r.json();
    } catch {
      /* ignore */
    }
    return { ok: r.ok, status: r.status, body };
  }

  async function discovery() {
    if (disco && Date.now() - discoAt < 3600_000) return disco;
    const r = await getJson(`${cfg.issuer}/.well-known/openid-configuration`);
    if (!r.ok || !r.body?.authorization_endpoint) throw Object.assign(new Error("discovery"), { detail: `HTTP ${r.status}` });
    if (r.body.issuer !== cfg.issuer) throw Object.assign(new Error("discovery"), { detail: "issuer mismatch" });
    disco = r.body;
    discoAt = Date.now();
    return disco;
  }

  async function keyFor(kid) {
    const fresh = jwks && Date.now() - jwksAt < 600_000;
    if (!fresh || (!jwks.has(kid) && Date.now() - jwksAt > 60_000)) {
      const d = await discovery();
      const r = await getJson(d.jwks_uri);
      if (!r.ok || !Array.isArray(r.body?.keys)) throw Object.assign(new Error("jwks"), { detail: `HTTP ${r.status}` });
      jwks = new Map(r.body.keys.filter((k) => k.kty === "RSA" && k.kid).map((k) => [k.kid, crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: "jwk" })]));
      jwksAt = Date.now();
    }
    return jwks.get(kid) || null;
  }

  // id_token 검증 → 클레임
  async function verifyIdToken(idToken, { nonce, accessToken } = {}) {
    const parts = String(idToken || "").split(".");
    if (parts.length !== 3) throw Object.assign(new Error("id_token"), { detail: "malformed" });
    let header, p;
    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      throw Object.assign(new Error("id_token"), { detail: "malformed" });
    }
    const fail = (detail) => Object.assign(new Error("id_token"), { detail });
    if (header.alg !== "RS256") throw fail("alg");
    const key = await keyFor(header.kid);
    if (!key) throw fail("unknown kid");
    if (!crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"))) throw fail("signature");
    const now = Math.floor(Date.now() / 1000);
    if (p.iss !== cfg.issuer) throw fail("iss");
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(cfg.clientId) || (aud.length > 1 && p.azp !== cfg.clientId)) throw fail("aud");
    if (typeof p.exp !== "number" || p.exp + 60 < now) throw fail("expired");
    if (typeof p.iat === "number" && p.iat - 60 > now) throw fail("iat");
    if (nonce !== undefined && (!p.nonce || p.nonce !== nonce)) throw fail("nonce");
    if (!UUID_RE.test(String(p.sub || ""))) throw fail("sub");
    if (p.brand_id !== cfg.brand) throw fail("brand");
    if (accessToken && p.at_hash && p.at_hash !== b64u(crypto.createHash("sha256").update(accessToken).digest().subarray(0, 16))) throw fail("at_hash");
    return { sub: p.sub, brandRole: p.brand_role ?? null, platformAdmin: p.platform_admin === true, authTime: p.auth_time ?? null };
  }

  // forceLogin: 명시적 로그아웃 직후 첫 로그인 — prompt=login 으로 카카오 계정을 다시 묻는다(일반 로그인에는 붙이지 않음)
  async function authorizeUrl({ state, nonce, verifier, forceLogin = false }) {
    const d = await discovery();
    const q = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: "openid",
      state,
      nonce,
      code_challenge: b64u(crypto.createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
    });
    if (cfg.idpHint) q.set("idp_hint", cfg.idpHint);
    if (forceLogin) q.set("prompt", "login");
    return `${d.authorization_endpoint}?${q}`;
  }

  async function exchange({ code, verifier, nonce }) {
    const d = await discovery();
    const basic = Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
    const r = await getJson(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: verifier }),
    });
    if (!r.ok || !r.body?.id_token) throw Object.assign(new Error("token"), { detail: `HTTP ${r.status} ${String(r.body?.error || "").slice(0, 40)}` });
    const claims = await verifyIdToken(r.body.id_token, { nonce, accessToken: r.body.access_token });
    // refresh token 은 쓰지 않는다: 누니날씨 세션을 짧게(NUNI_ID_SESSION_HOURS) 두고 다시 로그인(누니 ID 세션이 있으면 즉시)으로 권한을 갱신
    if (r.body.refresh_token) {
      getJson(d.revocation_endpoint || `${cfg.issuer}/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
        body: new URLSearchParams({ token: r.body.refresh_token, token_type_hint: "refresh_token" }),
      }).catch(() => {});
    }
    // idToken: 로그아웃 때 id_token_hint 로만 쓴다(개인정보 없음: sub·brand_role 등)
    return { ...claims, idToken: r.body.id_token };
  }

  // id_token_hint 가 있으면 누니 ID 가 확인 화면 없이 바로 로그아웃하고 post_logout_redirect_uri 로 돌려보낸다
  async function endSessionUrl(idTokenHint) {
    const d = await discovery();
    if (!d.end_session_endpoint) return null;
    const q = new URLSearchParams({ client_id: cfg.clientId, post_logout_redirect_uri: cfg.postLogoutUri });
    if (idTokenHint) q.set("id_token_hint", idTokenHint);
    return `${d.end_session_endpoint}?${q}`;
  }

  return { cfg, discovery, authorizeUrl, exchange, verifyIdToken, endSessionUrl };
}
