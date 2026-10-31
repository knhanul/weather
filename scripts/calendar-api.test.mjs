// 특정일 캘린더 API 시험: 공개 조회는 누구나, 전체 행(?all=1)·쓰기는 관리자만(auth.guard·isAdmin), 저장은 JSON 파일.
// 로그인 기능이 꺼진 개발 모드(auth disabled)에서도 그대로 동작하는지 함께 본다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuth } from "../auth.mjs";
import { createJsonStore } from "../auth-store.mjs";
import { createJsonEventStore, seedRows } from "../calendar-events.mjs";
import { createCalendarApi } from "../calendar-api.mjs";

const SECRET = "calendar-api-test-secret-0123456789abcdef";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cal-api-"));
const tokens = {};
let srv, base, offSrv, offBase;

// auth 켜짐 서버(카카오 키가 있는 것처럼) — 관리자 1명, 승인 대기 1명
async function bootOn() {
  const store = createJsonStore(path.join(tmp, "auth.json"));
  const auth = createAuth({ env: { KAKAO_REST_API_KEY: "k", KAKAO_CLIENT_SECRET: "s", SESSION_SECRET: SECRET, COOKIE_SECURE: "0" }, store, log: () => {} });
  for (const [name, status] of [["admin", "approved"], ["wait", "pending"]]) {
    const kakaoId = `7000${name}`;
    await store.upsertLogin({ kakaoId, nickname: name, profileImage: null });
    if (status !== "pending") await store.setStatus(kakaoId, status, "test");
    const token = crypto.randomBytes(24).toString("base64url");
    await store.createSession({ idHash: crypto.createHmac("sha256", SECRET).update(`session:${token}`).digest("base64url"), kakaoId, expiresAt: new Date(Date.now() + 3600000) });
    tokens[name] = token;
  }
  return auth;
}
const json = (res, d, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(d)); };
const readBody = async (req) => { let b = ""; for await (const c of req) b += c; try { return JSON.parse(b || "{}") } catch { return {}; } };
const serve = async (auth, store) => {
  const handle = createCalendarApi({ store, json, readBody, isAdmin: (r) => auth.isAdmin(r), log: () => {} });
  const s = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const denied = await auth.guard(req, url);
    if (denied) return json(res, denied.body, denied.status);
    if (await handle(req, res, url)) return;
    json(res, { ok: false, message: "not found" }, 404);
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, base: `http://127.0.0.1:${s.address().port}` };
};

