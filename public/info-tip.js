// ⓘ 근거 펼치기(공용): 화면에는 짧은 기간·범위 꼬리표만 두고, 산출 방법·기준·결측 처리 같은 긴 설명은 ⓘ 를 눌렀을 때만 보여 줌.
// 쓰는 법(템플릿 문자열 안에서, 인자는 이미 이스케이프된 HTML):
//   InfoTip.note("1970년~ · 서울(108)", "긴 설명…", { cls: "rt-note" })  → <p> 한 줄 + ⓘ
//   InfoTip.sub("최근 10년", "긴 설명…")                                  → 제목 옆 <small> + ⓘ
//   InfoTip.btn("긴 설명…", { label: "산출 기준" })                        → 이미 있는 줄 끝에 붙이는 ⓘ 만
// 펼친 설명은 그 줄 바로 아래에 열림(모바일에서도 화면 밖으로 나가지 않음). 한 번에 하나만 열림, Esc·바깥 누르기로 닫힘.
(() => {
  let seq = 0;
  const OPEN = new Set();
  const btn = (detail, o = {}) => {
    if (detail == null || String(detail).trim() === "") return "";
    const id = `itp${++seq}`;
    const label = o.label || "산출 기준";
    return `<button type="button" class="it-btn" aria-expanded="false" aria-controls="${id}" aria-label="${label} 자세히 보기" title="${label}"><span aria-hidden="true">ⓘ</span></button><span class="it-pop" id="${id}" role="note" hidden>${detail}</span>`;
  };
  const tagHtml = (tag) => (tag ? `<span class="it-tag">${tag}</span>` : "");
  const note = (tag, detail, o = {}) => `<p class="it-note${o.cls ? ` ${o.cls}` : ""}"${o.id ? ` id="${o.id}"` : ""}>${tagHtml(tag)}${btn(detail, o)}</p>`;
  // 서버가 준 설명 문장(이미 이스케이프된 것): 짧으면 그대로, 길면 첫 마디(" — "·". " 앞)만 꼬리표로 두고 전체는 ⓘ 안에
  const cut = (t, max) => {
    for (const sep of [" — ", ". ", "다. ", "; "]) { const i = t.indexOf(sep); if (i > 0 && i <= max) return t.slice(0, i + (sep === "다. " ? 1 : 0)); }
    return "";
  };
  const auto = (text, o = {}) => {
    const t = String(text ?? "").trim();
    if (!t) return "";
    const max = o.max || 48;
    const plain = t.replace(/<[^>]*>/g, "");
    if (plain.length <= max && !/<[a-z]/i.test(t)) return `<p class="${o.cls || "it-note"}">${t}</p>`;
    return note(o.tag ?? cut(t, Math.max(max, 64)), t, o);
  };
  const sub = (tag, detail, o = {}) => `<small class="it-sub${o.cls ? ` ${o.cls}` : ""}">${tagHtml(tag)}${btn(detail, o)}</small>`;

  const popOf = (b) => document.getElementById(b.getAttribute("aria-controls"));
  function close(b, focus) {
    if (!b) return;
    b.setAttribute("aria-expanded", "false");
    const p = popOf(b);
    if (p) p.hidden = true;
    OPEN.delete(b);
    if (focus && b.isConnected) b.focus();
  }
  function closeAll(except) { for (const b of [...OPEN]) if (b !== except) close(b); }
  function open(b) {
    closeAll(b);
    const p = popOf(b);
    if (!p) return;
    p.hidden = false;
    b.setAttribute("aria-expanded", "true");
    OPEN.add(b);
  }
  function toggle(b) { (b.getAttribute("aria-expanded") === "true" ? close : open)(b); }

  if (typeof document !== "undefined") {
    // 잡기 단계: 줄 전체를 누르면 반응하는 목록·링크 카드 안에서도 ⓘ 만 열리고 그 줄은 반응하지 않게
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".it-btn");
      if (b) { e.preventDefault(); e.stopPropagation(); toggle(b); return; }
      const inPop = e.target.closest && e.target.closest(".it-pop");
      if (inPop) { if (!e.target.closest("a")) { e.stopPropagation(); if (inPop.closest("a")) e.preventDefault(); } return; }
      for (const x of [...OPEN]) if (!x.isConnected) OPEN.delete(x);
      if (OPEN.size) closeAll();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !OPEN.size) return;
      const live = [...OPEN].filter((x) => x.isConnected);
      closeAll();
      if (live[0]) { live[0].focus(); e.stopPropagation(); }
    }, true);
    // 화면이 바뀌면 열린 설명은 닫음
    window.addEventListener("hashchange", () => closeAll());
  }
  // 정적 HTML: data-it-tag="짧은 꼬리표" 를 단 요소는 원래 내용을 ⓘ 안으로 옮기고 꼬리표만 보이게(한 번만)
  function upgrade(root = document) {
    for (const el of root.querySelectorAll("[data-it-tag]:not([data-it-done])")) {
      el.setAttribute("data-it-done", "");
      el.innerHTML = `${tagHtml(el.getAttribute("data-it-tag"))}${btn(el.innerHTML.trim(), { label: el.getAttribute("data-it-label") || undefined })}`;
    }
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => upgrade());
    else upgrade();
  }
  const api = { btn, note, sub, auto, upgrade, closeAll, _open: OPEN };
  if (typeof window !== "undefined") window.InfoTip = api;
})();
