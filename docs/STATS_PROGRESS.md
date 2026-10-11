# 날씨 통계 작업 기록

| 시각(KST) | 단계 | 내용 |
|---|---|---|
| 2026-10-11 06:40 | A 조사 | `docs/STATS_SURVEY.md` — 운영 DB 항목별 채움 비율, 강수 공란 = 무강수 근거, 기상청 정의 |
| 2026-10-11 07:10 | B·C 엔진·API | `stats-engine.mjs`(기간 해석·결측·지표·순위·1990년대 대비·진행 중 비교·지역 공통 연도·CSV), `stats-data.mjs`(지점별 일자료 메모리, 저장 시 비움), `stats-api.mjs`(`/api/stats/meta·yearly·overlay·region·highlights`, `format=csv`), `db*.mjs statsDailyRows`, `server.mjs` 연결. 테스트 `scripts/stats-engine.test.mjs` 19개 통과 |
| 2026-10-11 07:50 | D 화면 | `public/stats.js`(탭 라우팅·조건 고르기·SVG 그래프·툴팁·요약표·CSV 링크·계산 기준), `public/index.html`(메뉴 이름, 탭, 질문 카드, CSS). 생활 속 날씨·날씨 기록은 숫자 없는 '준비 중' + 지금 볼 수 있는 연도별 비교 바로가기만 |
| 2026-10-11 08:20 | E·F 검증(시험 컨테이너) | OVH `weather-stats-test`(127.0.0.1:8099, 같은 .env·NAS) 에서: 통계 API 0.11~0.47초, NAS SQL 직접 집계와 값 대조(5월 평균기온 37개 연도, 연 강수일수·총강수량 36개 연도, 2018 여름 기간 최고 39.6℃@8/1 과 최고기온 평균 31.3℃, 2025 겨울 2024.12.1~2025.2.28 영하일 78일) 모두 일치. 기존 API 16개 응답 해시 운영과 동일(health 의 db_ms 만 다름), 관리자 API 401·POST 403 그대로. `node --test scripts/*.test.mjs` 271 중 실패 7 — 1dece0e 에서도 같은 7개(브랜드/공유카드·auth 스키마 테스트, 이번 변경과 무관). 스크린샷 /workspace/shots/stats-*.png (1440·390, 가로 넘침 없음, 콘솔 오류 없음) |
| 2026-10-11 08:40 | F 배포 | 운영 반영 `8b72fda`(이미지 local/weather-hub:8b72fda, 백업 /srv/weather-hub/app.prev-1dece0e). 시작 시 8개 지점 일자료 메모리 적재 지점당 0.36~0.65초, 메모리 31MiB/192MiB. 서버 안 측정: 연도별·겹쳐보기·카드 0.1초, 지역 4곳 0.39~0.43초. 운영 주소로 화면 스크린샷 다시 찍음(콘솔 오류·가로 넘침 없음). 시험 컨테이너 삭제. 새 DB 테이블·인덱스는 만들지 않음(지점 기본 키 범위 읽기 + 앱 메모리로 충분) |
| 다음(2단계) | | 생활 속 날씨(주말/평일 강수 비율, 산책·러닝 조건 시간 비율, 출퇴근 강수, 첫·마지막 30℃, 연속 강수·무강수, 기념일·생일, 열대야 추정), 날씨 기록(보유 기간 순위, 특정 날짜 과거 날씨) |
| 2026-10-11 09:30 | 2단계 엔진·API | `stats-engine.mjs`: 눈 지표(신적설 날·눈 쌓인 날·하루 신적설 최대·최심적설 최대 — 합산 없음), 첫/마지막 30℃·일수, 연속 강수·무강수(결측일에서 끊김), 주말·평일 비율(유효 관측일 분모), 같은 월·일(2/29 윤년만), 기록 순위(동점 같은 순위·10위 동점 포함), 시간자료 저장소(0.1 단위 Int16, 19자 중복 우선, rn_qcflg=9 결측), 산책·러닝 사용자 조건, 출퇴근 강수, 열대야 추정(19~다음 날 09시 15개 정시 모두 필요). `stats-hourly.mjs`(시간자료 메모리 캐시, 저장 시 그 날짜부터 다시 읽음). API `/api/stats/life/{heat,streaks,weekend,day,outdoor,commute,tropical}`, `/api/stats/records`, `/api/stats/date`, `highlights?set=life` (+CSV). `db*.mjs statsHourlyRows·statsDayRow`. 테스트 `scripts/stats-life.test.mjs` 13개 통과 |
| 2026-10-11 10:40 | 2단계 화면 | 생활 속 날씨 8개 보기 + 날씨 기록 3개 보기, 첫 화면 질문 카드에 '더위가 더 일찍'·'주말마다 비?'·'날씨 기록' 연결, '준비 중' 제거. 모바일 탭 3+2 줄바꿈, 연도·시간 범위 선택 한 줄 |
| 2026-10-11 11:20 | 2단계 검증 | 단위 테스트 32개(1단계 19 + 2단계 13) 통과. NAS SQL 직접 대조: 서울 최고기온 1~3위, 일강수량 1~3위, 주말/평일 유효일·강수일(3,836/1,144, 9,595/2,874), 5/5 37개 해 중 9개, 2024 첫·마지막 30℃(06-05/09-19, 80일), 2024 출근 7~9시 평일 671시각 중 49, 2024 열대야 추정 122밤 중 50 — 모두 API 와 같음. 실제 자료로 그래프 값=표=CSV 10개 응답 확인. 기존 API 해시 비교: /api/health(db_ms) 외 모두 같음, 관리 POST 403 유지 |
| 2026-10-11 11:30 | 2단계 배포 | 운영 `6ee4c3b`(백업 /srv/weather-hub/app.prev-1dece0e = 1단계 코드, .env.bak-1dece0e). 시작 시 일자료 8지점 0.4~2.4초, 시간자료 8지점 9.2~10.4초(뒤에서), 메모리 48.7MiB/192MiB. 서버 안 응답 0.11~0.22초. 운영 주소 스크린샷 /workspace/shots/stats2-*.png(16개 화면 × 데스크톱·모바일 + 툴팁), 콘솔 오류·가로 넘침·'준비 중' 없음 |

