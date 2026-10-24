"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { Icon } from "@/app/components/Icon";
import { readAuthedHint } from "@/lib/auth/authed-hint";
/* [968 · 46] 구독 절차는 lib/push/subscribe-client.ts 로 옮겼다 — 관심 등록 토스트의
   "푸시로 받기"(단지 허브)와 같은 코드를 쓴다. 이 컴포넌트의 상태·문구는 그대로다. */
import {
  envVapidPublicKey,
  fetchPushServerStatus,
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
   subscribeToPush 가 쓰고, 인라인 값이 없는 빌드에서만 권한 요청 뒤 GET 으로 받는다.

   [1058] "알림 켜짐"의 근거가 브라우저 구독 객체뿐이었다. 비로그인으로 전체 메뉴에서 눌러 권한을 허용하면
   브라우저 구독은 생기고 서버 저장(POST)은 401 — 그 뒤로 마운트마다 "알림 켜짐"이 보였지만 알림은 오지 않았다.
   이제 구독 객체가 있으면 GET /api/push/subscribe?endpoint= 로 서버에 묻고, 서버에 없으면 다시 저장(POST)한
   뒤에야 켜짐을 그린다(위 1007 의 "마운트 GET 금지"는 공개키 얘기다 — 이 조회는 구독 객체가 있는 브라우저,
   즉 실제로 켠 사람에게서만 나간다). 비로그인은 묻지 않고 로그인 링크(/my/settings 로 복귀). */

type Status = "idle" | "loading" | "subscribed" | "denied" | "guest" | "error";

/** [1058] 바깥(알림함의 한 줄)이 상태를 알 수 있게 — ready 전/미지원은 "unsupported" */
export type PushUiStatus = Status | "unsupported";

const LOGIN_HREF = "/login?callbackUrl=%2Fmy%2Fsettings";

export function PushSubscribe({ onStatus }: { onStatus?: (status: PushUiStatus) => void } = {}) {
  // ready: 서버(키)가 활성이고 브라우저가 지원할 때만 true → 그 외에는 렌더 안 함
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  /* 마운트 판정이 끝나기 전엔 "idle"(알림 켜기 버튼)을 그리지 않는다 — 켜짐인데 잠깐 켜기 버튼이 보이는 깜빡임 */
  const [settled, setSettled] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 브라우저 지원 확인 (미지원이면 렌더 안 함) · 키 없음(서버 비활성)도 렌더 안 함
      if (!isPushSupported() || !envVapidPublicKey()) {
        setUnsupported(true);
        return;
      }

      try {
        setReady(true);

        /* [1058] 비로그인 — 권한을 받아도 서버 저장이 401 이라 켜지지 않는다. 로그인 링크로 */
        if (!readAuthedHint()) {
          if (!cancelled) setStatus("guest");
          return;
        }
        if (Notification.permission === "denied") {
          if (!cancelled) setStatus("denied");
          return;
        }
        // 브라우저 구독 객체 — 로컬 조회뿐, 네트워크 없음
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (cancelled || !existing) return;

        /* [1058] 서버에도 있어야 "켜짐" — 없으면 다시 저장(POST). 서버 상태를 못 읽으면(null) 켜기 버튼으로 둔다(누르면 다시 저장) */
        const server = await fetchPushServerStatus(existing.endpoint);
        if (cancelled) return;
        if (server === "login_required") {
          setStatus("guest");
          return;
        }
        if (server?.subscribed) {
          setStatus("subscribed");
          return;
        }
        if (server && !server.subscribed) {
          setStatus("loading");
          const result = await subscribeToPush();
          if (cancelled) return;
          if (result === "subscribed") setStatus("subscribed");
          else if (result === "login_required") setStatus("guest");
          else if (result === "denied") setStatus("denied");
          else setStatus("idle");
        }
      } catch {
        // 서비스워커 조회 실패 등 → "알림 켜기" 상태로 둔다(누르면 절차가 다시 판정한다)
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* [1058] 바깥에 상태 보고 — 알림함 한 줄이 "켜짐"이면 숨고 아니면 보인다 */
  useEffect(() => {
    if (!onStatus) return;
    if (unsupported) {
      onStatus("unsupported");
      return;
    }
    if (!ready) return;
    onStatus(settled ? status : "loading");
  }, [onStatus, ready, settled, status, unsupported]);

  const subscribe = async () => {
    if (status === "loading") return;
    setStatus("loading");
    /* 첫 await 가 권한 요청이 되게(제스처 안) — 키는 인라인 값을 subscribeToPush 가 읽는다. */
    const result = await subscribeToPush();
    if (result === "subscribed") setStatus("subscribed");
    else if (result === "denied") setStatus("denied");
    else if (result === "login_required") setStatus("guest");
    else if (result === "dismissed") setStatus("idle"); // 프롬프트를 닫음 — 다시 누를 수 있다
    else setStatus("error"); // unsupported 는 ready 단계에서 걸러졌으므로 사실상 error 만
  };

  // 비활성 / 미지원 → 아무것도 렌더하지 않음
  if (!ready) return null;

  if (status === "subscribed") {
    return (
      <span className="inline-flex items-center gap-1 t-sub font-semibold text-text-3">
        <Icon name="bell" size={13} />알림 켜짐
      </span>
    );
  }

  if (status === "denied") {
    /* [1058] "차단됨"만으로는 어디서 푸는지 몰랐다 — 주소창 자물쇠 › 알림 허용 */
    return (
      <span className="t-sub text-text-3">브라우저 알림 차단됨 · 주소창 자물쇠 › 알림 허용 뒤 다시</span>
    );
  }

  if (status === "guest") {
    return (
      <Link
        href={LOGIN_HREF}
        className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-line bg-surface px-3 t-sub font-semibold text-text-2 md:min-h-6"
      >
        <Icon name="bell" size={13} />알림 켜기 · 로그인
      </Link>
    );
  }

  /* 판정 전(구독 객체 확인 · 서버 조회 중) — 켜기 버튼을 먼저 보여 주지 않는다 */
  if (!settled && status !== "loading") return null;

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={status === "loading"}
      className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 t-sub font-semibold text-text-2 transition-colors hover:text-primary disabled:opacity-60 md:min-h-6"
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
