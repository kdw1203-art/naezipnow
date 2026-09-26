# 1007 — 추가 개선 20 + Vercel 사용량 절감 20

소유자 지시(2026-09-20): "1005, 1006을 포함하여 추가로 개선할 수 있는 부분에 대해 20가지를 찾아서 개선해주고, vercel의 사용량을
줄일 수 있는 방법도 20가지 찾아서 개선해줘". 이 판은 1005(ca6c7d7c)·1006(93b9cdfd) 위에 얹힌다 — zip 은 origin/main(b2f02fce) 기준이라 셋을 포함한다.

## 0. 실측 — 무엇이 비용을 만드는가

Vercel 청구(FOCUS 일별, Pro 좌석 제외, 2026-09-17~19): **ISR Writes $0.63~0.92 · Observability Events $0.51~0.95 · Fast Origin Transfer
$0.48~0.69 · Fluid Active CPU $0.19~0.36 · Build CPU $0.14~0.31(빌드 날) · Web Analytics $0.02~0.11 · Function Invocations $0.03~0.07**
= 하루 $2.5~3.5(월 $75~105). 사람 페이지뷰는 7일간 ~120건(대부분 소유자)인데 서버리스 함수 호출은 **하루 33,600회** — 99% 이상이
크롤러·봇이고, JS 를 실행하는 봇이 비콘·세션 조회·AI 컨텍스트 조회까지 일으킨다. 24h 상위: /complex/[id] 8,907 · web-vitals 4,350 ·
/analysis 1,828 · /notes/new 1,790 · /embed 1,723 · /api/auth/session 1,299 · /api/ai/context 1,215 · /api/og/complex 1,008 ·
/town/news/[id] 985 · unread-count 982 · push/subscribe 943 · /map 911 · /login 796. 로그 이벤트/일 ≈ 117k(미들웨어 48.9k · 함수 33.6k ·
캐시 25.7k). 반복 오류: `/analysis` 티저가 요청마다 throw("스냅샷 없음" — 서울 25개 구 REB 행이 빈 채 매일 덮어씀), `[last-good] expires_at
NOT NULL` 저장 실패, 공개 노트 조회 타임아웃. pg_stat: 단지별 실거래 122ms×152k, board_posts 댓글 count 중첩 229ms×21k(댓글 0행).

## 1. Vercel 사용량 절감 20 (전부 코드로 반영 · "추정"은 24h 실측에서 유도)

