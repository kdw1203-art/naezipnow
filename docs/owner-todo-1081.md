# 소유자만 할 수 있는 작업 — 검색 유입 (1081 · 2026-10-20)

"검색 유입·사이트 최적화 30가지" 중 **코드로 끝나는 것은 1081 묶음에 들어갔다**(docs/release-1081.md).
여기는 콘솔 로그인·계정·판단이라 제가 대신 누를 수 없는 것만 모았다. 번호는 30가지 목록의 번호.

> 키·비밀번호·토큰은 이 문서나 채팅에 붙여 넣지 않는다. 전부 Vercel 대시보드(Project → Settings → Environment Variables)에
> 직접 넣고 **Redeploy** 한다. 아래 변수 이름은 코드가 실제로 읽는 이름이다.

## A. 1081 코드가 기다리는 콘솔 설정 (넣으면 바로 켜진다)

| # | 할 일 | 어디서 | 변수 이름 | 확인 방법 |
|---|---|---|---|---|
| 1 | **서치콘솔 색인률 자동 수집** — 코드(lib/admin/seo-metrics · 주간 리포트)는 있고 변수만 없다 | Google Cloud → 서비스 계정 만들기 → JSON 키 → Search Console → 설정 → 사용자 및 권한 → 서비스 계정 이메일을 **전체 사용자**로 추가 | `GSC_SERVICE_ACCOUNT_EMAIL` · `GSC_SERVICE_ACCOUNT_PRIVATE_KEY`(JSON 의 private_key · 줄바꿈은 `\n` 그대로) · `GSC_SITE_URL`(`sc-domain:naezipnow.com`) | 관리자 → SEO 의 색인률 칸 · 월요일 리포트 "서치콘솔 색인(주 …)" |
| 23 | **카카오 공유 도메인** — 키 이름은 코드가 맞췄다(두 이름 다 읽음). 카카오 쪽 등록만 확인 | developers.kakao.com → 내 애플리케이션 → 플랫폼 → Web → 사이트 도메인에 `https://naezipnow.com` · JavaScript 키가 운영 변수와 같은 앱인지 | (있음) `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 단지 상세·월간 리포트 머리에 "카카오톡" 칩 · 누르면 카카오톡 공유 창 |
| 30 | 주간 SEO 리포트 받을 주소 | Vercel 환경 변수 | `ALERT_EMAIL_TO`(있음) + 메일 발송 설정(1080 B-23 · `RESEND_API_KEY` 또는 SMTP) | 월요일 09:40 KST 메일 "[내집나우] 주간 SEO 리포트". 발송 설정이 없으면 `https://naezipnow.com/api/cron/seo-weekly-report?dryRun=1`(CRON_SECRET 헤더) 로 내용만 |

## B. 콘솔에서 한 번 누르는 것

| # | 할 일 | 어디서 | 왜 |
|---|---|---|---|
| 2 | **네이버 서치어드바이저** — 사이트맵 `https://naezipnow.com/sitemap.xml` · RSS `https://naezipnow.com/rss.xml` 제출, "수집 요청"으로 홈·/guides·/glossary·/reports | searchadvisor.naver.com → 요청 → 사이트맵 제출 / RSS 제출 | 한국 검색의 절반은 네이버. 코드는 인증 메타·RSS 를 이미 낸다 — 제출만 남았다 |
| 3 | **구글 서치콘솔 사이트맵 정리** — 따로 제출돼 있던 `/sitemap-complexes.xml`(통짜 23,809) 을 지우고 `/sitemap.xml` 하나만 | Search Console → 사이트맵 | 1081 부터 단지 사이트맵은 6조각(`/sitemap-complexes-1.xml`…`-6.xml`)이 인덱스에 실린다. 통짜 주소는 살아 있지만 둘 다 두면 같은 URL 이 두 번 제출된다 |
| 7 | 뉴스 기사 색인 비율 검토 — 색인률(A-1)이 들어온 뒤 4주 | Search Console → 페이지 → "크롤링됨 - 현재 색인이 생성되지 않음"에서 /town/news/ 비율 | 기사 838쪽이 색인에서 많이 빠지면 뉴스 사이트맵 priority 를 내리거나 오래된 기사 noindex 를 다음 묶음에서 |
| 19 | **리치 결과 테스트** — 지역 상세 1쪽 · 단지 상세 1쪽 · 용어 1쪽 · 가이드 1쪽 · 계산기 1쪽 | search.google.com/test/rich-results | BreadcrumbList·FAQPage·ApartmentComplex 가 오류 없이 읽히는지(코드는 그대로 · 확인만) |

## C. 판단이 필요한 것 (제가 정하지 않았다)

| # | 주제 | 선택지 |
|---|---|---|
| 11 | 다음 가이드 주제 — 1081 은 제도 수치가 안정적인 둘만(등기부·청약 가점) | 후보: 취득세 계산(해마다 바뀜 · 연도 표기 필요) · 전세보증보험 가입 조건(기관별) · 재건축 단계별 뜻. 관리자 → SEO "이번 달 검색어 TOP"(KV 연결 뒤 쌓인다)과 제로결과 검색어가 근거 |
| 24 | 단지 상세 HTML 240~525KB — RSC 구조라 싼 지렛대 없음 | 그대로 둔다(CWV 좋음) / 다음 묶음에서 거래 표를 클라이언트 지연 로드로(본문이 줄어 검색엔진이 읽는 텍스트도 준다 — 권하지 않음) |
| 20 | 지역 제목의 기준 월 — A/B 실험(region-title-v1)과 함께 붙었다 | 4주 뒤 GSC 페이지군 CTR 로 판단(실험 메타 lib/seo/title-experiment) |

## D. 1081 이 켜지면 바뀌는 운영 화면

- 관리자 → SEO: "이번 달 검색어 TOP"(KV 있을 때) — 없으면 "KV 미설정" 한 줄.
- `/sitemap.xml` 인덱스: complexes 통짜 대신 complexes-1 … complexes-6.
- 월요일 00:40 UTC 크론 1개 추가(총 22개) — Vercel Hobby 는 크론 상한이 있으니 플랜 확인(Pro 는 넉넉).
