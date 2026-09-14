# 1000 — 개편 10판: 리퀴드 글래스 · 결제/구독 고도화 · 마이·설정·고객센터

소유자 지시(2026-09-14): "홈페이지 전반적으로 리퀴드 디자인 반영과 결제시스템 고도화, 마이페이지, 설정,
구독관리, 고객센터 등의 기타서비스에 대한 개편" + "좌측 패널 메뉴의 각 메뉴 간 구분을 디자인적으로 확실히".
선택: 애플 Liquid Glass 스타일 · 결제는 구독 관리 화면 / 결제 전 안내·신뢰 / 실패·해지 흐름 / 내역·영수증 전부 ·
한 판(1000)으로 전달.

## 디자인 언어 (모든 작업자가 같은 클래스를 쓴다 — app/globals.css)

- 크롬(헤더·탭바·플라이아웃)은 `.glass` / `.glass-strong` — [1000] 위·아래 굴절선(`--glass-edge`)과 사선 반사(`--glass-sheen`)가 붙었다.
- 본문 안 유리 표면 3종(새로 추가):
  - `.lg-glass` — 히어로·요약 카드. `rounded-lg` 기본, 글자는 `--ink`/`--text-*` 그대로.
  - `.lg-capsule` — 알약 컨테이너(탭·세그먼트·칩 줄). 자식 `<a aria-current="page">` / `<button aria-pressed>` 가 흰 알약으로 뜬다. 터치 40px 자동.
  - `.lg-pill` — 유리 위 작은 알약 배지. `.lg-hairline` — 카드 안 얇은 구분선.
- 나머지는 기존 `.card`(불투명, 본문 기본) · `.tile`(호버 리프트 링크 카드) · `.ai-panel`(잉크 다크) · `.btn-primary/.btn-soft/.btn-outline/.btn-ghost` + `.btn-lg/.btn-md/.btn-sm` · `.chip` · `.seg`.
- 글자 크기는 램프 클래스만: `t-display t-title t-section t-body t-sub t-caption t-num` (px 직접 지정 금지 — `check:type-ramp`가 막는다. Tailwind `text-sm/base/lg/xl` 도 금지, `text-xs`·`text-2xl` 만 허용).
- 색은 토큰만: `text-ink text-text-1/2/3 text-primary bg-surface bg-bg bg-primary-soft border-line border-line-strong text-success text-warning text-danger` 등. `#d64545` `#1a7f4e` 금지.
- 아이콘은 `app/components/Icon.tsx` 의 ICON_PATHS 키만(`check:icon-names`). 자주 쓰는 것: user crown settings life wallet receipt credit-card bell heart notebook-pen map sparkles messages-square shield lock check clock calendar mail help file-text repeat warning star gift.
- 새 keyframe 애니메이션을 더하면 `@media (prefers-reduced-motion: reduce)` 목록에도 같이 적는다(final-release 게이트).
- `<button>` 은 onClick/type=submit/disabled 중 하나가 있어야 한다(`check:dead-controls`). `href="#"` 금지.
- 모바일 탭: 주요 버튼 ≥40px(`.btn-md` 이상 또는 `min-h-10`), 문장 안 링크는 `inline-block py-[5px]`(24px).

## 잠금(절대 어기지 않는다)
- 포인트 충전형 부존재 — "충전"·"topup"·plan_pro_1m 등 재유입 금지(`check:toss-review-freeze`). 가격은 `lib/subscriptions/billing-periods.ts` 그대로.
- 프로 플랜 판매 숨김 유지(`lib/subscriptions/sell-config.ts SELLABLE_PAID_TIERS=["pro"]`). 플랜명은 `lib/subscriptions/labels.ts planLabel` 만(`check:plan-labels`).
- DB 권한 GRANT 금지(revoke 만). ops 스키마 노출 금지. 상호 "우리동네이야기" 유지.
- 가짜 데이터·시딩 금지. 화면은 실데이터가 없으면 정직한 빈 상태.
- 결제 레일은 토스 하나. 비밀키·토큰은 코드/채팅에 절대 넣지 않는다.

## 새 DB (마이그레이션 20260914090000, 적용 완료 — 서비스롤 전용, 정책 0)
- `billing_subscriptions` + `cancel_reason text` · `cancel_note text` · `notice_sent_for timestamptz`
- `subscription_events(id, subscription_id, user_email, event ∈ enrolled|activated|renewed|renewal_failed|suspended|card_changed|canceled|deleted|notice_sent|reactivated, detail jsonb, created_at)`
- `support_tickets(id uuid, created_at, updated_at, user_email?, contact_email, category, subject, message, status ∈ open|answered|closed, admin_reply?, replied_at?, replied_by?, metadata jsonb)`

