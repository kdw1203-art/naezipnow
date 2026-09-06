/**
 * [968 · 43] 서비스워커 캐시 규칙 — 순수 함수.
 *
 * public/sw.js 는 번들을 거치지 않는 평범한 JS 라 이 모듈을 import 할 수 없다. 그래서
 * 같은 로직을 sw.js 의 `sw-rules:begin` ~ `sw-rules:end` 블록에 **손으로 미러링**한다.
 *
 * 미러링 규칙:
 *   · 함수 이름·인자·반환값·상수값은 양쪽이 같아야 한다(타입 표기·export 만 여기 추가).
 *   · 한쪽을 고치면 반드시 다른 쪽도 고친다. tests/unit/pwa-968.test.ts 가 sw.js 블록을
 *     읽어 평가한 뒤 이 모듈과 같은 입력표로 결과를 대조한다 — 어긋나면 테스트가 잡는다.
 *
 * 무엇을 캐시하는가: 해시가 붙어 불변인 것(/_next/static/*)과 바뀔 일이 거의 없는 앱 셸
 * 자산(/icons/*, /fonts/*, 매니페스트)만. HTML·API·/_next/image(원본이 바뀌면 같은 URL 로
 * 다른 그림이 온다)·시세/실거래 데이터는 절대 넣지 않는다 — 부동산에서 오래된 숫자를
 * 지금 값처럼 보여주는 건 안 보여주는 것보다 나쁘다(sw.js 상단 주석과 같은 원칙).
 */

/** 런타임 정적 캐시 상한 — activate 때 이 수를 넘으면 오래된 것부터 지운다 */
export const STATIC_CACHE_MAX_ENTRIES = 150;

/** 정적 자산으로 보는 경로 접두사 (모두 same-origin 전제) */
export const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/", "/fonts/"] as const;

/** 접두사가 아니라 정확히 일치해야 하는 경로 */
export const STATIC_EXACT_PATHS = ["/manifest.webmanifest"] as const;

/** install 때 오프라인 문서에서 함께 받아 둘 자산의 상한 — 설치 비용을 묶어 둔다 */
export const OFFLINE_ASSET_MAX = 32;

/**
 * cache-first 대상인가. same-origin 이면서 위 접두사/정확 경로에 맞는 GET 만 true.
 * `/_next/image`, `/api/*`, 페이지 HTML 은 어떤 접두사에도 걸리지 않는다.
 */
export function isStaticAssetRequest(url: URL | string, origin: string): boolean {
  let u: URL;
  try {
    u = typeof url === "string" ? new URL(url, origin) : url;
  } catch {
    return false;
  }
  if (u.origin !== origin) return false;
  const p = u.pathname;
  for (const exact of STATIC_EXACT_PATHS) if (p === exact) return true;
  for (const prefix of STATIC_PATH_PREFIXES) if (p.startsWith(prefix)) return true;
  return false;
}

/** 캐시 항목 수가 상한을 넘었는가 */
export function shouldPruneCache(entryCount: number, max: number = STATIC_CACHE_MAX_ENTRIES): boolean {
  return Number.isFinite(entryCount) && entryCount > max;
}

/**
 * 지울 항목 — Cache.keys() 는 넣은 순서로 돌려주므로 앞쪽이 오래된 것이다.
 * 상한 이하면 빈 배열.
 */
export function overflowKeys<T>(keys: readonly T[], max: number = STATIC_CACHE_MAX_ENTRIES): T[] {
  const over = keys.length - max;
  return over > 0 ? keys.slice(0, over) : [];
}

/**
 * [968 · 42] 오프라인 문서 HTML 에서 함께 precache 할 same-origin 정적 자산 URL 을 뽑는다.
 *   · <link rel="stylesheet"> 의 /_next/static/css/… — 없으면 폴백 화면이 맨 글자로 뜬다
 *   · <script src> 의 /_next/static/…              — 없으면 "다시 시도" 버튼이 하이드레이션
 *     되지 않아 눌러도 아무 일이 없다. nomodule(폴리필) 은 현대 브라우저가 받지 않으니 제외.
 * 정규식은 속성 순서에 매이지 않는다(rel 이 href 뒤에 와도 잡는다). 중복 제거, 상한 적용.
 */
export function extractOfflineAssetUrls(html: string, max: number = OFFLINE_ASSET_MAX): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (href: string) => {
    if (!href.startsWith("/_next/static/")) return;
    if (seen.has(href)) return;
    seen.add(href);
    out.push(href);
  };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\brel=["']?stylesheet["']?/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (href) push(href[1]);
  }
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\bnomodule\b/i.test(tag)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
    if (src) push(src[1]);
  }
  return out.slice(0, max);
}
