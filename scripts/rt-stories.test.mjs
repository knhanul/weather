import test from "node:test";
import assert from "node:assert/strict";
import { createHourlyStore, addHourlyRows, ymdToDn, dnToYmd } from "../stats-engine.mjs";
import { similarDays, selectStories, unusualFromPct, unusualFromRank } from "../rt-stories.mjs";

const pad = (n) => String(n).padStart(2, "0");
// 결정적 의사난수
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function store(fromYear, toYmd, gap = new Set()) {
  const hs = createHourlyStore("1", Number(toYmd.slice(0, 4)));
  const rows = [];
  for (let dn = ymdToDn(`${fromYear}-01-01`); dn <= ymdToDn(toYmd); dn++) {
    const ymd = dnToYmd(dn), off = rnd() * 6 - 3, rain = rnd() < 0.2;
    for (let h = 0; h < 24; h++) {
      if (gap.has(`${ymd} ${h}`)) continue;
      rows.push({ observation_datetime: `${ymd} ${pad(h)}:00`, temperature: (15 + off + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI)).toFixed(1), precipitation: rain && h === 5 ? "1.5" : "", humidity: String(Math.round(60 + off * 3)) });
    }
  }
  addHourlyRows(hs, rows);
  return hs;
}
// 독립 계산(브루트포스): 같은 규칙을 다른 방식으로
function brute(hs, target, hours) {
  const out = [];
  const md = target.date.slice(5);
  for (let y = 1990; y <= Number(target.date.slice(0, 4)); y++) for (let o = -15; o <= 15; o++) {
    const d = new Date(Date.UTC(y, Number(md.slice(0, 2)) - 1, Number(md.slice(3)) + o));
    const ymd = d.toISOString().slice(0, 10);
    if (ymd >= target.date) continue;
    const dn = ymdToDn(ymd); let s = 0, ok = true;
    for (const h of hours) { const i = (dn - hs.base) * 24 + h; if (!hs.src[i]) { ok = false; break; } s += (hs.ta[i] / 10 - target.ta[h]) ** 2; }
    if (ok) out.push({ ymd, rmse: Math.sqrt(s / hours.length) });
  }
  return out.sort((a, b) => a.rmse - b.rmse);
}
test("유사일(진행 중): 관측 시각만 RMSE, 결측 후보 제외, 독립 계산과 일치", () => {
  const hs = store(1990, "2026-10-12", new Set(["2020-10-10 3"]));
  const ta = new Array(24).fill(NaN); for (let h = 0; h <= 14; h++) ta[h] = 16 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
  const r = similarDays(hs, { date: "2026-10-13", ta, hm: [], rn: [] }, { mode: "partial" });
  assert.equal(r.ok, true); assert.equal(r.hoursUsed.length, 15);
  const b = brute(hs, { date: "2026-10-13", ta }, r.hoursUsed);
  assert.equal(r.valid, b.length); assert.ok(r.excluded >= 1);
  assert.equal(r.top[0].date, b[0].ymd); assert.ok(Math.abs(r.top[0].rmse - b[0].rmse) < 0.006);
  assert.ok(!r.top.some((x) => x.date === "2020-10-10"));
  for (let i = 1; i < r.top.length; i++) assert.ok(r.top[i].score >= r.top[i - 1].score);
});
test("유사일: 관측 시각 6개 미만이면 비교 안 함", () => {
  const hs = store(2024, "2026-10-12");
  const ta = new Array(24).fill(NaN); ta[0] = 10; ta[1] = 11;
  const r = similarDays(hs, { date: "2026-10-13", ta, hm: [], rn: [] });
  assert.equal(r.ok, false); assert.equal(r.top.length, 0);
});
test("유사일(하루 전체): 가중식 = 1×RMSE+0.5|Δ최고|+0.5|Δ최저|+2×강수불일치+0.05|Δ습도|", () => {
  const hs = store(2000, "2026-10-12");
  const dn = ymdToDn("2026-10-12"), get = (f) => Array.from({ length: 24 }, (_, h) => hs[f][(dn - hs.base) * 24 + h] / 10);
  const tgt = { date: "2026-10-12", ta: get("ta"), hm: get("hm"), rn: get("rn") };
  const r = similarDays(hs, tgt, { mode: "full" });
  assert.equal(r.ok, true);
  for (const c of r.top) {
    const cd = ymdToDn(c.date), ta = Array.from({ length: 24 }, (_, h) => hs.ta[(cd - hs.base) * 24 + h] / 10), hm = Array.from({ length: 24 }, (_, h) => hs.hm[(cd - hs.base) * 24 + h] / 10), rn = Array.from({ length: 24 }, (_, h) => hs.rn[(cd - hs.base) * 24 + h] / 10);
    const rmse = Math.sqrt(ta.reduce((s, v, h) => s + (v - tgt.ta[h]) ** 2, 0) / 24);
    const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const mis = (rn.reduce((s, x) => s + x, 0) >= 0.1) !== (tgt.rn.reduce((s, x) => s + x, 0) >= 0.1) ? 1 : 0;
    const sc = rmse + 0.5 * Math.abs(Math.max(...ta) - Math.max(...tgt.ta)) + 0.5 * Math.abs(Math.min(...ta) - Math.min(...tgt.ta)) + 2 * mis + 0.05 * Math.abs(m(hm) - m(tgt.hm));
    assert.ok(Math.abs(c.score - sc) < 0.006, `${c.date} ${c.score} vs ${sc}`);
  }
  // 3일 안 같은 흐름은 하나만
  for (let i = 0; i < r.top.length; i++) for (let j = i + 1; j < r.top.length; j++) assert.ok(Math.abs(ymdToDn(r.top[i].date) - ymdToDn(r.top[j].date)) > 3);
});
test("이야기 선별: 표본 부족·낮은 이례성 제외, 같은 현상 하나, 예보·최근 감점, 최대 4", () => {
  const C = [
    { key: "a", phenomenon: "기록", kind: "예보", unusual: 0.9, samples: 100, minSamples: 60, info: 0.9, text: "x" },
    { key: "b", phenomenon: "기록", kind: "관측", unusual: 1, samples: 100, minSamples: 60, info: 1, text: "x" },
    { key: "c", phenomenon: "지금 기온", kind: "관측", unusual: 0.8, samples: 10, minSamples: 60, info: 0.8, text: "x" },
    { key: "d", phenomenon: "강수", kind: "관측", unusual: 0.1, samples: 100, minSamples: 60, info: 0.8, text: "x" },
    { key: "e", phenomenon: "주", kind: "관측", unusual: 0.8, samples: 7, minSamples: 5, info: 0.7, text: "x" },
    { key: "f", phenomenon: "주2", kind: "관측", unusual: 0.8, samples: 7, minSamples: 5, info: 0.7, text: "x" },
  ];
  const r = selectStories(C, { recent: new Set(["f"]) });
  assert.deepEqual(r.stories.map((x) => x.key), ["b", "e", "f"]);
  assert.equal(r.stories[2].score, Math.round((0.6 * 0.8 + 0.4 * 0.7) * 0.5 * 100) / 100);
  const why = Object.fromEntries(r.dropped.map((d) => [d.key, d.reason]));
  assert.match(why.a, /같은 현상/); assert.match(why.c, /표본 부족/); assert.match(why.d, /이례성/);
  assert.equal(unusualFromPct(95), 0.9); assert.equal(unusualFromRank(1, 37), 1);
});
