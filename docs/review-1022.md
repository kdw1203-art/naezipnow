# 1022 검토 — 임장노트 · 지도 · AI 분석 · 동네 (지시 4, 담당 J)

소유자 지시(2026-09-28): "부족사항을 분석해서 추가해야 할 기능이나 누락사항, 필요 없는 문구·내용 등을 검토해서 제안해 주고,
전체적으로 정렬(가로세로·가운데·양끝)을 맞추고 글씨 크기·글씨체·전체 테마 등도 맞춰줘."

읽은 범위(코드): `app/notes/**`(피드·상세·작성·best·compare·market·templates) · `app/map/**` · `app/analysis/page.tsx`·`hub-*.tsx`·
`tool-cards-client.tsx`·`AnalysisCrossLinks.tsx` · `app/town/**` + TownHero 를 쓰는 `/apply` `/auctions` `/supply` `/redevelopment` `/qna`.
표의 "적용" 표시는 이번 1022 에서 바로 고친 항목. 파일:줄은 고친 뒤 기준(고치지 않은 것은 현재 줄).

## 0. 이번에 적용한 공통 규칙(네 영역 전부)

| 규칙 | 내용 | 적용 |
| --- | --- | --- |
| 머리 한 모양 | 새 부품 `app/components/PageHead.tsx` — 아이콘 칩 40px + `h1.t-title` + 사실 한 줄(`t-sub`, 폰 숨김 옵션) \| 오른쪽 버튼·칩, 아래 실측 캡션 줄(`t-caption`). TownHero · TownPageHead · hub-hero 는 안에서 이 부품을 쓴다(호출부 API 그대로). | 적용 |
| 글자 | 담당 범위의 `text-[NNpx]` 409곳(13px 149 · 12px 137 · 15px 27 · 10px 17 · 19/21/24px 11) + `text-xs` 81곳 → 램프 유틸(t-body/t-sub/t-caption/t-section/t-title/t-display). 효과 없던 `md:t-*` 변형 5곳 제거. 800 굵기는 범위에 0곳. | 적용 |
| 캡션 하한 | `--fs-caption` 10 → **11px**(globals.css 끝 append 블록). 브리프 "글자 ≥11px · 캡션 11 이상". 램프 유틸을 쓰는 모든 캡션이 함께 오른다. | 적용 |
| 표 숫자 | `td.t-num / th.t-num` 오른쪽 정렬 규칙 추가(tabular-nums 는 .t-num 이 이미 가짐). | 적용 |
| 테마 | 전문가 3화면의 네이비 면 · 워터마크 → 흰 카드 / EmptyState 의 한지 면(inline `--brand-hanji`) → 흰 카드(41곳 공통) / 지도 단지 패널의 실패 고지 4곳 경고색 면 → 흰 카드 / 이모지 아이콘 식별자 26곳 → 선 아이콘 이름. | 적용 |
| 문구 | 권유문 7곳("첫 글을 남겨 보세요" · "넘겨 보세요" · "공유해 보세요" · "찾아보세요" …) · 부연 라벨 3곳("실데이터 기준" · "전문가 모집" · "사람 노트") → 사실 문장. | 적용 |

---

## 1. 임장노트 — `/notes` · `/notes/[id]` · `/notes/new` (+ best · compare · market · templates)

### ① 추가할 기능

