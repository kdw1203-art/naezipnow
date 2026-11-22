/* [1206] 전국 정비구역 참고 경계 받기 — 순수 규칙은 ./vworld-zone-shapes. 서버 전용(브이월드 키).
   한 달 캐시(unstable_cache · 태그 vworld-zone-shapes) — 매월 크론(/api/cron/redev-zone-shapes-refresh)이 태그를 비우고 다시 받는다.
   한 키워드라도 실패하면 던진다 → 반쪽 결과가 한 달 동안 굳지 않는다(캐시는 성공만 담는다). */
import "server-only";
import { unstable_cache } from "next/cache";
import { fetchVworldGetFeature, isVworldConfigured } from "@/lib/vworld/client";
import { KOREA_BOX, VWORLD_ZONE_KEYWORDS, VWORLD_ZONE_LAYER, mergeShapes, vworldFeatureToShape } from "./vworld-zone-shapes";
import type { ZoneShape } from "./zone-shapes";

export const VWORLD_ZONE_SHAPES_TAG = "vworld-zone-shapes";
export const VWORLD_ZONE_SHAPES_TTL_S = 31 * 24 * 3600;
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

export type VworldShapesResult = { zones: Array<ZoneShape & { id: string; sgg: string }>; fetchedAt: string; perKeyword: Record<string, number> };

export async function fetchVworldZoneShapesLive(): Promise<VworldShapesResult> {
  if (!isVworldConfigured()) throw new Error("VWORLD_API_KEY 미설정");
  const perKeyword: Record<string, number> = {};
  const lists: Array<Array<ZoneShape & { id: string; sgg: string }>> = [];
  for (const kw of VWORLD_ZONE_KEYWORDS) {
    const got: Array<ZoneShape & { id: string; sgg: string }> = [];
    let raw = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetchVworldGetFeature({
        data: VWORLD_ZONE_LAYER,
        page,
        size: PAGE_SIZE,
        geometry: true,
        geomFilter: KOREA_BOX,
        attrFilter: `dgm_nm:like:${kw}`,
        timeoutMs: 25_000,
      });
      const feats = r.featureCollection.features ?? [];
      raw += feats.length;
      for (const f of feats) {
        const s = vworldFeatureToShape(f);
        if (s) got.push(s);
      }
      const total = r.totalFeatureCount ?? 0;
      if (feats.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
    }
    perKeyword[kw] = raw;
    lists.push(got);
  }
  return { zones: mergeShapes(lists), fetchedAt: new Date().toISOString(), perKeyword };
}

/** 한 달 캐시 판 — 지도 화면 라우트가 쓴다 */
export const getVworldZoneShapes = unstable_cache(fetchVworldZoneShapesLive, ["vworld-zone-shapes-v1"], {
  revalidate: VWORLD_ZONE_SHAPES_TTL_S,
  tags: [VWORLD_ZONE_SHAPES_TAG],
});
