// 기상청 ASOS 전체 항목 보관(0003) — 매핑·마이그레이션·UPSERT SQL 단위 테스트.
// PG 통합 테스트는 TEST_DATABASE_URL(버려도 되는 빈 DB)이 있을 때만 돈다. 기상청 API 는 호출하지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOURLY_FIELDS, DAILY_FIELDS, HOURLY_EXTRA, DAILY_EXTRA, HOURLY_LEGACY_COLUMNS, DAILY_LEGACY_COLUMNS,
  mapHourlyItem, mapDailyItem, withoutExtras, toNum, toText, kmaResponseError,
} from "../kma-fields.mjs";
import { buildUpsert } from "../db.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = fs.readFileSync(path.join(ROOT, "migrations/hub/0003_asos_all_fields.sql"), "utf8");

// 공공데이터포털 15057210 출력결과 표(샘플데이터 열)를 그대로 옮긴 시간자료 항목. 실제 응답 표기(…Qcflg)로.
const HOURLY_SAMPLE = {
  rnum: "1", tm: "2010-01-01 10:00", stnId: "108", stnNm: "서울",
  ta: "23.8", taQcflg: "0", rn: "10.5", rnQcflg: "0", ws: "1", wsQcflg: "0", wd: "110", wdQcflg: "0",
  hm: "36", hmQcflg: "0", pv: "1.1", td: "-21.4", pa: "1012.4", paQcflg: "0", ps: "1023.6", psQcflg: "0",
  ss: "1", ssQcflg: "0", icsr: "0.73", dsnw: "2.2", hr3Fhsc: "0.2", dc10Tca: "0", dc10LmcsCa: "0",
  clfmAbbrCd: "scas", lcsCh: "8", vs: "2300", gndSttCd: "17", dmstMtphNo: "1904", ts: "-3.4", tsQcflg: "0",
  m005Te: "-4.9", m01Te: "-2.4", m02Te: "-1", m03Te: "0.4",
};
// 공식 일자료(15059093) 실제 응답 예(서울 2021-06-01).
const DAILY_SAMPLE = {
  stnId: "108", stnNm: "서울", tm: "2021-06-01", avgTa: "20.2", minTa: "15.9", minTaHrmt: "811", maxTa: "23.9",
  maxTaHrmt: "1311", mi10MaxRn: "1.3", mi10MaxRnHrmt: "754", hr1MaxRn: "2.3", hr1MaxRnHrmt: "712", sumRnDur: "4.42",
  sumRn: "3.2", maxInsWs: "9.0", maxInsWsWd: "290", maxInsWsHrmt: "527", maxWs: "5.4", maxWsWd: "320", maxWsHrmt: "533",
  avgWs: "2.2", hr24SumRws: "1863", maxWd: "50", avgTd: "15.4", minRhm: "57", minRhmHrmt: "1322", avgRhm: "74.6",
  avgPv: "17.5", avgPa: "1003.9", maxPs: "1016.5", maxPsHrmt: "710", minPs: "1011.5", minPsHrmt: "221", avgPs: "1013.8",
  ssDur: "14.6", sumSsHr: "1.9", hr1MaxIcsrHrmt: "1000", hr1MaxIcsr: "2.03", sumGsr: "13.01", ddMefs: "", ddMefsHrmt: "",
  ddMes: "", ddMesHrmt: "", sumDpthFhsc: "", avgTca: "8.1", avgLmac: "2.1", avgTs: "21.1", minTg: "13.9",
  avgCm5Te: "21.2", avgCm10Te: "20.5", avgCm20Te: "20.1", avgCm30Te: "19.7", avgM05Te: "19.0", avgM10Te: "17.5",
  avgM15Te: "16.8", avgM30Te: "14.2", avgM50Te: "13.6", sumLrgEv: "2.7", sumSmlEv: "3.9", n99Rn: "0.0",
  iscs: "{비}0433-0443. {비}0515-{비}{강도0}0600-0835. {박무}0755-0820.", sumFogDur: "",
};
const ID_KEYS = new Set(["rnum", "tm", "stnId", "stnNm"]);

