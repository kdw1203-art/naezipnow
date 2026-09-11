# 990 — 토스페이먼츠 도메인 변경 심사 재대응

## 반려 내용 (소유자 전달, 2026-09)

> 변경 원하시는 홈페이지 내 결제수단 신용/체크카드가 확인되지 않습니다.
> 결제창 연동 가능 여부 확인 부탁드립니다. 확인 후 재신청 부탁드려요.

MID `nuguzibowg` · 현재 등록 URL `https://nuguzip.com` → `https://naezipnow.com` 변경 신청 건.

## 실측으로 확인한 것 (추정 아님)

| 확인 항목 | 값 | 근거 |
|---|---|---|
| 배포된 클라이언트 키 | `live_gck_…` (**위젯 연동 키 · 라이브**) | 배포 번들 `22628-*.js` 모듈 55547 인라인 리터럴 |
| 빌링 클라이언트 키 | `live_ck_…` · `NEXT_PUBLIC_TOSS_BILLING_ENABLED=1` | 같은 모듈 |
| 사업자 고지 | 완비 (통신판매업 2026-안양동안-1095 · 대표전화 050-6460-1203) | 라이브 푸터 |
| 결제 차단 게이트 | 열림 (`isBusinessDisclosureComplete` = true) | `lib/payments/checkout-guard.ts` |
| 968 비로그인 미리보기 | **배포돼 있음** (`ec30736` 이 origin/main 에 있음) | 배포 번들이 소스와 일치 |
| 승인된 결제 | **0건** (시도 11건 = cancelled 7 · failed 4) | `public.payments` 집계 |

즉 "코드가 없어서" 가 아니었다. 심사역이 **결제창까지 도달하지 못하는 경로**로 들어왔고,
사이트 어디에도 취급 결제수단이 **글로** 적혀 있지 않았다.

### 심사역이 실제로 밟은 길

1. `/subscription` 을 연다 (비로그인).
2. 가장 큰 버튼 = 추천 플랜의 **월간** "플러스 시작하기" 를 누른다.
3. `PlanCheckoutButton` 이 세션을 확인 → 없음 → **`/login` 으로 보낸다.**
4. 끝. 카드 결제창을 한 번도 못 본다.

968 이 만든 비로그인 미리보기는 **주간권 버튼(작은 보조 버튼)** 에서만 열렸고,
`/subscription/checkout` 에 월간으로 들어와도 세션 확인 **전에** `/subscription/billing`
으로 리다이렉트돼 미리보기에 닿지 않았다.

## 고친 것

### 1. 비로그인도 어느 버튼을 눌러도 카드 결제창까지 간다
- `PlanCheckoutButton` — 비로그인 + 토스 위젯 키 + 정기 레일 개방이면 `/login` 대신
  `/subscription/checkout?tier&billing` 으로 보낸다. (카카오페이·Stripe 로 팔리는
  상태에서는 화면과 실제 결제수단이 어긋나므로 기존 로그인 경로 유지.)
- `CheckoutClient` — `billing !== "weekly"` 리다이렉트를 **세션 확인 뒤로** 옮겼다.
  비로그인이면 주기와 무관하게 같은 위젯(ANONYMOUS customerKey)으로 결제수단을 먼저
  그리고, 로그인 뒤에야 정기는 `/subscription/billing` 으로 간다.
  서버 주문은 여전히 만들어지지 않는다 — 게스트 결제 경로는 없다.
- 정기 미리보기의 로그인 버튼은 `/subscription/billing` 으로 돌아온다(한 번 더 튕기지 않게).
- 요약 카드가 단건/정기 두 상품을 맡게 되어 문구를 주기로 갈랐다 —
  정기에 "자동 갱신되지 않는 1회 결제" 를 쓰면 그 순간 거짓말이 된다.