## 그래프 크게 보기(2026-10-11)
- 공통 컴포넌트 `public/chart-full.js` + `public/chart-full.css`(외부 파일, 인라인 스크립트·style 속성 없음; 크기·회전은 CSSOM). 대시보드 기온 그래프, 날씨 통계 SVG 그래프 전부(`chart()` 경유), 지역별 같은 기간 HTML 막대에 적용.
- 열기: 그래프 오른쪽 위 ⤢ 버튼(주 동작) · 터치 두 번 톡(320ms·30px 안). 한 번 톡은 기존 툴팁.
- 모바일: `requestFullscreen` → `screen.orientation.lock('landscape')`. 고정 실패 + 세로 화면이면 무대를 `translateX(폭) rotate(90deg)` 로 돌림. 열린 채 기기를 돌리면 다시 판정해 다시 그림.
- 다시 그리기: 같은 그리기 함수에 겹친 화면 크기(W×H)를 넘김(그림 확대 아님). 포인터 → 가로 위치는 `ChartFull.frac()`(돌린 상태에서는 clientY 사용), 툴팁 위치는 레이아웃 폭 기준.
- 닫기: ✕ · 뒤로(history.pushState) · Esc · (데스크톱) 바깥 클릭 · (안드로이드) 전체 화면이 끝나면. 닫을 때 orientation.unlock + exitFullscreen, 초점 되돌림.
- 함께 고침: 터치에서 손을 떼면 pointerleave 로 툴팁이 바로 사라지던 문제(터치는 다음 탭까지 유지).
- 확인: `scripts/e2e/chart-full.e2e.mjs`(Playwright 모바일 에뮬레이션: iOS 대체/안드로이드 스텁/가로/데스크톱, 30여 항목 통과), `scripts/e2e/csp-harness.mjs`(엄격 CSP 위반 0), 회귀 해시(health 의 db_ms 외 동일). 실제 기기(iPhone·Android)는 미확인.
- 참고: 사이트는 현재 CSP 헤더를 보내지 않으며 기존 index.html 인라인 `<script>`·`<style>`·style 속성이 있어 엄격 CSP 를 바로 켤 수는 없음(새 컴포넌트는 준비됨). PWA: manifest(display standalone) 있음, 서비스 워커 없음.

## 2026-10-11 — 메뉴 이름 변경 · 보기 설정 · 시간별/일별 날씨 그리드|카드

