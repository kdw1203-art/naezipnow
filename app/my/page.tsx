import Link from "next/link";
import { planLabel, isPaidPlan } from "@/lib/subscriptions/labels";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { SectionHead } from "@/app/components/ui/SectionHead";
import { safeAuth } from "@/lib/safe-auth";
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
import { listAlertSubscriptions, type AlertSubscription } from "@/lib/alerts/subscriptions";
import { getVerifiedOnboarding } from "@/app/api/me/onboarding/verify";
import {
  computeRegionLevels,
  regionLevelProgress,
  regionLevelSummary,
} from "@/lib/gamification/region-levels";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { getUsageSummary } from "@/lib/subscriptions/usage-summary";
import { loadBillingHistory } from "@/lib/subscriptions/billing-history";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";
import type { ProfilePlanTier } from "@/lib/subscriptions/labels";
import { AttendanceButton } from "./points/AttendanceButton";
import { ProfileEditSheet } from "./ProfileEditSheet";
import { GuestGate } from "@/app/components/GuestGate";
import { formatKstDate } from "@/lib/format/kst";

/* 마이 허브 — 프로필·포인트 지갑 요약·임장노트·관심·알림·구독 상태를 한 화면에.
   실데이터(서버)만 그린다: 프로필 · 포인트 잔액 · 내 임장노트 · 관심 임장노트 · 관심 지역 알림 ·
   구매한 리포트 · 전문가(중개사) 상태 · 구독/자동결제 · AI 사용량.
   포인트 내역 전체는 /my/points, 구독 관리는 /my/subscription, 설정은 /my/settings. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "마이 | 내집나우",
  description:
    "내 프로필·포인트 지갑·임장노트·저장한 노트·알림 구독·구독 상태를 한곳에서 확인하고 관리해요.",
};

/* ── 표시 헬퍼 ── */
function noteScore(n: InspectionNote): number {
  return Math.round(inspectionAverageScore(n.scores) * 20);
}
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}.${m[3]}` : iso || "-";
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

/* 서버(UTC)에서 돌아도 한국 날짜로 고정 */
const fmtExpiry = formatKstDate;

/** 북마크 target_id 를 임장노트로 해석 (노트가 아니면 null → 자연 필터). 최대 10개만 조회.
    조회 실패를 빈 배열로 누르면 "저장한 노트가 없어요"가 된다 — ok:false 로
    구분해 화면이 "지금 불러오지 못했다"를 말할 수 있게 한다. */
async function loadSavedNotes(
  email: string,
): Promise<{ ok: true; notes: InspectionNote[] } | { ok: false }> {
  try {
    const bms = await listBookmarks(email);
    const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 10);
    const resolved = await Promise.all(ids.map((id) => getNote(id).catch(() => null)));
    return {
      ok: true,
      notes: resolved.filter(
        (n): n is InspectionNote => n !== null && n.authorEmail !== email,
      ),
    };
  } catch (e) {
    logger.error("[my] 관심 임장노트 조회 실패", e);
    return { ok: false };
  }
}

/** 구매한 리포트 — 재열람 진입점. 상세 페이지가 "언제든 다시 열람"을 약속하므로
    찾아갈 목록이 있어야 그 말이 참이 된다. 제목은 리포트에서 되짚는다(최대 6건). */
async function loadMyPurchasedReports(
  email: string,
): Promise<{ ok: true; items: { id: string; title: string; amount: number; at: string }[] } | { ok: false }> {
  try {
    const purchases = (await listMyPurchases(email.trim().toLowerCase())).slice(0, 6);
    const items = await Promise.all(
      purchases.map(async (p) => {
        const r = await getReport(p.reportId).catch(() => null);
        return {
          id: p.reportId,
          title: r?.title ?? "삭제된 리포트",
          amount: p.amount,
          at: p.purchasedAt,
        };
      }),
    );
    return { ok: true, items };
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

/* 흰 카드 위 메뉴 행 — 기타 메뉴·전문가 메뉴가 같은 모양을 쓴다 */
function MenuRows({ items }: { items: { label: string; href: string; desc?: string }[] }) {
  return (
    <div className="card flex flex-col rounded-[14px] px-4 py-0.5">
      {items.map((m, i, arr) => (
        <Link
          key={m.href}
          href={m.href}
          className={`flex items-center justify-between gap-3 py-[13px] no-underline ${
            i < arr.length - 1 ? "border-b border-divider" : ""
          }`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="t-body font-semibold text-text-1">{m.label}</span>
            {m.desc && <span className="t-caption text-text-3">{m.desc}</span>}
          </span>
          <span className="shrink-0 text-text-3">›</span>
        </Link>
      ))}
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: "노트 쓰기", href: "/notes/new" },
  { label: "관심", href: "/my/watchlist" },
  { label: "AI 기록", href: "/my/analyses" },
  { label: "구독 관리", href: "/my/subscription" },
] as const;

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
  /* 포인트 잔액은 이 화면의 곁가지라 실패해도 /my 전체를 죽이지 않는다.
     다만 0 으로 눌러 버리면 "0 P" 라는 거짓 안내가 되므로, 실패 여부를 따로 들고 가서
     그 자리에만 다른 문구를 쓴다. 내역(원장 행)은 /my/points 가 그린다. */
  const ledgerLoaded = await getBalance(email).then(
    (balance) => ({ ok: true as const, balance }),
    (err: unknown) => {
      logger.error("[my] 포인트 조회 실패", err);
      return { ok: false as const, balance: 0 };
    },
  );

  const [profile, notes, savedNotesLoaded, purchasedLoaded, alerts, expert, onboarding, planExpiresAt] =
    await Promise.all([
      loadMeProfile(email, {
        name: session.user.name,
        plan: (session.user as { plan?: string }).plan,
        role: (session.user as { role?: string }).role,
      }),
      listNotes(email),
      loadSavedNotes(email),
      loadMyPurchasedReports(email),
      listAlertSubscriptions(email),
      getExpertStatus(email),
      // 온보딩 진행은 저장된 신고값이 아니라 실데이터 서버 판정 (완주 200P 도 여기서 멱등 지급)
      getVerifiedOnboarding(email),
      loadPlanExpiresAt(email),
    ]);

  const savedNotes = savedNotesLoaded.ok ? savedNotesLoaded.notes : [];

  /* 구독 카드에 결제 사실을 붙인다 — 자동결제면 다음 결제일·금액, 아니면 최근 결제 1건.
     자동결제 사용자에게는 만료일과 다음 결제일이 달라 헷갈리므로 둘을 구분해 말한다. */
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

  /* 무료 가치 카운터(AI 분석 월 사용량) — 결제 전 가치 증명·자연 유도.
     실패하면 null → 아래 사용량 카드가 통째로 빠진다. 없는 값을 "0회 사용"으로
     그리는 것보다는 낫지만, 조용히 사라지면 왜 안 보이는지 아무도 모르므로 기록은 남긴다. */
  const usage = await getUsageSummary(email, profile.plan as ProfilePlanTier).then(
    (u) => u,
    (err: unknown) => {
      logger.error("[my] 사용량 요약 조회 실패", err);
      return null;
    },
  );
  const aiUsage = usage?.items.find((i) => i.key === "ai_analysis") ?? null;

  /* 무료 플랜 한도 임박 항목 — 80% 이상 쓴 기능만. 거절당한 뒤가 아니라 거절당하기 전에,
     지금 쓰고 있는 기능의 다음 단계를 보여준다. 유료 플랜·관리자에게는 그리지 않는다. */
  const paid = isPaidPlan(profile.plan);
  const nearLimitItems = (usage?.items ?? []).filter(
    (i) => i.limit !== null && i.limit > 0 && i.used / i.limit >= 0.8,
  );

  /* 세션 role 기준 — auth.ts 의 jwt 콜백이 app_users.role 을 매 요청 동기화한다 */
  const isAdminViewer = (session.user as { role?: string }).role === "admin";

  const name = profile.name?.trim() || email.split("@")[0] || "회원";
  const initial = name.slice(0, 1).toUpperCase();
  const total = notes.length;
  const recentNotes = notes.slice(0, 4);

  /* 자동결제 상태 → 구독 카드 문구·행동 */
  const suspended = autopayLoaded?.status === "suspended" ? autopayLoaded : null;
  const cardRelinkHref = suspended
    ? `/subscription/billing?tier=${suspended.plan}&billing=${suspended.billing}&mode=card`
    : null;

  /* 전문가·중개 메뉴 — 인증된 전문가에게만. 매물·문의함은 중개사 인증(isBroker)이 조건. */
  const expertMenu = expert.isVerified
    ? [
        ...(expert.isBroker
          ? [
              { label: "내 매물", href: "/my/listings", desc: "등록·검수·노출 관리" },
              { label: "받은 문의", href: "/my/leads", desc: "매물 문의 답변" },
            ]
          : []),
        { label: "상담함", href: "/my/consultations", desc: "받은 상담 · 답변 · 후기" },
        { label: "전문가 프로필", href: "/my/expert-profile", desc: "소개 · 전문 분야 · 응답 시간" },
      ]
    : [];

  return (
    <PageShell title="마이">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {/* ── 프로필 히어로 (유리판) — 이름·플랜·관심 지역·포인트 잔액·출석 ── */}
        <section
          aria-label="내 프로필"
          className="rise-in lg-glass flex flex-col gap-4 rounded-lg p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  loading="lazy"
                  decoding="async"
                  src={profile.avatarUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft t-section text-primary"
                >
                  {initial}
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate t-section text-ink">{name}님</span>
                  <Link href="/my/subscription" className="lg-pill no-underline">
                    <Icon
                      name={isAdminViewer ? "shield" : paid ? "crown" : "user"}
                      size={14}
                    />
                    {isAdminViewer ? "관리자" : planLabel(profile.plan)}
                  </Link>
                </div>
                <ProfileEditSheet
                  variant="hero"
                  initial={{ name: profile.name, primaryRegion: profile.primaryRegion ?? null }}
                />
              </div>
            </div>
            <Link href="/my/settings" aria-label="설정" className="icon-btn shrink-0 no-underline">
              <Icon name="settings" size={18} />
            </Link>
          </div>

          <div className="lg-hairline" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col">
              <span className="t-caption font-bold text-text-3">사용 가능한 포인트</span>
              {/* 조회 실패에 "0 P" 를 찍으면 가진 사람에게 없다고 말하는 것이 된다 */}
              {ledgerLoaded.ok ? (
                <span className="flex items-baseline gap-1">
                  <span className="t-title t-num text-ink">
                    {ledgerLoaded.balance.toLocaleString("ko-KR")}
                  </span>
                  <span className="t-section text-primary">P</span>
                </span>
              ) : (
                <span className="flex flex-col">
                  <span className="t-body font-extrabold text-ink">잔액을 불러오지 못했어요</span>
                  <span className="t-caption text-text-3">
                    0 P 라는 뜻이 아니라 조회가 실패했어요
                  </span>
                </span>
              )}
              <Link
                href="/my/points"
                className="inline-block self-start py-[5px] t-sub font-semibold text-primary no-underline"
              >
                지갑 전체 보기 ›
              </Link>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[220px]">
              <AttendanceButton />
            </div>
          </div>
        </section>

        {/* ── 바로가기 알약 ── */}
        <nav aria-label="마이 바로가기" className="rise-in-1 lg-capsule max-w-full self-start overflow-x-auto">
          {QUICK_ACTIONS.map((q) => (
            <Link key={q.href} href={q.href}>
              {q.label}
            </Link>
          ))}
        </nav>

        {/* ── 한도 임박 안내 — 사실(사용량)만 말하고 다음 단계를 보여준다 ── */}
        {!isAdminViewer && !paid && nearLimitItems.length > 0 && (
          <section className="rise-in-1 card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-body font-extrabold text-ink">무료 한도가 가까워졌어요</span>
              <span className="t-sub text-text-3">
                {nearLimitItems.map((i) => `${i.label} ${i.used}/${i.limit}`).join(" · ")}{" "}
                — 플러스는 이 한도가 크게 늘어나요.
              </span>
            </div>
            <Link href="/subscription" className="btn-soft btn-md shrink-0 no-underline">
              플랜 비교 보기 ›
            </Link>
          </section>
        )}

        {/* ── 시작하기 온보딩 진행바 (완주 전까지만) ── */}
        {!onboarding.isComplete &&
          (() => {
            const steps = [
              { id: "explore", label: "관심 단지·권역 담기", href: "/map" },
              { id: "inspection", label: "첫 임장노트 작성", href: "/notes/new" },
              { id: "share", label: "임장노트 공개 공유", href: "/notes?mine=1" },
            ] as const;
            const done = onboarding.completedSteps.length;
            const pct = Math.round((done / onboarding.total) * 100);
            return (
              <section className="rise-in-1 card flex flex-col gap-3 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <h2 className="t-section text-ink">
                    시작하기 {done}/{onboarding.total}
                  </h2>
                  <span className="rounded-full bg-primary-soft chip-pad t-sub font-bold text-primary">
                    완주 시 200P
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-col">
                  {steps.map((s, i) => {
                    const isDone = onboarding.completedSteps.includes(s.id);
                    return (
                      <Link
                        key={s.id}
                        href={s.href}
                        className={`flex items-center gap-2.5 py-2 no-underline ${
                          i < steps.length - 1 ? "border-b border-divider" : ""
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full t-caption font-extrabold ${
                            isDone ? "bg-success-soft text-success" : "bg-line text-text-3"
                          }`}
                        >
                          {isDone ? "✓" : i + 1}
                        </span>
                        <span
                          className={`t-sub ${isDone ? "text-text-3 line-through" : "font-semibold text-text-1"}`}
                        >
                          {s.label}
                        </span>
                        {!isDone && <span className="ml-auto t-body font-bold text-primary">→</span>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })()}

        <div className="grid gap-4 md:grid-cols-2">
          {/* ── 내 임장노트 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="내 임장노트" href="/notes?mine=1" hrefLabel={`전체 ${total}`} />
            {recentNotes.length === 0 ? (
              <EmptyState
                icon="notebook-pen"
                title="아직 임장노트가 없어요"
                desc="현장 기록을 남기면 여기에 모여요"
                action={{ label: "첫 노트 쓰기", href: "/notes/new" }}
              />
            ) : (
              recentNotes.map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="card tile flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate t-body font-bold text-ink">
                      {n.aptName?.trim() || n.title}
                    </div>
                    <div className="t-sub text-text-3">
                      방문 {shortDate(n.visitDate)} · {n.isPublic ? "공개" : "비공개"}
                    </div>
                  </div>
                  <span className="shrink-0 pl-2 t-sub font-extrabold text-primary">
                    {noteScore(n)}점
                  </span>
                </Link>
              ))
            )}
          </section>

          {/* 관심 단지 대시보드 진입 — 페이지를 만들어 놓고 들어가는 문이 없으면 없는 기능이다. */}
          <Link
            href="/my/watchlist"
            className="card tile flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
          >
            <span>
              <span className="block t-body font-extrabold text-ink">관심 단지 대시보드</span>
              <span className="mt-0.5 block t-sub text-text-3">
                담아 둔 단지의 현재가 · 변동 · 새 임장노트를 한 표로
              </span>
            </span>
            <span className="t-body font-extrabold text-primary">›</span>
          </Link>

          {/* ── 관심 임장노트 (저장) ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="관심 임장노트" href="/notes" hrefLabel="공개 노트" />
            {!savedNotesLoaded.ok ? (
              /* 조회 실패 ≠ 저장한 노트 없음 — 실패는 실패로 말한다. */
              <div className="card flex flex-col items-center gap-2 rounded-[14px] px-4 py-8 text-center">
                <div className="t-body font-bold text-ink">관심 노트를 지금 불러오지 못했어요</div>
                <div className="t-sub text-text-3">
                  저장한 노트가 없는 게 아니라 조회가 실패했어요. 잠시 후 새로고침해 주세요.
                </div>
              </div>
            ) : savedNotes.length === 0 ? (
              <EmptyState
                icon="heart"
                title="저장한 노트가 없어요"
                desc="마음에 드는 공개 노트를 저장하면 여기에 모여요"
                action={{ label: "공개 노트 둘러보기", href: "/notes" }}
              />
            ) : (
              savedNotes.slice(0, 4).map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="card tile flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate t-body font-bold text-ink">
                      {n.aptName?.trim() || n.title}
                    </div>
                    <div className="t-sub text-text-3">
                      {n.authorLabel?.trim() || "임장러"} · {shortDate(n.visitDate)}
                    </div>
                  </div>
                  <span className="shrink-0 pl-2 t-sub font-extrabold text-primary">
                    {noteScore(n)}점
                  </span>
                </Link>
              ))
            )}
          </section>
        </div>

        {/* ── 지역 임장 레벨 (실제 노트 수 기반, 지어낸 수치 없음) ── */}
        {notes.length > 0 &&
          (() => {
            const levels = computeRegionLevels(notes);
            if (levels.length === 0) return null;
            const summary = regionLevelSummary(levels);
            return (
              <section className="flex flex-col gap-2.5">
                <SectionHead title="지역 임장 레벨" href="/notes?mine=1" hrefLabel="내 노트" />
                <div className="card flex flex-col gap-3 rounded-2xl p-5">
                  <div className="t-sub text-text-3">
                    지금까지 <b className="text-ink">{summary.regionCount}개 지역</b>을 임장했어요
                    {summary.topLabel ? (
                      <>
                        {" · 최고 "}
                        <b className="text-primary">{summary.topLabel}</b>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-3">
                    {levels.map((r) => (
                      <div key={r.region} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate t-body font-bold text-ink">{r.region}</span>
                            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 t-caption font-extrabold text-primary">
                              Lv.{r.level} · {r.label}
                            </span>
                          </span>
                          <span className="shrink-0 t-sub font-extrabold text-ink">{r.count}건</span>
                        </div>
                        {r.next ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                              <span
                                className="block h-full rounded-full bg-primary transition-all"
                                style={{ width: `${regionLevelProgress(r)}%` }}
                              />
                            </div>
                            <span className="shrink-0 t-caption text-text-3">
                              다음 {r.next.label}까지 {r.next.need}건
                            </span>
                          </div>
                        ) : (
                          <div className="t-caption font-bold text-primary">최고 레벨 달성</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="t-caption text-text-3">
                    같은 지역에 임장노트를 남길수록 레벨이 올라가요. 발로 뛴 만큼 그 동네 전문가가
                    됩니다.
                  </div>
                </div>
              </section>
            );
          })()}

        {/* ── 관심 지역 · 급매 알림 (구독 목록) ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="관심 지역 · 급매 알림" href="/notifications" hrefLabel="관리" />
          {alerts.length === 0 ? (
            <EmptyState
              icon="bell"
              title="구독한 알림이 없어요"
              desc="관심 지역·키워드를 구독하면 급매·시세 변동을 알려드려요"
              action={{ label: "알림 구독하기", href: "/notifications" }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {alerts.map((a: AlertSubscription) => (
                <span
                  key={a.id}
                  className="chip-tag inline-flex items-center gap-1 rounded-full px-3 py-1.5 t-sub font-semibold"
                >
                  <Icon name={a.type === "region" ? "pin" : "bell"} size={14} />
                  {a.value}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── 구매한 리포트 (재열람) — 이미 산 리포트는 "언제든 다시 열람" 약속대로 개별 링크를 둔다 ── */}
        {(!purchasedLoaded.ok || purchasedLoaded.items.length > 0) && (
          <section className="flex flex-col gap-2.5">
            <SectionHead title="구매한 리포트" />
            {!purchasedLoaded.ok ? (
              <div className="card flex flex-col items-center gap-1.5 rounded-[14px] px-4 py-6 text-center">
                <div className="t-body font-bold text-ink">구매 내역을 지금 불러오지 못했어요</div>
                <div className="t-sub text-text-3">내역이 없는 게 아니라 조회가 실패했습니다.</div>
              </div>
            ) : (
              purchasedLoaded.items.map((p) => (
                <Link
                  key={p.id}
                  href={`/town/library/${p.id}`}
                  className="card tile flex items-center justify-between rounded-[14px] px-4 py-3.5 no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate t-body font-bold text-ink">{p.title}</div>
                    <div className="t-sub text-text-3">
                      {shortDate(p.at)} 구매 · {p.amount.toLocaleString("ko-KR")}P
                    </div>
                  </div>
                  <span className="shrink-0 pl-2 t-sub font-extrabold text-primary">열람 ›</span>
                </Link>
              ))
            )}
          </section>
        )}

        {/* ── 포인트 — 적립 입구 3개 + 상점. 내역(원장)은 /my/points 한 곳에서만 그린다. ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="포인트" href="/my/points" hrefLabel="전체 내역" />
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Link
              href="/my/points?tab=missions"
              className="card tile flex flex-col gap-1 rounded-[14px] px-4 py-3.5 no-underline"
            >
              <span className="flex items-center gap-1.5 t-body font-extrabold text-ink">
                <Icon name="target" size={16} className="text-primary" />
                미션
              </span>
              <span className="t-sub text-text-3">시작 3미션 200P · 주간 미션 매주 리셋</span>
              <span className="mt-auto t-sub font-extrabold text-primary">진행도 보기 ›</span>
            </Link>
            <Link
              href="/my/analyses"
              className="card tile flex flex-col gap-1 rounded-[14px] px-4 py-3.5 no-underline"
            >
              <span className="flex items-center gap-1.5 t-body font-extrabold text-ink">
                <Icon name="sparkles" size={16} className="text-primary" />
                AI 분석 기록
              </span>
              <span className="t-sub text-text-3">실행한 분석 다시 보기 · 같은 도구 재실행</span>
              <span className="mt-auto t-sub font-extrabold text-primary">기록 보기 ›</span>
            </Link>
            <Link
              href="/my/points?tab=referral"
              className="card tile flex flex-col gap-1 rounded-[14px] px-4 py-3.5 no-underline"
            >
              <span className="flex items-center gap-1.5 t-body font-extrabold text-ink">
                <Icon name="gift" size={16} className="text-primary" />
                친구 초대
              </span>
              <span className="t-sub text-text-3">내 링크로 가입하면 친구와 나 모두 300P</span>
              <span className="mt-auto t-sub font-extrabold text-primary">초대 링크 ›</span>
            </Link>
          </div>
          <div className="card flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-body font-extrabold text-ink">포인트 상점</span>
              <span className="t-sub text-text-3">
                모은 포인트로 리포트·이용권을 교환해요.{" "}
                <Link
                  href="/my/points"
                  className="inline-block py-[5px] font-semibold text-primary no-underline"
                >
                  지갑 전체 보기 ›
                </Link>
              </span>
            </div>
            <Link href="/points/shop" className="btn-primary btn-md shrink-0 no-underline">
              포인트 상점 가기
            </Link>
          </div>
        </section>

        {/* ── 전문가 · 중개 — 인증된 전문가에게만. 전문가 인증 신청 입구는 보관(비노출)이라
            인증이 없는 회원에게는 섹션 자체를 그리지 않는다. ── */}
        {expert.isVerified && (
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="전문가 · 중개"
              sub={expert.isBroker ? "공인중개사 인증 완료" : "전문가 인증 완료"}
            />
            {expert.isBroker && (
              <div className="card flex flex-col gap-3 rounded-2xl p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="t-body font-extrabold text-ink">내 매물</div>
                  <div className="mt-0.5 t-sub text-text-3">
                    {expert.brokerNo ? `등록번호 ${expert.brokerNo} · ` : ""}매물을 등록하고 관리할 수 있어요
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href="/my/listings" className="btn-soft btn-md no-underline">
                    내 매물 관리
                  </Link>
                  <Link href="/listings/new" className="btn-primary btn-md no-underline">
                    매물 등록
                  </Link>
                </div>
              </div>
            )}
            <MenuRows items={expertMenu} />
          </section>
        )}

        {/* ── 구독 상태 — 관리(해지·카드·영수증)는 /my/subscription 한 곳 ── */}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="구독 상태" href="/my/subscription" hrefLabel="플랜 관리" />
          <div className="card flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="t-body font-extrabold text-ink">
                현재 플랜 · {planLabel(profile.plan)}
              </div>
              <div className="mt-0.5 t-sub text-text-3">
                {/* 만료일은 app_users.plan_expires_at (일회성 결제·포인트 교환 경로).
                    자동결제 구독은 next_charge_at 이 기준이라 만료일 대신 다음 결제일을 말한다. */}
                {profile.plan === "free"
                  ? "플러스로 업그레이드하면 AI 비교 리포트가 무제한이에요"
                  : autopayLoaded && autopayLoaded.status === "active"
                    ? `다음 결제 ${autopayLoaded.nextChargeAt ? fmtExpiry(autopayLoaded.nextChargeAt) : "—"} · ${autopayLoaded.amount.toLocaleString("ko-KR")}원/${autopayLoaded.billing === "annual" ? "년" : "월"} 자동결제`
                    : suspended
                      ? "등록된 카드로 결제가 되지 않아 자동결제가 멈춰 있어요 — 카드를 다시 등록해 주세요"
                      : planExpiresAt
                        ? `${fmtExpiry(planExpiresAt)}까지 이용할 수 있어요 · 이후 무료 플랜으로 전환돼요`
                        : "결제 내역과 해지·환불 접수 방법은 구독 관리에서 확인할 수 있어요"}
              </div>
              {lastPaymentLoaded && (
                <div className="mt-1 t-caption text-text-3">
                  최근 결제 · {lastPaymentLoaded.paidAt ? fmtExpiry(lastPaymentLoaded.paidAt) : "—"} ·{" "}
                  {lastPaymentLoaded.amount != null
                    ? `${lastPaymentLoaded.amount.toLocaleString("ko-KR")}원`
                    : "—"}{" "}
                  <Link
                    href="/my/subscription#history-title"
                    className="inline-block py-[5px] font-semibold text-primary no-underline"
                  >
                    결제 내역 ›
                  </Link>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {cardRelinkHref && (
                <Link href={cardRelinkHref} className="btn-primary btn-md no-underline">
                  카드 다시 등록
                </Link>
              )}
              <Link
                href={profile.plan === "free" ? "/subscription" : "/my/subscription"}
                className={`btn-md no-underline ${
                  profile.plan === "free" && !cardRelinkHref ? "btn-primary" : "btn-soft"
                }`}
              >
                {profile.plan === "free" ? "업그레이드" : "구독 관리"}
              </Link>
            </div>
          </div>

          {/* 무료 가치 카운터 — AI 분석 이번 달 사용량 */}
          {aiUsage &&
            (() => {
              const unlimited = aiUsage.limit == null;
              const limit = aiUsage.limit ?? 0;
              const remaining = unlimited ? null : Math.max(0, limit - aiUsage.used);
              const pct = unlimited
                ? 100
                : Math.min(100, Math.round((aiUsage.used / Math.max(1, limit)) * 100));
              const atLimit = !unlimited && remaining === 0;
              return (
                <div className="card flex flex-col gap-2 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="t-sub font-bold text-ink">
                      {aiUsage.lifetime ? "무료 AI 분석 (누적)" : "이번 달 AI 분석"}
                    </span>
                    <span className="t-sub tabular-nums text-text-2">
                      {unlimited ? (
                        <b className="text-primary">무제한</b>
                      ) : (
                        <>
                          <b className={atLimit ? "text-danger" : "text-ink"}>{aiUsage.used}</b>
                          <span className="text-text-3"> / {limit}회</span>
                        </>
                      )}
                    </span>
                  </div>
                  {!unlimited && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <span
                        className={`block h-full rounded-full ${atLimit ? "bg-danger" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="t-sub text-text-3">
                    {unlimited
                      ? "유료 플랜은 AI 비교 리포트가 무제한이에요."
                      : atLimit
                        ? aiUsage.lifetime
                          ? "무료 3회를 다 썼어요. 주간권(1,100원·7일)이나 플러스로 계속할 수 있어요."
                          : "이번 달 무료 한도를 다 썼어요. 플러스로 올리면 무제한으로 분석할 수 있어요."
                        : aiUsage.lifetime
                          ? `무료로 ${remaining}회 더 분석할 수 있어요 (월 초기화 없음).`
                          : `이번 달 무료로 ${remaining}회 더 분석할 수 있어요.`}
                  </div>
                </div>
              );
            })()}
        </section>

        {/* ── 기타 메뉴 —
            관리자 콘솔 링크는 role=admin 세션에만 그린다. 링크는 발견 경로일 뿐이고
            접근 제어는 서버(app/admin/layout.tsx 의 canAccessAdminConsole)가 한다. */}
        <section className="mb-2 flex flex-col gap-2.5">
          <SectionHead title="더 보기" />
          <MenuRows
            items={[
              { label: "설정", href: "/my/settings", desc: "프로필 · 알림 · 테마 · 데이터 내보내기" },
              { label: "내 문의 내역", href: "/my/support", desc: "고객센터에 남긴 문의와 답변" },
              { label: "고객센터", href: "/support" },
              { label: "크리에이터 대시보드", href: "/my/creator" },
              ...(isAdminViewer ? [{ label: "관리자 콘솔", href: "/admin" }] : []),
            ]}
          />
        </section>
      </div>
    </PageShell>
  );
}
