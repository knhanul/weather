import { mapFetchFailure, mapKmaResult, ProviderError } from "../errors";

export type KmaCallOptions = {
  baseUrl: string;
  path: string;
  apiKey: string;
  query: Record<string, string | number>;
  timeoutMs: number;
};

function encodeKey(key: string): string {
  // data.go.kr keys are often already percent-encoded. Do not double-encode.
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
  return encodeURIComponent(key);
}

export async function callKma(opts: KmaCallOptions): Promise<{
  httpStatus: number;
  body: string;
  parsed: unknown;
  format: "JSON" | "XML";
}> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query)) params.set(k, String(v));
  const url = `${opts.baseUrl}${opts.path}?${params.toString()}&serviceKey=${encodeKey(opts.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = await res.text();
    if (res.status === 429) {
      throw new ProviderError("RATE_LIMIT", "공급기관 호출 한도를 초과했습니다.", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("AUTH", "인증키를 확인하세요.", res.status);
    }
    if (res.status >= 500) {
      throw new ProviderError("SERVER", "공급기관 서버 오류(5xx)가 발생했습니다.", res.status);
    }
    const trimmed = body.trim();
    if (!trimmed) {
      throw new ProviderError("NO_DATA", "공급기관이 빈 응답을 반환했습니다.", res.status);
    }
    if (trimmed.startsWith("<")) {
      // OpenAPI gateway sometimes returns XML even when JSON is requested
      // (especially on auth errors). Parse enough of the header to map it.
      const code = trimmed.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
      const msg = trimmed.match(/<resultMsg>([^<]+)<\/resultMsg>/i)?.[1];
      const mapped = mapKmaResult(code, msg);
      if (!mapped.ok) throw new ProviderError(mapped.code, mapped.message, res.status);
      throw new ProviderError("PARSE", "JSON이 아닌 XML 응답을 받았습니다. 스키마 변경이 의심됩니다.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new ProviderError("PARSE", "응답 JSON을 해석할 수 없습니다. 스키마 변경이 의심됩니다.");
    }
    return { httpStatus: res.status, body: trimmed, parsed, format: "JSON" };
  } catch (err) {
    throw mapFetchFailure(err);
  } finally {
    clearTimeout(timer);
  }
}

export function asItems(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const response = (raw as { response?: { body?: { items?: unknown } } }).response;
  const items = response?.body?.items;
  if (!items || items === "" || typeof items !== "object") return [];
  const item = (items as { item?: unknown }).item;
  if (!item) return [];
  return Array.isArray(item) ? (item as Record<string, unknown>[]) : [item as Record<string, unknown>];
}

export function readHeader(raw: unknown): { resultCode?: string; resultMsg?: string } {
  if (!raw || typeof raw !== "object") return {};
  const header = (raw as { response?: { header?: Record<string, string> } }).response?.header;
  return {
    resultCode: header?.resultCode,
    resultMsg: header?.resultMsg,
  };
}

export function readPaging(raw: unknown): { totalCount: number; pageNo: number; numOfRows: number } {
  const body = (raw as { response?: { body?: Record<string, unknown> } })?.response?.body ?? {};
  return {
    totalCount: Number(body.totalCount ?? 0) || 0,
    pageNo: Number(body.pageNo ?? 1) || 1,
    numOfRows: Number(body.numOfRows ?? 0) || 0,
  };
}

export function unknownFields(item: Record<string, unknown>, known: readonly string[]): string[] {
  const set = new Set(known);
  return Object.keys(item).filter((k) => !set.has(k));
}
