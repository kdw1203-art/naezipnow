# 1090 — 대규모 최적화 2: 남은 일정 비움 태그 제거 · 동네이야기·분석 셸 한 벌

소유자 2026-10-25 "대규모 최적화를 진행해줘". 운영은 여전히 **503 `DEPLOYMENT_PAUSED`**(1089 까지 푸시됐으나 전부 BLOCKED).
1089 가 단지 화면의 실제 수명을 1시간 → 7일로 돌려놓았는데, 남은 태그를 끝까지 따라가 보니 **그 7일을 하루 네 번 무효로 만드는 일정 비움이 둘 더** 있었다.
DB 변경 없음 · 가격·결제·심사 화면 변경 없음 · GitHub main(1089) 위에 적용하는 묶음이다(1084~1089 는 이미 main · 배포만 BLOCKED).

## 찾은 것 1 — 단지 화면에 남아 있던 "일정 비움" 태그 둘

1089 뒤 단지 화면(2.4만 쪽)에 붙은 태그: `supply` · `news` · `town-posts` · `cx-r:<지역>` · `verified-experts`. 이 가운데

| 태그 | 누가 언제 비우나 | 결과 |
|---|---|---|
| `town-posts` | 뉴스 재검증 크론(vercel.json `40 23,1,5` — **하루 3슬롯**) → `invalidateNewsHubs()` → `invalidateTownDataCaches()` | 단지 2.4만 쪽 + 뉴스 상세 1,400여 쪽이 **하루 세 번 통째로** 비워진다 |
| `supply` | 입주물량 적재(GitHub Actions 매일 06:00 UTC) → `invalidateAfterIngest("supply")` **바뀐 행이 0 이어도** | 단지 2.4만 쪽이 **매일 한 번 더** 비워진다 |

둘 다 단지 화면이 읽는 "관련 글 목록"(related-town-posts-v1) · "앞으로 입주 N세대"(upcoming-supply-v2) 캐시의 태그가 화면에 옮겨 붙은 것이다.
`news` 태그는 아무도 비우지 않고 `verified-experts` 는 관리자 승인 때만이라 그대로 둔다.

### 고친 것

| 무엇 | 전 | 후 |
|---|---|---|
| 단지 화면 · 뉴스 상세의 관련 글 목록 | 태그 판(news · town-posts) | **태그 없는 판**(`related-town-posts-stale-v1` · 7일) — 제목 · 출처 · 시각뿐이라 화면 수명(7일)과 같은 지연이 틀린 말을 만들지 않는다. 동네 홈 · 홈 · 피드는 태그 판 그대로(뉴스 적재 때 새로 읽어야 한다) |
| 단지 화면의 입주물량 캐시 | `supply` 태그 | 태그 없음(7일 · 그 지역에 새 실거래가 들어오면 cx-r 로 그때). 지역 화면(/region)의 입주 예정 물량은 제 캐시 · 경로 비움 그대로 |
| 입주물량 적재 크론 | 매일 무조건 `supply` 비움 | **바뀐 행이 있는 날에만**(upserted + migrated + 공고 + 경쟁률 > 0) |
| 빌드 게이트 `check-isr-ttl` | market · economy 만 봄 | 일정으로 비워지는 태그 **전부**(market · economy · supply · town-posts · weekly-digest · map-* · home-data)를 단지 · 뉴스 상세에서 금지. 같은 모듈의 태그 판은 이유를 적어 허용하고 `tests/unit/review-1090` 이 "태그 없는 판을 부른다"를 소스로 잠근다 |

측정(로컬 빌드 · 저장된 `x-next-cache-tags`): 단지 화면 태그 `supply · news · town-posts · cx-r · verified-experts` → **`cx-r · verified-experts`** · 뉴스 상세 `news · town-posts` → **없음**. 수명은 둘 다 `s-maxage=604800` 그대로.

## 찾은 것 2 — 동네이야기 · 분석 구역의 셸 두 벌(1087 단지 화면과 같은 현상)

