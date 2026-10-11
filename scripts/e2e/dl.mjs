// 시간별·일별 날씨의 CSV 내려받기 = 지금 지점·기간 전체 × 지금 레이아웃 컬럼 순서. 스크린샷 /workspace/shots/dl-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const SH = "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [];
const errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
async function ctxFor(mobile) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon/.test(m.text()) && errs.push(`console ${m.text()}`));
  return { ctx, page };
}
const settle = (page) => page.waitForFunction(() => !document.querySelector('.vw-result[aria-busy="true"]'), null, { timeout: 30000 }).then(() => page.waitForTimeout(200));
async function csvOf(page, sel) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click(sel)]);
  const buf = Buffer.concat(await (await dl.createReadStream()).toArray()).toString("utf8").replace(/^\uFEFF/, "");
  const lines = buf.trimEnd().split("\n").filter((l) => !l.startsWith("#"));
  return { name: dl.suggestedFilename(), head: lines[0].split(","), rows: lines.slice(1) };
}
const toBar = (page, id) => page.evaluate((id) => { const el = document.getElementById(id); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8); }, id).then(() => page.waitForTimeout(150));
{
  const { ctx, page } = await ctxFor(false);
  // 시간별: 3일(72행) → 화면 200행 한 쪽 / 한 달(744행) → 4쪽인데 파일은 전체
  await page.goto(`${BASE}/#/hourly-weather?station=108&from=2025-08-01%2000:00&to=2025-08-31%2023:00&layout=preset:preset_hourly_temp&view=grid`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hBar .vw-dl", { timeout: 30000 });
  const v = await page.evaluate(() => ({ cols: document.getElementById("hResult").dataset.cols.split(","), shown: document.querySelectorAll("#hResult tbody tr").length, total: window.Views._state.hourly.cache.d.total, pages: window.Views._state.hourly.cache.d.pages, note: document.querySelector("#hBar .vw-dl-note").textContent, href: document.querySelector("#hBar .vw-dl").getAttribute("href") }));
  ok(v.shown === 200 && v.pages > 1, `시간별 한 달: 화면 ${v.shown}행 / ${v.pages}쪽, 전체 ${v.total}`);
  ok(/744행/.test(v.note) && /파일은 기간 전체/.test(v.note), `안내: ${v.note}`);
  await page.screenshot({ path: `${SH}/dl-hourly-desktop.png` });
  const c = await csvOf(page, "#hBar .vw-dl");
  ok(JSON.stringify(c.head) === JSON.stringify(v.cols), `CSV 헤더 = 그리드 컬럼 순서 ${c.head.join(",")}`);
  ok(c.rows.length === v.total && v.total === 744, `CSV 행 수 = 기간 전체 ${c.rows.length}/${v.total}`);
  const g = await page.$$eval("#hResult tbody tr:first-child td", (t) => t.map((x) => x.textContent.trim()));
  const r0 = c.rows[0].split(",");
  ok(r0[0].slice(0, 16) === g[0] && r0.slice(3).every((x, i) => (x === "" ? g[3 + i] === "—" : Number(x) === Number(g[3 + i]))), `첫 행 값 일치 csv=${r0.join("|")} grid=${g.join("|")}`);
  // 레이아웃을 바꾸면 버튼의 컬럼도 바뀜(조회 조건은 그대로)
  await page.selectOption("#hBar select", "preset:preset_hourly_wind_press");
  await settle(page);
  const href2 = await page.getAttribute("#hBar .vw-dl", "href");
  ok(/columns=observation_datetime%2Cstation_id%2Cstation_name%2Cwind_speed%2Cwind_direction%2Cpressure%2Csea_level_pressure/.test(href2) && /from=2025-08-01/.test(href2), `레이아웃 변경 → 내려받기 컬럼 변경 ${href2}`);
  // 입력만 바꾸고 조회 안 하면: 지금 보이는 조회 그대로
  await page.fill("#hFrom", "2025-09-01T00:00");
  ok((await page.getAttribute("#hBar .vw-dl", "href")) === href2, "조회 전 입력 변경은 내려받기에 반영 안 됨(보이는 결과 기준)");
  // 일별: 기간 31일, 카드 보기에서도 버튼
  await page.goto(`${BASE}/#/daily-weather?station=133&from=2025-07-01&to=2025-07-31&layout=preset:preset_daily_rain_snow&view=card`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dBar .vw-dl", { timeout: 30000 });
  await settle(page);
  const dv = await page.evaluate(() => ({ cols: document.getElementById("dResult").dataset.cols.split(","), cards: document.querySelectorAll("#dResult .vw-card").length, total: window.Views._state.daily.cache.d.total }));
  await page.screenshot({ path: `${SH}/dl-daily-desktop.png` });
  const dc = await csvOf(page, "#dBar .vw-dl");
  ok(JSON.stringify(dc.head) === JSON.stringify(dv.cols) && dc.rows.length === dv.total && dv.total === 31 && dv.cards === 31, `일별 CSV: 헤더=레이아웃 ${dc.head.length}개, 행 ${dc.rows.length}=${dv.total}, 카드 ${dv.cards}, 파일 ${dc.name}`);
  // 보기 설정: 컬럼·레이아웃만
  await page.goto(`${BASE}/#/view-settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 30000 });
  await page.waitForTimeout(500);
  const h2 = await page.$$eval("#download h2", (h) => h.map((x) => x.textContent.trim()));
  ok(JSON.stringify(h2) === JSON.stringify(["레이아웃(보기 구성) 관리", "컬럼 선택", "컬럼 순서 (화면·CSV 공통)"]), `보기 설정 카드: ${h2.join(" / ")}`);
  await page.selectOption("#xKind", "daily");
  await page.waitForTimeout(300);
  ok((await page.$eval("#xLayoutSelect", (s) => s.value)) === "preset:preset_daily_default", "자료 종류 바꾸면 일별 기본 프리셋");
  await page.screenshot({ path: `${SH}/dl-settings-desktop.png` });
  await ctx.close();
}
{
  const { ctx, page } = await ctxFor(true);
  await page.goto(`${BASE}/#/hourly-weather?station=108&from=2025-08-01%2000:00&to=2025-08-03%2023:00&view=card`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hBar .vw-dl", { timeout: 30000, state: "attached" }); await page.tap('[data-fold-bar="h"] button'); await page.waitForSelector("#hBar .vw-dl", { timeout: 5000 }); // 좁은 화면: 조건 막대를 펼쳐야 내려받기 버튼이 보임
  await toBar(page, "hBar");
  await page.screenshot({ path: `${SH}/dl-hourly-mobile.png` });
  const c = await csvOf(page, "#hBar .vw-dl");
  ok(c.rows.length === 72, `모바일 시간별 3일 CSV ${c.rows.length}행`);
  await page.goto(`${BASE}/#/daily-weather?station=108&view=grid`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dBar .vw-dl", { timeout: 30000, state: "attached" }); await page.tap('[data-fold-bar="d"] button'); await page.waitForSelector("#dBar .vw-dl", { timeout: 5000 }); // 좁은 화면: 조건 막대를 펼쳐야 내려받기 버튼이 보임
  await toBar(page, "dBar");
  await page.screenshot({ path: `${SH}/dl-daily-mobile.png` });
  await page.goto(`${BASE}/#/view-settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("#xColGroups input", { timeout: 30000 });
  await page.waitForTimeout(500);
  ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, "보기 설정 모바일 넘침 없음");
  await page.screenshot({ path: `${SH}/dl-settings-mobile.png` });
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
