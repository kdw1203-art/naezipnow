-- [999 · 원장 미러] ops.seo_asset_check — 2026-09-13 22:33 UTC 개선작업 루틴이 원장 없이 바꾼 현재 정의를
-- 그대로 다시 적용해 원장·저장소에 남긴다(create or replace 라 결과는 동일. 적용 전 md5 eae44c6d…,
-- 적용 후 같은 값이면 이 파일이 곧 운영 정의다).
--
-- 바뀐 내용(루틴 주석 그대로): 배포 994 가 sitemap-experts / sitemap-qna 를 의도적으로 내렸는데 프로브 목록은
-- "관측 이래 전체"라 404 를 critical 로 계속 울렸다. robots.txt 선언에도 없고 sitemap.xml 인덱스에도 없는
-- 사이트맵 자산은 평가하지 않는다 — 최근 72시간 안에 200 이었던 경우에만 전환 1회 warn.
--
-- 되돌리기: 20260910224317 ops_seo_asset_check_exclude_reserved_complex_routes_20260911 의 정의로 create or replace.

CREATE OR REPLACE FUNCTION ops.seo_asset_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'public', 'pg_catalog'
AS $function$
declare
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  em text; a record; hits int := 0; sev text; msg text; prev_loc int;
  lm_ts timestamptz; lm_age numeric; lm_monthly boolean; lm_cadence text;
  lm_warn numeric; lm_crit numeric;
  indexed text[]; rdecl text[]; missing text[]; canon_host text;
