// 좁은 화면 조회 조건 접기(fold.js) e2e. 스크린샷 /workspace/shots/fold-e2e-*.png
// PROD=… 를 주면 넓은 화면 스크린샷을 그 주소(이전 코드)와 픽셀 비교해 '데스크톱 그대로'를 확인.
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const PROD = process.env.PROD || "";
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [], errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
async function ctxFor(vp, mobile) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon|400/.test(m.text()) && errs.push(`console ${m.text()}`));
  return { ctx, page };
}
const MOB = { width: 390, height: 844 };
const fstate = (page, id) => page.evaluate((id) => {
  const bar = document.querySelector(`[data-fold-bar="${id}"]`);
  if (!bar) return null;
  const b = bar.querySelector("button");
  const ctl = (b.getAttribute("aria-controls") || "").split(" ").map((x) => document.getElementById(x));
  return { barVis: getComputedStyle(bar).display !== "none", exp: b.getAttribute("aria-expanded"), lbl: b.textContent.trim(), ctlVis: ctl.map((e) => !!e && getComputedStyle(e).display !== "none"), ctlOk: ctl.every(Boolean), sum: bar.querySelector(".fold-sum").textContent, hash: decodeURIComponent(location.hash), ovf: document.documentElement.scrollWidth - innerWidth, focusBtn: document.activeElement === b };
}, id);
const settle = (p, ms = 500) => p.waitForTimeout(ms);
// 1) 연도별 비교: 접힘 → 펼침 → 항목 바꾸기 → 요약·주소 반영 → 새로 열어도 유지
{
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/#/stats/yearly`, { waitUntil: "networkidle" });
  await page.waitForSelector("#yxOut svg", { timeout: 45000 });
  await settle(page);
  let s = await fstate(page, "yx");
  ok(s && s.barVis && s.exp === "false" && s.ctlOk && s.ctlVis.every((v) => !v) && /서울\(108\)/.test(s.sum) && /1990–20\d\d/.test(s.sum) && s.ovf <= 1, `연도별: 처음 접힘·요약 '${s && s.sum}'`);
  await page.tap('[data-fold-bar="yx"] button');
  await settle(page, 200);
  s = await fstate(page, "yx");
  ok(s.exp === "true" && s.ctlVis.every(Boolean) && s.lbl === "접기", `연도별: 누르면 펼침(aria-expanded=true, '접기') ${JSON.stringify(s.ctlVis)}`);
  await page.screenshot({ path: `${SH}/fold-e2e-yearly-open.png` });
  const metricSel = await page.evaluateHandle(() => [...document.querySelectorAll("#tabYearly select")].find((x) => [...x.options].some((o) => /강수량/.test(o.textContent))));
  const val = await metricSel.evaluate((x) => [...x.options].find((o) => /강수량/.test(o.textContent)).value);
  await metricSel.selectOption(val);
  await page.waitForFunction(() => /강수/.test(document.querySelector("#yxOut h2, #yxOut h3")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  await settle(page);
  s = await fstate(page, "yx");
  ok(/강수량/.test(s.sum) && s.hash.includes(val) && s.exp === "true", `연도별: 항목 바꾸면 요약·주소 반영(펼친 채) '${s.sum}' ${s.hash}`);
  await page.tap('[data-fold-bar="yx"] button');
  await settle(page, 200);
  s = await fstate(page, "yx");
  ok(s.exp === "false" && s.ctlVis.every((v) => !v), "연도별: 다시 누르면 접힘");
  const url = page.url();
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#yxOut svg", { timeout: 45000 });
  await settle(page);
  s = await fstate(page, "yx");
  ok(/강수량/.test(s.sum) && s.exp === "false", `연도별: 주소로 다시 열면 고른 값 유지 '${s.sum}'`);
  await ctx.close();
}
// 2) 생활 속 날씨: 펼친 채 다른 보기로 → 요약에 보기 이름
{
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/#/stats/life?view=weekend`, { waitUntil: "networkidle" });
  await page.waitForSelector("#lxOut svg, #lxOut table", { timeout: 45000 });
  await settle(page);
  let s = await fstate(page, "lx");
  ok(s.exp === "false" && /주말/.test(s.sum), `생활: 요약에 지금 보기 '${s.sum}'`);
  await page.tap('[data-fold-bar="lx"] button');
  await page.tap("#tabLife .sx-sub a:has-text('출퇴근')");
  await page.waitForFunction(() => /commute/.test(location.hash));
  await settle(page, 800);
  s = await fstate(page, "lx");
  ok(/출퇴근/.test(s.sum) && s.exp === "true" && s.ovf <= 1, `생활: 출퇴근으로 바꾸면 요약 '${s.sum}', 펼친 채`);
  await ctx.close();
}
// 3) 한눈에 보기: 기간 바꾸기
{
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/#/stats/overview`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chart svg", { timeout: 45000 });
  await settle(page);
  let s = await fstate(page, "ov");
  ok(s.exp === "false" && /\(108\)/.test(s.sum), `한눈에: 요약 '${s.sum}'`);
  await page.tap('[data-fold-bar="ov"] button');
  await page.tap("#periodSel button:has-text('7일')");
  await page.waitForFunction(() => /7일/.test(document.getElementById("chartTitle").textContent), null, { timeout: 30000 }).catch(() => {});
  await settle(page);
  s = await fstate(page, "ov");
  ok(/7일/.test(s.sum), `한눈에: 7일 고르면 요약 '${s.sum}' ${s.hash}`);
  await ctx.close();
}
// 4) 시간별 날씨: 지점 바꾸고 조회 → 자동으로 접히고 초점은 막대 버튼
{
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/#/hourly-weather`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hResult > *", { timeout: 45000 });
  await settle(page);
  let s = await fstate(page, "h");
  ok(s.exp === "false" && s.ctlVis.length === 2 && s.ctlVis.every((v) => !v) && /서울\(108\)/.test(s.sum), `시간별: 접힘(조건 줄+레이아웃 막대) '${s.sum}'`);
  await page.tap('[data-fold-bar="h"] button');
  await page.selectOption("#hStation", "112");
  await page.tap("#hQuery");
  await page.waitForFunction(() => /112/.test(location.hash), null, { timeout: 30000 });
  await settle(page, 800);
  s = await fstate(page, "h");
  ok(s.exp === "false" && /인천\(112\)/.test(s.sum) && s.focusBtn, `시간별: 조회 누르면 접힘·초점 막대 버튼 '${s.sum}' ${s.hash}`);
  await page.screenshot({ path: `${SH}/fold-e2e-hourly.png` });
  await ctx.close();
}
// 5) 보기 설정: 읽기 전용 안내 · 종류 바꾸면 요약
{
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/#/view-settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 30000 });
  await settle(page);
  let s = await fstate(page, "x");
  ok(s.exp === "false" && /읽기 전용/.test(s.sum) && s.lbl === "레이아웃 바꾸기", `보기 설정: 요약 '${s.sum}'`);
  await page.tap('[data-fold-bar="x"] button');
  await page.selectOption("#xKind", "daily");
  await settle(page, 800);
  s = await fstate(page, "x");
  ok(/일별 날씨/.test(s.sum) && s.exp === "true", `보기 설정: 일별로 바꾸면 요약 '${s.sum}'`);
  const order = await page.evaluate(() => { const c = document.querySelector("#download > .card:has(#xColGroups)"); const p = c.querySelector(":scope > p.muted"); return p.getBoundingClientRect().top > document.getElementById("xColGroups").getBoundingClientRect().top; });
  ok(order, "보기 설정: 컬럼 설명 문단이 목록 아래로");
  await ctx.close();
}
// 6) 첫 화면에서 본문 시작 ≤ 40%(위치 안내 띠가 보이는 첫 방문 기준), 가로 넘침 없음
const PAGES = [["#/stats/overview", "#chartStats", "#chart svg"], ["#/stats/yearly", "#yxOut", "#yxOut svg"], ["#/stats/region", "#rxOut", "#rxOut table, #rxOut svg, #rxOut .sx-key"], ["#/stats/life?view=outdoor", "#lxOut", "#lxOut svg, #lxOut table"], ["#/stats/records?view=day", "#rcOut", "#rcOut svg, #rcOut table"], ["#/questions", "#qCards .q-card", "#qCards .q-card"], ["#/hourly-weather", "#hResult", "#hResult > *"], ["#/daily-weather", "#dResult", "#dResult > *"], ["#/view-settings", "#xColGroups", "#xColGroups input"]];
for (const [hash, sel, wait] of PAGES) {
  const { ctx, page } = await ctxFor(MOB, true);
  await page.goto(`${BASE}/${hash}`, { waitUntil: "networkidle" });
  await page.waitForSelector(wait, { timeout: 45000 }).catch(() => {});
  await settle(page);
  const m = await page.evaluate((sel) => ({ top: Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY), ovf: document.documentElement.scrollWidth - innerWidth, ph: getComputedStyle(document.querySelector("header.ph")).display, meta: document.getElementById("abMeta").textContent }), sel);
  ok(m.top / 844 <= 0.4 && m.ovf <= 1 && m.ph === "none" && /최신/.test(m.meta), `${hash}: 본문 ${m.top}px (${(m.top / 8.44).toFixed(1)}%) · 넘침 ${m.ovf} · 앱 막대 '${m.meta}'`);
  await ctx.close();
}
// 7) 넓은 화면: 막대 없음, 조건·머리 그대로 (PROD 가 있으면 픽셀 비교)
const DESK = [["overview", "#/stats/overview", "#chart svg"], ["yearly", "#/stats/yearly", "#yxOut svg"], ["life", "#/stats/life?view=outdoor", "#lxOut svg"], ["hourly", "#/hourly-weather", "#hResult > *"], ["daily", "#/daily-weather", "#dResult > *"], ["view-settings", "#/view-settings", "#xColGroups input"]];
const shot = async (base, hash, wait) => {
  const { ctx, page } = await ctxFor({ width: 1280, height: 900 }, false);
  await page.goto(`${base}/${hash}`, { waitUntil: "networkidle" });
  await page.waitForSelector(wait, { timeout: 45000 }).catch(() => {});
  await page.addStyleTag({ content: "*{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  await settle(page, 800);
  const st = await page.evaluate(() => ({ bars: [...document.querySelectorAll(".fold-bar")].filter((b) => getComputedStyle(b).display !== "none").length, collapsedVis: [...document.querySelectorAll(".fold-collapsed")].every((e) => getComputedStyle(e).display !== "none"), ph: getComputedStyle(document.querySelector("header.ph")).display, meta: getComputedStyle(document.getElementById("abMeta") || document.body).display }));
  const buf = await page.screenshot({ fullPage: true });
  await ctx.close();
  return { st, buf };
};
for (const [name, hash, wait] of DESK) {
  const a = await shot(BASE, hash, wait);
  ok(a.st.bars === 0 && a.st.collapsedVis && a.st.ph !== "none", `넓은 화면 ${name}: 요약 막대 없음·조건 보임·머리 그대로 ${JSON.stringify(a.st)}`);
  if (PROD) {
    const b = await shot(PROD, hash, wait);
    ok(a.buf.equals(b.buf), `넓은 화면 ${name}: 이전 코드(${PROD})와 스크린샷 픽셀 동일 (${a.buf.length}/${b.buf.length} bytes)`);
    if (!a.buf.equals(b.buf)) { const fs = await import("node:fs"); fs.writeFileSync(`/tmp/desk-new-${name}.png`, a.buf); fs.writeFileSync(`/tmp/desk-old-${name}.png`, b.buf); }
  }
}
await browser.close();
ok(errs.length === 0, `페이지 오류 없음 ${errs.slice(0, 5).join(" | ")}`);
console.log(fails.length ? `\n${fails.length} FAIL` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
