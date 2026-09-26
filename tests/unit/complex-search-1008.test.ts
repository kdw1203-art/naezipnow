import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BRAND_ALTS,
  BRAND_FOLDS,
  COMPLEX_QUERY_MAX,
  COMPLEX_TOKEN_MAX,
  METRO_REGION,
  PROVINCE_DO_LONG,
  PROVINCE_DO_SHORT,
  complexNameKey,
  normalizeComplexQueryText,
  parseComplexQuery,
  rankComplexes,
  splitCompound,
  stripProvinceWords,
  tokenizeComplexQuery,
  trigramSimilarity,
  type ComplexCandidate,
} from "@/lib/search/complex-match";
import { expandComplexAlias, normalizeSearchQuery } from "@/lib/search/normalize-query";
import { highlightParts } from "@/lib/search/highlight";
import { complexFacts, complexPlace } from "@/lib/search/complex-preview";
import { rankPreviewRows, type PreviewRow } from "@/lib/search/complex-preview-rows";

/* [1008 · S] 단지 이름 검색 골든셋 — 소유자 지시 "단지명·아파트명을 쓰면 제대로 검색이 안 된다" +
   실측(/search 결과 없음 82%, 2026-09-21).

   후보의 이름·지역·주소는 운영 DB(complex_tx_stats_base)에서 그 질의에 실제로 걸려 나온 단지들이다
   (국토부 실거래 공개 표기). **거래 건수는 테스트용 가짜 숫자**다 — 가능한 한 경쟁 후보에 더 큰 수를 줘서
   "거래가 많은 엉뚱한 단지가 이기지 못한다"를 확인한다. 순위가 실제 거래 순서에 기대는 곳(그린타운 우성1/2,
   마포래미안푸르지오 1~4단지)만 실제와 같은 방향으로 준다.
   같은 규칙의 SQL(search_complexes_preview v2)을 운영 DB 에서 읽기 전용으로 돌린 1위도 이 표와 같았다
   (마이그레이션 머리글 "측정"). */

type C = ComplexCandidate;
const c = (name: string, region: string, address: string | null, recent: number, trades = recent + 5): C => ({
  name,
  region,
  address,
  recentTradeCount: recent,
  tradeCount: trades,
});
const top = (q: string, rows: C[]) => rankComplexes(q, rows).map((r) => `${r.name}@${r.region}`);

test("E편한세상 사천 · 사천 스카이 → e편한세상사천스카이마리나@사천시", () => {
  const rows = [
    c("e편한세상", "광주 서구", "서구 치평동 1234", 30),
    c("e편한세상", "대전 동구", "대전 동구 가양동 1", 8),
    c("e편한세상삼천포오션프라임", "사천시", "사천시 동금동 599", 5),
    c("e편한세상사천스카이마리나", "사천시", "사천시 용현면 선진리 1116", 10),
    c("삼천포e-편한집", "사천시", "사천시 벌리동 449-7", 1),
    c("스카이", "인천 부평구", "인천 부평구 부평동 1", 40),
    c("스카이", "서천군", "서천군 서천읍 1", 3),
    c("나라스카이빌", "사천시", "사천시 정동면 고읍리 449-2", 2),
  ];
  assert.equal(top("E편한세상 사천", rows)[0], "e편한세상사천스카이마리나@사천시");
  assert.equal(top("사천 스카이", rows)[0], "e편한세상사천스카이마리나@사천시");
  /* 이편한세상 표기로 쳐도 같은 단지(질의만 접고 DB 표기로 펼친다) */
  assert.equal(top("이편한세상 사천", rows)[0], "e편한세상사천스카이마리나@사천시");
});

test("괄호·띄어쓰기만 다른 이름 — 한가람삼성 · 그린타운우성", () => {
  const rows = [
    c("한가람", "대전 서구", "대전 서구 월평동 1", 40),
    c("한가람", "서울 용산구", "서울 용산구 이촌동 1", 30),
    c("한가람(삼성)", "안양 동안구", "안양 동안구 관양동 1586-5", 10),
    c("그린타운", "대전 대덕구", "대덕구 법동 1", 30),
    c("그린타운(우성1)", "부천 원미구", "부천시 원미구 중동 1182", 3),
    c("그린타운(우성2)", "부천 원미구", "부천시 원미구 중동 1184-6", 10),
  ];
  assert.equal(top("한가람삼성", rows)[0], "한가람(삼성)@안양 동안구");
  assert.equal(top("그린타운우성", rows)[0], "그린타운(우성2)@부천 원미구");
  assert.equal(top("그린타운 우성", rows)[0], "그린타운(우성2)@부천 원미구");
});

