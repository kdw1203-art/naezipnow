/* [1026d · 검색] 검색 범위 줄 · 연관 검색 칩 · 지역 줄 · 단지 음영 줄 — 헤더/홈 드롭다운(동적 청크) · /search · 지도 ·
   단지 선택기가 같이 그린다. 소유자(2026-09-30) "연관검색의 범위와 상세주소·위치가 음영으로 표시되게".
   - 범위 줄: 검색이 알아들은 것 — 지역(또는 전국) · 조건 칩(준공·세대·면적·가격·순서) · 반영 안 한 말 · 단지 수.
     칩은 회색 바탕(음영). onRemove 가 있으면 칩마다 ✕(검색어에서 그 낱말을 뺀다 — /search).
   - 연관 검색: "신축 23" · "대단지 19" … (조건 없이 지역만 쳤을 때, 0곳은 서버가 뺀다).
   - 단지 음영 줄: 도로명 (동 번지) · 준공 · 세대 · 6개월 거래(모르는 값은 뺀다).
   훅 없음 — 서버/클라이언트 어디서나 그려진다. */

import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { complexAddressLine, complexDetailFacts } from "@/lib/search/complex-address";
import type { ComplexPreview } from "@/lib/search/complex-preview";
import type { AreaJson, IntentJson, RelatedJson } from "./unified-suggest";

const chip = "inline-flex min-h-[24px] items-center gap-1 rounded-full bg-bg px-2 t-caption font-bold text-text-2";

export { nameHighlightQuery } from "@/lib/search/name-highlight";

/** 범위 줄을 그릴 게 있는가 */
export function hasScope(i: IntentJson | null | undefined): i is IntentJson {
  return !!i && (i.mode !== "name" || i.chips.length > 0 || i.unsupported.length > 0);
}

export function ScopeBar({
  intent,
  onRemove,
  className = "",
}: {
  intent: IntentJson;
  /** 칩 ✕ — 검색어에서 token 을 뺀다(없으면 ✕ 를 그리지 않는다) */
  onRemove?: (token: string) => void;
  className?: string;
}) {
  const where = intent.scope?.label ?? (intent.mode === "filter" ? "전국" : null);
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`} role="group" aria-label="검색 범위">
      <span className="mr-0.5 t-caption font-bold text-text-3">검색 범위</span>
      {where && (
        <span className={chip}>
          <Icon name="pin" size={12} />
          {where}
        </span>
      )}
      {intent.chips.map((c) => (
        <span key={`${c.key}-${c.token}`} className={chip}>
          {c.label}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(c.token)}
              aria-label={`${c.label} 조건 빼기`}
              className="-mr-1 inline-grid h-[24px] w-[24px] place-items-center text-text-3"
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {intent.unsupported.map((c) => (
        <span
          key={`u-${c.token}`}
          className="inline-flex min-h-[24px] items-center rounded-full border border-dashed border-line px-2 t-caption text-text-3"
        >
          {c.label}
        </span>
      ))}
      {intent.total != null && (
        <span className="ml-0.5 t-caption text-text-3">
          단지 {intent.total.toLocaleString("ko-KR")}곳 · {sortLabel(intent)}
        </span>
      )}
    </div>
  );
}

function sortLabel(i: IntentJson): string {
  return i.chips.find((c) => c.key === "sort")?.label ?? "6개월 거래 많은 순";
}

/** 연관 검색 칩 — hrefFor 가 있으면 링크, 아니면 onPick */
export function RelatedChips({
  related,
  hrefFor,
  onPick,
  className = "",
}: {
  related: RelatedJson[];
  hrefFor?: (q: string) => string;
  onPick?: (q: string) => void;
  className?: string;
}) {
  if (related.length === 0) return null;
  /* 누르는 칸은 36px(투명) · 보이는 알약은 그 안 — 촘촘히 줄지어도 옆 칩 탭을 가져가지 않는다 */
  const hit = "group inline-flex h-[36px] shrink-0 items-center whitespace-nowrap no-underline";
  const pill =
    "inline-flex min-h-[26px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 t-caption font-bold text-text-2 group-hover:border-primary group-hover:text-primary";
  const body = (r: RelatedJson) => (
    <span className={pill}>
      {r.label}
      <span className="font-medium text-text-3">{r.count.toLocaleString("ko-KR")}</span>
    </span>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-1 ${className}`}>
      <span className="mr-0.5 shrink-0 whitespace-nowrap t-caption font-bold text-text-3">연관 검색</span>
      {related.map((r) =>
        hrefFor ? (
          <Link key={r.q} href={hrefFor(r.q)} prefetch={false} className={hit} aria-label={`${r.q} 검색 (${r.count}곳)`}>
            {body(r)}
          </Link>
        ) : (
          <button key={r.q} type="button" onClick={() => onPick?.(r.q)} className={hit} aria-label={`${r.q} 검색 (${r.count}곳)`}>
            {body(r)}
          </button>
        ),
      )}
    </div>
  );
}

/** 지역 줄의 음영 사실("단지 334곳 · 6개월 거래 974건") */
export function areaDetail(a: Pick<AreaJson, "complexCount" | "recentTradeCount">): string {
  return [
    a.complexCount > 0 ? `단지 ${a.complexCount.toLocaleString("ko-KR")}곳` : "",
    a.recentTradeCount > 0 ? `6개월 거래 ${a.recentTradeCount.toLocaleString("ko-KR")}건` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 단지 줄의 음영 두 줄 — 주소(도로명 (동 번지)) · 준공·세대·거래 */
export function ComplexShade({ p, className = "" }: { p: ComplexPreview; className?: string }) {
  const addr = complexAddressLine(p) || p.region;
  const facts = complexDetailFacts(p).join(" · ");
  return (
    <>
      {addr && <span className={`block truncate t-caption text-text-3 ${className}`}>{addr}</span>}
      {facts && <span className={`block truncate t-caption text-text-3 ${className}`}>{facts}</span>}
    </>
  );
}