| # | 무엇 | 왜(실측) | 어떻게 | 절감(추정, /일) |
|---|---|---|---|---|
| V1 | `/notes/new` 정적화 | 1,790 함수 호출 — `safeAuth`+`searchParams` 때문에 force-dynamic | `NoteNewEntry`(클라이언트)가 URL·세션을 판정, 템플릿은 `/api/note-templates/[id]`, 재방문은 소유자 응답으로 | −1,790 호출 |
| V2 | `/analysis` ISR 3600 | 1,828 호출 | 게스트 HTML 고정 + 로그인 카드·`?noteId` 분석은 세션 뒤 `next/dynamic`(첫 로드 번들도 감소) | −1,800 호출 |
| V3 | `/login` 정적화 | 796 호출, 동적일 이유 없음(소셜 env 는 배포 시 고정) | force-static, `?error`·`callbackUrl` 은 원래 클라이언트 | −796 호출 |
| V4 | `/map` ISR 600 | 911 호출 | 공유 데이터만 서버, 12종 파라미터·세션은 `lib/map/entry-params.ts` 로 클라이언트 해석 | −770 호출 |
| V5 | `/notes` ISR 300 + `/api/inspection/notes/mine` | 398 호출 | 공개 첫 장 ISR, 내 노트 탭은 API | −150~300 호출 |
| V6 | `/subscription` ISR 3600 | 200 호출 | 비회원 화면(토스 심사 화면) 고정, 플랜 배지·사용량·결제 내역은 `/api/subscriptions/summary` | −176 호출 |
| V7 | 로그인 힌트 쿠키 `nz_authed` | 비회원·봇에게도 `/api/auth/session` 1,299 · unread-count 982 · recent-complexes 203 | 힌트 없으면 요청 없이 비회원(`getSessionLite` 단일 관문), 힌트는 Auth.js 응답·미들웨어 전이에서만 Set-Cookie | −2,450 호출 |
| V8 | 푸시 공개키 마운트 GET 제거 | `/api/push/subscribe` 943 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 빌드 인라인, 메뉴는 처음 열릴 때만 마운트 | −943 호출 |
| V9 | `/api/ai/context` 사람·가시 영역에서만 | 1,215 — 봇이 AI 보드 링크를 따라다니며 단지마다 4회 | `lib/client/is-bot-ua.ts` + `useHumanGate`(뷰포트/상호작용) | −1,150 호출 |
| V10 | 웹바이탈 비콘 배치 + 봇 제외 | 4,350 — 지표마다 POST, 봇도 전송 | 문서당 pagehide 에 1회 sendBeacon(배열 본문), 서버는 봇 UA 204 | −4,330 호출 |
| V11 | `/embed` 봇 차단 | 1,723 — 위젯 페이지를 크롤러가 | robots disallow + 엣지 403(알려진 크롤러 UA) + noindex 유지 | −1,500 호출 |
| V12 | `/my/*`·`/admin` 엣지 302 | 비로그인 봇의 `/my/analyses` 367 등이 함수까지 | 서버가 redirect 하던 6경로만 미들웨어에서 `callbackUrl` 로 302(GuestGate 화면은 그대로) | −370 호출 |
| V13 | 미들웨어 matcher 에서 `/api` 제외 | 미들웨어 48,920/일 | `/api/admin`·Origin 헤더 있는 요청·차단 UA 12종만 매칭, 보안 헤더는 `next.config headers()`(CSP 제외, API 응답마다 실리던 2.5KB 제거) | −10,000 미들웨어 · −32MB 헤더 |
| V14 | ISR TTL 확대 + 즉시 무효화 | /town 120s·뉴스/이야기/동네 홈 600s 로 하루 최대 720~1,000회 재생성(HTML 300KB) | /town 600, 뉴스룸·상세·이야기·동네 홈 21,600 + 글/댓글/공감/노트 저장·수정·삭제·숨김·뉴스 적재(크론 `/api/cron/news-revalidate` 3회/일)에서 `revalidatePath` | −800 ISR 쓰기 |
| V15 | 엔티티별 데이터 캐시 → 요청 캐시 | 노트 id 별·단지 축 캐시가 "쓰기만 하고 안 읽힘"(단지 축 8,907 쓰기/일) | `note-cache.ts` React cache, `live-context.ts complexDurable=false`(허브), `home-data` 90→600s + 태그 무효화 | −9,500 ISR 쓰기 |
| V16 | OG 이미지 CDN 캐시 | `/api/og/complex` 1,008 — Cache-Control 없음 | `s-maxage=86400, swr=604800`(og 6종) | −300~500 호출·이미지 전송 |
| V17 | 사이트맵 6h CDN 캐시 | 단지 사이트맵 7.66MB·29,353 URL·생성 4.3s 가 1h 마다 | `SITEMAP_SECTION_CACHE_CONTROL` 21,600 | 최대 −153MB/일 오리진 전송 |
| V18 | 로그 소음 | error 1,338·warn 1,517/일 중 반복 문장 | `logger.errorSampled/warnSampled`(60초 창, 첫 건은 항상), 티저 null 캐시(P1), last-good 저장 복구, 미들웨어 표본 로그 20%→0/5%→1% | −2,500 로그 이벤트 |
| V19 | 단지 렌더 질의 3→1 + 인덱스 | 단지 페이지 렌더당 ~20 질의, 매매 행을 3번 읽음; 122ms×152k | `loadTradeRowsShared`(React cache), `mt_trade_complex_cov2_idx`(property_type INCLUDE → Index Only Scan, Heap Fetches 0), 공개 노트 부분 인덱스 | −17,800 DB 질의 · 함수 시간↓ |
| V20 | 빌드·크론 | dependabot 미리보기 빌드가 매번 ERROR 로 Build CPU 소모, alert-email 매시 RPC(메일 키 없음), site-probe 6h | `scripts/vercel-ignore.mjs`(dependabot·문서만 커밋 생략, **main 은 절대 생략 안 함**), alert-email 은 메일 채널 없으면 즉시 반환, site-probe 12h | Build CPU −$0.1~0.3/빌드 날 · −28 호출 |