- 메뉴: 시간자료 → **시간별 날씨**(`#/hourly-weather`), 일자료 → **일별 날씨**(`#/daily-weather`), 다운로드 → **보기 설정**(`#/view-settings`). 예전 `#/hourly`·`#/daily`·`#/download` 는 `?조건`을 그대로 두고 새 주소로 바꿔 줌(replaceState).
- `/api/view` (새, 공개 GET): `kind, stationId, from, to, columns, page, pageSize(≤1000, 기본 200)` → 고른 컬럼만(+ 출처 표시용 `source_kind`) 페이지 단위. 시간자료는 DB `LIMIT/OFFSET`, 일자료는 기간(≤3700일) 전체를 공식 + 시간자료 집계로 만든 뒤 자름(`/api/export` 와 같은 경로). 기존 `/api/hourly`·`/api/daily`·`/api/export*` 응답은 바꾸지 않음(해시 비교 SAME).
- `/api/view-prefs` (새): 로그인 사용자별 `{kind: {view: grid|card, layout: preset:<id>|custom:<내 레이아웃 id>}}`. 비로그인 401, 차단 거절, 다른 사이트 쓰기 403, 남의 레이아웃 id·다른 종류 프리셋은 400. 표 `view_prefs`(migrations/mysql/0004, hub/0005 — 새 표만 추가).
- 화면(public/views.js·views.css): 레이아웃 선택(기본 프리셋 + 내 레이아웃, ★ 표시) + 그리드|카드. 처음 레이아웃 = 주소 > (이 화면에서 마지막에 고른 것 / 보기 설정의 ★ 중 더 최근 것) > 기본 구성. 보기 방식은 주소 > 저장값 > (폭 640px 미만이면 카드, 아니면 그리드). 비로그인은 localStorage, 로그인은 계정. 보기 방식 전환은 다시 받지 않고, 이미 받은 컬럼으로 되는 레이아웃도 다시 받지 않음.
- 보기 설정: 비로그인은 기본 프리셋 읽기 전용(컬럼 체크·순서·저장 잠금 + 로그인 안내), 그 구성으로 CSV 내려받기는 그대로. `#/view-settings?kind=&layout=` 로 열 수 있음(시간별·일별 날씨의 '레이아웃 만들기·편집' 링크). 기본 프리셋이 선택 상자에 비어 보이던 문제(`preset:default`)도 고침.
- 일별 날씨 기본 기간: 최근 7일(예전: 공식 최신 하루).
- 검증: scripts/view.test.mjs 10건, scripts/e2e/views.e2e.mjs 36항목(비로그인 = 테스트 컨테이너 실제 자료, 로그인 = 로컬 JSON 모드 테스트 세션), 기존 API 해시 비교 26건 SAME.
- 시간: `/api/view` 시간자료 한 달 0.23초, 1990~2026 전체 범위 첫 쪽 1.8초·1600쪽 4.2초(COUNT + 깊은 OFFSET, 예전 /api/hourly 와 같은 방식), 일자료 10년 2.1초·한 달 0.9초.

## 2026-10-11 · 보기 설정 정리 + 화면별 CSV 내려받기 (8550490, 배포됨)
- 보기 설정에서 미리보기·내려받기 범위 카드 제거(컬럼·레이아웃 전용). 시간별/일별 날씨 결과 막대에 'CSV 내려받기' 버튼: 지금 조회한 지점·기간 전체 행, 고른 레이아웃 컬럼 순서. 기존 /api/export 그대로 사용(행 수 상한 없음 → 전체 건수 표시, 큰 파일 안내).
- 검증: scripts/e2e/dl.mjs(CSV 머리글 = 그리드 컬럼, 행 수 = 조회 전체 건수) 테스트 컨테이너 + 운영에서 ALL PASS.

## 2026-10-11 · 메뉴 구조: 날씨 통계 하위 메뉴 + 질문으로 보는 날씨 (02b2700, 2fd4be8)
- 왼쪽 메뉴 '날씨 통계' 아래 하위 메뉴: 한눈에 보기(#/stats/overview, #/ 도 같은 화면)·연도별 비교·지역별 비교·생활 속 날씨·날씨 기록. 본문 탭 줄은 제거. 화면 제목 = 하위 메뉴 이름.
- 주 메뉴 '질문으로 보는 날씨'(#/questions?station=): 질문 카드(예전 한눈에 보기 아래) + 생활 속 질문 카드(예전 생활 속 날씨 › 질문 모아 보기). 예전 #/stats/life?view=cards → #/questions 로 바꿔 줌. 생활 속 날씨 기본 보기 = 더위가 일찍 올까, 그 하위 메뉴의 '질문 모아 보기'는 #/questions 로.
- 한눈에 보기에서 시스템 카드(자료 건수·최근 수집·저장소)·미적재 링크 제거 → 수집이력(관리) 화면 위로 옮김. 머리 상태 칩: 조회 화면은 '공식 최신'만, 관리 화면은 전과 같이 전부.
- 모바일: 조회 줄은 줄바꿈(가로 넘침 없음), 날씨 통계 화면일 때만 하위 메뉴 줄 표시.
- 검증: scripts/e2e/nav.mjs ALL PASS(스크린샷 /workspace/shots/nav-*.png), views·dl·chartfull e2e 재실행 ALL PASS, 회귀 해시 비교.
