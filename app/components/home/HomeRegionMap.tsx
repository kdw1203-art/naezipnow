"use client";
/* [1198 · 홈 시안 A — 지도 첫 화면] 검색 바로 아래 첫 판. 시군구 평균 매매가 말풍선(이름 | 값 · 전월 대비)을 대표 지역의 시/도 범위로 띄운다.
   누르면 그 지역 종합 화면. 지도 SDK 는 지연 로드(NaverMapLazy) — 홈 첫 번들에 지도 코드가 실리지 않는다.
   폰: 손가락 끌기가 화면 스크롤을 지도가 가져가므로, 지도 위를 한 장의 링크(지도 크게 보기)로 덮는다 — 핀 고르기는 /map 에서.
   지도를 못 그리면(키 없음 · SDK 실패) 같은 시/도 지역 줄 목록(값 있는 것만 · 지어내지 않는다). */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { NaverMap } from "@/components/map/NaverMapLazy";
import { NATIONAL_VIEW, sidoViewports, toMapMarkerData, type RegionMapMarker } from "@/lib/region/region-map";

export function HomeRegionMap({
  markers,
  sido,
  mapHref,
  periodLabel,
}: {
  markers: RegionMapMarker[];
  /** 처음 보일 시/도(대표 지역의 시/도) */
  sido: string;
  /** "지도 크게 보기" 목적지 */
  mapHref: string;
  /** 스냅샷 기준월("2026.10") — 없으면 생략 */
  periodLabel: string | null;
}) {
  const router = useRouter();
  const [fallback, setFallback] = useState(false);
  const viewports = useMemo(() => sidoViewports(markers), [markers]);
  const view = viewports.find((v) => v.sido === sido) ?? viewports[0] ?? NATIONAL_VIEW;
  const data = useMemo(() => markers.map(toMapMarkerData), [markers]);
  const inSido = useMemo(() => markers.filter((m) => m.sido === view.sido && m.value), [markers, view.sido]);

  const listFallback = (
    <div className="p-3">
      <p className="m-0 px-1 pb-2 t-caption text-text-3">지도 불러오기 실패 · 목록으로 보기</p>
      {inSido.length === 0 ? (
        <p className="m-0 px-1 t-sub text-text-3">지역 시세 없음</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 sm:grid-cols-3">
          {inSido.map((m) => (
            <li key={m.id}>
              <Link href={m.href} className="flex min-h-10 items-center justify-between gap-2 rounded-lg bg-bg px-3 t-sub font-bold text-text-1 no-underline hover:bg-divider">
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 t-caption t-num font-medium text-text-3">{m.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    /* [1204 · 빈 공간 없이] PC 는 첫 줄 높이를 다 채운다 — 오른쪽 열(숫자 칸 + 오늘의 시장)이 더 길면 지도 아래가 비었다(운영 캡처). 최소 440px 그대로 */
    <section aria-labelledby="home-map-h" className="card relative flex flex-col overflow-hidden rounded-2xl p-0 lg:h-full">
      <div className={fallback ? "border-b border-line px-4 pt-3.5" : "pointer-events-none absolute left-3 top-3 z-[6] rounded-xl border border-line bg-surface px-3 py-2 shadow-sm"}>
        <h2 id="home-map-h" className="m-0 t-section text-ink">
          {view.sido} 지역 시세 지도
        </h2>
        <p className="m-0 t-caption text-text-3">
          평균 매매가 · 전월 대비{periodLabel ? ` · ${periodLabel}` : ""}
        </p>
      </div>
      <div className={fallback ? "" : "relative h-[300px] md:h-[440px] lg:h-auto lg:min-h-[440px] lg:flex-1"}>
        <NaverMap
          markers={data}
          center={view.center}
          level={view.level}
          rounded={false}
          declutter
          declutterMaxLabels={60}
          className="h-full w-full"
          onMarkerClick={(m) => {
            const hit = markers.find((x) => x.id === m.id);
            if (hit) router.push(hit.href);
          }}
          fallback={listFallback}
          onFallbackChange={setFallback}
        />
        {!fallback && (
          <Link href={mapHref} tabIndex={-1} aria-hidden="true" className="absolute inset-0 z-[5] md:hidden" />
        )}
      </div>
      {!fallback && (
        <Link
          href={mapHref}
          className="absolute bottom-3 right-3 z-[6] inline-flex min-h-10 items-center rounded-xl border border-line bg-surface px-3.5 t-sub font-bold text-text-1 no-underline shadow-sm hover:border-line-strong"
        >
          지도 크게 보기 ›
        </Link>
      )}
    </section>
  );
}

export default HomeRegionMap;
