# IONOS Ubuntu + PostgreSQL 배포 (Docker 없음)

앱 서버(Ubuntu)와 DB(PostgreSQL)를 나눕니다. 기상청 키는 앱 서버 환경변수에만 둡니다.

## 구성

```
[업무시스템] --HTTPS--> [Ubuntu + Node 기상허브 + nginx]
                              |
                              +--> [IONOS PostgreSQL]
                              +--> [data.go.kr ASOS API]  (서버만)
```

권장:
- 앱: IONOS Cloud Server, Ubuntu 24.04, 2 vCPU / 4GB RAM / 40GB SSD
- DB: IONOS Managed PostgreSQL v2 (가능하면). 같은 VM에 Postgres를 올려도 됨
- 공개 포트: 443만. 22는 관리 IP만. Postgres 5432는 앱 서버에서만

## 1. IONOS에서 만들기

1. Data Center Designer에서 Cloud Server 생성, 이미지 Ubuntu LTS
2. 공인 IP, 방화벽
   - IN 443 TCP (웹)
   - IN 22 TCP (관리 대역만)
   - OUT 443 TCP (기상청·패키지)
3. Managed PostgreSQL v2 클러스터 생성  
   - DB 이름 `weather`, 사용자 `weather_app`  
   - 접근: 앱 서버 IP만  
   - 지금 시점은 PostgreSQL v2를 사용 (v1은 2026-09-28 이후 종료 예정)

연결 문자열은 콘솔에서 복사합니다. 채팅·Git에 넣지 마세요.

```
postgresql://weather_app:비밀번호@호스트:5432/weather
```

## 2. Ubuntu 초기 설정

SSH로 접속한 뒤:

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone Asia/Seoul
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql-client
sudo useradd --system --create-home --shell /usr/sbin/nologin weather
sudo mkdir -p /opt/weather-hub
sudo chown weather:weather /opt/weather-hub
```

허브 zip을 `/opt/weather-hub`에 풉니다. `data/settings.json`은 올리지 않습니다.

## 3. PostgreSQL 스키마

앱 서버에서:

```bash
psql "$DATABASE_URL" -f /opt/weather-hub/deploy/schema.sql
```

테이블: 시간자료, 수집작업, 공급원 설정. Unique key는  
`(provider, dataset_code, station_id, observation_datetime)`  
재수집은 UPSERT입니다.

## 4. 앱 환경변수

`/etc/weather-hub.env` (권한 600, root만 읽기):

```
PORT=8080
TZ=Asia/Seoul
DATABASE_URL=postgresql://weather_app:...@...:5432/weather
KMA_API_KEY=
```

`KMA_API_KEY`는 공공데이터포털 serviceKey입니다. 비어 있으면 조회는 DB에 있는 행만 되고 공식수집은 실패합니다.

## 5. systemd로 상시 실행

`/etc/systemd/system/weather-hub.service` 는 `deploy/weather-hub.service`를 복사합니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now weather-hub
sudo systemctl status weather-hub
```

프로세스는 `127.0.0.1:8080`만 열어도 됩니다. 외부에는 nginx만 노출합니다.

## 6. nginx + TLS

도메인을 앱 서버 IP에 연결한 뒤:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

공개 주소는 `https://weather.nuni.co.kr` 입니다.

`nuni.co.kr` DNS에 앱 서버 공인 IP로 A 레코드를 만듭니다.

| 호스트 | 타입 | 값 |
|---|---|---|
| weather | A | IONOS Ubuntu 공인 IPv4 |

전파 후:

```bash
sudo cp /opt/weather-hub/deploy/nginx.conf /etc/nginx/sites-available/weather-hub
sudo ln -sf /etc/nginx/sites-available/weather-hub /etc/nginx/sites-enabled/weather-hub
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d weather.nuni.co.kr
```

업무시스템 예:

```
GET https://weather.nuni.co.kr/api/hourly?stationId=108&from=2026-09-17 00:00:00&to=2026-09-17 23:00:00
```

## 7. 오픈 순서

1. `systemctl status weather-hub` active
2. `https://weather.nuni.co.kr` 접속
3. 키 등록 또는 `KMA_API_KEY` 설정 후 서비스 재시작
4. 서울 108, 전날 00:00–23:00 공식수집
5. 시간자료 조회, 출처 `OFFICIAL`
6. 구내식당 등에는 `https://weather.nuni.co.kr/api/hourly` 만 전달

## 8. 백업

- IONOS Managed Postgres 자동 백업 사용
- 추가로 앱 설정·키는 시크릿 저장소에만
- 관측 행은 재수집 가능하지만 수집이력은 DB 백업에 포함

## 현재 코드와의 차이

지금 묶음의 `server.mjs`는 파일(`data/hourly.json`)에 저장합니다.  
IONOS Postgres를 쓰려면 `DATABASE_URL`이 있을 때 Postgres로 읽고 쓰도록 서버를 한 번 바꿔야 합니다.  
인프라는 위 순서대로 먼저 만들고, 저장소 전환은 그다음입니다.
