// 좁은 화면·설치된 앱의 서랍 메뉴. ☰ 로 열고, 메뉴 고르기·배경 누르기·Esc·뒤로 가기로 닫음. 넓은 화면에선 아무것도 하지 않음.
(() => {
  const $ = (id) => document.getElementById(id);
  const mq = matchMedia("(max-width:800px)");
  const body = document.body;
  const aside = document.querySelector("aside");
  const nav = aside.querySelector("nav");
  const btn = $("abMenu");
  const bar = $("appbar");
  const bd = $("drBackdrop");
  const closeBtn = $("drClose");
  const exp = $("navExp");
  const wrap = document.querySelector(".wrap");
  let open = false;
  let pending = null;
  let fallback = 0;
  const focusables = () => [...aside.querySelectorAll("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null && !el.hidden);
  function syncExp() {
    const on = nav.classList.contains("sub-open");
    exp.setAttribute("aria-expanded", String(on));
    exp.setAttribute("aria-label", on ? "날씨 통계 하위 메뉴 접기" : "날씨 통계 하위 메뉴 펼치기");
  }
  function setOpen(v) {
    open = v;
    body.classList.toggle("drawer-open", v);
    btn.setAttribute("aria-expanded", String(v));
    wrap.inert = v;
    bar.inert = v;
    if (v) {
      aside.setAttribute("role", "dialog");
      aside.setAttribute("aria-modal", "true");
      aside.setAttribute("aria-label", "메뉴");
      nav.classList.toggle("sub-open", nav.classList.contains("stats-on"));
      syncExp();
      const cur = aside.querySelector("nav a[data-sub].active") || aside.querySelector("nav a[data-page].active:not(.nav-parent)") || closeBtn;
      cur.focus({ preventScroll: true });
      if (cur !== closeBtn) cur.scrollIntoView({ block: "nearest" });
    } else {
      aside.removeAttribute("role");
      aside.removeAttribute("aria-modal");
      aside.removeAttribute("aria-label");
      if (mq.matches) btn.focus({ preventScroll: true });
    }
  }
  function openDrawer() {
    if (open || !mq.matches) return;
    history.pushState({ ...(history.state || {}), nwDrawer: 1 }, "");
    setOpen(true);
  }
  // 서랍을 열 때 쌓은 기록 한 칸을 되돌린 뒤(then 은 그다음) — 뒤로 가기 한 번이 '서랍 닫기'가 되도록
  function closeDrawer(then) {
    if (!open) { if (then) then(); return; }
    if (history.state && history.state.nwDrawer) {
      pending = then || null;
      history.back();
      clearTimeout(fallback);
      fallback = setTimeout(() => { if (open) finish(); }, 600);
    } else {
      setOpen(false);
      if (then) then();
    }
  }
  function finish() {
    clearTimeout(fallback);
    setOpen(false);
    const t = pending;
    pending = null;
    if (t) t();
  }
  addEventListener("popstate", () => {
    if (open && !(history.state && history.state.nwDrawer)) finish();
  });
  btn.addEventListener("click", openDrawer);
  closeBtn.addEventListener("click", () => closeDrawer());
  bd.addEventListener("click", () => closeDrawer());
  exp.addEventListener("click", () => { nav.classList.toggle("sub-open"); syncExp(); });
  aside.addEventListener("click", (e) => {
    if (!open) return;
    const lo = e.target.closest("[data-dr-logout]");
    if (lo) { e.preventDefault(); closeDrawer(() => { const b = $("btnLogout"); if (b) b.click(); }); return; }
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const h = a.getAttribute("href");
    closeDrawer(() => { if (location.hash !== h) location.hash = h; });
  });
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
    if (e.key !== "Tab") return;
    const f = focusables();
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  });
  mq.addEventListener("change", () => { if (!mq.matches && open) closeDrawer(); });
  // 앱 막대 제목 = 페이지 제목
  const title = $("phTitle");
  const abTitle = $("abTitle");
  const syncTitle = () => { abTitle.textContent = title.textContent; };
  new MutationObserver(syncTitle).observe(title, { childList: true, characterData: true, subtree: true });
  syncTitle();
  // 로그인/로그아웃: 머리의 #phAuth 를 서랍에 그대로 비춤(로그아웃은 원래 버튼을 누름)
  const auth = $("phAuth");
  const drAuth = $("drAuth");
  const syncAuth = () => { drAuth.innerHTML = auth.hidden ? "" : auth.innerHTML.replace(/id="btnLogout"/g, 'data-dr-logout="1"'); };
  new MutationObserver(syncAuth).observe(auth, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  syncAuth();
  // 관리 메뉴: 서랍에서는 들어갈 수 있는(잠기지 않은) 메뉴가 하나라도 있을 때만
  const adm = nav.querySelector(".nav-group:not(.nav-main)");
  const syncAdm = () => {
    const usable = [...adm.querySelectorAll("a[data-page]")].some((a) => !a.hidden && !a.classList.contains("locked"));
    adm.classList.toggle("adm-none", !usable);
  };
  new MutationObserver(syncAdm).observe(adm, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  syncAdm();
  window.NWDrawer = { open: openDrawer, close: closeDrawer, isOpen: () => open };
})();
