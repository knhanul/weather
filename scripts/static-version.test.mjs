import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionRefs, createVersioner, REF_RE, hashOf } from "../static-version.mjs";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const read = (u) => { try { return fs.readFileSync(path.join(PUB, u)); } catch { return null; } };

test("?v= 참조를 내용 해시로: 파일을 고치면 숫자를 안 올려도 주소가 바뀜(2026-10-19 내일 날씨 옛 JS 회귀)", () => {
  const files = { "/a.js": "console.log(1)", "/i.html": `<script src="/a.js?v=11"></script><link href='/s.css?v=1'>` , "/s.css": "a{}" };
  const v1 = createVersioner((u) => (files[u] != null ? Buffer.from(files[u]) : null));
  const h1 = v1.content("/i.html").toString();
  assert.match(h1, /\/a\.js\?v=[\w-]{10}"/);
  assert.ok(!h1.includes("?v=11"));
  files["/a.js"] = "console.log(2)"; // 내용만 바뀌고 index.html 의 숫자는 그대로
  const h2 = createVersioner((u) => (files[u] != null ? Buffer.from(files[u]) : null)).content("/i.html").toString();
  assert.notEqual(h1.match(/a\.js\?v=([\w-]+)/)[1], h2.match(/a\.js\?v=([\w-]+)/)[1]);
  assert.equal(h1.match(/s\.css\?v=([\w-]+)/)[1], h2.match(/s\.css\?v=([\w-]+)/)[1]); // 안 바뀐 파일은 그대로
});

test("이어진 참조(JS 안의 import)도 바뀌고, 없는 파일·순환은 원래 값 그대로", () => {
  const files = { "/x.js": `import("/y.mjs?v=3")`, "/y.mjs": `import("/x.js?v=1"); 1`, "/z.html": `<script src="/nope.js?v=4"></script>` };
  const V = createVersioner((u) => (files[u] != null ? Buffer.from(files[u]) : null));
  assert.match(V.content("/x.js").toString(), /\/y\.mjs\?v=[\w-]{10}"/);
  assert.equal(V.content("/z.html").toString(), files["/z.html"]);
  assert.equal(versionRefs(`"/a.png?v=1"`, () => "zz"), `"/a.png?v=1"`); // 그림은 대상 아님
});

test("public 의 모든 ?v= 참조는 있는 파일을 가리키고, 실제 index.html 은 해시로 나감", () => {
  const V = createVersioner(read);
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  const refs = [...html.matchAll(REF_RE)].map((m) => m[2]);
  assert.ok(refs.includes("/rt-forecast.js"));
  for (const r of refs) assert.ok(read(r), `없는 파일 참조: ${r}`);
  const out = V.content("/index.html").toString();
  assert.ok(out.includes(`/rt-forecast.js?v=${hashOf(V.content("/rt-forecast.js"))}"`));
});
