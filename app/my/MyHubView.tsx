/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 10곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { planLabel, type ProfilePlanTier } from "@/lib/subscriptions/labels";
import { WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";
import { computeRegionLevels, regionLevelSummary } from "@/lib/gamification/region-levels";
import type {
  ActivitySummaryItem,
  Loaded,
  NextStep,
  RecentComplexCard,
  SectionState,
} from "@/lib/me/my-hub";
import { AttendanceButton } from "./points/AttendanceButton";
import { ProfileEditSheet } from "./ProfileEditSheet";

/**
 * [1006] 마이 허브 화면 — 데이터는 전부 props(평범한 JSON). DB·세션을 모른다.
 *
 * page.tsx(로더)와 화면을 가른 이유: 로컬엔 DB 가 없어 빈 상태만 보인다. "있음" 상태를
 * 눈으로 확인하려면 목 데이터로 이 컴포넌트만 렌더할 수 있어야 한다(scratchpad 의
 * 임시 스크립트가 react-dom/server 로 그린다). 앱 안에 목 경로를 두지 않는다.
 *
 * [v4 · 한 화면 한 가지] 구성(위→아래, 데스크톱도 가운데 한 줄 760px — 2열·사이드바 없음):
 *   [머리]   이름(t-title) + 사실 한 줄(플랜 · 관심 지역) · 오른쪽 "프로필 편집" 글자 버튼 · 설정(⚙)
 *   [주인공] 내 활동 — 1px 선 목록 행, 오른쪽에 개수(다음 할 일 · 한도 임박 · 노트 · 관심 단지 · 저장 노트 ·
 *            AI 분석 · 알림 구독 · 포인트 · 출석 체크 · 중개 매물)
 *   [목록]   최근 본 단지 → 내 임장노트(+ 지역 임장 레벨 접힘) → 저장한 노트 → 구독·포인트 → 설정·문의
 * 지운 것: 유리판 프로필 카드·이니셜 원·플랜 알약·5칸 숫자 타일·진행 막대·설명 배지("완주 시 200P" 칩 → 사실 줄)·
 *   빈 상태 그림(EmptyState — "첫 임장노트 작성"은 다음 할 일 행이 이미 말한다) · 카드 속 카드 · 가로 레일 타일 ·
 *   "~해요" 설명 문장. 채움 파랑은 화면에 1개(카드 재등록 > 다음 할 일).
 * 조회 실패는 빈 상태와 절대 섞지 않는다(SectionState.kind === "error") — 개수 자리 "—" + 끝 캡션 한 줄.
 */

export type MyHubNote = {
  id: string;
  title: string;
  /** "방문 09.12 · 공개" / "임장러 · 09.12" */
  meta: string;
  /** 0~100 */
  score: number;
  region: string;
};

export type MyHubAlert = { id: string; type: "region" | "keyword" | string; value: string };
export type MyHubPurchase = { id: string; title: string; amount: number; at: string };

export type MyHubData = {
  name: string;
  avatarUrl: string | null;
  plan: ProfilePlanTier;
  isAdminViewer: boolean;
  paid: boolean;
  profileInitial: { name: string | null; primaryRegion: string | null };
  /** 활동 요약 5칸(노트·관심 단지·저장 노트·AI 분석·포인트) */
  summary: ActivitySummaryItem[];
  ledger: Loaded<number>;
  nextStep: NextStep | null;
  nearLimit: { label: string; used: number; limit: number }[];
  recent: SectionState<RecentComplexCard>;
  notes: SectionState<MyHubNote>;
  notesTotal: number | null;
  /** 지역 레벨 계산용 — 노트 전체의 region 만 */
  noteRegions: string[];
  watchlistCount: Loaded<number>;
  savedNotes: SectionState<MyHubNote>;
  alerts: SectionState<MyHubAlert>;
  /** null 이면 섹션을 그리지 않는다(정상 조회 + 0건) */
  purchased: SectionState<MyHubPurchase> | null;
  expert: { isVerified: boolean; isBroker: boolean; brokerNo: string | null };
  subscription: {
    line: string;
    lastPayment: { at: string; amount: string } | null;
    relinkHref: string | null;
  };
  aiUsage: { lifetime: boolean; used: number; limit: number | null } | null;
};

/* [v4] 빈 섹션·조회 실패 — 목록 자리의 한 줄(카드 없음) + 링크 */
function OneLine({
  text,
  href,
  label,
  tone = "empty",
}: {
  text: string;
  href?: string;
  label?: string;
  tone?: "empty" | "error";
}) {
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-line py-3">
      <span className={`t-sub ${tone === "error" ? "font-bold text-ink" : "text-text-3"}`}>{text}</span>
      {href && label && (
        <Link
          href={href}
          className="inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
        >
          {label} ›
        </Link>
      )}
    </p>
  );
}

