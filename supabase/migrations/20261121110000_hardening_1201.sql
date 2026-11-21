-- [1201] Supabase 보안·성능 어드바이저 후속 — 동작 변화 없음 (운영 DB 2026-11-21 적용)
-- 1) tx_band_* 뷰: SECURITY DEFINER → security_invoker. 아래 MV 에 anon·authenticated SELECT 가 이미 있어 결과가 같다.
--    (map_price_point_source · complex_sitemap_source 는 MV 가 service_role 전용이라 바꾸면 anon 조회가 끊긴다 — 보류, docs/release-1201.md)
alter view public.tx_band_landing_source set (security_invoker = on);
alter view public.tx_band_complex_source set (security_invoker = on);
-- 2) search_path 고정
alter function public.record_experiment_exposure(text, text, text, text) set search_path = public, pg_temp;
-- 3) 자주 조인하는 외래키 인덱스
create index if not exists inspection_notes_user_id_idx on public.inspection_notes(user_id);
create index if not exists user_subscriptions_user_id_idx on public.user_subscriptions(user_id);
create index if not exists payment_orders_user_id_idx on public.payment_orders(user_id);
create index if not exists chat_messages_room_id_idx on public.chat_messages(room_id);
create index if not exists board_comments_post_id_idx on public.board_comments(post_id);
create index if not exists inspection_note_photos_note_id_idx on public.inspection_note_photos(note_id);
create index if not exists expert_profiles_user_id_idx on public.expert_profiles(user_id);
