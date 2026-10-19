// astra 6단계: 바람 체감(NWS)·산책·러닝 시간 찾기·기기 설정(rt-activity.js)·하루 구간 끄기(rt-story-visuals noSegs)
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function load(ls = {}) {
  const store = { ...ls };
  const win = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ["public/info-tip.js", "public/rt-weather-art.js", "public/rt-story-visuals.js", "public/rt-activity.js"]) vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), ctx);
  win.store = store;
  return win;
}
const wall = (base, k) => { const t = new Date(Date.parse(`${base.replace(" ", "T")}Z`) + k * 36e5).toISOString(); return `${t.slice(0, 10)} ${t.slice(11, 13)}:00:00`; };
const fc = (start, n, f = () => ({})) => [...Array(n)].map((_, i) => ({ time: wall(start, i), ta: 15, ws: 2, pty: "없음", pop: 10, pcp: "강수없음", pcpMm: 0, ...f(i) }));

test("바람 체감(NWS 2001): 공식값·적용 범위(10℃ 이하, 1.3411m/s 초과)·자료 없음", () => {
  const { RTAct: A } = load();
  // 0℃, 5m/s: TF=32, V=11.18mph → WCF = 35.74+19.888−35.75·V^0.16+0.4275·32·V^0.16
  const V = 5 * 2.2369362921, p = Math.pow(V, 0.16), wcf = 35.74 + 0.6215 * 32 - 35.75 * p + 0.4275 * 32 * p;
  const r = A.windChill(0, 5);
  assert.equal(r.status, "ok"); assert.equal(r.value, Math.round(((wcf - 32) * 5) / 9 * 10) / 10); assert.ok(r.value < 0 && r.value > -6);
  assert.equal(A.windChill(-10, 10).value, -20.3); // 14°F·22.37mph → −4.5°F
  assert.equal(A.windChill(10, 3).status, "ok"); // 경계: 10℃ 포함
  assert.equal(A.windChill(10.1, 3).status, "range");
  assert.equal(A.windChill(5, 1.3411).status, "range"); // 3mph 이하
  assert.equal(A.windChill(5, 1.35).status, "ok");
  assert.equal(A.windChill(null, 3).status, "missing");
  assert.equal(A.windChill(5, 3).text, "바람을 고려한 추정 체감 — NWS 공식, 참고용");
  assert.equal(A.chillHtml(15, 4), ""); // 범위 밖이면 아무것도 안 그림
  assert.match(A.chillHtml(2, 4), /참고용/);
});

test("시간 판정: 강수형태·강수확률·강수량(‘1mm 미만’은 무강수 아님)·자료 없음은 판단 보류", () => {
  const { RTAct: A } = load();
  const c = A.COND_DEFAULT;
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 2, pty: "없음", pop: 10, pcp: "강수없음", pcpMm: 0 }, c).status, "pass");
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 2, pty: "없음", pop: 10, pcp: "강수 없음", pcpMm: null }, c).status, "pass");
  const lt1 = A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 2, pty: "없음", pop: 10, pcp: "1mm 미만", pcpMm: null }, c);
  assert.equal(lt1.status, "fail"); assert.equal(lt1.checks.find((x) => x.id === "pcp").status, "fail");
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 2, pty: "없음", pop: 30, pcp: "강수없음", pcpMm: 0 }, c).status, "fail"); // 30% 미만만
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 5, pty: "없음", pop: 0, pcp: "강수없음", pcpMm: 0 }, c).status, "pass"); // 5m/s 이하
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 9.9, ws: 2, pty: "없음", pop: 0, pcp: "강수없음", pcpMm: 0 }, c).status, "fail");
  const u = A.hourCheck({ time: "2026-10-18 10:00:00", ta: 15, ws: 2, pty: "없음", pop: null, pcp: "강수없음", pcpMm: 0 }, c);
  assert.equal(u.status, "unknown"); assert.match(A.hourDetail(u, "2026-10-18"), /판단 보류.*강수확률 자료 없음/);
  // 실패가 하나라도 있으면 실패(자료 없음보다 우선)
  assert.equal(A.hourCheck({ time: "2026-10-18 10:00:00", ta: 30, ws: null, pty: "없음", pop: 0, pcp: "강수없음", pcpMm: 0 }, c).status, "fail");
});

