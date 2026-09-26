# 1006 · E — SEO · AI 검색 가시성(GEO) · 전환/리드 갭 분석과 반영

소유자 요청(2026-09-20): "SEO, AI SEO, 웹사이트 최적화, 유료 광고, 리드 생성 전략을 통해 디지털 입지를 개선하고
ChatGPT 및 Google AI 개요와 같은 AI 기반 플랫폼에서 가시성을 높일 수 있도록 … 추가로 도입할 수 있는 부분을 추가".

이 문서는 에이전시 문구의 다섯 항목을 **이 저장소의 실제 상태**와 대조한 결과다. 네 칸의 뜻:
- **이미 있음** — 코드·문서로 확인한 것(파일 경로가 근거). 다시 만들지 않았다.
- **이번에 넣음** — 1006 에서 코드로 반영한 것(전부 실데이터·순수 함수·단위 테스트).
- **소유자가 해야 함** — 외부 계정·키·결정이 필요해 코드로는 못 하는 것.
- **하지 않는 이유** — 요청 문구엔 있지만 일부러 안 한 것과 그 근거.

근거 문서: `docs/nuguzip-seo-geo-50.md`(1차 50) · `docs/nuguzip-seo-geo-next-25.md`(2차 25) · `docs/seo-geo-routines.md`(N19·N24 루틴) ·
`docs/growth-plan-1002.md`(홍보 킷·UTM·소유자 루틴). 이 문서는 그 넷을 대체하지 않고 **그 위에 남은 갭**만 적는다.

---

## 1. SEO (검색엔진 최적화)

| 이미 있음 | 이번에 넣음 | 소유자가 해야 함 | 하지 않는 이유 |
|---|---|---|---|
| 사이트맵 인덱스 + 유형별 자식 13종(`app/sitemap*.xml`), `check:sitemap-index` 양방향 검증 | — | **Bing 웹마스터** 등록(2차 N2, 아직 미등록 — `msvalidate.01` 메타도 `BingSiteAuth.xml` 도 없다). 서치콘솔 "가져오기"로 10분. ChatGPT 웹검색·Copilot 인용 원천이 빙 색인이라 GEO 에 직결 | — |
| IndexNow(`lib/seo/indexnow.ts`, 키 파일 `public/4a720d8a….txt`, 크론 `/api/cron/indexnow-submit`) | — | 네이버 서치어드바이저에서 **사이트맵·RSS 제출 여부 확인**(속성 인증은 됨 — `app/layout.tsx` 네이버 토큰 2개, `public/naver53e….html`) | — |
| GSC 소유 확인(메타 + `public/google*.html` 2개), `lib/seo/gsc-index.ts` 색인률 표본(키 필요) | — | `GSC_SERVICE_ACCOUNT_*` 3개 env + 서치콘솔에 서비스 계정 사용자 추가(2차 N25) — 넣어야 `/admin/seo` 색인률이 채워진다 | — |
| JSON-LD 12종 + 빌드 게이트 `scripts/check-jsonld.mjs`(KNOWN_TYPES 에 WebPage·Dataset·DataCatalog 이미 등록) | `WebPage`·`Dataset`·`DataCatalog` **빌더**(`lib/seo/jsonld.ts` — `webPageJsonLd`·`datasetJsonLd`·`dataCatalogJsonLd`·`publisherRef`·`regionEntityId`·`complexEntityId`). 게이트 스크립트는 새 타입이 필요 없어 **수정하지 않았다** | — | 게이트는 빌드 산출물(정적 페이지)만 본다 — 지역·단지 허브는 ISR 이라 사각지대(스크립트 상단 주석). 그래서 빌더 단위 테스트(`tests/unit/seo-1006.test.ts`)로 모양을 잠갔다 |
| title CTR A/B(`lib/seo/title-experiment.ts`), canonical 게이트 `check:param-canonical`, 리다이렉트 맵 99규칙, 소프트 404 정책 | — | GSC 쿼리 갭 루틴(N24) 첫 회차 — 데이터 4주 축적 후 | — |
| `Article` author/publisher: `/reports/[ym]`·`/reports/season`·`/digest/[week]`·`/notes/best` 전부 `publisher: {@id …/#organization}` 로 일관 | `publisherRef()` 헬퍼 추가(위) | — | `/notes/[id]`(D 소유)의 `articleJsonLd` 는 publisher 를 인라인 Organization(@id 없음)으로 낸다 → **D 또는 통합자**: `publisher: publisherRef()` 로 교체(1줄). `/developers` WebAPI.provider 도 같은 교체 권장 |

