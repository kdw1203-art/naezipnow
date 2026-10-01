import { NextResponse } from "next/server";
import { parseDong } from "@/lib/complex/dong";
import { searchComplexes, suggestComplexes, type ComplexRow } from "@/lib/complex/complex-store";
import { expandComplexAlias } from "@/lib/search/normalize-query";
import { searchComplexPreviews, type ComplexSearchHit } from "@/lib/search/complex-search";
import { isPlaceSearchConfigured, searchPlaces } from "@/lib/search/place-search";
import { logger } from "@/lib/log";
import {
  intentInfo,
  loadSuggestWords,
  planSearch,
  preParse,
  runFilteredSearch,
  type AreaItem,
  type NextWord,
  type RelatedQuery,
  type SearchIntentInfo,
} from "@/lib/search/intent-server";

/* 검색 자동완성(#48) — 단지명 서제스트.
   search_complexes_preview RPC(v2 — 정규화·토큰·동네+단지명·오타, lib/search/complex-search) 상위 8건.
   RPC 가 실패했거나 확실한 일치 없이 '비슷한 이름' 만 줬으면 searchComplexes(단지 단위 집계표 + 같은
   순위 규칙)가 한 번 더 본다.
   내부 결과가 부족(<3)하고 외부 장소검색 키가 설정돼 있으면 Naver 키워드 장소검색을 폴백으로 붙여
   places[] 로 함께 반환한다(env-gated no-op).
   [1008 · S] 결과가 0건이면 similar[](토큰 기준 "비슷한 이름" 제안)를 붙인다 — 단지 선택기·지도 검색이
   "없어요" 로 끝나지 않게. 제안은 결과가 아니다(suggestions 에 섞지 않는다 — 지도 ?q= 자동 선택이
   첫 결과를 고르는데, 제안을 고르면 엉뚱한 단지로 이동한다).
   CDN 캐시 s-maxage=3600 (인기 프리픽스 재활용).
   [1026d · 검색] 검색어를 먼저 읽는다(lib/search/intent-server planSearch) — "마포 신축" · "잠실 30평대" 처럼
   조건이 있거나 지역 이름만 쳤으면 search_complexes_filtered(거래 많은 순 + 총 개수)로 단지를 고르고,
   그 밖(단지 이름)은 예전 그대로다. 응답에 intent(검색 범위·조건 칩) · areas(지역 줄) · related(연관 검색)를 싣는다.
   단지 줄에는 roadAddress(도로명)도 — 화면이 "도로명 (동 번지)" 음영 줄을 그린다.
   [1026e · 연관 검색어] next(띄어 쓴 뒤 붙일 낱말 + 단지 수) · complete(마지막 낱말 완성) · related(검색어 + 낱말) —
   lib/search/intent-server loadSuggestWords(search_next_words). */

export const runtime = "nodejs";

export interface SuggestItem {
  id: string;
  name: string;
  region: string;
  /** 옛 필드 — 시군구의 뒷부분("동안구"). 새 화면은 area(읍면동)를 쓴다. */
  dong: string;
  /** [1008 · S] 대표 지번의 읍면동("관양동") — 같은 이름 단지 가르기용. 모르면 null */
  area?: string | null;
  /** 선택 시 지도 이동용 지오코딩 대상 주소(도로명 우선). 좌표는 클라이언트가 on-demand 지오코딩. */
  address: string;
  /* ── 미리보기 값 (2026-07-27 추가) ─────────────────────────────────────
     예전 자동완성은 이름과 지역만 줬다. 이름이 비슷한 단지가 여럿일 때
     (같은 브랜드가 전국에 깔려 있다) 어느 것인지 고를 근거가 없어, 일단
     눌러서 상세를 열어 보고 아니면 뒤로 가는 식이었다.
     고르기 전에 판단할 수 있도록 실거래 요약을 함께 싣는다.
     모르는 값은 null 로 둔다 — 0 으로 채우면 "거래 0건"이라는 거짓이 된다. */
  /** 평균 매매 실거래가(만원) */
  avgPriceManwon?: number | null;
  /** 최근 6개월 매매 건수 */
  recentTradeCount?: number | null;
  buildYear?: number | null;
  households?: number | null;
  /** 좌표를 이미 알면 실어 보낸다 — 클릭 시 지오코딩 왕복을 건너뛴다 */
  lat?: number | null;
  lng?: number | null;
  /** [1008 · S] 이름·토큰으로 맞은 게 아니라 이름이 비슷한 후보(오타 추정) */
  fuzzy?: boolean;
  /** [1026d] 도로명 주소 — 모르면 null */
  roadAddress?: string | null;
  /** [1026d] 면적 조건 검색일 때 그 면적의 평균 매매가(만원) */
  bandPriceManwon?: number | null;
}

