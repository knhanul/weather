#!/usr/bin/env node
// MySQL 저장소 쓰기 경로 통합 점검 — **빈 시험용 DB** 에서만 실행 (예: weatherhub_test). 운영 DB 이름이면 거부한다.
//   MYSQL_URL=mysql://…/weatherhub_test node scripts/mysql-integration.mjs
import assert from "node:assert/strict";
import * as my from "../db-mysql.mjs";
import { createMysqlStore } from "../auth-store.mjs";
import { createMysqlLayoutStore } from "../layouts.mjs";
import { mapHourlyItem } from "../kma-fields.mjs";

const url = new URL(process.env.MYSQL_URL);
if (!/_test$/.test(url.pathname)) {
  console.error("시험용 DB(이름이 _test 로 끝남)에서만 실행합니다");
  process.exit(2);
}
process.env.MYSQL_AGG_REFRESH_MS = "0"; // 저장 직후 개수를 바로 확인
await my.init(process.env.MYSQL_URL);
const h = my.getHandle();
const step = (s) => console.log(`ok  ${s}`);

// 1) 시간자료 UPSERT: 새 행 / 같은 행 다시 / 예전 형식 행(extra 없음)
const item = (tm, ta) => ({ stnId: "108", stnNm: "서울", tm, ta: String(ta), rn: "", hm: "50", ws: "1.2", wd: "200", pa: "1010.1", taQcflg: "", td: "-3.2", ps: "1020.3", vs: "2000" });
const rows = [item("2026-01-01 00:00", 1.5), item("2026-01-01 01:00", 1.7)].map((it) => mapHourlyItem(it, "108"));
let r = await my.upsertHourly(rows);
assert.deepEqual([r.inserted, r.updated, r.total], [2, 0, 2]);
r = await my.upsertHourly(rows);
assert.deepEqual([r.inserted, r.updated, r.total], [0, 2, 2]);
r = await my.upsertHourly([{ station_id: "108", observation_datetime: "2026-01-01 02:00:00", temperature: 2.1 }, { station_id: "108", observation_datetime: "2026-01-01 02:00:00", temperature: 2.2 }]);
assert.deepEqual([r.inserted, r.updated, r.total], [1, 1, 3]);
const full = await h.read("SELECT temperature, dew_point, raw FROM observations_hourly WHERE observation_datetime = '2026-01-01 00:00:00'");
assert.equal(full[0].temperature, 1.5);
assert.equal(full[0].dew_point, -3.2);
assert.equal(JSON.parse(full[0].raw).stnNm, "서울");
assert.equal((await h.read("SELECT temperature FROM observations_hourly WHERE observation_datetime = '2026-01-01 02:00:00'"))[0].temperature, 2.2);
step("upsertHourly 개수·값·raw·한글");
assert.equal(await my.countHourly(), 3);
assert.equal(await my.latestHourPg("108"), "2026-01-01 02:00");
const s = await my.stationSummariesPg();
assert.equal(s[0].rows, 3);
step("집계 캐시가 쓰기 뒤 새 값");

// 2) 일자료
r = await my.upsertDaily([{ station_id: "108", observation_date: "2026-01-01", avg_temperature: 1.1, extra: { min_temperature_time: "0611" }, raw: { tm: "2026-01-01" } }]);
assert.deepEqual(r, { inserted: 1, updated: 0 });
r = await my.upsertDaily([{ station_id: "108", observation_date: "2026-01-01", avg_temperature: 1.2, extra: {}, raw: {} }]);
assert.deepEqual(r, { inserted: 0, updated: 1 });
assert.equal(await my.countDaily(), 1);
step("upsertDaily");

