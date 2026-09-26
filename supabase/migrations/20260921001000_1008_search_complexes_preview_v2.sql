/* [1008 · S] search_complexes_preview v2 — 사람이 치는 단지명(띄어쓰기·괄호·브랜드 표기·'아파트' 꼬리·
   동네+단지명·오타)으로 원하는 단지가 1~3위에 오게. 적용됨 2026-09-21 — apply_migration
   '1008_search_complexes_preview_v2'(인덱스 다음). 통합자가 입력 80자·토큰 6개 상한을 더했다(anon 직접 호출 대비).
   적용 뒤 운영 실측: 골든셋 1위 전부 일치, 함수 1회 30~40ms(EXPLAIN ANALYZE Function Scan).

   같은 시그니처·같은 반환형의 CREATE OR REPLACE 다 — ACL(anon·authenticated EXECUTE: 자동완성용으로
   의도된 것)이 그대로 남는다. 새로 주는 권한 없음. 새 함수 없음.
   먼저 20260921000900_1008_complex_tx_stats_name_norm_trgm.sql(정규화 이름 트라이그램 인덱스)을 적용할 것 —
   없어도 결과는 같지만 "정규화 포함" 갈래가 순차 스캔(≈60ms)이 된다.

   ── 왜 (실측 2026-09-21) ───────────────────────────────────────────────
   /search 검색 11건 중 9건(82%)이 "결과 없음". "E편한세상 사천"(×3)·"사천 스카이"·"한가람삼성"·
   "그린타운우성"·"벽절골롯데" 는 DB 에 있는 단지다(e편한세상사천스카이마리나@사천시 · 한가람(삼성)@안양
   동안구 · 그린타운(우성2)@부천 원미구 · 벽적골롯데@수원 영통구). 직전 정의(20260814214554)의 약점:
     · 후보 = 원문 ILIKE ∪ 트라이그램(%) 뿐 — 괄호·띄어쓰기가 다르고 이름이 길면 유사도 0.3 을 못 넘는다
       (similarity('e편한세상사천스카이마리나','E편한세상 사천') = 0.278).
     · 정렬 = 앞글자 일치 > 유사도 > 최근 거래 — "힐스테이트 광교"→힐스테이트@이천시 1위(유사도 0.667 >
       힐스테이트광교 0.545), "동탄 롯데캐슬"→롯데캐슬@서울 중구 1위(지역 토큰을 안 봄), "목동 7단지"→
       청학주공(7단지)@남양주 1위.
     · 앱이 '아파트' 꼬리를 먼저 떼고 불렀다 — "공작아파트"→"공작"→공작@영등포 1위(공작아파트@안양 동안구가
       최근 6개월 120건으로 훨씬 활발한데도).

   ── 규칙 (원본: lib/search/complex-match.ts — tests/unit/complex-search-1008 이 표기 표·등급을 대조한다) ──
   정규화 키 = regexp_replace(lower(x), '[^0-9a-z가-힣]', '', 'g')  (괄호·공백·하이픈·점 제거)
   질의만 브랜드 표기를 접고(fold_*), DB 에 실제로 있는 표기들로 다시 펼친다(alt_*). DB 이름은 그대로.
   후보(각 갈래는 따로 계획된다 — OR 로 묶으면 인덱스를 못 타고 행마다 regexp_replace 를 돈다):
     a. 원문 포함(1자는 앞글자)                     — complex_tx_stats_name_trgm (3자 이상)
     b. 트라이그램 %(3자 이상, 오타)                 — complex_tx_stats_name_trgm
     c. 정규화 이름 포함(3자 이상 형)               — complex_tx_stats_name_norm_trgm (새 인덱스)
     d. 토큰 묶음: 조각 하나가 이름에(인덱스) + 모든 조각이 이름·지역·주소 어딘가에(필터)
        · 토큰 2개 이상 → 그 토큰들("동탄 롯데캐슬", "목동 7단지"→[목동, 7])
        · 한 덩어리 4자 이상 → 앞 2·3자 / 뒤 3·2자로 자른 두 조각("동탄롯데캐슬"→[동탄, 롯데캐슬])
        · 숫자 토큰은 이름에서만, 숫자 경계로("7"이 "17"·지번 "747-12"에 걸리지 않게)
   등급: 0 정확 · 1 '아파트'/'N단지' 꼬리 무시 정확 · 2 지역+정확 · 3 앞부분 · 4 포함 · 5 지역+앞부분 ·
         6 토큰 전부 · 7 비슷한 이름(유사도 0.3 이상만)
   정렬: 등급 → 이름에 든 토큰 수 → 최근 6개월 거래(등급 7 은 건너뜀) → 유사도 → 전체 거래.
         (유사도를 거래보다 앞에 두면 "목동 7단지"→목동동화옥시죤-7(거래 0, 유사도 0.214)이 목동신시가지7
          (6개월 57건, 0.154) 위에 선다 — 재현으로 확인. 오타 추정인 등급 7 만 유사도가 먼저다.)
   반환 exact = 등급 < 7 (이름·토큰으로 맞음). false 면 "비슷한 이름"(오타 추정) — 앱이 그렇게 표시한다.
   반환 households: 세대수 근거가 '이름만 같음'(households_source='name')이면 null 로 낸다. 실측 1,106단지 중
   850곳이 전국에 같은 이름이 여럿인데 한 단지의 세대수가 전부에 복사돼 있다("갑을" 관악·송파·미추홀 모두 420,
   "은마" 창원·대구도 4,424). 동명 단지를 가려 보라고 세대수를 보여 주는 자리라, 틀린 값은 빈 값보다 나쁘다.
   초성 분기(자모만 2자 이상)는 직전 정의 그대로다(동적 SQL 로 옮기고, 아래 세대수 규칙만 같이 적용했다).

   ── 왜 동적 SQL(EXECUTE) 인가 ──────────────────────────────────────────
   2026-08-11 실측: 트라이그램 GIN 은 3자 이상에서 22~47배 빠르지만 2자에서는 posting list 가 커서 순차
   스캔보다 느리다. 패턴이 실행 때 정해지는 정적 SQL(일반 계획)은 그 차이를 모른다. 여기서는 패턴을
   리터럴로 박은 SQL 을 매번 계획하게 해(계획 ≈1ms) 갈래마다 맞는 경로를 고르게 한다. 입력은 전부
   format(%L) 로만 들어간다(식별자 없음) — SECURITY DEFINER 에서 주입 경로가 없다.

   ── 재현·측정 (운영 DB, 읽기 전용) ─────────────────────────────────────
   (적용 전) 이 본문을 그대로 DO 블록에 넣어 set transaction read only 안에서 돌려 골든셋 1~3위와
   생성 SQL 을 뽑고, 생성 SQL 을 EXPLAIN (ANALYZE, BUFFERS) 로 쟀다. 결과는 docs 가 아니라 이 머리글과
   통합자 보고에 적는다.  → 아래 "측정" 절.

   ── 측정 (2026-09-21 운영, set transaction read only 안의 DO 블록으로 이 본문 그대로 실행) ──────────
   골든셋 1위(앱이 부르는 형태 그대로 — 약칭만 펼치고 '아파트'는 떼지 않음):
     질의              직전 정의 1위                    v2 1위
     E편한세상 사천     e편한세상@광주 서구               e편한세상사천스카이마리나@사천시
     사천 스카이        스카이@인천 부평구                e편한세상사천스카이마리나@사천시
     한가람삼성         한가람(삼성)@안양 동안구          한가람(삼성)@안양 동안구
     그린타운우성       그린타운@대전 대덕구              그린타운(우성2)@부천 원미구
     벽절골롯데(오타)   벽적골롯데@수원 영통구            벽적골롯데@수원 영통구 (exact=false: 비슷한 이름)
     공작아파트         (앱이 '공작'으로 잘라) 공작@영등포 공작아파트@안양 동안구
     힐스테이트 광교    힐스테이트@이천시                 힐스테이트광교@수원 영통구
     동탄 롯데캐슬      롯데캐슬@서울 중구                롯데캐슬@화성 동탄구
     목동 7단지         청학주공(7단지)@남양주시          목동신시가지7@서울 양천구
     래미안 퍼스티지    래미안퍼스티지@서울 서초구        래미안퍼스티지@서울 서초구
     은마               은마@서울 강남구                  은마@서울 강남구
     잠실 주공 5단지    —                                 주공아파트 5단지@서울 송파구 (약칭 "잠실주공" 의 새 대상)
     중리현대           —(0건)                            0건 (실거래에 없음 — 엉뚱한 1위를 만들지 않는다)
   붙여 치기도 된다: "동탄롯데캐슬"→롯데캐슬@화성 동탄구, "목동7단지"→목동신시가지7, "은마아파트"→은마@강남구,
   "이편한세상 광양"→이편한세상광양@광양시, "SK뷰"→SKVIEW(표기 펼침), "대치 은마"→은마@강남구.
   시간(계획+실행, p_limit 8): 인덱스 적용 뒤 대리값 3.9~24.9ms(골든셋 10개) · "은마" 11~18ms · "래" 5~17ms.
   직전 정의: "E편한세상 사천" 122.6ms · "공작" 174.7ms · "은마" 162.0ms(2자는 similarity() 를 전 행에 돌렸다) ·
   "힐스테이트 광교" 69.9ms · "래미안" 30.5ms. 인덱스 없이 v2 를 먼저 적용하면 89~306ms — 반드시 인덱스 먼저.

   ── 되돌리기 ───────────────────────────────────────────────────────────
   20260814214554_search_complexes_preview_chosung_support.sql 의 search_complexes_preview 정의를 다시
   적용한다(시그니처·반환형 동일 — ACL 유지). 인덱스는 남겨도 무해하다(쓰기 비용 ≈ 매트뷰 갱신 때 6MB).
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
        if t ~ '[시군구]$' and length(t) >= 3 then
          alts := alts || left(t, -1);
        end if;
        s_rre := s_rre || ('(' || array_to_string(alts, '|') || ')');
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
    -- c. 정규화 이름 포함 — 3자 이상 형은 정규화 인덱스로, 꼬리 뗀 2자 형("공작아파트"→"공작")은 순차 LIKE 로
    select string_agg(format('%s like %L', nexpr, '%' || v || '%'), ' or ') into x
      from unnest(fx) v where length(v) >= 3;
    if x is not null then
      br := br || format('select %s%s(%s)', cols, src, x);
    end if;
    foreach x in array coalesce((select array_agg(v) from unnest(fx) v where length(v) = 2 and v <> k0), '{}') loop
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
        select sc.region_name, sc.complex_name, pt.sid,
               count(*) filter (where sc.nn ~ pt.nre) as in_name,
               count(*) filter (where not (sc.nn ~ pt.nre) and pt.rre is not null and sc.rg ~ pt.rre) as in_region,
               count(*) as total,
               string_agg(substring(sc.nn from pt.nre), '' order by pt.ord) filter (where sc.nn ~ pt.nre) as name_join
        from sc cross join pt
        group by sc.region_name, sc.complex_name, pt.sid
      ),
      st as (
        select distinct on (sm.region_name, sm.complex_name)
               sm.region_name, sm.complex_name,
               case when sm.in_region >= 1 and sm.name_join in (sc.nn, sc.nn_na, sc.nn_nd) then 2
                    when sm.in_region >= 1 and sc.nn like sm.name_join || '%%' then 5
                    else 6 end as set_tier,
               sm.in_name
        from sm join sc on sc.region_name = sm.region_name and sc.complex_name = sm.complex_name
        where sm.in_name >= 1 and sm.in_name + sm.in_region = sm.total
        order by sm.region_name, sm.complex_name, set_tier, sm.in_name desc
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
        where rk.tier < 7 or rk.sim >= 0.3
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
      lim);
  end if;

  return query execute v_sql;
end;
$function$;
