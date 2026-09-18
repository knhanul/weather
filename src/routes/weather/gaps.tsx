import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { findGaps, listStations, startCollection } from "@/lib/weather/fns";

export const Route = createFileRoute("/weather/gaps")({ component: GapsPage });

function GapsPage() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => listStations({ data: {} }) });
  const [stationId, setStationId] = useState("108");
  const [from, setFrom] = useState("2026-09-01 00:00:00");
  const [to, setTo] = useState("2026-09-11 23:00:00");
  const q = useQuery({
    queryKey: ["gaps", stationId, from, to],
    queryFn: () => findGaps({ data: { stationId, from, to } }),
  });
  const [msg, setMsg] = useState("");

  return (
    <div>
      <PageHeader
        eyebrow="기상자료"
        title="누락 탐지"
        description="시간자료의 예상 시각(정시)과 실제 적재분을 비교합니다. 관측소 운영 기간 밖은 고려해야 하며, 발견 구간은 삭제 없이 재수집(UPSERT)합니다."
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>지점</Label>
            <Select className="mt-1" value={stationId} onChange={(e) => setStationId(e.target.value)}>
              {(stations.data ?? []).slice(0, 40).map((s) => (
                <option key={s.stationId} value={s.stationId}>{s.stationId} {s.stationName}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>시작</Label>
            <Input className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>종료</Label>
            <Input className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>
      <p className="mb-3 text-sm text-muted">
        예상 {q.data?.expected ?? "—"}시각 중 보유 {q.data?.have ?? "—"} · 누락 {q.data?.missing.length ?? "—"}
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <ul className="divide-y divide-border">
          {(q.data?.missing ?? []).slice(0, 80).map((t) => (
            <li key={t} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-mono tabular">{t}</span>
              <span className="text-muted">{stationId}</span>
            </li>
          ))}
        </ul>
        {!q.data?.missing.length && !q.isLoading ? <p className="px-4 py-8 text-center text-sm text-muted">누락 구간이 없습니다.</p> : null}
      </div>
      <div className="mt-4">
        <Button
          disabled={!q.data?.missing.length}
          onClick={async () => {
            setMsg("");
            const job = await startCollection({
              data: { datasetCode: "ASOS_HOURLY", stationIds: [stationId], from, to },
            });
            setMsg(`재수집 작업 #${job.jobId}을 시작했습니다. 기존 자료는 삭제하지 않습니다.`);
          }}
        >
          이 기간 재수집
        </Button>
        {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
      </div>
    </div>
  );
}
