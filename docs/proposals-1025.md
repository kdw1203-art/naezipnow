# 다음 작업 제안 30 — 2026-09-29 검토

근거는 세 가지다: ① 오늘 새벽 첫 실행된 1024 크론 로그(`market_ingest_log` 2103~2107) ② 1022~1024 담당 보고의 "못 한 것" ③ 운영 DB·Supabase 어드바이저 실측. 크기는 S(반나절) · M(하루) · L(2일+). 담당은 AGENT(세션이 함) / OWNER(계정 소유자만 가능).
순서는 "지금 깨져 있는 것 → 어제 만든 것을 완성하는 것 → 타 사이트 표준 → 성장 → 품질".

## A. 지금 실제로 실패하고 있는 것(오늘 로그)

| # | 제안 | 근거(실측) | 어디 | 크기 | 담당 |
|---|---|---|---|---|---|
| 1 | **K-apt 관리비 크론 수리** — 실제 API 는 오퍼레이션 22개(공용관리비 17 `getHsmpLaborCostInfoV3`·`getHsmpTaxdueInfoV3`·`getHsmpCleaningCostInfoV3`·`getHsmpGuardCostInfoV3`·`getHsmpElevatorMntncCostInfoV3`… / 개별사용료 5 `getHsmpHeatCostInfoV3`·`getHsmpElectricityCostInfoV3`·`getHsmpWaterCostInfoV3`…), 경로 `apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3`·`AptIndvdlzManageCostServiceV3`, 파라미터 `kaptCode`·`searchDate(YYYYMM)`, 응답 `response.body.item` 의 항목별 금액 칸 합 | 첫 실행 `처리=200 적재=0 실패=200 · HTTP 400` — 1024 가 미검증으로 표시한 오퍼레이션명이 틀렸다 | `lib/national-data/kapt-mgmt-fee-api.ts` | M | AGENT |
| 2 | **비아파트(오피스텔·연립·단독) 실거래 API 활용신청** — 같은 인증키라도 RTMS 서비스마다 data.go.kr 에서 따로 신청해야 한다(오피스텔 매매/전월세·연립다세대 매매/전월세·단독다가구 매매/전월세 6종) | 첫 실행 42건 전부 `국토부 API 응답 실패(네트워크·5xx·오류 XML)`, 같은 키의 아파트 호출은 정상 → 미신청 오류 XML 가능성 | data.go.kr 마이페이지 | S | OWNER |
| 3 | **국토부 오류 XML 의 `resultCode·resultMsg` 를 로그에 남기기** — 지금은 "응답 실패" 한 문장이라 2번의 원인을 사이트 로그로 확정할 수 없다 | 로그 2104·2105 | `lib/national-data/molit-api.ts` | S | AGENT |
| 4 | **학교·지하철 POI 크론 산출물 0행 원인 확인** — 단지 상세 학교·지하철 카드가 이 표에 달려 있다 | `poi_schools`·`poi_stations` 0행, `poi-ingest` 크론은 등록됨 | 키(교육부·국토부 역 좌표) 또는 실행 로그 | S | OWNER→AGENT |
| 5 | **이력 백필 속도 상향** — 첫 실행 40곳·40,153행·오류 0 으로 정상. 하루 40곳이면 수도권 5년치가 2~3개월 | 로그 2103 · 일일 호출 여유(한도 10,000 중 ≈900 사용) | `lib/market/molit-history-backfill.ts` 상한 40→160곳 + 크론 하루 2회 | S | AGENT |
| 6 | **크론 산출물 하트비트에 1024 크론 3개 편입** — "돌았다" 가 아니라 "행이 생겼다" 를 감시(관리비 0행이 하루 넘게 지속되면 경보) | 운영 정본 P3 자동화 로드맵 1번 | `ops.etl_freshness` / `freshness-watch` | S | AGENT |

## B. 어제(1024) 만든 것을 완성하기

