// 이야기·판정 규칙 상수 한곳 모음(astra 지침 3-1·4·8·13·15). 값은 서비스 초기 설정이며 기상청 특보·공식 기준이 아니다.
// 상수를 바꾸면 RULES_VERSION 을 올린다(이야기 객체·캐시·나중의 사전 계산 스냅샷이 이 값을 함께 기록).
// 기존 숫자(평균·차이·백분위·순위)는 이 모듈로 옮겨도 바뀌지 않게, 기존 함수가 쓰던 값과 같은 값만 둔다.
export const RULES_VERSION = "2026-10-17.2";
export const STORY_SCHEMA_VERSION = 1;
export const TEMPLATE_VERSION = 2;

// 표본·완전성(기존 rt-baseline 기본값과 같음 — 여기서는 참조만, 계산은 rt-baseline 이 함)
export const SAMPLE_RULES = { minInYearShare: 0.5, minYearShare: 0.8, minSamplesRank: 60, windowDays: 7 };

// 이야기 선별(기존 STORY_RULE 과 같은 값)
export const SELECT_RULES = { minUnusual: 0.3, wUnusual: 0.6, wInfo: 0.4, forecastFactor: 0.9, recentFactor: 0.5, max: 4 };

// 이야기 선별 2판(5장). score = 0.35U + 0.35A + 0.15T + 0.15F − R. 예보 일괄 ×0.9 는 없앰.
//   통계 경로(stat): 표본 조건 + U ≥ minUnusual. 생활·전환 경로(life): 규칙의 조건만(U 기준 없음, U 가 없으면 0).
//   R(반복 감점): 이전 발행에서 같은 eventId·materialHash 를 24시간 안에 보였으면 0.20, 24~72시간이면 0.10.
//   F(새 정보): 처음 = 1.0, 같은 사건인데 내용(materialHash)이 바뀜 = 0.6, 같은 내용 = 0.2.
//   같은 발행 구간(KST 날짜) 안의 재요청은 이력에 새로 세지 않는다(카드가 같은 날 흔들리지 않게).
export const SELECT_V2 = {
  w: { U: 0.35, A: 0.35, T: 0.15, F: 0.15 },
  minUnusual: 0.3, max: 4,
  repeat: { within24h: 0.2, within72h: 0.1 },
  fresh: { new: 1, changed: 0.6, same: 0.2 },
  perTopic: 1, perTopicSeparateDecision: 2, leadMinT: 0.8, historyDays: 3,
};
// 시점 가치 T(5-2): 진행 중·6시간 안 1.0, 24시간 안 0.8, 72시간 안 0.5, 그 뒤 0.3 / 끝난 일: 24시간 안 0.8, 72시간 안 0.5, 그 전 0.2 / 시점 없는 기후 설명 0.5
export const TIME_VALUE = { nowOr6h: 1, in24h: 0.8, in72h: 0.5, later: 0.3, past24h: 0.8, past72h: 0.5, older: 0.2, timeless: 0.5 };
// 생활 관련성 A(5-2): 지금·다음 생활구간 결정(옷차림·우산 등) 1.0, 하루 일정 0.7, 알아 두면 좋은 정보 0.5, 과거·기후 설명 0.3
export const LIFE_VALUE = { decision: 1, day: 0.7, info: 0.5, climate: 0.3 };
// 주제(5-3): 같은 주제는 1개, 다른 생활 결정이면 2개까지
export const TOPICS = { temperature: "기온", precipitation: "비·눈", "wind-humidity": "바람·습도", sky: "하늘", season: "계절", memory: "과거", region: "지역", climate: "기후", "forecast-revision": "예보 변화" };

// 새 이야기 규칙(3-2). 값은 서비스 초기 설정이며 기상청 특보 기준이 아니다. 백분위 p = (작은 값 수 + 같은 값 수/2)/N, N ≥ 60.
//   U2 = 2|p−0.5|(양쪽), Uhi = max(0, 2p−1), Ulo = max(0, 1−2p). 재현 기간(몇 년 만에)은 쓰지 않는다.
export const STORY_RULES = {
  H01: { dryMax: 30, dryP: 0.1, humidMin: 85, humidP: 0.9 },
  W01: { min: 5, p: 0.9 },
  T01: { bigMin: 10, bigP: 0.9, smallMax: 5, smallP: 0.1 },
  T02: { p: 0.1, nearMin: 1 },
  R01: { minDays: 7, p: 0.9 },
  R02: { minDays: 3, p: 0.9 },
  R03: { days: 7, p: 0.9 },
  R04: { wetMin: 0.1, minWetSamples: 30, minWetYears: 4 },
  S01: { minPosSamples: 30, minPosYears: 4, maxAgeDays: 2 },
  C01: { hours: 4, fromHour: 8, toHour: 19, aheadHours: 24 },
  N01: { min: 25, fromHour: 19, hours: 15 },
  T03: { delta: 4, hours: 3, aheadHours: 24, minU: 0.8, usualFlat: 1 }, // 2단계 되돌려 보기에서 추가: 평소 흐름과 같은 방향이면 뺌(맑은 날 아침·저녁 변화로 거의 매일 나와서)
  L01: { am: [7, 9], pm: [18, 20], popHigh: 60 },
};

