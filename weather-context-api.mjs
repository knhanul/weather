import {
  recentContext,
  contextBattle,
  seasonStory,
  opponentDate,
  CRITERIA,
  validDate,
} from "./weather-context-engine.mjs";
import { kstDate, SEASON_NAMES } from "./season-calendar.mjs";
export const CONTEXT_PATHS = [
  "/api/stats/context-today",
  "/api/stats/context-battle",
  "/api/stats/context-season",
];
export function createWeatherContextApi({
  statsData,
  statsHourly,
  stations,
  json,
  now = () => new Date(),
  sourceAllowed = async () => true,
}) {
  return async (req, res, url) => {
    if (!CONTEXT_PATHS.includes(url.pathname)) return false;
    if (req.method !== "GET") {
      json(res, { ok: false, message: "GET 조회만 지원합니다" }, 405);
      return true;
    }
    try {
      const q = url.searchParams,
        id = q.get("station") || "108",
        list = await stations(),
        st = list.find((s) => String(s.station_id) === id);
      if (!st) throw new RangeError("지원하지 않는 관측소입니다");
      if (!(await sourceAllowed(id))) {
        json(
          res,
          {
            ok: false,
            message: "공식 관측 자료가 준비되지 않았어요. 시드 데이터로 비교하지 않습니다.",
          },
          503,
        );
        return true;
      }
      const daily = await statsData.get(id),
        clock = now(),
        today = kstDate(clock);
      const maxHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(clock),
      );
      let body;
      if (url.pathname.endsWith("context-season")) {
        const year = q.has("year") ? Number(q.get("year")) : +today.slice(0, 4);
        if (!Number.isInteger(year) || year < 1970 || year > Math.min(2050, +today.slice(0, 4)))
          throw new RangeError("연도는 1970년부터 올해까지 골라 주세요");
        body = seasonStory({ daily, today, year, name: q.get("name") || "입동" });
        body.names = SEASON_NAMES;
      } else {
        const hourly = await statsHourly.get(id);
        if (url.pathname.endsWith("context-today"))
          body = recentContext({ daily, hourly, today, maxHour });
        else {
          const date1 = q.get("date1") || daily.lastDate || today;
          if (!validDate(date1)) throw new RangeError("기준 날짜를 확인해 주세요");
          const preset = q.get("opponent") || "yesterday";
          if (!["yesterday", "week", "year", "custom"].includes(preset))
            throw new RangeError("비교 상대를 확인해 주세요");
          const date2 = opponentDate(date1, preset, q.get("date2"));
          body = contextBattle({
            daily,
            hourly,
            today,
            maxHour,
            date1,
            date2,
            period: q.get("period") || "exact",
            criteria: (q.get("criteria") ?? "cooler,dry,calm").split(",").filter(Boolean),
          });
          body.criteria = CRITERIA;
        }
      }
      json(res, {
        ok: true,
        station: { id, name: st.station_name },
        source: "기상청 ASOS 관측 · 같은 관측소 (예보 미포함)",
        timezone: "Asia/Seoul",
        today,
        ...body,
      });
    } catch (e) {
      if (e instanceof RangeError) json(res, { ok: false, message: e.message }, 400);
      else throw e;
    }
    return true;
  };
}
