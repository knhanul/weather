// 메뉴 이름·예전 주소, 시간별·일별 날씨 레이아웃·그리드/카드, 보기 설정(비로그인/로그인) e2e + 스크린샷 /workspace/shots/view-*.png
import { chromium } from "playwright-core";
const ANON = process.env.ANON || "http://127.0.0.1:8099"; // 실제 자료(테스트 컨테이너)
const LOCAL = process.env.LOCAL || "http://127.0.0.1:8095"; // 로그인 테스트 세션(JSON 모드)
const TOKEN = process.env.TOKEN;
const SH = "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const errs = [];
const toBar = (page, id) => page.evaluate((id) => { const el = document.getElementById(id); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8); }, id).then(() => page.waitForTimeout(150));
async function ctxFor(tag, base, { mobile = false, cookie = false } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul", acceptDownloads: true });
  if (cookie) await ctx.addCookies([{ name: "nw_session", value: TOKEN, url: base }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`${tag} pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon|400 \(Bad Request\)/.test(m.text()) && errs.push(`${tag} console ${m.text()}`));
  const calls = [];
  page.on("request", (r) => { const u = r.url(); if (u.includes("/api/view") || u.includes("/api/export/layouts")) calls.push(`${r.method()} ${u.replace(base, "")}`); });
  return { ctx, page, calls };
}
const views = (calls) => calls.filter((c) => c.startsWith("GET /api/view?")).length;
const heads = (page, sel) => page.$$eval(`${sel} .vw-grid th`, (t) => t.map((x) => x.childNodes[0].textContent.trim()));
const vstate = (page, k) => page.evaluate((k) => ({ layout: window.Views._state[k].layout, view: window.Views._state[k].view, fetches: window.Views._state[k].fetches }), k);
const settle = (page) => page.waitForFunction(() => !document.querySelector('.vw-result[aria-busy="true"]'), null, { timeout: 20000 }).then(() => page.waitForTimeout(150));

// ---------- 비로그인 · 데스크톱 (실제 자료)
{
  const { ctx, page, calls } = await ctxFor("anon", ANON);
  await page.goto(`${ANON}/#/hourly?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hResult .vw-grid, #hResult .vw-cards", { timeout: 20000 });
  ok(/^#\/hourly-weather\?/.test(await page.evaluate(() => location.hash)), `예전 #/hourly → ${await page.evaluate(() => location.hash.slice(0, 40))}`);
  ok((await page.textContent("#phTitle")) === "시간별 날씨" && (await page.title()).startsWith("시간별 날씨"), "제목 '시간별 날씨'");
  const nav = await page.$$eval("nav a[data-page]", (a) => a.map((x) => [x.dataset.page, x.textContent.trim(), x.getAttribute("href"), x.classList.contains("active")]));
  ok(JSON.stringify(nav.slice(2, 5).map((x) => x.slice(0, 3))) === JSON.stringify([["hourly", "시간별 날씨", "#/hourly-weather"], ["daily", "일별 날씨", "#/daily-weather"], ["download", "보기 설정", "#/view-settings"]]) && nav[2][3], `메뉴 ${JSON.stringify(nav.slice(2, 5))}`);
  const opts = await page.$$eval("#hBar select option", (o) => o.map((x) => x.value));
  ok(opts.every((v) => v.startsWith("preset:preset_hourly_")) && opts.length === 4, `비로그인 레이아웃 = 시간 프리셋 4개만 ${opts.join(",")}`);
  ok(!(await page.$("#hBar optgroup[label='내 레이아웃']")) && /카카오 로그인/.test(await page.textContent("#hBar")), "비로그인: 내 레이아웃 없음 + 로그인 안내");
  let s = await vstate(page, "hourly");
  ok(s.layout === "preset:preset_hourly_default" && s.view === "grid", `기본 레이아웃·그리드 ${JSON.stringify(s)}`);
  ok(JSON.stringify(await heads(page, "#hResult")) === JSON.stringify(["관측일시", "지점번호", "지점명", "기온", "1시간 강수량", "상대습도", "풍속", "자료출처"]), `기본 구성 열 ${JSON.stringify(await heads(page, "#hResult"))}`);
  await page.screenshot({ path: `${SH}/view-hourly-grid-desktop.png`, fullPage: false });
  // 레이아웃 바꾸기 → 그 컬럼만 다시 받음, 열 순서 = 레이아웃 순서
  const n0 = views(calls);
  await page.selectOption("#hBar select", "preset:preset_hourly_temp");
  await settle(page);
  ok(views(calls) === n0 + 1 && /columns=observation_datetime%2Cstation_id%2Cstation_name%2Ctemperature%2Cdew_point/.test(calls.at(-1)), `레이아웃 변경 → 그 컬럼만 요청 ${calls.at(-1).slice(0, 140)}`);
  ok(JSON.stringify(await heads(page, "#hResult")) === JSON.stringify(["관측일시", "지점번호", "지점명", "기온", "이슬점온도", "증기압", "상대습도", "지면온도"]), `레이아웃 순서대로 열 ${JSON.stringify(await heads(page, "#hResult"))}`);
  // 카드로 → 다시 받지 않음
  const n1 = views(calls);
  await page.click("#hBar button[data-vw=card]");
  await page.waitForSelector("#hResult .vw-cards");
  ok(views(calls) === n1, "그리드→카드 전환은 다시 받지 않음");
  const card = await page.$eval("#hResult .vw-card", (c) => ({ h: c.querySelector(".vw-card-h").textContent, dt: [...c.querySelectorAll("dt")].map((x) => x.textContent), dd: c.querySelector("dd").textContent }));
  ok(JSON.stringify(card.dt) === JSON.stringify(["기온", "이슬점온도", "증기압", "상대습도", "지면온도"]) && /°C|—/.test(card.dd) && /108 서울/.test(card.h), `카드: 항목·단위·지점 ${JSON.stringify(card)}`);
  const hash = await page.evaluate(() => location.hash);
  ok(/layout=preset%3Apreset_hourly_temp/.test(hash) && /view=card/.test(hash), `주소에 layout·view ${hash.slice(0, 120)}`);
  await page.screenshot({ path: `${SH}/view-hourly-card-desktop.png` });
  // 주소 없이 다시 열면 브라우저에 기억한 것
  await page.goto(`${ANON}/#/hourly-weather`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#hResult .vw-cards", { timeout: 20000 });
  s = await vstate(page, "hourly");
  ok(s.layout === "preset:preset_hourly_temp" && s.view === "card", `비로그인: localStorage 로 기억 ${JSON.stringify(s)}`);
  ok(!calls.some((c) => c.includes("/api/view-prefs") || c.includes("/api/export/layouts")), "비로그인: 보기 설정·레이아웃 API 를 부르지 않음");
  // 일별
  await page.goto(`${ANON}/#/daily?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dResult .vw-grid, #dResult .vw-cards", { timeout: 20000 });
  ok(/^#\/daily-weather/.test(await page.evaluate(() => location.hash)) && (await page.textContent("#phTitle")) === "일별 날씨", "예전 #/daily → 일별 날씨");
  const dopts = await page.$$eval("#dBar select option", (o) => o.map((x) => x.value));
  ok(dopts.every((v) => v.startsWith("preset:preset_daily_")), "일별: 일 프리셋만");
  ok((await page.$$("#dResult tbody tr")).length === 7, `일별 기본 7일 (${(await page.$$("#dResult tbody tr")).length}행)`);
  await page.screenshot({ path: `${SH}/view-daily-grid-desktop.png` });
  await page.selectOption("#dBar select", "preset:preset_daily_temp");
  await settle(page);
  await page.click("#dBar button[data-vw=card]");
  await page.waitForSelector("#dResult .vw-cards");
  await page.screenshot({ path: `${SH}/view-daily-card-desktop.png` });
  // 보기 설정(비로그인)
  await page.goto(`${ANON}/#/download?kind=daily&layout=preset:preset_daily_rain_snow`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input[type=checkbox]", { timeout: 20000 });
  await page.waitForTimeout(800);
  ok(/^#\/view-settings\?kind=daily/.test(await page.evaluate(() => location.hash)) && (await page.textContent("#phTitle")) === "보기 설정", "예전 #/download → 보기 설정(?조건 유지)");
  const ro = await page.evaluate(() => ({ kind: document.getElementById("xKind").value, layout: document.getElementById("xLayoutSelect").value, all: document.querySelectorAll("#xColGroups input").length, dis: document.querySelectorAll("#xColGroups input:disabled").length, custom: !!document.querySelector('#xLayoutSelect option[value="custom_current"]'), prompt: !document.getElementById("xLoginPrompt").hidden && /카카오 로그인/.test(document.getElementById("xLoginPrompt").textContent), chipBtns: document.querySelectorAll("#xOrderWrap button").length, saveHidden: document.getElementById("xLayoutSave").hidden, allBtnHidden: document.getElementById("xBtnAll").hidden }));
  ok(ro.kind === "daily" && ro.layout === "preset:preset_daily_rain_snow", `링크의 kind·layout 반영 ${ro.kind} ${ro.layout}`);
  ok(ro.all > 20 && ro.dis === ro.all && !ro.custom && ro.prompt && ro.chipBtns === 0 && ro.saveHidden && ro.allBtnHidden, `비로그인 읽기 전용 ${JSON.stringify(ro)}`);
  await page.locator("#xColGroups input[data-col=avg_temperature]").click({ force: true }).catch(() => {});
  ok(!(await page.isChecked("#xColGroups input[data-col=avg_temperature]")), "비로그인: 컬럼을 눌러도 바뀌지 않음");
  await page.screenshot({ path: `${SH}/view-settings-loggedout-desktop.png` });
  const gone = await page.evaluate(() => ["xStation", "xFrom", "xFromDaily", "xPreviewThead", "xDownloadBtn", "dlStorageBadge"].filter((id) => document.getElementById(id)).length + document.querySelectorAll(".dl-quick-ranges").length);
  ok(gone === 0 && !/미리보기|내려받기 범위/.test(await page.textContent("#download h2:first-of-type, #download")), "보기 설정: 미리보기·내려받기 범위 없음");
  await ctx.close();
}
// ---------- 비로그인 · 모바일 (처음이면 카드)
{
  const { ctx, page } = await ctxFor("anon-m", ANON, { mobile: true });
  await page.goto(`${ANON}/#/hourly-weather?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hResult .vw-cards", { timeout: 20000 });
  ok((await vstate(page, "hourly")).view === "card", "모바일 처음: 카드");
  await toBar(page, "hBar");
  await page.screenshot({ path: `${SH}/view-hourly-card-mobile.png` });
  await page.click("#hBar button[data-vw=grid]");
  await page.waitForSelector("#hResult .vw-grid");
  await toBar(page, "hBar");
  await page.screenshot({ path: `${SH}/view-hourly-grid-mobile.png` });
  await page.goto(`${ANON}/#/daily-weather?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dResult .vw-cards", { timeout: 20000 });
  await toBar(page, "dBar");
  await page.screenshot({ path: `${SH}/view-daily-card-mobile.png` });
  await page.click("#dBar button[data-vw=grid]");
  await page.waitForSelector("#dResult .vw-grid");
  await toBar(page, "dBar");
  await page.screenshot({ path: `${SH}/view-daily-grid-mobile.png` });
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ovf <= 1, `모바일 가로 넘침 없음 (${ovf}px)`);
  await page.goto(`${ANON}/#/view-settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 20000 });
  await page.waitForTimeout(600);
  const vs = await page.evaluate(() => ({ ovf: document.documentElement.scrollWidth - innerWidth, sel: document.getElementById("xLayoutSelect").value, txt: document.getElementById("xLayoutSelect").selectedOptions[0]?.textContent }));
  ok(vs.ovf <= 1 && vs.sel === "preset:preset_hourly_default" && vs.txt, `보기 설정 모바일: 넘침 없음·기본 프리셋 표시 ${JSON.stringify(vs)}`);
  await page.screenshot({ path: `${SH}/view-settings-loggedout-mobile.png` });
  await ctx.close();
}
// ---------- 로그인(로컬 테스트 세션, JSON 모드 자료 108 2026-09-05~11)
const R = "station=108&from=2026-09-05%2000:00&to=2026-09-11%2023:00";
{
  const { ctx, page, calls } = await ctxFor("login", LOCAL, { cookie: true });
  await page.goto(`${LOCAL}/#/view-settings?kind=hourly`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 20000 });
  await page.waitForTimeout(500);
  const ed = await page.evaluate(() => ({ en: document.querySelectorAll("#xColGroups input:not(:disabled)").length, prompt: document.getElementById("xLoginPrompt").hidden, save: document.getElementById("xLayoutSave").hidden }));
  ok(ed.en > 10 && ed.prompt && !ed.save, `로그인: 컬럼 고르기·저장 가능 ${JSON.stringify(ed)}`);
  // 화면에서 레이아웃 저장: 기본 구성에서 지점명·풍속·출처 빼고 '기온·강수만'
  for (const c of ["station_name", "wind_speed", "source_kind", "humidity"]) await page.uncheck(`#xColGroups input[data-col=${c}]`);
  await page.fill("#xLayoutName", "기온·강수만");
  await page.click("#xLayoutSave");
  await page.waitForTimeout(600);
  // 일별 ★ 기본 레이아웃(API)
  const made = await page.evaluate(async () => {
    const r = await fetch("/api/export/layouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "daily", name: "내 일별 요약", columns: ["observation_date", "station_id", "max_temperature", "min_temperature", "precipitation", "avg_wind_speed"], isDefault: true }) });
    return r.status;
  });
  const lays = await page.evaluate(async () => (await (await fetch("/api/export/layouts")).json()).layouts.map((l) => [l.kind, l.name, l.isDefault, l.columns.join(",")]));
  ok(made === 201 && lays.some((l) => l[1] === "기온·강수만" && l[3] === "observation_datetime,station_id,temperature,precipitation"), `로그인: 화면에서 저장 ${JSON.stringify(lays)}`);
  await page.selectOption("#xLayoutSelect", { label: "기온·강수만" });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SH}/view-settings-loggedin-desktop.png` });
  // 시간별: 기본 구성으로 받은 뒤 '기온·강수만'(부분 집합) → 다시 받지 않음
  await page.goto(`${LOCAL}/#/hourly-weather?${R}&layout=preset:preset_hourly_default&view=grid`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hResult .vw-grid", { timeout: 20000 });
  const mineOpt = await page.$$eval("#hBar optgroup[label='내 레이아웃'] option", (o) => o.map((x) => [x.value, x.textContent]));
  ok(mineOpt.length === 1 && mineOpt[0][1] === "기온·강수만", `로그인: 시간별 목록에 내 레이아웃 ${JSON.stringify(mineOpt)}`);
  const n0 = views(calls);
  await page.selectOption("#hBar select", mineOpt[0][0]);
  await settle(page);
  ok(views(calls) === n0, "이미 받은 컬럼으로 되는 레이아웃은 다시 받지 않음");
  ok(JSON.stringify(await heads(page, "#hResult")) === JSON.stringify(["관측일시", "지점번호", "기온", "1시간 강수량"]), `내 레이아웃 열 ${JSON.stringify(await heads(page, "#hResult"))}`);
  await page.click("#hBar button[data-vw=card]");
  await page.waitForTimeout(600);
  const prefs = await page.evaluate(async () => (await (await fetch("/api/view-prefs")).json()).prefs);
  ok(prefs.hourly && prefs.hourly.view === "card" && prefs.hourly.layout === mineOpt[0][0], `로그인: 서버에 보기 설정 저장 ${JSON.stringify(prefs.hourly)}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${LOCAL}/#/hourly-weather?${R}`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#hResult .vw-cards", { timeout: 20000 });
  const s = await vstate(page, "hourly");
  ok(s.layout === mineOpt[0][0] && s.view === "card", `로그인: 다른 기기처럼(브라우저 저장 지움) 서버 설정 복원 ${JSON.stringify(s)}`);
  // 일별: ★ 기본 미리 선택
  await page.goto(`${LOCAL}/#/daily-weather?station=108&from=2026-09-05&to=2026-09-11`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dResult .vw-grid, #dResult .vw-cards", { timeout: 20000 });
  const ds = await page.evaluate(() => [window.Views._state.daily.layout, document.querySelector("#dBar select").selectedOptions[0].textContent]);
  ok(/^custom:lay_/.test(ds[0]) && ds[1] === "★ 내 일별 요약", `일별: ★ 기본 미리 선택 ${ds}`);
  ok((await page.$$eval("#dResult .vw-tag, #dResult tr.vw-derived", (x) => x.length)) > 0, "공식 일자료 없는 날은 '시간자료 집계' 표시");
  await page.click("#dBar button[data-vw=card]");
  await page.waitForSelector("#dResult .vw-cards");
  // 남의(없는) 레이아웃 주소 → 안내 + 다른 구성
  await page.goto(`${LOCAL}/#/daily-weather?station=108&from=2026-09-05&to=2026-09-11&layout=custom:lay_someoneelse0001`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dResult .vw-cards, #dResult .vw-grid", { timeout: 20000 });
  ok(/내 레이아웃이 아니어서/.test(await page.textContent("#dBar")), "남의 레이아웃 주소 → 안내 후 다른 구성");
  // 서버도 남의 레이아웃 id 로는 저장 거절
  const st = await page.evaluate(async () => (await fetch("/api/view-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "daily", layout: "custom:lay_someoneelse0001" }) })).status);
  ok(st === 400, `서버: 남의 레이아웃으로 보기 설정 저장 거절 ${st}`);
  await ctx.close();
}
{
  const { ctx, page } = await ctxFor("login-m", LOCAL, { mobile: true, cookie: true });
  await page.goto(`${LOCAL}/#/view-settings?kind=hourly`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SH}/view-settings-loggedin-mobile.png` });
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
