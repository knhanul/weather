import { o as __toESM } from "../_runtime.mjs";
import { i as require_react, n as QueryClientProvider, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { _ as createRootRoute, d as useRouterState, g as createFileRoute, h as lazyRouteComponent, l as Scripts, m as Outlet, p as createRouter, u as HeadContent, v as Link, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { D as toIsoKst, O as toKstWall, T as sha256Hex, a as addHoursKst, b as mapHourly, c as asNum, g as getSql, i as ROLES, l as asString, p as ensureWeatherReady, r as HOURLY_SELECT, s as asInt, v as latestOfficialHour, x as parseKst, y as mapDaily } from "./query-helpers-Dul_CJnW.mjs";
import { a as number, c as union, i as literal, n as array, o as object, r as boolean, s as string, t as _enum } from "../_libs/zod.mjs";
import { _ as Activity, a as Server, c as Menu, d as LayoutDashboard, f as KeyRound, g as CloudSun, h as Database, i as Settings2, l as MapPin, m as Download, n as TriangleAlert, o as ScrollText, p as FileText, r as TimerReset, s as Radio, t as X, u as ListChecks } from "../_libs/lucide-react.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { n as clsx } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-DL28EAhj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "예상하지 못한 오류가 발생했습니다. 페이지를 다시 불러 주세요.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-bad",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-lg font-medium",
				children: "문제가 발생했습니다"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-muted",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg", "placeholder:text-subtle", className),
		...props
	});
}
function Label({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
		className: cn("text-sm font-medium text-fg", className),
		...props
	});
}
function Select({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
		className: cn("h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg", className),
		...props,
		children
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var getSession = createServerFn({ method: "GET" }).handler(createSsrRpc("1b071bca7e029a5cccaf189685cd97c7e458232729dd68291d936d8d5dffdc08"));
var setSessionRole = createServerFn({ method: "POST" }).validator(object({ role: _enum(ROLES) })).handler(createSsrRpc("defd8bf2e333af08cadeea2321bb681089260de4908f8e74523ad1d651c268a9"));
var getDashboard = createServerFn({ method: "GET" }).handler(createSsrRpc("392721b5d9d00c744719a5cfcb2fe546afb3f6323382241ca64dcfbb79b5869c"));
var listStations = createServerFn({ method: "GET" }).validator(object({
	q: string().optional(),
	type: string().optional(),
	region: string().optional(),
	enabled: string().optional(),
	favorite: boolean().optional()
})).handler(createSsrRpc("a617ae3a3d25479200bcf3083d4b030e7f4d44dee0825c2c595ab94c3bb8ae04"));
var toggleStation = createServerFn({ method: "POST" }).validator(object({
	stationId: string(),
	field: _enum(["enabled", "favorite"])
})).handler(createSsrRpc("8f17deaa97ca332eac4181548d5efbcd99bb3fd1236de98b87b223bde0085ad1"));
var syncStations = createServerFn({ method: "POST" }).handler(createSsrRpc("b80aa31c5c826d954a4e5757bad4c58a97f50ec97d1f6e1b0e308a41ff802cbe"));
var listDatasets = createServerFn({ method: "GET" }).handler(createSsrRpc("f85ca0ee30bfc99fb415c93247006d7d600c1053c9c9331c940043b5b24564be"));
var listProviders = createServerFn({ method: "GET" }).handler(createSsrRpc("680f3412076ee9ca4b0c925c1bd2731b61a038a1a67b2521acb7104e0f39421e"));
var saveProviderKey = createServerFn({ method: "POST" }).validator(object({
	serviceCode: string(),
	apiKey: string().min(8)
})).handler(createSsrRpc("41df333b82c00caee2e73c96a5b7587aecc435849f6f757313d2c641633e9c0b"));
var saveProviderSettings = createServerFn({ method: "POST" }).validator(object({
	serviceCode: string(),
	requestsPerSecond: number().int().min(1).max(10),
	requestsPerMinute: number().int().min(1).max(200),
	retryCount: number().int().min(0).max(8),
	timeoutSeconds: number().int().min(5).max(60),
	chunkDays: number().int().min(1).max(90),
	preserveRaw: boolean(),
	rawRetentionDays: number().int().min(1).max(365),
	status: _enum(["ENABLED", "DISABLED"])
})).handler(createSsrRpc("04e19c76733aa4bd17de1e2de8022823361633ac3967f079825ec3411eef20c4"));
var runConnectionTest = createServerFn({ method: "POST" }).validator(object({ datasetCode: string() })).handler(createSsrRpc("e68e47c0830029a5b29b386edc43583a7b100f262a66997a58fe16dfa37ea86d"));
var startCollection = createServerFn({ method: "POST" }).validator(object({
	datasetCode: string(),
	stationIds: array(string()).min(1),
	from: string(),
	to: string()
})).handler(createSsrRpc("652dc60af6bc5ad4615fe4540482959d65d629592abf88fcb65a65781134be0b"));
var tickJobs = createServerFn({ method: "POST" }).handler(createSsrRpc("6e139cb33c085f34578bac08e2240756cb6de9d2dede0b7aadc864e4825919e4"));
var listJobs = createServerFn({ method: "GET" }).handler(createSsrRpc("dc73334fbbb403723190edc839105389d8dac511d73fbb4dbab9032b9a548548"));
var getJob = createServerFn({ method: "GET" }).validator(object({ id: number() })).handler(createSsrRpc("fe11700721c3e81348f3e2559ac380e10c424697859d1d95c1752c7626f16f21"));
var retryJob = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(createSsrRpc("9bd579d0c87e30b472efd86a790df69dfda68fae3efc8e271a159ad0124f373a"));
var cancelCollection = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(createSsrRpc("c140d3c3d8df380296b3112fa945e43121011e96c24c20dad1c8dca92fa24aa4"));
var listSchedules = createServerFn({ method: "GET" }).handler(createSsrRpc("4983be31f881e7d55181b8116b61063d4a2dbcff1dcfb0c6e76736982f7ca9cf"));
var saveSchedule = createServerFn({ method: "POST" }).validator(object({
	id: number(),
	enabled: boolean(),
	cadence: _enum(["HOURLY", "DAILY"]),
	lookbackHours: number().int().min(1).max(168),
	stationScope: _enum([
		"FAVORITES",
		"ENABLED",
		"ALL"
	])
})).handler(createSsrRpc("0481a2e9946cde504c048a2778b0f487ec77b6befa6735eb2bd722ef7e0b4ef4"));
var queryInput = object({
	stationId: string().optional(),
	from: string().optional(),
	to: string().optional(),
	rainOnly: boolean().optional(),
	tempMin: number().optional(),
	tempMax: number().optional(),
	page: number().int().min(1).default(1),
	pageSize: number().int().min(10).max(200).default(24)
});
var queryHourly = createServerFn({ method: "GET" }).validator(queryInput).handler(createSsrRpc("5d6a53aba490f244bcd7dcdc03301dca15edba7fb962da30e28c6e5af0983ad8"));
var queryDaily = createServerFn({ method: "GET" }).validator(queryInput).handler(createSsrRpc("b5dde76c1f5328affe02935b2817b909904bae4e310140d1f10f1772f65e0113"));
var findGaps = createServerFn({ method: "GET" }).validator(object({
	stationId: string(),
	from: string(),
	to: string()
})).handler(createSsrRpc("3ec138adb9777cfbad4413ab435dfe74f24a6fb6c5190290caf22fe2279806c8"));
var listApiClients = createServerFn({ method: "GET" }).handler(createSsrRpc("0ee4a5c15acfc20053924310da333e0b3d159f47fdc39a6b3a70c2817d40c904"));
var createApiClient = createServerFn({ method: "POST" }).validator(object({
	name: string().min(2),
	code: string().min(2)
})).handler(createSsrRpc("60a407ca56727379582417abe0272ea867216d41864985389fa35b4d97239e7f"));
var revokeApiClient = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(createSsrRpc("2df184140f2477ff6713868c6bcd2e3249b75850c0fb04198af6ad4367010255"));
var listApiUsage = createServerFn({ method: "GET" }).handler(createSsrRpc("43e23928ed767af2e4bd71bb0320484855a46c0d66d448893412caaa4b4c37fe"));
var listAudit = createServerFn({ method: "GET" }).handler(createSsrRpc("6879624f8b5ad03bf1a523b1569fec01f8d847891e9d60bec0ea5c7e6bb0264c"));
var getHealth = createServerFn({ method: "GET" }).handler(createSsrRpc("05e4c8ef715547da41155bfbdaff9841d18b02ba8293b2cd39225f86cb8b6566"));
var acknowledgeAlert = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(createSsrRpc("d28de011dcdb51b6dafcde540652c17b392fabc80534d99a820c69d153233052"));
createServerFn({ method: "GET" }).handler(createSsrRpc("1a824f36c1f8f93522995f5dfc1a8c95c951ea9f09a7c4da642f9b4e95f68e55"));
var startExport = createServerFn({ method: "POST" }).validator(object({
	format: _enum([
		"CSV",
		"XLSX",
		"JSON"
	]),
	kind: _enum(["hourly", "daily"]),
	stationId: string(),
	from: string(),
	to: string(),
	columns: array(string()).min(1)
})).handler(createSsrRpc("3e00184a40b696ebcd2afd738bfc49f2916d003b764efb7addd2628ff2a0b18f"));
var NAV = [
	{
		title: "운영",
		items: [{
			to: "/",
			label: "대시보드",
			icon: LayoutDashboard
		}]
	},
	{
		title: "기상자료",
		items: [
			{
				to: "/weather/hourly",
				label: "시간자료",
				icon: CloudSun
			},
			{
				to: "/weather/daily",
				label: "일자료",
				icon: CloudSun
			},
			{
				to: "/weather/download",
				label: "다운로드",
				icon: Download
			},
			{
				to: "/weather/gaps",
				label: "누락 탐지",
				icon: Activity,
				roles: ["ADMIN", "DATA_MANAGER"]
			}
		]
	},
	{
		title: "데이터 수집",
		items: [
			{
				to: "/collect/manual",
				label: "수동수집",
				icon: TimerReset,
				roles: ["ADMIN", "DATA_MANAGER"]
			},
			{
				to: "/collect/schedules",
				label: "자동수집",
				icon: Radio,
				roles: ["ADMIN", "DATA_MANAGER"]
			},
			{
				to: "/collect/jobs",
				label: "수집이력",
				icon: ListChecks
			}
		]
	},
	{
		title: "기준정보",
		items: [
			{
				to: "/master/datasets",
				label: "데이터셋",
				icon: Database
			},
			{
				to: "/master/stations",
				label: "관측지점",
				icon: MapPin
			},
			{
				to: "/master/providers",
				label: "공급원",
				icon: Server,
				roles: ["ADMIN"]
			}
		]
	},
	{
		title: "API 관리",
		items: [
			{
				to: "/api-admin/keys",
				label: "내부 API Key",
				icon: KeyRound,
				roles: ["ADMIN"]
			},
			{
				to: "/api-admin/usage",
				label: "이용내역",
				icon: ScrollText
			},
			{
				to: "/api-admin/docs",
				label: "API 명세",
				icon: FileText
			}
		]
	},
	{
		title: "시스템",
		items: [
			{
				to: "/system/logs",
				label: "감사로그",
				icon: ScrollText,
				roles: ["ADMIN"]
			},
			{
				to: "/system/health",
				label: "환경상태",
				icon: Settings2
			},
			{
				to: "/help",
				label: "허브 안내",
				icon: FileText
			}
		]
	}
];
function AppShell({ children }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [open, setOpen] = (0, import_react.useState)(false);
	const [role, setRole] = (0, import_react.useState)("ADMIN");
	const [now, setNow] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		getSession().then((s) => {
			setRole(s.role);
			setNow(s.now);
		});
	}, []);
	const nav = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		className: "flex flex-col gap-6 px-3 py-4",
		children: NAV.map((group) => {
			const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
			if (!items.length) return null;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-3 mb-2 text-xs font-medium tracking-wide uppercase text-subtle",
				children: group.title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-0.5",
				children: items.map((item) => {
					const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
					const Icon = item.icon;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: item.to,
						onClick: () => setOpen(false),
						className: cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150", active ? "bg-primary text-primary-fg" : "text-fg hover:bg-surface-2"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4 shrink-0" }), item.label]
					}) }, item.to);
				})
			})] }, group.title);
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-surface md:flex md:flex-col",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Brand, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex-1 overflow-y-auto",
						children: nav
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-5 py-4 text-xs text-subtle",
						children: "Asia/Seoul · 표준 관측시각"
					})
				]
			}),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "fixed inset-0 z-40 md:hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "absolute inset-0 bg-overlay",
					"aria-label": "닫기",
					onClick: () => setOpen(false)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "relative flex h-full w-72 flex-col bg-surface",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between border-b border-border px-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Brand, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "size-11 grid place-items-center",
							onClick: () => setOpen(false),
							"aria-label": "메뉴 닫기",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-5" })
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex-1 overflow-y-auto",
						children: nav
					})]
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "md:pl-60",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "grid size-11 place-items-center rounded-md hover:bg-surface-2 md:hidden",
							onClick: () => setOpen(true),
							"aria-label": "메뉴",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Menu, { className: "size-5" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "min-w-0 flex-1",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate text-sm text-muted",
								children: "사내 공통 기상데이터 플랫폼"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "hidden items-center gap-2 text-xs text-muted sm:flex tabular",
							children: now || "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							className: "h-11 w-[9.5rem]",
							value: role,
							onChange: (e) => {
								const next = e.target.value;
								setRole(next);
								setSessionRole({ data: { role: next } });
							},
							"aria-label": "역할",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "ADMIN",
									children: "ADMIN"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "DATA_MANAGER",
									children: "DATA_MANAGER"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "VIEWER",
									children: "VIEWER"
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: "px-4 py-6 sm:px-8 sm:py-8",
					children
				})]
			})
		]
	});
}
function Brand() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: "/",
		className: "flex items-center gap-2 px-4 py-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "grid size-9 place-items-center rounded-md bg-primary text-primary-fg",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloudSun, { className: "size-5" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block font-display text-lg leading-tight tracking-tight",
			children: "기상허브"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block text-xs text-muted",
			children: "Weather Data Hub"
		})] })]
	});
}
function PageHeader({ eyebrow, title, description, actions }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
			eyebrow ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-1 text-xs font-medium uppercase tracking-wide text-subtle",
				children: eyebrow
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-3xl tracking-tight",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-2xl text-sm text-muted",
				children: description
			}) : null
		] }), actions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-wrap gap-2",
			children: actions
		}) : null]
	});
}
var styles_default = "/assets/styles-klh4g0-0.css";
var APP_NAME = "기상허브";
var Route$23 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "theme-color",
				content: "#1F4E5F"
			},
			{
				name: "description",
				content: "사내 공통 기상데이터 플랫폼 — 수집, 표준화, 조회, 내부 API"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Noto+Sans+KR:wght@400;500;600&display=swap"
			}
		]
	}),
	component: Root
});
function Root() {
	const [client] = (0, import_react.useState)(() => new QueryClient({ defaultOptions: { queries: {
		refetchOnWindowFocus: false,
		retry: 1
	} } }));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "ko",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
				client,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }) })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
		] })]
	});
}
var $$splitComponentImporter$16 = () => import("./routes-Csy7CuVf.mjs");
var Route$22 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter$16, "component") });
var $$splitComponentImporter$15 = () => import("./help-hiCV6MqC.mjs");
var Route$21 = createFileRoute("/help")({ component: lazyRouteComponent($$splitComponentImporter$15, "component") });
var $$splitComponentImporter$14 = () => import("./docs-BxxNRptD.mjs");
var Route$20 = createFileRoute("/api-admin/docs")({ component: lazyRouteComponent($$splitComponentImporter$14, "component") });
var $$splitComponentImporter$13 = () => import("./keys-DtQ6U15g.mjs");
var Route$19 = createFileRoute("/api-admin/keys")({ component: lazyRouteComponent($$splitComponentImporter$13, "component") });
var $$splitComponentImporter$12 = () => import("./usage-CzbwrJdL.mjs");
var Route$18 = createFileRoute("/api-admin/usage")({ component: lazyRouteComponent($$splitComponentImporter$12, "component") });
var $$splitComponentImporter$11 = () => import("./jobs-CGtT5Tfs.mjs");
var Route$17 = createFileRoute("/collect/jobs")({ component: lazyRouteComponent($$splitComponentImporter$11, "component") });
var $$splitComponentImporter$10 = () => import("./manual-BZAHYxSv.mjs");
var Route$16 = createFileRoute("/collect/manual")({ component: lazyRouteComponent($$splitComponentImporter$10, "component") });
var $$splitComponentImporter$9 = () => import("./schedules-Bm30MolO.mjs");
var Route$15 = createFileRoute("/collect/schedules")({ component: lazyRouteComponent($$splitComponentImporter$9, "component") });
var $$splitComponentImporter$8 = () => import("./datasets-BdQuz1qU.mjs");
var Route$14 = createFileRoute("/master/datasets")({ component: lazyRouteComponent($$splitComponentImporter$8, "component") });
var $$splitComponentImporter$7 = () => import("./providers-CgtJa8I0.mjs");
var Route$13 = createFileRoute("/master/providers")({ component: lazyRouteComponent($$splitComponentImporter$7, "component") });
var $$splitComponentImporter$6 = () => import("./stations-Bh_3dcR6.mjs");
var Route$12 = createFileRoute("/master/stations")({ component: lazyRouteComponent($$splitComponentImporter$6, "component") });
var $$splitComponentImporter$5 = () => import("./health-BtXr0bDP.mjs");
var Route$11 = createFileRoute("/system/health")({ component: lazyRouteComponent($$splitComponentImporter$5, "component") });
var $$splitComponentImporter$4 = () => import("./logs-DEpMbMH5.mjs");
var Route$10 = createFileRoute("/system/logs")({ component: lazyRouteComponent($$splitComponentImporter$4, "component") });
var $$splitComponentImporter$3 = () => import("./daily-BOHw2PqS.mjs");
var Route$9 = createFileRoute("/weather/daily")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
var $$splitComponentImporter$2 = () => import("./download-BNsXg4mI.mjs");
var Route$8 = createFileRoute("/weather/download")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
var $$splitComponentImporter$1 = () => import("./gaps-DWPT7b3r.mjs");
var Route$7 = createFileRoute("/weather/gaps")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
var $$splitComponentImporter = () => import("./hourly-spAv9BzC.mjs");
var Route$6 = createFileRoute("/weather/hourly")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var Route$5 = createFileRoute("/api/v1/health")({ server: { handlers: { GET: async () => {
	await ensureWeatherReady();
	const n = await (await getSql()).query(`select count(*)::int as n from weather_observations_hourly`);
	return Response.json({
		status: "ok",
		timezone: "Asia/Seoul",
		latestOfficialHour: latestOfficialHour(),
		hourlyRecords: n[0]?.n ?? 0
	});
} } } });
async function authorize(request) {
	await ensureWeatherReady();
	const header = request.headers.get("x-api-key") ?? request.headers.get("authorization") ?? "";
	const key = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
	if (!key) return {
		ok: false,
		status: 401,
		error: {
			code: "NO_KEY",
			message: "X-API-Key 헤더가 필요합니다."
		}
	};
	const sql = await getSql();
	const row = (await sql.query(`select id, name, client_code, scopes, status from weather_api_clients where key_hash=$1`, [sha256Hex(key)]))[0];
	if (!row) return {
		ok: false,
		status: 401,
		error: {
			code: "BAD_KEY",
			message: "유효하지 않은 API 키입니다."
		}
	};
	if (asString(row.status) !== "ACTIVE") return {
		ok: false,
		status: 403,
		error: {
			code: "REVOKED",
			message: "폐기된 API 키입니다."
		}
	};
	await sql.query(`update weather_api_clients set last_used_at=now() where id=$1`, [asInt(row.id)]);
	return {
		ok: true,
		client: {
			id: asInt(row.id),
			name: asString(row.name),
			code: asString(row.client_code),
			scopes: asString(row.scopes)
		}
	};
}
async function logUsage(client, request, status, count, started) {
	try {
		const sql = await getSql();
		const url = new URL(request.url);
		await sql.query(`insert into weather_api_usage (client_id, client_name, method, path, status_code, result_count, duration_ms)
       values ($1,$2,$3,$4,$5,$6,$7)`, [
			client?.id ?? null,
			client?.name ?? null,
			request.method,
			url.pathname,
			status,
			count,
			Date.now() - started
		]);
	} catch {}
}
function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "private, no-store"
		}
	});
}
async function queryHourlyApi(url) {
	const sql = await getSql();
	const stationId = url.searchParams.get("station_id") || "108";
	const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -24));
	const to = toKstWall(url.searchParams.get("to") || latestOfficialHour());
	const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
	const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") ?? 100)));
	const st = await sql.query(`select station_name, station_type, latitude, longitude from weather_stations where station_id=$1`, [stationId]);
	const total = await sql.query(`select count(*)::int as n from weather_observations_hourly
      where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp`, [
		stationId,
		from,
		to
	]);
	const mapped = (await sql.query(`select ${HOURLY_SELECT}
       from weather_observations_hourly o
       left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
      where o.station_id=$1 and o.observation_datetime >= $2::timestamp and o.observation_datetime <= $3::timestamp
      order by o.observation_datetime
      limit $4 offset $5`, [
		stationId,
		from,
		to,
		pageSize,
		(page - 1) * pageSize
	])).map((r) => mapHourly(r));
	return {
		source: "KMA",
		dataset: "ASOS_HOURLY",
		timezone: "Asia/Seoul",
		station: {
			id: stationId,
			name: st[0]?.station_name ?? stationId,
			type: st[0]?.station_type ?? "ASOS",
			latitude: st[0]?.latitude ?? null,
			longitude: st[0]?.longitude ?? null
		},
		period: {
			from: toIsoKst(from),
			to: toIsoKst(to)
		},
		page,
		pageSize,
		total: total[0]?.n ?? 0,
		data: mapped.map((r) => ({
			observation_datetime: toIsoKst(r.observationDatetime),
			temperature: r.temperature,
			precipitation: r.precipitation,
			humidity: r.humidity,
			wind_speed: r.windSpeed,
			wind_direction: r.windDirection,
			pressure: r.pressure,
			sunshine: r.sunshine,
			solar_radiation: r.solarRadiation,
			snow_depth: r.snowDepth,
			visibility: r.visibility,
			quality: {
				temperature: r.qualityTemperature,
				precipitation: r.qualityPrecipitation
			}
		}))
	};
}
async function queryDailyApi(url) {
	const sql = await getSql();
	const stationId = url.searchParams.get("station_id") || "108";
	const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -720)).slice(0, 10);
	const to = toKstWall(url.searchParams.get("to") || latestOfficialHour()).slice(0, 10);
	const st = await sql.query(`select station_name from weather_stations where station_id=$1`, [stationId]);
	const mapped = (await sql.query(`select d.*, s.station_name, d.observation_date::text as observation_date
       from weather_observations_daily d
       left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
      where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
        and d.source_kind='OFFICIAL'
      order by d.observation_date`, [
		stationId,
		from,
		to
	])).map((r) => mapDaily(r));
	return {
		source: "KMA",
		dataset: "ASOS_DAILY",
		timezone: "Asia/Seoul",
		note: "공식 일자료이며 시간자료 자체 집계와 다를 수 있습니다.",
		station: {
			id: stationId,
			name: st[0]?.station_name ?? stationId
		},
		period: {
			from,
			to
		},
		data: mapped.map((r) => ({
			observation_date: r.observationDate,
			avg_temperature: r.avgTemperature,
			min_temperature: r.minTemperature,
			max_temperature: r.maxTemperature,
			precipitation: r.precipitation,
			avg_humidity: r.avgHumidity,
			snow_depth: r.snowDepth,
			sunshine_hours: r.sunshineHours
		}))
	};
}
async function nearestHourly(url) {
	const sql = await getSql();
	const stationId = url.searchParams.get("station_id") || "108";
	const rawDt = url.searchParams.get("datetime");
	if (!rawDt) throw new Error("datetime 파라미터가 필요합니다.");
	const target = parseKst(rawDt);
	const wall = toKstWall(rawDt);
	const row = await sql.query(`select ${HOURLY_SELECT},
            abs(extract(epoch from (o.observation_datetime - $2::timestamp))) as delta_sec
       from weather_observations_hourly o
       left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
      where o.station_id=$1
      order by abs(extract(epoch from (o.observation_datetime - $2::timestamp)))
      limit 1`, [stationId, wall]);
	if (!row[0]) return {
		source: "KMA",
		dataset: "ASOS_HOURLY",
		data: null
	};
	const mapped = mapHourly(row[0]);
	const obs = parseKst(mapped.observationDatetime);
	return {
		source: "KMA",
		dataset: "ASOS_HOURLY",
		timezone: "Asia/Seoul",
		requested_datetime: toIsoKst(wall),
		selected_datetime: toIsoKst(mapped.observationDatetime),
		delta_seconds: Math.round((obs.getTime() - target.getTime()) / 1e3),
		interpolated: false,
		data: {
			observation_datetime: toIsoKst(mapped.observationDatetime),
			temperature: mapped.temperature,
			precipitation: mapped.precipitation,
			humidity: mapped.humidity,
			wind_speed: mapped.windSpeed,
			pressure: mapped.pressure
		}
	};
}
async function summaryApi(url) {
	const sql = await getSql();
	const stationId = url.searchParams.get("station_id") || "108";
	const from = toKstWall(url.searchParams.get("from") || addHoursKst(latestOfficialHour(), -24));
	const to = toKstWall(url.searchParams.get("to") || latestOfficialHour());
	const r = (await sql.query(`select count(*)::int as sample_count,
            avg(temperature) as avg_temperature,
            min(temperature) as min_temperature,
            max(temperature) as max_temperature,
            sum(precipitation) as total_precipitation,
            count(*) filter (where precipitation is not null and precipitation > 0)::int as rain_observation_count,
            avg(humidity) as avg_humidity
       from weather_observations_hourly
      where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp`, [
		stationId,
		from,
		to
	]))[0] ?? {};
	return {
		source: "KMA",
		dataset: "ASOS_HOURLY",
		timezone: "Asia/Seoul",
		station_id: stationId,
		period: {
			from: toIsoKst(from),
			to: toIsoKst(to)
		},
		sample_count: asInt(r.sample_count),
		avg_temperature: r.avg_temperature === null ? null : Math.round(Number(r.avg_temperature) * 10) / 10,
		min_temperature: asNum(r.min_temperature),
		max_temperature: asNum(r.max_temperature),
		total_precipitation: r.total_precipitation === null ? null : Math.round(Number(r.total_precipitation) * 10) / 10,
		rain_observation_count: asInt(r.rain_observation_count),
		avg_humidity: r.avg_humidity === null ? null : Math.round(Number(r.avg_humidity) * 10) / 10,
		note: "강수 합계는 NULL이 아닌 값만 합산합니다. 보간하지 않습니다."
	};
}
async function stationsApi(url) {
	const sql = await getSql();
	const q = url.searchParams.get("q") ?? "";
	return {
		source: "KMA",
		data: (await sql.query(`select station_id, station_name, region, office, latitude, longitude, altitude, station_type, enabled, is_favorite
       from weather_stations where provider='KMA' order by station_id`)).map((r) => ({
			station_id: asString(r.station_id),
			name: asString(r.station_name),
			region: r.region ? asString(r.region) : null,
			office: r.office ? asString(r.office) : null,
			latitude: asNum(r.latitude),
			longitude: asNum(r.longitude),
			altitude: asNum(r.altitude),
			type: asString(r.station_type),
			enabled: r.enabled === true || r.enabled === "t",
			favorite: r.is_favorite === true || r.is_favorite === "t"
		})).filter((s) => !q || s.station_id.includes(q) || s.name.includes(q))
	};
}
async function withApiKey(request, handler) {
	const started = Date.now();
	const auth = await authorize(request);
	if (!auth.ok) {
		await logUsage(null, request, auth.status, null, started);
		return json({ error: auth.error }, auth.status);
	}
	try {
		const result = await handler(auth.client, request);
		await logUsage(auth.client, request, 200, result.count ?? null, started);
		return json(result.body);
	} catch (err) {
		const message = err instanceof Error ? err.message : "요청을 처리할 수 없습니다.";
		await logUsage(auth.client, request, 400, null, started);
		return json({ error: {
			code: "BAD_REQUEST",
			message
		} }, 400);
	}
}
var Route$4 = createFileRoute("/api/v1/weather/daily")({ server: { handlers: { GET: async ({ request }) => withApiKey(request, async (_client, req) => {
	const body = await queryDailyApi(new URL(req.url));
	return {
		body,
		count: body.data.length
	};
}) } } });
var Route$3 = createFileRoute("/api/v1/weather/hourly")({ server: { handlers: { GET: async ({ request }) => withApiKey(request, async (_client, req) => {
	const body = await queryHourlyApi(new URL(req.url));
	return {
		body,
		count: body.data.length
	};
}) } } });
var Route$2 = createFileRoute("/api/v1/weather/stations")({ server: { handlers: { GET: async ({ request }) => withApiKey(request, async (_client, req) => {
	const body = await stationsApi(new URL(req.url));
	return {
		body,
		count: body.data.length
	};
}) } } });
var Route$1 = createFileRoute("/api/v1/weather/summary")({ server: { handlers: { GET: async ({ request }) => withApiKey(request, async (_client, req) => {
	const body = await summaryApi(new URL(req.url));
	return {
		body,
		count: body.sample_count
	};
}) } } });
var Route = createFileRoute("/api/v1/weather/hourly/nearest")({ server: { handlers: { GET: async ({ request }) => withApiKey(request, async (_client, req) => {
	const body = await nearestHourly(new URL(req.url));
	return {
		body,
		count: body.data ? 1 : 0
	};
}) } } });
var IndexRoute = Route$22.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$23
});
var HelpRoute = Route$21.update({
	id: "/help",
	path: "/help",
	getParentRoute: () => Route$23
});
var ApiAdminDocsRoute = Route$20.update({
	id: "/api-admin/docs",
	path: "/api-admin/docs",
	getParentRoute: () => Route$23
});
var ApiAdminKeysRoute = Route$19.update({
	id: "/api-admin/keys",
	path: "/api-admin/keys",
	getParentRoute: () => Route$23
});
var ApiAdminUsageRoute = Route$18.update({
	id: "/api-admin/usage",
	path: "/api-admin/usage",
	getParentRoute: () => Route$23
});
var CollectJobsRoute = Route$17.update({
	id: "/collect/jobs",
	path: "/collect/jobs",
	getParentRoute: () => Route$23
});
var CollectManualRoute = Route$16.update({
	id: "/collect/manual",
	path: "/collect/manual",
	getParentRoute: () => Route$23
});
var CollectSchedulesRoute = Route$15.update({
	id: "/collect/schedules",
	path: "/collect/schedules",
	getParentRoute: () => Route$23
});
var MasterDatasetsRoute = Route$14.update({
	id: "/master/datasets",
	path: "/master/datasets",
	getParentRoute: () => Route$23
});
var MasterProvidersRoute = Route$13.update({
	id: "/master/providers",
	path: "/master/providers",
	getParentRoute: () => Route$23
});
var MasterStationsRoute = Route$12.update({
	id: "/master/stations",
	path: "/master/stations",
	getParentRoute: () => Route$23
});
var SystemHealthRoute = Route$11.update({
	id: "/system/health",
	path: "/system/health",
	getParentRoute: () => Route$23
});
var SystemLogsRoute = Route$10.update({
	id: "/system/logs",
	path: "/system/logs",
	getParentRoute: () => Route$23
});
var WeatherDailyRoute = Route$9.update({
	id: "/weather/daily",
	path: "/weather/daily",
	getParentRoute: () => Route$23
});
var WeatherDownloadRoute = Route$8.update({
	id: "/weather/download",
	path: "/weather/download",
	getParentRoute: () => Route$23
});
var WeatherGapsRoute = Route$7.update({
	id: "/weather/gaps",
	path: "/weather/gaps",
	getParentRoute: () => Route$23
});
var WeatherHourlyRoute = Route$6.update({
	id: "/weather/hourly",
	path: "/weather/hourly",
	getParentRoute: () => Route$23
});
var ApiV1HealthRoute = Route$5.update({
	id: "/api/v1/health",
	path: "/api/v1/health",
	getParentRoute: () => Route$23
});
var ApiV1WeatherDailyRoute = Route$4.update({
	id: "/api/v1/weather/daily",
	path: "/api/v1/weather/daily",
	getParentRoute: () => Route$23
});
var ApiV1WeatherHourlyRoute = Route$3.update({
	id: "/api/v1/weather/hourly",
	path: "/api/v1/weather/hourly",
	getParentRoute: () => Route$23
});
var ApiV1WeatherStationsRoute = Route$2.update({
	id: "/api/v1/weather/stations",
	path: "/api/v1/weather/stations",
	getParentRoute: () => Route$23
});
var ApiV1WeatherSummaryRoute = Route$1.update({
	id: "/api/v1/weather/summary",
	path: "/api/v1/weather/summary",
	getParentRoute: () => Route$23
});
var ApiV1WeatherHourlyRouteChildren = { ApiV1WeatherHourlyNearestRoute: Route.update({
	id: "/nearest",
	path: "/nearest",
	getParentRoute: () => ApiV1WeatherHourlyRoute
}) };
var rootRouteChildren = {
	IndexRoute,
	HelpRoute,
	ApiAdminDocsRoute,
	ApiAdminKeysRoute,
	ApiAdminUsageRoute,
	CollectJobsRoute,
	CollectManualRoute,
	CollectSchedulesRoute,
	MasterDatasetsRoute,
	MasterProvidersRoute,
	MasterStationsRoute,
	SystemHealthRoute,
	SystemLogsRoute,
	WeatherDailyRoute,
	WeatherDownloadRoute,
	WeatherGapsRoute,
	WeatherHourlyRoute,
	ApiV1HealthRoute,
	ApiV1WeatherDailyRoute,
	ApiV1WeatherHourlyRoute: ApiV1WeatherHourlyRoute._addFileChildren(ApiV1WeatherHourlyRouteChildren),
	ApiV1WeatherStationsRoute,
	ApiV1WeatherSummaryRoute
};
var routeTree = Route$23._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent,
		defaultPreload: "intent",
		scrollRestoration: true
	});
}
//#endregion
export { toggleStation as A, saveProviderKey as C, startExport as D, startCollection as E, Label as M, Select as N, syncStations as O, cn as P, runConnectionTest as S, saveSchedule as T, listStations as _, createApiClient as a, retryJob as b, getHealth as c, listApiUsage as d, listAudit as f, listSchedules as g, listProviders as h, cancelCollection as i, Input as j, tickJobs as k, getJob as l, listJobs as m, PageHeader as n, findGaps as o, listDatasets as p, acknowledgeAlert as r, getDashboard as s, router_exports as t, listApiClients as u, queryDaily as v, saveProviderSettings as w, revokeApiClient as x, queryHourly as y };
