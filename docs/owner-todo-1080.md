# 소유자만 할 수 있는 작업 — 트래픽 증가 대비 (1080 · 2026-10-19)

"방문자를 늘렸을 때 예상되는 문제 30가지" 중 **코드로 끝나는 것은 1080 묶음에 들어갔다**(docs/release-1080.md).
여기는 계정·콘솔·결제·정책 판단이라 제가 대신 누를 수 없는 것만 모았다. 번호는 30가지 목록의 번호.

> 키·비밀번호·토큰은 이 문서나 채팅에 붙여 넣지 않는다. 전부 Vercel 대시보드(Project → Settings → Environment Variables)에
> 직접 넣고 **Redeploy** 한다. 아래 변수 이름은 코드가 실제로 읽는 이름이다(.env.example 에도 같은 이름).

## A. 1080 코드가 기다리는 콘솔 설정 (넣으면 바로 켜진다)

| # | 할 일 | 어디서 | 변수 이름 | 확인 방법 |
|---|---|---|---|---|
| 14 | **KV 연결** — 속도 제한·AI 일일 상한·썸네일 캐시·조회수 버퍼·길찾기 캐시의 공용 백엔드 | Vercel → Storage → Upstash(Redis) 만들기 → 프로젝트에 연결 | `KV_REST_API_URL` · `KV_REST_API_TOKEN` (연결하면 자동으로 들어온다. 이미 있으면 그대로) | 배포 뒤 `https://naezipnow.com/api/health` 의 `kv: { configured: true, ok: true }` |
| 17 | **AI 전체 일일 상한 값** — 지금 변수는 있으나 값 확인 필요 | Vercel 환경 변수 | `AI_DAILY_REQUEST_BUDGET` (예: 2000 — 시도 수·한국 날짜 기준. 0/없음이면 상한 없음) | 상한에 닿으면 AI 분석은 규칙 기반 결과 + 고지, 채팅·비교·초안은 503 "AI 요청 일일 한도 도달 · 내일 다시" |
| 15 | **가입 캡차(Cloudflare Turnstile)** — 코드는 들어갔고 키만 없다 | dash.cloudflare.com → Turnstile → 사이트 추가(도메인 naezipnow.com · 위젯 Managed) → 사이트 키·시크릿 키 | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` · `TURNSTILE_SECRET_KEY` — **둘을 함께** 넣는다. 하나만 넣으면 가입이 막힌다 | 가입 화면 단추 위에 확인 칸이 뜬다 |
| 19 | 네이버 길찾기 일일 상한(기본 3,000회) — NCP 요금 상한에 맞춰 조정 | Vercel 환경 변수 | `NAVER_DIRECTIONS_DAILY_CAP` | 넘으면 통근시간이 직선거리 추정으로 바뀐다(화면 표기 "추정") |
| 7 | 방문 이벤트 보존 일수(기본 90일) | Vercel 환경 변수 | `TRAFFIC_RETENTION_DAYS` | 매일 03:30 UTC 크론 응답 `deleted` |
| 30 | 뉴스 썸네일 끄기 스위치 — 매체·저작권 연락이 오면 **배포 없이** 끈다 | Vercel 환경 변수 → Redeploy 불필요(런타임 읽기) | `NEWS_THUMB_DISABLED=1` | 목록 썸네일이 전부 아이콘 칸 |

## B. 서비스 가입·요금제 결정

| # | 할 일 | 왜 | 비용·판단 |
|---|---|---|---|
| 22 | **카카오 로그인** — developers.kakao.com 앱 → 카카오 로그인 ON → Redirect URI `https://naezipnow.com/api/auth/callback/kakao` → `AUTH_KAKAO_ID`(REST API 키) · `AUTH_KAKAO_SECRET`(보안 → Client Secret) | 한국 모바일 가입 전환. 코드는 변수가 있으면 단추를 자동으로 켠다 | 무료 |
| 23 | **메일 발송** — resend.com 가입 → 도메인 naezipnow.com 인증(DNS TXT·DKIM) → `RESEND_API_KEY`(re_…) · `EMAIL_FROM` | 지금은 SMTP 계정 하나(일일 한도 수백 통·스팸함). 인증 메일·비밀번호 재설정·영수증·경보 메일이 전부 여기에 걸린다 | 무료 3,000통/월 → 유료 |
| 1·2·3·4·5 | **Vercel 요금제** — 현재 플랜 확인(대시보드 → Settings → Billing). Hobby 면 함수 100만 회·대역폭 100GB·이미지 원본 1,000장/월 | 7월에 "무료 100만 회 소진" 메일을 받은 기록. 크론 21개가 돌아가는 구성은 Pro 전제 | Pro $20/월 + 사용량 |
| 10·12 | **Supabase 컴퓨트·이그레스** — 대시보드 → Settings → Compute · Usage 에서 CPU·이그레스 그래프 확인. 동시 사용자가 늘어 CPU 가 70% 를 넘기면 컴퓨트 한 단계 | 지도·검색·집계 질의가 같은 DB 를 쓴다 | Small $15/월~ |
| 16 | **Vercel Firewall** — 프로젝트 → Firewall → Bot Protection(Pro) · 필요 시 `/api/*` 에 IP 당 요청 상한 규칙 | 봇이 `force-dynamic` API 를 긁으면 함수 호출·DB 비용이 그대로 | Pro 포함 |
| 29 | **외부 모니터링** — Sentry(무료 5천 이벤트/월) 또는 UptimeRobot(무료) 으로 `https://naezipnow.com/api/health` 5분 간격 | 지금은 장애를 사용자가 먼저 안다. 코드에 Sentry 연결은 없다 — 원하시면 다음 묶음에서 `SENTRY_DSN` 연동 | 무료 |
| 6 | **Vercel `my-project` 중복 프로젝트** — Settings → Git → Disconnect (또는 프로젝트 삭제) | 푸시마다 ERROR 배포·빌드 시간 낭비 | — |

