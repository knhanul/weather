import { HOURLY_KNOWN_FIELDS, TIMEZONE, type HourlyObservation } from "../types";
import { mapKmaResult, ProviderError } from "../errors";
import { emptyToNull, normalizeQc, parseNullableInt, parseNullableNumber } from "../qc";
import { asItems, callKma, readHeader, readPaging, unknownFields } from "./kma-client";
import type { FetchParams, RawFetchResult, ValidationResult, WeatherConnector } from "./types";

const REQUIRED = ["tm", "stnId"];

function parseTm(tm: string): string {
  const v = tm.trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}$/.test(v)) return `${v}:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
  throw new ProviderError("SCHEMA", `관측시각 형식이 예상과 다릅니다: ${tm}`);
}

export const kmaAsosHourly: WeatherConnector = {
  meta: {
    id: "kma_asos_hourly",
    provider: "KMA",
    datasetCode: "ASOS_HOURLY",
    dataKind: "OBSERVATION",
    timeResolution: "HOURLY",
    serviceName: "지상(종관, ASOS) 시간자료 조회서비스",
    implemented: true,
  },

  async fetch(params: FetchParams): Promise<RawFetchResult> {
    const from = params.from;
    const to = params.to;
    const result = await callKma({
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
      missingRequired: [...missingRequired],
    };
  },

  normalizeHourly(items: Record<string, unknown>[]): HourlyObservation[] {
    return items.map((item) => {
      const tm = emptyToNull(item.tm);
      const stnId = emptyToNull(item.stnId);
      if (!tm || !stnId) {
        throw new ProviderError("SCHEMA", "필수 필드(tm, stnId)가 없습니다.");
      }
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
        qualityPressure: normalizeQc(paQc),
      };
    });
  },
};
