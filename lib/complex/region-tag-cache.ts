import "server-only";

import { unstable_cache } from "next/cache";
import { complexRegionTag } from "@/lib/complex/region-tag";
import { logger } from "@/lib/log";

/**
 * [1089] 단지 화면 렌더에 실거래 지역 태그를 붙인다 — 지역마다 값 하나(1)를 데이터 캐시에서 읽는 것뿐이다
 * (태그가 화면에 옮겨 붙는 길은 unstable_cache 의 tags 가 유일하다 · Next 15). revalidate 를 주지 않는다 —
 * 화면 수명(7일)을 건드리지 않는다. 실패해도 화면은 그대로 그린다(태그만 빠진다 — 그 단지는 id 비움 · 7일 TTL 로 남는다).
 * 규칙 · 이유: lib/complex/region-tag.ts.
 */
export async function tagComplexPageRegion(region: string | null | undefined): Promise<void> {
  const tag = complexRegionTag(region);
  if (!tag) return;
  try {
    await unstable_cache(async () => 1, ["cx-region-tag-v1", tag], { tags: [tag] })();
  } catch (e) {
    logger.warnSampled("cx-region-tag", "[complex] 실거래 지역 태그 실패(무시)", e);
  }
}
