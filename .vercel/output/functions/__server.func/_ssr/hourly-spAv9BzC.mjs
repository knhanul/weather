import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { C as qcLabel } from "./query-helpers-Dul_CJnW.mjs";
import { M as Label, N as Select, _ as listStations, j as Input, n as PageHeader, y as queryHourly } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hourly-spAv9BzC.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function HourlyPage() {
	const stations = useQuery({
		queryKey: ["stations"],
		queryFn: () => listStations({ data: {} })
	});
	const [stationId, setStationId] = (0, import_react.useState)("108");
	const [from, setFrom] = (0, import_react.useState)("");
	const [to, setTo] = (0, import_react.useState)("");
	const [rainOnly, setRainOnly] = (0, import_react.useState)(false);
	const [tempMin, setTempMin] = (0, import_react.useState)("");
	const [tempMax, setTempMax] = (0, import_react.useState)("");
	const [page, setPage] = (0, import_react.useState)(1);
	const q = useQuery({
		queryKey: [
			"hourly",
			stationId,
			from,
			to,
			rainOnly,
			tempMin,
			tempMax,
			page
		],
		queryFn: () => queryHourly({ data: {
			stationId,
			from: from || void 0,
			to: to || void 0,
			rainOnly,
			tempMin: tempMin === "" ? void 0 : Number(tempMin),
			tempMax: tempMax === "" ? void 0 : Number(tempMax),
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
			title: "시간자료",
			description: "표준 관측 모델입니다. 기상청 원본 필드명(ta, rn 등)은 노출하지 않습니다. 시간은 Asia/Seoul 입니다."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
			className: "mb-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "관측지점" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
						className: "mt-1",
						value: stationId,
						onChange: (e) => {
							setStationId(e.target.value);
							setPage(1);
						},
						children: (stations.data ?? []).filter((s) => s.favorite || s.stationId === stationId || s.enabled).slice(0, 40).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
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
						type: "datetime-local",
						value: from,
						onChange: (e) => setFrom(e.target.value)
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "종료" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						type: "datetime-local",
						value: to,
						onChange: (e) => setTo(e.target.value)
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "기온 최소 ℃" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						type: "number",
						inputMode: "decimal",
						placeholder: "제한 없음",
						value: tempMin,
						onChange: (e) => {
							setTempMin(e.target.value);
							setPage(1);
						}
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "기온 최대 ℃" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						type: "number",
						inputMode: "decimal",
						placeholder: "제한 없음",
						value: tempMax,
						onChange: (e) => {
							setTempMax(e.target.value);
							setPage(1);
						}
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "mt-6 flex h-11 items-center gap-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: rainOnly,
							onChange: (e) => {
								setRainOnly(e.target.checked);
								setPage(1);
							}
						}), "강수 있는 시각만"]
					})
				]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "overflow-x-auto rounded-xl border border-border bg-surface",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[720px] text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "bg-surface-2 text-left text-xs text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
						"관측일시",
						"지점",
						"기온",
						"강수",
						"습도",
						"풍속",
						"적설",
						"품질"
					].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-3 font-medium",
						children: h
					}, h)) })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "border-t border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 font-mono tabular",
							children: r.observationDatetime
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
							children: fmt(r.temperature)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: fmt(r.precipitation)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: fmt(r.humidity)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: fmt(r.windSpeed)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 tabular",
							children: fmt(r.snowDepth)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: statusTone(r.qualityTemperature),
								children: qcLabel(r.qualityTemperature)
							})
						})
					]
				}, r.id)) })]
			}), !rows.length && !q.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-4 py-8 text-center text-sm text-muted",
				children: "조건에 맞는 자료가 없습니다."
			}) : null]
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
function fmt(v) {
	return v === null || v === void 0 ? "—" : v;
}
//#endregion
export { HourlyPage as component };