### 2. 취급 결제수단을 글로 적는다
- 새 페이지 `/subscription/payment-methods` (로그인 불필요 · 사이트맵 · 푸터 링크).
  **신용카드 · 체크카드 / 결제사: 토스페이먼츠** 를 첫 줄에 적고, 결제·환불 규정과
  판매자 정보를 같은 장에 둔다. "결제창 열어 보기" 버튼이 실제 위젯으로 잇는다.
- 목록은 서버 설정에서 파생한다(`lib/payments/payment-methods.ts` · 순수 함수).
  설정되지 않은 수단은 나타나지 않는다 — 고지가 거짓이 되면 미비보다 나쁘다.
- `/subscription` 결제 신뢰 스트립 아래에 "결제 수단: 신용카드 · 체크카드 (토스페이먼츠)" 한 줄.
- 체크아웃 게스트 안내 카드에도 같은 문장 + 안내 페이지 링크.

### 3. `Permissions-Policy: payment=()` 해제
결제를 받는 사이트가 Payment Request API 를 **문서와 모든 하위 프레임에서** 0 으로
두고 있었다. 결제위젯은 `js.tosspayments.com` iframe 안에서 돈다.
→ `payment=(self "https://js.tosspayments.com" "https://payment-gateway.tosspayments.com")`.
와일드카드는 이 헤더 문법에 없으므로 오리진 명시. 그 밖에는 여전히 차단.

### 4. 키 세트 일치 여부를 토큰 없이 확인할 수 있게
`/api/health` 공개 요약에 `tossKeyPairOk` (boolean, **키 재료 없음**) 추가.
gck(위젯)·ck(API 개별) 는 눈으로 구분이 안 되고, 어긋나면 **결제창은 뜨는데 승인에서
깨진다** — 그 상태가 PG 에는 "결제창 연동이 안 된다" 로 보인다.

### 5. 모바일 조작 (검사 통과시키며 같이 고친 것)
문장 속 링크 3곳 + 체크아웃 되돌아가기 링크를 WCAG 2.5.8(24px)로.
44px 히트를 겹쳐 얹지 않는다 — 989 에서 되돌린 실패다.

## 검증

- `npm run build` 전 게이트 통과 · 단위 테스트 **561개**(+9)
- `check:mobile` 4경로 통과 · `check:void:mobile` 3경로 통과 · `check:narrow-text` 통과
- 로컬 실측(비로그인, `billing=monthly`): `/subscription/checkout` 에 **머무르고**
  `/api/auth/session` → 세션 없음 → `https://js.tosspayments.com/v2/standard` **요청 발생**.
  (이 컨테이너는 tosspayments.com 이 차단돼 SDK 가 로드되지 않아 `widget:"failed"` 로
  떨어진다 — 운영에서는 해당 호스트가 열려 있어 위젯이 그려진다.)

## 소유자 확인 사항 (배포 후)

1. `https://naezipnow.com/subscription` → **로그아웃 상태**로 "플러스 시작하기" →
   카드 결제창(결제수단 목록)이 보이는지.
2. `/api/health` 의 `tossKeyPairOk` 가 `true` 인지. `false` 면
   `NEXT_PUBLIC_TOSS_CLIENT_KEY`(gck)와 `TOSS_SECRET_KEY` 가 다른 세트다 —
   gck 에는 **gsk** 시크릿을 짝지어야 한다.
3. **승인 1건도 성공한 적이 없다**(11시도 전부 미완료). 1,100원 주간권을 실제로
   결제해 `payments.status = paid` 가 되는지 한 번은 확인할 것.
4. 토스 상점관리자에서 **MID `nuguzibowg` 의 키 종류**를 확인할 것.
   사이트의 일반결제는 `live_gck_`(주문서형·결제창형 연동 키)로 돈다.
   도메인 변경은 **사이트가 실제로 쓰는 MID** 에 적용돼야 한다.
5. 재신청 메모에 적을 URL:
   - 결제수단 고지: `https://naezipnow.com/subscription/payment-methods`
   - 결제창 직접 확인(로그인 불필요): `https://naezipnow.com/subscription/checkout?tier=pro&billing=weekly`
