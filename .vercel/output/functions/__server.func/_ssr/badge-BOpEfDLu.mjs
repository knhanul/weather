import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { P as cn } from "./router-DL28EAhj.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/badge-BOpEfDLu.js
var import_jsx_runtime = require_jsx_runtime();
var tones = {
	neutral: "bg-surface-2 text-muted",
	ok: "bg-ok-bg text-ok",
	warn: "bg-warn-bg text-warn",
	bad: "bg-bad-bg text-bad",
	info: "bg-info-bg text-info"
};
function Badge({ tone = "neutral", className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className),
		...props
	});
}
function statusTone(status) {
	const s = status.toUpperCase();
	if ([
		"OK",
		"COMPLETED",
		"ACTIVE",
		"ENABLED",
		"NORMAL",
		"정상"
	].includes(s)) return "ok";
	if ([
		"PENDING",
		"RUNNING",
		"PARTIAL_SUCCESS",
		"WARN",
		"SUSPECT"
	].includes(s)) return "warn";
	if ([
		"FAILED",
		"REVOKED",
		"DISABLED",
		"INVALID",
		"CANCELLED",
		"ERROR"
	].includes(s)) return "bad";
	if (["INFO", "SEED"].includes(s)) return "info";
	return "neutral";
}
//#endregion
export { statusTone as n, Badge as t };
