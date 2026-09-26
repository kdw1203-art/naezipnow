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
   이제 화면별 통(lib/metrics/vitals-route)에 담고 화면을 옮길 때·숨을 때 비운다.

   [1007 · V2a-5] 두 가지를 바꿨다 — 실측 /api/metrics/web-vitals 4,350회/일 vs 사람 페이지뷰 ~17/일.
   (a) 봇(lib/client/is-bot-ua — UA 표식·navigator.webdriver)이면 수집도 전송도 하지 않는다.
       JS 를 실행하는 크롤러(Googlebot·PerplexityBot·헤드리스 크롬)가 지표를 만들어 보내고 있었고,
       그 값이 /admin/perf 의 p75 를 봇 기준으로 만들었다. 서버(route.ts)도 UA 로 한 번 더 거른다.
   (b) 지표마다 POST 하지 않는다. 한 문서에서 나온 표본(LCP·FCP·TTFB 확정분 + 화면 이동 때 비운
       통)을 큐에 모아 두고 **pagehide/visibilitychange(hidden) 에 한 번** sendBeacon 한다(서버는
       배열 본문을 받는다 — 단건도 호환). 예전엔 한 페이지에 4~6회 나갔다. 큐가 너무 커지면
       (MAX_QUEUE) 그 자리에서 한 번 비운다 — sendBeacon 본문 상한(64KB) 안에 둔다.

   [1010] 여기서 한 걸음 더 — **세션 표본 추출**. 실측 하루 842회(함수 호출 상위 2위)인데
   화면을 그리지 않는 엔드포인트라 호출 1회가 그대로 Invocations + Fluid CPU 다. 이제
   세션마다 한 번 주사위를 굴려(sessionStorage 에 굳힘) 그 세션 전체를 보내거나/안 보내거나로
   가른다 — 지표마다 굴리면 한 방문의 LCP 만 남고 CLS·INP 는 빠져 분포가 깨진다.
   비율과 근거는 lib/metrics/vitals-sample.ts 한 곳에만 둔다(서버도 같은 상수를 본다).
   보내는 줄에는 `sampleRate` 를 실어 집계가 개수를 비율로 되돌릴 수 있게 한다. */
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
import { isBotBrowser } from "@/lib/client/is-bot-ua";
import {
  VITALS_SAMPLE_KEY,
  VITALS_SAMPLE_RATE,
  decideVitalsSample,
} from "@/lib/metrics/vitals-sample";
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

/** [1007] 한 번에 보내는 표본 상한 — 서버(route.ts MAX_BATCH)와 같다 */
const MAX_QUEUE = 50;
let queue: RouteVitalSample[] = [];

function toWire(s: RouteVitalSample) {
  return {
    metric: s.metric,
    value: s.value,
    rating: s.rating ?? undefined,
    path: s.path,
    navType: s.navType ?? undefined,
    scope: s.scope,
    element: s.element,
    attrUrl: s.attrUrl,
    /* [1010] 이 줄이 전체의 몇 분의 일인가 — 서버·집계가 개수를 비율로 되돌릴 수 있게
       같이 싣는다(lib/metrics/vitals-sample). 줄마다 붙이는 이유: 본문이 배열이든
       단건 객체든 같은 파서를 타고, 옛 번들이 섞여 들어와도 그 줄만 "모름"이 된다. */
    sampleRate: VITALS_SAMPLE_RATE,
  };
}

/**
 * [1010] 이 세션이 표본인가 — **문서당 한 번**만 묻고 sessionStorage 에 굳힌다.
 * 같은 탭에서 화면을 여러 번 옮겨도 같은 답을 주므로, 한 방문의 LCP·CLS·INP 가
 * 통째로 남거나 통째로 빠진다(지표마다 굴리면 분포가 깨진다).
 * sessionStorage 를 못 쓰는 환경(사생활 보호 모드·차단)은 그 문서 한 번만 굴린다.
 */
function isSampledSession(): boolean {
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(VITALS_SAMPLE_KEY);
  } catch {
    stored = null;
  }
  const { sampled, store } = decideVitalsSample(stored, Math.random());
  if (store !== null) {
    try {
      window.sessionStorage.setItem(VITALS_SAMPLE_KEY, store);
    } catch {
      /* 저장 못 해도 이 문서에서는 위 판정을 그대로 쓴다 */
    }
  }
  return sampled;
}

/** 큐에 쌓인 표본을 한 번의 비콘으로 보낸다(비어 있으면 아무것도 안 한다) */
function sendQueued() {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    const body = JSON.stringify(batch.map(toWire));
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

function enqueue(list: RouteVitalSample[]) {
  for (const s of list) queue.push(s);
  if (queue.length >= MAX_QUEUE) sendQueued();
}

export function WebVitalsReporter() {
  const pathname = usePathname();

  useEffect(() => {
    /* 각 on* 는 문서당 한 번만 걸어야 한다 — effect 재실행으로 리스너가
       중복 등록되면 같은 delta 를 두 번 더한다. */
    const w = window as unknown as { __nzVitalsWired?: boolean };
    if (w.__nzVitalsWired) return;
    /* [1007 · V2a-5a] 봇은 수집하지 않는다 — 리스너도 걸지 않는다(문서당 한 번 판정) */
    if (isBotBrowser()) return;
    /* [1010] 표본이 아닌 세션은 **수집도 전송도 하지 않는다** — 리스너를 걸지 않으므로
       비콘 1회뿐 아니라 web-vitals 의 관측 비용(PerformanceObserver)도 함께 빠진다.
       __nzVitalsWired 를 세워 두면 이 문서에서 다시 묻지 않는다. */
    w.__nzVitalsWired = true;
    if (!isSampledSession()) return;

    const now = () => Date.now();
    ledger = new RouteVitalsLedger(window.location.pathname, now());

    /* 한 번만 확정되는 지표 — 문서가 처음 연 화면의 것으로 단다(bfcache 복귀는 예외) */
    const one = (m: AnyMetric) => {
      if (!ledger) return;
      enqueue([ledger.oneShot(toInput(m))]);
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
      enqueue(ledger.flush(now()));
      /* [1007 · V2a-5b] 숨는 순간이 전송 시점이다 — 문서 하나의 표본이 비콘 한 번으로 나간다 */
      sendQueued();
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
    /* 화면 이동 때 비운 통은 큐에만 담는다 — 전송은 숨을 때(위 flush) */
    enqueue(ledger.enterRoute(pathname, Date.now()));
  }, [pathname]);

  return null;
}
