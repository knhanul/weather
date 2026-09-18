import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { M as Label, a as createApiClient, j as Input, n as PageHeader, u as listApiClients, x as revokeApiClient } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/keys-DtQ6U15g.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function KeysPage() {
	const q = useQuery({
		queryKey: ["api-clients"],
		queryFn: () => listApiClients()
	});
	const [name, setName] = (0, import_react.useState)("");
	const [code, setCode] = (0, import_react.useState)("");
	const [revealed, setRevealed] = (0, import_react.useState)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "API 관리",
		title: "내부 API Key",
		description: "업무시스템별 키를 발급합니다. 키 원문은 생성 직후 한 번만 보여 주고, DB에는 해시만 저장합니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-[20rem_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "키 발급" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "예: 구내식당 시스템" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
				className: "mt-4 block",
				children: "이름"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
				className: "mt-1",
				value: name,
				onChange: (e) => setName(e.target.value)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
				className: "mt-3 block",
				children: "코드"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
				className: "mt-1",
				value: code,
				onChange: (e) => setCode(e.target.value),
				placeholder: "CAFETERIA_SYSTEM"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-4 w-full",
				disabled: name.length < 2 || code.length < 2,
				onClick: async () => {
					const r = await createApiClient({ data: {
						name,
						code
					} });
					setRevealed(r.plaintext);
					setName("");
					setCode("");
					q.refetch();
				},
				children: "발급"
			}),
			revealed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 rounded-md bg-warn-bg p-3 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-medium text-warn",
					children: "지금만 복사하세요"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 break-all font-mono text-xs",
					children: revealed
				})]
			}) : null
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-x-auto rounded-xl border border-border bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full min-w-[560px] text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "bg-surface-2 text-left text-xs text-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: [
						"이름",
						"코드",
						"접두",
						"권한",
						"상태",
						""
					].map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
						className: "px-3 py-3 font-medium",
						children: h
					}, h)) })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (q.data ?? []).map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
					className: "border-t border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: c.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3 font-mono text-xs",
							children: c.code
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
							className: "px-3 py-3 font-mono text-xs",
							children: [c.prefix, "…"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: c.scopes
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: statusTone(c.status),
								children: c.status
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							className: "px-3 py-3",
							children: c.status === "ACTIVE" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								size: "sm",
								variant: "ghost",
								onClick: async () => {
									await revokeApiClient({ data: { id: c.id } });
									q.refetch();
								},
								children: "폐기"
							}) : null
						})
					]
				}, c.id)) })]
			})
		})]
	})] });
}
//#endregion
export { KeysPage as component };
