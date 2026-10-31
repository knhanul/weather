// 특정일 캘린더 HTTP(/api/calendar/*) — 저장·해석은 calendar-events.mjs, 여기서는 경로·검증·응답 모양만 맡는다.
// 왜 /api/admin/ 아래에 두지 않았나: auth.handle 이 누니 ID 모드에서 /api/admin/* 를 404 로 먼저 잡아먹는다.
// 그래서 공개 조회는 /api/calendar/events, 쓰기(POST/PUT/DELETE)는 auth.guard 가 이미 관리자만 통과시킨다.
// 로그인 기능이 꺼진 개발 모드에서는 guard 가 전부 통과시키므로 관리자 화면 그대로 쓸 수 있다(기존 관리 화면과 같은 동작).
import {
  CALENDAR_EVENT_VERSION, CALENDAR_KINDS, kindOf, validateEventFields, resolveAll,
  seedRows, parseImport, parseIcs, looksLikeIcs, YEAR_MIN, YEAR_MAX,
} from "./calendar-events.mjs";

export const CALENDAR_API_VERSION = CALENDAR_EVENT_VERSION;
export const CALENDAR_PATH = "/api/calendar";
export const isCalendarPath = (p) => p === CALENDAR_PATH || p.startsWith(`${CALENDAR_PATH}/`);

const THIS_YEAR = () => new Date(Date.now() + 9 * 3600000).getUTCFullYear(); // 한국 시간 기준 올해(서버 시간대와 무관)

// 연도 파라미터: 정수가 아니면 기본값, 범위는 1900~2050 으로 자른다(음력 변환표 범위와 같음).
function yearParam(v, dflt) {
  if (v == null || String(v).trim() === "") return dflt; // Number(null)=0, Number("")=0 이라 빈 값을 0 으로 읽지 않게 먼저 거른다
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(YEAR_MAX, Math.max(YEAR_MIN, n)) : dflt;
}

