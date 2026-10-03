-- [1027 · 제안 30 후속] 20261003051059 의 회수 문장에 public 이 빠져 있었다.
-- 운영 DB 는 이미 닫혀 있다(proacl = postgres·service_role 만 — anon·authenticated 는 PUBLIC 을 거치지 않고
-- 개별로 받은 권한이었고, 그 회수가 실제로 들었다). 다만 처음부터 다시 만드는 DB 에서는 함수 생성 때
-- PUBLIC 에 기본으로 주는 EXECUTE 가 남으므로, 최종 상태를 문장으로 못박는다.
-- 운영에서는 아무것도 바뀌지 않는다(같은 상태를 다시 적는 문장).
-- 롤백: 20261003051059 의 롤백 안내를 따른다.
revoke all on function public.search_complex_facets(text[], text, text[], int) from public, anon, authenticated;
grant execute on function public.search_complex_facets(text[], text, text[], int) to service_role;