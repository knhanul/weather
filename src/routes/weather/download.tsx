import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { EXPORT_COLUMNS } from "@/lib/weather/types";
import { listStations, startExport } from "@/lib/weather/fns";

export const Route = createFileRoute("/weather/download")({ component: DownloadPage });

function DownloadPage() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => listStations({ data: {} }) });
  const [kind, setKind] = useState<"hourly" | "daily">("hourly");
  const [stationId, setStationId] = useState("108");
  const [from, setFrom] = useState("2026-09-01");
  const [to, setTo] = useState("2026-09-11");
  const defaults = useMemo(
    () => EXPORT_COLUMNS.filter((c) => c.defaultOn && (c.group === "both" || c.group === kind)).map((c) => c.key),
    [kind],
  );
  const [cols, setCols] = useState<string[]>(defaults);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const visible = EXPORT_COLUMNS.filter((c) => c.group === "both" || c.group === kind);

  async function run(format: "CSV" | "XLSX" | "JSON") {
    setBusy(true);
    setMsg("");
    try {
      const res = await startExport({
        data: { format, kind, stationId, from, to, columns: cols },
      });
      const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: res.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${res.rowCount}건을 ${format}로 생성했습니다.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "내보내기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="기상자료"
        title="다운로드"
        description="조회 조건을 지정한 뒤 CSV / XLSX / JSON으로 받습니다. 파일 상단에 출처·기간·시간대 메타데이터를 포함합니다. 브라우저 메모리에 전체를 올리지 않고 서버에서 생성합니다."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>자료 종류</Label>
              <Select className="mt-1" value={kind} onChange={(e) => {
                const k = e.target.value as "hourly" | "daily";
                setKind(k);
                setCols(EXPORT_COLUMNS.filter((c) => c.defaultOn && (c.group === "both" || c.group === k)).map((c) => c.key));
              }}>
                <option value="hourly">시간자료</option>
                <option value="daily">일자료</option>
              </Select>
            </div>
            <div>
              <Label>관측지점</Label>
              <Select className="mt-1" value={stationId} onChange={(e) => setStationId(e.target.value)}>
                {(stations.data ?? []).slice(0, 90).map((s) => (
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
          <div className="mt-6">
            <div className="mb-2 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCols(visible.map((c) => c.key))}>전체 선택</Button>
              <Button variant="ghost" size="sm" onClick={() => setCols(visible.filter((c) => c.defaultOn).map((c) => c.key))}>기본 선택</Button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {visible.map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cols.includes(c.key)}
                      onChange={(e) => setCols((prev) => e.target.checked ? [...prev, c.key] : prev.filter((x) => x !== c.key))}
                    />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card>
          <CardTitle>파일 생성</CardTitle>
          <CardDesc>대용량은 서버에서 만든 뒤 내려받습니다.</CardDesc>
          <div className="mt-4 flex flex-col gap-2">
            <Button disabled={busy || !cols.length} onClick={() => void run("CSV")}>CSV 다운로드</Button>
            <Button variant="secondary" disabled={busy || !cols.length} onClick={() => void run("XLSX")}>XLSX 다운로드</Button>
            <Button variant="secondary" disabled={busy || !cols.length} onClick={() => void run("JSON")}>JSON 다운로드</Button>
          </div>
          {msg ? <p className="mt-4 text-sm text-muted">{msg}</p> : null}
        </Card>
      </div>
    </div>
  );
}
