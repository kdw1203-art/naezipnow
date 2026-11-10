"use client";
/* [1122 → 1123 · 다른 지역 찾기] 지역 화면 탭 줄 아래 한 줄 — **늘 보이는 검색칸**(시 · 구 · 동 · 치는 즉시) + "지도로 찾기" 단추.
   1122 는 단추 하나 뒤에 숨겨 두어 눌러 봐야 알 수 있었다(소유자 2026-11-10 캡처 "한 지역만"). 검색은 바로, 지도(RegionMapPicker:
   시/도 필터 · 실지도 말풍선)는 단추를 누르면 그 자리에 펼친다 — 지도 SDK 는 펼칠 때만 받는다.
   고르면 지금 보던 탭 그대로 그 지역으로(lib/region/region-switch). 동을 고르면 동 실거래 화면으로. */
import { useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { RegionMapPicker } from "@/app/components/region/RegionMapPicker";
import { RegionSearchBox } from "@/app/analysis/region-search-box";
import type { RegionMapMarker } from "@/lib/region/region-map";

export function RegionSwitcher({
  markers,
  currentName,
  defaultSido,
}: {
  markers: RegionMapMarker[];
  currentName: string;
  defaultSido: string | null;
}) {
  const [open, setOpen] = useState(false);
  const regions = useMemo(
    () => markers.map((m) => ({ id: m.id, name: m.name, sido: m.sido, label: `${m.sido} ${m.name}`, href: m.href, keys: m.keys ?? [] })),
    [markers],
  );
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1 md:max-w-[360px]">
          <RegionSearchBox regions={regions} pickIds={[]} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="press flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 t-sub font-bold text-primary hover:border-primary"
        >
          <Icon name="map" size={14} />
          {open ? "지도 닫기" : "지도로 찾기"}
        </button>
      </div>
      {open && (
        <RegionMapPicker
          markers={markers}
          label={`${currentName} 말고 다른 지역 고르기 지도`}
          valueLabel="지역을 고르면 지금 보던 화면 그대로 그 지역으로"
          defaultSido={defaultSido}
          heightClass="h-[440px] max-md:h-[360px]"
        />
      )}
    </div>
  );
}