## 작업 분담(파일 소유 — 겹치지 않는다)
- 본판(소유자 직접): globals.css 유리 토큰/클래스 · DesktopSideNav 묶음 타일 · Header/TabBar 광택 · nav 정렬 · 빌드/게이트/전달
- A 결제·구독: lib/payments/* · lib/subscriptions/billing-history.ts · lib/email/templates.ts(결제 템플릿 2종 추가) · app/api/payments/** · app/api/cron/billing-renewals · app/api/cron/plan-expiry-sweep · app/api/subscriptions · app/my/subscription/** (신설) · app/subscription/{BillingPanel,BillingAutopayCard,billing/BillingEnrollClient,PlanCheckoutButton}.tsx · app/payment/fail/page.tsx · tests/unit/*-1000-billing*.test.ts
- B 마이·설정: app/my/page.tsx · app/my/settings/** · app/my/assets(삭제) · app/analysis/portfolio/page.tsx(링크) · lib/seo/archived-routes.ts · scripts/check-links.mjs(경로 목록) · app/components/ui/SectionHead.tsx(신설) · app/api/me/export(신설) · app/api/me/profile(필요 시) · tests/unit/*-1000-my*.test.ts
- C 고객센터: lib/support/** · app/api/support/** · app/support/** · app/my/support/** (신설) · app/admin/support/** (신설) · app/admin/AdminNav.tsx(항목 1줄) · app/components/MobileMenu.tsx(계정·지원 묶음에 "구독 관리 → /my/subscription", "내 문의" 추가) · tests/unit/*-1000-support*.test.ts

## 한 줄

**크롬(헤더·탭바·좌측 플라이아웃)은 굴절선·사선 반사가 붙은 유리로, 본문의 히어로·탭·알약은 같은 유리 언어(`.lg-*`)로.
좌측 플라이아웃은 묶음마다 아이콘 배지 + 레일이 있는 타일로 갈라졌다. 결제는 `/my/subscription` 한 화면에서
자동결제 관리·해지(사유)·카드 변경·전체 결제 내역(영수증)·구독 이력을 보고, 청구 3일 전 사전 통지·실패 알림 메일이
간다. 마이는 프로필 편집·유리 히어로·빠른 동작으로, 설정은 실제 데이터 내보내기, 고객센터는 1:1 문의가 티켓으로
저장돼 "내 문의 내역"과 관리자 답변 화면이 생겼다.**

## 바뀐 것

### 1000-1 · 리퀴드 글래스 (사이트 전체)
- `globals.css`: `--glass-edge`(위·아래 굴절선) · `--glass-sheen`(사선 반사) 토큰. `.glass`/`.glass-strong` 에 굴절선 inset +
  반사 그라데이션(blur 와 달리 GPU 비용 거의 없음 — 모바일 12px 블러 규칙은 그대로). 다크는 약하게.
- 본문 유리 3종 신설: `.lg-glass`(히어로·요약 카드, surface 90% 위 blur 14px) · `.lg-capsule`(알약 컨테이너 — 탭·세그먼트·
  빠른 동작; 선택 항목은 흰 알약이 떠 있음, 터치 40px 자동) · `.lg-pill`(유리 위 배지) · `.lg-hairline`. 미지원·저사양·인쇄
  폴백 3경로 모두 등록.
- 헤더: 스크롤하면 유리판이 26px 캡슐로(테두리 반경 전환 추가). 탭바: 현재 탭 뒤에 primary 10% 유리 알약(온점은 유지).
- 글자 대비: 유리 알파 90%+ 위에 `--ink`/`--text-*` 토큰만 — `check:contrast-tokens` 기준 불변.

### 1000-2 · 좌측 플라이아웃 — 묶음 구분 (소유자 지시)
- 묶음마다 **유리 타일**: 아이콘 배지(28px) + 굵은 머리(허브 링크) + 배지 아래로 내려오는 **레일**에 매달린 하위 링크.
  지금 있는 묶음은 남색 배지·파란 테두리·연파랑 바탕, 지금 화면인 링크는 흰 알약. 폭 232 → 248px.
- 묶음 6개: 임장노트 · 지도 · AI 분석 · 동네 · **마이**(마이페이지·관심·구독 관리·포인트·설정) · **지원**(고객센터·내 문의 내역·
  자주 묻는 질문) — 모바일 전체 메뉴의 계정·지원 묶음과 같은 구성(전체 메뉴도 구독 관리 → `/my/subscription`, 내 문의 추가).

### 1000-3 · 결제·구독 고도화
- **`/my/subscription` 구독 관리** (신설, 로그인): 유리 히어로(플랜·상태 3분기: 자동결제 중 → 다음 결제일·금액·카드 /
  결제 실패로 멈춤 → "카드 다시 등록" / 없음 → 만료일 또는 무료) + 빠른 동작 캡슐(플랜 보기·결제수단·문의) · 자동결제
  관리(카드 변경 · **해지 — 사유 5종 + 의견 모달**, 해지하면 무엇이 되는지 3줄 · 다시 시작) · **전체 결제 내역**(최대 200건,
  20건씩 더 보기, 행을 펼치면 주문번호·결제수단·이용 기간·영수증 보기/요청·환불·문의) · **구독 이력 타임라인**
  (등록·활성·갱신·실패·중지·카드 변경·해지·사전 통지) · 환불·해지 규정 요약. `/subscription` 의 결제 패널은 최근 3건 +
  "전체 내역·구독 관리 →", `/my` 구독 카드·설정의 "구독·결제 관리"도 여기로.
- **결제 전 안내·신뢰**: 자동결제 카드 등록 화면에 "결제 전 확인" 유리 카드(상품·금액 VAT 포함·주기·첫/다음 결제일·해지 방법·
  환불 규정·결제수단 안내) + **정기결제 조건 동의 체크**가 없으면 등록 버튼이 열리지 않는다(서버도 `consent` 없으면 400,
  카드 변경 모드는 예외). 토스 창은 여전히 사용자 클릭 안에서 연다.
- **실패·해지 흐름**: 갱신 실패 시 알림함 + **메일**(첫 실패·중지 시점에만, 매일 반복 안 함) · **청구 3일 전 사전 통지**
  (알림함 + 메일, 회차당 1회 — `notice_sent_for` 선점으로 pg_cron·Vercel 동시 실행에도 1통) · 금액 불일치는 "카드 문제
  아님·확인 중" 문구로 따로 · 카드 재등록 시 실패 횟수·오류 초기화 · 만료 사전 알림에서 자동결제 **중지** 사용자를 더는
  제외하지 않음 · 결제 실패 화면의 재시도가 빌링 카드 실패면 카드 등록 화면으로(예전엔 요금제 안내로 떨어짐).
- **영수증**: 자동결제(첫 결제·갱신)도 토스 매출전표 URL·결제수단을 저장 — 예전엔 정기결제 전 건이 "영수증 요청"뿐.
  결제 내역 상한 50 → 200.
- 곁: `GET /api/subscriptions` 플랜을 세션 JWT 가 아니라 DB 에서 · 웹훅 기간 상수 단일 출처 · 해지 API 가 사유 본문을 받음
  (없어도 동작) · `subscription_events` 기록(서비스롤 전용).

### 1000-4 · 마이페이지
- h1 "마이" · **유리 히어로**(아바타·이름·플랜 알약·**관심 지역 칩 → 프로필 편집 시트**·포인트·출석·설정) · 빠른 동작
  캡슐(노트 쓰기·관심·AI 기록·구독 관리). 프로필 편집(이름 1~50자·관심 지역 — 실제 카탈로그, 폐지 구 제외)은 이미 있던
  `PATCH /api/me/profile` 을 처음으로 쓴다(그동안 "관심 지역을 설정해 보세요" 만 있고 설정할 곳이 없었다).
- 포인트 섹션의 중복 4행 내역 제거(`/my/points` 에 있음) · 구독 카드 링크 `/my/subscription` · 결제 실패 상태에 "카드 다시
  등록" 실링크 · 전문가·중개(인증 사용자만) 묶음으로 고아였던 `/my/listings·leads·consultations·expert-profile` 진입 ·
  더 보기: 설정·내 문의 내역·고객센터·크리에이터·관리자. 공용 `SectionHead`(ui) 복원. `/my/assets`(명시적 예시 화면) 삭제.

### 1000-5 · 설정
- 탭·테마 선택을 유리 캡슐로 · 계정 탭 맨 위 **프로필**(이름·관심 지역 편집) · 정적 "언어: 한국어" 행 제거 ·
  **내 데이터 내보내기 실제 구현** — `GET /api/me/export`(로그인, 10분 3회): 프로필·임장노트·북마크·관심·알림 구독·
  포인트 내역(500)·결제 내역(200, 공개 필드만)·알림 설정을 JSON 파일로(다른 사람 데이터·빌링 키 절대 없음, 실패한 출처는
  `errors` 로 정직하게). 토글 저장 시 "저장했어요" 토스트(1.5초 스로틀) · 마케팅 동의 표시 단일 출처(consents).

### 1000-6 · 고객센터
- **1:1 문의 → 티켓**(`support_tickets`, 서비스롤 전용): 접수번호(8자) 발급, 관리자 알림함(`/admin/support`, 이제 실제 존재)·
  운영 메일(사업자 정보의 지원 메일, 하드코딩 제거)·사용자 확인 알림(`/my/support`). DB 실패해도 메일·알림은 나가고
  `ticketId:null` 로 답한다(문의를 잃지 않는다).
- **`/my/support` 내 문의 내역**(신설): 카테고리·상태(답변 대기/완료/종료)·접수일, 펼치면 내 글 + 답변, "문의 종료".
- **`/admin/support`**(신설): 상태 필터, 답변 폼 → `POST /api/admin/support/[id]/reply`(관리자) → 사용자 알림함 + 메일
  (`supportReplyEmail`). 관리자 내비 "고객 문의".
- `/support` 허브: 유리 히어로 + **FAQ 즉시 검색**(20문항 클라이언트 필터) · 카테고리 타일 · 1:1 문의(성공 시 접수번호 +
  내 문의 내역 링크) · 공지 "전체 ›" → `/town/news` · 처리 절차 문구 갱신 · 사이드메뉴에 내 문의 내역·자주 묻는 질문.
  `/support/faq`: 검색 + 캡슐 카테고리 + `<details>` 접기(해시로 오면 자동 펼침).

## 검증
- `npm run build` 전 게이트 · 단위 **689**(+31: cancel-reasons·renewal-notice·profile-export·ticket-labels) · tsc · 번들
  예산(`/` 456 · `/analysis` 488 · AI 469 · `/notes/new` 465 · `/complex/[id]` 477 — 예산 불변) · jsonld · cache-policy
- `check:mobile` 9경로 ✓(/ · /my · /my/settings · /my/subscription · /my/support · /support · /support/faq · /subscription ·
  /payment/fail) · `check:void` 데스크톱 8 · 모바일 6 ✓ · `check:final-release` · migration-grants(새 마이그레이션은 revoke 만)
- 2차 코드 리뷰(별도 에이전트) 9건 반영: 사전 통지 선점 조건 · 카드 재등록 시 카운터 초기화 · 제어문자 정규식(바이너리 파일화)
  · 금액 불일치 문구 분리 · 복구 경로 이력 · 죽은 prop · 미사용 토큰 · 이름 상한 서버와 통일 · 플랜명 라벨 함수
- 로컬은 로그인 세션이 없어 `/my*` 로그인 상태·결제 흐름은 코드 리뷰·tsc·단위로 검증(운영에서 소유자 확인 항목 참고)

## 소유자 확인 사항 (배포 뒤)
1. 데스크톱 왼쪽 가장자리 → 플라이아웃이 묶음별 타일로 갈라져 보이는지(아이콘 배지·레일).
2. 로그인 후 `/my` → 히어로의 "관심 지역" 칩 → 프로필 편집 저장 · `/my/subscription` 이 본인 상태(자동결제 유무)를 맞게
   보여 주는지 · `/my/settings` "JSON으로 내려받기"가 파일을 내려주는지.
3. `/support` 에서 문의 1건 남기고 `/my/support` 에 보이는지 → `/admin/support` 에서 답변 → 알림함·메일 도착.
4. 자동결제 사용자에게 다음 결제 3일 전 "곧 자동결제 예정" 알림/메일이 가는지(다음 크론 01:10/13:10 UTC 부터).
5. RESEND 키가 없으면 메일은 건너뛰고 알림함만 간다(기존과 동일).

## 제안(다음 판)
- 관리자 답변에 감사 로그(`lib/audit/log.ts` AuditAction 확장) · 문의 상태 변경 알림 · 티켓에 첨부 이미지.
- 플랜 변경(업/다운) 셀프 경로와 일할 정산 — 지금은 "새로 결제 → 기존 구독 종료".
- 홈 히어로 검색 카드도 `.lg-glass` 로(LCP 요소라 이번엔 제외 — RUM 으로 영향 확인 후).
