import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABBAR_COMPACT_RULE,
  nextTabBarCompact,
  scrollSubscriberCount,
  subscribeScroll,
  type ScrollSample,
} from "../../lib/client/use-scroll-state.ts";
import {
  getDeferredInstallPrompt,
  isIosSafariUa,
  setDeferredInstallPrompt,
  subscribeInstallPrompt,
  takeDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from "../../lib/client/pwa-install-prompt.ts";
import {
  FINE_POINTER_MEDIA,
  consentBannerBottom,
  decideIslands,
} from "../../lib/client/shell-gates.ts";
import {
  ADSENSE_DESKTOP_MEDIA,
  ADSENSE_SCRIPT_ID,
  adSenseScriptSrc,
  buildAdSenseBootScript,
  pathExcluded,
} from "../../lib/ads/adsense-boot.ts";
import {
  ADSENSE_EXCLUDED_PATH_PREFIXES,
  isAdsExcludedPath,
} from "../../lib/ads/adsense-policy.ts";

/* [968 · 12] 스크롤 상태 · [968 · 47] 설치 진입점 · [968 · 14 · 40] 셸 판정 ·
   [968 · 15] 애드센스 부트 — 전부 브라우저 없이 검증 가능한 순수 함수·모듈 상태다. */

/* node 의 일부 전역은 getter 라 대입이 안 된다 — 디스크립터로 바꿔 끼운다 */
function withGlobal<T>(name: string, value: unknown, fn: () => T): T {
  const prev = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (prev) Object.defineProperty(globalThis, name, prev);
    else delete (globalThis as unknown as Record<string, unknown>)[name];
  }
}

/* ───────────────────────── [968 · 12] use-scroll-state ───────────────────────── */

test("nextTabBarCompact — 아래로 8px 넘게 + 160px 아래면 접는다", () => {
  assert.equal(nextTabBarCompact(false, { y: 200, dy: 9 }), true);
  assert.equal(nextTabBarCompact(false, { y: 200, dy: 8 }), false, "정확히 8px 은 떨림으로 본다");
  assert.equal(nextTabBarCompact(false, { y: 160, dy: 30 }), false, "160px 안에서는 접지 않는다");
});

test("nextTabBarCompact — 위로 8px 넘게 또는 첫 화면 근처면 펼친다", () => {
  assert.equal(nextTabBarCompact(true, { y: 500, dy: -9 }), false);
  assert.equal(nextTabBarCompact(true, { y: 100, dy: 2 }), false, "160px 안이면 방향과 무관");
  assert.equal(nextTabBarCompact(true, { y: 500, dy: -3 }), true, "미세 떨림은 이전 상태 유지");
  assert.equal(nextTabBarCompact(false, { y: 500, dy: 3 }), false);
  assert.equal(TABBAR_COMPACT_RULE.minDelta, 8);
  assert.equal(TABBAR_COMPACT_RULE.top, 160);
});

test("subscribeScroll — 구독자가 여럿이어도 scroll 리스너는 하나, rAF 한 번에 전부 받는다", () => {
  const added: string[] = [];
  const removed: string[] = [];
  let raf: (() => void) | null = null;
  const fakeWindow = {
    scrollY: 0,
    addEventListener: (type: string, fn: () => void, _o?: unknown) => {
      added.push(type);
      (fakeWindow as { _onScroll?: () => void })._onScroll = fn;
    },
    removeEventListener: (type: string) => {
      removed.push(type);
    },
    requestAnimationFrame: (cb: () => void) => {
      raf = cb;
      return 1;
    },
    cancelAnimationFrame: () => {
      raf = null;
    },
  };
  const fakeDocument = { documentElement: { scrollTop: 0 } };
  withGlobal("window", fakeWindow, () =>
    withGlobal("document", fakeDocument, () => {
      const a: ScrollSample[] = [];
      const b: ScrollSample[] = [];
      const offA = subscribeScroll((s) => a.push(s));
      const offB = subscribeScroll((s) => b.push(s));
      assert.deepEqual(added, ["scroll"], "리스너는 첫 구독에 한 번만");
      assert.equal(scrollSubscriberCount(), 2);

      /* 한 프레임 안에 scroll 이 세 번 와도 rAF 콜백은 하나 */
      fakeWindow.scrollY = 120;
      const onScroll = (fakeWindow as { _onScroll?: () => void })._onScroll!;
      onScroll();
      onScroll();
      onScroll();
      assert.ok(raf, "rAF 예약");
      raf!();
      assert.deepEqual(a, [{ y: 120, dy: 120 }]);
      assert.deepEqual(b, [{ y: 120, dy: 120 }], "구독자 둘 다 같은 표본");

      fakeWindow.scrollY = 100;
      onScroll();
      raf!();
      assert.deepEqual(a[1], { y: 100, dy: -20 }, "dy 는 직전 표본 대비");

      offA();
      assert.deepEqual(removed, [], "구독자가 남아 있으면 리스너 유지");
      offB();
      assert.deepEqual(removed, ["scroll"], "마지막 해제가 리스너를 뗀다");
      assert.equal(scrollSubscriberCount(), 0);
    }),
  );
});

