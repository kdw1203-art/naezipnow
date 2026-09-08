"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSessionLite } from "@/lib/client/session-lite";
import { loginReturnHref } from "@/lib/client/shell-gates";

/* S13-13a 헤더 세션 영역 — /api/auth/session 지연 조회 (정적 셸 ISR 유지)
   로그인: 이니셜 원형 아바타 + 플랜 배지(✦, 시안 9m 4373행) + 드롭다운
   비로그인: "로그인" 텍스트 링크 → /login
   [966] 메뉴 키보드 — Esc 닫고 트리거로 복귀 · ↑↓ 로 menuitem 사이 이동(순환) ·
   트리거에서 ↓/↑ 는 열면서 첫/마지막 항목으로. */

type SessionUser = {
  name?: string | null;
  email?: string | null;
  plan?: string | null;
  /* 세션 콜백(auth.ts)이 role 을 싣는다 — 관리자에게만 콘솔 링크를 그린다 */
  role?: string | null;
};

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; user: SessionUser };

const PLAN_BADGE: Record<string, string> = {
  pro: "✦ 플러스",
  expert: "✦ 전문가",
  enterprise: "✦ 엔터프라이즈",
};

const MENU = [
  { label: "마이", href: "/my" },
  { label: "내 매물", href: "/my/listings" },
  { label: "포인트 지갑", href: "/my/points" },
  { label: "크리에이터", href: "/my/creator" },
  { label: "구독 관리", href: "/subscription" },
  { label: "설정", href: "/my/settings" },
  { label: "고객센터", href: "/support" },
] as const;

