-- [1201] anon 쓰기 권한 정리 — 전부 RLS on + 정책 0개(표) 또는 security_invoker 집계 뷰라 이미 거절되던 쓰기다.
-- 실제 동작은 그대로, 권한 표만 맞춘다(다층 방어). 운영 DB 2026-11-21 적용.
revoke insert, update, delete on table
  public.billing_subscriptions, public.economy_watches, public.group_poll_votes, public.group_polls, public.group_posts,
  public.group_schedule_attendees, public.group_schedules, public.note_comments, public.poi_schools, public.poi_stations,
  public.region_demand_requests, public.search_zero_results, public.social_uploads, public.widget_embed_hits,
  public.admin_acquisition_signups, public.complex_tx_stats, public.seoul_upis_gu_summary
from anon;
-- 관리자 집계 뷰는 anon 이 읽을 이유가 없다(security_invoker 라 지금도 0행).
revoke select on table public.admin_acquisition_signups from anon;
