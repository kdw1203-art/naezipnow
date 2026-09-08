"use client";

import { useCallback } from "react";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";
import { useMapPick } from "../use-map-pick";

/* 시세·타이밍 단지 선택 — 단지를 고르면 그 지역 regionId 를 부모에 알린다.
   ISR 전환(13차) 후에는 서버 재렌더(router.replace) 대신 부모(TimingClient)가
   pushState + CDN 캐시 API 페치로 지역을 갈아끼운다.
   딥링크 ?complexId=/?apt= 는 ComplexPicker 가 해석 후 onSelect 로 넘긴다. */
export function TimingComplexPicker({
  initialComplexId,
  initialApt,
  currentRegion,
  onRegion,
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
  currentRegion: string;
  onRegion: (regionId: string) => void;
}) {
  const go = useCallback(
    (c: PickedComplex) => {
      if (!c.regionId || c.regionId === currentRegion) return;
      onRegion(c.regionId);
    },
    [currentRegion, onRegion],
  );
  /* [975] 지역 이름을 몰라도 지도에서 단지를 눌러 그 지역으로 넘어간다. */
  const { openMap, mapNode } = useMapPick(go, "시세·타이밍 분석");

  return (
    <div className="w-full md:w-[260px]">
      {mapNode}
      <ComplexPicker
        label="단지로 지역 찾기"
        /* [975] 이 선택기는 네이비 히어로 위에 앉는다 — 기본 회색 라벨은 2.8:1 이었다 */
        labelClassName="text-on-dark-muted"
        placeholder="단지명 검색 (예: 공작아파트)"
        showChip={false}
        initialComplexId={initialComplexId}
        initialApt={initialApt}
        onSelect={go}
        onMapClick={openMap}
      />
    </div>
  );
}
