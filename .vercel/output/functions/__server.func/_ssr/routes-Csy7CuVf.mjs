import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, r as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { v as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as PageHeader, r as acknowledgeAlert, s as getDashboard } from "./router-DL28EAhj.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
import { n as statusTone, t as Badge } from "./badge-BOpEfDLu.mjs";
import { a as CartesianGrid, i as Line, n as YAxis, o as ResponsiveContainer, r as XAxis, s as Tooltip, t as LineChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Csy7CuVf.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Dashboard() {
	const q = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => getDashboard()
	});
	const [ack, setAck] = (0, import_react.useState)([]);
	const d = q.data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			eyebrow: "운영 현황",
			title: "기상허브",
			description: "외부 기상 API를 한 번 수집해 표준화하고, 구내식당·시설·에너지 등 업무시스템은 내부 API만 사용합니다."
		}),
		q.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted",
			children: "상태를 불러오는 중…"
		}) : null,
		q.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-bad",
			children: "대시보드를 불러오지 못했습니다."
		}) : null,
		d ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
					children: [
						d.coverage.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-wide text-subtle",
								children: "보유 데이터"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, {
								className: "mt-2",
								children: c.datasetCode
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-3 font-mono text-sm tabular",
								children: [
									c.first,
									" ~ ",
									c.last
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardDesc, { children: [
								c.records.toLocaleString(),
								"건 · 지점 ",
								c.stations,
								"곳"
							] })
						] }, c.datasetCode)),
						d.dailyCoverage.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-wide text-subtle",
								children: "보유 데이터"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, {
								className: "mt-2",
								children: c.datasetCode
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-3 font-mono text-sm tabular",
								children: [
									c.first,
									" ~ ",
									c.last
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardDesc, { children: [
								c.records.toLocaleString(),
								"건 · 지점 ",
								c.stations,
								"곳"
							] })
						] }, c.datasetCode)),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-wide text-subtle",
								children: "최근 수집"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, {
								className: "mt-2",
								children: d.lastJob?.status ?? "없음"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3",
								children: d.lastJob ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: statusTone(d.lastJob.status),
									children: d.lastJob.datasetCode
								}) : null
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: d.lastJob ? `${d.lastJob.completed ?? "진행 중"} · 수신 ${d.lastJob.received} / 신규 ${d.lastJob.inserted} / 갱신 ${d.lastJob.updated}` : "아직 수집 이력이 없습니다." })
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-wide text-subtle",
								children: "데이터 품질"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, {
								className: "mt-2 tabular",
								children: [d.missingHours, "시간"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "서울(108) 최근 3일 관측 누락" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/weather/gaps",
								className: "mt-3 inline-block text-sm text-primary",
								children: "누락 구간 보기"
							})
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs uppercase tracking-wide text-subtle",
								children: "내부 API"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, {
								className: "mt-2 tabular",
								children: [d.apiToday.toLocaleString(), "건"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "오늘 업무시스템 요청" })
						] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 lg:grid-cols-[1.4fr_1fr]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
						className: "min-h-72",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "서울 108 · 최근 기온" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "시드/수집된 시간자료. 보간하지 않은 실측 시계열입니다." }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 h-56",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
									width: "100%",
									height: "100%",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(LineChart, {
										data: d.series,
										margin: {
											top: 8,
											right: 8,
											left: 0,
											bottom: 0
										},
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
												stroke: "#ddd4c4",
												strokeDasharray: "3 6"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
												dataKey: "t",
												tick: {
													fontSize: 11,
													fill: "#6f6a62"
												},
												minTickGap: 28
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
												tick: {
													fontSize: 11,
													fill: "#6f6a62"
												},
												width: 36
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, { contentStyle: {
												background: "#fbf8f1",
												border: "1px solid #ddd4c4",
												borderRadius: 8
											} }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
												type: "monotone",
												dataKey: "temperature",
												stroke: "#1f4e5f",
												dot: false,
												strokeWidth: 1.8
											})
										]
									})
								})
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "공급원 상태" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 flex flex-col gap-3",
						children: d.providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md border border-border bg-bg px-3 py-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-medium",
									children: p.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: statusTone(p.lastTestStatus ?? p.status),
									children: p.lastTestStatus ?? p.status
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-xs text-muted",
								children: [
									"인증 ",
									p.keySource === "NONE" ? "미등록" : `등록됨 ${p.keyHint ?? ""}`,
									p.lastCollectAt ? ` · 최근 수집 ${p.lastCollectAt}` : ""
								]
							})]
						}, p.code))
					})] })]
				}),
				d.alerts.filter((a) => !ack.includes(a.id)).length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "운영 알림" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 flex flex-col gap-3",
					children: d.alerts.filter((a) => !ack.includes(a.id)).map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-col gap-2 rounded-md bg-bg px-3 py-3 sm:flex-row sm:items-start sm:justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: statusTone(a.severity),
								children: a.severity
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm font-medium",
								children: a.title
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: a.message
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "h-11 shrink-0 text-sm text-primary",
							onClick: () => {
								setAck((s) => [...s, a.id]);
								acknowledgeAlert({ data: { id: a.id } });
							},
							children: "확인"
						})]
					}, a.id))
				})] }) : null
			]
		}) : null
	] });
}
//#endregion
export { Dashboard as component };