`app/town/loading.tsx` 가 /town/* 전부를, `app/analysis/loading.tsx` 가 /analysis/* 전부를 감싸는 로딩 경계인데 둘 다 PageShell(헤더 · 옆 메뉴 · 푸터 · 탭바)을 통째로 그렸다.
React 는 큰 Suspense 경계(12.8KB 초과)를 "대체 조각 + 본문 + 바꿔치기 스크립트"로 내보내므로, 이 구역의 **모든 ISR HTML 에 셸이 두 벌**(본문 + 대체 조각 ~31KB) · RSC 에도 두 벌 실렸다.
뉴스 상세 1,400여 쪽 · 동네 홈 109쪽 · 시장 온도 지역 69쪽 · AI 도구 12쪽 · 허브 전부가 해당한다.

### 고친 것

- `app/town/layout.tsx`(PageShell wide 한 벌) · `app/analysis/layout.tsx`(PageShell 한 벌). page · loading 은 안쪽만 — 30개 파일에서 `<PageShell …>` 을 걷어 내고
  경로 줄 · 제목은 `ShellBreadcrumb` · `ShellTitle`(1087 · PageShell 과 같은 마크업). 화면 안 이동 때 헤더가 그대로 남고 안쪽만 스켈레톤이 된다.
- 동네 구역은 넓은 벌과 보통 벌이 섞여 있어 레이아웃은 wide 한 벌, 보통 폭 화면 11곳은 `ShellNarrow`(본문 1200px — PageShell 보통 벌의 main 1240px − 패딩 40px 과 모든 창 폭에서 같다).
- 도구 색 화면 4곳(전세가율·갭 · 시세·타이밍 · 면적대별 실거래가 · 시장 온도)은 `<div className="tool-scope" style={…}>` — `.tool-scope` 는 CSS 변수 · 자손 규칙뿐이라 main 에 있던 것과 같다.
- 모임 채팅(`/town/groups/[id]/chat`)은 셸 없는 전용 화면 — 셸 위에 고정 판(`fixed inset-0 z-[60]`)으로 선다(안쪽 마크업 그대로).
- 분석 오류 화면(error.tsx)은 이제 셸 안에 그려지므로 `AreaError inShell`(main 을 겹치지 않는다). 전월세 · 마이 등 다른 구역은 그대로 main.
- 번들 예산: 분석 허브 페이지 몫이 483 → 437KB 로 보인다(셸 청크가 레이아웃 몫으로 — 1087 단지와 같은 계산상 변화). 게이트가 느슨해지지 않게 예산 490 → 450KB.

### 측정(로컬 빌드 · 1088 기준 트리와 같은 데이터 시점이 아니라 본문 숫자는 조금 다를 수 있다)

| 화면 | 전 HTML(헤더 수) | 후 HTML(헤더 수) | RSC 전 → 후 |
|---|---|---|---|
| 뉴스 상세 `/town/news/[id]` | 180,792B (2) | **147,200B (1) · −33.6KB · −19%** | 80,588 → 72,231B |
| 동네 홈 `/town/[region]` | 226,316B (2) | 190,976B (1) · −35.3KB | 103,223 → 93,593B |
| 뉴스룸 `/town/news` | 301,960B (3) | 234,898B (1) · −67.1KB | 110,704 → 92,813B |
| 뉴스 주제 허브 `/town/news/tag/[tag]` | 217,185B (2) | 177,867B (1) · −39.3KB | 105,814 → 93,896B |
| 동네이야기 `/town` | 191,231B (2) | 155,576B (1) · −35.7KB | 82,716 → 72,563B |
| 시장 온도 지역 `/analysis/temperature/[region]` | 165,991B (2) | 132,179B (1) · −33.8KB | 71,339 → 62,833B |
| 분석 허브 `/analysis` | 268,676B (2) | 232,985B (1) · −35.7KB | 142,450 → 132,065B |
| 전세가율·갭 `/analysis/gap` | 138,006B (2) | 104,311B (1) · −33.7KB | 57,140 → 48,673B |

전/후 캡처(1366px · 390px): 전세가율·갭 · 시장 온도 지역은 픽셀 차이 0 · 뉴스 상세 · 동네 홈은 목록 **내용**(유사 기사 · 공개 노트 — 두 서버의 조회 시점 차이)만 다르고 자리 · 폭 · 모양은 같다.

## 효과 추정

- 단지 화면: 1089 의 7일 수명이 이제 실제로 7일을 버틴다(전에는 하루 네 번 전부 비워짐). 하루 재렌더 상한이 "2.4만 × 4 + 크롤 미스"에서 "그 주에 새 실거래가 들어온 지역 · 단지 + 크롤 미스"로 내려간다.
- 동네 · 분석 구역: 렌더마다 HTML 33~67KB + RSC 8~18KB(인라인 + .rsc 두 벌) 덜 저장 · 전송.
- 수치는 배포 뒤 Usage(ISR Writes · Fast Origin Transfer)로 확인한다.

## 소유자 작업(대시보드)

1. **Settings → Billing → Spend Management** 확인 → **nuguzip-homepage → Resume**.
2. 이 zip 적용 · 푸시(main 은 이미 1089 — 그 위에 1090 이 얹히고, 켜져 있으면 1084~1090 이 한 번에 배포된다).
3. 배포 뒤 이틀쯤 Usage 비교 · 배포는 주 1~2회로 묶기(1087~1089 안내 그대로).
