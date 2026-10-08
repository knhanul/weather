// 자동 수집 토큰(COLLECT_TOKEN): /api/collect, /api/collect-daily 에만, 내부 직접 요청에서만 통한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuth } from "../auth.mjs";
import { createJsonStore } from "../auth-store.mjs";

const TOKEN = "t".repeat(20) + "0123456789abcdefghij";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "collect-token-"));
const env = { KAKAO_REST_API_KEY: "k", KAKAO_CLIENT_SECRET: "s", SESSION_SECRET: "x".repeat(40), COLLECT_TOKEN: TOKEN };
const mk = (e = env) => createAuth({ env: e, store: createJsonStore(path.join(tmp, `${Math.random()}.json`)), log: () => {} });
const req = (method, p, headers = {}) => ({ method, url: p, headers });
const guard = (a, method, p, headers) => a.guard(req(method, p, headers), new URL(`http://weather-hub:8080${p}`));

test("valid token opens only the two collect endpoints", async () => {
  const a = mk();
  assert.match(a.startupLine, /collect token on \(internal only\)/);
  assert.ok(!a.startupLine.includes(TOKEN));
  for (const p of ["/api/collect", "/api/collect-daily"]) {
    const r = req("POST", p, { authorization: `Bearer ${TOKEN}` });
    assert.equal(await a.guard(r, new URL(`http://x${p}`)), null);
    assert.equal(r._collectToken, true);
    assert.equal(await guard(a, "POST", p, { "x-collect-token": TOKEN }), null);
  }
  // 다른 쓰기·관리 경로는 토큰으로 열리지 않는다
  assert.equal((await guard(a, "POST", "/api/key", { authorization: `Bearer ${TOKEN}` })).status, 403);
  assert.equal((await guard(a, "POST", "/api/stations/toggle", { authorization: `Bearer ${TOKEN}` })).status, 403);
  assert.equal((await guard(a, "GET", "/api/gaps", { authorization: `Bearer ${TOKEN}` })).status, 401);
  assert.equal((await guard(a, "GET", "/api/collect", { authorization: `Bearer ${TOKEN}` })), null); // GET 은 원래 공개(정적 404)
});

test("missing / wrong / proxied token is rejected; session flow unchanged", async () => {
  const a = mk();
  assert.equal((await guard(a, "POST", "/api/collect", {})).status, 403); // 기존과 동일(csrf)
  assert.equal((await guard(a, "POST", "/api/collect", { origin: "https://weather.nuni.co.kr", host: "weather.nuni.co.kr" })).status, 401); // 기존과 동일(로그인 필요)
  assert.equal((await guard(a, "POST", "/api/collect", { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await guard(a, "POST", "/api/collect", { authorization: `Bearer ${TOKEN}x` })).body.auth, "token");
  assert.equal((await guard(a, "POST", "/api/collect", { authorization: `Bearer ${TOKEN}`, "x-forwarded-for": "1.2.3.4" })).status, 401);
  const b = mk({ ...env, COLLECT_TOKEN_ALLOW_PROXIED: "1" });
  assert.equal(await guard(b, "POST", "/api/collect", { authorization: `Bearer ${TOKEN}`, "x-forwarded-for": "1.2.3.4" }), null);
});

test("short or missing COLLECT_TOKEN disables token auth", async () => {
  for (const COLLECT_TOKEN of [undefined, "", "short-token"]) {
    const a = mk({ ...env, COLLECT_TOKEN });
    assert.doesNotMatch(a.startupLine, /collect token/);
    assert.equal((await guard(a, "POST", "/api/collect", { authorization: `Bearer ${COLLECT_TOKEN || "x"}` })).status, 403);
  }
});
