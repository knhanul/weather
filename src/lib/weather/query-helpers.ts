import type { Sql } from "@/lib/db";
import { asDateOnly, asInt, asNum, asString } from "./db-rows";

export async function stationName(sql: Sql, stationId: string): Promise<string | null> {
  const rows = await sql.query<{ station_name: string }>(
    `select station_name from weather_stations where provider='KMA' and station_id=$1`,
    [stationId],
  );
  return rows[0]?.station_name ?? null;
}

export function mapHourly(row: Record<string, unknown>, name?: string | null) {
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
    sourceImportId: row.source_import_id === null ? null : asInt(row.source_import_id),
  };
}

export function mapDaily(row: Record<string, unknown>, name?: string | null) {
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
    collectionJobId: row.collection_job_id === null ? null : asInt(row.collection_job_id),
  };
}

export const HOURLY_SELECT = `
  o.id, o.provider, o.dataset_code, o.station_id, s.station_name,
  to_char(o.observation_datetime, 'YYYY-MM-DD HH24:MI:SS') as observation_datetime,
  o.temperature, o.precipitation, o.humidity, o.wind_speed, o.wind_direction, o.pressure,
  o.sunshine, o.solar_radiation, o.snow_depth, o.visibility,
  o.quality_temperature, o.quality_precipitation, o.collection_job_id, o.source_import_id
`;
