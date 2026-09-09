-- 977: 크론이 **없는 관계**를 가리켜 매일 실패했다 — 기록하고, 다시 못 생기게 한다.
--
-- ── 무엇이 났나 (2026-09-08 /admin/ops critical) ────────────────────────────
--   cron matview-warm-daily(26) 최근 24시간 실패 1건 · 이후 성공 없음(중단 상태)
--   사유: ERROR: relation "market_agg.complex_households_resolved" does not exist
--   실측: 09-06 19:20 성공을 끝으로 09-07·09-08 19:20 연속 실패.
--
-- 원인은 971 이다. 20260906225257 이 complex_households_resolved 를
-- complex_spec_resolved 로 흡수하며 DROP 했는데, jobid 26 의 VACUUM 목록에
-- 그 이름이 그대로 남아 있었다.
--
-- ── 같은 실수를 971 안에서 이미 한 번 했다 ──────────────────────────────────
-- map_complex_attrs() 함수 본문이 같은 매트뷰를 참조해 조용히 깨졌고
-- 20260906230714 로 급히 고쳤다. 그때 남긴 교훈이 "드롭 전에 pg_proc.prosrc 를
-- grep 하라" 였는데, **사람이 기억해야 하는 규칙은 두 번째에 또 놓친다.**
-- 그래서 이번엔 기계가 본다(아래 2절).
--
-- ── 1절은 "고침"이 아니라 "기록"이다 ────────────────────────────────────────
-- 이 파일을 쓰는 사이에 jobid 26 의 명령문이 서버에서 이미 정정돼 있었다
-- (내가 한 것이 아니다 — apply_migration 을 부른 적이 없다). 정정본에는 내가
-- 적으려던 목록에 없던 complex_household_v2 · complex_household_byname_v2 까지
-- 들어 있어, 내 판본으로 덮으면 오히려 후퇴한다. 그래서 **서버의 현재 명령문을
-- 그대로** 저장소에 남긴다. 저장소와 운영이 갈라져 있으면 다음 사람이 또 속는다.

select cron.schedule(
  'matview-warm-daily',
  '20 19 * * *',
  $cmd$VACUUM (ANALYZE) public.complex_tx_stats_base, market_agg.map_facet_source, market_agg.map_price_point_mv, market_agg.complex_spec_resolved, market_agg.complex_master_link, market_agg.complex_household_v2, market_agg.complex_household_byname_v2, market_agg.tx_band_complex_mv, market_agg.tx_band_landing_mv, market_agg.complex_pair_mv, market_agg.complex_sitemap_mv$cmd$
);

-- ── 2) 끊어진 참조 감시 ─────────────────────────────────────────────────────
--
-- cron 명령문과 ops·market_agg 함수 본문에서 `schema.relation` 꼴 토큰을 뽑아
-- 실제로 존재하는지 본다.
--
-- ── 오탐을 어떻게 없앴나 (실측으로 두 번 좁혔다) ────────────────────────────
-- ① 처음엔 모든 `schema.name` 토큰을 봤다 → 4건 오탐. 전부 **경보 키 문자열**
--    이었다(예: '실패 감시(ops.cron_job)에서도 함께 빠져…' 라는 안내 문구).
-- ② 그래서 **관계를 받는 키워드 뒤**에 오는 토큰만 본다
--    (from · join · into · update · table · vacuum · analyze · view · 쉼표).
--    현재 스키마 전수로 돌려 **오탐 0건**, 그리고 위 두 회귀(크론 VACUUM 목록과
--    971 당시 map_complex_attrs 본문)를 재현 입력으로 넣으면 **둘 다 잡는다**.
--
-- VACUUM 은 트랜잭션 안에서 못 돌아 목록 자체를 함수로 감쌀 수는 없다.
-- 그래서 목록은 손으로 적되, 그 손 적기를 이 검사가 지킨다.
create or replace function ops.dangling_relation_refs()
returns table(source text, ref text)
language sql
security definer
set search_path to 'ops', 'pg_catalog', 'public'
as $function$
  with src as (
    select 'cron:' || j.jobname as source, j.command as body from cron.job j
    union all
    select 'function:' || n.nspname || '.' || p.proname, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('ops', 'market_agg')
  ), tokens as (
    select s.source,
           (regexp_matches(
              s.body,
              '(?:\mfrom|\mjoin|\minto|\mupdate|\mtable|\mvacuum|\manalyze|\mview|,)\s+((?:public|market_agg|ops)\.[a-z_][a-z0-9_]*)',
              'gi'))[1] as ref
    from src s
  )
  select distinct t.source, t.ref
  from tokens t
  where to_regclass(t.ref) is null
    and to_regtype(t.ref) is null
    -- 함수 이름도 같은 꼴이라 걸린다. 관계가 아닌 것은 뺀다.
    and not exists (
      select 1 from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname || '.' || p2.proname = lower(t.ref)
    )
  order by 1, 2;
