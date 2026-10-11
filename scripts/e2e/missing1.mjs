// 1일 결측 표시 e2e(좁은 화면). 실행: BASE=http://127.0.0.1:8099 SH=/workspace/shots node scripts/e2e/missing1.mjs (playwright-core 필요)
// 서울(108) 2017-10-12 일최고기온 결측(기상청 원자료도 공란) → 10월 더위 보기·연도별 비교에서 2017년이 '1일 결측'으로 들어가는지,
// 2일 이상 빠진 해(1990년 겨울: 자료가 1990-01-01 부터라 59/90일)는 그대로 '자료 부족'인지 본다.
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [], errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
page.on("console", (m) => m.type() === "error" && !/401|favicon|400/.test(m.text()) && errs.push(`console ${m.text()}`));
const row = (sel, year) => page.evaluate(({ sel, year }) => {
  const t = document.querySelector(`${sel} .sx-table table`);
  if (!t) return null;
  const heads = [...t.querySelectorAll("thead th")].map((x) => x.textContent);
  const tr = [...t.querySelectorAll("tbody tr")].find((r) => r.cells[0].textContent.trim() === String(year));
  return tr ? { dim: tr.classList.contains("dim"), cells: Object.fromEntries([...tr.cells].map((c, i) => [heads[i], c.textContent.trim()])) } : null;
}, { sel, year });
const warnTxt = (sel) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .sx-warn`)].map((x) => ({ miss: x.classList.contains("sx-warn-miss"), t: x.textContent })), sel);

// 1) 생활 속 날씨 · 더위(화면은 연 전체 구간) · 서울
await page.goto(`${BASE}/#/stats/life?station=108&view=heat&from=1990&to=2026`, { waitUntil: "networkidle" });
await page.waitForSelector("#lxOut .sx-table table", { timeout: 45000 });
let r = await row("#lxOut", 2017);
ok(r && !r.dim && /1일 결측\(2017-10-12\)/.test(r.cells["상태"]) && r.cells["관측일수"] === "364" && r.cells["일수(일)"] !== "—" && r.cells["첫 30℃ 이상"] !== "—", `더위: 2017 행 포함·흐리지 않음·'1일 결측' ${JSON.stringify(r)}`);
let w = await warnTxt("#lxOut");
ok(w.some((x) => x.miss && /2017년\(10\/12 빠짐 · 364\/365일\).*30℃ 이상이었는지는 알 수 없어/.test(x.t)), `더위: 1일 결측 안내 ${JSON.stringify(w.map((x) => x.t))}`);
ok(!w.some((x) => /자료 부족.*2017/.test(x.t)), "더위: 2017 은 자료 부족 목록에 없음");
ok((await page.locator("#lxOut .sx-text li", { hasText: "결측을 포함해 계산한 연도" }).count()) === 0, "더위: 결측 안내는 한 번만(요약 문장 목록에는 없음)");
const wm = page.locator("#lxOut .sx-warn-miss").first();
await wm.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -120));
await page.screenshot({ path: `${SH}/missing1-heat-108-warn.png` });
await page.evaluate(() => {
  const tr = [...document.querySelectorAll("#lxOut .sx-table tbody tr")].find((r) => r.cells[0].textContent.trim() === "2017");
  tr.scrollIntoView({ block: "center" });
  tr.style.outline = "2px solid #f59e0b";
  const wrap = tr.closest(".sx-table-wrap");
  wrap.scrollLeft = wrap.scrollWidth; // 상태·결측일 칸이 보이게
});
await page.screenshot({ path: `${SH}/missing1-heat-108-row.png` });
ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "더위: 가로 넘침 없음");

// 1b) API: 같은 더위 계산을 10월 구간으로(화면엔 구간 고르기 없음)
const api = await page.evaluate(async () => (await fetch("/api/stats/life/heat?station=108&period=month:10")).json());
const a17 = api.rows.find((x) => x.year === 2017);
ok(a17.status === "complete" && a17.obs === 30 && a17.days === 31 && a17.count === 0 && a17.missingDates.join() === "2017-10-12" && !api.summary.incomplete.some((x) => x.year === 2017), `API 더위 10월: 2017 포함 30/31 ${JSON.stringify(a17)}`);

// 2) 연도별 비교 · 최고기온 평균 · 서울 10월: 2017 이 그래프·표에 값으로 들어감
await page.goto(`${BASE}/#/stats/yearly?station=108&metric=avg_max&period=month:10&from=1990&to=2026`, { waitUntil: "networkidle" });
await page.waitForSelector("#yxOut svg", { timeout: 45000 });
r = await row("#yxOut", 2017);
ok(r && !r.dim && r.cells["최고기온 평균(℃)"] !== "—" && /1일 결측\(2017-10-12\)/.test(r.cells["상태"]) && r.cells["결측일"] === "2017-10-12", `연도별 10월 최고기온 평균: 2017 값 있음 ${JSON.stringify(r)}`);
w = await warnTxt("#yxOut");
ok(w.some((x) => x.miss && /2017년\(10\/12 빠짐/.test(x.t)), "연도별: 1일 결측 안내");
// 그래프 툴팁: 2017 점(가로 축 위치)을 눌러 툴팁에 '1일 결측' 표시
await page.evaluate(() => document.querySelector("#yxChart svg[role=img]").scrollIntoView({ block: "center" }));
await page.waitForTimeout(200);
const tip = await page.evaluate(async () => {
  const svg = document.querySelector("#yxChart svg[role=img]");
  const b = svg.getBoundingClientRect();
  return { x: b.left, w: b.width, y: b.top + b.height / 2 };
});
let tipText = "";
for (let k = 0; k < 40 && !/2017년/.test(tipText); k++) {
  const x = tip.x + tip.w * (0.6 + (k / 40) * 0.3);
  await page.touchscreen.tap(x, tip.y);
  await page.waitForTimeout(400); // 빠른 연속 탭은 두 번 누르기로 읽힘
  tipText = await page.evaluate(() => [...document.querySelectorAll("#yxOut .tip")].map((e) => (getComputedStyle(e).display !== "none" ? e.textContent : "")).join(" "));
}
if (/2017년/.test(tipText)) {
  ok(/1일 결측\(10\/12\)/.test(tipText), `연도별 툴팁: '1일 결측(10/12)' ${tipText.slice(0, 120)}`);
  await page.screenshot({ path: `${SH}/missing1-yearly-108-oct-tip.png` });
} else console.log("SKIP 툴팁 2017 점을 찾지 못함(그래프 좌표) — 표·안내로 확인");

// 3) 2일 이상 결측은 그대로 자료 부족: 서울 1990년 겨울(1990-01-01 부터 자료, 59/90일)
await page.goto(`${BASE}/#/stats/yearly?station=108&metric=avg_temp&period=season:winter&from=1990&to=2026`, { waitUntil: "networkidle" });
await page.waitForSelector("#yxOut .sx-table table", { timeout: 45000 });
r = await row("#yxOut", 1990);
ok(r && r.dim && r.cells["상태"] === "자료 부족" && r.cells["평균기온(℃)"] === "—" && r.cells["결측일"] === "—", `겨울 1990: 자료 부족 그대로 ${JSON.stringify(r)}`);
w = await warnTxt("#yxOut");
ok(w.some((x) => !x.miss && /2일 이상 결측.*1990년\(관측 59\/90일\)/.test(x.t)), "겨울: 자료 부족 안내(2일 이상)");

ok(errs.length === 0, `콘솔 오류 없음 ${errs.join(" | ")}`);
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
