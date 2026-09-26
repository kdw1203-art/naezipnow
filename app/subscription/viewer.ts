"use client";

import { useEffect, useState } from "react";
import { getSessionLite } from "@/lib/client/session-lite";
import type { UsageItem } from "@/lib/subscriptions/usage-summary";

/* [1007] 요금제 화면의 "보는 사람" — 세션·현재 플랜·사용량을 **클라이언트에서** 판정한다.
 *
 * 왜: /subscription 은 하루 200회(24h 실측) 서버리스 함수를 띄웠는데 사람 방문은 한 자릿수였다.
 * `safeAuth()` + loadMeProfile + getUsageSummary 를 서버에서 읽어 force-dynamic 이었기 때문.
 * 세 카드·비교표·FAQ·JSON-LD 는 비회원 기준으로 ISR 에 굳히고(토스 심사가 보는 화면 그대로),
 * 로그인한 사람에게만 달라지는 조각(현재 플랜 배지·사용량·주간권 버튼 문구·카드 CTA 목적지·
 * 구독 패널)은 이 훅이 판정한 값으로 바뀐다.
 *
 * 플랜 정본: /api/me/usage 가 돌려주는 plan(DB app_users.plan — 세션 JWT 의 plan 은 결제 직후
 * 한 요청 동안 옛 값일 수 있다, /api/subscriptions 주석). 사용량과 한 응답이라 요청 1회.
 * 세션은 헤더가 이미 부른 공유 프라미스(요청 0 추가). 실패는 캐시하지 않는다. */

export type ViewerPlan = "free" | "pro" | "expert";

export type SubscriptionViewer = {
  /** probing = 아직 모름 · guest = 비로그인 · authed = 로그인 */
  status: "probing" | "guest" | "authed";
  email: string | null;
  /** 운영 계정 — 플랜 대신 "관리자" 로 표기 */
  isAdmin: boolean;
  /** 로그인일 때의 현재 플랜. 사용량 API 를 못 읽었으면 세션의 plan → 그것도 없으면 free */
  plan: ViewerPlan;
  /** 이번 달 사용량 — null 은 아직/못 읽음(0 으로 그리지 않는다) */
  usage: UsageItem[] | null;
};

type UsageResponse = { plan?: string; items?: UsageItem[] };

let usagePromise: Promise<UsageResponse | null> | null = null;
/** /api/me/usage — 페이지당 1회 수렴. 실패는 null(캐시 안 함) */
function fetchUsageShared(): Promise<UsageResponse | null> {
  if (usagePromise) return usagePromise;
  const p: Promise<UsageResponse | null> = fetch("/api/me/usage", { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json().catch(() => null)) as UsageResponse | null) : null))
    .catch(() => null)
    .then((v) => {
      if (v === null && usagePromise === p) usagePromise = null;
      return v;
    });
  usagePromise = p;
  return p;
}

function toPlan(v: unknown): ViewerPlan {
  return v === "pro" || v === "expert" ? v : "free";
}

const PROBING: SubscriptionViewer = { status: "probing", email: null, isAdmin: false, plan: "free", usage: null };

export function useSubscriptionViewer(): SubscriptionViewer {
  const [viewer, setViewer] = useState<SubscriptionViewer>(PROBING);
  useEffect(() => {
    let cancelled = false;
    void getSessionLite().then(async (s) => {
      if (cancelled) return;
      const email = s?.user?.email ?? null;
      if (!email) {
        setViewer({ status: "guest", email: null, isAdmin: false, plan: "free", usage: null });
        return;
      }
      const isAdmin = s?.user?.role === "admin";
      const sessionPlan = toPlan(s?.user?.plan);
      setViewer({ status: "authed", email, isAdmin, plan: sessionPlan, usage: null });
      const u = await fetchUsageShared();
      if (cancelled) return;
      setViewer({
        status: "authed",
        email,
        isAdmin,
        plan: u?.plan ? toPlan(u.plan) : sessionPlan,
        usage: Array.isArray(u?.items) ? u.items : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return viewer;
}
