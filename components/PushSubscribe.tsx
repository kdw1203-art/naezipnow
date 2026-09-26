"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
/* [968 · 46] 구독 절차는 lib/push/subscribe-client.ts 로 옮겼다 — 관심 등록 토스트의
   "푸시로 받기"(단지 허브)와 같은 코드를 쓴다. 이 컴포넌트의 상태·문구는 그대로다. */
import {
  envVapidPublicKey,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push/subscribe-client";

/* PWA 웹 푸시 구독 (#19)
   흐름: 권한 요청 → serviceWorker.ready → pushManager.subscribe(VAPID) → POST /api/push/subscribe.
   과도한 자동 프롬프트는 하지 않고, 사용자가 "알림 켜기"를 눌렀을 때만 권한을 요청한다.

   [1007 · V2a-3] 마운트 때 GET /api/push/subscribe(공개키)를 부르지 않는다.
   실측 943회/일 — 전체 메뉴(모든 페이지에 마운트)·설정 화면의 이 컴포넌트가 페이지마다 공개키를
   미리 받았고, 사람 페이지뷰(~17/일)를 빼면 전부 JS 를 실행하는 봇의 요청이었다.
   서버가 "활성" 인 조건은 NEXT_PUBLIC_VAPID_PUBLIC_KEY 하나뿐이라(lib/push/vapid.ts) 그 값을
   빌드 인라인으로 읽으면 요청 없이 같은 판정이 된다. 키가 없으면(서버 비활성) 종전처럼 아무것도
   그리지 않는다 — 눌러도 안 되는 버튼을 만들지 않는다. 키는 사용자가 "알림 켜기"를 누를 때
   subscribeToPush 가 쓰고, 인라인 값이 없는 빌드에서만 권한 요청 뒤 GET 으로 받는다. */

type Status = "idle" | "loading" | "subscribed" | "denied" | "error";

export function PushSubscribe() {
  // ready: 서버(키)가 활성이고 브라우저가 지원할 때만 true → 그 외에는 렌더 안 함
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 브라우저 지원 확인 (미지원이면 렌더 안 함) · 키 없음(서버 비활성)도 렌더 안 함
      if (!isPushSupported() || !envVapidPublicKey()) return;

      try {
        setReady(true);

        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }
        // 이미 구독돼 있으면 "켜짐" 상태로 표시 — 로컬 조회뿐, 네트워크 없음
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (!cancelled && existing) setStatus("subscribed");
      } catch {
        // 서비스워커 조회 실패 등 → "알림 켜기" 상태로 둔다(누르면 절차가 다시 판정한다)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = async () => {
    if (status === "loading") return;
    setStatus("loading");
    /* 첫 await 가 권한 요청이 되게(제스처 안) — 키는 인라인 값을 subscribeToPush 가 읽는다. */
    const result = await subscribeToPush();
    if (result === "subscribed") setStatus("subscribed");
    else if (result === "denied") setStatus("denied");
    else if (result === "dismissed") setStatus("idle"); // 프롬프트를 닫음 — 다시 누를 수 있다
    else setStatus("error"); // unsupported 는 ready 단계에서 걸러졌으므로 사실상 error 만
  };

  // 비활성 / 미지원 → 아무것도 렌더하지 않음
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