/** 외부(지도) 장소검색 폴백 항목 — 클릭 시 지도 이동에 필요한 좌표 포함. */
export interface PlaceItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PLACES_CAP = 6;
const LIMIT = 8;

function districtOf(region: string): string {
  const [city, ...rest] = region.split(" ");
  return rest.join(" ") || city || "";
}

function hitToItem(h: ComplexSearchHit): SuggestItem {
  return {
    id: h.id,
    name: h.name,
    region: h.region,
    dong: districtOf(h.region),
    area: h.area ?? null,
    address: h.address || `${h.region} ${h.name}`.trim(),
    avgPriceManwon: h.avgPriceManwon ?? null,
    recentTradeCount: h.recentTradeCount ?? null,
    buildYear: h.buildYear ?? null,
    households: h.households ?? null,
    lat: h.lat,
    lng: h.lng,
    fuzzy: h.fuzzy === true,
    roadAddress: h.roadAddress ?? null,
    bandPriceManwon: h.bandPriceManwon ?? null,
  };
}

function rowToItem(c: ComplexRow): SuggestItem {
  const region = `${c.city} ${c.district}`.trim();
  return {
    id: c.id,
    name: c.name,
    region: c.city === c.district ? c.city : region,
    dong: c.district || c.city || "",
    area: parseDong(c.address),
    address: c.road_address || c.address || `${region} ${c.name}`.trim(),
    roadAddress: c.road_address || null,
    buildYear: c.build_year,
    households: c.households,
    lat: c.lat,
    lng: c.lng,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  /* [1008 · S] 약칭만 펼치고 '아파트' 꼬리는 떼지 않는다 — 순위가 원문 일치("공작아파트")를 먼저 본 뒤
     꼬리 뗀 형("공작")을 다룬다(lib/search/normalize-query expandComplexAlias 주석). */
  const rawQ = (searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  const q = expandComplexAlias(rawQ);

  if (!q) {
    return NextResponse.json(
      { suggestions: [] as SuggestItem[], places: [] as PlaceItem[], similar: [] as SuggestItem[], query: q },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }
  /* 80자 넘는 입력은 검색이 아니라 붙여넣기다(통합 검색과 같은 상한) — RPC 에 긴 정규식을 만들게 하지 않는다 */
  if (q.length > 80) {
    return NextResponse.json(
      { suggestions: [], places: [], similar: [], query: q, error: "검색어는 80자까지예요" },
      { status: 400 },
    );
  }

  let suggestions: SuggestItem[] = [];
  let similar: SuggestItem[] = [];
  /* 자동완성이 빈 채로 내려가는 것 자체는 견딜 만하지만, 그 응답이
     s-maxage=3600 으로 CDN 에 얹히면 한 번의 조회 실패가 그 프리픽스의
     "검색 결과 없음"을 한 시간 동안 굳혀버린다. 실패한 응답은 캐시하지 않는다. */
  let lookupFailed = false;
  let partial = false;
  /* [1026d] 검색어 읽기 — 지역·조건·이름. 지역 해석이 실패하면 이름 검색으로 물러서고 캐시하지 않는다 */
  /* [보강] 조건이 없으면 이름 검색을 지역 해석과 나란히 먼저 시작한다(왕복 한 번 줄임 — 지역 검색이면 버린다) */
  const pre = preParse(rawQ);
  const earlyHits: Promise<ComplexSearchHit[] | null> | null = pre.filtered
    ? null
    : searchComplexPreviews(pre.nameQuery, LIMIT).catch(() => null);
  const plan = await planSearch(rawQ);
  if (plan.areasFailed) partial = true;
  /* [1026e] 연관 검색어 엔진 — 다음 낱말 · 낱말 완성(실패해도 결과는 막지 않는다) */
  const wordsP: Promise<{ next: NextWord[]; complete: NextWord[]; related: RelatedQuery[] }> = loadSuggestWords(
    plan,
  ).catch(() => ({ next: [], complete: [], related: [] }));
  let total: number | null = null;
  if (plan.filter) {
    /* [보강] 조건·지역 검색은 쪽 넘김을 받는다(/search 의 "더 보기") — limit ≤ 30 · offset ≤ 300 */
    const lim = Math.min(30, Math.max(1, Number(searchParams.get("limit")) || LIMIT));
    const off = Math.min(300, Math.max(0, Number(searchParams.get("offset")) || 0));
    const res = await runFilteredSearch(plan.filter, lim, off).catch(() => null);
    const words = await wordsP;
    if (!res) lookupFailed = true;
    else total = res.total;
    return NextResponse.json(
      {
        suggestions: (res?.hits ?? []).map(hitToItem),
        places: [] as PlaceItem[],
        similar: [] as SuggestItem[],
        query: q,
        failed: lookupFailed,
        intent: intentInfo(plan, total) satisfies SearchIntentInfo,
        areas: plan.areas satisfies AreaItem[],
        ...words,
      },
      {
        headers: {
          "Cache-Control":
            lookupFailed || partial ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  }
  try {
    const hits =
      earlyHits && plan.nameQuery === pre.nameQuery ? await earlyHits : await searchComplexPreviews(plan.nameQuery, LIMIT);
    /* [1008 · 리뷰 B] RPC 를 못 물어봤으면(null) 아래 집계표 경로의 답은 오타 추정이 빠진 불완전한 답이다 —
       비어 있어도·차 있어도 CDN 에 한 시간 얹지 않는다(예전엔 실패 + 집계표 0건이 "없어요" 로 굳었다). */
    if (hits === null) partial = true;
    if (hits && hits.some((h) => !h.fuzzy)) {
      /* 확실한 일치(이름·토큰)가 하나라도 있으면 RPC 순위(TS 규칙으로 다시 세운 것)를 그대로 쓴다. */
      suggestions = hits.map(hitToItem);
    } else {
      /* RPC 실패(null)·0건·'비슷한 이름' 뿐 — 집계표 경로(같은 순위 규칙, 확실한 일치만)가 한 번 더 본다.
         RPC 가 아직 v1(직전 정의)이면 v1 이 상위 8건 안에 목표를 못 올린 "목동 7단지"·"E편한세상 사천"·
         "그린타운우성"·"사천 스카이" 를 여기서 잡는다(2026-09-21 v1 응답 실측: 넷 다 8건 전부 비슷한 이름).
         거기서도 없으면 RPC 의 비슷한 이름 후보를 그대로 둔다(화면이 '비슷한 이름' 배지로 가른다 —
         "벽절골롯데"→벽적골롯데 같은 오타가 이 길로 온다). RPC 는 다시 부르지 않는다(skipRpc). */
      let rows: ComplexRow[] = [];
      try {
        rows = await searchComplexes(plan.nameQuery, undefined, LIMIT, undefined, { skipRpc: true });
      } catch (e) {
        if (!hits || hits.length === 0) throw e;
        /* 비슷한 이름 후보는 있다 — 보여 주되, 물러서는 길을 못 본 불완전한 답이라 캐시하지 않는다 */
        partial = true;
        logger.warn(`[search/suggest] 집계표 경로 실패 — 비슷한 이름 후보만 보냅니다 (q=${plan.nameQuery})`, e);
      }
      suggestions = rows.length > 0 ? rows.slice(0, LIMIT).map(rowToItem) : (hits ?? []).map(hitToItem);
    }
    if (suggestions.length === 0) {
      similar = (await suggestComplexes(plan.nameQuery, 5)).map(rowToItem);
    }
  } catch (e) {
    // env 미설정·조회 실패 시 빈 목록 (클라이언트는 드롭다운 미표시)
    lookupFailed = true;
    suggestions = [];
    similar = [];
    logger.warn(`[search/suggest] 단지 자동완성 조회 실패 (q=${q})`, e);
  }

  // 내부 결과가 얇을 때(<3)만 외부 장소검색 폴백. 키 미설정 시 no-op.
  let places: PlaceItem[] = [];
  if (suggestions.length < 3 && isPlaceSearchConfigured()) {
    try {
      const seen = new Set(suggestions.map((s) => s.name.trim()));
      const results = await searchPlaces(plan.nameQuery, PLACES_CAP);
      for (const p of results) {
        const name = p.name.trim();
        if (!name || seen.has(name)) continue; // 내부 단지명과 중복 제거
        seen.add(name);
        places.push({ name, address: p.address, lat: p.lat, lng: p.lng });
        if (places.length >= PLACES_CAP) break;
      }
    } catch {
      // searchPlaces 는 throw 하지 않지만 방어적으로 fail-soft.
      places = [];
    }
  }

  const words = await wordsP;
  return NextResponse.json(
    {
      suggestions,
      places,
      similar,
      query: q,
      failed: lookupFailed,
      intent: intentInfo(plan, total),
      areas: plan.areas,
      /* [1026e] next(띄어 쓴 뒤) · complete(마지막 낱말 완성) · related(검색어 + 낱말) */
      ...words,
    },
    {
      headers: {
        "Cache-Control": lookupFailed || partial
          ? "no-store"
          : "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
