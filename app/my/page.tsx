import Link from "next/link";
import { isPaidPlan } from "@/lib/subscriptions/labels";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { claimGuestPayments } from "@/lib/payments/guest-claim";
import { loadMeProfile } from "@/lib/me/profile";
import { getExpertStatus } from "@/lib/experts/is-verified";
import { getBalance } from "@/lib/points/ledger";
import {
  listNotes,
  getNote,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { listBookmarks } from "@/lib/bookmarks/store";
import { listMyPurchases } from "@/lib/report-purchases/store-db";
import { getReport } from "@/lib/reports/store-db";
import { listAlertSubscriptions } from "@/lib/alerts/subscriptions";
import { countWatchlist } from "@/lib/watchlist/store-db";
import { countRunsTotal } from "@/lib/ai/presets-store";
import { listRecentComplexes } from "@/lib/recent-complexes/store";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { getVerifiedOnboarding } from "@/app/api/me/onboarding/verify";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { getUsageSummary } from "@/lib/subscriptions/usage-summary";
import { loadBillingHistory } from "@/lib/subscriptions/billing-history";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";
import type { ProfilePlanTier } from "@/lib/subscriptions/labels";
import { GuestGate } from "@/app/components/GuestGate";
import { formatKstDate } from "@/lib/format/kst";
import {
  buildActivitySummary,
  loaded,
  nextOnboardingStep,
  recentComplexCards,
  sectionState,
  toLoaded,
  type Loaded,
} from "@/lib/me/my-hub";
import { MyHubView, type MyHubData, type MyHubNote } from "./MyHubView";

/* 마이 허브 — 프로필·활동 요약·임장노트·관심·구독·포인트를 한 화면에.
   [1006] 이 파일은 **로더**만이다: 실데이터(서버)를 읽어 MyHubData(평범한 JSON)로 만들고
   MyHubView 가 그린다. 로더마다 실패(ok:false)·0건·n건을 구분해 넘긴다 — 실패를 빈
   배열로 누르면 "없어요" 가 되고, 그건 거짓이다.
   포인트 내역 전체는 /my/points, 구독 관리는 /my/subscription, 설정은 /my/settings. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "마이 | 내집나우",
  description:
    "내 활동 요약·임장노트·관심 단지·저장한 노트·알림 구독·구독 상태·포인트를 한곳에서 확인하고 관리해요.",
};

/* ── 표시 헬퍼 ── */
function noteScore(n: InspectionNote): number {
  return Math.round(inspectionAverageScore(n.scores) * 20);
}
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}.${m[3]}` : iso || "-";
}
function toHubNote(n: InspectionNote, mine: boolean): MyHubNote {
  return {
    id: n.id,
    title: n.aptName?.trim() || n.title,
    meta: mine
      ? `방문 ${shortDate(n.visitDate)} · ${n.isPublic ? "공개" : "비공개"}`
      : `${n.authorLabel?.trim() || "임장러"} · ${shortDate(n.visitDate)}`,
    score: noteScore(n),
    region: n.region,
  };
}

/** 일회성 결제·포인트 교환 플랜의 만료 시각 — 구독 카드 표기용 (자동결제 구독은 null) */
async function loadPlanExpiresAt(email: string): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("app_users")
      .select("plan_expires_at")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    return data?.plan_expires_at ? String(data.plan_expires_at) : null;
  } catch {
    return null;
  }
}

/** 북마크 target_id 를 임장노트로 해석 (노트가 아니면 null → 자연 필터). 최대 10개만 조회.
    조회 실패를 빈 배열로 누르면 "저장한 노트가 없어요"가 된다 — ok:false 로 구분한다. */
async function loadSavedNotes(email: string): Promise<Loaded<InspectionNote[]>> {
  try {
    const bms = await listBookmarks(email);
    const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 10);
    const resolved = await Promise.all(ids.map((id) => getNote(id).catch(() => null)));
    return loaded(
      resolved.filter((n): n is InspectionNote => n !== null && n.authorEmail !== email),
    );
  } catch (e) {
    logger.error("[my] 관심 임장노트 조회 실패", e);
    return { ok: false };
  }
}

/** 구매한 리포트 — 재열람 진입점. 제목은 리포트에서 되짚는다(최대 6건). */
async function loadMyPurchasedReports(
  email: string,
): Promise<Loaded<{ id: string; title: string; amount: number; at: string }[]>> {
  try {
    const purchases = (await listMyPurchases(email.trim().toLowerCase())).slice(0, 6);
    const items = await Promise.all(
      purchases.map(async (p) => {
        const r = await getReport(p.reportId).catch(() => null);
        return {
          id: p.reportId,
          title: r?.title ?? "삭제된 리포트",
          amount: p.amount,
          at: shortDate(p.purchasedAt),
        };
      }),
    );
    return loaded(items);
  } catch (e) {
    logger.error("[my] 구매 리포트 조회 실패", e);
    return { ok: false };
  }
}

/* ── 비로그인 안내 — 공용 GuestGate(h1 포함) ── */
function GuestView() {
  const menu = [
    { label: "포인트 상점", href: "/points/shop" },
    { label: "구독 · 멤버십", href: "/subscription" },
    { label: "고객센터", href: "/support" },
  ];
  return (
    <GuestGate
      title="로그인하고 내 활동을 한곳에서 관리하세요"
      desc="임장노트 · 포인트 · 관심 지역 · 구독이 마이 화면에 모여요."
      pathname="/my"
    >
      <div className="rise-in-1 card flex flex-col rounded-[14px] px-4 py-0.5">
        {menu.map((m, i, arr) => (
          <Link
            key={m.label}
            href={m.href}
            className={`flex justify-between py-[13px] t-body font-semibold text-text-1 no-underline ${
              i < arr.length - 1 ? "border-b border-divider" : ""
            }`}
          >
            <span>{m.label}</span>
            <span className="text-text-3">›</span>
          </Link>
        ))}
      </div>
    </GuestGate>
  );
}

export default async function MyPage() {
  const session = await safeAuth();

  if (!session?.user?.email) {
    return (
      <PageShell breadcrumb="마이">
        <GuestView />
      </PageShell>
    );
  }

  const email = session.user.email;
  /* [1001] 비회원으로 결제한 주간권이 이 이메일에 대기 중이면 여기서 연결한다(선점 UPDATE, 중복 적용 없음) */
  await claimGuestPayments(email).catch(() => 0);

  const warn = (where: string) => (e: unknown) => logger.error(`[my] ${where} 조회 실패`, e);

  /* 로더는 전부 Loaded 로 — 하나가 실패해도 화면 전체가 죽지 않고, 그 칸만 "실패" 로 말한다 */
  const [
    profile,
    ledger,
    notesLoaded,
    savedNotesLoaded,
    purchasedLoaded,
    alertsLoaded,
    watchlistCount,
    analysesCount,
    recentLoaded,
    expert,
    onboarding,
    planExpiresAt,
  ] = await Promise.all([
    loadMeProfile(email, {
      name: session.user.name,
      plan: (session.user as { plan?: string }).plan,
      role: (session.user as { role?: string }).role,
    }),
    toLoaded(getBalance(email), warn("포인트")),
    toLoaded(listNotes(email), warn("내 노트")),
    loadSavedNotes(email),
    loadMyPurchasedReports(email),
    toLoaded(listAlertSubscriptions(email), warn("알림 구독")),
    toLoaded(countWatchlist(email), warn("관심 단지 개수")),
    toLoaded(countRunsTotal(email), warn("AI 분석 횟수")),
    toLoaded(listRecentComplexes(email, 8), warn("최근 본 단지")),
    getExpertStatus(email),
    // 온보딩 진행은 저장된 신고값이 아니라 실데이터 서버 판정 (완주 200P 도 여기서 멱등 지급)
    getVerifiedOnboarding(email),
    loadPlanExpiresAt(email),
  ]);

  /* 구독 카드에 결제 사실을 붙인다 — 자동결제면 다음 결제일·금액, 아니면 최근 결제 1건. */
  const [autopayLoaded, lastPaymentLoaded] = await Promise.all([
    profile.plan === "free"
      ? Promise.resolve(null)
      : getLiveSubscriptionByEmail(email.trim().toLowerCase()).then(
          (s) => (s ? toPublic(s) : null),
          () => null,
        ),
    profile.plan === "free"
      ? Promise.resolve(null)
      : loadBillingHistory(email, 5).then(
          (h) => (h.ok ? (h.payments.find((p) => p.status === "paid") ?? null) : null),
          () => null,
        ),
  ]);

  /* 무료 가치 카운터(AI 분석 월 사용량). 실패하면 null → 사용량 카드가 빠진다(기록은 남긴다). */
  const usage = await getUsageSummary(email, profile.plan as ProfilePlanTier).then(
    (u) => u,
    warn("사용량 요약"),
  );
  const aiUsage = usage?.items.find((i) => i.key === "ai_analysis") ?? null;

  const paid = isPaidPlan(profile.plan);
  const nearLimit = (usage?.items ?? [])
    .filter((i) => i.limit !== null && i.limit > 0 && i.used / i.limit >= 0.8)
    .map((i) => ({ label: i.label, used: i.used, limit: i.limit as number }));

  /* 세션 role 기준 — auth.ts 의 jwt 콜백이 app_users.role 을 매 요청 동기화한다 */
  const isAdminViewer = (session.user as { role?: string }).role === "admin";
  const name = profile.name?.trim() || email.split("@")[0] || "회원";

  /* 자동결제 상태 → 구독 카드 문구·행동 */
  const suspended = autopayLoaded?.status === "suspended" ? autopayLoaded : null;
  const relinkHref = suspended
    ? `/subscription/billing?tier=${suspended.plan}&billing=${suspended.billing}&mode=card`
    : null;
  /* 만료일은 app_users.plan_expires_at (일회성 결제·포인트 교환 경로).
     자동결제 구독은 next_charge_at 이 기준이라 만료일 대신 다음 결제일을 말한다. */
  const subscriptionLine =
    profile.plan === "free"
      ? "플러스로 업그레이드하면 AI 비교 리포트가 무제한이에요"
      : autopayLoaded && autopayLoaded.status === "active"
        ? `다음 결제 ${autopayLoaded.nextChargeAt ? formatKstDate(autopayLoaded.nextChargeAt) : "—"} · ${autopayLoaded.amount.toLocaleString("ko-KR")}원/${autopayLoaded.billing === "annual" ? "년" : "월"} 자동결제`
        : suspended
          ? "등록된 카드로 결제가 되지 않아 자동결제가 멈춰 있어요 — 카드를 다시 등록해 주세요"
          : planExpiresAt
            ? `${formatKstDate(planExpiresAt)}까지 이용할 수 있어요 · 이후 무료 플랜으로 전환돼요`
            : "결제 내역과 해지·환불 접수 방법은 구독 관리에서 확인할 수 있어요";

  const notes = notesLoaded.ok ? notesLoaded.value : [];
  const savedCount: Loaded<number> = savedNotesLoaded.ok
    ? loaded(savedNotesLoaded.value.length)
    : { ok: false };

  const data: MyHubData = {
    name,
    avatarUrl: profile.avatarUrl ?? null,
    plan: profile.plan,
    isAdminViewer,
    paid,
    profileInitial: { name: profile.name, primaryRegion: profile.primaryRegion ?? null },
    summary: buildActivitySummary({
      notes: notesLoaded.ok ? loaded(notes.length) : { ok: false },
      watchlist: watchlistCount,
      savedNotes: savedCount,
      analyses: analysesCount,
      points: ledger,
    }),
    ledger,
    nextStep: onboarding.isComplete ? null : nextOnboardingStep(onboarding.completedSteps),
    nearLimit,
    recent: sectionState(
      recentLoaded.ok ? loaded(recentComplexCards(recentLoaded.value, complexHrefFromId)) : { ok: false },
    ),
    notes: sectionState(
      notesLoaded.ok ? loaded(notes.map((n) => toHubNote(n, true))) : { ok: false },
      4,
    ),
    notesTotal: notesLoaded.ok ? notes.length : null,
    noteRegions: notes.map((n) => n.region),
    watchlistCount,
    savedNotes: sectionState(
      savedNotesLoaded.ok ? loaded(savedNotesLoaded.value.map((n) => toHubNote(n, false))) : { ok: false },
      3,
    ),
    alerts: sectionState(
      alertsLoaded.ok
        ? loaded(alertsLoaded.value.map((a) => ({ id: a.id, type: a.type, value: a.value })))
        : { ok: false },
    ),
    /* 정상 조회 + 0건이면 섹션 자체를 그리지 않는다(구매는 드문 일이라 빈 줄이 소음) */
    purchased:
      purchasedLoaded.ok && purchasedLoaded.value.length === 0 ? null : sectionState(purchasedLoaded),
    expert: { isVerified: expert.isVerified, isBroker: expert.isBroker, brokerNo: expert.brokerNo ?? null },
    subscription: {
      line: subscriptionLine,
      lastPayment: lastPaymentLoaded
        ? {
            at: lastPaymentLoaded.paidAt ? formatKstDate(lastPaymentLoaded.paidAt) : "—",
            amount:
              lastPaymentLoaded.amount != null
                ? `${lastPaymentLoaded.amount.toLocaleString("ko-KR")}원`
                : "—",
          }
        : null,
      relinkHref,
    },
    aiUsage: aiUsage ? { lifetime: Boolean(aiUsage.lifetime), used: aiUsage.used, limit: aiUsage.limit } : null,
  };

  return (
    <PageShell title="마이">
      <MyHubView data={data} />
    </PageShell>
  );
}
