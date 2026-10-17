// 새 이야기 규칙 모음(astra 3-2: H01·W01·T01·T02·R01·R02·R03·R04·S01·C01·N01·T03·L01) — 순수 함수.
// 입력 ctx 는 rt-api(실서비스)와 scripts/rt-story-backtest.mjs(지난 날 되돌려 보기)가 같은 모양으로 만든다:
//   { sid, nm, nowW: 'YYYY-MM-DD HH:MM', ymd, hour, hs(ASOS 시간), store(ASOS 일), lastDay(끝난 마지막 공식 일자료 날짜),
//     current: { time, hour, ta, hm, ws, rn1, pty, fresh } | null,
//     series: [{ time:'YYYY-MM-DD HH:00:00', ta, hm, ws, pty, sky, pop, kind:'obs'|'fcst', source, base, items }](시각순),
//     days: [{ date, max, min, maxSource, maxBase, minSource, minBase }](오늘·내일 예보), fcFresh }
// 수치는 모두 ASOS·기상청 예보 값과 그 분포에서만(지어내지 않음). 결측은 0 이 아님 — 비교를 못 하면 규칙이 '안 됨(사유)'.
import { derivedCompare, hourlyCompare, dailyCompare, MIN_SAMPLES_RANK, WINDOW_DAYS } from "./rt-baseline.mjs";
import { ymdToDn, dnToYmd, hval } from "./stats-engine.mjs";
import { STORY_RULES as SR, LIFE_VALUE as LV } from "./rt-story-rules.mjs";
import { render, describeDifference } from "./rt-story-templates.mjs";
import { timeValue, roundTo, slot2h } from "./rt-story-select.mjs";
import { elementInterval } from "./rt-forecast.mjs";

const r1 = (v) => Math.round(v * 10) / 10;
const pad = (n) => String(n).padStart(2, "0");
const fin = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
export const Uhi = (p) => (p == null ? null : Math.max(0, 2 * p - 1));
export const Ulo = (p) => (p == null ? null : Math.max(0, 1 - 2 * p));
export const U2 = (p) => (p == null ? null : 2 * Math.abs(p - 0.5));
const md = (ymd) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const dayWord = (d, today) => (d === today ? "오늘" : ymdToDn(d) - ymdToDn(today) === 1 ? "내일" : ymdToDn(d) - ymdToDn(today) === -1 ? "어제" : md(d));
const wallAdd = (w, h) => { const t = new Date(Date.parse(`${w.slice(0, 13).replace(" ", "T")}:00:00Z`) + h * 3600000).toISOString(); return `${t.slice(0, 10)} ${t.slice(11, 13)}:00:00`; };

// ---------------------------------------------------------------- 파생 분포용 값 읽기
const hAt = (hs, field, dn, h) => { const i = (dn - hs.base) * 24 + h; return i >= 0 && i < hs.n && hs.src[i] ? hval(hs[field], i) : NaN; };
const dAt = (store, field, dn) => { const i = dn - store.base; return i >= 0 && i < store.n && store.present[i] ? store[field][i] : NaN; };
// 연속 무강수·강수 일수, 7일 합(지점 일자료마다 한 번) — 결측일이 끼면 그 뒤로 이어지는 연속 길이는 모름(NaN)
const RUNS = new WeakMap();
export function rainRuns(store) {
  if (RUNS.has(store)) return RUNS.get(store);
  const n = store.n, dry = new Float64Array(n).fill(NaN), wet = new Float64Array(n).fill(NaN), sum7 = new Float64Array(n).fill(NaN);
  const ok = (i) => i >= 0 && store.present[i] && Number.isFinite(store.rain[i]);
  for (let i = 0; i < n; i++) {
    if (!ok(i)) continue;
    const r = store.rain[i];
    const prevOk = ok(i - 1);
    wet[i] = r >= 0.1 ? (prevOk ? wet[i - 1] + 1 : NaN) : 0;
    dry[i] = r < 0.1 ? (prevOk ? dry[i - 1] + 1 : NaN) : 0;
    let s = 0, all = true;
    for (let j = i - 6; j <= i; j++) { if (!ok(j)) { all = false; break; } s += store.rain[j]; }
    if (all) sum7[i] = r1(s);
  }
  const v = { dry, wet, sum7 };
  RUNS.set(store, v);
  return v;
}
// 지금 이어지는 연속(끝난 마지막 날까지): 결측에서 끊기면 '확인된 최소 n일'(broken)
function currentRun(store, lastDn, wetSide) {
  let n = 0;
  for (let dn = lastDn; ; dn--) {
    const v = dAt(store, "rain", dn);
    if (!Number.isFinite(v)) return { n, broken: true };
    if (wetSide ? v < 0.1 : v >= 0.1) return { n, broken: false };
    n++;
  }
}

// 분포 비교의 공통 사실(3-1): p, N, U, 범위 밖
function distFacts(c, { side = "both", observed = true } = {}) {
  if (!c || c.p == null) return null;
  const U = side === "hi" ? Uhi(c.p) : side === "lo" ? Ulo(c.p) : U2(c.p);
  const out = observed && c.newHigh ? "high" : observed && c.newLow ? "low" : null;
  return { p: c.p, N: c.samples, U, p10: c.p10 ?? null, p90: c.p90 ?? null, pct: c.percentile, hiPct: r1(100 - c.percentile), loPct: c.percentile, mean: c.mean, range: `${c.from}~${c.to}`, outOfRange: out, max: c.max, min: c.min };
}
const rangeNote = (f, unit) => (f?.outOfRange === "high" ? ` 보유 비교 표본 범위 밖(가장 높았던 ${f.max.value}${unit}, ${f.max.date}보다 높음).` : f?.outOfRange === "low" ? ` 보유 비교 표본 범위 밖(가장 낮았던 ${f.min.value}${unit}, ${f.min.date}보다 낮음).` : "");

