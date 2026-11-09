"use client";
/* [1112] 지역 시세 분석 대시보드 + 머리의 지역 검색 — 렌더 함수(search)는 서버에서 넘길 수 없어 이 얇은 클라이언트 조각이 잇는다. */
import { TimingClient, type TimingData } from "./TimingClient";
import { RegionSearchBox } from "../region-search-box";
import type { RegionSiseRegion } from "@/lib/region/region-sise";

export function TimingWithSearch(props: {
  regions: { id: string; label: string }[];
  searchRegions: RegionSiseRegion[];
  defaultRegionId: string;
  initialData: TimingData;
  builtYyyymm: string;
  builtAt: number;
}) {
  const { searchRegions, ...rest } = props;
  return (
    <TimingClient
      {...rest}
      search={(select, ids) => <RegionSearchBox regions={searchRegions} pickIds={ids} onPick={select} />}
    />
  );
}
