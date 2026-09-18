CREATE TABLE IF NOT EXISTS observations_hourly (
  provider text NOT NULL DEFAULT 'KMA',
  dataset text NOT NULL DEFAULT 'ASOS_HOURLY',
  station_id text NOT NULL,
  station_name text,
  observation_datetime text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  temperature double precision,
  precipitation double precision,
  humidity double precision,
  wind_speed double precision,
  wind_direction double precision,
  pressure double precision,
  quality_temperature text,
  source_kind text,
  PRIMARY KEY (provider, dataset, station_id, observation_datetime)
);

CREATE TABLE IF NOT EXISTS observations_daily (
  station_id text NOT NULL,
  station_name text,
  observation_date text NOT NULL,
  avg_temperature double precision,
  min_temperature double precision,
  max_temperature double precision,
  precipitation double precision,
  avg_humidity double precision,
  source_kind text,
  note text,
  PRIMARY KEY (station_id, observation_date)
);

CREATE TABLE IF NOT EXISTS collect_jobs (
  id bigint PRIMARY KEY,
  dataset text,
  status text,
  trigger text,
  station_id text,
  range_from text,
  range_to text,
  received int DEFAULT 0,
  inserted int DEFAULT 0,
  updated int DEFAULT 0,
  chunks int DEFAULT 0,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weather_stations (
  station_id text PRIMARY KEY,
  station_name text,
  region text,
  enabled boolean DEFAULT true,
  favorite boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS hub_settings (
  k text PRIMARY KEY,
  v text
);