/* ───────────────────────── [968 · 47] pwa-install-prompt ───────────────────────── */

test("isIosSafariUa — 아이폰·아이패드 사파리만 true, 인앱·다른 브라우저·안드로이드는 false", () => {
  const iphoneSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(isIosSafariUa(iphoneSafari, 5), true);
  /* iPadOS 13+ 는 Macintosh 라고 말한다 — 터치 포인트로 가려낸다 */
  const ipadOs =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  assert.equal(isIosSafariUa(ipadOs, 5), true);
  assert.equal(isIosSafariUa(ipadOs, 0), false, "터치 없는 Macintosh 는 데스크톱 맥");
  assert.equal(isIosSafariUa(iphoneSafari.replace("Safari/604.1", "CriOS/120 Safari/604.1"), 5), false);
  assert.equal(isIosSafariUa(`${iphoneSafari} KAKAOTALK 10.0`, 5), false);
  assert.equal(isIosSafariUa(`${iphoneSafari} Instagram 300.0`, 5), false);
  assert.equal(
    isIosSafariUa("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", 5),
    false,
  );
});

test("설치 이벤트 보관 — set/take 는 1회용이고 구독자에게 알린다", () => {
  let notified = 0;
  const off = subscribeInstallPrompt(() => {
    notified += 1;
  });
  const ev = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) } as unknown as BeforeInstallPromptEvent;
  assert.equal(getDeferredInstallPrompt(), null);
  setDeferredInstallPrompt(ev);
  assert.equal(getDeferredInstallPrompt(), ev);
  assert.equal(notified, 1);
  assert.equal(takeDeferredInstallPrompt(), ev, "꺼내면");
  assert.equal(getDeferredInstallPrompt(), null, "비운다 — 배너와 메뉴가 같은 이벤트를 두 번 쓰지 않게");
  assert.equal(takeDeferredInstallPrompt(), null);
  assert.equal(notified, 3);
  off();
  setDeferredInstallPrompt(null);
  assert.equal(notified, 3, "해제 뒤에는 알림 없음");
});

/* ───────────────────────── [968 · 14 · 40] shell-gates ───────────────────────── */

test("decideIslands — 모바일 브라우저는 넷 다 안 받고, 설치 앱·마우스·iOS 사파리만 각자 것", () => {
  const none = decideIslands({ standalone: false, finePointer: false, iosSafari: false });
  assert.deepEqual(none, { pullToRefresh: false, brandSplash: false, dragScroll: false, iosInstallHint: false });

  const standalone = decideIslands({ standalone: true, finePointer: false, iosSafari: true });
  assert.equal(standalone.pullToRefresh, true);
  assert.equal(standalone.brandSplash, true);
  assert.equal(standalone.iosInstallHint, false, "설치 앱 안에서는 '홈 화면에 추가' 안내 없음");

  const desktop = decideIslands({ standalone: false, finePointer: true, iosSafari: false });
  assert.deepEqual(desktop, { pullToRefresh: false, brandSplash: false, dragScroll: true, iosInstallHint: false });

  const ios = decideIslands({ standalone: false, finePointer: false, iosSafari: true });
  assert.equal(ios.iosInstallHint, true);
  assert.equal(ios.dragScroll, false);
  assert.equal(FINE_POINTER_MEDIA, "(hover: hover) and (pointer: fine)");
});

