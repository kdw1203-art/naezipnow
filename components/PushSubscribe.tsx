"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
/* [968 · 46] 구독 절차는 lib/push/subscribe-client.ts 로 옮겼다 — 관심 등록 토스트의
   "푸시로 받기"(단지 허브)와 같은 코드를 쓴다. 이 컴포넌트의 상태·문구는 그대로다. */
import {
  fetchVapidPublicKey,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push/subscribe-client";

/* PWA 웹 푸시 구독 (#19)
   흐름: GET /api/push/subscribe(공개키) → 권한 요청 → serviceWorker.ready →
         pushManager.subscribe(VAPID) → POST /api/push/subscribe(구독 저장).
   서버가 비활성(enabled:false / publicKey 없음)을 보고하면 아무것도 렌더하지 않는다.
   과도한 자동 프롬프트는 하지 않고, 사용자가 "알림 켜기"를 눌렀을 때만 권한을 요청한다. */

type Status = "idle" | "loading" | "subscribed" | "denied" | "error";

export function PushSubscribe() {
  // ready: 서버가 활성 상태이고 브라우저가 지원할 때만 true → 그 외에는 렌더 안 함
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 브라우저 지원 확인 (미지원이면 렌더 안 함)
      if (!isPushSupported()) return;

      try {
        // 서버가 비활성(VAPID 미설정)·조회 실패 → 렌더 안 함
        const key = await fetchVapidPublicKey();
        if (cancelled || !key) return;

        setPublicKey(key);
        setReady(true);

        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }
        // 이미 구독돼 있으면 "켜짐" 상태로 표시
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (!cancelled && existing) setStatus("subscribed");
      } catch {
        // 네트워크 실패 등 → 조용히 렌더 안 함
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = async () => {
    if (!publicKey || status === "loading") return;
    setStatus("loading");
    /* 마운트 때 받아 둔 공개키를 넘겨 권한 요청이 첫 await 가 되게 한다(제스처 안). */
    const result = await subscribeToPush({ publicKey });
    if (result === "subscribed") setStatus("subscribed");
    else if (result === "denied") setStatus("denied");
    else if (result === "dismissed") setStatus("idle"); // 프롬프트를 닫음 — 다시 누를 수 있다
    else setStatus("error"); // unsupported 는 ready 단계에서 걸러졌으므로 사실상 error 만
  };

  // 비활성 / 미지원 / 조회 실패 → 아무것도 렌더하지 않음
  if (!ready) return null;

  if (status === "subscribed") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-3">
        <Icon name="bell" size={13} />알림 켜짐
      </span>
    );
  }

  if (status === "denied") {
    return (
      <span className="text-[12px] text-text-3">브라우저 알림이 차단됨</span>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={status === "loading"}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:text-primary disabled:opacity-60"
    >
      {status === "loading" ? (
        "설정 중…"
      ) : status === "error" ? (
        "다시 시도"
      ) : (
        <>
          <Icon name="bell" size={13} />알림 켜기
        </>
      )}
    </button>
  );
}

export default PushSubscribe;
