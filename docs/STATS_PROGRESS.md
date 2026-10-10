# 날씨 통계 작업 기록

| 시각(KST) | 단계 | 내용 |
|---|---|---|
| 2026-10-11 06:40 | A 조사 | `docs/STATS_SURVEY.md` — 운영 DB 항목별 채움 비율, 강수 공란 = 무강수 근거, 기상청 정의 |
| 2026-10-11 07:10 | B·C 엔진·API | `stats-engine.mjs`(기간 해석·결측·지표·순위·1990년대 대비·진행 중 비교·지역 공통 연도·CSV), `stats-data.mjs`(지점별 일자료 메모리, 저장 시 비움), `stats-api.mjs`(`/api/stats/meta·yearly·overlay·region·highlights`, `format=csv`), `db*.mjs statsDailyRows`, `server.mjs` 연결. 테스트 `scripts/stats-engine.test.mjs` 19개 통과 |
