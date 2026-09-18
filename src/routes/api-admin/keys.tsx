import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { createApiClient, listApiClients, revokeApiClient } from "@/lib/weather/fns";

export const Route = createFileRoute("/api-admin/keys")({ component: KeysPage });

function KeysPage() {
  const q = useQuery({ queryKey: ["api-clients"], queryFn: () => listApiClients() });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        eyebrow="API 관리"
        title="내부 API Key"
        description="업무시스템별 키를 발급합니다. 키 원문은 생성 직후 한 번만 보여 주고, DB에는 해시만 저장합니다."
      />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardTitle>키 발급</CardTitle>
          <CardDesc>예: 구내식당 시스템</CardDesc>
          <Label className="mt-4 block">이름</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          <Label className="mt-3 block">코드</Label>
          <Input className="mt-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CAFETERIA_SYSTEM" />
          <Button
            className="mt-4 w-full"
            disabled={name.length < 2 || code.length < 2}
            onClick={async () => {
              const r = await createApiClient({ data: { name, code } });
              setRevealed(r.plaintext);
              setName("");
              setCode("");
              void q.refetch();
            }}
          >
            발급
          </Button>
          {revealed ? (
            <div className="mt-4 rounded-md bg-warn-bg p-3 text-sm">
              <p className="font-medium text-warn">지금만 복사하세요</p>
              <p className="mt-2 break-all font-mono text-xs">{revealed}</p>
            </div>
          ) : null}
        </Card>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {["이름", "코드", "접두", "권한", "상태", ""].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-3">{c.name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{c.code}</td>
                  <td className="px-3 py-3 font-mono text-xs">{c.prefix}…</td>
                  <td className="px-3 py-3">{c.scopes}</td>
                  <td className="px-3 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td className="px-3 py-3">
                    {c.status === "ACTIVE" ? (
                      <Button size="sm" variant="ghost" onClick={async () => { await revokeApiClient({ data: { id: c.id } }); void q.refetch(); }}>폐기</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
