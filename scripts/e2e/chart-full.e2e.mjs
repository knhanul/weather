// 그래프 크게 보기 e2e 확인 + 스크린샷. 실행: BASE=http://127.0.0.1:8099 SHOTS=/workspace/shots node scripts/e2e/chart-full.e2e.mjs (playwright-core 필요, 저장소 의존성 아님)
import { chromium } from "playwright-core";
const B = process.env.BASE || "http://127.0.0.1:8099";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const errs = [];
// iOS 사파리처럼: 전체 화면 API 없음, 가로 고정 실패
const IOS = () => {
  delete Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = undefined;
  if (screen.orientation) screen.orientation.lock = () => Promise.reject(new DOMException("not supported", "NotSupportedError"));
};
// 안드로이드 크롬처럼: 전체 화면·가로 고정 성공(호출 기록)
const ANDROID = () => {
  window.__log = [];
  let fs = null;
  Object.defineProperty(Document.prototype, "fullscreenElement", { get: () => fs, configurable: true });
  Element.prototype.requestFullscreen = function () { fs = this; window.__log.push("fs"); return Promise.resolve(); };
  Document.prototype.exitFullscreen = function () { fs = null; window.__log.push("exitfs"); document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
  screen.orientation.lock = (o) => { window.__log.push(`lock:${o}`); return Promise.resolve(); };
  screen.orientation.unlock = () => { window.__log.push("unlock"); };
};
async function ctxFor(vw, w, h, mobile, init) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`${vw} pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(`${vw} console ${m.text()}`));
  return { ctx, page };
}
const waitDash = (page) => page.waitForSelector("#chart svg", { timeout: 20000 });
const state = (page) => page.evaluate(() => {
  if (!document.querySelector(".cf-overlay .cf-chart > svg") && document.querySelector(".cf-overlay")) { const ov = document.querySelector(".cf-overlay"); const st = ov.querySelector(".cf-stage"); return { rot: ov.classList.contains("cf-rot"), mobile: ov.classList.contains("cf-mobile"), stageW: st.offsetWidth, stageH: st.offsetHeight, title: ov.querySelector(".cf-title").textContent, legend: "", sub: ov.querySelector(".cf-sub")?.textContent || "" }; }
  const ov = document.querySelector(".cf-overlay");
  if (!ov) return null;
  const st = ov.querySelector(".cf-stage");
  const svg = ov.querySelector(".cf-chart > svg");
  const r = st.getBoundingClientRect();
  return { rot: ov.classList.contains("cf-rot"), mobile: ov.classList.contains("cf-mobile"), stageW: st.offsetWidth, stageH: st.offsetHeight, bbox: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], svgW: svg ? +svg.getAttribute("width") : 0, svgH: svg ? +svg.getAttribute("height") : 0, bodyW: ov.querySelector(".cf-body").clientWidth, title: ov.querySelector(".cf-title").textContent, sub: ov.querySelector(".cf-sub")?.textContent || "", legend: ov.querySelector(".cf-legend").textContent.trim().slice(0, 60), src: ov.querySelector(".cf-src")?.textContent || "", hist: history.state };
});
// 돌린/돌리지 않은 화면에서 그래프 '안 가로 위치 비율 fx' 지점을 탭할 화면 좌표
async function tapAt(page, sel, fx, fy = 0.5) {
  if (!sel.includes(".cf-overlay")) await page.locator(sel).first().scrollIntoViewIfNeeded();
  const pt = await page.evaluate(([sel, fx, fy]) => {
    const host = document.querySelector(sel);
    const r = host.getBoundingClientRect();
    if (host.closest(".cf-rot")) return [r.left + r.width * (1 - fy), r.top + r.height * fx];
    return [r.left + r.width * fx, r.top + r.height * fy];
  }, [sel, fx, fy]);
  await page.touchscreen.tap(pt[0], pt[1]);
  await page.waitForTimeout(120);
}
const hvFrac = (page, sel) => page.evaluate((sel) => {
  const svg = document.querySelector(`${sel} svg`);
  const l = svg.querySelector("line.hv");
  const tip = document.querySelector(`${sel} .tip`);
  return { vis: l.getAttribute("visibility"), fx: +l.getAttribute("x1") / +svg.getAttribute("width"), tip: tip && getComputedStyle(tip).display, tipText: tip ? tip.textContent.trim().slice(0, 40) : "" };
}, sel);

// ---------- 1) iOS 대체: 세로 390×844 → 내용 90° 회전
{
  const { ctx, page } = await ctxFor("ios", 390, 844, true, IOS);
  await page.goto(`${B}/#/?station=108`, { waitUntil: "networkidle" });
  await waitDash(page);
  // 한 번 톡은 툴팁만(열리지 않음)
  await tapAt(page, "#chart", 0.4);
  ok(!(await state(page)), "ios: 그래프 한 번 톡 → 크게 보기 안 열림");
  const t1 = await page.evaluate(() => getComputedStyle(document.getElementById("chartTip")).display);
  ok(t1 === "block", "ios: 한 번 톡 → 기존 툴팁 표시");
  await page.waitForTimeout(400);
  // 버튼으로 열기
  await page.tap("#chart .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-chart > svg");
  let s = await state(page);
  ok(s && s.rot, `ios: 세로 화면에서 회전 대체(cf-rot) ${JSON.stringify(s && { rot: s.rot, bbox: s.bbox })}`);
  ok(s && s.stageW === 844 && s.stageH === 390, `ios: 무대 크기 = 가로 844×390 (실제 ${s?.stageW}×${s?.stageH})`);
  ok(s && Math.abs(s.bbox[2] - 390) <= 1 && Math.abs(s.bbox[3] - 844) <= 1 && s.bbox[0] === 0 && s.bbox[1] === 0, `ios: 돌린 무대가 화면을 꽉 채움 bbox=${s?.bbox}`);
  ok(s && s.svgW === s.bodyW && s.svgW > 780 && s.svgH > 200, `ios: 그래프를 겹친 화면 크기로 다시 그림 svg ${s?.svgW}×${s?.svgH}`);
  ok(s && /기온/.test(s.title) && s.legend.length > 5 && /기상청/.test(s.src), `ios: 제목·범례·출처 표시 (${s?.title})`);
  ok(s && s.hist && s.hist.cf === 1, "ios: history 상태 추가");
  // 돌린 화면에서 툴팁 좌표
  for (const fx of [0.25, 0.75]) {
    await tapAt(page, ".cf-overlay .cf-chart", fx);
    const h = await hvFrac(page, ".cf-overlay .cf-chart");
    ok(h.vis === "visible" && Math.abs(h.fx - fx) < 0.04 && h.tip === "block" && h.tipText, `ios: 돌린 화면 탭 위치 ${fx} → 세로선 ${h.fx.toFixed(3)} · 툴팁 "${h.tipText}"`);
  }
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-ios-portrait-rotated-dash.png` });
  // 뒤로 가기로 닫기
  const hash0 = await page.evaluate(() => location.hash);
  await page.goBack();
  await page.waitForTimeout(300);
  ok(!(await state(page)) && (await page.evaluate(() => location.hash)) === hash0, "ios: 뒤로 가기 → 닫힘, 페이지 그대로");
  // 두 번 톡으로 열기 → ✕ 로 닫기
  await tapAt(page, "#chart", 0.5);
  await page.waitForTimeout(80);
  await tapAt(page, "#chart", 0.5);
  await page.waitForTimeout(300);
  ok(!!(await state(page)), "ios: 두 번 톡 → 열림");
  await page.tap(".cf-close");
  await page.waitForTimeout(300);
  ok(!(await state(page)) && !(await page.evaluate(() => history.state && history.state.cf)), "ios: ✕ → 닫힘, history 상태 정리");
  ok(!(await page.evaluate(() => document.documentElement.classList.contains("cf-lock"))), "ios: 닫은 뒤 스크롤 잠금 해제");
  // 통계 그래프(생활 속 날씨 · 더위)
  await page.goto(`${B}/#/stats/life?view=heat&station=108&from=1990&to=2026`, { waitUntil: "networkidle" });
  await page.waitForSelector("#lxChart svg");
  await page.tap("#lxChart .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-chart > svg");
  s = await state(page);
  ok(s && s.rot && s.svgW > 780, `ios: 통계 그래프도 회전·다시 그림 svg ${s?.svgW}×${s?.svgH}`);
  ok(s && /더위/.test(s.title) && /30℃/.test(s.legend), `ios: 통계 제목·범례 (${s?.title} | ${s?.legend})`);
  await tapAt(page, ".cf-overlay .cf-chart", 0.6);
  const h2 = await hvFrac(page, ".cf-overlay .cf-chart");
  ok(h2.tip === "block" && /년/.test(h2.tipText), `ios: 통계 그래프 돌린 화면 툴팁 "${h2.tipText}"`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-ios-portrait-rotated-stats.png` });
  // 열린 채로 가로로 돌리면 회전을 풀고 다시 그림
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  s = await state(page);
  ok(s && !s.rot && s.stageW === 844 && s.svgW === s.bodyW, `ios: 열린 채 가로로 돌리면 회전 해제·다시 그림 svg ${s?.svgW}×${s?.svgH}`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-ios-landscape-stats.png` });
  await ctx.close();
}
// ---------- 2) 안드로이드: 전체 화면 + 가로 고정 → (기기가 돌아 844×390) 회전 없이 그림
{
  const { ctx, page } = await ctxFor("android", 390, 844, true, ANDROID);
  await page.goto(`${B}/#/?station=108`, { waitUntil: "networkidle" });
  await waitDash(page);
  await page.tap("#chart .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-chart > svg");
  ok(JSON.stringify(await page.evaluate(() => window.__log)) === '["fs","lock:landscape"]', `android: requestFullscreen + orientation.lock('landscape') ${JSON.stringify(await page.evaluate(() => window.__log))}`);
  await page.setViewportSize({ width: 844, height: 390 }); // 가로 고정으로 화면이 돌아간 상태
  await page.waitForTimeout(400);
  let s = await state(page);
  ok(s && !s.rot && s.stageW === 844 && s.stageH === 390 && s.svgW === s.bodyW, `android: 회전 없이 가로 화면 크기로 다시 그림 svg ${s?.svgW}×${s?.svgH}`);
  await tapAt(page, ".cf-overlay .cf-chart", 0.5);
  const h = await hvFrac(page, ".cf-overlay .cf-chart");
  ok(h.tip === "block" && Math.abs(h.fx - 0.5) < 0.04, `android: 툴팁 위치 ${h.fx.toFixed(3)}`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-android-landscape-dash.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => window.__log);
  ok(!(await state(page)) && log.includes("unlock") && log.includes("exitfs"), `android: Esc → 닫힘, 가로 고정 해제·전체 화면 종료 ${JSON.stringify(log)}`);
  // 사용자가 전체 화면을 직접 끝내면(안드로이드 뒤로) 겹친 화면도 닫힘
  await page.tap("#chart .cf-btn");
  await page.waitForSelector(".cf-overlay");
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(300);
  ok(!(await state(page)), "android: 전체 화면이 끝나면 크게 보기도 닫힘");
  await ctx.close();
}
// ---------- 3) 처음부터 가로(844×390, 고정 불가 기기) → 회전 없음
{
  const { ctx, page } = await ctxFor("landscape", 844, 390, true, IOS);
  await page.goto(`${B}/#/stats/region?stations=108,159,133,184&view=period&period=season:summer&from=1990&to=2026`, { waitUntil: "networkidle" });
  await page.waitForSelector(".st-panel:not([hidden]) .sx-bars .sx-bar-row", { timeout: 20000 });
  await page.tap(".st-panel:not([hidden]) .sx-bars .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-html .sx-bar-row");
  const s = await state(page);
  const bars = await page.evaluate(() => [document.querySelectorAll(".cf-overlay .sx-bar-row").length, document.querySelector(".cf-overlay .cf-html").scrollWidth, document.querySelector(".cf-overlay .cf-body").clientWidth]);
  ok(s && !s.rot && bars[0] > 4 && bars[1] <= bars[2] + 1, `landscape: 회전 없이 가로 화면, HTML 막대 ${bars[0]}줄 폭 ${bars[1]}/${bars[2]}`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-landscape-844x390-region.png` });
  await ctx.close();
}
// ---------- 4) 데스크톱 모달
{
  const { ctx, page } = await ctxFor("desktop", 1440, 900, false, null);
  await page.goto(`${B}/#/?station=108`, { waitUntil: "networkidle" });
  await waitDash(page);
  await page.click("#chart .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-chart > svg");
  let s = await state(page);
  ok(s && !s.mobile && !s.rot && s.svgW > 1200 && s.svgH > 550, `desktop: 큰 모달 svg ${s?.svgW}×${s?.svgH}`);
  const box = await page.locator(".cf-overlay .cf-chart > svg").boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.waitForTimeout(150);
  const h = await hvFrac(page, ".cf-overlay .cf-chart");
  ok(h.tip === "block" && Math.abs(h.fx - 0.62) < 0.03, `desktop: 마우스 툴팁 ${h.fx.toFixed(3)} "${h.tipText}"`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-desktop-modal-dash.png` });
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("cf-close")), "desktop: 열면 닫기 버튼에 초점");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok(!(await state(page)), "desktop: Esc → 닫힘");
  await page.goto(`${B}/#/stats/yearly?station=108&metric=avg_temp&period=month:5&from=1990&to=2026`, { waitUntil: "networkidle" });
  await page.waitForSelector("#yxChart svg");
  await page.click("#yxChart .cf-btn");
  await page.waitForSelector(".cf-overlay .cf-chart > svg");
  s = await state(page);
  ok(s && /평균기온/.test(s.title + s.sub) && s.legend.length > 3, `desktop: 통계 모달 제목·범례 (${s?.title})`);
  await page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/chart-full-desktop-modal-stats.png` });
  await page.mouse.click(10, 10); // 바깥 클릭
  await page.waitForTimeout(250);
  ok(!(await state(page)), "desktop: 바깥 클릭 → 닫힘");
  // 모든 통계 그래프에 버튼이 있는지
  for (const hash of ["#/stats/life?view=heat&station=108", "#/stats/life?view=outdoor&station=108", "#/stats/records?view=day&station=108&date=05-05", "#/stats/region?stations=108,159&view=monthly&metric=rain_total", "#/stats/yearly?station=108&metric=avg_temp&period=month:10&mode=overlay&years=2024,2025,2026"]) {
    await page.goto(`${B}/${hash}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".st-panel:not([hidden]) .sx-chart > svg", { timeout: 20000 });
    const c = await page.evaluate(() => [document.querySelectorAll(".st-panel:not([hidden]) .sx-chart > svg").length, document.querySelectorAll(".st-panel:not([hidden]) .sx-chart .cf-btn").length]);
    ok(c[0] > 0 && c[0] === c[1], `desktop: 그래프마다 크게 보기 버튼 ${c[1]}/${c[0]} ${hash}`);
  }
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
