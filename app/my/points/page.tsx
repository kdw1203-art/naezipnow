/* [1012] 규칙 1·2 — 본문 카드 반경 12px→8px(rounded-3xl→rounded-lg 1곳). */
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 6곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { safeAuth } from "@/lib/safe-auth";
import { logger } from "@/lib/log";
import { getBalance, getHistory, type LedgerRow } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem, POINTS_GRATUITOUS_NOTICE } from "@/lib/points/catalog";
import { getServiceSupabase } from "@/lib/supabase/service";
import { AttendanceButton } from "./AttendanceButton";
import { GuestGate } from "@/app/components/GuestGate";
import { formatKstDate, isSameKstMonth } from "@/lib/format/kst";
import { MissionsSection } from "./MissionsSection";
import { ReferralSection } from "./ReferralSection";

/* [994] /my 17 → 7 — 포인트 지갑 · 미션(옛 /my/missions) · 친구 초대(옛 /my/referral)를
   한 화면의 탭으로. 옛 URL 은 redirect-map 이 ?tab= 으로 보낸다. */
type PointsTab = "wallet" | "missions" | "referral";
const POINT_TABS: { key: PointsTab; label: string }[] = [
  { key: "wallet", label: "지갑" },
  { key: "missions", label: "미션" },
  { key: "referral", label: "친구 초대" },
];
/* [v4 · 부품] 채움 파랑 알약 탭 → 밑줄 탭(선택 칸 아래 2px 남색 선). 제목(h1 "포인트")도 이 760px 줄 안에서 그린다 —
   PageShell 제목·브레드크럼("마이 › 포인트 › 지갑", 글자뿐)은 1240 컨테이너 왼쪽 끝이라 가운데 줄과 어긋났다 */
