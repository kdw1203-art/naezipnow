# 1030 — 추가 개선 30 재검토 → 진행 18(7묶음) · 보류 6 · 불필요 6

소유자(2026-10-04) 요청: 추가 개선사항 30가지를 분석하고, 필요한지·통합할 수 있는지 재검토한 뒤 제안할 것 · 개선 전후 이미지 제공.

기준: 1029b(tree d4df598c). 1029(1190a0c9) 위에서도 적용된다(1029b 가 1029 를 포함하므로 1029 만 푸시했다면 이 묶음이 1029b 를 함께 싣는다). **DB 변경 1건(FK 인덱스 2개 · 결정 뒤 적용)**. 요금제·결제 화면은 손대지 않았다(심사 동결 검사 통과).

실측: 운영 39경로 데스크톱·폰 전면 캡처 · 본문 글자 전수 · Vercel 7일 런타임 오류 · Supabase 보안·성능 advisor · 수집 기록 7일 · 코드 확인. 후보 30의 근거·판정 전수는 제안서(Claude 문서)에 있다.

## G1 남은 설명문·권유문 낱말화 (후보 1 · 5 · 6)
- 홈 h1(sr-only) "발로 뛴 임장을 데이터·결정으로 바꾸는 부동산 플랫폼" → "임장노트 · 실거래가 지도 · AI 분석 · 지역 분석 · 부동산 임장 플랫폼" · 히어로 "어느 단지가 궁금하세요?" → "단지 · 동네 검색"(lib/brand/home-copy.ts · app/page.tsx).
- 잔여 해요체: 노트 쓰기 AI 고지(합니다·해요 혼용 → "기록 완료 시 노트 본문 → 외부 AI API 전송(AI 정리용) · 사진 저장 시 위치정보(EXIF) 자동 제거 · 자세한 내용 [개인정보처리방침]" — "AI API 전송" 글자 유지, check:final-release 통과) · 마이 메타 설명 · 중개사 "담당 단지 관심 등록 → 새 실거래·가격 변동 수신함 알림" · 월간 리포트 머리글 · 여정 "날짜 입력 → 마감 여기 표시" · 가입 "(선택) 혜택·소식 이메일 수신 · 설정에서 언제든 철회" · 시세·타이밍 추세 문장 6종(lib/market/temperature.ts: "최근 3개월 평균 +0.47% · 직전 -0.12% · 상승 흐름 강화" 등) · 동네 "목록 끝 · 이 조건" · 인용 안내(CitationBlock) · 청약 빈 상태 4곳(ApplySearchClient · calendar · applyhome-search detailNotice).
- 그래프 접근성 라벨 "좌우 화살표 키로 칸마다 값을 볼 수 있어요" → "좌우 화살표 키 · 칸별 값 읽기"(ScrubLine · TimingOverlayChart).

## G2 긴 설명 문단 낱말화·중복 제거 (후보 2 · 3 · 4)
- 단지 홈 상단 문단(lib/seo/citable-summary.ts): 첫 문장(검색 인용용 완결 문장)은 그대로, 2~4번째 문장은 사실 낱말("최근 12개월 매매 400건, 60㎡ 미만 중앙 7억 · 매매 신고 기준 · 중앙값 면적 미가중" / "전월세 신고 기준 · 전세 중앙 5.3억 · 전세가율 54.6%(6개월) · 전세가율 = … · 각 표본 3건 이상일 때만" / "4,250세대 · 2016년 준공 · 공동주택 공공데이터 기준"). 같은 숫자가 "요약" 탭에 한 번 더 있다.
- 지역 화면 요약 문단(app/region/[id]/page.tsx): 첫 문장 그대로 + 뒤 5~6문장을 낱말 한 줄("매매가격지수 · 전월 대비 ▼0.42% · 국토교통부 신고 아파트 매매 2026.08 80건(2026.09분 신고 기한 내 · 집계 중) · 최근 9개월 합계 1,793건 · 공개 자료 확인 강남구 정비사업 구역 2곳 · 입주 예정 단지 4곳 · 이웃 공개 임장노트 2편 · 공공 실거래·공표 통계 계산값 · 중개 매물 호가 제외"). "시장 흐름 읽기" 4문단(lib/region/market-read.ts) → 낱말 4줄. FAQ(검색 구조화 데이터)는 완결 문장 유지.
- 정비사업 7단계 설명·유의점·용어 풀이(lib/redevelopment/stage-guide.ts) 해요체 → 낱말. 폰 한 줄 규칙(`html[data-mscale] li p.t-sub`)에 걸려 "…"로 잘리던 단계 설명·유의점은 `.mscale-wrap`(globals.css 끝에 추가)으로 접히게 — 본문이지 목록 메타가 아니다.

