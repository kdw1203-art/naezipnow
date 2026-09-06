"use client";

/* G2 — Web Vitals RUM 수집.
   [OPT-01] next/web-vitals 훅 → web-vitals/attribution 직접 사용으로 교체.
   지표값만으로는 "어느 페이지의 어떤 요소가 LCP 범인인지"를 알 수 없었다
   (2026-08-23 LCP p75 3,872ms 실패 — 원인 불명). attribution 빌드는
   LCP 요소 선택자·리소스 URL, INP 의 이벤트 대상·타입까지 알려준다.
   기존 /api/metrics/web-vitals 엔드포인트(web_vitals 테이블)로 전송.
   sendBeacon 우선(언로드 안전), 실패 시 keepalive fetch. 렌더 없음. */
import { useEffect } from "react";
import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type CLSMetricWithAttribution,
  type FCPMetricWithAttribution,
  type INPMetricWithAttribution,
  type LCPMetricWithAttribution,
  type TTFBMetricWithAttribution,
} from "web-vitals/attribution";

type AnyMetric =
  | CLSMetricWithAttribution
  | FCPMetricWithAttribution
  | INPMetricWithAttribution
  | LCPMetricWithAttribution
  | TTFBMetricWithAttribution;

/* [967 · 29b] LCP 하위 구간을 element 문자열 꼬리에 접어 넣는다.
   API·web_vitals 스키마(element ≤ 256자)는 그대로 두고, 다음 분석이 TTFB 와 렌더 지연을
   가를 수 있게 " |ttfb=450 rld=0 rldur=0 erd=1200"(ms 반올림) 꼴로 붙인다.
   값이 하나도 없으면(LCP 가 아니면) 빈 문자열 — 지어내지 않는다. */
const LCP_SUBPART_KEYS = [
  ["timeToFirstByte", "ttfb"],
  ["resourceLoadDelay", "rld"],
  ["resourceLoadDuration", "rldur"],
  ["elementRenderDelay", "erd"],
] as const;
const ELEMENT_MAX = 256;

function lcpSubpartsSuffix(a: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, short] of LCP_SUBPART_KEYS) {
    const v = a[key];
    if (typeof v === "number" && Number.isFinite(v)) parts.push(`${short}=${Math.round(v)}`);
  }
  return parts.length > 0 ? ` |${parts.join(" ")}` : "";
}

function attributionOf(metric: AnyMetric): { element: string | null; attrUrl: string | null } {
  const a = metric.attribution as Record<string, unknown> | undefined;
  if (!a) return { element: null, attrUrl: null };
  /* LCP: target(선택자)·url(이미지·리소스). INP: interactionTarget·interactionType.
     CLS: largestShiftTarget. 나머지는 null — 지어내지 않는다.
     [967 · 29b] web-vitals v5+ 는 LCP 선택자를 `element` 가 아니라 `target` 에 담는다
     (node_modules/web-vitals/dist/modules/types/lcp.d.ts). `element` 만 읽던 탓에 7일간
     LCP 299행 중 요소가 남은 행이 0이었다(CLS·INP 는 이름이 그대로라 멀쩡). 옛 이름도
     같이 읽어 둔다 — 버전이 되돌아가도 다시 비지 않게. */
  const lcpTarget =
    (typeof a.target === "string" && a.target) ||
    (typeof a.element === "string" && a.element) ||
    null;
  /* 선택자가 길면 선택자 쪽을 자른다 — 꼬리의 숫자가 잘리면 분석에 못 쓴다. */
  const lcpSuffix = lcpTarget !== null ? lcpSubpartsSuffix(a) : "";
  const element =
    (lcpTarget !== null &&
      `${lcpTarget.slice(0, Math.max(0, ELEMENT_MAX - lcpSuffix.length))}${lcpSuffix}`) ||
    (typeof a.interactionTarget === "string" &&
      `${a.interactionTarget}${typeof a.interactionType === "string" ? ` (${a.interactionType})` : ""}`) ||
    (typeof a.largestShiftTarget === "string" && a.largestShiftTarget) ||
    null;
  const attrUrl = typeof a.url === "string" && a.url ? a.url : null;
  return { element, attrUrl };
}

function send(metric: AnyMetric) {
  try {
    const { element, attrUrl } = attributionOf(metric);
    const body = JSON.stringify({
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      navType: metric.navigationType,
      element,
      attrUrl,
    });
    const url = "/api/metrics/web-vitals";
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    // 수집 실패는 무시 — 사용자 경험에 영향 없음
  }
}

export function WebVitalsReporter() {
  useEffect(() => {
    /* 각 on* 는 내부적으로 페이지 수명당 한 번(또는 값 갱신 시)만 콜백한다.
       effect 재실행으로 리스너가 중복 등록되지 않도록 전역 1회 가드. */
    const w = window as unknown as { __nzVitalsWired?: boolean };
    if (w.__nzVitalsWired) return;
    w.__nzVitalsWired = true;
    onLCP(send);
    onINP(send);
    onCLS(send);
    onFCP(send);
    onTTFB(send);
  }, []);
  return null;
}