function PointsTabs({ active }: { active: PointsTab }) {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-[760px] flex-col gap-2">
      <h1 className="t-title text-ink">포인트</h1>
      <nav aria-label="포인트 메뉴" className="flex gap-5 border-b border-line">
        {POINT_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "wallet" ? "/my/points" : `/my/points?tab=${t.key}`}
            aria-current={t.key === active ? "page" : undefined}
            className={`inline-flex min-h-10 items-center border-b-2 pb-2 pt-2.5 t-body font-bold no-underline ${
              t.key === active ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [970 · A-31|C-25|C-26] 접미 없던 제목에 `| 내집나우` + 비어 있던 description.
   [994] ?tab= 을 읽는 개인 화면 — robots.txt 의 /my disallow 에 더해 noindex 를 명시(N7). */
export const metadata = {
  title: "포인트 | 내집나우",
  description:
    "사용 가능한 포인트와 이번 달 적립·사용, 적립·소비 내역, 미션, 친구 초대를 한 화면에서 확인해요. 포인트는 현금 전환이 안 되는 무상 리워드예요.",
  robots: { index: false, follow: false },
};

/* ── 표시 헬퍼 ── */

function fmtP(n: number): string {
  return `${Math.abs(n).toLocaleString("ko-KR")}P`;
}

/* [970 · C-01] 서버(UTC) getDate() → 한국 날짜로 고정(자정 전후 적립이 전날로 찍히던 것) */
const fmtDate = formatKstDate;

/** 원장 reason → 한글 라벨 (적립: EARN_RULES · 소비: SPEND_ITEMS · 만료: expire)
    판매 중단 상품(spend:ai_analysis · spend:complex_report)의 과거 이력은
    "포인트 사용" 폴백으로 계속 표시된다. */
function reasonLabel(reason: string): string {
  if (reason === "expire") return "포인트 기한 만료";
  if (reason.startsWith("spend:")) {
    const item = getSpendItem(reason.slice("spend:".length));
    return item ? item.label : "포인트 사용";
  }
  return EARN_RULES[reason]?.label ?? "포인트 적립";
}

/* [970 · C-01] "이번 달" 도 한국 달력 기준으로 */
function sameMonth(iso: string, now: Date): boolean {
  return isSameKstMonth(iso, now);
}

/** 포인트로 산 닉네임 오로라가 지금 켜져 있는지 — 지갑에서 상태를 보여준다.
    교환 직후 "적용됐나?"를 확인할 곳이 없으면 그대로 문의가 된다. 조회 실패는
    표시 생략으로 처리해 지갑 본연의 잔액·내역 렌더를 막지 않는다. */
async function readNicknameEffectUntil(
  email: string,
): Promise<{ kind: "aurora" | "sunset"; until: string } | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const { data } = await sb
      .from("profiles")
      .select("settings")
      .eq("email", email)
      .maybeSingle();
    const eff = (
      data?.settings as { nickname_effect?: { kind?: string; until?: string } } | null
    )?.nickname_effect;
    if (
      (eff?.kind === "aurora" || eff?.kind === "sunset") &&
      typeof eff.until === "string" &&
      Date.parse(eff.until) > Date.now()
    ) {
      return { kind: eff.kind, until: eff.until };
    }
    return null;
  } catch {
    return null;
  }
}

/* ── 적립 방법 안내 (로그인 여부 무관) ── [v4 · 규칙 5·6] 카드 + 설명 칩("최초 1회"·"하루 N회") → 섹션 + 1px 선 행
   (보조 줄에 조건 사실, 오른쪽에 포인트) */
function EarnGuide() {
  return (
    <section aria-labelledby="earn-h" className="rise-in-3 flex flex-col">
      <h2 id="earn-h" className="t-section text-ink">
        포인트 적립 방법
      </h2>
      {/* [970 · A-11] "1P≈1원" 은 2026-08-23 토스 회신(원화 환산 표기 제거)과 어긋나는
          환금성 암시 문구다 — 무상 리워드 규칙(현금 전환·구매 불가, 서비스 내 혜택 전용)만 적는다. */}
      <p className="t-caption text-text-3">활동하면 자동 적립 · 현금 전환·구매 불가 무상 리워드 · 서비스 내 혜택 전용</p>
      <ul data-tone="mint" className="mt-1 divide-y divide-line">
        {Object.values(EARN_RULES).map((rule) => {
          const cond = [rule.once ? "최초 1회" : null, rule.dailyCap ? `하루 ${rule.dailyCap}회` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={rule.key} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">{rule.label}</span>
                {cond && <span className="mt-0.5 block t-sub text-text-3">{cond}</span>}
              </span>
              <span className="shrink-0 t-body t-num text-primary">+{rule.points.toLocaleString("ko-KR")}P</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── 비로그인 안내 — [970 · C-40] 공용 GuestGate(h1 포함) ──
   [v4 · 규칙 3] 설명 문장 → 적립 숫자 사실 한 줄 · 연파랑 타일 → 1px 선 행 */
function GuestView() {
  return (
    <GuestGate
      /* [1012] 규칙 5·6·7 — 대상 명시 + 실제 적립 규칙의 숫자(EARN_RULES) */
      title="로그인하고 내 포인트 잔액 보기"
      desc={`매물 등록 승인 ${EARN_RULES.listing_approved.points}P · 임장노트 공개 ${EARN_RULES.note_public.points}P · 출석 ${EARN_RULES.attendance.points}P · 상점에서 매물 상단 노출·닉네임 꾸미기로 교환`}
      pathname="/my/points"
    >
      <ul data-tone="mint" className="rise-in-1 divide-y divide-line border-y border-line">
        <li>
          <Link href="/points/shop" className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
            <span className="min-w-0">
              <span className="block t-body font-bold text-ink">포인트 상점 품목 보기</span>
              <span className="mt-0.5 block truncate t-sub text-text-3">로그인 전에도 교환 품목·가격 공개</span>
            </span>
            <span aria-hidden="true" className="shrink-0 t-body text-text-3">
              ›
            </span>
          </Link>
        </li>
      </ul>

      <EarnGuide />
    </GuestGate>
  );
}

/* ── 로그인 — 실데이터 뷰 ──
   [v4 · 한 화면 한 가지] 네이비 잔액 패널(적립·사용 두 칸 · 채움 파랑 둘) → 주인공 숫자(t-display) + 사실 한 줄
   (이번 달 적립·사용) + 출석(채움 1개) → 1px 선 행(상점 · 적용 중 효과) → 내역 행 → 적립 방법 행. */
function WalletView({
  balance,
  history,
  nickEffect,
}: {
  balance: number;
  history: LedgerRow[];
  /** 활성 닉네임 효과(오로라·노을)와 만료 시각 — 없으면 미적용 */
  nickEffect: { kind: "aurora" | "sunset"; until: string } | null;
}) {
  const now = new Date();
  const monthEarned = history
    .filter((r) => r.delta > 0 && sameMonth(r.createdAt, now))
    .reduce((s, r) => s + r.delta, 0);
  const monthSpent = history
    .filter((r) => r.delta < 0 && sameMonth(r.createdAt, now))
    .reduce((s, r) => s + Math.abs(r.delta), 0);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      {/* 주인공 — 사용 가능한 포인트 숫자 하나 */}
      <section aria-label="사용 가능한 포인트" className="rise-in flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="t-sub text-text-3">사용 가능한 포인트</p>
          <p className="t-display t-num text-ink">
            {balance.toLocaleString("ko-KR")}
            <span className="ml-0.5 t-section text-primary">P</span>
          </p>
          <p className="t-sub text-text-3">
            이번 달 적립 <b className="t-num text-primary">+{monthEarned.toLocaleString("ko-KR")}P</b> · 사용{" "}
            <b className="t-num text-text-1">−{monthSpent.toLocaleString("ko-KR")}P</b>
          </p>
        </div>
        <AttendanceButton />
        <ul data-tone="mint" className="divide-y divide-line border-y border-line">
          <li>
            <Link href="/points/shop" className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
              <span className="min-w-0">
                <span className="block t-body font-bold text-ink">포인트 상점</span>
                <span className="mt-0.5 block truncate t-sub text-text-3">매물 상단 노출·닉네임 꾸미기 교환</span>
              </span>
              <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                ›
              </span>
            </Link>
          </li>
          {/* 적용 중인 상점 효과 — 산 것이 지금 켜져 있음을 지갑에서 확인시켜 준다 */}
          {nickEffect && (
            <li className="flex min-h-14 items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block t-body font-bold text-ink">
                  <span className={nickEffect.kind === "sunset" ? "nick-sunset" : "nick-aurora"}>
                    닉네임 {nickEffect.kind === "sunset" ? "노을" : "오로라"}
                  </span>{" "}
                  적용 중
                </span>
                <span className="mt-0.5 block truncate t-sub text-text-3">
                  {fmtDate(nickEffect.until)}까지 · 동네이야기 글 상세 작성자 이름
                </span>
              </span>
            </li>
          )}
        </ul>
        {/* 무상성 고지 — 상점·약관과 같은 단일 출처 문구(POINTS_GRATUITOUS_NOTICE). [v4] 회색 상자 → 캡션 */}
        <p className="t-caption text-text-3">{POINTS_GRATUITOUS_NOTICE}</p>
      </section>

      {/* 적립·소비 내역 — [v4 · 규칙 5·8] 카드 → 섹션 + 1px 선 행 · 빈 상태 한 줄 */}
      <section aria-labelledby="history-h" className="rise-in-2 flex flex-col">
        <h2 id="history-h" className="t-section text-ink">
          포인트 내역 {history.length > 0 && <span className="t-num text-text-3">{history.length}</span>}
        </h2>
        {history.length === 0 ? (
          <p className="border-y border-line py-3 t-sub text-text-3">포인트 내역 없음 · 활동하면 적립·사용 기록이 여기로</p>
        ) : (
          <ul data-tone="blue" className="divide-y divide-line">
            {history.map((r, i) => {
              const earn = r.delta > 0;
              return (
                <li key={`${r.createdAt}-${i}`} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate t-body font-bold text-ink">{reasonLabel(r.reason)}</span>
                    <span className="mt-0.5 block t-sub text-text-3">
                      {fmtDate(r.createdAt)}
                      {earn && r.expiresAt ? ` · ${fmtDate(r.expiresAt)} 만료 예정` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 pl-3 text-right">
                    {/* [1009 · T] 포인트 적립·사용 — 줄마다 자릿수가 세로로 맞게 tabular-nums(t-num) */}
                    <span className={`block t-body t-num ${earn ? "text-primary" : "text-text-3"}`}>
                      {earn ? "+" : "−"}
                      {fmtP(r.delta)}
                    </span>
                    <span className="block t-sub tabular-nums text-text-3">잔액 {r.balance.toLocaleString("ko-KR")}P</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EarnGuide />
    </div>
  );
}

export default async function PointsWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await safeAuth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <PageShell>
        <GuestView />
      </PageShell>
    );
  }

  const { tab: rawTab } = await searchParams;
  const tab: PointsTab = rawTab === "missions" || rawTab === "referral" ? rawTab : "wallet";
  if (tab !== "wallet") {
    return (
      <PageShell>
        <PointsTabs active={tab} />
        <div className="mx-auto w-full max-w-[760px]">
          {tab === "missions" ? <MissionsSection email={email} /> : <ReferralSection email={email} />}
        </div>
      </PageShell>
    );
  }

  /* 2026-07-26: 내역 조회가 실패하면 예전에는 빈 배열이 내려와서 "아직 포인트
     내역이 없어요" 라고 썼다 — 적립한 적 없는 사람과 원장을 못 읽은 사람이
     구분되지 않았다. 실패는 실패라고 쓴다. */
  const [loaded, nickEffect] = await Promise.all([
    Promise.all([getBalance(email), getHistory(email, 50)]).then(
      ([balance, history]) => ({ ok: true as const, balance, history }),
      (err: unknown) => {
        /* [970 · C-09] 원인 원문은 로그로만 — 화면엔 고정 문구 */
        logger.error("[my/points] 포인트 조회 실패", err);
        return { ok: false as const };
      },
    ),
    readNicknameEffectUntil(email),
  ]);

  if (!loaded.ok) {
    return (
      /* [970 · A-33] 로그인 뷰는 h1 이 없었다(게스트 뷰는 GuestGate 가 h1) — PageShell 제목으로 */
      <PageShell>
        <div className="mx-auto w-full max-w-[760px]">
          <h1 className="mb-3 t-title text-ink">포인트 지갑</h1>
          <ErrorState
            title="포인트 지갑을 지금 불러올 수 없어요"
            /* [970 · C-20] 해요체 통일 */
            desc="포인트 내역이 없는 게 아니라 조회가 실패했어요. 잠시 후 새로고침해 주세요."
            action={{ label: "마이로 이동", href: "/my" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    /* [970 · A-33] 로그인 뷰 h1 — 지갑 히어로엔 제목 요소가 없다 */
    <PageShell>
      <PointsTabs active="wallet" />
      <WalletView
        balance={loaded.balance}
        history={loaded.history}
        nickEffect={nickEffect}
      />
    </PageShell>
  );
}
