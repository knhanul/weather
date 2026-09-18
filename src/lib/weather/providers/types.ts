import type { DailyObservation, HourlyObservation } from "../types";

export type FetchParams = {
  stationId: string;
  from: string;
  to: string;
  pageNo?: number;
  numOfRows?: number;
  apiKey: string;
  timeoutMs: number;
};

export type RawFetchResult = {
  format: "JSON" | "XML";
  body: string;
  parsed: unknown;
  httpStatus: number;
};

export type ValidationResult = {
  ok: boolean;
  resultCode?: string;
  resultMsg?: string;
  items: Record<string, unknown>[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  unknownFields: string[];
  missingRequired: string[];
};

export type ConnectorMeta = {
  id: string;
  provider: string;
  datasetCode: string;
  dataKind: "OBSERVATION" | "FORECAST";
  timeResolution: "HOURLY" | "DAILY" | "MINUTE";
  serviceName: string;
  implemented: boolean;
};

export interface WeatherConnector {
  meta: ConnectorMeta;
  fetch(params: FetchParams): Promise<RawFetchResult>;
  validate(raw: RawFetchResult): ValidationResult;
  normalizeHourly?(items: Record<string, unknown>[]): HourlyObservation[];
  normalizeDaily?(items: Record<string, unknown>[]): DailyObservation[];
}
