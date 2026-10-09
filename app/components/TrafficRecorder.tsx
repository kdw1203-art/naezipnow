"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "@/components/consent/use-cookie-consent";
import { getSessionLite } from "@/lib/client/session-lite";
/* [1052 · 번들] 가입 경로 규칙(lib/growth/attribution-retry · SHA-256 해시)은 로그인한 동의 방문자에게만 받는다 —
   이 기록기는 모든 화면의 레이아웃에 있어 정적 import 면 모든 화면 첫 로드 JS 가 늘었다(로컬 실측 +0.6~1.5KB) */
const LEGACY_ATTR_DONE_KEY = "nz_attr_done"; // = attribution-retry LEGACY_ATTR_DONE_KEY(1046 의 브라우저 하나짜리 표시)

/* ============================================================
   1st-party 페이지뷰·체류 기록기 (어드민 트래픽 대시보드용).

   개인정보 원칙 — GA4 와 같은 게이트를 쓴다:
   - 분석 동의(analytics=true)가 있어야만 동작한다. 동의 전·거부 시 아무것도
     보내지 않는다. 그래서 대시보드 숫자는 "분석 동의 사용자 표본"이다 —
     어드민 화면이 그 사실을 명기한다.
   - session_key 는 sessionStorage 무작위 값(탭 세션 단위) — 계정과 무관.

   측정 모델:
   - 경로 진입 시 view 비콘(viewId 발급).
   - 다음 경로 이동·문서 숨김(pagehide/visibilitychange) 시 leave 비콘으로
     체류(ms) 확정 — 서버는 첫 leave 만 반영한다. 숨김→복귀 후 추가 체류는
     세지 않는다(과대측정보다 과소측정을 택한다).
   ============================================================ */

const SESSION_STORAGE_KEY = "nz_traffic_session";
/* 웹30 — 재방문 지표용 방문자 키(localStorage). 세션 키는 탭 세션 단위라
   "다시 왔는가"를 이을 수 없다. 계정·PII 와 무관한 무작위 값이고, 세션 키와
   똑같이 분석 동의 뒤에서만 만들어지고 전송된다. 동의를 거부로 바꾸면
   지운다(아래 effect). */
const VISITOR_STORAGE_KEY = "nz_traffic_visitor";
/* [1046] 가입 경로 잇기를 마쳤는가 — [1052] 계정별 표시로 옮겼다(lib/growth/attribution-retry) */

function randomHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getSessionKey(): string | null {
  try {
    let k = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!k || !/^[a-f0-9]{16,64}$/.test(k)) {
      k = randomHex();
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, k);
    }
    return k;
  } catch {
    return null; // 프라이빗 모드 등 — 기록 없이 진행
  }
}

function getVisitorKey(): string | null {
  try {
    let k = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!k || !/^[a-f0-9]{16,64}$/.test(k)) {
      k = randomHex();
      window.localStorage.setItem(VISITOR_STORAGE_KEY, k);
    }
    return k;
  } catch {
    return null;
  }
}

