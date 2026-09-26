import { NextResponse } from "next/server";
import { searchComplexes, suggestComplexes, type ComplexRow } from "@/lib/complex/complex-store";
import { parseDong } from "@/lib/complex/dong";
import { searchComplexPreviews } from "@/lib/search/complex-search";
import type { ComplexPreview } from "@/lib/search/complex-preview";
import { LISTING_TYPE_LABEL, type ListingType } from "@/lib/listings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatPriceKrw, formatRentLabel } from "@/lib/listings/format";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";
import { expandComplexAlias, normalizeSearchQuery } from "@/lib/search/normalize-query";
import { isStoryPost } from "@/lib/town/post-href";

/* 통합 검색 API — 단지 + 매물 + 임장노트 + 이야기 + 뉴스를 한 번에.
   그룹별 상위 ~5건, 각 소스 실패 시 해당 그룹만 [] (부분 실패 허용).

   [1007 · P2] "뉴스" 그룹이 board_posts 전체(자동수집 여부 무관)를 한 종류로 돌려주고
   클라이언트가 전부 /town/news/ 로 보냈다 — 1006 이 사람 글을 /town/story/ 로 분리했는데
   검색만 옛 규칙이었다(사람 글이면 리다이렉트 한 홉). 이제 이야기(stories)와 뉴스(news)를
   가른다: 판정은 lib/town/post-href isStoryPost(is_automated ≠ true) 하나. 이야기는
   posts 표(이웃 글의 주 소스)도 함께 찾는다 — 예전엔 posts 표가 검색 대상이 아니었다.

   매물·노트·뉴스는 검색어를 DB단 ilike 로 내려보낸다. 예전엔 "최신 상위 N건을
   통째로 받아 JS includes" 방식이라, 최신 N건 밖의 글은 검색어가 정확해도
   영원히 검색되지 않았다(도달 불가).

   [1008 · S] 단지 그룹은 자동완성과 같은 search_complexes_preview(v2)를 먼저 부른다.
   예전의 searchComplexes 는 complex_name ILIKE '%원문%' 이라 띄어쓰기·괄호 한 글자 차이에 0건이었다 —
   2026-09-21 실측 /search 검색 11건 중 9건(82%)이 결과 없음("E편한세상 사천"×3 · "사천 스카이" ·
   "한가람삼성" · "그린타운우성" · "벽절골롯데"). 미리보기 값(읍면동·세대수·6개월 거래)도 함께 내려
   같은 이름 단지를 고를 수 있게 한다. RPC 가 실패했거나 '비슷한 이름' 만 줬으면 searchComplexes(같은 순위
   규칙의 집계표 경로)가 한 번 더 본다. */

export const runtime = "nodejs";

const GROUP_CAP = 5;

/** [1008 · S] 미리보기 값(area·households·recentTradeCount·avgPriceManwon·buildYear·fuzzy)은 선택 — 옛 응답엔 없다 */
export interface UnifiedComplex extends ComplexPreview {
  id: string;
  name: string;
  region: string;
}

/** 단지 행 → 통합 검색 단지 항목("사천시 사천시" 처럼 시군구가 한 낱말일 때 두 번 적지 않는다) */
function complexRowToUnified(c: ComplexRow): UnifiedComplex {
  return {
    id: c.id,
    name: c.name,
    region: c.city === c.district ? c.city : `${c.city} ${c.district}`.trim(),
    area: parseDong(c.address),
    households: c.households,
    buildYear: c.build_year,
  };
}
export interface UnifiedListing {
  id: string;
  title: string;
  price: string;
}
export interface UnifiedNote {
  id: string;
  title: string;
}
export interface UnifiedNews {
  id: string;
  title: string;
  source: string;
  /** [1007] 표시 시각(ISO) — source_published_at 없으면 created_at. 클라이언트가 상대 시각으로 그린다 */
  publishedAt: string | null;
}
/** [1007 · P2] 이웃 글(이야기) — 작성자·동네·댓글 수(뉴스 행과 다른 재질로 그린다) */
export interface UnifiedStory {
  id: string;
  title: string;
  author: string;
  /** "서울 송파구" — 없으면 "" */
  region: string;
  createdAt: string | null;
  /** 댓글 수 — posts 표는 comment_count 컬럼. board_posts 는 세지 않는다(null: 중첩 count 가
   *  pg_stat 상위 229ms×21k 였다 — P1 이 정리 중인 경로를 검색이 또 밟지 않는다) */
  commentCount: number | null;
}

