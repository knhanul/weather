// 기본 관측지점·기본 달. (1) 순수 계산(테스트용으로 NWDefaults 에 노출) (2) 저장: 지점 번호만(localStorage + 로그인 시 /api/station-pref)
// (3) 위치: 사용자가 버튼을 누를 때만 위치 권한을 묻고, 이미 허용된 경우에만 조용히 씀. 좌표·거리는 이 기기 메모리에서만 쓰고 저장·전송하지 않는다.
(() => {
  const G = typeof window !== "undefined" ? window : globalThis;
  // ---------------------------------------------------------------- 순수 계산
  const seoulParts = (d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day };
  };
  const seoulMonth = (d) => seoulParts(d).m;
  const seoulMd = (d) => { const p = seoulParts(d); return `${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
  const rad = (x) => (x * Math.PI) / 180;
  function distanceKm(lat1, lon1, lat2, lon2) {
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  // stations: [{station_id, latitude, longitude, enabled?}] → { id, km } | null
  function nearestStation(lat, lon, stations) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best = null;
    for (const s of stations || []) {
      if (s.enabled === false || !Number.isFinite(+s.latitude) || !Number.isFinite(+s.longitude) || s.latitude === null) continue;
      const km = distanceKm(lat, lon, +s.latitude, +s.longitude);
      if (!best || km < best.km) best = { id: String(s.station_id), km };
    }
    return best;
  }
  // 우선순위: 주소의 station > 저장한 선택(직접 고름 또는 위치로 고름) > 화면 기본값(서울 108)
  function pickStation({ url, stored, known, fallback = "108" }) {
    const ok = (id) => id != null && (!known || known.has(String(id)));
    if (ok(url)) return { id: String(url), source: "url" };
    if (stored && ok(stored.id)) return { id: String(stored.id), source: stored.why === "geo" ? "geo" : "saved" };
    if (ok(fallback)) return { id: String(fallback), source: "default" };
    const first = known && [...known][0];
    return first ? { id: first, source: "default" } : null;
  }
  const kmText = (km) => (km < 10 ? `${Math.max(0.1, Math.round(km * 10) / 10)}km` : `${Math.round(km)}km`);
  G.NWDefaults = { seoulParts, seoulMonth, seoulMd, distanceKm, nearestStation, pickStation, kmText };
  if (typeof document === "undefined") return; // node 테스트

  // ---------------------------------------------------------------- 저장(지점 번호만)
  const KEY = "nw.station";
  const ASK = "nw.geoAsk"; // 'dismissed' | 'denied' — 위치 안내를 다시 띄우지 않음
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 사생활 모드 */ } } };
  const readStored = () => { try { const v = JSON.parse(ls.get(KEY) || "null"); return v && /^\d{1,6}$/.test(String(v.id)) ? { id: String(v.id), why: v.why === "geo" ? "geo" : "manual", at: +v.at || 0 } : null; } catch { return null; } };
  const firstHashStation = new URLSearchParams((location.hash.split("?")[1] || "")).get("station");
  let locked = !!firstHashStation; // 주소에 지점이 있었으면 이번 방문에서는 자동으로 바꾸지 않음
  let lastGeo = null; // { id, km } — 이번 화면에서만
  let applyFn = null;
  const me = () => (G.NW && G.NW.me ? G.NW.me() : {});
  const serverOn = () => { const m = me(); return !!(m.authEnabled && m.loggedIn && m.role !== "blocked"); };
  function store(id, why) {
    ls.set(KEY, JSON.stringify({ id: String(id), why, at: Date.now() }));
    if (serverOn()) fetch("/api/station-pref", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ station: String(id) }) }).catch(() => {});
  }
  const NWStation = {
    stored: readStored,
    isLocked: () => locked,
    // 사용자가 지점을 직접 바꿈 → 저장하고 이번 방문 동안 위치로 바꾸지 않음
    manual(id) {
      if (!id) return;
      locked = true;
      lastGeo = null;
      const s = readStored();
      if (!s || s.id !== String(id) || s.why !== "manual") store(id, "manual");
      renderNote();
    },
    onApply(fn) { applyFn = fn; },
    // 로그인 후 내 계정의 지점(더 최근 것)을 반영
    async syncServer() {
      if (!serverOn()) return;
      try {
        const r = await fetch("/api/station-pref", { cache: "no-store" });
        if (!r.ok) return;
        const p = (await r.json()).pref;
        const s = readStored();
        if (p && p.station && (!s || Date.parse(p.updatedAt || 0) > s.at) && (!s || s.id !== p.station)) {
          ls.set(KEY, JSON.stringify({ id: p.station, why: "manual", at: Date.parse(p.updatedAt) || Date.now() }));
          if (!locked && applyFn) applyFn(p.station, "account");
        } else if (!p && s) store(s.id, s.why); // 이 기기에서 고른 것을 계정에도
      } catch { /* 저장은 다음에 */ }
    },
    page: null,
    routed(page) { NWStation.page = page; renderBanner(); renderNote(); },
  };
  G.NWStation = NWStation;

  // ---------------------------------------------------------------- 위치로 가까운 지점
  let stationsCache = null;
  async function stationList() {
    if (stationsCache) return stationsCache;
    const r = await fetch("/api/stations");
    stationsCache = (await r.json()).data || [];
    return stationsCache;
  }
  const nameOf = (id) => { const s = (stationsCache || (G.NW && G.NW.stations ? G.NW.stations() : []) || []).find((x) => String(x.station_id) === String(id)); return s ? s.station_name : ""; };
  function locate(interactive) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ error: "unsupported" });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (e) => resolve({ error: e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable" }),
        { enableHighAccuracy: false, timeout: interactive ? 10000 : 6000, maximumAge: 30 * 60000 },
      );
    });
  }
  async function useLocation(interactive) {
    if (interactive) setBanner("busy");
    const pos = await locate(interactive);
    if (pos.error) {
      if (pos.error === "denied") ls.set(ASK, "denied");
      if (interactive) setBanner(pos.error);
      return;
    }
    const near = nearestStation(pos.lat, pos.lon, await stationList()); // 좌표는 여기서 쓰고 버림
    if (!near) { if (interactive) setBanner("unavailable"); return; }
    lastGeo = near;
    const s = readStored();
    if (!s || s.id !== near.id || s.why !== "geo") store(near.id, "geo");
    hideBanner();
    if (!locked && applyFn) applyFn(near.id, "geo");
    renderNote();
  }
  async function permission() {
    try { return (await navigator.permissions.query({ name: "geolocation" })).state; } catch { return "prompt"; }
  }
  const STATION_PAGES = new Set(["dash", "questions", "hourly", "daily"]);
  let started = false;
  // 첫 화면 준비가 끝난 뒤 한 번: 권한이 이미 '허용'이면 조용히 위치 사용(직접 고른 지점이 없을 때), 아니면 안내 띄우기 판단
  async function start() {
    if (started) return;
    started = true;
    const s = readStored();
    if (!navigator.geolocation || (s && s.why === "manual")) return;
    const st = await permission();
    if (st === "granted") return void useLocation(false);
    if (st === "denied") ls.set(ASK, "denied");
    renderBanner();
  }
  NWStation.start = start;

  // ---------------------------------------------------------------- 안내 띠·알림(작게, 한 번)
  const $ = (id) => document.getElementById(id);
  let bannerState = null;
  function shouldOffer() {
    if (!started || locked || !navigator.geolocation || !STATION_PAGES.has(NWStation.page)) return false;
    if (ls.get(ASK)) return false;
    return !readStored();
  }
  function renderBanner() {
    const el = $("geoBanner");
    if (!el) return;
    if (bannerState && bannerState !== "offer") return;
    if (!shouldOffer()) { el.hidden = true; return; }
    setBanner("offer");
  }
  const MSG = {
    offer: "내 위치에서 가장 가까운 관측소를 기본으로 볼 수 있어요. 위치는 이 기기에서 거리 계산에만 쓰고 저장하거나 보내지 않습니다.",
    busy: "위치를 확인하는 중…",
    denied: "위치 사용이 허용되지 않았습니다. 기본 지점(서울 108)을 그대로 씁니다. 지점은 언제든 직접 고를 수 있습니다.",
    timeout: "위치를 확인하지 못했습니다(시간 초과). 기본 지점을 그대로 씁니다.",
    unavailable: "위치를 확인하지 못했습니다. 기본 지점을 그대로 씁니다.",
    unsupported: "이 브라우저는 위치 기능을 지원하지 않습니다.",
  };
  function setBanner(kind) {
    const el = $("geoBanner");
    if (!el) return;
    bannerState = kind;
    el.hidden = false;
    el.className = `geo-banner geo-${kind}`;
    const btns = kind === "offer"
      ? `<button type="button" class="geo-use" data-geo="use">내 위치로 가까운 지점 선택</button><button type="button" class="geo-x sec" data-geo="no">괜찮아요</button>`
      : kind === "busy" ? "" : kind === "timeout" || kind === "unavailable" ? `<button type="button" class="geo-use sec" data-geo="use">다시 시도</button><button type="button" class="geo-x sec" data-geo="no">닫기</button>` : `<button type="button" class="geo-x sec" data-geo="no">닫기</button>`;
    el.innerHTML = `<span class="geo-ico" aria-hidden="true">📍</span><span class="geo-txt">${MSG[kind]}</span>${btns ? `<span class="geo-btns">${btns}</span>` : ""}`;
  }
  function hideBanner() { const el = $("geoBanner"); if (el) { el.hidden = true; el.innerHTML = ""; } bannerState = "done"; }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-geo]");
    if (!b) return;
    if (b.dataset.geo === "use") { useLocation(true); return; }
    if (b.dataset.geo === "no") { if (bannerState === "offer") ls.set(ASK, "dismissed"); hideBanner(); }
    if (b.dataset.geo === "note-x") { const n = $("geoNote"); if (n) n.hidden = true; noteHidden = true; }
  });
  let noteHidden = false;
  // 지금 화면 지점이 위치로 고른 지점이면 이유를 보여 줌(거리는 이번에 위치를 확인했을 때만)
  function renderNote() {
    const el = $("geoNote");
    if (!el) return;
    const s = readStored();
    const cur = NWStation.current ? NWStation.current() : null;
    const show = !noteHidden && s && s.why === "geo" && STATION_PAGES.has(NWStation.page) && (!cur || cur === s.id);
    if (!show) { el.hidden = true; return; }
    const nm = nameOf(s.id);
    const label = `${nm || "관측소"}(${s.id})`;
    el.innerHTML = `<span class="geo-ico" aria-hidden="true">📍</span><span>${lastGeo && lastGeo.id === s.id ? `현재 위치에서 가장 가까운 관측소: <b>${label}</b>, 약 ${kmText(lastGeo.km)}` : `위치로 고른 기본 관측소: <b>${label}</b>`} · 다른 지점을 고르면 그 지점이 기본이 됩니다.</span><button type="button" class="geo-x" data-geo="note-x" aria-label="알림 닫기">✕</button>`;
    el.hidden = false;
    if (!nm) stationList().then(() => nameOf(s.id) && renderNote()).catch(() => {});
  }
  NWStation.renderNote = renderNote;
})();
