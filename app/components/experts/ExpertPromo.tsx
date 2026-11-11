import Link from "@/app/components/IntentLink";
import { listVerifiedExpertsCached, type VerifiedExpertLite } from "@/lib/experts/nearby";
import { pickNearbyExperts } from "@/lib/experts/nearby-pick";
import { isPromoLive, rotatePromo } from "@/lib/experts/promo";
import { logger } from "@/lib/log";

/* [1144 · 전문가 홍보 칸] 인증 전문가가 적은 홍보 한 줄을 보여 주는 자리 — 지역·단지 화면 · 전문가 찾기 상단 · 홈 · 목록.
   나가는 조건(lib/experts/promo): 관리자 승인 · 홍보 켬 · 한 줄 있음 · 등록 100일 이내 또는 프로 구독 중.
   늘 "홍보" 표시를 붙인다(광고임을 밝힌다) · 상호와 중개 등록번호가 있으면 같이 적는다. 나갈 사람이 없으면 아무것도 그리지 않는다. */

export async function loadLivePromos(now: string): Promise<VerifiedExpertLite[]> {
  const all = await listVerifiedExpertsCached().catch((e: unknown) => {
    logger.warnSampled("experts:promo", "[experts] 홍보 대상 조회 실패(칸을 접습니다)", e);
    return [] as VerifiedExpertLite[];
  });
  return all.filter((e) => isPromoLive(e, now));
}

export function PromoCard({ e, compact = false }: { e: VerifiedExpertLite; compact?: boolean }) {
  return (
    <Link
      href={`/town/experts/${e.id}`}
      className={`card flex min-w-0 flex-col gap-1 rounded-2xl no-underline ${compact ? "px-3.5 py-3" : "px-4 py-3.5"}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="rounded-full border border-line px-1.5 t-caption font-bold text-text-3">홍보</span>
        <span className="truncate t-caption text-text-2">
          {[e.badgeText, e.regions.slice(0, 2).join("·")].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="truncate t-body font-bold text-ink">{e.promoHeadline}</span>
      {e.promoBody && !compact ? <span className="line-clamp-2 t-sub text-text-2">{e.promoBody}</span> : null}
      <span className="truncate t-caption text-text-3">
        {[e.name, e.organization, e.brokerNo ? `등록번호 ${e.brokerNo}` : null].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}

/** 지역이 정해진 화면(지역 · 단지) — 그 지역에서 활동하는 사람만, 최대 limit */
export async function RegionExpertPromo({ sigungu, city = "", limit = 2 }: { sigungu: string; city?: string | null; limit?: number }) {
  const gu = sigungu.trim();
  if (!gu) return null;
  const live = await loadLivePromos(new Date().toISOString());
  const picked = pickNearbyExperts(live, gu, city ?? "", limit);
  if (picked.length === 0) return null;
  return (
    <section aria-label={`${gu} 전문가 홍보`} className={`mt-4 grid grid-cols-1 gap-2 ${limit > 1 ? "md:grid-cols-2" : ""}`}>
      {picked.map((e) => (
        <PromoCard key={e.id} e={e} />
      ))}
    </section>
  );
}

/** 지역과 무관한 자리(홈 · 목록 · 전문가 찾기 상단) — 날마다 차례가 돈다. slot 이 다르면 다른 사람 */
export async function RotatingExpertPromo({ slot, count = 1, compact = false, className = "" }: { slot: number; count?: number; compact?: boolean; className?: string }) {
  const now = new Date().toISOString();
  const picked = rotatePromo(await loadLivePromos(now), now, slot, count);
  if (picked.length === 0) return null;
  return (
    <section aria-label="전문가 홍보" className={`grid grid-cols-1 gap-2 ${count > 1 ? "md:grid-cols-2" : ""} ${className}`.trim()}>
      {picked.map((e) => (
        <PromoCard key={e.id} e={e} compact={compact} />
      ))}
    </section>
  );
}
