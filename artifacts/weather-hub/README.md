# 기상허브 분배 안내

사내 공통 기상데이터 허브입니다. 업무시스템(구내식당 등)은 기상청이 아니라 이 허브만 호출합니다.

## 포함 파일

- `server.mjs` — 수집·조회·키 등록 API
- `public/index.html` — 운영 화면
- `data/hourly.json` — 관측(시드/공식)
- `data/jobs.json` — 수집 이력
- `data/settings.json` — 인증키(있으면). **배포 패키지에 넣지 마세요**

필요 환경: Node.js 20 이상, 아웃바운드 HTTPS(공식 수집 시 data.go.kr)

## 1) 폴더 복사 (가장 단순)

1. `weather-hub` 폴더를 대상 서버로 복사합니다.
2. `data/settings.json`이 있으면 삭제하거나 대상에서 다시 등록합니다.
3. 실행:

```bash
cd weather-hub
node server.mjs
```

기본 포트 8080. 바꾸려면 `PORT=3000 node server.mjs`

브라우저에서 허브 화면을 열고 공공데이터포털 serviceKey를 **그 화면에서** 등록한 뒤 전날 공식수집을 실행합니다.

## 2) Docker

```bash
docker compose up -d --build
```

환경변수:

| 이름 | 용도 |
|---|---|
| `PORT` | 서비스 포트 (기본 8080) |
| `KMA_API_KEY` | 공공데이터포털 serviceKey. 이미지에 넣지 말 것 |
| `TZ` | `Asia/Seoul` |

키는 compose의 환경변수 또는 오케스트레이터 시크릿으로만 주입합니다.

## 3) 사내 여러 시스템에 제공

허브는 **한 곳만** 운영하고, 구내식당·시설·에너지는 HTTP로 조회만 합니다.

```
GET /api/hourly?stationId=108&from=2026-09-16 00:00:00&to=2026-09-16 23:00:00
```

상태: `GET /api/status`  
수집: 운영자만 `POST /api/collect` (키 필요)

업무 DB에 기상 테이블을 복제하거나 기상청 키를 각 시스템에 나눠 주지 않습니다.

## 4) 운영 시 주의

- 공식 시간자료는 전일(D-1), 전일은 11시 이후 조회
- NULL 강수를 0으로 바꾸지 않음
- 관측과 예보를 같은 저장소에 섞지 않음
- 백업 대상: `data/settings.json`(키), `data/jobs.json`, 지점·설정. 관측은 재수집 가능
- 시드(`source_kind=SEED`)는 미리보기용. 공식수집 성공 시 UPSERT로 덮임

## 5) 점검

1. `/api/status`에 `hourlyRecords` > 0
2. 서울 108, 전날 00–23시 조회 건수 확인
3. 키 등록 후 공식수집 `COMPLETED`인지 확인
4. 출처가 `OFFICIAL`인지 확인
