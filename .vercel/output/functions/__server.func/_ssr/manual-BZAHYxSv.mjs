import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { v as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { E as startCollection, M as Label, N as Select, _ as listStations, j as Input, n as PageHeader, p as listDatasets } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/manual-BZAHYxSv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ManualPage() {
	const datasets = useQuery({
		queryKey: ["datasets"],
		queryFn: () => listDatasets()
	});
	const stations = useQuery({
		queryKey: ["stations"],
		queryFn: () => listStations({ data: { favorite: true } })
	});
	const allStations = useQuery({
		queryKey: ["stations-all"],
		queryFn: () => listStations({ data: {} })
	});
	const [dataset, setDataset] = (0, import_react.useState)("ASOS_HOURLY");
	const [selected, setSelected] = (0, import_react.useState)(["108"]);
	const [from, setFrom] = (0, import_react.useState)("2026-09-01 00:00:00");
	const [to, setTo] = (0, import_react.useState)("2026-09-11 23:00:00");
	const [msg, setMsg] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const enabled = (datasets.data ?? []).filter((d) => d.enabled && d.dataKind === "OBSERVATION");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "데이터 수집",
		title: "수동수집",
		description: "기간을 지정하면 백엔드가 API 제한에 맞게 자동으로 구간을 나눕니다. 웹 요청이 끝날 때까지 5년치를 기다리지 않습니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-[1.4fr_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Dataset" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
					className: "mt-1",
					value: dataset,
					onChange: (e) => setDataset(e.target.value),
					children: enabled.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
						value: d.code,
						children: [
							d.name,
							" (",
							d.code,
							")"
						]
					}, d.code))
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "시작일시" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						value: from,
						onChange: (e) => setFrom(e.target.value)
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "종료일시" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1",
						value: to,
						onChange: (e) => setTo(e.target.value)
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "관측지점 (즐겨찾기)" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-2 grid gap-1 sm:grid-cols-2",
						children: (stations.data ?? []).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex min-h-11 items-center gap-2 text-sm",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selected.includes(s.stationId),
									onChange: (e) => setSelected((prev) => e.target.checked ? [...prev, s.stationId] : prev.filter((x) => x !== s.stationId))
								}),
								s.stationId,
								" ",
								s.stationName
							]
						}) }, s.stationId))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						className: "mt-3",
						value: "",
						onChange: (e) => {
							if (e.target.value) setSelected((p) => Array.from(/* @__PURE__ */ new Set([...p, e.target.value])));
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "지점 추가…"
						}), (allStations.data ?? []).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: s.stationId,
							children: [
								s.stationId,
								" ",
								s.stationName
							]
						}, s.stationId))]
					})
				] })
			]
		}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "수집 시작" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "인증키가 없으면 작업이 실패로 기록됩니다. 키를 등록한 뒤 실패 구간만 재시도할 수 있습니다." }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-4 w-full",
				disabled: busy || !selected.length,
				onClick: async () => {
					setBusy(true);
					setMsg("");
					try {
						const job = await startCollection({ data: {
							datasetCode: dataset,
							stationIds: selected,
							from,
							to
						} });
						setMsg(`작업 #${job.jobId} · ${job.chunkTotal}개 구간으로 분할했습니다.`);
					} catch (err) {
						setMsg(err instanceof Error ? err.message : "수집을 시작하지 못했습니다.");
					} finally {
						setBusy(false);
					}
				},
				children: "수집 시작"
			}),
			msg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-muted",
				children: msg
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/collect/jobs",
				className: "mt-4 inline-block text-sm text-primary",
				children: "수집이력에서 진행률 보기"
			})
		] })]
	})] });
}
//#endregion
export { ManualPage as component };
