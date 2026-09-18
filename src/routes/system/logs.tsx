import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { listAudit } from "@/lib/weather/fns";

export const Route = createFileRoute("/system/logs")({ component: LogsPage });

function LogsPage() {
  const q = useQuery({ queryKey: ["audit"], queryFn: () => listAudit() });
  return (
    <div>
      <PageHeader eyebrow="시스템" title="감사로그" description="공급원·인증·자동수집·수동수집·대량 다운로드·API Key 발급/폐기를 기록합니다." />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {["시각", "역할", "행위", "대상", "내용"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono text-xs tabular">{r.at}</td>
                <td className="px-3 py-3">{r.role}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-3">{r.target}</td>
                <td className="px-3 py-3 text-muted">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
