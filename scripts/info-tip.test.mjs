// ⓘ 근거 펼치기(public/info-tip.js) 시험: 열기·닫기, 한 번에 하나만, Esc·바깥 누르기, 링크 카드 안에서 이동 안 함, 정적 data-it-tag, auto.
// 브라우저가 필요: PW_MODULE(playwright-core 경로)와 CHROME(기본 /usr/bin/google-chrome). 없으면 건너뜀.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
let pw = null;
try { pw = await import(process.env.PW_MODULE || "/workspace/pw/node_modules/playwright-core/index.mjs"); } catch { try { pw = await import("playwright-core"); } catch { pw = null; } }
const skip = !pw || !fs.existsSync(CHROME) ? "playwright-core/chrome 없음" : false;

test("info-tip: 열기·닫기·하나만·Esc·바깥·링크 카드", { skip }, async () => {
  const b = await pw.chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const css = fs.readFileSync(path.join(root, "info-tip.css"), "utf8");
    await p.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <p id="static" data-it-tag="일자료 1970년~" data-it-label="기준">긴 <b>정적</b> 설명</p>
      <div id="host"></div><p id="outside">바깥</p></body></html>`);
    await p.addScriptTag({ content: fs.readFileSync(path.join(root, "info-tip.js"), "utf8") });
    await p.evaluate(() => {
      const IT = window.InfoTip;
      window.rowClicks = 0;
      document.getElementById("host").innerHTML =
        IT.note("1970년~ · 서울(108)", "첫 번째 긴 설명", { cls: "rt-note", label: "산출 기준" }) +
        `<h3>제목 ${IT.sub("최근 10년", "두 번째 긴 설명")}</h3>` +
        `<a id="card" href="#/moved"><span>링크 카드</span>${IT.btn("세 번째 설명")}</a>` +
        `<div id="row">${IT.btn("네 번째 설명")}</div>` +
        IT.auto("짧은 문장", { cls: "short" }) + IT.auto("앞마디가 여기까지입니다 — 그리고 아주 긴 뒷부분 설명이 이어지며 기준과 결측 처리와 산출 방법을 모두 담고 있습니다", { cls: "x" });
      document.getElementById("row").addEventListener("click", () => window.rowClicks++);
      IT.upgrade();
    });
    const st = () => p.evaluate(() => [...document.querySelectorAll(".it-btn")].map((b) => ({ exp: b.getAttribute("aria-expanded"), hidden: document.getElementById(b.getAttribute("aria-controls")).hidden })));
    let s = await st();
    assert.equal(s.length, 6, "버튼 6개(정적 1 + note·sub·btn·btn·auto)");
    assert.ok(s.every((x) => x.exp === "false" && x.hidden), "처음엔 모두 닫힘");
    // 꼬리표는 보이고 설명은 숨김
    assert.equal(await p.locator("#static .it-tag").innerText(), "일자료 1970년~");
    assert.equal(await p.locator("#static .it-pop").isVisible(), false);
    assert.equal(await p.evaluate(() => document.querySelector("#static .it-pop").innerHTML), "긴 <b>정적</b> 설명", "정보는 지우지 않고 옮김");
    // 열기
    const btns = p.locator(".it-btn");
    await btns.nth(1).click();
    s = await st();
    assert.deepEqual(s.map((x) => x.exp), ["false", "true", "false", "false", "false", "false"]);
    assert.equal(await p.locator("#host .rt-note .it-pop").isVisible(), true);
    assert.equal(await p.locator("#host .rt-note .it-pop").innerText(), "첫 번째 긴 설명");
    // 다른 것을 열면 앞의 것은 닫힘(하나만)
    await btns.nth(2).click();
    s = await st();
    assert.deepEqual(s.map((x) => x.exp), ["false", "false", "true", "false", "false", "false"]);
    assert.equal(s.filter((x) => !x.hidden).length, 1);
    // 같은 버튼을 다시 누르면 닫힘
    await btns.nth(2).click();
    assert.ok((await st()).every((x) => x.exp === "false" && x.hidden));
    // Esc 로 닫히고 버튼으로 초점
    await btns.nth(0).focus();
    await p.keyboard.press("Enter");
    assert.equal((await st())[0].exp, "true");
    await p.keyboard.press("Escape");
    assert.equal((await st())[0].exp, "false");
    assert.equal(await p.evaluate(() => document.activeElement === document.querySelectorAll(".it-btn")[0]), true);
    // 바깥 누르면 닫힘, 설명 안을 누르면 그대로
    await btns.nth(1).click();
    await p.locator("#host .rt-note .it-pop").click();
    assert.equal((await st())[1].exp, "true");
    await p.locator("#outside").click();
    assert.equal((await st())[1].exp, "false");
    // 링크 카드 안의 ⓘ: 이동하지 않음, 줄 클릭 처리기도 반응 안 함
    await btns.nth(3).click();
    assert.equal(await p.evaluate(() => location.hash), "");
    assert.equal((await st())[3].exp, "true");
    await btns.nth(4).click();
    assert.equal(await p.evaluate(() => window.rowClicks), 0);
    assert.deepEqual((await st()).map((x) => x.exp), ["false", "false", "false", "false", "true", "false"]);
    // auto: 짧으면 그대로, 길면 첫 마디만 꼬리표
    assert.equal(await p.evaluate(() => document.querySelectorAll("#host p.short").length + document.querySelectorAll("#host p.short .it-btn").length), 1);
    assert.equal(await p.locator("#host .x .it-tag").innerText(), "앞마디가 여기까지입니다");
    // 접근성 속성
    const a = await p.evaluate(() => { const b = document.querySelectorAll(".it-btn")[1]; return [b.tagName, b.type, b.getAttribute("aria-controls"), b.getAttribute("aria-label"), document.getElementById(b.getAttribute("aria-controls")).getAttribute("role")]; });
    assert.equal(a[0], "BUTTON"); assert.equal(a[1], "button"); assert.match(a[2], /^itp\d+$/); assert.match(a[3], /자세히 보기/); assert.equal(a[4], "note");
    // 모바일 폭에서 넘치지 않음
    await btns.nth(5).click();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await b.close(); }
});
