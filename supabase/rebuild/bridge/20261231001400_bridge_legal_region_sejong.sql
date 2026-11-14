-- [1177] 세종특별자치시(36110)가 지역 표에 없어 세종 실거래가 한 건도 저장되지 않았다.
-- market_transactions.region_code 는 legal_regions(lawd_cd)를 참조한다 — 표에 없는 코드는 저장이 거절된다
-- (적재 기록 2026-11-13 · 11-14: "36110: ... violates foreign key constraint ... (0/1634행 저장)").
-- 다른 시군구 행과 같은 모양으로 한 줄 넣는다. 여러 번 실행해도 같다.
insert into public.legal_regions (lawd_cd, sido, sigungu, display_name, scope, enabled, priority, metadata)
values ('36110', '세종', '세종시', '세종 세종시', 'nationwide', false, 0, '{}'::jsonb)
on conflict (lawd_cd) do nothing;
