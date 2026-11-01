import { listBanners, type Banner, type BannerPlacement } from "@/lib/admin/banners";
import type { AdPlacement } from "@/lib/ads/adsense-policy";
import { isAdFreePlan } from "@/lib/ads/ad-free";
import Link from "@/app/components/IntentLink";
import { AdFreeGate } from "./AdFreeGate";
import { AdSlotTracker } from "./AdSlotTracker";
import { AdminStripPlaceholder } from "./AdminStripPlaceholder";

/**
 * [1098 · 배너] 상단 띠 배너 자리(서버 컴포넌트) — 소유자(2026-11-01) "광고 배너 공간도 마련해 줘".
 *
 * 자리: 허브 머리 아래 한 줄(홈 · 뉴스룸 · 동네 · 실거래 구간 · 동별 실거래 · 단지 비교 · AI 분석). 높이는 CSS 가 미리 잡는다(.ad-strip__box).
 * 내용: 운영자가 관리 › 배너에 **이미지 URL** 을 넣은 배너(=띠 배너). 이미지 없는 배너는 종전대로 카드 자리(AdSlot)에만 나간다 — 같은 배너가
 *       한 화면에 두 번 나오지 않게 둘을 가른다(AdSlot 은 이미지 배너를 뺀다). DB 의 placement 값은 그대로(home · community · … · global).
 * 비었을 때: 아무것도 그리지 않는다("광고 준비 중" 빈 상자 금지 — AdSlot 과 같은 원칙). 관리자에게만 점선 자리 표시(AdminStripPlaceholder)로
 *       "여기가 띠 배너 자리"임을 보인다.
 * 유료 플랜: 카드 자리와 같은 규칙(AdFreeGate · 관리자는 본다). 공유 캐시 화면은 plan={null} 로 두고 클라이언트 게이트가 가린다.
 */
const PLACEMENT_MAP: Record<AdPlacement, BannerPlacement> = {
  home_feed: "home",
  community_feed: "community",
  report_free_body: "global",
  article_end: "global",
  page_bottom: "global",
  sidebar: "global",
};

/** 띠 배너 = 이미지 URL 이 있는 배너 */
export function isStripBanner(b: Pick<Banner, "imageUrl">): boolean {
  return Boolean(b.imageUrl && b.imageUrl.trim());
}

function StripBanner({ banner }: { banner: Banner }) {
  const href = banner.ctaUrl || null;
  const box = (
    <span className="ad-strip__box" style={{ background: banner.bgFrom || undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner.imageUrl ?? ""} alt={banner.title} className="ad-strip__img" decoding="async" />
      <span className="ad-strip__label">광고</span>
      {banner.ctaLabel && href ? <span className="ad-strip__text" style={{ color: banner.textColor || undefined }}>{banner.ctaLabel} ›</span> : null}
    </span>
  );
  if (!href) return box;
  const external = /^https?:\/\//i.test(href);
  return (
    <AdSlotTracker creativeId={banner.id} kind="banner">
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block no-underline">
          {box}
        </a>
      ) : (
        <Link href={href} className="block no-underline">
          {box}
        </Link>
      )}
    </AdSlotTracker>
  );
}

export async function TopBanner({
  placement,
  plan = null,
  adFree = false,
  className = "",
}: {
  placement: AdPlacement;
  plan?: string | null;
  adFree?: boolean;
  className?: string;
}) {
  if (adFree || isAdFreePlan(plan)) return null;
  const all = await listBanners(PLACEMENT_MAP[placement]).catch(() => [] as Banner[]);
  const strip = all.filter((b) => {
    if (!isStripBanner(b)) return false;
    if (!b.targetPlan) return true;
    if (!plan) return false;
    return b.targetPlan.toLowerCase() === plan.toLowerCase();
  });
  const banner = strip[0] ?? null;
  if (!banner) return <AdminStripPlaceholder placement={placement} className={className} />;
  const body = <StripBanner banner={banner} />;
  return (
    <aside className={`ad-strip ${className}`} aria-label="광고 배너" data-placement={placement}>
      {plan == null ? <AdFreeGate>{body}</AdFreeGate> : body}
    </aside>
  );
}

export default TopBanner;
