import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { M as Label, N as Select, T as saveSchedule, g as listSchedules, j as Input, n as PageHeader } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/schedules-Bm30MolO.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function SchedulesPage() {
	const q = useQuery({
		queryKey: ["schedules"],
		queryFn: () => listSchedules()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "데이터 수집",
		title: "자동수집",
		description: "주기는 코드에 고정하지 않습니다. Lookback으로 늦게 확정되는 최근 자료를 다시 UPSERT합니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4",
		children: (q.data ?? []).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScheduleCard, {
			item: s,
			onSaved: () => void q.refetch()
		}, s.id))
	})] });
}
function ScheduleCard({ item, onSaved }) {
	const [enabled, setEnabled] = (0, import_react.useState)(item.enabled);
	const [cadence, setCadence] = (0, import_react.useState)(item.cadence);
	const [lookback, setLookback] = (0, import_react.useState)(item.lookbackHours);
	const [scope, setScope] = (0, import_react.useState)(item.stationScope);
	const [msg, setMsg] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-medium",
				children: item.datasetCode
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-xs text-muted",
				children: ["마지막 실행 ", item.lastRunAt ?? "없음"]
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
				tone: statusTone(enabled ? "ACTIVE" : "DISABLED"),
				children: enabled ? "ON" : "OFF"
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 grid gap-3 sm:grid-cols-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex h-11 items-center gap-2 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: enabled,
						onChange: (e) => setEnabled(e.target.checked)
					}), "자동수집"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "주기" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					className: "mt-1",
					value: cadence,
					onChange: (e) => setCadence(e.target.value),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "HOURLY",
						children: "매시간"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "DAILY",
						children: "매일"
					})]
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Lookback (시간)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "mt-1",
					type: "number",
					value: lookback,
					onChange: (e) => setLookback(Number(e.target.value))
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "대상 지점" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					className: "mt-1",
					value: scope,
					onChange: (e) => setScope(e.target.value),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "FAVORITES",
							children: "즐겨찾기"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "ENABLED",
							children: "사용 지점"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "ALL",
							children: "전체"
						})
					]
				})] })
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			className: "mt-4",
			size: "sm",
			onClick: async () => {
				await saveSchedule({ data: {
					id: item.id,
					enabled,
					cadence,
					lookbackHours: lookback,
					stationScope: scope
				} });
				setMsg("저장했습니다.");
				onSaved();
			},
			children: "저장"
		}),
		msg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "ml-3 text-sm text-muted",
			children: msg
		}) : null
	] });
}
//#endregion
export { SchedulesPage as component };
