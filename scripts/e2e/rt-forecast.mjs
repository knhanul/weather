// 날씨 예보(#/forecast) e2e — 모바일·데스크톱. 스크린샷 /workspace/shots/rt-forecast-*.png
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
  await page.goto(`${BASE}/#/forecast?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#fcOut .rt-week, #fcOut .result.bad", { timeout: 60000 });
  const s = await page.evaluate(() => ({
    wk: document.querySelectorAll(".rt-wd").length, rows: document.querySelectorAll("#fcOut .rt-tbl tbody tr").length, mid: /중기예보/.test(document.getElementById("fcOut").textContent),
    svg: !!document.querySelector(".rt-svg-h path[stroke-dasharray]"), ovf: document.documentElement.scrollWidth - innerWidth, top: document.querySelector("#fcOut .card").getBoundingClientRect().top / innerHeight,
    title: document.getElementById("phTitle").textContent, cmp: document.querySelectorAll("#fcOut .rt-cmp-i").length,
  }));
  ok(s.wk === 7, `${tag}: 이번 주 7일 (${s.wk})`);
  ok(s.rows >= 8 && s.mid, `${tag}: 주간 표 ${s.rows}행, 중기예보 이어 붙임`);
  ok(s.svg, `${tag}: 시간별 그래프(예보 점선)`);
  ok(s.ovf <= 1, `${tag}: 페이지 가로 넘침 없음 (${s.ovf})`);
  ok(s.title === "날씨 예보" && s.cmp === 3, `${tag}: 제목·전체 비교 3개`);
  if (mobile) ok(s.top < 0.4, `${tag}: 본문 시작 ${Math.round(s.top * 100)}%`);
  await page.screenshot({ path: `${SH}/rt-forecast-${tag}.png` });
  await page.screenshot({ path: `${SH}/rt-forecast-${tag}-full.png`, fullPage: true });
  await page.click('[data-basis="r10"]');
  await page.waitForTimeout(200);
  ok((await page.locator("#fcOut .rt-cmp-i").count()) === 1 && /basis=r10/.test(page.url()), `${tag}: 최근 10년만`);
  await page.click('[data-basis="cmp"]');
  ok(!errs.length, `${tag}: 콘솔 오류 없음 ${errs.join("|").slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