before(async () => {
  const auth = await bootOn();
  const on = await serve(auth, createJsonEventStore(path.join(tmp, "events.json")));
  srv = on.s; base = on.base;
  // 로그인 기능이 꺼진 개발 모드(isAdmin 은 늘 true, guard 통과)
  const off = await serve(createAuth({ env: {} }), createJsonEventStore(path.join(tmp, "events-off.json")));
  offSrv = off.s; offBase = off.base;
});
after(() => { srv.close(); offSrv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(who, method, p, body, { base: b = base, origin = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (who && tokens[who]) headers.cookie = `nw_session=${tokens[who]}`;
  if (origin) headers.origin = b;
  const r = await fetch(b + "/api/calendar" + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}

test("공개 조회: 누구나 200, 시드 전에는 빈 배열", async () => {
  const r = await call(null, "GET", "/events?from=2025&to=2026");
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.version, "calendar-events.v1");
  assert.deepEqual(r.data.events, []);
  assert.deepEqual(r.data.errors, []);
});

test("?all=1 과 쓰기는 관리자만 — 익명 403, 승인 대기 403, 관리자 200", async () => {
  assert.equal((await call(null, "GET", "/events?all=1")).status, 403);
  assert.equal((await call("wait", "GET", "/events?all=1")).status, 403);
  assert.deepEqual((await call(null, "GET", "/events?all=1")).data, { ok: false, auth: "admin", message: "관리자만 볼 수 있습니다." });
  assert.equal((await call("admin", "GET", "/events?all=1")).status, 200);
  // 쓰기: 익명 403(로그인), 다른 사이트에서 온 요청 403(csrf)
  assert.equal((await call(null, "POST", "/seed", {})).status, 401); // 로그인 안 함 = 401(auth.guard 의 기존 응답 모양)
  assert.equal((await call("admin", "POST", "/seed", {}, { origin: false })).data.auth, "csrf");
  assert.equal((await call("wait", "POST", "/seed", {})).status, 403); // 승인 대기 = 403
});

test("시드 → 해석 조회에 설날·추석·수능이 나온다", async () => {
  const r = await call("admin", "POST", "/seed", {});
  assert.equal(r.status, 200);
  assert.equal(r.data.added, seedRows().length);
  // 다시 눌러도 늘지 않는다
  assert.equal((await call("admin", "POST", "/seed", {})).data.added, 0);
  const g = await call(null, "GET", "/events?from=2026&to=2026");
  const labels = g.data.events.map((e) => `${e.solarDate} ${e.label}`);
  assert.ok(labels.includes("2026-02-17 설날"), labels.join("\n"));
  assert.ok(labels.includes("2026-09-25 추석"));
  assert.ok(labels.includes("2026-11-19 2027학년도 대학수학능력시험"));
  const all = await call("admin", "GET", "/events?all=1");
  assert.deepEqual(all.data.kinds.map((k) => k.id), ["csat", "hakryeok", "holiday", "custom"]);
});

test("추가·수정·삭제: 검증 실패는 400, 없는 id 는 404", async () => {
  const bad = await call("admin", "POST", "/events", { label: "", cal: "solar", month: 1, day: 1 });
  assert.equal(bad.status, 400);
  assert.equal((await call("admin", "POST", "/events", { label: "x", cal: "solar", month: 2, day: 30 })).status, 400);
  const ok = await call("admin", "POST", "/events", { kind: "custom", label: "창립기념일", cal: "lunar", month: 4, day: 15, leap: true, year: 2026, yearLabel: "2026년", note: "시험" });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.event.yearLabel, "2026년");
  assert.equal(ok.data.event.leap, true);
  const id = ok.data.event.id;
  const put = await call("admin", "PUT", `/events/${id}`, { label: "창립 기념일", cal: "solar", leap: false });
  assert.equal(put.status, 200);
  assert.equal(put.data.event.label, "창립 기념일");
  assert.equal(put.data.event.cal, "solar");
  assert.equal(put.data.event.leap, false); // 양력으로 바꾸면 윤달 표시는 꺼진다
  assert.equal((await call("admin", "PUT", `/events/${id}`, { month: 2, day: 30 })).status, 400);
  assert.equal((await call("admin", "PUT", "/events/cal_nope", { label: "x" })).status, 404);
  assert.equal((await call("admin", "DELETE", `/events/${id}`)).status, 200);
  assert.equal((await call("admin", "DELETE", `/events/${id}`)).status, 404);
});

test("가져오기: 줄 단위 오류는 모으고 나머지는 저장, 같은 내용은 갱신", async () => {
  const r = await call("admin", "POST", "/import", { text: "2027-01-01 새해\n음력 08-15 추석\n음력 08-15 추석\n깨진 줄", kind: "holiday" });
  assert.equal(r.status, 200);
  assert.equal(r.data.added, 1); // 새해(새 줄)
  assert.equal(r.data.updated, 1); // 추석 = 시드 규칙과 같은 내용이라 새 행을 만들지 않고 그 행을 갱신(같은 줄이 두 번 있어도 한 번)
  assert.equal(r.data.errors.length, 1);
  assert.equal(r.data.errors[0].line, 4);
  const again = await call("admin", "POST", "/import", { text: "2027-01-01 새해", kind: "holiday" });
  assert.deepEqual([again.data.added, again.data.updated], [0, 1]);
  assert.equal((await call("admin", "POST", "/import", { text: "   " })).status, 400);
});

test("가져오기: 캘린더 파일(.ics)도 같은 상자에서 받는다", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270101",
    "SUMMARY:새해 첫날",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270405",
    "RRULE:FREQ=YEARLY",
    "SUMMARY:식목일",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = await call("admin", "POST", "/import", { text: ics, kind: "holiday" });
  assert.equal(r.status, 200);
  assert.equal(r.data.format, "ics");
  assert.equal(r.data.added, 2);
  assert.deepEqual(r.data.errors, []);
  const g = await call(null, "GET", "/events?from=2027&to=2027");
  const labels = g.data.events.map((e) => `${e.solarDate} ${e.label}`);
  assert.ok(labels.includes("2027-01-01 새해 첫날"), labels.join("\n"));
  assert.ok(labels.includes("2027-04-05 식목일")); // RRULE:FREQ=YEARLY → 매년 규칙
  // 매년 규칙이므로 이듬해에도 나온다
  const g28 = await call(null, "GET", "/events?from=2028&to=2028");
  assert.ok(g28.data.events.map((e) => `${e.solarDate} ${e.label}`).includes("2028-04-05 식목일"));
  // 같은 파일을 다시 넣어도 중복이 생기지 않는다
  assert.equal((await call("admin", "POST", "/import", { text: ics, kind: "holiday" })).data.added, 0);
  // 글 형식은 format=text 로 알려 준다
  assert.equal((await call("admin", "POST", "/import", { text: "12-25 크리스마스", kind: "holiday" })).data.format, "text");
});

test("연도 범위: 기본값은 1970~올해, 1900~2050 으로 자른다", async () => {
  const thisYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
  const dflt = await call(null, "GET", "/events");
  assert.ok(dflt.data.events.length > 0);
  const years = dflt.data.events.map((e) => +e.solarDate.slice(0, 4));
  assert.ok(Math.min(...years) >= 1970 && Math.max(...years) <= thisYear);
  const wide = await call(null, "GET", "/events?from=1800&to=3000");
  const wy = wide.data.events.map((e) => +e.solarDate.slice(0, 4));
  assert.ok(Math.min(...wy) >= 1900 && Math.max(...wy) <= 2050);
});

test("로그인 기능이 꺼진 개발 모드에서도 관리자 화면 기능이 그대로 된다", async () => {
  const seed = await call(null, "POST", "/seed", {}, { base: offBase, origin: false });
  assert.equal(seed.status, 200);
  assert.equal(seed.data.added, seedRows().length);
  assert.equal((await call(null, "GET", "/events?all=1", undefined, { base: offBase })).status, 200);
});
