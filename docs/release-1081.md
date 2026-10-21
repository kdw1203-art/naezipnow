# 1081 — 검색 유입·사이트 최적화(30가지 중 코드로 끝나는 것 전부)

소유자 2026-10-20: "검색을 통한 유입을 늘릴 수 있는 방법과 홈페이지 최적화 방안 30가지" → "제안한 것을 토대로 전부 다 개선 작업".
코드로 끝나는 항목은 여기, 콘솔(서치콘솔·네이버 서치어드바이저·카카오 개발자)·판단이 필요한 것은 docs/owner-todo-1081.md.
DB 변경 없음 · 가격·심사 문구 변경 없음 · 번들 예산 그대로 · 보관된 경로 되살리지 않음.

근거(운영 실측 2026-10-20): 사이트맵 29,300 URL(단지 23,809 · 지역 872 · 실거래 구간 1,927 …) · 단지 사이트맵이 한 파일(23,809 URL ·
콘솔에 따로 제출된 주소) · 뉴스 기사 hreflang 0 · 지역 상세 본문이 숨은 스트리밍 청크(`<div hidden>`) · 용어 설명문 29자 · 계산기 본문
114단어 · 가이드 나가는 링크 2개 · 지역 제목에 기준 월 없음 · 임장노트 제목 "○○ 임장 기록" · 카카오 키 이름 불일치(운영 `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` ·
코드 `NEXT_PUBLIC_KAKAO_JS_KEY`) · CWV 는 좋음(LCP p75 1.7초 · CLS 0 · INP 64ms) — 속도는 손대지 않았다.

## 1. 색인·사이트맵

