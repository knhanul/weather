import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { b as retryJob, i as cancelCollection, k as tickJobs, l as getJob, m as listJobs, n as PageHeader } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/jobs-CGtT5Tfs.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function JobsPage() {
	const jobs = useQuery({
		queryKey: ["jobs"],
		queryFn: () => listJobs(),
		refetchInterval: 2500
	});
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const detail = useQuery({
		queryKey: ["job", openId],
		queryFn: () => getJob({ data: { id: openId } }),
		enabled: openId !== null,
		refetchInterval: 2e3
	});
	(0, import_react.useEffect)(() => {
		const t = setInterval(() => {
			tickJobs();
		}, 2500);
		return () => clearInterval(t);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "데이터 수집",
		title: "수집이력",
		description: "장기간 수집은 Job 큐로 실행됩니다. 실패한 구간만 다시 받을 수 있습니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-[1.3fr_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-x-auto rounded-xl border border-border bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[640px] text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "bg-surface-2 text-left text-xs text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
						"ID",
						"Dataset",
						"기간",
						"상태",
						"진행",
						"수신/신규/갱신"
					].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-3 font-medium",
						children: h
					}, h)) })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (jobs.data ?? []).map((j) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "cursor-pointer border-t border-border hover:bg-bg",
					onClick: () => setOpenId(j.id),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 font-mono",
							children: j.id
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: j.datasetCode
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3 text-xs",
							children: [
								j.from,
								" ~ ",
								j.to
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: statusTone(j.status),
								children: j.status
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3 tabular",
							children: [
								j.chunkDone,
								"/",
								j.chunkTotal
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3 tabular",
							children: [
								j.received,
								"/",
								j.inserted,
								"/",
								j.updated
							]
						})
					]
				}, j.id)) })]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "작업 상세" }), detail.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3 text-sm",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-muted",
					children: [
						detail.data.datasetCode,
						" · ",
						detail.data.status
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-3 h-2 overflow-hidden rounded-full bg-surface-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-full bg-primary",
						style: { width: `${detail.data.chunkTotal ? 100 * detail.data.chunkDone / detail.data.chunkTotal : 0}%` }
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 max-h-72 space-y-2 overflow-y-auto",
					children: detail.data.chunks.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-md bg-bg px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-xs",
								children: [
									c.stationId,
									" ",
									c.from.slice(0, 16)
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: statusTone(c.status),
								children: c.status
							})]
						}), c.errorMessage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-bad",
							children: c.errorMessage
						}) : null]
					}, c.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						variant: "secondary",
						onClick: () => void retryJob({ data: { id: detail.data.id } }),
						children: "실패 구간 재시도"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						variant: "ghost",
						onClick: () => void cancelCollection({ data: { id: detail.data.id } }),
						children: "취소"
					})]
				})
			]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-sm text-muted",
			children: "왼쪽에서 작업을 선택하세요."
		})] })]
	})] });
}
//#endregion
export { JobsPage as component };
