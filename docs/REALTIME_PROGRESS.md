# 실시간·예보 통계 확장 진행 기록 (docs/REALTIME_SPEC.md)

## 1단계 · 기존 시스템 분석 및 데이터 검증 (2026-10-13 19:40 KST)
- 운영 DB(NAS MySQL weatherhub) 확인 결과:
  - ASOS 시간자료·일자료: 8개 지점 모두 1990-01-01 ~ 2026-10-12. 시간자료는 매일 11:30 에 전날까지 들어온다(오늘 관측은 ASOS 에 없음).
  - 초단기실황(kma_ultra_ncst): 2026-10-12 00시부터, 매시, 8항목(T1H·RN1·REH·PTY·WSD·VEC·UUU·VVV). 격자 기준(관측소가 아님).
  - 초단기예보(kma_ultra_fcst)·단기예보(kma_vilage_fcst): 2026-10-10 발표분부터, 발표시각(base)·대상시각(fcst)·항목별로 따로 보관. 단기예보는 발표 하나에 약 4~5일 앞까지(TMP·POP·PCP·SKY·PTY·REH·WSD·TMX·TMN 등).
  - 중기예보(kma_mid_items): 06·18시 발표, 4~10일 뒤(육상 wf·rnSt, 기온 taMax·taMin 과 범위), 중기전망 글(wfSv).
  - 지점→격자(weather_stations.nx,ny)와 지점→중기 구역(kma_mid_regions) 표가 따로 있다. 서울 108 = 격자 60,127, 중기 기온 11B10101.
  - 최근 3일 수집 작업: 모든 종류 COMPLETED, 실패 없음.
- 정한 것: 오늘의 '현재 기온'은 초단기실황(격자 값)이고 ASOS 관측소 값이 아니라고 화면에 밝힌다. 과거 평균은 ASOS 시간자료(관측소)로 계산하므로 '관측소 과거 평균 vs 격자 실황'이라는 점을 설명에 적는다.
- 회귀 기준: 기존 공개 API 응답 해시(scripts/rt-regress.sh)를 운영과 비교.
