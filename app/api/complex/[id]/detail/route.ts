/**
 * GET /api/complex/[id]/detail
 * 단지 통합 상세 데이터 — Supabase DB + 공공 API
 * 응답: { complex, transactions, reviews, posts, areaBands, regionRelative, nearby, listingCount,
 *         rent, notes, facts, summaryLine, sideFailures, fetchedAt, mode }
 *
 * [1006 · B] rent(전월세 12개월 요약) · notes(공개 임장노트 수+최신 1건) · facts(자료 완성도·
 * 단지 전세가율·매매 12개월 요약) · summaryLine(있는 숫자만 이은 한 줄) 을 더했다.
 * 지도 패널이 그리고, 허브·AI 컨텍스트도 같은 문장을 쓸 수 있게 최상위에 둔다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  getComplexById,
  getTransactionHistory,
  getComplexPosts,
  getAreaBands,
  getRegionRelative,
  listComplexesInDistrict,
  parseComplexId,
  decodeComplexId,
} from "@/lib/complex/complex-store";
import { listApprovedListings } from "@/lib/listings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { getComplexRentHistoryByNames } from "@/lib/market/complex-rent";
import { getTradeWindowSamples } from "@/lib/complex/complex-trade-window";
import { getComplexNotesBrief } from "@/lib/complex/complex-notes-brief";
import {
  buildComplexFacts,
  type ComplexFacts,
  type ComplexNotesBrief,
  type RentSample,
  type TradeSample,
} from "@/lib/complex/complex-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "complex id가 필요합니다." }, { status: 400 });
  }

  /* 병렬 조회 — 핵심(단지·실거래) 실패 시 503.
     지역대비·인근·매물 건수는 패널 보조라 실패해도 핵심 응답은 유지한다. */
  let complex: Awaited<ReturnType<typeof getComplexById>>;
  let transactions: Awaited<ReturnType<typeof getTransactionHistory>>;
  let posts: Awaited<ReturnType<typeof getComplexPosts>>;
  let reviews: Awaited<ReturnType<typeof getReviewSummary>>;
  let areaBands: Awaited<ReturnType<typeof getAreaBands>>;
  let queryId: string;
  try {
    const complexP = getComplexById(id);
    /* [1006] kapt.* id 는 실거래 조회 키가 아니다(complex-store decodeComplexIdForQuery 주석) —
       노트→지도 핸드오프(?complexId=)는 kapt 매칭된 row.id 를 그대로 넘기므로 여기로 kapt id 가
       들어오면 실거래·면적대·지역대비가 전부 "없음"으로 그려졌다. kapt 일 때만 대표행을 먼저
       받아 canonical_id 로 조회한다(name-id 인 대부분은 예전처럼 병렬). */
    const queryIdP =
      parseComplexId(id)?.kind === "kapt"
        ? complexP.then((c) => c?.canonical_id ?? id)
        : Promise.resolve(id);
    [complex, transactions, posts, reviews, areaBands, queryId] = await Promise.all([
      complexP,
      queryIdP.then((q) => getTransactionHistory(q, 24)),
      getComplexPosts(id, 12),
      getReviewSummary(id),
      queryIdP.then((q) => getAreaBands(q)),
      queryIdP,
    ]);
  } catch (e) {
    return dbUnavailable("complex-detail", e);
  }

  /* 부가 섹션 — 실패를 null/[]로 조용히 누르면 패널이 "이 동네 대비 없음"
     "인근 단지 없음"을 그린다. 조회 실패는 데이터 없음이 아니다 — 어떤 섹션이
     실패했는지 sideFailures 로 함께 실어, 소비자가 구분해 말할 수 있게 한다.
     (섹션 하나 때문에 패널 전체를 죽이지는 않는다 — 값 폴백은 유지) */
  const sideFailures: string[] = [];
  const dec = complex ? decodeComplexId(complex.canonical_id) : null;
  const [regionRelative, nearby, listingCount, rentHist, tradeWindow, notes] = await Promise.all([
    getRegionRelative(queryId).catch(() => {
      sideFailures.push("regionRelative");
      return null;
    }),
    complex?.district
      ? listComplexesInDistrict(complex.district, 6)
          .then((rows) =>
            rows
              .filter((c) => c.id !== id)
              .slice(0, 4)
              .map((c) => ({
                id: c.id,
                name: c.name,
                meta: [
                  c.build_year ? `${c.build_year}년` : null,
                  c.households
                    ? `${c.households.toLocaleString("ko-KR")}세대`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })),
          )
          .catch(() => {
            sideFailures.push("nearby");
            return [] as { id: string; name: string; meta: string }[];
          })
      : Promise.resolve([] as { id: string; name: string; meta: string }[]),
    complex?.name
      ? listApprovedListings({ complexName: complex.name })
          .then((rows) => rows.length)
          .catch(() => {
            sideFailures.push("listingCount");
            return null;
          })
      : Promise.resolve(null),
    /* [1006] 전월세 24개월 — 허브 ComplexRentSection 과 같은 로더(지역·단지명 등치).
       null(0행)은 "신고 없음", throw 는 실패. */
    dec
      ? getComplexRentHistoryByNames(dec.region, dec.name).catch(() => {
          sideFailures.push("rent");
          return undefined;
        })
      : Promise.resolve(null),
    /* [1006] 매매 12개월 원표본 — 건수·중앙값·면적대 중앙값·전세가율(6개월) 재료 */
    complex
      ? getTradeWindowSamples(complex.canonical_id).catch(() => {
          sideFailures.push("tradeWindow");
          return undefined;
        })
      : Promise.resolve(null),
    /* [1006] 공개 임장노트 수 + 최신 1건 — id 세 형태를 한꺼번에 본다 */
    complex
      ? getComplexNotesBrief({
          complexIds: [id, complex.id, complex.canonical_id],
          name: complex.name,
          city: complex.city,
          district: complex.district,
        }).catch(() => {
          sideFailures.push("notes");
          return undefined;
        })
      : Promise.resolve(null),
  ]);

  /* undefined = 조회 실패. facts 는 "모른다"를 null 로 받는다 — 전월세 로더의 null 은
     "24개월 신고 없음"(운영은 Supabase 가 항상 있다)이라 [] 로, 매매 창·노트의 null 은
     미설정(로컬)이라 그대로 null(모른다) 로 넘긴다. 0건을 지어내지 않는다. */
  const rentSamples: RentSample[] | null =
    rentHist === undefined ? null : (rentHist?.samples ?? []);
  const tradeSamples: TradeSample[] | null = tradeWindow ?? null;
  const notesBrief: ComplexNotesBrief | null = notes ?? null;

  /* 대표행이 없으면(not_found) 완성도·요약도 없다 — 없는 단지의 "자료 없음"은 사실이 아니다 */
  const facts: ComplexFacts | null = complex
    ? buildComplexFacts({
        complex,
        trades: tradeSamples,
        rents: rentSamples,
        notes: notesBrief,
      })
    : null;

  return NextResponse.json(
    {
      complex,
      transactions,
      posts,
      reviews,
      areaBands,
      regionRelative,
      nearby,
      listingCount,
      /* [1006] 전월세 12개월 요약(가장 최근 달 포함). 신고 없음이면 null — sideFailures 에
         "rent" 가 있으면 없음이 아니라 실패다 */
      rent: facts?.rentSummary ?? null,
      /* [1006] 공개 임장노트 수 + 최신 1건 — 실패면 null + sideFailures "notes" */
      notes: complex ? notesBrief : null,
      /* [1006] 자료 완성도(있음/없음+이유) · 단지 전세가율 · 매매 12개월 요약. not_found 면 null */
      facts,
      /* [1006] 있는 숫자만 이은 한 줄 — 허브·AI 컨텍스트도 같은 문장을 쓴다 */
      summaryLine: facts?.summaryLine ?? null,
      /* 조회에 실패한 부가 섹션 이름들 — 빈 값과 실패를 소비자가 구분하게 */
      sideFailures,
      fetchedAt: new Date().toISOString(),
      mode: complex ? "db" : "not_found",
    },
    {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    }
  );
}

async function getReviewSummary(complexId: string) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("complex_reviews")
    .select("noise_score,parking_score,mgmt_score,neighbor_score,transport_score")
    .eq("complex_id", complexId);
  // null 은 "아직 후기가 없다"는 뜻이라 조회 실패에는 쓸 수 없다.
  if (error) throw new Error(`complex_reviews 조회 실패: ${error.message}`);
  if (!data || data.length === 0) return null;

  const avg = (key: string) => {
    const vals = data.map((r: Record<string, number | null>) => r[key]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  return {
    count: data.length,
    noise: avg("noise_score"),
    parking: avg("parking_score"),
    mgmt: avg("mgmt_score"),
    neighbor: avg("neighbor_score"),
    transport: avg("transport_score"),
  };
}
