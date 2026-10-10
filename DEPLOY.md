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

---

## 8) 누니 ID 로그인 (`AUTH_PROVIDER=nuni-id`)

누니날씨 로그인을 카카오 직접 연동 대신 **누니 ID**(https://id.nuni.co.kr, OIDC)로 할 수 있습니다. `AUTH_PROVIDER` 가 없거나 `kakao` 면 7장의 카카오 로그인이 그대로 동작합니다(기본값, 코드도 그대로 남아 있음).

### 8-1. 동작

- 화면에는 **카카오 로그인 버튼만** 보입니다(문구·노란 버튼 모두 카카오 모드와 같음, 2026-10-02 결정). 버튼 → `https://id.nuni.co.kr/oauth/authorize` (PKCE S256 + state + nonce + `idp_hint=kakao`) → 누니 ID 화면 없이 바로 카카오 → 누니 ID 가 첫 이용자를 자동 가입(누니날씨 클라이언트는 1st-party) → → `/auth/nuni/callback` 에서 서버가 code 를 교환하고 id_token 을 JWKS(10분 캐시, 모르는 kid 면 다시 받음)로 검증합니다(서명 RS256, iss, aud/azp, exp, nonce, at_hash, `brand_id=nuni-weather`).
- 권한: 누니 ID 의 누니날씨 멤버십 역할이 `brand_admin` 또는 `staff`, 또는 `platform_admin` 이면 **관리**. `customer` 는 **조회 전용**이고 관리 화면에 "관리 권한이 없습니다. 관리자에게 요청하세요" 와 회원 ID 가 나옵니다(API 403 message 도 같은 문구). 역할은 로그인할 때 받아오므로 바꾼 권한은 **다음 로그인**부터 반영됩니다(세션 12시간).
- 세션은 7장과 같은 쿠키(`__Host-nw_session`)·`app_sessions` 를 씁니다. 사용자 행은 `app_users.kakao_id = 'nuni:<누니 회원 ID>'` 로만 저장합니다(닉네임·사진 없음). 카카오 모드 세션과 서로 섞이지 않습니다.
- 관리 > 사용자 화면은 누니 ID 관리 콘솔 안내로 바뀌고, `/api/admin/users/status` 는 410 입니다(승인·차단은 누니 ID 에서).
- 로그인된 동안은 누니 ID 세션으로 다시 묻지 않고 바로 로그인됩니다.
- 로그아웃: 누니날씨 세션을 지우고 누니 ID 세션도 끝냅니다(`end_session` + `id_token_hint`, 확인 화면 없이 누니날씨 `/` 로 복귀). id_token 은 HttpOnly 쿠키 `nw_idt`(Path=/auth/logout, 개인정보 없음)에 로그아웃 힌트로만 보관합니다.
- 로그아웃하면 표시 쿠키 `nw_relogin=1`(HttpOnly, Path=/auth/nuni, 30일)을 남깁니다. 다음 로그인 **한 번만** `prompt=login` 을 보내 카카오가 계정을 다시 묻습니다(다른 카카오 아이디로 로그인 가능). 로그인에 성공하면 지워지고, 취소하면 남아 다음 시도도 계정을 묻습니다. 일반 로그인에는 `prompt` 를 붙이지 않습니다. 카카오계정 자체(kakao.com)는 로그아웃하지 않습니다. 카카오톡 인앱 브라우저에서는 카카오가 `prompt=login` 을 지원하지 않습니다.
- `AUTH_PROVIDER=nuni-id` 인데 아래 필수 값이 빠지면 관리 기능을 **잠급니다**(503, 공개로 열리지 않음). 로그: `auth LOCKED (...)`.
- CSRF(같은 출처 검사)와 관리자 전용 GET/쓰기 API 보호는 7-7 과 같습니다. 쓰기에서 조회 전용 사용자는 403 `{"auth":"viewer"}`.

### 8-2. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `AUTH_PROVIDER` | — | `nuni-id` 면 누니 ID 로그인. 없거나 `kakao` 면 카카오 직접 로그인 |
| `NUNI_ID_ISSUER` | 필수 | `https://id.nuni.co.kr` |
| `NUNI_ID_CLIENT_ID` | 필수 | `nuni-weather-web` (누니 ID 에 등록된 클라이언트) |
| `NUNI_ID_CLIENT_SECRET` | 필수 | 클라이언트 비밀값 (누니 ID CLI 가 파일로만 발급, 화면에 출력하지 않음) |
| `SESSION_SECRET` | 권장 | 7-2 와 같음 |
| `NUNI_ID_REDIRECT_URI` | 선택 | 기본 `https://weather.nuni.co.kr/auth/nuni/callback` (누니 ID 에 등록된 값과 정확히 같아야 함) |
| `NUNI_ID_POST_LOGOUT_URI` | 선택 | 기본 `https://weather.nuni.co.kr/` |
| `NUNI_ID_BRAND` | 선택 | 기본 `nuni-weather` |
| `NUNI_ID_SESSION_HOURS` | 선택 | 기본 12 |
| `NUNI_ID_LOGOUT_SSO` | 선택 | 기본(빈 값/`1`): 로그아웃 때 누니 ID 세션도 끝냄(id_token_hint, 확인 화면 없음). `0` 이면 누니날씨 세션만 지움(다음 로그인 `prompt=login` 은 그대로) |
| `NUNI_ID_IDP_HINT` | 선택 | 기본 `kakao`: 누니 ID 로그인 화면을 건너뛰고 바로 카카오. 빈 값(`NUNI_ID_IDP_HINT=`)이면 누니 ID 화면을 보여 줌 |

현재(2026-09-27) 서버 `/etc/weather-hub.env` 에는 `NUNI_ID_ISSUER`·`NUNI_ID_CLIENT_ID`·`NUNI_ID_CLIENT_SECRET` 가 이미 들어 있고 `AUTH_PROVIDER` 는 없습니다(카카오 로그인 사용 중). 승희님(카카오 5107991059)은 누니 ID 에 미리 만들어져 누니날씨 `brand_admin` + `platform_admin` 입니다.

### 8-3. 전환 절차 (id.nuni.co.kr 에 HTTPS 가 생긴 뒤)

사전: `id` DNS A 레코드 → 74.208.148.96, 카카오 콘솔 Redirect URI 에 `https://id.nuni.co.kr/auth/kakao/callback` 추가, 서버에서 `certbot --nginx -d id.nuni.co.kr --redirect`, `curl -s https://id.nuni.co.kr/.well-known/openid-configuration` 이 JSON 을 돌려주는지 확인. https://id.nuni.co.kr 에 카카오로 로그인해 관리 콘솔이 열리는지 먼저 확인합니다.

```bash
cp -a /etc/weather-hub.env /root/weather-hub.env.bak-$(date +%Y%m%d%H%M%S)
grep -q '^AUTH_PROVIDER=' /etc/weather-hub.env && sed -i 's/^AUTH_PROVIDER=.*/AUTH_PROVIDER=nuni-id/' /etc/weather-hub.env || echo 'AUTH_PROVIDER=nuni-id' >> /etc/weather-hub.env
systemctl restart weather-hub
journalctl -u weather-hub -n 5 --no-pager      # → "auth enabled · nuni-id login (issuer=https://id.nuni.co.kr client=nuni-weather-web brand=nuni-weather session=12h) ..."
curl -s https://weather.nuni.co.kr/api/me       # → "provider":"nuni-id","loggedIn":false
curl -s -o /dev/null -w '%{http_code}\n' https://weather.nuni.co.kr/api/gaps   # → 401
```

브라우저: weather.nuni.co.kr → **누니 ID로 로그인** → 카카오 → 관리 메뉴가 열리면 완료. 다른 사람의 관리 권한은 누니 ID 관리 콘솔 → 회원 → 누니날씨 멤버십 역할(`staff`/`brand_admin`)로 줍니다.

**전환 완료: 2026-10-02 07:03 KST** (백업 `/root/weather-hub.env.bak-20261002070320`). 그 뒤 카카오 콘솔에는 `https://id.nuni.co.kr/auth/kakao/callback` **만** 남아 있습니다.

**롤백**(카카오 직접 로그인으로 복귀 — 기존 카카오 승인 목록·세션 그대로). ⚠️ 먼저 카카오 콘솔 Redirect URI 에 `https://weather.nuni.co.kr/auth/kakao/callback` 을 다시 추가해야 합니다(없으면 카카오 로그인이 KOE006 오류):

```bash
sed -i '/^AUTH_PROVIDER=/d' /etc/weather-hub.env && systemctl restart weather-hub
# 선택: 누니 모드 사용자/세션 정리 (weatherhub DB, 세션은 cascade)
# runuser -u postgres -- psql -d weatherhub -c "DELETE FROM app_users WHERE kakao_id LIKE 'nuni:%'"
```

전환이 안정되면 카카오 콘솔의 옛 Redirect URI(`https://weather.nuni.co.kr/auth/kakao/callback`)는 지워도 됩니다(롤백 가능성을 남기려면 유지).

---

## 9) 기상청 응답 전체 항목 보관 (2026-10-05)

화면과 조회 API(`/api/hourly`·`/api/daily`·`/api/series`·`/api/dashboard`·`/api/export` 등)는 예전과 똑같이 두고, 수집할 때 기상청 ASOS API 가 주는 항목을 전부 DB 에 저장합니다.

- 시간자료(`observations_hourly`): 응답 항목 34개 전부. 기존 6개(기온·강수·습도·풍속·풍향·현지기압) + 새 컬럼 28개(품질 플래그 9개, 증기압, 이슬점, 해면기압, 일조, 일사, 적설, 3시간 신적설, 전운량, 중하층운량, 운형, 최저운고, 시정, 지면상태, 현상번호, 지면온도, 5/10/20/30cm 지중온도).
- 일자료(`observations_daily`): 응답 항목 59개 전부. 기존 5개(평균·최저·최고기온, 일강수량, 평균습도) + 새 컬럼 54개(최저·최고기온 시각, 10분·1시간 최다강수와 시각, 최대 순간풍속/최대풍속과 풍향·시각, 풍정합, 최다풍향, 이슬점, 최소습도, 증기압, 기압·해면기압 최고/최저/평균, 가조·일조, 일사, 적설, 운량, 지면·초상·지중온도, 증발량, 9-9 강수, 일기현상, 안개 계속시간).
- 두 테이블 모두 `raw`(jsonb)에 응답 item 원본 전체를 저장합니다. 기상청이 항목을 늘려도 잃지 않습니다.
- 매핑은 `kma-fields.mjs`, 각 컬럼의 기상청 코드·단위는 DB 컬럼 주석(`\d+ observations_hourly`)에 있습니다. 값은 기상청 단위 그대로, 시각은 hhmi 문자열 그대로입니다.
- 마이그레이션 `migrations/hub/0003_asos_all_fields.sql` 은 컬럼 추가만 합니다(삭제·변경 없음). 앱이 시작할 때 `hub_migrations` 에 기록하며 한 번만 적용하고, 실패해도 조회는 그대로 PostgreSQL 로 하고 저장만 예전 컬럼으로 합니다(로그 `hub migration failed`).
- 마이그레이션 전에 저장된 행은 새 컬럼이 비어 있습니다. 관리자가 같은 기간을 다시 수집하면 채워집니다(기존 값도 같은 규칙으로 갱신).
- ⚠️ 마이그레이션을 먼저 적용하고 **옛 버전 앱**을 띄우면 `/api/hourly` 에 새 컬럼이 `null` 로 붙어 나옵니다(옛 코드의 `SELECT *`). 새 버전 앱이 직접 적용하게 두세요.

## 10) 자동 수집 토큰 (`COLLECT_TOKEN`, n8n 매일 수집용 · 2026-10-08)

- `COLLECT_TOKEN`(32자 이상)을 환경파일에 넣으면 **`POST /api/collect`, `POST /api/collect-daily` 두 경로만** 로그인 세션 없이
  `Authorization: Bearer <토큰>` 또는 `X-Collect-Token: <토큰>` 헤더로 실행할 수 있습니다(상수 시간 비교). 다른 관리 경로는 열리지 않습니다.
- 기본은 **내부 직접 요청만** 허용: Caddy 를 거친 요청(X-Forwarded-For/Forwarded/X-Real-IP 가 있음)은 토큰이 맞아도 401.
  외부에서도 받아야 하면 `COLLECT_TOKEN_ALLOW_PROXIED=1`.
- 토큰 요청은 `stationId`, `from`, `to` 를 반드시 보내야 합니다(빠지면 400, 수집 안 함). 작업 기록의 trigger 는 `SCHEDULED`.
- 없거나 32자 미만이면 꺼짐(기존과 동일). 관리자 화면(세션) 수집은 그대로입니다.
- 시작 로그 끝에 `· collect token on (internal only)` 가 붙으면 켜진 것(값은 출력하지 않음).
- OVH: n8n(같은 `web` 네트워크)이 `http://weather-hub:8080` 으로 매일 06:00 KST 호출 — knhanul/server-ops README 참고.

## 11) 다운로드 레이아웃을 사용자별로 저장 · 자료수집 지점 변경 시 날짜 유지 (2026-10-10)

- 새 테이블 `export_layouts` (`migrations/hub/0004_export_layouts.sql`, 추가만). 앱이 시작할 때 적용하고 `hub_migrations` 에 기록.
  열: id, owner_id(= `app_users.kakao_id`, 누니 ID 모드 `nuni:<회원 ID>`), kind(hourly/daily), name, columns(jsonb), is_default(종류별 하나), 시각. 개인정보 없음.
- API (로그인한 본인 것만; 다른 사람 id 는 404): `GET/POST /api/export/layouts`, `GET/PATCH/DELETE /api/export/layouts/<id>`,
  `POST /api/export/layouts/<id>/default` (`{"isDefault":false}` 면 해제). 쓰기는 같은 사이트(Origin) + 로그인 필요(관리 권한은 필요 없음), 차단 계정 거부.
  이름 30자, 컬럼은 다운로드 카탈로그에 있는 것만, 사용자당 50개.
- 화면: 로그인 → "내 계정에 저장"(저장·덮어쓰기·이름 변경·기본 지정·삭제). 비로그인 → 기본 프리셋만(편집 버튼 숨김, 다운로드는 그대로).
  로그인 기능이 꺼진 서버 → 예전처럼 브라우저(localStorage).
- 예전 레이아웃: 서버에 공용으로 저장된 레이아웃은 없었고(프리셋은 코드에 있는 읽기 전용), 각 브라우저 localStorage 에만 있었다.
  로그인한 상태로 다운로드 화면을 처음 열면 그 브라우저의 레이아웃을 내 계정으로 한 번 옮기고(같은 이름·종류·컬럼이면 건너뜀),
  원본은 `nuni_weather_export_layouts_moved` 로 백업만 남긴다.
- 자료수집: 지점을 바꿔도 시작·종료는 그대로. 기본 구간은 처음 열 때와 '기본값' 버튼에서만 채운다.

## 12) 저장소를 MySQL(NAS)로 — `DB_DRIVER=mysql` (2026-10-10)

- 환경변수: `DB_DRIVER=mysql` + `MYSQL_URL=mysql://<user>:<pw>@<host>:3306/<db>` 이면 MySQL(5.6 이상), 없거나 `pg` 면 예전처럼 `DATABASE_URL`(PostgreSQL).
  두 드라이버(`pg`, `mysql2`)가 모두 이미지에 들어 있어 **env 만 바꾸고 재시작하면 되돌릴 수 있다**. 선택 사항: `MYSQL_POOL_MAX`(기본 6), `MYSQL_QUERY_TIMEOUT_MS`(기본 120000).
- 스키마: `migrations/mysql/*.sql` (앱 시작 시 적용, `hub_migrations` 에 `mysql/0001_init.sql` 처럼 기록). PostgreSQL 의 schema.sql + hub 0003·0004 + auth-schema 와 같은 표·열.
  키 열은 VARCHAR + `utf8mb4_bin`(pg C 정렬과 같은 바이트 순서), jsonb → LONGTEXT(JSON 문자열), timestamptz → DATETIME(6) UTC(연결 `time_zone=+00:00`).
  시간자료 기본키는 `(station_id, observation_datetime, provider, dataset)` 순(지점·기간 조회가 범위 읽기), 개수·최소·최대용 좁은 보조 인덱스 하나.
  레이아웃 "종류별 기본 1개" 는 `default_marker`(1/NULL) + 유일 인덱스로 지킨다(5.6 에 부분 인덱스 없음).
- 코드: `db-mysql.mjs` 가 `db.mjs` 의 모든 조회·저장 함수와 같은 이름·같은 결과를 낸다(각 함수 첫 줄에서 넘김). 5.6 에 없는 기능 대신:
  DISTINCT ON → 정렬 후 JS 로 긴 형식 고르기, generate_series·row_number(미적재 구간) → 일자별 시각 수를 보고 덜 찬 날만 시각을 받아 JS 로 구간 계산(`db-common.mjs`),
  unnest/ANY → IN·UNION ALL, RETURNING/xmax → 미리 있는 키 조회 + 여러 행 INSERT … ON DUPLICATE KEY UPDATE(1MB 패킷 제한 안으로 묶음).
- 전체 표 집계(시간자료 개수·coverage·지점 요약)는 NAS 에서 수 초 걸려 앱이 기억해 둔다. 이 앱이 시간·일자료를 저장하면 비우고 바로 다시 계산,
  밖에서 DB 를 직접 고친 경우를 위해 최대 30분(`MYSQL_AGG_CACHE_MS`, 0 이면 끔).
- PostgreSQL 과 결과가 다를 수 있는 곳: `/api/daily` 의 시간자료 집계 평균기온이 정확히 x.x5 인 날은 더하는 순서(pg 는 디스크에 저장된 순서, MySQL 은 시각 순)에 따라
  0.1 차이가 날 수 있다(2026-10-10 전체 19,775일 중 18일). 나머지 공개 API 는 바이트 단위로 같다(storage 값 제외).
- 장애 시: 시작할 때 MySQL 에 못 붙으면 JSON 모드로 내려가지 않고 종료(도커가 다시 띄움). 실행 중 끊기면 해당 요청만 500, 읽기는 연결 오류 때 1번 재시도.
  `GET /api/health` → `{"ok":true,"storage":"mysql","db":"ok","db_ms":…}`, DB 응답 없으면 503 `db:"down"`(도커 healthcheck 가 이것을 씀).
- 화면: "DB 연결됨" 표시는 mysql 도 연결로 본다. 저장소 카드·`storage` 값은 `mysql`. 다운로드 화면 배지는 "MySQL(NAS) 연결됨"(예전엔 항상 "로컬 JSON" 으로 잘못 나왔음).
- 자료 옮기기·검증: `node scripts/pg-to-mysql.mjs copy|verify [--tables a,b]` (DATABASE_URL·MYSQL_URL 필요, 다시 실행해도 안전, verify 는 표·지점별 행 수 + SHA-256),
  `node scripts/compare-drivers.mjs` (같은 입력으로 두 저장소 함수 결과 비교 — 관리자 전용 미적재·수집 이력 포함),
  `node scripts/mysql-integration.mjs` (이름이 `_test` 로 끝나는 빈 DB 에서만: 쓰기 경로·로그인·레이아웃 점검).
- 일자료 다운로드·미리보기 `cols is not defined` 500 은 2026-10-10 다음 커밋에서 고침(시간자료로 보충한 날은 요청한 컬럼만).
- `scripts/approve-user.mjs` 는 PostgreSQL 전용(예전 그대로). MySQL 모드에서는 관리 화면에서 승인한다.

## 13. 기상청 오류 판별 · 시간자료 41일 단위 (2026-10-10)

- 공공데이터포털이 미등록 키에 주는 `HTTP 403` + `OpenAPI_ServiceResponse.cmmMsgHeader.errMsg=SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 를 이제 **FAILED** 로 기록한다(예전: 0건 COMPLETED). 시간·일자료 공통 `kmaResponseError` (kma-fields.mjs).
- 시간자료 수집 구간을 7일 → 41일(984행, 기상청 호출 1번)로. 같은 기간에 호출 수가 약 1/6.
- 일자료(AsosDalyInfoService)는 현재 키로 403 — 공공데이터포털에서 "기상청_지상(종관, ASOS) 일자료 조회서비스" 활용신청 필요.
- MySQL 집계 캐시(개수·coverage·지점 요약): 저장할 때마다 바로 다시 계산하지 않고 모아서 한 번(기본 2분 뒤, `MYSQL_AGG_REFRESH_MS`; 0 이면 예전처럼 바로 비움). 그동안 화면은 직전 값. 시간자료 저장마다 하던 전체 `COUNT(*)` 도 캐시 값으로.