## 2. AI SEO (GEO — ChatGPT · Google AI 개요 · Perplexity 인용)

| 이미 있음 | 이번에 넣음 | 소유자가 해야 함 | 하지 않는 이유 |
|---|---|---|---|
| `robots.ts` AI 크롤러 6종 허용(GPTBot·OAI-SearchBot·ClaudeBot·CCBot·PerplexityBot·Google-Extended), meta-externalagent 차단, 스크레이퍼 12종 차단(미들웨어 403 동일 표) | **검색·사용자 대리 봇 5종 추가** — `ChatGPT-User`·`Claude-SearchBot`·`Claude-User`·`Perplexity-User`·`Amazonbot` 를 같은 규칙(개인 영역만 차단)으로. 표는 `lib/seo/ai-crawlers.ts` 한 곳, `next.config.ts htmlLimitedBots` 와 이름 일치를 테스트가 대조 | — | `Applebot-Extended` 는 열지 않았다 — Applebot 이 긁은 것을 **학습에** 쓸지 정하는 토큰이다(검색 봇 Applebot 은 `*` 로 이미 열려 있다). 학습 전용은 열지 않는다는 기존 판단 유지 |
| `llms.txt` 라우트(실데이터 커버리지, 1h ISR, 인용 규칙) | **`/llms-full.txt` 를 정적 파일 → 라우트로**(`app/llms-full.txt/route.ts` + 순수 조립기 `lib/seo/llms-full.ts`). 커버리지·월간 리포트 월 목록(실제 존재 월·지역 수·건수·갱신일)·지역 허브 전체 목록·용어사전 전체·시장 온도 지역 수를 요청 시점 실데이터로. 못 읽은 숫자는 문장째 생략, 월 목록 실패는 "읽지 못했다"고 적는다. `public/llms-full.txt` **삭제**(라우트 shadowing 방지) | — | 옛 정적 파일의 인용 예문 "집계 지역 61곳 … 12,345건"은 손으로 적은 예시 숫자였다 — 라우트는 최신 달 **실제 값**으로 예문을 만든다 |
| 지역 허브 G12 첫 문단(떼어 인용 가능), Q&A 블록(FAQPage), 월간 리포트 G8 인용 블록·N18 언론 인용 요약 | **지역 허브**: 기존 첫 문단을 `<section data-ai-summary id="ai-summary">` 로 감싸고(문단 중복 없음) `WebPage`(speakable → 그 셀렉터, `dateModified` = 실거래 마지막 적재 성공일) + `Dataset`(월별 거래량·평균가 시계열, temporalCoverage·공개 API distribution) JSON-LD 추가 | — | `dateModified` 에 렌더 시각을 넣지 않았다. 지역 스냅샷(REB)엔 갱신 시각 컬럼이 없어 `market_ingest_log` 마지막 성공 적재일(`getMarketFreshnessDateLabel`, 1h 캐시)을 쓴다 — 캡션이 없으면 날짜도 없다 |
| 단지 허브: KPI 6칸·AI 요약 탭(클라이언트) — 서버 HTML 에 완결 문장 없음 | **단지 허브 인용 요약 블록**(히어로 바로 아래, `<section data-ai-summary>`): "서울 송파구 잠실동 잠실엘스의 2026년 8월 아파트 매매 실거래 평균은 24.5억입니다(해당 월 신고 12건, 국토교통부 …)" + 12개월 건수 + 세대·준공. 순수 함수 `lib/seo/citable-summary.ts buildComplexCitableSummary`(실거래 없음·조회 실패면 null → 섹션 없음). `WebPage` speakable + `dateModified` 추가 | — | **B 모듈과 통합 필요**: B 가 만드는 `lib/complex/complex-facts.ts`(GET /api/complex/[id]/detail 의 `summaryLine`)가 아직 없어 자체 순수 모듈로 만들었다. 완성되면 문장 규칙을 한 곳으로 합칠 것(둘 다 "지역 + 단지명 + 기준월 + 평균 + 건수 + 출처" 규칙) |
| `Dataset` on `/tx/[region]`·`/analysis/temperature/[region]`, `WebAPI` on `/developers` | `datasetJsonLd`·`dataCatalogJsonLd` 빌더 | — | `/reports/[ym]`(Dataset)·`/developers`(DataCatalog) 배선은 **내 소유 파일이 아니라** 하지 않았다. 통합자용 스니펫: §6 |
| N19 AI 인용 모니터링 루틴(격주 이슈 자동 개설, 관측은 사람) | — | **첫 회차 관측**을 채울 것(기록표가 아직 비어 있다). 1002 실측으로 ChatGPT 인용이 이미 단지 페이지에 생겼으니(5~6명) Q1·Q2·Q8 부터 | 자동 관측기는 만들지 않는다 — 각 AI 서비스 약관·비용, 그리고 "자동으로 채워진 척하는 기록" 금지 원칙(`seo-geo-routines.md`) |
| G24 AI 유입 분리: `/admin/promo` 가 리퍼러를 검색·AI·소셜·커뮤니티·직접으로 접는다(`lib/content/promo-kit.ts classifyReferrer`) | — | GA4 에서도 같은 세그먼트(리퍼러 chatgpt.com·perplexity.ai·copilot) 저장 — 콘솔 설정 | — |