| 자리 | 전 | 후 |
|---|---|---|
| lib/seo/sitemap-slugs · sitemap-sections · build-sitemap · app/sitemap-complexes-{1..6}.xml(새) | 단지 사이트맵 한 파일 23,809 URL(인덱스에도 통짜) | 거래 많은 순 5,000개씩 **6조각** — 인덱스에는 조각만(`indexed:false`), 앞 조각 priority 0.9/0.8/0.7. 통짜 주소는 살아 있다(콘솔 직접 제출분) |
| lib/seo/build-sitemap | 월간 리포트 lastmod = 생성 시각(바뀌지 않는 표가 매번 새것처럼) · 가이드 lastmod 없음 | 리포트는 **표가 확정되는 시점**(두 달 뒤 1일 UTC · `reportClosedAt`) · 가이드는 catalog `updatedAt` 이 있을 때만 |
| app/town/news/[id] | 기사만 hreflang 없음 | 다른 화면과 같은 `seoAlternates`(ko-KR · x-default) |
| app/region/[id]/loading.tsx 삭제 · scripts/check-final-release | ISR 7일 첫 렌더가 스트리밍 → 본문이 숨은 청크, 없는 지역도 200 껍데기 | 완전한 HTML 한 번에 · 없는 지역은 진짜 404. 단지 상세 loading 은 그대로(게이트·UX) |
| /api/cron/indexnow-submit (#6·#18) | 지역·단지·실거래만 | + 지역 × 최신 완결 월 리포트 · 한국 **월요일**엔 가이드·용어·시장 온도 지역·허브 4곳 묶음 |

## 2. 제목·설명

| # | 자리 | 전 | 후 |
|---|---|---|---|
| 20 | lib/seo/title-experiment · app/region/[id] | "강남구 아파트 시세·실거래·정비사업 \| 내집나우" | 끝에 데이터 기준 월 " — 2026년 9월"(`ymLabelKo` — 스냅샷 period, 서울 구처럼 비어 있으면 지수 시계열 최신 달 한 행, 둘 다 없으면 월 없음) · A/B 배정 그대로 · 달이 바뀌면 ISR 과 함께 자동 |
| 10 | app/redevelopment · app/supply | "정비사업 지도"(14자) · "입주 예정" | "서울 재개발·재건축 지도 — 정비사업 구역·단계·결정 조서" · 입주는 올해·내년 연도(`SUPPLY_TITLE_YEARS` · 한국 날짜 · 매년 자동) |
| 12 | app/glossary/[term] · lib/seo/glossary-related(새) | 설명문 = short(29자) | short + def 를 155자 안에서 문장 경계로(`glossaryMetaDescription`) — meta·OG·트위터 |
| 9 | app/complex/[id] | "원주시 원주시 명륜동"(설명·OG·주소) | `axisRegionName` 으로 시·구 같은 도시는 한 번만 · Fineprint 에 "집계 내집나우(naezipnow.com)" |

## 3. 본문

| # | 자리 | 전 | 후 |
|---|---|---|---|
| 14·25 | app/region/[id]/region-overview · page | 숫자 카드 + 머리 문단만 · 인용할 문장 없음 | 데이터로만 쓴 서술(`buildRegionNarrative` — 지수·평균가·거래·전세가율 중 **있는 것만**, 한 사실 한 문장, 학군·교통 같은 데이터 밖 말 없음) 중 머리 문단이 이미 말한 수가 든 문장은 뺀다(`narrativeComplement` · 같은 수 두 번 금지) → 남는 것은 1년 전 대비·거래 전월 대비·집계 중인 달 건수·전세가율 %p. + 출처·기준월·집계 주체가 든 인용 문장(`buildRegionCiteLine` · `data-cite`) |
| 13·21 | lib/calculator/explainers(새) · app/calculator/CalculatorExplainer(새) · 계산기 3쪽 | 입력 칸만(114단어) | 계산 방법·숫자 예시·확인 사항·관련 링크를 **서버가** 그린다(6도구) + 브레드크럼 JSON-LD. 숫자는 전부 공식 예시 · 시장 수치 없음 |
| 11 | lib/guides/catalog | 가이드 15편 | + 등기부등본 보는 법(표제부·갑구·을구) · 청약 가점 계산(84점 배점표) — 해마다 바뀌는 세율·대출 한도 주제는 넣지 않았다. `updatedAt` 2026-10-20 |
| 17 | lib/notes/title-rule(새) · app/notes/new/NoteForm | 저장 제목 "○○ 임장 기록" | "단지명 [전용면적] 임장노트 · YYYY년 M월"(`noteTitleFor` — 면적·방문월은 입력했을 때만) |

## 4. 내부 링크

| # | 자리 | 전 | 후 |
|---|---|---|---|
| 15·16 | app/region/[id] | 지역 상세에서 임장·온도·리포트·동네로 가는 묶음 없음 | "관련" 묶음 — 임장 가이드·실거래 구간·시장 온도·월간 리포트·동네 + 용어 3·가이드 2·갭 계산기 |
| 15 | app/imjang/[slug] | 지역 상세로 가는 길 없음(200쪽) | tx 지역 이름 → 카탈로그 id(엄격 일치만) → /region · /report · /analysis/temperature · /tx |
| 16 | lib/guides/related-links(새) · app/guides/RelatedLinks(새) · app/guides/[slug] | 나가는 링크 2개 | 글 끝 "관련 용어 · 도구 · 지역" — 분류별 용어 4~6(목록에 **있는 슬러그만**) · 도구 3 · 지역 허브 6 |
| 12 | app/glossary/[term] | 풀이 2~3문장뿐 | "이 용어가 쓰이는 화면" — 분류별 실거래·계산기·가이드 링크 3~5 |
| 16·23 | app/reports/[ym] | 전국 표 249행이 글자 | 지역 이름(파랑 링크) → 그 지역의 같은 달 리포트 · 머리에 링크 복사·시스템 공유·카카오톡 |
| 26·27 | app/page · HomeHeroSearch · app/components/home/HomeHubLinks(새) | 히어로 칩 4 · 홈에서 지역 상세로 직행 없음 | 칩 8(폰 가로 스크롤 · "지도에서 내 동네 찾기"는 폰에서 맨 앞이라 숨지 않는다) · "지역 · 단지 바로가기"(지역 카드 + 거래 많은 단지 12 · 서버 조각 · JS 0) |
| 15 | app/analysis/temperature/[region] | 지역 상세·임장 타일 | + 월간 리포트 · 동네이야기 |

## 5. 공유·운영

| # | 자리 | 전 | 후 |
|---|---|---|---|
| 23 | lib/kakao/sdk(새 · card/kakao-sdk 는 다시 내보냄) · app/components/KakaoShareButton(새) · 단지 상세 · 월간 리포트 · CSP · ShareRow · admin/promo | 운영 변수 이름(`NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`)을 코드가 안 읽어 카카오 공유가 전부 꺼져 있었다 | **두 이름 다** 읽는다 → 임장노트 카드 공유·포인트 초대 공유가 켜진다 · 단지·리포트에 카카오톡 공유 칩(키 없으면 안 그림 · SDK 실패 시 시스템 공유 → 링크 복사) |
| 29 | lib/search/query-stats(새) · /api/search/unified · admin/seo | 사이트 내 검색어 기록 없음(제로결과만) | KV 월별 카운터(60일 · 응답을 막지 않음) · 관리자 SEO 에 "이번 달 검색어 TOP"(가이드·용어 주제 근거) |
| 30 | /api/cron/seo-weekly-report(새) · vercel.json | 없음 | 월요일 00:40 UTC — 사이트맵 유형별 URL 수 · 서치콘솔 색인률(연결됐을 때) · 7일 제로결과 TOP 10 · 이달 검색어 TOP 10. `ALERT_EMAIL_TO` + 메일 설정이 있으면 발송, 없으면 JSON 만. `?dryRun=1` |

## 6. 바뀌지 않는 것 · 확인만 한 것

- 속도(CWV)·번들·이미지 — 실측이 좋아서 손대지 않았다. 단지 상세 HTML 240~525KB 는 RSC 구조(37행 복제)라 싼 지렛대가 없다 — 확인만.
- 히어로의 채운 단추는 이미 하나(한 화면 한 btn-primary) — 확인만.
- 요금제·결제 문구(check-toss-review-freeze) 그대로. /qna 등 보관 경로 그대로.
- KV·카카오 키·GSC 변수가 없는 동안은 전부 종전 동작(검색어 집계 안 함 · 카카오 칩 안 그림 · 색인률 "연결 안 됨").

## 검사

- tests/unit/review-1081.test.ts 12건(순수 함수 — 제목 규칙·월 라벨·설명문 155자·서술·보완 규칙·인용·검색어 정규화 · 링크 실재 — 용어·가이드·계산기·지역·app 경로) · review-1066(지역 스켈레톤 예외)·1069(리포트 lastmod 규칙) 단정 갱신 · 전체 2,383 · tsc 0 · 빌드 EXIT 0.
- 로컬 실측: /sitemap.xml 인덱스에 complexes-1…6(통짜 없음) · 주간 리포트 dryRun 응답(사이트맵 유형별 수 · GSC "연결 안 됨" · 제로결과 "없음" · KV "집계 없음") · 강남구 서술은 운영 데이터로 같은 함수를 돌려 확인(1년 전 대비 ▲2.8% · 거래 전월 대비 ▼47.7% · 9월 59건 집계 중 · 전세가율 ▲0.5%p).
- check-sitemap-index(조각 6 포함 20유형 · slug·로더·라우트 3곳) · check-route-links(정적 454 · 동적 113) · check-cache-policy · 번들 예산(단지 상세 477/480KB 그대로) 통과.