| 제안 | 왜 | 어디 | 기존 데이터로 가능한가 |
| --- | --- | --- | --- |
| 피드 **단지·지역 검색칸**(타이핑 → 목록 즉시 필터) | 공개 노트가 30건 넘으면 지역 칩 8개(LeftRail `railRegions`, `notes-feed-client.tsx:770`)로는 못 찾는다. 스토리 줄도 최근순만. | `notes-feed-client.tsx` 머리 아래(필터 칩 줄 왼쪽) | 가능 — `FeedNote.region`·`aptName`·`title` 이 이미 카드에 있다. 클라이언트 필터만(추가 조회 없음). "더 보기" 로 받은 카드도 같은 목록에 합쳐지므로(`allNotes`) 그대로 걸린다. |
| 상세의 **같은 단지 다른 노트** | RelatedNotes 는 `region` 만으로 뽑는다(`[id]/RelatedNotes.tsx` props `currentId, region`). 같은 단지의 다른 사람 노트가 같은 지역 노트 사이에 묻힌다. | `[id]/RelatedNotes.tsx` | 가능 — 목록 행에 `aptName` 이 이미 있다(`RelatedNotes.tsx:106`). aptName 일치를 앞줄로, 나머지 지역 일치를 뒤로. |
| 내 노트 탭 **회차 묶기** | 같은 단지 2회차 이상이면 카드가 회차마다 따로 선다. `round` 배지(`notes-feed-client.tsx` NoteBadges)는 있는데 묶음이 없다. | `notes-feed-client.tsx` 내 노트 뷰 | 가능 — `FeedNote.round`·`aptName` 으로 그룹. 묶음 카드 클릭 → `/notes/compare?apt=`(이미 있는 화면). |
| 작성 3단계 **저장 전 요약 한 장** | 퀵 기록이 아닌 3단계 폼(NoteForm `NOTE_STEPS`)은 마지막 단계에서 "무엇을 적었는지" 한 화면에 안 모인다. | `notes/new/NoteFinishStep.tsx` | 가능 — 폼 상태가 전부 클라이언트에 있다. 새 데이터 없음. |
| best 월 페이지의 **노트 카드에 점수 축 3개** | 선정 기준 표(`best/[ym]/page.tsx:244`)는 있는데 각 노트 카드는 총점만. 왜 뽑혔는지 카드에서 안 보인다. | `best/[ym]/page.tsx` 목록 카드 | 가능 — `month.picks[].breakdown` 이 표에 이미 쓰인다. |

### ② 누락(빈 상태 · 오류 · 게이트 · 폰 조작)

| 항목 | 현재 | 제안 |
| --- | --- | --- |
| 피드 "더 보기" 실패 | `moreError` 는 글자만(`notes-feed-client.tsx:1082` 근처, `role="alert"`), 다시 시도 버튼이 같은 버튼("더 보기")이라 사용자가 눌러야 한다는 걸 모른다. | 실패 문구 옆에 "다시 시도" 를 같은 버튼 라벨로 바꾼다(`loadingMore ? … : moreError ? "다시 시도" : "더 보기"`). |
| 내 노트 탭 조회 실패 | `mineState.status === "failed"` 는 `activeLoadError` 카드 한 줄 — 재시도 없음. | 카드에 `loadMine()` 재호출 버튼. |
| 게스트가 `?tab=mine` 으로 진입 | 세션 프로브 뒤 공개 탭으로 조용히 떨어진다(`wantsMineTab` · `loggedIn=false`). | 한 줄 안내("내 노트는 로그인 후") + 로그인 링크(`/login?next=/notes?tab=mine`). |
| 상세 댓글 실패 | "댓글을 불러오지 못했어요"(`[id]/page.tsx:1520` 부근) 새로고침 권유만. | 같은 자리 재시도 버튼(NoteComments 가 클라이언트라 가능). |
| 작성 화면 **뒤로가기 보호** | 초안은 자동 저장(`writeDraft`)되지만, 브라우저 뒤로가기·탭 닫기에 `beforeunload` 경고가 없다. | 미저장 변경이 있을 때만 `beforeunload`. |
| 폰 격자 3열 타일 | 타일 안 판단 배지가 `t-caption`(이제 11px) — 3열 격자(≈118px)에서 배지 2개가 겹칠 수 있다. | 격자 타일은 배지 1개(판단)만, 회차·AI 는 피드 카드에서만. |
| /notes/market | 판매 오픈 전 잠금 화면인데 사이트맵·검색 색인 여부가 문서에 없다. | `robots`/`sitemap-notes` 제외 여부 확인(별도). |

### ③ 필요 없는 문구·내용