## 3. 웹사이트 최적화 (Core Web Vitals · 캐시 · 번들)

| 이미 있음 | 이번에 넣음 | 소유자가 해야 함 | 하지 않는 이유 |
|---|---|---|---|
| 실사용자 `web_vitals` 수집(`app/components/WebVitalsReporter.tsx` → `/api/metrics/web-vitals`), **관리자 화면 2곳**: `/admin/perf`(최근 7일 경로×지표 p75 + LCP 범인 요소, 2026-09-09 이전 옛 표본 제외) · `/admin/traffic`(주간 p75, `web_vitals_weekly` 뷰) | — | **현재 p75 읽는 법**: 관리자 로그인 → `/admin/perf` 상단 표(경로별 LCP·FCP·INP·CLS·TTFB p75, 기준 초과 셀 강조) — 운영 DB 를 직접 조회하지 않는다. CrUX(구글 필드 데이터)는 `CRUX_API_KEY` 를 넣어야 `/admin/seo` 에 쌓인다 | 새 게이트는 만들지 않았다 — `check:perf-budget`·`check:bundle-budget`(라우트별 raw KB 예산)·`check:cache-policy`(ISR 분류·개인화 표식 검사)가 이미 있다 |
| 캐시: 지역·단지 허브 ISR 6h + CDN 규칙(`lib/http/cache-policy.ts`), 미들웨어 Set-Cookie 시 no-store | 이번 변경은 서버 HTML 만 늘린다(단지 허브 요약 ≤3문장·JSON-LD 노드 1~2개). 클라이언트 번들 증가 0 — `/complex/[id]` 480KB 예산 영향 없음 | — | `/lp/imjang` 은 `PUBLIC_CACHE_RULES` 에 넣지 않았다(그 파일은 내 소유가 아니고, 광고 트래픽 규모에서 오리진 렌더 비용이 문제 되지 않는다). 필요하면 통합자가 `{ path: "/lp/imjang", ...STATIC_DOC }` 한 줄 |

## 4. 유료 광고 (Google Ads · 소셜)

| 이미 있음 | 이번에 넣음 | 소유자가 해야 함 | 하지 않는 이유 |
|---|---|---|---|
| GA4(동의 게이트 뒤 로드, `components/ga4-gtag-loader.tsx`) + 구글 광고 태그 config(`NEXT_PUBLIC_GOOGLE_ADS_ID`), 전환 2종 URL 판정: `purchase`(`/payment/success`), `sign_up`(`/welcome`), AW 직접 전환 라벨 env 2개 | **광고 랜딩 `/lp/imjang`**(noindex, follow) — 단일 CTA "임장노트 무료로 시작" → `/notes/new`(utm_* 보존, `lib/analytics/utm.ts`), 클릭 시 GA4 `generate_lead`(lead_source=lp_imjang) + AW 라벨(`NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL`, 선택 — `lib/analytics/google-ads.ts leadConversionLabel`). 화면 숫자는 `lib/stats/coverage` 실측(못 읽으면 문장 생략)·체크리스트 개수(`lib/inspection/checklist`)·임장 체크포인트 개수뿐 | ① Google Ads 계정 → `NEXT_PUBLIC_GOOGLE_ADS_ID`(AW-…) Vercel env ② GA4 → Ads 연결 후 **전환 가져오기**: `sign_up`·`purchase`·`generate_lead` ③ 광고 최종 URL: `https://naezipnow.com/lp/imjang?utm_source=google&utm_medium=cpc&utm_campaign=imjang-2026w39` (UTM 은 `/admin/promo`·`/admin/traffic` UTM 표에서 성과가 보인다) | 지어낸 후기·수치·"N명이 선택" 문구 없음(테스트가 화면 문구에서 금지). CTA 를 `/signup` 이 아니라 `/notes/new` 로 보낸 이유: 노트는 비회원도 쓰기 시작할 수 있고(`NoteForm` "로그인 없이 써도 돼요"), 저장 때 로그인 → `/welcome` 에서 `sign_up` 이 잡힌다. 사이트 원칙("로그인 없이 시작하세요")과 같은 동선 |
| — | — | **CAC 판단**: `growth-plan-1002.md §6` 은 결제 0건 상태에서 유료 광고를 보류했다. 랜딩·전환 배선은 준비됐으니, 켤지는 소유자 결정(최소 4주 `generate_lead → sign_up → 첫 노트` 퍼널을 `/admin/traffic` 에서 본 뒤) | — |

