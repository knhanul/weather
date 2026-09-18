import type { Sql } from "@/lib/db";
import { asDateOnly, asNum, asString } from "./db-rows";
import type { DailyObservation, HourlyObservation } from "./types";

function numEq(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

export type UpsertCounts = { inserted: number; updated: number; skipped: number };

export async function upsertHourly(
  sql: Sql,
  rows: HourlyObservation[],
  source: { importId: number | null; jobId: number | null },
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return counts;
  const stationId = rows[0]!.stationId;
  const provider = rows[0]!.provider;
  const dataset = rows[0]!.datasetCode;
  const times = rows.map((r) => r.observationDatetime);
  const minT = times.reduce((a, b) => (a < b ? a : b));
  const maxT = times.reduce((a, b) => (a > b ? a : b));
  const existing = await sql.query<Record<string, unknown>>(
    `select to_char(observation_datetime, 'YYYY-MM-DD HH24:MI:SS') as observation_datetime,
            temperature, precipitation, humidity, wind_speed, wind_direction, pressure,
            sea_level_pressure, sunshine, solar_radiation, snow_depth, snow_3hour, visibility,
            cloud_cover, ground_temperature, vapor_pressure, dew_point,
            temperature_qc, precipitation_qc, humidity_qc
       from weather_observations_hourly
      where provider = $1 and dataset_code = $2 and station_id = $3
        and observation_datetime >= $4::timestamp and observation_datetime <= $5::timestamp`,
    [provider, dataset, stationId, minT, maxT],
  );
  const map = new Map<string, Record<string, unknown>>();
  for (const row of existing) map.set(asString(row.observation_datetime), row);

  for (const row of rows) {
    const prev = map.get(row.observationDatetime);
    if (!prev) {
      await insertHourly(sql, row, source);
      counts.inserted += 1;
      continue;
    }
    const same =
      numEq(asNum(prev.temperature), row.temperature) &&
      numEq(asNum(prev.precipitation), row.precipitation) &&
      numEq(asNum(prev.humidity), row.humidity) &&
      numEq(asNum(prev.wind_speed), row.windSpeed) &&
      numEq(asNum(prev.wind_direction), row.windDirection) &&
      numEq(asNum(prev.pressure), row.pressure) &&
      numEq(asNum(prev.sunshine), row.sunshine) &&
      numEq(asNum(prev.solar_radiation), row.solarRadiation) &&
      numEq(asNum(prev.snow_depth), row.snowDepth) &&
      strEq(asString(prev.temperature_qc) || null, row.temperatureQc);
    if (same) {
      counts.skipped += 1;
      continue;
    }
    await updateHourly(sql, row, source);
    counts.updated += 1;
  }
  return counts;
}

async function insertHourly(
  sql: Sql,
  row: HourlyObservation,
  source: { importId: number | null; jobId: number | null },
) {
  await sql.query(
    `insert into weather_observations_hourly (
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
      )`,
    [
      row.provider, row.datasetCode, row.stationId, row.observationDatetime, row.timezone,
      row.temperature, row.temperatureQc, row.precipitation, row.precipitationQc, row.humidity, row.humidityQc,
      row.windSpeed, row.windSpeedQc, row.windDirection, row.windDirectionQc, row.pressure, row.pressureQc,
      row.seaLevelPressure, row.seaLevelPressureQc, row.sunshine, row.sunshineQc, row.solarRadiation,
      row.snowDepth, row.snow3hour, row.visibility, row.cloudCover, row.lowMidCloudCover, row.cloudType, row.ceiling,
      row.groundTemperature, row.groundTemperatureQc, row.vaporPressure, row.dewPoint, row.weatherPhenomenonCode,
      row.soilTemp5cm, row.soilTemp10cm, row.soilTemp20cm, row.soilTemp30cm,
      row.qualityTemperature, row.qualityPrecipitation, row.qualityHumidity, row.qualityWind, row.qualityPressure,
      source.importId, source.jobId,
    ],
  );
}

async function updateHourly(
  sql: Sql,
  row: HourlyObservation,
  source: { importId: number | null; jobId: number | null },
) {
  await sql.query(
    `update weather_observations_hourly set
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
      where provider=$1 and dataset_code=$2 and station_id=$3 and observation_datetime=$4::timestamp`,
    [
      row.provider, row.datasetCode, row.stationId, row.observationDatetime,
      row.timezone,
      row.temperature, row.temperatureQc, row.precipitation, row.precipitationQc,
      row.humidity, row.humidityQc, row.windSpeed, row.windSpeedQc,
      row.windDirection, row.windDirectionQc, row.pressure, row.pressureQc,
      row.seaLevelPressure, row.seaLevelPressureQc, row.sunshine, row.sunshineQc,
      row.solarRadiation, row.snowDepth, row.snow3hour, row.visibility,
      row.cloudCover, row.lowMidCloudCover, row.cloudType, row.ceiling,
      row.groundTemperature, row.groundTemperatureQc, row.vaporPressure, row.dewPoint,
      row.weatherPhenomenonCode, row.soilTemp5cm, row.soilTemp10cm, row.soilTemp20cm,
      row.soilTemp30cm, row.qualityTemperature, row.qualityPrecipitation,
      row.qualityHumidity, row.qualityWind, row.qualityPressure,
      source.importId, source.jobId,
    ],
  );
}

export async function upsertDaily(
  sql: Sql,
  rows: DailyObservation[],
  source: { importId: number | null; jobId: number | null },
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return counts;
  const stationId = rows[0]!.stationId;
  const provider = rows[0]!.provider;
  const dataset = rows[0]!.datasetCode;
  const dates = rows.map((r) => r.observationDate);
  const minD = dates.reduce((a, b) => (a < b ? a : b));
  const maxD = dates.reduce((a, b) => (a > b ? a : b));
  const existing = await sql.query<Record<string, unknown>>(
    `select observation_date::text as observation_date, avg_temperature, min_temperature, max_temperature,
            precipitation, avg_humidity, snow_depth, sunshine_hours, source_kind
       from weather_observations_daily
      where provider=$1 and dataset_code=$2 and station_id=$3
        and observation_date >= $4::date and observation_date <= $5::date
        and source_kind='OFFICIAL'`,
    [provider, dataset, stationId, minD, maxD],
  );
  const map = new Map<string, Record<string, unknown>>();
  for (const row of existing) map.set(asDateOnly(row.observation_date), row);

  for (const row of rows) {
    const prev = map.get(row.observationDate);
    if (!prev) {
      await sql.query(
        `insert into weather_observations_daily (
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
         )`,
        [
          row.provider, row.datasetCode, row.stationId, row.observationDate, row.timezone,
          row.avgTemperature, row.minTemperature, row.maxTemperature, row.precipitation,
          row.avgHumidity, row.minHumidity, row.snowDepth, row.snowFresh, row.sunshineHours,
          row.solarRadiation, row.avgWindSpeed, row.maxWindSpeed, row.avgPressure,
          row.sourceKind, source.importId, source.jobId,
        ],
      );
      counts.inserted += 1;
      continue;
    }
    const same =
      numEq(asNum(prev.avg_temperature), row.avgTemperature) &&
      numEq(asNum(prev.min_temperature), row.minTemperature) &&
      numEq(asNum(prev.max_temperature), row.maxTemperature) &&
      numEq(asNum(prev.precipitation), row.precipitation);
    if (same) {
      counts.skipped += 1;
      continue;
    }
    await sql.query(
      `update weather_observations_daily set
         avg_temperature=$5, min_temperature=$6, max_temperature=$7, precipitation=$8,
         avg_humidity=$9, min_humidity=$10, snow_depth=$11, snow_fresh=$12, sunshine_hours=$13,
         solar_radiation=$14, avg_wind_speed=$15, max_wind_speed=$16, avg_pressure=$17,
         source_import_id=$18, collection_job_id=$19, updated_at=now()
       where provider=$1 and dataset_code=$2 and station_id=$3 and observation_date=$4::date
         and source_kind='OFFICIAL'`,
      [
        row.provider, row.datasetCode, row.stationId, row.observationDate,
        row.avgTemperature, row.minTemperature, row.maxTemperature, row.precipitation,
        row.avgHumidity, row.minHumidity, row.snowDepth, row.snowFresh, row.sunshineHours,
        row.solarRadiation, row.avgWindSpeed, row.maxWindSpeed, row.avgPressure,
        source.importId, source.jobId,
      ],
    );
    counts.updated += 1;
  }
  return counts;
}