| # | 제안 | 근거 | 어디 | 크기 | 담당 |
|---|---|---|---|---|---|
| 7 | **타입별 전세·월세 그래프와 타입별 갭** — 전월세 로더가 `area_m2` 를 안 읽어 지금은 "전 타입" 캡션 | 담당 R 보고 1 | `lib/market/rent.ts` select + `complex-v2-model` | M | AGENT |
| 8 | **해제(취소) 거래 행 표시** — 표 모델·취소선·"해제" 배지는 준비됐고 로더가 `is_cancelled=false` 만 읽는다 | 담당 R 보고 · 실거래 표 해제 12,725건 존재 | `getComplexDeals` 에 `includeCancelled` | S | AGENT |
| 9 | **기간 칩 3년·5년 자동 활성 + 연 단위 축** — 백필이 쌓이면 9개월 축(월)로는 5년을 못 그린다: 36개월 넘으면 분기 중앙값, 60개월 넘으면 반기 | 5번이 진행되면 필연 | `TxTrendChart`·`complex-v2-model` | M | AGENT |
| 10 | **관리비 카드 완성** — 1번 수리 뒤 ㎡당 값(`manageAreaM2` 는 상세 보강이 기존 22k 행을 재보강하지 않아 null) → apt-detail-enrich 를 "면적 없는 행" 도 대상으로 | 담당 Q 보고 | `lib/national-data/apartment-ingest.ts` 선별 조건 | S | AGENT |
| 11 | **`/rent` 데이터가 들어온 뒤 화면 실측 QA** — 산점 400점·표 30건·동 칩은 코드로만 검증됨 | 담당 S 보고 | 2번 뒤 프로덕션 캡처 | S | AGENT |
| 12 | **비아파트 행이 섞이는 조회 6곳 점검** — 지도 클러스터·`complex-store`·`asking-trades`·`complex-compare`·홈 커버리지·저장 검색 알림이 `property_type` 없이 읽는다(동명 오피스텔이 있으면 섞임) | 담당 Q 보고 | 각 select 에 `property_type='apartment'` | S | AGENT |
| 13 | **오피스텔 단지 상세** — 오피스텔은 건물명(`offiNm`)이 있어 단지 화면이 가능하다(연립·단독은 동 단위만) | 2번 뒤 데이터 | `/complex/[id]` 의 property_type 분기 또는 `/rent/[region]/[building]` | L | AGENT |

## C. 타 사이트 표준 대비 아직 빈 것

| # | 제안 | 근거 | 어디 | 크기 | 담당 |
|---|---|---|---|---|---|
| 14 | **타입별 세대수·평면 타입** — K-apt 기본정보에는 없고 "공동주택 단지 상세(세대 유형별)" API 가 따로 있다 | 시안에서 "세대 —" 로 남음 | 새 크론 + `apartment_complexes.metadata.unitTypes` | M | AGENT |
| 15 | **용적률·건폐율·대지면적** — K-apt 상세(`kaptDongCnt·kaptBcompany` 옆 `kaptTarea` 등)에 있다 | 개요 스트립 8칸 중 없는 표준 항목 | `apt-detail-enrich` 필드 추가 | S | AGENT |
| 16 | **전고점 대비 %·거래 회전율(연 거래/세대)** — 백필 뒤 계산 가능한 두 지표(아실 표준) | 5번 뒤 | `complex-v2-model` 순수 함수 | S | AGENT |
| 17 | **인근 단지 비교 표(같은 동 상위 5, 같은 타입 최근가·전세가율)** — 레일의 인근 단지는 이름·세대만 | 시안 레일 | `ComplexRail` | S | AGENT |
| 18 | **단지 상세 공유 카드(OG)를 v2 머리로** — 카카오 미리보기가 옛 네이비 히어로 값 | 1024 에서 머리를 바꿈 | `app/complex/[id]/opengraph-image` | S | AGENT |

