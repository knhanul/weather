// 이야기·판정 규칙 상수 한곳 모음(astra 지침 3-1·4·8·13·15). 값은 서비스 초기 설정이며 기상청 특보·공식 기준이 아니다.
// 상수를 바꾸면 RULES_VERSION 을 올린다(이야기 객체·캐시·나중의 사전 계산 스냅샷이 이 값을 함께 기록).
// 기존 숫자(평균·차이·백분위·순위)는 이 모듈로 옮겨도 바뀌지 않게, 기존 함수가 쓰던 값과 같은 값만 둔다.
export const RULES_VERSION = "2026-10-17.1";
export const STORY_SCHEMA_VERSION = 1;
export const TEMPLATE_VERSION = 1;

// 표본·완전성(기존 rt-baseline 기본값과 같음 — 여기서는 참조만, 계산은 rt-baseline 이 함)
export const SAMPLE_RULES = { minInYearShare: 0.5, minYearShare: 0.8, minSamplesRank: 60, windowDays: 7 };

// 이야기 선별(기존 STORY_RULE 과 같은 값)
export const SELECT_RULES = { minUnusual: 0.3, wUnusual: 0.6, wInfo: 0.4, forecastFactor: 0.9, recentFactor: 0.5, max: 4 };

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

// 지역 비교(1-2·13장)
export const REGION_RULES = { minStationsStory: 6, deviationDigits: 3 };

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

export const RULES = { RULES_VERSION, STORY_SCHEMA_VERSION, TEMPLATE_VERSION, SAMPLE_RULES, SELECT_RULES, DIFF_LEVELS, RAIN_PCT_LEVELS, LIFE_RULES, SEASON_WINDOWS, REGION_RULES, FORECAST_RULES };
