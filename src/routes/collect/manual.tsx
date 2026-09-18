import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { listDatasets, listStations, startCollection } from "@/lib/weather/fns";

export const Route = createFileRoute("/collect/manual")({ component: ManualPage });

function ManualPage() {
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: () => listDatasets() });
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => listStations({ data: { favorite: true } }) });
  const allStations = useQuery({ queryKey: ["stations-all"], queryFn: () => listStations({ data: {} }) });
  const [dataset, setDataset] = useState("ASOS_HOURLY");
  const [selected, setSelected] = useState<string[]>(["108"]);
  const [from, setFrom] = useState("2026-09-01 00:00:00");
  const [to, setTo] = useState("2026-09-11 23:00:00");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = (datasets.data ?? []).filter((d) => d.enabled && d.dataKind === "OBSERVATION");

  return (
    <div>
      <PageHeader
        eyebrow="데이터 수집"
        title="수동수집"
        description="기간을 지정하면 백엔드가 API 제한에 맞게 자동으로 구간을 나눕니다. 웹 요청이 끝날 때까지 5년치를 기다리지 않습니다."
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="grid gap-3">
            <div>
              <Label>Dataset</Label>
              <Select className="mt-1" value={dataset} onChange={(e) => setDataset(e.target.value)}>
                {enabled.map((d) => (
                  <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>시작일시</Label>
                <Input className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label>종료일시</Label>
                <Input className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>관측지점 (즐겨찾기)</Label>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {(stations.data ?? []).map((s) => (
                  <li key={s.stationId}>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.stationId)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, s.stationId] : prev.filter((x) => x !== s.stationId),
                          )
                        }
                      />
                      {s.stationId} {s.stationName}
                    </label>
                  </li>
                ))}
              </ul>
              <Select
                className="mt-3"
                value=""
                onChange={(e) => {
                  if (e.target.value) setSelected((p) => Array.from(new Set([...p, e.target.value])));
                }}
              >
                <option value="">지점 추가…</option>
                {(allStations.data ?? []).map((s) => (
                  <option key={s.stationId} value={s.stationId}>{s.stationId} {s.stationName}</option>
                ))}
              </Select>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle>수집 시작</CardTitle>
          <CardDesc>
            인증키가 없으면 작업이 실패로 기록됩니다. 키를 등록한 뒤 실패 구간만 재시도할 수 있습니다.
          </CardDesc>
          <Button
            className="mt-4 w-full"
            disabled={busy || !selected.length}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              try {
                const job = await startCollection({
                  data: { datasetCode: dataset, stationIds: selected, from, to },
                });
                setMsg(`작업 #${job.jobId} · ${job.chunkTotal}개 구간으로 분할했습니다.`);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "수집을 시작하지 못했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            수집 시작
          </Button>
          {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
          <Link to="/collect/jobs" className="mt-4 inline-block text-sm text-primary">수집이력에서 진행률 보기</Link>
        </Card>
      </div>
    </div>
  );
}
