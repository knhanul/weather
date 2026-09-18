import { r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { n as PageHeader, p as listDatasets } from "./router-DL28EAhj.mjs";
import { t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/datasets-BdQuz1qU.js
var import_jsx_runtime = require_jsx_runtime();
function DatasetsPage() {
	const q = useQuery({
		queryKey: ["datasets"],
		queryFn: () => listDatasets()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "기준정보",
		title: "데이터셋",
		description: "기상 종류는 코드에 하드코딩하지 않고 Dataset으로 관리합니다. 관측과 예보는 분리됩니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4 md:grid-cols-2",
		children: (q.data ?? []).map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-subtle",
					children: d.code
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-1 font-display text-xl",
					children: d.name
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: statusTone(d.enabled ? "ENABLED" : "DISABLED"),
					children: d.enabled ? "사용" : "대기"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-muted",
				children: d.description
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-4 grid grid-cols-2 gap-2 text-sm",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
						className: "text-subtle",
						children: "공급원"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: d.provider })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
						className: "text-subtle",
						children: "구분"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: d.dataKind === "OBSERVATION" ? "관측" : "예보" })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
						className: "text-subtle",
						children: "해상도"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: d.timeResolution })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
						className: "text-subtle",
						children: "커넥터"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
						className: "font-mono text-xs",
						children: d.connectorId
					})] })
				]
			})
		] }, d.code))
	})] });
}
//#endregion
export { DatasetsPage as component };
