// 기존 메뉴 확장(실황·예보 카드, 원자료 탭) e2e — 모바일·데스크톱. 스크린샷 /workspace/shots/rt-ext-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const TABS = [["overview", "#rtxOv", /지금|이번 주/], ["yearly", "#rtx", /누적/], ["region", "#rtx", /절대기온 순위/], ["life", "#rtx", /출근길/], ["records", "#rtx", /지금 기온/]];
for (const [tag, vp, mobile] of [["mobile", { width: 390, height: 844 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/401|favicon|400/.test(m.text()) && errs.push(m.text()));
  for (const [tab, sel, re] of TABS) {
    await page.goto(`${BASE}/#/stats/${tab}?station=108`, { waitUntil: "networkidle" });
    await page.waitForFunction(([s, r]) => { const e = document.querySelector(s); return e && new RegExp(r).test(e.textContent) && !/불러오는 중/.test(e.textContent); }, [sel, re.source], { timeout: 60000 }).catch(() => {});
    const t = await page.evaluate((s) => ({ txt: document.querySelector(s)?.textContent || "", ovf: Math.max(document.documentElement.scrollWidth, innerWidth) - document.documentElement.clientWidth + (innerWidth - document.documentElement.clientWidth > 1 ? 1000 : 0), wide: [...document.querySelectorAll(".rtx-card")].filter((c) => c.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length }), sel);
    ok(re.test(t.txt) && !/오류|NaN|undefined/.test(t.txt), `${tag} ${tab}: 실황·예보 카드 (${t.txt.slice(0, 40).trim()})`);
    ok(t.ovf <= 1 && !t.wide, `${tag} ${tab}: 가로 넘침 없음 (${t.ovf}, 넓은 카드 ${t.wide})`);
    await page.screenshot({ path: `${SH}/rt-ext-${tab}-${tag}-full.png`, fullPage: true });
  }
  for (const [pg, k, id] of [["hourly-weather", "KMA_ULTRA_NCST", "#hourly"], ["daily-weather", "KMA_MID_TA", "#daily"]]) {
    await page.goto(`${BASE}/#/${pg}?station=108`, { waitUntil: "networkidle" });
    await page.click(`${id} [data-src="${k}"]`);
    await page.waitForSelector(`${id} .rtx-raw:not([hidden]) tbody tr, ${id} .rtx-raw:not([hidden]) .rt-ins`, { timeout: 60000 }).catch(() => {});
    const n = await page.locator(`${id} .rtx-raw:not([hidden]) tbody tr`).count();
    const csv = await page.locator(`${id} .rtx-raw:not([hidden]) a[href*='format=csv']`).count();
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(n > 0 && csv === 1 && ovf <= 1, `${tag} ${pg}: ${k} 원자료 ${n}행, CSV 링크, 넘침 ${ovf}`);
    await page.screenshot({ path: `${SH}/rt-ext-${pg}-${tag}.png` });
    await page.click(`${id} [data-src="asos"]`);
    await page.waitForTimeout(300);
    ok(await page.locator(`${id} .rtx-raw`).isHidden(), `${tag} ${pg}: ASOS 탭 복귀 시 기존 화면`);
  }
  ok(!errs.length, `${tag}: 콘솔 오류 없음 ${errs.join("|").slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
