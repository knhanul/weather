import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { listProviders, runConnectionTest, saveProviderKey, saveProviderSettings } from "@/lib/weather/fns";

export const Route = createFileRoute("/master/providers")({ component: ProvidersPage });

function ProvidersPage() {
  const q = useQuery({ queryKey: ["providers"], queryFn: () => listProviders() });
  return (
    <div>
      <PageHeader
        eyebrow="기준정보"
        title="데이터 공급원"
        description="인증키 전체 값은 화면에 표시되지 않습니다. 브라우저는 기상청을 직접 호출하지 않습니다."
      />
      <div className="grid gap-4">
        {(q.data ?? []).map((p) => (
          <ProviderCard key={p.code} item={p} onSaved={() => void q.refetch()} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  item,
  onSaved,
}: {
  item: Awaited<ReturnType<typeof listProviders>>[number];
  onSaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [test, setTest] = useState("");
  const [rps, setRps] = useState(item.requestsPerSecond);
  const [rpm, setRpm] = useState(item.requestsPerMinute);
  const [retry, setRetry] = useState(item.retryCount);
  const [timeout, setTimeoutSec] = useState(item.timeoutSeconds);
  const [chunk, setChunk] = useState(item.chunkDays);
  const [raw, setRaw] = useState(item.preserveRaw);
  const [keep, setKeep] = useState(item.rawRetentionDays);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-subtle">{item.providerName}</p>
          <CardTitle className="mt-1">{item.serviceName}</CardTitle>
          <p className="mt-1 font-mono text-xs text-muted">{item.baseUrl}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={statusTone(item.status)}>{item.status === "ENABLED" ? "사용" : "중지"}</Badge>
          <Badge tone={item.keySource === "NONE" ? "warn" : "ok"}>
            인증정보 {item.keySource === "NONE" ? "미등록" : `등록됨 ${item.keyHint ?? ""}`}
          </Badge>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        최근 연결시험 {item.lastTestStatus ?? "없음"}
        {item.lastTestMessage ? ` · ${item.lastTestMessage}` : ""}
        {item.lastCollectAt ? ` · 최근 수집 ${item.lastCollectAt}` : ""}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>인증키 (표시되지 않음)</Label>
          <div className="mt-1 flex gap-2">
            <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="공공데이터포털 인증키" />
            <Button
              variant="secondary"
              onClick={async () => {
                await saveProviderKey({ data: { serviceCode: item.serviceCode, apiKey: key } });
                setKey("");
                onSaved();
              }}
              disabled={key.length < 8}
            >
              등록
            </Button>
          </div>
        </div>
        <Field label="초당 호출" value={rps} set={setRps} />
        <Field label="분당 호출" value={rpm} set={setRpm} />
        <Field label="재시도" value={retry} set={setRetry} />
        <Field label="Timeout(초)" value={timeout} set={setTimeoutSec} />
        <Field label="Chunk(일)" value={chunk} set={setChunk} />
        <Field label="원본 보존(일)" value={keep} set={setKeep} />
      </div>
      <label className="mt-3 flex h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
        원본 응답 보존
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await saveProviderSettings({
              data: {
                serviceCode: item.serviceCode,
                requestsPerSecond: rps,
                requestsPerMinute: rpm,
                retryCount: retry,
                timeoutSeconds: timeout,
                chunkDays: chunk,
                preserveRaw: raw,
                rawRetentionDays: keep,
                status: item.status as "ENABLED" | "DISABLED",
              },
            });
            onSaved();
          }}
        >
          설정 저장
        </Button>
        <Button
          onClick={async () => {
            const r = await runConnectionTest({ data: { datasetCode: item.serviceCode } });
            setTest(r.ok ? `${r.message}${r.latest ? ` · 최근 관측 ${r.latest}` : ""}` : r.message);
            onSaved();
          }}
        >
          연결 테스트
        </Button>
      </div>
      {test ? <p className="mt-3 text-sm">{test}</p> : null}
    </Card>
  );
}

function Field({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1" type="number" value={value} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
}
