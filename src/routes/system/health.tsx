import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { getHealth } from "@/lib/weather/fns";

export const Route = createFileRoute("/system/health")({ component: HealthPage });

function HealthPage() {
  const q = useQuery({ queryKey: ["health"], queryFn: () => getHealth(), refetchInterval: 10000 });
  const d = q.data;
  return (
    <div>
      <PageHeader
        eyebrow="시스템"
        title="환경상태"
        description="기상청 API 실패, 자동수집 실패, 데이터 지연, DB 상태를 한 화면에서 봅니다. 알림 채널은 이후 연결할 수 있습니다."
      />
      {d ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardTitle>데이터베이스</CardTitle>
            <CardDesc>{d.db}</CardDesc>
            <p className="mt-3 font-mono text-sm tabular">{d.hourlyRecords.toLocaleString()} hourly rows</p>
          </Card>
          <Card>
            <CardTitle>최신 시간자료</CardTitle>
            <p className="mt-3 font-mono text-sm">{d.latestHourly ?? "없음"}</p>
            <CardDesc>공식 제공 한계 {d.latestOfficial}</CardDesc>
          </Card>
          <Card>
            <CardTitle>최근 7일 실패 작업</CardTitle>
            <p className="mt-3 font-display text-3xl tabular">{d.failedJobs7d}</p>
          </Card>
          <Card>
            <CardTitle>시간대</CardTitle>
            <p className="mt-3">{d.timezone}</p>
            <CardDesc>서버 Locale에 의존하지 않습니다. 표시·저장·조회 모두 Asia/Seoul 정책입니다.</CardDesc>
          </Card>
          <Card className="sm:col-span-2">
            <CardTitle>백업</CardTitle>
            <CardDesc>
              기상자료는 재수집이 가능해도 설정·Dataset·지점·수집이력·API Client는 반드시 백업합니다.
              Docker 환경에서는 postgres 볼륨 스냅샷과 pg_dump를 사용하세요. 미리보기 DB는 재시작 시 시드로 복원됩니다.
            </CardDesc>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted">상태를 확인하는 중…</p>
      )}
    </div>
  );
}
