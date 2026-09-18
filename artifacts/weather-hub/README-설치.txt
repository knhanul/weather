기상허브 PostgreSQL 마이그레이션

A. 준비
  apt install -y postgresql
  sudo -u postgres psql -c "CREATE USER weather WITH PASSWORD '비밀번호';"
  sudo -u postgres psql -c "CREATE DATABASE weatherhub OWNER weather;"
  cd /opt/weather-hub && npm install

  /etc/weather-hub.env 에 추가:
    DATABASE_URL=postgres://weather:비밀번호@127.0.0.1:5432/weatherhub

B. 자동 이관 (테이블이 비어 있을 때)
  systemctl restart weather-hub
  journalctl -u weather-hub -n 40 --no-pager
  로그에 migrated={"hourly":...,"daily":...,"jobs":...,"stations":...,"settings":...} 가 나오면 성공.

C. 수동 이관 (이미 DB에 일부 있고 JSON을 다시 합칠 때)
  set -a; source /etc/weather-hub.env; set +a
  cd /opt/weather-hub
  node migrate.mjs            # 빈 테이블만
  node migrate.mjs --force    # JSON을 UPSERT로 다시 합침

D. 확인
  sudo -u postgres psql -d weatherhub -c "SELECT count(*) FROM observations_hourly;"
  sudo -u postgres psql -d weatherhub -c "SELECT count(*) FROM observations_daily;"
  sudo -u postgres psql -d weatherhub -c "SELECT k FROM hub_settings;"

JSON 파일은 data/ 에 백업으로 남깁니다. 이관 확인 전에는 지우지 마세요.
