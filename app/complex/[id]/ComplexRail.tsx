/* [1024 · 단지 상세] 데스크톱 오른쪽 레일(lg) — 요약 4칸 · 행동 3개(노트 쓰기·비교·호가 점검) · 인근 단지(+비교 · [1108]) · AI 브리핑 · 광고.
   시안 mock1024/complex-d 의 aside. 값은 전부 page.tsx 가 이미 가진 숫자(추가 조회 0). 채움 파랑은 이 파일에 하나
   (노트 쓰기) — 폰 하단 CTA 블록(page.tsx, lg:hidden)과는 다른 브레이크포인트라 한 화면엔 하나다. 서버 조각. */
import Link from "@/app/components/IntentLink";
import { CompareTrayButton } from "@/app/components/CompareTrayButton";
import { AdZone } from "@/app/components/ads/AdZone";
import { AiBriefingLazy } from "./AiBriefingLazy";
import { ComplexAreaMapLazy } from "./ComplexAreaMapLazy";
import { ComplexNearby, type NearbyRow } from "./ComplexNearby";
import type { ComplexPairLink } from "@/lib/dong/landing";

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
  pairs = [],
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
  nearby: readonly NearbyRow[];
  /** [1095 → 1108] 이 단지가 낀 비교 조합 — 인근 단지 줄의 "비교" 단추로 합쳤다(ComplexNearby · 목록에 없는 상대는 칩) */
  pairs?: readonly ComplexPairLink[];
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

      {/* [1108] 인근 단지 + 단지 비교 = 한 카드(ComplexNearby). 1095 의 "인근 단지가 비어도 선다"는 그대로 — 조합만 있으면 칩으로 선다 */}
      {(nearby.length > 0 || pairs.length > 0) && (
        <section className="card rise-in-2 rounded-2xl px-4 py-3.5" aria-labelledby="rail-nearby-title">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 id="rail-nearby-title" className="t-section text-ink">
              인근 단지
            </h2>
            {nearby.length > 0 && (
              <span className="t-sub text-text-3">
                {nearbyLabel} · {nearby.length}곳
              </span>
            )}
          </div>
          <ComplexNearby nearby={nearby} pairs={pairs} label={nearbyLabel} max={5} dense />
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