$function$;

comment on function ops.dangling_relation_refs() is
  '977: cron 명령·ops/market_agg 함수 본문이 가리키는 schema.relation 중 실존하지 않는 것.';

revoke all on function ops.dangling_relation_refs() from public, anon, authenticated;
grant execute on function ops.dangling_relation_refs() to service_role;

-- raise 로 올리면 기존 경보 배선(ops.cron_job_failure_check 매시 → critical →
-- /admin/ops)이 그대로 잡는다. 새 배선을 만들지 않는다.
create or replace function ops.dangling_relation_check()
returns void
language plpgsql
security definer
set search_path to 'ops', 'pg_catalog'
as $function$
declare
  n int;
  lines text;
begin
  select count(*), string_agg(format('%s → %s', source, ref), ' · ' order by source, ref)
    into n, lines
  from ops.dangling_relation_refs();

  if n > 0 then
    raise exception
      '끊어진 관계 참조 %건 — 드롭된 테이블/매트뷰를 크론이나 함수가 아직 가리킵니다: %',
      n, lines;
  end if;
end;
$function$;

comment on function ops.dangling_relation_check() is
  '977: 끊어진 참조가 있으면 raise — cron_job_failure_check 가 critical 로 올린다.';

revoke all on function ops.dangling_relation_check() from public, anon, authenticated;
grant execute on function ops.dangling_relation_check() to service_role;

-- 매시 :45 — 로스터 검사(:15)·실패 검사(:10)와 겹치지 않는 자리.
select cron.schedule(
  'dangling-relation-check-hourly',
  '45 * * * *',
  $cmd$select ops.dangling_relation_check()$cmd$
);

-- ── 3) billing-renewals 잡 복구 ─────────────────────────────────────────────
--
-- 실측: cron.job 에 'billing-renewals' 가 **없다**(0건). ops.run_billing_renewals()
-- 함수는 남아 있고, 20260813235816 이 스케줄했던 잡만 사라졌다. 그래서 로스터
-- 검사가 "지연 266h · 마지막 성공 08-26 10:10" 으로 매시 critical 을 올린다.
--
-- 잡이 없으면 소유자가 근본 원인(아래)을 고쳐도 **여전히 아무 일도 안 일어난다.**
-- 선언된 로스터에 맞춰 되돌리는 것이 맞다.
--
-- ── 지금은 무해하다, 그러나 방치하면 아니다 ────────────────────────────────
--   · vault 에 'cron_secret' 미등록(실측 0건) → 함수는 즉시 raise 하고 끝난다.
--   · billing_subscriptions 활성 0건(전체 3건) → 지금 놓치는 결제가 없다.
-- 즉 복구해도 결제를 일으키지 않는다. 다만 **소유자가 vault 에 cron_secret 을
-- 등록하는 순간부터** 하루 두 번 갱신이 실제로 돈다. 그게 원래 의도다.
--
-- 소유자 조치(내가 못 하는 일 — 시크릿 값은 다루지 않는다):
--   Supabase → Vault → 'cron_secret' = Vercel 의 CRON_SECRET 과 같은 값.
select cron.schedule(
  'billing-renewals',
  '10 1,13 * * *',
  $cmd$select ops.run_billing_renewals()$cmd$
);
