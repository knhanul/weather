import { kmaAsosDaily } from "./kma-asos-daily";
import { kmaAsosHourly } from "./kma-asos-hourly";
import { kmaAwsHourly } from "./kma-aws";
import type { WeatherConnector } from "./types";

const CONNECTORS: WeatherConnector[] = [kmaAsosHourly, kmaAsosDaily, kmaAwsHourly];

export function getConnector(datasetCode: string): WeatherConnector {
  const found = CONNECTORS.find((c) => c.meta.datasetCode === datasetCode);
  if (!found) throw new Error(`등록되지 않은 데이터셋입니다: ${datasetCode}`);
  return found;
}

export function listConnectors(): WeatherConnector[] {
  return CONNECTORS;
}
