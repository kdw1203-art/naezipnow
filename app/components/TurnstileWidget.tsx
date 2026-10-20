"use client";

/**
 * [1080] Cloudflare Turnstile 위젯 — 가입(비밀번호) 화면.
 *
 * 왜: 가입·로그인 가드가 서버 검증(lib/auth/verify-turnstile)을 지원했지만 위젯을 그리는 화면이 없어 캡차는 꺼진 채였다.
 * 방문자가 늘면 대량 가입·스팸이 먼저 온다. 사이트 키(NEXT_PUBLIC_TURNSTILE_SITE_KEY)가 있을 때만 그린다 —
 * 없으면 null(종전과 같다). 토큰은 onToken 으로 올리고, 만료·오류면 null 을 올린다.
 * 스크립트는 한 번만 붙인다(explicit render). 테마는 화면 설정을 따른다(auto) · 폭은 칸에 맞춘다(flexible).
 */
import { useEffect, useRef } from "react";
import { TURNSTILE_ORIGIN } from "@/lib/auth/turnstile-site-key";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __nzTurnstileReady?: Promise<TurnstileApi>;
  }
}

const SCRIPT_SRC = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (window.__nzTurnstileReady) return window.__nzTurnstileReady;
  window.__nzTurnstileReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(s);
  });
  return window.__nzTurnstileReady;
}

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
  className = "",
}: {
  siteKey: string;
  /** 분석용 이름(Cloudflare 대시보드) — 예: signup */
  action?: string;
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current) return;
        widgetId = api.render(hostRef.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      try {
        if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      } catch {
        /* 이미 사라진 위젯 */
      }
    };
  }, [siteKey, action]);

  return <div ref={hostRef} className={className} data-testid="turnstile" />;
}

export default TurnstileWidget;