// ---------------------------------------------------------------- 문장 틀(7장: 규칙마다 3개, 상태에 맞는 것만, 결정적 선택). 제목은 쉬운 말, 본문에 숫자, method 는 접힘 설명
export const TPL = {
  H01: [
    { id: "a", title: "지금 공기가 평소보다 {levelWord} 건조해요", when: (f) => f.state === "dry" && f.levelWord, text: "{hour}시 습도 {hm}% — 같은 시기 같은 시각 평균 {mean}%보다 {abs}%p 낮아요. 비교 표본 {N}개 중 낮은 쪽 {loPct}%.{rangeNote}" },
    { id: "b", title: "이 시각치고 꽤 건조한 공기", when: (f) => f.state === "dry", text: "습도 {hm}%. {range}년 같은 시기(±7일) {hour}시 관측 {N}개 중 이보다 낮았던 경우는 {loPct}%였어요.{rangeNote}" },
    { id: "c", title: "건조해요 — 보습·불씨 조심", when: (f) => f.state === "dry", text: "{hour}시 습도 {hm}%, 이맘때 같은 시각 평균은 {mean}%예요(표본 {N}개).{rangeNote}" },
    { id: "d", title: "지금 공기가 평소보다 {levelWord} 눅눅해요", when: (f) => f.state === "humid" && f.levelWord, text: "{hour}시 습도 {hm}% — 같은 시기 같은 시각 평균 {mean}%보다 {abs}%p 높아요. 비교 표본 {N}개 중 높은 쪽 {hiPct}%.{rangeNote}" },
    { id: "e", title: "이 시각치고 습한 공기", when: (f) => f.state === "humid", text: "습도 {hm}%. {range}년 같은 시기(±7일) {hour}시 관측 {N}개 중 이보다 높았던 경우는 {hiPct}%였어요.{rangeNote}" },
    { id: "f", title: "눅눅해요 — 빨래는 실내 건조가 더딜 수 있어요", when: (f) => f.state === "humid", text: "{hour}시 습도 {hm}%, 이맘때 같은 시각 평균은 {mean}%예요(표본 {N}개).{rangeNote}" },
  ],
  W01: [
    { id: "a", title: "바람이 평소보다 {levelWord} 강해요", when: (f) => f.levelWord, text: "{hour}시 풍속 {ws}m/s — 같은 시기 같은 시각 평균 {mean}m/s보다 {abs}m/s 강해요. 표본 {N}개 중 높은 쪽 {hiPct}%.{rangeNote}" },
    { id: "b", title: "이 시각치고 바람이 센 편이에요", text: "풍속 {ws}m/s. {range}년 같은 시기(±7일) {hour}시 관측 {N}개 중 이보다 강했던 경우는 {hiPct}%였어요.{rangeNote}" },
    { id: "c", title: "바람 부는 {dayPart} — 체감은 더 쌀쌀할 수 있어요", text: "{hour}시 풍속 {ws}m/s, 이맘때 같은 시각 평균 {mean}m/s(표본 {N}개).{rangeNote}" },
  ],
  T01: [
    { id: "a", title: "{dayWord}은 낮과 밤 기온 차가 커요", when: (f) => f.state === "big", text: "{dayWord} 최고 {max}℃·최저 {min}℃ 예보, 일교차 {d}℃. 같은 시기 일교차 평균은 {mean}℃이고, 표본 {N}개 중 이보다 컸던 날은 {hiPct}%예요." },
    { id: "b", title: "{dayWord} 아침저녁엔 겉옷이 필요해요", when: (f) => f.state === "big", text: "일교차 {d}℃(최고 {max}℃, 최저 {min}℃ 예보) — 이맘때 평균 일교차 {mean}℃보다 커요." },
    { id: "c", title: "{dayWord}, 일교차 {d}℃ 예보", when: (f) => f.state === "big", text: "최고 {max}℃·최저 {min}℃. {range}년 같은 시기(±7일) 일교차 분포에서 높은 쪽 {hiPct}%예요(표본 {N}개)." },
    { id: "d", title: "{dayWord}은 하루 종일 기온이 비슷해요", when: (f) => f.state === "small", text: "{dayWord} 최고 {max}℃·최저 {min}℃ 예보, 일교차 {d}℃. 같은 시기 평균 일교차 {mean}℃보다 작고, 표본 {N}개 중 이보다 작았던 날은 {loPct}%예요." },
    { id: "e", title: "{dayWord}은 낮과 밤 기온 차가 작아요", when: (f) => f.state === "small", text: "일교차 {d}℃(최고 {max}℃, 최저 {min}℃ 예보) — 이맘때 평균 {mean}℃보다 작아요." },
    { id: "f", title: "{dayWord}, 일교차 {d}℃ 예보", when: (f) => f.state === "small", text: "최고 {max}℃·최저 {min}℃. {range}년 같은 시기(±7일) 일교차 분포에서 낮은 쪽 {loPct}%예요(표본 {N}개)." },
  ],
  T02: [
    { id: "a", title: "{dayWord} 아침, 이맘때보다 {levelWord} 쌀쌀해요", when: (f) => f.levelWord, text: "{dayWord} 최저 {min}℃ 예보 — 같은 시기 최저기온 평균 {mean}℃보다 {abs}℃ 낮아요. 표본 {N}개 중 낮은 쪽 {loPct}%.{nearText}" },
    { id: "b", title: "{dayWord} 아침은 이 시기치고 추운 편", text: "최저 {min}℃ 예보. {range}년 같은 시기(±7일) 최저기온 {N}개 중 이보다 낮았던 날은 {loPct}%예요.{nearText}" },
    { id: "c", title: "{dayWord} 아침, 따뜻하게 입으세요", text: "최저 {min}℃ 예보, 이맘때 평균 최저 {mean}℃.{nearText}" },
  ],
  R01: [
    { id: "a", title: "비 없는 날이 {n}일째 이어져요", text: "{lastWord}까지 {n}일 연속 일강수량 0.1mm 미만. 같은 시기 같은 날짜에 끝나는 연속 무강수 일수 {N}개 중 이보다 길었던 경우는 {hiPct}%예요." },
    { id: "b", title: "{n}일째 마른 날씨", text: "일강수량 0.1mm 이상인 날이 {n}일 동안 없었어요({lastWord}까지). 이맘때 평균 연속 일수는 {mean}일이에요(표본 {N}개)." },
    { id: "c", title: "한동안 비 소식이 없었어요", text: "{n}일 연속 무강수(공식 일자료, {lastWord}까지) — {range}년 같은 시기 분포에서 높은 쪽 {hiPct}%." },
  ],
  R02: [
    { id: "a", title: "비 오는 날이 {n}일째 이어져요", text: "{lastWord}까지 {n}일 연속 일강수량 0.1mm 이상. 같은 시기 같은 날짜에 끝나는 연속 강수 일수 {N}개 중 이보다 길었던 경우는 {hiPct}%예요." },
    { id: "b", title: "{n}일 내리 비가 왔어요", text: "{lastWord}까지 {n}일 연속 비(일강수량 0.1mm 이상). 이맘때 평균 연속 일수는 {mean}일이에요(표본 {N}개)." },
    { id: "c", title: "궂은 날이 길어지고 있어요", text: "{n}일 연속 강수(공식 일자료, {lastWord}까지) — {range}년 같은 시기 분포에서 높은 쪽 {hiPct}%." },
  ],
  R03: [
    { id: "a", title: "최근 7일 동안 비가 많이 왔어요", text: "{fromWord}~{lastWord} 7일 강수량 {sum}mm — 같은 시기 7일 합 평균 {mean}mm. 표본 {N}개 중 높은 쪽 {hiPct}%예요.{rangeNote}" },
    { id: "b", title: "한 주 사이 이맘때보다 많은 비", text: "최근 7일 합 {sum}mm({fromWord}~{lastWord}, 공식 일자료). {range}년 같은 시기 7일 합 분포에서 {phrase}.{rangeNote}" },
    { id: "c", title: "최근 7일 강수량 {sum}mm", text: "이맘때 7일 합 평균은 {mean}mm이고, 표본 {N}개 중 이보다 많았던 경우는 {hiPct}%예요.{rangeNote}" },
  ],
  R04: [
    { id: "a", title: "지금 비가 와요 — 이 시각 비로는 많은 편", when: (f) => f.state === "rare", text: "{hour}시 1시간 강수량 {rn}mm. 같은 시기 같은 시각 비가 온 시간 {N}개 중 높은 쪽 {hiPct}%예요(비 온 시간 평균 {mean}mm).{shareText}{rangeNote}" },
    { id: "b", title: "지금 내리는 비, 이맘때 비치고 굵어요", when: (f) => f.state === "rare", text: "1시간 {rn}mm({hour}시). 비가 온 시간만 모은 분포({range}년, {N}개)에서 {phrase}.{shareText}{rangeNote}" },
    { id: "c", title: "우산 챙기세요 — 지금 비가 꽤 와요", when: (f) => f.state === "rare", text: "{hour}시 1시간 {rn}mm, 같은 시기 비 온 시간 평균 {mean}mm보다 많아요(표본 {N}개).{shareText}{rangeNote}" },
    { id: "d", title: "지금 비가 와요", when: (f) => f.state === "plain" && f.rn != null, text: "{hour}시 1시간 강수량 {rn}mm.{shareText}{noteText}" },
    { id: "e", title: "지금 비 소식 — 우산 챙기세요", when: (f) => f.state === "plain" && f.rn != null, text: "{hour}시 실황 1시간 {rn}mm.{shareText}{noteText}" },
    { id: "f", title: "지금 {ptyWord}가 와요", when: (f) => f.state === "plain", text: "{hour}시 실황 강수형태 {pty}.{amountText}{shareText}{noteText}" },
  ],
  S01: [
    { id: "a", title: "{lastWord} 눈이 새로 쌓였어요", text: "{lastWord} 최심신적설 {cm}cm(공식 일자료).{rareText}" },
    { id: "b", title: "{lastWord} 신적설 {cm}cm", text: "새로 내려 쌓인 눈 {cm}cm({lastDate}).{rareText}" },
    { id: "c", title: "눈 쌓인 {lastWord}", text: "{lastWord} 새로 쌓인 눈 {cm}cm — 길이 미끄러울 수 있어요.{rareText}" },
  ],
  C01: [
    { id: "a", title: "{hourWord}부터 {toWord}", text: "{fromHour}~{toHour}시 하늘 {fromSky}→{toSky} 예보(강수 없음). {source} {base} 발표." },
    { id: "b", title: "{dayWord} {hourWord} 무렵 하늘이 바뀌어요", text: "{fromSky}였다가 {hourWord}부터 {toSky} 예보. {source} {base} 발표." },
    { id: "c", title: "{toWord} — {hourWord}부터", text: "하늘상태 예보: {fromHour}시대 {fromSky}, {toHour}시대 {toSky}(강수형태 없음). {source} {base} 발표." },
  ],
  N01: [
    { id: "a", title: "오늘 밤 열대야 가능성(추정)", text: "{fromWord} 19시~{toWord} 9시 기온이 모두 {th}℃ 이상(관측+예보 {count}시간, 가장 낮은 {low}℃).{rareText}" },
    { id: "b", title: "밤에도 {th}℃ 아래로 안 내려갈 듯해요", text: "19시~다음 날 9시 가장 낮은 기온 {low}℃(관측+예보 {count}시간) — 열대야 추정.{rareText}" },
    { id: "c", title: "더운 밤 예상 — 잠자리 더위 대비", text: "밤사이(19~9시) 최저 {low}℃ 예상. 기상청 공식 열대야 판정이 아니라 시간별 값으로 본 추정이에요.{rareText}" },
  ],
  T03: [
    { id: "a", title: "{whenWord} 기온이 빠르게 {dirWord}요", text: "{fromHour}시 {from}℃ → {toHour}시 {to}℃, 3시간에 {sd}℃({kindText}). 같은 시기 같은 시각 3시간 변화 {N}개 중 {sideText} {sidePct}%.{rangeNote}" },
    { id: "b", title: "{whenWord} 3시간 사이 {abs}℃ {dirShort}", text: "{fromHour}~{toHour}시 {from}→{to}℃({kindText}). 이맘때 같은 시각 3시간 변화 평균 {mean}℃.{rangeNote}" },
    { id: "c", title: "{whenWord} 기온 변화 주의 — {dirAdvice}", text: "{fromHour}시부터 3시간 동안 {sd}℃({from}→{to}℃, {kindText}). 표본 {N}개 중 {sideText} {sidePct}%.{rangeNote}" },
  ],
  L01: [
    { id: "a", title: "{whenWord} {legWord}에 비 예보 — 우산 챙기세요", when: (f) => f.state === "pty", text: "{legWord}({span}) 강수형태 {ptyList} 예보 시간: {hoursText}.{popText} {source} {base} 발표." },
    { id: "b", title: "{whenWord} {legWord}, 우산이 필요해요", when: (f) => f.state === "pty", text: "{span} 사이 {hoursText} {ptyList} 예보.{popText} {source} {base} 발표." },
    { id: "c", title: "{legWord} 시간대에 {ptyWord} 예보", when: (f) => f.state === "pty", text: "{whenWord} {span} 중 강수형태가 있는 시간 {hoursText}.{popText} {source} {base} 발표." },
    { id: "d", title: "{whenWord} {legWord}, 강수확률이 높은 시간대가 겹쳐요", when: (f) => f.state === "pop", text: "{span} 강수확률 최고 {popMax}%(강수형태는 아직 없음 예보). {source} {base} 발표." },
    { id: "e", title: "{legWord}길 비 가능성 — 작은 우산 챙기면 좋아요", when: (f) => f.state === "pop", text: "{whenWord} {span} 강수확률 {popMax}%까지(강수형태 없음 예보). {source} {base} 발표." },
    { id: "f", title: "{whenWord} {legWord}, 비 올 확률 {popMax}%", when: (f) => f.state === "pop", text: "{span} 강수확률이 {popHigh}% 이상인 시간이 있어요(강수형태는 없음 예보). {source} {base} 발표." },
  ],
};
// 접힘 설명(방법) — 규칙마다 하나
export const METHOD = {
  H01: "초단기실황 습도(REH, 격자) vs ASOS 정시 습도, 같은 월일 ±7일·같은 시각. 유효한 해(창 안 값 50% 이상)가 기준 연도의 80% 이상, 표본 60개 이상일 때만 백분위. 백분위 = (낮은 값 수 + 같은 값 수/2)/표본 수. 조건: 습도 30% 이하이면서 낮은 쪽 10% 이내, 또는 85% 이상이면서 높은 쪽 10% 이내.",
  W01: "초단기실황 풍속(WSD, 격자) vs ASOS 정시 풍속, 같은 월일 ±7일·같은 시각(표본 60개 이상). 조건: 5m/s 이상이면서 높은 쪽 10% 이내.",
  T01: "단기예보 최고·최저(TMX·TMN)의 차 vs ASOS 공식 일자료 (최고−최저) 분포, 같은 월일 ±7일(표본 60개 이상). 조건: 10℃ 이상이면서 높은 쪽 10%, 또는 5℃ 이하이면서 낮은 쪽 10%. 예보값이에요.",
  T02: "단기예보 최저(TMN) vs ASOS 공식 일자료 최저기온 분포, 같은 월일 ±7일(표본 60개 이상). 조건: 낮은 쪽 10% 이내, 또는 같은 시기 표본 최저값 +1℃ 이내. 예보값이라 기록이라고 하지 않아요.",
  R01: "공식 일자료 일강수량 0.1mm 미만이 이어진 날 수(공란 = 무강수, 행 없음 = 결측 — 결측이 끼면 연속을 모름). 같은 월일 ±7일에 끝나는 연속 일수 분포와 비교(표본 60개 이상). 조건: 7일 이상이면서 높은 쪽 10%.",
  R02: "공식 일자료 일강수량 0.1mm 이상이 이어진 날 수. 같은 월일 ±7일에 끝나는 연속 일수 분포와 비교(표본 60개 이상). 조건: 3일 이상이면서 높은 쪽 10%.",
  R03: "공식 일자료 최근 7일 강수량 합(7일 모두 자료가 있을 때만). 같은 월일 ±7일에 끝나는 7일 합 분포와 비교(표본 60개 이상). 조건: 0mm 초과이면서 높은 쪽 10%. 강수량은 고정 mm 등급 없이 분포로만 말해요.",
  R04: "초단기실황 1시간 강수량(RN1) vs ASOS 같은 시기 같은 시각에 비가 온 시간(0.1mm 이상)만의 분포. 그런 시간이 30개 이상·4개 해 이상일 때만 많고 적음을 말하고, 아니면 양만 보여 줘요. '비가 온 시간 비율'은 같은 시기 같은 시각 전체 관측 중 0.1mm 이상인 비율.",
  S01: "공식 일자료 최심신적설(그날 새로 쌓인 눈, cm). 드문 정도는 같은 시기 눈이 쌓인 날만의 분포(30개 이상·4개 해 이상)일 때만. '첫눈'은 판정하지 않아요(쌓이지 않은 눈은 자료에 없음).",
  C01: "단기·초단기예보 하늘상태(SKY)가 맑음 2시간 → 흐림 2시간(또는 반대)으로 이어지고 그 4시간 강수형태가 없음일 때, 8~19시 사이 처음 한 번. 하늘상태는 그 정시 앞 1시간 구간 값으로 봐요.",
  N01: "19시~다음 날 9시 15개 정시 기온(실황+예보)이 모두 25℃ 이상이면 '열대야 추정'. 기상청 공식 열대야 판정이 아니에요. 드문 정도는 ASOS 같은 시기 같은 밤 최저기온 분포(표본 60개 이상)일 때만.",
  T03: "정시 기온(실황+예보)에서 정확히 3시간 사이 4℃ 이상 바뀐 때(오름·내림 모두), 앞으로 24시간 안 처음 한 번. ASOS 같은 시기 같은 시작 시각의 3시간 변화 분포에서 양쪽 끝 10% 안(U2 ≥ 0.8)이고, 그 시각의 평소 흐름과 반대 방향(낮에 내림·밤에 오름, 또는 평소 변화가 1℃ 미만인 시각)일 때만 — 맑은 날 아침에 오르고 저녁에 내리는 보통 하루 변화는 빼요.",
  L01: "다음 출근(7~9시) 또는 퇴근(18~20시) 구간과 겹치는 예보 시간 중 강수형태가 있으면 '비 예보', 없고 강수확률 60% 이상만 있으면 '강수확률 높은 시간대'. 강수형태·강수확률은 그 정시 앞 1시간 구간으로 겹침을 계산해요.",
};