| 파일:줄 | 문구 | 이유 | 상태 |
| --- | --- | --- | --- |
| `notes/[id]/page.tsx:842` | "AI 진단 · {단지} **실데이터 기준** · 첫 실행 +100P" | "실데이터 기준" 은 1015 규칙 C 로 다른 화면에서 걷은 부연 라벨. | 적용 |
| `notes/[id]/card/NoteCardStudio.tsx:493` | "…임장 카드예요. **점을 눌러 넘겨 보세요.**" | 권유문 → "임장 카드 N장 · 아래 점으로 이동". | 적용 |
| `notes/notes-feed-client.tsx` 머리 | (1015 에서 이미 걷음) | — | — |
| `notes/[id]/page.tsx:1018~` 지역·단지 칩 | 마지막 칩만 네이비 채움(`bg-brand-navy`) | 칩 줄에서 하나만 색면 — 강조 의도지만 화면당 채움 1개 규칙과 겹친다. 테두리 칩 + 굵기로. | 제안 |
| `notes/new/NoteForm.tsx:2422` | 오프라인 배너 경고색 면(`bg-warning-soft`) | 상태 배너라 색 신호는 남길 만하다. 다만 같은 화면의 다른 고지는 흰 카드(1015). 흰 카드 + 아이콘 색만 경고색으로 통일 제안. | 제안 |
| `notes/market/page.tsx` | "판매 오픈 준비 중" 경고색 알약 | 경고가 아니라 상태 — 테두리 칩으로. | 적용 |

### ④ 정렬·글자·테마 불일치

| 파일:줄 | 불일치 | 상태 |
| --- | --- | --- |
| `notes/notes-feed-client.tsx:870`(구) | 머리가 h1 만(칩·한 줄 없음), `md:t-title` 효과 없음 | PageHead 로 · 적용 |
| `notes/[id]/page.tsx:1031`(구) | h1 `t-section md:t-title` — 폰에서 카드 제목 크기(md 변형은 효과 없음) | `t-title` · 적용 |
| `notes/best/page.tsx:78` · `best/[ym]/page.tsx:156` · `compare/page.tsx:200,296` · `market/page.tsx:61` | 맨 h1(칩 없음) · 설명이 `t-body` 로 머리마다 다른 크기 | PageHead(sub=t-sub) · 적용 |
| `notes/[id]/deck/DeckViewer.tsx` 10곳 · `new/NoteDetailFields.tsx` 6곳 · `new/NoteForm.tsx` 4곳 · `[id]/NoteComments.tsx` 등 | `text-[12/13/15/19/24px]` | 램프 유틸 · 적용 |
| `notes/compare/page.tsx:207` | 회차 칩 줄이 `text-xs`(12) — 램프 밖 클래스 | `t-sub` · 적용 |
| `notes/loading.tsx` | 스켈레톤 머리가 옛 모양(칩 없음) → 실제 머리 붙을 때 점프 | PageHead 모양 · 적용 |
| `components/ui/EmptyState.tsx:120` | 빈 상태만 한지 면(inline background) — 주변 카드는 전부 흰색 | 흰 카드 · 적용 |
| `notes/notes-feed-client.tsx:371` | 점수 칩 한지+남색(`bg-brand-hanji`) | 작은 칩이라 남김. 홈 시안 [962] 과 같은 규칙. | 유지 |
| `notes/[id]/deck/DeckViewer.tsx:28~52` | 덱 카드 네이비 면(`bg-brand-navy text-on-dark`) | 프레젠테이션(덱)은 의도된 어두운 면 — 범위지만 화면 성격상 유지. 필요하면 별도 지시. | 유지 |

---

## 2. 지도 — `/map`

### ① 추가할 기능

| 제안 | 왜 | 어디 | 기존 데이터로 가능한가 |
| --- | --- | --- | --- |
| **관심 단지 레이어**(내 노트 레이어와 나란히) | 내 노트 레이어(`map-client.tsx:1103~`)는 있는데 관심 단지(watchlist)는 지도에 없다(`map-client.tsx` 에 watchlist 언급 0곳). 노트를 쓰면 자동 등록까지 되는데(`api/inspection/notes/route.ts:59`) 지도에서는 못 본다. | 레이어 토글 줄 | 가능 — `lib/watchlist/store-db`(isWatching·addToWatchlist) 목록 읽기 + 단지 좌표는 이미 지도가 가짐. 읽기 API 는 `/api/bookmarks` 계열 확인 뒤 재사용(새 계산 없음). |
| 검색 결과 **최근 본 단지** 줄 | MapSearchBox 는 입력 전 상태가 빈 목록. | `MapSearchBox.tsx` | 가능 — `app/components/RecentComplexes.tsx` 가 쓰는 localStorage 키 재사용. |
| 뷰포트 안 **단지 수·거래 수 한 줄** | 지도를 옮겨도 "지금 몇 곳이 보이는지" 가 없다. 목록 패널 열어야 안다. | 상단 칩 줄 끝 | 가능 — `visibleDanji.length` 는 상태로 있다. |

