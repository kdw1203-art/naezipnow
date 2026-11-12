"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";

/* [1162] 내 임장 이력 지도 — 좌표가 있는 노트만 점으로. 점을 누르면 그 노트로 간다. */
export function HistoryMap({ points }: { points: { id: string; name: string; lat: number; lng: number }[] }) {
  const router = useRouter();
  const markers = useMemo<MapMarkerData[]>(() => points.map((p) => ({ id: `hist:${p.id}`, lat: p.lat, lng: p.lng, label: p.name })), [points]);
  const center = points[0] ? { lat: points[0].lat, lng: points[0].lng } : { lat: 37.5665, lng: 126.978 };
  return (
    <div className="card overflow-hidden rounded-2xl p-1.5">
      <div className="h-[220px] md:h-[300px]">
        <NaverMap markers={markers} center={center} level={8} fitToMarkers declutter className="h-full w-full" onMarkerClick={(m) => router.push(`/notes/${String(m.id).replace(/^hist:/, "")}`)} />
      </div>
    </div>
  );
}

export default HistoryMap;
