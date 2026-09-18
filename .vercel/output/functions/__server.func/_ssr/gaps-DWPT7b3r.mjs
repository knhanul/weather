import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { E as startCollection, M as Label, N as Select, _ as listStations, j as Input, n as PageHeader, o as findGaps } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/gaps-DWPT7b3r.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function GapsPage() {
	const stations = useQuery({
		queryKey: ["stations"],
		queryFn: () => listStations({ data: {} })
	});
	const [stationId, setStationId] = (0, import_react.useState)("108");
	const [from, setFrom] = (0, import_react.useState)("2026-09-01 00:00:00");
	const [to, setTo] = (0, import_react.useState)("2026-09-11 23:00:00");
	const q = useQuery({
		queryKey: [
			"gaps",
			stationId,
			from,
			to
		],
		queryFn: () => findGaps({ data: {
			stationId,
			from,
			to
		} })
	});
	const [msg, setMsg] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			eyebrow: "기상자료",
			title: "누락 탐지",
			description: "시간자료의 예상 시각(정시)과 실제 적재분을 비교합니다. 관측소 운영 기간 밖은 고려해야 하며, 발견 구간은 삭제 없이 재수집(UPSERT)합니다."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
			className: "mb-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "지점" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
						className: "mt-1",
						value: stationId,
						onChange: (e) => setStationId(e.target.value),
						children: (stations.data ?? []).slice(0, 40).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: s.stationId,
							children: [
								s.stationId,
								" ",
								s.stationName
							]
						}, s.stationId))
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "시작" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						value: from,
						onChange: (e) => setFrom(e.target.value)
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "종료" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						value: to,
						onChange: (e) => setTo(e.target.value)
					})] })
				]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mb-3 text-sm text-muted",
			children: [
				"예상 ",
				q.data?.expected ?? "—",
				"시각 중 보유 ",
				q.data?.have ?? "—",
				" · 누락 ",
				q.data?.missing.length ?? "—"
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "overflow-hidden rounded-xl border border-border bg-surface",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "divide-y divide-border",
				children: (q.data?.missing ?? []).slice(0, 80).map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between px-4 py-3 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono tabular",
						children: t
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-muted",
						children: stationId
					})]
				}, t))
			}), !q.data?.missing.length && !q.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-4 py-8 text-center text-sm text-muted",
				children: "누락 구간이 없습니다."
			}) : null]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				disabled: !q.data?.missing.length,
				onClick: async () => {
					setMsg("");
					const job = await startCollection({ data: {
						datasetCode: "ASOS_HOURLY",
						stationIds: [stationId],
						from,
						to
					} });
					setMsg(`재수집 작업 #${job.jobId}을 시작했습니다. 기존 자료는 삭제하지 않습니다.`);
				},
				children: "이 기간 재수집"
			}), msg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: msg
			}) : null]
		})
	] });
}
//#endregion
export { GapsPage as component };
