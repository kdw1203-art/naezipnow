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
        /* [1028] 라벨 색은 기본값(회색)을 쓴다. [975]에서 네이비 히어로 위에 앉아 밝은 색(text-on-dark-muted)을 줬는데,
           [1023]에 머리가 흰 PageHead 로 바뀐 뒤로는 흰 바탕에 밝은 글자라 라벨이 거의 보이지 않았다. */
        placeholder="단지명 검색"
        showChip={false}
        initialComplexId={initialComplexId}
        initialApt={initialApt}
        onSelect={go}
        onMapClick={openMap}
      />
    </div>
  );
}
