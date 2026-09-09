-- 979b — 스냅샷에 "어떤 측정 규칙으로 뜬 것인가"를 적는다.
--
-- 979 로 web_vitals 의 화면 귀속을 고쳤다. 그런데 ops.cwv_page_snapshot 에는
-- **고치기 전 규칙으로 뜬 스냅샷**이 남아 있고, ops.cwv_lcp_regression_check 는
-- "오늘 스냅샷 vs 7~15일 전 기준선" 을 비교한다. 그대로 두면 7일 뒤부터
-- 새 규칙의 값과 옛 규칙의 값을 견주게 되어, 아무 일도 없었는데 회귀 경보가
-- 뜨거나(반대로 진짜 회귀가 가려지거나) 한다. 소유자 메일까지 나가는 경보다.
--
-- 그래서 스냅샷마다 측정 규칙을 적고, 회귀 판정은 **같은 규칙끼리만** 한다.
--   basis = 'scope-v979' — web_vitals.scope 로 화면 귀속을 가린 뒤 뜬 스냅샷
--   basis IS NULL        — 그 이전. 비교 대상에서 뺀다(지우지는 않는다).
--
-- 가산만 · 재실행 안전 · GRANT 변경 없음(함수 본문만 교체).

alter table ops.cwv_page_snapshot add column if not exists basis text;

comment on column ops.cwv_page_snapshot.basis is
  '이 스냅샷이 뜬 측정 규칙 — scope-v979=화면 귀속 교정 후 / NULL=그 이전(979b). 회귀 비교는 같은 규칙끼리만.';

-- ---------------------------------------------------------------------------
-- (1) 스냅샷을 뜰 때 규칙을 함께 적는다
-- ---------------------------------------------------------------------------
create or replace function ops.cwv_page_check(p_window_days integer default 28, p_min_n integer default 20, p_recent_days integer default 7)
 returns integer
 language plpgsql
 security definer
 set search_path to 'ops', 'public', 'pg_catalog'
as $function$
declare
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  p_low_n int := 8;
  em text; r record; hits int := 0; sev text; msg text; prov text; trend text;
  worst text := null;
  -- 메트릭 루프용
  m text; m_n int; m_p75 numeric; rn int; rp75 numeric; good numeric; poor numeric;
  sev28 text; sev_recent text; unit text; label text;
