import Link from "@/app/components/IntentLink";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import type { ActiveComplex } from "@/lib/ai/popular-complexes";
import { complexCanonicalPathFromNames } from "@/lib/complex/complex-store";

/* [1081 · #27] 홈 "지역 · 단지 바로가기" — 서버 조각(클라이언트 JS 0). 홈 내부 링크 49개 중 지역 상세(872쪽)·단지 상세로
   **직접** 가는 링크가 없었다(시세 카드는 /map?region=). 지역 카드 12곳 → /region/<id>, 거래 많은 단지(도시당 1곳) → 단지 상세.
   사용자 경로이자 크롤 경로. 둘 다 비면 아무것도 그리지 않는다(빈 약속 금지). */
export function HomeHubLinks({ regions, complexes }: { regions: HomeRegionCard[]; complexes: ActiveComplex[] }) {
  void regions;
  if (complexes.length === 0) return null;
  const row = (title: string, items: Array<{ key: string; label: string; href: string; sub?: string }>) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-1.5">
        {title ? <p className="m-0 t-caption text-text-3">{title}</p> : null}
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
          {items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="tap-line inline-flex items-baseline gap-1 t-sub font-bold text-ink no-underline hover:text-primary">
                {it.label}
                {it.sub && <span className="t-caption font-normal text-text-3">{it.sub}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section aria-labelledby="home-hub-links" className="card mt-4 flex flex-col gap-3 rounded-2xl p-4 max-md:mt-3">
      {/* [1113 · 중복 제거] 지역 줄(강남구 · 마포구 …)은 검색 띠의 "바로 보기" 칩과 같은 목록이라 뺐다 — 단지 줄만 */}
      <h2 id="home-hub-links" className="t-section text-ink">
        최근 6개월 거래 많은 단지
      </h2>
      {row(
        "",
        complexes.map((c) => ({
          key: c.id,
          label: c.name,
          href: complexCanonicalPathFromNames(c.region, c.name),
          sub: `${c.region} · ${c.recentTrades.toLocaleString("ko-KR")}건`,
        })),
      )}
    </section>
  );
}
