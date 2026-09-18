import { createFileRoute } from "@tanstack/react-router";
import { summaryApi } from "@/lib/weather/rest";
import { withApiKey } from "@/lib/weather/rest-handler";

export const Route = createFileRoute("/api/v1/weather/summary")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiKey(request, async (_client, req) => {
          const body = await summaryApi(new URL(req.url));
          return { body, count: body.sample_count };
        }),
    },
  },
});
