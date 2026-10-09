/* [1024 · 단지 상세] 데스크톱 오른쪽 레일(lg) — 요약 4칸 · 행동 3개(노트 쓰기·비교·호가 점검) · 인근 단지 · AI 브리핑 · 광고.
   시안 mock1024/complex-d 의 aside. 값은 전부 page.tsx 가 이미 가진 숫자(추가 조회 0). 채움 파랑은 이 파일에 하나
   (노트 쓰기) — 폰 하단 CTA 블록(page.tsx, lg:hidden)과는 다른 브레이크포인트라 한 화면엔 하나다. 서버 조각. */
import Link from "next/link";
import { CompareTrayButton } from "@/app/components/CompareTrayButton";
import { AdZone } from "@/app/components/ads/AdZone";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { AiBriefingLazy } from "./AiBriefingLazy";
import { ComplexAreaMapLazy } from "./ComplexAreaMapLazy";

export interface RailStat {
  key: string;
  label: string;
  value: string;
  sub: string;
}

export function ComplexRail({
  stats,
  complexId,
  name,
  region,
  noteHref,
  askingHref,
  nearby,
  nearbyLabel,
  briefingRegion,
  location,
}: {
  stats: readonly RailStat[];
  complexId: string;
  name: string;
  region: string;
  noteHref: string;
  /** 실거래가 없는 단지는 없음(칸을 만들지 않는다) */
  askingHref: string | null;
  nearby: readonly { id: string; name: string; meta: string }[];
  nearbyLabel: string;
  briefingRegion: string;
  /** [1047] 단지 좌표 — 있으면 레일 맨 위에 위치·주변 지도(소유자 지시: 오른쪽 레일 노란 자리) */
  location?: { lat: number; lng: number; buildYear: number | null } | null;
}) {
  return (
    <aside className="hidden flex-col gap-3 lg:flex" aria-label="단지 요약·행동">
      {location && (
        <ComplexAreaMapLazy lat={location.lat} lng={location.lng} name={name} buildYear={location.buildYear} media="desktop" />
      )}
      <section className="card rise-in-2 flex flex-col gap-3 rounded-2xl px-4 py-3.5" aria-label="요약">
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {stats.map((s) => (
              <div key={s.key} className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate t-caption text-text-3">{s.label}</span>
                <span className="truncate t-section t-num text-ink">{s.value}</span>
                <span className="truncate t-caption text-text-3 tabular-nums">{s.sub}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`grid gap-2 ${askingHref ? "grid-cols-3" : "grid-cols-2"}`}>
          <Link href={noteHref} className="btn-primary inline-flex min-h-10 items-center justify-center rounded-lg px-2 text-center t-body">
            노트 쓰기
          </Link>
          <CompareTrayButton complexId={complexId} name={name} region={region} />
          {askingHref && (
            <a href={askingHref} className="btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-2 text-center t-body">
              호가 점검
            </a>
          )}
        </div>
      </section>

      {nearby.length > 0 && (
        <section className="card rise-in-2 rounded-2xl px-4 py-3.5" aria-labelledby="rail-nearby-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="rail-nearby-title" className="t-section text-ink">
              인근 단지
            </h2>
            <span className="t-sub text-text-3">
              {nearbyLabel} · {nearby.length}곳
            </span>
          </div>
          <ul className="mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
            {nearby.slice(0, 5).map((n) => (
              <li key={n.id}>
                <Link href={complexHrefFromId(n.id)} className="press flex min-h-10 items-center justify-between gap-3 py-2 no-underline">
                  <span className="min-w-0">
                    <span className="block truncate t-body font-bold text-ink">{n.name}</span>
                    <span className="block truncate t-caption text-text-3">{n.meta}</span>
                  </span>
                  <span aria-hidden="true" className="t-body text-text-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rise-in-3">
        <AiBriefingLazy complexId={complexId} region={briefingRegion} aptName={name} noteHref={noteHref} />
      </div>
      <AdZone placement="sidebar" seed={0} plan={null} />
    </aside>
  );
}

export default ComplexRail;
