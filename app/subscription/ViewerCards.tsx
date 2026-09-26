"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { planLabel } from "@/lib/subscriptions/labels";
import { parseSubscriptionParams, weeklyCheckoutHref } from "@/lib/subscriptions/page-params";
import { PreOrderCta } from "./PreOrderCta";
import { useSubscriptionViewer } from "./viewer";

/* [1007] 요금제 화면에서 **로그인한 사람에게만 달라지던** 조각들 — 서버(page.tsx)가 세션으로
   갈라 그리던 것을 클라이언트로 옮겼다(페이지는 비회원 기준 ISR). 비회원·프로브 중에는
   서버 HTML 과 같은 모양(= 게스트 화면)을 그려 하이드레이션이 어긋나지 않는다.
   문구·조건은 예전 page.tsx 그대로다. */

/** 히어로 아래 "현재 플랜 · …" 배지 — 로그인일 때만 */
export function CurrentPlanBadge() {
  const v = useSubscriptionViewer();
  if (v.status !== "authed") return null;
  return (
    <span className="mt-1 rounded-full bg-primary-soft px-3 py-1 t-sub font-bold text-primary">
      현재 플랜 · {v.isAdmin ? "관리자 (모든 기능 무제한)" : planLabel(v.plan)}
    </span>
  );
}

/** 이번 달 사용량 — 로그인한 사람에게만, 값이 있을 때만.
    "월 30회"가 카드에 적혀 있어도 내가 12회를 썼는지 29회를 썼는지 모르면 그 숫자는 판단에 쓸 수 없다. */
export function UsageCard() {
  const v = useSubscriptionViewer();
  if (v.status !== "authed" || !v.usage || v.usage.length === 0) return null;
  const usage = v.usage;
  return (
    /* [1005] 폭을 아래 결제 블록·카드 3장과 같은 1080px 로 */
    <section className="mx-auto mt-5 w-full max-w-[1080px]" data-reveal="">
      <div className="card flex flex-col gap-3 rounded-[14px] p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="t-section text-ink">이번 달 내 사용량</span>
          <span className="t-caption ml-auto text-text-3">
            {planLabel(v.plan)} 기준 ·{" "}
            {usage.some((u) => u.lifetime) ? "AI 분석은 누적, 나머지는 매월 1일 초기화" : "매월 1일 초기화"}
          </span>
        </div>
        <div className="kpi-row">
          {usage.map((u) => {
            const cap = u.limit;
            const unlimited = cap === null;
            const pct = cap === null || cap <= 0 ? 0 : Math.min(100, Math.round((u.used / cap) * 100));
            const tight = cap !== null && cap > 0 && u.used / cap >= 0.8;
            return (
              <div key={u.key} className="kpi">
                <span className="kpi-k">{u.lifetime ? `${u.label} (누적)` : u.label}</span>
                <span className="kpi-v">
                  {u.used.toLocaleString("ko-KR")}
                  <span className="t-sub font-bold text-text-3">
                    {cap === null ? " / 무제한" : ` / ${cap.toLocaleString("ko-KR")}`}
                  </span>
                </span>
                {!unlimited && (
                  <span className={`rank-track mt-1 ${tight ? "text-warning" : "text-primary"}`}>
                    <span className="rank-fill" style={{ width: `${Math.max(3, pct)}%` }} />
                  </span>
                )}
                {tight && <span className="kpi-d text-warning">한도의 {pct}% 사용 — 곧 막혀요</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** [970 · A-07] ?billing=weekly 로 돌아온 사람에게 주간권 카드에 강조 링 — URL 은 마운트 뒤 읽는다 */
export function WeeklyPassFrame({ className, children }: { className: string; children: ReactNode }) {
  const [ring, setRing] = useState(false);
  useEffect(() => {
    try {
      setRing(parseSubscriptionParams(window.location.search).highlightPlan === "weekly");
    } catch {
      /* URL 파싱 실패 — 강조 없음 */
    }
  }, []);
  return <div className={`${className} ${ring ? "ring-2 ring-primary" : ""}`}>{children}</div>;
}

/** [966] 주간권 버튼 — 상태별로 정직하게: 결제 미개통이면 사전 등록, 이미 프로(expert)면 사지 못하게
    (사면 applyPlan 이 "다른 플랜" 으로 보고 7일짜리 플러스로 **강등**된다). */
export function WeeklyPassCta({
  paymentsReady,
  checkoutBase,
  weeklyTotalKrw,
  weeklyDays,
}: {
  /** 서버 판정(항목 33): 사업자 고지 + 토스 키 — 배포 단위로 굳는 값이라 ISR 에 실려도 된다 */
  paymentsReady: boolean;
  /** REVIEW_CHECKOUT_PATH — 심사 메모에 적어 낸 URL(단일 출처) */
  checkoutBase: string;
  weeklyTotalKrw: number;
  weeklyDays: number;
}) {
  const v = useSubscriptionViewer();
  /* 페이월이 붙여 보낸 ?returnTo= — 마운트 뒤 한 번 읽어 링크에 이어 붙인다(safeInternalPath) */
  const [href, setHref] = useState(checkoutBase);
  useEffect(() => {
    try {
      setHref(weeklyCheckoutHref(checkoutBase, parseSubscriptionParams(window.location.search).returnTo));
    } catch {
      /* URL 파싱 실패 — 기본 링크 */
    }
  }, [checkoutBase]);
  const currentPlan = v.status === "authed" ? v.plan : "free";
  if (currentPlan === "expert") {
    return (
      <p className="rounded-[14px] bg-bg p-[13px] text-center t-sub font-bold text-text-2">
        프로 이용 중이라 주간권이 필요 없어요 — 플러스 기능은 이미 전부 열려 있습니다.
      </p>
    );
  }
  if (paymentsReady) {
    /* [1003] 주간권 버튼은 링크 직행이다(2단계 확인 제거 — 토스 심사 세션이 멈춘 자리). */
    return (
      <div className="flex flex-col gap-1.5">
        <Link
          href={href}
          className="press block w-full rounded-[14px] bg-brand-navy p-[13px] text-center text-[13px] font-bold text-on-dark no-underline"
        >
          {`카드로 ${weeklyTotalKrw.toLocaleString("ko-KR")}원 결제하기 (${weeklyDays}일 이용권)`}
        </Link>
        <p className="text-center t-caption text-text-3">
          {currentPlan === "pro"
            ? "이용 중인 플러스 만료일 뒤로 7일이 이어 붙어요"
            : "누르면 신용·체크카드 결제창이 열려요 · 결제 버튼을 누르기 전까지 청구되지 않습니다"}
        </p>
      </div>
    );
  }
  /* [970 · A-38] 게스트는 로그인 유도 — 세션 없는 등록은 알림을 보낼 수 없다 */
  return (
    <PreOrderCta
      tier="pro"
      billing="weekly"
      className="w-full bg-brand-navy text-on-dark"
      guest={v.status !== "authed"}
    />
  );
}
