import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { listSchedules, saveSchedule } from "@/lib/weather/fns";
import { useState } from "react";

export const Route = createFileRoute("/collect/schedules")({ component: SchedulesPage });

function SchedulesPage() {
  const q = useQuery({ queryKey: ["schedules"], queryFn: () => listSchedules() });
  return (
    <div>
      <PageHeader
        eyebrow="데이터 수집"
        title="자동수집"
        description="주기는 코드에 고정하지 않습니다. Lookback으로 늦게 확정되는 최근 자료를 다시 UPSERT합니다."
      />
      <div className="grid gap-4">
        {(q.data ?? []).map((s) => (
          <ScheduleCard key={s.id} item={s} onSaved={() => void q.refetch()} />
        ))}
      </div>
    </div>
  );
}

function ScheduleCard({
  item,
  onSaved,
}: {
  item: Awaited<ReturnType<typeof listSchedules>>[number];
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [cadence, setCadence] = useState(item.cadence);
  const [lookback, setLookback] = useState(item.lookbackHours);
  const [scope, setScope] = useState(item.stationScope);
  const [msg, setMsg] = useState("");
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{item.datasetCode}</p>
          <p className="text-xs text-muted">마지막 실행 {item.lastRunAt ?? "없음"}</p>
        </div>
        <Badge tone={statusTone(enabled ? "ACTIVE" : "DISABLED")}>{enabled ? "ON" : "OFF"}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          자동수집
        </label>
        <div>
          <Label>주기</Label>
          <Select className="mt-1" value={cadence} onChange={(e) => setCadence(e.target.value as "HOURLY" | "DAILY")}>
            <option value="HOURLY">매시간</option>
            <option value="DAILY">매일</option>
          </Select>
        </div>
        <div>
          <Label>Lookback (시간)</Label>
          <Input className="mt-1" type="number" value={lookback} onChange={(e) => setLookback(Number(e.target.value))} />
        </div>
        <div>
          <Label>대상 지점</Label>
          <Select className="mt-1" value={scope} onChange={(e) => setScope(e.target.value as "FAVORITES" | "ENABLED" | "ALL")}>
            <option value="FAVORITES">즐겨찾기</option>
            <option value="ENABLED">사용 지점</option>
            <option value="ALL">전체</option>
          </Select>
        </div>
      </div>
      <Button
        className="mt-4"
        size="sm"
        onClick={async () => {
          await saveSchedule({
            data: { id: item.id, enabled, cadence: cadence as "HOURLY" | "DAILY", lookbackHours: lookback, stationScope: scope as "FAVORITES" | "ENABLED" | "ALL" },
          });
          setMsg("저장했습니다.");
          onSaved();
        }}
      >
        저장
      </Button>
      {msg ? <span className="ml-3 text-sm text-muted">{msg}</span> : null}
    </Card>
  );
}
