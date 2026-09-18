import type { Sql } from "@/lib/db";
import { asInt, asString } from "./db-rows";
import { enqueueCollection } from "./collector";
import { addHoursKst, latestOfficialHour } from "./timezone";

export async function runDueSchedules(sql: Sql): Promise<void> {
  const rows = await sql.query<Record<string, unknown>>(
    `select * from weather_schedules where enabled = true`,
  );
  const now = new Date();
  for (const row of rows) {
    const cadence = asString(row.cadence);
    const last = row.last_run_at ? new Date(asString(row.last_run_at)) : null;
    const due =
      !last ||
      (cadence === "HOURLY" && now.getTime() - last.getTime() > 55 * 60 * 1000) ||
      (cadence === "DAILY" && now.getTime() - last.getTime() > 20 * 60 * 60 * 1000);
    if (!due) continue;
    const dataset = asString(row.dataset_code);
    const lookback = asInt(row.lookback_hours) || 3;
    const latest = latestOfficialHour(now);
    const from = addHoursKst(latest, -lookback);
    const scope = asString(row.station_scope);
    let stations: Array<{ station_id: string }> = [];
    if (scope === "FAVORITES") {
      stations = await sql.query(`select station_id from weather_stations where is_favorite=true and enabled=true and station_type='ASOS'`);
    } else if (scope === "ENABLED") {
      stations = await sql.query(`select station_id from weather_stations where enabled=true and station_type='ASOS'`);
    } else {
      stations = await sql.query(`select station_id from weather_stations where station_type='ASOS'`);
    }
    const ids = stations.map((s) => asString(s.station_id)).slice(0, 8);
    if (!ids.length) continue;
    try {
      await enqueueCollection(sql, {
        datasetCode: dataset,
        stationIds: ids,
        from,
        to: latest,
        triggerType: "SCHEDULED",
        createdBy: "SCHEDULER",
      });
      await sql.query(
        `update weather_schedules set last_run_at=now(), last_status='QUEUED', updated_at=now() where id=$1`,
        [asInt(row.id)],
      );
    } catch (err) {
      await sql.query(
        `update weather_schedules set last_run_at=now(), last_status='FAILED', updated_at=now() where id=$1`,
        [asInt(row.id)],
      );
      console.error("[weather-hub] schedule failed", err);
    }
  }
}