test("오타 — 벽절골롯데 → 벽적골롯데(비슷한 이름 등급), 닮지 않은 이웃 단지는 빠진다", () => {
  const rows = [
    c("벽적골9단지주공", "수원 영통구", "수원 영통구 영통동 970-3", 90),
    c("벽적골두산", "수원 영통구", "수원 영통구 영통동 973-3", 80),
    c("벽적골롯데", "수원 영통구", "수원 영통구 영통동 971-1", 50),
    c("벽적골우성", "수원 영통구", "수원 영통구 영통동 973-3", 70),
  ];
  const r = rankComplexes("벽절골롯데", rows);
  assert.equal(`${r[0].name}@${r[0].region}`, "벽적골롯데@수원 영통구");
  assert.equal(r[0].match.tier, 7, "오타 추정은 등급 7 — 화면이 '비슷한 이름'으로 적는다");
  assert.equal(r.length, 1, "유사도 0.3 미만(벽적골두산 등)은 후보에서 빠진다");
});

test("공작아파트 — '아파트' 꼬리를 떼기 전 원문 일치가 먼저(공작@영등포가 더 활발해도)", () => {
  const rows = [
    c("공작", "서울 영등포구", "서울 영등포구 여의도동 1", 60),
    c("공작", "수원 권선구", "수원 권선구 1", 40),
    c("공작", "인천 서해구", "인천 서해구 1", 20),
    c("공작아파트", "안양 동안구", "안양 동안구 관양동 1588", 10),
    c("공작아파트", "인천 남동구", "남동구 만수동 1079-2", 2),
  ];
  const r = top("공작아파트", rows);
  assert.deepEqual(r.slice(0, 2), ["공작아파트@안양 동안구", "공작아파트@인천 남동구"]);
  assert.equal(r[2], "공작@서울 영등포구", "꼬리 뗀 형은 그 아래(등급 1)");
  /* 거꾸로 "공작" 이라고 치면 원문 일치인 공작들이 먼저 */
  assert.equal(top("공작", rows)[0], "공작@서울 영등포구");
  /* 띄어 쳐도 같다 */
  assert.equal(top("공작 아파트", rows)[0], "공작아파트@안양 동안구");
});

test("힐스테이트 광교 → 힐스테이트광교@수원 영통구 (이천·아산 '힐스테이트' 가 더 닮았다고 이기지 않는다)", () => {
  const rows = [
    c("힐스테이트", "이천시", "이천시 1", 40),
    c("힐스테이트", "아산시", "아산시 1", 30),
    c("힐스테이트광교", "수원 영통구", "수원 영통구 하동 1021", 10),
    c("힐스테이트광교산", "용인 수지구", "용인 수지구 신봉동 1025", 20),
    c("심곡마을광교힐스테이트", "용인 수지구", "용인 수지구 1", 18),
  ];
  assert.equal(top("힐스테이트 광교", rows)[0], "힐스테이트광교@수원 영통구");
  assert.equal(top("힐스테이트광교 아파트", rows)[0], "힐스테이트광교@수원 영통구");
});

test("동탄 롯데캐슬 → 롯데캐슬@화성 동탄구 (지역 토큰 + 남은 이름 정확) — 붙여 쳐도", () => {
  const rows = [
    c("롯데캐슬", "서울 중구", "서울 중구 1", 70),
    c("롯데캐슬", "서울 양천구", "서울 양천구 1", 35),
    c("롯데캐슬", "화성 동탄구", "화성시 동탄구 석우동 55", 10),
    c("롯데캐슬 알바트로스", "화성 동탄구", "화성시 동탄구 청계동 541", 45),
    c("동탄역롯데캐슬", "화성 동탄구", "화성시 동탄구 여울동 1089", 19),
    c("신동탄롯데캐슬", "화성 병점구", "화성시 병점구 반월동 962", 0),
  ];
  assert.equal(top("동탄 롯데캐슬", rows)[0], "롯데캐슬@화성 동탄구");
  assert.equal(top("동탄롯데캐슬", rows)[0], "롯데캐슬@화성 동탄구");
  assert.equal(top("롯데캐슬 동탄", rows)[0], "롯데캐슬@화성 동탄구");
});

