export const TIMEZONE = "Asia/Seoul" as const;

export const ROLES = ["ADMIN", "DATA_MANAGER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const DATA_KINDS = ["OBSERVATION", "FORECAST"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export const QUALITIES = ["NORMAL", "SUSPECT", "INVALID", "MISSING"] as const;
export type Quality = (typeof QUALITIES)[number];

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type HourlyObservation = {
  provider: string;
  datasetCode: string;
  stationId: string;
  observationDatetime: string; // YYYY-MM-DD HH:mm:ss in Asia/Seoul
  timezone: typeof TIMEZONE;
  temperature: number | null;
  temperatureQc: string | null;
  precipitation: number | null;
  precipitationQc: string | null;
  humidity: number | null;
  humidityQc: string | null;
  windSpeed: number | null;
  windSpeedQc: string | null;
  windDirection: number | null;
  windDirectionQc: string | null;
  pressure: number | null;
  pressureQc: string | null;
  seaLevelPressure: number | null;
  seaLevelPressureQc: string | null;
  sunshine: number | null;
  sunshineQc: string | null;
  solarRadiation: number | null;
  snowDepth: number | null;
  snow3hour: number | null;
  visibility: number | null;
  cloudCover: number | null;
  lowMidCloudCover: number | null;
  cloudType: string | null;
  ceiling: number | null;
  groundTemperature: number | null;
  groundTemperatureQc: string | null;
  vaporPressure: number | null;
  dewPoint: number | null;
  weatherPhenomenonCode: string | null;
  soilTemp5cm: number | null;
  soilTemp10cm: number | null;
  soilTemp20cm: number | null;
  soilTemp30cm: number | null;
  qualityTemperature: Quality;
  qualityPrecipitation: Quality;
  qualityHumidity: Quality;
  qualityWind: Quality;
  qualityPressure: Quality;
};

export type DailyObservation = {
  provider: string;
  datasetCode: string;
  stationId: string;
  observationDate: string; // YYYY-MM-DD
  timezone: typeof TIMEZONE;
  avgTemperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  precipitation: number | null;
  avgHumidity: number | null;
  minHumidity: number | null;
  snowDepth: number | null;
  snowFresh: number | null;
  sunshineHours: number | null;
  solarRadiation: number | null;
  avgWindSpeed: number | null;
  maxWindSpeed: number | null;
  avgPressure: number | null;
  sourceKind: "OFFICIAL" | "AGGREGATED_HOURLY";
};

export const HOURLY_KNOWN_FIELDS = [
  "tm",
  "rnum",
  "stnId",
  "stnNm",
  "ta",
  "taQcflg",
  "rn",
  "rnQcflg",
  "ws",
  "wsQcflg",
  "wd",
  "wdQcflg",
  "hm",
  "hmQcflg",
  "pv",
  "td",
  "pa",
  "paQcflg",
  "ps",
  "psQcflg",
  "ss",
  "ssQcflg",
  "icsr",
  "dsnw",
  "hr3Fhsc",
  "dc10Tca",
  "dc10LmcsCa",
  "clfmAbbrCd",
  "lcsCh",
  "vs",
  "gndSttCd",
  "dmstMtphNo",
  "ts",
  "tsQcflg",
  "m005Te",
  "m01Te",
  "m02Te",
  "m03Te",
] as const;

export const DAILY_KNOWN_FIELDS = [
  "tm",
  "stnId",
  "stnNm",
  "avgTa",
  "minTa",
  "minTaHrmt",
  "maxTa",
  "maxTaHrmt",
  "sumRn",
  "sumRnDur",
  "hr1MaxRn",
  "hr1MaxRnHrmt",
  "mi10MaxRn",
  "mi10MaxRnHrmt",
  "avgRhm",
  "minRhm",
  "minRhmHrmt",
  "avgWs",
  "maxWs",
  "maxWsWd",
  "maxWsHrmt",
  "maxInsWs",
  "maxInsWsWd",
  "maxInsWsHrmt",
  "maxWd",
  "hr24SumRws",
  "avgTd",
  "avgPv",
  "avgPa",
  "avgPs",
  "maxPs",
  "maxPsHrmt",
  "minPs",
  "minPsHrmt",
  "ssDur",
  "sumSsHr",
  "sumGsr",
  "hr1MaxIcsr",
  "hr1MaxIcsrHrmt",
  "ddMes",
  "ddMesHrmt",
  "ddMefs",
  "ddMefsHrmt",
  "sumDpthFhsc",
  "avgTca",
  "avgLmac",
  "avgTs",
  "minTg",
  "avgCm5Te",
  "avgCm10Te",
  "avgCm20Te",
  "avgCm30Te",
  "avgM05Te",
  "avgM10Te",
  "avgM15Te",
  "avgM30Te",
  "avgM50Te",
  "sumLrgEv",
  "sumSmlEv",
  "n99Rn",
  "sumFogDur",
  "iscs",
] as const;

export const EXPORT_COLUMNS = [
  { key: "observation_datetime", label: "관측일시", group: "hourly", defaultOn: true },
  { key: "observation_date", label: "관측일자", group: "daily", defaultOn: true },
  { key: "station_id", label: "지점번호", group: "both", defaultOn: true },
  { key: "station_name", label: "지점명", group: "both", defaultOn: true },
  { key: "temperature", label: "기온(°C)", group: "hourly", defaultOn: true },
  { key: "avg_temperature", label: "평균기온(°C)", group: "daily", defaultOn: true },
  { key: "min_temperature", label: "최저기온(°C)", group: "daily", defaultOn: true },
  { key: "max_temperature", label: "최고기온(°C)", group: "daily", defaultOn: true },
  { key: "precipitation", label: "강수량(mm)", group: "both", defaultOn: true },
  { key: "humidity", label: "습도(%)", group: "hourly", defaultOn: true },
  { key: "avg_humidity", label: "평균습도(%)", group: "daily", defaultOn: true },
  { key: "wind_speed", label: "풍속(m/s)", group: "hourly", defaultOn: false },
  { key: "wind_direction", label: "풍향", group: "hourly", defaultOn: false },
  { key: "avg_wind_speed", label: "평균풍속(m/s)", group: "daily", defaultOn: false },
  { key: "pressure", label: "현지기압(hPa)", group: "hourly", defaultOn: false },
  { key: "sunshine", label: "일조(hr)", group: "hourly", defaultOn: false },
  { key: "sunshine_hours", label: "합계일조(hr)", group: "daily", defaultOn: false },
  { key: "solar_radiation", label: "일사(MJ/m²)", group: "both", defaultOn: false },
  { key: "snow_depth", label: "적설(cm)", group: "both", defaultOn: false },
  { key: "visibility", label: "시정(10m)", group: "hourly", defaultOn: false },
  { key: "quality_temperature", label: "기온품질", group: "hourly", defaultOn: true },
] as const;
