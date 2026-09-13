-- [994] RUM 에서 "사람이 아닌" Linux 데스크톱 크롬을 걸러낸다 (2026-09-13)
--
-- 실측(최근 7일 LCP 표본 2,021건): 1,806건(89%)이 단일 UA
--   "Mozilla/5.0 (X11; Linux x86_64) … Chrome/150.0.0.0 Safari/537.36"
-- 에서 왔다. 555개 경로를 JS 까지 실행하며 순회했고(/login 475회·/qna 189회·/signup 164회),
-- LCP p75 12초 — 그래서 seo.cwv_page 경보가 매일 "단지 상세 8.2s · 분석 7.7s · 로그인 7.8s"
-- 를 critical 로 울렸다. 같은 기간 실제 사람(iPhone·갤럭시·Windows)의 LCP p75 는 0.7~2.6초다.
--
-- 새 헤드리스 크롬(112+)은 UA 에 "HeadlessChrome" 을 넣지 않는다 — 기존 정규식(headless)이
-- 못 잡은 이유. 한국 소비자 서비스에서 Linux X11 데스크톱 실사용자는 사실상 없으므로
-- (Android 는 "Linux; Android" 라 다르다) 모바일 표식 없는 X11 크롬을 통째로 버린다.
-- 2026-04-27 부터 쌓인 같은 UA 의 행 약 8,000건도 지운다 — 경보·대시보드가 사람 값만 보도록.
-- 텔레메트리(우리 표)이지 사용자 콘텐츠가 아니다.

create or replace function public.web_vitals_reject_bots()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.user_agent ~* '(bot|crawler|spider|externalagent|headless|python-requests|curl/|wget|scrapy|slurp|bingpreview|facebookexternalhit|lighthouse|naezipnow-e2e)'
     or (new.user_agent ~ '\(X11; Linux x86_64\)' and new.user_agent !~* '(android|mobile)')
     or new.path in ('/notes/new','/widget') then
    return null;   -- 조용히 버림. API 는 정상 응답, 행만 안 남음
  end if;
  return new;
end $function$;

delete from public.web_vitals
 where user_agent ~ '\(X11; Linux x86_64\)'
   and user_agent !~* '(android|mobile)';
