#!/usr/bin/env node
// PostgreSQL(weatherhub) → MySQL(NAS) 자료 복사·검증 도구. 앱과 같은 이미지(pg + mysql2)에서 실행한다.
//   DATABASE_URL=postgres://… MYSQL_URL=mysql://… node scripts/pg-to-mysql.mjs copy   [--tables a,b]
//   DATABASE_URL=… MYSQL_URL=… node scripts/pg-to-mysql.mjs verify [--tables a,b]
// - MySQL 스키마는 앱과 같은 migrations/mysql 로 먼저 만든다.
// - copy 는 다시 실행해도 안전: 큰 표(observations_*)는 UPSERT, 작은 표는 MySQL 쪽을 비우고 통째로 다시 넣는다.
// - verify 는 표마다 행 수 + 행 내용 SHA-256(기본키 순, 시간자료는 지점별)을 양쪽에서 계산해 비교한다.
//   숫자는 JS Number, 시각은 UTC 마이크로초 문자열, boolean 은 1/0, JSON(raw·columns)은 키 정렬 후 비교.
// 비밀값(접속 주소)은 출력하지 않는다.
import crypto from "node:crypto";
import pg from "pg";
import { createMysqlPool, applyMysqlMigrations } from "../db-mysql.mjs";
import * as my from "../db-mysql.mjs";

const TABLES = {
  // name: { key: [...], big, jsonCols }
  weather_stations: { key: ["station_id"] },
  hub_settings: { key: ["k"] },
  hub_migrations: { key: ["name"], skipCopy: true },
  collect_jobs: { key: ["id"] },
  export_layouts: { key: ["id"], jsonCols: ["columns"] },
  app_users: { key: ["kakao_id"] },
  app_sessions: { key: ["id_hash"] },
  observations_daily: { key: ["station_id", "observation_date"], big: true, jsonCols: ["raw"] },
  observations_hourly: { key: ["station_id", "observation_datetime", "provider", "dataset"], big: true, jsonCols: ["raw"] },
};
const ORDER = ["weather_stations", "hub_settings", "hub_migrations", "collect_jobs", "export_layouts", "app_users", "app_sessions", "observations_daily", "observations_hourly"];

const args = process.argv.slice(2);
const cmd = args[0];
const tIdx = args.indexOf("--tables");
const only = tIdx >= 0 ? new Set(args[tIdx + 1].split(",")) : null;
const tables = ORDER.filter((t) => !only || only.has(t));
if (!["copy", "verify"].includes(cmd)) {
  console.error("usage: pg-to-mysql.mjs copy|verify [--tables a,b]");
  process.exit(2);
}

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const mp = await createMysqlPool(process.env.MYSQL_URL);
const mq = async (sql, params = []) => (await mp.query({ sql, timeout: 600000 }, params))[0];
const qi = (c) => `\`${c}\``;

async function pgColumns(t) {
  const r = await pgPool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t]);
  return r.rows;
}
async function myColumns(t) {
  return (await mq(`SELECT column_name AS c, data_type AS d FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`, [t]));
}
// pg 쪽 SELECT 식: timestamptz 는 UTC 마이크로초 문자열, jsonb 는 그대로(객체로 받음)
function pgExpr(c) {
  if (c.data_type === "timestamp with time zone") return `to_char(${c.column_name} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS ${c.column_name}`;
  if (c.data_type === "bigint") return `${c.column_name}::text AS ${c.column_name}`;
  return `"${c.column_name}"`;
}
function myExpr(c) {
  if (c.d === "datetime") return `DATE_FORMAT(${qi(c.c)}, '%Y-%m-%d %H:%i:%s.%f') AS ${qi(c.c)}`;
  if (c.d === "bigint") return `CAST(${qi(c.c)} AS CHAR) AS ${qi(c.c)}`;
  return qi(c.c);
}
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
function canon(v, isJson) {
  if (v === null || v === undefined) return "\u2205";
  if (isJson) return JSON.stringify(sortKeys(typeof v === "string" ? JSON.parse(v) : v));
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return `n${v}`;
  return `s${v}`;
}
function toMy(v, isJson, isBool) {
  if (v === null || v === undefined) return null;
  if (isJson) return JSON.stringify(v);
  if (isBool) return v ? 1 : 0;
  return v;
}