### ② 누락

| 항목 | 현재 | 제안 |
| --- | --- | --- |
| 페이지 머리 | `page.tsx:484` `h1` 은 `sr-only`(전체 화면 지도라 의도) | 유지. 대신 상단 검색 칸이 머리 역할 — 검색 칸 높이 40px 확인됨. |
| 레이어 실패 고지 | `mapNotices`(`map-client.tsx:3683~`) 7종 전부 "잠시 후 다시 시도해 주세요" 글자만, 재시도 손잡이 없음 | 고지마다 해당 레이어 재조회 버튼(각 fetch 는 이미 함수로 있다). |
| 내 노트 레이어 게스트 | `myNotesState === "unauth"` 처리 있음 | 유지. |
| 폰 — 단지 패널 열린 상태에서 지도 조작 | 패널이 바텀시트 — 시트 손잡이(drag) 여부 코드로는 판정 못 함 | 실기기 확인 항목. |
| 타일 실패 화면 | `map-client.tsx:3633` `bg-gradient-to-br from-line to-line-strong` 회색 그라데이션 면 | 그라데이션 금지 규칙 — 단색 `bg-bg` 로(범위 안이지만 지도 로딩 셸과 같은 면이라 담당 I·G 와 무관, 다음 차수). |

### ③ 필요 없는 문구·내용

| 파일:줄 | 문구 | 이유 | 상태 |
| --- | --- | --- | --- |
| `map/error.tsx:17` | "…다시 시도하거나 **단지 검색으로 찾아보세요**" | 권유문 → "다시 시도 또는 단지 검색". | 적용 |
| `map/map-client.tsx:3711,3735,3774` | "…사업장이 없다는 뜻은 아니에요" 류 꼬리 | 사실 고지라 유지(실패 ≠ 없음 구분은 브리프 원칙). | 유지 |
| `map/ComplexInfoPanel.tsx:861` | "단지 마스터와 아직 연결되지 않았어요. 실거래·이야기는 아래를 참고해 주세요." | 뒷문장은 권유 — "…연결되지 않음 · 아래는 실거래·이야기" 로. | 제안 |

### ④ 정렬·글자·테마 불일치

| 파일:줄 | 불일치 | 상태 |
| --- | --- | --- |
| `map/map-client.tsx` 12곳 · `MapSearchBox.tsx` 3곳 · `ComplexInfoPanel.tsx` 2곳 · `HistogramRangeSlider.tsx` 1곳 | `text-[12/13/15px]` | 램프 · 적용 |
| `map/ComplexInfoPanel.tsx:854,1006,1132,1290` | 실패 고지 4곳이 경고/위험색 면 — /notes 의 실패 카드(흰 카드)와 다름 | 흰 카드 · 적용 |
| `map/map-client.tsx:1718,2032,2131,2143,3634,4472` · `MapSearchBox.tsx:418,461,505` | 이모지 식별자 아이콘(🏠·🎨·🏫·🚇·🗺·📍·🏢) | 선 아이콘 이름 · 적용 |
| `map/ComplexInfoPanel.tsx:466` | 패널 섹션 머리 `items-end` — 다른 섹션 머리는 `items-baseline` | 글자만 있는 줄이라 baseline 으로 통일 제안(패널 내부 SectionHead 사용 검토). |
| `map/map-client.tsx:3821` · `MapClientLazy.tsx:50` | 지도 셸 배경 그라데이션 | 지도 타일이 덮는 면이라 보이지 않음 — 단색으로 바꿔도 무방. 제안. |

---

## 3. AI 분석 허브 — `/analysis`(도구 4종 · price · timing · temperature · gap 은 담당 G·H·I)

### ① 추가할 기능

