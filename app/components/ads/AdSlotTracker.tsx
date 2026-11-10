"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 광고 클릭만 집계한다.
 *
 * 노출(impression)은 일부러 안 센다. 홈은 5분 캐시 + 서버 렌더라 렌더될 때마다
 * 이벤트를 쏘면 실제로 사람이 봤는지와 무관한 숫자가 쌓인다. 클릭은 사람이
 * 직접 누른 것이라 그 자체로 사실이다. 노출 대비 클릭률이 필요해지면
 * IntersectionObserver 기반 뷰어빌리티로 따로 만들어야 한다.
 */
export function AdSlotTracker({
  creativeId,
  kind,
  children,
}: {
  creativeId: string;
  kind: "banner" | "house";
  children: ReactNode;
}) {
  const onClick = () => {
    try {
      void fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: kind === "house" ? "house_ad_click" : "banner_click",
          source: "client",
          campaign: "ads",
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          metadata: { creativeId, kind },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // 계측 실패가 링크 이동을 막지 않는다
    }
  };

  /* [1125 · 자사 안내 카드는 화면에 한 번] 좌우 띠 · 옆 열 · 페이지 끝이 모두 비면 "내집나우 안내" 카드가 서너 장 뜬다.
     문서 순서로 처음 보이는 한 장만 남기고 나머지는 걷는다(광고주 배너는 그대로). 애드센스가 늦게 채워져 앞 카드가 사라지는 경우를 위해 한 번 더 본다. */
  const ref = useRef<HTMLDivElement>(null);
  const [dup, setDup] = useState(false);
  useEffect(() => {
    if (kind !== "house") return;
    const check = () => {
      const me = ref.current;
      if (!me) return;
      const shown = (el: Element) => (el.firstElementChild?.getClientRects().length ?? 0) > 0;
      const first = Array.from(document.querySelectorAll("[data-house-ad]")).find((el) => el === me || shown(el));
      setDup(first !== me);
    };
    check();
    const t = window.setTimeout(check, 3000);
    return () => window.clearTimeout(t);
  }, [kind]);
  if (dup) return <div ref={ref} data-house-ad="" hidden />;

  return (
    <div ref={ref} onClick={onClick} className="contents" data-house-ad={kind === "house" ? "" : undefined}>
      {children}
    </div>
  );
}

export default AdSlotTracker;