## 5. 리드 생성 (이메일 캡처 · 전환 이벤트)

| 이미 있음 | 이번에 넣음 | 소유자가 해야 함 | 하지 않는 이유 |
|---|---|---|---|
| **이메일 리드 = 회원가입.** `app_users`(가입) + `notification_preferences.email_marketing`(명시 옵트인, `/my/settings` 알림 탭, 동의 기록 `consents.marketing`) → 주간 다이제스트 메일(`/api/cron/weekly-digest`, RESEND 필요). 수신거부 링크는 모든 메일 푸터(`lib/email/templates.ts` → `/my/settings`) | — | `RESEND_API_KEY`(1002 §4 1번 — 30일째 발송 0건). 이것이 없으면 다이제스트·영수증·비밀번호 재설정 전부 안 나간다 | **비회원 이메일 수집 폼은 만들지 않았다.** 근거 두 가지: ① 저장소에 그런 공용 컴포넌트가 없다(`app/town/news/NewsAlertSubscribe.tsx` 는 로그인 사용자의 키워드 알림 저장 검색이지 이메일 캡처가 아니다) ② `growth-plan-1002.md §6` "수집만 하고 못 보내는 폼은 만들지 않는다"(RESEND 미설정). 홈(`app/page.tsx`)은 그래서 손대지 않았다 |
| 서버 확정 퍼널 이벤트(`lib/platform-funnel-events.ts`: signup_complete·inspection_note_create·report_purchase 등, 광고차단 무관) | — | — | GA4 쪽 누락(아래 §7)은 다른 에이전트 파일이라 문서로만 |

---

## 6. 통합자용 스니펫 (내 소유가 아닌 파일 — 그대로 붙이면 된다)

