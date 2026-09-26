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

---

## 7) 카카오 로그인 (관리 메뉴 보호)

조회 화면(대시보드·시간자료·일자료·다운로드)은 누구나 볼 수 있고, 관리 메뉴(자료수집·미적재 현황·수집이력·관측지점·공급원·사용자)와 모든 쓰기 API는 **승인된 카카오 계정**만 쓸 수 있습니다.

**키가 없으면 로그인 기능은 꺼져 있습니다.** 이때는 예전과 똑같이 동작하고(로그인 버튼 없음, 쓰기 API 공개), 시작할 때 로그에 다음 한 줄이 남습니다.
`auth disabled (KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET not set) · 관리 기능 공개 상태`

### 7-1. 카카오 개발자 콘솔 설정 (developers.kakao.com)

- 앱 > 플랫폼 > Web 사이트 도메인: `https://weather.nuni.co.kr`
- 카카오 로그인: 활성화 ON, Redirect URI: `https://weather.nuni.co.kr/auth/kakao/callback`
- 동의항목: 닉네임(필수). 프로필 사진은 선택이고, 이메일은 쓰지 않습니다.
- 보안 > Client Secret: 코드 발급 후 **사용함**으로 설정
- 앱 키 > **REST API 키**와 Client Secret 코드를 받아 둡니다.

### 7-2. 환경변수 (`/etc/weather-hub.env`, systemd가 읽음)

| 변수 | 필수 | 설명 |
|---|---|---|
| `KAKAO_REST_API_KEY` | 필수 | 카카오 앱의 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 필수 | 카카오 로그인 Client Secret 코드 |
| `SESSION_SECRET` | 권장 | 로그인 state·세션 해시 서명용 무작위 값(32자 이상). 없으면 재시작할 때마다 임시 값이 생겨 **로그인이 모두 풀립니다** |
| `KAKAO_REDIRECT_URI` | 선택 | 기본값 `https://weather.nuni.co.kr/auth/kakao/callback` |
| `ADMIN_KAKAO_IDS` | 선택 | 쉼표로 구분한 카카오 회원번호. 승인 여부와 상관없이 관리자로 취급합니다(비상용) |

`KAKAO_AUTH_BASE`, `KAKAO_API_BASE`, `COOKIE_SECURE`는 로컬 테스트 전용이니 운영에서는 넣지 마세요.

### 7-3. 켜기 (서버에서 실행)

```bash
# 1) 세션 비밀값 만들기 (화면에 나온 값을 아래 SESSION_SECRET에 넣음)
openssl rand -base64 48

# 2) 환경파일에 추가 (값은 직접 입력, 따옴표 없이)
sudo tee -a /etc/weather-hub.env > /dev/null <<'ENV'
KAKAO_REST_API_KEY=<REST API 키>
KAKAO_CLIENT_SECRET=<Client Secret 코드>
SESSION_SECRET=<1)에서 만든 값>
ENV
sudo chown root:root /etc/weather-hub.env
sudo chmod 600 /etc/weather-hub.env

# 3) 재시작
sudo systemctl restart weather-hub
systemctl is-active weather-hub
```

### 7-4. 확인

```bash
journalctl -u weather-hub -n 20 --no-pager
#  → "auth enabled · kakao login · store=postgresql · cookie=__Host-nw_session (Secure) · admin ids=0" 한 줄이 보여야 함
#    (SESSION_SECRET 경고가 같이 나오면 값이 비었거나 32자 미만입니다)

curl -s https://weather.nuni.co.kr/api/me
#  → {"authEnabled":true,"loggedIn":false,...}

curl -s -o /dev/null -w '%{http_code}\n' -X POST https://weather.nuni.co.kr/api/collect \
  -H 'Origin: https://weather.nuni.co.kr' -H 'content-type: application/json' -d '{}'
#  → 401 (로그인 필요). 수집은 일어나지 않습니다.

curl -s -o /dev/null -w '%{http_code}\n' https://weather.nuni.co.kr/api/gaps
#  → 401
```

키를 넣고 처음 시작하면 PostgreSQL에 `app_users`, `app_sessions` 테이블이 `CREATE TABLE IF NOT EXISTS`로 만들어집니다(`auth-schema.sql`). 기존 테이블과 자료는 건드리지 않습니다.

### 7-5. 첫 관리자 승인

카카오로 처음 로그인한 계정은 **승인 대기**로 저장되고, 관리 메뉴에는 "관리자 승인 대기 중입니다"와 카카오 회원번호가 표시됩니다.

```bash
cd /opt/weather-hub
node scripts/approve-user.mjs --list          # 로그인한 사용자 목록 (회원번호, 닉네임, 상태)
node scripts/approve-user.mjs <카카오회원번호>   # 승인
node scripts/approve-user.mjs --block <회원번호>    # 차단 (그 사용자의 세션도 바로 끊김)
node scripts/approve-user.mjs --pending <회원번호>  # 승인 대기로 되돌리기
```

스크립트는 `DATABASE_URL` 환경변수를 쓰고, 없으면 `/etc/weather-hub.env`에서 읽습니다(root로 실행). 승인된 사용자는 화면에서 **승인 여부 다시 확인**을 누르거나 새로고침하면 됩니다. 그 뒤에는 관리 > **사용자** 화면에서 다른 사람을 승인하거나 차단할 수 있습니다.

### 7-6. 끄기 / 롤백

`/etc/weather-hub.env`에서 `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` 줄을 지우고 `systemctl restart weather-hub` 하면 예전(공개) 동작으로 돌아갑니다. `app_*` 테이블은 남아 있어도 문제없습니다.

### 7-7. 보호 범위

- 로그인이 켜져 있을 때 GET/HEAD/OPTIONS가 아닌 모든 요청은 같은 출처(Origin/Referer 호스트 일치)가 아니면 403이고, `/auth/logout`을 뺀 나머지는 승인된 관리자만 쓸 수 있습니다. 응답은 401 `{"auth":"login"}`, 403 `{"auth":"pending"|"blocked"|"csrf"}`입니다.
- 관리자 전용 GET: `/api/gaps`, `/api/jobs`, `/api/admin/*`
- 공개 `/api/dashboard`, `/api/status`: 관리자가 아니면 인증키 일부(keyHint)와 수집 작업의 상세 메시지를 숨기고, 등록 여부만 보여 줍니다.
- 세션 쿠키 `__Host-nw_session`: HttpOnly, Secure, SameSite=Lax, 30일 유지. 로그인할 때마다 새로 발급하고, DB에는 토큰 원문이 아닌 HMAC 해시만 저장합니다. 만료된 세션은 매시간 지웁니다.