test("목동 7단지 → 목동신시가지7@서울 양천구 (다른 시의 '7단지' 나 지번의 7 이 아니다)", () => {
  const rows = [
    c("청학주공(7단지)", "남양주시", "남양주시 별내면 청학리 1", 50),
    c("숲속마을(7단지)", "고양 일산동구", "고양 일산동구 1", 40),
    c("목동신시가지7", "서울 양천구", "서울 양천구 목동 925", 20),
    c("목동동화옥시죤-7", "서울 양천구", "서울 양천구 목동 747-12", 0),
    c("현대", "서울 양천구", "서울 양천구 목동 747-12", 60),
  ];
  const r = top("목동 7단지", rows);
  assert.equal(r[0], "목동신시가지7@서울 양천구");
  assert.ok(!r.includes("현대@서울 양천구"), "주소 지번의 7 은 단지 번호가 아니다");
  assert.equal(top("목동7단지", rows)[0], "목동신시가지7@서울 양천구");
  assert.equal(top("목동신시가지7단지", rows)[0], "목동신시가지7@서울 양천구");
});

test("래미안 퍼스티지 · 은마 · 약칭(마래푸·래대팰·잠실주공)", () => {
  const rows = [
    c("래미안", "인천 연수구", "인천 연수구 1", 30),
    c("래미안블레스티지", "서울 강남구", "서울 강남구 개포동 1", 25),
    c("래미안퍼스티지", "서울 서초구", "서울 서초구 반포동 18-1", 10),
    c("은마", "서울 강남구", "서울 강남구 대치동 316", 20),
    c("은마", "창원 마산회원구", "창원시 마산회원구 1", 1),
    c("은마", "대구 북구", "대구 북구 1", 0),
    c("래미안대치팰리스", "서울 강남구", "서울 강남구 대치동 1027", 19),
    c("래미안파크팰리스", "서울 송파구", "서울 송파구 1", 20),
    c("마포래미안푸르지오1단지", "서울 마포구", "마포구 아현동 777", 6),
    c("마포래미안푸르지오2단지", "서울 마포구", "마포구 아현동 777", 14),
    c("마포래미안푸르지오4단지", "서울 마포구", "마포구 아현동 777", 17),
    c("주공아파트 5단지", "서울 송파구", "서울 송파구 잠실동 27", 40),
    c("주공5단지", "증평군", "증평군 1", 0),
    c("운암주공5단지", "오산시", "오산시 1", 37),
    c("한솔마을(5단지)(주공)", "성남 분당구", "성남 분당구 1", 98),
  ];
  assert.equal(top("래미안 퍼스티지", rows)[0], "래미안퍼스티지@서울 서초구");
  assert.equal(top("은마", rows)[0], "은마@서울 강남구");
  assert.equal(top("은마아파트", rows)[0], "은마@서울 강남구");
  assert.equal(top("대치 은마", rows)[0], "은마@서울 강남구");
  assert.equal(top(expandComplexAlias("마래푸"), rows)[0], "마포래미안푸르지오4단지@서울 마포구");
  assert.equal(top(expandComplexAlias("래대팰"), rows)[0], "래미안대치팰리스@서울 강남구");
  assert.equal(top(expandComplexAlias("잠실주공"), rows)[0], "주공아파트 5단지@서울 송파구");
  assert.equal(top(expandComplexAlias("잠실주공5단지"), rows)[0], "주공아파트 5단지@서울 송파구");
});

test("중리현대 — 실거래에 없는 단지: 엉뚱한 1위를 만들지 않는다", () => {
  const rows = [
    c("중리백로", "창원 마산회원구", "창원시 마산회원구 내서읍 중리 1054", 7),
    c("중리롯데캐슬", "대구 서구", "서구 중리동 26-1", 21),
    c("현대", "창원 마산회원구", "창원시 마산회원구 1", 30),
    c("중리광명", "대구 서구", "서구 중리동 130", 0),
  ];
  assert.deepEqual(rankComplexes("중리현대", rows), []);
});

test("약칭 펼침 — 단지 검색은 '아파트' 를 떼지 않고, 다른 그룹용 normalizeSearchQuery 는 예전대로", () => {
  assert.equal(expandComplexAlias("  공작아파트 "), "공작아파트");
  assert.equal(expandComplexAlias("마 래 푸"), "마포래미안푸르지오");
  assert.equal(normalizeSearchQuery("공작아파트"), "공작");
  assert.equal(normalizeSearchQuery("래대팰"), "래미안대치팰리스");
});

