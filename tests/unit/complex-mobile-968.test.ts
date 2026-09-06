import { test } from "node:test";
import assert from "node:assert/strict";
import {
  primeWatching,
  readWatching,
  resetWatchlistStatusCache,
} from "../../app/complex/[id]/watchlist-status.ts";
import {
  canOfferPush,
  fetchVapidPublicKey,
  pushResultMessage,
  subscribeToPush,
  urlBase64ToUint8Array,
  type PushEnv,
  type PushRegistrationLike,
} from "../../lib/push/subscribe-client.ts";

/* [968 · 3] 관심 여부 조회 — 세션 게이트·단지별 공유 프라미스·실패 비캐시.
   [968 · 46] 푸시 구독 헬퍼 — 권한 요청이 첫 await, 결과 4+1 갈래. */

type SessionLike = { user?: { email?: string | null } | null } | null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function watchDeps(session: SessionLike, opts: { watching?: boolean; status?: number } = {}) {
  const calls = { session: 0, fetch: 0, urls: [] as string[] };
  let now = 1_000_000;
  const deps = {
    session: async () => {
      calls.session += 1;
      return session as never;
    },
    fetchImpl: async (url: string) => {
      calls.fetch += 1;
      calls.urls.push(url);
      return jsonResponse({ watching: opts.watching ?? false }, opts.status ?? 200);
    },
    now: () => now,
  };
  return { deps, calls, advance: (ms: number) => (now += ms) };
}

test("readWatching — 비로그인이면 /api/me/watchlist 를 부르지 않고 false", async () => {
  resetWatchlistStatusCache();
  const { deps, calls } = watchDeps(null);
  assert.equal(await readWatching("cx-1", deps), false);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.session, 1);
  /* 두 번째 마운트(하단 바)도 요청 0 — 세션 조회조차 다시 하지 않는다 */
  assert.equal(await readWatching("cx-1", deps), false);
  assert.equal(calls.session, 1);
  assert.equal(calls.fetch, 0);
});

test("readWatching — 로그인이면 단지별 요청 1회를 두 인스턴스가 나눠 받는다", async () => {
  resetWatchlistStatusCache();
  const { deps, calls } = watchDeps({ user: { email: "a@b.c" } }, { watching: true });
  const [hero, bar] = await Promise.all([readWatching("cx-1", deps), readWatching("cx-1", deps)]);
  assert.equal(hero, true);
  assert.equal(bar, true);
  assert.equal(calls.fetch, 1);
  assert.match(calls.urls[0], /^\/api\/me\/watchlist\?complexId=cx-1$/);
  /* 다른 단지는 별도 키 */
  await readWatching("cx-2", deps);
  assert.equal(calls.fetch, 2);
});

test("readWatching — 30초 TTL 뒤에는 다시 묻는다", async () => {
  resetWatchlistStatusCache();
  const { deps, calls, advance } = watchDeps({ user: { email: "a@b.c" } });
  await readWatching("cx-1", deps);
  advance(29_000);
  await readWatching("cx-1", deps);
  assert.equal(calls.fetch, 1);
  advance(2_000);
  await readWatching("cx-1", deps);
  assert.equal(calls.fetch, 2);
});

test("readWatching — 실패(5xx)는 false 로 답하되 캐시하지 않는다", async () => {
  resetWatchlistStatusCache();
  const { deps, calls } = watchDeps({ user: { email: "a@b.c" } }, { status: 503 });
  assert.equal(await readWatching("cx-1", deps), false);
  assert.equal(await readWatching("cx-1", deps), false);
  assert.equal(calls.fetch, 2, "실패는 다음 마운트가 다시 시도한다");
});

test("primeWatching — 토글 직후 값은 요청 없이 읽힌다", async () => {
  resetWatchlistStatusCache();
  const { deps, calls } = watchDeps({ user: { email: "a@b.c" } });
  primeWatching("cx-1", true, deps.now);
  assert.equal(await readWatching("cx-1", deps), true);
  assert.equal(calls.fetch, 0);
});

/* ───────────── [968 · 46] 푸시 구독 ───────────── */

test("urlBase64ToUint8Array — base64url(패딩 없음) → 바이트", () => {
  // "hello" 의 base64url = aGVsbG8 (표준 base64 는 aGVsbG8=)
  const bytes = urlBase64ToUint8Array("aGVsbG8");
  assert.deepEqual([...bytes], [104, 101, 108, 108, 111]);
  // '-' '_' 치환 확인: 0xfb 0xff → "-_8" (base64url) / "+/8=" (표준)
  assert.deepEqual([...urlBase64ToUint8Array("-_8")], [0xfb, 0xff]);
});

