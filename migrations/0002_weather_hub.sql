-- Weather Data Hub schema. Observations are unowned shared records.
-- Observation vs forecast are separate tables / dataset kinds. Never mix.

create table if not exists dataset_master (
  id serial primary key,
  dataset_code text not null unique,
  dataset_name text not null,
  provider text not null,
  data_kind text not null check (data_kind in ('OBSERVATION', 'FORECAST')),
  data_type text not null,
  time_resolution text not null,
  description text,
  connector_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weather_providers (
  id serial primary key,
  provider_code text not null unique,
  provider_name text not null,
  service_code text not null,
  service_name text not null,
  base_url text not null,
  status text not null default 'ENABLED' check (status in ('ENABLED', 'DISABLED')),
  api_key_ciphertext text,
  api_key_hint text,
  api_key_source text not null default 'NONE' check (api_key_source in ('NONE', 'ENV', 'DB')),
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  last_collect_at timestamptz,
  requests_per_second integer not null default 2,
  requests_per_minute integer not null default 60,
  max_parallel_requests integer not null default 1,
  retry_count integer not null default 3,
  timeout_seconds integer not null default 20,
  chunk_days integer not null default 7,
  preserve_raw boolean not null default true,
  raw_retention_days integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weather_stations (
  id serial primary key,
  provider text not null,
  station_id text not null,
  station_name text not null,
  region text,
  office text,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  station_type text not null,
  active_from date,
  active_to date,
  enabled boolean not null default true,
  is_favorite boolean not null default false,
  metadata_json text,
  updated_at timestamptz not null default now(),
  unique (provider, station_id)
);

create index if not exists weather_stations_name_idx on weather_stations (station_name);
create index if not exists weather_stations_type_idx on weather_stations (station_type);
create index if not exists weather_stations_region_idx on weather_stations (region);

create table if not exists weather_collection_jobs (
  id serial primary key,
  dataset_code text not null,
  provider text not null,
  station_id text,
  requested_from text not null,
  requested_to text not null,
  trigger_type text not null check (trigger_type in ('MANUAL', 'SCHEDULED', 'RETRY', 'SEED')),
  started_at timestamptz,
  completed_at timestamptz,
  requested_count integer not null default 0,
  received_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  chunk_total integer not null default 0,
  chunk_done integer not null default 0,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED')),
  error_message text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists weather_jobs_status_idx on weather_collection_jobs (status, created_at desc);

create table if not exists weather_collection_chunks (
  id serial primary key,
  job_id integer not null references weather_collection_jobs(id) on delete cascade,
  station_id text not null,
  chunk_from text not null,
  chunk_to text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
  received_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists weather_chunks_job_idx on weather_collection_chunks (job_id, status);

create table if not exists weather_raw_imports (
  id serial primary key,
  provider text not null,
  dataset_code text not null,
  job_id integer references weather_collection_jobs(id) on delete set null,
  requested_from text,
  requested_to text,
  station_id text,
  request_parameters_json text,
  response_raw text,
  response_format text,
  received_at timestamptz not null default now(),
  checksum text,
  status text not null default 'OK',
  unknown_fields_json text
);

create index if not exists weather_raw_received_idx on weather_raw_imports (received_at desc);

create table if not exists weather_observations_hourly (
  id serial primary key,
  provider text not null,
  dataset_code text not null,
  station_id text not null,
  observation_datetime timestamp not null,
  timezone text not null default 'Asia/Seoul',
  temperature double precision,
  temperature_qc text,
  precipitation double precision,
  precipitation_qc text,
  humidity double precision,
  humidity_qc text,
  wind_speed double precision,
  wind_speed_qc text,
  wind_direction integer,
  wind_direction_qc text,
  pressure double precision,
  pressure_qc text,
  sea_level_pressure double precision,
  sea_level_pressure_qc text,
  sunshine double precision,
  sunshine_qc text,
  solar_radiation double precision,
  snow_depth double precision,
  snow_3hour double precision,
  visibility integer,
  cloud_cover double precision,
  low_mid_cloud_cover double precision,
  cloud_type text,
  ceiling integer,
  ground_temperature double precision,
  ground_temperature_qc text,
  vapor_pressure double precision,
  dew_point double precision,
  weather_phenomenon_code text,
  soil_temp_5cm double precision,
  soil_temp_10cm double precision,
  soil_temp_20cm double precision,
  soil_temp_30cm double precision,
  quality_temperature text,
  quality_precipitation text,
  quality_humidity text,
  quality_wind text,
  quality_pressure text,
  source_import_id integer references weather_raw_imports(id) on delete set null,
  collection_job_id integer references weather_collection_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, dataset_code, station_id, observation_datetime)
);

create index if not exists weather_hourly_station_time_idx
  on weather_observations_hourly (station_id, observation_datetime desc);
create index if not exists weather_hourly_time_idx
  on weather_observations_hourly (observation_datetime desc);

create table if not exists weather_observations_daily (
  id serial primary key,
  provider text not null,
  dataset_code text not null,
  station_id text not null,
  observation_date date not null,
  timezone text not null default 'Asia/Seoul',
  avg_temperature double precision,
  min_temperature double precision,
  max_temperature double precision,
  precipitation double precision,
  avg_humidity double precision,
  min_humidity double precision,
  snow_depth double precision,
  snow_fresh double precision,
  sunshine_hours double precision,
  solar_radiation double precision,
  avg_wind_speed double precision,
  max_wind_speed double precision,
  avg_pressure double precision,
  source_kind text not null default 'OFFICIAL'
    check (source_kind in ('OFFICIAL', 'AGGREGATED_HOURLY')),
  source_import_id integer references weather_raw_imports(id) on delete set null,
  collection_job_id integer references weather_collection_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, dataset_code, station_id, observation_date, source_kind)
);

create index if not exists weather_daily_station_date_idx
  on weather_observations_daily (station_id, observation_date desc);

create table if not exists weather_schedules (
  id serial primary key,
  dataset_code text not null,
  enabled boolean not null default false,
  cadence text not null default 'HOURLY' check (cadence in ('HOURLY', 'DAILY')),
  lookback_hours integer not null default 3,
  station_scope text not null default 'FAVORITES' check (station_scope in ('FAVORITES', 'ENABLED', 'ALL')),
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weather_api_clients (
  id serial primary key,
  name text not null,
  client_code text not null unique,
  key_prefix text not null,
  key_hash text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  scopes text not null default 'READ_WEATHER',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by text
);

create table if not exists weather_api_usage (
  id serial primary key,
  client_id integer references weather_api_clients(id) on delete set null,
  client_name text,
  method text not null,
  path text not null,
  status_code integer not null,
  result_count integer,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists weather_api_usage_created_idx on weather_api_usage (created_at desc);

create table if not exists weather_audit_log (
  id serial primary key,
  actor_role text,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists weather_audit_created_idx on weather_audit_log (created_at desc);

create table if not exists weather_alerts (
  id serial primary key,
  severity text not null check (severity in ('INFO', 'WARN', 'ERROR')),
  code text not null,
  title text not null,
  message text not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists weather_export_jobs (
  id serial primary key,
  format text not null check (format in ('CSV', 'XLSX', 'JSON')),
  dataset_code text not null,
  filters_json text not null,
  columns_json text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  row_count integer,
  file_bytes bytea,
  file_name text,
  error_message text,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
