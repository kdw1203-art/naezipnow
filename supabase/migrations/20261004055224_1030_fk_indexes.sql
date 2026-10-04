-- [1030 · G7] 외래키 인덱스 2개 — Supabase 성능 advisor(unindexed_foreign_keys, 2026-10-04) 가 짚은 둘.
-- note_comments.parent_id → note_comments(id) on delete cascade: 댓글 삭제 때 자식 댓글을 찾는 조인이 전체 스캔이었다.
-- subscription_events.subscription_id → billing_subscriptions(id): 구독 이벤트 목록이 구독 id 로 걸러질 때 전체 스캔이었다.
-- 표가 작아(각 수백 행 이하) 일반 create index 로 충분하다(concurrently 는 트랜잭션 밖에서만 가능). 롤백: 인덱스 두 개 제거.
create index if not exists note_comments_parent_id_idx on public.note_comments (parent_id);
create index if not exists subscription_events_subscription_id_idx on public.subscription_events (subscription_id);