# 1005 — 요금제 카드 모션 정리 · 하위 화면 비율/램프 점검 · 임장노트 실운영 집중 개선

소유자 지시(2026-09-19, 요금제 화면 스크린샷과 함께): "화면 구성이나 비율이 안 맞는 부분을 임장노트·AI 분석·동네·기타
하위 카테고리까지 화면비율·글씨체·테마 점검해 개선", "플러스 구독에 마우스를 올리면 너무 과도하게 움직이는 모션 —
수정하고, 할 거면 무료·플러스·프로 전부 적용", "임장노트만큼은 실제 운영 가능하도록, 더 인터랙티브하고, 더 사용자
친화적이고, 페이지 테마에 맞도록 집중 개선".

## A. 요금제 카드 — 틸트 제거, 세 카드 같은 hover

플러스 카드만 마우스 위치를 따라 3D 로 기울고(`tiltHandlers`) 동시에 위로 떠서, 커서가 지날 때마다 카드가 흔들렸다.
`app/subscription/PlanCards.tsx` 에서 틸트를 걷어내고 세 카드에 같은 `.plan-card` 규칙을 붙였다
(`app/globals.css`: hover 시 `translateY(-4px)` + 그림자, `(hover: hover) and (pointer: fine)` 에서만,
`prefers-reduced-motion` 이면 정지). 플러스는 원래의 "추천" 단차(`md:-translate-y-2`)만 유지한다.
실측(운영 빌드, 1280px): 무료·플러스·프로 hover 시 transform 이 모두 `matrix(1,0,0,1,0,-4)` — 세 카드가 똑같이 4px 만 뜬다.

같은 화면에서 어긋나 보이던 것도 같이: 사용량 카드가 요금제 카드 3열(1080px)보다 넓어 **폭을 1080 으로 맞췄고**,
사용량 미터의 "전문가 상담 0 / 무제한"은 [992] 부터 보관 중인 기능이라 **미터에서 뺐다**(`lib/subscriptions/usage-summary.ts` —
화면이 열릴 때마다 상담 건수를 세던 쿼리도 함께 제거. API 게이트 `checkExpertConsultQuota` 는 그대로).

## B. 하위 카테고리 점검(1280 · 390px)

임장노트·AI 분석(`/analysis`, `/analysis/ai/*`)·동네(`/town`, `/town/news`, `/town/write`)·청약·정비사업·분양·경매·실거래·
요금제·결제수단·체크아웃·로그인·환영 화면을 가로 넘침·글자 램프·터치 크기로 훑었다. 가로 넘침 0, 글자는 램프 안
(입력 placeholder 16px 는 iOS 확대 방지용으로 의도된 값). 고친 것:
- `/redevelopment` — 목록 chevron 이 램프 밖 글자(→ `t-sub`), 보기 방식 탭 36px → 40px, "전체 뉴스 ›" 18px → 24px.
- `/tx` — "이 숫자를 읽는 법" 문장 속 용어사전 링크 4개가 15px 높이 → 24px 히트(줄 간격 24px 로 맞춰 링크 있는 줄과 없는 줄이 같은 높이).
- `/auctions` — "온비드 바로가기 ↗" 18px → 24px.
- `/complex/compare` — **390px 에서 화면이 35px 옆으로 넘쳤다.** body 가 `keep-all` 이라 띄어쓰기 없는 긴 단지명
  ("평택지제역동문굿모닝힐맘시티3단지" 17자)이 못 꺾여 레이아웃 뷰포트를 밀어냈다 → 짝 이름에 `break-words`(넘칠 때만 꺾음).
  지역 제목 링크 21px → 24px.
- `/region/[id]` — "시장 온도 주간 기록 보기 →"·"구간 전체 보기 →"·개편 후 구 링크 14px → 24px.
- `/legal/*` 사업자 표기의 대표전화 링크 14px → 24px.
`check:mobile` 기본 8경로 + 하위 화면 33경로 통과(경매·실거래·정비사업·단지 비교·지역·약관은 위 수정 뒤 통과).

## C. 임장노트 — 실운영 집중 개선

### C1. 작성(`app/notes/new/**`)
- **A1 위치 직접 입력** — 위치는 노트의 유일한 필수값인데 검색에 없는 단지(신축·빌라·상가)는 저장 자체가 막혔다.
  `NoteLocationSearch` 에 "검색에 없어요 — 직접 입력 ›" 보조 경로(결과 0건·검색 실패 시 저절로 열리는 걸쇠),
  새 `NoteLocationManual.tsx`(지역 + 단지명, `validateManualLocation`, 60자) — `next/dynamic` 으로 첫 로드 밖(예산 470KB 안: 468KB).
- **A2 비회원 흐름을 사실대로** — 비회원 판정은 헤더가 이미 부른 `/api/auth/session` 공유 프라미스(요청 0 추가;
  true 비회원 확정 · false 로그인 · null 모름). 비회원이 고른 사진은 401 을 받으러 가지 않고 **이 기기 오프라인 큐**에 담아
  두었다가, 로그인하고 돌아오면(효과) 또는 저장 직전(`flushQueuedPhotos`) 올린다. AI 초안 버튼은 비회원이면
  "로그인하고 AI 초안 받기". 안내 문장은 "로그인 없이 써도 돼요 — 사진·AI 초안은 저장할 때 로그인하면 함께 올라가요"로.