/* 섹션 제목(t-section) + 오른쪽 글자 링크 — 목록 행과 같은 왼쪽 선에 맞춘다(공용 SectionHead 는 px-1 들여쓰기) */
function Head({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="t-section text-ink">{title}</h2>
      {href && (
        <Link href={href} className="inline-block shrink-0 py-[5px] t-sub font-bold text-primary no-underline">
          {hrefLabel ?? "전체"} ›
        </Link>
      )}
    </div>
  );
}

/* 요약 칸 이름 → 행 이름(행은 칸보다 넓어 온전한 이름을 쓴다). 값·목적지는 lib/me/my-hub 그대로 */
const ROW_LABEL: Record<string, string> = {
  notes: "내 임장노트",
  watchlist: "관심 단지",
  savedNotes: "저장한 노트",
  analyses: "AI 분석 기록",
  points: "포인트",
};

/** [1009 · T] 점수가 없는 노트(축 미입력)는 "0점"이 아니라 "점수 없음" — 공개 노트 피드와 같은 말 */
function noteValue(n: MyHubNote) {
  return n.score > 0 ? <span className="text-primary">{n.score}점</span> : <span className="t-sub text-text-3">점수 없음</span>;
}

export function MyHubView({ data }: { data: MyHubData }) {
  const {
    name,
    avatarUrl,
    plan,
    isAdminViewer,
    paid,
    profileInitial,
    summary,
    ledger,
    nextStep,
    nearLimit,
    recent,
    notes,
    noteRegions,
    savedNotes,
    alerts,
    purchased,
    expert,
    subscription,
    aiUsage,
  } = data;
  const levels = noteRegions.length > 0 ? computeRegionLevels(noteRegions.map((region) => ({ region }))) : [];
  const levelSummary = levels.length > 0 ? regionLevelSummary(levels) : null;
  const region = profileInitial.primaryRegion?.trim() || null;
  /* [v4 · 규칙 2] 채움 파랑 1개 — 멈춘 자동결제의 카드 재등록이 가장 급하고, 없으면 다음 할 일 */
  const primary: "relink" | "next" | null = subscription.relinkHref ? "relink" : nextStep ? "next" : null;
  const failedLabels = summary.filter((x) => x.failed).map((x) => ROW_LABEL[x.key] ?? x.label);
  const alertCount = alerts.kind === "items" ? String(alerts.items.length) : alerts.kind === "empty" ? "0" : "—";

  /* AI 분석 사용량(무료 가치 카운터) — 값은 오른쪽 숫자, 보조 줄은 사실 한 줄 */
  const usage = (() => {
    if (!aiUsage) return null;
    const unlimited = aiUsage.limit == null;
    const limit = aiUsage.limit ?? 0;
    const remaining = unlimited ? null : Math.max(0, limit - aiUsage.used);
    const atLimit = !unlimited && remaining === 0;
    const sub = unlimited
      ? "유료 플랜 · 한도 없음"
      : atLimit
        ? aiUsage.lifetime
          ? `무료 ${limit}회 모두 사용 · ${WEEKLY_PASS.label}(${WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원·${WEEKLY_PASS.days}일)·${planLabel("pro")}로 계속`
          : "이번 달 무료 한도 모두 사용"
        : aiUsage.lifetime
          ? `무료 ${remaining}회 남음 · 월 초기화 없음`
          : `이번 달 무료 ${remaining}회 남음`;
    const value = unlimited ? (
      "무제한"
    ) : (
      <span className={atLimit ? "text-danger" : undefined}>
        {aiUsage.used}/{limit}회
      </span>
    );
    return { label: aiUsage.lifetime ? "무료 AI 분석(누적)" : "이번 달 AI 분석", sub, value };
  })();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      {/* ── 머리: 이름 한 줄 + 사실 한 줄(플랜 · 관심 지역). [v4 · 규칙 1·4·7] 유리판·이니셜 원·플랜 알약 없음 ── */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={avatarUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate t-title text-ink">{name}님</h1>
            <p className="truncate t-sub text-text-3">
              {isAdminViewer ? "관리자" : planLabel(plan)}
              {region ? ` · ${region}` : " · 관심 지역 없음"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ProfileEditSheet variant="hero" initial={profileInitial} />
          <Link href="/my/settings" aria-label="설정" className="icon-btn shrink-0 no-underline">
            <Icon name="settings" size={18} />
          </Link>
        </div>
      </header>

      {/* ── 주인공: 내 활동 — 1px 선 목록 행, 오른쪽에 개수 ── */}
      <section aria-labelledby="my-activity-h" className="flex flex-col">
        <h2 id="my-activity-h" className="t-section text-ink">
          내 활동
        </h2>
        <ul data-tone="hanji" className="divide-y divide-line">
          {/* 다음 할 일 하나 — 첫 3단계 중 남은 첫 항목. [1012] 규칙 5 — "시작하기 N/M" → "남은 할 일 N/M" */}
          {nextStep && (
            <SummaryRow
              label={`다음 할 일 · ${nextStep.step.label}`}
              sub={
                <>
                  남은 할 일 {nextStep.total - nextStep.done}/{nextStep.total} · {nextStep.total}개 완료 시 200P
                </>
              }
              right={
                <Link
                  href={nextStep.step.href}
                  className={`${primary === "next" ? "btn-primary" : "btn-outline"} btn-sm shrink-0 no-underline`}
                >
                  {nextStep.step.cta}
                </Link>
              }
            />
          )}
          {/* 한도 임박 — 사실(사용량)만 */}
          {!isAdminViewer && !paid && nearLimit.length > 0 && (
            <SummaryRow
              label="무료 한도 임박"
              sub={nearLimit.map((i) => `${i.label} ${i.used}/${i.limit}`).join(" · ")}
              value="플랜 비교"
              href="/subscription"
            />
          )}
          {/* 활동 요약 5 — 숫자는 사실(조회 실패는 "—", 0 은 0) */}
          {summary.map((s) => (
            <SummaryRow
              key={s.key}
              label={ROW_LABEL[s.key] ?? s.label}
              value={<span className={s.failed ? "text-text-3" : undefined}>{s.value}</span>}
              href={s.href}
            />
          ))}
          {/* 지역·급매 알림 — 개수 + 구독 값 한 줄 */}
          <SummaryRow
            label="지역·급매 알림"
            sub={
              alerts.kind === "items"
                ? alerts.items.map((a) => a.value).join(" · ")
                : alerts.kind === "error"
                  ? "불러오지 못함"
                  : "구독한 알림 없음"
            }
            value={alertCount}
            href="/notifications"
          />
          <AttendanceButton variant="row" />
          {/* 중개 — 공인중개사 인증 회원에게만. 상담함·전문가 프로필·받은 문의는 보관(비노출) 영역이라
              [1006] 입구를 그리지 않는다(lib/seo/archived-routes.ts). 살아 있는 건 내 매물뿐. */}
          {expert.isVerified && expert.isBroker && (
            <>
              <SummaryRow
                label="내 매물 관리"
                sub={expert.brokerNo ? `공인중개사 인증 · 등록번호 ${expert.brokerNo}` : "공인중개사 인증"}
                href="/my/listings"
              />
              <SummaryRow label="매물 등록" href="/listings/new" />
            </>
          )}
        </ul>
        {/* [1009 · T] 불러오지 못한 칸의 설명 — "—"가 0 이 아니라는 것 */}
        {failedLabels.length > 0 && (
          <p className="t-caption text-text-3">{failedLabels.join("·")} — &lsquo;—&rsquo;는 0 이 아니라 조회 실패</p>
        )}
        {!ledger.ok && failedLabels.length === 0 && (
          <p className="t-caption text-text-3">포인트 잔액 조회 실패 — 0 P 아님</p>
        )}
      </section>

      {/* ── 최근 본 단지 — [v4 · 규칙 10] 가로 레일 타일 → 1px 선 행 ── */}
      <section className="flex flex-col">
        <Head title="최근 본 단지" href="/map" hrefLabel="지도" />
        {recent.kind === "error" ? (
          <OneLine text="최근 본 단지 조회 실패" tone="error" />
        ) : recent.kind === "empty" ? (
          <OneLine text="아직 본 단지 없음" href="/map" label="지도에서 실거래 단지 보기" />
        ) : (
          <ul data-tone="blue" className="divide-y divide-line">
            {recent.items.map((c) => (
              <SummaryRow key={c.id} label={c.name} sub={c.region ?? undefined} href={c.href} />
            ))}
          </ul>
        )}
      </section>

      {/* ── 내 임장노트 — 개수는 위 "내 활동" 행이 말한다(같은 사실 한 번). 빈 상태는 한 줄 ── */}
      <section className="flex flex-col">
        <Head title="내 임장노트"
          href={notes.kind === "items" ? "/notes?mine=1" : "/notes/new"}
          hrefLabel={notes.kind === "items" ? "전체" : "새 노트"}
         
        />
        {notes.kind === "error" ? (
          <OneLine text="내 노트 조회 실패 — 없는 게 아니라 조회가 실패" tone="error" />
        ) : notes.kind === "empty" ? (
          /* [1012] 규칙 6 — 어디서·언제 · [v4 · 규칙 8] 그림 카드(EmptyState) → 한 줄 */
          <OneLine text="임장 당일 현장 기록 · 비공개로도 쓸 수 있음" href="/notes/new" label="첫 임장노트 쓰기" />
        ) : (
          <ul data-tone="hanji" className="divide-y divide-line">
            {notes.items.map((n) => (
              <SummaryRow key={n.id} label={n.title} sub={n.meta} value={noteValue(n)} href={`/notes/${n.id}`} />
            ))}
          </ul>
        )}
        {/* 지역 임장 레벨(실제 노트 수 기반) — [v4 · 규칙 3·11] 진행 막대 카드 → 접힘 한 행, 펼치면 지역별 행 */}
        {levelSummary && (
          <details className="group border-t border-line">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">지역 임장 레벨</span>
                {levelSummary.topLabel && (
                  <span className="mt-0.5 block truncate t-sub text-text-3">최고 {levelSummary.topLabel}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="t-body t-num text-ink">{levelSummary.regionCount}곳</span>
                <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <ul data-tone="sand" className="divide-y divide-line">
              {levels.map((r) => (
                <SummaryRow
                  key={r.region}
                  label={r.region}
                  sub={`Lv.${r.level} ${r.label} · ${r.next ? `다음 ${r.next.label}까지 ${r.next.need}건` : "최고 레벨"}`}
                  value={`${r.count}건`}
                />
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ── 저장한 노트 — 있을 때만(개수·빈 상태·실패는 "내 활동" 행이 말한다) ── */}
      {savedNotes.kind === "items" && (
        <section className="flex flex-col">
          <Head title="저장한 노트" href="/notes" hrefLabel="공개 노트" />
          <ul data-tone="blue" className="divide-y divide-line">
            {savedNotes.items.map((n) => (
              <SummaryRow key={n.id} label={n.title} sub={n.meta} value={noteValue(n)} href={`/notes/${n.id}`} />
            ))}
          </ul>
        </section>
      )}

      {/* ── 구독 · 포인트 — 관리(해지·카드·영수증)는 /my/subscription 한 곳. 포인트 내역(원장)은 /my/points 한 곳 ── */}
      <section className="flex flex-col">
        <Head title="구독 · 포인트" href="/my/subscription" hrefLabel="구독 관리" />
        <ul data-tone="mint" className="divide-y divide-line">
          {subscription.relinkHref && (
            <SummaryRow
              label="자동결제 멈춤"
              sub="등록 카드 결제 실패"
              right={
                <Link href={subscription.relinkHref} className="btn-primary btn-sm shrink-0 no-underline">
                  카드 다시 등록
                </Link>
              }
            />
          )}
          <SummaryRow
            label="현재 플랜"
            sub={subscription.line}
            value={isAdminViewer ? "관리자" : planLabel(plan)}
            href={plan === "free" ? "/subscription" : "/my/subscription"}
          />
          {usage && <SummaryRow label={usage.label} sub={usage.sub} value={usage.value} />}
          {subscription.lastPayment && (
            <SummaryRow
              label="최근 결제"
              sub={subscription.lastPayment.at}
              value={subscription.lastPayment.amount}
              href="/my/subscription#history-title"
            />
          )}
          <SummaryRow label="미션" sub="첫 3미션 200P · 주간 미션 매주 월요일 리셋" href="/my/points?tab=missions" />
          <SummaryRow label="친구 초대" sub="내 링크로 가입 시 친구와 나 모두 300P" href="/my/points?tab=referral" />
          <SummaryRow label="포인트 상점" sub="리포트·이용권 교환" href="/points/shop" />
          {/* 구매한 리포트(재열람) — 이미 산 리포트는 "언제든 다시 열람" 약속대로 개별 행 */}
          {purchased?.kind === "items" &&
            purchased.items.map((p) => (
              <SummaryRow
                key={p.id}
                label={p.title}
                sub={`${p.at} 구매 · ${p.amount.toLocaleString("ko-KR")}P`}
                value="열람"
                href={`/town/library/${p.id}`}
              />
            ))}
        </ul>
        {purchased?.kind === "error" && (
          <p className="t-caption text-text-3">구매한 리포트 조회 실패 — 내역이 없는 게 아님</p>
        )}
      </section>

      {/* ── 설정·문의 — 관리자 콘솔 링크는 role=admin 세션에만. 접근 제어는 서버(app/admin/layout.tsx).
          [1012] 규칙 5 — "더 보기" 는 대상이 없다 ── */}
      <section className="flex flex-col">
        <Head title="설정·문의" />
        <ul data-tone="blue" className="divide-y divide-line">
          <SummaryRow label="설정" sub="프로필 · 기록 기본값 · 알림 · 테마 · 데이터 내보내기" href="/my/settings" />
          <SummaryRow label="내 문의 내역" sub="고객센터 문의와 답변" href="/my/support" />
          <SummaryRow label="고객센터" href="/support" />
          <SummaryRow label="크리에이터 대시보드" href="/my/creator" />
          {isAdminViewer && <SummaryRow label="관리자 콘솔" href="/admin" />}
        </ul>
      </section>
    </div>
  );
}
