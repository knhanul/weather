// 관리: 예보 자료 적재 현황(자료수집·미적재 화면용). 순수 함수 — 외부 API 호출 없음, 비밀값 없음.
// 기대 발표 = 수집기와 같은 규칙(releaseTimes / midReleaseTimes) × 격자/구역, 실제 = 발표 기록(kma_fcst_releases / kma_mid_releases).
import { releaseTimes, FORECAST_KINDS } from "./kma-forecast.mjs";
import { midReleaseTimes, MID_KINDS } from "./kma-mid.mjs";

export const PROVIDER_WINDOW_H = 24; // 기상청은 최근 약 24시간 발표만 다시 준다 — 그보다 오래 빠진 것은 다시 받을 수 없음
export const STALE_AFTER_MIN = { KMA_ULTRA_NCST: 90, KMA_ULTRA_FCST: 120, KMA_VILAGE_FCST: 240, KMA_MID_TA: 13 * 60, KMA_MID_LAND: 13 * 60, KMA_MID_FCST: 13 * 60 };
export const LABEL = { KMA_ULTRA_NCST: "초단기실황", KMA_ULTRA_FCST: "초단기예보", KMA_VILAGE_FCST: "단기예보", KMA_MID_TA: "중기기온", KMA_MID_LAND: "중기육상", KMA_MID_FCST: "중기전망" };
const KST = 9 * 3600000;
const wallMs = (w) => Date.parse(`${w.replace(" ", "T")}Z`) - KST;
const wallOf = (ms) => new Date(ms + KST).toISOString().slice(0, 19).replace("T", " ");

// 다음 발표: 지금 이후 첫 발표시각(조회 가능 시각 = 발표 + 지연)
function nextRelease(ds, nowMs) {
  const list = FORECAST_KINDS[ds] ? releaseTimes(ds, nowMs + 4 * 3600000, 4) : midReleaseTimes(nowMs + 13 * 3600000, 13);
  const avail = FORECAST_KINDS[ds] ? releaseTimes(ds, nowMs, 1) : midReleaseTimes(nowMs, 13);
  const lastAvail = avail[avail.length - 1] || "";
  return list.find((b) => b > lastAvail) || null;
}
export function forecastStatus({ nowMs, hours = 48, grids, regions, releases, firstBase = {} }) {
  const out = [];
  const have = new Map();
  for (const r of releases.short) have.set(`${r.dataset}|${r.nx},${r.ny}|${r.base}`, r);
  for (const r of releases.mid) have.set(`${r.dataset}|${r.region}|${r.base}`, r);
  const targetsOf = (ds) => (FORECAST_KINDS[ds] ? grids.map((g) => `${g.nx},${g.ny}`) : [...new Set(regions.map((r) => r[MID_KINDS[ds].regionCol]).filter(Boolean))]);
  for (const ds of [...Object.keys(FORECAST_KINDS), ...Object.keys(MID_KINDS)]) {
    const all = FORECAST_KINDS[ds] ? releaseTimes(ds, nowMs, hours) : midReleaseTimes(nowMs, hours);
    // 수집 시작(그 데이터셋 첫 발표) 전 발표는 기대에서 뺀다 — 처음부터 받을 수 없던 것이지 빠진 것이 아님
    const floor = firstBase[ds] || null;
    const bases = floor ? all.filter((b) => b >= floor) : all;
    const targets = targetsOf(ds);
    const missing = [];
    let got = 0, latest = null, latestAt = null;
    for (const b of bases) for (const t of targets) {
      const r = have.get(`${ds}|${t}|${b}`);
      if (r) { got++; if (!latest || b > latest) latest = b; if (!latestAt || (r.collectedAt && r.collectedAt > latestAt)) latestAt = r.collectedAt; continue; }
      missing.push({ base: b, target: t, recollectable: nowMs - wallMs(b) <= PROVIDER_WINDOW_H * 3600000 });
    }
    const ageMin = latest ? Math.round((nowMs - wallMs(latest)) / 60000) : null;
    out.push({
      dataset: ds, label: LABEL[ds], kind: ds === "KMA_ULTRA_NCST" ? "실황" : "예보", unit: FORECAST_KINDS[ds] ? "격자" : "구역",
      targets: targets.length, expected: bases.length * targets.length, have: got, missing: missing.length,
      missingRecollectable: missing.filter((m) => m.recollectable).length,
      missingList: missing.slice(-200).reverse(),
      latestBase: latest, latestCollectedAt: latestAt ? wallOf(Date.parse(latestAt)) : null,
      ageMin, stale: ageMin == null || ageMin > STALE_AFTER_MIN[ds],
      nextRelease: nextRelease(ds, nowMs),
      collectingSince: floor, beforeStart: all.length - bases.length,
    });
  }
  return { ok: true, now: wallOf(nowMs), hours, providerWindowH: PROVIDER_WINDOW_H, datasets: out, rule: `기대 발표 = 수집기와 같은 발표 규칙(조회 가능 지연 포함) × 사용 중 지점의 격자/구역. 수집 시작(데이터셋 첫 발표) 전 발표는 세지 않음. 지금 시각 기준 아직 조회할 수 없는 발표는 '미적재'가 아니라 '다음 발표'로 표시. 기상청은 최근 ${PROVIDER_WINDOW_H}시간 발표만 다시 주므로 그보다 오래된 미적재는 다시 받을 수 없음.` };
}
