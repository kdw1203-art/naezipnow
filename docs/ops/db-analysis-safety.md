# 운영 DB 에서 분석 질의를 돌릴 때 — 반드시 상한을 걸 것

> 2026-09-07 사고에서 나온 규칙이다. 다음 세션의 나(그리고 사람)에게 남긴다.
> 세션이 바뀌면 앞선 세션의 기억은 사라지지만 이 파일은 남는다.

## 무슨 일이 있었나

단지 데이터 연결(971)을 설계하면서, 실거래 33,182행 × 대장 22,155행을
`regexp_match` 로 조인하는 **탐색용 질의**를 운영 DB 에 그대로 던졌다.
상한을 안 걸었다.

`pg_stat_statements` 실측:

| 질의 | 호출 | 총 실행시간 |
|---|---|---|
| 필지 매칭 측정(regexp_match 조인) | 1 | **29,536 ms** |
| 같은 계열 측정 | 1 | 11,411 ms |
| `create materialized view complex_master_link` | 1 | 7,850 ms |
| `refresh materialized view concurrently` ×3 | 1 | 6,600 ms |

그 창(2026-09-06 22:35 UTC~)에 Vercel 이 경보를 냈다.

- `/complex/[id]` 오류율 **43.1%** · 실패 135건
- `단지 정보 조회 시간 초과 (6000ms)` **271건**
- 서버 컴포넌트 렌더 오류 53건
- Supabase **503 Service Unavailable 14건** · Timeout 4건

즉 **분석 질의 하나가 서비스 페이지를 죽였다.** Micro 인스턴스에서 30초짜리
전체 스캔은 다른 모든 질의를 밀어낸다.

## 규칙

1. **탐색·측정 질의는 상한을 걸고 던진다.** 트랜잭션 시작에 한 줄 붙이면 된다.

   ```sql
   set local statement_timeout = '5s';
   -- 이 아래에 측정 질의
   ```

   상한에 걸리면 그 사실 자체가 답이다("이 방식은 운영에서 못 쓴다").
   상한 없이 던져서 29초를 기다리는 건 답을 얻는 게 아니라 서비스를 태우는 것이다.

2. **표본으로 먼저 재고, 전수는 마지막에 한 번.** `limit`·`tablesample`·특정
   시군구로 좁혀서 방식을 정한 뒤, 확정된 SQL 만 전수로 돌린다. 971 에서 실제로
   전수 측정을 **네 번** 돌렸는데, 그중 셋은 표본으로 충분한 것이었다.

3. **매트뷰 생성·`REFRESH ... CONCURRENTLY` 는 트래픽이 적은 시간에.** 둘 다
   테이블 전체를 읽는다. 급하지 않으면 `refresh_market_aggregates` 의 야간
   크론에 얹는다(그 함수는 예산이 부족하면 스스로 물러난다).

4. **작업 전후로 영향 확인.** 무거운 걸 돌렸으면 그 뒤에 한 번 본다.

   ```sql
   select left(regexp_replace(query,'\s+',' ','g'),80) as q,
          calls, round(total_exec_time)::bigint as total_ms
   from pg_stat_statements order by total_exec_time desc limit 5;
   ```

## 앱 쪽에서 한 일 (973)

DB 포화는 언제든 다시 온다(내 실수가 아니어도). 그때 페이지가 포화를 **키우지
않도록** 세 가지를 고쳤다. 자세한 이유는 `app/complex/[id]/page.tsx` 의 사고
메모 주석에 있다.

1. 대표행 조회를 **읽기 전용 클라이언트**로 — 시도별 상한·총 예산·503 백오프.
2. 상한이 끝나면 **AbortSignal 로 질의를 실제로 끊는다**(예전엔 약속만 버렸고
   Postgres 안의 질의는 계속 돌았다).
3. 시간 초과가 연달아 나면 **재시도를 잠깐 끈다**(`lib/db/timeout-breaker.ts`).
   밀리는 DB 에 같은 질의를 하나 더 얹는 건 약이 아니라 독이다.
