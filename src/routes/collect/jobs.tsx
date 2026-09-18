import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cancelCollection, getJob, listJobs, retryJob, tickJobs } from "@/lib/weather/fns";

export const Route = createFileRoute("/collect/jobs")({ component: JobsPage });

function JobsPage() {
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => listJobs(),
    refetchInterval: 2500,
  });
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useQuery({
    queryKey: ["job", openId],
    queryFn: () => getJob({ data: { id: openId! } }),
    enabled: openId !== null,
    refetchInterval: 2000,
  });

  useEffect(() => {
    const t = setInterval(() => {
      void tickJobs();
    }, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="데이터 수집"
        title="수집이력"
        description="장기간 수집은 Job 큐로 실행됩니다. 실패한 구간만 다시 받을 수 있습니다."
      />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {["ID", "Dataset", "기간", "상태", "진행", "수신/신규/갱신"].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).map((j) => (
                <tr
                  key={j.id}
                  className="cursor-pointer border-t border-border hover:bg-bg"
                  onClick={() => setOpenId(j.id)}
                >
                  <td className="px-3 py-3 font-mono">{j.id}</td>
                  <td className="px-3 py-3">{j.datasetCode}</td>
                  <td className="px-3 py-3 text-xs">{j.from} ~ {j.to}</td>
                  <td className="px-3 py-3"><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                  <td className="px-3 py-3 tabular">{j.chunkDone}/{j.chunkTotal}</td>
                  <td className="px-3 py-3 tabular">{j.received}/{j.inserted}/{j.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          <CardTitle>작업 상세</CardTitle>
          {detail.data ? (
            <div className="mt-3 text-sm">
              <p className="text-muted">{detail.data.datasetCode} · {detail.data.status}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${detail.data.chunkTotal ? (100 * detail.data.chunkDone) / detail.data.chunkTotal : 0}%` }}
                />
              </div>
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {detail.data.chunks.map((c) => (
                  <li key={c.id} className="rounded-md bg-bg px-3 py-2">
                    <div className="flex justify-between">
                      <span className="font-mono text-xs">{c.stationId} {c.from.slice(0, 16)}</span>
                      <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    </div>
                    {c.errorMessage ? <p className="mt-1 text-xs text-bad">{c.errorMessage}</p> : null}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void retryJob({ data: { id: detail.data!.id } })}>
                  실패 구간 재시도
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void cancelCollection({ data: { id: detail.data!.id } })}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">왼쪽에서 작업을 선택하세요.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