export interface UnifiedResults {
  complexes: UnifiedComplex[];
  listings: UnifiedListing[];
  notes: UnifiedNote[];
  stories: UnifiedStory[];
  news: UnifiedNews[];
}

function listingPrice(row: {
  listing_type: string;
  price_krw: number | null;
  deposit_krw: number | null;
  monthly_krw: number | null;
}): string {
  if (row.listing_type === "monthly") {
    return formatRentLabel(row.deposit_krw ?? 0, row.monthly_krw ?? 0);
  }
  const won = row.listing_type === "jeonse" ? row.deposit_krw : row.price_krw;
  return won != null ? formatPriceKrw(won) : "—";
}

/**
 * 그룹별 조회 — 실패해도 다른 그룹은 살린다. 다만 빈 배열로 뭉개지 않는다.
 *
 * 예전엔 `catch { return [] }` 였다. 그러면 DB 가 흔들린 순간 화면은
 * "‘{검색어}’ 검색 결과가 없어요"라고 단정했다 — 매물도 노트도 그대로 있는데.
 * 사용자는 검색어를 의심하며 같은 검색을 반복하게 된다. 그래서 실패한 그룹의
 * 이름을 응답에 실어 보내고(failed[]), 클라이언트가 "없음"과 다른 문장을 쓴다.
 */
type GroupResult<T> = { rows: T[]; failed: boolean };
async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<GroupResult<T>> {
  try {
    return { rows: await fn(), failed: false };
  } catch (e) {
    logger.error(`[db-unavailable] 통합 검색 — ${label}`, e);
    return { rows: [], failed: true };
  }
}

/** PostgREST or() 필터에 안전한 ilike 패턴 — 구문 문자(콤마·괄호)와 와일드카드 제거.
 *  [개선 #31] 공백은 % 로 바꾼다: "잠실 주공" ↔ "잠실주공5단지"처럼 띄어쓰기
 *  표기 차이가 0건의 최다 원인이었다(단어 순서는 유지된 채 사이만 느슨해진다). */
