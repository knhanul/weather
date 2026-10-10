// 날씨 통계용 지점별 시간자료 저장소(메모리) — 지점 하나 약 33만 시각 × 4항목 Float32 ≈ 5.6MB(8개 지점 ≈ 45MB).
// 처음 읽기: 1990년부터 한 해씩 기본 키 범위로 읽는다(NAS 에서 지점당 약 10초 — 서버 시작 때 뒤에서 미리 읽음).
// 이 앱이 시간자료를 저장하면 invalidate(지점, 가장 이른 시각) → 다음 요청이 그 해부터만 다시 읽고 나서 답한다(오래된 통계가 남지 않게).
// 밖에서 DB 를 고친 경우를 위해 ttlMs(기본 30분)가 지나면 최근 45일만 뒤에서 다시 읽는다.
import { createHourlyStore, addHourlyRows, HOURLY_FROM } from "./stats-engine.mjs";

export function createStatsHourly({ loadRange, ttlMs = 30 * 60 * 1000, now = () => Date.now(), log = () => {}, thisYear = () => new Date().getFullYear() }) {
  const cache = new Map(); // id -> { hs, at, dirtyFrom }
  const loading = new Map();
  let version = 1;
  const firstYear = +HOURLY_FROM.slice(0, 4);
  async function readYears(id, hs, fromYmd) {
    const y0 = Math.max(firstYear, +fromYmd.slice(0, 4));
    const y1 = thisYear();
    let rows = 0;
    for (let y = y0; y <= y1; y++) {
      const from = y === y0 ? fromYmd : `${y}-01-01`;
      const part = await loadRange(id, from, `${y + 1}-01-01`);
      rows += addHourlyRows(hs, part);
    }
    return rows;
  }
  function run(id, job) {
    if (loading.has(id)) return loading.get(id).then(() => (cache.has(id) && !cache.get(id).dirtyFrom ? cache.get(id).hs : run(id, job)));
    const p = job().finally(() => loading.delete(id));
    loading.set(id, p);
    return p;
  }
  async function doFull(id) {
    const t0 = now();
    const hs = createHourlyStore(id, thisYear() + 1);
    const rows = await readYears(id, hs, HOURLY_FROM);
    cache.set(id, { hs, at: now(), dirtyFrom: null });
    log(`stats hourly loaded station=${id} rows=${rows} ms=${now() - t0}`);
    return hs;
  }
  const full = (id) => run(id, () => doFull(id));
  function refresh(id, fromYmd) {
    return run(id, async () => {
      const c = cache.get(id);
      if (!c || c.hs.n < (thisYear() + 1 - firstYear) * 365 * 24) return doFull(id);
      const from = c.dirtyFrom && c.dirtyFrom < fromYmd ? c.dirtyFrom : fromYmd;
      c.dirtyFrom = null;
      const t0 = now();
      const rows = await readYears(id, c.hs, from);
      c.at = now();
      log(`stats hourly refreshed station=${id} from=${from} rows=${rows} ms=${now() - t0}`);
      return c.hs;
    });
  }
  async function get(stationId) {
    const id = String(stationId);
    const c = cache.get(id);
    if (!c) return full(id);
    if (c.dirtyFrom) return refresh(id, c.dirtyFrom);
    if (now() - c.at >= ttlMs && !loading.has(id)) {
      const d = new Date(now() - 45 * 86400000);
      refresh(id, d.toISOString().slice(0, 10)).catch((e) => log(`stats hourly refresh failed station=${id} ${e?.code || e?.message}`));
    }
    return c.hs;
  }
  // 저장 뒤: rows = 저장한 시간자료 행들
  function invalidateRows(rows) {
    const by = new Map();
    for (const r of rows || []) {
      const id = String(r.station_id);
      const d = String(r.observation_datetime || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (!by.has(id) || d < by.get(id)) by.set(id, d);
    }
    if (!by.size) return;
    version++;
    for (const [id, d] of by) {
      const c = cache.get(id);
      if (c) c.dirtyFrom = c.dirtyFrom && c.dirtyFrom < d ? c.dirtyFrom : d;
    }
  }
  return { get, invalidateRows, version: () => version, isLoaded: (id) => cache.has(String(id)), cached: () => [...cache.keys()] };
}
