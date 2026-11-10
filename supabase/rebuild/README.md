# supabase/rebuild — 빈 프로젝트에서 DB 를 다시 만드는 묶음

2026-11-10, 기존 프로젝트(`pbhiskvwpwwhtkmnhkbm`) 계정의 2단계 인증을 잃어 접근하지 못하게 됐고,
새 프로젝트(`gjhnrpiiuhjzjzuuvdck`)에 구조를 처음부터 다시 만들었다. 그때 쓴 것을 그대로 남긴다.
`supabase/migrations/` 만으로는 다시 만들 수 없다 — 2026-07-24 이전 96건과 그 뒤 일부가 저장소에 없기 때문이다.

## 순서

1. `000_baseline.sql` — `supabase/SCHEMA.md`(2026-07-24) 의 표 134개. 기본값 · 유일 제약 · 외래키 삭제 규칙은 **추정**이다.
2. `001_pre.sql` — 스키마(private · ops · reporting · market_agg) · 관리자 판정 함수.
3. `supabase/migrations/*.sql` 과 `bridge/*.sql` 을 **파일 이름순으로 섞어** 실행한다.
   - `patched/` 에 같은 이름이 있으면 그쪽을 쓴다(주석 짝이 안 맞는 두 파일).
   - `skip.txt` 의 파일은 건너뛴다(운영 감시 · 알림 · 권한 정리 — 저장소 밖 객체를 전제로 한다).
   - 본문에 `concurrently` 가 있는 파일은 한 트랜잭션으로 묶지 않는다.
4. `bridge/` 는 저장소에 정의가 없던 것을 코드 사용처를 보고 다시 지은 것이다(표 5 · 함수 · 집계 갱신 본체 · 기본값 · 프로필 트리거).

`run-newdb.ps1` 은 이 순서를 번호 붙인 `sql/` 폴더로 풀어 `psql` 로 돌리던 실행기다(성공한 파일은 `applied.txt` 에 적고 이어서 한다).

## 실제 Supabase 에서 다른 점

- `cron.unschedule('이름')` 은 없는 작업이면 오류다 → `select cron.unschedule(jobid) from cron.job where jobname = '이름'`.
- 감시 예약 `dangling-relation-check-hourly` 는 건너뛴 ops 객체 때문에 매시간 실패한다 → 예약을 끈다.
- 자동결제 갱신 예약은 Vault 의 `cron_secret`(Vercel `CRON_SECRET` 과 같은 값)이 있어야 돈다.

## 점검

코드와 구조 대조(읽는 열 · 쓰는 열 · 필수 열 기본값 · RPC 인자 · 덮어쓰기 유일 제약)를 통과한 상태다.
실제 사이트 동작으로 드러난 차이는 `bridge/` 에 새 파일로 더한다(기존 파일을 고치지 않는다).