function send(payload: Record<string, unknown>, useBeacon: boolean) {
  const body = JSON.stringify(payload);
  if (useBeacon && "sendBeacon" in navigator) {
    try {
      navigator.sendBeacon("/api/metrics/pageview", new Blob([body], { type: "application/json" }));
      return;
    } catch {
      /* sendBeacon 실패 → fetch 폴백 */
    }
  }
  void fetch("/api/metrics/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function TrafficRecorder() {
  const pathname = usePathname();
  const { state } = useCookieConsent();
  const consented = state.status === "decided" && state.consent.analytics;

  /* 동의를 거부로 결정하면 방문자 키를 지운다 — 수집이 멈추는 것에 더해
     식별자 자체를 남기지 않는다. */
  useEffect(() => {
    if (state.status === "decided" && !state.consent.analytics) {
      try {
        window.localStorage.removeItem(VISITOR_STORAGE_KEY);
      } catch {
        /* 접근 불가 — 어차피 수집도 없다 */
      }
    }
  }, [state]);

  /* [1046 · 성장] 가입 경로 잇기 — "어디서 온 사람이 가입했나"를 알 길이 없었다(가입 기록에 출처가 없음).
     분석 동의한 방문자가 로그인 상태가 되면, 이 브라우저의 방문자 키를 한 번만 서버에 건넨다. 서버는
     그 키의 첫 착지(유입 호스트·UTM·첫 화면)를 가입 기록에 붙인다 — 가입 14일 안의 계정만(app/api/me/attribution).
     동의 전·거부면 아무것도 보내지 않는다(위 페이지뷰와 같은 게이트). 끝나면 다시 묻지 않는다. */
  /* [1052] 끝남 표시는 계정별(이메일 해시 — 원문은 저장하지 않는다) · 2xx·4xx 는 끝 · 네트워크·5xx 는 이 탭에서
     한 번만 더(다음 화면 이동 때). 규칙은 lib/growth/attribution-retry(단위 시험). 보내는 중엔 겹쳐 보내지 않는다. */
  const attrInFlight = useRef(false);
  useEffect(() => {
    if (!consented) return;
    let local: Storage | null = null;
    let session: Storage | null = null;
    try {
      local = window.localStorage;
      session = window.sessionStorage;
      local.removeItem(LEGACY_ATTR_DONE_KEY);
    } catch {
      return;
    }
    if (attrInFlight.current) return;
    const visitorKey = getVisitorKey();
    if (!visitorKey) return;
    let cancelled = false;
    void getSessionLite().then(async (s) => {
      if (cancelled || !s?.user?.email) return;
      const { attributionOutcome, claimAttributionAttempt, emailMarker, recordAttributionOutcome } = await import(
        "@/lib/growth/attribution-retry"
      );
      const marker = await emailMarker(s.user.email);
      if (cancelled || !marker || attrInFlight.current) return;
      if (!claimAttributionAttempt(marker, local, session)) return;
      attrInFlight.current = true;
      void fetch("/api/me/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey }),
      })
        .then(
          (r) => recordAttributionOutcome(marker, attributionOutcome(r.status), local, session),
          () => recordAttributionOutcome(marker, attributionOutcome(null), local, session),
        )
        .finally(() => {
          attrInFlight.current = false;
        });
    });
    return () => {
      cancelled = true;
    };
  }, [consented, pathname]);

  /** 진행 중인 view — leave 1회 보장용 */
  const current = useRef<{ viewId: string; startedAt: number; closed: boolean } | null>(null);

  useEffect(() => {
    if (!consented || !pathname) return;
    const sessionKey = getSessionKey();
    if (!sessionKey) return;

    // 이전 페이지 마감
    const prev = current.current;
    if (prev && !prev.closed) {
      prev.closed = true;
      send({ t: "leave", viewId: prev.viewId, durationMs: Date.now() - prev.startedAt }, false);
    }

    /* 유입 출처 — 세션 첫 뷰(랜딩)에만 붙인다. 내부 이동의 same-origin
       리퍼러는 유입이 아니고, 외부 리퍼러도 **호스트만** 보낸다(전체 URL 에는
       검색어가 실릴 수 있다 — 개인정보 원칙). UTM 은 우리가 발행한 값이라
       그대로. */
    let landing: Record<string, unknown> = {};
    try {
      if (!window.sessionStorage.getItem("nz_traffic_landed")) {
        window.sessionStorage.setItem("nz_traffic_landed", "1");
        let referrerHost: string | null = null;
        if (document.referrer) {
          try {
            const u = new URL(document.referrer);
            if (u.host !== window.location.host) referrerHost = u.host;
          } catch {
            /* 리퍼러 파싱 실패 — 없는 것으로 */
          }
        }
        const sp = new URLSearchParams(window.location.search);
        landing = {
          landing: true,
          ...(referrerHost ? { referrerHost } : {}),
          ...(sp.get("utm_source") ? { utmSource: sp.get("utm_source") } : {}),
          ...(sp.get("utm_medium") ? { utmMedium: sp.get("utm_medium") } : {}),
          ...(sp.get("utm_campaign") ? { utmCampaign: sp.get("utm_campaign") } : {}),
        };
      }
    } catch {
      /* sessionStorage 불가 — 랜딩 표기 없이 진행 */
    }

    const viewId = crypto.randomUUID();
    current.current = { viewId, startedAt: Date.now(), closed: false };
    const visitorKey = getVisitorKey();
    send(
      {
        t: "view",
        viewId,
        path: pathname,
        sessionKey,
        ...(visitorKey ? { visitorKey } : {}),
        ...landing,
      },
      false,
    );

    const close = (useBeacon: boolean) => {
      const cur = current.current;
      if (!cur || cur.closed || cur.viewId !== viewId) return;
      cur.closed = true;
      send({ t: "leave", viewId, durationMs: Date.now() - cur.startedAt }, useBeacon);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") close(true);
    };
    const onPageHide = () => close(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [consented, pathname]);

  return null;
}
