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
  await ctx.close();
  // 5) 날짜·배틀 기본 열기: 저장한 지점(nw.station = {id,why,at}) 있음/없음, 옛 주소·옛 저장값 → '조회 실패'·'[object Object]'가 없어야 함
  const LOADS = [
    [null, "/stories/battle", null], [{ id: "159", why: "manual" }, "/stories/battle", "159"], [{ id: "108", why: "geo" }, "/stories/battle", "108"],
    [null, "/stories/day", null], [{ id: "159", why: "manual" }, "/stories/day", "159"],
    [null, "/stories/battle?cases=A.108.S.5.5.0,B.108.S.1.1.0", "108"], [null, "/stories/battle?cases=A.[object Object].S.5.5.0.2025,B.[object Object].S.1.1.0.2025", "108"],
    [null, "/stories/day?station=[object Object]&date=2025-10-18", "108"],
  ];
  for (const [saved, path, wantSt] of LOADS) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    if (saved) await c2.addInitScript((x) => localStorage.setItem("nw.station", JSON.stringify({ ...x, at: Date.now() })), saved);
    const p2 = await c2.newPage();
    const bad = [];
    p2.on("pageerror", (e) => bad.push(`스크립트 오류 ${e.message}`));
    p2.on("request", (r) => { if (r.url().includes("/api/") && /object/i.test(decodeURIComponent(r.url()))) bad.push(`잘못된 요청 ${r.url().slice(0, 120)}`); });
    await p2.goto(`${BASE}/#${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await p2.waitForTimeout(2500);
    const pg = path.startsWith("/stories/battle") ? "#sbattle" : "#sday";
    const txt = await p2.locator(pg).innerText().catch(() => "");
    checks++;
    if (/조회 실패/.test(txt)) bad.push(`'조회 실패' ${(txt.match(/조회 실패[^\n]*/) || [""])[0]}`);
    if (/object Object/.test(txt)) bad.push("'[object Object]' 표시");
    if (wantSt) { const got = await p2.evaluate(() => (document.querySelector("#dbSt,#dsSt") || {}).value || ""); if (got !== wantSt) bad.push(`지점 ${got} ≠ ${wantSt}`); }
    if (bad.length) fails.push(`${v} 기본 열기 ${path}${saved ? ` (저장 ${saved.id}/${saved.why})` : ""}: ${bad.join("; ")}`);
    await c2.close();
  }
  if (errs.length) fails.push(`${v} 스크립트 오류: ${[...new Set(errs)].slice(0, 5).join(" | ")}`);
  // 6) 모든 주요 화면 × 지점(저장한 지점): 빨간 오류 상자(스크립트 오류 문구)·섹션 '그리지 못함'·페이지 오류가 없어야 함
  //    (2026-10-19 내일 날씨 광주: "Cannot read properties of undefined (reading 'length')" 로 화면 전체가 비었던 회귀)
  const ALL_ST = await fetch(`${BASE}/api/stations`).then((r) => r.json()).then((r) => (Array.isArray(r) ? r : r.data || []).filter((x) => x.enabled !== false).map((x) => String(x.station_id))).catch(() => ["108", "156", "159"]);
  const SCREENS = [["/today", "#today", true], ["/forecast", "#forecast", true], ["/stats/overview", "#dash", false], ["/stats/yearly", "#dash", false], ["/stats/region", "#dash", false], ["/stats/life", "#dash", false], ["/stats/records", "#dash", false], ["/stories/day", "#sday", false], ["/stories/battle", "#sbattle", false], ["/questions", "#dash", false], ["/hourly-weather", "#hourly", false], ["/daily-weather", "#daily", false], ["/my", "#mysettings", false]];
  const JS_ERR = /Cannot read|undefined|is not a function|is not defined|TypeError|ReferenceError|SyntaxError|\[object Object\]|NaN/;
  for (const [path, sel, every] of SCREENS) for (const sid of every ? ALL_ST : ALL_ST.filter((x) => ["108", "156", "159"].includes(x))) {
    const c3 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    await c3.addInitScript((id) => localStorage.setItem("nw.station", JSON.stringify({ id, why: "manual", at: Date.now() })), sid);
    const p3 = await c3.newPage();
    const bad = [];
    p3.on("pageerror", (e) => bad.push(`페이지 오류 ${e.message}`));
    await p3.goto(`${BASE}/#${path}`, { waitUntil: "load" }).catch(() => {});
    await p3.waitForFunction((q) => { const el = document.querySelector(q); return el && !/불러오는 중|준비 중/.test(el.innerText); }, sel, { timeout: 15000 }).catch(() => {});
    await p3.waitForTimeout(800);
    const r = await p3.evaluate((q) => ({ red: [...document.querySelectorAll(`${q} .result.bad, ${q} .bad.card`)].map((e) => e.innerText.trim()).filter(Boolean), sec: [...document.querySelectorAll(`${q} [data-sec-err]`)].map((e) => e.dataset.secErr), errs: (window.NWSectionErrors || []).map((x) => `${x.name}: ${x.message}`) }), sel);
    checks++;
    for (const t of r.red) if (JS_ERR.test(t)) bad.push(`빨간 오류 상자 "${t.slice(0, 90)}"`);
    if (r.sec.length) bad.push(`그리지 못한 섹션 [${r.sec}] ${r.errs.slice(0, 2).join(" | ")}`);
    if (bad.length) fails.push(`${v} 화면 ${path} 지점 ${sid}: ${[...new Set(bad)].join("; ")}`);
    await c3.close();
  }
  // 7) 내일 날씨가 자료 일부가 빠진 응답(옛 서버·새 서버 엇갈림)에도 화면 전체가 비지 않아야 함
  {
    const c4 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    await c4.route(/\/api\/rt\/forecast\?/, async (route) => { const res = await route.fetch(); const j = await res.json(); for (const k of ["changes", "week", "bigChanges", "outlook", "revisions"]) delete j[k]; j.days = (j.days || []).map((x, i) => (i === 2 ? { ...x, maxCmp: undefined } : x)); await route.fulfill({ response: res, json: j }); });
    const p4 = await c4.newPage();
    const pe = [];
    p4.on("pageerror", (e) => pe.push(e.message));
    await p4.goto(`${BASE}/#/forecast`, { waitUntil: "load" }).catch(() => {});
    await p4.waitForSelector("#fcOut .fv-hero", { timeout: 15000 }).catch(() => {});
    await p4.waitForTimeout(800);
    const r = await p4.evaluate(() => ({ hero: !!document.querySelector("#fcOut .fv-hero"), cards: document.querySelectorAll("#fcOut > .card, #fcOut > section, #fcOut > details").length, red: [...document.querySelectorAll("#fcOut .result.bad")].map((e) => e.innerText) }));
    checks++;
    if (!r.hero || r.cards < 4 || r.red.some((t) => JS_ERR.test(t)) || pe.length) fails.push(`${v} 내일 날씨 빠진 자료: hero=${r.hero} 카드 ${r.cards}개 빨간 [${r.red.join(" / ").slice(0, 120)}] ${pe.slice(0, 2).join(" | ")}`);
    await c4.close();
  }
}
// 8) 캐시 무효화: index.html 의 스크립트·스타일 ?v= 는 내용 해시(고친 파일을 옛 숫자로 내보내 1년 캐시에 갇히지 않게)
{
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  const refs = [...html.matchAll(/(?:src|href)="(\/[\w\-./]+\.(?:js|css|mjs))\?v=([^"]*)"/g)];
  checks++;
  const notHash = refs.filter((m) => !/^[\w-]{10}$/.test(m[2])).map((m) => `${m[1]}?v=${m[2]}`);
  if (!refs.length || notHash.length) fails.push(`캐시 무효화: 내용 해시가 아닌 ?v= ${notHash.slice(0, 5).join(", ") || "(참조 없음)"}`);
}
await browser.close();
console.log(`ROUTE-ISOLATION ${BASE} views=${VIEWS} checks=${checks} fails=${fails.length}`);
for (const f of fails.slice(0, 80)) console.log("FAIL", f);
process.exit(fails.length ? 1 : 0);
