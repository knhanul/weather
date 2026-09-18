import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { A as toggleStation, N as Select, O as syncStations, _ as listStations, j as Input, n as PageHeader } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
import { t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/stations-Bh_3dcR6.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function StationsPage() {
	const [q, setQ] = (0, import_react.useState)("");
	const [region, setRegion] = (0, import_react.useState)("");
	const [onlyFav, setOnlyFav] = (0, import_react.useState)(false);
	const list = useQuery({
		queryKey: [
			"stations",
			q,
			region,
			onlyFav
		],
		queryFn: () => listStations({ data: {
			q: q || void 0,
			region: region || void 0,
			favorite: onlyFav || void 0
		} })
	});
	const [msg, setMsg] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			eyebrow: "기준정보",
			title: "관측지점",
			description: "지점 코드는 소스에 하드코딩해 쓰지 않고 Master로 관리합니다. 즐겨찾기 지점이 자동수집 기본 대상입니다.",
			actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "secondary",
				onClick: async () => {
					const r = await syncStations();
					setMsg(`${r.upserted}개 지점을 동기화했습니다.`);
					list.refetch();
				},
				children: "지점정보 동기화"
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
			className: "mb-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						placeholder: "지점번호 또는 지점명",
						value: q,
						onChange: (e) => setQ(e.target.value)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: region,
						onChange: (e) => setRegion(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "전체 지역"
						}), [
							"수도권",
							"강원",
							"충청",
							"전라",
							"경상",
							"제주"
						].map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: r,
							children: r
						}, r))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex h-11 items-center gap-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: onlyFav,
							onChange: (e) => setOnlyFav(e.target.checked)
						}), "즐겨찾기만"]
					})
				]
			}), msg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: msg
			}) : null]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-x-auto rounded-xl border border-border bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[720px] text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "bg-surface-2 text-left text-xs text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
						"지점",
						"이름",
						"지역",
						"관측유형",
						"좌표",
						"사용",
						"즐겨찾기"
					].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-3 font-medium",
						children: h
					}, h)) })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (list.data ?? []).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "border-t border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 font-mono",
							children: s.stationId
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: s.stationName
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: s.region
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: s.stationType })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3 font-mono text-xs",
							children: [
								s.latitude ?? "—",
								", ",
								s.longitude ?? "—"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "h-11 text-sm text-primary",
								onClick: async () => {
									await toggleStation({ data: {
										stationId: s.stationId,
										field: "enabled"
									} });
									list.refetch();
								},
								children: s.enabled ? "사용" : "중지"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "h-11 text-sm text-primary",
								onClick: async () => {
									await toggleStation({ data: {
										stationId: s.stationId,
										field: "favorite"
									} });
									list.refetch();
								},
								children: s.favorite ? "★ 활성지점" : "지정"
							})
						})
					]
				}, s.stationId)) })]
			})
		})
	] });
}
//#endregion
export { StationsPage as component };
