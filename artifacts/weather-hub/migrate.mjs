import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const force = process.argv.includes("--force");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 이 없습니다. /etc/weather-hub.env 를 확인하세요.");
  process.exit(1);
}

const ok = await db.initDb();
if (!ok) {
  console.error("PostgreSQL 연결 실패");
  process.exit(1);
}
const summary = await db.migrateFromJson(DATA, { force });
console.log("마이그레이션 완료", summary);
process.exit(0);
