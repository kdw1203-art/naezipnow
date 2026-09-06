/* [968 · 46] 웹 푸시 구독 — 클라이언트 공용 헬퍼.

   왜 분리했나: 구독 절차(권한 → VAPID 공개키 → serviceWorker.ready →
   pushManager.subscribe → POST /api/push/subscribe)는 components/PushSubscribe.tsx
   (전체 메뉴의 "알림 켜기") 안에만 있었다. 관심 등록 성공 토스트의 "푸시로 받기"
   (hub-client.tsx WatchlistButton)가 같은 절차를 써야 하므로 여기로 꺼냈다.
   두 진입점이 같은 API·같은 키 출처(GET /api/push/subscribe 의 publicKey)를 쓴다.

   규칙: 권한 프롬프트(Notification.requestPermission)는 **사용자 제스처 안에서**
   호출돼야 한다(Safari 는 활성화 창 밖의 호출을 조용히 거부한다). 그래서
   subscribeToPush() 는 탭 핸들러에서 직접 부르고, 절차의 **첫 await 가 권한 요청**이
   되도록 공개키 조회를 그 뒤에 둔다. 자동 프롬프트는 어디서도 하지 않는다.

   이 파일은 브라우저 전용 API 를 **호출 시점에만** 만진다(모듈 로드 시 window 접근
   없음) — 서버 번들에 섞여도 안전하고, 단위테스트는 env 를 주입해 돌린다. */

export type PushSubscribeResult =
  /** 구독 저장까지 끝남 */
  | "subscribed"
  /** 브라우저가 알림을 차단(denied) */
  | "denied"
  /** 프롬프트를 닫아 결정을 미룸(default 유지) — 다시 시도할 수 있다 */
  | "dismissed"
  /** 서비스워커·PushManager·Notification 중 하나라도 없음 */
  | "unsupported"
  /** 서버 비활성(VAPID 미설정)·구독 실패·저장 실패·네트워크 오류 */
  | "error";

/** 브라우저 능력·네트워크를 주입할 수 있게 한 최소 표면(테스트용). 기본값은 실제 브라우저. */
export interface PushEnv {
  isSupported(): boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  /** serviceWorker.ready — 등록이 없으면 영원히 대기할 수 있으므로 호출자가 상한을 둔다 */
  swReady(): Promise<PushRegistrationLike>;
  fetchImpl(input: string, init?: RequestInit): Promise<Response>;
}

/** ServiceWorkerRegistration 중 여기서 쓰는 조각만 */
export interface PushRegistrationLike {
  pushManager: {
    getSubscription(): Promise<PushSubscriptionLike | null>;
    subscribe(opts: {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array<ArrayBuffer>;
    }): Promise<PushSubscriptionLike>;
  };
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): { keys?: { p256dh?: string; auth?: string } };
}

/** VAPID base64url 공개키 → Uint8Array (applicationServerKey 용) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** 브라우저가 웹 푸시를 지원하는가(서버 활성 여부는 별개 — fetchVapidPublicKey 가 본다) */
export function isPushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * 관심 등록 성공 직후 "푸시로 받기"를 **권할 수 있는** 상태인가.
 * 지원되고, 아직 묻지 않은(default) 경우에만 true — 이미 허용/차단했으면 권하지 않는다.
 */
export function canOfferPush(): boolean {
  return isPushSupported() && Notification.permission === "default";
}

/** GET /api/push/subscribe → 서버가 활성이고 공개키가 있을 때만 그 키. 아니면 null. */
export async function fetchVapidPublicKey(
  fetchImpl: PushEnv["fetchImpl"] = (i, init) => fetch(i, init),
): Promise<string | null> {
  try {
    const res = await fetchImpl("/api/push/subscribe");
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
    if (!data.enabled || !data.publicKey) return null;
    return data.publicKey;
  } catch {
    return null;
  }
}

function browserEnv(): PushEnv {
  return {
    isSupported: isPushSupported,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    swReady: () => navigator.serviceWorker.ready as unknown as Promise<PushRegistrationLike>,
    fetchImpl: (i, init) => fetch(i, init),
  };
}

/**
 * 푸시 구독 한 번 — 사용자 탭 핸들러 안에서 부른다.
 *
 * @param opts.publicKey 이미 받아 둔 VAPID 공개키(PushSubscribe 는 마운트 때 받아 둔다).
 *                       없으면 권한 요청 **뒤에** GET /api/push/subscribe 로 받는다.
 * @param opts.env       테스트용 주입. 기본은 실제 브라우저.
 */
export async function subscribeToPush(opts: {
  publicKey?: string | null;
  env?: PushEnv;
} = {}): Promise<PushSubscribeResult> {
  const env = opts.env ?? browserEnv();
  if (!env.isSupported()) return "unsupported";
  if (env.permission() === "denied") return "denied";

  try {
    /* 첫 await = 권한 요청. 이 앞에 네트워크 왕복을 두면 제스처 활성화 창이
       끝난 뒤에 프롬프트를 열게 되고, Safari 는 그걸 자동 프롬프트로 보고 막는다. */
    const permission = await env.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "dismissed";

    const publicKey = opts.publicKey ?? (await fetchVapidPublicKey(env.fetchImpl));
    if (!publicKey) return "error";

    const reg = await env.swReady();
    // 이미 구독이 있으면 재사용, 없으면 새로 구독
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = sub.toJSON();
    const res = await env.fetchImpl("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok ? "subscribed" : "error";
  } catch {
    return "error";
  }
}

/** 결과 → 사용자에게 보여 줄 한 줄(토스트용). 말할 게 없는 결과는 null. */
export function pushResultMessage(result: PushSubscribeResult): string | null {
  switch (result) {
    case "subscribed":
      return "푸시 알림을 켰어요 · 시세 변동 시 바로 알려 드려요";
    case "denied":
      return "브라우저에서 알림이 차단돼 있어요 · 사이트 설정에서 허용할 수 있어요";
    case "error":
      return "푸시 설정에 실패했어요 · 잠시 후 다시 시도해 주세요";
    case "dismissed":
    case "unsupported":
      return null;
  }
}
