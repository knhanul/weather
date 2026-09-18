import { createFileRoute } from "@tanstack/react-router";
import { queryDailyApi } from "@/lib/weather/rest";
import { withApiKey } from "@/lib/weather/rest-handler";

export const Route = createFileRoute("/api/v1/weather/daily")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiKey(request, async (_client, req) => {
          const body = await queryDailyApi(new URL(req.url));
          return { body, count: body.data.length };
        }),
    },
  },
});
