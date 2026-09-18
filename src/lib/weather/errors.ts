export type ProviderErrorCode =
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "SERVER"
  | "BAD_REQUEST"
  | "NO_DATA"
  | "PARSE"
  | "SCHEMA"
  | "NO_KEY"
  | "UNKNOWN";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  httpStatus?: number;
  constructor(code: ProviderErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const KMA_RESULT: Record<string, { code: ProviderErrorCode; message: string }> = {
  "00": { code: "UNKNOWN", message: "정상" },
  "0": { code: "UNKNOWN", message: "정상" },
  "01": { code: "SERVER", message: "공급기관 어플리케이션 오류입니다." },
  "02": { code: "SERVER", message: "공급기관 데이터베이스 오류입니다." },
  "03": { code: "NO_DATA", message: "해당 조건의 관측자료가 없습니다." },
  "04": { code: "SERVER", message: "공급기관 HTTP 오류입니다." },
  "05": { code: "TIMEOUT", message: "공급기관 서비스 연결에 실패했습니다." },
  "10": { code: "BAD_REQUEST", message: "요청 파라미터가 올바르지 않습니다." },
  "11": { code: "BAD_REQUEST", message: "필수 요청 파라미터가 없습니다." },
  "12": { code: "SERVER", message: "해당 오픈API 서비스가 없거나 폐기되었습니다." },
  "20": { code: "AUTH", message: "서비스 접근이 거부되었습니다. 인증키를 확인하세요." },
  "21": { code: "AUTH", message: "일시적으로 사용할 수 없는 인증키입니다." },
  "22": { code: "RATE_LIMIT", message: "공급기관 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요." },
  "30": { code: "AUTH", message: "등록되지 않은 인증키입니다." },
  "31": { code: "AUTH", message: "기한이 만료된 인증키입니다." },
  "32": { code: "AUTH", message: "등록되지 않은 호출 IP입니다." },
  "33": { code: "AUTH", message: "서명되지 않은 호출입니다." },
  "99": { code: "UNKNOWN", message: "공급기관에서 기타 오류를 반환했습니다." },
};

export function mapKmaResult(resultCode: string | undefined, resultMsg?: string): {
  ok: boolean;
  code: ProviderErrorCode;
  message: string;
} {
  const raw = (resultCode ?? "").trim();
  if (raw === "00" || raw === "0") return { ok: true, code: "UNKNOWN", message: "정상" };
  const mapped = KMA_RESULT[raw];
  if (mapped) return { ok: false, ...mapped };
  const msg = (resultMsg ?? "").toUpperCase();
  if (msg.includes("LIMITED_NUMBER")) {
    return { ok: false, code: "RATE_LIMIT", message: "공급기관 호출 한도를 초과했습니다." };
  }
  if (msg.includes("SERVICE_KEY") || msg.includes("UNAUTHORIZED")) {
    return { ok: false, code: "AUTH", message: "인증키를 확인하세요." };
  }
  if (msg.includes("NO_DATA") || msg.includes("NODATA")) {
    return { ok: false, code: "NO_DATA", message: "해당 조건의 관측자료가 없습니다." };
  }
  return {
    ok: false,
    code: "UNKNOWN",
    message: "공급기관 응답을 해석할 수 없습니다.",
  };
}

export function mapFetchFailure(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout")) {
    return new ProviderError("TIMEOUT", "공급기관 응답 시간이 초과되었습니다.");
  }
  if (lower.includes("enotfound") || lower.includes("dns") || lower.includes("econnrefused")) {
    return new ProviderError("UNREACHABLE", "공급기관 서버에 연결할 수 없습니다.");
  }
  if (lower.includes("json") || lower.includes("parse") || lower.includes("unexpected")) {
    return new ProviderError("PARSE", "응답 형식을 해석할 수 없습니다. 스키마 변경이 의심됩니다.");
  }
  return new ProviderError("UNKNOWN", "공급기관 호출 중 오류가 발생했습니다.");
}
