import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-surface-2 text-muted",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function statusTone(status: string): keyof typeof tones {
  const s = status.toUpperCase();
  if (["OK", "COMPLETED", "ACTIVE", "ENABLED", "NORMAL", "정상"].includes(s)) return "ok";
  if (["PENDING", "RUNNING", "PARTIAL_SUCCESS", "WARN", "SUSPECT"].includes(s)) return "warn";
  if (["FAILED", "REVOKED", "DISABLED", "INVALID", "CANCELLED", "ERROR"].includes(s)) return "bad";
  if (["INFO", "SEED"].includes(s)) return "info";
  return "neutral";
}