test("정규화 키·토큰·쪼개기 — DB 표현식과 같은 규칙", () => {
  assert.equal(complexNameKey("그린타운(우성2)"), "그린타운우성2");
  assert.equal(complexNameKey("E-편한세상 (사천)"), "e편한세상사천");
  assert.equal(complexNameKey("철산역롯데캐슬&SKVIEW클래스티지"), "철산역롯데캐슬skview클래스티지");
  assert.deepEqual(tokenizeComplexQuery("목동7단지"), ["목동", "7"]);
  assert.deepEqual(tokenizeComplexQuery("E편한세상 사천(스카이)-2차"), ["e편한세상", "사천", "스카이", "2차"]);
  assert.deepEqual(tokenizeComplexQuery("은마 아파트"), ["은마"]);
  assert.deepEqual(tokenizeComplexQuery("SK뷰 에스케이뷰"), ["skview"]);
  assert.deepEqual(splitCompound("동탄롯데캐슬"), [
    ["동탄", "롯데캐슬"],
    ["동탄롯", "데캐슬"],
    ["동탄롯데", "캐슬"],
  ]);
  assert.deepEqual(splitCompound("중리현대"), [["중리", "현대"]]);
  const pq = parseComplexQuery("공작아파트");
  assert.ok(pq.formsX.includes("공작"));
  assert.ok(!parseComplexQuery("7단지").formsP.includes("7"), "꼬리 뗀 1자 형은 앞부분·포함 비교에 쓰지 않는다");
});

test("유사도 — pg_trgm similarity() 와 같은 값(운영 DB 로 잰 값)", () => {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.001;
  assert.ok(close(trigramSimilarity("벽적골롯데", "벽절골롯데"), 0.333333));
  assert.ok(close(trigramSimilarity("그린타운(우성2)", "그린타운우성"), 0.333333));
  assert.ok(close(trigramSimilarity("e편한세상사천스카이마리나", "E편한세상 사천"), 0.277778));
  assert.ok(close(trigramSimilarity("한가람(삼성)", "한가람삼성"), 0.444444));
});

