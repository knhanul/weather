// 시간별·일별 날씨 보기(/api/view: 고른 컬럼만·페이지) + 사용자별 보기 설정(/api/view-prefs: 본인만, 비로그인 401)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createAuth } from "../auth.mjs";
import { createJsonStore } from "../auth-store.mjs";
import { handleLayouts, createJsonLayoutStore } from "../layouts.mjs";
import { handlePrefs, createJsonPrefsStore } from "../view-prefs.mjs";
import { getExportCatalog, EXPORT_PRESETS } from "../kma-fields.mjs";

// ---------- /api/view (JSON 대체 모드 서버, data/hourly.json 108 지점 2026-09-05~09-11)
const PORT = 8093;
const B = `http://127.0.0.1:${PORT}`;
let proc;
before(async () => {
  proc = spawn(process.execPath, ["server.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATABASE_URL: "", DB_DRIVER: "", KAKAO_REST_API_KEY: "", NUNI_ID_CLIENT_ID: "" }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${B}/api/stations`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
});
after(() => proc && proc.kill());
const get = async (q) => {
  const r = await fetch(`${B}/api/view?${q}`);
  return { status: r.status, body: await r.json() };
};
const RANGE = "stationId=108&from=2026-09-05%2000:00:00&to=2026-09-11%2023:00:00";

test("view hourly: 고른 컬럼만, 레이아웃 순서 그대로(필수 식별 컬럼은 앞), 단위·이름 메타", async () => {
  const { status, body } = await get(`kind=hourly&${RANGE}&columns=humidity,temperature&pageSize=5`);
  assert.equal(status, 200);
  assert.deepEqual(body.columns.map((c) => c.key), ["observation_datetime", "station_id", "humidity", "temperature"]);
  assert.equal(body.columns.find((c) => c.key === "temperature").unit, "°C");
  assert.equal(body.rows.length, 5);
  for (const r of body.rows) assert.deepEqual(Object.keys(r).sort(), ["humidity", "observation_datetime", "source_kind", "station_id", "temperature"].sort());
});
test("view hourly: 페이지를 이어 붙이면 한 번에 받은 것과 같고, 합계는 CSV 행 수와 같다", async () => {
  const all = (await get(`kind=hourly&${RANGE}&columns=temperature,precipitation&pageSize=1000`)).body;
  const pages = [];
  for (let p = 1; ; p++) {
    const b = (await get(`kind=hourly&${RANGE}&columns=temperature,precipitation&pageSize=97&page=${p}`)).body;
    pages.push(...b.rows);
    assert.equal(b.total, all.total);
    if (p >= b.pages) break;
  }
  assert.deepEqual(pages, all.rows);
  assert.ok(all.total > 100);
  const csv = await (await fetch(`${B}/api/export?kind=hourly&${RANGE}&columns=observation_datetime,station_id,temperature,precipitation`)).text();
  const lines = csv.trim().split("\n").filter((l) => !l.startsWith("\uFEFF#") && !l.startsWith("#"));
  assert.equal(lines.length - 1, all.total, "CSV 데이터 행 수 = view 합계");
  const first = lines[1].split(",");
  assert.equal(first[0], all.rows[0].observation_datetime);
  assert.equal(Number(first[2]), all.rows[0].temperature);
});
test("view hourly: 끝 시각이 'HH:MM' 이어도 그 시각 행이 들어간다", async () => {
  const b = (await get(`kind=hourly&stationId=108&from=2026-09-05%2000:00&to=2026-09-05%2003:00&columns=temperature`)).body;
  assert.deepEqual(b.rows.map((r) => r.observation_datetime.slice(11, 16)), ["00:00", "01:00", "02:00", "03:00"]);
});
test("view daily: 시간자료 집계(DERIVED)도 출처와 함께, 고른 컬럼만", async () => {
  const { status, body } = await get(`kind=daily&stationId=108&from=2026-09-05&to=2026-09-11&columns=max_temperature,min_temperature`);
  assert.equal(status, 200);
  assert.deepEqual(body.columns.map((c) => c.key), ["observation_date", "station_id", "max_temperature", "min_temperature"]);
  assert.equal(body.total, 7);
  assert.ok(body.rows.every((r) => r.source_kind === "DERIVED" && "max_temperature" in r && !("avg_temperature" in r)));
});
test("view: 잘못된 입력은 400 (종류·날짜 형식·일자료 기간 한도·지점)", async () => {
  assert.equal((await get("kind=weekly")).status, 400);
  assert.equal((await get("kind=daily&from=2026/09/01")).status, 400);
  assert.equal((await get("kind=daily&from=2000-01-01&to=2026-01-01")).status, 400);
  assert.equal((await get("kind=daily&from=2026-09-10&to=2026-09-01")).status, 400);
  assert.equal((await get("kind=hourly&stationId=abc")).status, 400);
  const unknown = (await get(`kind=hourly&${RANGE}&columns=temperature,not_a_col&pageSize=1`)).body;
  assert.deepEqual(unknown.columns.map((c) => c.key), ["observation_datetime", "station_id", "temperature"], "모르는 컬럼은 버림");
});
test("기존 /api/hourly · /api/daily 응답 형태는 그대로", async () => {
  const h = await (await fetch(`${B}/api/hourly?${RANGE}&pageSize=2`)).json();
  assert.deepEqual(Object.keys(h).sort(), ["data", "from", "page", "pageSize", "pages", "station_id", "timezone", "to", "total"]);
  const d = await (await fetch(`${B}/api/daily?stationId=108&from=2026-09-05&to=2026-09-06`)).json();
  assert.deepEqual(Object.keys(d).sort(), ["data", "from", "station_id", "timezone", "to"]);
});

// ---------- /api/view-prefs
const SECRET = "view-prefs-test-session-secret-0123456789abcdef";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "viewprefs-"));
let srv, base;
const tokens = {};
const keys = (kind) => new Set(getExportCatalog(kind, { fullFields: true }).map((c) => c.key));
const presetIds = (kind) => new Set(EXPORT_PRESETS.filter((p) => p.kind === kind).map((p) => p.id));
before(async () => {
  const store = createJsonStore(path.join(tmp, "auth.json"));
  const auth = createAuth({ env: { KAKAO_REST_API_KEY: "k", KAKAO_CLIENT_SECRET: "s", SESSION_SECRET: SECRET, COOKIE_SECURE: "0" }, store, log: () => {} });
  const layoutStore = createJsonLayoutStore(path.join(tmp, "layouts.json"));
  const prefsStore = createJsonPrefsStore(path.join(tmp, "prefs.json"));
  for (const [name, status] of [["a", "pending"], ["b", "approved"], ["c", "blocked"]]) {
    const kakaoId = `8000${name.charCodeAt(0)}`;
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
    const ownerOf = (r) => auth.ownerOf(r);
    if (await handleLayouts(req, res, url, { store: layoutStore, ownerOf, allowedKeys: keys, readBody, json })) return;
    if (await handlePrefs(req, res, url, { store: prefsStore, layoutStore, ownerOf, presetIds, readBody, json })) return;
    json(res, { ok: false }, 404);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv && srv.close());
async function call(who, method, p, body, { origin = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (who) headers.cookie = `nw_session=${tokens[who]}`;
  if (origin && method !== "GET") headers.origin = base;
  const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
test("prefs: 비로그인은 읽기·쓰기 모두 401(브라우저 저장만)", async () => {
  assert.equal((await call(null, "GET", "/api/view-prefs")).status, 401);
  assert.equal((await call(null, "PUT", "/api/view-prefs", { kind: "hourly", view: "card" })).status, 401);
});
test("prefs: 차단 계정 거절, 다른 사이트(CSRF) 쓰기 403", async () => {
  assert.notEqual((await call("c", "PUT", "/api/view-prefs", { kind: "hourly", view: "card" })).status, 200);
  assert.equal((await call("b", "PUT", "/api/view-prefs", { kind: "hourly", view: "card" }, { origin: false })).status, 403);
});
test("prefs: 종류별로 보기 방식·레이아웃 저장, 남의 레이아웃·다른 종류 프리셋은 거절", async () => {
  let r = await call("b", "PUT", "/api/view-prefs", { kind: "hourly", view: "card" });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.pref.view, r.body.pref.layout], ["card", null]);
  r = await call("b", "PUT", "/api/view-prefs", { kind: "hourly", layout: "preset:preset_hourly_temp" });
  assert.deepEqual([r.body.pref.view, r.body.pref.layout], ["card", "preset:preset_hourly_temp"], "view 는 그대로, layout 만 바뀜");
  assert.equal((await call("b", "PUT", "/api/view-prefs", { kind: "hourly", layout: "preset:preset_daily_temp" })).status, 400);
  assert.equal((await call("b", "PUT", "/api/view-prefs", { kind: "hourly", view: "table" })).status, 400);
  assert.equal((await call("b", "PUT", "/api/view-prefs", { kind: "weekly", view: "card" })).status, 400);
  // a 의 레이아웃 id 를 b 가 쓰려 하면 400 (있는지조차 드러내지 않음)
  const la = (await call("a", "POST", "/api/export/layouts", { kind: "daily", name: "a 일별", columns: ["observation_date", "station_id", "precipitation"] })).body.layout;
  assert.equal((await call("b", "PUT", "/api/view-prefs", { kind: "daily", layout: `custom:${la.id}` })).status, 400);
  // 본인 것은 됨, 종류가 다르면 안 됨
  assert.equal((await call("a", "PUT", "/api/view-prefs", { kind: "daily", layout: `custom:${la.id}` })).status, 200);
  assert.equal((await call("a", "PUT", "/api/view-prefs", { kind: "hourly", layout: `custom:${la.id}` })).status, 400);
  // 각자 자기 것만 보임
  const pa = (await call("a", "GET", "/api/view-prefs")).body.prefs;
  const pb = (await call("b", "GET", "/api/view-prefs")).body.prefs;
  assert.equal(pa.daily.layout, `custom:${la.id}`);
  assert.equal(pa.hourly, null);
  assert.equal(pb.hourly.view, "card");
  assert.equal(pb.daily, null);
  // layout: null 로 되돌리기
  assert.equal((await call("a", "PUT", "/api/view-prefs", { kind: "daily", layout: null })).body.pref.layout, null);
});

test("migrations: view_prefs 는 새 표만 추가(MySQL InnoDB·utf8mb4_bin, 기본 키 767바이트 이하 / PostgreSQL)", () => {
  const my = fs.readFileSync(new URL("../migrations/mysql/0004_view_prefs.sql", import.meta.url), "utf8");
  const pg = fs.readFileSync(new URL("../migrations/hub/0005_view_prefs.sql", import.meta.url), "utf8");
  for (const sql of [my, pg]) {
    const code = sql.replace(/--.*$/gm, "");
    assert.match(code, /CREATE TABLE IF NOT EXISTS view_prefs/);
    assert.doesNotMatch(code, /\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/i);
    assert.equal(code.split(";").filter((x) => x.trim()).length, 1);
  }
  assert.match(my, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin/);
  const len = (name) => Number(new RegExp(`${name} VARCHAR\\((\\d+)\\)`).exec(my)[1]);
  assert.ok((len("owner_id") + len("kind")) * 4 <= 767);
});
