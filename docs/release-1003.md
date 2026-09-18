# 1003 — 토스 2차 반려 대응(타이핑 0 결제창) · 동네 메뉴 복구 · ETL 실패 정리

소유자 지시(2026-09-17): "토스 반려가 계속 되고 있어 — 개선해줘", "메뉴에서 동네이야기가 사라졌어
페이지가 나오도록 다시 돌려놓고 개선해줘", (GitHub Actions 실패 화면·운영 경보 화면) "해당 내용에 대해서도 개선해줘",
"홈페이지 주소는 naezipnow.com 으로 변경할 거야". 심사 대응의 상세 분석·재신청 메모는 `docs/toss-review-1003.md`.

## A. 토스 심사 — 왜 두 번째도 반려됐나(실측)

`page_view_events`·`payments` 실측(2026-09-17): 2026-09-16 13:57 KST 세션이 `/` → `/subscription`(13.5초) → `/` 이탈.
`/subscription/checkout` 페이지뷰 0건, 2026-09-11 이후 주문 0건. **1001 이 만든 비회원 결제 경로는
운영에서 한 번도 실행된 적이 없다.** 길이 없어서가 아니라 가려져 있었다 — GNB 에 결제 진입로 부재,
1순위 버튼의 2단계 확인, 결제창 앞의 이메일 입력.

바뀐 것:
- **이메일 선택화** — `lib/payments/guest-order.ts readGuestEmailInput`(클라이언트·서버 공용).
  비우면 `user_email = null` 주문(`metadata.guest=true, claimPending=true`)을 만들고 곧바로 결제창을 연다.
  `app/api/payments/toss/create/route.ts`: 이메일 없는 게스트 주문은 **재사용하지 않는다**(다른 방문자의 주문을 물려주면 승인이 남의 주문에 붙는다).
- **결제 뒤 연결** — `app/payment/success/GuestClaimForm.tsx` + `POST /api/payments/guest-claim` +
  `lib/payments/guest-attach.ts guestAttachDecision`(순수 판정) / `lib/payments/guest-claim.ts attachGuestOrderEmail`.
  붙이는 열쇠는 `orderId` + **`paymentKey`**(결제창을 통과한 브라우저만 가진 값). 이미 다른 이메일이 붙은 주문은 거절.
  **이용권을 켜는 것은 그 계정으로 로그인해 있을 때만**(리뷰 HIGH) — 그 밖에는 이메일만 붙고 가입/로그인 시 켜진다.
  이메일이 붙는 순간 영수증·알림을 보낸다(`notifyPaymentSettled`, 선점이라 중복 없음).
- **진입로** — GNB 5번째 대분류 "요금제"(요금제·이용권 / 결제 수단 안내 / 주간권 카드 결제), `/subscription` 첫 화면에
  주간권 결제 블록 + 링크 직행 버튼, `/subscription/payment-methods` 상단에 "지금 카드 결제창 열어보기", 푸터 라벨 정리.
- **위젯 실패해도 결제 카드 유지** — 1001 은 위젯 렌더 실패 시 로그인 버튼만 남겨 다시 벽이 됐다.
- **분석 유출 차단** — `lib/analytics/safe-page-location.ts`: GA4 `page_location` 에서 `paymentKey` 등 열쇠 파라미터 제거
  (리뷰 MEDIUM: 1003 부터 paymentKey 는 이용권을 여는 자격증명이다).

로컬 실측(스텁 SDK): 비로그인·이메일 없이 버튼 1회 → `create` 200(guest:true) →
`requestPayment({method:"CARD", amount:{KRW,1100}, orderId, successUrl, failUrl})`, `customerKey: ANONYMOUS`.

## B. 동네이야기 복구
모바일 하단 탭바 4번째를 분석 → **동네**(`/town`)로 되돌렸다. 60일 실측 `/town*` 104뷰·24세션 vs `/analysis*` 111뷰·22세션(동률).
분석은 GNB·좌측 내비·전체 메뉴·홈 AI 패널에 그대로 있다. `/apply`·`/redevelopment`·`/supply`·`/auctions` 에서도 동네 탭이 켜진다.

## C. ETL·운영 경보
- **매일 실패하던 Market ETL** — 원인 둘. ① `lib/market/supply-geocode.ts` 가 `complex_geocode` 를 조회할 때 582개 단지명을
  `.in()` 하나에 실어 URL 이 ~86KB(측정) → 요청 실패, 오류 메시지는 빈 문자열. 이름 30개·지역 60개 청크로 쪼갰다(URL ≈ 7.5KB).
  같은 형태가 `lib/map/complex-geocode.ts` 의 `getCachedCoordMap`(지도 마커, 측정 215KB)·`loadRoadAddresses` 에도 있어 함께 고쳤다.
  ② `.github/workflows/etl.yml` 의 실패 판정이 본문에서 `"error":` 문자열을 찾아 **중첩된 소프트 실패**까지 잡았다 — `jq` 로 최상위 `ok:false`/`error` 만 본다.
- **운영 경보 critical `ingest.source_roster`** — `court-auction` 은 [993] 에서 ETL 호출을 뺐는데(모듈이 스텁, 46회 실행 내내 ok 0건)
  스캔이 `retired_at` 컬럼을 읽지 않아 매일 critical 로 떴다. 마이그레이션 `20260917130000_1003_ops_ingest_scan_honors_retired_sources`
  (MCP 적용 + 파일 미러): 폐기 소스는 제외하되 **폐기 이후 새 실행 로그가 생기면 감시 복귀**. 적용 뒤 severity 0건.

## 남긴 것(다음 판)
- 경보 warn `seo.region_coverage` — 화성 동탄구(3,931건)·세종시(2,079)·화성 병점구(1,909)·효행구(965)·만세구(673)에
  pair 비교 페이지가 없다. `market_agg.complex_pair_mv` 의 지역 allowlist 가 하드코딩이라 **MV 재생성(drop/create + 인덱스 + refresh)** 이 필요하다.
  실거래가 이미 쌓여 있어 색인 기회이지만, 라이브 페이지가 잠깐 비는 작업이라 별도 판에서 점검하며 한다.
- `post-daily-real-estate-news` 워크플로 실패(Setup Node.js 캐시 경로)는 **이 저장소에 파일이 없다** — 다른 저장소의 워크플로다.

## 검증
단위 747(+3 파일) · tsc 0 · 리뷰 에이전트 2회(ETL·결제) HIGH 1·MEDIUM 4·LOW 3 전부 반영 ·
게이트 체인(빌드·번들 예산 포함) · `check:mobile` · `check:void` · `check:final-release` · 마이그레이션 원장/권한 검사.
