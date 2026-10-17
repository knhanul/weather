import test from "node:test";
import assert from "node:assert/strict";
import { hourlyCompare, dailyCompare, derivedCompare, hourlyReference, dailyReference, evaluateRefs, evaluateValue, buildReferenceDistribution } from "../rt-baseline.mjs";
import { hourlyCompareLegacy, dailyCompareLegacy, derivedCompareLegacy } from "./lib/rt-baseline-legacy.mjs";
import { createHourlyStore, addHourlyRows, buildDailyStore } from "../stats-engine.mjs";

// 결정적 의사난수(같은 값이 자주 겹치게 0.1 단위, 빠진 해·빠진 날 포함)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function world(seed = 7) {
  const r = rng(seed), rows = [], daily = [];
  for (let y = 1990; y <= 2026; y++) {
    if (y === 1994 || y === 2018) continue;
    for (const m of ["01", "02", "03", "09", "10", "12"]) for (let d = 1; d <= 28; d++) {
      if (r() < 0.04) continue;
      const day = `${y}-${m}-${String(d).padStart(2, "0")}`;
      for (const h of [0, 6, 15, 23]) rows.push({ observation_datetime: `${day} ${String(h).padStart(2, "0")}:00:00`, temperature: Math.round((10 + 8 * r()) * 10) / 10, humidity: Math.round(40 + 50 * r()), wind_speed: Math.round(r() * 60) / 10, precipitation: r() < 0.3 ? Math.round(r() * 50) / 10 : 0, ta_qcflg: "", rn_qcflg: "" });
      daily.push({ observation_date: day, max_temperature: Math.round((15 + 10 * r()) * 10) / 10, min_temperature: Math.round((2 + 8 * r()) * 10) / 10, avg_temperature: 10, precipitation: r() < 0.3 ? 3 : null, source_kind: "OFFICIAL" });
    }
  }
  const hs = createHourlyStore("1", 2026); addHourlyRows(hs, rows);
  return { hs, store: buildDailyStore("1", daily) };
}
const J = (x) => JSON.stringify(x);
test("분포 분리: hourly/daily/derived 가 4단계 결과와 바이트 단위로 같음(JSON 왕복 포함)", () => {
  const { hs, store } = world();
  let n = 0, ranked = 0;
  for (const ymd of ["2026-10-17", "2026-01-03", "2026-12-30", "2025-02-28", "2024-02-29", "2026-03-15"]) {
    for (const h of [0, 6, 15, 23]) for (const f of ["ta", "hm", "ws", "rn"]) {
      const refs = JSON.parse(J(hourlyReference(hs, ymd, h, f)));
      for (const v of [NaN, 0, 9.9, 10, 13.4, 18, 25, 55, 3.2, -1]) {
        const a = J(hourlyCompareLegacy(hs, ymd, h, f, v)), b = J(hourlyCompare(hs, ymd, h, f, v)), c = J(evaluateRefs(refs, v));
        assert.equal(b, a, `${ymd} ${h} ${f} ${v}`); assert.equal(c, a, `ref ${ymd} ${h} ${f} ${v}`); n++;
        if (JSON.parse(a)[0].percentile != null) ranked++;
      }
    }
    for (const f of ["max", "min", "rain"]) {
      const refs = JSON.parse(J(dailyReference(store, ymd, f)));
      for (const v of [NaN, 0, 3, 5.5, 20.1, 24.9, 30]) { const a = J(dailyCompareLegacy(store, ymd, f, v)); assert.equal(J(dailyCompare(store, ymd, f, v)), a); assert.equal(J(evaluateRefs(refs, v)), a); n++; }
    }
    const get = (dn) => { const i = dn - store.base; const v = i >= 0 && i < store.n && store.present[i] ? store.rain[i] : NaN; return [Number.isFinite(v) ? (v >= 0.1 ? 100 : 0) : NaN]; };
    for (const v of [NaN, 0, 100]) { assert.equal(J(derivedCompare(get, ymd, v, { digits: 0 })), J(derivedCompareLegacy(get, ymd, v, { digits: 0 }))); n++; }
    const flt = { filter: (x) => x >= 0.1, minRank: 10 };
    for (const v of [NaN, 0.5, 2]) { assert.equal(J(derivedCompare(get, ymd, v, flt)), J(derivedCompareLegacy(get, ymd, v, flt))); n++; }
  }
  assert.ok(n > 1000); assert.ok(ranked > 300, `ranked ${ranked}`); // 실제로 백분위·순위까지 비교했는지
});
test("참조 분포: 도수표(오름차순)·현재값 없이 만들어지고 크기가 작음", () => {
  const { hs } = world(3);
  const [all] = hourlyReference(hs, "2026-10-17", 15, "ta");
  assert.equal(all.cnts.reduce((a, b) => a + b, 0), all.samples);
  assert.ok(all.vals.every((v, i) => i === 0 || all.vals[i - 1] < v));
  assert.ok(J(all).length < 8000);
  const e = evaluateValue(all, 14);
  assert.ok(e.percentile >= 0 && e.percentile <= 100);
  // 부족한 기간
  const r = buildReferenceDistribution({ id: "x", label: "x", from: 2020, to: 2025, years: 6, minYears: 5 }, { years: [], samples: [] }, 1);
  assert.equal(evaluateValue(r, 3).status, "insufficient");
});