function makeEnv(overrides: Partial<PushEnv> & { log?: string[] } = {}) {
  const log = overrides.log ?? [];
  const sub = {
    endpoint: "https://push.example/ep",
    toJSON: () => ({ keys: { p256dh: "P", auth: "A" } }),
  };
  const reg: PushRegistrationLike = {
    pushManager: {
      getSubscription: async () => {
        log.push("getSubscription");
        return null;
      },
      subscribe: async (o) => {
        log.push(`subscribe:${o.userVisibleOnly}:${o.applicationServerKey.length}`);
        return sub;
      },
    },
  };
  const env: PushEnv = {
    isSupported: () => true,
    permission: () => "default",
    requestPermission: async () => {
      log.push("requestPermission");
      return "granted";
    },
    swReady: async () => {
      log.push("swReady");
      return reg;
    },
    fetchImpl: async (url, init) => {
      log.push(`fetch:${init?.method ?? "GET"}:${url}`);
      if (init?.method === "POST") return jsonResponse({ ok: true });
      return jsonResponse({ enabled: true, publicKey: "aGVsbG8" });
    },
    ...overrides,
  };
  return { env, log };
}

test("subscribeToPush — 미지원·차단은 프롬프트 없이 즉시 답한다", async () => {
  const a = makeEnv({ isSupported: () => false });
  assert.equal(await subscribeToPush({ env: a.env }), "unsupported");
  assert.deepEqual(a.log, []);
  const b = makeEnv({ permission: () => "denied" });
  assert.equal(await subscribeToPush({ env: b.env }), "denied");
  assert.deepEqual(b.log, []);
});

test("subscribeToPush — 권한 요청이 첫 await(제스처 안), 그 뒤 키 조회·구독·저장", async () => {
  const { env, log } = makeEnv();
  assert.equal(await subscribeToPush({ env }), "subscribed");
  assert.equal(log[0], "requestPermission");
  assert.deepEqual(log.slice(1), [
    "fetch:GET:/api/push/subscribe",
    "swReady",
    "getSubscription",
    "subscribe:true:5",
    "fetch:POST:/api/push/subscribe",
  ]);
});

test("subscribeToPush — 공개키를 넘기면 GET 을 건너뛴다(PushSubscribe 는 마운트 때 받아 둔다)", async () => {
  const { env, log } = makeEnv();
  assert.equal(await subscribeToPush({ env, publicKey: "aGVsbG8" }), "subscribed");
  assert.ok(!log.includes("fetch:GET:/api/push/subscribe"));
});

test("subscribeToPush — 프롬프트를 닫으면 dismissed, 거부하면 denied", async () => {
  const a = makeEnv({ requestPermission: async () => "default" });
  assert.equal(await subscribeToPush({ env: a.env }), "dismissed");
  const b = makeEnv({ requestPermission: async () => "denied" });
  assert.equal(await subscribeToPush({ env: b.env }), "denied");
  /* 둘 다 구독·저장까지 가지 않는다 */
  assert.ok(!a.log.some((l) => l.startsWith("subscribe")));
  assert.ok(!b.log.some((l) => l.startsWith("subscribe")));
});

test("subscribeToPush — 서버 비활성(enabled:false)·저장 실패·예외는 error", async () => {
  const off = makeEnv({
    fetchImpl: async () => jsonResponse({ enabled: false, publicKey: null }),
  });
  assert.equal(await subscribeToPush({ env: off.env }), "error");

  const saveFail = makeEnv({
    fetchImpl: async (url, init) =>
      init?.method === "POST"
        ? jsonResponse({ error: "x" }, 500)
        : jsonResponse({ enabled: true, publicKey: "aGVsbG8" }),
  });
  assert.equal(await subscribeToPush({ env: saveFail.env }), "error");

  const boom = makeEnv({
    swReady: async () => {
      throw new Error("no sw");
    },
  });
  assert.equal(await subscribeToPush({ env: boom.env }), "error");
});

test("fetchVapidPublicKey — 활성+키일 때만 키, 그 외 null", async () => {
  assert.equal(
    await fetchVapidPublicKey(async () => jsonResponse({ enabled: true, publicKey: "K" })),
    "K",
  );
  assert.equal(await fetchVapidPublicKey(async () => jsonResponse({ enabled: false })), null);
  assert.equal(await fetchVapidPublicKey(async () => jsonResponse({}, 500)), null);
  assert.equal(
    await fetchVapidPublicKey(async () => {
      throw new Error("net");
    }),
    null,
  );
});

test("pushResultMessage — 말할 게 있는 결과만 문장, 나머지는 null", () => {
  assert.ok(pushResultMessage("subscribed"));
  assert.ok(pushResultMessage("denied"));
  assert.ok(pushResultMessage("error"));
  assert.equal(pushResultMessage("dismissed"), null);
  assert.equal(pushResultMessage("unsupported"), null);
});

test("canOfferPush — window 가 없는 환경(서버·테스트)에서는 false", () => {
  assert.equal(canOfferPush(), false);
});
