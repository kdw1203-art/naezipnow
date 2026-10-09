-- [1047 · 전문가 등록] 소유자 지시(2026-10-09): 세무사·회계사·설계(건축사)·시공사·감정평가사·공인중개사 등 개인·법인 등록,
-- 면허증·사업자등록증 첨부 → 관리자 승인만 등록, 인증 마크 표시. 변호사·법무사는 받지 않는다(토스 심사 약속 · 소유자 선택).
-- 1) expert-docs 버킷: 비공개 · 10MB · jpeg/png/webp/pdf. storage.objects 에 정책을 두지 않는다 — service_role 만 읽고 쓴다.
--    관리자는 심사 화면에서 5분짜리 서명 주소로만 연다.
-- 2) 신청서: 사업 형태(개인·개인사업자·법인) · 상호/법인명 · 첨부 파일 목록(경로·종류·이름·크기 — 주소는 저장하지 않는다).
-- 3) 공개 프로필: 사업 형태. 인증 배지 일괄 조회용 부분 인덱스(owner_email · 인증된 행만).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expert-docs', 'expert-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

alter table public.expert_verification_requests
  add column if not exists applicant_kind text,
  add column if not exists business_name text,
  add column if not exists document_files jsonb not null default '[]'::jsonb;

alter table public.expert_profiles
  add column if not exists business_form text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'expert_verification_requests_applicant_kind_chk') then
    alter table public.expert_verification_requests
      add constraint expert_verification_requests_applicant_kind_chk
      check (applicant_kind is null or applicant_kind in ('individual', 'sole', 'corporation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expert_verification_requests_document_files_chk') then
    alter table public.expert_verification_requests
      add constraint expert_verification_requests_document_files_chk
      check (jsonb_typeof(document_files) = 'array' and jsonb_array_length(document_files) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expert_profiles_business_form_chk') then
    alter table public.expert_profiles
      add constraint expert_profiles_business_form_chk
      check (business_form is null or business_form in ('individual', 'sole', 'corporation'));
  end if;
end
$do$;

create index if not exists expert_profiles_verified_owner_email_idx
  on public.expert_profiles (owner_email)
  where is_verified = true;

comment on column public.expert_verification_requests.document_files is
  '[1047] 첨부 서류 [{path, kind(license|business_reg|other), name, size, mime, uploadedAt}] — expert-docs 버킷 경로만. 주소는 저장하지 않는다.';
comment on column public.expert_profiles.business_form is
  '[1047] 사업 형태 individual(개인 · 자격 보유자) · sole(개인사업자) · corporation(법인)';