begin
  select coalesce((select array(select jsonb_array_elements_text(p.page_flags->'children'))
                     from ops.seo_asset_probe p
                    where p.url like '%/sitemap.xml' and p.page_flags ? 'children'
                    order by p.probed_at desc limit 1), '{}') into indexed;

  select coalesce((select array(select jsonb_array_elements_text(p.page_flags->'sitemaps'))
                     from ops.seo_asset_probe p
                    where p.url like '%/robots.txt' and p.page_flags ? 'sitemaps'
                      and p.url not like 'https://nuguzip.com/%'
                    order by p.probed_at desc limit 1), '{}') into rdecl;

  select (select p.page_flags->>'host'
            from ops.seo_asset_probe p
           where p.url like '%/robots.txt'
             and p.url not like 'https://nuguzip.com/%'
             and p.page_flags ? 'host'
           order by p.probed_at desc limit 1) into canon_host;

  for a in
    select distinct on (url) url, probed_at, http_status, bytes, loc_count, lastmod_max, page_flags
    from ops.seo_asset_probe
    where probed_at > now() - interval '50 hours'
    order by url, probed_at desc
  loop
    sev := null;

    -- 폐기 호스트 잔여 대상은 평가하지 않는다(구 도메인 robots 는 이전 신호 감시용으로 예외).
    if canon_host is not null
       and a.url not like canon_host || '/%'
       and a.url <> 'https://nuguzip.com/robots.txt' then
      continue;
    end if;

    /* [2026-09-14 신설] 폐기된 사이트맵 자산 = 유령 경보의 원천.
       배포 994 가 sitemap-experts / sitemap-qna 를 의도적으로 내렸는데(둘 다 loc 1건짜리 빈 사이트맵),
       프로브 목록은 "관측 이래 전체"라 404 를 critical 로 계속 울렸다.
       robots.txt 선언에도 없고 sitemap.xml 인덱스에도 없으면 크롤러에게 더는 노출되지 않는 자산이다.
       다만 조용히 지나가면 "사라진 것을 알아채지 못하는" 반대편 사각지대가 생기므로,
       최근 72시간 안에 200 이었던 경우에 한해 전환 1회만 warn 으로 남기고 이후 침묵한다. */
    if a.url like '%sitemap-%'
       and array_length(rdecl,1) is not null
       and not (a.url = any(rdecl))
       and not (a.url = any(indexed)) then
      if exists (select 1 from ops.seo_asset_probe q
                  where q.url = a.url and q.http_status = 200
                    and q.probed_at > now() - interval '72 hours') then
        insert into ops.health_alert_log(check_name, severity, detail, age_hours)
        values ('seo.asset', 'warn',
                format('%s → 폐기 감지: robots.txt 선언과 sitemap.xml 인덱스 양쪽에서 빠졌다(현재 HTTP %s). '
                       '의도한 정리면 조치 불필요 — 프로브 목록에서도 자동으로 조용해진다. '
                       '의도하지 않았다면 색인 경로가 통째로 사라진 것이므로 즉시 복구할 것',
                       a.url, coalesce(a.http_status::text,'무응답')), 0);
        hits := hits + 1;
      end if;
      continue;
    end if;

    if a.http_status is null or a.http_status >= 500 then
      sev := 'critical'; msg := format('%s → 응답 없음/5xx (%s)', a.url, coalesce(a.http_status::text,'무응답'));
    elsif a.http_status >= 400 then
      sev := 'critical'; msg := format('%s → HTTP %s — 색인 경로 차단', a.url, a.http_status);
    elsif coalesce(a.bytes,0) = 0 then
      sev := 'critical'; msg := format('%s → 200 이지만 본문 0바이트', a.url);

    -- [2026-09-04 신설] 구 도메인 이전 신호 감시.
    elsif a.url like 'https://nuguzip.com/robots.txt' then
      if coalesce(a.page_flags->>'host','') <> 'https://naezipnow.com' then
        sev := 'critical';
        msg := format('구 도메인 nuguzip.com 의 robots Host 가 %s — naezipnow.com 으로의 이전 신호가 끊겼다. 기존 색인·백링크 자산 유실 위험',
                      coalesce(nullif(a.page_flags->>'host',''),'(없음)'));
      end if;

    elsif a.url like '%sitemap%' then
      select loc_count into prev_loc
        from ops.seo_asset_probe
       where url = a.url and probed_at < a.probed_at and loc_count is not null
       order by probed_at desc limit 1;

      lm_ts := null;
      begin
        if a.lastmod_max is not null then lm_ts := a.lastmod_max::timestamptz; end if;
      exception when others then lm_ts := null;
      end;
      lm_age := case when lm_ts is null then null
                     else round((extract(epoch from (now() - lm_ts))/3600.0)::numeric, 1) end;

      -- [2026-09-07 신설] 갱신 주기를 lastmod 값의 모양에서 파생한다.
      -- 값이 정확히 월 경계(1일 00:00 UTC)면 그 사이트맵은 월 주기로만 움직이는 자산이다.
      lm_monthly := lm_ts is not null
                    and (lm_ts at time zone 'UTC') = date_trunc('month', lm_ts at time zone 'UTC');
      lm_cadence := case when lm_monthly then '월 주기 자산' else '일 주기 자산' end;
      lm_warn := case when lm_monthly then 1080 else 48  end;   -- 45일 / 2일
      lm_crit := case when lm_monthly then 1800 else 120 end;   -- 75일 / 5일

      if a.url like '%/sitemap.xml' and a.page_flags ? 'children'
         and jsonb_array_length(a.page_flags->'children') = 0 then
        sev := 'critical';
        msg := format('%s → sitemapindex 하위 목록 0건 — 프로브 대상이 붕괴했다. 하위 사이트맵 전종이 무감시 상태가 된다', a.url);
      elsif coalesce(a.loc_count,0) = 0 then
        if not (a.url = any(indexed)) then
          sev := 'warn';
          msg := format('%s → URL 0건 · robots.txt 는 선언했지만 sitemap.xml 인덱스에는 없다 — 빈 사이트맵을 크롤러에 제출 중', a.url);
        else
          sev := 'critical'; msg := format('%s → URL 0건 — 사이트맵이 비었다', a.url);
        end if;
      elsif prev_loc is not null and prev_loc >= 20 and a.loc_count <= prev_loc * 0.7 then
        sev := 'critical'; msg := format('%s → URL %s건 (직전 %s건, %s%% 급감) — 대량 색인 이탈',
                                     a.url, a.loc_count, prev_loc,
                                     round((1 - a.loc_count::numeric/prev_loc)*100));
      elsif prev_loc is not null and prev_loc >= 20 and a.loc_count <= prev_loc * 0.9 then
        sev := 'warn'; msg := format('%s → URL %s건 (직전 %s건, %s%% 감소)',
                                     a.url, a.loc_count, prev_loc,
                                     round((1 - a.loc_count::numeric/prev_loc)*100));
      elsif prev_loc is not null and prev_loc between 5 and 19 and a.loc_count <= prev_loc - 2 then
        sev := 'warn'; msg := format('%s → URL %s건 (직전 %s건, -%s건) — 소형 사이트맵 축소',
                                     a.url, a.loc_count, prev_loc, prev_loc - a.loc_count);
      elsif lm_age is not null and lm_age > lm_crit then
        sev := 'critical';
        msg := format('%s → lastmod 최신값이 %s일 전(%s · %s) — 갱신 주기 두 배를 넘겼다. 크롤러 재방문 신호 정지',
                      a.url, round(lm_age/24.0,1),
                      to_char(lm_ts at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'), lm_cadence);
      elsif lm_age is not null and lm_age > lm_warn then
        sev := 'warn';
        msg := format('%s → lastmod 최신값이 %s일 전(%s · %s) — 갱신 신호 정체(ETL 정지/생성기 고정 여부 확인)',
                      a.url, round(lm_age/24.0,1),
                      to_char(lm_ts at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'), lm_cadence);
      end if;

    -- [2026-09-07 신설] 사이트맵에 제출한 정적 페이지의 색인성 감시.
    -- 색인성 검사 대상이 단지 상세 1건뿐이라 sitemap-pages.xml 215건이 통째로 사각지대였다.
    -- 심각도는 warn 고정: 페이지 단위 결함이며 critical(사이트 전체 장애) 채널을 흐리면 안 된다.
    elsif a.page_flags ? 'page_probe' and a.probed_at > now() - interval '48 hours' then
      if coalesce((a.page_flags->>'noindex')::boolean, false) then
        sev := 'warn';
        msg := format('%s → 사이트맵에 제출했는데 noindex — 크롤 예산 낭비 + Search Console "제출된 URL이 noindex" 오류', a.url);
      elsif not coalesce((a.page_flags->>'canonical')::boolean, false) then
        sev := 'warn';
        msg := format('%s → canonical 누락(사이트맵 제출 페이지) — 파라미터·슬래시 변형 URL 로 색인 분산', a.url);
      elsif not coalesce((a.page_flags->>'has_title')::boolean, false)
         or not coalesce((a.page_flags->>'has_desc')::boolean, false) then
        sev := 'warn';
        msg := format('%s → title/description 누락 — 검색 스니펫 생성 불가', a.url);
      end if;

    elsif a.url like '%/complex/%' and a.probed_at > now() - interval '48 hours'
      /* [2026-09-11] /complex/ 아래 예약 정적 경로는 단지 상세 템플릿이 아니다.
         자기참조 canonical 이 정답인데 "한글 슬러그가 아니다"라는 이유로 오탐이 났다. */
      and split_part(split_part(a.url, '/complex/', 2), '?', 1)
          not in ('browse','compare','new','search','map','list') then
      if a.page_flags is null then
        sev := 'warn';
        msg := format('%s → 색인성 신호를 읽지 못함(page_flags 없음) — 수집기 확인 필요', a.url);
      elsif coalesce((a.page_flags->>'noindex')::boolean, false) then
        sev := 'critical';
        msg := format('%s → noindex 발견 — 단지 상세 템플릿 전체(약 2.6만 페이지)가 색인에서 빠진다', a.url);
      elsif not coalesce((a.page_flags->>'canonical')::boolean, false) then
        sev := 'critical';
        msg := format('%s → canonical 누락 — 중복 URL 로 색인 분산', a.url);
      elsif a.page_flags ? 'canonical_has_id'
        and not coalesce((a.page_flags->>'canonical_has_id')::boolean, false) then
        sev := 'critical';
        msg := format('%s → canonical 이 다른 페이지를 가리킨다(%s) — 단지 상세 전체가 엉뚱한 URL 로 통합된다',
                      a.url, left(coalesce(a.page_flags->>'canonical_href','(없음)'), 120));
      elsif a.page_flags ? 'canonical_is_slug'
        and not coalesce((a.page_flags->>'canonical_is_slug')::boolean, false) then
        sev := 'warn';
        msg := format('%s → canonical 이 구 base64 URL 형식(%s) — 사이트맵 제출 URL(한글 슬러그)과 불일치, 색인 분산',
                      a.url, left(coalesce(a.page_flags->>'canonical_href','(없음)'), 120));
      elsif not coalesce((a.page_flags->>'has_title')::boolean, false)
         or not coalesce((a.page_flags->>'has_desc')::boolean, false) then
        sev := 'critical';
        msg := format('%s → title/description 누락 — 검색 스니펫 생성 불가', a.url);
      elsif not coalesce((a.page_flags->>'ld_complex')::boolean, false) then
        sev := 'warn';
        msg := format('%s → ApartmentComplex JSON-LD 소실 — 리치결과·AI 인용 확률 하락', a.url);
      elsif not coalesce((a.page_flags->>'ld_faq')::boolean, false)
         or not coalesce((a.page_flags->>'ld_crumb')::boolean, false) then
        sev := 'warn';
        msg := format('%s → FAQPage/BreadcrumbList JSON-LD 일부 소실', a.url);
      end if;
    end if;

    if sev is not null then
      insert into ops.health_alert_log(check_name, severity, detail, age_hours)
      values ('seo.asset', sev, msg, round((extract(epoch from (now()-a.probed_at))/3600.0)::numeric,1));
      hits := hits + 1;
      if sev = 'critical' and not exists (
        select 1 from public.user_inbox_notifications
        where body like '[HEALTH] seo.asset%' || a.url || '%' and created_at > now() - interval '20 hours'
      ) then
        foreach em in array owner_emails loop
          insert into public.user_inbox_notifications(user_email, title, body, action_url)
          values (em, 'SEO 색인 경로 이상', '[HEALTH] seo.asset — ' || msg, '/admin/ops');
        end loop;
      end if;
    end if;
  end loop;

  -- [2026-09-04 신설] robots.txt 선언 ↔ sitemap.xml 인덱스 정합성.
  if array_length(rdecl,1) is not null and array_length(indexed,1) is not null then
    select array(select u from unnest(rdecl) u
                  where u not like '%/sitemap.xml' and not (u = any(indexed)))
      into missing;
    if array_length(missing,1) > 0 then
      insert into ops.health_alert_log(check_name, severity, detail, age_hours)
      values ('seo.asset', 'warn',
              format('robots.txt 가 선언한 사이트맵 %s종이 sitemap.xml 인덱스에 없다: %s — 크롤러 발견 경로가 robots 한쪽뿐',
                     array_length(missing,1), array_to_string(missing, ' , ')),
              0);
      hits := hits + 1;
    end if;
  end if;

  return hits;
end;
$function$;
