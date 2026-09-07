/* 971 · 일일 집계 갱신 목록 교체.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260906225342)

   바뀐 건 두 줄짜리 갱신 블록과 결과 키뿐이다. 나머지 본문(예산 가드·워터마크
   가드·advisory lock·etl_runs 기록)은 20260810002633 의 것을 그대로 옮겼다 —
   CREATE OR REPLACE FUNCTION 은 전체를 다시 쓰므로 한 줄도 빠뜨리면 안 된다.

   complex_households_resolved 는 사라졌고, 그 자리에 두 단계가 들어간다.
   순서가 곧 의존성이다: link(동+번지 연결) → spec_resolved(해석) → map_facet.
*/
create or replace function public.refresh_market_aggregates()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
DECLARE
  fresh_within  constant interval := interval '6 hours';
  -- 원천이 그대로여도 이 시간이 지나면 무조건 한 번은 다시 돈다(드리프트 안전판).
  max_stale     constant interval := interval '25 hours';
  min_budget_ms constant integer  := 600000;
  lock_key  bigint      := hashtext('refresh_market_aggregates')::bigint;
  t0        timestamptz := clock_timestamp();
  last_ok   timestamptz;
  res       jsonb;
  budget_ms integer;
  src_wm    timestamptz;
  last_wm   timestamptz;
BEGIN
  -- 예산 가드. 여기서 빠지는 호출은 실패가 아니라 "내 일이 아님"이다.
  SELECT setting::int INTO budget_ms FROM pg_settings WHERE name = 'statement_timeout';

  IF coalesce(budget_ms, 0) > 0 AND budget_ms < min_budget_ms THEN
    INSERT INTO public.etl_runs (run_key, source, scope, status,
                                 started_at, finished_at, params)
    VALUES ('market-agg-deferred-' || to_char(t0, 'YYYYMMDD-HH24'),
            'market-aggregates-http', 'deferred', 'deferred',
            t0, clock_timestamp(),
            jsonb_build_object('reason', 'insufficient statement_timeout',
                               'budget_ms', budget_ms,
                               'required_ms', min_budget_ms))
    ON CONFLICT (run_key) DO NOTHING;

    RETURN jsonb_build_object(
      'ok', true, 'skipped', true,
      'reason', 'insufficient statement_timeout budget',
      'budget_ms', budget_ms, 'required_ms', min_budget_ms,
      'handled_by', 'pg_cron:market-aggregates-daily');
  END IF;

  SELECT max(finished_at) INTO last_ok
  FROM public.etl_runs
  WHERE source = 'market-aggregates' AND status = 'completed';

  IF last_ok IS NOT NULL AND last_ok > now() - fresh_within THEN
    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'refreshed recently',
      'last_refreshed_at', last_ok,
      'next_eligible_at', last_ok + fresh_within);
  END IF;

  /* 2026-08-10 추가 — 원천 변화 가드.
     집계 입력은 market_transactions(신규/정정)과 apartment_complexes 다.
     둘 다 직전 성공 이후로 한 톨도 안 움직였으면 결과가 비트 단위로 같다.
     그걸 230초 들여 다시 만드는 건 순수 낭비였다(측정: DB 전체 실행시간의 35.9%).
     세 컬럼 모두 인덱스가 있어 이 워터마크 조회 자체는 1.3ms 다.
     단, max_stale 이 지나면 원천이 그대로여도 한 번은 돌린다. */
  SELECT greatest(
           (SELECT max(created_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.apartment_complexes))
    INTO src_wm;

  SELECT (params->>'source_watermark')::timestamptz INTO last_wm
  FROM public.etl_runs
  WHERE source = 'market-aggregates' AND status = 'completed'
    AND params ? 'source_watermark'
  ORDER BY finished_at DESC
  LIMIT 1;

  IF last_wm IS NOT NULL
     AND src_wm IS NOT NULL
     AND src_wm <= last_wm
     AND last_ok IS NOT NULL
     AND last_ok > now() - max_stale THEN

    INSERT INTO public.etl_runs (run_key, source, scope, status,
                                 started_at, finished_at, params)
    VALUES ('market-agg-nochange-' || to_char(t0, 'YYYYMMDD-HH24'),
            'market-aggregates', 'nochange', 'skipped',
            t0, clock_timestamp(),
            jsonb_build_object('reason', 'source unchanged',
                               'source_watermark', src_wm,
                               'last_watermark', last_wm,
                               'last_ok', last_ok))
    ON CONFLICT (run_key) DO NOTHING;

    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'source unchanged',
      'source_watermark', src_wm, 'last_refreshed_at', last_ok,
      'forced_refresh_after', last_ok + max_stale);
  END IF;

  IF NOT pg_try_advisory_lock(lock_key) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already running');
  END IF;

  BEGIN
    res := coalesce(public.refresh_market_aggregates_impl(), '{}'::jsonb);

    /* 2026-09-06 (971) — 세대수·단지 스펙 연결이 두 단계가 되었다.
       complex_master_link  : 실거래 단지 ↔ K-apt 대장 을 "동+번지" 로 잇는다.
       complex_spec_resolved: 그 결과를 이름 매칭(v2·byname_v2)과 합쳐 한 줄로 만든다.
       순서가 곧 의존성이다 — link 가 먼저 서야 resolved 가 옳다.
       (예전의 complex_households_resolved 는 resolved 에 흡수되어 사라졌다.) */
    REFRESH MATERIALIZED VIEW CONCURRENTLY market_agg.complex_master_link;
    REFRESH MATERIALIZED VIEW CONCURRENTLY market_agg.complex_spec_resolved;
    REFRESH MATERIALIZED VIEW CONCURRENTLY market_agg.map_facet_source;

    res := res || jsonb_build_object(
      'complex_master_link',  (SELECT count(*) FROM market_agg.complex_master_link),
      'complex_spec_resolved',(SELECT count(*) FROM market_agg.complex_spec_resolved),
      'households_linked',    (SELECT count(*) FROM market_agg.complex_spec_resolved
                                WHERE households IS NOT NULL),
      'map_facet_source',     (SELECT count(*) FROM market_agg.map_facet_source));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(lock_key);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(lock_key);

  -- 이번에 반영한 원천 지점을 남긴다. 다음 실행의 판단 근거가 된다.
  res := res || jsonb_build_object('source_watermark', src_wm);

  INSERT INTO public.etl_runs (run_key, source, scope, status, started_at, finished_at,
                               inserted_count, error_count, error_log, params)
  VALUES ('market-agg-' || to_char(t0,'YYYYMMDD-HH24MISS'),
          'market-aggregates', 'guarded', 'completed', t0, clock_timestamp(),
          0, 0, '[]'::jsonb, res);

  RETURN res || jsonb_build_object(
    'duration_ms', round(extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int);
END;
$fn$;

revoke execute on function public.refresh_market_aggregates() from public, anon, authenticated;
