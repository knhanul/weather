// 기본 달·기본 관측지점 규칙 (public/geo.js 순수 계산, station-coords, /api/station-pref)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { STATION_COORDS, withCoords } from "../station-coords.mjs";
import { seoulMonth as serverMonth } from "../stats-api.mjs";
import { handlePrefs, createJsonPrefsStore, isPrefsPath } from "../view-prefs.mjs";

const ctx = { Intl, Math, Number, String, Set, Object };
vm.runInNewContext(fs.readFileSync(new URL("../public/geo.js", import.meta.url), "utf8"), ctx);
const D = ctx.NWDefaults;
const stations = withCoords(["108", "112", "119", "133", "143", "156", "159", "184"].map((id) => ({ station_id: id, station_name: id, enabled: true })));

test("지금 달 = Asia/Seoul 기준 (12월→1월, 1월→2월 경계)", () => {
  for (const f of [D.seoulMonth, serverMonth]) {
    assert.equal(f(new Date("2026-12-31T14:59:00Z")), 12); // 서울 12/31 23:59
    assert.equal(f(new Date("2026-12-31T15:00:00Z")), 1); // 서울 1/1 00:00 (UTC 로는 아직 12월)
    assert.equal(f(new Date("2027-01-31T15:00:00Z")), 2);
    assert.equal(f(new Date("2026-10-11T01:21:00Z")), 10);
    assert.equal(f(new Date("2026-01-01T00:00:00+09:00")), 1);
  }
  assert.equal(D.seoulMd(new Date("2028-02-28T15:30:00Z")), "02-29"); // 윤년 2/29
  assert.equal(D.seoulMd(new Date("2026-12-31T15:00:00Z")), "01-01");
});

test("관측지점 8곳 공식 좌표가 모두 있고 한반도 안", () => {
  for (const s of stations) {
    assert.ok(STATION_COORDS[s.station_id], s.station_id);
    assert.ok(s.latitude > 33 && s.latitude < 39 && s.longitude > 124 && s.longitude < 131, s.station_id);
  }
  // 기존 필드는 그대로, 이미 좌표가 있으면 덮어쓰지 않음
  assert.deepEqual(withCoords([{ station_id: "999", station_name: "x" }]), [{ station_id: "999", station_name: "x" }]);
  assert.equal(withCoords([{ station_id: "108", latitude: 1, longitude: 2 }])[0].latitude, 1);
});

test("거리(하버사인)와 가장 가까운 지점", () => {
  const d = D.distanceKm(37.57142, 126.9658, 35.10468, 129.03203); // 서울-부산
  assert.ok(d > 325 && d < 336, String(d)); // 관측소 사이 약 331km (위도 2.47°≈274km, 경도 2.07°≈183km)
  assert.equal(D.distanceKm(37, 127, 37, 127), 0);
  const cases = [
    [37.2636, 127.0286, "119"], // 수원시청
    [37.4602, 126.4407, "112"], // 인천공항
    [37.4979, 127.0276, "108"], // 강남역
    [35.1631, 129.1635, "159"], // 해운대
    [33.2541, 126.56, "184"], // 서귀포
    [36.3326, 127.4342, "133"], // 대전역
    [35.8714, 128.6014, "143"], // 대구 중구
    [35.1379, 126.7932, "156"], // 광주 송정
    [38.2, 128.6, "108"], // 속초 근처: 8곳 중에서는 서울(가까운 순)
  ];
  for (const [lat, lon, want] of cases) assert.equal(D.nearestStation(lat, lon, stations).id, want, `${lat},${lon}`);
  const r = D.nearestStation(37.2636, 127.0286, stations);
  assert.ok(r.km > 3 && r.km < 6, String(r.km));
  assert.equal(D.kmText(r.km), `${Math.round(r.km * 10) / 10}km`);
  assert.equal(D.kmText(12.4), "12km");
  // 꺼진 지점·좌표 없는 지점은 건너뜀, 좌표가 이상하면 null
  assert.equal(D.nearestStation(37.26, 127.03, stations.map((s) => (s.station_id === "119" ? { ...s, enabled: false } : s))).id, "108");
  assert.equal(D.nearestStation(37.26, 127.03, [{ station_id: "1" }]), null);
  assert.equal(D.nearestStation(NaN, 127, stations), null);
});

test("지점 우선순위: 주소 > 저장한 선택 > 서울 108", () => {
  const known = new Set(["108", "119", "159"]);
  assert.deepEqual({ ...D.pickStation({ url: "159", stored: { id: "119", why: "geo" }, known }) }, { id: "159", source: "url" });
  assert.deepEqual({ ...D.pickStation({ url: null, stored: { id: "119", why: "geo" }, known }) }, { id: "119", source: "geo" });
  assert.deepEqual({ ...D.pickStation({ url: null, stored: { id: "119", why: "manual" }, known }) }, { id: "119", source: "saved" });
  assert.deepEqual({ ...D.pickStation({ url: "777", stored: null, known }) }, { id: "108", source: "default" }); // 모르는 지점 번호는 무시
  assert.deepEqual({ ...D.pickStation({ url: null, stored: { id: "777", why: "geo" }, known }) }, { id: "108", source: "default" });
  assert.deepEqual({ ...D.pickStation({ stored: null, known: new Set(["159"]) }) }, { id: "159", source: "default" });
});

test("/api/station-pref: 로그인만, 알려진 지점 번호만, 좌표는 저장 안 함", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stpref-"));
  const file = path.join(dir, "view-prefs.json");
  const store = createJsonPrefsStore(file);
  assert.ok(isPrefsPath("/api/station-pref")); // auth.guard 의 requireUser 대상
  const call = async (method, owner, body) => {
    let out;
    const res = {};
    const json = (_r, b, code = 200) => { out = { code, b }; };
    await handlePrefs({ method }, res, new URL("http://x/api/station-pref"), { store, ownerOf: async () => owner, readBody: async () => body || {}, json, knownStation: async (id) => ["108", "119"].includes(id), presetIds: () => new Set() });
    return out;
  };
  assert.equal((await call("GET", null)).code, 401);
  assert.equal((await call("PUT", null, { station: "119" })).code, 401);
  assert.equal((await call("GET", "u1")).b.pref, null);
  assert.equal((await call("PUT", "u1", { station: "777" })).code, 400);
  assert.equal((await call("PUT", "u1", { station: "../x" })).code, 400);
  assert.equal((await call("DELETE", "u1")).code, 405);
  const ok = await call("PUT", "u1", { station: "119", latitude: 37.26, longitude: 127.03 });
  assert.equal(ok.code, 200);
  assert.equal(ok.b.pref.station, "119");
  assert.equal((await call("GET", "u1")).b.pref.station, "119");
  assert.equal((await call("GET", "u2")).b.pref, null); // 남의 것은 안 보임
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!/37\.26|127\.03|lat|lon/.test(raw), raw);
  // 기존 보기 설정(kind 별)과 섞이지 않음
  assert.deepEqual(await store.get("u1"), { hourly: null, daily: null });
});

test("마이그레이션: station_prefs 새 표만", () => {
  for (const f of ["../migrations/mysql/0005_station_prefs.sql", "../migrations/hub/0006_station_prefs.sql"]) {
    const sql = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS station_prefs/);
    assert.doesNotMatch(sql, /ALTER|DROP|latitude|longitude/i);
  }
});