## C. DB 작업 (제가 운영 DB 에 직접 쓰지 않는 규칙 — 승인하시면 마이그레이션 파일로 드린다)

| # | 할 일 | 왜 |
|---|---|---|
| 26 | `payments.order_id` · `provider_payment_key` **유일 제약** | 코드는 조건부 갱신(CAS)으로 막고 있지만 DB 제약이 마지막 보루 |
| 21 | `ingest_daily_news` · `get_automation_script` 의 **anon 실행 회수** — 뉴스 수집 세션이 세션 경로(서비스 키)로 바뀐 뒤 | 공유 비밀 하나로 anon 이 글을 발행할 수 있는 길 |
| 11 | `pg_trgm` 확장 + `posts.title`·`listings.complex_name` 등 **trigram 인덱스** | 검색이 `%단어%` 라 데이터가 늘면 선형으로 느려진다. 1080 은 속도 제한·CDN 으로 막았고 인덱스는 DB 작업 |
| 7 | (선택) `page_view_events` 월 파티션 | 보존 크론으로 충분하지만 하루 수십만 행이 되면 파티션이 싸다 |

## D. 운영·콘텐츠·법무 (코드 밖)

| # | 할 일 |
|---|---|
| 27 | 고객센터 응답 체계 — `nuguzip@naver.com` 하나·운영자 1명. 방문자가 늘면 FAQ 보강(현재 20개) + 문의 분류(결제/계정/데이터)별 답변 틀 |
| 28 | 빈 화면 — 시장 온도 16칸 중 13칸 "기록 없음"(REB 수집 범위), 청약 "준비 중", 토론·Q&A 0건. 데이터 범위 확대(REB 지역 추가)와 초기 글은 소유자 결정 |
| 30 | 법무 — ① 뉴스 본문·사진 자동 수집 + 썸네일 재가공: 매체별 이용 허락 또는 썸네일 끄기 스위치 준비(A 표) ② 개인정보처리방침의 국외 이전(AI)·GA·AdSense 고지 현행화 ③ 위치기반서비스 사업자 신고 여부 ④ 통신판매업 표기 |
| 13 | (구조) 서버가 서비스 키로 전부 읽는 구조 — 당장 할 일은 없고, KV·데이터 캐시(1080)가 완충이다. 다음 단계는 읽기 전용 복제본(Supabase Read Replica · Pro) |

## E. 1080 이 바꾼 크론 주기 (참고)

| 크론 | 전 | 후 |
|---|---|---|
| notification-outbox-drain(알림함·메일 발송) | GitHub Actions 하루 1회(06:00 UTC) | + Vercel 15분마다 |
| price-alerts · watchlist-new-tx | 하루 1회 | + 6시간마다 |
| site-probe | 12시간마다 | 3시간마다 |
| view-count-flush(조회수 버퍼 반영) | — | 매시 20분 |
| events-retention(방문 이벤트 보존) | — | 매일 03:30 UTC |