## D. 성장 회로(전략 v2 4주 실행표에서 아직 안 한 것)

| # | 제안 | 근거 | 어디 | 크기 | 담당 |
|---|---|---|---|---|---|
| 19 | **노트 저장 완료 → 카카오 공유 카드 첫 버튼** | 작성자 1명·공유 유입 0 | `notes/new` 완료 화면 | S | AGENT |
| 20 | **실거래 게임 결과 공유 카드 + 매일 문제 자동 갱신** | 가입 전 유입 회로 | `app/quiz` | M | AGENT |
| 21 | **Lab 노트 매일 1편 예약 생산(안양·과천·의왕 실거래 20건+ 단지 50곳 큐)** | 작성자 1명 · 지역 깊이 전략 | 예약 세션 + 관리자 승인 1클릭 | M | AGENT |
| 22 | **네이버 블로그 초안 내보내기 버튼**(제목·요약·링크·대표 이미지 복사) | 30일 네이버 랜딩 4건 | `/admin` 노트 행 | S | AGENT |
| 23 | **주간 브리핑 첫 줄을 계기판으로 교체**(회원·순방문·작성자 수·소셜 큐 최고령·owner-checklist 체류·크론 산출물) | 전략 v2 R5 | 브리핑 트리거 프롬프트 | S | AGENT |
| 24 | **소셜 큐 결정** — IG·YT 키 등록 또는 `social-autopost` 크론 정지 | 42건 큐 42일째 발행 0 | Vercel env / vercel.json | S | OWNER |
| 25 | **세션용 GitHub 배포 키** — 매 차수 PowerShell 적용을 없앤다 | 병목 B5 | GitHub fine-grained PAT(contents:write) | S | OWNER |

## E. 품질·운영

| # | 제안 | 근거 | 어디 | 크기 | 담당 |
|---|---|---|---|---|---|
| 26 | **`market_transactions` 원본 jsonb 정리** — 2026년분 923k 행의 `raw` 가 1.4GB. 해제 판정만 남기고 비우면 표 크기 1/8 | `pg_total_relation_size` 1,477MB · DB 1,991MB | 배치 UPDATE(야간·1만 행씩) + `keepRaw:false` 를 일일 크론에도 | M | AGENT |
| 27 | **`vector`·`pg_net` 확장을 public 밖으로** | Supabase 어드바이저 WARN 2 | 마이그레이션(`extensions` 스키마) | S | AGENT |
| 28 | **anon 실행 가능한 SECURITY DEFINER 함수 9개 재점검** — `get_automation_script`·`ingest_daily_news` 는 비밀값 검사로 의도된 것, 나머지 7개(지도 RPC·검색)는 `security_invoker` 전환 가능 여부 | 어드바이저 WARN 9 | 마이그레이션 | M | AGENT |
| 29 | **고아 부품 정리** — `PriceTrendChart/Lazy/Panel`(1024 뒤 미사용, 잠금 테스트가 붙잡음) · 사이트 나머지 `text-[px]` 190곳(admin·listings·payment·calculator·auth) | 담당 R 보고 · review-1022 §5 | 잠금 테스트 갱신 + 램프 치환 | M | AGENT |
| 30 | **에러 화면 "다시 시도" 를 청크 로드 실패에 한해 자동 새로고침 1회** — 배포 직후 옛 청크를 든 탭이 "화면을 그리는 중 문제" 를 본다 | 오늘 프로덕션 확인 중 2회 관측(`Loading chunk … failed`) | `app/error.tsx`·`complex/[id]/error.tsx` | S | AGENT |

## 권장 순서(1025 차수)
1·3·5·6·8·12·30 (S/M, 오늘 깨진 것과 반쪽인 것) → 7·9·10·16·17·18 (단지 상세 완성) → 19·20·22·23 (성장). 2·4·24·25 는 OWNER 4건(합계 1시간) — 이 중 2번이 안 되면 11·13 은 열리지 않는다.
