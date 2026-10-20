# 1080 — 트래픽 증가 대비(30가지 중 코드로 끝나는 것 전부)

소유자 2026-10-19: "방문자를 늘렸을 때 예상되는 문제 30가지를 파악" → "전부 검토해서 해결". 코드·설정으로 끝나는 항목은 여기,
계정·요금제·DB·법무 판단은 docs/owner-todo-1080.md. DB 변경 없음 · 가격·심사 문구 변경 없음.

근거(운영 실측 2026-10-19): 속도 제한이 인스턴스 메모리(UPSTASH 변수 없음 · Vercel KV 변수는 있는데 코드가 안 봄) · AI 전체 일일 상한 없음
(변수만 있음) · page_view_events 보존 정책 없음 · 매물 상세가 렌더마다 DB 읽기+쓰기 · 뉴스 더 보기가 호출마다 전량 조회 · 검색·청약홈·토론
피드에 속도 제한 없음 · 통근 조회 1회 = 길찾기 최대 60회 · 알림 발송이 하루 1회 · Turnstile 이 서버만 있고 위젯 없음.

## 1. 공용 KV 클라이언트 — lib/kv/rest.ts (새 파일)

`UPSTASH_REDIS_REST_URL/TOKEN` **또는** `KV_REST_API_URL/TOKEN`(Vercel KV · 같은 REST 규약)을 읽는 한 벌. pipeline · GET · SET EX ·
INCR(첫 증가에만 만료) · INCRBY · GETDEL · SCAN · DEL · 한국 날짜 키. 실패는 null/undefined — 판단은 호출자. 변수가 없으면 `kvAvailable()` false
→ 호출자는 종전 메모리/직접 경로로 간다(기능 변화 없음). `/api/health` 에 `kv: { configured, ok }` 칸.

## 2. 고친 것 — 번호는 30가지 목록