async function commonCols(t) {
  const pc = await pgColumns(t);
  const mc = await myColumns(t);
  const mset = new Set(mc.map((c) => c.c));
  const cols = pc.filter((c) => mset.has(c.column_name));
  const missing = pc.filter((c) => !mset.has(c.column_name)).map((c) => c.column_name);
  if (missing.length) throw new Error(`${t}: MySQL 에 없는 열 ${missing.join(",")}`);
  return { pc: cols, mc: cols.map((c) => mc.find((m) => m.c === c.column_name)) };
}

// 기본키 순으로 pg 행을 묶음 단위로 읽는다(keyset). where: 추가 조건(시간자료 지점별)
async function* pgRows(t, pc, key, where = null, whereVal = null, size = 5000) {
  const sel = pc.map(pgExpr).join(", ");
  let last = null;
  for (;;) {
    const conds = [];
    const vals = [];
    if (where) {
      vals.push(whereVal);
      conds.push(`${where} = $${vals.length}`);
    }
    if (last) {
      const ph = key.map((k) => {
        vals.push(last[k]);
        return `$${vals.length}`;
      });
      conds.push(`(${key.join(", ")}) > (${ph.join(", ")})`);
    }
    const r = await pgPool.query(`SELECT ${sel} FROM ${t} ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY ${key.join(", ")} LIMIT ${size}`, vals);
    if (!r.rows.length) return;
    yield r.rows;
    last = r.rows[r.rows.length - 1];
    if (r.rows.length < size) return;
  }
}
async function* myRows(t, mc, key, where = null, whereVal = null, size = 5000) {
  const sel = mc.map(myExpr).join(", ");
  let last = null;
  for (;;) {
    const conds = [];
    const vals = [];
    if (where) {
      conds.push(`${qi(where)} = ?`);
      vals.push(whereVal);
    }
    if (last) {
      conds.push(`(${key.map(qi).join(", ")}) > (${key.map(() => "?").join(", ")})`);
      vals.push(...key.map((k) => last[k]));
    }
    const rows = await mq(`SELECT ${sel} FROM ${t} ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY ${key.map(qi).join(", ")} LIMIT ${size}`, vals);
    if (!rows.length) return;
    yield rows;
    last = rows[rows.length - 1];
    if (rows.length < size) return;
  }
}

async function partitions(t) {
  if (t !== "observations_hourly" && t !== "observations_daily") return [null];
  const r = await pgPool.query(`SELECT DISTINCT station_id FROM ${t} ORDER BY station_id`);
  const m = await mq(`SELECT DISTINCT station_id FROM ${t} ORDER BY station_id`);
  return [...new Set([...r.rows.map((x) => x.station_id), ...m.map((x) => x.station_id)])].sort();
}

