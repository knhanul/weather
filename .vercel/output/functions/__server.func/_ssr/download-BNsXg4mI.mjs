import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { n as EXPORT_COLUMNS } from "./query-helpers-Dul_CJnW.mjs";
import { D as startExport, M as Label, N as Select, _ as listStations, j as Input, n as PageHeader } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/download-BNsXg4mI.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function DownloadPage() {
	const stations = useQuery({
		queryKey: ["stations"],
		queryFn: () => listStations({ data: {} })
	});
	const [kind, setKind] = (0, import_react.useState)("hourly");
	const [stationId, setStationId] = (0, import_react.useState)("108");
	const [from, setFrom] = (0, import_react.useState)("2026-09-01");
	const [to, setTo] = (0, import_react.useState)("2026-09-11");
	const defaults = (0, import_react.useMemo)(() => EXPORT_COLUMNS.filter((c) => c.defaultOn && (c.group === "both" || c.group === kind)).map((c) => c.key), [kind]);
	const [cols, setCols] = (0, import_react.useState)(defaults);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [msg, setMsg] = (0, import_react.useState)("");
	const visible = EXPORT_COLUMNS.filter((c) => c.group === "both" || c.group === kind);
	async function run(format) {
		setBusy(true);
		setMsg("");
		try {
			const res = await startExport({ data: {
				format,
				kind,
				stationId,
				from,
				to,
				columns: cols
			} });
			const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
			const blob = new Blob([bin], { type: res.mime });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = res.fileName;
			a.click();
			URL.revokeObjectURL(url);
			setMsg(`${res.rowCount}건을 ${format}로 생성했습니다.`);
		} catch (err) {
			setMsg(err instanceof Error ? err.message : "내보내기에 실패했습니다.");
		} finally {
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "기상자료",
		title: "다운로드",
		description: "조회 조건을 지정한 뒤 CSV / XLSX / JSON으로 받습니다. 파일 상단에 출처·기간·시간대 메타데이터를 포함합니다. 브라우저 메모리에 전체를 올리지 않고 서버에서 생성합니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-[1fr_20rem]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-3 sm:grid-cols-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "자료 종류" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					className: "mt-1",
					value: kind,
					onChange: (e) => {
						const k = e.target.value;
						setKind(k);
						setCols(EXPORT_COLUMNS.filter((c) => c.defaultOn && (c.group === "both" || c.group === k)).map((c) => c.key));
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "hourly",
						children: "시간자료"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "daily",
						children: "일자료"
					})]
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "관측지점" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
					className: "mt-1",
					value: stationId,
					onChange: (e) => setStationId(e.target.value),
					children: (stations.data ?? []).slice(0, 90).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
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
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => setCols(visible.map((c) => c.key)),
					children: "전체 선택"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => setCols(visible.filter((c) => c.defaultOn).map((c) => c.key)),
					children: "기본 선택"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "grid gap-2 sm:grid-cols-2",
				children: visible.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex min-h-11 items-center gap-2 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: cols.includes(c.key),
						onChange: (e) => setCols((prev) => e.target.checked ? [...prev, c.key] : prev.filter((x) => x !== c.key))
					}), c.label]
				}) }, c.key))
			})]
		})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "파일 생성" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "대용량은 서버에서 만든 뒤 내려받습니다." }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-col gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						disabled: busy || !cols.length,
						onClick: () => void run("CSV"),
						children: "CSV 다운로드"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						disabled: busy || !cols.length,
						onClick: () => void run("XLSX"),
						children: "XLSX 다운로드"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						disabled: busy || !cols.length,
						onClick: () => void run("JSON"),
						children: "JSON 다운로드"
					})
				]
			}),
			msg ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-sm text-muted",
				children: msg
			}) : null
		] })]
	})] });
}
//#endregion
export { DownloadPage as component };
