-- Weather hub on IONOS PostgreSQL. Unowned shared observations.
CREATE TABLE IF NOT EXISTS weather_observations_hourly (
  id bigserial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'KMA',
  dataset_code text NOT NULL DEFAULT 'ASOS_HOURLY',
  station_id text NOT NULL,
  station_name text,
  observation_datetime timestamp NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  temperature double precision,
  precipitation double precision,
  humidity double precision,
  wind_speed double precision,
  wind_direction double precision,
  pressure double precision,
  quality_temperature text,
  source_kind text NOT NULL DEFAULT 'OFFICIAL',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, dataset_code, station_id, observation_datetime)
);

CREATE INDEX IF NOT EXISTS woh_station_dt_idx
  ON weather_observations_hourly (station_id, observation_datetime);

CREATE TABLE IF NOT EXISTS weather_collection_jobs (
  id bigserial PRIMARY KEY,
  dataset_code text NOT NULL,
  station_id text,
  requested_from text NOT NULL,
  requested_to text NOT NULL,
  trigger_type text NOT NULL,
  status text NOT NULL,
  received_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weather_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
