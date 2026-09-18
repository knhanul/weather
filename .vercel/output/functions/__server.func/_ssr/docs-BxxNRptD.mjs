import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as PageHeader } from "./router-DL28EAhj.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/docs-BxxNRptD.js
var import_jsx_runtime = require_jsx_runtime();
var ENDPOINTS = [
	{
		method: "GET",
		path: "/api/v1/weather/hourly",
		desc: "시간 관측 조회",
		query: "station_id, from, to, page, page_size"
	},
	{
		method: "GET",
		path: "/api/v1/weather/hourly/nearest",
		desc: "요청 시각에 가장 가까운 실측 (보간 없음)",
		query: "station_id, datetime"
	},
	{
		method: "GET",
		path: "/api/v1/weather/daily",
		desc: "공식 일자료 조회",
		query: "station_id, from, to"
	},
	{
		method: "GET",
		path: "/api/v1/weather/summary",
		desc: "기간 요약 (명확한 통계만)",
		query: "station_id, from, to"
	},
	{
		method: "GET",
		path: "/api/v1/weather/stations",
		desc: "관측지점 목록",
		query: "q"
	},
	{
		method: "GET",
		path: "/api/v1/health",
		desc: "허브 상태 (인증 없음)",
		query: ""
	}
];
function DocsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			eyebrow: "API 관리",
			title: "내부 REST API",
			description: "업무시스템은 기상청이 아니라 이 계약을 사용합니다. 버전은 /api/v1 입니다."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
			className: "mb-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "인증" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "헤더 X-API-Key. 미리보기 구내식당 키는 아래와 같습니다." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
					className: "mt-3 overflow-x-auto rounded-md bg-bg p-3 text-xs",
					children: `X-API-Key: whub_preview_cafeteria_read

GET /api/v1/weather/hourly?station_id=108&from=2026-09-12T09:00:00+09:00&to=2026-09-12T13:00:00+09:00`
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid gap-3",
			children: ENDPOINTS.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-subtle",
					children: e.method
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-mono text-sm",
					children: e.path
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: e.desc
				}),
				e.query ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-xs text-subtle",
					children: ["query: ", e.query]
				}) : null
			] }, e.path))
		})
	] });
}
//#endregion
export { DocsPage as component };
