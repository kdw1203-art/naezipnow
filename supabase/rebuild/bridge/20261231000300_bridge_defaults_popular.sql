-- [새 프로젝트 보충 6] ① 지도 인기 단지 RPC 를 코드가 부르는 모양(필터 8개 포함 13인자 · 값 열 4개)으로 ② 코드가 넣지 않는 필수 열의 기본값 ③ 배열로 읽는 jsonb 열의 기본값
drop function if exists public.popular_complexes(double precision, double precision, double precision, double precision, integer);
create or replace function public.popular_complexes(
  p_min_lat double precision default null, p_max_lat double precision default null, p_min_lng double precision default null, p_max_lng double precision default null,
  p_limit integer default 20, p_price_min bigint default null, p_price_max bigint default null, p_area_min numeric default null, p_area_max numeric default null,
  p_year_min integer default null, p_year_max integer default null, p_hh_min integer default null, p_hh_max integer default null)
returns table (complex_id text, region_name text, complex_name text, lat double precision, lng double precision, trade_count bigint, recent_trade_count bigint, view_count bigint, score numeric,
               avg_price_manwon numeric, avg_area_m2 numeric, build_year integer, households integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select public.complex_id(g.region_name, g.complex_name), g.region_name, g.complex_name, g.lat::double precision, g.lng::double precision,
         coalesce(s.trade_count, 0)::bigint, coalesce(s.recent_trade_count, 0)::bigint, coalesce(e.view_count, 0)::bigint,
         (coalesce(s.recent_trade_count, 0) * 1.0 + coalesce(e.view_count, 0) * 0.3)::numeric,
         s.avg_price_manwon::numeric, s.avg_area_m2::numeric, s.build_year::integer, s.households::integer
  from public.complex_geocode g
  join public.complex_tx_stats s on s.region_name = g.region_name and s.complex_name = g.complex_name
  left join public.complex_engagement e on e.complex_id = public.complex_id(g.region_name, g.complex_name)
  where g.status = 'ok' and g.lat is not null and g.lng is not null
    and (p_min_lat is null or g.lat between p_min_lat and p_max_lat)
    and (p_min_lng is null or g.lng between p_min_lng and p_max_lng)
    and (p_price_min is null or s.avg_price_manwon >= p_price_min) and (p_price_max is null or s.avg_price_manwon <= p_price_max)
    and (p_area_min is null or s.avg_area_m2 >= p_area_min) and (p_area_max is null or s.avg_area_m2 <= p_area_max)
    and (p_year_min is null or s.build_year >= p_year_min) and (p_year_max is null or s.build_year <= p_year_max)
    and (p_hh_min is null or s.households >= p_hh_min) and (p_hh_max is null or s.households <= p_hh_max)
  order by 9 desc, s.trade_count desc, g.complex_name
  limit greatest(1, least(50, coalesce(p_limit, 20)));
$$;
revoke all on function public.popular_complexes(double precision, double precision, double precision, double precision, integer, bigint, bigint, numeric, numeric, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.popular_complexes(double precision, double precision, double precision, double precision, integer, bigint, bigint, numeric, numeric, integer, integer, integer, integer) to service_role;
-- ② 필수 열 기본값(가입 · 노트 저장 · 모임 참여 · 제휴 문의가 이 열을 넣지 않는다)
alter table public.app_users alter column plan set default 'free';
alter table public.app_users alter column role set default 'user';
alter table public.group_members alter column status set default 'joined';
alter table public.inspection_ai_jobs alter column status set default 'pending';
alter table public.inspection_notes alter column author_type set default 'user';
alter table public.inspection_notes alter column intent set default '';
alter table public.inspection_notes alter column persona set default '';
alter table public.inspection_notes alter column status set default 'draft';
alter table public.inspection_sessions alter column status set default 'active';
alter table public.owner_verifications alter column admin_note set default '';
alter table public.partnership_inquiries alter column status set default 'new';
alter table public.user_consents alter column terms_version set default '';
alter table public.user_consents alter column privacy_version set default '';
-- ③ 배열로 읽는 jsonb 열 — 기준 구조 생성기가 전부 '{}' 로 두었다
do $$ declare r record; begin
  for r in select * from (values ('board_posts','ai_keywords'),('board_posts','tags'),('etl_runs','error_log'),('expert_verification_requests','fraud_flags'),
    ('inspection_ai_reports','evidence_items'),('inspection_ai_reports','follow_ups'),('inspection_ai_reports','keywords'),('inspection_ai_reports','risks'),('inspection_ai_reports','strengths'),
    ('inspection_note_photos','tags'),('inspection_notes','check_items'),('inspection_notes','checklist'),('inspection_notes','sections'),('inspection_notes','tags'),
    ('inspection_schedules','checklist'),('map_related_experts','tags'),('map_metric_refresh_runs','error_log'),('note_embeddings','check_items'),('note_templates','sections'),
    ('owner_verifications','document_paths'),('posts','comments'),('profiles','interest_tags'),('user_preferences','priorities')) v(t, c) loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name=r.c and data_type='jsonb') then
      execute format('alter table public.%I alter column %I set default ''[]''::jsonb', r.t, r.c);
    end if;
  end loop;
end $$;
-- ④ 프로필 행 — 코드는 profiles 를 읽고 고치기만 한다(만드는 곳이 없다 · 운영에서는 DB 트리거가 만들었다). 가입(app_users) 때 한 줄 만든다(추정 구현).
do $$ declare r record; begin
  for r in select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and is_nullable='NO' and column_default is null and data_type='text' loop
    execute format('alter table public.profiles alter column %I set default %L', r.column_name, case r.column_name when 'role' then 'user' when 'verification_status' then 'none' else '' end);
  end loop;
end $$;
create or replace function public.sync_profile_from_app_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name) values (new.id, lower(new.email), coalesce(new.name, ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.sync_profile_from_app_user() from public, anon, authenticated;
drop trigger if exists app_users_sync_profile on public.app_users;
create trigger app_users_sync_profile after insert on public.app_users for each row execute function public.sync_profile_from_app_user();
