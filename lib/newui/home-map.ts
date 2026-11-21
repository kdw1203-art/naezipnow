/* [1198 · 홈 시안 A — 지도 첫 화면] 소유자 2026-11-18 "홈화면 개편" → 시안 A 선택.
   검색 아래 첫 판 = 시군구 평균 매매가 말풍선 지도. 순수 함수 — 단위 테스트가 그대로 부른다.
   값 = 부동산원 스냅샷 평균 매매가(없으면 그 지역은 이름 알약 · 값을 지어내지 않는다) · 등락 = 월간 변동률.
   좌표 = 지역 카탈로그(lib/map/seoul-districts) · 누르면 지역 종합 화면(/region/[id]). */
import type { RegionMapMarker } from "@/lib/region/region-map";

type CatalogRow = { id: string; name: string; lat: number; lng: number; city?: string; retired?: string };
type SnapshotRow = { period: string; avgSale?: number; saleChangeMonthly?: number };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function homeMapMarkers(
  catalog: readonly CatalogRow[],
  snapshots: ReadonlyMap<string, SnapshotRow> | null,
  formatKrw: (krw: number) => string,
): RegionMapMarker[] {
  const out: RegionMapMarker[] = [];
  for (const r of catalog) {
    if (r.retired || !finite(r.lat) || !finite(r.lng)) continue;
    const s = snapshots?.get(r.id);
    const avg = s && finite(s.avgSale) && s.avgSale > 0 ? s.avgSale : null;
    const sido = r.city ?? "서울";
    out.push({
      id: r.id,
      name: r.name,
      sido,
      lat: r.lat,
      lng: r.lng,
      href: `/region/${encodeURIComponent(r.id)}`,
      value: avg !== null ? formatKrw(avg) : null,
      deltaPct: avg !== null && s && finite(s.saleChangeMonthly) ? Math.round(s.saleChangeMonthly * 10) / 10 : null,
      keys: [r.name, `${sido} ${r.name}`],
    });
  }
  return out;
}

/** 가장 많은 지역이 쓰는 기준월(yyyymm) — 없으면 null */
export function homeMapPeriod(snapshots: ReadonlyMap<string, SnapshotRow> | null): string | null {
  if (!snapshots || snapshots.size === 0) return null;
  const counts = new Map<string, number>();
  for (const s of snapshots.values()) if (/^\d{6}$/.test(s.period)) counts.set(s.period, (counts.get(s.period) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  return top ? top[0] : null;
}