소유자 결정 항목(코드로 안 함): Vercel **Web Analytics 끄기**($0.02~0.11/일 — GA4 + 자체 page_view_events 가 같은 것을 센다), Observability Plus 요금제
여부(로그 이벤트 단가), Speed Insights(꺼져 있음 — 그대로).

## 2. 추가 개선 20 (제품)

| # | 무엇 | 근거 | 어떻게 |
|---|---|---|---|
| P1 | 서울 25개 구 지역 시세 스냅샷 복구 | REB 행이 period='' · 가격 null 로 매일 덮어써져 지역 허브·/analysis 티저가 비었다 | R-ONE 분류 4단(`서울>강남지역>동남권>강남구`)의 "…지역" 세그먼트를 매핑에서 걷어내고(`region-code.ts`), 빈 행은 저장하지 않으며(`reb/price-rows.ts`), 값 있는 행을 우선 선택(`region-snapshot-pick.ts`) |
| P2 | `/analysis` 가격 티저 | 요청마다 throw·에러 로그 | 없음도 1h 캐시 + `market_region_monthly` 실거래 평균 폴백("시세"는 REB 일 때만) |
| P3 | 공개 노트 조회 타임아웃 완화 | 34행인데 TimeoutError — 무거운 `ai_analysis` 를 목록마다 실어 풀을 오래 붙듦 | 공개 목록 select 에서 제외(허브 미리보기만 `withAi`), 부분 인덱스, last-good 정상본 저장 복구 |
| P4 | 뉴스 관련글 229ms 질의 제거 | board_comments 0행인데 중첩 count | 댓글 수는 이웃 글에만 별도 경량 질의, 관련글 캐시 15분 |
| P5 | last-good 폴백 복구 | `expires_at` NOT NULL 로 저장이 매번 실패 → 콜드 인스턴스 폴백 항상 없음 | 48h 상한 TTL |
| P6 | 단지 비교(pair) 페이지 5개 지역 | `seo.region_coverage` 경보(화성 동탄·병점·효행·만세구, 세종시 — 실거래 9,557건) | `complex_pair_mv` 무중단 재생성(847 → 911 조합, ACL 동일) + 세종을 pair 지역 목록에 |
| P7 | 홈 동네이야기·뉴스룸 블록 | 1006 재질 분리가 홈에는 없었다 | `HomeTownBlock`(이야기 카드 / 뉴스 스트립, JS 0) |
| P8 | 이웃 글 링크 통일 | 검색·다이제스트·알림·관리자·공지가 `/town/news/{id}` 로 사람 글을 열었다 | `lib/town/post-href.ts postHref()` 한 곳 |
| P9 | 통합 검색 이야기/뉴스 구분 | 뉴스 그룹이 board_posts 전체를 뉴스로 그림 | `stories`·`news` 분리, 결과 필터 칩, 재질별 카드 |
| P10 | 검색 결과 글 링크 404 수정 | `/community/{id}` 가 피드로 튕겨 글이 안 열렸다 | `postHref` |
| P11 | "실거래 마지막 반영 YYYY-MM-DD" 한 줄 | JSON-LD 에만 있고 화면엔 없었다 | 지역·단지 허브 `MarketFreshnessLine` |
| P12 | 단지 허브 전세가율·자료 완성도 | 지도 패널(1006)에만 있었다 | `ComplexFactsCard`(같은 규칙 `buildComplexFacts`), 요약 문장 조각을 허브·패널·인용 요약이 공유 |
| P13 | 노트·API JSON-LD publisher 통일 | 인라인 Organization | `publisherRef()` |
| P14 | GA4 `note_saved`·`newsletter_opt_in` | 전환 퍼널 공백 | `lib/analytics/events.ts`(저장 순간 동적 로드) |
| P15 | 404 페이지 | 검색·복귀 경로 없음, "시세" 라벨 | 검색 폼 + 인기 경로 5 + 홈/지도, 정적 |
| P16 | 뉴스룸 라벨 통일 | "뉴스"·"전체 뉴스" 혼재 | GNB·카테고리·정비사업·다이제스트 "뉴스룸" |
| P17 | 공지 "전체 ›" 목적지 | 공지(비자동)가 뉴스룸에 없다 | `/town` |
| P18 | 웹바이탈 정확도 | 봇 표본이 p75 를 흐림 | 봇 제외·배치 — `/admin/perf` 가 사람 기준(2026-09-20 이전과 비교 금지 주석) |
| P19 | 로그인 뒤 헤더 즉시 반영 | 소프트 내비게이션에선 미들웨어가 힌트를 못 심음 | Auth.js 응답에 힌트 Set-Cookie, `HeaderAuth` 경로 변경 시 재판정 |
| P20 | 사용자 템플릿 노출 | uuid 만 알면 비공개 템플릿 본문 | 공식·공개만 200(없음/비공개 구분 없이 404) · 검색어 80자 상한 |