// 3) 수집 이력·지점·설정
await my.insertJob({ id: 1791600000000, dataset: "ASOS_HOURLY", status: "RUNNING", trigger: "SCHEDULED", station_id: "108", from: "a", to: "b" });
await my.insertJob({ id: 1791600000000, dataset: "ASOS_HOURLY", status: "COMPLETED", trigger: "SCHEDULED", station_id: "108", from: "a", to: "b", received: 24, inserted: 20, updated: 4, chunks: 1, message: "완료" });
const jobs = await my.listJobs();
assert.equal(jobs.length, 1);
assert.equal(jobs[0].status, "COMPLETED");
assert.equal(jobs[0].trigger, "SCHEDULED");
assert.equal(jobs[0].id, 1791600000000);
await my.saveStations([{ station_id: "108", station_name: "서울", region: "수도권", enabled: true, favorite: false }]);
assert.deepEqual(await my.listStationsPg(), [{ station_id: "108", station_name: "서울", region: "수도권", enabled: true, favorite: false }]);
await my.setSetting("k", "v1");
await my.setSetting("k", "v2");
assert.equal(await my.getSetting("k"), "v2");
step("collect_jobs·지점(boolean)·설정");

// 4) 로그인 저장소 (UTC 시각)
const st = createMysqlStore(h);
await st.ensureSchema();
const u = await st.upsertLogin({ kakaoId: "nuni:test1", nickname: null, profileImage: null });
assert.equal(u.status, "pending");
assert.ok(Math.abs(Date.parse(u.created_at) - Date.now()) < 120000, "created_at 이 UTC 로 저장");
await st.setStatus("nuni:test1", "approved", "test");
await st.createSession({ idHash: "h1", kakaoId: "nuni:test1", expiresAt: new Date(Date.now() + 3600000), userAgent: null });
await st.createSession({ idHash: "h2", kakaoId: "nuni:test1", expiresAt: new Date(Date.now() - 1000), userAgent: null });
const sess = await st.getSession("h1");
assert.equal(sess.user.status, "approved");
assert.ok(Math.abs(Date.parse(sess.expires_at) - (Date.now() + 3600000)) < 120000);
assert.equal(await st.getSession("h2"), null);
assert.equal(await st.deleteExpired(), 1);
assert.equal((await st.listUsers()).length, 1);
await st.setStatus("nuni:test1", "blocked", "test");
assert.equal(await st.getSession("h1"), null);
step("auth store: 로그인·세션 만료·차단 시 세션 삭제");

// 5) 레이아웃 (종류별 기본 1개)
const L = createMysqlLayoutStore(h);
const a = await L.create("o1", { kind: "hourly", name: "가", columns: ["temperature"], isDefault: true });
const b = await L.create("o1", { kind: "hourly", name: "나", columns: ["humidity"], isDefault: true });
let list = await L.list("o1");
assert.deepEqual(list.map((x) => [x.name, x.isDefault]), [["가", false], ["나", true]]);
assert.deepEqual(list[0].columns, ["temperature"]);
await L.update("o1", a.id, { isDefault: true, name: "가2" });
list = await L.list("o1");
assert.deepEqual(list.map((x) => [x.name, x.isDefault]), [["가2", true], ["나", false]]);
await L.update("o1", a.id, { isDefault: false });
assert.equal((await L.list("o1")).filter((x) => x.isDefault).length, 0);
assert.equal(await L.get("o2", b.id), null);
assert.equal(await L.update("o2", b.id, { name: "x" }), null);
assert.equal(await L.remove("o2", b.id), false);
assert.equal(await L.remove("o1", b.id), true);
assert.equal(await L.count("o1"), 1);
await assert.rejects(h.query("INSERT INTO export_layouts (id, owner_id, kind, name, columns, is_default, default_marker) VALUES ('lay_x1', 'o1', 'hourly', 'n', '[]', 1, 1), ('lay_x2', 'o1', 'hourly', 'n', '[]', 1, 1)"));
step("layouts: 기본 1개·본인 것만·JSON 컬럼");

// 6) 미적재 구간
const iv = await my.gapHourIntervalsPg([{ station_id: "108", a: "2025-12-31 23", b: "2026-01-01 03" }]);
assert.deepEqual(iv, [{ station_id: "108", s: "2025-12-31 23", e: "2025-12-31 23", n: 1 }, { station_id: "108", s: "2026-01-01 03", e: "2026-01-01 03", n: 1 }]);
step("gapHourIntervals");

await my.close();
console.log("OK: MySQL 쓰기 경로 통합 점검 통과");
