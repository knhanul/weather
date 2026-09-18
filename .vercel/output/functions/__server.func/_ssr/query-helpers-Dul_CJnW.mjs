import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
//#region node_modules/.nitro/vite/services/ssr/assets/query-helpers-Dul_CJnW.js
var _0002_weather_hub_default = "-- Weather Data Hub schema. Observations are unowned shared records.\n-- Observation vs forecast are separate tables / dataset kinds. Never mix.\n\ncreate table if not exists dataset_master (\n  id serial primary key,\n  dataset_code text not null unique,\n  dataset_name text not null,\n  provider text not null,\n  data_kind text not null check (data_kind in ('OBSERVATION', 'FORECAST')),\n  data_type text not null,\n  time_resolution text not null,\n  description text,\n  connector_id text not null,\n  enabled boolean not null default true,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists weather_providers (\n  id serial primary key,\n  provider_code text not null unique,\n  provider_name text not null,\n  service_code text not null,\n  service_name text not null,\n  base_url text not null,\n  status text not null default 'ENABLED' check (status in ('ENABLED', 'DISABLED')),\n  api_key_ciphertext text,\n  api_key_hint text,\n  api_key_source text not null default 'NONE' check (api_key_source in ('NONE', 'ENV', 'DB')),\n  last_test_at timestamptz,\n  last_test_status text,\n  last_test_message text,\n  last_collect_at timestamptz,\n  requests_per_second integer not null default 2,\n  requests_per_minute integer not null default 60,\n  max_parallel_requests integer not null default 1,\n  retry_count integer not null default 3,\n  timeout_seconds integer not null default 20,\n  chunk_days integer not null default 7,\n  preserve_raw boolean not null default true,\n  raw_retention_days integer not null default 30,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists weather_stations (\n  id serial primary key,\n  provider text not null,\n  station_id text not null,\n  station_name text not null,\n  region text,\n  office text,\n  latitude double precision,\n  longitude double precision,\n  altitude double precision,\n  station_type text not null,\n  active_from date,\n  active_to date,\n  enabled boolean not null default true,\n  is_favorite boolean not null default false,\n  metadata_json text,\n  updated_at timestamptz not null default now(),\n  unique (provider, station_id)\n);\n\ncreate index if not exists weather_stations_name_idx on weather_stations (station_name);\ncreate index if not exists weather_stations_type_idx on weather_stations (station_type);\ncreate index if not exists weather_stations_region_idx on weather_stations (region);\n\ncreate table if not exists weather_collection_jobs (\n  id serial primary key,\n  dataset_code text not null,\n  provider text not null,\n  station_id text,\n  requested_from text not null,\n  requested_to text not null,\n  trigger_type text not null check (trigger_type in ('MANUAL', 'SCHEDULED', 'RETRY', 'SEED')),\n  started_at timestamptz,\n  completed_at timestamptz,\n  requested_count integer not null default 0,\n  received_count integer not null default 0,\n  inserted_count integer not null default 0,\n  updated_count integer not null default 0,\n  skipped_count integer not null default 0,\n  error_count integer not null default 0,\n  chunk_total integer not null default 0,\n  chunk_done integer not null default 0,\n  status text not null default 'PENDING'\n    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED')),\n  error_message text,\n  created_by text,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists weather_jobs_status_idx on weather_collection_jobs (status, created_at desc);\n\ncreate table if not exists weather_collection_chunks (\n  id serial primary key,\n  job_id integer not null references weather_collection_jobs(id) on delete cascade,\n  station_id text not null,\n  chunk_from text not null,\n  chunk_to text not null,\n  status text not null default 'PENDING'\n    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),\n  received_count integer not null default 0,\n  inserted_count integer not null default 0,\n  updated_count integer not null default 0,\n  skipped_count integer not null default 0,\n  error_message text,\n  attempt_count integer not null default 0,\n  started_at timestamptz,\n  completed_at timestamptz\n);\n\ncreate index if not exists weather_chunks_job_idx on weather_collection_chunks (job_id, status);\n\ncreate table if not exists weather_raw_imports (\n  id serial primary key,\n  provider text not null,\n  dataset_code text not null,\n  job_id integer references weather_collection_jobs(id) on delete set null,\n  requested_from text,\n  requested_to text,\n  station_id text,\n  request_parameters_json text,\n  response_raw text,\n  response_format text,\n  received_at timestamptz not null default now(),\n  checksum text,\n  status text not null default 'OK',\n  unknown_fields_json text\n);\n\ncreate index if not exists weather_raw_received_idx on weather_raw_imports (received_at desc);\n\ncreate table if not exists weather_observations_hourly (\n  id serial primary key,\n  provider text not null,\n  dataset_code text not null,\n  station_id text not null,\n  observation_datetime timestamp not null,\n  timezone text not null default 'Asia/Seoul',\n  temperature double precision,\n  temperature_qc text,\n  precipitation double precision,\n  precipitation_qc text,\n  humidity double precision,\n  humidity_qc text,\n  wind_speed double precision,\n  wind_speed_qc text,\n  wind_direction integer,\n  wind_direction_qc text,\n  pressure double precision,\n  pressure_qc text,\n  sea_level_pressure double precision,\n  sea_level_pressure_qc text,\n  sunshine double precision,\n  sunshine_qc text,\n  solar_radiation double precision,\n  snow_depth double precision,\n  snow_3hour double precision,\n  visibility integer,\n  cloud_cover double precision,\n  low_mid_cloud_cover double precision,\n  cloud_type text,\n  ceiling integer,\n  ground_temperature double precision,\n  ground_temperature_qc text,\n  vapor_pressure double precision,\n  dew_point double precision,\n  weather_phenomenon_code text,\n  soil_temp_5cm double precision,\n  soil_temp_10cm double precision,\n  soil_temp_20cm double precision,\n  soil_temp_30cm double precision,\n  quality_temperature text,\n  quality_precipitation text,\n  quality_humidity text,\n  quality_wind text,\n  quality_pressure text,\n  source_import_id integer references weather_raw_imports(id) on delete set null,\n  collection_job_id integer references weather_collection_jobs(id) on delete set null,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  unique (provider, dataset_code, station_id, observation_datetime)\n);\n\ncreate index if not exists weather_hourly_station_time_idx\n  on weather_observations_hourly (station_id, observation_datetime desc);\ncreate index if not exists weather_hourly_time_idx\n  on weather_observations_hourly (observation_datetime desc);\n\ncreate table if not exists weather_observations_daily (\n  id serial primary key,\n  provider text not null,\n  dataset_code text not null,\n  station_id text not null,\n  observation_date date not null,\n  timezone text not null default 'Asia/Seoul',\n  avg_temperature double precision,\n  min_temperature double precision,\n  max_temperature double precision,\n  precipitation double precision,\n  avg_humidity double precision,\n  min_humidity double precision,\n  snow_depth double precision,\n  snow_fresh double precision,\n  sunshine_hours double precision,\n  solar_radiation double precision,\n  avg_wind_speed double precision,\n  max_wind_speed double precision,\n  avg_pressure double precision,\n  source_kind text not null default 'OFFICIAL'\n    check (source_kind in ('OFFICIAL', 'AGGREGATED_HOURLY')),\n  source_import_id integer references weather_raw_imports(id) on delete set null,\n  collection_job_id integer references weather_collection_jobs(id) on delete set null,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  unique (provider, dataset_code, station_id, observation_date, source_kind)\n);\n\ncreate index if not exists weather_daily_station_date_idx\n  on weather_observations_daily (station_id, observation_date desc);\n\ncreate table if not exists weather_schedules (\n  id serial primary key,\n  dataset_code text not null,\n  enabled boolean not null default false,\n  cadence text not null default 'HOURLY' check (cadence in ('HOURLY', 'DAILY')),\n  lookback_hours integer not null default 3,\n  station_scope text not null default 'FAVORITES' check (station_scope in ('FAVORITES', 'ENABLED', 'ALL')),\n  last_run_at timestamptz,\n  last_status text,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists weather_api_clients (\n  id serial primary key,\n  name text not null,\n  client_code text not null unique,\n  key_prefix text not null,\n  key_hash text not null unique,\n  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),\n  scopes text not null default 'READ_WEATHER',\n  created_at timestamptz not null default now(),\n  last_used_at timestamptz,\n  revoked_at timestamptz,\n  created_by text\n);\n\ncreate table if not exists weather_api_usage (\n  id serial primary key,\n  client_id integer references weather_api_clients(id) on delete set null,\n  client_name text,\n  method text not null,\n  path text not null,\n  status_code integer not null,\n  result_count integer,\n  duration_ms integer,\n  error_code text,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists weather_api_usage_created_idx on weather_api_usage (created_at desc);\n\ncreate table if not exists weather_audit_log (\n  id serial primary key,\n  actor_role text,\n  action text not null,\n  target text,\n  detail text,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists weather_audit_created_idx on weather_audit_log (created_at desc);\n\ncreate table if not exists weather_alerts (\n  id serial primary key,\n  severity text not null check (severity in ('INFO', 'WARN', 'ERROR')),\n  code text not null,\n  title text not null,\n  message text not null,\n  acknowledged boolean not null default false,\n  created_at timestamptz not null default now()\n);\n\ncreate table if not exists weather_export_jobs (\n  id serial primary key,\n  format text not null check (format in ('CSV', 'XLSX', 'JSON')),\n  dataset_code text not null,\n  filters_json text not null,\n  columns_json text not null,\n  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),\n  row_count integer,\n  file_bytes bytea,\n  file_name text,\n  error_message text,\n  created_by text,\n  created_at timestamptz not null default now(),\n  completed_at timestamptz\n);\n\ncreate table if not exists app_settings (\n  key text primary key,\n  value text not null,\n  updated_at timestamptz not null default now()\n);\n";
/**
* Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
* (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
*
* Applied files are keyed by BASENAME, so the same file applies once no matter
* which directory it is globbed from. That is what makes the auth schema safe to
* copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
* a database that already has `0001_auth.sql` will not re-run it.
*
* Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
* out of scope for both until it is copied up.
*/
/**
* The `_migrations` key for a migration path (or bare filename).
* @param {string} path
* @returns {string}
*/
function migrationName(path) {
	return path.split("/").pop() ?? path;
}
/**
* @param {string} path
* @returns {boolean}
*/
function isMigrationFile(path) {
	return path.endsWith(".sql");
}
/**
* Migrations in `paths` that are not yet in `applied`, in apply order.
* Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
* @param {Iterable<string>} paths
* @param {Iterable<string>} applied
* @returns {Array<{ name: string, path: string }>}
*/
function pendingMigrations(paths, applied) {
	const done = new Set(applied);
	return [...paths].filter(isMigrationFile).map((path) => ({
		name: migrationName(path),
		path
	})).sort((a, b) => a.name.localeCompare(b.name)).filter(({ name }) => !done.has(name));
}
var rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : void 0;
var databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : void 0;
/**
* Active backend: real **Neon** when `DATABASE_URL` is set (deployed / configured
* sandbox), otherwise a local embedded **PGLite** (Postgres compiled to WASM) so
* the app has a working database even with nothing configured — the live preview
* included. Swap in Neon later by just setting `DATABASE_URL`; no code changes.
*/
var dbSource = databaseUrl ? "neon" : "pglite";
/**
* Init state lives on globalThis as promises: dev HMR creates new instances of
* this module, and two instances racing module-level state would open a second
* pool or run two concurrent PGLite migration passes (whose duplicate
* `_migrations` insert rejects — and would get memoized, poisoning every later
* `getSql()`). A failed init clears its slot so the next call retries.
*/
var globalRef = globalThis;
/**
* Result-type parity: Postgres sends every value as text plus a type OID — the
* JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
* int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
* JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
* production return identical, JSON-safe shapes:
*   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
*                                   `::text` if you ever need huge integers)
*   date                         -> 'YYYY-MM-DD' string
*   interval                     -> Postgres interval text
* numeric already comes back as a string on both (arbitrary precision).
*/
var OID_INT8 = 20;
var OID_DATE = 1082;
var OID_INTERVAL = 1186;
var identity = (v) => v;
/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run) {
	const sql = (async (strings, ...values) => {
		let text = strings[0];
		for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
		return run(text, values);
	});
	sql.query = (text, params = []) => run(text, params);
	return sql;
}
function createNeonSql() {
	globalRef.__pgSqlPromise__ ??= (async () => {
		const { Pool, types } = await import("../_libs/pg.mjs").then((n) => n.t);
		types.setTypeParser(OID_INT8, Number);
		types.setTypeParser(OID_DATE, identity);
		types.setTypeParser(OID_INTERVAL, identity);
		const pool = new Pool({ connectionString: databaseUrl });
		return toSql(async (text, params) => {
			return (await pool.query(text, params)).rows;
		});
	})().catch((err) => {
		globalRef.__pgSqlPromise__ = void 0;
		throw err;
	});
	return globalRef.__pgSqlPromise__;
}
async function createPgliteSql() {
	globalRef.__pgliteInstance__ ??= (async () => {
		const { PGlite } = await import("../_libs/electric-sql__pglite.mjs").then((n) => n.t);
		const pg = new PGlite({ parsers: {
			[OID_INT8]: Number,
			[OID_DATE]: identity,
			[OID_INTERVAL]: identity
		} });
		await pg.waitReady;
		await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
		return pg;
	})().catch((err) => {
		globalRef.__pgliteInstance__ = void 0;
		throw err;
	});
	const pg = await globalRef.__pgliteInstance__;
	const migrate = async () => {
		const migrations = /* #__PURE__ */ Object.assign({ "/migrations/0002_weather_hub.sql": _0002_weather_hub_default });
		const done = (await pg.query("select name from _migrations")).rows.map((r) => r.name);
		for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) await pg.transaction(async (tx) => {
			await tx.exec(migrations[path]);
			await tx.query("insert into _migrations (name) values ($1)", [name]);
		});
	};
	const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve()).catch(() => void 0).then(migrate);
	globalRef.__pgliteMigrateChain__ = pass;
	await pass;
	return toSql(async (text, params) => {
		return (await pg.query(text, params)).rows;
	});
}
var sqlPromise = null;
async function createSql() {
	if (typeof window !== "undefined") throw new Error("@/lib/db is server-only — call getSql() from a createServerFn handler or a server route loader, never from client code.");
	return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}