**`app/reports/[ym]/page.tsx` — 월간 리포트 Dataset**(Article 옆에 한 노드 추가):
```ts
import { datasetJsonLd } from "@/lib/seo/jsonld";
import { ymRangeToTemporalCoverage } from "@/lib/seo/citable-summary";
// jsonLdScript([articleJsonLd, crumbs, …]) 배열에:
datasetJsonLd({
  path: `/reports/${report.ym}`,
  name: `${label} 아파트 매매 실거래 지역별 집계`,
  description: `${label} 집계 지역 ${report.regionCount}곳의 아파트 매매 신고 ${report.txCount.toLocaleString("ko-KR")}건 — 지역별 거래량·평균가·평당가·전월비. 국토교통부 신고분, 해제 제외${report.isProvisional ? ", 잠정치" : ""}.`,
  keywords: [label, "아파트", "실거래", "월간 리포트"],
  temporalCoverage: ymRangeToTemporalCoverage(report.ym, report.ym),
  dateModified: report.updatedAt ? report.updatedAt.slice(0, 10) : null,
  distributionUrl: `https://naezipnow.com/api/public/v1/regions/monthly?month=${report.ym}`,
}),
```

**`app/developers/page.tsx` — DataCatalog**(`@graph` 에 추가, provider 를 `publisherRef()` 로):
```ts
import { dataCatalogJsonLd, publisherRef } from "@/lib/seo/jsonld";
dataCatalogJsonLd({
  path: "/developers",
  name: "내집나우 공개 집계 데이터 카탈로그",
  description: "국토교통부 실거래 신고 자료로 만든 아파트 매매 시군구×월 집계(인증 불필요 JSON).",
  datasets: [
    { path: "/api/public/v1/regions/monthly", name: "지역×월 아파트 매매 집계", description: "시군구·월별 거래량·평균가·평당가·전월비(provisional 플래그 포함)" },
    { path: "/api/public/v1/months", name: "집계 존재 월 목록", description: "집계가 있는 yyyymm 과 지역 수" },
  ],
}),
// WebAPI.provider: { "@type":"Organization", name, url } → publisherRef()
```

**`app/notes/[id]/page.tsx`(D) — Article publisher 일관성**: `publisher: { "@type": "Organization", name: "내집나우", url: BASE_URL }` → `publisher: publisherRef()`.

## 7. GA4 전환 이벤트 누락 점검 — 어디에 무엇을 넣어야 하는가

| 전환 | 지금 | 넣을 곳(다른 에이전트/공용 파일 — 여기서 고치지 않음) |
|---|---|---|
| 가입 완료 `sign_up` | 있음 — `/welcome` URL 판정(`components/ga4-gtag-loader.tsx`) | — |
| 유료 결제 `purchase` | 있음 — `/payment/success?orderId&amount`. **구독(빌링) 첫 결제**는 `app/api/payments/toss/billing/register/route.ts` 끝(≈L296)이 `amount` 없이 리다이렉트해 `purchase.value` 가 빈다 | 그 리다이렉트에 `u.searchParams.set("amount", String(sub.amount))` 1줄 |
| 리드 `generate_lead` | **이번에 넣음** — `/lp/imjang` CTA | — |
| 첫 노트 저장 | 없음(서버 퍼널 `inspection_note_create` 만) | `app/notes/new/NoteForm.tsx` 저장 성공 분기(`router.push(afterSaveHref(noteId))` 직전, ≈L2072): `window.gtag?.("event", "note_saved", { note_id: noteId, edit: isEdit })`. "첫" 여부는 서버 응답에 없으므로 GA4 에서 사용자당 첫 발생으로 본다(또는 `/api/inspection/notes` 201 응답에 `isFirst` 를 실어 `first: true` 파라미터로) |
| 다이제스트(마케팅 메일) 옵트인 | 없음 | `app/my/settings/SettingsClient.tsx` `setPref("emailMarketing", next)` 호출부(≈L520)에서 `next === true` 일 때 `window.gtag?.("event", "newsletter_opt_in")` |

규칙은 전부 같다: `window.gtag` 가 있을 때만(쿠키 동의 뒤), 실패는 삼키고 화면 흐름에 영향 없음, 이벤트명은 GA4 표준(`sign_up`·`purchase`·`generate_lead`) 우선.

## 8. 소유자가 외부 계정에서 직접 해야 하는 일 (한 번씩)

1. **Bing 웹마스터** 등록 — bing.com/webmasters → "Google Search Console 에서 가져오기". IndexNow 키는 이미 있어 등록 즉시 제출이 잡힌다.
2. **Google Ads** — 계정 생성 → 태그 ID(AW-…)를 `NEXT_PUBLIC_GOOGLE_ADS_ID` 로 Vercel 에. GA4 연결 후 전환 가져오기(`sign_up`·`purchase`·`generate_lead`). 직접 전환 라벨을 쓰려면 `NEXT_PUBLIC_GOOGLE_ADS_{SIGNUP,PURCHASE,LEAD}_LABEL`.
3. **RESEND_API_KEY** — 리드가 회원가입인데 메일이 0건이면 리드가 식는다(1002 §4 1번과 같은 항목).
4. `CRUX_API_KEY` · `GSC_SERVICE_ACCOUNT_*` — 실사용자 성능·색인률이 `/admin/seo` 에 쌓인다(2차 N5·N25).
5. 네이버 서치어드바이저 — 사이트맵 `https://naezipnow.com/sitemap.xml` · RSS `https://naezipnow.com/feed.xml` 제출 상태 확인.
6. `docs/seo-geo-routines.md` N19 첫 회차 관측 기록(15~20분).

## 9. 검증 기록 (2026-09-20)

- `npx tsc --noEmit` — 내 파일 0 오류(오류 4건은 `app/notes/new/*` D 작업 중 파일).
- `npm run test:unit` — 813/813 통과(신규 `tests/unit/seo-1006.test.ts` 15건 포함).
- 빠른 게이트 전부 OK: type-ramp · plan-labels · route-links · icon-names · contrast-tokens · dead-controls · import-hygiene · ai-compliance · moderation-filter · review-freeze.
- `check:jsonld` 는 빌드 산출물이 필요해 돌리지 못함 → 빌더 단위 테스트 + `node -e` 로 WebPage/Dataset/요약 JSON 모양을 출력해 확인(보고서에 첨부).
- 화면 확인: 검증 시점에 개발 서버(3101)가 내려가 있었고(3100 은 1005 빌드라 `/lp/imjang` 없음), 공통 규칙상 서버를 직접 띄우지 않아 **스크린샷을 찍지 못했다** — 통합자가 3101 에서 `/lp/imjang`(1280·390) 과 `/complex/{id}`(요약 블록) 을 확인해야 한다. `/region/gangnam`·`/complex/{id}` 는 로컬 DB 가 없어 원래 코드 리뷰만.