- **A3 초안 단일 출처** — 수동 "임시저장"과 1초 자동 저장이 같은 `buildDraft` 를 쓴다. 스키마·파싱·비교·시각은
  `lib/notes/draft-summary.ts`(순수·테스트). 상단 오른쪽은 "임시저장" ↔ "저장됨 HH:MM"을 **상태에서 파생**(예전엔 한 번 true 면 영원히 ✓).
  복원은 덮지 않고 **합친다**(`mergeUploadedPhotos` — 로그인하고 돌아와 큐에서 막 올라간 사진을 잃지 않는다), 고려사항 빈 목록도 복원.
- **A4 저장과 AI 정리 분리** — 예전엔 저장 버튼이 LLM 응답(수 초)을 기다렸다. 이제 저장 → `POST /api/inspection/ai`
  (`keepalive`, 기다리지 않음) → `/notes/{id}?ai=pending` 이동. 업로드 한도는 계정(이메일) 기준 **1분 30회**
  (`app/api/upload/route.ts` — 예전 IP 기준 10회는 사진 10장을 고르면 그 자리에서 소진돼 한 장만 실패해도 429 였다; 429 는
  "사진 업로드가 잠시 많아요 — 1분 뒤 다시 시도해 주세요" + `Retry-After`).
- **B1~B5 화면** — 이전/다음/저장 CTA 가 매 단계 보인다(1·2단계 "다음 단계 →" 주 + "여기까지 저장" 보조), 업로드 중 저장은
  무시가 아니라 **예약**(끝나는 순간 잇는다; 실패한 장이 있으면 `saveError` 로 중단), 진행 표시는 항목 수가 아니라 단계(1/3·2/3·3/3)와
  긍정문 완성도, 퀵모드(`?quick=1`)는 위치 → 사진 → 한 줄 메모 → 저장의 **진짜 한 화면**(3단계와 같은 상태·같은 버튼).
  상단 요약은 앱의 유리 카드(`.lg-glass`), 폭 600, 글자는 램프 토큰. `loading.tsx` 도 3단계 골격으로.

### C2. 상세·목록(`app/notes/[id]/**`, `app/notes/notes-feed-client.tsx`)
- **`?ai=pending` 계약** — `lib/notes/ai-status.ts`(`readAiQuery`·`aiStateOf`·`pollIsSettled`·`isQuotaFallback`) +
  `AiPendingCard.tsx`: AI 자리에서 `GET /api/inspection/notes/{id}` 를 2.5초마다 최대 90초 폴링, 결과가 오면 `?ai=ok` 로 재렌더.
  한도 소진(engine "(quota)")은 실패가 아니라 한도 안내로. 수정 저장 뒤 **옛 분석이 새 것처럼 보이던 문제**(M3)는
  `lib/notes/content-hash.ts` 의 내용 해시로 판정(`stale = pending && 저장된 해시 ≠ 지금 내용 해시`; `NOTE_HASH_DEEP_DIVE_VERSION` 은
  `DEEP_DIVE_VERSION` 과 같이 올린다).
- **저장 직후 배너 6개 → "다음 행동" 카드 한 장** — 판단 히어로 바로 아래(루프 안내·AI 진단·근처 비교 링크 3개), 근처 비교 후보는
  본문·도구 다음 댓글 앞으로. 판단 카드는 유리 카드로, `href="#"` 죽은 링크 제거, 재시도 버튼 40px, 링 색은 토큰(`var(--primary)`).
- 목록 안쪽 폭 1240(홈·PageShell 과 같은 컨테이너 — 이 화면만 1120 으로 좁았다), CTA 두 개 52px, 퀵 기록 버튼은 진짜 퀵모드로.

### 리뷰(엄격)에서 잡아 반영한 것
H1 복원이 방금 올라간 사진을 덮음 → 합치기 · H2 세션 조회 실패를 비회원으로 오판 → 3값 판정 + flush 직전 재확인 ·
M1 flush 이중 호출 경쟁 → 진행 중 프라미스 공유 · M2 실패한 업로드 뒤 자동 저장 → 중단 · M3 수정 뒤 옛 분석 노출 → 내용 해시 ·
M4 플러스 카드 이중 리프트(Tailwind v4 `translate` 가 `transform` 과 합성) → 단일 `translateY` · M5 남은 큐가 다음 노트에 붙음 →
`note-{id}` 로 재키 · M6 번들 469/470 → 직접 입력 칸 분리 로드 · M7 한도 소진을 실패로 표시 → `isQuotaFallback`.

## 검증
`npm run build` 전 게이트 + 단위 778/778 + 번들 예산(`/notes/new` 468/470KB) + jsonld·cache-policy 통과.
운영 빌드(3100)에서 `check:mobile`(기본 8 + 추가 17경로) · `check:void` · `check:void:mobile` · `check:final-release`(PASS 40 · WARN 1 · FAIL 0 —
final-release 의 업로드 한도 검사는 함수 이름이 아니라 한도 호출 유무를 보도록 고쳤다).

## 남긴 것(다음 판)
- 경보 warn `seo.region_coverage`(화성 동탄구·세종시·병점구·효행구·만세구 pair 페이지 없음) — `market_agg.complex_pair_mv` 재생성 필요, 별도 판.
- `post-daily-real-estate-news` 워크플로 실패 — 이 저장소 밖(다른 저장소).
- 토스 재신청은 `docs/toss-review-1003.md` §3 절차 그대로(상점관리자에서 홈페이지 주소를 naezipnow.com 으로 변경 신청).
