/* [1008 · S · 리뷰 B] search_complexes_preview v3 — v2(20260921001000, 적용됨) 전문 + 아래 네 가지.
   적용됨 2026-09-21 — apply_migration '1008_search_complexes_preview_v3'(본문 동일, 주석 일부 생략). 운영 확인: 골든셋·시·도 질의 1위 전부 일치.
   같은 시그니처·같은 반환형의 CREATE OR REPLACE — ACL(anon·authenticated·service_role EXECUTE)이 그대로 남는다.
   새 함수 없음 · 새 GRANT 없음. 통합자가 v2 에 더한 입력 80자·토큰 6개 상한은 그대로 둔다.
   규칙의 원본은 lib/search/complex-match.ts — tests/unit/complex-search-1008 이 이 파일과 표·식을 대조한다.

   ── 무엇이 바뀌나 (왜: 1008 엄격 리뷰 B 재현, 운영 v2) ───────────────────────────────
   1) 시·도 낱말. region_name·address 에 시·도가 없다("사천시"·"수원 영통구"·"서울 강남구"·"광주시"=경기 광주).
      v2 에서 "경남 사천 e편한세상" 은 전부 비슷한 이름, "경기도 수원 힐스테이트" 는 1위 힐스테이트@이천(비슷한 이름),
      "부산광역시 해운대 자이" 는 0건, "서울특별시 은마" 는 비슷한 이름으로만 나왔다. 이제
        · 도는 버린다 — 긴 꼴(경기도·경상남도·강원특별자치도… · "경남도" 처럼 짧은 꼴+도)은 어디서든,
          짧은 꼴(경기·경남·제주…)은 맨 앞일 때만("동래 경남" 의 경남은 경남아파트일 수 있다).
        · 특별시·광역시·특별자치시는 꼬리만 뗀다(서울특별시→서울 · 부산광역시→부산 · 세종특별자치시→세종) —
          region_name 첫 낱말("서울 강남구"·"세종시")이라 지역 토큰으로 그대로 쓴다.
        · 남는 낱말이 '아파트'·'단지'·번호뿐이면 손대지 않는다("경남 아파트" = 경남아파트).
        · 도를 버렸으면 광역·특별시 구와 세종시는 후보에서 뺀다(metro_re) — "경기 광주 롯데캐슬" 이 광주광역시
          북구의 운암동롯데캐슬(6개월 19건)을 경기 광주시의 초월롯데캐슬(10건) 위에 올리지 않게.
   2) 지역 먼저 읽기. 토큰이 이름과 지역 둘 다에 있으면 두 가지로 읽어 나은 등급을 쓴다(sm 의 in_name2·in_region2).
      "사천 e편한세상" 의 '사천' 은 e편한세상사천스카이마리나@사천시 의 이름에도 지역에도 있다 — 이름으로만 읽으면
      등급 6 이라 e편한세상삼천포오션프라임(등급 5) 아래였다. 한 글자 토큰은 지역·주소에서 찾지 않는다("은 마" 의
      '마' 가 창원 '마'산회원구에 걸려 이름에 든 토큰 수가 흔들렸다).
   3) 2자 키 + 구분자("은 마"·"S K"·"공-작") 0건. c 갈래가 원 키(k0)를 원문 갈래(a) 몫으로 빼 뒀는데, a 는 구분자째
      찾는다. 질의에 구분자가 있으면 원 키 2자도 c 갈래로 찾는다.
   4) (앱) 초성 질의는 앱이 이름 규칙으로 다시 보지 않는다(lib/search/complex-preview-rows) — SQL 은 그대로.

   ── 측정 (2026-09-21 적용 전, 운영 읽기 전용 — 이 본문을 DO 블록에 넣어 set transaction read only 안에서 실행) ──
   1~3위 (~ = 비슷한 이름 · exact=false):
     질의                      v2(지금 운영)                                         v3
     경남 사천 e편한세상        e편한세상@광주 서구~ / @대전 동구~ / @서울 도봉구~     e편한세상사천스카이마리나@사천시 / e편한세상삼천포오션프라임@사천시 / e편한세상 다산@남양주시~
     경기도 수원 힐스테이트     힐스테이트@이천시~ / @아산시~ / 힐스테이트 율곡@김천시~ 힐스테이트푸르지오수원@수원 팔달구 / 힐스테이트영통@수원 영통구 / 힐스테이트광교@수원 영통구
     경기 광주 롯데캐슬         롯데캐슬@서울 중구~ / @서울 양천구~ / @화성 동탄구~     초월롯데캐슬@광주시 / 오포롯데캐슬포레스트@광주시 / 롯데캐슬@화성 동탄구~
     부산광역시 해운대 자이     0건                                                   해운대자이2차1단지 / 해운대자이1단지 / 해운대자이2단지 (@부산 해운대구)
     서울특별시 은마            은마@서울 강남구~ / @창원 마산회원구~ / @대구 북구~     은마@서울 강남구 / 서울@청주 서원구~ / 서울@부천 오정구~
     사천 e편한세상             e편한세상삼천포오션프라임 / 사천스카이마리나 / …       e편한세상사천스카이마리나@사천시 / e편한세상삼천포오션프라임@사천시 / e편한세상@광주 서구~
     은 마 · S K · 공-작        0건 · 0건 · 0건                                        은마@서울 강남구… · SK@용인 기흥구… · 공작@서울 영등포구…
     경남 아파트                경남아파트@서울 금천구 / 경남@서울 영등포구 / …        같음(시·도로 보지 않는다)
     세종 한신                  한신엘리트파크(범지기9단지)@세종시 / …                  같음(세종은 지역 토큰)
   리뷰 B 의 30개 질의(rpc-golden, 골든셋 포함): v2 와 순서·판정이 같다 — "강남 래미안" 만 래미안강남힐즈@서울 강남구가
   8위 밖 → 3위(2 의 지역 먼저 읽기). 앱 규칙(lib/search/complex-match · complex-preview-rows)과 대조: 45개 질의 292행 —
   순서 불일치 0 · '비슷한 이름' 판정 불일치 0(초성 "ㄹㅁㅇ" 8행 포함).
   시간(계획+실행 · p_limit 8 · 인덱스 있음, 같은 20개 질의): v3 5.4~44.6ms · v2(운영 함수) 3.2~43.6ms.

   ── 되돌리기 ───────────────────────────────────────────────────────────
   20260921001000_1008_search_complexes_preview_v2.sql 의 정의를 다시 적용한다(시그니처·반환형 동일 — ACL 유지).
*/

