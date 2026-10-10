// 날씨 통계용 지점별 공식 일자료 저장소(메모리) — 지점 하나 13,400일 × 6항목 Float64Array ≈ 0.7MB.
// 자료 판(version): 이 앱이 공식 일자료를 저장하면 그 지점만 비우고 version 을 올린다(오래된 통계가 남지 않게).
// 밖에서 DB 를 직접 고친 경우를 위해 ttlMs(기본 30분)가 지나면 다시 읽는다. 다시 읽는 동안에는 직전 값을 쓴다(첫 읽기는 기다림).
import { buildDailyStore } from "./stats-engine.mjs";

export function createStatsData({ loadRows, ttlMs = 30 * 60 * 1000, now = () => Date.now(), log = () => {} }) {
  const cache = new Map(); // stationId -> { store, at, version }
  const loading = new Map();
  let version = 1;
  async function load(id) {
    if (loading.has(id)) return loading.get(id);
    const v = version;
    const t0 = now();
    const p = (async () => {
      const rows = await loadRows(id);
      const store = buildDailyStore(id, rows);
      // 읽는 동안 invalidate 됐으면 이 결과는 기억하지 않는다(다음 요청이 새로 읽음)
      if (v === version || !cache.has(id)) cache.set(id, { store, at: now(), version: v });
      log(`stats daily loaded station=${id} rows=${store.rows} ms=${now() - t0}`);
      return store;
    })().finally(() => loading.delete(id));
    loading.set(id, p);
    return p;
  }
  async function get(stationId) {
    const id = String(stationId);
    const c = cache.get(id);
    if (c && c.version === version && now() - c.at < ttlMs) return c.store;
    if (c && c.version === version) {
      // 만료: 직전 값을 주고 뒤에서 다시 읽음
      load(id).catch((e) => log(`stats reload failed station=${id} ${e?.code || e?.message}`));
      return c.store;
    }
    return load(id);
  }
  // 저장 뒤 호출: 해당 지점(없으면 전부)을 버리고 version 을 올린다
  function invalidate(stationIds = null) {
    version++;
    if (!stationIds) cache.clear();
    else for (const id of stationIds) cache.delete(String(id));
    // 다른 지점 항목도 version 이 바뀌었으니 표시만 새 version 으로(자료는 그대로 유효)
    for (const [id, c] of cache) cache.set(id, { ...c, version });
  }
  return { get, invalidate, version: () => version, cached: () => [...cache.keys()] };
}
