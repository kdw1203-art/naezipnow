"use client";

import { getSessionLite } from "@/lib/client/session-lite";
import { useEffect, useState, type ReactNode } from "react";
import { adFreeForViewer } from "@/lib/ads/ad-free";
import { rememberAdFree } from "@/lib/client/ad-free-flag";
import { readAuthedHint } from "@/lib/auth/authed-hint";

/**
 * 정적 캐시 페이지(홈·동네 피드 등 `revalidate` 사용)용 광고 게이트.
 *
 * 이런 페이지는 서버에서 세션을 읽으면 캐시가 통째로 죽는다(#21 스케일 지침).
 * 대신 캐시된 HTML 은 광고를 포함한 채 내려보내고, 하이드레이션 후 세션의
 * plan 이 광고 제거 플랜이면 클라이언트에서 숨긴다. 유료 사용자에게 첫 페인트에
 * 광고가 잠깐 보일 수 있지만, 캐시를 포기하는 것보다 낫다 — 동적 페이지는
 * 서버에서 adFree 를 계산해 이 게이트를 거치지 않는다(lib/ads/viewer.ts).
 */
export function AdFreeGate({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 최적화 26 — 공유 세션 조회로 수렴
    getSessionLite().then((j) => {
      /* [1098 · 깜박임] 판정을 기억한다 — 다음 화면부터는 그리기 전에 숨긴다(html[data-ad-free]). 비회원(null)은 광고 있음.
         관리자는 유료 플랜이어도 광고 자리를 본다(adFreeForViewer). 세션 쿠키 힌트는 있는데 조회가 실패한 경우(null)는 모르는 것 —
         기억된 판정을 건드리지 않는다(실패 한 번에 유료 플랜의 광고 자리가 되살아나지 않게). */
      if (j === null && readAuthedHint()) return;
      const free = adFreeForViewer(j?.user ?? null);
      rememberAdFree(free);
      if (!cancelled && free) setHidden(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;
  /* data-ad-gate — 기억된 판정이 있으면 CSS 가 그리기 전에 숨긴다(globals.css html[data-ad-free="1"]) */
  return (
    <div data-ad-gate="" className="contents">
      {children}
    </div>
  );
}

export default AdFreeGate;
