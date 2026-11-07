// Shared WEB/mobile renderer. Values and decisions come from the read-only context API.
const E = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const fmt = (v, u = "℃") => (Number.isFinite(v) ? `${v.toFixed(1)}${u}` : "자료 없음");
const sg = (v, u = "℃") =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}${u}` : "비교 불가";
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const terms = [
  "초복",
  "중복",
  "말복",
  "소한",
  "대한",
  "입춘",
  "우수",
  "경칩",
  "춘분",
  "청명",
  "곡우",
  "입하",
  "소만",
  "망종",
  "하지",
  "소서",
  "대서",
  "입추",
  "처서",
  "백로",
  "추분",
  "한로",
  "상강",
  "입동",
  "소설",
  "대설",
  "동지",
];
const labels = {
  warmer: "더 따뜻한 날",
  cooler: "더 선선한 날",
  dry: "비가 적은 날",
  calm: "바람이 약한 날",
};
function style() {
  if (document.getElementById("wc-style")) return;
  const s = document.createElement("style");
  s.id = "wc-style";
  s.textContent = `
.wc{color:#1f2937;background:#fff;border:1px solid #dce6ec;border-radius:18px;padding:16px;margin:12px 0;min-width:0;line-height:1.6;font-size:14px;overflow-wrap:anywhere}.wc h2{margin:0 0 6px;font-size:19px;line-height:1.4}.wc h3{font-size:16px;margin:12px 0 4px}.wc p{margin:6px 0}.wc small,.wc .wc-note{color:#536477;font-size:12px}.wc .wc-lead{font-size:18px;font-weight:700;color:#164e63}.wc details{margin-top:10px}.wc summary{cursor:pointer;font-weight:600;min-height:36px}.wc .wc-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:10px 0}.wc label{display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0}.wc input,.wc select,.wc button{font:inherit;color:inherit;border:1px solid #c4d3dd;border-radius:9px;background:#fff;padding:9px;min-height:42px;max-width:100%;box-sizing:border-box}.wc input[type=date]{width:155px}.wc button{cursor:pointer;background:#eff7fb;font-weight:600}.wc button[type=submit]{background:#164e63;color:#fff}.wc fieldset{border:0;padding:0;margin:8px 0}.wc legend{font-weight:600;font-size:13px}.wc .wc-criteria{display:flex;flex-wrap:wrap;gap:8px}.wc .wc-check{flex-direction:row;align-items:center;border:1px solid #dce6ec;border-radius:12px;padding:3px 8px;min-height:40px}.wc input[type=checkbox]{min-height:20px;width:18px;height:18px;accent-color:#164e63}.wc .wc-result{border-top:1px solid #e2e8f0;padding-top:8px}.wc .wc-row{padding:10px 0;border-bottom:1px solid #edf2f7}.wc .wc-row strong{display:block;color:#164e63}.wc table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}.wc th,.wc td{padding:7px 3px;text-align:left;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}.wc .wc-scroll{max-height:340px;overflow:auto}.wc svg{width:100%;height:auto;display:block}.wc .wc-error{color:#9f1239}.wc a{color:#075985;text-decoration:underline}.wc [hidden]{display:none!important}@media(min-width:700px){.wc{padding:20px}.wc .wc-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
`;
  document.head.append(s);
}
// Bounded resolved-response cache: no rejected or partial requests are cached.
// Each panel has one cancellable request; repeat opens do not refetch all years.
const responseCache = new Map();
let cachedBytes = 0;
const MAX_CACHE_BYTES = 1024 * 1024;
const get = async (path, signal) => {
  const hit = responseCache.get(path);
  if (hit && hit.until > Date.now() && !signal?.aborted) return hit.value;
  if (hit) {
    responseCache.delete(path);
    cachedBytes -= hit.bytes;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 15000);
  try {
    const r = await fetch(path, { signal: controller.signal });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.message || "자료를 불러오지 못했어요");
    if (controller.signal.aborted) throw new DOMException("조회 취소", "AbortError");
    const bytes = JSON.stringify(d).length * 2;
    const ttl =
      path === "/api/stations"
        ? 1800000
        : path.startsWith("/api/stats/context-today?")
          ? 30000
          : path.startsWith("/api/stats/context-season?")
          ? 600000
          : 60000;
    if (bytes <= MAX_CACHE_BYTES) {
      // Concurrent panels can request the same metadata URL before either resolves.
      const previous = responseCache.get(path);
      if (previous) {
        cachedBytes -= previous.bytes;
        responseCache.delete(path);
      }
      while (responseCache.size >= 64 || cachedBytes + bytes > MAX_CACHE_BYTES) {
        const first = responseCache.keys().next().value;
        cachedBytes -= responseCache.get(first).bytes;
        responseCache.delete(first);
      }
      responseCache.set(path, { value: d, bytes, until: Date.now() + ttl });
      cachedBytes += bytes;
    }
    return d;
  } catch (error) {
    if (timedOut) throw new Error("조회가 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
};
const table = (heads, rows) =>
  `<div class="wc-scroll"><table><thead><tr>${heads.map((h) => `<th scope="col">${E(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${E(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
export function lineChart(points) {
  const vals = points.flatMap((p) => [p.today, p.yesterday]).filter(Number.isFinite);
  if (!vals.length) return "<p>기온 그래프 자료 없음</p>";
  const lo = Math.floor(Math.min(...vals) - 1),
    hi = Math.ceil(Math.max(...vals) + 1),
    x = (h) => 35 + (h / 23) * 470,
    y = (v) => 150 - ((v - lo) / (hi - lo)) * 120;
  const paths = (k) => {
    let d = "";
    return points
      .map((p) => {
        if (!Number.isFinite(p[k])) {
          d = "";
          return "";
        }
        const seg = `${d ? "L" : "M"}${x(p.hour).toFixed(1)},${y(p[k]).toFixed(1)}`;
        d = "L";
        return seg;
      })
      .join(" ");
  };
  return `<p class="wc-note">파랑 오늘 · 회색 어제 / 정시 기온(℃) · 빈 시각은 선을 끊어요</p><svg viewBox="0 0 530 180" role="img" aria-label="오늘과 어제의 정시 관측 기온. 아래 표에서 값을 확인할 수 있습니다."><text x="0" y="28" font-size="12">${hi}℃</text><text x="0" y="153" font-size="12">${lo}℃</text><path d="${paths("yesterday")}" fill="none" stroke="#94a3b8" stroke-width="2"/><path d="${paths("today")}" fill="none" stroke="#0369a1" stroke-width="3"/>${points.flatMap((p) => ["yesterday", "today"].filter((k) => Number.isFinite(p[k])).map((k) => `<circle cx="${x(p.hour)}" cy="${y(p[k])}" r="2" fill="${k === "today" ? "#0369a1" : "#94a3b8"}"/>`)).join("")}<text x="35" y="174" font-size="12">0시</text><text x="265" y="174" font-size="12">12시</text><text x="480" y="174" font-size="12">23시</text></svg>`;
}
function recentHtml(d) {
  const headline =
    d.diff === null
      ? "어제 같은 시각과 비교할 자료가 없어요"
      : Math.abs(d.diff) < 0.05
        ? "어제 같은 시각과 기온이 같아요"
        : `어제 같은 시각보다 ${fmt(Math.abs(d.diff))} ${d.diff > 0 ? "높아요" : "낮아요"}`;
  return `<p class="wc-lead">${E(headline)}</p><p>${E(d.message)} · ${E(d.station.name)}</p><p class="wc-note">${E(d.source)}${d.grid ? ` (${d.grid.nx},${d.grid.ny}) · ${E(d.grid.note)}` : ""}</p>${d.available ? `<p>오늘 ${fmt(d.value)} / 어제 ${fmt(d.previous)}</p>` : ""}${d.recent7.computed === false ? '<p>기준 실황 시각이 없어 최근 7일 비교는 아직 계산하지 않았어요.</p>' : `<p>최근 7일 같은 시각 평균 ${fmt(d.recent7.mean)} · ${d.recent7.days}/7일 · 오늘과 ${sg(d.recent7.diff)}</p>`}${d.extras.map((x) => `<p>${E(x.label)} 어제보다 ${sg(x.diff, x.unit)}</p>`).join("")}<details><summary>비교 근거·시간별 그래프 보기</summary>${lineChart(d.series)}${table(
    ["시각(KST)", "오늘(℃)", "어제(℃)"],
    d.series.map((p) => [`${p.hour}시`, fmt(p.today), fmt(p.yesterday)]),
  )}<h3>최근 완료일 ASOS 최고·최저 (별도 자료)</h3><p class="wc-note">${E(d.dailySource || "기상청 ASOS 공식 일자료")}</p>${table(
    ["날짜", "최고", "최저"],
    d.recentDays.map((p) => [p.date, fmt(p.max), fmt(p.min)]),
  )}<p class="wc-note">${E(d.policy)}</p><p class="wc-note">${E(d.thresholds)}</p><p class="wc-note">${d.recent7.computed === false ? "오늘 실황 시각 미정은 과거 자료가 0일이라는 뜻이 아닙니다." : `최근 7일 비교는 관측 ${d.recent7.days}/7일이며 없는 날은 0으로 세지 않아요.`}</p>${d.precipitation ? `<p class="wc-note">${E(d.precipitation.note)} 강수 원문: 오늘 ${E(d.precipitation.today.text || "자료 없음")} / 어제 ${E(d.precipitation.yesterday.text || "자료 없음")}</p>` : ""}${d.latestTemperatureTime ? `<p class="wc-note">이 격자의 최신 유효 기온 ${E(d.latestTemperatureTime)} KST</p>` : ""}</details>`;
}
function battleHtml(d) {
  return `<p>${E(d.station.name)} · 기준 ${E(d.date1)} / 상대 ${E(d.date2)}${d.window ? `의 월·일 · ${d.window.expected ? `${d.window.fromYear}~${d.window.toYear}년` : "비교 가능한 과거 연도 없음"}` : ""}</p><p class="wc-note">${E(d.kind)} · ${E(d.fieldNote)}</p>${d.rows.map((r) => `<div class="wc-row"><b>${E(r.label)}</b><p>기준 ${fmt(r.a, r.unit)} / 상대 ${fmt(r.b, r.unit)}${d.window ? ` (관측 ${r.samples}/${d.window.expected}개 해${r.samples < 3 ? " · 소표본 참고" : ""})` : ""}</p><strong>${E(r.reason)}</strong><small>무승부 기준: 차이 ${r.tie}${E(r.unit)} 이하</small></div>`).join("")}<p class="wc-note">선택한 항목 결과: 기준 ${d.wins.A}승 / 상대 ${d.wins.B}승 · 무승부 ${d.wins.draw} · 비교 불가 ${d.wins.unavailable}</p><details><summary>비교 기준·보유 범위</summary><p>${E(d.policy)}</p><p>${E(d.available.kind || "일자료")} 보유 범위: ${E(d.available.first || "없음")} ~ ${E(d.available.last || "없음")} (사이 결측 가능). 전체·5년·10년은 이 범위 안 관측만 사용해요.</p></details>`;
}
const sample = (s) =>
  `${fmt(s.mean)} (관측 ${s.days}/${s.expected}일${s.days < s.expected ? " · 불완전" : ""})`;
function seasonHtml(d) {
  const s = d.selected,
    h = d.history;
  return `<h3>${E(d.question)}</h3><p class="wc-lead">${E(d.name)} ${E(s.date)} · ${E(d.station.name)}</p><p>${d.thisYear ? "올해" : "선택한 해"} 일평균 ${fmt(s.value)} / 앞뒤 7일 ${sample(s.adjacent)}</p><p>주변보다 ${sg(s.diff)}${s.adjacent.days < s.adjacent.expected ? " · 주변 자료가 덜 모여 잠정 비교예요" : ""}</p><p>직전 7일 ${sample(s.before)} → 이후 7일 ${sample(s.after)} (변화 ${sg(s.change)})</p>${s.summer ? `<p>그해 여름(6~8월) 일평균 ${sample(s.summer)} · 복날과 ${sg(s.summer.diff)}</p>` : ""}${s.firstFreeze ? `<p>가을부터 첫 영하 관측: ${E(s.firstFreeze.date || (s.firstFreeze.days ? "관측된 범위에서 아직 없음" : "자료 없음"))} (일최저 관측 ${s.firstFreeze.days}/${s.firstFreeze.expected}일)</p><small>${E(s.firstFreeze.note)}</small>` : ""}${s.laterCold ? `<p>입춘 다음 30일: 영하 ${s.laterCold.daysBelowZero === null ? "일수 자료 없음" : `${s.laterCold.daysBelowZero}일 (관측된 날 중)`} / 최저 관측 ${s.laterCold.days}/${s.laterCold.expected}일</p>` : ""}${s.winter ? `<p>동지 일최저 ${fmt(s.winter.value)} / 겨울 최저 ${fmt(s.winter.min)} (${s.winter.dates.map(E).join(" · ") || "자료 없음"})</p><small>${E(s.winter.note)} 관측 ${s.winter.days}/${s.winter.expected}일</small>` : ""}<h3>여러 해에도 그랬을까?</h3><p>${h.eligibleYears === 0 ? "완료된 과거 연도 관측 없음 ·" : `${h.from}~${h.to}년 중`} 완전한 ${h.years}개 해: 주변 대비 평균 차이 ${sg(h.meanDiff)} · 제외 ${h.excluded}개 해</p><details><summary>해마다 결과·날짜 계산 근거</summary>${table(
    ["연도·실제 날짜", "일평균", "주변 대비"],
    d.points
      .slice()
      .reverse()
      .map((p) => [p.date, fmt(p.value), p.adjacent.days === 14 ? sg(p.diff) : "주변 자료 부족"]),
  )}<p class="wc-note">${E(d.policy)}</p><p class="wc-note">보유 ${E(d.available.first || "없음")} ~ ${E(d.available.last || "없음")}</p><p class="wc-note">${E(d.calendar.method)}</p>${d.calendar.links.map((a, i) => `<a href="${E(a)}" target="_blank" rel="noopener noreferrer">날짜 계산 출처 ${i + 1}</a>`).join(" · ")}</details>`;
}
export function mountWeatherContext(
  root,
  { mode = "today", station = "108", compact = false } = {},
) {
  style();
  let stopped = false,
    firstBattle = true,
    request = 0,
    abort = null;
  const date = todayKst(),
    year = +date.slice(0, 4),
    defaultTerm =
      +date.slice(5, 7) <= 3
        ? "입춘"
        : +date.slice(5, 7) <= 8
          ? "초복"
          : +date.slice(5, 7) <= 11
            ? "입동"
            : "동지";
  root.classList.add("wc");
  root.dataset.noCarouselSwipe = "true";
  root.innerHTML = `<h2>${{ today: "어제와 최근 날씨에 비하면", battle: "내 기준으로 날씨 배틀", season: "절기·복날 날씨 이야기" }[mode]}</h2>${
    mode === "today"
      ? ""
      : `<form class="wc-form"><div class="wc-controls"><label>관측소<select name="station"><option value="${E(station)}">${E(station)}</option></select></label>${mode === "battle" ? `<label>기준 날짜<input type="date" name="date1" value="${date}" min="1970-01-01" max="${date}" required></label><label>비교 상대<select name="opponent"><option value="yesterday">어제 (기준일 전날)</option><option value="week">지난주 같은 요일</option><option value="year">작년 같은 날</option><option value="custom">직접 고른 날짜</option></select></label><label class="wc-custom" hidden>상대 날짜<input type="date" name="date2" min="1970-01-01" max="${date}" value="${date}"></label><label>비교 기간<select name="period"><option value="exact">그날 실제 관측</option><option value="recent5">최근 5년 같은 월·일</option><option value="recent10">최근 10년 같은 월·일</option><option value="all">보유 전체 같은 월·일</option></select></label>` : `<label>절기·복날<select name="name">${terms.map((t) => `<option${t === defaultTerm ? " selected" : ""}>${E(t)}</option>`).join("")}</select></label><label>연도<input name="year" type="number" min="1970" max="${year}" value="${year}" required></label>`}</div>${
          mode === "battle"
            ? `<fieldset><legend>무엇이 이기는 날인가요? (복수 선택)</legend><div class="wc-criteria">${Object.entries(
                labels,
              )
                .map(
                  ([k, v]) =>
                    `<label class="wc-check"><input type="checkbox" name="criteria" value="${k}"${k === "warmer" ? "" : " checked"}>${E(v)}</label>`,
                )
                .join("")}</div></fieldset>`
            : ""
        }<button type="submit">${mode === "battle" ? "배틀 결과 보기" : "이야기 보기"}</button>${mode === "battle" ? '<button type="button" class="wc-last" hidden>최근 완료 관측일로 비교</button>' : ""}</form>`
  }<div class="wc-result" role="status" aria-live="polite">관측 자료를 확인하는 중…</div>`;
  const out = root.querySelector(".wc-result"),
    form = root.querySelector("form");
  async function load() {
    const seq = ++request;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    out.setAttribute("aria-busy", "true");
    out.textContent = "관측 자료를 확인하는 중…";
    const q = form ? new URLSearchParams(new FormData(form)) : new URLSearchParams({ station });
    if (mode === "today") q.set("basis", "grid-v1"); // Separate browser/proxy cache key from the retired ASOS-only contract.
    const initializingBattle = mode === "battle" && firstBattle;
    if (initializingBattle) {
      q.delete("date1");
      firstBattle = false;
    }
    if (mode === "battle") {
      const selected = q.getAll("criteria");
      q.delete("criteria");
      q.set("criteria", selected.join(","));
      if (!selected.length) {
        out.textContent = "승리 조건을 하나 이상 골라 주세요.";
        out.removeAttribute("aria-busy");
        return;
      }
    }
    try {
      const d = await get(`/api/stats/context-${mode}?${q}`, signal);
      if (stopped || seq !== request) return;
      out.innerHTML =
        mode === "today" ? recentHtml(d) : mode === "battle" ? battleHtml(d) : seasonHtml(d);
      if (mode === "battle") {
        if (initializingBattle) form.elements.date1.value = d.date1;
        const last = form.querySelector(".wc-last");
        const lastCompleted =
          d.available.lastCompleted ?? (d.available.kind === "시간자료" ? null : d.available.last);
        if (lastCompleted) {
          last.hidden = false;
          last.onclick = () => {
            form.elements.date1.value = lastCompleted;
            load();
          };
        }
        const hasHistory = d.available.first && +d.available.first.slice(0, 4) < year;
        for (const option of form.querySelectorAll("[name=period] option"))
          if (option.value !== "exact") option.disabled = !hasHistory;
        const from = d.available.first?.slice(0, 4),
          to = d.available.last?.slice(0, 4);
        const all = form.querySelector("[name=period] option[value=all]");
        all.textContent = `보유 전체${from && to ? ` (${from}~${to})` : ""} 같은 월·일`; // No invented coverage.
      }
    } catch (e) {
      if (stopped || seq !== request || e.name === "AbortError") return;
      out.innerHTML = `<p class="wc-error">${E(e.message)}</p><button type="button" class="wc-retry">다시 시도</button>`;
      out.querySelector(".wc-retry").onclick = load;
    } finally {
      if (seq === request) out.removeAttribute("aria-busy");
    }
  }
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      load();
    };
    const opponent = form.querySelector("[name=opponent]");
    if (opponent)
      opponent.onchange = () => {
        form.querySelector(".wc-custom").hidden = opponent.value !== "custom";
      };
    get("/api/stations")
      .then((d) => {
        if (stopped) return;
        const rows = Array.isArray(d) ? d : d.stations || [];
        const sel = form.querySelector("[name=station]");
        if (rows.length)
          sel.innerHTML = rows
            .map(
              (s) =>
                `<option value="${E(s.station_id)}"${String(s.station_id) === String(station) ? " selected" : ""}>${E(s.station_name)}</option>`,
            )
            .join("");
      })
      .catch(() => {});
  }
  load();
  return () => {
    stopped = true;
    abort?.abort();
    root.innerHTML = "";
  };
}
