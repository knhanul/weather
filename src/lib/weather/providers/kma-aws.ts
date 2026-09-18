import { ProviderError } from "../errors";
import type { FetchParams, RawFetchResult, ValidationResult, WeatherConnector } from "./types";

/**
 * AWS (방재기상관측) connector is registered so a second provider can be
 * enabled without rewriting collectors. The public data.go.kr AWS service
 * currently exposed as Aws1miInfoService is 1-minute data for the last 2 days,
 * not hourly climate archives — hourly AWS is therefore marked unimplemented
 * until an official hourly contract is confirmed.
 */
export const kmaAwsHourly: WeatherConnector = {
  meta: {
    id: "kma_aws_hourly",
    provider: "KMA",
    datasetCode: "AWS_HOURLY",
    dataKind: "OBSERVATION",
    timeResolution: "HOURLY",
    serviceName: "지상(방재, AWS) 기상관측자료 조회서비스",
    implemented: false,
  },

  async fetch(_params: FetchParams): Promise<RawFetchResult> {
    throw new ProviderError(
      "BAD_REQUEST",
      "AWS 시간자료 커넥터는 준비되어 있으나, 공식 시간자료 API 계약이 확인되지 않아 수집을 시작하지 않습니다. 현재 공공데이터포털 AWS 서비스는 최근 2일 1분 자료(Aws1miInfoService)입니다.",
    );
  },

  validate(): ValidationResult {
    return {
      ok: false,
      items: [],
      totalCount: 0,
      pageNo: 1,
      numOfRows: 0,
      unknownFields: [],
      missingRequired: [],
      resultMsg: "미구현 커넥터",
    };
  },
};
