type Quality = "NORMAL" | "SUSPECT" | "INVALID" | "MISSING";
/**
 * Official ASOS QC flags (기상청 Open API 활용가이드):
 *   정상 = null (empty)
 *   오류 = 1
 *   결측 = 9
 *
 * Sample tables sometimes print `0` as an example value. `0` is stored as the
 * original provider code and treated as NORMAL, not invented.
 */
export function normalizeQc(raw: string | null | undefined): Quality {
  if (raw === null || raw === undefined) return "NORMAL";
  const v = String(raw).trim();
  if (v === "" || v === "0") return "NORMAL";
  if (v === "1") return "INVALID";
  if (v === "9") return "MISSING";
  return "SUSPECT";
}

export function qcLabel(q: Quality): string {
  switch (q) {
    case "NORMAL":
      return "정상";
    case "INVALID":
      return "오류";
    case "MISSING":
      return "결측";
    default:
      return "주의";
  }
}

export function emptyToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

/** Parse a numeric observation. Empty / missing → null. Never coerce null to 0. */
export function parseNullableNumber(value: unknown): number | null {
  const s = emptyToNull(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseNullableInt(value: unknown): number | null {
  const n = parseNullableNumber(value);
  return n === null ? null : Math.trunc(n);
}
