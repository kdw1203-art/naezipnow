/**
 * [968 · 15] 애드센스 스크립트 로드 시점.
 *
 * 왜: `adsbygoogle.js` 가 모든 페이지 <head> 에 정적 async 태그로 있어 모바일에서도
 * 첫 화면(LCP)과 대역폭을 나눴다. 사이드·수동 유닛(AdSenseUnit)은 `hidden lg:block`
 * 이라 1024px 미만에서는 그려지지도 않는데 스크립트는 먼저 받았다.
 *
 * 규칙(인라인 부트 스크립트와 클라이언트 주입기가 **같은 상수**를 쓴다):
 *  - 제외 경로(adsense-policy 의 prefix 목록)면 태그 자체를 넣지 않는다.
 *  - 뷰포트 ≥ 1024px: 지금처럼 즉시 — 단 fetchpriority="low" 로 LCP 자원에 밀린다.
 *  - 뷰포트 < 1024px: `load` 뒤 requestIdleCallback(상한 4s)에 넣는다. AdZoneUnit 이
 *    그 전에 `adsbygoogle.push({})` 를 해도 배열 큐에 쌓였다가 스크립트가 붙으면
 *    처리되므로 피드·본문 광고는 그대로 나온다(시점만 늦다).
 *  - 클라이언트 내비게이션으로 제외 경로 → 일반 경로로 들어오면 AdSenseLoader 가
 *    `ensureAdSenseScript` 로 같은 규칙을 다시 적용한다(멱등 — id 로 중복 방지).
 *  - 광고 **요청** 잠금(pauseAdRequests)은 종전대로 AdSenseLoader 가 푼다.
 *
 * 순수 문자열/판정 함수는 브라우저 없이 테스트한다.
 */

export const ADSENSE_SCRIPT_ID = "adsbygoogle-js";
/** Tailwind `lg` 경계 — AdSenseUnit 의 `hidden lg:block` 과 같은 값 */
export const ADSENSE_DESKTOP_MEDIA = "(min-width: 1024px)";
/** 모바일에서 idle 콜백이 안 와도 이 안에는 넣는다 */
export const ADSENSE_IDLE_TIMEOUT_MS = 4000;

export function adSenseScriptSrc(client: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
}

/** 경로 제외 판정 — adsense-policy 의 isAdsExcludedPath 와 같은 규칙(prefix 또는 prefix/) */
export function pathExcluded(pathname: string, prefixes: readonly string[]): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * <head> 인라인 부트 스크립트(ES5 — 구형 웹뷰에서도 문법 오류로 죽지 않게).
 * CSP 는 script-src 'unsafe-inline' 이라(lib/security/content-security-policy) nonce 불요 —
 * 기존 폰트 스왑 인라인 스크립트와 같은 조건이다.
 */
export function buildAdSenseBootScript(client: string, excludedPrefixes: readonly string[]): string {
  const src = JSON.stringify(adSenseScriptSrc(client));
  const ex = JSON.stringify(excludedPrefixes);
  const id = JSON.stringify(ADSENSE_SCRIPT_ID);
  const media = JSON.stringify(ADSENSE_DESKTOP_MEDIA);
  return (
    "(function(){" +
    `var ex=${ex},p=location.pathname,i;` +
    'for(i=0;i<ex.length;i++){if(p===ex[i]||p.indexOf(ex[i]+"/")===0)return;}' +
    "function add(){" +
    `if(document.getElementById(${id}))return;` +
    'var s=document.createElement("script");' +
    `s.id=${id};s.async=true;s.src=${src};s.crossOrigin="anonymous";s.setAttribute("fetchpriority","low");` +
    "document.head.appendChild(s);}" +
    `if(window.matchMedia&&window.matchMedia(${media}).matches){add();return;}` +
    `function idle(){if(window.requestIdleCallback)window.requestIdleCallback(add,{timeout:${ADSENSE_IDLE_TIMEOUT_MS}});else setTimeout(add,1500);}` +
    'if(document.readyState==="complete")idle();else window.addEventListener("load",idle,{once:true});' +
    "})();"
  );
}

/* ───────────── 클라이언트 주입기 (AdSenseLoader 가 경로 변경 때 부른다) ───────────── */

function appendScript(client: string) {
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = ADSENSE_SCRIPT_ID;
  s.async = true;
  s.src = adSenseScriptSrc(client);
  s.crossOrigin = "anonymous";
  s.setAttribute("fetchpriority", "low");
  document.head.appendChild(s);
}

/**
 * 스크립트가 아직 없으면 뷰포트 규칙대로 넣는다(멱등). 부트 스크립트가 제외 경로에서
 * 넣지 않은 뒤 클라이언트 내비게이션으로 일반 경로에 들어온 경우가 대상이다.
 * 호출자가 경로 제외 판정을 끝낸 뒤 부른다.
 */
export function ensureAdSenseScript(client: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
  const desktop =
    typeof window.matchMedia === "function" && window.matchMedia(ADSENSE_DESKTOP_MEDIA).matches;
  if (desktop) {
    appendScript(client);
    return;
  }
  const idle = () => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => appendScript(client), { timeout: ADSENSE_IDLE_TIMEOUT_MS });
    } else {
      window.setTimeout(() => appendScript(client), 1500);
    }
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}
