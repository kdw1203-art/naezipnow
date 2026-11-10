-- [1138] 기본 정보 필수화 — 직업 · 보유 주택 · 이용 목적 열 추가(값 목록은 lib/account/basic-info.ts 와 같다). 여러 번 돌려도 안전.
alter table public.user_basic_info add column if not exists job text;
alter table public.user_basic_info add column if not exists housing text;
alter table public.user_basic_info add column if not exists purpose text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_basic_info_job_chk') then
    alter table public.user_basic_info add constraint user_basic_info_job_chk
      check (job is null or job in ('직장인','공무원','자영업','전문직','프리랜서','주부','학생','은퇴','구직 중','기타'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_basic_info_housing_chk') then
    alter table public.user_basic_info add constraint user_basic_info_housing_chk
      check (housing is null or housing in ('무주택','1주택','2주택 이상'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_basic_info_purpose_chk') then
    alter table public.user_basic_info add constraint user_basic_info_purpose_chk
      check (purpose is null or purpose in ('실거주 매수','투자','전월세','정보 확인'));
  end if;
end $$;
