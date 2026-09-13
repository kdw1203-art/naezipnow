import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  CARD_FALLBACK_PATH,
  cardLandingPath,
  isShortCode,
  shortCodeUuidRange,
} from "@/lib/notes/short-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [995] GET /n/{code} — 카드 이미지에 인쇄된 짧은 링크.
 *
 * code = 노트 uuid 앞 8자(lib/notes/short-code.ts). 공개 노트를 찾으면 노트 상세로,
 * 못 찾으면(없음·비공개·형식 오류·DB 실패) 공개 노트 목록으로 302 — 인쇄된 링크는
 * 되돌릴 수 없으므로 **404 를 내지 않는다**. 어느 쪽이든 utm_source=card 가 붙어
 * 어드민 트래픽에 "카드 유입"으로 잡힌다(페이지뷰는 분석 동의 표본).
 *
 * 조회는 PK 범위(uuid 는 바이트 비교 = hex 순서)로 — PostgREST 는 left() 필터가 없다.
 * 같은 8자가 둘 이상이면(사실상 없음) 최신 것을 고른다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const target = await resolveTarget((code ?? "").trim().toLowerCase());
  /* 같은 origin 의 상대 경로 — 프리뷰·로컬에서도 자기 도메인으로 돈다 */
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), 302);
  /* 공개 노트의 코드→id 는 5분 정도 묵어도 된다(비공개 전환은 노트 상세가 다시 막는다).
     미들웨어의 문서 분기가 브라우저 내비게이션에는 no-store 로 덮을 수 있다 —
     그래도 링크는 동작하고, 캐시는 있으면 좋고 없어도 되는 것이다. */
  res.headers.set("Cache-Control", "public, max-age=300");
  return res;
}

async function resolveTarget(code: string): Promise<string> {
  if (!isShortCode(code)) return CARD_FALLBACK_PATH;
  const sb = getServiceSupabase();
  if (!sb) return CARD_FALLBACK_PATH;
  try {
    const { lo, hi } = shortCodeUuidRange(code);
    const { data, error } = await sb
      .from("inspection_notes")
      .select("id")
      .eq("is_public", true)
      .gte("id", lo)
      .lte("id", hi)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn("[n/code] 노트 조회 실패:", error.message);
      return CARD_FALLBACK_PATH;
    }
    const id = typeof data?.id === "string" ? data.id : null;
    return id ? cardLandingPath(id) : CARD_FALLBACK_PATH;
  } catch (e) {
    logger.warn("[n/code] 노트 조회 예외:", e);
    return CARD_FALLBACK_PATH;
  }
}
