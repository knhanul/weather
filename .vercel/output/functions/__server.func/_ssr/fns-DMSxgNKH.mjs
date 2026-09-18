import { a as setCookie$1, i as getCookie, n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { D as toIsoKst, E as testConnection, O as toKstWall, S as processJobTick, _ as hintOf, a as addHoursKst, b as mapHourly, c as asNum, d as encryptSecret, f as enqueueCollection, g as getSql, h as generateApiKey, i as ROLES, l as asString, m as formatKst, n as EXPORT_COLUMNS, o as asBool, p as ensureWeatherReady, r as HOURLY_SELECT, s as asInt, t as ASOS_STATIONS, u as cancelJob, v as latestOfficialHour, w as retryFailedChunks, x as parseKst, y as mapDaily } from "./query-helpers-Dul_CJnW.mjs";
import { a as number, n as array, o as object, r as boolean, s as string, t as _enum } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fns-DMSxgNKH.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function readRole() {
	const raw = getCookie("hub_role");
	if (raw && ROLES.includes(raw)) return raw;
	return "ADMIN";
}
function writeRole(role) {
	setCookie$1("hub_role", role, {
		path: "/",
		maxAge: 2592e3,
		sameSite: "lax"
	});
}
function assertRole(role, allowed) {
	if (!allowed.includes(role)) throw new Error("이 작업을 수행할 권한이 없습니다.");
}
/** Minimal ZIP STORE writer — no extra dependency, produces a valid XLSX. */
function crc32(buf) {
	let c = 4294967295;
	for (let i = 0; i < buf.length; i += 1) {
		c ^= buf[i];
		for (let k = 0; k < 8; k += 1) c = c >>> 1 ^ 3988292384 & -(c & 1);
	}
	return (c ^ 4294967295) >>> 0;
}
function u16(n) {
	const b = Buffer.alloc(2);
	b.writeUInt16LE(n);
	return b;
}
function u32(n) {
	const b = Buffer.alloc(4);
	b.writeUInt32LE(n);
	return b;
}
function zipStore(files) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const file of files) {
		const name = Buffer.from(file.name, "utf8");
		const crc = crc32(file.data);
		const local = Buffer.concat([
			u32(67324752),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(file.data.length),
			u32(file.data.length),
			u16(name.length),
			u16(0),
			name,
			file.data
		]);
		const central = Buffer.concat([
			u32(33639248),
			u16(20),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(file.data.length),
			u32(file.data.length),
			u16(name.length),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(0),
			u32(offset),
			name
		]);
		locals.push(local);
		centrals.push(central);
		offset += local.length;
	}
	const centralDir = Buffer.concat(centrals);
	const end = Buffer.concat([
		u32(101010256),
		u16(0),
		u16(0),
		u16(files.length),
		u16(files.length),
		u32(centralDir.length),
		u32(offset),
		u16(0)
	]);
	return Buffer.concat([
		...locals,
		centralDir,
		end
	]);
}
function xmlEscape(s) {
	return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
function workbookXlsx(sheets) {
	const sheetFiles = sheets.map((sheet, idx) => {
		const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${sheet.headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join("")}</cols>
<sheetData>${`<row r="1">${sheet.headers.map((h, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t>${xmlEscape(h)}</t></is></c>`).join("")}</row>`}${sheet.rows.map((row, r) => {
			const rr = r + 2;
			return `<row r="${rr}">${row.map((val, i) => {
				const ref = `${colName(i)}${rr}`;
				if (val === null || val === void 0 || val === "") return `<c r="${ref}"/>`;
				if (typeof val === "number" && Number.isFinite(val)) return `<c r="${ref}"><v>${val}</v></c>`;
				return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(val))}</t></is></c>`;
			}).join("")}</row>`;
		}).join("")}</sheetData>
</worksheet>`;
		return {
			name: `xl/worksheets/sheet${idx + 1}.xml`,
			data: Buffer.from(xml, "utf8")
		};
	});
	const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;
	const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`;
	const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
	const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
	return zipStore([
		{
			name: "[Content_Types].xml",
			data: Buffer.from(types, "utf8")
		},
		{
			name: "_rels/.rels",
			data: Buffer.from(rootRels, "utf8")
		},
		{
			name: "xl/workbook.xml",
			data: Buffer.from(workbook, "utf8")
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: Buffer.from(rels, "utf8")
		},
		...sheetFiles
	]);
}
function colName(index) {
	let n = index;
	let s = "";
	do {
		s = String.fromCharCode(65 + n % 26) + s;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return s;
}
async function db() {
	await ensureWeatherReady();
	return getSql();
}
async function audit(action, target, detail) {
	await (await getSql()).query(`insert into weather_audit_log (actor_role, action, target, detail) values ($1,$2,$3,$4)`, [
		readRole(),
		action,
		target,
		detail
	]);
}
var getSession_createServerFn_handler = createServerRpc({
	id: "1b071bca7e029a5cccaf189685cd97c7e458232729dd68291d936d8d5dffdc08",
	name: "getSession",
	filename: "src/lib/weather/fns.ts"
}, (opts) => getSession.__executeServer(opts));
var getSession = createServerFn({ method: "GET" }).handler(getSession_createServerFn_handler, async () => {
	await ensureWeatherReady();
	return {
		role: readRole(),
		timezone: "Asia/Seoul",
		now: formatKst(/* @__PURE__ */ new Date())
	};
});
var setSessionRole_createServerFn_handler = createServerRpc({
	id: "defd8bf2e333af08cadeea2321bb681089260de4908f8e74523ad1d651c268a9",
	name: "setSessionRole",
	filename: "src/lib/weather/fns.ts"
}, (opts) => setSessionRole.__executeServer(opts));
var setSessionRole = createServerFn({ method: "POST" }).validator(object({ role: _enum(ROLES) })).handler(setSessionRole_createServerFn_handler, async ({ data }) => {
	writeRole(data.role);
	await audit("ROLE_SWITCH", data.role, `역할 전환: ${data.role}`);
	return { role: data.role };
});
var getDashboard_createServerFn_handler = createServerRpc({
	id: "392721b5d9d00c744719a5cfcb2fe546afb3f6323382241ca64dcfbb79b5869c",
	name: "getDashboard",
	filename: "src/lib/weather/fns.ts"
}, (opts) => getDashboard.__executeServer(opts));
var getDashboard = createServerFn({ method: "GET" }).handler(getDashboard_createServerFn_handler, async () => {
	const sql = await db();
	const coverage = await sql.query(`select dataset_code,
            min(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as first_dt,
            max(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as last_dt,
            count(*)::int as records,
            count(distinct station_id)::int as stations
       from weather_observations_hourly
      group by dataset_code`);
	const dailyCov = await sql.query(`select dataset_code,
            min(observation_date)::text as first_dt,
            max(observation_date)::text as last_dt,
            count(*)::int as records,
            count(distinct station_id)::int as stations
       from weather_observations_daily
      group by dataset_code`);
	const lastJob = await sql.query(`select id, dataset_code, status, trigger_type, received_count, inserted_count, updated_count,
            to_char(completed_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as completed
       from weather_collection_jobs order by id desc limit 1`);
	const providers = await sql.query(`select provider_code, service_name, status, api_key_source, api_key_hint,
            last_test_status, last_test_message,
            to_char(last_test_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as last_test_at,
            to_char(last_collect_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as last_collect_at
       from weather_providers order by id`);
	const apiToday = await sql.query(`select count(*)::int as n from weather_api_usage where created_at >= current_date`);
	const alerts = await sql.query(`select id, severity, code, title, message, acknowledged from weather_alerts
      where acknowledged=false order by id desc limit 8`);
	const series = await sql.query(`select to_char(observation_datetime,'YYYY-MM-DD HH24:MI') as t, temperature, precipitation
       from weather_observations_hourly
      where station_id='108'
      order by observation_datetime desc limit 72`);
	const missing = await countRecentGaps(sql);
	return {
		coverage: coverage.map((r) => ({
			datasetCode: asString(r.dataset_code),
			first: asString(r.first_dt),
			last: asString(r.last_dt),
			records: asInt(r.records),
			stations: asInt(r.stations)
		})),
		dailyCoverage: dailyCov.map((r) => ({
			datasetCode: asString(r.dataset_code),
			first: asString(r.first_dt),
			last: asString(r.last_dt),
			records: asInt(r.records),
			stations: asInt(r.stations)
		})),
		lastJob: lastJob[0] ? {
			id: asInt(lastJob[0].id),
			datasetCode: asString(lastJob[0].dataset_code),
			status: asString(lastJob[0].status),
			triggerType: asString(lastJob[0].trigger_type),
			received: asInt(lastJob[0].received_count),
			inserted: asInt(lastJob[0].inserted_count),
			updated: asInt(lastJob[0].updated_count),
			completed: lastJob[0].completed ? asString(lastJob[0].completed) : null
		} : null,
		providers: providers.map((p) => ({
			code: asString(p.provider_code),
			name: asString(p.service_name),
			status: asString(p.status),
			keySource: asString(p.api_key_source),
			keyHint: p.api_key_hint ? asString(p.api_key_hint) : null,
			lastTestStatus: p.last_test_status ? asString(p.last_test_status) : null,
			lastTestMessage: p.last_test_message ? asString(p.last_test_message) : null,
			lastTestAt: p.last_test_at ? asString(p.last_test_at) : null,
			lastCollectAt: p.last_collect_at ? asString(p.last_collect_at) : null
		})),
		apiToday: apiToday[0]?.n ?? 0,
		alerts: alerts.map((a) => ({
			id: asInt(a.id),
			severity: asString(a.severity),
			title: asString(a.title),
			message: asString(a.message)
		})),
		series: series.slice().reverse().map((r) => ({
			t: asString(r.t),
			temperature: asNum(r.temperature),
			precipitation: asNum(r.precipitation)
		})),
		missingHours: missing,
		role: readRole(),
		now: formatKst(/* @__PURE__ */ new Date())
	};
});
async function countRecentGaps(sql) {
	const latest = latestOfficialHour();
	const from = addHoursKst(latest, -72);
	const have = await sql.query(`select count(*)::int as n from weather_observations_hourly
      where station_id='108' and observation_datetime >= $1::timestamp and observation_datetime <= $2::timestamp`, [from, latest]);
	const expected = Math.round((parseKst(latest).getTime() - parseKst(from).getTime()) / 36e5) + 1;
	return Math.max(0, expected - (have[0]?.n ?? 0));
}
var listStations_createServerFn_handler = createServerRpc({
	id: "a617ae3a3d25479200bcf3083d4b030e7f4d44dee0825c2c595ab94c3bb8ae04",
	name: "listStations",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listStations.__executeServer(opts));
var listStations = createServerFn({ method: "GET" }).validator(object({
	q: string().optional(),
	type: string().optional(),
	region: string().optional(),
	enabled: string().optional(),
	favorite: boolean().optional()
})).handler(listStations_createServerFn_handler, async ({ data }) => {
	return (await (await db()).query(`select id, provider, station_id, station_name, region, office, latitude, longitude, altitude,
              station_type, enabled, is_favorite
         from weather_stations
        order by station_id`)).map((r) => ({
		id: asInt(r.id),
		provider: asString(r.provider),
		stationId: asString(r.station_id),
		stationName: asString(r.station_name),
		region: r.region ? asString(r.region) : "",
		office: r.office ? asString(r.office) : "",
		latitude: asNum(r.latitude),
		longitude: asNum(r.longitude),
		altitude: asNum(r.altitude),
		stationType: asString(r.station_type),
		enabled: asBool(r.enabled),
		favorite: asBool(r.is_favorite)
	})).filter((s) => {
		if (data.q) {
			const q = data.q.toLowerCase();
			if (!s.stationId.includes(q) && !s.stationName.toLowerCase().includes(q) && !s.region.includes(q)) return false;
		}
		if (data.type && s.stationType !== data.type) return false;
		if (data.region && s.region !== data.region) return false;
		if (data.enabled === "true" && !s.enabled) return false;
		if (data.enabled === "false" && s.enabled) return false;
		if (data.favorite && !s.favorite) return false;
		return true;
	});
});
var toggleStation_createServerFn_handler = createServerRpc({
	id: "8f17deaa97ca332eac4181548d5efbcd99bb3fd1236de98b87b223bde0085ad1",
	name: "toggleStation",
	filename: "src/lib/weather/fns.ts"
}, (opts) => toggleStation.__executeServer(opts));
var toggleStation = createServerFn({ method: "POST" }).validator(object({
	stationId: string(),
	field: _enum(["enabled", "favorite"])
})).handler(toggleStation_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	const sql = await db();
	const col = data.field === "favorite" ? "is_favorite" : "enabled";
	await sql.query(`update weather_stations set ${col} = not ${col}, updated_at=now() where station_id=$1 and provider='KMA'`, [data.stationId]);
	await audit("STATION_UPDATE", data.stationId, `${data.field} 변경`);
	return { ok: true };
});
var syncStations_createServerFn_handler = createServerRpc({
	id: "b80aa31c5c826d954a4e5757bad4c58a97f50ec97d1f6e1b0e308a41ff802cbe",
	name: "syncStations",
	filename: "src/lib/weather/fns.ts"
}, (opts) => syncStations.__executeServer(opts));
var syncStations = createServerFn({ method: "POST" }).handler(syncStations_createServerFn_handler, async () => {
	assertRole(readRole(), ["ADMIN"]);
	const sql = await db();
	let upserted = 0;
	for (const st of ASOS_STATIONS) {
		await sql.query(`insert into weather_stations (provider, station_id, station_name, region, office, latitude, longitude, altitude, station_type, enabled)
       values ('KMA',$1,$2,$3,$4,$5,$6,$7,'ASOS', true)
       on conflict (provider, station_id) do update set
         station_name=excluded.station_name, region=excluded.region, office=excluded.office,
         latitude=coalesce(excluded.latitude, weather_stations.latitude),
         longitude=coalesce(excluded.longitude, weather_stations.longitude),
         altitude=coalesce(excluded.altitude, weather_stations.altitude),
         updated_at=now()`, [
			st.stationId,
			st.stationName,
			st.region,
			st.office,
			st.latitude ?? null,
			st.longitude ?? null,
			st.altitude ?? null
		]);
		upserted += 1;
	}
	await audit("STATION_SYNC", "ASOS", `${upserted}개 지점 동기화`);
	return { upserted };
});
var listDatasets_createServerFn_handler = createServerRpc({
	id: "f85ca0ee30bfc99fb415c93247006d7d600c1053c9c9331c940043b5b24564be",
	name: "listDatasets",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listDatasets.__executeServer(opts));
var listDatasets = createServerFn({ method: "GET" }).handler(listDatasets_createServerFn_handler, async () => {
	return (await (await db()).query(`select * from dataset_master order by id`)).map((r) => ({
		id: asInt(r.id),
		code: asString(r.dataset_code),
		name: asString(r.dataset_name),
		provider: asString(r.provider),
		dataKind: asString(r.data_kind),
		timeResolution: asString(r.time_resolution),
		description: r.description ? asString(r.description) : "",
		enabled: asBool(r.enabled),
		connectorId: asString(r.connector_id)
	}));
});
var listProviders_createServerFn_handler = createServerRpc({
	id: "680f3412076ee9ca4b0c925c1bd2731b61a038a1a67b2521acb7104e0f39421e",
	name: "listProviders",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listProviders.__executeServer(opts));
var listProviders = createServerFn({ method: "GET" }).handler(listProviders_createServerFn_handler, async () => {
	return (await (await db()).query(`select * from weather_providers order by id`)).map((p) => ({
		id: asInt(p.id),
		code: asString(p.provider_code),
		providerName: asString(p.provider_name),
		serviceCode: asString(p.service_code),
		serviceName: asString(p.service_name),
		baseUrl: asString(p.base_url),
		status: asString(p.status),
		keySource: asString(p.api_key_source),
		keyHint: p.api_key_hint ? asString(p.api_key_hint) : null,
		lastTestStatus: p.last_test_status ? asString(p.last_test_status) : null,
		lastTestMessage: p.last_test_message ? asString(p.last_test_message) : null,
		lastTestAt: p.last_test_at ? asString(p.last_test_at) : null,
		lastCollectAt: p.last_collect_at ? asString(p.last_collect_at) : null,
		requestsPerSecond: asInt(p.requests_per_second),
		requestsPerMinute: asInt(p.requests_per_minute),
		retryCount: asInt(p.retry_count),
		timeoutSeconds: asInt(p.timeout_seconds),
		chunkDays: asInt(p.chunk_days),
		preserveRaw: asBool(p.preserve_raw),
		rawRetentionDays: asInt(p.raw_retention_days)
	}));
});
var saveProviderKey_createServerFn_handler = createServerRpc({
	id: "41df333b82c00caee2e73c96a5b7587aecc435849f6f757313d2c641633e9c0b",
	name: "saveProviderKey",
	filename: "src/lib/weather/fns.ts"
}, (opts) => saveProviderKey.__executeServer(opts));
var saveProviderKey = createServerFn({ method: "POST" }).validator(object({
	serviceCode: string(),
	apiKey: string().min(8)
})).handler(saveProviderKey_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN"]);
	await (await db()).query(`update weather_providers
          set api_key_ciphertext=$1, api_key_hint=$2, api_key_source='DB', updated_at=now()
        where service_code=$3`, [
		encryptSecret(data.apiKey.trim()),
		hintOf(data.apiKey.trim()),
		data.serviceCode
	]);
	await audit("PROVIDER_KEY", data.serviceCode, "인증키 등록/교체 (값은 저장하지 않음)");
	return {
		ok: true,
		hint: hintOf(data.apiKey.trim())
	};
});
var saveProviderSettings_createServerFn_handler = createServerRpc({
	id: "04e19c76733aa4bd17de1e2de8022823361633ac3967f079825ec3411eef20c4",
	name: "saveProviderSettings",
	filename: "src/lib/weather/fns.ts"
}, (opts) => saveProviderSettings.__executeServer(opts));
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
})).handler(saveProviderSettings_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN"]);
	await (await db()).query(`update weather_providers set
          requests_per_second=$1, requests_per_minute=$2, retry_count=$3, timeout_seconds=$4,
          chunk_days=$5, preserve_raw=$6, raw_retention_days=$7, status=$8, updated_at=now()
        where service_code=$9`, [
		data.requestsPerSecond,
		data.requestsPerMinute,
		data.retryCount,
		data.timeoutSeconds,
		data.chunkDays,
		data.preserveRaw,
		data.rawRetentionDays,
		data.status,
		data.serviceCode
	]);
	await audit("PROVIDER_SETTINGS", data.serviceCode, "공급원 설정 변경");
	return { ok: true };
});
var runConnectionTest_createServerFn_handler = createServerRpc({
	id: "e68e47c0830029a5b29b386edc43583a7b100f262a66997a58fe16dfa37ea86d",
	name: "runConnectionTest",
	filename: "src/lib/weather/fns.ts"
}, (opts) => runConnectionTest.__executeServer(opts));
var runConnectionTest = createServerFn({ method: "POST" }).validator(object({ datasetCode: string() })).handler(runConnectionTest_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	const sql = await db();
	const result = await testConnection(sql, data.datasetCode);
	await audit("CONNECTION_TEST", data.datasetCode, result.message);
	return result;
});
var startCollection_createServerFn_handler = createServerRpc({
	id: "652dc60af6bc5ad4615fe4540482959d65d629592abf88fcb65a65781134be0b",
	name: "startCollection",
	filename: "src/lib/weather/fns.ts"
}, (opts) => startCollection.__executeServer(opts));
var startCollection = createServerFn({ method: "POST" }).validator(object({
	datasetCode: string(),
	stationIds: array(string()).min(1),
	from: string(),
	to: string()
})).handler(startCollection_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	const sql = await db();
	const job = await enqueueCollection(sql, {
		datasetCode: data.datasetCode,
		stationIds: data.stationIds,
		from: data.from,
		to: data.to,
		triggerType: "MANUAL",
		createdBy: readRole()
	});
	await audit("MANUAL_COLLECT", data.datasetCode, `${data.stationIds.join(",")} ${data.from}~${data.to}`);
	await processJobTick(sql, job.jobId);
	return job;
});
var tickJobs_createServerFn_handler = createServerRpc({
	id: "6e139cb33c085f34578bac08e2240756cb6de9d2dede0b7aadc864e4825919e4",
	name: "tickJobs",
	filename: "src/lib/weather/fns.ts"
}, (opts) => tickJobs.__executeServer(opts));
var tickJobs = createServerFn({ method: "POST" }).handler(tickJobs_createServerFn_handler, async () => {
	const sql = await db();
	return await processJobTick(sql);
});
var listJobs_createServerFn_handler = createServerRpc({
	id: "dc73334fbbb403723190edc839105389d8dac511d73fbb4dbab9032b9a548548",
	name: "listJobs",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listJobs.__executeServer(opts));
var listJobs = createServerFn({ method: "GET" }).handler(listJobs_createServerFn_handler, async () => {
	return (await (await db()).query(`select id, dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
            status, requested_count, received_count, inserted_count, updated_count, skipped_count,
            error_count, chunk_total, chunk_done, error_message, created_by,
            to_char(started_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as started_at,
            to_char(completed_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as completed_at
       from weather_collection_jobs order by id desc limit 40`)).map((r) => ({
		id: asInt(r.id),
		datasetCode: asString(r.dataset_code),
		stationId: r.station_id ? asString(r.station_id) : null,
		from: asString(r.requested_from),
		to: asString(r.requested_to),
		triggerType: asString(r.trigger_type),
		status: asString(r.status),
		received: asInt(r.received_count),
		inserted: asInt(r.inserted_count),
		updated: asInt(r.updated_count),
		skipped: asInt(r.skipped_count),
		errorCount: asInt(r.error_count),
		chunkTotal: asInt(r.chunk_total),
		chunkDone: asInt(r.chunk_done),
		errorMessage: r.error_message ? asString(r.error_message) : null,
		createdBy: r.created_by ? asString(r.created_by) : null,
		startedAt: r.started_at ? asString(r.started_at) : null,
		completedAt: r.completed_at ? asString(r.completed_at) : null
	}));
});
var getJob_createServerFn_handler = createServerRpc({
	id: "fe11700721c3e81348f3e2559ac380e10c424697859d1d95c1752c7626f16f21",
	name: "getJob",
	filename: "src/lib/weather/fns.ts"
}, (opts) => getJob.__executeServer(opts));
var getJob = createServerFn({ method: "GET" }).validator(object({ id: number() })).handler(getJob_createServerFn_handler, async ({ data }) => {
	const sql = await db();
	const jobs = await sql.query(`select * from weather_collection_jobs where id=$1`, [data.id]);
	const chunks = await sql.query(`select id, station_id, chunk_from, chunk_to, status, received_count, inserted_count, updated_count, skipped_count, error_message
         from weather_collection_chunks where job_id=$1 order by id`, [data.id]);
	const job = jobs[0];
	if (!job) return null;
	return {
		id: asInt(job.id),
		status: asString(job.status),
		datasetCode: asString(job.dataset_code),
		chunkTotal: asInt(job.chunk_total),
		chunkDone: asInt(job.chunk_done),
		received: asInt(job.received_count),
		inserted: asInt(job.inserted_count),
		updated: asInt(job.updated_count),
		skipped: asInt(job.skipped_count),
		errorCount: asInt(job.error_count),
		errorMessage: job.error_message ? asString(job.error_message) : null,
		chunks: chunks.map((c) => ({
			id: asInt(c.id),
			stationId: asString(c.station_id),
			from: asString(c.chunk_from),
			to: asString(c.chunk_to),
			status: asString(c.status),
			received: asInt(c.received_count),
			inserted: asInt(c.inserted_count),
			errorMessage: c.error_message ? asString(c.error_message) : null
		}))
	};
});
var retryJob_createServerFn_handler = createServerRpc({
	id: "9bd579d0c87e30b472efd86a790df69dfda68fae3efc8e271a159ad0124f373a",
	name: "retryJob",
	filename: "src/lib/weather/fns.ts"
}, (opts) => retryJob.__executeServer(opts));
var retryJob = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(retryJob_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	const sql = await db();
	await retryFailedChunks(sql, data.id);
	await audit("RETRY_COLLECT", String(data.id), "실패 구간 재시도");
	await processJobTick(sql, data.id);
	return { ok: true };
});
var cancelCollection_createServerFn_handler = createServerRpc({
	id: "c140d3c3d8df380296b3112fa945e43121011e96c24c20dad1c8dca92fa24aa4",
	name: "cancelCollection",
	filename: "src/lib/weather/fns.ts"
}, (opts) => cancelCollection.__executeServer(opts));
var cancelCollection = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(cancelCollection_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	const sql = await db();
	await cancelJob(sql, data.id);
	await audit("CANCEL_COLLECT", String(data.id), "수집 취소");
	return { ok: true };
});
var listSchedules_createServerFn_handler = createServerRpc({
	id: "4983be31f881e7d55181b8116b61063d4a2dbcff1dcfb0c6e76736982f7ca9cf",
	name: "listSchedules",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listSchedules.__executeServer(opts));
var listSchedules = createServerFn({ method: "GET" }).handler(listSchedules_createServerFn_handler, async () => {
	return (await (await db()).query(`select * from weather_schedules order by id`)).map((r) => ({
		id: asInt(r.id),
		datasetCode: asString(r.dataset_code),
		enabled: asBool(r.enabled),
		cadence: asString(r.cadence),
		lookbackHours: asInt(r.lookback_hours),
		stationScope: asString(r.station_scope),
		lastRunAt: r.last_run_at ? asString(r.last_run_at) : null,
		lastStatus: r.last_status ? asString(r.last_status) : null
	}));
});
var saveSchedule_createServerFn_handler = createServerRpc({
	id: "0481a2e9946cde504c048a2778b0f487ec77b6befa6735eb2bd722ef7e0b4ef4",
	name: "saveSchedule",
	filename: "src/lib/weather/fns.ts"
}, (opts) => saveSchedule.__executeServer(opts));
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
})).handler(saveSchedule_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN", "DATA_MANAGER"]);
	await (await db()).query(`update weather_schedules set enabled=$2, cadence=$3, lookback_hours=$4, station_scope=$5, updated_at=now() where id=$1`, [
		data.id,
		data.enabled,
		data.cadence,
		data.lookbackHours,
		data.stationScope
	]);
	await audit("SCHEDULE", String(data.id), `자동수집 ${data.enabled ? "ON" : "OFF"} / ${data.cadence}`);
	return { ok: true };
});
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
var queryHourly_createServerFn_handler = createServerRpc({
	id: "5d6a53aba490f244bcd7dcdc03301dca15edba7fb962da30e28c6e5af0983ad8",
	name: "queryHourly",
	filename: "src/lib/weather/fns.ts"
}, (opts) => queryHourly.__executeServer(opts));
var queryHourly = createServerFn({ method: "GET" }).validator(queryInput).handler(queryHourly_createServerFn_handler, async ({ data }) => {
	const sql = await db();
	const stationId = data.stationId || "108";
	const to = toKstWall(data.to || latestOfficialHour());
	const from = toKstWall(data.from || addHoursKst(to, -48));
	const where = [
		`o.station_id = $1`,
		`o.observation_datetime >= $2::timestamp`,
		`o.observation_datetime <= $3::timestamp`
	];
	const params = [
		stationId,
		from,
		to
	];
	if (data.rainOnly) where.push(`o.precipitation is not null and o.precipitation > 0`);
	if (data.tempMin !== void 0) {
		params.push(data.tempMin);
		where.push(`o.temperature >= $${params.length}`);
	}
	if (data.tempMax !== void 0) {
		params.push(data.tempMax);
		where.push(`o.temperature <= $${params.length}`);
	}
	const whereSql = where.join(" and ");
	const total = await sql.query(`select count(*)::int as n from weather_observations_hourly o where ${whereSql}`, params);
	params.push(data.pageSize, (data.page - 1) * data.pageSize);
	const rows = await sql.query(`select ${HOURLY_SELECT}
         from weather_observations_hourly o
         left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
        where ${whereSql}
        order by o.observation_datetime desc
        limit $${params.length - 1} offset $${params.length}`, params);
	return {
		total: total[0]?.n ?? 0,
		page: data.page,
		pageSize: data.pageSize,
		from,
		to,
		stationId,
		rows: rows.map((r) => mapHourly(r))
	};
});
var queryDaily_createServerFn_handler = createServerRpc({
	id: "b5dde76c1f5328affe02935b2817b909904bae4e310140d1f10f1772f65e0113",
	name: "queryDaily",
	filename: "src/lib/weather/fns.ts"
}, (opts) => queryDaily.__executeServer(opts));
var queryDaily = createServerFn({ method: "GET" }).validator(queryInput).handler(queryDaily_createServerFn_handler, async ({ data }) => {
	const sql = await db();
	const stationId = data.stationId || "108";
	const to = toKstWall(data.to || latestOfficialHour()).slice(0, 10);
	const from = toKstWall(data.from || addHoursKst(`${to} 00:00:00`, -720)).slice(0, 10);
	const total = await sql.query(`select count(*)::int as n from weather_observations_daily
        where station_id=$1 and observation_date >= $2::date and observation_date <= $3::date
          and source_kind='OFFICIAL'`, [
		stationId,
		from,
		to
	]);
	const rows = await sql.query(`select d.*, s.station_name, d.observation_date::text as observation_date
         from weather_observations_daily d
         left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
        where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
          and d.source_kind='OFFICIAL'
        order by d.observation_date desc
        limit $4 offset $5`, [
		stationId,
		from,
		to,
		data.pageSize,
		(data.page - 1) * data.pageSize
	]);
	return {
		total: total[0]?.n ?? 0,
		page: data.page,
		pageSize: data.pageSize,
		from,
		to,
		stationId,
		rows: rows.map((r) => mapDaily(r))
	};
});
var findGaps_createServerFn_handler = createServerRpc({
	id: "3ec138adb9777cfbad4413ab435dfe74f24a6fb6c5190290caf22fe2279806c8",
	name: "findGaps",
	filename: "src/lib/weather/fns.ts"
}, (opts) => findGaps.__executeServer(opts));
var findGaps = createServerFn({ method: "GET" }).validator(object({
	stationId: string(),
	from: string(),
	to: string()
})).handler(findGaps_createServerFn_handler, async ({ data }) => {
	const rows = await (await db()).query(`select to_char(observation_datetime,'YYYY-MM-DD HH24:MI:SS') as observation_datetime
         from weather_observations_hourly
        where station_id=$1 and observation_datetime >= $2::timestamp and observation_datetime <= $3::timestamp
        order by observation_datetime`, [
		data.stationId,
		data.from,
		data.to
	]);
	const have = new Set(rows.map((r) => r.observation_datetime));
	const missing = [];
	let cursor = data.from.length === 10 ? `${data.from} 00:00:00` : data.from;
	const end = data.to.length === 10 ? `${data.to} 23:00:00` : data.to;
	let guard = 0;
	while (parseKst(cursor).getTime() <= parseKst(end).getTime() && guard < 4e3) {
		if (!have.has(cursor)) missing.push(cursor);
		cursor = addHoursKst(cursor, 1);
		guard += 1;
	}
	return {
		missing,
		expected: guard,
		have: have.size
	};
});
var listApiClients_createServerFn_handler = createServerRpc({
	id: "0ee4a5c15acfc20053924310da333e0b3d159f47fdc39a6b3a70c2817d40c904",
	name: "listApiClients",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listApiClients.__executeServer(opts));
var listApiClients = createServerFn({ method: "GET" }).handler(listApiClients_createServerFn_handler, async () => {
	return (await (await db()).query(`select id, name, client_code, key_prefix, status, scopes, created_at, last_used_at, revoked_at
       from weather_api_clients order by id`)).map((r) => ({
		id: asInt(r.id),
		name: asString(r.name),
		code: asString(r.client_code),
		prefix: asString(r.key_prefix),
		status: asString(r.status),
		scopes: asString(r.scopes),
		createdAt: asString(r.created_at),
		lastUsedAt: r.last_used_at ? asString(r.last_used_at) : null
	}));
});
var createApiClient_createServerFn_handler = createServerRpc({
	id: "60a407ca56727379582417abe0272ea867216d41864985389fa35b4d97239e7f",
	name: "createApiClient",
	filename: "src/lib/weather/fns.ts"
}, (opts) => createApiClient.__executeServer(opts));
var createApiClient = createServerFn({ method: "POST" }).validator(object({
	name: string().min(2),
	code: string().min(2)
})).handler(createApiClient_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN"]);
	const sql = await db();
	const key = generateApiKey();
	const row = await sql.query(`insert into weather_api_clients (name, client_code, key_prefix, key_hash, status, scopes, created_by)
       values ($1,$2,$3,$4,'ACTIVE','READ_WEATHER',$5) returning id`, [
		data.name,
		data.code.toUpperCase(),
		key.prefix,
		key.hash,
		readRole()
	]);
	await audit("API_KEY_ISSUE", data.code, "내부 API 키 발급 (전문은 저장하지 않음)");
	return {
		id: row[0].id,
		plaintext: key.plaintext,
		prefix: key.prefix
	};
});
var revokeApiClient_createServerFn_handler = createServerRpc({
	id: "2df184140f2477ff6713868c6bcd2e3249b75850c0fb04198af6ad4367010255",
	name: "revokeApiClient",
	filename: "src/lib/weather/fns.ts"
}, (opts) => revokeApiClient.__executeServer(opts));
var revokeApiClient = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(revokeApiClient_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), ["ADMIN"]);
	await (await db()).query(`update weather_api_clients set status='REVOKED', revoked_at=now() where id=$1`, [data.id]);
	await audit("API_KEY_REVOKE", String(data.id), "내부 API 키 폐기");
	return { ok: true };
});
var listApiUsage_createServerFn_handler = createServerRpc({
	id: "43e23928ed767af2e4bd71bb0320484855a46c0d66d448893412caaa4b4c37fe",
	name: "listApiUsage",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listApiUsage.__executeServer(opts));
var listApiUsage = createServerFn({ method: "GET" }).handler(listApiUsage_createServerFn_handler, async () => {
	return (await (await db()).query(`select id, client_name, method, path, status_code, result_count, duration_ms,
            to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as created_at
       from weather_api_usage order by id desc limit 80`)).map((r) => ({
		id: asInt(r.id),
		client: r.client_name ? asString(r.client_name) : "unknown",
		method: asString(r.method),
		path: asString(r.path),
		status: asInt(r.status_code),
		count: r.result_count === null ? null : asInt(r.result_count),
		ms: r.duration_ms === null ? null : asInt(r.duration_ms),
		at: asString(r.created_at)
	}));
});
var listAudit_createServerFn_handler = createServerRpc({
	id: "6879624f8b5ad03bf1a523b1569fec01f8d847891e9d60bec0ea5c7e6bb0264c",
	name: "listAudit",
	filename: "src/lib/weather/fns.ts"
}, (opts) => listAudit.__executeServer(opts));
var listAudit = createServerFn({ method: "GET" }).handler(listAudit_createServerFn_handler, async () => {
	return (await (await db()).query(`select id, actor_role, action, target, detail,
            to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as created_at
       from weather_audit_log order by id desc limit 80`)).map((r) => ({
		id: asInt(r.id),
		role: r.actor_role ? asString(r.actor_role) : "",
		action: asString(r.action),
		target: r.target ? asString(r.target) : "",
		detail: r.detail ? asString(r.detail) : "",
		at: asString(r.created_at)
	}));
});
var getHealth_createServerFn_handler = createServerRpc({
	id: "05e4c8ef715547da41155bfbdaff9841d18b02ba8293b2cd39225f86cb8b6566",
	name: "getHealth",
	filename: "src/lib/weather/fns.ts"
}, (opts) => getHealth.__executeServer(opts));
var getHealth = createServerFn({ method: "GET" }).handler(getHealth_createServerFn_handler, async () => {
	const sql = await db();
	const hourly = await sql.query(`select count(*)::int as n, max(to_char(observation_datetime,'YYYY-MM-DD HH24:MI')) as last
       from weather_observations_hourly`);
	const jobs = await sql.query(`select count(*)::int as n from weather_collection_jobs where status='FAILED' and created_at > now() - interval '7 days'`);
	return {
		ok: true,
		timezone: "Asia/Seoul",
		db: "ok",
		hourlyRecords: hourly[0]?.n ?? 0,
		latestHourly: hourly[0]?.last ?? null,
		failedJobs7d: jobs[0]?.n ?? 0,
		latestOfficial: latestOfficialHour()
	};
});
var acknowledgeAlert_createServerFn_handler = createServerRpc({
	id: "d28de011dcdb51b6dafcde540652c17b392fabc80534d99a820c69d153233052",
	name: "acknowledgeAlert",
	filename: "src/lib/weather/fns.ts"
}, (opts) => acknowledgeAlert.__executeServer(opts));
var acknowledgeAlert = createServerFn({ method: "POST" }).validator(object({ id: number() })).handler(acknowledgeAlert_createServerFn_handler, async ({ data }) => {
	await (await db()).query(`update weather_alerts set acknowledged=true where id=$1`, [data.id]);
	return { ok: true };
});
var exportColumns_createServerFn_handler = createServerRpc({
	id: "1a824f36c1f8f93522995f5dfc1a8c95c951ea9f09a7c4da642f9b4e95f68e55",
	name: "exportColumns",
	filename: "src/lib/weather/fns.ts"
}, (opts) => exportColumns.__executeServer(opts));
var exportColumns = createServerFn({ method: "GET" }).handler(exportColumns_createServerFn_handler, async () => {
	return EXPORT_COLUMNS;
});
var startExport_createServerFn_handler = createServerRpc({
	id: "3e00184a40b696ebcd2afd738bfc49f2916d003b764efb7addd2628ff2a0b18f",
	name: "startExport",
	filename: "src/lib/weather/fns.ts"
}, (opts) => startExport.__executeServer(opts));
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
})).handler(startExport_createServerFn_handler, async ({ data }) => {
	assertRole(readRole(), [
		"ADMIN",
		"DATA_MANAGER",
		"VIEWER"
	]);
	const sql = await db();
	const stationName = (await sql.query(`select station_name from weather_stations where station_id=$1`, [data.stationId]))[0]?.station_name ?? data.stationId;
	let records = [];
	if (data.kind === "hourly") records = await sql.query(`select ${HOURLY_SELECT}
           from weather_observations_hourly o
           left join weather_stations s on s.provider=o.provider and s.station_id=o.station_id
          where o.station_id=$1 and o.observation_datetime >= $2::timestamp and o.observation_datetime <= $3::timestamp
          order by o.observation_datetime`, [
		data.stationId,
		data.from,
		data.to
	]);
	else records = await sql.query(`select d.*, s.station_name, d.observation_date::text as observation_date
           from weather_observations_daily d
           left join weather_stations s on s.provider=d.provider and s.station_id=d.station_id
          where d.station_id=$1 and d.observation_date >= $2::date and d.observation_date <= $3::date
            and d.source_kind='OFFICIAL'
          order by d.observation_date`, [
		data.stationId,
		data.from.slice(0, 10),
		data.to.slice(0, 10)
	]);
	const mapped = records.map((r) => ({
		observation_datetime: asString(r.observation_datetime),
		observation_date: r.observation_date ? asString(r.observation_date).slice(0, 10) : asString(r.observation_datetime).slice(0, 10),
		station_id: asString(r.station_id),
		station_name: asString(r.station_name),
		temperature: asNum(r.temperature),
		avg_temperature: asNum(r.avg_temperature),
		min_temperature: asNum(r.min_temperature),
		max_temperature: asNum(r.max_temperature),
		precipitation: asNum(r.precipitation),
		humidity: asNum(r.humidity),
		avg_humidity: asNum(r.avg_humidity),
		wind_speed: asNum(r.wind_speed),
		wind_direction: r.wind_direction === null ? null : asInt(r.wind_direction),
		avg_wind_speed: asNum(r.avg_wind_speed),
		pressure: asNum(r.pressure),
		sunshine: asNum(r.sunshine),
		sunshine_hours: asNum(r.sunshine_hours),
		solar_radiation: asNum(r.solar_radiation),
		snow_depth: asNum(r.snow_depth),
		visibility: r.visibility === null || r.visibility === void 0 ? null : asInt(r.visibility),
		quality_temperature: r.quality_temperature ? asString(r.quality_temperature) : null
	}));
	const cols = data.columns;
	const headers = cols.map((c) => EXPORT_COLUMNS.find((x) => x.key === c)?.label ?? c);
	const meta = [
		["데이터 출처", "기상청(KMA) · 기상허브 표준화"],
		["Dataset", data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY"],
		["관측지점", `${data.stationId} ${stationName}`],
		["조회기간", `${data.from} ~ ${data.to}`],
		["시간대", "Asia/Seoul"],
		["생성일시", formatKst(/* @__PURE__ */ new Date())],
		["건수", String(mapped.length)],
		["참고", "NULL은 결측이며 0과 다릅니다. 공식 일자료와 시간자료 집계는 별개입니다."]
	];
	const fileName = `weather-${data.kind}-${data.stationId}-${data.from.slice(0, 10)}.${data.format.toLowerCase()}`;
	let bytes;
	let mime;
	if (data.format === "JSON") {
		const payload = {
			source: "KMA",
			dataset: data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY",
			timezone: "Asia/Seoul",
			station: {
				id: data.stationId,
				name: stationName
			},
			period: {
				from: data.from,
				to: data.to
			},
			generatedAt: toIsoKst(formatKst(/* @__PURE__ */ new Date())),
			count: mapped.length,
			data: mapped.map((row) => {
				const o = {};
				for (const c of cols) o[c] = row[c];
				return o;
			})
		};
		bytes = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
		mime = "application/json";
	} else if (data.format === "CSV") {
		const lines = [
			`# 데이터 출처: 기상청(KMA)`,
			`# Dataset: ${data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY"}`,
			`# 관측지점: ${data.stationId} ${stationName}`,
			`# 조회기간: ${data.from} ~ ${data.to}`,
			`# 시간대: Asia/Seoul`,
			`# 생성일시: ${formatKst(/* @__PURE__ */ new Date())}`,
			headers.join(","),
			...mapped.map((row) => cols.map((c) => {
				const v = row[c];
				if (v === null || v === void 0) return "";
				const s = String(v);
				return /[",\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
			}).join(","))
		];
		bytes = Buffer.from(`\uFEFF${lines.join("\n")}`, "utf8");
		mime = "text/csv; charset=utf-8";
	} else {
		bytes = workbookXlsx([{
			name: "metadata",
			headers: ["항목", "값"],
			rows: meta
		}, {
			name: "data",
			headers,
			rows: mapped.map((row) => cols.map((c) => row[c]))
		}]);
		mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	}
	const inserted = await sql.query(`insert into weather_export_jobs (format, dataset_code, filters_json, columns_json, status, row_count, file_bytes, file_name, created_by, completed_at)
       values ($1,$2,$3,$4,'COMPLETED',$5,$6,$7,$8, now()) returning id`, [
		data.format,
		data.kind === "hourly" ? "ASOS_HOURLY" : "ASOS_DAILY",
		JSON.stringify({
			stationId: data.stationId,
			from: data.from,
			to: data.to
		}),
		JSON.stringify(cols),
		mapped.length,
		bytes,
		fileName,
		readRole()
	]);
	await audit("EXPORT", data.format, `${fileName} ${mapped.length}건`);
	return {
		id: inserted[0].id,
		fileName,
		mime,
		base64: bytes.toString("base64"),
		rowCount: mapped.length
	};
});
//#endregion
export { acknowledgeAlert_createServerFn_handler, cancelCollection_createServerFn_handler, createApiClient_createServerFn_handler, exportColumns_createServerFn_handler, findGaps_createServerFn_handler, getDashboard_createServerFn_handler, getHealth_createServerFn_handler, getJob_createServerFn_handler, getSession_createServerFn_handler, listApiClients_createServerFn_handler, listApiUsage_createServerFn_handler, listAudit_createServerFn_handler, listDatasets_createServerFn_handler, listJobs_createServerFn_handler, listProviders_createServerFn_handler, listSchedules_createServerFn_handler, listStations_createServerFn_handler, queryDaily_createServerFn_handler, queryHourly_createServerFn_handler, retryJob_createServerFn_handler, revokeApiClient_createServerFn_handler, runConnectionTest_createServerFn_handler, saveProviderKey_createServerFn_handler, saveProviderSettings_createServerFn_handler, saveSchedule_createServerFn_handler, setSessionRole_createServerFn_handler, startCollection_createServerFn_handler, startExport_createServerFn_handler, syncStations_createServerFn_handler, tickJobs_createServerFn_handler, toggleStation_createServerFn_handler };
