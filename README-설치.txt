기상허브 설치 (Debian + PostgreSQL, Docker 없음)

1. 이 zip을 서버 /tmp 에 올린 뒤
   cd /tmp && unzip -o weather-hub-pg.zip
   cp -f weather-hub/server.mjs weather-hub/db.mjs weather-hub/schema.sql weather-hub/package.json /opt/weather-hub/
   cp -f weather-hub/public/index.html /opt/weather-hub/public/index.html
   (data/ 폴더는 덮어쓰지 마세요)

2. PostgreSQL
   apt install -y postgresql
   sudo -u postgres psql -c "CREATE USER weather WITH PASSWORD '비밀번호';"
   sudo -u postgres psql -c "CREATE DATABASE weatherhub OWNER weather;"

3. Node 드라이버
   cd /opt/weather-hub
   npm install

4. /etc/weather-hub.env
   PORT=8080
   TZ=Asia/Seoul
   DATABASE_URL=postgres://weather:비밀번호@127.0.0.1:5432/weatherhub

5. systemctl restart weather-hub
   대시보드 저장소가 postgresql 이면 성공입니다.
