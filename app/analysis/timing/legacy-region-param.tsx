"use client";
/* [1110] 옛 주소 /analysis/timing?region=<지역> (예전 시세·타이밍 화면의 지역 전환 · 홈 바로가기 · 온도 기록 화면이 붙이던 값) —
   이 화면은 이제 "고르는 자리"라, 지역이 이미 적혀 있으면 그 지역의 종합 화면으로 바로 넘긴다(replace — 뒤로 가기에 이 화면이 남지 않게).
   마운트 뒤 location.search 로만 읽는다 — 서버가 searchParams 를 읽으면 ISR 이 깨진다(1010). 모르는 값은 그냥 이 화면. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { legacyRegionParamHref, type RegionSiseRegion } from "@/lib/region/region-sise";

export function LegacyRegionParam({ regions }: { regions: RegionSiseRegion[] }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const href = legacyRegionParamHref(regions, new URLSearchParams(window.location.search).get("region"));
      if (href) router.replace(href);
    } catch {
      /* URL 파싱 실패 — 그냥 고르는 자리 */
    }
  }, [regions, router]);
  return null;
}