begin
  for r in
    with p as (
      select ops.cwv_normalize_path(path) as page, metric, value, created_at
      from public.web_vitals
      where created_at > now() - (p_window_days || ' days')::interval
        /* [979] 화면 귀속이 맞는 줄만. CLS·INP 는 화면 단위('route'),
           LCP 는 문서 단위('doc' — 문서가 처음 연 화면에 달린다).
           scope IS NULL 인 옛 표본은 어느 화면 값인지 알 수 없어 제외한다. */
        and (
             (scope = 'route' and metric in ('CLS','INP'))
          or (scope = 'doc'   and metric = 'LCP')
        )
    )
    select page,
      count(*) filter (where metric='LCP')::int as lcp_n,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='LCP'))::int as lcp_p75,
      count(*) filter (where metric='INP')::int as inp_n,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='INP'))::int as inp_p75,
      count(*) filter (where metric='CLS')::int as cls_n,
      round((percentile_cont(0.75) within group (order by value) filter (where metric='CLS'))::numeric,3) as cls_p75,
      -- 최근 창
      count(*) filter (where metric='LCP' and created_at > now() - (p_recent_days||' days')::interval)::int as r_lcp_n,
      round(percentile_cont(0.75) within group (order by value)
            filter (where metric='LCP' and created_at > now() - (p_recent_days||' days')::interval))::int as r_lcp_p75,
      count(*) filter (where metric='INP' and created_at > now() - (p_recent_days||' days')::interval)::int as r_inp_n,
      round(percentile_cont(0.75) within group (order by value)
            filter (where metric='INP' and created_at > now() - (p_recent_days||' days')::interval))::int as r_inp_p75,
      count(*) filter (where metric='CLS' and created_at > now() - (p_recent_days||' days')::interval)::int as r_cls_n,
      round((percentile_cont(0.75) within group (order by value)
            filter (where metric='CLS' and created_at > now() - (p_recent_days||' days')::interval))::numeric,3) as r_cls_p75
    from p
    group by page
    having greatest(count(*) filter (where metric='LCP'),
                    count(*) filter (where metric='INP'),
                    count(*) filter (where metric='CLS')) >= p_min_n
  loop
    insert into ops.cwv_page_snapshot(page, window_days, lcp_n, lcp_p75, inp_n, inp_p75, cls_n, cls_p75, basis)
    values (r.page, p_window_days, r.lcp_n, r.lcp_p75, r.inp_n, r.inp_p75, r.cls_n, r.cls_p75, 'scope-v979');

    foreach m in array array['CLS','LCP','INP'] loop
      if m = 'CLS' then
        m_n := r.cls_n; m_p75 := r.cls_p75; rn := r.r_cls_n; rp75 := r.r_cls_p75;
        good := 0.10; poor := 0.25; unit := ''; label := 'CLS';
      elsif m = 'LCP' then
        m_n := r.lcp_n; m_p75 := r.lcp_p75; rn := r.r_lcp_n; rp75 := r.r_lcp_p75;
        good := 2500; poor := 4000; unit := 'ms'; label := 'LCP';
      else
        m_n := r.inp_n; m_p75 := r.inp_p75; rn := r.r_inp_n; rp75 := r.r_inp_p75;
        good := 200; poor := 500; unit := 'ms'; label := 'INP';
      end if;

      if m_p75 is null or m_n < p_low_n then continue; end if;

      -- 28일 창 판정 (기존 규칙 유지)
      if m_n >= p_min_n then
        sev28 := case when m_p75 > poor then 'critical' when m_p75 > good then 'warn' else null end;
        prov := '';
      else
        sev28 := case when m_p75 > poor then 'warn' else null end;
        prov := ' · 표본 부족 잠정';
      end if;

      -- 최근 창 판정
      sev_recent := case when rn >= p_low_n and rp75 > poor then 'critical'
                         when rn >= p_low_n and rp75 > good then 'warn' else null end;

      trend := case when rn = 0 then format(' · 최근 %s일 표본 0(추세 판정 불가)', p_recent_days)
                    when rn < p_low_n then format(' · 최근 %s일 p75 %s%s(표본 %s·판정 불가)', p_recent_days, rp75, unit, rn)
                    else format(' · 최근 %s일 p75 %s%s(표본 %s)', p_recent_days, rp75, unit, rn) end;

      sev := sev28;
      -- (a) 회복 중: 28일은 critical 이지만 최근 창이 충분한 표본으로 good 이면 강등
      if sev28 = 'critical' and rn >= p_low_n and rp75 <= good then
        sev := 'warn';
        trend := trend || format(' — 최근 %s일 기준 회복(28일 창의 과거 표본이 잔존)', p_recent_days);
      -- (b) 집계에 가려진 악화: 28일은 통과인데 최근 창이 poor 초과
      elsif sev28 is null and sev_recent = 'critical' then
        sev := 'warn';
        trend := trend || format(' — 28일 집계(%s%s)에 가려진 최근 악화', m_p75, unit);
      end if;

      if sev is not null then
        msg := format('%s → %s p75 %s%s (표본 %s · 구글 good %s / poor %s)%s%s',
                      r.page, label, m_p75, unit, m_n, good, poor, prov, trend)
               || case when m = 'CLS' then ' — 레이아웃 이동으로 랭킹 손해' else '' end;
        insert into ops.health_alert_log(check_name, severity, detail, age_hours)
        values ('seo.cwv_page', sev, msg, 0);
        hits := hits + 1;
        if sev = 'critical' and worst is null then worst := msg; end if;
      end if;
    end loop;
  end loop;

  if worst is not null and not exists (
      select 1 from public.user_inbox_notifications
       where body like '[HEALTH] seo.cwv_page%' and created_at > now() - interval '20 hours') then
    foreach em in array owner_emails loop
      insert into public.user_inbox_notifications(user_email, title, body, action_url)
      values (em, 'Core Web Vitals 이상', '[HEALTH] seo.cwv_page — ' || worst, '/admin/seo');
    end loop;
  end if;

  return hits;
end;
$function$;

-- ---------------------------------------------------------------------------
-- (2) 상대 회귀 판정 — 같은 측정 규칙의 스냅샷끼리만 견준다
-- ---------------------------------------------------------------------------
create or replace function ops.cwv_lcp_regression_check()
 returns integer
 language plpgsql
 security definer
 set search_path to 'ops', 'public', 'pg_catalog'
