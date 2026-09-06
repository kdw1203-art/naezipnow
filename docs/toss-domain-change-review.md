# 토스페이먼츠 도메인 변경 심사 — 반려 원인과 재신청 안내 (968)

> 대상: 소유자(비개발자). 2026-09-06 토스페이먼츠가 상점 도메인을
> nuguzip.com → **naezipnow.com** 으로 바꾸는 요청을 "결제창과 연동이 안 되어
> 있다"는 이유로 반려했다. 이 문서는 (a) 왜 그렇게 보였는지, (b) 968 배포로
> 무엇이 달라졌는지, (c) 재신청 때 **정확히 무엇을 적을지**, (d) 배포 뒤 스스로
> 확인하는 법을 순서대로 적는다. 비밀번호·키 값은 이 문서 어디에도 없다 —
> 그런 값은 토스 폼과 Vercel 에만 직접 입력한다.

## 1. 왜 반려됐나 — 심사역이 본 화면

심사역은 **계정 없이** `https://naezipnow.com` 을 열어 결제창이 뜨는지 본다.
그 눈으로 따라가면 이렇게 됐다.

1. `/subscription` 에는 실제 결제 버튼이 있다(정상).
2. 주간권 버튼을 누르면 로그인 확인 → 세션이 없으니 **로그인 페이지**로 갔다.
3. 결제 화면 주소(`/subscription/checkout?tier=pro&billing=weekly`)를 직접 열어도
   "주문 준비 중…" 뒤에 서버 주문 생성이 401(로그인 필요)로 끝나고, 화면은
   "로그인하기" 카드에서 멈췄다. **토스 결제위젯은 한 번도 그려지지 않았다.**

즉 코드에는 위젯 연동(`live_gck_` 키, `widgets().renderPaymentMethods`)이 있었지만,
심사역이 도달할 수 있는 화면에는 없었다. 토스가 "연동이 안 되어 있다"고 쓴 것은
그 뜻이다.

부수적으로, 결제 화면 맨 아래 법적 고지가 `/subscription` 과 달랐다. 구독 안내는
"주간권은 단건, 월간·연간은 자동결제"라고 쓰는데 결제 화면은 "모든 이용권은 1회성
단건 결제"라고 적혀 있었다. 두 화면을 나란히 본 심사역에게는 어느 쪽이 사실인지
알 수 없는 상태였다.

## 2. 968 에서 바뀐 것

| 항목 | 예전 | 지금 |
| --- | --- | --- |
| 비로그인으로 결제 화면 열기 | "로그인하기" 카드에서 멈춤, 위젯 없음 | 주문 요약(금액 1,100원·이용 기간)과 **토스 결제위젯이 그대로 그려진다.** 버튼은 "로그인하고 결제하기" — 누르면 로그인 뒤 같은 화면으로 돌아온다 |
| `/subscription` 주간권 버튼(비로그인) | 로그인 페이지로 먼저 | 결제 화면으로 바로(거기서 위젯을 보고, 결제 시점에 로그인) |
| 월간·연간(자동결제) | 로그인 먼저 | 그대로 로그인 먼저 — 카드 등록창은 서버가 발급한 고객 식별값이 있어야 열린다 |
| 결제 화면 법적 고지 | "모든 이용권은 1회성 단건" | `/subscription` 과 같은 판정으로 "주간권 단건 · 월간·연간 자동결제" |
| 결제 화면 로딩 | 위젯이 뜨는 순간 화면이 통째로 내려앉음 | 위젯 자리를 먼저 잡아 두고 그 안에서 로딩 표시(모바일 점프 제거) |
| 헬스체크 | 토스 키 유무만 | 키 종류(위젯/API)·환경(라이브/테스트)·빌링 개방·웹훅 검증 여부를 값 없이 진단 |