| 제안 | 왜 | 어디 | 기존 데이터로 가능한가 |
| --- | --- | --- | --- |
| **최근 실행 결과 3건**(최근 사용 칩 옆) | `LastToolChip` 은 "어느 도구를 열었나" 만 기억(`tool-cards-client.tsx` `nz_last_analysis_tool`). 결과 자체는 `lib/ai/history-store` 에 있다(담당 I 가 같은 저장소를 읽는다). | `hub-hero.tsx` 머리 오른쪽 또는 검색 카드 아래 | 가능 — history-store 의 항목(도구·단지·점수·시각) 만 읽어 링크(`/analysis/ai/r/[id]`). 새 계산 없음. |
| 시장 계열 카드 **지역 고정 해제** | 티저가 강남구 고정 표본(`hub-tool-card.tsx` 주석 [958]) — 사용자가 고른 단지의 지역이 있어도 카드는 강남구를 보여 준다. | `page.tsx` MARKET_LIVE 카드 · `hub-teasers.ts` | 부분 가능 — `picked.regionId` 가 허브 컨텍스트에 있다. 다만 티저 캐시가 지역별로 늘어나므로(하루 1회 적재) 상위 8개 지역까지만 제안. |
| 단지 고른 뒤 **바로 실행 4칸에 "마지막 실행 N일 전"** | 같은 단지를 다시 고르면 지난 결과가 있는지 모른다. | `hub-hero.tsx` 실행 지점 카드 | 가능 — history-store 에 단지 id 로 조회. |
| 계열 머리의 **개수 배지 → 링크** | `TierHead` 의 "N종" 은 정보만. | `page.tsx` TierHead | 가능(링크만). |

### ② 누락

| 항목 | 현재 | 제안 |
| --- | --- | --- |
| 커버리지 실패 | `coverage` 가 null 이면 "—"(`hub-hero.tsx` Num) — 사실대로. | 유지. |
| 공개 AI 미리보기 0건 | "공개된 AI 정리 없음" 카드(`page.tsx`) | 유지(샘플 금지). |
| 로그인 판정 전 | `HubRecordStart` 가 게스트 카드를 먼저 보이고 세션 뒤 바꿔 끼움 → 로그인 사용자는 카드가 한 번 바뀐다(레이아웃 점프). | 게스트·로그인 카드 높이를 같은 `min-h` 로. |
| 한도 캡션 | 무료 누적/월 구분 표기 있음 | 유지. |
| 폰 — 계열 칩 3개(TierNav) | 머리 오른쪽에서 폰은 아래로 내려와 가로 스크롤(`scroll-x-hidden-bar`) | 유지(40px 확인). |

### ③ 필요 없는 문구·내용

| 파일:줄 | 문구 | 이유 | 상태 |
| --- | --- | --- | --- |
| `analysis/page.tsx` 예시 계산 `<details>` | "실데이터 아님 · N종" 배지 + "실연동 전 도구 · 예시 수치로 계산 · 의사결정 근거로 쓰지 않는다" 한 줄 | 둘 다 사실 고지라 유지 — 다만 배지와 한 줄이 같은 말을 두 번 한다. 배지만 남기고 한 줄은 details 안 첫 줄로. | 제안 |
| `analysis/tool-cards-client.tsx:96` | "↻ 최근 사용 · {도구} 이어가기 ›" | "이어가기" 는 권유 꼬리 — "최근 사용 · {도구} ›". | 제안(담당 범위지만 홈 통합자와 칩 문구 맞춘 뒤) |
| `analysis/page.tsx` 에이전트 카드 | "내 임장노트·실거래 조회 · 참고한 자료 목록 표시 · 수도권 실거래 기준" | 사실 나열 — 유지. | 유지 |

### ④ 정렬·글자·테마 불일치