// 0003 이전 server.mjs 의 매핑(4ec4fb2) — 기존 필드가 한 글자도 바뀌지 않았는지 비교용
function legacyHourly(it, stationId) {
  let tm = String(it.tm || "");
  if (tm.length === 13) tm = `${tm}:00`;
  if (tm.length === 16) tm = `${tm}:00`;
  return {
    provider: "KMA", dataset: "ASOS_HOURLY", station_id: String(it.stnId ?? stationId), station_name: it.stnNm || stationId,
    observation_datetime: tm, timezone: "Asia/Seoul",
    temperature: it.ta === "" || it.ta == null ? null : Number(it.ta),
    precipitation: it.rn === "" || it.rn == null ? null : Number(it.rn),
    humidity: it.hm === "" || it.hm == null ? null : Number(it.hm),
    wind_speed: it.ws === "" || it.ws == null ? null : Number(it.ws),
    wind_direction: it.wd === "" || it.wd == null ? null : Number(it.wd),
    pressure: it.pa === "" || it.pa == null ? null : Number(it.pa),
    quality_temperature: !it.taQcflg || it.taQcflg === "0" ? "NORMAL" : it.taQcflg === "1" ? "INVALID" : it.taQcflg === "9" ? "MISSING" : "SUSPECT",
    source_kind: "OFFICIAL",
  };
}
function legacyDaily(it, stationId) {
  return {
    station_id: String(it.stnId ?? stationId), station_name: it.stnNm || stationId, observation_date: String(it.tm || "").slice(0, 10),
    avg_temperature: it.avgTa === "" || it.avgTa == null ? null : Number(it.avgTa),
    min_temperature: it.minTa === "" || it.minTa == null ? null : Number(it.minTa),
    max_temperature: it.maxTa === "" || it.maxTa == null ? null : Number(it.maxTa),
    precipitation: it.sumRn === "" || it.sumRn == null ? null : Number(it.sumRn),
    avg_humidity: it.avgRhm === "" || it.avgRhm == null ? null : Number(it.avgRhm),
    source_kind: "OFFICIAL",
  };
}

test("시간자료: 문서의 모든 응답 항목이 컬럼에 매핑된다(34개)", () => {
  const mapped = new Set(HOURLY_FIELDS.flatMap((f) => f.keys));
  const missing = Object.keys(HOURLY_SAMPLE).filter((k) => !ID_KEYS.has(k) && !mapped.has(k));
  assert.deepEqual(missing, []);
  assert.equal(HOURLY_FIELDS.length, 34);
  assert.equal(HOURLY_EXTRA.length, 28);
});

test("일자료: 문서의 모든 응답 항목이 컬럼에 매핑된다(59개)", () => {
  const mapped = new Set(DAILY_FIELDS.flatMap((f) => f.keys));
  const missing = Object.keys(DAILY_SAMPLE).filter((k) => !ID_KEYS.has(k) && !mapped.has(k));
  assert.deepEqual(missing, []);
  assert.equal(DAILY_FIELDS.length, 59);
  assert.equal(DAILY_EXTRA.length, 54);
});

test("컬럼 이름이 겹치지 않고 기존 컬럼과도 충돌하지 않는다", () => {
  for (const [fields, legacyCols] of [[HOURLY_FIELDS, HOURLY_LEGACY_COLUMNS], [DAILY_FIELDS, DAILY_LEGACY_COLUMNS]]) {
    const cols = fields.map((f) => f.col);
    assert.equal(new Set(cols).size, cols.length);
    for (const f of fields) assert.equal(legacyCols.includes(f.col), Boolean(f.legacy), f.col);
    assert.ok(!cols.includes("raw"));
  }
});

