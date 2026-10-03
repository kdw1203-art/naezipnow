"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";

/* [1027] 지역 알림 구독 버튼 — 한 번 누르면 그 지역이 구독된다.
 *
 * 이 자리들은 전부 알림함(/notifications)을 여는 링크였고 아무것도 구독하지 않았다.
 *   · 지역 페이지 끝 "{지역} 시세 알림 받기" — "지역 시세 알림"이라는 알림은 없다.
 *   · 지역 시세 네 화면(면적대별 · 시세·타이밍 · 온도 · 전세가율)의 주 행동 "이 지역 알림 받기"와
 *     그 위 한 줄 "실거래 등록·지수 변동 알림" — 그런 알림도 없다.
 *   · AI 매수 타이밍 레일의 "이 지역 알림" 카드 — 같은 문구.
 * 지역 구독(user_watchlist 의 alert:region:<지역> — POST /api/me/alerts)이 실제로 보내는 것은
 *   · 청약 공고·접수 시작·당첨자 발표(app/api/cron/applyhome-alerts, 매일)
 *   · 그 지역에 승인된 새 등록 매물(lib/notifications/region-alerts)
 * 이고 둘 다 알림함으로 간다. 그래서 문구는 그 둘을 이름으로 말하고, 누르면 정말 구독한다.
 * 청약 공고는 그 지역이 속한 **시/도 전체**가 온다(그 구·시의 공고가 먼저) — 크론의 기존 규칙이라 문구에도 그렇게 적는다.
 * 지역 표기는 서버가 한 가지로 맞춘다(lib/alerts/region-value.ts — "경기 안양시 만안구" → "안양 만안구").
 * 같은 지역을 다시 눌러도 한 건이다(upsert). 해지는 알림함의 "알림 구독"에서.
 *
 * 모양 셋 — tile(지역 페이지의 카드 버튼) · primary(분석 화면의 주 행동 — 레일과 폰 하단 바) · link(레일 카드 안 글자 버튼).
 * 지역을 모르는 화면(걸러진 결과 0곳 등)은 구독할 대상이 없으므로 알림함의 구독 자리로 보낸다. */

type Phase = "idle" | "busy" | "done" | "need-login" | "error";
type Variant = "tile" | "primary" | "link";

/* 주 행동 모양 — 화면의 채움 파랑 하나. 글자 하나(상수)로 두어 버튼·로그인 링크·알림함 링크가 같은 모양을 쓴다 */
const FILLED = "btn-primary btn-md press w-full gap-1.5";
const TILE = "card tile px-5 py-3 t-body font-bold text-ink";
const TEXT_LINK = "inline-flex min-h-[40px] items-center gap-1.5 t-sub font-bold text-primary no-underline";
const MANAGE_LINK = "inline-flex min-h-[24px] items-center text-primary underline underline-offset-2";

