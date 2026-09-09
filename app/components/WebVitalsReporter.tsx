"use client";

/* G2 — Web Vitals RUM 수집.
   [OPT-01] next/web-vitals 훅 → web-vitals/attribution 직접 사용으로 교체.
   지표값만으로는 "어느 페이지의 어떤 요소가 LCP 범인인지"를 알 수 없었다
   (2026-08-23 LCP p75 3,872ms 실패 — 원인 불명). attribution 빌드는
   LCP 요소 선택자·리소스 URL, INP 의 이벤트 대상·타입까지 알려준다.
   기존 /api/metrics/web-vitals 엔드포인트(web_vitals 테이블)로 전송.
   sendBeacon 우선(언로드 안전), 실패 시 keepalive fetch. 렌더 없음.

   [979] 어느 **화면**의 값인지를 바로잡았다. 예전에는 보낼 때의
   `location.pathname` 을 그대로 실었는데, CLS·INP 는 문서 수명 전체를 누적하고
   페이지가 숨는 순간 확정되므로 **한 방문에서 쌓인 값이 마지막 화면의 것으로**
   기록됐다. 헤드리스 크롬 재현(2026-09-08): 홈에서 CLS 0.0199 가 쌓인 뒤 /map 으로
   이동해 숨기면 `CLS 0.02 path=/map el=a.btn-primary…rise-in-3`(홈에만 있는 요소)가
   전송된다. 화면별 집계가 통째로 어긋나 있었다.
   이제 화면별 통(lib/metrics/vitals-route)에 담고 화면을 옮길 때·숨을 때 비운다. */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
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
import { formatAttribution } from "@/lib/metrics/vitals-attribution";
import {
  RouteVitalsLedger,
  type RouteVitalSample,
  type VitalInput,
} from "@/lib/metrics/vitals-route";

type AnyMetric =
  | CLSMetricWithAttribution
  | FCPMetricWithAttribution
  | INPMetricWithAttribution
  | LCPMetricWithAttribution
  | TTFBMetricWithAttribution;

/* [967 · 29b] LCP 하위 구간 · [968 · 49] INP 하위 구간(id·pd·prd·ls)을 element 꼬리에 접는다.
   API·web_vitals 스키마(element ≤ 256자)는 그대로 둔다. 문자열 조립은 순수 함수
   lib/metrics/vitals-attribution 로 옮겼다 — 브라우저 없이 단위테스트하기 위해서다.
   여기 남은 건 전송뿐이다. */
function toInput(metric: AnyMetric): VitalInput {
  const { element, attrUrl } = formatAttribution({
    name: metric.name,
    attribution: metric.attribution as Record<string, unknown> | undefined,
  });
  return {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navType: metric.navigationType ?? null,
    element,
    attrUrl,
  };
}

/* 장부는 모듈 전역이다 — 리포터가 다시 마운트돼도(개발 중 이중 마운트 포함) 같은
   문서의 통을 이어 쓴다. 컴포넌트 ref 에 두면 재마운트 때 그동안 쌓은 값이 사라진다. */
let ledger: RouteVitalsLedger | null = null;

function post(s: RouteVitalSample) {
  try {
    const body = JSON.stringify({
      metric: s.metric,
      value: s.value,
      rating: s.rating ?? undefined,
      path: s.path,
      navType: s.navType ?? undefined,
      scope: s.scope,
      element: s.element,
      attrUrl: s.attrUrl,
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

function postAll(list: RouteVitalSample[]) {
  for (const s of list) post(s);
}

export function WebVitalsReporter() {
  const pathname = usePathname();

  useEffect(() => {
    /* 각 on* 는 문서당 한 번만 걸어야 한다 — effect 재실행으로 리스너가
       중복 등록되면 같은 delta 를 두 번 더한다. */
    const w = window as unknown as { __nzVitalsWired?: boolean };
    if (w.__nzVitalsWired) return;
    w.__nzVitalsWired = true;

    const now = () => Date.now();
    ledger = new RouteVitalsLedger(window.location.pathname, now());

    /* 한 번만 확정되는 지표 — 문서가 처음 연 화면의 것으로 단다(bfcache 복귀는 예외) */
    const one = (m: AnyMetric) => {
      if (!ledger) return;
      post(ledger.oneShot(toInput(m)));
    };
    onLCP(one);
    onFCP(one);
    onTTFB(one);

    /* 누적 지표 — reportAllChanges 로 delta 를 받아 **그때 보고 있던 화면**의 통에 넣는다.
       콜백마다 전송하는 게 아니라 통에만 담는다(전송은 화면 이동·숨김 때). */
    onCLS(
      (m) => {
        ledger?.addDelta(toInput(m));
      },
      { reportAllChanges: true },
    );
    onINP(
      (m) => {
        ledger?.addWorst(toInput(m));
      },
      { reportAllChanges: true },
    );

    const flush = () => {
      if (!ledger) return;
      postAll(ledger.flush(now()));
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    /* pagehide 는 iOS Safari 에서 visibilitychange 가 안 오는 경우의 보험이다.
       두 번 불려도 통이 이미 비어 있어 같은 값을 또 보내지 않는다. */
    window.addEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (!ledger || !pathname) return;
    postAll(ledger.enterRoute(pathname, Date.now()));
  }, [pathname]);

  return null;
}