| 파일:줄 | 불일치 | 상태 |
| --- | --- | --- |
| `analysis/hub-hero.tsx:132~`(구) | 머리 마크업이 TownHero 와 같은 모양을 손으로 다시 그림 | PageHead 공용 · 적용 |
| `analysis/page.tsx` TierHead | 섹션 h2 가 `t-title`(화면 제목과 같은 크기) | `t-section` · 적용 |
| `analysis/AnalysisCrossLinks.tsx:52` | `rounded-3xl px-[18px]`(반경 눈금 밖·임의 패딩) + `text-xs`·`text-[12px]` | `rounded-2xl p-4` · `t-sub` · 적용 |
| `analysis/tool-cards-client.tsx:96,107` · `hub-picker.tsx` | `text-xs` · `text-[15px]` | 램프 · 적용 |
| `analysis/hub-picker.tsx:33` | 자리표시자 아이콘 칩 36px(`h-9 w-9`) 경고색 — 실제 카드(ai-note-analysis, 범위 밖)와 같은 값이라 유지 | 유지 |
| **범위 밖** `analysis/temperature/TempMapClient.tsx:234` · `timing/TimingClient.tsx:296` · `gap/page.tsx:124` · `price/page.tsx:278` | 도구 4종 머리 h1 이 `t-display`(허브·노트·동네는 `t-title`) — 화면을 옮기면 제목이 한 단계 커졌다 작아진다 | 담당 G·H 폴더 — 다음 차수에 PageHead 로 |
| **범위 밖** `analysis/ai/[tool]/page.tsx:105` | 단지 고르기 전 머리가 네이비 면(`hub-hero` + 한지 글리프 칸) — 허브·지역 도구는 흰 머리 | 담당 I 폴더 — 다음 차수 |
| **범위 밖** `analysis/temperature/[region]/page.tsx` 17곳 · `analysis/ai-note-analysis.tsx:282~302` | `text-[px]` · on-dark 토큰 | 다음 차수 |

---

## 4. 동네 — `/town` · `/town/[region]` · 뉴스룸 · 전문가 · 모임 · 자료실 · 글감 · 쓰기 (+ `/apply` `/auctions` `/supply` `/redevelopment` `/qna`)

### ① 추가할 기능

| 제안 | 왜 | 어디 | 기존 데이터로 가능한가 |
| --- | --- | --- | --- |
| 동네 홈(`/town/[region]`)에 **이 동네 공개 임장노트 수·최근 3건** 머리 캡션 | 페이지가 이미 노트를 읽는데 머리에는 숫자가 없다. | `town/[region]/page.tsx` PageHead `facts` | 가능 — 같은 페이지의 노트 배열 길이·최신 3건. |
| 피드 카드 **지역 칩 클릭 → 동네 홈** | 카드의 지역 글자가 링크가 아니다(`feed-client.tsx` 카드 메타). | `feed-client.tsx` | 가능 — `/town/{regionId}` 카탈로그 매핑(`lib/town/region-groups`) 이 있다. |
| 뉴스룸 **주제(tag) 칩을 머리 아래로** | `/town/news/tag/[tag]` 에서만 다른 주제 칩이 보이고, `/town/news` 첫 화면은 오른쪽 레일 끝에 있다. | `town/news/page.tsx` | 가능 — `NEWS_TAGS` 정적 목록. |
| 전문가 목록 **지역·분야 필터 URL 반영** | `ExpertsClient` 필터 상태가 URL 에 없어 공유·뒤로가기에 안 남는다. | `experts/ExpertsClient.tsx` | 가능 — `replaceState` 만(브리프 규칙). |
| Q&A 상세 → **같은 단지 임장노트·실거래 링크** | 질문에 단지가 붙어 있어도 상세에서 단지 허브(`/complex/[id]`)·공개 노트로 가는 길이 없다(목록 필터 "답변 대기·완료·많은" 은 이미 있음 `qna/QnaListClient.tsx:31~36`). | `qna/[id]/page.tsx` | 가능 — 질문 행의 단지명·지역으로 링크만. |

### ② 누락

| 항목 | 현재 | 제안 |
| --- | --- | --- |
| 피드 조회 실패 | 위험색 면 한 줄(`feed-client.tsx:671`) + 빈 상태 카드 안에서 "글을 불러오지 못했어요" — 재시도 없음 | 재시도 버튼(`loadMore` 와 같은 fetch 재사용). 면은 흰 카드로(다음 차수 — 이번엔 문구만). |
| 이야기 쓰기 게스트 | `useSoftSignup` 으로 저장 시점에 가입 유도 | 유지(브리프 소프트 가입 정책). |
| 모임 상세 채팅 | 게스트는 입장 불가 상태 처리 있음(`groups/[id]/ChatRoom.tsx:132`) | 유지. |
| 자료실 결제 | 결제 오픈 전 잠금 — 문구는 사실(`library/[id]/page.tsx:194`) | 유지. |
| 폰 — 동네 홈 `KeywordAlertButton` + "이 동네 이야기 쓰기" 두 버튼 | 머리 오른쪽에서 폰은 아래 줄로 내려옴(PageHead) — 두 버튼 합계 폭 확인 필요 | 실기기 확인. |
| 전문가 목록 0명 | "모집 중 · 인증 심사 통과 순으로 공개" 한 줄(`experts/page.tsx:138`) | 유지. |