test("구간 찾기: 2시간 이상 연속만, 선호 시간대와 겹치는 구간 먼저, 판단 보류는 구간을 끊음, 24시간 한도", () => {
  const { RTAct: A } = load();
  const c = { ...A.COND_DEFAULT };
  // 00시부터 30시간: 2~3시(새벽, 2시간), 10시 단독(1시간), 13~16시(4시간), 18시 pop 없음, 19~20시(2시간)
  const ok = new Set([2, 3, 10, 13, 14, 15, 16, 19, 20]);
  const hs = fc("2026-10-18 00:00", 30, (i) => (i === 18 ? { pop: null } : ok.has(i) ? {} : { ta: 5 }));
  const r = A.findWindows(hs, c, { nowW: "2026-10-18 00:20" });
  assert.equal(r.hours.length, 24);
  assert.equal(JSON.stringify(r.windows.map((w) => [w.start.slice(11, 13), w.hours])), JSON.stringify([["13", 4], ["19", 2], ["02", 2]]));
  assert.equal(r.windows[0].prefHours, 4); assert.equal(r.windows[2].prefHours, 0);
  assert.match(r.windows[0].reasons[1], /기온 15℃ · 풍속 최대 2m\/s · 강수확률 최대 10%/);
  assert.equal(r.counts.unknown, 1);
  assert.equal(r.failWhy[0].label, "기온");
  // 지난 시각은 빼고 시작
  assert.equal(A.findWindows(hs, c, { nowW: "2026-10-18 05:40" }).from, "2026-10-18 05:00:00");
  // 12시간 범위·최소 3시간
  const r2 = A.findWindows(hs, { ...c, hours: 12, minRun: 3 }, { nowW: "2026-10-18 00:00" });
  assert.equal(r2.hours.length, 12); assert.equal(r2.windows.length, 0);
  const html = A.walkHtml(r2, { today: "2026-10-18" });
  assert.match(html, /조건 맞는 3시간 연속 구간이 없어요/); assert.match(html, /기온 조건 밖/);
  // 시간이 하나 빠지면(예보 간격 1시간 아님) 이어 붙이지 않음
  const gap = fc("2026-10-18 10:00", 4).filter((_, i) => i !== 2);
  assert.equal(JSON.stringify(A.findWindows(gap, c, {}).windows.map((w) => w.hours)), "[2]");
  assert.equal(A.walkHtml(A.findWindows([], c, {}), { today: "2026-10-18" }).includes("예보 자료가 없어"), true);
});

test("기기 설정: 잘못된 값은 기본값, 저장·되돌리기, 관심 카드, 하루 구간 끄기(noSegs)", () => {
  const w = load({ "nw.activity": JSON.stringify({ tMin: 12, tMax: 99, wind: 4, popMax: 20, minRun: 3, prefFrom: 5, prefTo: 8, hours: 12 }), "nw.interests": JSON.stringify({ walk: false, junk: true }) });
  const A = w.RTAct;
  const c = A.loadCond();
  assert.equal(c.tMin, 12); assert.equal(c.tMax, 25); assert.equal(c.wind, 4); assert.equal(c.minRun, 3); assert.equal(c.hours, 12);
  assert.equal(A.isDefaultCond(c), false);
  A.saveCond(null); assert.equal(w.store["nw.activity"], undefined); assert.equal(A.isDefaultCond(A.loadCond()), true);
  const it = A.loadInterests(); assert.equal(it.walk, false); assert.equal(it.chill, true); assert.equal("junk" in it, false);
  // 거꾸로 된 기온 범위는 기본 범위로
  w.store["nw.activity"] = JSON.stringify({ tMin: 20, tMax: 15 }); assert.equal(A.loadCond().tMin, 10);
  // 하루 구간: 내 설정에서 저장한 모양을 rt-story-visuals 가 그대로 읽음
  A.writeJ("nw.segments", [{ id: "s0", label: "등교", from: 8, to: 9 }]);
  assert.equal(w.RTViz.loadSegs()[0].label, "등교");
  const el = { innerHTML: "", dataset: {}, clientWidth: 360, querySelector: () => null };
  const o = { nowW: "2026-10-18 07:30", fc: fc("2026-10-18 08:00", 12), days: [] };
  w.RTViz.day(el, o); assert.match(el.innerHTML, /등교/);
  w.RTViz.day(el, { ...o, noSegs: true }); assert.doesNotMatch(el.innerHTML, /vz-seg /); assert.doesNotMatch(el.innerHTML, /등교/);
});
