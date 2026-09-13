# 992 — 개편 2판: 정보구조 1차 · 결제 레일 하나 · 페이월 이동 · 디자인 GC · 오류 경계

근거 문서: `docs/proposal-991.md`. 991 이 "홈·탭바·가입·결제 완주" 였다면, 이 판은 **"없애기"** 다 —
쓰지 않는 영역의 입구를 닫고, 결제 코드를 토스 하나로 좁히고, 무료 한도의 벽을 AI 결과 직후로 옮긴다.

소유자 결정(2026-09-12, 전부 반영): 전문가·개발물건·모임·매물(비교함·등록 입구) = **보관(비노출)** ·
프로(EXPERT) 플랜 **숨김** · Stripe·카카오페이 **코드 제거** · 탭바 '동네'→'분석'(991) · 991 → 994 순서.

## 한 줄

**141 파일 · +711 / −5,723 줄. 라우트 8 개·API 14 개·결제 레일 5 개가 사라지고, 화면 어디서도 보관 영역으로 가는 문이 없다.**

## 바뀐 것

### A1 · 정보구조 — 보관(unlist)은 한 목록이 정한다
- `lib/seo/archived-routes.ts` **단일 출처**: `/town/experts` `/town/groups` `/town/library` `/town/prompt` `/qna` `/dev-deals` `/listings/compare` `/notes/market` `/notes/templates` `/my/assets` `/my/expert-profile` `/my/consultations` `/my/leads` `/widget` `/partners` `/messages` + `/notes/<id>/deck|print`.
  - 미들웨어가 `X-Robots-Tag: noindex, follow` 를 붙이고, 사이트맵이 거른다(전문가·Q&A 사이트맵 파일은 삭제). 라우트·데이터·코드는 그대로 — 30일 관찰 뒤 삭제 여부를 정한다.
- **입구 정리**(보관 영역으로 가는 링크 0): 마이(전문가 찾기·상담·자산·자료실 배너·문의함), 동네(글감 카드·전문가 띠·카테고리 9→5), 단지 상세(Q&A 블록·하단 바 "전문가 상담"→**"AI 분석"**), 노트 상세("이 단지 Q&A"), 임장 가이드(템플릿·모임 칩), 포인트 상점·크리에이터(자료실), 매물 등록·내 매물(인증 신청 → 고객센터 안내), 쪽지함(모임 채팅 → 공개 노트), AI 다음 행동(전문가 → 노트), 하우스 광고(전문가 2종 삭제), 푸터·메뉴.
- **삭제**(호출 0·리다이렉트 처리): `/discover`→`/town` · `/points`→`/my/points` · `/seller`→`/creators` · `/recommend`→`/search` · `/analysis/cycle`→`/analysis/timing`. 계산기 4 화면은 `/calculator/[tool]` 하나로(URL 그대로, 미지 id 는 `/calculator`). 죽은 모듈: `lib/navigation/*` 3, `lib/map/district-workspace-service.ts`, `/api/map/workspace` · `/api/map/nearby`(호출자 없음).
- 위젯 생성기(`/widget`, 보관) 대신 단지·지역 상세에 **iframe 코드를 바로 보여 준다**(`EmbedSnippet`, 서버 컴포넌트 — 클라이언트 JS 0). 스니펫 형식은 `lib/embed/snippet.ts` 하나에서 나온다.

### C1 · 결제 레일 6 → 1 (토스페이먼츠 카드)
- 삭제: 토스페이(`/api/payments/tosspay/*` 4), 카카오페이(`/api/payments/kakaopay/*` 4), Stripe(`/api/billing/checkout·webhook·boost·iap` + `lib/billing/stripe*`), 앱인토스, 그룹패스, IAP 상품표. `package.json` 에서 `stripe` 제거.
- `PlanCheckoutButton` 은 토스 한 갈래: 주간권 → 결제 화면, 월·연 → 자동결제(로그인) / 게스트 미리보기. 자동결제가 닫혀 있으면 주간권을 권한다.
- 개인정보처리방침에서 Stripe 행 삭제(개정일 2026-09-13), `/api/health`·관리자 연동 목록·통계도 토스만 본다. 최종 릴리스 게이트는 되살아난 레일을 WARN 으로 잡는다.

### C2 · 프로(EXPERT) 플랜 숨김
- `lib/subscriptions/sell-config.ts`: `SELLABLE_PAID_TIERS = ["pro"]` — 카드·비교표 열·JSON-LD·`billing/start` 가 전부 여기서 파생된다. 이미 프로인 계정은 카드가 남는다.
- 플랜 기능표에서 **팔 수 없는 혜택을 뺐다**(전문가 상담·리포트 판매·전문가 정산) — 대신 핵심 벽인 **AI 분석 도구** 행을 넣었다(무료 누적 3회 · 플러스 월 50회).

