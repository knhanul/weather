import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { P as cn } from "./router-DL28EAhj.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/card-Brn04LPU.js
var import_jsx_runtime = require_jsx_runtime();
function Card({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("rounded-xl border border-border bg-surface p-5 shadow-soft", className),
		...props
	});
}
function CardTitle({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: cn("font-display text-lg font-medium tracking-tight", className),
		...props
	});
}
function CardDesc({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("mt-1 text-sm text-muted", className),
		...props
	});
}
//#endregion
export { CardDesc as n, CardTitle as r, Card as t };
