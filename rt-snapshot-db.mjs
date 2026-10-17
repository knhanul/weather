// astra 5단계(12장): 사전 계산 저장소(MySQL 5.6, migrations/mysql/0008_rt_snapshots.sql 의 새 표 4개만 읽고 쓴다).
// 기존 표는 건드리지 않는다. 지우는 문장(DELETE·DROP·TRUNCATE)이 없다 — 최신 1행 덮어쓰기(가드)와 INSERT IGNORE 만.
// h = db-mysql.mjs handle({ query, read, tx }). 없으면(createRtSnapshotDb(null)) 모든 함수가 빈 값 — 기존 요청 계산 경로만 쓴다.
import { createHash } from "node:crypto";

export const SNAPSHOT_SCHEMA = 1;
export const sha1 = (s) => createHash("sha1").update(String(s)).digest("hex");
const nsOf = (ns) => String(ns || "main").slice(0, 8);

export function createRtSnapshotDb(h, { ns = "main", log = () => {} } = {}) {
  const NS = nsOf(ns);
  if (!h) return { enabled: false, ns: NS, ensure: async () => false };
  const read = (sql, p) => h.read(sql, p);
  const run = (sql, p) => h.query(sql, p);
  let ok = null;
  const db = {
    enabled: true,
    ns: NS,
    // 표가 있는지(마이그레이션은 db-mysql init 이 이미 적용). 없으면 사전 계산을 끔(기존 경로 그대로)
    async ensure() {
      if (ok !== null) return ok;
      try {
        for (const t of ["wx_baseline_snapshot", "wx_story_snapshot", "wx_story_publication", "wx_compute_job"]) await read(`SELECT 1 FROM ${t} LIMIT 1`);
        ok = true;
      } catch (e) { log(`rt snapshot tables missing: ${e?.code || e?.message}`); ok = false; }
      return ok;
    },
    // ---- 기준 분포
    baselineId: (sid, kind, ymd, metric, algo) => sha1(`${NS}|${sid}|${kind}|${ymd}|${metric}|${algo}`),
    async getBaselines(sid, kind, ymds, metrics, algo) {
      const ids = [];
      for (const d of ymds) for (const m of metrics) ids.push(db.baselineId(sid, kind, d, m, algo));
      if (!ids.length) return [];
      const rows = await read(`SELECT id, DATE_FORMAT(ref_date, '%Y-%m-%d') AS ymd, metric, data_rev, payload FROM wx_baseline_snapshot WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      return rows.map((r) => ({ ymd: r.ymd, metric: r.metric, dataRev: r.data_rev, payload: r.payload }));
    },
    async putBaselines(sid, kind, list, algo) {
      // list: [{ ymd, metric, dataRev, cutoff, payload(문자열) }] — 같은 키는 새 값으로(분포는 입력이 같으면 같은 값)
      for (let i = 0; i < list.length; i += 20) {
        const part = list.slice(i, i + 20);
        const vals = [];
        for (const x of part) vals.push(db.baselineId(sid, kind, x.ymd, x.metric, algo), NS, String(sid), kind, x.ymd, x.metric, algo, String(x.dataRev), x.cutoff, x.payload, x.payload.length, Date.now());
        await run(`INSERT INTO wx_baseline_snapshot (id, ns, station_id, kind, ref_date, metric, algo, data_rev, source_cutoff, payload, bytes, built_ms) VALUES ${part.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}
          ON DUPLICATE KEY UPDATE data_rev = VALUES(data_rev), source_cutoff = VALUES(source_cutoff), payload = VALUES(payload), bytes = VALUES(bytes), built_ms = VALUES(built_ms)`, vals);
      }
    },
    // ---- 화면 스냅샷(최신 1행)
    snapshotId: (kind, sid, basis) => sha1(`${NS}|${kind}|${sid}|${basis}`),
    async getSnapshot(kind, sid, basis) {
      const r = await read("SELECT version, rules_version, schema_version, input_fp, source_rev, slot, published_ms, expires_ms, payload, sources, bytes, build_ms FROM wx_story_snapshot WHERE id = ?", [db.snapshotId(kind, sid, basis)]);
      return r[0] || null;
    },
    // 가드: 저장된 source_rev 보다 작으면(늦게 끝난 옛 계산) 쓰지 않음 → { written: true|false }
    // pub(선택): 같은 트랜잭션에서 게시 이력 기록 — 최신 스냅샷 전환과 이력이 함께 반영되거나 함께 빠짐
    async putSnapshot(s, pub = null) {
      const id = db.snapshotId(s.kind, s.stationId, s.basisId);
      const cols = [s.version, s.rulesVersion, SNAPSHOT_SCHEMA, s.inputFp, s.sourceRev, s.slot, s.publishedMs, s.expiresMs, s.payload, s.candidates ?? null, s.sources ?? null, s.payload.length, s.buildMs | 0];
      const body = async (q) => {
        const u = await q(`UPDATE wx_story_snapshot SET version = ?, rules_version = ?, schema_version = ?, input_fp = ?, source_rev = ?, slot = ?, published_ms = ?, expires_ms = ?, payload = ?, candidates = ?, sources = ?, bytes = ?, build_ms = ? WHERE id = ? AND source_rev <= ?`, [...cols, id, s.sourceRev]);
        let written = (u?.affectedRows || 0) > 0;
        if (!written) {
          const ins = await q(`INSERT IGNORE INTO wx_story_snapshot (version, rules_version, schema_version, input_fp, source_rev, slot, published_ms, expires_ms, payload, candidates, sources, bytes, build_ms, id, ns, kind, station_id, basis_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...cols, id, NS, s.kind, String(s.stationId), s.basisId]);
          written = (ins?.affectedRows || 0) > 0;
        }
        if (written && pub?.entries?.length) await insertPub(q, pub, s.version);
        return { written };
      };
      return h.tx ? h.tx(body) : body(run);
    },
    // ---- 게시 이력(rt-story-select createMemoryHistory 와 같은 두 함수)
    async listHistory(key, sinceWall) {
      const rows = await read("SELECT slot, event_id, material_hash, rule_id, shown_at FROM wx_story_publication WHERE ns = ? AND hist_key = ? AND shown_at >= ? ORDER BY shown_at", [NS, String(key), sinceWall]);
      return rows.map((r) => ({ eventId: r.event_id, materialHash: r.material_hash, ruleId: r.rule_id, slot: r.slot, at: String(r.shown_at).trim() }));
    },
    async recordHistory(pub) { if (pub?.entries?.length) await insertPub(run, pub, null); },
    // ---- 작업·상태
    async putJob(j) {
      await run(`INSERT INTO wx_compute_job (job_key, ns, kind, station_id, status, reason, source_rev, rules_version, attempts, input_ms, lease_until_ms, started_ms, completed_ms, ms, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), reason = VALUES(reason), source_rev = COALESCE(VALUES(source_rev), source_rev), rules_version = VALUES(rules_version), attempts = VALUES(attempts), input_ms = VALUES(input_ms), lease_until_ms = VALUES(lease_until_ms), started_ms = COALESCE(VALUES(started_ms), started_ms), completed_ms = COALESCE(VALUES(completed_ms), completed_ms), ms = COALESCE(VALUES(ms), ms), error = VALUES(error)`,
      [`${NS}|${j.kind}|${j.stationId}`.slice(0, 64), NS, j.kind, String(j.stationId), j.status, j.reason ?? null, j.sourceRev ?? null, j.rulesVersion ?? null, j.attempts | 0, j.inputMs ?? null, j.leaseUntilMs ?? null, j.startedMs ?? null, j.completedMs ?? null, j.ms ?? null, j.error ? String(j.error).slice(0, 500) : null]);
    },
    async listJobs() { return read("SELECT job_key, kind, station_id, status, reason, source_rev, attempts, started_ms, completed_ms, ms, error FROM wx_compute_job WHERE ns = ? ORDER BY job_key", [NS]); },
    // 끝난 해 자료 수정판: { "H|108": "1760…", "D|108": … }
    async dataRevs() {
      const rows = await read("SELECT kind, station_id, source_rev FROM wx_compute_job WHERE ns = ? AND kind IN ('datarev-H', 'datarev-D')", [NS]);
      return Object.fromEntries(rows.map((r) => [`${r.kind.slice(-1)}|${r.station_id}`, r.source_rev]));
    },
    async bumpDataRev(kind, sid, rev) {
      await db.putJob({ kind: `datarev-${kind}`, stationId: sid, status: "done", reason: "끝난 해 자료 저장", sourceRev: String(rev), completedMs: Date.now() });
    },
  };
  async function insertPub(q, pub, version) {
    const rows = pub.entries.map((e) => [sha1(`${NS}|${pub.key}|${pub.slot}|${e.eventId}|${e.materialHash}`), NS, String(pub.key).slice(0, 32), pub.slot, String(e.eventId).slice(0, 191), String(e.materialHash ?? "").slice(0, 64), String(e.ruleId).slice(0, 64), e.topic ?? null, Number.isFinite(e.score) ? e.score : null, e.reason ? String(e.reason).slice(0, 255) : null, version, pub.nowW, pub.nowW]);
    // 같은 slot·사건·내용은 처음 게시 시각을 유지(메모리 이력과 같은 뜻), 마지막으로 본 시각만 갱신
    await q(`INSERT INTO wx_story_publication (id, ns, hist_key, slot, event_id, material_hash, rule_id, topic, score, reason, snapshot_version, shown_at, last_seen_at) VALUES ${rows.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}
      ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), snapshot_version = COALESCE(VALUES(snapshot_version), snapshot_version)`, rows.flat());
  }
  return db;
}

// 게시 이력 저장소(DB): createMemoryHistory 와 같은 list/record. DB 오류면 메모리로 이어 감(화면은 멈추지 않음)
export function createDbHistory(snap, memory, { keepDays = 14, log = () => {} } = {}) {
  const H = 3600000;
  const wallMs = (w) => Date.parse(`${String(w).replace(" ", "T")}:00Z`);
  const wallOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  return {
    kind: "db",
    async list(key, nowW) {
      try {
        const since = nowW ? wallOf(wallMs(nowW) - keepDays * 24 * H) : "0000";
        return await snap.listHistory(key, since);
      } catch (e) { log(`rt history read failed ${e?.code || e?.message}`); return memory.list(key); }
    },
    async record(key, slot, entries, nowW) {
      await memory.record(key, slot, entries, nowW);
      try { await snap.recordHistory({ key, slot, entries, nowW }); } catch (e) { log(`rt history write failed ${e?.code || e?.message}`); }
    },
  };
}
