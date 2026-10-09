-- [1046 · 성장] 1년 1만 회원 계획 — 가입 경로 기록 + 매주 볼 숫자.
-- 1) signup_attribution: 가입 한 건에 첫 착지(유입 호스트 · UTM · 첫 화면)를 한 번 붙인다. 키는 소문자 이메일.
--    service_role 전용(RLS 켜고 정책 없음). 회원 탈퇴 파기 대상(docs/ops/privacy-requests.md).
-- 2) link_signup_attribution: 로그인한 사람의 방문자 키로 위 행을 만든다. 가입 14일 안의 계정만, 첫 기록이 정본.
-- 3) admin_growth_weekly · admin_signup_channels: 관리자 트래픽 화면의 '성장 주간표'. 관리자 방문·계정은 뺀다.
create table if not exists public.signup_attribution (
  user_email text primary key,
  visitor_key text,
  first_seen_at timestamptz,
  landing_route text,
  landing_path text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  signup_via text,
  signed_up_at timestamptz,
  linked_at timestamptz not null default now()
);

alter table public.signup_attribution enable row level security;
revoke all on table public.signup_attribution from public, anon, authenticated;
grant select, insert, update, delete on table public.signup_attribution to service_role;

comment on table public.signup_attribution is
  '[1046] 가입 경로(첫 착지) — 가입 14일 안에 한 번 붙는다. service_role 전용. 회원 탈퇴 시 파기 대상.';

