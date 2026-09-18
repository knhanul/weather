import { createFileRoute } from "@tanstack/react-router";
import { nearestHourly } from "@/lib/weather/rest";
import { withApiKey } from "@/lib/weather/rest-handler";

export const Route = createFileRoute("/api/v1/weather/hourly/nearest")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiKey(request, async (_client, req) => {
          const body = await nearestHourly(new URL(req.url));
          return { body, count: body.data ? 1 : 0 };
        }),
    },
  },
});
