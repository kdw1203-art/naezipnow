"use client";

/* B10 — 헤더 알림 벨 + 미읽음 배지. 마운트 시 경량 카운트 조회.
   [967 · 24] 읽음 이벤트(nz:notifications-read)로 즉시 갱신 + 탭 복귀(visibility·
   focus)마다 30초 간격으로 다시 센다 — 예전엔 마운트 한 번뿐이라 다른 탭에서
   읽어도, 알림이 새로 와도 페이지를 옮기기 전엔 숫자가 그대로였다. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { NOTIFICATIONS_READ_EVENT, readNotificationsReadDetail } from "@/lib/notifications/read-event";

/** 탭 복귀 재조회 최소 간격 — 탭을 오갈 때마다 서버를 두드리지 않는다 */
const REFETCH_MIN_INTERVAL_MS = 30_000;

export function NotificationBell({ variant }: { variant: "desktop" | "mobile" }) {
  const [count, setCount] = useState(0);
  const lastFetchAtRef = useRef(0);

  const refetch = useCallback((force: boolean) => {
    const now = Date.now();
    if (!force && now - lastFetchAtRef.current < REFETCH_MIN_INTERVAL_MS) return;
    lastFetchAtRef.current = now;
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { count?: number | null } | null) => {
        /* null = "확인하지 못했다"(집계 실패) — 0 으로 그리지 않고 지금 값을 둔다 */
        if (j && typeof j.count === "number") setCount(j.count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    /* 첫 조회는 그대로 — 간격 제한 없이 마운트 즉시 */
    refetch(true);

    /* [967 · 24] 읽음 처리 화면이 남은 수를 알려 주면 그 값으로 — 0 이면 배지가 사라진다 */
    const onRead = (ev: Event) => {
      const remaining = readNotificationsReadDetail(ev);
      if (remaining !== null) setCount(remaining);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch(false);
    };
    const onFocus = () => refetch(false);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch]);

  /* 모바일25 — 홈 화면 아이콘 배지(App Badging API). PWA 설치 사용자의
     앱 아이콘에 미읽음 수를 싣는다. 지원 브라우저(설치된 PWA 한정)에서만
     동작하고 미지원이면 아무 일도 없다 — 폴리필·대체 UI 없음(벨 배지가 이미
     그 역할이다). 값은 위에서 받은 실측 카운트 그대로. */
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;
    if (count > 0) nav.setAppBadge(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [count]);

  const cls =
    variant === "desktop"
      ? "press relative hidden h-9 w-9 items-center justify-center rounded-xl bg-[var(--glass-bg)] text-text-1 transition-colors hover:text-primary md:flex"
      : "press relative flex h-8 w-8 items-center justify-center after:absolute after:-inset-1.5 after:content-['']";
  const size = variant === "desktop" ? 18 : 19;

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `알림 ${count}건` : "알림"}
      className={cls}
    >
      <Icon name="bell" size={size} />
      {count > 0 && (
        /* [962] 읽지 않은 알림 = 주홍 온점 배지, 처음 뜰 때 파문 한 번(njn-badge) */
        <span className="njn-badge absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
