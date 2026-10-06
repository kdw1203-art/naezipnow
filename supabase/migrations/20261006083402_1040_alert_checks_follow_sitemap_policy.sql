-- [1040 · 운영 경보] 점검 두 개를 앱의 사이트맵 기준에 맞춘다.
--
-- 1) ops.thin_content_check — "제출된 단지"를 실제 사이트맵으로 센다.
--    예전: market_agg.complex_sitemap_mv 전체(전 기간 매매 1건 이상)를 "제출된 단지"로 셌다.
--    1040 부터 앱은 전 기간 3건 이상 + 최근 12개월(당월 포함 12칸)에 거래가 있는 단지만 사이트맵에 싣는다
--    (lib/seo/complex-index-policy.ts). 매트뷰는 그대로다 — 줄어드는 것은 사이트맵이다.
--    사이트맵 명부(ops.sitemap_url_roster · /sitemap-complexes.xml 활성 건수)가 앱 기준으로 고른 건수와 맞으면(±3%)
--    그 기준의 단지만 모집단으로 센다. 아직 전부 싣는 배포(명부 = 매트뷰 전체)면 예전 그대로 센다 —
--    배포 전에 경보가 먼저 "회복"이라고 말하지 않는다.
--    실측(2026-10-06): 매트뷰 32,414 · 앱 기준 22,553 · 그 안에서 최근 12개월 3건 미만 1,809(8.0% — 임계 20% 아래).
--
-- 2) ops.sitemap_roster_collect — 교체 회전은 경보로 올리지 않는다.
--    /sitemap-pairs.xml 은 "같은 동 · 양쪽 12개월 20건 이상 · 동별 상위 3" 기준이라 날마다 몇 쌍이 기준을 넘나든다
--    (10-05 신규 33 · 은퇴 10, 10-06 신규 29 · 은퇴 22 — 둘 다 순증). 빠진 수가 작고(활성의 3% · 최대 30건)
--    빠진 만큼 이상 새로 들어왔고 총량이 줄지 않았으면 유실이 아니라 회전이다. 그 밖(순감 · 큰 유실)은 예전 그대로 올린다.
--    정의의 나머지는 한 글자도 바꾸지 않는다 — 현재 정의에서 판정 줄 앞에 규칙 한 덩어리만 끼운다(기준 줄이 정확히 한 번
--    있을 때만 · 이미 끼워져 있으면 아무것도 하지 않는다).
--
-- 되돌리기: (1) 은 where 줄과 v_use_policy 계산을 빼면 예전 정의. (2) 는 "[1040] 교체 회전" 덩어리 4줄을 빼면 예전 정의.

