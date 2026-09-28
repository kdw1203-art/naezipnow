/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { getNearbyPoi, type NearbyPoi } from "@/lib/poi/store";

/* [#96] 도보권 학교·역 — 단지 좌표 기준 직선거리(도보 환산 80m/분).
   데이터가 아직 적재되지 않았으면(오너 패킷 ⑧ 대기) 섹션 자체를 그리지 않는다 —
   빈 껍데기도, "준비 중" 배너도 만들지 않는다. 조회 실패도 접는다(곁다리 관례). */

export async function ComplexNearbyPoi({
  lat,
  lng,
  name,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  name: string;
}) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  let poi: NearbyPoi;
  try {
    poi = await getNearbyPoi(lat, lng);
  } catch {
    return null;
  }
  if (poi.schools.length === 0 && poi.stations.length === 0) return null;

  /* [1024 · 단지 상세] 시안 mock1024/complex-d — "학교" · "지하철" 흰 카드 2칸(이름 | 거리 · 도보). 0행이면 섹션 생략(위). */
  const dist = (m: number) => `${m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`} · 도보 ${Math.max(1, Math.round(m / 80))}분`;
  const card = (title: string, id: string, rows: { key: string; name: string; sub: string | null; m: number }[]) =>
    rows.length === 0 ? null : (
      <section aria-labelledby={id} className="card rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
        <h2 id={id} className="t-section text-ink">
          {title}
        </h2>
        <ul className="mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-10 items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate t-body text-text-1">
                {r.name}
                {r.sub && <span className="ml-1.5 t-caption text-text-3">{r.sub}</span>}
              </span>
              <span className="shrink-0 t-sub text-text-3 tabular-nums">{dist(r.m)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    /* [968 · 7] cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미룬다(page.tsx 주석 참고) */
    <div className="cv-auto rise-in-1 mt-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {card(
          "학교",
          "poi-schools-title",
          poi.schools.map((s) => ({ key: `${s.name}-${s.distanceM}`, name: s.name, sub: s.category, m: s.distanceM })),
        )}
        {card(
          "지하철",
          "poi-stations-title",
          poi.stations.map((s) => ({ key: `${s.name}-${s.line}-${s.distanceM}`, name: s.name, sub: s.line, m: s.distanceM })),
        )}
      </div>
      <p className="t-caption mt-1.5 px-1 text-text-3">
        출처 공공데이터포털 전국초중등학교위치·도시철도역사정보(공공누리 1유형) · {name} 좌표 기준 직선거리 · 도보 80m/분 환산 · 학교 1.2km · 역 1.5km 이내 · 배정 학군은 교육청 기준이 따로 있음
      </p>
    </div>
  );
}