as $function$
declare
  r record; hits int := 0; msg text; tag text; fired_pages text[] := '{}';
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  em text;
begin
  for r in
    with snap as (
      select page, captured_at, lcp_p75, lcp_n,
             row_number() over (partition by page order by captured_at desc) as rn
        from ops.cwv_page_snapshot
       where lcp_n >= 20 and lcp_p75 is not null
         and captured_at > now() - interval '20 days'
         /* [979b] 측정 규칙이 바뀐 뒤의 스냅샷끼리만 비교한다 */
         and basis = 'scope-v979'
    ),
    cur  as (select page, captured_at, lcp_p75, lcp_n from snap
              where rn = 1 and captured_at > now() - interval '30 hours'),
    prev as (select page, captured_at, lcp_p75 from snap where rn = 2)
    select c.page, c.lcp_n, c.lcp_p75 as cur_p75,
           bc.base_p75 as cur_base, bc.base_days
      from cur c
      left join prev p on p.page = c.page
      left join lateral (
        select percentile_cont(0.5) within group (order by s.lcp_p75) as base_p75,
               count(*) as base_days
          from ops.cwv_page_snapshot s
         where s.page = c.page and s.lcp_n >= 20 and s.lcp_p75 is not null
           and s.basis = 'scope-v979'
           and s.captured_at between c.captured_at - interval '15 days'
                                 and c.captured_at - interval '7 days') bc on true
      left join lateral (
        select percentile_cont(0.5) within group (order by s.lcp_p75) as base_p75,
               count(*) as base_days
          from ops.cwv_page_snapshot s
         where s.page = c.page and s.lcp_n >= 20 and s.lcp_p75 is not null
           and s.basis = 'scope-v979'
           and s.captured_at between p.captured_at - interval '15 days'
                                 and p.captured_at - interval '7 days') bp on true
     where bc.base_days >= 3
       and (c.lcp_p75 - bc.base_p75) / nullif(bc.base_p75,0) >= 0.25
       and (c.lcp_p75 - bc.base_p75) >= 300
       -- 전환만 기록: 직전 스냅샷이 이미 회귀 상태였으면 침묵(지속 조건 재기록 금지).
       and not (
             p.lcp_p75 is not null and bp.base_days >= 3
         and (p.lcp_p75 - bp.base_p75) / nullif(bp.base_p75,0) >= 0.25
         and (p.lcp_p75 - bp.base_p75) >= 300
       )
     order by (c.lcp_p75 - bc.base_p75) / nullif(bc.base_p75,0) desc
  loop
    fired_pages := fired_pages || r.page;
    tag := format('%s LCP 상대회귀 ', r.page);
    msg := format('%s— p75 %sms (표본 %s) · 7~15일 전 기준선 %sms 대비 +%s%% (+%sms). '
                  '절대 임계(2500/4000) 안이어도 이 페이지 자신의 기준선에서 벗어났다',
                  tag, r.cur_p75, r.lcp_n, round(r.cur_base),
                  round(((r.cur_p75 - r.cur_base)/nullif(r.cur_base,0)*100)::numeric,1),
                  round(r.cur_p75 - r.cur_base));
    hits := hits + 1;

    if exists (select 1 from ops.health_alert_log l
                where l.check_name='seo.cwv_regression'
                  and l.detail like tag||'%'
                  and l.checked_at > now() - interval '20 hours') then
      continue;
    end if;
    insert into ops.health_alert_log(check_name, severity, detail, age_hours)
    values ('seo.cwv_regression', 'warn', msg, null);
  end loop;

  if array_length(fired_pages,1) >= 2 then
    msg := format('같은 날 %s개 페이지가 동시에 LCP 회귀: %s — '
                  '개별 페이지 문제가 아니라 배포·DB 유지보수·인프라 차원의 공통 원인을 의심할 것',
                  array_length(fired_pages,1), array_to_string(fired_pages, ', '));
    if not exists (select 1 from ops.health_alert_log l
                    where l.check_name='seo.cwv_regression' and l.severity='critical'
                      and l.checked_at > now() - interval '20 hours') then
      insert into ops.health_alert_log(check_name, severity, detail, age_hours)
      values ('seo.cwv_regression', 'critical', msg, null);
      foreach em in array owner_emails loop
        insert into public.user_inbox_notifications(user_email, title, body, action_url)
        values (em, 'CWV 동시 회귀 감지', '[HEALTH] seo.cwv_regression — ' || msg, '/admin');
      end loop;
    end if;
  end if;

  return hits;
end
$function$;