create or replace function public.link_signup_attribution(
  p_email text,
  p_visitor_key text,
  p_max_age_days integer default 14
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_signed timestamptz;
  v_via text;
  v_at timestamptz;
  v_route text;
  v_path text;
  v_ref text;
  v_us text;
  v_um text;
  v_uc text;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return 'bad_email';
  end if;
  if p_visitor_key is null or p_visitor_key !~ '^[a-f0-9]{16,64}$' then
    return 'bad_key';
  end if;
  if exists (select 1 from public.signup_attribution s where s.user_email = v_email) then
    return 'exists';
  end if;

  select min(t.created_at) into v_signed
  from (
    select u.created_at from auth.users u where lower(u.email) = v_email
    union all
    select a.created_at from public.app_users a where lower(a.email) = v_email
  ) t;
  if v_signed is null then
    return 'no_user';
  end if;
  if v_signed < now() - make_interval(days => greatest(coalesce(p_max_age_days, 14), 1)) then
    return 'too_old';
  end if;

  select nullif(concat_ws(':', nullif(u.raw_user_meta_data ->> 'source', ''), nullif(u.raw_user_meta_data ->> 'campaign', '')), '')
    into v_via
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at
  limit 1;
  if v_via is null then
    select nullif(concat_ws(':', nullif(a.signup_source, ''), nullif(a.signup_campaign, '')), '')
      into v_via
    from public.app_users a
    where lower(a.email) = v_email
    limit 1;
  end if;

  select e.occurred_at, e.route, e.path, e.referrer_host, e.utm_source, e.utm_medium, e.utm_campaign
    into v_at, v_route, v_path, v_ref, v_us, v_um, v_uc
  from public.page_view_events e
  where e.visitor_key = p_visitor_key
  order by (not coalesce(e.is_landing, false)), e.occurred_at
  limit 1;

  insert into public.signup_attribution (
    user_email, visitor_key, first_seen_at, landing_route, landing_path,
    referrer_host, utm_source, utm_medium, utm_campaign, signup_via, signed_up_at
  )
  values (v_email, p_visitor_key, v_at, v_route, v_path, v_ref, v_us, v_um, v_uc, v_via, v_signed)
  on conflict (user_email) do nothing;

  return case when v_at is null then 'linked_no_events' else 'linked' end;
end;
$fn$;

revoke all on function public.link_signup_attribution(text, text, integer) from public, anon, authenticated;
grant execute on function public.link_signup_attribution(text, text, integer) to service_role;

create or replace function public.admin_growth_weekly(
  p_weeks integer default 8,
  p_exclude_emails text[] default '{}'::text[]
)
returns table (
  week_start date,
  visitors integer,
  sessions integer,
  search_landings integer,
  signups integer,
  new_watchers integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with wk as (
    select (date_trunc('week', now() at time zone 'Asia/Seoul') - make_interval(weeks => g))::date as week_start
    from generate_series(0, greatest(least(coalesce(p_weeks, 8), 52), 1) - 1) as g
  ),
  adm as (
    select distinct v.visitor_key
    from public.page_view_events v
    where v.route like '/admin%' and v.visitor_key is not null
  ),
  ev as (
    select (date_trunc('week', e.occurred_at at time zone 'Asia/Seoul'))::date as week_start,
           coalesce(e.visitor_key, e.session_key) as vk,
           e.session_key,
           e.is_landing,
           e.referrer_host
    from public.page_view_events e
    where e.occurred_at >= ((select min(w.week_start) from wk w)::timestamp at time zone 'Asia/Seoul')
      and e.route not like '/admin%'
      and (e.visitor_key is null or e.visitor_key not in (select a.visitor_key from adm a))
  ),
  ex as (
    select lower(trim(x)) as email
    from unnest(coalesce(p_exclude_emails, '{}'::text[])) as x
    where x is not null and trim(x) <> ''
    union
    select lower(a.email) from public.app_users a where a.email is not null and coalesce(a.role, 'user') <> 'user'
  ),
  people as (
    select lower(t.email) as email, min(t.created_at) as created_at
    from (
      select u.email, u.created_at from auth.users u where u.email is not null
      union all
      select a.email, a.created_at from public.app_users a where a.email is not null
    ) t
    group by lower(t.email)
  ),
  su as (
    select (date_trunc('week', p.created_at at time zone 'Asia/Seoul'))::date as week_start, count(*)::integer as n
    from people p
    where p.email not in (select x.email from ex x)
    group by 1
  ),
  wl as (
    select (date_trunc('week', f.first_at at time zone 'Asia/Seoul'))::date as week_start, count(*)::integer as n
    from (
      select lower(w.user_email) as email, min(w.created_at) as first_at
      from public.user_watchlist w
      where w.user_email is not null
      group by 1
    ) f
    where f.email not in (select x.email from ex x)
    group by 1
  )
  select wk.week_start,
         coalesce((select count(distinct ev.vk) from ev where ev.week_start = wk.week_start), 0)::integer as visitors,
         coalesce((select count(distinct ev.session_key) from ev where ev.week_start = wk.week_start), 0)::integer as sessions,
         coalesce((select count(*) from ev
                   where ev.week_start = wk.week_start
                     and ev.is_landing
                     and ev.referrer_host ~* '(^|\.)google\.|^(m\.)?search\.naver\.com$|(^|\.)search\.daum\.net$|(^|\.)bing\.com$'), 0)::integer as search_landings,
         coalesce((select su.n from su where su.week_start = wk.week_start), 0)::integer as signups,
         coalesce((select wl.n from wl where wl.week_start = wk.week_start), 0)::integer as new_watchers
  from wk
  order by wk.week_start desc;
$fn$;

revoke all on function public.admin_growth_weekly(integer, text[]) from public, anon, authenticated;
grant execute on function public.admin_growth_weekly(integer, text[]) to service_role;

create or replace function public.admin_signup_channels(
  p_since timestamptz,
  p_exclude_emails text[] default '{}'::text[]
)
returns table (
  utm_source text,
  referrer_host text,
  attributed boolean,
  signups integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with ex as (
    select lower(trim(x)) as email
    from unnest(coalesce(p_exclude_emails, '{}'::text[])) as x
    where x is not null and trim(x) <> ''
    union
    select lower(a.email) from public.app_users a where a.email is not null and coalesce(a.role, 'user') <> 'user'
  ),
  people as (
    select lower(t.email) as email, min(t.created_at) as created_at
    from (
      select u.email, u.created_at from auth.users u where u.email is not null
      union all
      select a.email, a.created_at from public.app_users a where a.email is not null
    ) t
    group by lower(t.email)
  )
  select s.utm_source, s.referrer_host, (s.user_email is not null) as attributed, count(*)::integer as signups
  from people p
  left join public.signup_attribution s on s.user_email = p.email
  where p.created_at >= p_since
    and p.email not in (select x.email from ex x)
  group by 1, 2, 3
  order by 4 desc;
$fn$;

revoke all on function public.admin_signup_channels(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.admin_signup_channels(timestamptz, text[]) to service_role;