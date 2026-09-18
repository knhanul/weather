import { r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { d as listApiUsage, n as PageHeader } from "./router-DL28EAhj.mjs";
import { t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/usage-CzbwrJdL.js
var import_jsx_runtime = require_jsx_runtime();
function UsagePage() {
	const q = useQuery({
		queryKey: ["api-usage"],
		queryFn: () => listApiUsage(),
		refetchInterval: 8e3
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "API 관리",
		title: "이용내역",
		description: "어떤 업무시스템이 기상자료를 얼마나 쓰는지 확인합니다. API Key 원문은 로그에 남기지 않습니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "overflow-x-auto rounded-xl border border-border bg-surface",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
			className: "w-full min-w-[640px] text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
				className: "bg-surface-2 text-left text-xs text-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
					"시각",
					"클라이언트",
					"API",
					"결과",
					"건수",
					"ms"
				].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
					className: "px-3 py-3 font-medium",
					children: h
				}, h)) })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (q.data ?? []).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
				className: "border-t border-border",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3 font-mono text-xs tabular",
						children: r.at
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3",
						children: r.client
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
						className: "px-3 py-3 font-mono text-xs",
						children: [
							r.method,
							" ",
							r.path
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							tone: r.status < 400 ? "ok" : "bad",
							children: r.status
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3 tabular",
						children: r.count ?? "—"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3 tabular",
						children: r.ms ?? "—"
					})
				]
			}, r.id)) })]
		})
	})] });
}
//#endregion
export { UsagePage as component };