// ---------------------------------------------------------------- 작은 그래프 자료(story.chart, astra 2장·3단계) — 화면(public/rt-story-visuals.js)이 그대로 그림. 값은 위 계산 결과만
export function distChart(f, { metric, unit, value, valueKind = "obs", label, word = null }) {
  if (!f) return null;
  return { type: "dist", metric, unit, value, valueKind, label, word, mean: f.mean ?? null, p10: f.p10 ?? null, p90: f.p90 ?? null, min: f.min?.value ?? null, minDate: f.min?.date ?? null, max: f.max?.value ?? null, maxDate: f.max?.date ?? null, N: f.N, range: f.range };
}
// 최근 30일 강수 달력: wet(0.1mm 이상)·dry·missing(행 없음·값 없음)·pending(오늘 — 아직 끝나지 않은 날)
export function rainCalendar(store, today, days = 30) {
  const out = [];
  const t = ymdToDn(today);
  for (let dn = t - days + 1; dn <= t; dn++) {
    const v = dAt(store, "rain", dn);
    out.push({ date: dnToYmd(dn), state: dn >= t ? "pending" : !Number.isFinite(v) ? "missing" : v >= 0.1 ? "wet" : "dry", mm: Number.isFinite(v) ? r1(v) : null });
  }
  return out;
}
const pt = (h) => ({ time: h.time, ta: fin(h.ta) ? h.ta : null, kind: h.kind });