| # | 자리 | 전 | 후 |
|---|---|---|---|
| 14 | lib/rate-limit.ts | 인라인 Upstash REST 두 벌 · 운영에선 변수가 없어 전부 프로세스 메모리(인스턴스마다 따로 · 콜드 스타트마다 0) · 매 호출 EXPIRE 라 창이 미끄러짐 | 공용 KV 고정 창(`kvIncrWindow`) — `applyRateLimit`·`keyRateLimit` 둘 다. 없으면 메모리 |
| 17 | lib/ai/global-budget.ts(새) · AI 라우트 7곳 | 사용자별 할당량만 · `AI_DAILY_REQUEST_BUDGET` 변수는 코드가 읽지 않음 | 사이트 전체 일일 상한(한국 날짜 · KV 카운터 · 없으면 메모리). 모델을 **실제로 부르기 직전**에만 소비. 분석은 규칙 기반 결과 + 고지로 강등, 채팅·비교·비교요약·패턴·초안은 503 + Retry-After(자정까지), 임장노트 다듬기는 건너뜀 |
| 17 | lib/ai/llm-provider.ts | 모델 응답 대기 상한 없음 · 네트워크 오류가 던져짐 | 90초(`AI_LLM_TIMEOUT_MS`) · 시간 초과·오류는 ok:false(규칙 기반 폴백) |
| 17 | chat · compare · compare-summary · inspection-note · pattern-summary | 인메모리 `rateLimit` · 패턴 요약은 상한 없음 | KV 고정 창 `keyRateLimit`(채팅 10/시 · 비교 10/분 · 비교요약 10/시 · 임장노트 6/분 · 패턴 요약 10/시) |
| 18·30 | /api/town/news/thumb/[id] | CDN 미적중마다 매체 서버 재요청 | KV 캐시 30일(실패 6시간) + `NEWS_THUMB_DISABLED=1` 끄기 스위치(배포 없이) |
| 7 | /api/cron/events-retention(새) · vercel.json | page_view_events·web_vitals 무한 적재 | 90일(`TRAFFIC_RETENTION_DAYS`) 지난 행을 2,000개씩 삭제 · 매일 03:30 UTC |
| 8 | lib/views/buffer.ts(새) · /api/listings/[id]/view(새) · /api/dev-deals/deal/[id]/view · /api/cron/view-count-flush(새) · 매물 상세 | 매물 상세가 **렌더 중**(크롤러·새로고침 포함) DB 읽기+쓰기 · 개발물건 핑은 상한 없음 · "읽고 +1" 이라 동시 조회 시 유실 | 클라이언트 핑(로봇 UA 제외 · IP 당 분 60회) → KV INCRBY 버퍼 → 매시 20분 반영(글당 시간당 쓰기 1회 · 합산 유실 없음). KV 없으면 핑이 직접 +1 |
| 1 | /api/metrics/pageview | 로봇 UA 의 view/leave 도 행 생성(count 경로만 거르고 있었다) | 로봇은 행을 만들지 않는다 |
| 9 | /api/town/news(더 보기) | 호출마다 board_posts 전량 조회·클러스터링 | `unstable_cache` 5분 · TOWN_POSTS_TAG 로 적재·글 작성 시 비움 |
| 11 | /api/search/unified · /api/search | 속도 제한 없음 · 레거시는 posts 500행 메모리 필터 | KV 고정 창(60/분 · 30/분) · 레거시 CDN 5분 |
| 19 | lib/map/naver-directions.ts · /api/map/commute | fetch revalidate 15분뿐 · 통근 1회 = 길찾기 최대 60회 · 상한 없음 | KV 캐시 7일(좌표 10m 격자 · 실패 6시간) + 일일 상한 3,000(`NAVER_DIRECTIONS_DAILY_CAP` · 넘으면 직선 추정) · 통근 라우트 KV 창 20/분 |
| 20 | /api/applyhome/competition · search | 요청마다 공공데이터 호출 · 상한·캐시 없음 | KV 창 30/분 + CDN 1시간 |
| 24 | notification-outbox-drain · vercel.json | 하루 1회(GitHub Actions) · `x-vercel-cron` 헤더(누구나 붙일 수 있음)를 인가로 신뢰 · 동시 실행 시 이중 발송 | 15분마다 + 공용 인가(lib/cron/authorize) + 잡기(attempts CAS — 먼저 잡은 실행만 보낸다). price-alerts·watchlist-new-tx 6시간마다 |
| 25 | lib/talk/rules.ts · TalkPanel · /api/talk | 30초 고정 폴링(보일 때만) · GET 상한 없음 | 새 글 없는 폴링이 이어지면 30 → 60 → 120초(`talkPollDelayMs`), 새 글·탭 복귀면 30초로 · GET IP 당 60/분 |
| 29 | vercel.json | site-probe 12시간마다 | 3시간마다(4 URL) |
| 4 | next.config.ts | 이미지 변환 캐시 7일 | 30일 — 같은 원본 재변환(과금) 감소 |
| 15 | app/components/TurnstileWidget.tsx(새) · SignupClient · /api/auth/register · CSP | 서버 검증만 있고 위젯 없음 → 캡차 꺼짐 | 사이트 키가 있으면 가입 단추 위에 확인 칸 · 토큰 없으면 전송 안 함 · 서버가 새 가입만 검증(재발송 제외) · CSP script/frame 에 challenges.cloudflare.com. 키 없으면 종전과 같다 |

## 3. 바뀌지 않는 것

- KV 변수가 없는 동안은 전부 종전 동작(메모리 제한 · 직접 +1 · 캐시 없음). 켜는 순서는 owner-todo A 표.
- 요금제·결제 화면 문구 그대로(check-toss-review-freeze). 토스 확인 경로는 이미 CAS + 멱등 키 — DB 유일 제약만 owner-todo C.
- 뉴스 썸네일 호출부·크기는 1079 그대로.

## 검사

- tests/unit/review-1080.test.ts 10건 · talk-1051 단정 1곳 갱신 · 전체 2,371 · 빌드 EXIT 0.
