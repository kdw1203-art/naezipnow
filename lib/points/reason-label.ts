/**
 * [1057] 원장(point_ledger) reason → 사람이 읽는 라벨 — 한 곳.
 *
 * 예전엔 두 곳이 따로 풀었다: 알림 센터(app/api/notifications pointLabel)는 "spend:post_boost_3d"·"expire"·"listing_boost"·
 * "report:<id>" 를 원문 그대로 보여 줬고, 지갑(app/my/points reasonLabel)은 listing_boost·report:* 같은 **사용** 행을
 * "포인트 적립" 으로 적었다. 규칙은 하나다:
 *   EARN_RULES 키            → 규칙 라벨
 *   spend:<itemKey>          → SPEND_ITEMS 라벨(판매 중단 상품은 "포인트 사용")
 *   expire                   → 포인트 만료
 *   listing_boost            → 매물 상단 노출(app/api/listings/[id]/boost 가 쓰는 reason)
 *   report:<id>              → 리포트 구매
 *   refund:<itemKey>         → 환불(상품 라벨이 있으면 "환불 · <라벨>")
 *   그 외                    → 부호로 "포인트 적립" / "포인트 사용"(delta 를 모르면 "포인트 변동")
 */
import { EARN_RULES, getSpendItem } from "@/lib/points/catalog";

export function reasonLabel(reason: string, delta?: number): string {
  const r = String(reason ?? "").trim();
  if (!r) return fallback(delta);
  const earn = EARN_RULES[r];
  if (earn) return earn.label;
  if (r === "expire") return "포인트 만료";
  if (r === "listing_boost") return "매물 상단 노출";
  if (r.startsWith("report:")) return "리포트 구매";
  if (r.startsWith("spend:")) {
    const item = getSpendItem(r.slice("spend:".length));
    return item ? item.label : "포인트 사용";
  }
  if (r.startsWith("refund:")) {
    const item = getSpendItem(r.slice("refund:".length));
    return item ? `환불 · ${item.label}` : "환불";
  }
  /* reason 이 상품 키 그대로인 옛 행(예: listing_boost_7d) */
  const direct = getSpendItem(r);
  if (direct) return direct.label;
  return fallback(delta);
}

function fallback(delta?: number): string {
  if (typeof delta === "number" && Number.isFinite(delta)) return delta < 0 ? "포인트 사용" : "포인트 적립";
  return "포인트 변동";
}
