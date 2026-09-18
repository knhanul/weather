import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { listStations, queryDaily } from "@/lib/weather/fns";

export const Route = createFileRoute("/weather/daily")({ component: DailyPage });

function DailyPage() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => listStations({ data: {} }) });
  const [stationId, setStationId] = useState("108");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["daily", stationId, from, to, page],
    queryFn: () => queryDaily({ data: { stationId, from: from || undefined, to: to || undefined, page, pageSize: 24 } }),
  });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 24));

  return (
    <div>
      <PageHeader
        eyebrow="기상자료"
        title="일자료"
        description="기상청 공식 일자료입니다. 시간자료를 단순 평균한 값과 같다고 가정하지 않습니다."
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>관측지점</Label>
            <Select className="mt-1" value={stationId} onChange={(e) => { setStationId(e.target.value); setPage(1); }}>
              {(stations.data ?? []).slice(0, 80).map((s) => (
                <option key={s.stationId} value={s.stationId}>{s.stationId} {s.stationName}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>시작일</Label>
            <Input className="mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>종료일</Label>
            <Input className="mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {["관측일", "지점", "평균", "최저", "최고", "강수", "습도", "일조", "출처"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono tabular">{r.observationDate}</td>
                <td className="px-3 py-3">{r.stationId} {r.stationName}</td>
                <td className="px-3 py-3 tabular">{r.avgTemperature ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.minTemperature ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.maxTemperature ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.precipitation ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.avgHumidity ?? "—"}</td>
                <td className="px-3 py-3 tabular">{r.sunshineHours ?? "—"}</td>
                <td className="px-3 py-3"><Badge>{r.sourceKind === "OFFICIAL" ? "공식 일자료" : "시간집계"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted tabular">총 {total.toLocaleString()}건</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>다음</Button>
        </div>
      </div>
    </div>
  );
}