create or replace function public.search_complexes_preview(p_q text, p_limit integer default 8)
 returns table(complex_id text, region_name text, complex_name text, address text, trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint, avg_area_m2 numeric, build_year integer, households integer, lat double precision, lng double precision, sim real, exact boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  -- [1008 · 통합] 80자 상한 — 앱(/api/search/*)은 80자에서 400 을 내지만 이 함수는 anon 이 PostgREST 로
  -- 직접 부를 수 있다(자동완성용 EXECUTE). 토큰마다 후보 갈래가 늘어나는 동적 SQL 이라 입력 길이를 여기서 자른다.
  q    text    := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 80);
  lim  integer := greatest(1, least(20, coalesce(p_limit, 8)));
  -- 질의 쪽 표기 접기(순서 의미 있음) · DB 표기 펼치기 — lib/search/complex-match.ts BRAND_FOLDS·BRAND_ALTS 와 같다
  fold_from constant text[] := array['이편한세상','ipark','에스케이뷰','sk뷰','에스클래스','엘에이치','케이씨씨','엘지','지에스','thesharp','prugio','raemian','hillstate','lottecastle'];
  fold_to   constant text[] := array['e편한세상','아이파크','skview','skview','s클래스','lh','kcc','lg','gs','더샵','푸르지오','래미안','힐스테이트','롯데캐슬'];
  alt_c     constant text[] := array['e편한세상','아이파크','skview','skview','s클래스','lh','kcc','lg','gs','더샵'];
  alt_a     constant text[] := array['이편한세상','ipark','sk뷰','에스케이뷰','에스클래스','엘에이치','케이씨씨','엘지','지에스','thesharp'];
  -- [1008 · 리뷰 B] 시·도 낱말 — lib/search/complex-match.ts PROVINCE_DO_SHORT·PROVINCE_DO_LONG·METRO_REGION 과 같다
  do_short  constant text[] := array['경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  do_long   constant text[] := array['경기도','강원도','충청북도','충청남도','전라북도','전라남도','경상북도','경상남도','제주도','강원특별자치도','전북특별자치도','제주특별자치도'];
  metro_re  constant text := '^(서울|부산|대구|인천|광주|대전|울산) |^세종시$';
  -- 정규화 이름 — 20260921000900 인덱스 표현식과 글자 그대로 같아야 인덱스를 탄다
  nexpr constant text := $e$regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g')$e$;
  cols  constant text := 'b.region_name, b.complex_name, b.address, b.trade_count, b.recent_trade_count, b.avg_price_manwon, b.avg_area_m2, b.build_year';
  src   constant text := ' from public.complex_tx_stats_base b where ';
  rgx   constant text := $e$lower(b.region_name || ' ' || coalesce(b.address, ''))$e$;
  k0 text; kf text; kna text; x text; t text; qe text;
  f0 text[] := '{}'; fx text[] := '{}'; fp text[];
  toks text[] := '{}';
  alts text[];
  s_sid int[] := '{}'; s_ord int[] := '{}'; s_txt text[] := '{}'; s_gen boolean[] := '{}';
  s_nre text[] := '{}'; s_rre text[] := '{}'; s_alts text[] := '{}';
  br text[] := '{}';
  filt text;
  pt text;
  sid int := 0;
  n int;
  cut int;
  v_sql text;
  words text[];
  kept text[] := '{}';
  changed boolean := false;
  do_ctx boolean := false;
  meaningful boolean := false;
begin
  if length(q) < 1 then
    return;
  end if;

  if q ~ '^[ㄱ-ㅎㅏ-ㅣ]+$' and length(q) >= 2 then
    -- [2026-08-14] 자모 전용 질의 = 초성 검색. 직전 정의 그대로(정적 → 동적으로만 옮김).
    v_sql := format($sql$
      select public.complex_id(s.region_name, s.complex_name), s.region_name, s.complex_name, s.address,
             s.trade_count, s.recent_trade_count, s.avg_price_manwon, s.avg_area_m2, s.build_year,
             case when s.households_source = 'name' then null else s.households end,
             g.lat::double precision, g.lng::double precision, 0::real,
             (public.hangul_chosung(s.complex_name) like %1$L)
      from public.complex_tx_stats s
      left join public.complex_geocode g
        on g.region_name = s.region_name and g.complex_name = s.complex_name and g.status = 'ok'
      where public.hangul_chosung(s.complex_name) like %2$L
      order by (public.hangul_chosung(s.complex_name) like %1$L) desc, s.recent_trade_count desc, s.trade_count desc
      limit %3$s$sql$, q || '%', '%' || q || '%', lim);
  else
    -- ── 시·도 낱말 (lib/search/complex-match.ts stripProvinceWords 와 같다) ────────────
    -- region_name·address 에 시·도가 없다: 도는 버리고(짧은 꼴은 맨 앞일 때만 — "동래 경남" 은 경남아파트일 수 있다),
    -- 특별시·광역시·특별자치시는 꼬리만 뗀다(서울특별시→서울: "서울 강남구" 첫 낱말). 남는 낱말이 '아파트'·'단지'·
    -- 번호뿐이면 손대지 않는다("경남 아파트" = 경남아파트). 도를 버렸으면 광역·특별시 구는 후보가 아니다(do_ctx).
    words := array(select z.w from regexp_split_to_table(q, '[^0-9A-Za-z가-힣]+') with ordinality as z(w, o)
                   where z.w <> '' order by z.o);
    if coalesce(array_length(words, 1), 0) >= 2 then
      foreach x in array words loop
        t := lower(x);
        if t = any(do_long) or (right(t, 1) = '도' and left(t, -1) = any(do_short))
           or (coalesce(array_length(kept, 1), 0) = 0 and t = any(do_short)) then
          changed := true;
          do_ctx := true;
          continue;
        end if;
        if t ~ '^.+(특별자치시|특별시|광역시)$' then
          changed := true;
          t := regexp_replace(t, '(특별자치시|특별시|광역시)$', '');
          kept := kept || t;
        else
          kept := kept || x;
        end if;
        continue when t in ('아파트', '단지');
        t := regexp_replace(t, '^([0-9]+)단지$', '\1');
        t := case when right(t, 3) = '아파트' and length(t) - 3 >= 2 then left(t, -3) else t end;
        if length(t) >= 2 and t !~ '^[0-9]+$' then
          meaningful := true;
        end if;
      end loop;
      if changed and meaningful then
        q := array_to_string(kept, ' ');
      else
        do_ctx := false;
      end if;
    end if;

    -- ── 질의 해석 ──────────────────────────────────────────────────────
    k0 := regexp_replace(lower(q), '[^0-9a-z가-힣]', '', 'g');
    if k0 = '' then
      return;
    end if;
    kf := k0;
    for i in 1..array_length(fold_from, 1) loop
      kf := replace(kf, fold_from[i], fold_to[i]);
    end loop;
    kna := case when right(kf, 3) = '아파트' and length(kf) - 3 >= 2 then left(kf, -3) else kf end;

    -- 등급 0 형: 원 키 + 접은 키 + 그 DB 표기들
    f0 := array[k0, kf];
    for i in 1..array_length(alt_c, 1) loop
      if strpos(kf, alt_c[i]) > 0 then f0 := f0 || replace(kf, alt_c[i], alt_a[i]); end if;
    end loop;
    -- 등급 1·3·4 형: 위 + '아파트'·'N단지' 꼬리 뗀 형과 그 DB 표기들
    fx := f0;
    foreach x in array array[kna, regexp_replace(kf, '([0-9]+)단지$', '\1'), regexp_replace(kna, '([0-9]+)단지$', '\1')] loop
      fx := fx || x;
      for i in 1..array_length(alt_c, 1) loop
        if strpos(x, alt_c[i]) > 0 then fx := fx || replace(x, alt_c[i], alt_a[i]); end if;
      end loop;
    end loop;
    select array_agg(distinct v) into f0 from unnest(f0) v where v <> '';
    select array_agg(distinct v) into fx from unnest(fx) v where v <> '';
    -- 앞부분·포함 비교는 2자 이상 형만(질의 자체가 1자면 1자 허용) — "7단지"의 "7" 이 모든 이름에 걸리지 않게
    select array_agg(v) into fp from unnest(fx) v where length(v) >= least(2, length(kf));

    -- 토큰: 숫자 앞 띄우기("목동7단지"→"목동 7단지") · 접기 · '아파트'/'단지' 버리기 · 꼬리 처리 · 중복 제거
    for x in
      select z.p from regexp_split_to_table(regexp_replace(lower(q), '([^0-9])([0-9])', '\1 \2', 'g'), '[^0-9a-z가-힣]+')
             with ordinality as z(p, o)
      where z.p <> '' order by z.o
    loop
      t := x;
      for i in 1..array_length(fold_from, 1) loop
        t := replace(t, fold_from[i], fold_to[i]);
      end loop;
      continue when t in ('아파트', '단지');
      t := regexp_replace(t, '^([0-9]+)단지$', '\1');
      t := case when right(t, 3) = '아파트' and length(t) - 3 >= 2 then left(t, -3) else t end;
      continue when t = '' or t = any(toks);
      toks := toks || t;
      -- [1008 · 통합] 토큰 6개까지 — 단지명·동네 검색은 2~3개면 충분하고, 토큰마다 갈래가 늘어난다
      exit when array_length(toks, 1) >= 6;
    end loop;

    -- 토큰 묶음: 2개 이상이면 그 토큰들(모두 후보 생성에 쓴다), 한 덩어리 4자 이상이면 두 조각 나누기(긴 조각으로 생성)
    n := coalesce(array_length(toks, 1), 0);
    if n >= 2 then
      sid := 1;
      for i in 1..n loop
        s_sid := s_sid || 1; s_ord := s_ord || i; s_txt := s_txt || toks[i];
        s_gen := s_gen || (toks[i] !~ '^[0-9]+$' and length(toks[i]) >= 2);
      end loop;
    elsif n = 1 and toks[1] !~ '^[0-9]+$' and length(toks[1]) >= 4 then
      t := toks[1];
      for cut in
        select distinct c from unnest(array[2, 3, length(t) - 3, length(t) - 2]) c
        where c >= 2 and length(t) - c >= 2 order by c
      loop
        if greatest(cut, length(t) - cut) >= 3 or length(t) = 4 then
          sid := sid + 1;
          s_sid := s_sid || sid || sid; s_ord := s_ord || 1 || 2;
          s_txt := s_txt || left(t, cut) || substr(t, cut + 1);
          s_gen := s_gen || (cut >= length(t) - cut) || (length(t) - cut >= cut);
        end if;
      end loop;
    end if;

    -- 조각마다 이름 정규식(표기 펼침) · 지역 정규식(시/군/구 꼬리 뗀 형 포함). 숫자는 이름에서만, 숫자 경계로.
    for i in 1..coalesce(array_length(s_txt, 1), 0) loop
      t := s_txt[i];
      if t ~ '^[0-9]+$' then
        s_nre := s_nre || ('(?:^|[^0-9])(' || t || ')(?:[^0-9]|$)');
        s_rre := s_rre || null::text;
        s_alts := s_alts || t;
      else
        alts := array[t];
        for j in 1..array_length(alt_c, 1) loop
          if strpos(t, alt_c[j]) > 0 then alts := alts || replace(t, alt_c[j], alt_a[j]); end if;
        end loop;
        select array_agg(distinct a) into alts from unnest(alts) a;
        s_nre := s_nre || ('(' || array_to_string(alts, '|') || ')');
        s_alts := s_alts || array_to_string(alts, '|');
        if length(t) < 2 then
          -- [1008 · 리뷰 B] 한 글자 토큰은 지역·주소에서 찾지 않는다("은 마" 의 '마' 가 창원 '마'산회원구에 걸렸다)
          s_rre := s_rre || null::text;
        else
          if t ~ '[시군구]$' and length(t) >= 3 then
            alts := alts || left(t, -1);
          end if;
          s_rre := s_rre || ('(' || array_to_string(alts, '|') || ')');
        end if;
      end if;
    end loop;

    -- ── 후보 갈래 ──────────────────────────────────────────────────────
    qe := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
    -- a. 원문 포함 — 1자는 앞글자만. 3자 미만은 인덱스보다 순차 LIKE 가 싸다(2026-08-11 실측).
    --    ILIKE 순차 스캔은 LIKE 의 ≈8배라(2026-09-21 실측 150ms vs 18ms) 짧은 로마자는 대/소문자 두 번의 LIKE 로.
    if length(q) >= 3 then
      br := br || format('select %s%sb.complex_name ilike %L', cols, src, '%' || qe || '%');
    elsif q ~ '[A-Za-z]' then
      br := br || format('select %s%s(b.complex_name like %L or b.complex_name like %L)', cols, src,
                         case when length(k0) = 1 then '' else '%' end || lower(qe) || '%',
                         case when length(k0) = 1 then '' else '%' end || upper(qe) || '%');
    else
      br := br || format('select %s%sb.complex_name like %L', cols, src,
                         case when length(k0) = 1 then '' else '%' end || qe || '%');
    end if;
    -- b. 오타 — 트라이그램(3자 이상)
    if length(q) >= 3 then
      br := br || format('select %s%sb.complex_name %% %L', cols, src, q);
    end if;
    -- c. 정규화 이름 포함 — 3자 이상 형은 정규화 인덱스로, 꼬리 뗀 2자 형("공작아파트"→"공작")은 순차 LIKE 로.
    --    [1008 · 리뷰 B] 질의에 구분자가 있으면("은 마"·"S K"·"공-작") 원 키 2자도 — 원문 갈래(a)가 구분자째 찾아 0건이었다.
    select string_agg(format('%s like %L', nexpr, '%' || v || '%'), ' or ') into x
      from unnest(fx) v where length(v) >= 3;
    if x is not null then
      br := br || format('select %s%s(%s)', cols, src, x);
    end if;
    foreach x in array coalesce((select array_agg(v) from unnest(fx) v
                                  where length(v) = 2 and (v <> k0 or q ~ '[^0-9A-Za-z가-힣]')), '{}') loop
      if x ~ '[a-z]' then
        br := br || format('select %s%s(b.complex_name like %L or b.complex_name like %L)', cols, src, '%' || x || '%', '%' || upper(x) || '%');
      else
        br := br || format('select %s%sb.complex_name like %L', cols, src, '%' || x || '%');
      end if;
    end loop;
    -- d. 토큰 묶음 — 생성 조각의 표기마다 한 갈래: (그 표기가 이름에) and (묶음의 모든 조각이 이름·지역·주소에)
    for s in 1..sid loop
      select string_agg(
               case when s_rre[i] is null then format('%s ~ %L', nexpr, s_nre[i])
                    else format('(%s ~ %L or %s ~ %L)', nexpr, s_nre[i], rgx, s_rre[i]) end,
               ' and ' order by s_ord[i])
        into filt
        from generate_subscripts(s_txt, 1) i
       where s_sid[i] = s;
      for i in 1..coalesce(array_length(s_txt, 1), 0) loop
        continue when s_sid[i] <> s or not s_gen[i];
        foreach x in array string_to_array(s_alts[i], '|') loop
          if length(x) >= 3 then
            br := br || format('select %s%s%s like %L and %s', cols, src, nexpr, '%' || x || '%', filt);
          elsif x ~ '[a-z]' then
            br := br || format('select %s%s(b.complex_name like %L or b.complex_name like %L) and %s',
                               cols, src, '%' || x || '%', '%' || upper(x) || '%', filt);
          else
            br := br || format('select %s%sb.complex_name like %L and %s', cols, src, '%' || x || '%', filt);
          end if;
        end loop;
      end loop;
    end loop;

    -- 토큰 조각 표(묶음 번호·순서·이름 정규식·지역 정규식)
    select string_agg(format('(%s, %s, %L, %L::text)', s_sid[i], s_ord[i], s_nre[i], s_rre[i]), ', ')
      into pt from generate_subscripts(s_txt, 1) i;
    pt := coalesce('values ' || pt, 'select null::int, null::int, null::text, null::text where false');

    -- ── 순위 ──────────────────────────────────────────────────────────
    v_sql := format($sql$
      with cand as (%1$s),
      sc as (
        select c.*, x.nn,
               case when right(x.nn, 3) = '아파트' and length(x.nn) - 3 >= 2 then left(x.nn, -3) else x.nn end as nn_na,
               regexp_replace(x.nn, '([0-9]+)단지$', '\1') as nn_nd,
               lower(c.region_name || ' ' || coalesce(c.address, '')) as rg,
               similarity(c.complex_name, %2$L) as sim
        from cand c
        cross join lateral (select regexp_replace(lower(c.complex_name), '[^0-9a-z가-힣]', '', 'g') as nn) x
      ),
      pt(sid, ord, nre, rre) as (%3$s),
      sm as (
        -- 두 가지로 읽는다: ① 이름에 있으면 이름 토큰(직전 규칙) ② 지역·주소에 있으면 지역 토큰.
        -- "사천 e편한세상" 의 '사천' 은 e편한세상사천스카이마리나@사천시 의 이름에도 지역에도 있다 — ①만 보면 등급 6.
        select sc.region_name, sc.complex_name, pt.sid,
               count(*) filter (where sc.nn ~ pt.nre) as in_name,
               count(*) filter (where not (sc.nn ~ pt.nre) and pt.rre is not null and sc.rg ~ pt.rre) as in_region,
               string_agg(substring(sc.nn from pt.nre), '' order by pt.ord) filter (where sc.nn ~ pt.nre) as name_join,
               count(*) filter (where not (pt.rre is not null and sc.rg ~ pt.rre) and sc.nn ~ pt.nre) as in_name2,
               count(*) filter (where pt.rre is not null and sc.rg ~ pt.rre) as in_region2,
               string_agg(substring(sc.nn from pt.nre), '' order by pt.ord)
                 filter (where not (pt.rre is not null and sc.rg ~ pt.rre) and sc.nn ~ pt.nre) as name_join2,
               count(*) as total
        from sc cross join pt
        group by sc.region_name, sc.complex_name, pt.sid
      ),
      st as (
        select distinct on (r.region_name, r.complex_name)
               r.region_name, r.complex_name,
               case when r.in_region >= 1 and r.name_join in (sc.nn, sc.nn_na, sc.nn_nd) then 2
                    when r.in_region >= 1 and sc.nn like r.name_join || '%%' then 5
                    else 6 end as set_tier,
               r.in_name
        from (
          select sm.region_name, sm.complex_name, sm.total, v.in_name, v.in_region, v.name_join
          from sm cross join lateral (values (sm.in_name, sm.in_region, sm.name_join),
                                             (sm.in_name2, sm.in_region2, sm.name_join2)) v(in_name, in_region, name_join)
        ) r
        join sc on sc.region_name = r.region_name and sc.complex_name = r.complex_name
        where r.in_name >= 1 and r.in_name + r.in_region = r.total
        order by r.region_name, r.complex_name, set_tier, r.in_name desc
      ),
      rk as (
        select sc.*, coalesce(st.in_name, 0) as name_tokens,
               case when sc.nn = any(%4$L::text[]) then 0
                    when sc.nn = any(%5$L::text[]) or sc.nn_na = any(%5$L::text[]) or sc.nn_nd = any(%5$L::text[]) then 1
                    when st.set_tier = 2 then 2
                    when sc.nn like any(%6$L::text[]) then 3
                    when sc.nn like any(%7$L::text[]) then 4
                    when st.set_tier = 5 then 5
                    when st.set_tier = 6 then 6
                    else 7 end as tier
        from sc left join st on st.region_name = sc.region_name and st.complex_name = sc.complex_name
      ),
      top as (
        select rk.*, row_number() over (
                 order by rk.tier, rk.name_tokens desc, case when rk.tier < 7 then rk.recent_trade_count else 0 end desc,
                          rk.sim desc, rk.recent_trade_count desc, rk.trade_count desc,
                          rk.complex_name, rk.region_name) as pos
        from rk
        where (rk.tier < 7 or rk.sim >= 0.3)
          and not (%9$L::boolean and rk.region_name ~ %10$L)
      )
      select public.complex_id(t.region_name, t.complex_name), t.region_name, t.complex_name, t.address,
             t.trade_count, t.recent_trade_count, t.avg_price_manwon, t.avg_area_m2, t.build_year,
             case when s.households_source = 'name' then null else s.households end,
             g.lat::double precision, g.lng::double precision, t.sim, (t.tier < 7)
      from top t
      left join market_agg.complex_spec_resolved s
        on s.region_name = t.region_name and s.complex_name = t.complex_name
      left join public.complex_geocode g
        on g.region_name = t.region_name and g.complex_name = t.complex_name and g.status = 'ok'
      where t.pos <= %8$s
      order by t.pos$sql$,
      array_to_string(br, ' union '),
      q,
      pt,
      f0,
      fx,
      (select array_agg(v || '%') from unnest(fp) v),
      (select array_agg('%' || v || '%') from unnest(fp) v),
      lim,
      do_ctx,
      metro_re);
  end if;

  return query execute v_sql;
end;
$function$;
