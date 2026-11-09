"use client";
/* [1111 · 지도 중심 개편] 지역 시세 분석의 고르는 자리 — 검색칸 + [표 | 지도] 보기.
   표(시/도 필터 · 서버가 그린 판)는 1110 그대로, 지도는 RegionMapPicker(실지도 위 말풍선 = 평균 매매가 · 시/도 칩 · 검색). 검색칸의
   "지도로 찾기"는 /map 으로 나가지 않고 여기서 지도 보기로 바꾼다. 처음은 표(서버 HTML · 크롤) — 지도 SDK 는 지도 보기를 고를 때만 받는다. */

import { useState, type ReactNode } from "react";
import { RegionSearchBox } from "./region-search-box";
import { SidoFilter } from "./sido-filter";
import { RegionMapPicker } from "@/app/components/region/RegionMapPicker";
import type { RegionSiseRegion } from "@/lib/region/region-sise";
import type { RegionMapMarker } from "@/lib/region/region-map";

export function RegionSiseClient({
  regions,
  markers,
  sidos,
  counts,
  panels,
  autoFocus = false,
}: {
  regions: RegionSiseRegion[];
  markers: RegionMapMarker[];
  sidos: string[];
  counts: number[];
  panels: ReactNode[];
  autoFocus?: boolean;
}) {
  const [view, setView] = useState<"table" | "map">("table");
  const seg = (v: "table" | "map", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`chip t-sub px-3 py-1.5 font-bold transition-colors ${view === v ? "chip-active" : "border border-line bg-surface text-text-2"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="card rounded-2xl p-3.5">
        <RegionSearchBox regions={regions} autoFocus={autoFocus} onMapClick={() => setView("map")} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="보기" className="flex gap-1.5">
          {seg("table", "표")}
          {seg("map", "지도")}
        </div>
      </div>
      {view === "table" ? (
        <SidoFilter sidos={sidos} counts={counts} panels={panels} />
      ) : (
        <RegionMapPicker markers={markers} label="지역 시세 분석 지도" valueLabel="말풍선 = 평균 매매가(한국부동산원) · 없으면 시장 온도" defaultSido="서울" />
      )}
    </div>
  );
}
