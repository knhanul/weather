// 엄격한 CSP(script-src 'self'; style-src 'self')에서 chart-full.js/css 가 위반 없이 동작하는지 확인하는 작은 서버+페이지.
// 실행: node scripts/e2e/csp-harness.mjs  (PORT 기본 8111) → scripts/e2e/chart-full.e2e.mjs 가 /csp.html 을 연다
import http from "node:http";
import fs from "node:fs";
const pub = new URL("../../public/", import.meta.url);
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/chart-full.css"><script src="/chart-full.js"></script><script src="/csp-test.js" defer></script></head>
<body><div class="card"><h2>테스트 그래프</h2><div id="host" class="sx-chart"></div><div class="sx-legend"><span><i class="sw"></i>범례</span></div></div></body></html>`;
// 외부 파일로만 스크립트를 둔다(인라인 금지)
const test = `(() => {
  window.__viol = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__viol.push(e.violatedDirective + " " + (e.blockedURI || "inline")));
  const host = document.getElementById("host");
  const draw = (el, W, H, full) => {
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '"><rect class="plot" x="0" y="0" width="' + W + '" height="' + H + '" fill="#eef4ff"/><line class="hv" x1="0" x2="0" y1="0" y2="' + H + '" stroke="#000" visibility="hidden"/></svg><div class="tip"></div>' + (full ? "" : ChartFull.button());
    const svg = el.querySelector("svg"), hv = svg.querySelector(".hv");
    svg.addEventListener("pointerdown", (ev) => { const x = ChartFull.frac(ev, el) * W; hv.setAttribute("x1", x); hv.setAttribute("x2", x); hv.setAttribute("visibility", "visible"); el.dataset.frac = (x / W).toFixed(3); });
  };
  draw(host, Math.max(200, host.clientWidth), 200, false);
  ChartFull.register(host, { hostClass: "sx-chart", title: () => "테스트", sub: () => "단위 ℃", legend: () => document.querySelector(".sx-legend").cloneNode(true), source: () => "자료: 테스트", render: (el, s) => draw(el, s.width, s.height, true) });
})();`;
http.createServer((req, res) => {
  const csp = { "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'" };
  if (req.url === "/csp.html") return res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...csp }), res.end(page);
  if (req.url === "/csp-test.js") return res.writeHead(200, { "content-type": "text/javascript", ...csp }), res.end(test);
  const f = req.url.split("?")[0];
  if (f === "/chart-full.js" || f === "/chart-full.css") return res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/css", ...csp }), res.end(fs.readFileSync(new URL("." + f, pub)));
  res.writeHead(404), res.end();
}).listen(+process.env.PORT || 8111, () => console.log("csp harness on", +process.env.PORT || 8111));
