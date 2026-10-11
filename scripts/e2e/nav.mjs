// 날씨 통계 하위 메뉴·질문으로 보는 날씨·예전 주소·한눈에 보기 시스템 카드 제거·관리 화면 유지. 스크린샷 /workspace/shots/nav-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const LOCAL = process.env.LOCAL || "http://127.0.0.1:8095";
const TOKEN = process.env.TOKEN;
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [], errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
async function ctxFor(base, mobile, cookie) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  if (cookie) await ctx.addCookies([{ name: "nw_session", value: TOKEN, url: base }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon/.test(m.text()) && errs.push(`console ${m.text()}`));
  return { ctx, page };
}
const navState = (page) => page.evaluate(() => ({ hash: location.hash, title: document.getElementById("phTitle").textContent, group: document.getElementById("phGroup").textContent, active: [...document.querySelectorAll("aside nav a.active")].map((a) => a.textContent.trim()), panel: [...document.querySelectorAll(".st-panel")].filter((p) => !p.hidden).map((p) => p.id), page: document.querySelector(".page.on")?.id }));
{
  const { ctx, page } = await ctxFor(BASE, false);
  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#chart svg, .dchart svg", { timeout: 30000 }).catch(() => {});
  let s = await navState(page);
  const sub = await page.$$eval("#navStats a", (a) => a.map((x) => x.textContent.trim()));
  ok(JSON.stringify(sub) === JSON.stringify(["한눈에 보기", "연도별 비교", "지역별 비교", "생활 속 날씨", "날씨 기록"]), `하위 메뉴 ${sub}`);
  const main = await page.$$eval("aside .nav-main > a, aside .nav-main > .nav-row > a", (a) => a.map((x) => x.textContent.trim()));
  ok(JSON.stringify(main) === JSON.stringify(["날씨 통계", "질문으로 보는 날씨", "시간별 날씨", "일별 날씨", "보기 설정"]), `조회 주 메뉴 ${main}`);
  ok(s.active.includes("한눈에 보기") && s.active.includes("날씨 통계") && s.title === "한눈에 보기" && s.group === "날씨 통계", `#/ = 한눈에 보기 ${JSON.stringify(s)}`);
  ok(!(await page.$("#stTabs")), "본문 탭 줄 없음");
  const sys = await page.evaluate(() => ({ cards: !!document.querySelector("#tabOverview #dashCards"), gapsLink: !!document.querySelector('#tabOverview a[href="#/gaps"]'), q: !!document.querySelector("#tabOverview #qCards"), chips: [...document.querySelectorAll("#phChips .chip")].map((c) => c.textContent.trim()), qLink: document.querySelector("#qLink")?.getAttribute("href") }));
  ok(!sys.cards && !sys.gapsLink && !sys.q, `한눈에 보기: 시스템 카드·미적재 링크·질문 카드 없음 ${JSON.stringify(sys)}`);
  ok(sys.chips.length === 1 && /최신/.test(sys.chips[0]), `조회 화면 머리 칩 = 공식 최신만 ${JSON.stringify(sys.chips)}`);
  ok(/^#\/questions\?station=/.test(sys.qLink || ""), `한눈에 보기 → 질문으로 보는 날씨 링크 ${sys.qLink}`);
  await page.screenshot({ path: `${SH}/nav-overview-desktop.png` });
  // 하위 메뉴 클릭
  for (const [label, panel, re] of [["연도별 비교", "tabYearly", /^#\/stats\/yearly/], ["지역별 비교", "tabRegion", /^#\/stats\/region/], ["생활 속 날씨", "tabLife", /^#\/stats\/life\?.*view=heat/], ["날씨 기록", "tabRecords", /^#\/stats\/records/], ["한눈에 보기", "tabOverview", /^#\/stats\/overview/]]) {
    await page.click(`#navStats a:text-is("${label}")`);
    await page.waitForTimeout(700);
    s = await navState(page);
    ok(re.test(s.hash) && s.panel.join() === panel && s.title === label && s.active.includes(label), `하위 메뉴 '${label}' → ${s.hash.slice(0, 50)} ${s.panel} 제목 ${s.title}`);
  }
  await page.click('#navStats a:text-is("생활 속 날씨")');
  await page.waitForSelector("#lxOut .card, #lxOut svg, #lxOut table", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SH}/nav-life-desktop.png` });
  // 질문으로 보는 날씨
  await page.click('aside a[data-page="questions"]');
  await page.waitForSelector("#qCards .q-card", { timeout: 40000 });
  await page.waitForSelector("#qxLife .q-card", { timeout: 40000 });
  s = await navState(page);
  ok(s.page === "dash" && s.panel.join() === "tabQuestions" && s.title === "질문으로 보는 날씨" && JSON.stringify(s.active) === JSON.stringify(["질문으로 보는 날씨"]), `질문으로 보는 날씨 ${JSON.stringify(s)}`);
  const qn = await page.evaluate(() => ({ q: document.querySelectorAll("#qCards .q-card").length, life: document.querySelectorAll("#qxLife .q-card").length, hrefs: [...document.querySelectorAll("#tabQuestions a.q-card")].map((a) => a.getAttribute("href").split("?")[0]) }));
  ok(qn.q >= 4 && qn.life >= 8 && qn.hrefs.every((h) => /^#\/stats\/(yearly|region|life|records)$/.test(h)), `질문 카드 ${qn.q}개 + 생활 질문 ${qn.life}개, 링크 ${[...new Set(qn.hrefs)]}`);
  await page.screenshot({ path: `${SH}/nav-questions-desktop.png`, fullPage: false });
  // 지점 바꾸기
  await page.selectOption("#qxSt", "159");
  await page.waitForFunction(() => document.getElementById("qCards").dataset.st === "159" && /부산/.test(document.getElementById("qCardsNote").textContent), null, { timeout: 40000 });
  ok(/station=159/.test(await page.evaluate(() => location.hash)), "질문: 지점 바꾸면 주소·카드 갱신");
  // 질문 카드 → 생활 속 날씨 상세 → '질문 모아 보기' 로 돌아오기
  await page.click('#qxLife a.q-card[href^="#/stats/life?"]');
  await page.waitForTimeout(800);
  s = await navState(page);
  ok(s.panel.join() === "tabLife" && s.active.includes("생활 속 날씨"), `질문 카드 → 생활 속 날씨 ${s.hash.slice(0, 60)}`);
  const back = await page.getAttribute('#lxNav a:text-is("질문 모아 보기")', "href");
  ok(/^#\/questions\?station=159/.test(back), `생활 속 날씨의 '질문 모아 보기' → ${back}`);
  // 예전 주소
  await page.goto(`${BASE}/#/stats/life?view=cards&station=133`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  s = await navState(page);
  ok(s.hash === "#/questions?station=133" && s.panel.join() === "tabQuestions", `예전 #/stats/life?view=cards → ${s.hash}`);
  await page.goto(`${BASE}/#/stats/records?view=records&station=108`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  s = await navState(page);
  ok(s.panel.join() === "tabRecords" && s.active.includes("날씨 기록"), "예전 탭 주소(#/stats/records) 그대로 열림");
  await page.goto(`${BASE}/#/hourly-weather`, { waitUntil: "networkidle" });
  s = await navState(page);
  ok(JSON.stringify(s.active) === JSON.stringify(["시간별 날씨"]), `다른 화면에선 통계 하위 메뉴 꺼짐 ${s.active}`);
  await ctx.close();
}
// 관리자: 수집이력 화면 위에 적재 현황 카드, 관리 화면 머리 칩 그대로 (로컬 테스트 세션, 관리자)
{
  const { ctx, page } = await ctxFor(LOCAL, false, true);
  await page.goto(`${LOCAL}/#/jobs`, { waitUntil: "networkidle" });
  await page.waitForSelector("#dashCards .card", { timeout: 20000 });
  const a = await page.evaluate(() => ({ cards: [...document.querySelectorAll("#dashCards .card")].map((c) => c.querySelector("p").textContent.trim()), gaps: !!document.querySelector('#jobs a[href="#/gaps"]'), chips: [...document.querySelectorAll("#phChips .chip")].length }));
  ok(a.cards.includes("최근 수집") && a.cards.includes("저장소") && a.cards.length >= 3 && a.gaps && a.chips >= 4, `관리자 수집이력: 적재 현황 카드 ${JSON.stringify(a)}`);
  await page.screenshot({ path: `${SH}/nav-admin-jobs-desktop.png` });
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
