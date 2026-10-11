// 좁은 화면 서랍 메뉴 e2e. 스크린샷 /workspace/shots/drawer-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const LOCAL = process.env.LOCAL || "http://127.0.0.1:8095";
const TOKEN = process.env.TOKEN;
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [], errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
async function ctxFor(base, vp, mobile, cookie) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  if (cookie) await ctx.addCookies([{ name: "nw_session", value: TOKEN, url: base }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon/.test(m.text()) && errs.push(`console ${m.text()}`));
  return { ctx, page };
}
const dstate = (page) => page.evaluate(() => {
  const a = document.querySelector("aside").getBoundingClientRect();
  const st = getComputedStyle(document.querySelector("aside"));
  const act = document.activeElement;
  return { open: document.body.classList.contains("drawer-open"), vis: st.visibility, left: Math.round(a.left), right: Math.round(a.right), role: document.querySelector("aside").getAttribute("role"), exp: document.getElementById("abMenu").getAttribute("aria-expanded"), inert: document.querySelector(".wrap").inert, focusIn: !!act.closest("aside"), focusMenu: act.id === "abMenu", hash: location.hash, title: document.getElementById("abTitle").textContent, hlen: history.length, sub: getComputedStyle(document.getElementById("navStats")).display, iw: innerWidth, ovf: document.documentElement.scrollWidth - innerWidth };
});
const settle = (p) => p.waitForTimeout(450);
const MOB = { width: 390, height: 844 };
{
  const { ctx, page } = await ctxFor(BASE, MOB, true);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chart svg", { timeout: 30000 }).catch(() => {});
  await settle(page);
  let s = await dstate(page);
  ok(!s.open && s.vis === "hidden" && s.right <= 0 && s.title === "한눈에 보기" && s.iw === 390 && s.ovf <= 1, `처음: 한눈에 보기, 서랍 닫힘·화면 밖, 넘침 없음 ${JSON.stringify(s)}`);
  const top = await page.evaluate(() => ({ bar: Math.round(document.getElementById("appbar").getBoundingClientRect().height), main: Math.round(document.querySelector("main").getBoundingClientRect().top), rows: [...document.querySelectorAll("aside nav a")].filter((a) => { const r = a.getBoundingClientRect(); return r.right > 0 && r.width > 0 && getComputedStyle(document.querySelector("aside")).visibility === "visible"; }).length }));
  ok(top.bar === 52 && top.rows === 0 && top.main < 200, `앱 막대 52px·보이는 메뉴 줄 없음·본문 시작 ${top.main}px ${JSON.stringify(top)}`);
  await page.screenshot({ path: `${SH}/drawer-closed-mobile.png` });
  const h0 = s.hlen;
  const mainTop0 = top.main;
  // 열기
  await page.tap("#abMenu");
  await settle(page);
  s = await dstate(page);
  ok(s.open && s.vis === "visible" && s.left === 0 && s.role === "dialog" && s.exp === "true" && s.inert && s.focusIn && s.sub === "block", `☰ → 서랍 열림(dialog·inert·포커스 안·하위 메뉴 펼침) ${JSON.stringify(s)}`);
  const items = await page.evaluate(() => [...document.querySelectorAll("aside nav a, aside .dr-auth a, aside .dr-auth button")].filter((a) => a.offsetParent).map((a) => a.textContent.trim()));
  ok(["날씨 통계", "한눈에 보기", "연도별 비교", "지역별 비교", "생활 속 날씨", "날씨 기록", "질문으로 보는 날씨", "시간별 날씨", "일별 날씨", "보기 설정"].every((t) => items.includes(t)) && items.some((t) => /카카오/.test(t)) && !items.includes("자료수집"), `서랍 내용(비로그인: 관리 메뉴 없음, 로그인 버튼) ${items.join("|")}`);
  const mainTop1 = await page.evaluate(() => Math.round(document.querySelector("main").getBoundingClientRect().top));
  ok(mainTop1 === mainTop0, `열어도 본문 위치 그대로(레이아웃 이동 없음) ${mainTop0}→${mainTop1}`);
  await page.screenshot({ path: `${SH}/drawer-open-mobile.png` });
  // 포커스 가두기
  let out = 0;
  for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => !!document.activeElement.closest("aside")))) out++; }
  for (let i = 0; i < 5; i++) { await page.keyboard.press("Shift+Tab"); if (!(await page.evaluate(() => !!document.activeElement.closest("aside")))) out++; }
  ok(out === 0, `Tab/Shift+Tab 이 서랍 안에서만 돎 (밖으로 ${out})`);
  // Esc
  await page.keyboard.press("Escape");
  await settle(page);
  s = await dstate(page);
  ok(!s.open && s.focusMenu && s.hlen === h0 + 1 && s.hash === "#/" && !s.inert, `Esc → 닫힘, 포커스 ☰ ${JSON.stringify(s)}`);
  // 배경 누르기
  await page.tap("#abMenu"); await settle(page);
  await page.touchscreen.tap(375, 500); await settle(page);
  s = await dstate(page);
  ok(!s.open && s.hash === "#/", `배경 누르기 → 닫힘 ${s.open}`);
  // 뒤로 가기 = 서랍만 닫힘
  await page.tap("#abMenu"); await settle(page);
  await page.goBack(); await settle(page);
  s = await dstate(page);
  ok(!s.open && s.hash === "#/" && s.title === "한눈에 보기", `뒤로 가기 → 서랍만 닫힘(화면 그대로) ${JSON.stringify({ open: s.open, hash: s.hash })}`);
  // 메뉴 고르기 → 닫히고 이동, 뒤로 가기 한 번이면 원래 화면
  await page.tap("#abMenu"); await settle(page);
  await page.tap('#navStats a:text-is("연도별 비교")'); await page.waitForTimeout(1200);
  s = await dstate(page);
  ok(!s.open && /^#\/stats\/yearly/.test(s.hash) && s.title === "연도별 비교", `하위 메뉴 고르기 → 닫히고 연도별 비교 ${s.hash.slice(0, 30)}`);
  await page.screenshot({ path: `${SH}/drawer-yearly-mobile.png` });
  await page.goBack(); await page.waitForTimeout(900);
  s = await dstate(page);
  ok(!s.open && (s.hash === "#/" || /^#\/\?/.test(s.hash) || /^#\/stats\/overview/.test(s.hash)) && s.title === "한눈에 보기", `뒤로 가기 한 번 → 한눈에 보기 ${s.hash}`);
  // 다른 화면에선 하위 메뉴 접힘 + 펼치기 버튼
  await page.tap("#abMenu"); await settle(page);
  await page.tap('aside a[data-page="hourly"]'); await page.waitForTimeout(1200);
  s = await dstate(page);
  ok(/^#\/hourly-weather/.test(s.hash) && s.title === "시간별 날씨" && !s.open, "주 메뉴 '시간별 날씨' → 이동·닫힘");
  await page.tap("#abMenu"); await settle(page);
  s = await dstate(page);
  const e0 = await page.getAttribute("#navExp", "aria-expanded");
  ok(s.sub === "none" && e0 === "false", `시간별 날씨에서 열면 날씨 통계 그룹 접힘 ${s.sub}`);
  await page.tap("#navExp"); await settle(page);
  s = await dstate(page);
  ok(s.sub === "block" && (await page.getAttribute("#navExp", "aria-expanded")) === "true", "▾ 누르면 하위 메뉴 펼침");
  await page.screenshot({ path: `${SH}/drawer-open-expanded-mobile.png` });
  await page.tap('aside a[data-page="questions"]'); await page.waitForTimeout(1500);
  s = await dstate(page);
  ok(/^#\/questions/.test(s.hash) && !s.open && s.title === "질문으로 보는 날씨", "질문으로 보는 날씨로 이동");
  for (const h of ["#/stats/region", "#/stats/life", "#/stats/records", "#/view-settings", "#/daily-weather"]) {
    await page.goto(`${BASE}/${h}`, { waitUntil: "networkidle" }); await page.waitForTimeout(700);
    s = await dstate(page);
    ok(s.iw === 390 && s.ovf <= 1, `390 넘침 없음 ${h} (${s.ovf})`);
  }
  await ctx.close();
}
// 가로(844x390)
{
  const { ctx, page } = await ctxFor(BASE, { width: 844, height: 390 }, true);
  await page.goto(`${BASE}/#/stats/overview`, { waitUntil: "networkidle" }); await settle(page);
  const s = await dstate(page);
  const desk = await page.evaluate(() => getComputedStyle(document.getElementById("appbar")).display);
  ok(desk === "none" && s.vis === "visible" && s.left === 0, `844px(>800, 기존 기준): 넓은 화면 배치(옆 메뉴) ${desk}`);
  await ctx.close();
}
// 설치된 앱(standalone) 흉내 + 안전 영역
{
  const { ctx, page } = await ctxFor(BASE, MOB, true);
  const cdp = await ctx.newCDPSession(page);
  let emu = [];
  try { await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }); emu.push("display-mode"); } catch (e) { emu.push(`display-mode 불가: ${e.message.slice(0, 60)}`); }
  try { await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }); emu.push("safe-area"); } catch (e) { emu.push(`safe-area 불가: ${e.message.slice(0, 60)}`); }
  console.log("emulation:", emu.join(", "));
  const man = await (await page.request.get(`${BASE}/brand/site.webmanifest`)).json();
  ok(man.start_url === "/#/stats/overview" && man.display === "standalone" && man.theme_color && man.id === "/", `manifest start_url ${man.start_url}, display ${man.display}, theme ${man.theme_color}, id ${man.id}`);
  await page.goto(`${BASE}${man.start_url}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chart svg", { timeout: 30000 }).catch(() => {});
  await settle(page);
  const st = await page.evaluate(() => ({ sa: matchMedia("(display-mode: standalone)").matches, bar: Math.round(document.getElementById("appbar").getBoundingClientRect().height), btnTop: Math.round(document.getElementById("abMenu").getBoundingClientRect().top), title: document.getElementById("abTitle").textContent }));
  ok(st.title === "한눈에 보기", `start_url 로 열면 한눈에 보기 ${JSON.stringify(st)}`);
  if (emu.includes("safe-area")) ok(st.bar === 52 + 47 && st.btnTop >= 47, `안전 영역 위 47px 만큼 앱 막대 늘어남 ${JSON.stringify(st)}`);
  await page.screenshot({ path: `${SH}/drawer-standalone-closed.png` });
  await page.tap("#abMenu"); await settle(page);
  const inTop = await page.evaluate(() => Math.round(document.getElementById("drClose").getBoundingClientRect().top));
  if (emu.includes("safe-area")) ok(inTop >= 47, `서랍 닫기 버튼이 안전 영역 아래 ${inTop}`);
  await page.screenshot({ path: `${SH}/drawer-standalone-open.png` });
  await ctx.close();
}
// 데스크톱 그대로
{
  const { ctx, page } = await ctxFor(BASE, { width: 1366, height: 900 }, false);
  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chart svg", { timeout: 30000 }).catch(() => {});
  await settle(page);
  const d = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById("appbar")).display, bd: getComputedStyle(document.getElementById("drBackdrop")).display, close: getComputedStyle(document.getElementById("drClose")).display, exp: getComputedStyle(document.getElementById("navExp")).display, aside: Math.round(document.querySelector("aside").getBoundingClientRect().width), pos: getComputedStyle(document.querySelector("aside")).position, sub: getComputedStyle(document.getElementById("navStats")).display, h1: getComputedStyle(document.getElementById("phTitle")).position, adm: getComputedStyle(document.querySelector("aside .nav-group:not(.nav-main)")).display }));
  ok(d.bar === "none" && d.bd === "none" && d.close === "none" && d.exp === "none" && d.aside === 228 && d.pos !== "fixed" && d.sub === "block" && d.h1 === "static" && d.adm !== "none", `데스크톱: 앱 막대·서랍 요소 없음, 옆 메뉴 228px 그대로 ${JSON.stringify(d)}`);
  await page.screenshot({ path: `${SH}/drawer-desktop.png` });
  await ctx.close();
}
// 관리자(로컬 테스트 세션): 서랍에 관리 메뉴 + 로그아웃
if (TOKEN) {
  const { ctx, page } = await ctxFor(LOCAL, MOB, true, true);
  await page.goto(`${LOCAL}/#/stats/overview`, { waitUntil: "networkidle" }); await settle(page);
  await page.tap("#abMenu"); await settle(page);
  const items = await page.evaluate(() => [...document.querySelectorAll("aside nav a, aside .dr-auth a, aside .dr-auth button")].filter((a) => a.offsetParent).map((a) => a.textContent.trim()));
  ok(["자료수집", "미적재 현황", "수집이력", "관측지점", "공급원", "사용자", "로그아웃"].every((t) => items.includes(t)), `관리자 서랍: 관리 메뉴·로그아웃 ${items.join("|")}`);
  await page.screenshot({ path: `${SH}/drawer-open-admin-mobile.png` });
  await page.tap('aside a[data-page="jobs"]'); await page.waitForTimeout(1000);
  ok(/^#\/jobs/.test(await page.evaluate(() => location.hash)) && (await page.textContent("#abTitle")) === "수집이력", "관리자: 서랍에서 수집이력으로");
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