/**
* Get the shared, **server-only** SQL client. Neon when `DATABASE_URL` is set,
* otherwise the local PGLite fallback. Memoized — safe to call per request.
*
* Schema comes from `migrations/*.sql`, auto-applied before the first query on
* both backends — define tables there, never inline in server functions.
*/
function getSql() {
	sqlPromise ??= createSql().catch((err) => {
		sqlPromise = null;
		throw err;
	});
	return sqlPromise;
}
/**
* Finish DB bootstrap before the server handles traffic.
*
* - **PGLite** (preview / no `DATABASE_URL`): open the in-memory DB and apply
*   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
* - **Neon**: no-op (pool is created lazily on first query).
*
* Vite `configureServer` awaits this at dev startup; production imports of this
* module kick it off immediately (see bottom of file).
*/
function ensureDbReady() {
	if (dbSource !== "pglite") return Promise.resolve();
	return getSql().then(() => void 0);
}
var globalBoot = globalThis;
if (typeof window === "undefined" && dbSource === "pglite") globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
	globalBoot.__pgBootstrapPromise__ = void 0;
	console.error("[db] PGLite bootstrap failed:", err);
	throw err;
});
function secret() {
	const raw = process.env.WEATHER_HUB_SECRET || process.env.DATABASE_URL || "weather-hub-preview-secret-not-for-production";
	return createHash("sha256").update(raw).digest();
}
function encryptSecret(plain) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", secret(), iv);
	const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([
		iv,
		tag,
		enc
	]).toString("base64");
}
function decryptSecret(payload) {
	const buf = Buffer.from(payload, "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const enc = buf.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", secret(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
function sha256Hex(value) {
	return createHash("sha256").update(value).digest("hex");
}
function checksum(value) {
	return sha256Hex(value);
}
function randomToken(bytes = 24) {
	return randomBytes(bytes).toString("base64url");
}
function hintOf(value) {
	if (value.length <= 4) return "****";
	return `····${value.slice(-4)}`;
}
function generateApiKey() {
	const plaintext = `whub_${randomToken(24)}`;
	return {
		plaintext,
		prefix: plaintext.slice(0, 12),
		hash: sha256Hex(plaintext)
	};
}
function officeRegion(office) {
	if (office.includes("제주")) return "제주";
	if (office.includes("수도권") || office.includes("인천")) return "수도권";
	if (office.includes("강원") || office.includes("춘천")) return "강원";
	if (office.includes("청주") || office.includes("대전") || office.includes("홍성")) return "충청";
	if (office.includes("전주") || office.includes("광주") || office.includes("목포")) return "전라";
	return "경상";
}
var ASOS_STATIONS = [
	[
		"90",
		"속초",
		"강원지방기상청",
		38.2509,
		128.5647,
		18.1
	],
	[
		"93",
		"북춘천",
		"춘천기상대",
		37.9474,
		127.7544
	],
	[
		"95",
		"철원",
		"강원지방기상청",
		38.1479,
		127.3042
	],
	[
		"98",
		"동두천",
		"수도권기상청",
		37.9019,
		127.0607
	],
	[
		"99",
		"파주",
		"수도권기상청",
		37.8859,
		126.7665
	],
	[
		"100",
		"대관령",
		"강원지방기상청",
		37.6771,
		128.7183,
		842.5
	],
	[
		"101",
		"춘천",
		"춘천기상대",
		37.9026,
		127.7357,
		76.5
	],
	[
		"102",
		"백령도",
		"수도권기상청",
		37.9661,
		124.6305
	],
	[
		"104",
		"북강릉",
		"강원지방기상청",
		37.8046,
		128.8554
	],
	[
		"105",
		"강릉",
		"강원지방기상청",
		37.7515,
		128.891,
		26.4
	],
	[
		"106",
		"동해",
		"강원지방기상청",
		37.5071,
		129.1243
	],
	[
		"108",
		"서울",
		"수도권기상청",
		37.5714,
		126.9658,
		85.5
	],
	[
		"112",
		"인천",
		"수도권기상청",
		37.4777,
		126.6249,
		69
	],
	[
		"114",
		"원주",
		"강원지방기상청",
		37.3376,
		127.9466
	],
	[
		"115",
		"울릉도",
		"대구지방기상청",
		37.4813,
		130.8986,
		222.8
	],
	[
		"119",
		"수원",
		"수도권기상청",
		37.2723,
		126.9853,
		34.1
	],
	[
		"121",
		"영월",
		"강원지방기상청",
		37.1813,
		128.4573
	],
	[
		"127",
		"충주",
		"청주기상지청",
		36.9705,
		127.9525
	],
	[
		"129",
		"서산",
		"홍성기상대",
		36.7766,
		126.4939
	],
	[
		"130",
		"울진",
		"안동기상대",
		36.9918,
		129.4128
	],
	[
		"131",
		"청주",
		"청주기상지청",
		36.6392,
		127.4407,
		57.2
	],
	[
		"133",
		"대전",
		"대전지방기상청",
		36.372,
		127.3721,
		68.9
	],
	[
		"135",
		"추풍령",
		"청주기상지청",
		36.2203,
		127.9946
	],
	[
		"136",
		"안동",
		"안동기상대",
		36.5729,
		128.7073
	],
	[
		"137",
		"상주",
		"대구지방기상청",
		36.4084,
		128.1574
	],
	[
		"138",
		"포항",
		"대구지방기상청",
		36.032,
		129.38,
		2.3
	],
	[
		"140",
		"군산",
		"전주기상지청",
		36.0053,
		126.7614
	],
	[
		"143",
		"대구",
		"대구지방기상청",
		35.8779,
		128.6522,
		53.4
	],
	[
		"146",
		"전주",
		"전주기상지청",
		35.8215,
		127.155,
		61.4
	],
	[
		"152",
		"울산",
		"울산기상대",
		35.5824,
		129.3347,
		34.7
	],
	[
		"155",
		"창원",
		"창원기상대",
		35.1702,
		128.5728
	],
	[
		"156",
		"광주",
		"광주지방기상청",
		35.1729,
		126.8916,
		72.4
	],
	[
		"159",
		"부산",
		"부산지방기상청",
		35.1047,
		129.032,
		69.6
	],
	[
		"162",
		"통영",
		"부산지방기상청",
		34.8454,
		128.4356
	],
	[
		"165",
		"목포",
		"목포기상대",
		34.8169,
		126.3812,
		38
	],
	[
		"168",
		"여수",
		"광주지방기상청",
		34.7393,
		127.7406
	],
	[
		"169",
		"흑산도",
		"광주지방기상청",
		34.6872,
		125.451
	],
	[
		"170",
		"완도",
		"목포기상대",
		34.3959,
		126.7018
	],
	[
		"172",
		"고창",
		"전주기상지청",
		35.4266,
		126.697
	],
	[
		"174",
		"순천",
		"광주지방기상청",
		35.02,
		127.3694
	],
	[
		"177",
		"홍성",
		"홍성기상대",
		36.6576,
		126.6877
	],
	[
		"184",
		"제주",
		"제주지방기상청",
		33.5141,
		126.5297,
		20.5
	],
	[
		"185",
		"고산",
		"제주지방기상청",
		33.2938,
		126.1628
	],
	[
		"188",
		"성산",
		"제주지방기상청",
		33.3868,
		126.8802
	],
	[
		"189",
		"서귀포",
		"제주지방기상청",
		33.2461,
		126.5653,
		50.5
	],
	[
		"192",
		"진주",
		"창원기상대",
		35.1638,
		128.04
	],
	[
		"201",
		"강화",
		"인천기상대",
		37.7074,
		126.4463
	],
	[
		"202",
		"양평",
		"수도권기상청",
		37.4886,
		127.4945
	],
	[
		"203",
		"이천",
		"수도권기상청",
		37.264,
		127.4842
	],
	[
		"211",
		"인제",
		"강원지방기상청",
		38.0599,
		128.1671
	],
	[
		"212",
		"홍천",
		"춘천기상대",
		37.6836,
		127.8804
	],
	[
		"216",
		"태백",
		"강원지방기상청",
		37.1705,
		128.9893
	],
	[
		"217",
		"정선군",
		"강원지방기상청",
		37.3815,
		128.645
	],
	[
		"221",
		"제천",
		"청주기상지청",
		37.1593,
		128.1943
	],
	[
		"226",
		"보은",
		"청주기상지청",
		36.4876,
		127.7342
	],
	[
		"232",
		"천안",
		"대전지방기상청",
		36.7622,
		127.2928
	],
	[
		"235",
		"보령",
		"대전지방기상청",
		36.327,
		126.5574
	],
	[
		"236",
		"부여",
		"대전지방기상청",
		36.2724,
		126.9208
	],
	[
		"238",
		"금산",
		"대전지방기상청",
		36.1056,
		127.4818
	],
	[
		"239",
		"세종",
		"대전지방기상청",
		36.4853,
		127.236
	],
	[
		"243",
		"부안",
		"전주기상지청",
		35.7296,
		126.7166
	],
	[
		"244",
		"임실",
		"전주기상지청",
		35.612,
		127.2859
	],
	[
		"245",
		"정읍",
		"전주기상지청",
		35.5634,
		126.866
	],
	[
		"247",
		"남원",
		"전주기상지청",
		35.4213,
		127.3965
	],
	[
		"248",
		"장수",
		"전주기상지청",
		35.6569,
		127.5203
	],
	[
		"251",
		"고창군",
		"전주기상지청",
		35.4261,
		126.697
	],
	[
		"252",
		"영광군",
		"광주지방기상청",
		35.2837,
		126.4778
	],
	[
		"253",
		"김해시",
		"부산지방기상청",
		35.2296,
		128.8908
	],
	[
		"254",
		"순창군",
		"전주기상지청",
		35.3713,
		127.137
	],
	[
		"255",
		"북창원",
		"창원기상대",
		35.2266,
		128.6726
	],
	[
		"257",
		"양산시",
		"울산기상대",
		35.3072,
		129.0264
	],
	[
		"258",
		"보성군",
		"광주지방기상청",
		34.7634,
		127.2123
	],
	[
		"259",
		"강진군",
		"목포기상대",
		34.6187,
		126.7672
	],
	[
		"260",
		"장흥",
		"목포기상대",
		34.6889,
		126.9195
	],
	[
		"261",
		"해남",
		"목포기상대",
		34.5536,
		126.5691
	],
	[
		"262",
		"고흥",
		"광주지방기상청",
		34.6183,
		127.2757
	],
	[
		"263",
		"의령군",
		"창원기상대",
		35.3226,
		128.288
	],
	[
		"264",
		"함양군",
		"창원기상대",
		35.5114,
		127.7453
	],
	[
		"266",
		"광양시",
		"광주지방기상청",
		34.9434,
		127.691
	],
	[
		"268",
		"진도군",
		"목포기상대",
		34.472,
		126.258
	],
	[
		"271",
		"봉화",
		"대구지방기상청",
		36.9436,
		128.9145
	],
	[
		"272",
		"영주",
		"안동기상대",
		36.8716,
		128.5169
	],
	[
		"273",
		"문경",
		"안동기상대",
		36.6273,
		128.1488
	],
	[
		"276",
		"청송군",
		"대구지방기상청",
		36.4351,
		129.0401
	],
	[
		"277",
		"영덕",
		"대구지방기상청",
		36.5334,
		129.4093
	],
	[
		"278",
		"의성",
		"대구지방기상청",
		36.3564,
		128.6887
	],
	[
		"279",
		"구미",
		"대구지방기상청",
		36.1306,
		128.3206
	],
	[
		"281",
		"영천",
		"대구지방기상청",
		35.9774,
		128.951
	],
	[
		"283",
		"경주시",
		"대구지방기상청",
		35.8175,
		129.2
	],
	[
		"284",
		"거창",
		"울산기상대",
		35.6712,
		127.9099
	],
	[
		"285",
		"합천",
		"울산기상대",
		35.565,
		128.1699
	],
	[
		"288",
		"밀양",
		"울산기상대",
		35.4915,
		128.7441
	],
	[
		"289",
		"산청",
		"창원기상대",
		35.413,
		127.8791
	],
	[
		"294",
		"거제",
		"부산지방기상청",
		34.8882,
		128.6046
	],
	[
		"295",
		"남해",
		"부산지방기상청",
		34.8162,
		127.9264
	]
].map(([stationId, stationName, office, latitude, longitude, altitude]) => ({
	stationId,
	stationName,
	office,
	region: officeRegion(office),
	latitude,
	longitude,
	altitude
}));
var DEFAULT_FAVORITES = [
	"108",
	"112",
	"119",
	"133",
	"143",
	"156",
	"159",
	"184"
];
var KST_OFFSET_MS = 324e5;
/** Instant → KST wall clock parts. Independent of the host locale. */
function instantToKst(date) {
	const kst = new Date(date.getTime() + KST_OFFSET_MS);
	return {
		year: kst.getUTCFullYear(),
		month: kst.getUTCMonth() + 1,
		day: kst.getUTCDate(),
		hour: kst.getUTCHours(),
		minute: kst.getUTCMinutes(),
		second: kst.getUTCSeconds()
	};
}
function pad(n, w = 2) {
	return String(n).padStart(w, "0");
}
function formatKst(date, withSeconds = true) {
	const p = instantToKst(date);
	const base = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
	return withSeconds ? `${base}:${pad(p.second)}` : `${base}:00`;
}
function formatKstDate(date) {
	const p = instantToKst(date);
	return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
/**
* Parse a KST wall-clock or ISO string into an instant.
* Accepts `YYYY-MM-DD[ HH:mm[:ss]]`, `YYYY-MM-DDTHH:mm[:ss][+09:00]`,
* and `+` decoded as space (`… 09:00`). UTC `Z` is converted, not treated as KST.
*/
function parseKst(value) {
	const trimmed = value.trim();
	if (/Z$/i.test(trimmed) && /T/i.test(trimmed)) {
		const d = new Date(trimmed);
		if (Number.isNaN(d.getTime())) throw new Error(`지원하지 않는 일시 형식: ${value}`);
		return d;
	}
	const m = trimmed.replace("T", " ").replace(/\+09:00$/, "").replace(/ 09:00$/, "").replace(/\.\d+$/, "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/);
	if (!m) throw new Error(`지원하지 않는 일시 형식: ${value}`);
	return kstWallToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}
function kstWallToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
	return /* @__PURE__ */ new Date(Date.UTC(year, month - 1, day, hour, minute, second) - KST_OFFSET_MS);
}
/** Normalize any accepted input to `YYYY-MM-DD HH:mm:ss` KST wall clock. */
function toKstWall(value) {
	return formatKst(parseKst(value));
}
function addHoursKst(kstWall, hours) {
	const d = parseKst(kstWall);
	return formatKst(new Date(d.getTime() + hours * 36e5));
}
function addDaysKst(kstWall, days) {
	return addHoursKst(kstWall.length === 10 ? `${kstWall} 00:00:00` : kstWall, days * 24);
}
function toIsoKst(kstWall) {
	const wall = toKstWall(kstWall);
	return `${wall.slice(0, 10)}T${wall.slice(11)}+09:00`;
}
function ymd(value) {
	return toKstWall(value).slice(0, 10).replaceAll("-", "");
}
function hh(value) {
	return toKstWall(value).slice(11, 13);
}
function latestOfficialHour(now = /* @__PURE__ */ new Date()) {
	const p = instantToKst(now);
	const daysBack = p.hour < 11 ? 2 : 1;
	const q = instantToKst(/* @__PURE__ */ new Date(kstWallToUtc(p.year, p.month, p.day, 0, 0, 0).getTime() - daysBack * 24 * 36e5));
	return `${q.year}-${pad(q.month)}-${pad(q.day)} 23:00:00`;
}
function asString(v) {
	if (v === null || v === void 0) return "";
	if (typeof v === "string") return v;
	if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")} ${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}:${String(v.getUTCSeconds()).padStart(2, "0")}`;
	return String(v);
}
function asDateOnly(v) {
	return asString(v).slice(0, 10);
}
function asNum(v) {
	if (v === null || v === void 0 || v === "") return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}
function asInt(v) {
	const n = asNum(v);
	return n === null ? 0 : Math.trunc(n);
}
function asBool(v) {
	return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}
function numEq(a, b) {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	return a === b;
}
function strEq(a, b) {
	return (a ?? null) === (b ?? null);
}
async function upsertHourly(sql, rows, source) {
	const counts = {
		inserted: 0,
		updated: 0,
		skipped: 0
	};
	if (rows.length === 0) return counts;
	const stationId = rows[0].stationId;
	const provider = rows[0].provider;
	const dataset = rows[0].datasetCode;
	const times = rows.map((r) => r.observationDatetime);
	const minT = times.reduce((a, b) => a < b ? a : b);
	const maxT = times.reduce((a, b) => a > b ? a : b);
	const existing = await sql.query(`select to_char(observation_datetime, 'YYYY-MM-DD HH24:MI:SS') as observation_datetime,
            temperature, precipitation, humidity, wind_speed, wind_direction, pressure,
            sea_level_pressure, sunshine, solar_radiation, snow_depth, snow_3hour, visibility,
            cloud_cover, ground_temperature, vapor_pressure, dew_point,
            temperature_qc, precipitation_qc, humidity_qc
       from weather_observations_hourly
      where provider = $1 and dataset_code = $2 and station_id = $3
        and observation_datetime >= $4::timestamp and observation_datetime <= $5::timestamp`, [
		provider,
		dataset,
		stationId,
		minT,
		maxT
	]);
	const map = /* @__PURE__ */ new Map();
	for (const row of existing) map.set(asString(row.observation_datetime), row);
	for (const row of rows) {
		const prev = map.get(row.observationDatetime);
		if (!prev) {
			await insertHourly(sql, row, source);
			counts.inserted += 1;
			continue;
		}
		if (numEq(asNum(prev.temperature), row.temperature) && numEq(asNum(prev.precipitation), row.precipitation) && numEq(asNum(prev.humidity), row.humidity) && numEq(asNum(prev.wind_speed), row.windSpeed) && numEq(asNum(prev.wind_direction), row.windDirection) && numEq(asNum(prev.pressure), row.pressure) && numEq(asNum(prev.sunshine), row.sunshine) && numEq(asNum(prev.solar_radiation), row.solarRadiation) && numEq(asNum(prev.snow_depth), row.snowDepth) && strEq(asString(prev.temperature_qc) || null, row.temperatureQc)) {
			counts.skipped += 1;
			continue;
		}
		await updateHourly(sql, row, source);
		counts.updated += 1;
	}
	return counts;
}
async function insertHourly(sql, row, source) {
	await sql.query(`insert into weather_observations_hourly (
        provider, dataset_code, station_id, observation_datetime, timezone,
        temperature, temperature_qc, precipitation, precipitation_qc, humidity, humidity_qc,
        wind_speed, wind_speed_qc, wind_direction, wind_direction_qc, pressure, pressure_qc,
        sea_level_pressure, sea_level_pressure_qc, sunshine, sunshine_qc, solar_radiation,
        snow_depth, snow_3hour, visibility, cloud_cover, low_mid_cloud_cover, cloud_type, ceiling,
        ground_temperature, ground_temperature_qc, vapor_pressure, dew_point, weather_phenomenon_code,
        soil_temp_5cm, soil_temp_10cm, soil_temp_20cm, soil_temp_30cm,
        quality_temperature, quality_precipitation, quality_humidity, quality_wind, quality_pressure,
        source_import_id, collection_job_id
      ) values (
        $1,$2,$3,$4::timestamp,$5,
        $6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29,
        $30,$31,$32,$33,$34,
        $35,$36,$37,$38,
        $39,$40,$41,$42,$43,
        $44,$45
      )`, [
		row.provider,
		row.datasetCode,
		row.stationId,
		row.observationDatetime,
		row.timezone,
		row.temperature,
		row.temperatureQc,
		row.precipitation,
		row.precipitationQc,
		row.humidity,
		row.humidityQc,
		row.windSpeed,
		row.windSpeedQc,
		row.windDirection,
		row.windDirectionQc,
		row.pressure,
		row.pressureQc,
		row.seaLevelPressure,
		row.seaLevelPressureQc,
		row.sunshine,
		row.sunshineQc,
		row.solarRadiation,
		row.snowDepth,
		row.snow3hour,
		row.visibility,
		row.cloudCover,
		row.lowMidCloudCover,
		row.cloudType,
		row.ceiling,
		row.groundTemperature,
		row.groundTemperatureQc,
		row.vaporPressure,
		row.dewPoint,
		row.weatherPhenomenonCode,
		row.soilTemp5cm,
		row.soilTemp10cm,
		row.soilTemp20cm,
		row.soilTemp30cm,
		row.qualityTemperature,
		row.qualityPrecipitation,
		row.qualityHumidity,
		row.qualityWind,
		row.qualityPressure,
		source.importId,
		source.jobId
	]);
}
async function updateHourly(sql, row, source) {
	await sql.query(`update weather_observations_hourly set
        temperature=$6, temperature_qc=$7, precipitation=$8, precipitation_qc=$9,
        humidity=$10, humidity_qc=$11, wind_speed=$12, wind_speed_qc=$13,
        wind_direction=$14, wind_direction_qc=$15, pressure=$16, pressure_qc=$17,
        sea_level_pressure=$18, sea_level_pressure_qc=$19, sunshine=$20, sunshine_qc=$21,
        solar_radiation=$22, snow_depth=$23, snow_3hour=$24, visibility=$25,
        cloud_cover=$26, low_mid_cloud_cover=$27, cloud_type=$28, ceiling=$29,
        ground_temperature=$30, ground_temperature_qc=$31, vapor_pressure=$32, dew_point=$33,
        weather_phenomenon_code=$34, soil_temp_5cm=$35, soil_temp_10cm=$36, soil_temp_20cm=$37,
        soil_temp_30cm=$38, quality_temperature=$39, quality_precipitation=$40,
        quality_humidity=$41, quality_wind=$42, quality_pressure=$43,
        source_import_id=$44, collection_job_id=$45, updated_at=now()
      where provider=$1 and dataset_code=$2 and station_id=$3 and observation_datetime=$4::timestamp`, [
		row.provider,
		row.datasetCode,
		row.stationId,
		row.observationDatetime,
		row.timezone,
		row.temperature,
		row.temperatureQc,
		row.precipitation,
		row.precipitationQc,
		row.humidity,
		row.humidityQc,
		row.windSpeed,
		row.windSpeedQc,
		row.windDirection,
		row.windDirectionQc,
		row.pressure,
		row.pressureQc,
		row.seaLevelPressure,
		row.seaLevelPressureQc,
		row.sunshine,
		row.sunshineQc,
		row.solarRadiation,
		row.snowDepth,
		row.snow3hour,
		row.visibility,
		row.cloudCover,
		row.lowMidCloudCover,
		row.cloudType,
		row.ceiling,
		row.groundTemperature,
		row.groundTemperatureQc,
		row.vaporPressure,
		row.dewPoint,
		row.weatherPhenomenonCode,
		row.soilTemp5cm,
		row.soilTemp10cm,
		row.soilTemp20cm,
		row.soilTemp30cm,
		row.qualityTemperature,
		row.qualityPrecipitation,
		row.qualityHumidity,
		row.qualityWind,
		row.qualityPressure,
		source.importId,
		source.jobId
	]);
}
async function upsertDaily(sql, rows, source) {
	const counts = {
		inserted: 0,
		updated: 0,
		skipped: 0
	};
	if (rows.length === 0) return counts;
	const stationId = rows[0].stationId;
	const provider = rows[0].provider;
	const dataset = rows[0].datasetCode;
	const dates = rows.map((r) => r.observationDate);
	const minD = dates.reduce((a, b) => a < b ? a : b);
	const maxD = dates.reduce((a, b) => a > b ? a : b);
	const existing = await sql.query(`select observation_date::text as observation_date, avg_temperature, min_temperature, max_temperature,
            precipitation, avg_humidity, snow_depth, sunshine_hours, source_kind
       from weather_observations_daily
      where provider=$1 and dataset_code=$2 and station_id=$3
        and observation_date >= $4::date and observation_date <= $5::date
        and source_kind='OFFICIAL'`, [
		provider,
		dataset,
		stationId,
		minD,
		maxD
	]);
	const map = /* @__PURE__ */ new Map();
	for (const row of existing) map.set(asDateOnly(row.observation_date), row);
	for (const row of rows) {
		const prev = map.get(row.observationDate);
		if (!prev) {
			await sql.query(`insert into weather_observations_daily (
           provider, dataset_code, station_id, observation_date, timezone,
           avg_temperature, min_temperature, max_temperature, precipitation,
           avg_humidity, min_humidity, snow_depth, snow_fresh, sunshine_hours,
           solar_radiation, avg_wind_speed, max_wind_speed, avg_pressure,
           source_kind, source_import_id, collection_job_id
         ) values (
           $1,$2,$3,$4::date,$5,
           $6,$7,$8,$9,
           $10,$11,$12,$13,$14,
           $15,$16,$17,$18,
           $19,$20,$21
         )`, [
				row.provider,
				row.datasetCode,
				row.stationId,
				row.observationDate,
				row.timezone,
				row.avgTemperature,
				row.minTemperature,
				row.maxTemperature,
				row.precipitation,
				row.avgHumidity,
				row.minHumidity,
				row.snowDepth,
				row.snowFresh,
				row.sunshineHours,
				row.solarRadiation,
				row.avgWindSpeed,
				row.maxWindSpeed,
				row.avgPressure,
				row.sourceKind,
				source.importId,
				source.jobId
			]);
			counts.inserted += 1;
			continue;
		}
		if (numEq(asNum(prev.avg_temperature), row.avgTemperature) && numEq(asNum(prev.min_temperature), row.minTemperature) && numEq(asNum(prev.max_temperature), row.maxTemperature) && numEq(asNum(prev.precipitation), row.precipitation)) {
			counts.skipped += 1;
			continue;
		}
		await sql.query(`update weather_observations_daily set
         avg_temperature=$5, min_temperature=$6, max_temperature=$7, precipitation=$8,
         avg_humidity=$9, min_humidity=$10, snow_depth=$11, snow_fresh=$12, sunshine_hours=$13,
         solar_radiation=$14, avg_wind_speed=$15, max_wind_speed=$16, avg_pressure=$17,
         source_import_id=$18, collection_job_id=$19, updated_at=now()
       where provider=$1 and dataset_code=$2 and station_id=$3 and observation_date=$4::date
         and source_kind='OFFICIAL'`, [
			row.provider,
			row.datasetCode,
			row.stationId,
			row.observationDate,
			row.avgTemperature,
			row.minTemperature,
			row.maxTemperature,
			row.precipitation,
			row.avgHumidity,
			row.minHumidity,
			row.snowDepth,
			row.snowFresh,
			row.sunshineHours,
			row.solarRadiation,
			row.avgWindSpeed,
			row.maxWindSpeed,
			row.avgPressure,
			source.importId,
			source.jobId
		]);
		counts.updated += 1;
	}
	return counts;
}
function hash32(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function unit(seed) {
	return hash32(seed) / 4294967295;
}
/** Climatological seed for preview only — labeled via collection_jobs.trigger_type=SEED. */
function synthHourly(stationId, wall) {
	const date = wall.slice(0, 10);
	const hour = Number(wall.slice(11, 13));
	const doy = Number(date.slice(5, 7)) * 30 + Number(date.slice(8, 10));
	const offset = stationId === "108" ? 0 : stationId === "159" ? 1.4 : stationId === "184" ? 3.2 : -.6;
	const diurnal = 4.8 * Math.sin((hour - 4) / 24 * Math.PI * 2);
	const seasonal = 22.5 + 6.5 * Math.sin((doy - 200) / 365 * Math.PI * 2);
	const jitter = (unit(`${stationId}:${wall}:t`) - .5) * 1.6;
	const temperature = Math.round((seasonal + diurnal + offset + jitter) * 10) / 10;
	const isRainDay = unit(`${stationId}:${date}:rain`) > .78;
	const precipitation = isRainDay && hour >= 14 && hour <= 19 ? Math.round((unit(`${stationId}:${wall}:rn`) * 4.2 + .1) * 10) / 10 : hour === 0 ? 0 : null;
	const humidity = Math.round(58 + (isRainDay ? 18 : 0) + (unit(`${stationId}:${wall}:h`) - .5) * 12);
	const windSpeed = Math.round((1.2 + unit(`${stationId}:${wall}:ws`) * 3.4) * 10) / 10;
	const dirs = [
		50,
		70,
		90,
		110,
		250,
		270,
		290,
		320
	];
	const windDirection = dirs[Math.floor(unit(`${stationId}:${wall}:wd`) * dirs.length)];
	const pressure = Math.round((1012.4 + (unit(`${stationId}:${wall}:pa`) - .5) * 8) * 10) / 10;
	const sunshine = hour >= 7 && hour <= 18 ? Math.round(unit(`${stationId}:${wall}:ss`) * 10) / 10 : 0;
	return {
		provider: "KMA",
		datasetCode: "ASOS_HOURLY",
		stationId,
		observationDatetime: wall,
		timezone: "Asia/Seoul",
		temperature,
		temperatureQc: null,
		precipitation,
		precipitationQc: null,
		humidity,
		humidityQc: null,
		windSpeed,
		windSpeedQc: null,
		windDirection,
		windDirectionQc: null,
		pressure,
		pressureQc: null,
		seaLevelPressure: Math.round((pressure + 10.2) * 10) / 10,
		seaLevelPressureQc: null,
		sunshine,
		sunshineQc: hour >= 7 && hour <= 18 ? null : "9",
		solarRadiation: hour >= 7 && hour <= 18 ? Math.round(unit(`${stationId}:${wall}:sr`) * 2.4 * 100) / 100 : 0,
		snowDepth: null,
		snow3hour: null,
		visibility: isRainDay ? 1800 : 2800,
		cloudCover: isRainDay ? 8 : Math.round(unit(`${stationId}:${wall}:cc`) * 6),
		lowMidCloudCover: isRainDay ? 6 : 2,
		cloudType: isRainDay ? "Sc" : null,
		ceiling: isRainDay ? 8 : null,
		groundTemperature: Math.round((temperature - .8) * 10) / 10,
		groundTemperatureQc: null,
		vaporPressure: Math.round((8 + unit(`${stationId}:${wall}:pv`) * 6) * 10) / 10,
		dewPoint: Math.round((temperature - 6 + (isRainDay ? 3 : 0)) * 10) / 10,
		weatherPhenomenonCode: isRainDay ? "01" : null,
		soilTemp5cm: Math.round((temperature - 1.2) * 10) / 10,
		soilTemp10cm: Math.round((temperature - 1.6) * 10) / 10,
		soilTemp20cm: Math.round((temperature - 2.1) * 10) / 10,
		soilTemp30cm: Math.round((temperature - 2.6) * 10) / 10,
		qualityTemperature: "NORMAL",
		qualityPrecipitation: "NORMAL",
		qualityHumidity: "NORMAL",
		qualityWind: "NORMAL",
		qualityPressure: "NORMAL"
	};
}
async function seedIfEmpty(sql) {
	if (((await sql.query("select count(*)::int as n from dataset_master"))[0]?.n ?? 0) > 0) return;
	await sql.query(`insert into weather_providers (
        provider_code, provider_name, service_code, service_name, base_url, status,
        api_key_source, requests_per_second, requests_per_minute, chunk_days, preserve_raw, raw_retention_days
      ) values
      ('KMA_ASOS_HOURLY','기상청','ASOS_HOURLY','지상(종관, ASOS) 시간자료','https://apis.data.go.kr/1360000/AsosHourlyInfoService','ENABLED','NONE',2,50,7,true,30),
      ('KMA_ASOS_DAILY','기상청','ASOS_DAILY','지상(종관, ASOS) 일자료','https://apis.data.go.kr/1360000/AsosDalyInfoService','ENABLED','NONE',2,50,31,true,30),
      ('KMA_AWS_HOURLY','기상청','AWS_HOURLY','지상(방재, AWS) 시간자료','https://apis.data.go.kr/1360000/Aws1miInfoService','DISABLED','NONE',1,30,1,true,14)
    `);
	const envKey = process.env.KMA_API_KEY?.trim();
	if (envKey) await sql.query(`update weather_providers
          set api_key_ciphertext=$1, api_key_hint=$2, api_key_source='ENV', updated_at=now()
        where provider_code in ('KMA_ASOS_HOURLY','KMA_ASOS_DAILY')`, [encryptSecret(envKey), `····${envKey.slice(-4)}`]);
	await sql.query(`insert into dataset_master (
        dataset_code, dataset_name, provider, data_kind, data_type, time_resolution,
        description, connector_id, enabled
      ) values
      ('ASOS_HOURLY','종관기상관측 시간자료','KMA','OBSERVATION','ASOS','HOURLY',
       '기상청 종관기상관측(ASOS) 시간 단위 실측값. 전일(D-1)까지 제공.','kma_asos_hourly', true),
      ('ASOS_DAILY','종관기상관측 일자료','KMA','OBSERVATION','ASOS','DAILY',
       '기상청 종관기상관측(ASOS) 공식 일자료. 시간자료 자체 집계와 동일하지 않음.','kma_asos_daily', true),
      ('AWS_HOURLY','방재기상관측 시간자료','KMA','OBSERVATION','AWS','HOURLY',
       'AWS 커넥터 준비. 공식 시간자료 API 계약 확인 후 활성화.','kma_aws_hourly', false)
    `);
	for (const st of ASOS_STATIONS) await sql.query(`insert into weather_stations (
          provider, station_id, station_name, region, office, latitude, longitude, altitude,
          station_type, enabled, is_favorite
        ) values ('KMA',$1,$2,$3,$4,$5,$6,$7,'ASOS', true, $8)`, [
		st.stationId,
		st.stationName,
		st.region,
		st.office,
		st.latitude ?? null,
		st.longitude ?? null,
		st.altitude ?? null,
		DEFAULT_FAVORITES.includes(st.stationId)
	]);
	await sql.query(`insert into weather_schedules (dataset_code, enabled, cadence, lookback_hours, station_scope)
     values ('ASOS_HOURLY', true, 'HOURLY', 3, 'FAVORITES'),
            ('ASOS_DAILY', true, 'DAILY', 48, 'FAVORITES')`);
	const demoPlain = "whub_preview_cafeteria_read";
	await sql.query(`insert into weather_api_clients (name, client_code, key_prefix, key_hash, status, scopes, created_by)
     values ('구내식당 시스템','CAFETERIA_SYSTEM',$1,$2,'ACTIVE','READ_WEATHER','SEED'),
            ('시설관리 시스템','FACILITY_SYSTEM','whub_facili', $3,'ACTIVE','READ_WEATHER','SEED'),
            ('에너지관리 시스템','ENERGY_SYSTEM','whub_energy', $4,'ACTIVE','READ_WEATHER','SEED')`, [
		demoPlain.slice(0, 12),
		sha256Hex(demoPlain),
		sha256Hex("whub_facility_placeholder"),
		sha256Hex("whub_energy_placeholder")
	]);
	const latest = latestOfficialHour();
	const latestDate = latest.slice(0, 10);
	const start = (() => {
		return formatKstDate(/* @__PURE__ */ new Date(kstWallToUtc(Number(latestDate.slice(0, 4)), Number(latestDate.slice(5, 7)), Number(latestDate.slice(8, 10))).getTime() - 6048e5));
	})();
	const jobId = (await sql.query(`insert into weather_collection_jobs (
        dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
        started_at, completed_at, status, created_by, chunk_total, chunk_done
      ) values ('ASOS_HOURLY','KMA', null, $1, $2, 'SEED', now(), now(), 'COMPLETED', 'SEED', 1, 1)
      returning id`, [`${start} 00:00:00`, latest]))[0].id;
	const importId = (await sql.query(`insert into weather_raw_imports (
        provider, dataset_code, job_id, requested_from, requested_to, station_id,
        request_parameters_json, response_raw, response_format, checksum, status
      ) values ('KMA','ASOS_HOURLY',$1,$2,$3,'SEED','{"mode":"SEED"}','{"note":"preview climatological seed"}','JSON',$4,'OK')
      returning id`, [
		jobId,
		`${start} 00:00:00`,
		latest,
		checksum("SEED")
	]))[0].id;
	const seedStations = [
		"108",
		"112",
		"159"
	];
	const skip = /* @__PURE__ */ new Set([
		"108|03",
		"108|04",
		"108|05"
	]);
	let received = 0;
	for (const stn of seedStations) {
		const hourly = [];
		let cursor = kstWallToUtc(Number(start.slice(0, 4)), Number(start.slice(5, 7)), Number(start.slice(8, 10)));
		const endMs = kstWallToUtc(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)), Number(latest.slice(8, 10)), Number(latest.slice(11, 13))).getTime();
		const gapDay = formatKstDate(/* @__PURE__ */ new Date(kstWallToUtc(Number(latestDate.slice(0, 4)), Number(latestDate.slice(5, 7)), Number(latestDate.slice(8, 10))).getTime() - 1728e5));
		while (cursor.getTime() <= endMs) {
			const wall = formatKst(cursor);
			const key = `${stn}|${wall.slice(11, 13)}`;
			if (!(wall.startsWith(gapDay) && skip.has(key))) hourly.push(synthHourly(stn, wall));
			cursor = new Date(cursor.getTime() + 36e5);
		}
		const counts = await upsertHourly(sql, hourly, {
			importId,
			jobId
		});
		received += counts.inserted;
		const daily = [];
		let day = start;
		while (day <= latestDate) {
			const hours = hourly.filter((h) => h.observationDatetime.startsWith(day));
			if (hours.length) {
				const temps = hours.map((h) => h.temperature).filter((v) => v !== null);
				const rains = hours.map((h) => h.precipitation).filter((v) => v !== null);
				const hums = hours.map((h) => h.humidity).filter((v) => v !== null);
				daily.push({
					provider: "KMA",
					datasetCode: "ASOS_DAILY",
					stationId: stn,
					observationDate: day,
					timezone: "Asia/Seoul",
					avgTemperature: temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10 : null,
					minTemperature: temps.length ? Math.min(...temps) : null,
					maxTemperature: temps.length ? Math.max(...temps) : null,
					precipitation: rains.length ? Math.round(rains.reduce((a, b) => a + b, 0) * 10) / 10 : 0,
					avgHumidity: hums.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null,
					minHumidity: hums.length ? Math.min(...hums) : null,
					snowDepth: null,
					snowFresh: null,
					sunshineHours: Math.round(hours.reduce((a, h) => a + (h.sunshine ?? 0), 0) * 10) / 10,
					solarRadiation: Math.round(hours.reduce((a, h) => a + (h.solarRadiation ?? 0), 0) * 100) / 100,
					avgWindSpeed: Math.round(hours.reduce((a, h) => a + (h.windSpeed ?? 0), 0) / hours.length * 10) / 10,
					maxWindSpeed: Math.max(...hours.map((h) => h.windSpeed ?? 0)),
					avgPressure: Math.round(hours.reduce((a, h) => a + (h.pressure ?? 0), 0) / hours.length * 10) / 10,
					sourceKind: "OFFICIAL"
				});
			}
			day = formatKstDate(new Date(kstWallToUtc(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))).getTime() + 864e5));
		}
		await upsertDaily(sql, daily, {
			importId,
			jobId
		});
	}
	await sql.query(`update weather_collection_jobs
        set received_count=$1, inserted_count=$1, requested_count=$1
      where id=$2`, [received, jobId]);
	await sql.query(`insert into weather_api_usage (client_id, client_name, method, path, status_code, result_count, duration_ms)
     select id, name, 'GET', '/api/v1/weather/hourly', 200, 24, 18 from weather_api_clients where client_code='CAFETERIA_SYSTEM'
     union all
     select id, name, 'GET', '/api/v1/weather/summary', 200, 1, 12 from weather_api_clients where client_code='FACILITY_SYSTEM'`);
	await sql.query(`insert into weather_audit_log (actor_role, action, target, detail)
     values ('ADMIN','SEED','system','미리보기 시드 자료와 기준정보를 적재했습니다.')`);
	await sql.query(`insert into weather_alerts (severity, code, title, message)
     values ('INFO','SEED_DATA','시드 관측자료가 적재되어 있습니다',
             '미리보기에는 서울·인천·부산 종관지점의 최근 약 8일 시드 관측자료가 들어 있습니다. 공공데이터포털 인증키를 등록한 뒤 수집하면 원본 ASOS 값으로 덮어씁니다(UPSERT).'),
            ('WARN','GAP_SAMPLE','서울 108 3시간 누락 구간',
             '누락 탐지 화면 확인용으로 서울 지점의 심야 3시간이 비어 있습니다. 재수집으로 채울 수 있습니다.')`);
	await sql.query(`insert into app_settings (key, value) values
     ('hub_name','기상허브'),
     ('timezone','Asia/Seoul'),
     ('demo_api_key_note','미리보기 구내식당 키: whub_preview_cafeteria_read')`);
}
function chunkRange(from, to, chunkDays) {
	const start = parseKst(from);
	if (parseKst(to).getTime() < start.getTime()) return [];
	const days = Math.max(1, chunkDays);
	const chunks = [];
	let cursor = from.length === 10 ? `${from} 00:00:00` : from;
	const last = to.length === 10 ? `${to} 23:00:00` : to;
	const lastMs = parseKst(last).getTime();
	let guard = 0;
	while (parseKst(cursor).getTime() <= lastMs && guard < 5e3) {
		guard += 1;
		const next = addDaysKst(cursor, days);
		const chunkEnd = parseKst(next).getTime() > lastMs ? last : addHoursKst(next, -1);
		chunks.push({
			from: cursor,
			to: chunkEnd,
			startDt: ymd(cursor),
			startHh: hh(cursor),
			endDt: ymd(chunkEnd),
			endHh: hh(chunkEnd)
		});
		cursor = addHoursKst(chunkEnd, 1);
	}
	return chunks;
}
var ProviderError = class extends Error {
	code;
	httpStatus;
	constructor(code, message, httpStatus) {
		super(message);
		this.name = "ProviderError";
		this.code = code;
		this.httpStatus = httpStatus;
	}
};
var KMA_RESULT = {
	"00": {
		code: "UNKNOWN",
		message: "정상"
	},
	"0": {
		code: "UNKNOWN",
		message: "정상"
	},
	"01": {
		code: "SERVER",
		message: "공급기관 어플리케이션 오류입니다."
	},
	"02": {
		code: "SERVER",
		message: "공급기관 데이터베이스 오류입니다."
	},
	"03": {
		code: "NO_DATA",
		message: "해당 조건의 관측자료가 없습니다."
	},
	"04": {
		code: "SERVER",
		message: "공급기관 HTTP 오류입니다."
	},
	"05": {
		code: "TIMEOUT",
		message: "공급기관 서비스 연결에 실패했습니다."
	},
	"10": {
		code: "BAD_REQUEST",
		message: "요청 파라미터가 올바르지 않습니다."
	},
	"11": {
		code: "BAD_REQUEST",
		message: "필수 요청 파라미터가 없습니다."
	},
	"12": {
		code: "SERVER",
		message: "해당 오픈API 서비스가 없거나 폐기되었습니다."
	},
	"20": {
		code: "AUTH",
		message: "서비스 접근이 거부되었습니다. 인증키를 확인하세요."
	},
	"21": {
		code: "AUTH",
		message: "일시적으로 사용할 수 없는 인증키입니다."
	},
	"22": {
		code: "RATE_LIMIT",
		message: "공급기관 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요."
	},
	"30": {
		code: "AUTH",
		message: "등록되지 않은 인증키입니다."
	},
	"31": {
		code: "AUTH",
		message: "기한이 만료된 인증키입니다."
	},
	"32": {
		code: "AUTH",
		message: "등록되지 않은 호출 IP입니다."
	},
	"33": {
		code: "AUTH",
		message: "서명되지 않은 호출입니다."
	},
	"99": {
		code: "UNKNOWN",
		message: "공급기관에서 기타 오류를 반환했습니다."
	}
};
function mapKmaResult(resultCode, resultMsg) {
	const raw = (resultCode ?? "").trim();
	if (raw === "00" || raw === "0") return {
		ok: true,
		code: "UNKNOWN",
		message: "정상"
	};
	const mapped = KMA_RESULT[raw];
	if (mapped) return {
		ok: false,
		...mapped
	};
	const msg = (resultMsg ?? "").toUpperCase();
	if (msg.includes("LIMITED_NUMBER")) return {
		ok: false,
		code: "RATE_LIMIT",
		message: "공급기관 호출 한도를 초과했습니다."
	};
	if (msg.includes("SERVICE_KEY") || msg.includes("UNAUTHORIZED")) return {
		ok: false,
		code: "AUTH",
		message: "인증키를 확인하세요."
	};
	if (msg.includes("NO_DATA") || msg.includes("NODATA")) return {
		ok: false,
		code: "NO_DATA",
		message: "해당 조건의 관측자료가 없습니다."
	};
	return {
		ok: false,
		code: "UNKNOWN",
		message: "공급기관 응답을 해석할 수 없습니다."
	};
}
function mapFetchFailure(err) {
	if (err instanceof ProviderError) return err;
	const lower = (err instanceof Error ? err.message : String(err)).toLowerCase();
	if (lower.includes("abort") || lower.includes("timeout")) return new ProviderError("TIMEOUT", "공급기관 응답 시간이 초과되었습니다.");
	if (lower.includes("enotfound") || lower.includes("dns") || lower.includes("econnrefused")) return new ProviderError("UNREACHABLE", "공급기관 서버에 연결할 수 없습니다.");
	if (lower.includes("json") || lower.includes("parse") || lower.includes("unexpected")) return new ProviderError("PARSE", "응답 형식을 해석할 수 없습니다. 스키마 변경이 의심됩니다.");
	return new ProviderError("UNKNOWN", "공급기관 호출 중 오류가 발생했습니다.");
}
var buckets = /* @__PURE__ */ new Map();
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
async function acquireRateLimit(opts) {
	const key = opts.provider;
	const rps = Math.max(1, opts.requestsPerSecond);
	const rpm = Math.max(1, opts.requestsPerMinute);
	for (let i = 0; i < 40; i += 1) {
		const now = Date.now();
		const bucket = buckets.get(key) ?? {
			timestamps: [],
			last: 0
		};
		bucket.timestamps = bucket.timestamps.filter((t) => now - t < 6e4);
		const sinceLast = now - bucket.last;
		const minGap = Math.ceil(1e3 / rps);
		if (bucket.timestamps.length >= rpm || sinceLast < minGap) {
			await sleep(Math.max(minGap - sinceLast, 250));
			continue;
		}
		bucket.timestamps.push(now);
		bucket.last = now;
		buckets.set(key, bucket);
		return;
	}
}
async function withBackoff(retries, fn, isRetryable) {
	let last;
	const max = Math.max(0, retries);
	for (let attempt = 0; attempt <= max; attempt += 1) try {
		return await fn();
	} catch (err) {
		last = err;
		if (attempt === max || !isRetryable(err)) throw err;
		await sleep(Math.min(16e3, 500 * 2 ** attempt));
	}
	throw last;
}
var TIMEZONE = "Asia/Seoul";
var ROLES = [
	"ADMIN",
	"DATA_MANAGER",
	"VIEWER"
];
var HOURLY_KNOWN_FIELDS = [
	"tm",
	"rnum",
	"stnId",
	"stnNm",
	"ta",
	"taQcflg",
	"rn",
	"rnQcflg",
	"ws",
	"wsQcflg",
	"wd",
	"wdQcflg",
	"hm",
	"hmQcflg",
	"pv",
	"td",
	"pa",
	"paQcflg",
	"ps",
	"psQcflg",
	"ss",
	"ssQcflg",
	"icsr",
	"dsnw",
	"hr3Fhsc",
	"dc10Tca",
	"dc10LmcsCa",
	"clfmAbbrCd",
	"lcsCh",
	"vs",
	"gndSttCd",
	"dmstMtphNo",
	"ts",
	"tsQcflg",
	"m005Te",
	"m01Te",
	"m02Te",
	"m03Te"
];
var DAILY_KNOWN_FIELDS = [
	"tm",
	"stnId",
	"stnNm",
	"avgTa",
	"minTa",
	"minTaHrmt",
	"maxTa",
	"maxTaHrmt",
	"sumRn",
	"sumRnDur",
	"hr1MaxRn",
	"hr1MaxRnHrmt",
	"mi10MaxRn",
	"mi10MaxRnHrmt",
	"avgRhm",
	"minRhm",
	"minRhmHrmt",
	"avgWs",
	"maxWs",
	"maxWsWd",
	"maxWsHrmt",
	"maxInsWs",
	"maxInsWsWd",
	"maxInsWsHrmt",
	"maxWd",
	"hr24SumRws",
	"avgTd",
	"avgPv",
	"avgPa",
	"avgPs",
	"maxPs",
	"maxPsHrmt",
	"minPs",
	"minPsHrmt",
	"ssDur",
	"sumSsHr",
	"sumGsr",
	"hr1MaxIcsr",
	"hr1MaxIcsrHrmt",
	"ddMes",
	"ddMesHrmt",
	"ddMefs",
	"ddMefsHrmt",
	"sumDpthFhsc",
	"avgTca",
	"avgLmac",
	"avgTs",
	"minTg",
	"avgCm5Te",
	"avgCm10Te",
	"avgCm20Te",
	"avgCm30Te",
	"avgM05Te",
	"avgM10Te",
	"avgM15Te",
	"avgM30Te",
	"avgM50Te",
	"sumLrgEv",
	"sumSmlEv",
	"n99Rn",
	"sumFogDur",
	"iscs"
];
var EXPORT_COLUMNS = [
	{
		key: "observation_datetime",
		label: "관측일시",
		group: "hourly",
		defaultOn: true
	},
	{
		key: "observation_date",
		label: "관측일자",
		group: "daily",
		defaultOn: true
	},
	{
		key: "station_id",
		label: "지점번호",
		group: "both",
		defaultOn: true
	},
	{
		key: "station_name",
		label: "지점명",
		group: "both",
		defaultOn: true
	},
	{
		key: "temperature",
		label: "기온(°C)",
		group: "hourly",
		defaultOn: true
	},
	{
		key: "avg_temperature",
		label: "평균기온(°C)",
		group: "daily",
		defaultOn: true
	},
	{
		key: "min_temperature",
		label: "최저기온(°C)",
		group: "daily",
		defaultOn: true
	},
	{
		key: "max_temperature",
		label: "최고기온(°C)",
		group: "daily",
		defaultOn: true
	},
	{
		key: "precipitation",
		label: "강수량(mm)",
		group: "both",
		defaultOn: true
	},
	{
		key: "humidity",
		label: "습도(%)",
		group: "hourly",
		defaultOn: true
	},
	{
		key: "avg_humidity",
		label: "평균습도(%)",
		group: "daily",
		defaultOn: true
	},
	{
		key: "wind_speed",
		label: "풍속(m/s)",
		group: "hourly",
		defaultOn: false
	},
	{
		key: "wind_direction",
		label: "풍향",
		group: "hourly",
		defaultOn: false
	},
	{
		key: "avg_wind_speed",
		label: "평균풍속(m/s)",
		group: "daily",
		defaultOn: false
	},
	{
		key: "pressure",
		label: "현지기압(hPa)",
		group: "hourly",
		defaultOn: false
	},
	{
		key: "sunshine",
		label: "일조(hr)",
		group: "hourly",
		defaultOn: false
	},
	{
		key: "sunshine_hours",
		label: "합계일조(hr)",
		group: "daily",
		defaultOn: false
	},
	{
		key: "solar_radiation",
		label: "일사(MJ/m²)",
		group: "both",
		defaultOn: false
	},
	{
		key: "snow_depth",
		label: "적설(cm)",
		group: "both",
		defaultOn: false
	},
	{
		key: "visibility",
		label: "시정(10m)",
		group: "hourly",
		defaultOn: false
	},
	{
		key: "quality_temperature",
		label: "기온품질",
		group: "hourly",
		defaultOn: true
	}
];
/**
* Official ASOS QC flags (기상청 Open API 활용가이드):
*   정상 = null (empty)
*   오류 = 1
*   결측 = 9
*
* Sample tables sometimes print `0` as an example value. `0` is stored as the
* original provider code and treated as NORMAL, not invented.
*/
function normalizeQc(raw) {
	if (raw === null || raw === void 0) return "NORMAL";
	const v = String(raw).trim();
	if (v === "" || v === "0") return "NORMAL";
	if (v === "1") return "INVALID";
	if (v === "9") return "MISSING";
	return "SUSPECT";
}
function qcLabel(q) {
	switch (q) {
		case "NORMAL": return "정상";
		case "INVALID": return "오류";
		case "MISSING": return "결측";
		default: return "주의";
	}
}
function emptyToNull(value) {
	if (value === null || value === void 0) return null;
	const s = String(value).trim();
	return s.length === 0 ? null : s;
}
/** Parse a numeric observation. Empty / missing → null. Never coerce null to 0. */
function parseNullableNumber(value) {
	const s = emptyToNull(value);
	if (s === null) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}
function parseNullableInt(value) {
	const n = parseNullableNumber(value);
	return n === null ? null : Math.trunc(n);
}
function encodeKey(key) {
	if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
	return encodeURIComponent(key);
}
async function callKma(opts) {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(opts.query)) params.set(k, String(v));
	const url = `${opts.baseUrl}${opts.path}?${params.toString()}&serviceKey=${encodeKey(opts.apiKey)}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		const res = await fetch(url, {
			method: "GET",
			signal: controller.signal,
			headers: { Accept: "application/json" }
		});
		const body = await res.text();
		if (res.status === 429) throw new ProviderError("RATE_LIMIT", "공급기관 호출 한도를 초과했습니다.", 429);
		if (res.status === 401 || res.status === 403) throw new ProviderError("AUTH", "인증키를 확인하세요.", res.status);
		if (res.status >= 500) throw new ProviderError("SERVER", "공급기관 서버 오류(5xx)가 발생했습니다.", res.status);
		const trimmed = body.trim();
		if (!trimmed) throw new ProviderError("NO_DATA", "공급기관이 빈 응답을 반환했습니다.", res.status);
		if (trimmed.startsWith("<")) {
			const code = trimmed.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
			const msg = trimmed.match(/<resultMsg>([^<]+)<\/resultMsg>/i)?.[1];
			const mapped = mapKmaResult(code, msg);
			if (!mapped.ok) throw new ProviderError(mapped.code, mapped.message, res.status);
			throw new ProviderError("PARSE", "JSON이 아닌 XML 응답을 받았습니다. 스키마 변경이 의심됩니다.");
		}
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new ProviderError("PARSE", "응답 JSON을 해석할 수 없습니다. 스키마 변경이 의심됩니다.");
		}
		return {
			httpStatus: res.status,
			body: trimmed,
			parsed,
			format: "JSON"
		};
	} catch (err) {
		throw mapFetchFailure(err);
	} finally {
		clearTimeout(timer);
	}
}
function asItems(raw) {
	if (!raw || typeof raw !== "object") return [];
	const items = raw.response?.body?.items;
	if (!items || items === "" || typeof items !== "object") return [];
	const item = items.item;
	if (!item) return [];
	return Array.isArray(item) ? item : [item];
}
function readHeader(raw) {
	if (!raw || typeof raw !== "object") return {};
	const header = raw.response?.header;
	return {
		resultCode: header?.resultCode,
		resultMsg: header?.resultMsg
	};
}
function readPaging(raw) {
	const body = raw?.response?.body ?? {};
	return {
		totalCount: Number(body.totalCount ?? 0) || 0,
		pageNo: Number(body.pageNo ?? 1) || 1,
		numOfRows: Number(body.numOfRows ?? 0) || 0
	};
}
function unknownFields(item, known) {
	const set = new Set(known);
	return Object.keys(item).filter((k) => !set.has(k));
}
var REQUIRED$1 = ["tm", "stnId"];
var kmaAsosDaily = {
	meta: {
		id: "kma_asos_daily",
		provider: "KMA",
		datasetCode: "ASOS_DAILY",
		dataKind: "OBSERVATION",
		timeResolution: "DAILY",
		serviceName: "지상(종관, ASOS) 일자료 조회서비스",
		implemented: true
	},
	async fetch(params) {
		return await callKma({
			baseUrl: "https://apis.data.go.kr/1360000/AsosDalyInfoService",
			path: "/getWthrDataList",
			apiKey: params.apiKey,
			timeoutMs: params.timeoutMs,
			query: {
				numOfRows: params.numOfRows ?? 999,
				pageNo: params.pageNo ?? 1,
				dataType: "JSON",
				dataCd: "ASOS",
				dateCd: "DAY",
				startDt: params.from.slice(0, 10).replaceAll("-", ""),
				endDt: params.to.slice(0, 10).replaceAll("-", ""),
				stnIds: params.stationId
			}
		});
	},
	validate(raw) {
		const header = readHeader(raw.parsed);
		const mapped = mapKmaResult(header.resultCode, header.resultMsg);
		const paging = readPaging(raw.parsed);
		if (!mapped.ok) return {
			ok: false,
			resultCode: header.resultCode,
			resultMsg: mapped.message,
			items: [],
			totalCount: paging.totalCount,
			pageNo: paging.pageNo,
			numOfRows: paging.numOfRows,
			unknownFields: [],
			missingRequired: []
		};
		const items = asItems(raw.parsed);
		const missingRequired = /* @__PURE__ */ new Set();
		const unknown = /* @__PURE__ */ new Set();
		for (const item of items) {
			for (const key of REQUIRED$1) if (emptyToNull(item[key]) === null) missingRequired.add(key);
			for (const f of unknownFields(item, DAILY_KNOWN_FIELDS)) unknown.add(f);
		}
		return {
			ok: missingRequired.size === 0,
			resultCode: header.resultCode,
			resultMsg: mapped.message,
			items,
			totalCount: paging.totalCount,
			pageNo: paging.pageNo,
			numOfRows: paging.numOfRows,
			unknownFields: [...unknown],
			missingRequired: [...missingRequired]
		};
	},
	normalizeDaily(items) {
		return items.map((item) => {
			const tm = emptyToNull(item.tm);
			const stnId = emptyToNull(item.stnId);
			if (!tm || !stnId) throw new ProviderError("SCHEMA", "필수 필드(tm, stnId)가 없습니다.");
			return {
				provider: "KMA",
				datasetCode: "ASOS_DAILY",
				stationId: stnId,
				observationDate: tm.slice(0, 10),
				timezone: TIMEZONE,
				avgTemperature: parseNullableNumber(item.avgTa),
				minTemperature: parseNullableNumber(item.minTa),
				maxTemperature: parseNullableNumber(item.maxTa),
				precipitation: parseNullableNumber(item.sumRn),
				avgHumidity: parseNullableNumber(item.avgRhm),
				minHumidity: parseNullableNumber(item.minRhm),
				snowDepth: parseNullableNumber(item.ddMes),
				snowFresh: parseNullableNumber(item.ddMefs),
				sunshineHours: parseNullableNumber(item.sumSsHr),
				solarRadiation: parseNullableNumber(item.sumGsr),
				avgWindSpeed: parseNullableNumber(item.avgWs),
				maxWindSpeed: parseNullableNumber(item.maxWs),
				avgPressure: parseNullableNumber(item.avgPa),
				sourceKind: "OFFICIAL"
			};
		});
	}
};
var REQUIRED = ["tm", "stnId"];
function parseTm(tm) {
	const v = tm.trim().replace("T", " ");
	if (/^\d{4}-\d{2}-\d{2} \d{2}$/.test(v)) return `${v}:00:00`;
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return `${v}:00`;
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
	throw new ProviderError("SCHEMA", `관측시각 형식이 예상과 다릅니다: ${tm}`);
}
var CONNECTORS = [
	{
		meta: {
			id: "kma_asos_hourly",
			provider: "KMA",
			datasetCode: "ASOS_HOURLY",
			dataKind: "OBSERVATION",
			timeResolution: "HOURLY",
			serviceName: "지상(종관, ASOS) 시간자료 조회서비스",
			implemented: true
		},
		async fetch(params) {
			const from = params.from;
			const to = params.to;
			return await callKma({
				baseUrl: "https://apis.data.go.kr/1360000/AsosHourlyInfoService",
				path: "/getWthrDataList",
				apiKey: params.apiKey,
				timeoutMs: params.timeoutMs,
				query: {
					numOfRows: params.numOfRows ?? 999,
					pageNo: params.pageNo ?? 1,
					dataType: "JSON",
					dataCd: "ASOS",
					dateCd: "HR",
					startDt: from.slice(0, 10).replaceAll("-", ""),
					startHh: from.slice(11, 13) || "00",
					endDt: to.slice(0, 10).replaceAll("-", ""),
					endHh: to.slice(11, 13) || "23",
					stnIds: params.stationId
				}
			});
		},
		validate(raw) {
			const header = readHeader(raw.parsed);
			const mapped = mapKmaResult(header.resultCode, header.resultMsg);
			const paging = readPaging(raw.parsed);
			if (!mapped.ok) return {
				ok: false,
				resultCode: header.resultCode,
				resultMsg: mapped.message,
				items: [],
				totalCount: paging.totalCount,
				pageNo: paging.pageNo,
				numOfRows: paging.numOfRows,
				unknownFields: [],
				missingRequired: []
			};
			const items = asItems(raw.parsed);
			const missingRequired = /* @__PURE__ */ new Set();
			const unknown = /* @__PURE__ */ new Set();
			for (const item of items) {
				for (const key of REQUIRED) if (emptyToNull(item[key]) === null) missingRequired.add(key);
				for (const f of unknownFields(item, HOURLY_KNOWN_FIELDS)) unknown.add(f);
			}
			return {
				ok: missingRequired.size === 0,
				resultCode: header.resultCode,
				resultMsg: mapped.message,
				items,
				totalCount: paging.totalCount,
				pageNo: paging.pageNo,
				numOfRows: paging.numOfRows,
				unknownFields: [...unknown],
				missingRequired: [...missingRequired]
			};
		},
		normalizeHourly(items) {
			return items.map((item) => {
				const tm = emptyToNull(item.tm);
				const stnId = emptyToNull(item.stnId);
				if (!tm || !stnId) throw new ProviderError("SCHEMA", "필수 필드(tm, stnId)가 없습니다.");
				const taQc = emptyToNull(item.taQcflg);
				const rnQc = emptyToNull(item.rnQcflg);
				const hmQc = emptyToNull(item.hmQcflg);
				const wsQc = emptyToNull(item.wsQcflg);
				const wdQc = emptyToNull(item.wdQcflg);
				const paQc = emptyToNull(item.paQcflg);
				return {
					provider: "KMA",
					datasetCode: "ASOS_HOURLY",
					stationId: stnId,
					observationDatetime: parseTm(tm),
					timezone: TIMEZONE,
					temperature: parseNullableNumber(item.ta),
					temperatureQc: taQc,
					precipitation: parseNullableNumber(item.rn),
					precipitationQc: rnQc,
					humidity: parseNullableNumber(item.hm),
					humidityQc: hmQc,
					windSpeed: parseNullableNumber(item.ws),
					windSpeedQc: wsQc,
					windDirection: parseNullableInt(item.wd),
					windDirectionQc: wdQc,
					pressure: parseNullableNumber(item.pa),
					pressureQc: paQc,
					seaLevelPressure: parseNullableNumber(item.ps),
					seaLevelPressureQc: emptyToNull(item.psQcflg),
					sunshine: parseNullableNumber(item.ss),
					sunshineQc: emptyToNull(item.ssQcflg),
					solarRadiation: parseNullableNumber(item.icsr),
					snowDepth: parseNullableNumber(item.dsnw),
					snow3hour: parseNullableNumber(item.hr3Fhsc),
					visibility: parseNullableInt(item.vs),
					cloudCover: parseNullableNumber(item.dc10Tca),
					lowMidCloudCover: parseNullableNumber(item.dc10LmcsCa),
					cloudType: emptyToNull(item.clfmAbbrCd),
					ceiling: parseNullableInt(item.lcsCh),
					groundTemperature: parseNullableNumber(item.ts),
					groundTemperatureQc: emptyToNull(item.tsQcflg),
					vaporPressure: parseNullableNumber(item.pv),
					dewPoint: parseNullableNumber(item.td),
					weatherPhenomenonCode: emptyToNull(item.dmstMtphNo),
					soilTemp5cm: parseNullableNumber(item.m005Te),
					soilTemp10cm: parseNullableNumber(item.m01Te),
					soilTemp20cm: parseNullableNumber(item.m02Te),
					soilTemp30cm: parseNullableNumber(item.m03Te),
					qualityTemperature: normalizeQc(taQc),
					qualityPrecipitation: normalizeQc(rnQc),
					qualityHumidity: normalizeQc(hmQc),
					qualityWind: normalizeQc(wsQc ?? wdQc),
					qualityPressure: normalizeQc(paQc)
				};
			});
		}
	},
	kmaAsosDaily,
	{
		meta: {
			id: "kma_aws_hourly",
			provider: "KMA",
			datasetCode: "AWS_HOURLY",
			dataKind: "OBSERVATION",
			timeResolution: "HOURLY",
			serviceName: "지상(방재, AWS) 기상관측자료 조회서비스",
			implemented: false
		},
		async fetch(_params) {
			throw new ProviderError("BAD_REQUEST", "AWS 시간자료 커넥터는 준비되어 있으나, 공식 시간자료 API 계약이 확인되지 않아 수집을 시작하지 않습니다. 현재 공공데이터포털 AWS 서비스는 최근 2일 1분 자료(Aws1miInfoService)입니다.");
		},
		validate() {
			return {
				ok: false,
				items: [],
				totalCount: 0,
				pageNo: 1,
				numOfRows: 0,
				unknownFields: [],
				missingRequired: [],
				resultMsg: "미구현 커넥터"
			};
		}
	}
];
function getConnector(datasetCode) {
	const found = CONNECTORS.find((c) => c.meta.datasetCode === datasetCode);
	if (!found) throw new Error(`등록되지 않은 데이터셋입니다: ${datasetCode}`);
	return found;
}
async function providerForDataset(sql, datasetCode) {
	return (await sql.query(`select provider_code, api_key_ciphertext, api_key_source,
            requests_per_second, requests_per_minute, retry_count, timeout_seconds,
            chunk_days, preserve_raw, status
       from weather_providers where service_code=$1 limit 1`, [datasetCode]))[0] ?? null;
}
async function resolveApiKey(sql, datasetCode) {
	const envKey = process.env.KMA_API_KEY?.trim();
	if (envKey) return envKey;
	const row = await providerForDataset(sql, datasetCode);
	if (row?.api_key_ciphertext) try {
		return decryptSecret(row.api_key_ciphertext);
	} catch {
		return null;
	}
	return null;
}
async function testConnection(sql, datasetCode) {
	const connector = getConnector(datasetCode);
	if (!connector.meta.implemented) return {
		ok: false,
		message: "이 데이터셋 커넥터는 아직 구현되지 않았습니다."
	};
	const key = await resolveApiKey(sql, datasetCode);
	if (!key) return {
		ok: false,
		message: "인증키가 등록되지 않았습니다. 공급원 화면에서 공공데이터포털 인증키를 등록하세요."
	};
	const latest = latestOfficialHour();
	try {
		const raw = await connector.fetch({
			stationId: "108",
			from: latest,
			to: latest,
			pageNo: 1,
			numOfRows: 1,
			apiKey: key,
			timeoutMs: 15e3
		});
		const validated = connector.validate(raw);
		if (!validated.ok) return {
			ok: false,
			message: validated.resultMsg ?? "연결 실패",
			detail: validated.resultCode
		};
		const tm = validated.items[0] ? String(validated.items[0].tm ?? latest) : latest;
		await sql.query(`update weather_providers
          set last_test_at=now(), last_test_status='OK', last_test_message=$1, updated_at=now()
        where service_code=$2`, [`정상 · 최근 관측 ${tm}`, datasetCode]);
		return {
			ok: true,
			message: "기상청 API 연결 정상",
			latest: tm
		};
	} catch (err) {
		const pe = err instanceof ProviderError ? err : new ProviderError("UNKNOWN", "연결 실패");
		await sql.query(`update weather_providers
          set last_test_at=now(), last_test_status='FAIL', last_test_message=$1, updated_at=now()
        where service_code=$2`, [pe.message, datasetCode]);
		return {
			ok: false,
			message: pe.message
		};
	}
}
async function enqueueCollection(sql, opts) {
	if (!getConnector(opts.datasetCode).meta.implemented) throw new Error("이 데이터셋은 아직 수집할 수 없습니다.");
	const chunkDays = (await providerForDataset(sql, opts.datasetCode))?.chunk_days ?? (opts.datasetCode === "ASOS_DAILY" ? 31 : 7);
	const stations = opts.stationIds.length ? opts.stationIds : ["108"];
	const timeChunks = chunkRange(opts.from, opts.to, chunkDays);
	const jobId = (await sql.query(`insert into weather_collection_jobs (
        dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
        status, created_by, chunk_total
      ) values ($1,'KMA',$2,$3,$4,$5,'PENDING',$6,$7)
      returning id`, [
		opts.datasetCode,
		stations.length === 1 ? stations[0] : null,
		opts.from,
		opts.to,
		opts.triggerType,
		opts.createdBy,
		timeChunks.length * stations.length
	]))[0].id;
	for (const stationId of stations) for (const chunk of timeChunks) await sql.query(`insert into weather_collection_chunks (job_id, station_id, chunk_from, chunk_to, status)
         values ($1,$2,$3,$4,'PENDING')`, [
		jobId,
		stationId,
		chunk.from,
		chunk.to
	]);
	return {
		jobId,
		chunkTotal: timeChunks.length * stations.length
	};
}
async function processJobTick(sql, jobId) {
	const job = (jobId ? await sql.query(`select * from weather_collection_jobs where id=$1`, [jobId]) : await sql.query(`select * from weather_collection_jobs
          where status in ('PENDING','RUNNING')
          order by id asc limit 1`))[0];
	if (!job) return { progressed: false };
	const id = asInt(job.id);
	if (asString(job.status) === "PENDING") await sql.query(`update weather_collection_jobs set status='RUNNING', started_at=coalesce(started_at, now()) where id=$1`, [id]);
	const chunk = (await sql.query(`select * from weather_collection_chunks
      where job_id=$1 and status in ('PENDING','FAILED')
      order by id asc limit 1`, [id]))[0];
	if (!chunk) {
		await finalizeJob(sql, id);
		return {
			progressed: true,
			jobId: id
		};
	}
	await processChunk(sql, id, asString(job.dataset_code), chunk);
	if (((await sql.query(`select count(*)::int as n from weather_collection_chunks where job_id=$1 and status in ('PENDING','FAILED')`, [id]))[0]?.n ?? 0) === 0) await finalizeJob(sql, id);
	return {
		progressed: true,
		jobId: id
	};
}
async function processChunk(sql, jobId, datasetCode, chunk) {
	const chunkId = asInt(chunk.id);
	const stationId = asString(chunk.station_id);
	const from = asString(chunk.chunk_from);
	const to = asString(chunk.chunk_to);
	await sql.query(`update weather_collection_chunks set status='RUNNING', started_at=now(), attempt_count=attempt_count+1 where id=$1`, [chunkId]);
	const provider = await providerForDataset(sql, datasetCode);
	const key = await resolveApiKey(sql, datasetCode);
	if (!key) {
		await failChunk(sql, chunkId, jobId, "인증키가 등록되지 않았습니다.");
		return;
	}
	const connector = getConnector(datasetCode);
	try {
		await acquireRateLimit({
			provider: "KMA",
			requestsPerSecond: provider?.requests_per_second ?? 2,
			requestsPerMinute: provider?.requests_per_minute ?? 50
		});
		const raw = await withBackoff(provider?.retry_count ?? 3, () => connector.fetch({
			stationId,
			from,
			to,
			pageNo: 1,
			numOfRows: 999,
			apiKey: key,
			timeoutMs: (provider?.timeout_seconds ?? 20) * 1e3
		}), (err) => {
			if (err instanceof ProviderError) return err.code === "TIMEOUT" || err.code === "SERVER" || err.code === "RATE_LIMIT" || err.code === "UNREACHABLE";
			return false;
		});
		const validated = connector.validate(raw);
		if (!validated.ok && validated.resultCode && !["03"].includes(validated.resultCode)) throw new ProviderError("UNKNOWN", validated.resultMsg ?? "수집 실패");
		if (validated.unknownFields.length) await sql.query(`insert into weather_alerts (severity, code, title, message)
         values ('WARN','SCHEMA_DRIFT','응답 스키마 변경 의심', $1)`, [`${datasetCode} 응답에 알려지지 않은 필드가 있습니다: ${validated.unknownFields.join(", ")}. 원본은 보존하고 임의 매핑하지 않았습니다.`]);
		let importId = null;
		if (provider?.preserve_raw) importId = (await sql.query(`insert into weather_raw_imports (
            provider, dataset_code, job_id, requested_from, requested_to, station_id,
            request_parameters_json, response_raw, response_format, checksum, status, unknown_fields_json
          ) values ('KMA',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          returning id`, [
			datasetCode,
			jobId,
			from,
			to,
			stationId,
			JSON.stringify({
				stationId,
				from,
				to
			}),
			raw.body.slice(0, 9e5),
			raw.format,
			checksum(raw.body),
			validated.ok ? "OK" : "WARN",
			validated.unknownFields.length ? JSON.stringify(validated.unknownFields) : null
		]))[0]?.id ?? null;
		let counts = {
			inserted: 0,
			updated: 0,
			skipped: 0,
			received: validated.items.length
		};
		if (datasetCode === "ASOS_HOURLY" && connector.normalizeHourly) {
			const rows = connector.normalizeHourly(validated.items);
			counts = {
				...await upsertHourly(sql, rows, {
					importId,
					jobId
				}),
				received: rows.length
			};
		} else if (datasetCode === "ASOS_DAILY" && connector.normalizeDaily) {
			const rows = connector.normalizeDaily(validated.items);
			counts = {
				...await upsertDaily(sql, rows, {
					importId,
					jobId
				}),
				received: rows.length
			};
		}
		await sql.query(`update weather_collection_chunks
          set status='COMPLETED', completed_at=now(),
              received_count=$2, inserted_count=$3, updated_count=$4, skipped_count=$5, error_message=null
        where id=$1`, [
			chunkId,
			counts.received,
			counts.inserted,
			counts.updated,
			counts.skipped
		]);
		await sql.query(`update weather_collection_jobs set
          received_count = received_count + $2,
          inserted_count = inserted_count + $3,
          updated_count = updated_count + $4,
          skipped_count = skipped_count + $5,
          chunk_done = chunk_done + 1
        where id=$1`, [
			jobId,
			counts.received,
			counts.inserted,
			counts.updated,
			counts.skipped
		]);
		await sql.query(`update weather_providers set last_collect_at=now(), updated_at=now() where service_code=$1`, [datasetCode]);
	} catch (err) {
		await failChunk(sql, chunkId, jobId, err instanceof ProviderError ? err.message : "수집 구간 처리 중 오류가 발생했습니다.");
	}
}
async function failChunk(sql, chunkId, jobId, message) {
	await sql.query(`update weather_collection_chunks
        set status='FAILED', completed_at=now(), error_message=$2
      where id=$1`, [chunkId, message]);
	await sql.query(`update weather_collection_jobs set error_count = error_count + 1, error_message=$2, chunk_done = chunk_done + 1 where id=$1`, [jobId, message]);
}
async function finalizeJob(sql, jobId) {
	const rows = await sql.query(`select
        (select count(*) from weather_collection_chunks where job_id=$1) as total,
        (select count(*) from weather_collection_chunks where job_id=$1 and status='COMPLETED') as ok,
        (select count(*) from weather_collection_chunks where job_id=$1 and status='FAILED') as fail
     `, [jobId]);
	const total = asInt(rows[0]?.total);
	const ok = asInt(rows[0]?.ok);
	const fail = asInt(rows[0]?.fail);
	let status = "COMPLETED";
	if (fail > 0 && ok > 0) status = "PARTIAL_SUCCESS";
	if (fail > 0 && ok === 0) status = "FAILED";
	if (total === 0) status = "COMPLETED";
	await sql.query(`update weather_collection_jobs set status=$2, completed_at=now() where id=$1 and status <> 'CANCELLED'`, [jobId, status]);
}
async function retryFailedChunks(sql, jobId) {
	await sql.query(`update weather_collection_chunks set status='PENDING', error_message=null where job_id=$1 and status='FAILED'`, [jobId]);
	await sql.query(`update weather_collection_jobs set status='RUNNING', completed_at=null, error_message=null where id=$1`, [jobId]);
}
async function cancelJob(sql, jobId) {
	await sql.query(`update weather_collection_chunks set status='SKIPPED' where job_id=$1 and status='PENDING'`, [jobId]);
	await sql.query(`update weather_collection_jobs set status='CANCELLED', completed_at=now() where id=$1`, [jobId]);
}
async function runDueSchedules(sql) {
	const rows = await sql.query(`select * from weather_schedules where enabled = true`);
	const now = /* @__PURE__ */ new Date();
	for (const row of rows) {
		const cadence = asString(row.cadence);
		const last = row.last_run_at ? new Date(asString(row.last_run_at)) : null;
		if (!(!last || cadence === "HOURLY" && now.getTime() - last.getTime() > 33e5 || cadence === "DAILY" && now.getTime() - last.getTime() > 72e6)) continue;
		const dataset = asString(row.dataset_code);
		const lookback = asInt(row.lookback_hours) || 3;
		const latest = latestOfficialHour(now);
		const from = addHoursKst(latest, -lookback);
		const scope = asString(row.station_scope);
		let stations = [];
		if (scope === "FAVORITES") stations = await sql.query(`select station_id from weather_stations where is_favorite=true and enabled=true and station_type='ASOS'`);
		else if (scope === "ENABLED") stations = await sql.query(`select station_id from weather_stations where enabled=true and station_type='ASOS'`);
		else stations = await sql.query(`select station_id from weather_stations where station_type='ASOS'`);
		const ids = stations.map((s) => asString(s.station_id)).slice(0, 8);
		if (!ids.length) continue;
		try {
			await enqueueCollection(sql, {
				datasetCode: dataset,
				stationIds: ids,
				from,
				to: latest,
				triggerType: "SCHEDULED",
				createdBy: "SCHEDULER"
			});
			await sql.query(`update weather_schedules set last_run_at=now(), last_status='QUEUED', updated_at=now() where id=$1`, [asInt(row.id)]);
		} catch (err) {
			await sql.query(`update weather_schedules set last_run_at=now(), last_status='FAILED', updated_at=now() where id=$1`, [asInt(row.id)]);
			console.error("[weather-hub] schedule failed", err);
		}
	}
}
var g = globalThis;
async function ensureWeatherReady() {
	g.__weatherBoot__ ??= (async () => {
		await seedIfEmpty(await getSql());
		if (!g.__weatherTick__) {
			g.__weatherTick__ = setInterval(() => {
				(async () => {
					try {
						const db = await getSql();
						await runDueSchedules(db);
						for (let i = 0; i < 2; i += 1) if (!(await processJobTick(db)).progressed) break;
					} catch (err) {
						console.error("[weather-hub] tick failed", err);
					}
				})();
			}, 8e3);
			g.__weatherTick__.unref?.();
		}
	})();
	await g.__weatherBoot__;
}
function mapHourly(row, name) {
	return {
		id: asInt(row.id),
		provider: asString(row.provider),
		datasetCode: asString(row.dataset_code),
		stationId: asString(row.station_id),
		stationName: name ?? (row.station_name ? asString(row.station_name) : null),
		observationDatetime: asString(row.observation_datetime),
		timezone: "Asia/Seoul",
		temperature: asNum(row.temperature),
		precipitation: asNum(row.precipitation),
		humidity: asNum(row.humidity),
		windSpeed: asNum(row.wind_speed),
		windDirection: asInt(row.wind_direction) || null,
		pressure: asNum(row.pressure),
		sunshine: asNum(row.sunshine),
		solarRadiation: asNum(row.solar_radiation),
		snowDepth: asNum(row.snow_depth),
		visibility: asNum(row.visibility) === null ? null : asInt(row.visibility),
		qualityTemperature: asString(row.quality_temperature) || "NORMAL",
		qualityPrecipitation: asString(row.quality_precipitation) || "NORMAL",
		collectionJobId: row.collection_job_id === null ? null : asInt(row.collection_job_id),
		sourceImportId: row.source_import_id === null ? null : asInt(row.source_import_id)
	};
}
function mapDaily(row, name) {
	return {
		id: asInt(row.id),
		provider: asString(row.provider),
		datasetCode: asString(row.dataset_code),
		stationId: asString(row.station_id),
		stationName: name ?? (row.station_name ? asString(row.station_name) : null),
		observationDate: asDateOnly(row.observation_date),
		timezone: "Asia/Seoul",
		avgTemperature: asNum(row.avg_temperature),
		minTemperature: asNum(row.min_temperature),
		maxTemperature: asNum(row.max_temperature),
		precipitation: asNum(row.precipitation),
		avgHumidity: asNum(row.avg_humidity),
		snowDepth: asNum(row.snow_depth),
		sunshineHours: asNum(row.sunshine_hours),
		sourceKind: asString(row.source_kind) || "OFFICIAL",
		collectionJobId: row.collection_job_id === null ? null : asInt(row.collection_job_id)
	};
}
var HOURLY_SELECT = `
  o.id, o.provider, o.dataset_code, o.station_id, s.station_name,
  to_char(o.observation_datetime, 'YYYY-MM-DD HH24:MI:SS') as observation_datetime,
  o.temperature, o.precipitation, o.humidity, o.wind_speed, o.wind_direction, o.pressure,
  o.sunshine, o.solar_radiation, o.snow_depth, o.visibility,
  o.quality_temperature, o.quality_precipitation, o.collection_job_id, o.source_import_id
`;
//#endregion
export { qcLabel as C, toIsoKst as D, testConnection as E, toKstWall as O, processJobTick as S, sha256Hex as T, hintOf as _, addHoursKst as a, mapHourly as b, asNum as c, encryptSecret as d, enqueueCollection as f, getSql as g, generateApiKey as h, ROLES as i, asString as l, formatKst as m, EXPORT_COLUMNS as n, asBool as o, ensureWeatherReady as p, HOURLY_SELECT as r, asInt as s, ASOS_STATIONS as t, cancelJob as u, latestOfficialHour as v, retryFailedChunks as w, parseKst as x, mapDaily as y };