게스트에게 위젯을 보여 준다고 해서 **게스트가 결제할 수 있는 것은 아니다.**
서버 주문은 여전히 로그인 필수이고, 게스트 화면에는 주문번호가 없다("로그인 후
발급"). 금액 역시 화면 표시용이고 실제 청구 금액은 로그인 뒤 서버가 다시 계산해
승인 때 대조한다. 결제 완료(successUrl)·실패(failUrl) 주소는 코드에 고정된 값이
아니라 **지금 열려 있는 도메인**(`window.location.origin`)으로 만들어지므로
naezipnow.com 에서 열면 자동으로 naezipnow.com 으로 돌아온다.

## 3. 재신청 때 적을 것 (토스 상점관리자 → 도메인 변경/추가 심사)

아래 값을 그대로 입력한다. 대괄호 항목만 소유자가 채운다.

| 항목 | 입력값 |
| --- | --- |
| 서비스(상점) 도메인 | `https://naezipnow.com` |
| 결제 테스트 경로 | `https://naezipnow.com/subscription/checkout?tier=pro&billing=weekly` |
| 결제 상품 | 플러스 주간권 · 1,100원(VAT 포함) · 7일 · 1회성 단건 결제 |
| 결제 방식 | 토스페이먼츠 **결제위젯**(주문서형) — 비로그인 상태에서도 위젯이 표시되며, 결제 진행 시 로그인 |
| 테스트 계정 ID | `test@nuguzip.com` (이메일/비밀번호 로그인, 소셜 아님) |
| 테스트 계정 비밀번호 | **[소유자가 토스 폼에 직접 입력]** — 사이트·문서·채팅 어디에도 적지 않는다 |
| 결제 완료 URL | `https://naezipnow.com/payment/success` (현재 도메인 기준 자동 생성) |
| 결제 실패 URL | `https://naezipnow.com/payment/fail` (현재 도메인 기준 자동 생성) |
| 로그인 경로 | `https://naezipnow.com/login` |
| 환불 규정 | `https://naezipnow.com/legal/terms#refund` (이용약관 제8조) |
| 사업자 정보 | 전 페이지 하단 푸터(상호·대표자·사업자등록번호·주소·유선번호·통신판매업 신고번호) |

파라미터 이름은 결제 화면 코드(`CheckoutClient.parseParams`)가 읽는 `tier`·`billing`
그대로다. `tier=pro`(플러스)·`billing=weekly`(주간권)가 아닌 조합은 그 화면이 열리지
않거나 자동결제 등록창으로 보내므로, 심사 경로는 위 주소 하나만 적는다.

심사 메모란이 있으면 한 줄 덧붙인다: "비회원도 결제 화면에서 결제위젯을 확인할 수
있으며, 실제 결제(주문 생성·승인)는 로그인 후 진행됩니다. 테스트 계정으로 로그인하면
같은 화면에서 결제가 이어집니다."

## 4. 상점관리자 체크리스트 (재신청과 같이 처리)

- [ ] **웹훅 URL** — 개발자센터 > 내 개발정보 > 웹훅:
      `https://naezipnow.com/api/payments/toss/webhook`
      (구독 이벤트: `PAYMENT_STATUS_CHANGED`, `BILLING_DELETED`; 가상계좌를 열면 `DEPOSIT_CALLBACK` 추가)
- [ ] **자동결제 MID(`bill_…`)의 웹훅도 같은 주소**로 — MID 가 나뉘어 있어 각각 등록해야 한다.
- [ ] 구 도메인(nuguzip.com)으로 남아 있는 웹훅은 **반드시 교체**한다. 구 도메인은 새
      도메인으로 308 리다이렉트되는데, 웹훅 발송기는 리다이렉트를 따라가지 않고 실패로
      보고 최대 7회 재시도한 뒤 버린다 — 결제는 되는데 상태 알림만 못 받는 상태가 된다.
- [ ] 성공/실패 URL 화이트리스트(도메인 등록) 항목이 있으면 `naezipnow.com` 추가.
- [ ] `nuguzip.com` 은 당분간 **병기**해도 된다 — 옛 링크·북마크는 308 로 새 도메인으로
      넘어온다. 심사가 끝나고 한 달쯤 뒤 정리.
- [ ] 상점 서비스명은 **내집나우**(리브랜딩 반영).

## 5. 배포 뒤 스스로 확인하기

1. **시크릿(비공개) 창**에서 `https://naezipnow.com/subscription/checkout?tier=pro&billing=weekly` 를 연다.
   - 로그인 없이 "플러스 플랜 · 주간권(7일 단건) 결제" 제목, 주문 요약(1,100원 VAT 포함 ·
     7일 · 주문번호 "로그인 후 발급"), 안내 카드 "결제하려면 로그인이 필요해요", 그 아래
     **토스 결제수단 위젯(카드사 목록)과 약관 동의 위젯**, 맨 아래 "로그인하고 결제하기"
     버튼이 보이면 정상이다.
   - 위젯 자리에 "결제 수단 화면을 불러오지 못했어요"가 뜨면 키 문제다 — 아래 3번으로.
2. "로그인하고 결제하기" → 테스트 계정으로 로그인 → 같은 결제 화면으로 돌아오고
   주문번호가 `WOODONG-…` 으로 바뀌며 버튼이 "1,100원 결제하기"가 되면 정상.
   (실제 결제까지 진행하지 않아도 된다. 진행하면 라이브 키라 실제 청구된다 — 7일 이내
   환불 규정대로 취소 가능.)
3. 헬스체크: `https://naezipnow.com/api/health?detail=1&token=<HEALTHCHECK_TOKEN 값>`
   (토큰은 Vercel 환경변수 `HEALTHCHECK_TOKEN` — 주소창에만 넣고 어디에도 남기지 않는다.)
   `services.toss` 블록이 이렇게 보여야 한다:

   ```json
   "toss": {
     "clientKeyMode": "live",
     "clientKeyKind": "widget",
     "keyPairOk": true,
     "secretKey": true,
     "billingClientKey": true,
     "billingClientKeyKind": "api",
     "billingSecretKey": true,
     "billingEnabledFlag": true,
     "billingEnabled": true,
     "webhookSecret": true,
     "webhookVerification": "refetch-with-secret-key",
     "webhookUrl": "https://naezipnow.com/api/payments/toss/webhook",
     "siteOrigin": "https://naezipnow.com",
     "successUrlOrigin": "runtime(window.location.origin)",
     "reviewCheckoutPath": "/subscription/checkout?tier=pro&billing=weekly"
   }
   ```

   - `clientKeyKind` 가 `"api"` 면 위젯 키(`live_gck_`)가 아니라 결제창 키가 들어간 것 —
     그 경우 게스트 화면에는 위젯 대신 요약·안내·로그인 버튼만 보인다(주문 없이는 결제창을
     열 수 없어서). 심사에는 위젯 키가 맞다.
   - `keyPairOk` 가 `false` 면 클라이언트 키와 시크릿 키가 다른 세트다(위젯 gck + API sk
     같은 조합). 결제창은 뜨는데 승인에서 깨진다 — Vercel 에서 같은 섹션의 짝으로 맞춘다.
   - `siteOrigin` 이 nuguzip.com 이면 `NEXT_PUBLIC_SITE_ORIGIN` 이 아직 안 바뀐 것.
   - 이 블록에는 키 값·길이가 전혀 들어 있지 않다(단위테스트로 고정) — 스크린샷을 공유해도 된다.
   - 참고: 토스 v2 웹훅에는 서명이 없어 "웹훅 전용 비밀"이 따로 없다. 우리 서버는 받은
     내용을 믿지 않고 시크릿 키로 결제를 다시 조회해 확인한다(`webhookVerification`).

## 6. 사업자 정보·환불 규정이 있는 자리 (심사역 질문 대비)

- **사업자 정보**: 모든 페이지 하단 푸터 — 상호(우리동네이야기)·대표자·사업자등록번호·
  사업장 주소·유선번호·통신판매업 신고번호. 값의 단일 출처는 `lib/brand/business-info.ts`
  (심사 고정 게이트가 사업자등록증 표기와 일치를 강제한다).
- **결제 신뢰 스트립**: `/subscription` 결제 버튼 바로 아래 세 줄 — "카드번호는 남지 않아요 /
  즉시 적용 · 영수증 메일 / 7일 이내 청약철회".
- **환불 규정**: 이용약관 제8조 `https://naezipnow.com/legal/terms#refund` — 7일 이내
  청약철회 전액 환불, 이후 중도 해지 잔여기간 일할 환불(고객센터 접수). 결제 화면 요약
  카드·결제 완료 화면·법적 고지에서 같은 문구로 링크한다.
- **서비스 제공기간·자동결제 고지**: `/subscription` 과 `/subscription/checkout` 맨 아래
  `ComplianceNotice` — 주간권 7일 단건, 월간·연간 자동결제(해지 전까지), 두 화면이 같은
  서버 판정으로 같은 문구를 낸다(968).

## 7. 관련 문서

- `docs/toss-integration-audit.md` — 연동 감사 이력(968 절 포함)
- `docs/ops/toss-keys.md` — 키 세트 셋(위젯/API/자동결제)과 Vercel 변수
- `docs/ops/domain-migration.md` — 도메인 전환 절차
- `docs/toss-review-checklist.md` — PG·카드사 심사 요건
