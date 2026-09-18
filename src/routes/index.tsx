import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { getDashboard, acknowledgeAlert } from "@/lib/weather/fns";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const [ack, setAck] = useState<number[]>([]);
  const d = q.data;

  return (
    <div>
      <PageHeader
        eyebrow="운영 현황"
        title="기상허브"
        description="외부 기상 API를 한 번 수집해 표준화하고, 구내식당·시설·에너지 등 업무시스템은 내부 API만 사용합니다."
      />

      {q.isLoading ? <p className="text-sm text-muted">상태를 불러오는 중…</p> : null}
      {q.error ? <p className="text-sm text-bad">대시보드를 불러오지 못했습니다.</p> : null}

      {d ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {d.coverage.map((c) => (
              <Card key={c.datasetCode}>
                <p className="text-xs uppercase tracking-wide text-subtle">보유 데이터</p>
                <CardTitle className="mt-2">{c.datasetCode}</CardTitle>
                <p className="mt-3 font-mono text-sm tabular">
                  {c.first} ~ {c.last}
                </p>
                <CardDesc>
                  {c.records.toLocaleString()}건 · 지점 {c.stations}곳
                </CardDesc>
              </Card>
            ))}
            {d.dailyCoverage.map((c) => (
              <Card key={c.datasetCode}>
                <p className="text-xs uppercase tracking-wide text-subtle">보유 데이터</p>
                <CardTitle className="mt-2">{c.datasetCode}</CardTitle>
                <p className="mt-3 font-mono text-sm tabular">
                  {c.first} ~ {c.last}
                </p>
                <CardDesc>
                  {c.records.toLocaleString()}건 · 지점 {c.stations}곳
                </CardDesc>
              </Card>
            ))}
            <Card>
              <p className="text-xs uppercase tracking-wide text-subtle">최근 수집</p>
              <CardTitle className="mt-2">{d.lastJob?.status ?? "없음"}</CardTitle>
              <div className="mt-3">
                {d.lastJob ? <Badge tone={statusTone(d.lastJob.status)}>{d.lastJob.datasetCode}</Badge> : null}
              </div>
              <CardDesc>
                {d.lastJob
                  ? `${d.lastJob.completed ?? "진행 중"} · 수신 ${d.lastJob.received} / 신규 ${d.lastJob.inserted} / 갱신 ${d.lastJob.updated}`
                  : "아직 수집 이력이 없습니다."}
              </CardDesc>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-subtle">데이터 품질</p>
              <CardTitle className="mt-2 tabular">{d.missingHours}시간</CardTitle>
              <CardDesc>서울(108) 최근 3일 관측 누락</CardDesc>
              <Link to="/weather/gaps" className="mt-3 inline-block text-sm text-primary">
                누락 구간 보기
              </Link>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-subtle">내부 API</p>
              <CardTitle className="mt-2 tabular">{d.apiToday.toLocaleString()}건</CardTitle>
              <CardDesc>오늘 업무시스템 요청</CardDesc>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="min-h-72">
              <CardTitle>서울 108 · 최근 기온</CardTitle>
              <CardDesc>시드/수집된 시간자료. 보간하지 않은 실측 시계열입니다.</CardDesc>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#ddd4c4" strokeDasharray="3 6" />
                    <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#6f6a62" }} minTickGap={28} />
                    <YAxis tick={{ fontSize: 11, fill: "#6f6a62" }} width={36} />
                    <Tooltip
                      contentStyle={{ background: "#fbf8f1", border: "1px solid #ddd4c4", borderRadius: 8 }}
                    />
                    <Line type="monotone" dataKey="temperature" stroke="#1f4e5f" dot={false} strokeWidth={1.8} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardTitle>공급원 상태</CardTitle>
              <ul className="mt-4 flex flex-col gap-3">
                {d.providers.map((p) => (
                  <li key={p.code} className="rounded-md border border-border bg-bg px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{p.name}</p>
                      <Badge tone={statusTone(p.lastTestStatus ?? p.status)}>
                        {p.lastTestStatus ?? p.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      인증 {p.keySource === "NONE" ? "미등록" : `등록됨 ${p.keyHint ?? ""}`}
                      {p.lastCollectAt ? ` · 최근 수집 ${p.lastCollectAt}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {d.alerts.filter((a) => !ack.includes(a.id)).length ? (
            <Card>
              <CardTitle>운영 알림</CardTitle>
              <ul className="mt-4 flex flex-col gap-3">
                {d.alerts
                  .filter((a) => !ack.includes(a.id))
                  .map((a) => (
                    <li key={a.id} className="flex flex-col gap-2 rounded-md bg-bg px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                          <p className="text-sm font-medium">{a.title}</p>
                        </div>
                        <p className="mt-1 text-sm text-muted">{a.message}</p>
                      </div>
                      <button
                        className="h-11 shrink-0 text-sm text-primary"
                        onClick={() => {
                          setAck((s) => [...s, a.id]);
                          void acknowledgeAlert({ data: { id: a.id } });
                        }}
                      >
                        확인
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