test("consentBannerBottom — 탭바 위, /map 은 지도 하단 레인 위", () => {
  assert.equal(consentBannerBottom("/"), "var(--nz-tabbar-offset)");
  assert.equal(consentBannerBottom("/notes/new"), "var(--nz-tabbar-offset)");
  assert.equal(consentBannerBottom("/map"), "calc(var(--nz-map-bottom-lane) + 8px)");
  assert.equal(consentBannerBottom("/map/x"), "calc(var(--nz-map-bottom-lane) + 8px)");
  assert.equal(consentBannerBottom("/mapping"), "var(--nz-tabbar-offset)", "prefix 는 세그먼트 단위");
});

/* ───────────────────────── [968 · 15] adsense-boot ───────────────────────── */

test("pathExcluded — adsense-policy 의 isAdsExcludedPath 와 같은 판정", () => {
  for (const p of ["/", "/map", "/map/x", "/my", "/my/points", "/messages", "/notes/new", "/notes/abc", "/payment?x=1", "/town"]) {
    assert.equal(pathExcluded(p, ADSENSE_EXCLUDED_PATH_PREFIXES), isAdsExcludedPath(p), p);
  }
});

test("buildAdSenseBootScript — 문법이 유효하고 src·제외 목록·뷰포트 경계·id 를 담는다", () => {
  const client = "ca-pub-6291134577962996";
  const js = buildAdSenseBootScript(client, ADSENSE_EXCLUDED_PATH_PREFIXES);
  /* 컴파일만 — 실행하면 location 을 찾는다 */
  assert.doesNotThrow(() => new Function(js));
  assert.ok(js.includes(JSON.stringify(adSenseScriptSrc(client))));
  assert.ok(js.includes(JSON.stringify(ADSENSE_DESKTOP_MEDIA)));
  assert.ok(js.includes(JSON.stringify(ADSENSE_SCRIPT_ID)));
  assert.ok(js.includes('"/map"') && js.includes('"/payment"'), "제외 prefix 가 인라인에 실린다");
  assert.ok(js.includes('"fetchpriority","low"'));
  assert.ok(js.includes('addEventListener("load"'), "모바일은 load 뒤");
  assert.ok(js.includes("requestIdleCallback"));
  assert.equal(adSenseScriptSrc("ca-pub-1"), "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1");
});

test("buildAdSenseBootScript — 실행 흐름: 제외 경로면 태그를 넣지 않고, 데스크톱이면 즉시 넣는다", () => {
  const client = "ca-pub-1";
  const js = buildAdSenseBootScript(client, ADSENSE_EXCLUDED_PATH_PREFIXES);
  type Created = { id?: string; async?: boolean; src?: string; crossOrigin?: string; attrs: Record<string, string>; setAttribute: (k: string, v: string) => void };
  function run(pathname: string, desktop: boolean) {
    const appended: Created[] = [];
    const doc = {
      readyState: "loading",
      getElementById: () => null,
      createElement: (): Created => {
        const el: Created = { attrs: {}, setAttribute: (k, v) => { el.attrs[k] = v; } };
        return el;
      },
      head: { appendChild: (el: Created) => appended.push(el) },
    };
    const loadListeners: Array<() => void> = [];
    const win = {
      matchMedia: (q: string) => ({ matches: desktop && q === ADSENSE_DESKTOP_MEDIA }),
      addEventListener: (type: string, fn: () => void) => { if (type === "load") loadListeners.push(fn); },
      requestIdleCallback: (cb: () => void) => { cb(); return 1; },
    };
    new Function("window", "document", "location", "setTimeout", js)(win, doc, { pathname }, () => 0);
    return { appended, loadListeners };
  }
  assert.equal(run("/map", true).appended.length, 0, "제외 경로: 데스크톱이어도 생략");
  const desktop = run("/", true);
  assert.equal(desktop.appended.length, 1, "데스크톱: 즉시");
  assert.equal(desktop.appended[0]!.id, ADSENSE_SCRIPT_ID);
  assert.equal(desktop.appended[0]!.attrs.fetchpriority, "low");
  assert.equal(desktop.appended[0]!.crossOrigin, "anonymous");
  const mobile = run("/", false);
  assert.equal(mobile.appended.length, 0, "모바일: load 전에는 없음");
  assert.equal(mobile.loadListeners.length, 1);
  mobile.loadListeners[0]!();
  assert.equal(mobile.appended.length, 1, "load → idle → 삽입");
});
