/**
 * [1008 · S] 단지 이름 검색 — search_complexes_preview RPC 한 곳에서 부르고 같은 모양으로 돌려준다.
 *
 * 쓰는 곳: /api/search/suggest(자동완성 — 단지 선택기·지도·노트 위치)·/api/search/unified(통합 검색·헤더·홈).
 * 예전엔 자동완성만 이 RPC 를 썼고 통합 검색의 단지 그룹은 market_transactions ILIKE '%원문%' 였다 —
 * 띄어쓰기·괄호 한 글자 차이에 0건(2026-09-21 /search 무결과 82%의 원인). 두 입구가 같은 순위를 쓰게 한다.
 * RPC 규칙은 supabase/migrations/20260921001000_1008_search_complexes_preview_v2.sql,
 * 그 원본은 lib/search/complex-match.ts(순수 함수·골든셋 테스트).
 *
 * 실패는 null — "없음(빈 배열)" 과 다르다. 부르는 쪽이 옛 경로(searchComplexes)로 물러선다.
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { parseComplexQuery } from "@/lib/search/complex-match";
import { rankPreviewRows, type ComplexSearchHit, type PreviewRow } from "@/lib/search/complex-preview-rows";

export type { ComplexSearchHit } from "@/lib/search/complex-preview-rows";

/**
 * 단지 검색 미리보기. p_limit 은 RPC 가 1~20 으로 자른다.
 * null = 못 물어봄(RPC 없음·권한·시간 초과) · [] = 물어봤는데 없음.
 */
export async function searchComplexPreviews(
  query: string,
  limit = 8,
): Promise<ComplexSearchHit[] | null> {
  const q = (query ?? "").trim();
  if (!q) return [];
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("search_complexes_preview", { p_q: q, p_limit: limit });
  if (error) {
    logger.warn("[search] search_complexes_preview 실패 — 옛 경로로 물러섭니다", {
      message: error.message,
    });
    return null;
  }
  return rankPreviewRows(parseComplexQuery(q), (data as PreviewRow[] | null) ?? []);
}
