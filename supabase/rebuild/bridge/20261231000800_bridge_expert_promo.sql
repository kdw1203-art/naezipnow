-- [1144] 전문가 홍보 — 홍보 한 줄 · 설명 · 켬/끔. 무료 100일은 created_at(승인 때 프로필 생성) 기준이라 열이 따로 없다. 여러 번 돌려도 안전.
alter table public.expert_profiles add column if not exists promo_headline text;
alter table public.expert_profiles add column if not exists promo_body text;
alter table public.expert_profiles add column if not exists promo_on boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expert_profiles_promo_len_chk') then
    alter table public.expert_profiles add constraint expert_profiles_promo_len_chk
      check ((promo_headline is null or char_length(promo_headline) <= 28) and (promo_body is null or char_length(promo_body) <= 80));
  end if;
end $$;
