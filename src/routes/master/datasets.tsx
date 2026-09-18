import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listDatasets } from "@/lib/weather/fns";

export const Route = createFileRoute("/master/datasets")({ component: DatasetsPage });

function DatasetsPage() {
  const q = useQuery({ queryKey: ["datasets"], queryFn: () => listDatasets() });
  return (
    <div>
      <PageHeader
        eyebrow="기준정보"
        title="데이터셋"
        description="기상 종류는 코드에 하드코딩하지 않고 Dataset으로 관리합니다. 관측과 예보는 분리됩니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {(q.data ?? []).map((d) => (
          <Card key={d.code}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-subtle">{d.code}</p>
                <h2 className="mt-1 font-display text-xl">{d.name}</h2>
              </div>
              <Badge tone={statusTone(d.enabled ? "ENABLED" : "DISABLED")}>{d.enabled ? "사용" : "대기"}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted">{d.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-subtle">공급원</dt><dd>{d.provider}</dd></div>
              <div><dt className="text-subtle">구분</dt><dd>{d.dataKind === "OBSERVATION" ? "관측" : "예보"}</dd></div>
              <div><dt className="text-subtle">해상도</dt><dd>{d.timeResolution}</dd></div>
              <div><dt className="text-subtle">커넥터</dt><dd className="font-mono text-xs">{d.connectorId}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
