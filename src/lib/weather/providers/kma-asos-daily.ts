import { DAILY_KNOWN_FIELDS, TIMEZONE, type DailyObservation } from "../types";
import { mapKmaResult, ProviderError } from "../errors";
import { emptyToNull, parseNullableNumber } from "../qc";
import { asItems, callKma, readHeader, readPaging, unknownFields } from "./kma-client";
import type { FetchParams, RawFetchResult, ValidationResult, WeatherConnector } from "./types";

const REQUIRED = ["tm", "stnId"];

export const kmaAsosDaily: WeatherConnector = {
  meta: {
    id: "kma_asos_daily",
    provider: "KMA",
    datasetCode: "ASOS_DAILY",
    dataKind: "OBSERVATION",
    timeResolution: "DAILY",
    serviceName: "지상(종관, ASOS) 일자료 조회서비스",
    implemented: true,
  },

  async fetch(params: FetchParams): Promise<RawFetchResult> {
    const result = await callKma({
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
        stnIds: params.stationId,
      },
    });
    return result;
  },

  validate(raw: RawFetchResult): ValidationResult {
    const header = readHeader(raw.parsed);
    const mapped = mapKmaResult(header.resultCode, header.resultMsg);
    const paging = readPaging(raw.parsed);
    if (!mapped.ok) {
      return {
        ok: false,
        resultCode: header.resultCode,
        resultMsg: mapped.message,
        items: [],
        totalCount: paging.totalCount,
        pageNo: paging.pageNo,
        numOfRows: paging.numOfRows,
        unknownFields: [],
        missingRequired: [],
      };
    }
    const items = asItems(raw.parsed);
    const missingRequired = new Set<string>();
    const unknown = new Set<string>();
    for (const item of items) {
      for (const key of REQUIRED) {
        if (emptyToNull(item[key]) === null) missingRequired.add(key);
      }
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
      missingRequired: [...missingRequired],
    };
  },

  normalizeDaily(items: Record<string, unknown>[]): DailyObservation[] {
    return items.map((item) => {
      const tm = emptyToNull(item.tm);
      const stnId = emptyToNull(item.stnId);
      if (!tm || !stnId) {
        throw new ProviderError("SCHEMA", "필수 필드(tm, stnId)가 없습니다.");
      }
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
        sourceKind: "OFFICIAL",
      };
    });
  },
};
