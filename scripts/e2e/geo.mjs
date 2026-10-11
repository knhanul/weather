// 기본 지점(위치)·기본 달 e2e. 위치는 Playwright 가짜 좌표. 스크린샷 /workspace/shots/geo-*.png
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8099";
const LOCAL = process.env.LOCAL || "http://127.0.0.1:8095";
const TOKEN = process.env.TOKEN;
const SH = process.env.SH || "/workspace/shots";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const fails = [], errs = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const SUWON = { latitude: 37.2636, longitude: 127.0286 }; // 수원시청 → 119 약 4km
const HAEUNDAE = { latitude: 35.1631, longitude: 129.1635 }; // 해운대 → 159
const COORD_RE = /37\.26|127\.02|35\.16|129\.16|latitude=|lat=|lon=|lng=/;
async function mk({ base = BASE, mobile = false, geo, grant = false, cookie = false } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul", ...(geo ? { geolocation: geo } : {}), ...(grant ? { permissions: ["geolocation"] } : {}) });
  if (cookie) await ctx.addCookies([{ name: "nw_session", value: TOKEN, url: base }]);
  const page = await ctx.newPage();
  const leaks = [];
  page.on("request", (r) => { const t = `${r.url()} ${r.postData() || ""}`; if (COORD_RE.test(decodeURIComponent(t))) leaks.push(t.slice(0, 160)); });
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|favicon/.test(m.text()) && errs.push(`console ${m.text()}`));
  return { ctx, page, leaks };
}
const dash = (page) => page.evaluate(() => ({ hash: location.hash, on: document.querySelector("#stSel button.on")?.dataset.st, title: document.getElementById("chartTitle").textContent, banner: document.getElementById("geoBanner").hidden ? null : document.getElementById("geoBanner").textContent.trim(), note: document.getElementById("geoNote").hidden ? null : document.getElementById("geoNote").textContent.trim(), stored: localStorage.getItem("nw.station"), ask: localStorage.getItem("nw.geoAsk") }));
const ready = (page) => page.waitForSelector("#chart svg", { timeout: 30000 }).catch(() => {});
const stHas = (s, id) => (s.stored || "").includes(`"id":"${id}"`);