test("SQL(search_complexes_preview v3 — 최신 정의)과 규칙이 갈라지지 않았다 — 표기 표·시·도 표·표현식·등급 순서", () => {
  const sql = readFileSync("supabase/migrations/20260921003000_1008_search_complexes_preview_v3.sql", "utf8");
  const arr = (name: string): string[] => {
    const m = sql.match(new RegExp(`${name}\\s+constant text\\[\\] := array\\[([^\\]]*)\\]`));
    assert.ok(m, `${name} 배열이 SQL 에 있다`);
    return m![1].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));
  };
  assert.deepEqual(arr("fold_from"), BRAND_FOLDS.map(([f]) => f));
  assert.deepEqual(arr("fold_to"), BRAND_FOLDS.map(([, t]) => t));
  assert.deepEqual(arr("alt_c"), BRAND_ALTS.map(([c0]) => c0));
  assert.deepEqual(arr("alt_a"), BRAND_ALTS.map(([, a]) => a));
  /* [1008 · 리뷰 B] 시·도 표 · 광역·특별시 구 정규식 · 길이/토큰 상한(통합자가 v2 에 더한 것) */
  assert.deepEqual(arr("do_short"), [...PROVINCE_DO_SHORT]);
  assert.deepEqual(arr("do_long"), [...PROVINCE_DO_LONG]);
  const metro = sql.match(/metro_re\s+constant text := '([^']*)'/);
  assert.ok(metro, "metro_re 가 SQL 에 있다");
  assert.equal(metro![1], METRO_REGION.source);
  assert.match(sql, new RegExp(`left\\(btrim\\(regexp_replace\\(coalesce\\(p_q, ''\\), '\\\\s\\+', ' ', 'g'\\)\\), ${COMPLEX_QUERY_MAX}\\)`));
  assert.ok(sql.includes(`exit when array_length(toks, 1) >= ${COMPLEX_TOKEN_MAX};`), "토큰 상한");
  /* 두 가지로 읽기(이름 먼저 · 지역 먼저) · 한 글자 토큰은 지역에서 찾지 않음 · 구분자 있는 2자 키 */
  assert.ok(sql.includes("as in_name2") && sql.includes("as in_region2") && sql.includes("as name_join2"), "지역 먼저 읽기");
  assert.match(sql, /if length\(t\) < 2 then\s+--[^\n]*\n\s+s_rre := s_rre \|\| null::text;/);
  assert.ok(sql.includes("where length(v) = 2 and (v <> k0 or q ~ '[^0-9A-Za-z가-힣]')"), "구분자 있는 2자 키");
  assert.ok(sql.includes("and not (%9$L::boolean and rk.region_name ~ %10$L)"), "도를 버린 질의의 광역·특별시 구 제외");
  /* 정규화 표현식 = 인덱스 표현식(글자 그대로여야 인덱스를 탄다) */
  const idx = readFileSync("supabase/migrations/20260921000900_1008_complex_tx_stats_name_norm_trgm.sql", "utf8");
  const expr = "regexp_replace(lower(complex_name), '[^0-9a-z가-힣]', '', 'g')";
  assert.ok(idx.includes(`((${expr})`), "인덱스 표현식");
  assert.ok(sql.includes(expr.replace("complex_name", "b.complex_name")), "함수의 후보 조건 표현식");
  /* 등급 순서와 정렬 키 */
  assert.match(sql, /then 0\s+when sc\.nn = any\(%5\$L::text\[\]\)[\s\S]*?then 1\s+when st\.set_tier = 2 then 2\s+when sc\.nn like any\(%6\$L::text\[\]\) then 3\s+when sc\.nn like any\(%7\$L::text\[\]\) then 4\s+when st\.set_tier = 5 then 5\s+when st\.set_tier = 6 then 6\s+else 7/);
  assert.match(sql, /order by rk\.tier, rk\.name_tokens desc, case when rk\.tier < 7 then rk\.recent_trade_count else 0 end desc,\s+rk\.sim desc, rk\.recent_trade_count desc, rk\.trade_count desc/);
  assert.match(sql, /where \(?rk\.tier < 7 or rk\.sim >= 0\.3/);
  /* 같은 시그니처·반환형(ACL 유지) · 새 GRANT 없음 */
  assert.match(sql, /create or replace function public\.search_complexes_preview\(p_q text, p_limit integer default 8\)/);
  assert.match(sql, /returns table\(complex_id text, region_name text, complex_name text, address text, trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint, avg_area_m2 numeric, build_year integer, households integer, lat double precision, lng double precision, sim real, exact boolean\)/);
  /* 주석("새 GRANT 없음")은 빼고 문장만 본다 */
  assert.doesNotMatch(sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, ""), /\bgrant\b/i);
});

test("강조 — 괄호·띄어쓰기를 건너뛰어 원래 글자에 칠한다", () => {
  const on = (text: string, q: string) =>
    highlightParts(text, q)
      .filter((p) => p.hit)
      .map((p) => p.text)
      .join("|");
  assert.equal(on("한가람(삼성)", "한가람삼성"), "한가람|삼성");
  assert.equal(on("e편한세상사천스카이마리나", "E편한세상 사천"), "e편한세상사천");
  assert.equal(on("롯데캐슬", "동탄 롯데캐슬"), "롯데캐슬");
  assert.equal(on("목동신시가지7", "목동 7단지"), "목동|7");
  assert.equal(on("공작아파트", "공작아파트"), "공작아파트");
  assert.equal(on("은마", "은마 아파트"), "은마");
  assert.equal(on("벽적골롯데", "벽절골롯데"), "", "오타는 칠하지 않는다(같은 글자가 없다)");
  assert.deepEqual(highlightParts("SKVIEW", ""), [{ text: "SKVIEW", hit: false }]);
});

test("미리보기 한 줄 — 모르는 값은 빼고, 0건은 '거래 없음'으로", () => {
  assert.equal(complexPlace({ region: "안양 동안구", area: "관양동" }), "안양 동안구 관양동");
  assert.equal(complexPlace({ region: "사천시", area: null }), "사천시");
  assert.deepEqual(
    complexFacts({ id: "x", name: "공작아파트", region: "안양 동안구", households: 1710, recentTradeCount: 120 }),
    ["1,710세대", "6개월 거래 120건"],
  );
  assert.deepEqual(complexFacts({ id: "x", name: "은마", region: "대구 북구", households: null, recentTradeCount: 0 }), [
    "6개월 거래 없음",
  ]);
  assert.deepEqual(complexFacts({ id: "x", name: "a", region: "b" }), []);
});

