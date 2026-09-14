# 1002 — 유입 도구(홍보 킷) · 홈 폴백/입구 · 운영 정직성

소유자 지시(2026-09-14): "지금 상황에서 개선할 수 있는 부분을 추가로 진행하고, 홍보를 통해 유입 인원을
늘릴 방안을 검토해서 반영". 유입 분석·루틴·소유자 설정은 `docs/growth-plan-1002.md`.

## 바뀐 것

### 유입 (A)
- 신설 `app/admin/promo/page.tsx` — 홍보 킷(유입 30일 채널 요약 · UTM 표 · 채널별 실행 카드 · 단지 글 팩). `AdminNav` "홍보 킷".
- 신설 `lib/content/promo-pure.ts`(순수: `classifyReferrer` · `summarizeInflow` · `promoWeekTag` · `withUtm` · `renderComplexBlogPost` · `renderComplexShortPost` · `hashtagsFor`) / `lib/content/promo-kit.ts`(server-only, `unstable_cache` 1h, 모든 조회 `.limit()`, 실패 섹션은 `missing`).
- `lib/content/blog-pack.ts` 외부 링크 3곳 UTM(`naver/blog/weekly-<주차>`).
- `app/llms.txt/route.ts` 동네 홈 개수 하드코딩(62) → `ACTIVE_REGION_CATALOG.length`.

### 홈 (B)
- 신설 `lib/newui/home-region-fallback.ts` — `CARD_REGIONS`·`deltaOf`·`formatEok`·`periodLabelOf` 를 home-data 에서 옮기고(단일 출처) `regionCardsFromMonthly(rows, targets, {minTrades=10})` 추가(`stale:true` 카드).
- `lib/newui/home-data.ts` — 스냅샷 실패/0건 → `market_region_monthly` 폴백(`regionsStale`), `loadHomeRegionCards` 도 동일. `HomeRegionCard.stale?`.
- `app/page.tsx` — 폴백 캡션 한 줄, `HomeBudgetChips`(신설 `app/components/home/HomeBudgetChips.tsx`, 서버 컴포넌트), AI 입구 "로그인 없이 단지 데이터 진단 미리보기 →".
- `app/components/home/HomeTodayLine.tsx` — 개인화 문장에 `periodLabel` 전달(폴백 카드가 "지난달보다"로 읽히지 않게).
- 신설 `lib/recent-complexes/dedupe.ts`(`dedupeRecents` · `recentComplexKey` · `isKaptId`) + `app/components/RecentComplexes.tsx` 읽기·기록·병합 3곳 적용.

### 운영 (C)
- `app/api/auth/forgot-password/route.ts` — 응답에 발송 경로를 싣지 않는다(리뷰 HIGH: 경로가 곧 계정 존재 여부). `app/forgot-password/page.tsx` — 성공 화면에 "10분이 지나도 오지 않으면 고객센터에 계정 문의" 링크.
- `app/support/SupportContactForm.tsx` — `?category=account` 매핑, `?topic=password-reset` 제목·본문 미리 채움.
- `lib/support/ticket-labels.ts` `orderIdFromTicket` + `app/admin/support/page.tsx` 결제·환불 문의 → `/admin/payments?order=…` 링크.
- `app/admin/payments/page.tsx` — `?order=` 지목 주문을 찾아 첫 줄(환불 버튼 포함), 없음/조회 실패 구분. `lib/payments/store.ts` `getPaymentByOrderIdStrict`(오류를 던진다).
- `lib/complex/complex-store.ts` 실거래 이력 조회 2곳 `order("contract_ym", desc)` — PostgREST 1,000행 상한에서 최근 개월이 잘리지 않게.

## 검증
- 단위 719 통과(+27: `home-1002` 13 · `promo-1002` 13 · `support-1002` 1), tsc 0.
- 리뷰 에이전트 1회: HIGH 1(발송 경로 유출) · MEDIUM 2(조회 실패를 없음으로 표기 · 동명 단지 병합) · LOW 4 → 전부 반영(검색 호스트 정밀화 포함).
- 게이트: type-ramp · dead-controls · plan-labels · route-links · icon-names · import-hygiene · contrast-tokens · ai-compliance · review-freeze · 빌드 체인(번들 예산 포함) · check:mobile · check:void · check:final-release — 결과는 전달 메시지에.

## 잠금 유지
포인트 충전형 부존재 · 가격 잠금 · 프로 판매 숨김 · planLabel · GRANT 금지 · ops 노출 금지 · 상호 "우리동네이야기" · 가짜 데이터·시딩 금지 · 법률 서비스 유형 재유입 금지 · 번들 예산 상향 금지 — 이 판에서 건드린 것 없음.