// ---------------------------------------------------------------- 사전 계산·스냅샷(가짜 저장소: rt-snapshot-db 와 같은 함수)
import { createRtApi } from "../rt-api.mjs";
function fakeSnapDb() {
  const base = new Map(), snaps = new Map(), pubs = new Map(), jobs = new Map();
  const db = {
    enabled: true, ns: "test", calls: { put: 0, rejected: 0 },
    ensure: async () => true,
    getBaselines: async (sid, kind, ymds, metrics, algo) => { const out = []; for (const d of ymds) for (const m of metrics) { const v = base.get(`${sid}|${kind}|${d}|${m}|${algo}`); if (v) out.push({ ymd: d, metric: m, ...v }); } return out; },
    putBaselines: async (sid, kind, list, algo) => { for (const x of list) base.set(`${sid}|${kind}|${x.ymd}|${x.metric}|${algo}`, { dataRev: String(x.dataRev), payload: x.payload }); },
    getSnapshot: async (kind, sid, basis) => snaps.get(`${kind}|${sid}|${basis}`) || null,
    putSnapshot: async (s, pub) => {
      const k = `${s.kind}|${s.stationId}|${s.basisId}`, cur = snaps.get(k);
      if (cur && cur.source_rev > s.sourceRev) { db.calls.rejected++; return { written: false }; }
      db.calls.put++;
      snaps.set(k, { version: s.version, rules_version: s.rulesVersion, schema_version: 1, input_fp: s.inputFp, source_rev: s.sourceRev, slot: s.slot, published_ms: s.publishedMs, expires_ms: s.expiresMs, payload: s.payload, sources: s.sources });
      if (pub) await db.recordHistory(pub);
      return { written: true };
    },
    listHistory: async (key) => [...pubs.values()].filter((x) => x.key === key).map((x) => ({ eventId: x.eventId, materialHash: x.materialHash, ruleId: x.ruleId, slot: x.slot, at: x.at })),
    recordHistory: async (pub) => { for (const e of pub.entries) { const id = `${pub.key}|${pub.slot}|${e.eventId}|${e.materialHash}`; if (!pubs.has(id)) pubs.set(id, { key: pub.key, slot: pub.slot, at: pub.nowW, ...e }); } },
    putJob: async (j) => { jobs.set(`${j.kind}|${j.stationId}`, j); },
    listJobs: async () => [...jobs.values()],
    dataRevs: async () => ({}),
    bumpDataRev: async () => {},
    _snaps: snaps, _base: base, _pubs: pubs, _jobs: jobs,
  };
  return db;
}
const T0 = Date.UTC(2026, 9, 13, 10, 20); // 19:20 KST
function mkApi({ snap, clock, hsGets = { n: 0 }, appRev = "r1" }) {
  const hrows = [], drows = [];
  for (let y = 1990; y <= 2026; y++) for (let d = 1; d <= 31; d++) {
    const day = `${y}-10-${String(d).padStart(2, "0")}`;
    if (y === 2026 && d > 12) continue;
    for (let h = 0; h < 24; h++) hrows.push({ observation_datetime: `${day} ${String(h).padStart(2, "0")}:00:00`, temperature: 15 + ((y * 7 + d * 3 + h) % 11) / 10, humidity: 60, wind_speed: 2 });
    drows.push({ observation_date: day, max_temperature: 20 + (d % 5) / 10, min_temperature: 10, avg_temperature: 15 });
  }
  const hs = createHourlyStore("108", 2026); addHourlyRows(hs, hrows);
  const ds = buildDailyStore("108", drows);
  const ncst = [];
  for (let h = 0; h <= 19; h++) for (const [c, v] of [["T1H", 16 + h / 10], ["REH", 70], ["RN1", "0"], ["WSD", 3], ["VEC", 250], ["PTY", 0]]) ncst.push({ base: `2026-10-13 ${String(h).padStart(2, "0")}:00:00`, category: c, value: String(v) });
  const rt = {
    gridOf: async () => ({ nx: 60, ny: 127 }),
    ncst: async (nx, ny, a, b) => ncst.filter((r) => r.base >= a && r.base <= b),
    latestRelease: async (d) => (d === "KMA_ULTRA_FCST" ? { base: "2026-10-13 18:30:00" } : { base: "2026-10-13 17:00:00" }),
    fcst: async (d, nx, ny, b) => { const out = []; if (d === "KMA_ULTRA_FCST") for (let h = 19; h <= 23; h++) out.push({ base: b, fcst: `2026-10-13 ${h}:00:00`, category: "T1H", value: "17" }); else for (let h = 18; h <= 23; h++) out.push({ base: b, fcst: `2026-10-13 ${h}:00:00`, category: "TMP", value: "12" }); return out; },
    dayExtremes: async () => ({ TMX: { value: "21.0", base: "2026-10-13 05:00:00" } }),
    extremesAll: async () => [], midItems: async () => [],
  };
  const api = createRtApi({ rt, statsHourly: { get: async () => { hsGets.n++; return hs; }, version: () => 1 }, statsData: { get: async () => ds, version: () => 1 }, stations: async () => [{ station_id: "108", station_name: "서울", enabled: true }], json: (res, b, s = 200) => { res.body = b; res.status = s; }, now: () => clock.t, snap, appRev });
  return api;
}
const call = async (api, path) => { const res = {}; await api({ method: "GET" }, res, new URL(`http://x${path}`)); return res.body; };
const waitIdle = async (api) => { for (let i = 0; i < 400 && !api.precomputeIdle(); i++) await new Promise((r) => setTimeout(r, 10)); };