test("RPC 행 재정렬 — v1(직전 정의)이 준 순서라도 같은 규칙으로 다시 세우고, '비슷한 이름' 은 TS 판정으로", () => {
  const row = (name: string, region: string, address: string, recent: number, exact: boolean): PreviewRow => ({
    complex_id: `${region}|${name}`,
    region_name: region,
    complex_name: name,
    address,
    trade_count: recent + 3,
    recent_trade_count: recent,
    avg_price_manwon: null,
    avg_area_m2: null,
    build_year: null,
    households: null,
    lat: null,
    lng: null,
    sim: null,
    exact,
  });
  /* v1 이 실제로 낸 순서(운영 2026-09-21): 힐스테이트@이천 · @아산 · 힐스테이트광교 — v1 의 exact 는 "앞글자 일치" */
  const hits = rankPreviewRows(parseComplexQuery("힐스테이트 광교"), [
    row("힐스테이트", "이천시", "이천시 갈산동 781", 14, false),
    row("힐스테이트", "아산시", "아산시 온천동 1910", 12, false),
    row("힐스테이트광교", "수원 영통구", "수원 영통구 하동 1021", 32, false),
  ]);
  assert.deepEqual(
    hits.map((h) => `${h.name}@${h.region}:${h.fuzzy ? "비슷" : "맞음"}`),
    ["힐스테이트광교@수원 영통구:맞음", "힐스테이트@이천시:비슷", "힐스테이트@아산시:비슷"],
  );
  assert.equal(hits[0].area, "하동", "읍면동은 대표 지번에서");
  /* 규칙에 전혀 안 맞는 행(유사도 0.3 미만)도 버리지 않고 맨 뒤 '비슷한 이름' 으로 */
  const loose = rankPreviewRows(parseComplexQuery("사천 스카이"), [
    row("스카이", "인천 부평구", "인천 부평구 1", 2, false),
    row("e편한세상사천스카이마리나", "사천시", "사천시 용현면 선진리 1116", 11, true),
  ]);
  assert.deepEqual(loose.map((h) => [h.name, h.fuzzy]), [
    ["e편한세상사천스카이마리나", false],
    ["스카이", true],
  ]);
});

/* ── [1008 · 리뷰 B] 시·도 낱말 · 지역 먼저 읽기 · 한 글자 토큰 · 초성 · 상한 ─────────────────────────────
   이름·지역·주소는 운영 DB(complex_tx_stats_base)의 실제 표기, 거래 건수는 테스트용 가짜 숫자다. */

test("시·도 낱말 정리 — 도는 버리고(짧은 꼴은 맨 앞만), 특별·광역시는 꼬리만, '아파트'뿐이면 손대지 않는다", () => {
  assert.deepEqual(stripProvinceWords("경남 사천 e편한세상"), { text: "사천 e편한세상", doContext: true });
  assert.deepEqual(stripProvinceWords("경기도 수원 힐스테이트"), { text: "수원 힐스테이트", doContext: true });
  assert.deepEqual(stripProvinceWords("경기 광주 롯데캐슬"), { text: "광주 롯데캐슬", doContext: true });
  assert.deepEqual(stripProvinceWords("부산광역시 해운대 자이"), { text: "부산 해운대 자이", doContext: false });
  assert.deepEqual(stripProvinceWords("서울특별시 은마"), { text: "서울 은마", doContext: false });
  assert.deepEqual(stripProvinceWords("세종특별자치시 한신"), { text: "세종 한신", doContext: false });
  assert.deepEqual(stripProvinceWords("강원특별자치도 춘천 한신"), { text: "춘천 한신", doContext: true });
  assert.deepEqual(stripProvinceWords("경상남도 사천시 e편한세상"), { text: "사천시 e편한세상", doContext: true });
  /* 맨 앞이 아닌 짧은 꼴은 단지명일 수 있다("동래 경남" = 경남아파트) · 긴 꼴은 어디서든 */
  assert.deepEqual(stripProvinceWords("동래 경남"), { text: "동래 경남", doContext: false });
  assert.deepEqual(stripProvinceWords("힐스테이트 수원 경기도"), { text: "힐스테이트 수원", doContext: true });
  /* 남는 게 '아파트'·번호뿐이면 그대로 — "경남 아파트" 는 경남아파트다 */
  assert.deepEqual(stripProvinceWords("경남 아파트"), { text: "경남 아파트", doContext: false });
  assert.deepEqual(stripProvinceWords("경기 1단지"), { text: "경기 1단지", doContext: false });
  /* 한 낱말·시·도뿐 */
  assert.deepEqual(stripProvinceWords("경기"), { text: "경기", doContext: false });
  assert.deepEqual(stripProvinceWords("경기 강원"), { text: "경기 강원", doContext: false });
  /* 공백 정리 · 80자 상한이 먼저 */
  assert.equal(normalizeComplexQueryText("  경남   사천  ").text, "사천");
  assert.equal(normalizeComplexQueryText("가".repeat(100)).text.length, COMPLEX_QUERY_MAX);
  /* 토큰 6개 상한(SQL 과 같다) */
  assert.equal(tokenizeComplexQuery("가나 다라 마바 사아 자차 카타 파하 거너").length, COMPLEX_TOKEN_MAX);
});

