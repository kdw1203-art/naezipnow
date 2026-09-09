-- 979 — Web Vitals 를 "어느 화면의 값인지" 로 바로잡는다.
--
-- 무엇이 잘못돼 있었나 (2026-09-08 헤드리스 크롬 재현)
--   리포터(app/components/WebVitalsReporter.tsx)는 지표를 보낼 때의
--   location.pathname 을 그대로 실었다. CLS·INP 는 문서 수명 전체를 누적하고
--   페이지가 숨는 순간 확정되는데, 앱 라우터의 화면 이동은 새 문서를 여는 게
--   아니다. 그래서 한 방문에서 쌓인 값이 **마지막으로 머문 화면**의 것으로
--   기록됐다. 실제 재현:
--     홈(/)에서 CLS 0.0199 누적 → /map 이동 → 숨김
--     → 전송된 것: CLS 0.02 path=/map el=a.btn-primary…rise-in-3 (홈에만 있는 요소)
--
--   그 결과 public.web_vitals 의 화면별 집계가 통째로 어긋나 있었다.
--   2026-09-01~08 표본: /auctions CLS 1.374(n=1, 대상 #main-content),
--   /map 평균 0.544(n=6), / 최대 1.000. 이 표를 읽는 ops.cwv_page_check 가
--   소유자에게 보낸 "[HEALTH] seo.cwv_page — /map → CLS p75 …" 경보도 같은 값이다.
--
-- 무엇을 바꾸나
--   (1) public.web_vitals.scope 컬럼 추가 — 이 줄이 재는 단위.
--         'route' = 화면 하나 (새 리포터가 화면을 옮길 때마다 비워 보내는 값)
--         'doc'   = 문서(방문) 하나 — LCP·FCP·TTFB 와, 숨을 때 한 줄 남기는
--                   문서 전체 CLS·INP. 구글 CrUX 가 재는 단위와 같다.
--         NULL    = 2026-09-09 이전 옛 표본. **화면 귀속이 어긋나 있다.**
--   (2) ops.cwv_page_check — 화면별 경보는 scope 가 맞는 줄만 본다.
--       옛 표본(NULL)은 제외되므로, 새 표본이 p_min_n 만큼 쌓이기 전에는
--       경보가 조용하다. 틀린 값으로 소유자를 깨우지 않는 쪽이 맞다.
--   (3) public.capture_seo_field_perf_rum — 주간 사이트 전체 시계열은
--       'route' 줄을 뺀다. 화면 단위 줄을 섞으면 한 방문이 여러 줄이 되어
--       사이트가 좋아진 것도 아닌데 p75 가 내려앉는다(단위가 바뀐 것뿐).
--       옛 표본(NULL)과 'doc' 은 단위가 같아 선이 그대로 이어진다.
--
-- 가산만 · 재실행 안전 · GRANT 변경 없음(함수 본문만 교체).

alter table public.web_vitals add column if not exists scope text;

comment on column public.web_vitals.scope is
  '이 줄이 재는 단위 — route=화면 하나 / doc=문서(방문) 하나 / NULL=2026-09-09 이전 옛 표본(화면 귀속 어긋남, 979)';

-- ---------------------------------------------------------------------------
-- (2) 화면별 CWV 경보 — 화면 단위 CLS·INP + 문서 단위 LCP 만 본다
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
    insert into ops.cwv_page_snapshot(page, window_days, lcp_n, lcp_p75, inp_n, inp_p75, cls_n, cls_p75)
    values (r.page, p_window_days, r.lcp_n, r.lcp_p75, r.inp_n, r.inp_p75, r.cls_n, r.cls_p75);

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
-- (3) 주간 사이트 전체 시계열 — 단위를 문서 하나로 유지한다
-- ---------------------------------------------------------------------------
create or replace function public.capture_seo_field_perf_rum(p_weeks integer default 12)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
  cur_wk date := (date_trunc('week', (now() at time zone 'Asia/Seoul')))::date;
begin
  with base as (
    select
      (date_trunc('week', (created_at at time zone 'Asia/Seoul')))::date as wk,
      case
        when user_agent ~* '(Mobile|Android|iPhone|iPad|iPod|Windows Phone)' then 'PHONE'
        else 'DESKTOP'
      end as ff,
      metric, value, rating,
      (created_at at time zone 'Asia/Seoul')::date as d
    from public.web_vitals
    where created_at >= (date_trunc('week', (now() at time zone 'Asia/Seoul')) - (p_weeks || ' weeks')::interval)
      and metric in ('LCP','INP','FCP','TTFB','CLS')
      /* [979] 화면 단위 줄은 뺀다 — 한 방문이 여러 줄이 되어 단위가 바뀐다.
         옛 표본(scope IS NULL)과 문서 단위('doc')는 같은 단위라 선이 이어진다. */
      and scope is distinct from 'route'
  ),
  expanded as (
    select wk, ff, metric, value, rating, d from base
    union all
    select wk, 'ALL', metric, value, rating, d from base
  ),
  agg as (
    select
      wk, ff,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='LCP'))::int  as lcp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='INP'))::int  as inp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='FCP'))::int  as fcp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='TTFB'))::int as ttfb_p75,
      round((percentile_cont(0.75) within group (order by value) filter (where metric='CLS'))::numeric, 3) as cls_p75,
      count(*) filter (where metric='LCP') as lcp_n,
      count(*) filter (where metric='INP') as inp_n,
      count(*) filter (where metric='CLS') as cls_n,
      round(100.0 * count(*) filter (where metric='LCP' and rating='good')
            / nullif(count(*) filter (where metric='LCP'),0), 1) as lcp_good,
      round(100.0 * count(*) filter (where metric='INP' and rating='good')
            / nullif(count(*) filter (where metric='INP'),0), 1) as inp_good,
      round(100.0 * count(*) filter (where metric='CLS' and rating='good')
            / nullif(count(*) filter (where metric='CLS'),0), 1) as cls_good,
      min(d) as first_d, max(d) as last_d
    from expanded
    group by wk, ff
  )
  insert into public.seo_field_perf (
    collected_week, target, form_factor, status, error_detail,
    lcp_p75_ms, inp_p75_ms, fcp_p75_ms, ttfb_p75_ms, cls_p75,
    lcp_good_pct, inp_good_pct, cls_good_pct,
    period_first_date, period_last_date, observed_at
  )
  select
    a.wk, 'self:rum', a.ff,
    -- ★ 진행 중인 주는 완성주와 절대 같은 지위를 갖지 않는다
    case when a.wk >= cur_wk           then 'partial_week'
         when a.lcp_n >= 30            then 'ok'
         else 'insufficient_data' end,
    format('자체 RUM 표본 LCP=%s INP=%s CLS=%s%s', a.lcp_n, a.inp_n, a.cls_n,
           case when a.wk >= cur_wk then ' · 진행 중인 주(미완성) — 완성주와 비교 금지' else '' end),
    a.lcp_p75, a.inp_p75, a.fcp_p75, a.ttfb_p75, a.cls_p75,
    a.lcp_good, a.inp_good, a.cls_good,
    a.first_d, a.last_d, now()
  from agg a
  on conflict (collected_week, target, form_factor) do update set
    status            = excluded.status,
    error_detail      = excluded.error_detail,
    lcp_p75_ms        = excluded.lcp_p75_ms,
    inp_p75_ms        = excluded.inp_p75_ms,
    fcp_p75_ms        = excluded.fcp_p75_ms,
    ttfb_p75_ms       = excluded.ttfb_p75_ms,
    cls_p75           = excluded.cls_p75,
    lcp_good_pct      = excluded.lcp_good_pct,
    inp_good_pct      = excluded.inp_good_pct,
    cls_good_pct      = excluded.cls_good_pct,
    period_first_date = excluded.period_first_date,
    period_last_date  = excluded.period_last_date,
    observed_at       = excluded.observed_at;

  get diagnostics n = row_count;
  return n;
end;
$function$;
