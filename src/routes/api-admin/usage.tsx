import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { listApiUsage } from "@/lib/weather/fns";

export const Route = createFileRoute("/api-admin/usage")({ component: UsagePage });

function UsagePage() {
  const q = useQuery({ queryKey: ["api-usage"], queryFn: () => listApiUsage(), refetchInterval: 8000 });
  return (
    <div>
      <PageHeader eyebrow="API 관리" title="이용내역" description="어떤 업무시스템이 기상자료를 얼마나 쓰는지 확인합니다. API Key 원문은 로그에 남기지 않습니다." />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {["시각", "클라이언트", "API", "결과", "건수", "ms"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono text-xs tabular">{r.at}</td>
                <td className="px-3 py-3">{r.client}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.method} {r.path}</td>
                <td className="px-3 py-3"><Badge tone={r.status < 400 ? "ok" : "bad"}>{r.status}</Badge></td>
                <td className="px-3 py-3 tabular">{r.count ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.ms ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
