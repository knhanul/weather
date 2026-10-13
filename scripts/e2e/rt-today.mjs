// 오늘의 날씨(#/today) e2e — 모바일 390×844 + 데스크톱 1440×900. 스크린샷 /workspace/shots/rt-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
for (const [tag, vp, mobile] of [["mobile", { width: 390, height: 844 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/401|favicon|400/.test(m.text()) && errs.push(m.text()));
  await page.goto(`${BASE}/#/today?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#rtOut .rt-now, #rtOut .result.bad", { timeout: 60000 });
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => {
    const now = document.querySelector("#rtOut .rt-now");
    const r = now.getBoundingClientRect();
    return {
      temp: document.querySelector(".rt-temp")?.textContent, cmp: document.querySelectorAll(".rt-cmp-i").length, top: r.top + scrollY, vh: innerHeight,
      ovf: document.documentElement.scrollWidth - innerWidth, title: document.getElementById("phTitle")?.textContent, svg: !!document.querySelector(".rt-svg"),
      dashed: !!document.querySelector('.rt-svg path[stroke-dasharray]'), stories: document.querySelectorAll(".rt-story").length, active: document.querySelector('nav a[data-page="today"]')?.classList.contains("active"),
    };
  });
  ok(/℃/.test(s.temp || ""), `${tag}: 현재 기온 ${s.temp}`);
  ok(s.cmp === 3, `${tag}: 전체 비교 = 기준 3개 (${s.cmp})`);
  ok(s.svg && s.dashed, `${tag}: 그래프(예보 점선)`);
  ok(s.ovf <= 1, `${tag}: 가로 넘침 없음 (${s.ovf})`);
  ok(s.active && s.title === "오늘의 날씨", `${tag}: 메뉴 활성·제목`);
  ok(s.stories >= 1, `${tag}: 이야기 카드 ${s.stories}`);
  if (mobile) ok(s.top / s.vh < 0.4, `${tag}: 본문 시작 ${Math.round((s.top / s.vh) * 100)}% (40% 이내)`);
  await page.screenshot({ path: `${SH}/rt-today-${tag}.png` });
  await page.screenshot({ path: `${SH}/rt-today-${tag}-full.png`, fullPage: true });
  // 기준 하나만 → 비교 1개, 주소에 basis
  await page.click('[data-basis="r5"]');
  await page.waitForTimeout(200);
  const b = await page.evaluate(() => ({ cmp: document.querySelectorAll(".rt-cmp-i").length, hash: location.hash, lines: document.querySelectorAll(".rt-legend [data-line]").length }));
  ok(b.cmp === 1 && /basis=r5/.test(b.hash) && b.lines === 1, `${tag}: 최근 5년만 → 비교 1개·주소 ${b.hash}`);
  await page.click('[data-basis="cmp"]');
  await page.waitForTimeout(200);
  // 평균선 끄기
  const before = await page.locator(".rt-svg path").count();
  await page.click('[data-line="all"]');
  await page.waitForTimeout(200);
  const after = await page.locator(".rt-svg path").count();
  ok(after === before - 1, `${tag}: 1990년 이후 선 숨김 (${before}→${after})`);
  await page.click('[data-line="all"]');
  // 그래프 누르면 그 시각 값
  const box = await page.locator(".rt-svg").boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.waitForTimeout(150);
  const tip = await page.locator("#rtTip").textContent();
  ok(/시/.test(tip) && /1990년 이후/.test(tip), `${tag}: 시각 설명 '${tip.slice(0, 60)}'`);
  await page.locator(".rt-chart").screenshot({ path: `${SH}/rt-chart-${tag}.png` });
  ok(!errs.length, `${tag}: 콘솔 오류 없음 ${errs.join(" | ").slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