// createCalendarApi({ store, json, readBody, isAdmin, log }) → handle(req, res, url) : 처리했으면 true
export function createCalendarApi({ store, json, readBody, isAdmin, log }) {
  const notFound = (res) => (json(res, { ok: false, message: "특정일을 찾을 수 없습니다." }, 404), true);

  return async function handle(req, res, url) {
    if (!isCalendarPath(url.pathname)) return false;
    const rest = url.pathname.slice(CALENDAR_PATH.length); // "" | "/events" | "/events/<id>" | "/seed" | "/import"
    if (!store) return json(res, { ok: false, message: "특정일 저장소를 쓸 수 없습니다." }, 503), true;

    // ---- 목록: GET /api/calendar/events (공개 = 해석된 날짜, ?all=1 = 관리자용 원본 행)
    if (rest === "/events" || rest === "/events/") {
      if (req.method === "GET") {
        if (url.searchParams.get("all") === "1") {
          if (!(await isAdmin(req))) return json(res, { ok: false, auth: "admin", message: "관리자만 볼 수 있습니다." }, 403), true;
          const events = await store.list();
          return json(res, { ok: true, version: CALENDAR_EVENT_VERSION, events, kinds: CALENDAR_KINDS }), true;
        }
        const to = yearParam(url.searchParams.get("to"), THIS_YEAR());
        const from = Math.min(to, yearParam(url.searchParams.get("from"), 1970)); // from>to 면 to 한 해만(빈 화면보다 낫다)
        const events = await store.list();
        return json(res, { ok: true, version: CALENDAR_EVENT_VERSION, events: resolveAll(events, from, to), errors: [] }), true;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const v = validateEventFields(body);
        if (!v.ok) return json(res, { ok: false, message: v.message }, 400), true;
        const event = await store.create({ ...v.value, source: "admin" });
        log?.(`calendar event added id=${event.id}`);
        return json(res, { ok: true, event }, 201), true;
      }
      return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
    }

    // ---- 기본 자료 채우기: POST /api/calendar/seed (id 가 결정적이라 여러 번 눌러도 중복 없음)
    if (rest === "/seed" || rest === "/seed/") {
      if (req.method !== "POST") return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
      const rows = seedRows();
      const { added, updated } = await store.upsertMany(rows);
      log?.(`calendar seed added=${added} updated=${updated}`);
      return json(res, { ok: true, added, total: (await store.list()).length }), true;
    }

    // ---- 붙여넣기 가져오기: POST /api/calendar/import { text, kind }
    if (rest === "/import" || rest === "/import/") {
      if (req.method !== "POST") return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
      const body = await readBody(req);
      const text = String(body.text ?? "");
      if (!text.trim()) return json(res, { ok: false, message: "가져올 내용을 붙여넣어 주세요." }, 400), true;
      if (text.length > 200000) return json(res, { ok: false, message: "한 번에 20만 자까지 가져올 수 있습니다." }, 400), true;
      // .ics(캘린더 파일)면 그 형식으로, 아니면 '한 줄에 하루' 글로 읽는다 — 둘을 한 상자에서 받는다.
      const ics = looksLikeIcs(text);
      const { rows, errors } = ics ? parseIcs(text, { kind: body.kind }) : parseImport(text, { kind: body.kind });
      if (!rows.length) return json(res, { ok: true, format: ics ? "ics" : "text", added: 0, updated: 0, errors }), true;
      // 같은 내용(종류·기준·월·일·연도·이름)이 이미 있으면 새 행을 만들지 않고 그 행을 갱신한다 — 연말에 같은 표를 다시 붙여도 중복이 안 생긴다.
      const cur = await store.list();
      const keyOf = (r) => [kindOf(r.kind), r.cal, r.leap ? 1 : 0, r.month, r.day, r.year ?? "", r.label].join("|");
      const byKey = new Map(cur.map((r) => [keyOf(r), r]));
      // 한 번 붙여넣은 글 안의 같은 줄도 한 번만 저장한다(같은 줄이 두 번 있으면 '2개 갱신'으로 부풀지 않게).
      const batch = new Map();
      for (const r of rows) {
        const hit = byKey.get(keyOf(r));
        const row = hit ? { ...r, id: hit.id, source: hit.source === "seed" ? "seed" : "import" } : r;
        batch.set(keyOf(r), row);
      }
      const toWrite = [...batch.values()];
      const { added, updated } = await store.upsertMany(toWrite);
      log?.(`calendar import added=${added} updated=${updated} errors=${errors.length} format=${ics ? "ics" : "text"}`);
      return json(res, { ok: true, format: ics ? "ics" : "text", added, updated, errors }), true;
    }

    // ---- 한 건: /events/<id> → PUT(부분 수정) · DELETE
    const m = /^\/events\/([^/]+)$/.exec(rest);
    if (!m) return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 404), true;
    const id = m[1];
    if (req.method === "PUT" || req.method === "PATCH") {
      const cur = await store.get(id);
      if (!cur) return notFound(res);
      const body = await readBody(req);
      // 부분 수정: 넘어온 값만 검증한다. 다만 기준(cal)·월·일 중 하나만 바뀌면 합친 값으로 다시 검증해야 4/31 같은 조합을 막을 수 있다.
      const merged = validateEventFields({ ...cur, ...body }, { partial: false });
      if (!merged.ok) return json(res, { ok: false, message: merged.message }, 400), true;
      const event = await store.update(id, merged.value);
      log?.(`calendar event updated id=${id}`);
      return json(res, { ok: true, event }), true;
    }
    if (req.method === "DELETE") {
      if (!(await store.remove(id))) return notFound(res);
      log?.(`calendar event removed id=${id}`);
      return json(res, { ok: true }), true;
    }
    if (req.method === "GET") {
      if (!(await isAdmin(req))) return json(res, { ok: false, auth: "admin", message: "관리자만 볼 수 있습니다." }, 403), true;
      const event = await store.get(id);
      if (!event) return notFound(res);
      return json(res, { ok: true, event }), true;
    }
    return json(res, { ok: false, message: "허용되지 않는 요청입니다." }, 405), true;
  };
}
