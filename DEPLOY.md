# 클라우드 배포 및 분배 안내

Git 저장소(`https://github.com/knhanul/weather.git`)에서 소스를 내려받아 클라우드 서버에 배포하고, 사내 업무시스템에 분배하는 방법을 설명합니다.

## 0) 사전 준비

| 항목 | 요구사항 |
|---|---|
| OS | Linux(Ubuntu/Amazon Linux 등) 권장, Windows도 가능 |
| Git | `git --version` 실행 가능 |
| Node.js | 20 이상 (`node -v` 확인) |
| 네트워크 | 인바운드 8080(또는 지정 포트), 아웃바운드 HTTPS(`apis.data.go.kr`) |
| 인증키 | 공공데이터포털 serviceKey — Git에 넣지 않고 배포 후 등록 |

> **주의**: `data/settings.json`(인증키)은 `.gitignore`로 제외되어 있으므로, 클론 후에는 **반드시 허브 화면에서 다시 등록**해야 합니다.

---

## 1) 최초 배포 (클론)

### 1-1. 소스 내려받기

```bash
# 배포 디렉터리로 이동
cd /opt

# 클론
git clone https://github.com/knhanul/weather.git weather-hub
cd weather-hub
```

### 1-2. Node.js 직접 실행

```bash
# 의존성 없음 — 바로 실행 가능
node server.mjs
```

- 기본 포트: `8080`
- 포트 변경: `PORT=3000 node server.mjs`
- 백그라운드 실행 권장: `nohup node server.mjs > weather-hub.log 2>&1 &` 또는 systemd 서비스 등록

### 1-3. Docker 실행 (권장)

```bash
docker compose up -d --build
```

환경변수는 `docker-compose.yml` 또는 오케스트레이터 시크릿으로 주입:

| 이름 | 용도 |
|---|---|
| `PORT` | 서비스 포트 (기본 8080) |
| `KMA_API_KEY` | 공공데이터포털 serviceKey — 이미지/코드에 넣지 말 것 |
| `TZ` | `Asia/Seoul` |

---

## 2) 업데이트 배포 (Pull)

소스가 변경되었을 때 클라우드 서버에 최신 코드를 반영하는 절차입니다.

### 2-1. Node.js 직접 실행 환경

```bash
cd /opt/weather-hub

# 데이터 백업 (settings.json, jobs.json 보호)
cp data/settings.json data/settings.json.bak 2>/dev/null || true
cp data/jobs.json     data/jobs.json.bak

# 최신 코드 내려받기
git pull origin main

# 재기동 (실행 중인 프로세스 종료 후 재실행)
pkill -f "node server.mjs" || true
nohup node server.mjs > weather-hub.log 2>&1 &
```

> `data/` 디렉터리는 Git에서 추적되지만, `data/settings.json`은 제외됩니다. `git pull` 시 `data/hourly.json`, `data/jobs.json`이 원격 버전으로 덮어쓰기될 수 있으니 백업 후 풀하세요.

### 2-2. Docker 환경

```bash
cd /opt/weather-hub

git pull origin main

# 이미지 재빌드 + 컨테이너 재시작 (볼륨은 유지됨)
docker compose up -d --build
```

- `weather-data` 볼륨이 `data/`를 보존하므로 인증키/수집이력이 유지됩니다.
- 볼륨을 초기화해야 한다면: `docker compose down -v` (데이터 삭제 주의)

---

## 3) 자동 배포 (선택)

### 3-1. cron 기반 자동 pull

```bash
# 매 정시 10분에 자동 업데이트 (crontab -e)
10 * * * * cd /opt/weather-hub && git pull --ff-only origin main >> /var/log/weather-hub-pull.log 2>&1
```

> 코드만 갱신하고 재기동은 수동으로 수행합니다. 자동 재기동까지 원하면 systemd `ExecStartPost` 또는 별도 스크립트를 사용하세요.

### 3-2. GitHub Webhook + 스크립트 (권장)

서버에 webhook 수신 스크립트를 두고 push 시 자동 pull → 재기동:

```bash
#!/usr/bin/env bash
# /opt/weather-hub/deploy.sh
set -e
cd /opt/weather-hub
git pull --ff-only origin main
docker compose up -d --build
```

웹훅 수신은 nginx + 간단한 CGI, 또는 `webhook`([adnanh/webhook](https://github.com/adnanh/webhook)) 도구 사용.

---

## 4) 사내 시스템에 분배

허브는 **한 곳만** 운영하고, 구내식당·시설·에너지 등 업무시스템은 HTTP로 **조회만** 호출합니다. 각 시스템에 코드나 기상청 키를 나눠주지 않습니다.

### 4-1. 조회 API

```bash
# 상태 확인
curl "http://<hub-host>:8080/api/status"

# 시간자료 조회 (서울 108, 전날 00~23시)
curl "http://<hub-host>:8080/api/hourly?stationId=108&from=2026-09-16%2000:00:00&to=2026-09-16%2023:00:00"
```

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `/api/status` | GET | 허브 상태/레코드 수/키 등록 여부 |
| `/api/hourly` | GET | 시간자료 조회 (stationId, from, to) |
| `/api/jobs` | GET | 수집 이력 |
| `/api/key` | POST | 인증키 등록 (운영자) |
| `/api/collect` | POST | 공식 수집 실행 (운영자, 키 필요) |

### 4-2. 업무시스템 연동 예시

```js
// Node.js
const res = await fetch("http://hub.internal:8080/api/hourly?stationId=108&from=2026-09-16%2000:00:00&to=2026-09-16%2023:00:00");
const { data } = await res.json();
```

```python
# Python
import requests
r = requests.get("http://hub.internal:8080/api/hourly",
                  params={"stationId": "108", "from": "2026-09-16 00:00:00", "to": "2026-09-16 23:00:00"})
data = r.json()["data"]
```

### 4-3. 분배 원칙

- 업무 DB에 기상 테이블을 **복제하지 않음** — 필요 시점에 허브 조회
- 기상청 키를 각 시스템에 **나눠주지 않음** — 허브 1곳만 보유
- 허브 장애에 대비해 업무시스템은 조회 실패 시 캐시/기본값 폴백 권장

---

## 5) 운영 점검 체크리스트

배포 후 반드시 확인:

1. `GET /api/status` 응답의 `hourlyRecords` > 0
2. 서울(108) 전날 00–23시 조회 건수 정상 (24건)
3. 인증키 등록 후 `POST /api/collect` 결과가 `COMPLETED`
4. 수집된 데이터의 `source_kind`가 `OFFICIAL` (시드 `SEED`가 아님)
5. `data/settings.json`, `data/jobs.json` 정기 백업

---

## 6) 롤백

문제 발생 시 이전 커밋으로 되돌리기:

```bash
cd /opt/weather-hub

# 직전 커밋으로 롤백
git log --oneline -5
git reset --hard <이전-커밋-해시>

# Docker인 경우
docker compose up -d --build
```

데이터(`data/`)는 Git 히스토리와 무관하므로 백업본에서 복구:

```bash
cp data/settings.json.bak data/settings.json
cp data/jobs.json.bak     data/jobs.json
```