### C5 · 페이월을 AI 결과 직후로
- 무료 AI 분석은 **누적 3회**(`ai_analysis.lifetimeLimit`, 월이 바뀌어도 열리지 않는다). 초과 시 결과 자리에 "주간권 1,100원으로 계속하기"(현재 화면으로 복귀) + "월간 2,900원 · 다른 플랜 보기".
- 사용량 표기가 "이번 달" 과 "누적" 을 구분한다(`/subscription` · `/my`).

### A4 · 디자인 시스템 GC
- 참조 0 인 것 삭제: `ui/{Card,Badge,SectionHeader,SourceNote}`, `lib/design/{tokens,field-tokens,category-workflow,use-viewport-tier}`, `components/ui-kit`, `ChipRow`, `BrandLoader` Wave/Bar, `.sk` 스켈레톤(`skeleton` 하나로), `--sp-*`·`--z-*` 토큰 12개, `x-woodong-shell` 헤더.

### A7 · 오류·로딩 경계
- `AreaError` 공용 + 영역별 `error.tsx`(지도·노트·분석·구독·결제·마이) — 영역 이름으로 말하고 그 영역의 다음 행동을 준다. `notes/[id]`·`town/news` 에 `loading.tsx`.

### 게이트 수리(코드가 아니라 검사기가 낡은 것)
- 최종 릴리스 게이트: 사이트맵 정적 목록이 동적 세그먼트(`/calculator/[tool]`)로 서빙되는 경우를 인정 · 토스 승인 검사가 965 에서 옮겨진 `lib/payments/confirm-toss-order.ts` 를 본다 · 삭제된 `--sp-*` 토큰 제외 · 모션 최소화 검사가 "모션을 끄는 규칙"·"일반화된 셀렉터(`.run-sig i`)"·"reduce 에서 숨김" 을 덮인 것으로 본다(가짜 실패 15건 → 0). 토스트 퇴장은 reduce 에서 투명도만 바뀐다.
- 모바일 조작: 계산기·시나리오 슬라이더 40/44px, "결제 수단 안내"·"내 분석 기록" 링크 24px.

## 검증
- `npm run build` 전 게이트 통과(번들 예산: 홈 451KB · 지도 347 · 분석 482 · AI 도구 473 · 노트 468 · 단지 467 — **예산 상향 없음**) · 단위 테스트 **571개**(+3 `archive-992`, +4 `paywall-992`, 갱신 `subscription-970`·`payment-methods-990`·`shell-970`)
- `check:redirect-map`(107 정확·2 접두, 2홉 0, 동적 라우트 가림 0) · `check:route-links` · `check:cache-policy` · `check:sidebar-grid` · `check:secret-markers` · `check:responsive-qa` · `check:sensitive-policy` · `check:final-release` **PASS 40 · WARN 1(사업자 env 수동) · FAIL 0**
- `check:mobile` 10경로(홈·구독·AI 진단·계산기 2·동네·마이·단지 찾기·임장·상점) · `check:void:mobile` 8경로
- 로컬 확인: `/town/experts` → `x-robots-tag: noindex, follow` · `/discover` → 301 `/town` · `/calculator/nope` → 307 `/calculator` · `/calculator/gap` 200

## 소유자 확인 사항
1. **Vercel 환경변수 정리(선택)**: `STRIPE_*`, `KAKAOPAY_*`, 앱인토스 키는 코드가 더 이상 읽지 않는다. 지워도 되고 두어도 무해하다 — 키 값은 대시보드에서만.
2. **토스 심사 반려 재신청**: 990 확인 절차 그대로(로그아웃 상태 카드 위젯 확인 → 도메인 변경 재신청). 이번 판으로 결제 화면의 레일이 카드 하나뿐이라 심사가 볼 화면이 단순해졌다.
3. 배포 후 30일: 보관 영역 유입(`/town/experts` 등)이 0 이면 다음 판에서 삭제로 넘긴다.

## 다음 판(993)
B2 심화(단지 허브 한 스크롤 · AI 12→4 핵심 · 노트→판단 카드 · 회차 · 자동 관심→푸시 · 지도 기본 레이어 · 근거 칩) · A5 데스크톱 좌측 내비 · `/my` 17→7 · 994(단지 SEO · 공유 카드 · 다이제스트 · 청약 알림).
