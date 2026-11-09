import Link from "@/app/components/IntentLink";
import { formatEokMan } from "@/lib/format/eok-man";
import { rankHomeDeals, type HomeDealRow } from "@/lib/newui/home-deals";
import { RankTicker } from "./RankTicker";

export { toHomeDealRows, type HomeDealRow } from "@/lib/newui/home-deals";

/* [1108 · 홈 A안] 최근 실거래 — 대표 지역의 최신 매매 신고(계약일 내림차순).
   [1114 · 홈 벤토] 소유자 2026-11-09 "옅은 파란색 지역 단지별은 배너(아래에서 위로 올라가는, 순위)로" — 여섯 줄 판 → 순위 배너.
   최근 신고 N건을 한 건 금액 높은 순으로 매겨(rankHomeDeals · 순수 함수) 한 줄씩 아래에서 위로 넘긴다(RankTicker · 클라이언트 섬).
   전체 순위는 아래 닫힌 목록(서버 HTML · 크롤 경로) — 배너와 같은 줄을 펼쳐 두지 않는다(같은 사실 한 번).
   0건은 0건, 실패는 실패(1015 · 규칙 D). 단지 이름은 그 단지 화면으로. */

export function HomeRecentDeals({
  regionName,
  rows,
  failed = false,
  mapHref,
}: {
  regionName: string;
  rows: readonly HomeDealRow[];
  failed?: boolean;
  /** "지도에서 전체 ›" 목적지(지역 딥링크) */
  mapHref: string;
}) {
  const ranked = rankHomeDeals(rows, 10);
  return (
    <section className="card flex flex-col gap-2.5 rounded-2xl p-[var(--pad-card)]" aria-labelledby="home-recent-deals-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="home-recent-deals-title" className="t-section text-ink">
          {regionName} 실거래 금액 순위
        </h2>
        <Link href={mapHref} className="tap-line inline-block shrink-0 py-[5px] t-sub font-bold text-primary no-underline">
          지도에서 전체 ›
        </Link>
      </div>
      {ranked.length === 0 ? (
        <p className="m-0 t-sub text-text-3">
          {failed ? "최근 실거래 불러오기 실패 · 잠시 후 다시" : `${regionName} 신고된 매매 실거래 없음`}
        </p>
      ) : (
        <>
          {/* 옅은 파랑 판(data-tone="blue") 그대로 — 한 줄 배너 */}
          <RankTicker
            items={ranked.map((r) => ({
              key: r.key,
              label: r.complexName,
              sub: [r.date, r.spec].filter(Boolean).join(" · "),
              value: formatEokMan(r.man),
              href: r.href,
            }))}
          />
          <details className="group">
            <summary className="tap-line flex min-h-10 cursor-pointer list-none items-center justify-between t-sub font-bold text-text-2">
              1~{ranked.length}위 전체
              <span aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-180">
                {/* dead-control-ok: summary 가 눌리는 자리 — 꺾쇠는 열림 표시 */}⌄
              </span>
            </summary>
            <ol className="m-0 flex list-none flex-col p-0">
              {ranked.map((r, i) => {
                const inner = (
                  <>
                    <span className="w-5 shrink-0 t-sub font-bold text-text-3 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-ink">{r.complexName}</span>
                      <span className="block truncate t-caption text-text-3 tabular-nums">{[r.date, r.spec].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 t-body t-num font-bold">{formatEokMan(r.man)}</span>
                  </>
                );
                return (
                  <li key={r.key} className="border-t border-divider">
                    {r.href ? (
                      <Link href={r.href} className="press flex min-h-11 items-center gap-2.5 py-1.5 no-underline">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex min-h-11 items-center gap-2.5 py-1.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
          <p className="m-0 t-caption text-text-3">
            최근 신고 {rows.length.toLocaleString("ko-KR")}건 중 한 건 금액 높은 순 · 국토교통부 아파트 매매 실거래 신고 · 해제 신고 제외 · 호가 아님
          </p>
        </>
      )}
    </section>
  );
}

export default HomeRecentDeals;
