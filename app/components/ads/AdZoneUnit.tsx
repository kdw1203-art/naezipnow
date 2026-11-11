"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getAdSenseClient,
  getSlotForPlacementOrDefault,
  hasDedicatedSlot,
  isAdsExcludedPath,
  type AdPlacement,
} from "@/lib/ads/adsense-policy";
import { getSessionLite } from "@/lib/client/session-lite";
import { adSenseAdFree } from "@/lib/ads/ad-free";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { whenBoxVisible } from "@/lib/ads/push-when-visible";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * [961] 광고 공간의 애드센스 유닛(클라이언트) — AdZone 안에서만 쓴다.
 *
 * 게이트는 AdSenseLoader·AdSenseUnit 과 같은 3중: 클라이언트 ID · 제외 경로 · 광고 없는
 * 플랜(판정 전에는 안 띄운다). 스크립트는 layout <head> 의 공식 스니펫이 이미 실었고,
 * 광고 요청 잠금(pauseAdRequests)은 AdSenseLoader 가 판정 뒤 푼다 — 여기서 push 한 요청은
 * 잠금이 풀리는 순간 나간다.
 *
 * 애드센스가 <ins> 에 적는 data-ad-status(filled/unfilled)를 CSS(.ad-zone …)가 읽어
 * 채워지면 대체 카드를, 안 채워지면 이 빈 <ins> 를 숨긴다. "광고" 라벨은 채워졌을 때만 보인다.
 */
export function AdZoneUnit({
  placement,
  className = "",
  shape,
}: {
  placement: AdPlacement;
  className?: string;
  /** [1148] 좁은 세로 띠(160px) — 세로형 광고만 받는다. "auto" 는 좁은 칸에 글자 목록형 광고를 넣어 글이 잘렸다(운영 2026-11-11) */
  shape?: "vertical";
}) {
  const client = getAdSenseClient();
  const slot = getSlotForPlacementOrDefault(placement);
  const pathname = usePathname() ?? "/";
  const excluded = isAdsExcludedPath(pathname);
  const enabled = Boolean(client && slot) && !excluded;
  const inArticle = placement === "article_end" && hasDedicatedSlot(placement);

  const [adFree, setAdFree] = useState<boolean | null>(null);
  const pushedRef = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const s = await getSessionLite();
      if (!alive) return;
      /* [1105] null = 힌트 없으면 비회원(광고 대상) · 힌트 있으면 조회 실패(안 띄운다) — 예전엔 비회원에게도 안 그렸다 */
      setAdFree(adSenseAdFree(s, readAuthedHint()));
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const show = enabled && adFree === false;

  /* [1105] 칸 상자가 보일 때만 <ins> 를 그리고 push(lib/ads/push-when-visible 머리 주석) */
  const [boxVisible, setBoxVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    return whenBoxVisible(boxRef.current, () => setBoxVisible(true));
  }, [show]);

  useEffect(() => {
    if (!show || !boxVisible || pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* 광고 차단기 등 — 대체 카드가 자리를 채운다 */
    }
  }, [show, boxVisible]);

  if (!show) return null;

  return (
    <div ref={boxRef} className={`ad-zone-unit ${className}`}>
      <div className="ad-zone-label mb-1">광고</div>
      {boxVisible && (
      <ins
        className={shape === "vertical" ? "adsbygoogle side-rail-ins" : "adsbygoogle"}
        /* [1153] 세로 띠는 **고정 크기 칸**(160×600 · 넓은 화면 300×600 — globals.css .side-rail-ins)으로 요청한다.
           형식을 맡기면(auto · vertical) 좁은 칸에 "자세히 알아보기" 글자 목록형이 들어와 글이 "부동산 …" 으로 잘렸다(운영 2026-11-11).
           크기를 CSS 로 정하고 data-ad-format 을 빼면 그 크기의 광고만 온다. */
        style={shape === "vertical" ? { display: "inline-block" } : { display: "block" }}
        data-ad-client={client ?? undefined}
        data-ad-slot={slot}
        data-ad-format={shape === "vertical" ? undefined : inArticle ? "fluid" : "auto"}
        data-ad-layout={inArticle ? "in-article" : undefined}
        data-full-width-responsive={inArticle || shape === "vertical" ? undefined : "true"}
      />
      )}
    </div>
  );
}

export default AdZoneUnit;