test("시·도가 붙은 질의 — 목표가 1위(비슷한 이름으로 밀리지 않는다)", () => {
  const rows = [
    c("e편한세상", "광주 서구", "서구 광천동 895", 40),
    c("e편한세상 다산", "남양주시", "남양주시 다산동 6091", 71),
    c("e편한세상삼천포오션프라임", "사천시", "사천시 동금동 599", 5),
    c("e편한세상사천스카이마리나", "사천시", "사천시 용현면 선진리 1116", 11),
    c("힐스테이트", "이천시", "이천시 갈산동 781", 90),
    c("힐스테이트 율곡", "김천시", "김천시 율곡동 773", 60),
    c("힐스테이트푸르지오수원", "수원 팔달구", "수원시 팔달구 매교동 292", 30),
    c("힐스테이트영통", "수원 영통구", "수원 영통구 망포동 728", 20),
    c("힐스테이트광교", "수원 영통구", "수원 영통구 하동 1021", 10),
    c("운암동롯데캐슬1단지", "광주 북구", "북구 운암동 364-1", 90),
    c("초월롯데캐슬", "광주시", "광주시 초월읍 쌍동리 390", 10),
    c("오포롯데캐슬포레스트", "광주시", "광주시 능평동 917", 6),
    c("롯데캐슬", "화성 동탄구", "화성시 동탄구 석우동 55", 80),
    c("해운대자이1단지", "부산 해운대구", "해운대구 우동 1527", 13),
    c("해운대자이2차1단지", "부산 해운대구", "해운대구 우동 1536", 19),
    c("은마", "서울 강남구", "서울 강남구 대치동 316", 1),
    c("은마", "창원 마산회원구", "창원시 마산회원구 구암동 16-9", 50),
    c("경남아파트", "서울 금천구", "금천구 시흥동 820-12", 3),
    c("경남", "서울 영등포구", "서울 영등포구 신길동 67-1", 30),
    c("한신엘리트파크(범지기9단지)", "세종시", "세종시 아름동 1282", 5),
    c("한신", "서울 도봉구", "도봉구 도봉동 30-1", 40),
  ];
  const r1 = top("경남 사천 e편한세상", rows);
  assert.deepEqual(r1.slice(0, 2), ["e편한세상사천스카이마리나@사천시", "e편한세상삼천포오션프라임@사천시"]);
  assert.match(top("경기도 수원 힐스테이트", rows)[0], /@수원 /);
  assert.ok(!top("경기도 수원 힐스테이트", rows).slice(0, 3).includes("힐스테이트@이천시"));
  /* 도를 버렸으면 광역시 구는 후보가 아니다 — 경기 광주시("광주시")만 */
  const r3 = top("경기 광주 롯데캐슬", rows);
  assert.equal(r3[0], "초월롯데캐슬@광주시");
  assert.ok(!r3.includes("운암동롯데캐슬1단지@광주 북구"), "광주광역시 북구는 경기가 아니다");
  /* 도 없이 "광주" 만이면 둘 다 후보다 */
  assert.ok(top("광주 롯데캐슬", rows).includes("운암동롯데캐슬1단지@광주 북구"));
  assert.equal(top("부산광역시 해운대 자이", rows)[0], "해운대자이2차1단지@부산 해운대구");
  /* 서울특별시 → 서울(지역 토큰): 강남 은마가 창원 은마(거래 더 많음)보다 위, 창원 은마는 비슷한 이름 */
  const r5 = rankComplexes("서울특별시 은마", rows);
  assert.equal(`${r5[0].name}@${r5[0].region}`, "은마@서울 강남구");
  assert.ok(r5[0].match.tier < 7);
  assert.equal(r5.find((x) => x.region === "창원 마산회원구")?.match.tier, 7);
  /* "경남 아파트" 는 경남아파트(시·도로 보지 않는다) */
  assert.equal(top("경남 아파트", rows)[0], "경남아파트@서울 금천구");
  /* 세종은 지역 토큰으로 남는다 */
  assert.equal(top("세종 한신", rows)[0], "한신엘리트파크(범지기9단지)@세종시");
});

