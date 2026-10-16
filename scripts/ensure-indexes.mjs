// 운영 DB 색인 확인·추가(이미 있으면 아무것도 안 함). 사용: MYSQL_URL=... node scripts/ensure-indexes.mjs
import * as my from "../db-mysql.mjs";
await my.init(process.env.MYSQL_URL);
const added = await my.ensureIndexes();
console.log(added.length ? `added: ${added.join(", ")}` : "no-op: all indexes already exist");
process.exit(0);