test("5단계: 사전 계산 → 스냅샷 응답(지점×기준), 재시작 뒤에도 DB 스냅샷·참조 분포로 시간자료 없이 히어로", async () => {
  const snap = fakeSnapDb(), clock = { t: T0 };
  const a = mkApi({ snap, clock });
  // 요청 계산(스냅샷 전) — 대조용
  const before = await call(a, "/api/rt/now?station=108");
  assert.equal(before.snapshot, undefined);
  assert.equal(await a.initSnapshots(), true);
  assert.equal(await a.startPrecompute(), true);
  await waitIdle(a);
  const kinds = [...snap._snaps.keys()].sort();
  assert.deepEqual(kinds, ["forecast|108|-", "regions|*|-", "seasons|108|all", "seasons|108|r10", "seasons|108|r5", "stories|108|all", "stories|108|r10", "stories|108|r5", "today|108|-"]);
  const st = await call(a, "/api/rt/stories?station=108&basis=r5");
  assert.equal(st.snapshot.served, "snapshot"); assert.equal(st.basisId, "r5");
  assert.equal(st.snapshot.expiresAt, "2026-10-13 20:00"); // 다음 정시(구간 경계·자정 포함)
  const n1 = await call(a, "/api/rt/now?station=108");
  assert.equal(n1.snapshot.served, "snapshot");
  assert.deepEqual(n1.current.compare, before.current.compare); // 같은 숫자
  // 게시 이력은 DB 쪽에(스냅샷과 같이)
  assert.ok(snap._pubs.size >= 1);
  assert.ok([...snap._jobs.values()].every((j) => j.status === "done"));
  // 재시작: 메모리 비어 있음, 시간자료 읽기 전
  const hsGets = { n: 0 };
  const b = mkApi({ snap, clock, hsGets });
  await b.initSnapshots();
  const n2 = await call(b, "/api/rt/now?station=108");
  assert.equal(n2.snapshot.served, "snapshot"); assert.equal(hsGets.n, 0);
  const s2 = await call(b, "/api/rt/stories?station=108");
  assert.equal(s2.snapshot.served, "snapshot"); assert.equal(hsGets.n, 0);
  // 정시가 지나면 스냅샷 만료 → 요청 계산. 히어로는 DB 참조 분포로(시간자료 안 읽음), 숫자는 같음
  clock.t = T0 + 50 * 60000; // 20:10
  const c = mkApi({ snap, clock, hsGets });
  await c.initSnapshots();
  const n3 = await call(c, "/api/rt/now?station=108");
  assert.equal(n3.snapshot, undefined);
  assert.equal(hsGets.n, 0, "DB 참조 분포가 있으면 시간자료를 읽지 않음");
  const d = mkApi({ snap: null, clock });
  const n4 = await call(d, "/api/rt/now?station=108");
  assert.deepEqual(n3.current.compare, n4.current.compare);
  assert.deepEqual(n3.day, n4.day);
});
test("5단계: 늦게 끝난 옛 계산은 새 스냅샷을 덮지 않음, 지연 상태가 응답 시각에 바뀌면 스냅샷 대신 요청 계산, 앱 판이 바뀌면 옛 스냅샷 안 씀", async () => {
  const snap = fakeSnapDb(), clock = { t: T0 };
  const a = mkApi({ snap, clock });
  await a.initSnapshots(); await a.startPrecompute(); await waitIdle(a);
  const cur = snap._snaps.get("today|108|-");
  const r = await snap.putSnapshot({ kind: "today", stationId: "108", basisId: "-", sourceRev: "2026-10-13 18:00:00|2026-10-13 19:59", payload: "{}", version: 1 });
  assert.equal(r.written, false); assert.equal(snap._snaps.get("today|108|-"), cur);
  // 실황 19:00 → 20:31 이면 90분 넘어 지연(같은 정시 안이 아니어도 판정은 응답 시각) — 만료 전 상황을 만들려고 만료를 늦춤
  const row = snap._snaps.get("stories|108|all"); row.expires_ms = T0 + 6 * 3600e3;
  clock.t = T0 + 75 * 60000; // 20:35 → 실황 95분 전
  const b = mkApi({ snap, clock }); await b.initSnapshots();
  const s = await call(b, "/api/rt/stories?station=108");
  assert.equal(s.snapshot, undefined); assert.equal(s.stale, true);
  const c = mkApi({ snap, clock: { t: T0 }, appRev: "r2" }); await c.initSnapshots();
  assert.equal((await call(c, "/api/rt/stories?station=108")).snapshot, undefined);
});
test("5단계: 1MB 패킷 한도 — 기준 분포는 바이트로 나눠 넣고, 큰 스냅샷은 후보를 빼거나 저장 거부", async () => {
  const { createRtSnapshotDb } = await import("../rt-snapshot-db.mjs");
  const sent = [];
  const h = { query: async (sql, p) => { sent.push({ sql, bytes: p.reduce((a, v) => a + (typeof v === "string" ? Buffer.byteLength(v) : 8), 0) }); return { affectedRows: 1 }; }, read: async () => [] };
  const db = createRtSnapshotDb(h, { ns: "t" });
  const big = "가".repeat(60000); // 180KB
  await db.putBaselines("1", "H", Array.from({ length: 12 }, (_, i) => ({ ymd: "2026-10-13", metric: `m${i}`, dataRev: "1", cutoff: "2025-12-31", payload: big })), "ref1");
  assert.ok(sent.length >= 4 && sent.every((x) => x.bytes < 1048576 - 4096), JSON.stringify(sent.map((x) => x.bytes)));
  sent.length = 0;
  const r = await db.putSnapshot({ kind: "today", stationId: "1", basisId: "-", version: 1, sourceRev: "a", payload: "x".repeat(500000), candidates: "y".repeat(500000), sources: "{}" });
  assert.equal(r.written, true); assert.equal(db.stats.trimmed, 1);
  assert.ok(sent.every((x) => x.bytes < 1048576 - 4096));
  await assert.rejects(db.putSnapshot({ kind: "today", stationId: "1", basisId: "-", version: 2, sourceRev: "b", payload: "x".repeat(1000000), sources: "{}" }), /too big/);
});
test("5단계: 스냅샷 쓰기 교착(ER_LOCK_DEADLOCK)은 다시 시도", async () => {
  const { createRtSnapshotDb } = await import("../rt-snapshot-db.mjs");
  let n = 0;
  const h = { query: async () => ({ affectedRows: 1 }), read: async () => [], tx: async (fn) => { if (n++ === 0) { const e = new Error("dl"); e.code = "ER_LOCK_DEADLOCK"; throw e; } return fn(async () => ({ affectedRows: 1 })); } };
  const db = createRtSnapshotDb(h, { ns: "t" });
  const r = await db.putSnapshot({ kind: "seasons", stationId: "1", basisId: "all", version: 1, sourceRev: "a", payload: "{}", sources: "{}" });
  assert.equal(r.written, true); assert.equal(n, 2); assert.equal(db.stats.retried, 1);
});
test("5단계: 스냅샷 응답의 now 는 응답 시각, 계산 시각은 snapshot.publishedAt", async () => {
  const { decorate } = await import("../rt-snapshot-serve.mjs");
  const T = Date.UTC(2026, 9, 17, 10, 7);
  const r = decorate("seasons", { now: "2026-10-17 19:07", x: 1 }, { version: 1, publishedMs: T, expiresMs: T + 53 * 60000, sourceRev: "a" }, T + 5 * 60000, () => ({}), 90);
  assert.equal(r.now, "2026-10-17 19:12"); assert.equal(r.snapshot.publishedAt, "2026-10-17 19:07"); assert.equal(r.snapshot.expiresAt, "2026-10-17 20:00");
});
