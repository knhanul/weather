// 정적 파일 캐시 무효화: HTML·JS·CSS 안의 "/파일.js?v=…" 참조를 그 파일 내용의 해시로 바꿔 내보낸다.
// ?v= 가 붙은 응답은 1년 immutable 이라, 파일을 고치고 숫자를 안 올리면 이미 받은 브라우저는 옛 파일을 계속 쓴다
// (2026-10-19 내일 날씨: 새 서버 응답 + 옛 rt-forecast.js → "Cannot read properties of undefined (reading 'length')").
// 손으로 올리는 숫자는 그대로 둬도 되지만, 실제로 쓰이는 값은 늘 내용 해시라 고치면 반드시 새 주소가 된다.
import crypto from "node:crypto";

// 같은 사이트 절대경로 참조만: "/a/b.js?v=3", '/x.css?v=1', url(/y.css?v=2), import("/z.mjs?v=3")
export const REF_RE = /(["'(])(\/[A-Za-z0-9_\-./]+\.(?:js|mjs|css))\?v=[A-Za-z0-9_\-.]*/g;
export const REWRITE_EXT = new Set([".html", ".js", ".mjs", ".css"]);
export const hashOf = (buf) => crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 10);

// text 안의 참조를 versionOf(path) 로 바꿈. versionOf 가 null 이면(파일 없음) 원래 값을 그대로 둠
export function versionRefs(text, versionOf) {
  return text.replace(REF_RE, (all, q, p) => {
    const v = versionOf(p);
    return v ? `${q}${p}?v=${v}` : all;
  });
}

// readFile(urlPath) → Buffer|null. 참조한 파일도 먼저 바꾼 뒤 해시(story-share.js → share-card.mjs 처럼 이어진 경우 바깥도 바뀜).
export function createVersioner(readFile) {
  const memo = new Map(), busy = new Set();
  const extOf = (p) => (p.match(/\.[a-z]+$/) || [""])[0];
  function content(p) {
    if (memo.has(p)) return memo.get(p);
    const raw = readFile(p);
    if (!raw) { memo.set(p, null); return null; }
    let out = raw;
    if (REWRITE_EXT.has(extOf(p)) && !busy.has(p)) {
      busy.add(p);
      const t = raw.toString("utf8");
      const r = versionRefs(t, (q) => (q === p || busy.has(q) ? null : version(q)));
      busy.delete(p);
      if (r !== t) out = Buffer.from(r, "utf8");
    }
    memo.set(p, out);
    return out;
  }
  function version(p) { const c = content(p); return c ? hashOf(c) : null; }
  return { content, version };
}
