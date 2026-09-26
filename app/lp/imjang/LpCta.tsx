"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { withUtm } from "@/lib/analytics/utm";
import {
  LP_IMJANG_LEAD_SOURCE,
  leadConversionLabel,
  sendAdsConversion,
} from "@/lib/analytics/google-ads";

/* [1006 · E] 광고 랜딩의 단일 CTA.
 *
 * - href: 서버 렌더는 utm 없는 /notes/new, 마운트 뒤 랜딩 URL 의 utm_* 을 실어 붙인다
 *   (lib/analytics/utm.ts). ISR/정적 HTML 은 방문자 공용이라 서버가 utm 을 읽을 수 없다.
 * - 계측: GA4 표준 generate_lead — 쿠키 동의 뒤에만 window.gtag 가 있으므로(ga4-gtag-loader)
 *   있을 때만 보낸다. 동의 전엔 요청이 나가지 않는다(사이트 방침). AW 직접 전환은
 *   NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL 이 있을 때만(google-ads.ts 규칙 그대로).
 * - 클릭 계측은 이동을 막지 않는다 — 실패해도 링크는 그대로 간다. */

const TARGET = "/notes/new";

export function LpCta({ label }: { label: string }) {
  const [href, setHref] = useState(TARGET);
  useEffect(() => {
    try {
      setHref(withUtm(TARGET, window.location.search));
    } catch {
      /* 주소 파싱 실패 — utm 없이 진행 */
    }
  }, []);

  const onClick = () => {
    try {
      const gtag = window.gtag;
      if (typeof gtag !== "function") return;
      gtag("event", "generate_lead", { lead_source: LP_IMJANG_LEAD_SOURCE, currency: "KRW", value: 0 });
      sendAdsConversion(gtag, leadConversionLabel(), {});
    } catch {
      /* 계측 실패는 이동에 영향을 주지 않는다 */
    }
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className="btn-primary btn-cta inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-center t-body sm:w-auto"
      data-lp-cta=""
    >
      <Icon name="notebook-pen" size={16} />
      {label}
    </Link>
  );
}