CREATE OR REPLACE FUNCTION ops.thin_content_check(p_min_n12 integer DEFAULT 3, p_warn_pct numeric DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'ops'
AS $function$
declare
  v_since text := to_char((now() at time zone 'Asia/Seoul') - interval '12 months','YYYYMM');
  v_recent text := to_char((now() at time zone 'Asia/Seoul') - interval '11 months','YYYYMM');
  v_mv int; v_policy int; v_roster int; v_use_policy boolean := false;
  v_sub int; v_0 int; v_12 int; v_ge int; v_tclt3 int; v_pct numeric;
  v_sev text; v_sig text; v_last_detail text; v_last_sev text; v_detail text; v_basis text;
begin
  -- [1040] 모집단: 실제 사이트맵이 앱 기준(전 기간 3건 이상 + 최근 12개월 거래)으로 줄었으면 그 기준의 단지만.
  select count(*), count(*) filter (where trade_count >= 3 and last_contract_ym >= v_recent)
    into v_mv, v_policy
    from market_agg.complex_sitemap_mv;
  select count(*) into v_roster
    from ops.sitemap_url_roster
   where sitemap_path = '/sitemap-complexes.xml' and retired_at is null;
  v_use_policy := coalesce(v_roster, 0) > 0
                  and abs(v_roster - v_policy) <= greatest(50, round(v_policy * 0.03))
                  and abs(v_roster - v_policy) < abs(v_roster - v_mv);

  with r as (
    select region_name, complex_name, count(*) n12
    from public.market_transactions
    where property_type='apartment' and transaction_type='trade' and is_cancelled=false
      and contract_ym >= v_since and complex_name is not null and region_name is not null
    group by 1,2)
  select count(*), count(*) filter (where coalesce(r.n12,0)=0),
         count(*) filter (where coalesce(r.n12,0) between 1 and p_min_n12-1),
         count(*) filter (where coalesce(r.n12,0) >= p_min_n12),
         count(*) filter (where m.trade_count < 3)
    into v_sub, v_0, v_12, v_ge, v_tclt3
  from market_agg.complex_sitemap_mv m left join r using (region_name, complex_name)
  where not v_use_policy or (m.trade_count >= 3 and m.last_contract_ym >= v_recent);
  if coalesce(v_sub,0) < 1000 then return 0; end if;  -- 축소 응답 가드
  v_pct := round(100.0*(v_0+v_12)/v_sub, 1);
  insert into ops.thin_content_snapshot(since_ym, submitted, n12_0, n12_1_2, n12_ge3, tc_lt3, thin_pct)
  values (v_since, v_sub, v_0, v_12, v_ge, v_tclt3, v_pct);
  v_sev := case when v_pct >= p_warn_pct then 'warn' else 'ok' end;
  v_sig := '#sig:thin|sev='||v_sev||'|b='||floor(v_pct/5)::int;
  select severity, detail into v_last_sev, v_last_detail from ops.health_alert_log
   where check_name='seo.thin_content' order by id desc limit 1;
  if v_last_detail is not null and position(v_sig in v_last_detail) > 0 then return 0; end if;
  if v_sev='ok' and v_last_sev is null then return 0; end if;
  v_basis := case when v_use_policy
    then format('모집단 = 실제 사이트맵(명부 %s건 · 앱 기준: 전 기간 3건 이상 + 최근 12개월 거래).', v_roster)
    else format('모집단 = 매트뷰 전체(명부 %s건 — 앱이 아직 전부 싣는다). 원천 market_agg.complex_sitemap_mv 에 하한 조건이 없다.', coalesce(v_roster, 0))
  end;
  if v_sev='warn' then
    v_detail := format('사이트맵에 제출된 단지 페이지 %s건 중 최근 12개월(%s~) 매매 %s건 미만이 %s건(%s%%) — 0건 %s · 1~%s건 %s. 전 기간 누적 3건 미만은 %s건. 이 페이지들은 index,follow 로 제출되고 광고 로더도 붙는다(애드센스 「가치가 낮은 콘텐츠」 판정의 주 모집단). %s %s',
      v_sub, v_since, p_min_n12, v_0+v_12, v_pct, v_0, p_min_n12-1, v_12, v_tclt3, v_basis, v_sig);
  else
    v_detail := format('회복: 제출 단지 %s건 중 최근 12개월 매매 %s건 미만 비율이 %s%% 로 임계(%s%%) 아래로 내려왔다. %s %s', v_sub, p_min_n12, v_pct, p_warn_pct, v_basis, v_sig);
  end if;
  insert into ops.health_alert_log(check_name, severity, detail, age_hours) values ('seo.thin_content', v_sev, v_detail, null);
  return 1;
end $function$;

do $mig$
declare
  d text;
  anchor constant text := 'if v_lost >= least(200, greatest(10, ceil(active_cnt * 0.10))) then sev := ''critical'';';
  rule constant text :=
    '-- [1040] 교체 회전: 빠진 수가 작고(활성의 3% · 최대 30건) 빠진 만큼 이상 새로 들어왔고 총량이 줄지 않았으면 경보 없음' || E'\n' ||
    '    if v_lost <= least(30, greatest(2, ceil(active_cnt * 0.03))) and v_added >= v_lost and v_net >= 0 then' || E'\n' ||
    '      continue;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    ';
begin
  d := pg_get_functiondef('ops.sitemap_roster_collect'::regproc);
  if position('[1040] 교체 회전' in d) > 0 then
    raise notice '1040: 이미 적용됨';
    return;
  end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then
    raise exception '1040: 기준 줄이 정확히 한 번 있지 않다 — 정의가 바뀌었다. 적용하지 않는다';
  end if;
  execute replace(d, anchor, rule || anchor);
end
$mig$;