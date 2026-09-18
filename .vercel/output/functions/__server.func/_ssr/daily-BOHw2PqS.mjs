import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { M as Label, N as Select, _ as listStations, j as Input, n as PageHeader, v as queryDaily } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
import { t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/daily-BOHw2PqS.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function DailyPage() {
	const stations = useQuery({
		queryKey: ["stations"],
		queryFn: () => listStations({ data: {} })
	});
	const [stationId, setStationId] = (0, import_react.useState)("108");
	const [from, setFrom] = (0, import_react.useState)("");
	const [to, setTo] = (0, import_react.useState)("");
	const [page, setPage] = (0, import_react.useState)(1);
	const q = useQuery({
		queryKey: [
			"daily",
			stationId,
			from,
			to,
			page
		],
		queryFn: () => queryDaily({ data: {
			stationId,
			from: from || void 0,
			to: to || void 0,
			page,
			pageSize: 24
		} })
	});
	const rows = q.data?.rows ?? [];
	const total = q.data?.total ?? 0;
	const pages = Math.max(1, Math.ceil(total / 24));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			eyebrow: "기상자료",
			title: "일자료",
			description: "기상청 공식 일자료입니다. 시간자료를 단순 평균한 값과 같다고 가정하지 않습니다."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
			className: "mb-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "관측지점" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
						className: "mt-1",
						value: stationId,
						onChange: (e) => {
							setStationId(e.target.value);
							setPage(1);
						},
						children: (stations.data ?? []).slice(0, 80).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: s.stationId,
							children: [
								s.stationId,
								" ",
								s.stationName
							]
						}, s.stationId))
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "시작일" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						type: "date",
						value: from,
						onChange: (e) => setFrom(e.target.value)
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "종료일" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						type: "date",
						value: to,
						onChange: (e) => setTo(e.target.value)
					})] })
				]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-x-auto rounded-xl border border-border bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[800px] text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "bg-surface-2 text-left text-xs text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
						"관측일",
						"지점",
						"평균",
						"최저",
						"최고",
						"강수",
						"습도",
						"일조",
						"출처"
					].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-3 font-medium",
						children: h
					}, h)) })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "border-t border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 font-mono tabular",
							children: r.observationDate
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3",
							children: [
								r.stationId,
								" ",
								r.stationName
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.avgTemperature ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.minTemperature ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.maxTemperature ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.precipitation ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.avgHumidity ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: r.sunshineHours ?? "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: r.sourceKind === "OFFICIAL" ? "공식 일자료" : "시간집계" })
						})
					]
				}, r.id)) })]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 flex items-center justify-between text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-muted tabular",
				children: [
					"총 ",
					total.toLocaleString(),
					"건"
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					disabled: page <= 1,
					onClick: () => setPage((p) => p - 1),
					children: "이전"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					disabled: page >= pages,
					onClick: () => setPage((p) => p + 1),
					children: "다음"
				})]
			})]
		})
	] });
}
//#endregion
export { DailyPage as component };