## 검증
아래 "빌드 결과" 참조. 엄격 리뷰 HIGH 1(`/analysis` 미리보기의 aiAnalysis 소비처 누락 → `withAi`)·MED 4(main 빌드 보호, 글 수정·삭제·숨김 무효화,
번들 완화(events 동적 로드), 매매 표본 중복 질의는 다음 판)·LOW 반영.

## 소유자가 할 것 / 남긴 것
- Vercel 대시보드: Web Analytics 끄기 여부 결정, `ignoreCommand` 가 대시보드 "Ignored Build Step" 을 덮으므로 거기 값이 있었다면 확인.
- 뉴스 적재 워크플로(다른 저장소) 끝에 `curl -H "Authorization: Bearer $CRON_SECRET" https://naezipnow.com/api/cron/news-revalidate` 한 줄을 넣으면
  적재 즉시 뉴스룸이 갱신된다(없어도 08:40·10:40·14:40 KST 크론이 비운다).
- 다음 판: 단지 허브 매매 원표본 질의를 공용 행으로(M4), `/complex/[id]` HTML 296KB 다이어트(ISR 쓰기·오리진 전송의 최대 단일 항목), 미들웨어 UA 매처 대소문자.

## 빌드 결과(로컬 운영 빌드, 2026-09-20)
- 전 게이트 + 단위 **933/933**(1006 863 → +70) + 번들: `/` 462 · `/map` 353 · **`/analysis` 488 → 474**(로그인 카드 동적 분리) · `/analysis/ai/[tool]` 472 ·
  `/notes/new` 465/470 · `/complex/[id]` 479/480 · jsonld(303 페이지·893 블록) · cache-policy(정확일치 50 · 동적 25, 개인화 표식 0) 통과.
- 라우트 표: `/notes/new`·`/login`·`/_not-found` 정적(○), `/analysis` 1h · `/map` 10m · `/notes` 5m · `/subscription` 1h · `/town` 10m · `/town/[region]` 6h ISR.
- 운영 빌드 서버 실측: 비로그인 브라우징(/ → /analysis → /notes/new → /town)에서 API 호출은 **웹바이탈 비콘뿐**(세션·벨·푸시·AI 컨텍스트 0건),
  로그인 시 세션·벨·최근 단지·설정 조회 정상. `/my/analyses` 비로그인 → 302 `/login?callbackUrl=`, `/embed` Googlebot 403 · 크롬 200, 웹바이탈 봇 POST 204,
  OG `s-maxage=86400`, 사이트맵 `s-maxage=21600`, `/api/cron/news-revalidate` 200.
- `check:mobile` 기본 8 + 7경로(검색·404·로그인·랜딩·뉴스룸·단지 비교·정비사업), `check:void`·`check:void:mobile`·`check:narrow-text`, `check:final-release` PASS 40 · WARN 1 · FAIL 0.
- DB(적용 완료): `inspection_notes_public_created_idx`, `mt_trade_complex_cov2_idx`(EXPLAIN Index Only Scan · Heap Fetches 0, 옛 인덱스 삭제), `complex_pair_mv` 재생성 847 → 911 조합.