// 차이 표현 단계(8장). 경계: absΔ < similar → 비슷, < slight → 조금, < notable → 꽤, 그 이상 상당히
export const DIFF_LEVELS = {
  ta: { unit: "℃", similar: 1, slight: 3, notable: 5 },
  hm: { unit: "%p", similar: 5, slight: 10, notable: 20 },
  ws: { unit: "m/s", similar: 1, slight: 2, notable: 4 },
};
// 강수량은 고정 mm 등급을 만들지 않고 같은 집계기간 분포의 백분위로만(8장)
export const RAIN_PCT_LEVELS = { many: 90, veryMany: 99 };

// 생활 판정(지금 러닝 등) — 조건은 기존 산책·러닝 기본값(OUTDOOR_DEFAULT)을 그대로 쓰고, 결측은 '판단 보류'
export const LIFE_RULES = { rainDryMax: 0.1 };

// 계절 신호 홈 노출 기간(4장). months = 노출하는 달, daysAfter = 사건 확인 뒤 며칠까지
export const SEASON_WINDOWS = {
  "first-hot-day": { label: "올해 처음 최고 30℃ 이상", threshold: 30, months: [3, 4, 5, 6, 7, 8, 9], daysAfter: 7 },
};
// 계절 신호 다섯 가지(4장 표, 4단계 rt-season.mjs). minOccur = 대표 날짜를 낼 최소 발생 시즌, minRank = 순위를 말할 최소 발생 시즌
export const SEASON_EVENTS = {
  "first-hot-day": { label: "올해 처음 최고 30℃ 이상", short: "첫 30℃", startMd: "01-01", field: "max", threshold: 30, unit: "℃", test: (v) => v >= 30, months: [3, 4, 5, 6, 7, 8, 9], daysAfter: 7, minOccur: 4, minRank: 10, fcField: "max" },
  "first-frost": { label: "이번 추운 계절 처음 일최저 0℃ 미만", short: "첫 영하", startMd: "08-01", field: "min", threshold: 0, unit: "℃", test: (v) => v < 0, months: [9, 10, 11, 12, 1, 2, 3], daysAfter: 7, minOccur: 4, minRank: 10, fcField: "min", note: "서리 관측과 다름" },
  "first-snow": { label: "이번 눈 계절 처음 새로 쌓인 눈", short: "첫 신적설", startMd: "10-01", field: "nsnow", threshold: 0, unit: "cm", test: (v) => v > 0, months: [10, 11, 12, 1, 2, 3, 4], daysAfter: 7, minOccur: 4, minRank: 10, note: "첫눈 관측과 다름" },
  "first-warm-night": { label: "올해 첫 열대야 추정", short: "첫 열대야(추정)", startMd: "01-01", hourly: true, night: { fromHour: 19, hours: 15 }, threshold: 25, unit: "℃", test: (v) => v >= 25, months: [5, 6, 7, 8, 9, 10], daysAfter: 7, minOccur: 4, minRank: 10, note: "정시 15개로 판단한 추정 — 공식 열대야 확정과 다름" },
  "last-hot-day": { label: "가장 최근 최고 30℃ 이상인 날", short: "마지막 30℃", kind: "last", startMd: "01-01", field: "max", threshold: 30, unit: "℃", test: (v) => v >= 30, months: [8, 9, 10, 11], retroMonths: [1, 2], daysAfter: 7, minOccur: 4, minRank: 10, note: "연말 전에는 '올해 마지막'이라 하지 않음" },
};

// 지역 비교(1-2·13장)
export const REGION_RULES = { minStationsStory: 6, deviationDigits: 3, topMinU: 0.8, spreadP: 0.9, togetherDelta: 3, togetherShare: 0.5 };

// 예보 문구(1-4·6장) — 화면(public/rt-forecast-visual.js·rt-home.js)도 같은 값을 쓴다(값을 바꾸면 그쪽 RULES 도 같이)
export const FORECAST_RULES = { popHigh: 60, drop3h: 4, dayJump: 5, releaseJump: 3, fullHours: 72 };

// 빈 이야기 사유(1-3)
export const EMPTY_REASONS = {
  normal: "오늘은 평소와 크게 다른 점이 없습니다",
  insufficient: "비교할 자료가 부족해 오늘의 이야기를 고르지 못했습니다",
  stale: "실황 자료가 늦어지고 있어 오늘의 이야기를 고르지 않았습니다",
  loading: "이야기를 고르는 중입니다",
  error: "일부 자료를 불러오지 못해 이야기를 고르지 못했습니다",
};

export const RULES = { RULES_VERSION, STORY_SCHEMA_VERSION, TEMPLATE_VERSION, SAMPLE_RULES, SELECT_RULES, SELECT_V2, TIME_VALUE, LIFE_VALUE, TOPICS, STORY_RULES, DIFF_LEVELS, RAIN_PCT_LEVELS, LIFE_RULES, SEASON_WINDOWS, SEASON_EVENTS, REGION_RULES, FORECAST_RULES };
