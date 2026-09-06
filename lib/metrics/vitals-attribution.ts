/**
 * Web Vitals attribution → `element` 문자열 (web_vitals.element ≤ 256자).
 *
 * [968 · 49] app/components/WebVitalsReporter.tsx 에서 순수 부분만 떼어 왔다 — 브라우저 없이
 * 단위테스트하기 위해서다(tests/unit/pwa-968.test.ts). 리포터는 이 함수를 그대로 부른다.
 *
 * 규칙: 지어내지 않는다. attribution 에 없는 값은 빈 문자열/null 이고, 하위 구간 숫자는
 * ms 정수(Math.round)로만 적는다. 꼬리(" |k=v …")보다 선택자 쪽을 먼저 자른다 — 꼬리의
 * 숫자가 잘리면 다음 분석에 못 쓴다.
 */

export const ELEMENT_MAX = 256;

/* [967 · 29b] LCP 하위 구간 — " |ttfb=450 rld=0 rldur=0 erd=1200" */
const LCP_SUBPART_KEYS = [
  ["timeToFirstByte", "ttfb"],
  ["resourceLoadDelay", "rld"],
  ["resourceLoadDuration", "rldur"],
  ["elementRenderDelay", "erd"],
] as const;

/* [968 · 49] INP 하위 구간 — " |id=12 pd=300 prd=40 ls=complete".
   홈 INP 568ms(2026-08 RUM)가 입력 지연(메인 스레드 점유)인지 핸들러 비용인지 렌더 지연인지를
   이 셋이 가른다. 이름은 web-vitals v5+ attribution 필드 그대로
   (node_modules/web-vitals/dist/modules/types/inp.d.ts: inputDelay·processingDuration·
   presentationDelay·loadState). loadState 는 문자열이라 숫자 반올림 없이 그대로. */
const INP_SUBPART_KEYS = [
  ["inputDelay", "id"],
  ["processingDuration", "pd"],
  ["presentationDelay", "prd"],
] as const;

function numericSuffix(
  a: Record<string, unknown>,
  keys: ReadonlyArray<readonly [string, string]>,
): string[] {
  const parts: string[] = [];
  for (const [key, short] of keys) {
    const v = a[key];
    if (typeof v === "number" && Number.isFinite(v)) parts.push(`${short}=${Math.round(v)}`);
  }
  return parts;
}

export function lcpSubpartsSuffix(a: Record<string, unknown>): string {
  const parts = numericSuffix(a, LCP_SUBPART_KEYS);
  return parts.length > 0 ? ` |${parts.join(" ")}` : "";
}

export function inpSubpartsSuffix(a: Record<string, unknown>): string {
  const parts = numericSuffix(a, INP_SUBPART_KEYS);
  /* loadState 는 'loading' | 'dom-interactive' | 'dom-content-loaded' | 'complete' —
     공백·'|' 가 없는 짧은 토큰만 허용해 꼬리 파서가 흔들리지 않게 한다 */
  const ls = a.loadState;
  if (typeof ls === "string" && /^[a-z-]{1,24}$/.test(ls)) parts.push(`ls=${ls}`);
  return parts.length > 0 ? ` |${parts.join(" ")}` : "";
}

/** 선택자 + 꼬리를 상한 안에 맞춘다 — 꼬리는 온전히, 선택자를 자른다 */
function fitWithSuffix(head: string, suffix: string, max: number = ELEMENT_MAX): string {
  return `${head.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export type VitalsAttributionInput = {
  name: string;
  attribution?: Record<string, unknown> | undefined;
};

/**
 * 지표별 element/attrUrl.
 *   LCP: target(선택자) + 하위 구간 꼬리, url(이미지·리소스)
 *   INP: interactionTarget (interactionType) + 하위 구간 꼬리
 *   CLS: largestShiftTarget
 *   그 밖(FCP·TTFB): null — 지어내지 않는다.
 */
export function formatAttribution(metric: VitalsAttributionInput): {
  element: string | null;
  attrUrl: string | null;
} {
  const a = metric.attribution;
  if (!a) return { element: null, attrUrl: null };

  /* [967 · 29b] web-vitals v5+ 는 LCP 선택자를 `element` 가 아니라 `target` 에 담는다.
     옛 이름도 같이 읽어 둔다 — 버전이 되돌아가도 다시 비지 않게. */
  const lcpTarget =
    (typeof a.target === "string" && a.target) ||
    (typeof a.element === "string" && a.element) ||
    null;

  let element: string | null = null;
  if (lcpTarget !== null) {
    element = fitWithSuffix(lcpTarget, lcpSubpartsSuffix(a));
  } else if (typeof a.interactionTarget === "string") {
    const head = `${a.interactionTarget}${
      typeof a.interactionType === "string" ? ` (${a.interactionType})` : ""
    }`;
    /* [968 · 49] INP 는 대상이 빈 문자열일 수 있다(상호작용 뒤 요소가 DOM 에서 사라진 경우).
       그래도 하위 구간은 남긴다 — 어디서 느렸는지는 요소 없이도 값이 된다. */
    element = fitWithSuffix(head, inpSubpartsSuffix(a));
    if (element === "") element = null;
  } else if (typeof a.largestShiftTarget === "string" && a.largestShiftTarget) {
    element = a.largestShiftTarget.slice(0, ELEMENT_MAX);
  }

  const attrUrl = typeof a.url === "string" && a.url ? a.url : null;
  return { element, attrUrl };
}
