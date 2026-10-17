// 5단계 동등성 대조(읽기 전용): 실제 8개 지점 자료로 4단계 요약(legacy) vs 분포 분리(build → JSON 왕복 → evaluate)를 비교해 다른 결과 수를 센다.
// 실행(서버와 같은 DB 환경): node scripts/rt-baseline-equiv.mjs [dates=40] → 마지막 줄 JSON { compared, diff, ranked, ... }
import { initDb, statsDailyRows, statsHourlyStream, statsHourlyRows, listStationsPg } from "../db.mjs";
import { buildDailyStore, ymdToDn, dnToYmd, hval } from "../stats-engine.mjs";
import { createStatsHourly } from "../stats-hourly.mjs";
import { hourlyReference, dailyReference, evaluateRefs, hourlyCompare, dailyCompare } from "../rt-baseline.mjs";
import { hourlyCompareLegacy, dailyCompareLegacy } from "./lib/rt-baseline-legacy.mjs";

const N = Number(process.argv[2] || 40);
await initDb();
const list = (await listStationsPg()).filter((s) => s.enabled !== false && s.enabled !== 0);
const hsMaker = createStatsHourly({ loadStream: (id, from, onRows) => statsHourlyStream(id, from, onRows), loadRange: (id, f, t) => statsHourlyRows(id, f, t) });
let s = 20261017 >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const J = JSON.stringify;
const out = { stations: list.length, compared: 0, diff: 0, ranked: 0, diffs: [], refBytes: { hourlyMax: 0, hourlySum: 0, hourlyN: 0, dailyMax: 0 }, ms: { legacy: 0, build: 0, evaluate: 0 } };
const today = dnToYmd(Math.floor((Date.now() + 9 * 3600e3) / 864e5));
for (const st of list) {
  const sid = String(st.station_id);
  const hs = await hsMaker.get(sid);
  const store = buildDailyStore(sid, await statsDailyRows(sid));
  for (let k = 0; k < N; k++) {
    // 오늘~앞으로 10일(사전 계산 대상)과 지난 1년 아무 날, 윤일·연말 포함
    const ymd = k === 0 ? "2024-02-29" : k === 1 ? "2026-12-31" : k < 12 ? dnToYmd(ymdToDn(today) + k - 2) : dnToYmd(ymdToDn(today) - Math.floor(r() * 365));
    const hour = Math.floor(r() * 24);
    for (const f of ["ta", "hm", "ws", "rn"]) {
      let t0 = Date.now();
      const refs = JSON.parse(J(hourlyReference(hs, ymd, hour, f)));
      out.ms.build += Date.now() - t0;
      const b = J(refs).length; out.refBytes.hourlyMax = Math.max(out.refBytes.hourlyMax, b); out.refBytes.hourlySum += b; out.refBytes.hourlyN++;
      // 값: 실제 그 시각 관측(있으면) + 분포 안팎 몇 개 + 없음
      const i = (ymdToDn(ymd) - hs.base) * 24 + hour;
      const obs = i >= 0 && i < hs.n && hs.src[i] ? hval(hs[f], i) : NaN;
      const vals = [NaN, obs, ...(refs[0].vals ? [refs[0].vals[0], refs[0].vals.at(-1), refs[0].vals[Math.floor(refs[0].vals.length / 2)], refs[0].vals.at(-1) + 0.1] : []), Math.round(r() * 300) / 10];
      for (const v of vals) {
        t0 = Date.now(); const a = J(hourlyCompareLegacy(hs, ymd, hour, f, v)); out.ms.legacy += Date.now() - t0;
        t0 = Date.now(); const c = J(evaluateRefs(refs, v)); out.ms.evaluate += Date.now() - t0;
        const d = J(hourlyCompare(hs, ymd, hour, f, v));
        out.compared++;
        if (a !== c || a !== d) { out.diff++; if (out.diffs.length < 5) out.diffs.push({ sid, ymd, hour, f, v }); }
        if (JSON.parse(a).some((p) => p.percentile != null)) out.ranked++;
      }
    }
    for (const f of ["max", "min", "rain"]) {
      const refs = JSON.parse(J(dailyReference(store, ymd, f)));
      out.refBytes.dailyMax = Math.max(out.refBytes.dailyMax, J(refs).length);
      const j = ymdToDn(ymd) - store.base;
      const obs = j >= 0 && j < store.n && store.present[j] ? store[f][j] : NaN;
      for (const v of [NaN, obs, 0, 12.3, 30.1]) {
        const a = J(dailyCompareLegacy(store, ymd, f, v)), c = J(evaluateRefs(refs, v)), d = J(dailyCompare(store, ymd, f, v));
        out.compared++;
        if (a !== c || a !== d) { out.diff++; if (out.diffs.length < 5) out.diffs.push({ sid, ymd, f, v }); }
        if (JSON.parse(a).some((p) => p.percentile != null)) out.ranked++;
      }
    }
  }
  console.error(`${sid} done compared=${out.compared} diff=${out.diff}`);
}
out.refBytes.hourlyAvg = Math.round(out.refBytes.hourlySum / out.refBytes.hourlyN);
console.log(J(out));
process.exit(0);
