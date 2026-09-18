import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/api-admin/docs")({ component: DocsPage });

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/weather/hourly",
    desc: "시간 관측 조회",
    query: "station_id, from, to, page, page_size",
  },
  {
    method: "GET",
    path: "/api/v1/weather/hourly/nearest",
    desc: "요청 시각에 가장 가까운 실측 (보간 없음)",
    query: "station_id, datetime",
  },
  {
    method: "GET",
    path: "/api/v1/weather/daily",
    desc: "공식 일자료 조회",
    query: "station_id, from, to",
  },
  {
    method: "GET",
    path: "/api/v1/weather/summary",
    desc: "기간 요약 (명확한 통계만)",
    query: "station_id, from, to",
  },
  {
    method: "GET",
    path: "/api/v1/weather/stations",
    desc: "관측지점 목록",
    query: "q",
  },
  {
    method: "GET",
    path: "/api/v1/health",
    desc: "허브 상태 (인증 없음)",
    query: "",
  },
];

function DocsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="API 관리"
        title="내부 REST API"
        description="업무시스템은 기상청이 아니라 이 계약을 사용합니다. 버전은 /api/v1 입니다."
      />
      <Card className="mb-4">
        <CardTitle>인증</CardTitle>
        <CardDesc>헤더 X-API-Key. 미리보기 구내식당 키는 아래와 같습니다.</CardDesc>
        <pre className="mt-3 overflow-x-auto rounded-md bg-bg p-3 text-xs">
{`X-API-Key: whub_preview_cafeteria_read

GET /api/v1/weather/hourly?station_id=108&from=2026-09-12T09:00:00+09:00&to=2026-09-12T13:00:00+09:00`}
        </pre>
      </Card>
      <div className="grid gap-3">
        {ENDPOINTS.map((e) => (
          <Card key={e.path}>
            <p className="font-mono text-xs text-subtle">{e.method}</p>
            <p className="mt-1 font-mono text-sm">{e.path}</p>
            <p className="mt-2 text-sm text-muted">{e.desc}</p>
            {e.query ? <p className="mt-1 text-xs text-subtle">query: {e.query}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