### ③ 필요 없는 문구·내용

| 파일:줄 | 문구 | 이유 | 상태 |
| --- | --- | --- | --- |
| `town/feed-client.tsx:688~693` | "— 첫 이야기를 남겨 보세요" · "— 첫 글을 남겨 보세요" | 권유문. 빈 상태 아래 버튼("첫 이야기 쓰기")이 같은 말을 이미 한다. | 적용 |
| `town/news/[id]/CommentThread.tsx:160` | "아직 댓글이 없어요. 첫 댓글을 남겨보세요." | 권유문 → "댓글 0건". | 적용 |
| `town/news/[id]/page.tsx:613` | "현장을 다녀오셨다면 임장노트로 기록해 이웃과 공유해 보세요." | 권유문 → "현장 기록 · 공개 노트는 동네이야기 피드에 실림 · 지역 자동 입력". | 적용 |
| `town/experts/join/page.tsx:96`(구) | "전문가 모집" 캡션 라벨(제목 위) | 부연 라벨 — 제목이 "전문가 참여 신청 …" 으로 이미 말한다. | 적용 |
| `town/page.tsx` 머리 캡션 | "사람 노트 N" | "사람" 은 Lab 노트와 가르려는 부연 — "임장노트 N · Lab 노트 N" 이면 충분. | 적용 |
| `town/feed-client.tsx:697~700` | "다녀온 동네의 인상·질문·사진을 남기면 이 피드에 바로 보여요" · "첫 임장노트나 동네이야기를 남기면 가장 먼저 노출돼요" | 설명문(권유 꼬리) — "이 피드 · 이웃 글 0건" 사실 한 줄로. | 제안(빈 상태 문구는 통합자 홈 문구와 맞춘 뒤) |
| `town/news/[id]/page.tsx:346,506` | "· 자동 수집" · "자동 수집 콘텐츠 · 저작권은 원 매체에 있음" | 출처·저작권 고지(사실) — 유지. | 유지 |
| `town/experts/page.tsx:100~` 소개 카드 | 머리(TownHero) 통계와 같은 숫자를 소개 카드 아래에 또 그린다(인증 전문가·답변 완료) | 한 번만 — 소개 카드의 3칸은 평점만 남기거나 삭제. | 제안 |

### ④ 정렬·글자·테마 불일치

