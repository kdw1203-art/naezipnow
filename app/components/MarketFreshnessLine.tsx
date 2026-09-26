import { marketFreshnessCaption } from "@/lib/newui/freshness-caption";

/**
 * [1007 · P2] 실거래 신선도 캡션 — 지역 허브·단지 허브가 같은 조각을 쓴다(서버, JS 없음).
 * 라벨(getMarketFreshnessDateLabel, "YYYY.MM.DD")이 없으면 아무것도 그리지 않는다.
 * 출처(국토교통부)는 문장 뒤에 한 번만.
 */
export function MarketFreshnessLine({
  label,
  className = "",
}: {
  label: string | null | undefined;
  className?: string;
}) {
  const caption = marketFreshnessCaption(label);
  if (!caption) return null;
  return (
    <p className={`m-0 t-caption text-text-3 ${className}`} data-market-freshness="">
      {caption} · 국토교통부
    </p>
  );
}
