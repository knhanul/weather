#!/usr/bin/env node
// 누니날씨 카카오 로그인 사용자 승인/차단 도구
//   node scripts/approve-user.mjs --list              사용자 목록
//   node scripts/approve-user.mjs <kakao_id>          승인(관리자 권한)
//   node scripts/approve-user.mjs --block <kakao_id>  차단(로그인 세션도 삭제)
//   node scripts/approve-user.mjs --pending <kakao_id> 승인 취소(대기로)
// DB: DATABASE_URL 환경변수 → 없으면 /etc/weather-hub.env의 DATABASE_URL → 없으면 로컬 data/auth.json (--json으로 강제)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPgStore, createJsonStore } from "../auth-store.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const rest = args.filter((a) => !a.startsWith("--"));

function envFileUrl() {
  try {
    const line = fs.readFileSync("/etc/weather-hub.env", "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    return line ? line.replace(/^\s*DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim() : null;
  } catch {
    return null;
  }
}

function usage(code = 0) {
  console.log(`사용법:
  node scripts/approve-user.mjs --list
  node scripts/approve-user.mjs <kakao_id>            승인
  node scripts/approve-user.mjs --block <kakao_id>    차단
  node scripts/approve-user.mjs --pending <kakao_id>  대기로 되돌림`);
  process.exit(code);
}
if (flag("--help") || flag("-h") || (!flag("--list") && rest.length !== 1)) usage(flag("--help") || flag("-h") ? 0 : 1);

const url = flag("--json") ? null : process.env.DATABASE_URL?.trim() || envFileUrl();
let pool = null;
let store;
if (url) {
  const { default: pg } = await import("pg");
  pool = new pg.Pool({ connectionString: url, max: 2 });
  store = createPgStore(pool);
} else {
  store = createJsonStore(process.env.AUTH_FILE || path.join(root, "data", "auth.json"));
}
const label = { pending: "승인 대기", approved: "승인됨(관리자)", blocked: "차단" };
const adminIds = new Set(String(process.env.ADMIN_KAKAO_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));

try {
  await store.ensureSchema();
  if (flag("--list")) {
    const users = await store.listUsers();
    console.log(`저장소: ${store.kind} · 사용자 ${users.length}명`);
    if (!users.length) console.log("(아직 로그인한 사용자가 없습니다. 먼저 누니날씨에서 카카오 로그인을 한 번 하세요.)");
    for (const u of users) {
      console.log(`${u.kakao_id.padEnd(14)} ${String(u.nickname || "").padEnd(12)} ${label[u.status] || u.status}${adminIds.has(u.kakao_id) ? " +ADMIN_KAKAO_IDS" : ""}  최근 로그인 ${u.last_login_at || "-"}`);
    }
  } else {
    const id = rest[0];
    if (!/^\d{1,20}$/.test(id)) throw new Error(`카카오 회원번호는 숫자여야 합니다: ${id}`);
    const status = flag("--block") ? "blocked" : flag("--pending") ? "pending" : "approved";
    const u = await store.setStatus(id, status, "approve-user.mjs");
    if (!u) throw new Error(`사용자 ${id}를 찾지 못했습니다. --list로 회원번호를 확인하세요(한 번 로그인해야 목록에 생깁니다).`);
    console.log(`${u.kakao_id} ${u.nickname || ""} → ${label[u.status]}`);
  }
} catch (err) {
  console.error("오류:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
