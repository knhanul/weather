#!/usr/bin/env node
// 메뉴 화면 격리 시험: 모든 메뉴 주소를 여러 순서·방법(메뉴 누르기, ☰ 서랍, 주소 직접 열기, 주소 바꾸기, 뒤로·앞으로)으로 돌며
// 화면(main > .page)이 정확히 하나만 보이는지, 그 화면이 맞는지, 지난 날씨 안의 패널이 하나인지, 맨 위로 갔는지, 메뉴 강조가 맞는지 확인.
// 사용: PW_MODULE=/workspace/shotkit/node_modules/playwright-core/index.mjs node scripts/route-isolation.mjs https://weather.nuni.co.kr [390,pc] [shotDir]
const { chromium } = await import(process.env.PW_MODULE || "playwright-core");
const BASE = (process.argv[2] || "https://weather.nuni.co.kr").replace(/\/$/, "");
const VIEWS = (process.argv[3] || "390,pc").split(",");
const SHOTS = process.argv[4] || "";
const VW = { "390": [390, 844, true], pc: [1366, 900, false] };

// [주소, 보일 화면 id, 지난 날씨 패널 id(dash 일 때), 강조될 메뉴 선택자]
const ROUTES = [
  ["/today", "today", null, 'a[data-page="today"]'],
  ["/forecast", "forecast", null, 'a[data-page="forecast"]'],
  ["/my", "mysettings", null, 'a[data-page="mysettings"]'],
  ["/stats/overview", "dash", "tabOverview", 'a[data-sub="overview"]'],
  ["/stats/yearly", "dash", "tabYearly", 'a[data-sub="yearly"]'],
  ["/stats/region", "dash", "tabRegion", 'a[data-sub="region"]'],
  ["/stats/life", "dash", "tabLife", 'a[data-sub="life"]'],
  ["/stats/records", "dash", "tabRecords", 'a[data-sub="records"]'],
  ["/stories/day", "sday", null, 'a[data-page="sday"]'],
  ["/stories/battle", "sbattle", null, 'a[data-page="sbattle"]'],
  ["/questions", "dash", "tabQuestions", 'a[data-page="questions"]'],
  ["/hourly-weather", "hourly", null, 'a[data-page="hourly"]'],
  ["/daily-weather", "daily", null, 'a[data-page="daily"]'],
  ["/view-settings", "download", null, 'a[data-page="download"]'],
  ["/collect", "collect|locked", null, 'a[data-page="collect"]'],
  ["/gaps", "gaps|locked", null, 'a[data-page="gaps"]'],
  ["/jobs", "jobs|locked", null, 'a[data-page="jobs"]'],
  ["/stations", "stations|locked", null, 'a[data-page="stations"]'],
  ["/provider", "provider|locked", null, 'a[data-page="provider"]'],
];
// 예전 주소·첫 화면(주소가 바뀌어 들어가야 할 화면)
const ALIASES = [
  ["/", "today"], ["/nope", "today"], ["/hourly", "hourly"], ["/daily", "daily"], ["/download", "download"],
  ["/stats/life?view=cards", "dash"], ["/stats/life?view=day&date=10-18", "sday"], ["/stats/records?view=day&date=10-18", "sday"],
  ["/stats/records?view=date&date=2018-08-01", "sday"], ["/stories/day?station=108&date=2018-08-01", "sday"], ["/stories/battle?station=108", "sbattle"],
];

const fails = [];
let checks = 0;
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });

