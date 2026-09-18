import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as PageHeader } from "./router-DL28EAhj.mjs";
import { n as CardDesc, r as CardTitle, t as Card } from "./card-Brn04LPU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/help-hiCV6MqC.js
var import_jsx_runtime = require_jsx_runtime();
function HelpPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		eyebrow: "시스템",
		title: "허브 안내",
		description: "이 시스템은 구내식당 전용이 아닙니다. 공통 기상데이터 플랫폼입니다."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "데이터 계층" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardDesc, { children: "기상청 응답 구조를 업무 API로 그대로 쓰지 않습니다." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
					className: "mt-4 space-y-2 text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "1. 외부 원본 — KMA JSON, weather_raw_imports" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "2. 표준화 모델 — weather_observations_hourly / daily" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "3. 제공 — 내부 REST / CSV / XLSX / JSON" })
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "사용한 공식 API" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-3 space-y-2 text-sm",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "기상청_지상(종관, ASOS) 시간자료 조회서비스 · AsosHourlyInfoService/getWthrDataList" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "기상청_지상(종관, ASOS) 일자료 조회서비스 · AsosDalyInfoService/getWthrDataList" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "인증: 공공데이터포털 serviceKey · JSON 지원 · 개발계정 10,000건/일" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "QC: 정상=null, 오류=1, 결측=9 (공식 가이드)" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "제공 범위: 전일(D-1), 전일 자료는 11시 이후 조회" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AWS: 커넥터만 준비. 공개 API는 최근 2일 1분 자료라 시간자료 계약은 확인 필요" })
				]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "구내식당 연계 예" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
				className: "mt-3 overflow-x-auto rounded-md bg-bg p-3 text-xs",
				children: `GET /api/v1/weather/hourly
  ?station_id=108
  &from=2026-09-12T09:00:00+09:00
  &to=2026-09-12T13:00:00+09:00
Header: X-API-Key: (구내식당 시스템 키)

식당 시스템은 배식 전 평균기온·강수·습도를
스스로 계산합니다. 기상허브는 원본 관측만 제공합니다.`
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "하지 않는 것" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-3 list-disc space-y-1 pl-5 text-sm text-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "원본 테이블에 cafeteria_id, lunch_rain 같은 업무 컬럼" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "관측과 예보를 같은 행에 덮어쓰기" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "NULL을 0으로 바꾸기" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "소스/프론트에 기상청 인증키 넣기" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "업무시스템이 weather DB를 직접 JOIN" })
				]
			})] })
		]
	})] });
}
//#endregion
export { HelpPage as component };
