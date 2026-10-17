// astra 5단계(12-3·12-4): 수집 저장 성공 → 영향 지점 사전 계산 작업. 앱 안 대기열(외부 작업 도구 없음).
//  - 같은 지점은 한 번만 대기(중복 제거). 묶음이 도는 중에 온 요청은 끝난 뒤 다음 묶음으로.
//  - 모아서 debounceMs 뒤 시작(수집이 여러 묶음으로 저장해도 한 번). 묶음 안에서 지점 2개씩(NAS 연결 6개 중 일부만).
//  - gate() 가 거짓이면(서버 막 시작해 과거 자료를 읽는 중) 기다렸다가 시작.
//  - 실패하면 이전 스냅샷을 그대로 두고(화면은 이전 정상 스냅샷 또는 요청 계산) 다음 트리거·정시에 다시.
//  - 상태는 wx_compute_job 에 남긴다(관찰용; 재시작하면 시작 시 전 지점을 다시 계산).
export function createPrecomputeQueue({ run, debounceMs = 3000, gate = () => true, jobs = null, rulesVersion = null, log = () => {}, now = () => Date.now() }) {
  // 지점 단위 중복 제거 + 한 번에 한 묶음(batch): 대기 중인 지점을 모두 모아 run(ids, reason) 한 번. 묶음 안 동시성은 run 이 정함.
  //   (8개 지점의 지역 이야기는 모든 지점의 같은 시각 실황이 필요해 묶음으로 도는 편이 맞다)
  let pending = new Map(); // sid → Set(reasons)
  let inputMs = 0;
  let running = false;
  let timer = null;
  const stats = { enqueued: 0, batches: 0, failed: 0, last: null };
  const putJob = (j) => (jobs ? jobs.putJob({ kind: "station", rulesVersion, ...j }).catch((e) => log(`rt job state write failed ${e?.code || e?.message}`)) : null);
  function enqueue(ids, reason, { delay = debounceMs } = {}) {
    for (const id0 of ids) {
      const id = String(id0);
      if (!pending.has(id)) { pending.set(id, new Set()); stats.enqueued++; if (!running) putJob({ stationId: id, status: "pending", reason, inputMs: now() }); }
      pending.get(id).add(reason);
    }
    inputMs = Math.max(inputMs, now());
    schedule(delay);
  }
  function schedule(delay) {
    if (timer || running) return;
    timer = setTimeout(pump, delay);
    timer.unref?.();
  }
  async function pump() {
    timer = null;
    if (running || !pending.size) return;
    if (!gate()) { schedule(5000); return; }
    const batch = pending; pending = new Map();
    const ids = [...batch.keys()];
    const reasons = [...new Set([...batch.values()].flatMap((x) => [...x]))].join("+").slice(0, 64);
    const t0 = now(), inMs = inputMs;
    running = true;
    for (const id of ids) putJob({ stationId: id, status: "running", reason: reasons, inputMs: inMs, startedMs: t0, leaseUntilMs: t0 + 10 * 60000, attempts: 1 });
    try {
      const r = await run(ids, reasons);
      stats.batches++;
      stats.last = { at: now(), ms: now() - t0, ids, reason: reasons, note: r?.note || null };
      for (const id of ids) { const x = r?.byStation?.[id]; putJob({ stationId: id, status: x?.error ? "failed" : "done", reason: reasons, inputMs: inMs, startedMs: t0, completedMs: now(), ms: x?.ms ?? now() - t0, sourceRev: x?.sourceRev ?? null, error: x?.error ?? null, attempts: 1 }); }
      log(`rt precompute [${ids.join(",")}] ${reasons} ms=${now() - t0}${r?.note ? ` ${r.note}` : ""}`);
    } catch (e) {
      stats.failed++;
      for (const id of ids) putJob({ stationId: id, status: "failed", reason: reasons, inputMs: inMs, startedMs: t0, completedMs: now(), ms: now() - t0, error: e?.message || String(e), attempts: 1 });
      log(`rt precompute failed ${e?.message || e}`);
    } finally {
      running = false;
      if (pending.size) schedule(200);
    }
  }
  const idle = () => !pending.size && !running && !timer;
  return { enqueue, stats, idle, pendingIds: () => [...pending.keys()], isRunning: () => running };
}

// KST 정시가 바뀔 때(자정·생활 구간 경계 포함 — 구간은 모두 정시에 시작·끝남) 콜백. 30초마다 확인
export function createHourTicker(onHour, { now = () => Date.now(), everyMs = 30000 } = {}) {
  const hourOf = (ms) => Math.floor((ms + 9 * 3600000) / 3600000);
  let last = hourOf(now());
  const t = setInterval(() => { const h = hourOf(now()); if (h !== last) { const midnight = ((h % 24) + 24) % 24 === 0; last = h; onHour({ midnight, hour: ((h % 24) + 24) % 24 }); } }, everyMs);
  t.unref?.();
  return { stop: () => clearInterval(t) };
}
