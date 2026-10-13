// 6단계 e2e: 오늘의 날씨 — 이야기 엔진·과거 유사일, 새 메뉴 딥링크(새로고침 포함). 스크린샷 /workspace/shots/rt-stories-*.png
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
  await page.waitForSelector(".rts-simcard, #rtsSim .rt-ins", { timeout: 90000 }).catch(() => {});
  const s = await page.evaluate(() => ({
    st: document.querySelector("#rtsBox .rt-stories")?.textContent || "", n: document.querySelectorAll("#rtsBox .rt-story").length, badge: document.querySelectorAll("#rtsBox .rt-story .rt-badge").length,
    sim: document.querySelector(".rts-simcard")?.textContent || "", simN: document.querySelectorAll(".rts-sim li").length, ovf: document.documentElement.scrollWidth - innerWidth,
    top: document.querySelector("#rtOut .card")?.getBoundingClientRect().top / innerHeight,
  }));
  ok(/자동 선별|크게 다른 점이 없습니다/.test(s.st) && s.n <= 4 && s.badge === s.n, `${tag}: 이야기 ${s.n}개(관측/예보 표시)`);
  ok(/가장 비슷했던 과거의 날은 \d{4}년/.test(s.sim) && /진행 중/.test(s.sim) && s.simN >= 2, `${tag}: 과거 유사일 ${s.simN}개, 진행 중 표시`);
  ok(!/NaN|undefined|null/.test(s.st + s.sim), `${tag}: NaN/undefined/null 없음`);
  ok(s.ovf <= 1, `${tag}: 가로 넘침 없음 (${s.ovf})`);
  if (mobile) ok(s.top < 0.4, `${tag}: 본문 시작 ${Math.round(s.top * 100)}%`);
  await page.screenshot({ path: `${SH}/rt-stories-${tag}-full.png`, fullPage: true });
  const sim = page.locator(".rts-simcard");
  if (await sim.count()) await sim.screenshot({ path: `${SH}/rt-stories-similar-${tag}.png` });
  // 딥링크 + 새로고침: 새 메뉴가 기존 메뉴처럼 열리는지
  for (const [h, title, sel] of [["#/today?station=159", "오늘의 날씨", "#today.on"], ["#/forecast?station=159", "날씨 예보", "#forecast.on"], ["#/hourly-weather?station=108&src=KMA_ULTRA_NCST", "시간별 날씨", "#hourly.on"], ["#/stats/region", "지역별 비교", "#dash.on"]]) {
    await page.goto(`${BASE}/${h}`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const r = await page.evaluate((sel) => ({ t: document.getElementById("phTitle")?.textContent, on: !!document.querySelector(sel), raw: !!document.querySelector("#hourly .rtx-raw:not([hidden])"), st: location.hash }), sel);
    const extra = h.includes("src=") ? r.raw : h.includes("159") ? /station=159/.test(r.st) : true;
    ok(r.t === title && r.on && extra, `${tag}: 딥링크·새로고침 ${h} → ${r.t}${h.includes("src=") ? ` (원자료 탭 ${r.raw})` : ""}`);
  }
  ok(!errs.length, `${tag}: 콘솔 오류 없음 ${errs.join("|").slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
