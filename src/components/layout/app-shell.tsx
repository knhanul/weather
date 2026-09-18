import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  CloudSun,
  Database,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Menu,
  Radio,
  ScrollText,
  Server,
  Settings2,
  TimerReset,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { getSession, setSessionRole } from "@/lib/weather/fns";
import type { Role } from "@/lib/weather/types";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles?: Role[] };

const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "운영",
    items: [{ to: "/", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    title: "기상자료",
    items: [
      { to: "/weather/hourly", label: "시간자료", icon: CloudSun },
      { to: "/weather/daily", label: "일자료", icon: CloudSun },
      { to: "/weather/download", label: "다운로드", icon: Download },
      { to: "/weather/gaps", label: "누락 탐지", icon: Activity, roles: ["ADMIN", "DATA_MANAGER"] },
    ],
  },
  {
    title: "데이터 수집",
    items: [
      { to: "/collect/manual", label: "수동수집", icon: TimerReset, roles: ["ADMIN", "DATA_MANAGER"] },
      { to: "/collect/schedules", label: "자동수집", icon: Radio, roles: ["ADMIN", "DATA_MANAGER"] },
      { to: "/collect/jobs", label: "수집이력", icon: ListChecks },
    ],
  },
  {
    title: "기준정보",
    items: [
      { to: "/master/datasets", label: "데이터셋", icon: Database },
      { to: "/master/stations", label: "관측지점", icon: MapPin },
      { to: "/master/providers", label: "공급원", icon: Server, roles: ["ADMIN"] },
    ],
  },
  {
    title: "API 관리",
    items: [
      { to: "/api-admin/keys", label: "내부 API Key", icon: KeyRound, roles: ["ADMIN"] },
      { to: "/api-admin/usage", label: "이용내역", icon: ScrollText },
      { to: "/api-admin/docs", label: "API 명세", icon: FileText },
    ],
  },
  {
    title: "시스템",
    items: [
      { to: "/system/logs", label: "감사로그", icon: ScrollText, roles: ["ADMIN"] },
      { to: "/system/health", label: "환경상태", icon: Settings2 },
      { to: "/help", label: "허브 안내", icon: FileText },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("ADMIN");
  const [now, setNow] = useState("");

  useEffect(() => {
    void getSession().then((s) => {
      setRole(s.role);
      setNow(s.now);
    });
  }, []);

  const nav = (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="px-3 mb-2 text-xs font-medium tracking-wide uppercase text-subtle">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                        active ? "bg-primary text-primary-fg" : "text-fg hover:bg-surface-2",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-surface md:flex md:flex-col">
        <Brand />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <p className="px-5 py-4 text-xs text-subtle">Asia/Seoul · 표준 관측시각</p>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-overlay" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 flex-col bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3">
              <Brand />
              <button className="size-11 grid place-items-center" onClick={() => setOpen(false)} aria-label="메뉴 닫기">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </div>
        </div>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-sm">
          <button
            className="grid size-11 place-items-center rounded-md hover:bg-surface-2 md:hidden"
            onClick={() => setOpen(true)}
            aria-label="메뉴"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted">사내 공통 기상데이터 플랫폼</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted sm:flex tabular">{now || "—"}</div>
          <Select
            className="h-11 w-[9.5rem]"
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              setRole(next);
              void setSessionRole({ data: { role: next } });
            }}
            aria-label="역할"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="DATA_MANAGER">DATA_MANAGER</option>
            <option value="VIEWER">VIEWER</option>
          </Select>
        </header>
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-4 py-5">
      <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-fg">
        <CloudSun className="size-5" />
      </span>
      <span>
        <span className="block font-display text-lg leading-tight tracking-tight">기상허브</span>
        <span className="block text-xs text-muted">Weather Data Hub</span>
      </span>
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-medium uppercase tracking-wide text-subtle">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export { Button };
