import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { listStations, queryHourly } from "@/lib/weather/fns";
import { qcLabel } from "@/lib/weather/qc";
import type { Quality } from "@/lib/weather/types";

export const Route = createFileRoute("/weather/hourly")({ component: HourlyPage });

function HourlyPage() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => listStations({ data: {} }) });
  const [stationId, setStationId] = useState("108");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rainOnly, setRainOnly] = useState(false);
  const [tempMin, setTempMin] = useState("");
  const [tempMax, setTempMax] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["hourly", stationId, from, to, rainOnly, tempMin, tempMax, page],
    queryFn: () =>
      queryHourly({
        data: {
          stationId,
          from: from || undefined,
          to: to || undefined,
          rainOnly,
          tempMin: tempMin === "" ? undefined : Number(tempMin),
          tempMax: tempMax === "" ? undefined : Number(tempMax),
          page,
          pageSize: 24,
        },
      }),
  });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 24));

  return (
    <div>
      <PageHeader
        eyebrow="기상자료"
        title="시간자료"
        description="표준 관측 모델입니다. 기상청 원본 필드명(ta, rn 등)은 노출하지 않습니다. 시간은 Asia/Seoul 입니다."
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <Label>관측지점</Label>
            <Select className="mt-1" value={stationId} onChange={(e) => { setStationId(e.target.value); setPage(1); }}>
              {(stations.data ?? []).filter((s) => s.favorite || s.stationId === stationId || s.enabled).slice(0, 40).map((s) => (
                <option key={s.stationId} value={s.stationId}>
                  {s.stationId} {s.stationName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>시작</Label>
            <Input className="mt-1" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>종료</Label>
            <Input className="mt-1" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label>기온 최소 ℃</Label>
            <Input className="mt-1" type="number" inputMode="decimal" placeholder="제한 없음" value={tempMin} onChange={(e) => { setTempMin(e.target.value); setPage(1); }} />
          </div>
          <div>
            <Label>기온 최대 ℃</Label>
            <Input className="mt-1" type="number" inputMode="decimal" placeholder="제한 없음" value={tempMax} onChange={(e) => { setTempMax(e.target.value); setPage(1); }} />
          </div>
          <label className="mt-6 flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={rainOnly} onChange={(e) => { setRainOnly(e.target.checked); setPage(1); }} />
            강수 있는 시각만
          </label>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {["관측일시", "지점", "기온", "강수", "습도", "풍속", "적설", "품질"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono tabular">{r.observationDatetime}</td>
                <td className="px-3 py-3">{r.stationId} {r.stationName}</td>
                <td className="px-3 py-3 tabular">{fmt(r.temperature)}</td>
                <td className="px-3 py-3 tabular">{fmt(r.precipitation)}</td>
                <td className="px-3 py-3 tabular">{fmt(r.humidity)}</td>
                <td className="px-3 py-3 tabular">{fmt(r.windSpeed)}</td>
                <td className="px-3 py-3 tabular">{fmt(r.snowDepth)}</td>
                <td className="px-3 py-3">
                  <Badge tone={statusTone(r.qualityTemperature)}>{qcLabel(r.qualityTemperature as Quality)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !q.isLoading ? <p className="px-4 py-8 text-center text-sm text-muted">조건에 맞는 자료가 없습니다.</p> : null}
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

function fmt(v: number | null) {
  return v === null || v === undefined ? "—" : v;
}
