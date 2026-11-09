"use client";
/* [1111 · 지도 중심 개편] 지역 고르기 지도 — 실지도(NaverMap · 지연 로드) 위에 시 · 구 107곳을 말풍선(이름 | 값)으로 놓고, 시/도 칩으로
   화면 범위를 옮기고, 검색칸(필터)으로 이름을 쳐서 간다. 누르면 그 지역 화면(href — 동네 홈 · 지역 종합)으로.
   소유자 2026-11-08: "지도를 통해 호갱노노 · 재개발닷컴처럼 디자인을 변경해줘 너무 나열식이야" · "항목이 5개를 넘으면 필터식".
   SDK 키가 없거나 지도를 못 불러오면(fallback) 같은 자리에 고른 시/도의 지역 줄 목록 — 나열은 시/도 하나 분량(≤33)뿐.
   규칙: 값은 서버가 센 것만(없으면 이름 알약) · 선택은 주소에 남기지 않는다(ISR 한 벌). */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { NaverMap } from "@/components/map/NaverMapLazy";
import {
  NATIONAL_VIEW,
  filterRegionMarkers,
  initialSido,
  sidoViewports,
  toMapMarkerData,
  type RegionMapMarker,
} from "@/lib/region/region-map";

export function RegionMapPicker({
  markers,
  label,
  valueLabel,
  defaultSido,
  heightClass = "h-[600px] max-md:h-[420px]",
  searchPlaceholder = "시 · 구 이름",
}: {
  markers: RegionMapMarker[];
  /** 지도의 접근성 이름("동네 고르기 지도") */
  label: string;
  /** 말풍선 값의 뜻 한 줄("말풍선 = 최근 이웃 글 수") — 범례 */
  valueLabel?: string | null;
  defaultSido?: string | null;
  heightClass?: string;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const viewports = useMemo(() => sidoViewports(markers), [markers]);
  const [sido, setSido] = useState<string | null>(() => initialSido(viewports, defaultSido));
  const [q, setQ] = useState("");
  const [fallback, setFallback] = useState(false);
  const view = viewports.find((v) => v.sido === sido) ?? NATIONAL_VIEW;
  const data = useMemo(() => markers.map(toMapMarkerData), [markers]);
  const hits = useMemo(() => filterRegionMarkers(markers, q, 8), [markers, q]);
  const inSido = useMemo(() => markers.filter((m) => m.sido === sido), [markers, sido]);
  const go = (href: string) => router.push(href);

  const listFallback = (
    /* 지도를 못 그릴 때 — 고른 시/도의 지역만(5개 초과 필터 규칙: 시/도 칩이 필터) */
    <div className={`flex flex-col overflow-auto rounded-2xl border border-line bg-surface p-2 ${heightClass}`}>
      <p className="m-0 px-2 py-1 t-caption text-text-3">지도 불러오기 실패 · 목록으로 고르기</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-1">
        {inSido.map((m) => (
          <li key={m.id}>
            <Link href={m.href} className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline">
              {m.name}
              {m.value ? <span className="ml-1 t-caption text-text-3">{m.value}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {/* 시/도 칩 — 지도 화면 범위(필터) */}
        <div role="tablist" aria-label="시/도" className="scroll-x-hidden-bar -mx-1 flex gap-1.5 px-1 md:flex-wrap">
          {viewports.map((v) => {
            const on = v.sido === sido;
            return (
              <button
                key={v.sido}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setSido(v.sido)}
                className={`chip t-sub shrink-0 px-3 py-1.5 font-bold transition-colors ${on ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {v.sido} <span className={`t-caption tabular-nums ${on ? "" : "text-text-3"}`}>{v.count}</span>
              </button>
            );
          })}
        </div>
        {/* 검색 — 이름을 치면 8곳까지 */}
        <div className="relative md:w-[260px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault();
                go(hits[0].href);
              }
              if (e.key === "Escape") setQ("");
            }}
            placeholder={searchPlaceholder}
            aria-label={`${label} 검색`}
            autoComplete="off"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 t-sub font-bold text-ink outline-none focus:border-primary"
          />
          {q.trim() && (
            <div className="card absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl p-1">
              {hits.length > 0 ? (
                <ul role="listbox" aria-label="검색 결과" className="m-0 flex list-none flex-col p-0">
                  {hits.map((m) => (
                    <li key={m.id} role="option" aria-selected={false}>
                      <Link href={m.href} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 no-underline hover:bg-bg">
                        <span className="t-body font-bold text-ink">
                          {m.sido} {m.name}
                        </span>
                        {m.value ? <span className="t-caption text-text-3">{m.value}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 px-3 py-2 t-caption text-text-3">맞는 지역 없음</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-2xl ${fallback ? "" : `border border-line ${heightClass}`}`} aria-label={label} role="region">
        <NaverMap
          markers={data}
          center={view.center}
          level={view.level}
          showControls
          rounded={false}
          declutter
          declutterMaxLabels={80}
          className="h-full w-full"
          onMarkerClick={(m) => {
            const hit = markers.find((x) => x.id === m.id);
            if (hit) go(hit.href);
          }}
          fallback={listFallback}
          onFallbackChange={setFallback}
        />
      </div>
      {valueLabel && !fallback ? <p className="m-0 px-1 t-caption text-text-3">{valueLabel} · 누르면 그 지역으로</p> : null}
    </div>
  );
}