test("mapHourlyItem: 새 컬럼 값과 원본(raw)", () => {
  const r = mapHourlyItem(HOURLY_SAMPLE, "108");
  assert.deepEqual(r.raw, HOURLY_SAMPLE);
  assert.notEqual(r.raw, HOURLY_SAMPLE);
  assert.deepEqual(r.extra, {
    ta_qcflg: "0", rn_qcflg: "0", ws_qcflg: "0", wd_qcflg: "0", hm_qcflg: "0",
    vapor_pressure: 1.1, dew_point: -21.4, pa_qcflg: "0", sea_level_pressure: 1023.6, ps_qcflg: "0",
    sunshine: 1, ss_qcflg: "0", solar_radiation: 0.73, snow_depth: 2.2, snow_new_3h: 0.2,
    total_cloud: 0, low_mid_cloud: 0, cloud_form: "scas", lowest_cloud_height: 8, visibility: 2300,
    ground_state_code: "17", phenomenon_code: "1904", ground_temperature: -3.4, ts_qcflg: "0",
    soil_temp_5cm: -4.9, soil_temp_10cm: -2.4, soil_temp_20cm: -1, soil_temp_30cm: 0.4,
  });
});

test("mapHourlyItem: 기존 필드는 예전 코드와 완전히 같다", () => {
  const cases = [
    HOURLY_SAMPLE,
    { tm: "2026-09-30 23", stnId: 108, stnNm: "서울", ta: "", rn: null, hm: "55", ws: "x", wd: "0", pa: "", taQcflg: "1" },
    { tm: "2026-09-30 05:00:00", ta: "-0.0", taQcflg: "9" },
    { tm: "2026-09-30 05:00", ta: "3.2", taQcflg: "2" },
    {},
  ];
  for (const it of cases) {
    const { extra, raw, ...legacy } = mapHourlyItem(it, "108");
    assert.deepEqual(legacy, legacyHourly(it, "108"));
    assert.deepEqual(Object.keys(legacy), Object.keys(legacyHourly(it, "108")));
    assert.ok(extra && raw);
  }
});

test("문서 표기(…Qcflag)로 와도 플래그를 저장한다", () => {
  const r = mapHourlyItem({ tm: "2026-01-01 01:00", taQcflag: "1", tsQcflg: "9", wsQcflag: "" }, "108");
  assert.equal(r.extra.ta_qcflg, "1");
  assert.equal(r.extra.ts_qcflg, "9");
  assert.equal(r.extra.ws_qcflg, null);
});

test("mapDailyItem: 59개 항목 + raw, 시각은 문자열 그대로, 빈 값은 NULL", () => {
  const r = mapDailyItem(DAILY_SAMPLE, "108");
  assert.deepEqual(r.raw, DAILY_SAMPLE);
  assert.equal(r.avg_temperature, 20.2);
  assert.equal(r.precipitation, 3.2);
  assert.equal(r.avg_humidity, 74.6);
  const e = r.extra;
  assert.equal(Object.keys(e).length, 54);
  assert.equal(e.min_temperature_time, "811");
  assert.equal(e.max_temperature_time, "1311");
  assert.equal(e.max_precip_10min, 1.3);
  assert.equal(e.max_inst_wind_speed, 9);
  assert.equal(e.max_inst_wind_dir, 290);
  assert.equal(e.wind_run, 1863);
  assert.equal(e.most_frequent_wind_dir, 50);
  assert.equal(e.avg_sea_level_pressure, 1013.8);
  assert.equal(e.possible_sunshine, 14.6);
  assert.equal(e.solar_radiation, 13.01);
  assert.equal(e.max_new_snow, null);
  assert.equal(e.max_new_snow_time, null);
  assert.equal(e.soil_temp_5_0m, 13.6);
  assert.equal(e.evaporation_small, 3.9);
  assert.equal(e.precip_9to9, 0);
  assert.equal(e.weather_phenomena, DAILY_SAMPLE.iscs);
  assert.equal(e.fog_duration, null);
  for (const f of DAILY_EXTRA) assert.ok(f.col in e, f.col);
  // 문서의 오기(mi10_max_rn)도 받는다
  assert.equal(mapDailyItem({ tm: "2021-06-01", mi10_max_rn: "0.5" }, "108").extra.max_precip_10min, 0.5);
});