| 파일:줄 | 불일치 | 상태 |
| --- | --- | --- |
| `town/page.tsx:179`(구) | 머리에 아이콘 칩 없음(다른 9칸은 칩 있음) | PageHead · 적용 |
| `town/news/page.tsx:128`(구) | h1 `t-display`(9칸 중 유일) | PageHead(t-title) · 적용 |
| `town/news/tag/[tag]/page.tsx:90`(구) | h1 `text-[21px]` 맨 제목 + 설명 두 문장 | PageHead + 사실 한 줄 · 적용 |
| `town/[region]/page.tsx:159`(구) | 머리 `items-end` + 브레드크럼이 제목 위 · 버튼 `py-[9px]` 임의값 | PageHead(items-center) · `btn-md` · 적용 |
| `town/write/page.tsx:390`(구) | 맨 h1 | PageHead · 적용 |
| `town/experts/page.tsx:100` · `experts/join/page.tsx:93,269` · `experts/[id]/page.tsx:152` | 네이비 면 + 워터마크(1017 이 9칸 머리에서 걷은 뒤 이 셋만 남음) · `rounded-3xl` | 흰 카드 · `rounded-2xl` · on-dark → ink/text-2 · 적용 |
| `town/experts/ExpertCard.tsx:79` | 아바타 네이비 원 — 상세 화면 아바타(한지→primary-soft)와 다름 | primary-soft · 적용 |
| `town/news/[id]/page.tsx` 32곳 · `groups/[id]/page.tsx` 24곳 · `groups/[id]/ChatRoom.tsx` 21곳 · `library/[id]/page.tsx` 13곳 · `news/[id]/CommentThread.tsx` 12곳 · `prompt/[idx]/page.tsx` 9곳 등 | `text-[10/12/13/15/19/21px]` · `text-2xl` | 램프 · 적용 |
| `town/groups/[id]/page.tsx:138` · `prompt/[idx]/page.tsx:81` · `library/[id]/page.tsx:128` · `news/[id]/page.tsx:356` | 상세 h1 이 각각 21/19/19/24px | 전부 `t-title` · 적용 |
| `town/feed-client.tsx:679` · `groups/[id]/page.tsx:142~155` · `LocationMap.tsx:73` | 이모지 식별자 아이콘 | 선 아이콘 이름 · 적용 |
| `town/feed-client.tsx:84` | 아바타 네이비/한지 원 | 작은 원(사람 글 구분) — 유지 |
| `town/feed-client.tsx:671` | 피드 실패 고지 `bg-danger-soft` 면 | 흰 카드로 — 제안(통합자 홈 피드와 같은 면을 쓰므로 함께) |
| `town/loading.tsx` | 스켈레톤 머리에 칩 없음 | PageHead 모양 · 적용 |
| `/apply` `/auctions` `/supply` `/redevelopment` `/qna` | TownHero 호출 — 이제 안에서 PageHead 를 쓰므로 자동으로 같은 모양. loading.tsx 도 TownHero 를 쓴다. | 적용(간접) |

---

## 5. 범위 밖에서 발견한 것(문서만 — 담당 폴더·통합자)

| 파일 | 내용 |
| --- | --- |
| `app/analysis/temperature|timing|gap|price` 머리 | h1 `t-display` 4곳 → `t-title`(PageHead) — 화면 간 제목 크기 통일의 마지막 조각 |
| `app/analysis/ai/[tool]/page.tsx:105` | 단지 고르기 전 네이비 머리(hub-hero + 한지 글리프 칸) |
| `app/analysis/ai-note-analysis.tsx:282~302` · `analysis/compare/page.tsx:416` · `scenario/ScenarioClient.tsx:421,615` · `search/ComplexPickerList.tsx:149` | "실데이터 기준" 부연 라벨 · on-dark 토큰 |
| `app/analysis/temperature/[region]/page.tsx` | `text-[px]` 17곳 |
| `app/components/home/*`(통합자) | `text-[px]` 14곳(HomeEngagementCard 6 · ResumeDraftPopup 3 · HomeHeroSearch 3 · HomeTownBlock 2) |
| `app/components/viz/*`(담당 I) | `Gauge.tsx` `text-[21px]` · `PriceHistoryChart.tsx:207` 경고색 배지 · 데이터 표 셀 정렬 없음 |
| 사이트 나머지 | `text-[px]` 상위: admin 12화면 · `listings/[id]` 30 · `payment/success` 30 · `dev-deals` 48 · `calculator` 19 · `signup/login/reset` 51 — 램프 게이트는 통과하지만(램프 값이라) 임의 px 표기 자체는 남아 있다. 다음 차수에 같은 스크립트로 일괄 치환 가능(이번 치환 규칙: 13→t-body · 12→t-sub · 10→t-caption · 15 굵게→t-section · 19/21→t-title · 24→t-display). |
| `--fs-caption` 11px | 전 사이트 캡션이 1px 커졌다. 좁은 칸(3열 격자 배지·지도 말풍선)은 실기기에서 줄바꿈 확인. |

## 6. 우선순위 제안(실행 단위)

1. 도구 4종 머리 `t-display` → PageHead(담당 G·H 폴더, 4파일) — 이번 통일의 마지막 조각.
2. 임장노트 피드 검색칸(클라이언트 필터, 새 조회 없음).
3. 지도 관심 단지 레이어(기존 watchlist 저장소 + 좌표).
4. 실패 고지 재시도 손잡이(피드 더 보기 · 내 노트 · 댓글 · 지도 레이어 7종) — 문구만 있고 손잡이가 없는 곳 전부.
5. 허브 최근 실행 결과 3건(history-store 읽기만).
6. 상세 RelatedNotes 를 같은 단지 우선으로.