async function state(p) {
  return p.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
    return {
      hash: location.hash,
      pages: [...document.querySelectorAll("main > .page")].filter(vis).map((e) => e.id),
      panels: [...document.querySelectorAll("#dash > .st-panel")].filter(vis).map((e) => e.id),
      active: [...document.querySelectorAll("aside nav a.active[data-page]:not(.nav-parent), aside nav a.active[data-sub]")].map((a) => a.getAttribute("href")),
      y: Math.round(window.scrollY),
    };
  });
}
async function settle(p) { await p.waitForTimeout(450); }
function expectFor(path) { return ROUTES.find((r) => r[0] === path.split("?")[0]); }
async function check(p, v, how, path, scrolled) {
  const r = expectFor(path);
  const s = await state(p);
  checks++;
  const bad = [];
  if (s.pages.length !== 1) bad.push(`보이는 화면 ${s.pages.length}개 [${s.pages}]`);
  if (r) {
    const ok = r[1].split("|");
    if (!ok.includes(s.pages[0])) bad.push(`화면 ${s.pages[0]} ≠ ${r[1]}`);
    if (r[2] && (s.panels.length !== 1 || s.panels[0] !== r[2])) bad.push(`패널 [${s.panels}] ≠ ${r[2]}`);
    if (s.pages[0] !== "locked") {
      const want = await p.$eval(`aside nav ${r[3]}`, (a) => a.getAttribute("href")).catch(() => null);
      if (!s.active.includes(want)) bad.push(`메뉴 강조 [${s.active}] ≠ ${want}`);
      if (s.active.length !== 1) bad.push(`강조 메뉴 ${s.active.length}개 [${s.active}]`);
    }
  }
  if (scrolled && s.y > 2) bad.push(`맨 위가 아님 scrollY=${s.y}`);
  if (bad.length) fails.push(`${v} ${how} → ${path}: ${bad.join("; ")}`);
  return s;
}
async function scrollDown(p) { await p.evaluate(() => window.scrollTo(0, 600)); }
async function navClick(p, mob, path) {
  const r = expectFor(path);
  if (mob) {
    await p.click("#abMenu");
    await p.waitForSelector("body.drawer-open", { timeout: 3000 });
    // 하위 메뉴가 접혀 있으면 펼침
    const a = await p.$(`aside nav ${r[3]}`);
    if (!(await a.isVisible())) {
      const sub = await a.evaluate((el) => el.closest(".nav-sub")?.id);
      if (sub) await p.click(`.nav-exp[aria-controls="${sub}"]`).catch(() => {});
    }
    if (!(await a.isVisible())) { // 서랍에 안 보이는 메뉴(로그인 전 관리 메뉴 등): 서랍을 닫고 주소로
      await p.keyboard.press("Escape"); await p.waitForSelector("body:not(.drawer-open)", { timeout: 3000 }); await p.waitForTimeout(150);
      const same = await p.evaluate((x) => location.hash.split("?")[0] === "#" + x, path);
      await p.evaluate((x) => { location.hash = x; }, path); return same ? "hash-same" : "hash";
    }
    await a.click();
  } else {
    const a = await p.$(`aside nav ${r[3]}`);
    if (!(await a.isVisible())) {
      const sub = await a.evaluate((el) => el.closest(".nav-sub")?.id);
      if (sub) await p.click(`.nav-exp[aria-controls="${sub}"]`).catch(() => {});
    }
    if (!(await a.isVisible())) { await p.evaluate((h) => { location.hash = h; }, path); return "hash"; }
    await a.click();
  }
  return "click";
}
// 섞인 순서(같은 순서가 되풀이되도록 고정 씨앗)
function shuffled(arr, seed) { const a = [...arr]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

for (const v of VIEWS) {
  const [w, h, mob] = VW[v];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob, locale: "ko-KR", timezoneId: "Asia/Seoul", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  // 1) 주소 직접 열기(새로 읽기)
  for (const [path] of ROUTES) { await p.goto(`${BASE}/#${path}`, { waitUntil: "load" }); await p.waitForTimeout(900); await check(p, v, "직접 열기", path, false); }
  for (const [path, want] of ALIASES) {
    await p.goto(`${BASE}/#${path}`, { waitUntil: "load" }); await p.waitForTimeout(900);
    const s = await state(p); checks++;
    if (s.pages.length !== 1 || s.pages[0] !== want) fails.push(`${v} 예전 주소 ${path}: 화면 [${s.pages}] ≠ ${want} (${s.hash})`);
  }
  // 2) 메뉴 누르기(넓은 화면: 옆 메뉴, 좁은 화면: ☰ 서랍) — 앞으로, 거꾸로, 섞어서 두 번
  await p.goto(`${BASE}/#/today`, { waitUntil: "load" }); await p.waitForTimeout(1500);
  const paths = ROUTES.map((r) => r[0]);
  const orders = [paths, [...paths].reverse(), shuffled(paths, 7), shuffled(paths, 31)];
  const visited = [];
  let shot = 0;
  for (const ord of orders) for (const path of ord) {
    await scrollDown(p);
    const how = await navClick(p, mob, path);
    await settle(p);
    await check(p, v, mob ? `☰ ${how}` : how, path, how !== "hash-same"); // 메뉴가 안 보여 같은 주소를 다시 넣은 경우는 화면 이동이 아님
    visited.push(path);
    if (SHOTS && mob && shot < 3 && ["/stories/battle", "/my", "/forecast"].includes(path) && orders.indexOf(ord) === 2) {
      await p.waitForTimeout(2500); await p.screenshot({ path: `${SHOTS}/${v}-${path.replace(/\W+/g, "_")}.png` }); shot++;
    }
  }
  // 3) 주소 바꾸기(hashchange)로 모든 쌍 일부: 각 화면 → 다음 두 화면
  for (let i = 0; i < paths.length; i++) for (const k of [1, 5]) {
    const a = paths[i], b = paths[(i + k) % paths.length];
    await p.evaluate((x) => { location.hash = x; }, a); await settle(p);
    await scrollDown(p);
    await p.evaluate((x) => { location.hash = x; }, b); await settle(p);
    await check(p, v, `주소 ${a} 다음`, b, true);
  }
  // 4) 뒤로·앞으로: 마지막 8개 화면을 되짚기
  const hist = [];
  for (const path of shuffled(paths, 99).slice(0, 8)) { await p.evaluate((x) => { location.hash = x; }, path); await settle(p); hist.push(path); }
  for (let i = hist.length - 2; i >= 0; i--) { await p.goBack(); await settle(p); await check(p, v, "뒤로", hist[i], false); }
  for (let i = 1; i < hist.length; i++) { await p.goForward(); await settle(p); await check(p, v, "앞으로", hist[i], false); }
  if (errs.length) fails.push(`${v} 스크립트 오류: ${[...new Set(errs)].slice(0, 5).join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(`ROUTE-ISOLATION ${BASE} views=${VIEWS} checks=${checks} fails=${fails.length}`);
for (const f of fails.slice(0, 80)) console.log("FAIL", f);
process.exit(fails.length ? 1 : 0);
