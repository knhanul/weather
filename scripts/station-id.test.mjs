// 관측지점 값 다루기: 저장값 nw.station 은 { id, why, at } 객체 — 화면이 객체를 그대로 서버에 보내 '[object Object]' 조회 실패가 나던 회귀 방지
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { unknownStationMsg } from "../stats-engine.mjs";

const ctx = { Intl, Math, Number, String, Set, Object };
vm.runInNewContext(fs.readFileSync(new URL("../public/geo.js", import.meta.url), "utf8"), ctx);
const idOf = ctx.NWDefaults.stationIdOf;

test("stationIdOf: 번호·숫자·{id}·{station_id} 를 받고 나머지는 null", () => {
  assert.equal(idOf("108"), "108");
  assert.equal(idOf(159), "159");
  assert.equal(idOf(" 108 "), "108");
  assert.equal(idOf({ id: "159", why: "manual", at: 1 }), "159");
  assert.equal(idOf({ station_id: 184 }), "184");
  for (const bad of [null, undefined, "", "[object Object]", String({}), {}, { id: {} }, "108;drop", "abc", "1234567"]) assert.equal(idOf(bad), null, String(bad));
});

test("서버 문구: 번호만 되풀이하고 '[object Object]' 는 보여 주지 않음", () => {
  assert.equal(unknownStationMsg("999"), "알 수 없는 관측지점입니다: 999");
  for (const v of ["[object Object]", {}, "<b>x</b>", "", null]) {
    const m = unknownStationMsg(v);
    assert.ok(m.startsWith("알 수 없는 관측지점입니다"));
    assert.ok(!/object|<b>/.test(m), m);
  }
});

test("화면 코드가 NWStation.stored() 객체를 지점 번호처럼 쓰지 않음", () => {
  for (const f of fs.readdirSync(new URL("../public/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/NWStation\??\.stored\??\.?\(\)([^\n]{0,4})/g)) {
      const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
      const ok = /^\??\.id/.test(m[1]) || /idOf\(window\.NWStation\?\.stored\?\.\(\)\)/.test(line) || /saved\s*=\s*window\.NWStation && NWStation\.stored\(\);/.test(line) || /stored:\s*window\.NWStation && NWStation\.stored\(\)/.test(line);
      assert.ok(ok, `${f}: ${line.trim().slice(0, 140)}`);
    }
  }
});

test("화면 스크립트 문법(public/*.js 가 모두 읽힘 — 한 파일 오류로 화면 전체가 멈추지 않게)", () => {
  for (const f of fs.readdirSync(new URL("../public/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8"), { filename: f }), f);
  }
});