test("mapDailyItem: 기존 필드는 예전 코드와 같다", () => {
  for (const it of [DAILY_SAMPLE, { tm: "2026-09-01", avgTa: "", sumRn: null }, {}]) {
    const { extra, raw, ...legacy } = mapDailyItem(it, "159");
    assert.deepEqual(legacy, legacyDaily(it, "159"));
    assert.ok(extra && raw);
  }
});

test("toNum / toText", () => {
  assert.equal(toNum(""), null);
  assert.equal(toNum("  "), null);
  assert.equal(toNum("abc"), null);
  assert.equal(toNum("-0.5"), -0.5);
  assert.equal(toNum(0), 0);
  assert.equal(toText(" 0811 "), "0811");
  assert.equal(toText(""), null);
  assert.equal(toText(17), "17");
});

test("withoutExtras: JSON 대체 저장소에는 예전 모양 그대로", () => {
  const r = mapHourlyItem(HOURLY_SAMPLE, "108");
  assert.deepEqual(withoutExtras(r), legacyHourly(HOURLY_SAMPLE, "108"));
  const plain = { a: 1 };
  assert.equal(withoutExtras(plain), plain);
});

test("마이그레이션: 새 컬럼 전부를 맞는 타입으로 추가하고 raw 는 jsonb, 파괴적 문장 없음", () => {
  for (const [table, extra] of [["observations_hourly", HOURLY_EXTRA], ["observations_daily", DAILY_EXTRA]]) {
    for (const f of extra) {
      const type = f.type === "num" ? "double precision" : "text";
      assert.match(MIGRATION, new RegExp(`ADD COLUMN IF NOT EXISTS ${f.col} ${type}[,;]`), `${table}.${f.col}`);
      assert.match(MIGRATION, new RegExp(`COMMENT ON COLUMN ${table}\\.${f.col} IS 'KMA ${f.keys[0]}: `));
    }
  }
  assert.equal((MIGRATION.match(/ADD COLUMN IF NOT EXISTS raw jsonb/g) || []).length, 2);
  const sql = MIGRATION.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''");
  assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME|TYPE|DEFAULT|NOT NULL)\b/i);
});

test("buildUpsert: 마이그레이션 전에는 예전 컬럼만, 후에는 전체 + raw::jsonb", () => {
  const base = [["station_id", "108"], ["observation_date", "2021-06-01"], ["avg_temperature", 1]];
  const r = mapDailyItem(DAILY_SAMPLE, "108");
  const legacy = buildUpsert({ table: "observations_daily", base, conflict: "station_id, observation_date", update: ["avg_temperature"], extra: { fields: DAILY_EXTRA, values: r.extra, raw: r.raw }, full: false });
  assert.equal(legacy.values.length, 3);
  assert.doesNotMatch(legacy.text, /raw|min_temperature_time/);
  assert.match(legacy.text, /ON CONFLICT \(station_id, observation_date\)/);
  assert.match(legacy.text, /avg_temperature = EXCLUDED\.avg_temperature/);
  const full = buildUpsert({ table: "observations_daily", base, conflict: "station_id, observation_date", update: ["avg_temperature"], extra: { fields: DAILY_EXTRA, values: r.extra, raw: r.raw }, full: true });
  assert.equal(full.values.length, 3 + 54 + 1);
  assert.match(full.text, /\$58::jsonb/);
  assert.deepEqual(JSON.parse(full.values.at(-1)), DAILY_SAMPLE);
  for (const f of DAILY_EXTRA) assert.match(full.text, new RegExp(`${f.col} = EXCLUDED\\.${f.col}\\b`));
  assert.match(full.text, /raw = EXCLUDED\.raw/);
});