export function RegionAlertButton({
  region,
  name,
  variant = "tile",
  className = "",
}: {
  /** 구독할 지역 — 화면이 가진 표기 그대로("서울 강남구"·"경기 안양시 만안구"). 없으면 구독 대신 알림함으로 */
  region: string | null | undefined;
  /** 버튼·토스트에 적을 짧은 이름 */
  name: string;
  variant?: Variant;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  /* 로그인 뒤 돌아올 주소 — 401 을 받은 순간의 경로+쿼리(?region= · ?complexId= 를 잃지 않게) */
  const [loginHref, setLoginHref] = useState("/login");
  const { showToast } = useToast();
  /* 버튼이 상태 글·링크로 바뀌면 키보드 초점이 사라진다 — 바뀐 자리의 링크로 옮긴다 */
  const followRef = useRef<HTMLAnchorElement | null>(null);
  const hadFocusRef = useRef(false);

  useEffect(() => {
    if (phase !== "done" && phase !== "need-login") return;
    if (!hadFocusRef.current) return;
    hadFocusRef.current = false;
    followRef.current?.focus();
  }, [phase]);

  const value = (region ?? "").trim();
  const label = name.trim() || value;

  async function subscribe() {
    if (phase === "busy" || phase === "done") return;
    setPhase("busy");
    try {
      const res = await fetch("/api/me/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "region", value }),
      });
      if (res.status === 401) {
        setLoginHref(`/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        setPhase("need-login");
        return;
      }
      if (res.ok) {
        setPhase("done");
        showToast(`${label} 알림을 설정했어요`, { label: "관리", href: "/notifications" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setPhase("error");
      showToast(body?.error || "알림을 설정하지 못했어요 — 다시 눌러 주세요");
    } catch {
      setPhase("error");
      showToast("연결이 끊겼어요 — 다시 눌러 주세요");
    }
  }

  /* 구독할 지역이 없다 — tile 은 그리지 않고, 나머지는 알림함의 구독 자리로 */
  if (!value) {
    if (variant === "tile") return null;
    return (
      <Link href="/notifications" className={`${variant === "primary" ? `${FILLED} no-underline` : TEXT_LINK} ${className}`}>
        <Icon name="bell" size={16} />
        알림함에서 지역 고르기
      </Link>
    );
  }

  if (phase === "done") {
    const manage = (
      <Link ref={followRef} href="/notifications" className={MANAGE_LINK}>
        관리
      </Link>
    );
    if (variant === "primary") {
      return (
        <span
          role="status"
          className={`flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary-soft px-3 t-body font-bold text-primary ${className}`}
        >
          <Icon name="check" size={16} />
          {label} 알림 설정됨 ·{manage}
        </span>
      );
    }
    if (variant === "link") {
      return (
        <span role="status" className={`inline-flex min-h-[40px] items-center gap-1.5 t-sub font-bold text-text-2 ${className}`}>
          <Icon name="check" size={16} />
          알림 설정됨 ·{manage}
        </span>
      );
    }
    return (
      <span role="status" className={`card inline-flex items-center gap-1.5 px-5 py-3 t-body font-bold text-text-2 ${className}`}>
        {label} 알림 설정됨 ·{manage}
      </span>
    );
  }

  if (phase === "need-login") {
    if (variant === "primary") {
      return (
        <Link ref={followRef} href={loginHref} className={`${FILLED} no-underline ${className}`}>
          <Icon name="bell" size={16} />
          로그인하고 알림 받기
        </Link>
      );
    }
    if (variant === "link") {
      return (
        <Link ref={followRef} href={loginHref} className={`${TEXT_LINK} ${className}`}>
          <Icon name="bell" size={16} />
          로그인하고 알림 받기 ›
        </Link>
      );
    }
    return (
      <Link ref={followRef} href={loginHref} className={`${TILE} ${className}`}>
        로그인하고 {label} 알림 받기
      </Link>
    );
  }

  const busy = phase === "busy";
  /* 주 행동은 대상 지역을 글자로 적는다 — 전세가율(결과 첫 줄)·온도(가장 뜨거운 곳)는 "이 지역"이 어디인지 화면만으로는 모호하다 */
  const idleText =
    variant === "tile" ? `${label} 청약·매물 알림 받기` : variant === "primary" ? `${label} 알림 받기` : "알림 받기";
  const text = busy ? "설정 중…" : phase === "error" ? "다시 시도" : idleText;

  return (
    <button
      type="button"
      onClick={(e) => {
        /* 키보드·스크린리더로 누른 경우에만 초점을 따라 옮긴다(마우스·터치는 초점이 의미 없다) */
        hadFocusRef.current = e.detail === 0;
        void subscribe();
      }}
      disabled={busy}
      aria-busy={busy || undefined}
      className={`${variant === "primary" ? FILLED : variant === "link" ? TEXT_LINK : `${TILE} text-left`} disabled:opacity-60 ${className}`}
    >
      {variant !== "tile" && <Icon name="bell" size={16} />}
      {text}
    </button>
  );
}