function ilikePattern(term: string): string {
  return `%${term
    .replace(/[,()%_]/g, " ")
    .trim()
    .replace(/\s+/g, "%")}%`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  // [개선 #31] 통용 약칭·"아파트" 꼬리 정규화 — 응답의 query 는 사용자가 친 원문 유지
  const q = normalizeSearchQuery(rawQ);
  /* [1008 · S] 단지 그룹은 약칭만 펼치고 '아파트' 꼬리를 떼지 않는다 — 원문 일치("공작아파트")를
     먼저 보고 꼬리 뗀 형("공작")을 그 아래에 둔다(순위 규칙 lib/search/complex-match). */
  const complexQ = expandComplexAlias(rawQ);

  const empty: UnifiedResults = { complexes: [], listings: [], notes: [], stories: [], news: [] };
  if (!q) return NextResponse.json({ ...empty, query: rawQ });
  /* [1007 · 리뷰 L3] 검색어 길이 상한 — 이야기 본문 ilike 가 붙어 긴 검색어의 비용이 커졌다. 80자면
     단지명·주소·문장 검색 전부를 덮고, 그 이상은 검색이 아니라 붙여넣기다. */
  if (q.length > 80) {
    return NextResponse.json({ ...empty, query: rawQ, error: "검색어는 80자까지예요" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const pattern = ilikePattern(q);
  let complexPartial = false;

  const [complexes, listings, notes, storyPosts, board] = await Promise.all([
    // 단지 — [1008 · S] search_complexes_preview(v2 순위 + 미리보기 값) 먼저, 실패하면 searchComplexes.
    safe<UnifiedComplex>("단지", async () => {
      const hits = await searchComplexPreviews(complexQ, GROUP_CAP);
      /* [1008 · 리뷰 B] RPC 를 못 물어봤으면 집계표 경로의 답은 불완전하다 — 캐시하지 않고, 0건이어도 무결과로
         기록하지 않는다(아래 search_zero_results). */
      if (hits === null) complexPartial = true;
      const fromHits = () =>
        (hits ?? []).slice(0, GROUP_CAP).map((h) => ({
          id: h.id,
          name: h.name,
          region: h.region,
          area: h.area ?? null,
          households: h.households ?? null,
          recentTradeCount: h.recentTradeCount ?? null,
          avgPriceManwon: h.avgPriceManwon ?? null,
          buildYear: h.buildYear ?? null,
          fuzzy: h.fuzzy === true,
        }));
      if (hits && hits.some((h) => !h.fuzzy)) return fromHits();
      /* 실패(null)·0건·'비슷한 이름' 뿐이면 집계표 경로(같은 순위 규칙, 확실한 일치만)가 한 번 더 본다 —
         RPC 가 아직 v1 이면 동네+단지명·괄호·띄어쓰기 차이를 여기서 잡는다(suggest 라우트 주석의 실측).
         거기서도 없으면 RPC 의 비슷한 이름 후보를 배지와 함께 둔다. RPC 는 다시 부르지 않는다(skipRpc). */
      let rows: ComplexRow[] = [];
      try {
        rows = await searchComplexes(complexQ, undefined, GROUP_CAP, undefined, { skipRpc: true });
      } catch (e) {
        if (!hits || hits.length === 0) throw e;
        /* 비슷한 이름 후보는 있다 — 보여 주되 불완전한 답이라 캐시하지 않는다(아래 Cache-Control) */
        complexPartial = true;
        logger.warn("[search] 통합 검색 단지 집계표 경로 실패 — 비슷한 이름 후보만 보냅니다", e);
      }
      return rows.length > 0 ? rows.slice(0, GROUP_CAP).map(complexRowToUnified) : fromHits();
    }),
    // 매물 — 승인 매물에서 단지명·지역·설명을 DB단 ilike 매칭
    safe<UnifiedListing>("매물", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("listings")
        .select("id, complex_name, region_name, listing_type, price_krw, deposit_krw, monthly_krw")
        .eq("status", "approved")
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .or(
          `complex_name.ilike.${pattern},region_name.ilike.${pattern},description.ilike.${pattern}`,
        )
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      /* error 와 !data 를 같이 묶으면 "못 읽음"이 "없음"이 된다 — 나눠서 던진다. */
      if (error) throw new Error(`listings 조회 실패: ${error.message}`);
      if (!data) return [];
      return (data as Array<Record<string, unknown>>).map((l) => ({
        id: String(l.id),
        title: `${String(l.complex_name ?? "")} · ${
          LISTING_TYPE_LABEL[(l.listing_type as ListingType) ?? "sale"] ?? "매물"
        }`,
        price: listingPrice({
          listing_type: String(l.listing_type ?? "sale"),
          price_krw: l.price_krw != null ? Number(l.price_krw) : null,
          deposit_krw: l.deposit_krw != null ? Number(l.deposit_krw) : null,
          monthly_krw: l.monthly_krw != null ? Number(l.monthly_krw) : null,
        }),
      }));
    }),
    // 임장노트 — 공개 노트에서 제목·지역·단지명·요약을 DB단 ilike 매칭
    safe<UnifiedNote>("임장노트", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("inspection_notes")
        .select("id, title")
        .eq("is_public", true)
        .or(
          /* [#129] 메모 본문까지 전문 검색 — trgm 인덱스(20260823150000)로 뒷받침 */
          `title.ilike.${pattern},region.ilike.${pattern},apt_name.ilike.${pattern},summary.ilike.${pattern},sections->>memo.ilike.${pattern}`,
        )
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error) throw new Error(`inspection_notes 조회 실패: ${error.message}`);
      if (!data) return [];
      return (data as Array<Record<string, unknown>>).map((n) => ({
        id: String(n.id),
        title: String(n.title ?? "임장노트"),
      }));
    }),
    // [1007] 이야기 — posts 표(이웃 글)에서 제목·시/구·본문을 DB단 ilike 매칭.
    // link_only 는 검색에 늘어놓지 않는다(글감 스레드와 같은 규칙). visibility 가 비어 있는
    // 옛 글은 공개다.
    safe<UnifiedStory>("이야기", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("posts")
        .select("id, title, author_label, city, district, created_at, comment_count, is_automated")
        .or("visibility.is.null,visibility.eq.public")
        .or(`title.ilike.${pattern},city.ilike.${pattern},district.ilike.${pattern},body.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error) throw new Error(`posts 조회 실패: ${error.message}`);
      if (!data) return [];
      return (data as Array<Record<string, unknown>>)
        .filter((p) => isStoryPost({ isAutomated: p.is_automated === true }))
        .map((p) => ({
          id: String(p.id),
          title: String(p.title ?? ""),
          author: String(p.author_label || "이웃"),
          region: `${String(p.city ?? "")} ${String(p.district ?? "")}`.trim(),
          createdAt: p.created_at ? String(p.created_at) : null,
          commentCount: Number(p.comment_count ?? 0) || 0,
        }));
    }),
    // 뉴스 — board_posts 에서 제목·분류를 DB단 ilike 매칭. 자동수집(뉴스)과 비자동(이야기)이
    // 한 표에 있으므로 한 번 읽어 아래에서 is_automated 로 가른다(질의 1회 유지).
    safe<Record<string, unknown>>("뉴스", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("board_posts")
        .select("id, title, category, source_name, source_published_at, created_at, is_automated, region")
        .eq("board_type", "community")
        .eq("is_published", true)
        .or(`title.ilike.${pattern},category.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP * 2);
      if (error) throw new Error(`board_posts 조회 실패: ${error.message}`);
      if (!data) return [];
      return data as Array<Record<string, unknown>>;
    }),
  ]);

  /* [1007] board_posts 행을 재질로 가른다 — 기사(is_automated=true)는 news, 나머지는 stories 뒤에 붙는다 */
  const boardNews: UnifiedNews[] = [];
  const boardStories: UnifiedStory[] = [];
  for (const p of board.rows) {
    if (isStoryPost({ isAutomated: p.is_automated === true })) {
      boardStories.push({
        id: String(p.id),
        title: String(p.title ?? ""),
        author: "이웃",
        region: p.region ? String(p.region) : "",
        createdAt: p.created_at ? String(p.created_at) : null,
        commentCount: null,
      });
    } else {
      boardNews.push({
        id: String(p.id),
        title: String(p.title ?? ""),
        source: String(p.source_name || p.category || "뉴스"),
        publishedAt: p.source_published_at
          ? String(p.source_published_at)
          : p.created_at
            ? String(p.created_at)
            : null,
      });
    }
  }
  const news = { rows: boardNews.slice(0, GROUP_CAP), failed: board.failed };
  /* posts 표 실패와 board_posts 실패는 따로 센다 — 한쪽만 실패해도 "이야기" 는 못 불러온 것이다 */
  const stories = {
    rows: [...storyPosts.rows, ...boardStories]
      .sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))
      .slice(0, GROUP_CAP),
    failed: storyPosts.failed || board.failed,
  };

  /* 네 그룹이 전부 실패했으면 그건 부분 실패가 아니라 조회 자체가 안 되는 상태다.
     200 에 빈 결과를 실어 보내면 클라이언트는 그것을 "검색 결과 없음"으로 그린다. */
  const failed = [
    complexes.failed ? "단지" : null,
    listings.failed ? "매물" : null,
    notes.failed ? "임장노트" : null,
    stories.failed ? "이야기" : null,
    news.failed ? "뉴스" : null,
  ].filter((v): v is string => v !== null);
  if (failed.length === 5) {
    return dbUnavailable("search-unified", new Error("통합 검색 다섯 그룹이 모두 실패"));
  }

  /* A8 — 전 그룹 무결과일 때만 대안 단지 제안(토큰 완화 매칭).
     "실패해서 비었다"는 무결과가 아니므로, 실패한 그룹이 하나라도 있으면 제안하지
     않는다 — 있는 결과를 못 본 채 엉뚱한 대안을 미는 꼴이 된다. */
  const allEmpty =
    failed.length === 0 &&
    complexes.rows.length === 0 &&
    listings.rows.length === 0 &&
    notes.rows.length === 0 &&
    stories.rows.length === 0 &&
    news.rows.length === 0;
  const suggested = allEmpty
    ? await safe<UnifiedComplex>("대안 제안", async () => {
        /* [1008 · S] 토큰 기준 "비슷한 이름"(lib/complex/complex-store suggestComplexes 주석) */
        const rows = await suggestComplexes(complexQ, 6);
        return rows.map(complexRowToUnified);
      })
    : { rows: [] as UnifiedComplex[], failed: false };

  /* [#105] 제로결과 로그 — 진짜 무결과(실패 아님)만 기록. fire-and-forget:
     로깅 실패가 검색 응답을 늦추거나 막으면 안 된다. 개인정보를 줄이기 위해
     2~40자 질의만, 원문 그대로(오타 포함 — 그것이 콘텐츠 주문서의 재료다).
     [1008 · 리뷰 B] ① 단지 RPC 를 못 물어본 응답(complexPartial)은 무결과가 아니다 — 기록하지 않는다.
     ② 단지가 '비슷한 이름'(오타 추정)뿐이고 다른 그룹도 0건이면 그것도 무결과다 — fuzzy_only=true 로 따로 적는다
        (예전엔 결과 있음으로 셌다 — "결과 없음 82%" 개선 수치가 부풀지 않게). fuzzy_only 열은
        20260921003100 초안(미적용)이 더한다 — 적용 전에는 그 줄만 조용히 실패한다(PGRST204). */
  const fuzzyOnly =
    !allEmpty &&
    failed.length === 0 &&
    complexes.rows.length > 0 &&
    complexes.rows.every((c) => c.fuzzy === true) &&
    listings.rows.length === 0 &&
    notes.rows.length === 0 &&
    stories.rows.length === 0 &&
    news.rows.length === 0;
  if ((allEmpty || fuzzyOnly) && !complexPartial && sb && q.length >= 2 && q.length <= 40) {
    void sb
      .from("search_zero_results")
      .insert(fuzzyOnly ? { query: q, fuzzy_only: true } : { query: q })
      .then(({ error }) => {
        if (error && !(fuzzyOnly && error.code === "PGRST204")) logger.warn("[search] 제로결과 로그 실패", error);
      });
  }

  return NextResponse.json(
    {
      complexes: complexes.rows,
      listings: listings.rows,
      notes: notes.rows,
      stories: stories.rows,
      news: news.rows,
      suggestions: suggested.rows,
      /* 클라이언트는 이 목록을 "없음"이 아니라 "지금 못 불러왔음"으로 그린다. */
      failed,
      query: rawQ,
    },
    {
      headers: {
        // 부분 실패 응답을 CDN 이 재사용하면 장애가 끝난 뒤에도 계속 나간다.
        "Cache-Control": failed.length || complexPartial
          ? "no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