test("PG 통합: 마이그레이션 적용 → UPSERT 가 새 컬럼과 raw 를 채우고 기존 조회 모양은 그대로", { skip: !process.env.TEST_DATABASE_URL && "TEST_DATABASE_URL 없음" }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const db = await import("../db.mjs");
  const pool0 = new (await import("pg")).default.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  await pool0.query("DROP TABLE IF EXISTS observations_hourly, observations_daily, collect_jobs, weather_stations, hub_settings, hub_migrations");
  await pool0.end();
  assert.equal(await db.initDb(), true);
  assert.equal(db.fullFieldsReady(), true);
  const pool = db.getPool();
  // 두 번째 적용은 아무것도 하지 않는다
  assert.deepEqual(await db.applyHubMigrations(pool), []);

  const h = mapHourlyItem(HOURLY_SAMPLE, "108");
  assert.deepEqual(await db.upsertHourly([h]).then((x) => [x.inserted, x.updated]), [1, 0]);
  const changed = mapHourlyItem({ ...HOURLY_SAMPLE, td: "-20.0", m03Te: "" }, "108");
  assert.deepEqual(await db.upsertHourly([changed]).then((x) => [x.inserted, x.updated]), [0, 1]);
  const row = (await pool.query("SELECT * FROM observations_hourly")).rows[0];
  assert.equal(row.dew_point, -20);
  assert.equal(row.soil_temp_30cm, null);
  assert.equal(row.cloud_form, "scas");
  assert.equal(row.raw.td, "-20.0");
  assert.equal(row.temperature, 23.8);
  // 예전 JSON 가져오기 행(extra 없음)은 기존 컬럼만 바꾸고 새 컬럼은 건드리지 않는다
  await db.upsertHourly([legacyHourly({ ...HOURLY_SAMPLE, ta: "1.5" }, "108")]);
  const row2 = (await pool.query("SELECT temperature, dew_point, raw FROM observations_hourly")).rows[0];
  assert.equal(row2.temperature, 1.5);
  assert.equal(row2.dew_point, -20);
  assert.ok(row2.raw);
  // 조회 API 는 예전 컬럼만 돌려준다
  const q = await db.queryHourlyPg({ stationId: "108", from: "2010-01-01 00:00:00", to: "2010-01-02 00:00:00" });
  assert.deepEqual(Object.keys(q.data[0]), HOURLY_LEGACY_COLUMNS);

  const d = mapDailyItem(DAILY_SAMPLE, "108");
  assert.deepEqual(await db.upsertDaily([d]), { inserted: 1, updated: 0 });
  const drow = (await pool.query("SELECT * FROM observations_daily")).rows[0];
  for (const f of DAILY_EXTRA) assert.equal(drow[f.col], d.extra[f.col], f.col);
  assert.deepEqual(drow.raw, DAILY_SAMPLE);
  const list = await db.listDailyOfficial("108");
  assert.deepEqual(Object.keys(list[0]), DAILY_LEGACY_COLUMNS);
  await pool.end();
});

test("kmaResponseError: 미등록 키(403 SERVICE_KEY_IS_NOT_REGISTERED)는 오류 → 일자료 수집이 0건 COMPLETED 가 아니라 FAILED", () => {
  const forbidden = { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnAuthMsg: "등록되지 않은 서비스키", returnReasonCode: "30" } } };
  assert.match(kmaResponseError(403, forbidden), /^SERVICE_KEY_IS_NOT_REGISTERED_ERROR .*\(30\) HTTP 403$/);
  assert.equal(kmaResponseError(200, { response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }), "03 NO_DATA");
  assert.equal(kmaResponseError(403, {}), "HTTP 403");
  assert.equal(kmaResponseError(200, {}), "기상청 응답 형식이 아닙니다");
  assert.equal(kmaResponseError(200, { response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { totalCount: 0 } } }), null);
});
