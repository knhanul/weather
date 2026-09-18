import { r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { c as getHealth, n as PageHeader } from "./router-DL28EAhj.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/health-BtXr0bDP.js
var import_jsx_runtime = require_jsx_runtime();
function HealthPage() {
	const d = useQuery({
		queryKey: ["health"],
		queryFn: () => getHealth(),
		refetchInterval: 1e4
	}).data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "시스템",
		title: "환경상태",
		description: "기상청 API 실패, 자동수집 실패, 데이터 지연, DB 상태를 한 화면에서 봅니다. 알림 채널은 이후 연결할 수 있습니다."
	}), d ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 sm:grid-cols-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "데이터베이스" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: d.db }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 font-mono text-sm tabular",
					children: [d.hourlyRecords.toLocaleString(), " hourly rows"]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "최신 시간자료" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 font-mono text-sm",
					children: d.latestHourly ?? "없음"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardDesc, { children: ["공식 제공 한계 ", d.latestOfficial] })
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "최근 7일 실패 작업" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 font-display text-3xl tabular",
				children: d.failedJobs7d
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "시간대" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3",
					children: d.timezone
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "서버 Locale에 의존하지 않습니다. 표시·저장·조회 모두 Asia/Seoul 정책입니다." })
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
				className: "sm:col-span-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "백업" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "기상자료는 재수집이 가능해도 설정·Dataset·지점·수집이력·API Client는 반드시 백업합니다. Docker 환경에서는 postgres 볼륨 스냅샷과 pg_dump를 사용하세요. 미리보기 DB는 재시작 시 시드로 복원됩니다." })]
			})
		]
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted",
		children: "상태를 확인하는 중…"
	})] });
}
//#endregion
export { HealthPage as component };
