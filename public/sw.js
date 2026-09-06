/**
 * 내집나우 서비스워커 — PWA 설치 요건용 최소 구현.
 * (구 woodong-sw-v11-purge는 캐시 삭제 후 자가 unregister 하는 정리용이라
 *  SwRegister 와 함께 쓰면 재등록 루프가 생기므로, 최소 안전 SW로 교체)
 *
 * [968 · 43] 캐시는 둘로 나눈다 — 이름에 버전을 붙여 activate 때 옛 버전을 통째로 지운다.
 *   · PRECACHE   : install 때 미리 받아 두는 오프라인 폴백 문서 + 그 문서의 CSS/JS
 *   · STATIC     : 요청이 올 때 채우는 cache-first 정적 자산(해시 파일·아이콘·폰트·매니페스트)
 * 규칙(어떤 URL 이 정적 자산인가, 언제 얼마나 지우는가)은 아래 sw-rules 블록의 순수 함수에
 * 있고, lib/pwa/sw-rules.ts 와 미러링된다(그쪽 상단 주석의 미러링 규칙 참고).
 */
const CACHE_VERSION = "v3"; // 규칙·캐시 정책이 바뀔 때마다 올린다 (v2 = 폴백 문서만 캐시하던 판)
const PRECACHE = "nuguzip-precache-" + CACHE_VERSION;
const STATIC_CACHE = "nuguzip-static-" + CACHE_VERSION;
const KEEP_CACHES = [PRECACHE, STATIC_CACHE];
const OFFLINE_URL = "/offline";

/* [968 · 43] sw-rules:begin — lib/pwa/sw-rules.ts 와 동일해야 한다(타입 표기·export 만 없음).
   tests/unit/pwa-968.test.ts 가 이 블록을 잘라 평가해 TS 모듈과 같은 입력표로 대조한다.
   한쪽을 고치면 반드시 다른 쪽도 고칠 것. */
const STATIC_CACHE_MAX_ENTRIES = 150;
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/", "/fonts/"];
const STATIC_EXACT_PATHS = ["/manifest.webmanifest"];
const OFFLINE_ASSET_MAX = 32;

function isStaticAssetRequest(url, origin) {
  let u;
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

function shouldPruneCache(entryCount, max = STATIC_CACHE_MAX_ENTRIES) {
  return Number.isFinite(entryCount) && entryCount > max;
}

function overflowKeys(keys, max = STATIC_CACHE_MAX_ENTRIES) {
  const over = keys.length - max;
  return over > 0 ? keys.slice(0, over) : [];
}

function extractOfflineAssetUrls(html, max = OFFLINE_ASSET_MAX) {
  const out = [];
  const seen = new Set();
  const push = (href) => {
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
/* sw-rules:end */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      /* 실패해도 설치는 계속한다 — 폴백을 못 받았다고 서비스워커 자체가 안 깔리면
         푸시 알림까지 같이 죽는다. */
      try {
        const cache = await caches.open(PRECACHE);
        const res = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
        if (!res.ok) throw new Error("offline doc " + res.status);
        await cache.put(OFFLINE_URL, res.clone());
        /* [968 · 42] 폴백 문서가 가리키는 CSS·JS 도 같이 받아 둔다. 문서만 캐시하면 배포로
           해시가 바뀐 뒤 오프라인에서 CSS 가 404 → 맨 글자 화면이 됐다(page.tsx 의 인라인
           <style> 이 1차 방어, 이 precache 가 2차). 하나라도 실패해도 문서 캐시는 살린다.
           이미 페이지가 받은 파일은 HTTP 캐시(immutable, 1년)에서 오므로 대개 네트워크 비용이
           없고, 이 문서에만 있는 청크(page-*.js 등 수 KB)만 실제로 내려온다. */
        try {
          const html = await res.text();
          const assets = extractOfflineAssetUrls(html);
          await Promise.all(assets.map((u) => cache.add(u).catch(() => undefined)));
        } catch (e) {
          // 자산 precache 실패 — 문서는 이미 넣었으므로 그대로 진행
        }
      } catch (e) {
        // 오프라인 폴백 없이 동작 (fetch 핸들러가 알아서 통과시킨다)
      }
      await self.skipWaiting();
    })(),
  );
});