async function copyTable(t) {
  const spec = TABLES[t];
  const { pc, mc } = await commonCols(t);
  const names = pc.map((c) => c.column_name);
  const jsonSet = new Set(spec.jsonCols || []);
  const boolSet = new Set(pc.filter((c) => c.data_type === "boolean").map((c) => c.column_name));
  const extraCols = t === "export_layouts" ? ["default_marker"] : [];
  const allCols = [...names, ...extraCols];
  const nonKey = allCols.filter((c) => !spec.key.includes(c));
  const conn = await mp.getConnection();
  const run = async (sql, p = []) => (await conn.query({ sql, timeout: 600000 }, p))[0];
  let n = 0;
  try {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    if (!spec.big) await run(`DELETE FROM ${t}`);
    for (const part of await partitions(t)) {
      const gen = pgRows(t, pc, spec.key, part ? "station_id" : null, part, spec.big ? 2000 : 5000);
      for await (const rows of gen) {
        // 1MB 패킷 제한 안으로 잘라 넣는다
        let batch = [];
        let bytes = 0;
        const flush = async () => {
          if (!batch.length) return;
          const ph = `(${allCols.map(() => "?").join(",")})`;
          await run(
            `INSERT INTO ${t} (${allCols.map(qi).join(", ")}) VALUES ${batch.map(() => ph).join(",")}` +
              (nonKey.length ? ` ON DUPLICATE KEY UPDATE ${nonKey.map((c) => `${qi(c)} = VALUES(${qi(c)})`).join(", ")}` : ` ON DUPLICATE KEY UPDATE ${qi(spec.key[0])} = ${qi(spec.key[0])}`),
            batch.flat(),
          );
          n += batch.length;
          batch = [];
          bytes = 0;
        };
        for (const r of rows) {
          const vals = names.map((c) => toMy(r[c], jsonSet.has(c), boolSet.has(c)));
          if (t === "export_layouts") vals.push(r.is_default ? 1 : null);
          const size = vals.reduce((s, v) => s + (v == null ? 4 : String(v).length * 3 + 4), 0);
          if (bytes + size > 600 * 1024 || batch.length >= 400) await flush();
          batch.push(vals);
          bytes += size;
        }
        await flush();
      }
      if (part) process.stdout.write(`  ${t} ${part} → ${n}\n`);
    }
    await run("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
  return n;
}

async function hashSide(gen, names, jsonSet) {
  const h = crypto.createHash("sha256");
  let n = 0;
  for await (const rows of gen) {
    for (const r of rows) {
      h.update(names.map((c) => canon(r[c], jsonSet.has(c))).join("\u001f"));
      h.update("\u001e");
      n += 1;
    }
  }
  return { n, sha: h.digest("hex").slice(0, 16) };
}

async function verifyTable(t) {
  const spec = TABLES[t];
  const { pc, mc } = await commonCols(t);
  const names = pc.map((c) => c.column_name);
  const jsonSet = new Set(spec.jsonCols || []);
  const out = [];
  for (const part of await partitions(t)) {
    const [a, b] = await Promise.all([
      hashSide(pgRows(t, pc, spec.key, part ? "station_id" : null, part), names, jsonSet),
      hashSide(myRows(t, mc, spec.key, part ? "station_id" : null, part), names, jsonSet),
    ]);
    out.push({ table: t, part: part || "-", pg_rows: a.n, mysql_rows: b.n, pg_sha: a.sha, mysql_sha: b.sha, ok: a.n === b.n && a.sha === b.sha });
  }
  return out;
}

try {
  // 스키마(앱과 같은 마이그레이션)
  await my.init(process.env.MYSQL_URL);
  void applyMysqlMigrations;
  if (cmd === "copy") {
    for (const t of tables) {
      if (TABLES[t].skipCopy) continue;
      const t0 = Date.now();
      const n = await copyTable(t);
      console.log(`copy ${t}: ${n} rows (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  } else {
    let bad = 0;
    for (const t of tables) {
      if (TABLES[t].skipCopy) {
        const a = (await pgPool.query(`SELECT name FROM ${t} ORDER BY name`)).rows.map((r) => r.name);
        const b = (await mq(`SELECT name FROM ${t} ORDER BY name`)).map((r) => r.name);
        console.log(`${t}: pg=[${a.join(", ")}] mysql=[${b.join(", ")}] (기록만, 비교 대상 아님)`);
        continue;
      }
      for (const r of await verifyTable(t)) {
        if (!r.ok) bad += 1;
        console.log(`${r.ok ? "OK  " : "DIFF"} ${r.table.padEnd(20)} ${String(r.part).padEnd(5)} pg=${r.pg_rows} mysql=${r.mysql_rows} ${r.pg_sha} ${r.mysql_sha}`);
      }
    }
    console.log(bad ? `FAIL: ${bad} 개 다름` : "OK: 모든 표 일치");
    process.exitCode = bad ? 1 : 0;
  }
} finally {
  await my.close();
  await mp.end();
  await pgPool.end();
}
