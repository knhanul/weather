// PostgreSQL(db.mjs)·MySQL(db-mysql.mjs) 저장소가 함께 쓰는 순수 함수. DB 접속 없음(테스트 가능).

// 일자료 다운로드: observations_daily 의 공식 자료를 우선 쓰고, 없는 날짜는 시간자료 집계로 보충한다.
// (예전 db.mjs queryDailyExportPg 안에 있던 로직을 그대로 옮김 — 결과 바이트 동일)
// cols: 다운로드할 일자료 컬럼(validateExportColumns 결과). 시간자료로 보충한 날도 이 컬럼만 담는다.
export function mergeDailyExport({ stationId, cols, officialRows, hourlyRows, limit = null }) {
  if (!hourlyRows.length && officialRows.length) return officialRows;
  const officialMap = new Map(officialRows.map((r) => [r.observation_date, r]));
  const byDay = new Map();
  for (const h of hourlyRows) {
    const d = h.observation_datetime.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(h);
  }
  const out = [];
  const allDates = new Set([...officialMap.keys(), ...byDay.keys()]);
  const sortedDates = [...allDates].sort();
  for (const date of sortedDates) {
    if (officialMap.has(date)) {
      out.push(officialMap.get(date));
      continue;
    }
    const list = byDay.get(date) || [];
    const temps = list.map((x) => x.temperature).filter((v) => v != null);
    const rains = list.map((x) => x.precipitation).filter((v) => v != null);
    const hums = list.map((x) => x.humidity).filter((v) => v != null);
    const derived = {
      station_id: stationId,
      station_name: list[0]?.station_name || null,
      observation_date: date,
      avg_temperature: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
      min_temperature: temps.length ? Math.min(...temps) : null,
      max_temperature: temps.length ? Math.max(...temps) : null,
      precipitation: rains.length ? Math.round(rains.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      avg_humidity: hums.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null,
      source_kind: "DERIVED",
      note: "시간자료에서 집계",
    };
    const row = {};
    for (const c of cols) {
      row[c] = derived[c] ?? null;
    }
    out.push(row);
  }
  if (Number.isInteger(limit) && limit > 0) {
    return out.slice(0, limit);
  }
  return out;
}

// 'YYYY-MM-DD HH' (KST 벽시계, 시간대 계산 없음) <-> ms
export function h13ToMs(h) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})$/.exec(String(h));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]));
}
export function msToH13(ms) {
  return new Date(ms).toISOString().slice(0, 13).replace("T", " ");
}

// 비어 있는 시각을 연속 구간으로 묶는다(gaps-and-islands). a·b 포함. have: 적재된 'YYYY-MM-DD HH' 집합.
// PostgreSQL 의 generate_series + row_number() 쿼리(db.mjs gapHourIntervalsPg)와 같은 결과: { station_id, s, e, n } 시각 순.
export function hourGapIntervals(stationId, a, b, have) {
  const out = [];
  let cur = null;
  const end = h13ToMs(b);
  for (let t = h13ToMs(a); t <= end; t += 3600000) {
    const h = msToH13(t);
    if (have.has(h)) {
      cur = null;
      continue;
    }
    if (cur) {
      cur.e = h;
      cur.n += 1;
    } else {
      cur = { station_id: stationId, s: h, e: h, n: 1 };
      out.push(cur);
    }
  }
  return out;
}

// 'YYYY-MM-DD HH:MM' 같은 접두어 p 로 시작하거나 그보다 뒤·앞인 observation_datetime 범위를 인덱스로 찾기 위한 상한.
// left(x, len(p)) <= p  <=>  x <= p + '~'  ('~' 는 숫자·':'·' ' 보다 큰 ASCII)
export const prefixUpper = (p) => `${p}~`;

// 그래프 일 단위 점: 공식 일자료 행 → { t:'YYYY-MM-DD 00:00', temperature(일평균), max/min, precipitation, humidity, wind_speed }.
// 값이 없으면 NULL 그대로(0 으로 바꾸지 않음), 없는 날은 점을 만들지 않는다(그래프에서 끊김).
export function dailyChartPoints(rows) {
  const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return rows.map((r) => ({
    t: `${String(r.observation_date).slice(0, 10)} 00:00`,
    temperature: n(r.avg_temperature),
    max_temperature: n(r.max_temperature),
    min_temperature: n(r.min_temperature),
    precipitation: n(r.precipitation),
    humidity: n(r.avg_humidity),
    wind_speed: n(r.avg_wind_speed),
  }));
}
