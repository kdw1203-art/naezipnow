/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
/* [1012 · 규칙 2] 손으로 적은 큰 그림자(rgba 16~60px) → 토큰(--shadow-md/lg) 또는 그림자 없이 1px 선 · 호버 들림(-translate-y) 제거 */
import Link from "next/link";
import type { ReactNode } from "react";
import { listBanners, type Banner, type BannerPlacement } from "@/lib/admin/banners";
import { pickHouseAd, type HouseAd } from "@/lib/ads/house-ads";
import type { AdPlacement } from "@/lib/ads/adsense-policy";
import { isAdFreePlan } from "@/lib/ads/ad-free";
import { AdSlotTracker } from "./AdSlotTracker";
import { AdFreeGate } from "./AdFreeGate";

/**
 * H3·H4 — 광고 슬롯 (서버 컴포넌트).
 *
 * 우선순위: 어드민이 등록한 배너(banners 테이블) → 하우스 광고 → 아무것도 안 그림.
 * AdSense 는 layout 의 Auto ads 가 따로 처리하므로 여기서 다루지 않는다.
 *
 * 광고 없는 플랜(pro/expert/enterprise)에는 하우스 광고도 띄우지 않는다.
 * 하우스 광고는 대부분 업셀인데, 이미 결제한 사람에게 결제를 권하는 건 소음이다.
 *
 * 등록된 배너도 하우스 광고도 없으면 자리를 차지하지 않는다.
 * "광고 준비 중" 같은 빈 상자를 남기지 않는다 — 빈 상자는 레이아웃만 밀고 정보가 없다.
 */

const PLACEMENT_MAP: Record<AdPlacement, BannerPlacement> = {
  home_feed: "home",
  community_feed: "community",
  report_free_body: "global",
  article_end: "global",
  page_bottom: "global",
  sidebar: "global",
};

function BannerCard({ banner }: { banner: Banner }) {
  const href = banner.ctaUrl || null;
  const inner = (
    <div
      /* [1015 · 규칙 G] 광고 자리는 흰 카드와 같은 재질 — 배너 색(bgFrom·bgTo)은 단색 면 하나로만, 그라데이션 없음 */
      className="card flex flex-col gap-1 rounded-lg px-5 py-4"
      style={{
        background: banner.bgFrom || undefined,
        color: banner.textColor || undefined,
      }}
    >
      <span className="t-caption font-bold opacity-80">광고</span>
      <span className="t-section font-bold leading-snug">{banner.title}</span>
      {banner.subtitle ? (
        <span className="t-sub leading-relaxed opacity-90">{banner.subtitle}</span>
      ) : null}
      {/* ctaLabel 과 ctaUrl 은 서로 독립인 nullable 컬럼이고, 어드민 폼은 빈 URL 을
          null 로 저장한다. 예전에는 라벨만 있으면 무조건 그렸기 때문에, URL 없는
          배너에서 굵은 밑줄 텍스트가 링크처럼 보이는데 감싸는 <a> 가 없어 눌러도
          아무 일도 없었다. 갈 곳이 있을 때만 CTA 를 그린다. */}
      {banner.ctaLabel && href ? (
        <span className="mt-1.5 t-sub font-bold underline underline-offset-2">
          {banner.ctaLabel}
        </span>
      ) : null}
    </div>
  );

  if (!href) return <div className="block">{inner}</div>;

  // 외부 링크는 새 탭 + rel 로 연다 (referrer·opener 유출 방지)
  const external = /^https?:\/\//i.test(href);
  return (
    <AdSlotTracker creativeId={banner.id} kind="banner">
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block no-underline">
          {inner}
        </a>
      ) : (
        <Link href={href} className="block no-underline">
          {inner}
        </Link>
      )}
    </AdSlotTracker>
  );
}

/* [v4 · 1012] 자사 안내 카드 — 그라데이션 띠·점 무늬·호버 워터마크를 걷고 평평한 카드 한 장으로.
   "내집나우 안내"(캡션) → 제목 → 본문 → 글자 링크. 광고주 배너(아래 BannerCard)만 운영자가 고른 색을 쓴다. */
function HouseAdCard({ ad }: { ad: HouseAd }) {
  return (
    <AdSlotTracker creativeId={ad.id} kind="house">
      <Link
        href={ad.href}
        className="card block rounded-lg px-4 py-3.5 no-underline transition-colors duration-200 hover:border-line-strong"
      >
        <div className="t-caption text-text-3">내집나우 안내 · {ad.eyebrow}</div>
        <div className="mt-1 t-section text-ink">{ad.title}</div>
        <p className="mt-0.5 t-sub text-text-2">{ad.body}</p>
        <span className="mt-1.5 inline-block t-sub font-bold text-primary">{ad.ctaLabel} ›</span>
      </Link>
    </AdSlotTracker>
  );
}

export async function AdSlot({
  placement,
  seed = 0,
  adFree = false,
  signedIn = false,
  plan = null,
  className,
}: {
  placement: AdPlacement;
  /** 같은 페이지에 슬롯이 여러 개일 때 서로 다른 배너가 나오도록 하는 위치값 */
  seed?: number;
  /** 광고 제외 플랜(pro/expert/enterprise) 여부 */
  adFree?: boolean;
  signedIn?: boolean;
  /**
   * 보는 사람의 플랜. null 이면 "모른다"는 뜻이다(공유 캐시 페이지 등).
   * 모를 때는 특정 플랜을 겨냥한 배너를 띄우지 않는다 — 이미 결제한 사람에게
   * "지금 결제하세요"가 나가는 것보다 안 나가는 쪽이 낫다.
   */
  plan?: string | null;
  className?: string;
}) {
  // adFree 를 직접 받았거나(동적 페이지 — lib/ads/viewer.ts getAdViewer), plan 이
  // 광고 제거 플랜이면 서버에서부터 아무것도 그리지 않는다.
  if (adFree || isAdFreePlan(plan)) return null;

  const all = await listBanners(PLACEMENT_MAP[placement]).catch(() => [] as Banner[]);
  const banners = all.filter((b) => {
    if (!b.targetPlan) return true;
    if (!plan) return false;
    return b.targetPlan.toLowerCase() === plan.toLowerCase();
  });
  const banner = banners.length > 0 ? banners[seed % banners.length] : null;

  let content: ReactNode = null;
  if (banner) {
    content = (
      <div className={className}>
        <BannerCard banner={banner} />
      </div>
    );
  } else {
    const house = pickHouseAd(placement, seed, { signedIn });
    if (!house) return null;
    content = (
      <div className={className}>
        <HouseAdCard ad={house} />
      </div>
    );
  }

  // plan === null 은 "보는 사람을 모른다"(정적 캐시 페이지) — 캐시를 살리기 위해
  // 광고를 그대로 내려보내되, 클라이언트에서 유료 플랜이면 숨긴다.
  if (plan == null) return <AdFreeGate>{content}</AdFreeGate>;
  return content;
}

export default AdSlot;