export function HeaderAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  /* 트리거에서 ↓/↑ 로 열었을 때 첫/마지막 항목으로 포커스를 보낼 예약 */
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);

  /* [970 · A-15] "로그인" 은 지금 화면으로 돌아오게 callbackUrl 을 싣는다. 쿼리는
     useSearchParams 대신 마운트 뒤 window 에서 읽는다 — 헤더는 정적(ISR) 페이지 전부에
     실리므로 useSearchParams 를 쓰면 Suspense 경계 없이는 프리렌더가 깨진다. 첫 렌더
     (서버·하이드레이션)는 경로만, 효과에서 쿼리를 더한다. */
  const pathname = usePathname() ?? "/";
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  const loginHref = loginReturnHref(pathname, search);

  useEffect(() => {
    let cancelled = false;
    // 최적화 26 — 공유 세션 조회(페이지당 1회)로 수렴
    getSessionLite().then((s) => {
      if (cancelled) return;
      if (s?.user?.email) setState({ status: "user", user: s.user });
      else setState({ status: "guest" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 바깥 클릭으로 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /* [966] 열린 동안 키보드 — Esc: 닫고 트리거로 복귀 · ↑↓: menuitem 순환 · Home/End.
     포커스가 메뉴 밖(트리거)에 있으면 ↓ 는 첫 항목, ↑ 는 마지막 항목으로. */
  useEffect(() => {
    if (!open) return;
    const items = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
    const pending = focusOnOpenRef.current;
    focusOnOpenRef.current = null;
    if (pending) {
      const list = items();
      (pending === "first" ? list[0] : list[list.length - 1])?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const cur = list.indexOf(document.activeElement as HTMLElement);
      let next = 0;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      else if (e.key === "ArrowDown") next = cur < 0 ? 0 : (cur + 1) % list.length;
      else next = cur <= 0 ? list.length - 1 : cur - 1;
      list[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* 세션 확인 중에도 게스트 링크를 그린다(#홈비판 — SSR/첫 페인트에 가입
     경로가 아예 없었다). 첫 방문 트래픽 대다수가 비로그인이라 게스트가
     기본값이 맞고, 로그인 사용자는 확인 후 아바타로 스왑된다(깜빡임 감수). */
  if (state.status === "loading" || state.status === "guest") {
    /* 웹5 — CTA 위계 정리. 회원가입이 아웃라인 필이라 헤더의 진짜 목표
       행동("노트 쓰기" 파랑 버튼)과 경쟁했다. 이 제품의 첫 행동은 가입이
       아니라 기록이다(로그인 없이 작성, 저장할 때 로그인) — 회원가입은
       로그인과 같은 텍스트 링크로 내려 시선 경쟁을 없앤다. */
    return (
      <div className="flex items-center gap-3">
        {/* [970 · A-19] 셸 링크는 프리페치 없음(사유는 Header.tsx) */}
        <Link
          href={loginHref}
          prefetch={false}
          className="whitespace-nowrap text-[13px] font-bold text-text-1 transition-colors hover:text-primary"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          prefetch={false}
          className="hidden whitespace-nowrap text-[13px] font-bold text-text-2 transition-colors hover:text-primary md:inline"
        >
          회원가입
        </Link>
      </div>
    );
  }

  const { user } = state;
  const initial = (user.name?.trim() || user.email || "누")
    .charAt(0)
    .toUpperCase();
  /* 관리자는 플랜 대신 "관리자"로 표기 — 운영 계정임이 배지에서 바로 보이게. */
  const planBadge =
    user.role === "admin" ? "✦ 관리자" : user.plan ? PLAN_BADGE[user.plan] : undefined;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          /* 닫힌 상태에서 ↓/↑ — 열면서 첫/마지막 항목으로(메뉴 버튼 관행) */
          if (open || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
          e.preventDefault();
          focusOnOpenRef.current = e.key === "ArrowDown" ? "first" : "last";
          setOpen(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="내 계정 메뉴"
        className="flex items-center"
      >
        {/* [976] 예전엔 from-line→to-line-strong 그라데이션이었다. 그 중간색(#ced3da)
            위에서 --primary 가 4.41:1 로 AA 를 아슬하게 못 넘겼다(axe 실측). 이
            동그라미는 모든 화면 헤더에 있다. primary-soft 는 대비 게이트가 이미
            --primary 와 짝으로 보증하는 면이다(5.94:1). */}
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary-soft text-[13px] font-extrabold text-primary">
          {initial}
        </span>
      </button>
      {/* 웹2 — 플랜 배지를 드롭다운 토글에서 분리해 링크로. 유료·관리자 배지는
          이미 있었지만 무료 사용자에게는 아무것도 없어 업그레이드 진입점이
          드롭다운 두 단계 아래(구독 관리)에만 있었다. 무료는 "무료" 배지가
          /subscription 으로 바로 간다. 모바일 헤더는 폭이 좁아 종전대로 md+ 만. */}
      {planBadge ? (
        <Link
          href={user.role === "admin" ? "/admin" : "/subscription"}
          prefetch={false}
          className="hidden rounded-full chip-pad text-[10px] font-extrabold text-ai-accent no-underline md:inline-block"
          style={{ background: "rgba(25,31,40,.94)" }}
        >
          {planBadge}
        </Link>
      ) : (
        <Link
          href="/subscription"
          prefetch={false}
          title="플랜 비교·업그레이드"
          className="hidden rounded-full border border-line chip-pad text-[10px] font-extrabold text-text-3 no-underline transition-colors hover:border-primary hover:text-primary md:inline-block"
        >
          무료
        </Link>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 pt-2">
          {/* [970 · A-01] 계정 메뉴도 GNB 드롭다운과 같은 인라인 흰 배경이었다(다크에서 안 보임)
              — .popover-surface(surface 토큰 92%, 양 테마)로 통일. */}
          <div
            ref={menuRef}
            id={menuId}
            className="glass-strong popover-surface min-w-[168px] rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_backwards]"
            role="menu"
            aria-label="내 계정"
          >
            <div className="truncate px-3 pb-1 pt-2 text-[12px] text-text-3">
              {user.name?.trim() || user.email}
            </div>
            {/* 관리자 콘솔 진입점 — 이 링크가 없어 관리자가 /admin 존재를
                모르는 상태였다(2026-08-02). 접근 제어는 서버 레이아웃이 한다. */}
            {user.role === "admin" && (
              <Link
                href="/admin"
                prefetch={false}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2 text-[13px] font-extrabold text-primary transition-colors hover:bg-[rgba(29,79,216,.08)]"
              >
                관리자 콘솔
              </Link>
            )}
            {MENU.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                prefetch={false}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
              >
                {m.label}
              </Link>
            ))}
            <div className="mx-2 my-1 border-t border-line" />
            {/* [965] /logout 은 마운트 즉시 signOut 을 부르는 화면 — 프리페치되면 안 되므로
                <Link> 대신 <a>. (예전 /api/auth/signout 은 Auth.js 영문 확인 화면이었다) */}
            <a
              href="/logout"
              role="menuitem"
              className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft"
            >
              로그아웃
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