## G3 단지 실거래 표기 정확성 (후보 8 · 9)
- 열린 면적 구간의 화면 이름: "~59㎡" → "60㎡ 미만", "135㎡~" → "135㎡ 이상"(lib/complex/area-band-label.ts `areaBandDisplayLabel`; 면적대 카드·요약 문장·단지 머리 수치·진단 메모·공유 메타). 데이터 라벨·슬러그·OG 칩·정렬은 그대로. 지역 평형대 표("60㎡ 미만 (~24평)")와 같은 말.
- 단지 추이 그래프(TxTrendChart·TxTrendSection): 끝에 붙은 빈 달(최대 2칸)은 "거래 없음"이 아니라 "신고 집계 중"(칸 설명·화면낭독 표·범례 "26.09·26.10 신고 집계 중 · 계약 후 30일 내 신고").

## G4 홈·지역·동네 손질 (후보 10 · 11 · 22)
- 동네이야기 카드 제목 = 노트 제목(lib/town/feed.ts; 예전엔 본문 첫 문장 40자).
- 홈 동네이야기 0건이면 한 줄 띠(제목 · 없음 · 쓰기)로 접고 뉴스룸이 두 칸 전폭(데스크톱 3열)(HomeTownBlock). 글이 생기면 예전 2칸.
- "시세 카드 퍼가기"(EmbedSnippet) → 접힌 `<details>`(제목 줄 40px). 지역·단지 화면 모두.

## G5 지도 이름표 규칙 (후보 13 + 15)
- /map: 정비구역 이름표 마커에 `priority: -1`(NaverMap MapMarkerData 에 `priority` 추가) — 겹침 정리에서 시세 핀에 양보한다. 예전엔 동점(0)이라 id 사전순("redev:" < "region:")으로 구역 이름표가 이기고 구 시세 핀이 회색 점으로 접혔다(2026-10-04 운영 실측).
- /redevelopment 지도에 `declutter` — 40곳 이름표가 서울 중심에 포개졌다. 겹치는 구역은 색 점, 확대하면 이름 복귀.

## G6 목록 화면 (후보 16 · 18 · 19)
- 정비사업 "데이터 출처" 표: 폰은 종류별 묶음(dl), 데스크톱은 3열 표(DataSourceCard).
- 공매: 시도 칩 줄(전국·서울·경기·인천·부산·대구·울산·대전 — 2026-10-04 진행 물건이 있는 시도) · 시도만으로 `/api/auctions?sido=`(시군구 없이도) · 시군구 해제는 시도를 남긴다 · 고른 용도·시도 칩의 인라인 흰 글자 삭제(한지 바탕에서 안 보였다)(AuctionsClient).
- 청약 경쟁률 표: 같은 단지가 이어지면 이름·지역 대신 "↳ 해당지역 · 2순위"(ApplySearchClient).

## G7 서버·DB (후보 23 · 25)
- 공개 노트 카드 50장(관련 노트 풀·지역 100장·홈 10장): `metadata` 전체(50행 306KB) 대신 `cover:metadata->cover`(6KB)만 읽는다(lib/inspection/store-db.ts). 7일간 /complex/browse · /analysis/price · /listings/new 의 "inspection_notes 조회 실패 … TimeoutError" 원인.
- FK 인덱스 2개(`note_comments.parent_id` · `subscription_events.subscription_id`) — 2026-10-04 적용(ledger 20261004055224 · 미러 `supabase/migrations/20261004055224_1030_fk_indexes.sql`).

