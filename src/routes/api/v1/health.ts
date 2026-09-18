import { createFileRoute } from "@tanstack/react-router";
import { ensureWeatherReady } from "@/lib/weather/bootstrap";
import { getSql } from "@/lib/db";
import { latestOfficialHour } from "@/lib/weather/timezone";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () => {
        await ensureWeatherReady();
        const sql = await getSql();
        const n = await sql.query<{ n: number }>(`select count(*)::int as n from weather_observations_hourly`);
        return Response.json({
          status: "ok",
          timezone: "Asia/Seoul",
          latestOfficialHour: latestOfficialHour(),
          hourlyRecords: n[0]?.n ?? 0,
        });
      },
    },
  },
});
