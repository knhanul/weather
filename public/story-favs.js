// 자주 보는 날짜·배틀 조합(이 브라우저 localStorage 에만 저장 — 로그인·서버 저장 없음).
// nw.fav.day = [{ key, station, cal, m, d, leap, alias, at }] · nw.fav.battle = [{ key, cases, labels, period, to, from, ds, at }] — 최대 12개, 최근 저장이 앞
(() => {
  const MAX = 12;
  const K = { day: "nw.fav.day", battle: "nw.fav.battle" };
  const read = (kind) => { try { const v = JSON.parse(localStorage.getItem(K[kind]) || "[]"); return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string").slice(0, MAX) : []; } catch { return []; } };
  const write = (kind, list) => { try { localStorage.setItem(K[kind], JSON.stringify(list.slice(0, MAX))); return true; } catch { return false; } };
  const has = (kind, key) => read(kind).some((x) => x.key === key);
  function add(kind, item) { const list = read(kind).filter((x) => x.key !== item.key); list.unshift({ ...item, at: Date.now() }); return write(kind, list); }
  function remove(kind, key) { return write(kind, read(kind).filter((x) => x.key !== key)); }
  function toggle(kind, item) { if (has(kind, item.key)) { remove(kind, item.key); return false; } add(kind, item); return true; }
  const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // 빠른 선택 칩 HTML. label(item) → 글자, href(item) → 주소
  function chips(kind, { label, href, current }) {
    const list = read(kind);
    if (!list.length) return ""; // 빈 안내 문구는 두지 않음(☆ 버튼 title 에 설명)
    return list.map((x) => `<span class="fav-chip${x.key === current ? " on" : ""}"><a href="${E(href(x))}">${E(label(x))}</a><button type="button" class="fav-del" data-favdel="${E(x.key)}" data-favkind="${kind}" aria-label="${E(label(x))} 저장 지우기">×</button></span>`).join("");
  }
  window.StoryFavs = { read, add, remove, toggle, has, chips, MAX };
})();
