# 1014 — 원래 디자인 컨셉으로 되돌리기 (v4 "한 화면 한 가지" 철회)

주인님 지시(1012 가 실제로 배포된 뒤): **"홈페이지의 기존 디자인이 완전히 사라졌어. 홈, 임장노트, AI 분석, 동네, 요금제 전부
원래 디자인 컨셉을 유지하도록 해줘"** → 물음에 답: 개편 전 모습으로 되돌리기 · 전체 화면 · 폰 글자 75% 유지.

## 1. 되돌린 것 — 화면 구조 전부 1011(1012 개편 전)로

- v4 표식(`[v4]`)이 있던 파일 241개 + 표식 없이 v4 로 바뀐 분석 허브 묶음(page·hub-tiers·tool-catalog·workbench-cards 등)을 1011 코드로.
  v4 가 새로 만든 부품(hub-row·hub-search·SummaryRow·ComplexDataSources·Home*Rows/EntryList/NotesList/RegionTrend·region-chips·
  home-entries·hub-summary·feed-regions)은 지웠고, v4 가 지웠던 부품(HomeStartDoors·HomeTicker·HomeToolPick·HomeEngagementCard·
  HomeLevelKpi·HomeMyRail·HomeBudgetChips·HomeCoverageLine·HomeTodayLine·RegionPulseCards·hub-hero·hub-record-start·ToolHero·
  TownPageHead·BrandSloganBand·ComplexFactsCard·ComplexInfoGrid·ComplexNearbyPoi·DealListLazy·NearbyRedevelopment)은 되살렸다.
- 단지 상세(`app/complex/[id]`)는 v4 시안 직전에 떠 둔 v3 상태 백업(35 파일)으로 — v3 형태 규율은 이미 적용된 판.
- 헤더·탭바도 개편 전 **떠 있는 유리 알약**(리퀴드 글래스)으로. 계정 배지만 v3(✦ 없이 planBadgeLabel 단일 출처) 유지.
- 되돌린 파일에 v3 형태 규율을 다시 적용: 임의 반경 537곳 → 눈금(sm·lg·3xl), 굵기 800 → 700(286 파일), UI 이모지 26곳 → 글자·선 아이콘,
  금지 문구 9곳 → 동사+대상, 장식 그라데이션 8곳 → 단색, `.card` 위 12px 반경 14곳 제거, 느낌표 6곳. 게이트 `check-ai-look` PASS.
  · 게이트 허용 목록: 개편 전 화면의 보조 채움 파랑(16 파일)은 `[1014]` 이유로 등록 — 다음 판에서 outline 으로.

## 2. 유지한 것 (주인님이 따로 요청)

- 폰 배율 75%(`app/layout.tsx` MOBILE_SCALE, 간격 60%, 탭바 85%) · "최대한 한 줄" 규칙(globals.css `html[data-mscale]`).
- 임장노트 썸네일(템플릿 3종 + AI 문구, 33편 적용분) — 목록 격자·동네 피드·프로필·공유 카드가 그대로 읽는다.
  되돌린 1011 격자 타일은 템플릿 썸네일이면 제목 오버레이를 겹쳐 그리지 않는다.
- 뉴스 썸네일(1013) — 개편 전 뉴스룸 행(.news-row)에 **모든 행** 같은 칸(사진 없으면 매체 이름)으로 옮겨 붙였다. 주제 허브도 같다.
- 리퀴드 목록 톤(v4.1 CSS) — `divide-y` 묶음이 남은 자리(여정·리포트 등)에는 그대로 그려진다. `--line` 오류 수정(1013)도 그대로.
- v3: 자체 일러스트(Illust) · 이모지/그라데이션/반짝이 0 · 라이선스 문서 · 노트 저장 → 썸네일 고르기 → 상세 흐름 ·
  AI 정리 저장 경합 수정 · CoverImage 하이드레이션 전 실패 처리.

## 3. 검사·문서

- 삭제: `complex-v4`·`town-v4`·`town-sub-v4`·`map-v4`·`notes-1012-ig`·`town-v4-title` 테스트. 1012 테스트 4벌(home·notes·town·complex)은
  v4 구조를 못 박던 항목만 빼고 v3 소스 규칙(이모지·굵기·반경·금지 문구·느낌표)은 그대로 — 되돌린 코드가 통과한다.
  1011 시절 테스트(journey-1008·my-1006·seo-1006·product-1007·static-pages-1007·analysis-hub-catalog)는 1011 판으로.
- `docs/design-system.md` 맨 위 v4 절을 "철회" 절로 바꿨다(리퀴드 목록·썸네일 절은 유지). v4 규칙 12 는 더 이상 규범이 아니다.

## 4. 검증

- `npm run build` 전 체인 통과(단위 테스트 1,323 · 번들 예산 · JSON-LD · 캐시 정책). 번들: 홈 477 · 분석 476 · 단지 478 · 노트 쓰기 467 · 지도 354KB.
- 폰 첫 화면 캡처 5장(홈·임장노트·AI 분석·동네·요금제)을 1011 캡처와 나란히 확인 — 같은 구조.

## 5. 남긴 것

- v3 문구 규율 중 되돌린 파일에서 사라진 것(권유형 어미 "~해 보세요" 30여 곳 · 카테고리 카드 부제 · 요금제 CTA 의 실제 청구액 표기)
  — 원래 컨셉 안에서 문구만 다듬는 다음 판.
- `app/globals.css` 에 v4 전용 클래스(hub-row 등)가 남아 있다 — 동작 영향 없음.
