// 그래프 '크게 보기' 공통 컴포넌트(대시보드 그래프 + 날씨 통계 그래프가 함께 씀).
// - 그래프마다 ⤢ 버튼(주 동작). 터치 기기에서는 그래프를 두 번 톡 쳐도 열림(한 번 톡 = 기존 툴팁 그대로).
// - 모바일: 전체 화면(requestFullscreen) + 가로 고정(screen.orientation.lock, 안드로이드 크롬 등).
//   가로 고정이 안 되고(아이폰 사파리 등) 세로로 들고 있으면 겹친 화면 내용을 CSS 로 90° 돌려 가로 크기로 보여 준다.
// - 그래프는 겹친 화면 크기에 맞춰 다시 그린다(그림 확대 아님). 돌린 상태의 터치 좌표는 frac() 이 바꿔 준다.
// - 닫기: ✕ · 뒤로 가기(history) · Esc. 닫으면 전체 화면·가로 고정을 푼다. 데스크톱은 큰 모달.
// 엄격한 CSP 대비: 이 파일·chart-full.css 는 인라인 스크립트·style 속성을 쓰지 않는다(크기는 CSSOM 으로만 지정).
(function () {
  "use strict";
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let cur = null; // 열린 겹친 화면 상태

  // 그래프 안 버튼(그래프를 다시 그릴 때마다 innerHTML 에 넣는다)
  const button = (label = "크게 보기") => `<button type="button" class="cf-btn" data-cf-open="1" aria-label="그래프 ${label}" title="${label}">${ICON}<span>${label}</span></button>`;
  // host: 그래프를 담는 요소. spec: { title(), sub(), legend() → Node|문자열|null, source(), render(el, { width, height }), hostClass }
  function register(host, spec) {
    host.__cf = spec;
    host.setAttribute("data-cf-host", "1");
  }
  // 포인터 위치 → 요소 안 가로 위치 비율(0~1). 돌린 화면(.cf-rot, 시계 방향 90°)에서는 요소의 가로축이 화면의 세로축이다.
  function frac(ev, el) {
    const r = el.getBoundingClientRect();
    if (el.closest(".cf-rot")) return r.height ? (ev.clientY - r.top) / r.height : 0;
    return r.width ? (ev.clientX - r.left) / r.width : 0;
  }
  const coarse = () => !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const isMobile = () => coarse() || window.innerWidth < 700;
  const portrait = () => window.innerHeight > window.innerWidth;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const put = (box, v) => {
    box.textContent = "";
    if (!v) return;
    if (typeof v === "string") box.innerHTML = v;
    else box.appendChild(v);
  };

  async function open(host) {
    const spec = host && host.__cf;
    if (!spec || cur) return;
    const mobile = isMobile();
    const ov = el("div", `cf-overlay${mobile ? " cf-mobile" : " cf-desk"}`);
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "cfTitle");
    const stage = el("div", "cf-stage");
    const head = el("div", "cf-head");
    const tbox = el("div", "cf-titles");
    const h = el("h2", "cf-title", spec.title ? spec.title() : "그래프");
    h.id = "cfTitle";
    tbox.appendChild(h);
    const subText = spec.sub ? spec.sub() : "";
    if (subText) tbox.appendChild(el("p", "cf-sub", subText));
    const close = el("button", "cf-close");
    close.type = "button";
    close.setAttribute("aria-label", "크게 보기 닫기");
    close.textContent = "✕";
    head.append(tbox, close);
    const body = el("div", "cf-body");
    const chartEl = el("div", `cf-chart ${spec.hostClass || ""}`);
    body.appendChild(chartEl);
    const foot = el("div", "cf-foot");
    const leg = el("div", "cf-legend");
    put(leg, spec.legend ? spec.legend() : null);
    foot.appendChild(leg);
    const src = spec.source ? spec.source() : "";
    if (src) foot.appendChild(el("p", "cf-src", src));
    stage.append(head, body, foot);
    ov.appendChild(stage);
    document.body.appendChild(ov);
    document.documentElement.classList.add("cf-lock");
    cur = { host, spec, ov, stage, body, chartEl, mobile, locked: false, full: false, prevFocus: document.activeElement, closing: false, w: 0, h: 0 };
    const state = cur;
    try {
      history.pushState({ cf: 1 }, "");
      state.pushed = true;
    } catch {}
    state.onPop = () => closeView(true);
    state.onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeView(false);
      }
    };
    state.onResize = () => {
      clearTimeout(state.rt);
      state.rt = setTimeout(() => layout(state), 80);
    };
    state.onFs = () => {
      // 사용자가 전체 화면을 직접 끝냄(안드로이드 뒤로 가기 등) → 겹친 화면도 닫는다
      if (state.full && !document.fullscreenElement && !state.closing) closeView(false);
    };
    window.addEventListener("popstate", state.onPop);
    document.addEventListener("keydown", state.onKey);
    window.addEventListener("resize", state.onResize);
    window.addEventListener("orientationchange", state.onResize);
    document.addEventListener("fullscreenchange", state.onFs);
    close.addEventListener("click", () => closeView(false));
    ov.addEventListener("click", (e) => {
      if (e.target === ov && !mobile) closeView(false); // 데스크톱: 바깥 클릭으로 닫기
    });
    if (mobile) {
      // 사용자 동작(탭) 안에서 바로 요청해야 한다
      try {
        if (ov.requestFullscreen) {
          await ov.requestFullscreen({ navigationUI: "hide" });
          state.full = true;
        }
      } catch {}
      try {
        if (state.full && screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
          state.locked = true;
        }
      } catch {}
    }
    if (cur !== state) return;
    layout(state);
    close.focus({ preventScroll: true });
  }
  // 돌릴지 정하고 무대 크기를 잡은 뒤 그래프를 그 크기로 다시 그린다
  function layout(state) {
    if (cur !== state) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rot = state.mobile && !state.locked && vh > vw;
    state.ov.classList.toggle("cf-rot", rot);
    state.rotated = rot;
    const s = state.stage.style;
    if (rot) {
      s.width = `${vh}px`;
      s.height = `${vw}px`;
      s.transform = `translateX(${vw}px) rotate(90deg)`;
    } else if (state.mobile) {
      s.width = `${vw}px`;
      s.height = `${vh}px`;
      s.transform = "";
    } else {
      s.width = "";
      s.height = "";
      s.transform = "";
    }
    const w = Math.floor(state.body.clientWidth);
    const h = Math.floor(state.body.clientHeight);
    if (!w || !h || (w === state.w && h === state.h)) return;
    state.w = w;
    state.h = h;
    state.spec.render(state.chartEl, { width: w, height: Math.max(160, h) });
  }
  async function closeView(fromPop) {
    const state = cur;
    if (!state || state.closing) return;
    state.closing = true;
    cur = null;
    window.removeEventListener("popstate", state.onPop);
    document.removeEventListener("keydown", state.onKey);
    window.removeEventListener("resize", state.onResize);
    window.removeEventListener("orientationchange", state.onResize);
    document.removeEventListener("fullscreenchange", state.onFs);
    try {
      if (state.locked && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch {}
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch {}
    state.ov.remove();
    document.documentElement.classList.remove("cf-lock");
    if (!fromPop && state.pushed && history.state && history.state.cf) history.back();
    if (state.prevFocus && state.prevFocus.focus) state.prevFocus.focus({ preventScroll: true });
  }

  // 버튼 클릭 · 터치 두 번 톡(320ms 안, 30px 안) — 한 번 톡은 기존 툴팁 동작 그대로
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-cf-open]");
    if (!b) return;
    const host = b.closest("[data-cf-host]");
    if (host && !host.closest(".cf-overlay")) {
      e.preventDefault();
      open(host);
    }
  });
  let lastTap = null;
  document.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    const host = e.target.closest && e.target.closest("[data-cf-host]");
    if (!host || host.closest(".cf-overlay") || e.target.closest("[data-cf-open]") || !e.target.closest("svg")) {
      lastTap = null;
      return;
    }
    const now = Date.now();
    if (lastTap && lastTap.host === host && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      open(host);
      return;
    }
    lastTap = { host, t: now, x: e.clientX, y: e.clientY };
  });

  window.ChartFull = { button, register, open, close: () => closeView(false), frac, isOpen: () => !!cur, _state: () => cur };
})();
