import { authorize, json, logUsage, type ApiClient } from "./rest";

export async function withApiKey(
  request: Request,
  handler: (client: ApiClient, request: Request) => Promise<{ body: unknown; count?: number }>,
): Promise<Response> {
  const started = Date.now();
  const auth = await authorize(request);
  if (!auth.ok) {
    await logUsage(null, request, auth.status, null, started);
    return json({ error: auth.error }, auth.status);
  }
  try {
    const result = await handler(auth.client, request);
    await logUsage(auth.client, request, 200, result.count ?? null, started);
    return json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "요청을 처리할 수 없습니다.";
    await logUsage(auth.client, request, 400, null, started);
    return json({ error: { code: "BAD_REQUEST", message } }, 400);
  }
}
