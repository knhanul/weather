import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { listStations, syncStations, toggleStation } from "@/lib/weather/fns";

export const Route = createFileRoute("/master/stations")({ component: StationsPage });

function StationsPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const list = useQuery({
    queryKey: ["stations", q, region, onlyFav],
    queryFn: () => listStations({ data: { q: q || undefined, region: region || undefined, favorite: onlyFav || undefined } }),
  });
  const [msg, setMsg] = useState("");

  return (
    <div>
      <PageHeader
        eyebrow="기준정보"
        title="관측지점"
        description="지점 코드는 소스에 하드코딩해 쓰지 않고 Master로 관리합니다. 즐겨찾기 지점이 자동수집 기본 대상입니다."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await syncStations();
              setMsg(`${r.upserted}개 지점을 동기화했습니다.`);
              void list.refetch();
            }}
          >
            지점정보 동기화
          </Button>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input placeholder="지점번호 또는 지점명" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">전체 지역</option>
            {["수도권", "강원", "충청", "전라", "경상", "제주"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            즐겨찾기만
          </label>
        </div>
        {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
      </Card>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {["지점", "이름", "지역", "관측유형", "좌표", "사용", "즐겨찾기"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((s) => (
              <tr key={s.stationId} className="border-t border-border">
                <td className="px-3 py-3 font-mono">{s.stationId}</td>
                <td className="px-3 py-3">{s.stationName}</td>
                <td className="px-3 py-3">{s.region}</td>
                <td className="px-3 py-3"><Badge>{s.stationType}</Badge></td>
                <td className="px-3 py-3 font-mono text-xs">{s.latitude ?? "—"}, {s.longitude ?? "—"}</td>
                <td className="px-3 py-3">
                  <button className="h-11 text-sm text-primary" onClick={async () => { await toggleStation({ data: { stationId: s.stationId, field: "enabled" } }); void list.refetch(); }}>
                    {s.enabled ? "사용" : "중지"}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <button className="h-11 text-sm text-primary" onClick={async () => { await toggleStation({ data: { stationId: s.stationId, field: "favorite" } }); void list.refetch(); }}>
                    {s.favorite ? "★ 활성지점" : "지정"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