## 보류 6 · 불필요 6
- 보류(소유자 결정·행동): 7 베타 띠 내리는 날짜 · 14 지도(폰) 상단 조작 5줄(별도 시안) · 24 자동화 RPC 2개(get_automation_script·ingest_daily_news)의 anon 실행 — 뉴스 수집 세션이 아직 anon 경로(curl)로 호출 중(10-04 08:35 KST 확인)이라 세션 경로를 바꾼 뒤 회수 · 27 weekly-highs RPC 시간 초과(관리자 전용) · 29 속도 회귀 6경로(적용 뒤 재측정) · 30 수집 실패 3종(관리비 활용신청 · KOSIS 키 · 비아파트 전월세 등록).
- 불필요: 12 홈 폰 칩 줄(가로 스크롤) · 17 노트 피드 1열 · 20 입주 물량 200행(더 보기 있음) · 21 갭 스크리너 데스크톱 107행 · 26 ops 로그 표 PK · 28 data.go.kr 시간 초과 로그.

## 추가 검토(2차) — 후보 31~42 · 진행 8(H1~H4) · 보류 1 · 불필요 3
소유자 "추가로 더 검토해줘"(10-04). 범위: 1차에 없던 운영 36경로 데스크톱·폰 76장 · 본문 글자 23경로 · 폰 탭 크기 검사 35경로 · 빈 공간 검사 · Vercel 24시간 로그(새 오류 없음).

- H1 (31) Lab 자료 조사 노트 상세(app/notes/[id]/page.tsx): 작성자가 내집나우 Lab 이면 방문일이 있어도 현장으로 읽지 않는다 — 머리글 "본문 · 자료 조사" · "방문 기록 비교" 카드 숨김 · 출처 라벨·메타·구조화 데이터 "자료 조사".
- H2 (32) `line-clamp-2` 뒤에 붙은 `block` 이 display 를 덮어 두 줄 자르기가 한 번도 안 걸리던 3곳(app/town/[region]/page.tsx · app/complex/[id]/ComplexNotesNewsAi.tsx · app/dev-deals/DevDealsListClient.tsx)에서 `block` 제거. (33) 단지 비교 /complex/compare 데스크톱 42,782px → 지역별 `<details>`(첫 지역만 열림) + "지역 바로가기" 칩 nav. (34) 리포트 진열대 /notes/market 커버 상자 `aspect-[1200/630]`.
- H3 (35) 잔여 해요체·설명문 11곳 낱말화: 중개사(app/agent) · 파트너(app/partners) · 크리에이터 h1 "임장 콘텐츠 · 자료실 리포트 판매" · 매물 메타 · 포인트 메타 · 퀴즈 · 개발자 · iOS 홈 화면 안내("사파리 공유 → 홈 화면에 추가 · 주소창·탭바 없는 전체 화면") · "준비 중" 4곳(ComplexSummaryTable · map-client · town/news · messages). (36) 열린 면적 구간 이름 3곳 더: app/analysis/price/page.tsx · lib/market/tx-bands.ts · app/notes/[id]/page.tsx.
- H4 (37) 실매물 0건이면 구 칩 줄 숨김(app/listings/ListingsListClient.tsx). (41) 검색 결과 "지도 · 더 보기" 링크 탭 20px → 24px(app/search/search-client.tsx) — 35경로 탭 검사의 유일한 미달.
- 보류: 38 시장 온도 시·도 격자 14칸 "기록 없음"(격자 설계). 불필요: 39 로그인·가입 빈칸(가운데 정렬) · 40 단지 목록 폰 표 가로 스크롤(의도) · 42 관리자 data-health 빈 메시지 로그(관리자 전용).
- 테스트 +4(tests/unit/seoul-upis-1029.test.ts 끝) · 전/후 그림 7장(제안서 "추가 검토(2차)").

## 추가 검토(3차) — 후보 43~53 · 진행 6(I1~I3) · 보류 3 · 불필요 2
세 번째 "추가로 더 검토해줘"(10-04). 1·2차와 다른 축: 운영 68경로 × 데스크톱·폰 콘솔 오류·실패 요청·응답 코드 · 다크 모드 44경로 캡처+axe 대비 · 폰 320/360/390·태블릿 820/1024 가로 넘침(0) · 메타(title/description/canonical/h1/JSON-LD) · 없는 id 7종 · 키보드 Tab 1,306 정지점 · axe 접근성 · pg_stat_statements(8/4~10/4) · Vercel 12시간 오류(0).

