# 1099 — 운영 경보 개선: 정지 구간 경보 묶음 · molit 당월 비면 전월 이어받기 · 만료 스윕 Vercel 크론 · KV 실패 이유

소유자 2026-11-01 운영 경보 캡처(critical 7종 진행 중 · 각 37회) "개선 작업을 해 줘". 1098(광고)과 같은 zip 에 담았다.
DB 변경 없음 · 가격 · 결제 · 심사 화면 변경 없음. GitHub main(1097) 위에 적용된다.

## 무엇이 울렸고 왜

DB 실측(`ops.health_alert_log` · `market_ingest_log` · `ops.app_health_probe`):

| 경보 | 실체 |
|---|---|
| market_transactions.ingest · ingest.molit · onbid · ecos · source_roster · sweep_heartbeat · seo.asset | **10-22 19:54 ~ 11-01 00:50 호스팅 정지**(DEPLOYMENT_PAUSED · 사용 요금 한도) 동안 Vercel 크론과 GitHub Actions ETL 이 전부 503 — 같은 원인 하나가 7종 × 37회로 보였다 |
| 재개 뒤(11-01 00:50 배포) | Vercel 크론은 스스로 회복 — apt-master(04:00 · 12:00 UTC 864 · 899행 ok) · apt-detail · geocode · reb · outbox · site.http_probe · health_endpoint 전부 ok 기록 |
| 아직 진행 중 ① molit | 11-01 00:40 UTC 크론이 **당월(202611)** 을 골라 16곳 전부 빈 응답(적재 0). 전월(202610)은 GitHub ETL 의 PREV_YM 호출만 받는데 그 잡이 10-22 뒤로 돌지 않았다 → 누적 행수 정체 |
| 아직 진행 중 ② ecos · onbid · kosis · applyhome · supply · redevelopment · plan-expiry · points-expiry | 전부 **GitHub Actions ETL(06:00 UTC)** 만 돌린다. 11-01 06:00 UTC 는 사이트가 살아 있었는데 기록이 없다 → GH 쪽이 멈춰 있다(스케줄 비활성 · 분 한도 소진 · 워크플로 실패 중 하나 — 여기서는 볼 수 없다) |
| app.health_check_false(KV) | `/api/health` 의 `checks.kv = {configured:true, ok:false}` 가 279시간째 — Vercel KV(Upstash) PING 실패. 이유(401 토큰 회수 · 429 한도 · 시간 초과)를 아무도 적지 않았다 |
| ingest.apt_master_stall | 정지 구간의 0행 — 재개 뒤 864 · 899행 적재로 `ingest.apt_master_ok` ok 기록(해소) |

## 고친 것

1. **운영 콘솔 묶음 설명** — `outageWindowOf`(순수): 사이트 탐침 경보(site.http_probe · site.outage · app.health_endpoint)의 첫 발생 ~ 회복 확인을
   정지 구간으로 보고, 그 구간에 시작된 경보에 "정지 구간" 표식 + 한 줄 설명(Vercel 크론은 다음 주기에 스스로 해소 · GitHub 만 돌리는 소스는 GH 실행 확인).
2. **molit 크론 — 당월이 비면 전월을 이어받는다** — 자동 월이 당월이고 이번 슬라이스가 전부 빈 응답(적재 0 · 기존 커버 0)이면 남은 예산 안에서
   같은 슬라이스로 전월을 받는다. 월초 며칠은 당월이 비는 게 정상이라 그 날의 크론이 헛돌지 않는다. 수동 `?yyyymm=` · `?gaps=1` 은 그대로.
3. **만료 스윕을 Vercel 크론에도** — `plan-expiry-sweep`(03:25 UTC) · `points-expiry-sweep`(03:35 UTC). 결제 만료는 GitHub 가 멈춘 하루를 못 기다린다.
   라우트는 이미 `authorizeCron`(Bearer · x-cron-secret 둘 다)이라 코드 변경 없이 vercel.json 두 줄. 크론 24개(Pro 상한 40).
4. **KV 실패 이유** — `kvPingDetail()` → `/api/health` `checks.kv.reason`(http_401 · http_429 · timeout · network · no_pong). 키 재료 없음.
   다음 탐침부터 `select payload->'checks'->'kv' from ops.app_health_probe order by id desc limit 1` 로 이유가 보인다.

## 소유자 작업

1. zip 적용 · 푸시 → 배포.
2. **GitHub › Actions › ETL** 워크플로 확인 — "This scheduled workflow is disabled" 배너면 Enable · 분 한도(Settings › Billing › Actions)면 결제 주기 확인 ·
   마지막 실행 로그에 503 이 있으면 지금 **Run workflow** 로 한 번 수동 실행(ecos · onbid · supply · redevelopment · applyhome 이 바로 돈다).
3. KV: 다음 탐침(1시간)의 `reason` 을 보고 — `http_401/403` 이면 Vercel › Storage 의 KV 토큰 재발급(환경변수 `KV_REST_API_TOKEN`) · `http_429` 면 한도 ·
   `timeout/network` 면 스토어 상태. KV 는 속도 제한 · AI 상한 · 조회수 버퍼의 백엔드라 꺼져도 화면은 돈다(메모리 경로).
4. 관리 › 데이터 › 크론 실행 판에서 **실거래 적재**를 한 번 눌러 전월(202610)을 바로 받을 수 있다(크론은 내일 00:40 UTC 에 전월 차례).
