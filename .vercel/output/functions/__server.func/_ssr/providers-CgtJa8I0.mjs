import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { C as saveProviderKey, M as Label, S as runConnectionTest, h as listProviders, j as Input, n as PageHeader, w as saveProviderSettings } from "./router-DL28EAhj.mjs";
import { t as Button } from "./button-BIfbdCWw.mjs";
import { r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/providers-CgtJa8I0.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ProvidersPage() {
	const q = useQuery({
		queryKey: ["providers"],
		queryFn: () => listProviders()
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "기준정보",
		title: "데이터 공급원",
		description: "인증키 전체 값은 화면에 표시되지 않습니다. 브라우저는 기상청을 직접 호출하지 않습니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-4",
		children: (q.data ?? []).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProviderCard, {
			item: p,
			onSaved: () => void q.refetch()
		}, p.code))
	})] });
}
function ProviderCard({ item, onSaved }) {
	const [key, setKey] = (0, import_react.useState)("");
	const [test, setTest] = (0, import_react.useState)("");
	const [rps, setRps] = (0, import_react.useState)(item.requestsPerSecond);
	const [rpm, setRpm] = (0, import_react.useState)(item.requestsPerMinute);
	const [retry, setRetry] = (0, import_react.useState)(item.retryCount);
	const [timeout, setTimeoutSec] = (0, import_react.useState)(item.timeoutSeconds);
	const [chunk, setChunk] = (0, import_react.useState)(item.chunkDays);
	const [raw, setRaw] = (0, import_react.useState)(item.preserveRaw);
	const [keep, setKeep] = (0, import_react.useState)(item.rawRetentionDays);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-subtle",
					children: item.providerName
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, {
					className: "mt-1",
					children: item.serviceName
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-mono text-xs text-muted",
					children: item.baseUrl
				})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-end gap-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: statusTone(item.status),
					children: item.status === "ENABLED" ? "사용" : "중지"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
					tone: item.keySource === "NONE" ? "warn" : "ok",
					children: ["인증정보 ", item.keySource === "NONE" ? "미등록" : `등록됨 ${item.keyHint ?? ""}`]
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-3 text-sm text-muted",
			children: [
				"최근 연결시험 ",
				item.lastTestStatus ?? "없음",
				item.lastTestMessage ? ` · ${item.lastTestMessage}` : "",
				item.lastCollectAt ? ` · 최근 수집 ${item.lastCollectAt}` : ""
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 grid gap-3 sm:grid-cols-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "sm:col-span-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "인증키 (표시되지 않음)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 flex gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							type: "password",
							autoComplete: "off",
							value: key,
							onChange: (e) => setKey(e.target.value),
							placeholder: "공공데이터포털 인증키"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							onClick: async () => {
								await saveProviderKey({ data: {
									serviceCode: item.serviceCode,
									apiKey: key
								} });
								setKey("");
								onSaved();
							},
							disabled: key.length < 8,
							children: "등록"
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "초당 호출",
					value: rps,
					set: setRps
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "분당 호출",
					value: rpm,
					set: setRpm
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "재시도",
					value: retry,
					set: setRetry
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Timeout(초)",
					value: timeout,
					set: setTimeoutSec
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Chunk(일)",
					value: chunk,
					set: setChunk
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "원본 보존(일)",
					value: keep,
					set: setKeep
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "mt-3 flex h-11 items-center gap-2 text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "checkbox",
				checked: raw,
				onChange: (e) => setRaw(e.target.checked)
			}), "원본 응답 보존"]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 flex flex-wrap gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "secondary",
				onClick: async () => {
					await saveProviderSettings({ data: {
						serviceCode: item.serviceCode,
						requestsPerSecond: rps,
						requestsPerMinute: rpm,
						retryCount: retry,
						timeoutSeconds: timeout,
						chunkDays: chunk,
						preserveRaw: raw,
						rawRetentionDays: keep,
						status: item.status
					} });
					onSaved();
				},
				children: "설정 저장"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: async () => {
					const r = await runConnectionTest({ data: { datasetCode: item.serviceCode } });
					setTest(r.ok ? `${r.message}${r.latest ? ` · 최근 관측 ${r.latest}` : ""}` : r.message);
					onSaved();
				},
				children: "연결 테스트"
			})]
		}),
		test ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-sm",
			children: test
		}) : null
	] });
}
function Field({ label, value, set }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
		className: "mt-1",
		type: "number",
		value,
		onChange: (e) => set(Number(e.target.value))
	})] });
}
//#endregion
export { ProvidersPage as component };