// ---------------------------------------------------------------- 규칙
const tk = (ctx, ruleId, eventId) => ({ station: ctx.sid, date: ctx.ymd, ruleId, eventId });
function make(ctx, ruleId, eventId, facts, base) {
  const t = render(tk(ctx, ruleId, eventId), TPL[ruleId], facts);
  if (!t) return null;
  return { key: ruleId, ruleId, eventId, templateId: t.templateId, title: t.title, text: t.text, method: METHOD[ruleId], facts, ...base };
}
const res = (fired, reason, c = null) => ({ fired, reason, cand: c });

function H01(ctx) {
  const c = ctx.current;
  if (!c || !c.fresh) return res(false, "실황 없음·지연");
  if (!fin(c.hm)) return res(false, "습도 자료 없음");
  const R = SR.H01;
  const cmp = hourlyCompare(ctx.hs, ctx.ymd, c.hour, "hm", c.hm)[0];
  const f = distFacts(cmp);
  if (!f || f.N < MIN_SAMPLES_RANK) return res(false, "표본 부족");
  const state = c.hm <= R.dryMax && f.p <= R.dryP ? "dry" : c.hm >= R.humidMin && f.p >= R.humidP ? "humid" : null;
  if (!state) return res(false, "조건 밖");
  const dd = describeDifference("hm", cmp.diff);
  const facts = { ...f, state, hm: c.hm, hour: c.hour, abs: Math.abs(cmp.diff), diff: cmp.diff, levelWord: dd && dd.level !== "similar" ? dd.levelWord : null, rangeNote: rangeNote(f, "%") };
  return res(true, state, make(ctx, "H01", `${ctx.sid}|H01|${ctx.ymd}|${state}`, facts, { topic: "wind-humidity", lifeDecision: "humidity", path: "stat", kind: "관측", U: state === "dry" ? Ulo(f.p) : Uhi(f.p), A: LV.day, T: timeValue({ startW: c.time, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { state, hm: roundTo(c.hm, 5) }, basis: `초단기실황 ${c.time.slice(0, 16)} vs ASOS 정시 습도`, asOf: c.time.slice(0, 16), lifeSlot: false, chart: distChart(f, { metric: "hm", unit: "%", value: c.hm, label: `${c.hour}시 습도` }) }));
}
function W01(ctx) {
  const c = ctx.current;
  if (!c || !c.fresh) return res(false, "실황 없음·지연");
  if (!fin(c.ws)) return res(false, "풍속 자료 없음");
  const R = SR.W01;
  const cmp = hourlyCompare(ctx.hs, ctx.ymd, c.hour, "ws", c.ws)[0];
  const f = distFacts(cmp, { side: "hi" });
  if (!f || f.N < MIN_SAMPLES_RANK) return res(false, "표본 부족");
  if (!(c.ws >= R.min && f.p >= R.p)) return res(false, "조건 밖");
  const dd = describeDifference("ws", cmp.diff);
  const facts = { ...f, ws: c.ws, hour: c.hour, abs: Math.abs(cmp.diff), levelWord: dd && dd.level !== "similar" && dd.direction === "up" ? dd.levelWord : null, dayPart: c.hour >= 18 || c.hour < 6 ? "밤" : c.hour < 12 ? "오전" : "오후", rangeNote: rangeNote(f, "m/s") };
  return res(true, "strong", make(ctx, "W01", `${ctx.sid}|W01|${ctx.ymd}`, facts, { topic: "wind-humidity", lifeDecision: "wind", path: "stat", kind: "관측", U: f.U, A: LV.day, T: timeValue({ startW: c.time, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { ws: roundTo(c.ws, 1) }, basis: `초단기실황 ${c.time.slice(0, 16)} vs ASOS 정시 풍속`, asOf: c.time.slice(0, 16), lifeSlot: true, chart: distChart(f, { metric: "ws", unit: "m/s", value: c.ws, label: `${c.hour}시 풍속` }) }));
}
function T01(ctx) {
  const R = SR.T01;
  const out = [];
  for (const d of ctx.days || []) {
    if (d.date < ctx.ymd || ymdToDn(d.date) - ymdToDn(ctx.ymd) > 1) continue;
    if (!fin(d.max) || !fin(d.min)) continue;
    const D = r1(d.max - d.min);
    const cmp = derivedCompare((dn) => [dAt(ctx.store, "max", dn) - dAt(ctx.store, "min", dn)], d.date, D, { digits: 1 })[0];
    const f = distFacts(cmp, { observed: false });
    if (!f || f.N < MIN_SAMPLES_RANK) continue;
    const state = D >= R.bigMin && f.p >= R.bigP ? "big" : D <= R.smallMax && f.p <= R.smallP ? "small" : null;
    if (!state) continue;
    out.push({ d, D, f, state });
  }
  if (!out.length) return res(false, (ctx.days || []).some((d) => fin(d.max) && fin(d.min)) ? "조건 밖" : "최고·최저 예보 없음");
  out.sort((a, b) => (b.state === "big" ? Uhi(b.f.p) : Ulo(b.f.p)) - (a.state === "big" ? Uhi(a.f.p) : Ulo(a.f.p)));
  const { d, D, f, state } = out[0];
  const facts = { ...f, state, d: D, max: d.max, min: d.min, dayWord: dayWord(d.date, ctx.ymd), date: d.date };
  return res(true, state, make(ctx, "T01", `${ctx.sid}|T01|${d.date}|${state}`, facts, { topic: "temperature", lifeDecision: "layering", path: "stat", kind: "예보", U: state === "big" ? Uhi(f.p) : Ulo(f.p), A: state === "big" ? LV.decision : LV.info, T: timeValue({ startW: `${d.date} 00:00`, endW: `${d.date} 23:59`, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { date: d.date, state, d: roundTo(D, 1) }, basis: `단기예보 최고(${String(d.maxBase || "").slice(0, 16)})·최저(${String(d.minBase || "").slice(0, 16)}) 발표 vs ASOS 공식 일자료`, lifeSlot: state === "big", chart: { type: "range", focus: "both", date: d.date, unit: "℃", valueKind: "fcst", max: d.max, min: d.min, meanMax: dailyCompare(ctx.store, d.date, "max")[0].mean, meanMin: dailyCompare(ctx.store, d.date, "min")[0].mean, d: D, meanD: f.mean, N: f.N, range: f.range } }));
}
function T02(ctx) {
  const R = SR.T02;
  const nowH = ctx.hour;
  // 다가오는 아침: 지금 9시 전이면 오늘, 아니면 내일
  const date = nowH < 9 ? ctx.ymd : dnToYmd(ymdToDn(ctx.ymd) + 1);
  const d = (ctx.days || []).find((x) => x.date === date);
  if (!d || !fin(d.min)) return res(false, "최저 예보 없음");
  const cmp = dailyCompare(ctx.store, date, "min", d.min)[0];
  const f = distFacts(cmp, { side: "lo", observed: false });
  if (!f || f.N < MIN_SAMPLES_RANK) return res(false, "표본 부족");
  const near = cmp.min && d.min <= cmp.min.value + R.nearMin;
  if (!(f.p <= R.p || near)) return res(false, "조건 밖");
  const dd = describeDifference("ta", cmp.diff);
  const facts = { ...f, min: d.min, abs: Math.abs(cmp.diff), dayWord: dayWord(date, ctx.ymd), levelWord: dd && dd.direction === "down" && dd.level !== "similar" ? dd.levelWord : null, nearText: near ? ` 같은 시기 보유 표본 가장 낮은 값(${cmp.min.value}℃, ${cmp.min.date})에 1℃ 이내인 예보예요(예보값이라 기록으로 말하지 않음).` : "" };
  return res(true, near ? "near-low" : "low", make(ctx, "T02", `${ctx.sid}|T02|${date}`, facts, { topic: "temperature", lifeDecision: "morning", path: "stat", kind: "예보", U: Math.max(Ulo(f.p), near ? 0.9 : 0), A: LV.decision, T: timeValue({ startW: `${date} 06:00`, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { date, min: roundTo(d.min, 1), near: !!near }, basis: `단기예보 최저 ${String(d.minBase || "").slice(0, 16)} 발표 vs ASOS 공식 일자료`, lifeSlot: true, chart: { type: "range", focus: "min", date, unit: "℃", valueKind: "fcst", max: fin(d.max) ? d.max : null, min: d.min, meanMax: dailyCompare(ctx.store, date, "max")[0].mean, meanMin: cmp.mean, lowest: cmp.min?.value ?? null, lowestDate: cmp.min?.date ?? null, p10: f.p10, N: f.N, range: f.range } }));
}
function streak(ctx, ruleId, wetSide) {
  const R = SR[ruleId];
  const L = ctx.lastDay;
  if (!L) return res(false, "끝난 일자료 없음");
  const lastDn = ymdToDn(L);
  if (ymdToDn(ctx.ymd) - lastDn > 2) return res(false, "일자료가 늦음");
  const run = currentRun(ctx.store, lastDn, wetSide);
  if (run.n < R.minDays) return res(false, `${run.n}일(기준 ${R.minDays}일)`);
  if (run.broken) return res(false, `결측으로 연속 길이 모름(확인된 최소 ${run.n}일)`);
  // 오늘 비가 와(또는 그쳐) 이미 끊겼을 수 있으면 뺌
  const raining = ctx.current?.fresh && (ctx.current.rn1 >= 0.1 || (ctx.current.pty && ctx.current.pty !== "없음"));
  const arr = rainRuns(ctx.store)[wetSide ? "wet" : "dry"];
  const cmp = derivedCompare((dn) => { const i = dn - ctx.store.base; return [i >= 0 && i < ctx.store.n ? arr[i] : NaN]; }, L, run.n, { digits: 1 })[0];
  const f = distFacts(cmp, { side: "hi", observed: false });
  if (!f || f.N < MIN_SAMPLES_RANK) return res(false, "표본 부족");
  if (!(f.p >= R.p)) return res(false, "조건 밖");
  const facts = { ...f, n: run.n, lastWord: dayWord(L, ctx.ymd), lastDate: L };
  const c = make(ctx, ruleId, `${ctx.sid}|${ruleId}|${dnToYmd(lastDn - run.n + 1)}`, facts, { topic: "precipitation", path: "stat", kind: "관측", U: f.U, A: LV.info, T: timeValue({ endW: `${L} 23:59`, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { week: Math.floor(run.n / 7) }, basis: "ASOS 공식 일자료", chart: { type: "calendar", days: rainCalendar(ctx.store, ctx.ymd), from: dnToYmd(lastDn - run.n + 1), to: L, side: wetSide ? "wet" : "dry" }, exclude: !wetSide && raining ? "오늘 비가 와 연속 무강수가 끊겼을 수 있음" : null });
  return res(true, "long", c);
}
const R01 = (ctx) => streak(ctx, "R01", false);
const R02 = (ctx) => streak(ctx, "R02", true);
function R03(ctx) {
  const R = SR.R03;
  const L = ctx.lastDay;
  if (!L) return res(false, "끝난 일자료 없음");
  if (ymdToDn(ctx.ymd) - ymdToDn(L) > 2) return res(false, "일자료가 늦음");
  const runs = rainRuns(ctx.store);
  const i = ymdToDn(L) - ctx.store.base;
  const sum = i >= 0 && i < ctx.store.n ? runs.sum7[i] : NaN;
  if (!Number.isFinite(sum)) return res(false, "7일 중 결측");
  if (!(sum > 0)) return res(false, "7일 무강수");
  const cmp = derivedCompare((dn) => { const j = dn - ctx.store.base; return [j >= 0 && j < ctx.store.n ? runs.sum7[j] : NaN]; }, L, sum, { digits: 1 })[0];
  const f = distFacts(cmp, { side: "hi" });
  if (!f || f.N < MIN_SAMPLES_RANK) return res(false, "표본 부족");
  if (!(f.p >= R.p)) return res(false, "조건 밖");
  const dr = describeDifference("rain", null, { percentile: f.pct, samplesOk: true, mean: f.mean });
  const facts = { ...f, sum, lastWord: dayWord(L, ctx.ymd), fromWord: md(dnToYmd(ymdToDn(L) - 6)), phrase: dr?.phrase ? `${dr.phrase}(높은 쪽 ${f.hiPct}%)` : `높은 쪽 ${f.hiPct}%`, rangeNote: rangeNote(f, "mm") };
  return res(true, "wet", make(ctx, "R03", `${ctx.sid}|R03|${L}`, facts, { topic: "precipitation", path: "stat", kind: "관측", U: f.U, A: LV.info, T: timeValue({ endW: `${L} 23:59`, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { sum: roundTo(sum, 5) }, basis: "ASOS 공식 일자료 7일 합", chart: distChart(f, { metric: "rain7", unit: "mm", value: sum, label: "최근 7일 강수량", word: "7일 합" }) }));
}
function R04(ctx) {
  const R = SR.R04;
  const c = ctx.current;
  if (!c || !c.fresh) return res(false, "실황 없음·지연");
  const rainNow = fin(c.rn1) && c.rn1 >= R.wetMin;
  const ptyNow = c.pty && c.pty !== "없음";
  if (!rainNow && !ptyNow) return res(false, fin(c.rn1) ? "비 없음" : "강수 자료 없음");
  const get = (dn) => [hAt(ctx.hs, "rn", dn, c.hour)];
  const all = derivedCompare(get, ctx.ymd, NaN, { digits: 1 })[0];
  let share = null;
  if (all.status !== "insufficient" && all.samples) {
    const wetN = derivedCompare(get, ctx.ymd, NaN, { digits: 1, filter: (v) => v >= R.wetMin })[0].samples;
    share = Math.round((wetN / all.samples) * 1000) / 10;
  }
  const shareText = share != null ? ` 이맘때 이 시각에 비가 온 비율은 ${share}%(관측 ${all.samples}개).` : "";
  let state = "plain", f = null, U = null;
  if (rainNow) {
    // 조건부 분포는 표본 60개 기준 대신 30개·4개 해(3-2 R04)
    const wet = derivedCompare(get, ctx.ymd, c.rn1, { digits: 1, filter: (v) => v >= R.wetMin, minRank: R.minWetSamples })[0];
    if (wet.status !== "insufficient" && wet.samples >= R.minWetSamples && wet.occurrenceYears >= R.minWetYears && wet.p != null) {
      f = distFacts(wet, { side: "hi" });
      U = f.U;
      if (U >= 0.6) state = "rare"; // 비 온 시간 중 높은 쪽 20% 안이면 '많은 편' 문장(아니면 양만)
    }
  }
  const dr = f ? describeDifference("rain", null, { percentile: f.pct, samplesOk: true, mean: f.mean }) : null;
  const facts = { ...(f || {}), state, rn: rainNow ? c.rn1 : null, hour: c.hour, pty: c.pty || null, ptyWord: c.pty && /눈/.test(c.pty) ? "눈" : "비", shareText, amountText: fin(c.rn1) ? ` 1시간 강수량 ${c.rn1}mm.` : " 강수량 자료 없음.", noteText: f ? "" : " 같은 시기 비 온 시간 표본이 적어 많고 적음은 말하지 않아요.", phrase: dr?.phrase ? `${dr.phrase}(높은 쪽 ${f.hiPct}%)` : f ? `높은 쪽 ${f.hiPct}%` : null, rangeNote: f ? rangeNote(f, "mm") : "" };
  const cand = make(ctx, "R04", `${ctx.sid}|rain|${ctx.ymd}|now`, facts, { topic: "precipitation", lifeDecision: "umbrella", mergeGroup: "rain", path: state === "rare" ? "stat" : "life", kind: "관측", U: state === "rare" ? U : null, A: LV.decision, T: timeValue({ startW: c.time, nowW: ctx.nowW }), samples: f?.N ?? 0, minSamples: R.minWetSamples, material: { state, rn: roundTo(c.rn1 ?? 0, 1), pty: c.pty || "" }, basis: `초단기실황 ${c.time.slice(0, 16)}${f ? " vs ASOS 같은 시기 비 온 시간" : ""}`, asOf: c.time.slice(0, 16), lifeSlot: true, chart: f ? distChart(f, { metric: "rn", unit: "mm", value: c.rn1, label: `${c.hour}시 1시간 강수(비 온 시간끼리)` }) : null, scene: { kind: c.pty && /눈/.test(c.pty) ? "snow" : "rain", source: "obs", time: c.time } });
  return res(true, state, cand);
}
function S01(ctx) {
  const R = SR.S01;
  const L = ctx.lastDay;
  if (!L) return res(false, "끝난 일자료 없음");
  if (ymdToDn(ctx.ymd) - ymdToDn(L) > R.maxAgeDays) return res(false, "일자료가 늦음");
  const v = dAt(ctx.store, "nsnow", ymdToDn(L));
  if (!Number.isFinite(v)) return res(false, "신적설 자료 없음");
  if (!(v > 0)) return res(false, "신적설 없음");
  const pos = derivedCompare((dn) => [dAt(ctx.store, "nsnow", dn)], L, v, { digits: 1, filter: (x) => x > 0, minRank: R.minPosSamples })[0];
  const okRare = pos.status !== "insufficient" && pos.samples >= R.minPosSamples && pos.occurrenceYears >= R.minPosYears && pos.p != null;
  const f = okRare ? distFacts(pos, { side: "hi" }) : null;
  const rareText = f ? ` 같은 시기 눈이 쌓인 날 ${f.N}개 중 이보다 많았던 날은 ${f.hiPct}%예요.` : " 같은 시기 눈 쌓인 날 표본이 적어 많고 적음은 말하지 않아요.";
  const facts = { cm: v, lastWord: dayWord(L, ctx.ymd), lastDate: L, rareText };
  return res(true, "snow", make(ctx, "S01", `${ctx.sid}|S01|${L}`, facts, { topic: "precipitation", lifeDecision: "snow", path: f && f.U >= 0.3 ? "stat" : "life", kind: "관측", U: f?.U ?? null, A: LV.day, T: timeValue({ endW: `${L} 23:59`, nowW: ctx.nowW }), samples: f?.N ?? 0, minSamples: R.minPosSamples, material: { cm: roundTo(v, 1) }, basis: "ASOS 공식 일자료 최심신적설", scene: { kind: "snow", source: "obs", time: `${L} 23:59` } }));
}
const SKY_CLASS = (s) => (s === "맑음" ? "clear" : s === "흐림" ? "cloudy" : null);
function C01(ctx) {
  const R = SR.C01;
  const fc = (ctx.series || []).filter((h) => h.kind === "fcst" && h.time > `${ctx.nowW}:00` && h.time <= wallAdd(ctx.nowW, R.aheadHours));
  if (fc.length < R.hours) return res(false, "예보 시간 부족");
  for (let i = 0; i + 3 < fc.length; i++) {
    const w = fc.slice(i, i + 4);
    if (w.some((h, j) => j > 0 && h.time !== wallAdd(w[j - 1].time, 1))) continue;
    const cl = w.map((h) => SKY_CLASS(h.sky));
    if (cl.some((x) => !x) || w.some((h) => h.pty !== "없음")) continue;
    if (!(cl[0] === cl[1] && cl[2] === cl[3] && cl[1] !== cl[2])) continue;
    const th = +w[2].time.slice(11, 13);
    if (th < R.fromHour || th > R.toHour) continue;
    const toSky = w[2].sky, fromSky = w[0].sky;
    const src = w[2].items?.sky || { source: w[2].source, base: w[2].base };
    const facts = { fromSky, toSky, fromHour: +w[0].time.slice(11, 13), toHour: th + 1, hourWord: `${th}시`, toWord: toSky === "흐림" ? "흐려져요" : "맑아져요", dayWord: dayWord(w[2].time.slice(0, 10), ctx.ymd), source: src.source, base: String(src.base || "").slice(5, 16) };
    return res(true, toSky, make(ctx, "C01", `${ctx.sid}|C01|${w[2].time.slice(0, 13)}`, facts, { topic: "sky", path: "life", kind: "예보", U: null, A: LV.info, T: timeValue({ startW: w[2].time, nowW: ctx.nowW }), samples: 0, minSamples: 0, material: { to: toSky, at: slot2h(w[2].time) }, basis: `${src.source} ${String(src.base || "").slice(0, 16)} 발표 하늘상태`, chart: { type: "sky", at: w[2].time, hours: fc.slice(Math.max(0, i - 2), i + 6).map((x) => ({ time: x.time, sky: x.sky ?? null, pty: x.pty ?? null })) }, scene: { kind: toSky === "흐림" ? "cloud" : "clear", source: "fcst", time: w[2].time } }));
  }
  return res(false, "전환 없음");
}
function N01(ctx) {
  const R = SR.N01;
  if (ctx.hour < 9) return res(false, "9시 뒤부터 오늘 밤을 봄");
  const start = `${ctx.ymd} ${pad(R.fromHour)}:00:00`;
  const by = new Map((ctx.series || []).map((h) => [h.time, h]));
  const vals = [];
  let t = start, kinds = new Set();
  const nightPts = [];
  for (let i = 0; i < R.hours; i++) { const h = by.get(t); if (!h || !fin(h.ta)) return res(false, "밤 시간 자료 부족"); vals.push(h.ta); kinds.add(h.kind); nightPts.push(pt(h)); t = wallAdd(t, 1); }
  const low = Math.min(...vals);
  if (!(low >= R.min)) return res(false, "조건 밖");
  const cmp = derivedCompare((dn) => { let m = Infinity; for (let k = 0; k < R.hours; k++) { const hh = R.fromHour + k; const v = hAt(ctx.hs, "ta", dn + Math.floor(hh / 24), hh % 24); if (!Number.isFinite(v)) return [NaN]; m = Math.min(m, v); } return [m]; }, ctx.ymd, low, { digits: 1 })[0];
  const f = cmp.p != null && cmp.samples >= MIN_SAMPLES_RANK ? distFacts(cmp, { side: "hi", observed: false }) : null;
  const facts = { th: R.min, low: r1(low), count: R.hours, fromWord: "오늘", toWord: "내일", rareText: f ? ` 같은 시기 밤 최저기온 ${f.N}개 중 이보다 높았던 밤은 ${f.hiPct}%예요.` : "" };
  return res(true, "warm", make(ctx, "N01", `${ctx.sid}|N01|${ctx.ymd}`, facts, { topic: "temperature", lifeDecision: "sleep", path: "life", kind: kinds.has("obs") ? "혼합" : "예보", U: f?.U ?? null, A: LV.decision, T: timeValue({ startW: start, nowW: ctx.nowW }), samples: f?.N ?? 0, minSamples: 0, material: { low: roundTo(low, 1) }, basis: "실황·초단기·단기예보 정시 기온(추정)", lifeSlot: true, chart: { type: "night", threshold: R.min, unit: "℃", points: nightPts } }));
}
function T03(ctx) {
  const R = SR.T03;
  const s = (ctx.series || []).filter((h) => fin(h.ta));
  const by = new Map(s.map((h) => [h.time, h]));
  const from = wallAdd(ctx.nowW, -R.hours), to = wallAdd(ctx.nowW, R.aheadHours);
  // 정확히 3시간 사이 |Δ| ≥ 4℃ 인 모든 쌍 중, 같은 시기 같은 시작 시각 분포의 양쪽 끝(U2 ≥ minU)이면서
  //   그 시각의 평소 흐름과 반대 방향(또는 평소 변화가 거의 없는 시각)인 첫 쌍 — 맑은 날 아침 오름·저녁 내림은 빠짐(2단계 되돌려 보기에서 조정)
  let best = null, seen = 0;
  for (const h of s) {
    if (h.time < from || h.time > to) continue;
    const e = by.get(wallAdd(h.time, R.hours));
    if (!e || e.time > to) continue;
    if (e.time < wallAdd(ctx.nowW, -1)) continue; // 이미 끝난 변화는 제외(지금 진행 중·앞으로만)
    const dlt = r1(e.ta - h.ta);
    if (Math.abs(dlt) < R.delta) continue;
    seen++;
    const sh = +h.time.slice(11, 13), sDate = h.time.slice(0, 10);
    const cmp = derivedCompare((dn) => [hAt(ctx.hs, "ta", dn + Math.floor((sh + R.hours) / 24), (sh + R.hours) % 24) - hAt(ctx.hs, "ta", dn, sh)], sDate, dlt, { digits: 1 })[0];
    const f = distFacts(cmp, { side: "both", observed: false });
    if (!f || f.N < MIN_SAMPLES_RANK || f.U < R.minU || f.mean == null) continue;
    if (dlt * f.mean > 0 && Math.abs(f.mean) >= R.usualFlat) continue; // 그 시각의 평소 흐름(아침 오름·저녁 내림)과 같은 방향이면 하루 변화로 봄
    best = { h, e, dlt, f, sh, sDate };
    break;
  }
  if (!best) return res(false, seen ? "평소 같은 시각 변화 범위 안" : "3시간 4℃ 변화 없음");
  const { h, e, dlt, f, sh, sDate } = best;
  const up = dlt > 0;
  const kindText = h.kind === "obs" && e.kind === "obs" ? "실황" : h.kind === "obs" ? "실황→예보" : "예보";
  const facts = { ...f, from: h.ta, to: e.ta, fromHour: sh, toHour: +e.time.slice(11, 13), sd: `${up ? "+" : ""}${dlt}`, abs: Math.abs(dlt), dirWord: up ? "올라" : "내려가", dirShort: up ? "오름" : "내림", dirAdvice: up ? "겉옷 벗기 좋게" : "겉옷 챙기세요", whenWord: `${dayWord(sDate, ctx.ymd)} ${sh}시부터`, kindText, sideText: up ? "더 크게 오른 경우" : "더 크게 내린 경우", sidePct: up ? f.hiPct : f.loPct, rangeNote: "" };
  return res(true, up ? "up" : "down", make(ctx, "T03", `${ctx.sid}|T03|${h.time.slice(0, 13)}|${up ? "up" : "down"}`, facts, { topic: "temperature", lifeDecision: "sudden-change", path: "stat", minU: R.minU, kind: kindText === "실황" ? "관측" : kindText === "예보" ? "예보" : "혼합", U: f.U, A: LV.decision, T: timeValue({ startW: h.time, endW: e.time, nowW: ctx.nowW }), samples: f.N, minSamples: MIN_SAMPLES_RANK, material: { at: slot2h(h.time), d: roundTo(dlt, 1) }, basis: "정시 기온(실황·예보) vs ASOS 같은 시기 같은 시작 시각 3시간 변화", lifeSlot: true, chart: { type: "line", unit: "℃", hl: [h.time, e.time], d: dlt, usual: f.mean, points: s.filter((x) => x.time >= from && x.time <= to).map(pt) } }));
}
// 다음 출퇴근 구간(끝나지 않은 가장 가까운 것). 구간 [a시, b시] 와 예보 항목 구간(intervalStart~End)이 겹치는 정시
export function nextCommute(nowW, R = SR.L01) {
  const ymd = nowW.slice(0, 10), h = +nowW.slice(11, 13), m = +nowW.slice(14, 16) || 0;
  const t = h + m / 60;
  const legs = [["am", R.am], ["pm", R.pm]];
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? ymd : dnToYmd(ymdToDn(ymd) + 1);
    for (const [leg, [a, b]] of legs) if (k === 1 || t < b) return { leg, date: d, a, b, startW: `${d} ${pad(a)}:00:00`, endW: `${d} ${pad(b)}:00:00` };
  }
  return null;
}
export function overlapsCommute(hourTime, el, win) {
  const iv = elementInterval(hourTime, el);
  if (iv.intervalStart === iv.intervalEnd) return iv.intervalStart >= win.startW && iv.intervalStart <= win.endW;
  return iv.intervalEnd > win.startW && iv.intervalStart < win.endW;
}
function L01(ctx) {
  const R = SR.L01;
  const win = nextCommute(ctx.nowW);
  const fc = (ctx.series || []).filter((h) => h.kind === "fcst");
  const ptyH = fc.filter((h) => overlapsCommute(h.time, "pty", win) && h.pty && h.pty !== "없음");
  const popH = fc.filter((h) => overlapsCommute(h.time, "pop", win) && fin(h.pop));
  const anyH = fc.filter((h) => overlapsCommute(h.time, "pty", win));
  if (!anyH.length) return res(false, "출퇴근 구간 예보 없음");
  if (ctx.fcFresh === false) return res(false, "예보 지연");
  const popMax = popH.length ? Math.max(...popH.map((h) => h.pop)) : null;
  const state = ptyH.length ? "pty" : popMax != null && popMax >= R.popHigh ? "pop" : null;
  if (!state) return res(false, "비 예보 없음");
  const ref = (ptyH[0] || popH.find((h) => h.pop === popMax));
  const src = (state === "pty" ? ref.items?.pty : ref.items?.pop) || { source: ref.source, base: ref.base };
  const hourRange = (h) => { const iv = elementInterval(h.time, "pty"); return `${+iv.intervalStart.slice(11, 13)}~${+iv.intervalEnd.slice(11, 13)}시`; };
  const ptys = [...new Set(ptyH.map((h) => h.pty))];
  const facts = { state, legWord: win.leg === "am" ? "출근길" : "퇴근길", whenWord: dayWord(win.date, ctx.ymd), span: `${win.a}~${win.b}시`, hoursText: ptyH.map(hourRange).join("·"), ptyList: ptys.join("·"), ptyWord: ptys.some((p) => /눈/.test(p)) ? "눈·비" : "비", popMax, popHigh: R.popHigh, popText: popMax != null ? ` 강수확률 최고 ${popMax}%.` : "", source: src.source, base: String(src.base || "").slice(5, 16) };
  return res(true, state, make(ctx, "L01", `${ctx.sid}|rain|${win.date}|${win.leg}`, facts, { key: `L01-${win.leg}`, topic: "precipitation", lifeDecision: "umbrella", mergeGroup: "rain", path: "life", kind: "예보", U: null, A: LV.decision, T: timeValue({ startW: win.startW, endW: win.endW, nowW: ctx.nowW }), samples: 0, minSamples: 0, material: { leg: win.leg, date: win.date, state, pop: roundTo(popMax, 20), pty: ptys.join("") }, basis: `${src.source} ${String(src.base || "").slice(0, 16)} 발표`, lifeSlot: true, window: win, chart: { type: "commute", leg: win.leg, date: win.date, a: win.a, b: win.b, startW: win.startW, endW: win.endW, popHigh: R.popHigh, hours: fc.filter((h) => h.time >= wallAdd(win.startW, -2) && h.time <= wallAdd(win.endW, 3)).map((h) => ({ time: h.time, ...elementInterval(h.time, "pty"), pty: h.pty ?? null, pop: fin(h.pop) ? h.pop : null, overlap: overlapsCommute(h.time, "pty", win) })) }, scene: { kind: state === "pty" ? (ptys.some((p) => /눈/.test(p)) ? "snow" : "rain") : "cloud", source: "fcst", time: ref.time } }));
}

export const CATALOG = { H01, W01, T01, T02, R01, R02, R03, R04, S01, C01, N01, T03, L01 };
// 모든 규칙 실행: { cands, diag{ruleId: {fired, reason}} } — 한 규칙이 실패(예외)해도 나머지는 계속
export function runCatalog(ctx, only = Object.keys(CATALOG)) {
  const cands = [], diag = {};
  for (const id of only) {
    try {
      const r = CATALOG[id](ctx);
      diag[id] = { fired: r.fired, reason: r.reason };
      if (r.fired && r.cand) cands.push(r.cand);
    } catch (e) { diag[id] = { fired: false, reason: `오류: ${String(e.message || e).slice(0, 80)}` }; }
  }
  return { cands, diag };
}