- I1 (43) 커버리지 수치(lib/newui/home-coverage.ts): `public.coverage_totals` 1행(48시간 안)을 먼저 읽고 없으면 예전처럼 직접 센다 — 전수 count 세 질의가 평균 6.7초+1.1초+0.3초였고 7일 캐시가 매일 수집으로 비워져 첫 렌더가 기다렸다. **DB 1건**(표·`refresh_coverage_totals()`·cron `coverage-totals-daily` 19:20 UTC)은 이 세션의 자동 승인 분류기가 막아 **소유자가 Supabase SQL 편집기에서 `docs/sql/1030_coverage_totals.sql` 을 그대로 실행**한 뒤 `select public.refresh_coverage_totals();` 한 번 — 그 전까지 코드는 표가 없는 것으로 보고 예전처럼 직접 센다(화면 변화 없음). (44) CSP script-src·connect-src 에 `https://fundingchoicesmessages.google.com`(애드센스 동반 도메인) 허용 — 전 화면 콘솔 오류 1 + 위반 리포트 7일 739건(= csp-report 함수 739회) 제거(lib/security/content-security-policy.ts).
- I2 (45) /town 하이드레이션 불일치(React #418 데스크톱·폰): ISR 하루 캐시 서버 HTML 의 NEW(24시간) 판정과 클라이언트 Date.now() 판정이 달랐다 → 서버 렌더 시각 `now` 를 TownFeed → 카드로 넘겨 그 시각 기준(app/town/feed-client.tsx · page.tsx). (46) /apply 다크: `style={THEME_APPLY}` 래퍼(--primary #1d4fd8·--primary-soft #edf2fe 인라인 고정)가 .dark 토큰을 덮어 링크·칩이 어두운 파랑(대비 2.6:1)·아이콘 상자가 흰 하늘색 → 래퍼 제거, lib/theme/presets.ts 삭제(다른 프리셋 3개도 미사용).
- I3 (47) 키보드: 가로 스크롤 영역 `tabIndex={0}`(StepLine ol · 지역 면적대 표 · 정비 단계 줄 · 개발자 pre 2) · 지도 검색칸 껍데기 `field-focus`(MapSearchBox) · 출퇴근 "회사 주소" 입력 outline-none 제거 · `main#main-content`(not-found · LoginClient · notes/market · NoteForm) · 여정 마감 카드 id `jr-deadline-title-{phone|desk}`. (48) 없는 글 메타 13곳 "~를 찾을 수 없습니다/없어요" → "○○ 없음"(404 · 단지 2 · 동네 · 이야기 · 기사 · 뉴스 주제 · 템플릿 2 · 노트 카드 · 질문 2 · 지역 리포트 2 · 개발물건 · 임베드).
- 보류: 49 소프트 404(없는 id → 200+noindex · loading 경계 위 존재 확인이 필요한 구조 · 2026-08-10 메모) · 50 색 대비(검색 고스트 3.3 · 온도 타일 3.6 · Lab 도장 4.3 · 다크 btn-primary 3.2 — 토큰) · 53 다크 모드의 네이버 지도 라이트 타일. 불필요: 51 iOS maximum-scale(핀치 허용) · 52 /qna h1(보관 경로).
- 테스트 +6(tests/unit/seoul-upis-1029.test.ts 끝) · 전/후 그림 6장(제안서 "추가 검토(3차)" · 다크·키보드는 운영 화면 시안, 나머지는 수치 판).

## 추가 검토(4차 · 디자인) — 후보 54~64 · 진행 6(J1~J3) · 보류 3 · 불필요 2
소유자 "디자인적으로 개선해야 할 점"(10-04). 운영 캡처 59경로(데스크톱·폰·다크)를 디자인 시스템 규칙 10·채점표에 대고 보고, 43경로에서 글자 크기·굵기·반경·그림자·색·카드 여백·채움 파랑 수·본문 줄 길이를 기계로 쟀다.

- J1 (54) 헤더 "노트 쓰기" `btn-primary` → `btn-outline`(app/components/Header.tsx) — 데스크톱 43경로 중 22경로가 헤더 파랑 + 화면 파랑 둘(단지 홈·공개 노트는 같은 이름 둘, 중개사 셋). 규칙 9 "화면당 1개" · 1014 메모. 폰 헤더엔 없어 폰 그대로.
- J2 (55) 굵기 600 → 세 단계: globals.css 끝 `:root{--font-weight-semibold:700}` + `.chip,.chip-tag` 500 · `.chip-active,.delta-arrow,.delta-sub,.pxc-th` 700 — 실측 글자 요소 13,711개 중 2,096개가 600(font-semibold 429곳 + CSS 5종).
- J3 (56) 면적대 선반 막대 세로 64px → 가로 6px(`.pxs-bar` 재정의 · BandShelf width) · (57) 청약 센터 섹션의 "청약 캘린더" 알약 제거(머리글 버튼과 중복) · (59) 정비사업 지도·목록·내용 탭 활성 `bg-primary text-white` → `chip-active`(RedevelopmentMap) · (61) `.measure{max-width:72ch}` — QaBlock 답 · ComplianceNotice 문단(데스크톱 95~117자/행).
- 보류: 58 단지 비교 빈 상태 점선 격자(1026b 승인 시안) · 60 카드 안쪽 여백 화면마다 3~7종(토큰 2단 통일 — J4 결정 뒤 다음 묶음) · 62 다크 지도 타일(3차 53). 불필요: 63 로그인 벽 흰 여백 · 64 폰 반픽셀 글자(1026c 소유자 값).
- 테스트 +3 · 전/후 그림 7장(제안서 "추가 검토(4차 · 디자인)" · 운영 화면 시안).

## 5차 — 관리자 화면 지적(데이터 품질 · 데이터 관리 캡처) · 진행 3
소유자가 보낸 관리자 캡처 2장(10-04): "마지막 수집 실패 4건 — molit 비아파트 12곳 중 42곳 실패" · 데이터 품질 "같은 구 안에 같은 이름 단지 57(확인 필요)".
- 원인: market_ingest_log 실측 — 국토부 응답 "RTMSDataSvcRHRent 30 등록되지 않은 서비스키"(resultCode 30 = 그 서비스의 **활용신청이 안 됨**, 1차 후보 30과 같은 건). 수집기는 매일 42회를 두드려 42회 실패하고 "실패 · 0행"으로만 남겼다.
- (65) lib/market/molit-transactions.ts: 첫 응답이 resultCode 30 이면 그 실행을 멈추고 사유를 적는다 — "활용신청 필요 — RTMSDataSvcRHRent: 공공데이터포털에서 활용신청 승인 뒤 다음 실행이 이어서 받는다 · 남은 시군구 N곳 시도 안 함". 판별 `isServiceNotRegistered`(lib/market/ingest-outcome.ts).
- (66) lib/market/molit-nonapt.ts 로그의 `시도=` 를 실행 전체로(예전엔 최근월 조각만이라 "12곳 중 42곳 실패") · app/admin/data/page.tsx 문제 소스 목록에 사유 줄(message 의 " — " 뒤) 표시.
- (67) K-apt 테스트 행(이름 test·테스트·한국감정원·한국부동산원테스트1 — 대장 13행 실측)은 적재에서 거른다(lib/national-data/apartment-ingest.ts `KAPT_TEST_NAME_RE`). 이미 들어간 13행은 `docs/sql/1030_kapt_test_rows.sql`(metadata 표식 · 삭제 아님)을 소유자가 실행 — 품질 검사의 "같은 주소 8군 중 3군"이 그것.
- 소유자 할 일: 공공데이터포털에서 **국토교통부_오피스텔 전월세(RTMSDataSvcOffiRent) · 연립다세대 전월세(RTMSDataSvcRHRent) · 단독/다가구 전월세(RTMSDataSvcSHRent)** 활용신청(매매 쪽 Trade 서비스도 같이) — 승인되면 수집이 저절로 재개된다. 지역 월간 집계의 "수집 로그 없음"은 DB 크론이 로그를 남기지 않는 것(화면 메모 그대로 · 이번 묶음 밖).
- 테스트 +3.

## 검증
- `npm run build` 전체 통과 · 테스트 1,769(+7 +4 +6 +3 +3) · 번들 예산 그대로(484/354/486/468/468/470).
- 전/후 그림 14장 + 2차 7장(제안서) · 지도 2장은 운영 화면에 새 규칙을 얹은 시안(확인용 화면은 지도 키가 없다) · 노트 상세·리포트 진열대·매물 "후"는 운영 화면 시안(확인용 화면이 노트·매물을 못 읽는다).
