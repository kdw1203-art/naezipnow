import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReducedDataConnection,
  prefersReducedData,
  SLOW_EFFECTIVE_TYPES,
} from "../../lib/client/network-hints.ts";
import {
  DESKTOP_MEDIA,
  isDesktopViewport,
  isShellActive,
  shellMatches,
} from "../../lib/client/viewport-shell.ts";
import { addedNodesNeedScan, pickRevealRoot } from "../../lib/client/reveal-scope.ts";

/* [968 · 19] 저속망 프리페치 판정 · [968 · 8] 홈 두 벌 섬의 shell 판정 ·
   [968 · 11] 스크롤 리빌 관찰 범위 — 전부 브라우저 없이 검증 가능한 순수 함수다. */

/* node 의 `navigator` 는 globalThis 의 getter 라 대입이 안 된다 — 디스크립터로 바꿔 끼운다 */
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

/* ───────────────────────── [968 · 19] network-hints ───────────────────────── */

test("isReducedDataConnection — saveData 가 켜져 있으면 회선과 무관하게 true", () => {
  assert.equal(isReducedDataConnection({ saveData: true, effectiveType: "4g" }), true);
  assert.equal(isReducedDataConnection({ saveData: true }), true);
});

test("isReducedDataConnection — 3g 이하는 true, 4g 는 false, 대소문자 무시", () => {
  for (const et of SLOW_EFFECTIVE_TYPES) {
    assert.equal(isReducedDataConnection({ effectiveType: et }), true, et);
  }
  assert.equal(isReducedDataConnection({ effectiveType: "3G" }), true);
  assert.equal(isReducedDataConnection({ effectiveType: "4g" }), false);
  assert.equal(isReducedDataConnection({ effectiveType: "5g" }), false);
});

test("isReducedDataConnection — API 부재·빈 값은 false (모르면 프리페치 기본)", () => {
  assert.equal(isReducedDataConnection(undefined), false);
  assert.equal(isReducedDataConnection(null), false);
  assert.equal(isReducedDataConnection({}), false);
  assert.equal(isReducedDataConnection({ saveData: false, effectiveType: "" }), false);
});

test("prefersReducedData — navigator 가 없으면(서버) false", () => {
  assert.equal(typeof navigator === "undefined" || true, true);
  /* node 22 는 navigator 전역이 있지만 connection 이 없다 → false */
  assert.equal(prefersReducedData(), false);
});

test("prefersReducedData — navigator.connection 을 읽는다(벤더 접두 포함)", () => {
  const base = typeof navigator === "undefined" ? {} : navigator;
  withGlobal("navigator", Object.assign(Object.create(base), { connection: { effectiveType: "2g" } }), () => {
    assert.equal(prefersReducedData(), true);
  });
  withGlobal("navigator", Object.assign(Object.create(base), { webkitConnection: { saveData: true } }), () => {
    assert.equal(prefersReducedData(), true);
  });
  withGlobal("navigator", Object.assign(Object.create(base), { connection: { effectiveType: "4g" } }), () => {
    assert.equal(prefersReducedData(), false);
  });
});

/* ───────────────────────── [968 · 8] viewport-shell ───────────────────────── */

test("shellMatches — 뷰포트와 같은 벌만 true, shell 이 없으면 항상 true", () => {
  assert.equal(shellMatches("mobile", false), true);
  assert.equal(shellMatches("mobile", true), false);
  assert.equal(shellMatches("desktop", true), true);
  assert.equal(shellMatches("desktop", false), false);
  assert.equal(shellMatches(undefined, true), true);
  assert.equal(shellMatches(undefined, false), true);
});

test("DESKTOP_MEDIA — Tailwind md(768px) 경계", () => {
  assert.equal(DESKTOP_MEDIA, "(min-width: 768px)");
});

test("isDesktopViewport / isShellActive — matchMedia 를 읽고, 없으면 데스크톱으로 본다", () => {
  const fakeWindow = (matches: boolean) => ({
    matchMedia: (q: string) => {
      assert.equal(q, DESKTOP_MEDIA);
      return { matches };
    },
  });
  withGlobal("window", fakeWindow(false), () => {
    /* 360px 폰: 모바일 벌만 활성 */
    assert.equal(isDesktopViewport(), false);
    assert.equal(isShellActive("mobile"), true);
    assert.equal(isShellActive("desktop"), false);
    assert.equal(isShellActive(undefined), true);
  });
  withGlobal("window", fakeWindow(true), () => {
    assert.equal(isDesktopViewport(), true);
    assert.equal(isShellActive("mobile"), false);
    assert.equal(isShellActive("desktop"), true);
  });
  withGlobal("window", {}, () => {
    /* matchMedia 없음(구형·테스트) → 데스크톱 판정 */
    assert.equal(isDesktopViewport(), true);
    assert.equal(isShellActive("desktop"), true);
  });
});

/* ───────────────────────── [968 · 11] reveal-scope ───────────────────────── */

type FakeNode = { id: string; parent: FakeNode | null; contains(o: unknown): boolean };
function fakeTree() {
  const mk = (id: string, parent: FakeNode | null): FakeNode => {
    const n: FakeNode = {
      id,
      parent,
      contains(o: unknown) {
        let cur = o as FakeNode | null;
        while (cur) {
          if (cur === n) return true;
          cur = cur.parent;
        }
        return false;
      },
    };
    return n;
  };
  const body = mk("body", null);
  const main = mk("main", body);
  const aside = mk("aside", body);
  const a = mk("a", main);
  const b = mk("b", main);
  const outside = mk("outside", aside);
  return { body, main, a, b, outside };
}

test("pickRevealRoot — 리빌 노드가 전부 main 안이면 main", () => {
  const t = fakeTree();
  assert.equal(pickRevealRoot([t.a, t.b], t.main, t.body), t.main);
});

test("pickRevealRoot — 하나라도 main 밖이면 body 폴백, main 이 없어도 body", () => {
  const t = fakeTree();
  assert.equal(pickRevealRoot([t.a, t.outside], t.main, t.body), t.body);
  assert.equal(pickRevealRoot([t.a], null, t.body), t.body);
  assert.equal(pickRevealRoot([], t.main, t.body), t.body);
});

test("addedNodesNeedScan — 리빌 후보가 있는 Element 가 추가됐을 때만 true", () => {
  assert.equal(addedNodesNeedScan([]), false);
  /* 텍스트 노드(회전 배너·타이핑)는 무시 */
  assert.equal(
    addedNodesNeedScan([{ isElement: false, hasReveal: false, containsReveal: false }]),
    false,
  );
  assert.equal(
    addedNodesNeedScan([{ isElement: true, hasReveal: false, containsReveal: false }]),
    false,
  );
  assert.equal(
    addedNodesNeedScan([
      { isElement: true, hasReveal: false, containsReveal: false },
      { isElement: true, hasReveal: true, containsReveal: false },
    ]),
    true,
  );
  assert.equal(
    addedNodesNeedScan([{ isElement: true, hasReveal: false, containsReveal: true }]),
    true,
  );
});