// 1) 처음 방문, 위치 권한 '묻기' 상태 → 작은 안내 띠(버튼), 기본 서울 108, 권한 창은 자동으로 안 뜸
{
  const { ctx, page, leaks } = await mk();
  let prompted = 0;
  await page.addInitScript(() => { const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (...a) => { window.__geoCalls = (window.__geoCalls || 0) + 1; return g(...a); }; });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await ready(page);
  await page.waitForSelector('#geoBanner [data-geo="use"]', { timeout: 10000 }).catch(() => {});
  let s = await dash(page);
  prompted = await page.evaluate(() => window.__geoCalls || 0);
  ok(s.on === "108" && /가장 가까운 관측소/.test(s.banner || "") && prompted === 0 && !s.stored, `처음: 서울 108 + 안내 띠, 위치 요청 없음 ${JSON.stringify({ on: s.on, prompted, banner: (s.banner || "").slice(0, 30) })}`);
  await page.screenshot({ path: `${SH}/geo-banner-desktop.png` });
  // 버튼 누를 때 허용 → 해운대 → 부산 159
  await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation(HAEUNDAE);
  await page.click('[data-geo="use"]');
  await page.waitForFunction(() => document.querySelector("#stSel button.on")?.dataset.st === "159", null, { timeout: 15000 });
  await page.waitForTimeout(800);
  s = await dash(page);
  ok(/station=159/.test(s.hash) && stHas(s, "159") && /현재 위치에서 가장 가까운 관측소: 부산\(159\), 약 \d+(\.\d)?km/.test(s.note || "") && !s.banner, `버튼 → 부산(159) 선택·이유 표시 ${s.note}`);
  ok(!/latitude|longitude|37\.|129\./.test(s.stored), `localStorage 에는 지점 번호만 ${s.stored}`);
  await page.screenshot({ path: `${SH}/geo-chosen-desktop.png` });
  // 다른 화면도 같은 기본 지점, 지금 달
  await page.goto(`${BASE}/#/hourly-weather`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  ok((await page.inputValue("#hStation")) === "159", "시간별 날씨 기본 지점 = 159");
  await page.goto(`${BASE}/#/daily-weather`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  ok((await page.inputValue("#dStation")) === "159", "일별 날씨 기본 지점 = 159");
  await page.goto(`${BASE}/#/stats/yearly`, { waitUntil: "networkidle" });
  await page.waitForSelector("#yxOut svg, #yxOut table", { timeout: 30000 });
  const y = await page.evaluate(() => ({ hash: location.hash, st: document.getElementById("yxSt")?.value, out: document.getElementById("yxOut").textContent }));
  ok(y.st === "159" && /period=month%3A10/.test(y.hash) && /진행 중/.test(y.out) && !/불러오지 못했습니다/.test(y.out), `연도별 비교: 159 · 지금 달(10월) · 올해는 진행 중 표시 ${y.hash.slice(0, 70)}`);
  await page.screenshot({ path: `${SH}/geo-yearly-current-month-desktop.png` });
  await page.goto(`${BASE}/#/questions`, { waitUntil: "networkidle" });
  await page.waitForSelector("#qCards .q-card", { timeout: 40000 });
  const q = await page.evaluate(() => ({ st: document.getElementById("qxSt").value, cards: document.getElementById("qCards").textContent }));
  ok(q.st === "159" && /우리 동네 10월은 얼마나 더워졌을까/.test(q.cards), "질문으로 보는 날씨: 159, '우리 동네 10월은…' 카드");
  // 직접 고르면 그 지점이 이김(다음 방문에도, 위치 허용 상태여도)
  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" }); await ready(page);
  await page.click('#stSel button[data-st="133"]'); await page.waitForTimeout(800);
  s = await dash(page);
  ok(s.on === "133" && /"why":"manual"/.test(s.stored) && !s.note, `직접 고름 → 133 저장(manual), 알림 숨김 ${s.stored}`);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await ready(page); await page.waitForTimeout(1500);
  s = await dash(page);
  ok(s.on === "133" && !s.banner && !s.note, `다시 방문: 직접 고른 133 유지(위치 허용이어도 안 바꿈) ${s.on}`);
  ok(!leaks.length, `좌표가 서버로 가지 않음 (${leaks.length}) ${leaks.slice(0, 2).join(" | ")}`);
  await ctx.close();
}
// 2) 이미 허용된 권한 → 안내 없이 조용히 가까운 지점(수원 119), 모바일 스크린샷
{
  const { ctx, page, leaks } = await mk({ mobile: true, geo: SUWON, grant: true });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#stSel button.on")?.dataset.st === "119", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const s = await dash(page);
  ok(!s.banner && /현재 위치에서 가장 가까운 관측소: 수원\(119\), 약 [3-5]\.\dkm/.test(s.note || "") && /수원/.test(s.title), `허용 상태: 안내 없이 수원(119) ${s.note}`);
  await page.screenshot({ path: `${SH}/geo-auto-mobile.png` });
  // 주소의 지점이 이김
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/#/?station=184&hours=72`, { waitUntil: "networkidle" }); await ready(page); await page.waitForTimeout(2500);
  const u = await dash(page);
  ok(u.on === "184" && /station=184/.test(u.hash) && !u.note, `주소 station=184 가 위치(119)보다 우선 ${u.on}`);
  await page.goto(`${BASE}/#/stats/records?view=records&station=156`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
  ok((await page.evaluate(() => document.getElementById("rcSt")?.value)) === "156", "주소 station=156(날씨 기록)도 우선");
  ok(!leaks.length, `좌표 전송 없음 (${leaks.length})`);
  await ctx.close();
}
// 3) 거부 → 기본 서울 108 유지, 안내 다시 안 뜸
{
  const { ctx, page } = await mk({ mobile: true });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await ready(page);
  await page.waitForSelector('#geoBanner [data-geo="use"]', { timeout: 10000 });
  await page.screenshot({ path: `${SH}/geo-banner-mobile.png` });
  await page.tap('[data-geo="use"]'); // 권한 없음 → 거부
  await page.waitForFunction(() => /허용되지 않았습니다/.test(document.getElementById("geoBanner").textContent), null, { timeout: 15000 });
  let s = await dash(page);
  ok(s.on === "108" && s.ask === "denied" && !s.stored, `거부 → 서울 108 그대로, 안내 문구 ${s.banner.slice(0, 40)}`);
  await page.screenshot({ path: `${SH}/geo-denied-mobile.png` });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await ready(page); await page.waitForTimeout(800);
  s = await dash(page);
  ok(!s.banner && s.on === "108", "거부 뒤 다시 방문: 안내 없음, 108");
  await ctx.close();
}
{
  // '괜찮아요' 도 한 번이면 끝 (새 브라우저 — 거부 상태가 아닌)
  const { ctx, page } = await mk({ mobile: true });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await ready(page);
  await page.waitForSelector('#geoBanner [data-geo="no"]', { timeout: 10000 });
  await page.tap('[data-geo="no"]');
  let s = await dash(page);
  ok(!s.banner && s.ask === "dismissed", "'괜찮아요' → 숨김·기억");
  await ctx.close();
}
// 4) 기본 달: 12월 31일 밤 → 12월, 1월 1일 새벽(서울) → 1월 (가짜 시계). 결과는 오류·빈 화면 아님
for (const [when, want] of [["2026-12-31T23:30:00+09:00", 12], ["2027-01-01T00:30:00+09:00", 1]]) {
  const { ctx, page } = await mk();
  await page.clock.setFixedTime(new Date(when));
  await page.goto(`${BASE}/#/stats/yearly?station=108`, { waitUntil: "networkidle" });
  await page.waitForSelector("#yxOut svg, #yxOut table, #yxOut .sx-state", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ hash: location.hash, out: document.getElementById("yxOut").textContent, svg: !!document.querySelector("#yxOut svg") }));
  ok(new RegExp(`period=month%3A${want}(&|$)`).test(r.hash) && r.svg && !/불러오지 못했습니다/.test(r.out), `시계 ${when} → 기본 ${want}월, 그래프 있음 ${r.hash.slice(0, 60)}`);
  if (want === 1) await page.screenshot({ path: `${SH}/geo-month-jan-desktop.png` });
  await ctx.close();
}
// 5) 로그인(로컬 테스트 세션): 직접 고른 지점을 내 계정에 저장(지점 번호만)
if (TOKEN) {
  const { ctx, page, leaks } = await mk({ base: LOCAL, cookie: true, geo: SUWON, grant: true });
  await page.goto(`${LOCAL}/#/hourly-weather`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  const opts = await page.$$eval("#hStation option", (o) => o.map((x) => x.value));
  const pickId = opts.find((v) => v !== (opts[0])) || opts[0];
  await page.selectOption("#hStation", pickId); await page.waitForTimeout(800);
  const r = await page.evaluate(async () => (await (await fetch("/api/station-pref")).json()));
  ok(r.ok && r.pref && r.pref.station === pickId && !("latitude" in r.pref), `로그인: 직접 고른 ${pickId} 가 내 계정에 저장 ${JSON.stringify(r.pref)}`);
  ok(!leaks.length, `로그인 상태도 좌표 전송 없음 (${leaks.length})`);
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
