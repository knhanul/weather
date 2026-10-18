#!/usr/bin/env bash
# 이날(weather-hub) 업데이트 배포 스크립트
# 사용법: 서버에서 /opt/weather-hub 디렉터리에서 실행하거나
#   bash deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/weather-hub}"
cd "$APP_DIR"

echo "=== [1/4] 데이터 백업 ==="
mkdir -p data/bak
cp -a data/settings.json data/bak/settings.json.bak 2>/dev/null || true
cp -a data/jobs.json     data/bak/jobs.json.bak     2>/dev/null || true
cp -a data/hourly.json   data/bak/hourly.json.bak   2>/dev/null || true
cp -a data/daily.json    data/bak/daily.json.bak    2>/dev/null || true

echo "=== [2/4] 최신 코드 받기 ==="
git fetch origin
git pull --ff-only origin main

echo "=== [3/4] 서비스 재시작 ==="
if systemctl is-active --quiet weather-hub 2>/dev/null; then
  echo "systemd weather-hub 재시작"
  sudo systemctl restart weather-hub
elif docker compose ps --quiet weather-hub >/dev/null 2>&1 || docker compose ps --quiet app >/dev/null 2>&1; then
  echo "docker compose 재빌드/재시작"
  docker compose up -d --build
else
  echo "기존 node 프로세스 종료 후 재시작"
  pkill -f "node.*server.mjs" || true
  sleep 1
  nohup node server.mjs >> weather-hub.log 2>&1 &
  echo "백그라운드 실행 PID: $!"
fi

echo "=== [4/4] 상태 확인 ==="
sleep 2
curl -sf "http://127.0.0.1:${PORT:-8080}/api/status" | head -c 300 || echo "(상태 확인 실패 \u2014 로그를 확인하세요)"
echo
echo "배포 완료. 브라우저에서 https://weather.nuni.co.kr/#/hourly-weather 를 새로고침하세요."
