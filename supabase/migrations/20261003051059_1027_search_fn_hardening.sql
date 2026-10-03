-- [1027 · 제안 30] 검색 개편(1026d·e) 뒤 남은 보안 점검 경고 2건.
-- 1) market_agg.addr_dong — search_path 가 고정돼 있지 않았다(function_search_path_mutable).
--    본문은 pg_catalog 함수(regexp_split_to_array · btrim · regexp_replace)만 쓰므로 빈 경로로 고정한다.
--    결과는 달라지지 않는다(IMMUTABLE 그대로).
-- 2) public.search_complex_facets — 1026e 부터 앱이 부르지 않는다(search_next_words 로 바뀜). SECURITY DEFINER 인데
--    로그인 없이(anon)도 실행할 수 있게 남아 있었다. 실행 권한을 거둔다(함수는 남긴다 — service_role 만 실행).
-- 롤백: alter function market_agg.addr_dong(text) reset search_path;
--       grant execute on function public.search_complex_facets(text[], text, text[], int) to anon, authenticated;
alter function market_agg.addr_dong(text) set search_path = '';
revoke execute on function public.search_complex_facets(text[], text, text[], int) from anon, authenticated;