/* [968 · 43] 정적 캐시를 상한까지만 남긴다 — Cache.keys() 는 넣은 순서라 앞이 오래된 것 */
async function pruneStaticCache() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const keys = await cache.keys();
    if (!shouldPruneCache(keys.length)) return;
    await Promise.all(overflowKeys(keys).map((k) => cache.delete(k)));
  } catch (e) {
    // 정리 실패는 다음 activate 에서 다시 시도된다
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /* 구(우리동네이야기) SW·이전 버전(nuguzip-sw-v2 등)이 남긴 캐시 정리 —
         [968 · 43] 이번 버전의 두 캐시만 남기고 전부 지운다 */
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k)),
      );
      await pruneStaticCache();
      await self.clients.claim();
    })(),
  );
});

/**
 * 네트워크 우선. 캐시에서 **페이지 응답을 만들어 주는 경우는 단 하나** — 네트워크가
 * 완전히 실패한 페이지 이동이다. 그때만 /offline 문서를 돌려준다.
 *
 * 시세·실거래·매물 응답은 절대 캐시하지 않는다. 부동산에서 오래된 숫자를 지금
 * 값처럼 보여주는 건 안 보여주는 것보다 나쁘다. 그래서 GET 이 아니거나, 페이지
 * 이동도 정적 자산도 아니거나, 서버가 에러라도 응답을 준 경우엔 그대로 통과시킨다.
 */
async function navigateNetworkFirst(req) {
  try {
    /* 서버가 4xx/5xx 를 주더라도 그건 "연결은 됐다"는 뜻이므로 그대로 전달한다.
       오프라인 화면으로 바꿔치기하면 진짜 원인을 감추게 된다. */
    return await fetch(req);
  } catch (e) {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) return cached;
    /* 폴백조차 없으면 브라우저 기본 오프라인 화면으로 — 우리가 지어낸
       그럴듯한 화면을 보여주는 것보다 낫다. */
    throw e;
  }
}

/* [968 · 43] 정적 자산 cache-first. 해시가 붙은 파일은 내용이 바뀌면 URL 도 바뀌므로
   한 번 받은 응답은 영원히 옳다 — 네트워크를 기다릴 이유가 없다. 캐시에 없을 때만
   받아서 넣고, 넣는 건 same-origin(basic) 2xx 이면서 HTML 이 아닌 응답뿐이다
   (soft-404 HTML 이 아이콘 자리에 들어앉는 일을 막는다). */
let putsSincePrune = 0;
async function staticCacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  try {
    const type = res.headers.get("content-type") || "";
    if (res.ok && res.type === "basic" && !type.includes("text/html")) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(req, res.clone());
      /* 상한 검사는 25건마다 — 매번 keys() 를 세면 그 비용이 캐시 이득을 먹는다 */
      if (++putsSincePrune >= 25) {
        putsSincePrune = 0;
        await pruneStaticCache();
      }
    }
  } catch (e) {
    // 저장 실패(용량 등)는 응답 전달에 영향 없음
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  // 페이지 이동 — 네트워크 우선, 완전 실패 때만 오프라인 폴백 (정책 그대로)
  if (req.mode === "navigate") {
    event.respondWith(navigateNetworkFirst(req));
    return;
  }

  // [968 · 43] 정적 자산 — cache-first. 그 밖(이미지 최적화·API·데이터)은 브라우저 기본 동작 그대로
  if (isStaticAssetRequest(new URL(req.url), self.location.origin)) {
    event.respondWith(staticCacheFirst(req));
  }
});

// 웹 푸시 수신 — 페이로드 { title, body, url, tag }
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // JSON 이 아니면 텍스트를 본문으로 사용
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "내집나우 알림";
  const options = {
    body: payload.body || "",
    /* 알림 아이콘도 PNG. 안드로이드 알림 트레이는 SVG 를 렌더하지 않아서
       지금까지 기본 종 아이콘으로 대체되고 있었다. */
    icon: "/icons/icon-192.png",
    /* [968 · 45] 상태바 배지는 안드로이드가 알파 채널만 마스크로 써서 단색으로 칠한다.
       컬러 192 아이콘을 주면 네이비 사각형이 통째로 회색 덩어리가 됐다 — 투명 배경에
       흰 브랜드 심볼(가로 획·미소 곡선·점)만 그린 96×96 을 쓴다. */
    badge: "/icons/badge-96.png",
    data: { url: payload.url || "/" },
    tag: payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 — 이미 열린 탭이 있으면 포커스, 없으면 새 창
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.pathname === target.pathname && "focus" in client) {
            return client.focus();
          }
        } catch (e) {
          // URL 파싱 실패 시 다음 클라이언트 확인
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })(),
  );
});
