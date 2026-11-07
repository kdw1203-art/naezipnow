import Link from "@/app/components/IntentLink";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import type { ComplexPairLink } from "@/lib/dong/landing";

/* [1108 · 단지 상세 A안 · C 에서 가져온 것] 인근 단지 + 단지 비교 = 한 목록.
   예전엔 "인근 단지" 카드(이름 · 연식 · 세대)와 그 아래 "단지 비교 · 두 단지 나란히" 칩 카드가 따로 섰다 — 같은 상대 단지가
   두 번 나왔다(공작럭키 카드 + "공작럭키 비교" 칩). 이제 한 줄에 상대 단지 · 사실 줄(연식 · 세대 · 최근 6개월 신고 건수) ·
   맨 오른쪽 "비교"(그 조합이 있을 때만). 조합이 있는데 인근 목록에 없는 상대 단지는 아래 칩으로 남긴다(링크 손실 0).
   비교 화면(/complex/compare · 5일 방문 107)은 메뉴에서 빠지고 이 줄과 "실거래" 드롭다운에서 닿는다.
   서버 조각(JS 0) · 폰 블록과 데스크톱 레일이 같은 조각을 쓴다. 숫자는 전부 page.tsx 가 이미 가진 값(추가 조회 0 —
   최근 6개월 건수는 같은 매트뷰 행의 열 하나를 더 읽은 것). */

export interface NearbyRow {
  id: string;
  name: string;
  meta: string;
  /** 최근 6개월 매매 신고 건수(complex_tx_stats_base.recent_trade_count) — 모르면 null */
  recent?: number | null;
}

export function ComplexNearby({
  nearby,
  pairs = [],
  label,
  max = 8,
  dense = false,
}: {
  nearby: readonly NearbyRow[];
  pairs?: readonly ComplexPairLink[];
  /** "관양동 다른 단지" · "동안구" — 머리 오른쪽 */
  label: string;
  max?: number;
  /** 레일(340px) — 줄 간격을 조금 좁힌다 */
  dense?: boolean;
}) {
  if (nearby.length === 0 && pairs.length === 0) return null;
  const rows = nearby.slice(0, max);
  const pairByName = new Map(pairs.map((p) => [p.other, p] as const));
  const shownNames = new Set(rows.map((r) => r.name));
  const restPairs = pairs.filter((p) => !shownNames.has(p.other));
  return (
    <>
      {rows.length > 0 && (
        <ul className="lq-panel m-0 flex list-none flex-col divide-y p-0" data-tone="plain">
          {rows.map((n) => {
            const pair = pairByName.get(n.name);
            const facts = [n.meta, typeof n.recent === "number" && n.recent > 0 ? `6개월 ${n.recent.toLocaleString("ko-KR")}건` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={n.id} className={`flex items-center gap-2 ${dense ? "py-1.5" : "py-2"}`}>
                <Link href={complexHrefFromId(n.id)} className="press flex min-h-10 min-w-0 flex-1 flex-col justify-center no-underline">
                  <span className="truncate t-body font-bold text-ink">{n.name}</span>
                  {facts ? <span className="truncate t-caption text-text-3 tabular-nums">{facts}</span> : null}
                </Link>
                {pair ? (
                  <Link
                    href={pair.href}
                    title={`${n.name}와 비교 · 두 단지 최근 12개월 매매 ${pair.pairTradeCount.toLocaleString("ko-KR")}건`}
                    className="tile inline-flex min-h-10 shrink-0 items-center rounded-full border border-border px-3 t-sub font-bold text-ink no-underline md:min-h-8"
                  >
                    비교
                  </Link>
                ) : (
                  <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                    ›
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {restPairs.length > 0 && (
        <div className={rows.length > 0 ? "mt-2" : ""}>
          <p className="m-0 t-caption text-text-3">단지 비교 · 두 단지 나란히</p>
          <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-2 p-0">
            {restPairs.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="tile inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 t-sub font-bold text-ink no-underline md:min-h-8"
                >
                  <span>{p.other} 비교</span>
                  <span className="t-caption font-normal tabular-nums text-text-3">{p.pairTradeCount.toLocaleString("ko-KR")}건</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 mt-1.5 t-caption text-text-3">{label} · 거래 많은 순 · 국토교통부 신고 건수</p>
    </>
  );
}

export default ComplexNearby;
