import Link from "@/app/components/IntentLink";
import { formatEokMan } from "@/lib/format/eok-man";
import type { HomeDealRow } from "@/lib/newui/home-deals";

export { toHomeDealRows, type HomeDealRow } from "@/lib/newui/home-deals";

/* [1108 · 홈 A안] 최근 실거래 — 대표 지역(지역 동향 첫 카드와 같은 지역)의 최신 매매 신고 N건(계약일 내림차순).
   홈이 "검색 → 숫자 → 목록"으로 시작해야 한다는 1012 실측(기준 사이트 4곳)에서 홈에 없던 한 가지가 **실거래 한 건 단위 목록**이었다.
   지역 동향 카드는 월 평균 · 등락(요약)이고, 이 판은 한 건 금액 그대로다 — 같은 사실 두 곳이 아니다.
   서버 조각(JS 0) · 데이터는 lib/market/store listRegionTransactions(지역 화면과 같은 함수 · 한 왕복) · ISR 300초.
   0건은 0건, 실패는 실패(1015 · 규칙 D). 단지 이름은 그 단지 화면으로(신고 행의 region_name + complex_name). */

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
  return (
    <section className="flex flex-col gap-2" aria-labelledby="home-recent-deals-title">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="home-recent-deals-title" className="t-section text-ink">
          최근 실거래 · {regionName}
        </h2>
        <Link href={mapHref} className="tap-line inline-block py-[5px] t-sub font-bold text-primary no-underline">
          지도에서 전체 ›
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="card m-0 rounded-2xl px-4 py-3.5 t-sub text-text-3">
          {failed ? "최근 실거래 불러오기 실패 · 잠시 후 다시" : `${regionName} 신고된 매매 실거래 없음`}
        </p>
      ) : (
        <ul className="lq-panel m-0 flex list-none flex-col divide-y p-0" data-tone="blue">
          {rows.map((r) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate t-body font-bold text-ink">{r.complexName}</span>
                  <span className="block truncate t-caption text-text-3 tabular-nums">{[r.date, r.spec].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 t-body t-num">{formatEokMan(r.man)}</span>
              </>
            );
            return (
              <li key={r.key}>
                {r.href ? (
                  <Link href={r.href} className="press flex min-h-11 items-center gap-3 py-2 no-underline">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && <p className="m-0 px-1 t-caption text-text-3">국토교통부 아파트 매매 실거래 신고 · 해제 신고 제외 · 한 건 금액 그대로 · 호가 아님</p>}
    </section>
  );
}

export default HomeRecentDeals;
