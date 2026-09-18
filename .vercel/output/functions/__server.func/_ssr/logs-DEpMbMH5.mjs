import { r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { f as listAudit, n as PageHeader } from "./router-DL28EAhj.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/logs-DEpMbMH5.js
var import_jsx_runtime = require_jsx_runtime();
function LogsPage() {
	const q = useQuery({
		queryKey: ["audit"],
		queryFn: () => listAudit()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "시스템",
		title: "감사로그",
		description: "공급원·인증·자동수집·수동수집·대량 다운로드·API Key 발급/폐기를 기록합니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "overflow-x-auto rounded-xl border border-border bg-surface",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
			className: "w-full min-w-[640px] text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
				className: "bg-surface-2 text-left text-xs text-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
					"시각",
					"역할",
					"행위",
					"대상",
					"내용"
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
						children: r.role
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3 font-mono text-xs",
						children: r.action
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3",
						children: r.target
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						className: "px-3 py-3 text-muted",
						children: r.detail
					})
				]
			}, r.id)) })]
		})
	})] });
}
//#endregion
export { LogsPage as component };