test("지역 먼저 읽기 — 토큰이 이름과 지역 둘 다에 있으면 나은 등급('사천 e편한세상')", () => {
  const rows = [
    c("e편한세상삼천포오션프라임", "사천시", "사천시 동금동 599", 5),
    c("e편한세상사천스카이마리나", "사천시", "사천시 용현면 선진리 1116", 11),
    c("래미안블레스티지", "서울 강남구", "강남구 개포동 1280", 25),
    c("래미안강남힐즈", "서울 강남구", "강남구 자곡동 611", 13),
  ];
  const r = rankComplexes("사천 e편한세상", rows);
  assert.equal(`${r[0].name}@${r[0].region}`, "e편한세상사천스카이마리나@사천시");
  assert.equal(r[0].match.tier, 5, "사천=지역 · e편한세상=이름 앞부분");
  /* 래미안강남힐즈도 '강남' 을 지역으로 읽으면 지역+앞부분(등급 5) */
  assert.equal(rankComplexes("강남 래미안", rows).find((x) => x.name === "래미안강남힐즈")?.match.tier, 5);
});

test("한 글자 토큰은 지역·주소에서 찾지 않는다 — '은 마' 의 '마' 가 창원 마산회원구에 걸리지 않게", () => {
  const rows = [
    c("은마", "서울 강남구", "서울 강남구 대치동 316", 23),
    c("은마", "창원 마산회원구", "창원시 마산회원구 구암동 16-9", 1),
    c("은마", "대구 북구", "북구 태전동 254-3", 0),
  ];
  assert.deepEqual(top("은 마", rows), ["은마@서울 강남구", "은마@창원 마산회원구", "은마@대구 북구"]);
  assert.deepEqual(
    rankComplexes("은 마", rows).map((x) => x.match.nameTokens),
    [2, 2, 2],
  );
});

test("RPC 행 — 초성은 RPC 순서·확실한 일치 그대로, 도를 버린 질의는 광역시 구 행을 뺀다", () => {
  const row = (name: string, region: string, address: string, recent: number, exact: boolean): PreviewRow => ({
    complex_id: `${region}|${name}`,
    region_name: region,
    complex_name: name,
    address,
    trade_count: recent + 3,
    recent_trade_count: recent,
    avg_price_manwon: null,
    avg_area_m2: null,
    build_year: null,
    households: null,
    lat: null,
    lng: null,
    sim: 0,
    exact,
  });
  /* 운영 v2 "ㄹㅁㅇ" 의 실제 행 순서(초성 앞글자 일치 → 최근 거래) */
  const cho = rankPreviewRows(parseComplexQuery("ㄹㅁㅇ"), [
    row("래미안안양메가트리아", "안양 만안구", "안양시 만안구 안양동 1393", 215, true),
    row("래미안어반파크1단지", "부산 부산진구", "부산진구 연지동 415", 72, true),
    row("래미안하이어스", "군포시", "군포시 산본동 1240", 65, true),
  ]);
  assert.deepEqual(
    cho.map((h) => `${h.name}:${h.fuzzy ? "비슷" : "맞음"}`),
    ["래미안안양메가트리아:맞음", "래미안어반파크1단지:맞음", "래미안하이어스:맞음"],
  );
  const pq = parseComplexQuery("경기 광주 롯데캐슬");
  assert.equal(pq.doContext, true);
  const hits = rankPreviewRows(pq, [
    row("운암동롯데캐슬1단지", "광주 북구", "북구 운암동 364-1", 19, false),
    row("초월롯데캐슬", "광주시", "광주시 초월읍 쌍동리 390", 10, false),
  ]);
  assert.deepEqual(hits.map((h) => `${h.name}@${h.region}:${h.fuzzy ? "비슷" : "맞음"}`), ["초월롯데캐슬@광주시:맞음"]);
  assert.ok(METRO_REGION.test("세종시") && METRO_REGION.test("서울 강남구") && !METRO_REGION.test("광주시"));
});

