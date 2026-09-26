import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { SectionHead } from "@/app/components/ui/SectionHead";
import { planLabel, type ProfilePlanTier } from "@/lib/subscriptions/labels";
import {
  computeRegionLevels,
  regionLevelProgress,
  regionLevelSummary,
} from "@/lib/gamification/region-levels";
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
 * 구성(위→아래, 데스크톱은 2열): 프로필+활동 요약 → 다음 할 일 1개 → [좌] 최근 본 단지 ·
 * 내 임장노트 · 관심(단지·노트·알림 세 줄) · 구매 리포트 · 전문가 / [우] 구독 · 포인트 · 더 보기.
 * 빈 상태 그림(EmptyState)은 내 임장노트 한 곳만 — 나머지 빈 섹션은 한 줄 + 링크.
 * 조회 실패는 빈 상태와 절대 섞지 않는다(SectionState.kind === "error").
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

/* 흰 카드 위 메뉴 행 — 더 보기·전문가 메뉴가 같은 모양을 쓴다 */
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

/* 한 줄 접힘 — 빈 섹션·조회 실패를 그림 없이 한 문장 + 링크로 */
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
    <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] px-4 py-3">
      <span className={`t-sub ${tone === "error" ? "font-bold text-ink" : "text-text-2"}`}>{text}</span>
      {href && label && (
        <Link
          href={href}
          className="inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
        >
          {label} ›
        </Link>
      )}
    </div>
  );
}

function NoteRow({ n, sub }: { n: MyHubNote; sub?: string }) {
  return (
    <Link
      href={`/notes/${n.id}`}
      className="card tile flex items-center justify-between rounded-[14px] px-4 py-3 no-underline"
    >
      <div className="min-w-0">
        <div className="truncate t-body font-bold text-ink">{n.title}</div>
        <div className="t-sub text-text-3">{sub ?? n.meta}</div>
      </div>
      {/* [1009 · T] 점수가 없는 노트(축 미입력)는 "0점"이 아니라 "점수 없음" — 공개 노트 피드와 같은 말(0점은 최저점으로 읽힌다) */}
      <span className={`t-num shrink-0 pl-2 t-sub font-extrabold ${n.score > 0 ? "text-primary" : "text-text-3"}`}>
        {n.score > 0 ? `기록 ${n.score}점` : "점수 없음"}
      </span>
    </Link>
  );
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
    notesTotal,
    noteRegions,
    watchlistCount,
    savedNotes,
    alerts,
    purchased,
    expert,
    subscription,
    aiUsage,
  } = data;
  const initial = name.slice(0, 1).toUpperCase();
  const levels = noteRegions.length > 0 ? computeRegionLevels(noteRegions.map((region) => ({ region }))) : [];
  const levelSummary = levels.length > 0 ? regionLevelSummary(levels) : null;

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
      {/* ── 프로필 + 활동 요약 (유리판) ── */}
      <section aria-label="내 프로필" className="rise-in lg-glass flex flex-col gap-4 rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                loading="lazy"
                decoding="async"
                src={avatarUrl}
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
                  <Icon name={isAdminViewer ? "shield" : paid ? "crown" : "user"} size={14} />
                  {isAdminViewer ? "관리자" : planLabel(plan)}
                </Link>
              </div>
              <ProfileEditSheet variant="hero" initial={profileInitial} />
            </div>
          </div>
          <Link href="/my/settings" aria-label="설정" className="icon-btn shrink-0 no-underline">
            <Icon name="settings" size={18} />
          </Link>
        </div>

        <div className="lg-hairline" />

        {/* 활동 요약 한 줄 — 숫자는 사실(조회 실패는 "—", 0 은 0) */}
        <nav aria-label="내 활동 요약" className="grid grid-cols-5 overflow-hidden rounded-xl bg-surface/70">
          {summary.map((s, i) => (
            <Link
              key={s.key}
              href={s.href}
              aria-label={s.failed ? `${s.label} — 지금 불러오지 못했어요` : undefined}
              className={`press flex min-w-0 flex-col items-center gap-0.5 px-1 py-2.5 text-center no-underline ${
                i > 0 ? "border-l border-divider" : ""
              }`}
            >
              {/* 390px 에서 한 칸이 ~70px — "12,500P" 같은 값은 15px 로, sm 부터 19px(램프 안) */}
              <span className={`t-num text-[15px] sm:text-[19px] ${s.failed ? "text-text-3" : "text-ink"}`}>
                {s.value}
              </span>
              <span className="t-caption text-text-3">{s.label}</span>
            </Link>
          ))}
        </nav>
        {/* [1009 · T] 불러오지 못한 칸의 설명을 title= 말풍선(휴대폰에선 안 보임) 대신 한 줄 글로 — "—"가 0 이 아니라는 것 */}
        {summary.some((x) => x.failed) && (
          <span className="t-caption text-text-3">
            {summary
              .filter((x) => x.failed)
              .map((x) => x.label)
              .join("·")}
            {" "}칸의 &lsquo;—&rsquo;는 0 이 아니라 지금 불러오지 못했다는 뜻이에요.
          </span>
        )}
        {!ledger.ok && !summary.some((x) => x.failed) && (
          <span className="t-caption text-text-3">
            포인트 잔액을 지금 불러오지 못했어요 — 0 P 라는 뜻이 아니라 조회가 실패했어요.
          </span>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/my/points"
            className="inline-flex min-h-[24px] items-center self-start t-sub font-semibold text-primary no-underline"
          >
            지갑 전체 보기 ›
          </Link>
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <AttendanceButton />
          </div>
        </div>
      </section>

      {/* ── 다음 할 일 하나 — 시작하기 3단계 중 남은 첫 항목 ── */}
      {nextStep && (
        <section
          aria-label="다음 할 일"
          className="rise-in-1 card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-caption font-bold text-text-3">
                시작하기 {nextStep.done}/{nextStep.total}
              </span>
              <span className="rounded-full bg-primary-soft chip-pad t-caption font-extrabold text-primary">
                완주 시 200P
              </span>
            </div>
            <span className="t-body font-extrabold text-ink">다음 할 일 · {nextStep.step.label}</span>
            <div className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: nextStep.total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-8 rounded-full ${i < nextStep.done ? "bg-primary" : "bg-line"}`}
                />
              ))}
            </div>
          </div>
          <Link href={nextStep.step.href} className="btn-primary btn-md shrink-0 no-underline">
            {nextStep.step.cta}
          </Link>
        </section>
      )}

      {/* ── 한도 임박 안내 — 사실(사용량)만 말하고 다음 단계를 보여준다 ── */}
      {!isAdminViewer && !paid && nearLimit.length > 0 && (
        <section className="rise-in-1 card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="t-body font-extrabold text-ink">무료 한도가 가까워졌어요</span>
            <span className="t-sub text-text-3">
              {nearLimit.map((i) => `${i.label} ${i.used}/${i.limit}`).join(" · ")} — 플러스는 이 한도가
              크게 늘어나요.
            </span>
          </div>
          <Link href="/subscription" className="btn-soft btn-md shrink-0 no-underline">
            플랜 비교 보기 ›
          </Link>
        </section>
      )}

      {/* ── 2열: 좌 활동 / 우 구독·포인트·더 보기 (데스크톱) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── 최근 본 단지 — 가로 레일 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="최근 본 단지" href="/map" hrefLabel="지도" />
            {recent.kind === "error" ? (
              <OneLine text="최근 본 단지를 지금 불러오지 못했어요" tone="error" />
            ) : recent.kind === "empty" ? (
              <OneLine text="아직 본 단지가 없어요" href="/map" label="지도에서 둘러보기" />
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recent.items.map((c) => (
                  <Link
                    key={c.id}
                    href={c.href}
                    className="card tile flex w-[150px] shrink-0 flex-col gap-0.5 rounded-[14px] px-3 py-2.5 no-underline"
                  >
                    <span className="truncate t-body font-bold text-ink">{c.name}</span>
                    <span className="truncate t-caption text-text-3">{c.region ?? "단지 보기"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ── 내 임장노트 — 빈 상태 그림은 여기 한 곳만 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="내 임장노트"
              href={notes.kind === "items" ? "/notes?mine=1" : "/notes/new"}
              hrefLabel={notes.kind === "items" ? `전체 ${notesTotal ?? notes.items.length}` : "새 노트"}
            />
            {notes.kind === "error" ? (
              <OneLine
                text="내 노트를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했어요"
                tone="error"
              />
            ) : notes.kind === "empty" ? (
              <EmptyState
                icon="notebook-pen"
                title="아직 임장노트가 없어요"
                desc="현장 기록을 남기면 여기에 모여요"
                action={{ label: "첫 노트 쓰기", href: "/notes/new" }}
              />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {notes.items.map((n) => (
                  <NoteRow key={n.id} n={n} />
                ))}
              </div>
            )}
          </section>

          {/* ── 지역 임장 레벨 (실제 노트 수 기반) ── */}
          {levelSummary && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="지역 임장 레벨" href="/notes?mine=1" hrefLabel="내 노트" />
              <div className="card flex flex-col gap-3 rounded-2xl p-5">
                <div className="t-sub text-text-3">
                  지금까지 <b className="text-ink">{levelSummary.regionCount}개 지역</b>을 임장했어요
                  {levelSummary.topLabel ? (
                    <>
                      {" · 최고 "}
                      <b className="text-primary">{levelSummary.topLabel}</b>
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
              </div>
            </section>
          )}

          {/* ── 관심 — 단지·노트·알림 세 줄을 한 카드에 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="관심" href="/my/watchlist" hrefLabel="관심 단지 대시보드" />
            <div className="card flex flex-col rounded-2xl px-4 py-1">
              {/* 관심 단지 */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-divider py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="t-caption font-bold text-text-3">관심 단지</span>
                  <span className="t-body font-bold text-ink">
                    {!watchlistCount.ok
                      ? "지금 불러오지 못했어요"
                      : watchlistCount.value === 0
                        ? "아직 담은 단지가 없어요"
                        : `${watchlistCount.value.toLocaleString("ko-KR")}개 담아 뒀어요`}
                  </span>
                </span>
                {watchlistCount.ok && (
                  <Link
                    href={watchlistCount.value === 0 ? "/map" : "/my/watchlist"}
                    className="inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
                  >
                    {watchlistCount.value === 0 ? "지도에서 담기" : "현재가 · 변동 보기"} ›
                  </Link>
                )}
              </div>

              {/* 저장한 노트 */}
              <div className="flex flex-col gap-2 border-b border-divider py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex min-w-0 flex-col">
                    <span className="t-caption font-bold text-text-3">저장한 노트</span>
                    {savedNotes.kind !== "items" && (
                      <span className="t-body font-bold text-ink">
                        {savedNotes.kind === "error"
                          ? "지금 불러오지 못했어요"
                          : "저장한 공개 노트가 없어요"}
                      </span>
                    )}
                  </span>
                  {savedNotes.kind !== "error" && (
                    <Link
                      href="/notes"
                      className="inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
                    >
                      공개 노트 둘러보기 ›
                    </Link>
                  )}
                </div>
                {savedNotes.kind === "items" && (
                  <div className="flex flex-col gap-2">
                    {savedNotes.items.map((n) => (
                      <NoteRow key={n.id} n={n} />
                    ))}
                  </div>
                )}
              </div>

              {/* 지역 · 급매 알림 */}
              <div className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex min-w-0 flex-col">
                    <span className="t-caption font-bold text-text-3">지역 · 급매 알림</span>
                    {alerts.kind !== "items" && (
                      <span className="t-body font-bold text-ink">
                        {alerts.kind === "error" ? "지금 불러오지 못했어요" : "구독한 알림이 없어요"}
                      </span>
                    )}
                  </span>
                  <Link
                    href="/notifications"
                    className="inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
                  >
                    {alerts.kind === "items" ? "관리" : "알림 구독하기"} ›
                  </Link>
                </div>
                {alerts.kind === "items" && (
                  <div className="flex flex-wrap gap-2">
                    {alerts.items.map((a) => (
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
              </div>
            </div>
          </section>

          {/* ── 구매한 리포트 (재열람) — 이미 산 리포트는 "언제든 다시 열람" 약속대로 개별 링크 ── */}
          {purchased && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="구매한 리포트" />
              {purchased.kind === "error" ? (
                <OneLine
                  text="구매 내역을 지금 불러오지 못했어요 — 내역이 없는 게 아니라 조회가 실패했어요"
                  tone="error"
                />
              ) : purchased.kind === "empty" ? null : (
                purchased.items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/town/library/${p.id}`}
                    className="card tile flex items-center justify-between rounded-[14px] px-4 py-3 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-body font-bold text-ink">{p.title}</div>
                      <div className="t-sub text-text-3">
                        {p.at} 구매 · {p.amount.toLocaleString("ko-KR")}P
                      </div>
                    </div>
                    <span className="shrink-0 pl-2 t-sub font-extrabold text-primary">열람 ›</span>
                  </Link>
                ))
              )}
            </section>
          )}

          {/* ── 중개 — 공인중개사 인증 회원에게만. 상담함·전문가 프로필·받은 문의는 보관(비노출)
              영역이라 [1006] 입구를 그리지 않는다(lib/seo/archived-routes.ts). 살아 있는 건 내 매물뿐. ── */}
          {expert.isVerified && expert.isBroker && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="중개" sub="공인중개사 인증 완료" />
              <div className="card flex flex-col gap-3 rounded-2xl p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="t-body font-extrabold text-ink">내 매물</div>
                  <div className="mt-0.5 t-sub text-text-3">
                    {expert.brokerNo ? `등록번호 ${expert.brokerNo} · ` : ""}매물을 등록하고 관리할 수
                    있어요
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
            </section>
          )}
        </div>

        {/* ── 우측: 구독 · 포인트 · 더 보기 ── */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* 구독 상태 — 관리(해지·카드·영수증)는 /my/subscription 한 곳 */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="구독 상태" href="/my/subscription" hrefLabel="플랜 관리" />
            <div className="card flex flex-col gap-3 rounded-2xl p-5">
              <div className="min-w-0">
                <div className="t-body font-extrabold text-ink">현재 플랜 · {planLabel(plan)}</div>
                <div className="mt-0.5 t-sub text-text-3">{subscription.line}</div>
                {subscription.lastPayment && (
                  <div className="mt-1 t-caption text-text-3">
                    최근 결제 · {subscription.lastPayment.at} · {subscription.lastPayment.amount}{" "}
                    <Link
                      href="/my/subscription#history-title"
                      className="inline-flex min-h-[24px] items-center font-semibold text-primary no-underline"
                    >
                      결제 내역 ›
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {subscription.relinkHref && (
                  <Link href={subscription.relinkHref} className="btn-primary btn-md no-underline">
                    카드 다시 등록
                  </Link>
                )}
                <Link
                  href={plan === "free" ? "/subscription" : "/my/subscription"}
                  className={`btn-md no-underline ${
                    plan === "free" && !subscription.relinkHref ? "btn-primary" : "btn-soft"
                  }`}
                >
                  {plan === "free" ? "업그레이드" : "구독 관리"}
                </Link>
              </div>
            </div>

            {/* 무료 가치 카운터 — AI 분석 사용량 */}
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

          {/* 포인트 — 적립 입구 3개 + 상점(교환). 내역(원장)은 /my/points 한 곳에서만 그린다. */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="포인트" href="/my/points" hrefLabel="전체 내역" />
            <MenuRows
              items={[
                { label: "미션", href: "/my/points?tab=missions", desc: "시작 3미션 200P · 주간 미션 매주 리셋" },
                { label: "AI 분석 기록", href: "/my/analyses", desc: "실행한 분석 다시 보기 · 같은 도구 재실행" },
                { label: "친구 초대", href: "/my/points?tab=referral", desc: "내 링크로 가입하면 친구와 나 모두 300P" },
              ]}
            />
            <div className="card flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="t-body font-extrabold text-ink">포인트 상점</span>
                <span className="t-sub text-text-3">모은 포인트로 리포트·이용권을 교환해요.</span>
              </div>
              <Link href="/points/shop" className="btn-primary btn-md self-start no-underline">
                포인트 상점 가기
              </Link>
            </div>
          </section>

          {/* 더 보기 — 관리자 콘솔 링크는 role=admin 세션에만. 접근 제어는 서버(app/admin/layout.tsx). */}
          <section className="mb-2 flex flex-col gap-2.5">
            <SectionHead title="더 보기" />
            <MenuRows
              items={[
                { label: "설정", href: "/my/settings", desc: "프로필 · 기록 기본값 · 알림 · 테마 · 데이터 내보내기" },
                { label: "내 문의 내역", href: "/my/support", desc: "고객센터에 남긴 문의와 답변" },
                { label: "고객센터", href: "/support" },
                { label: "크리에이터 대시보드", href: "/my/creator" },
                ...(isAdminViewer ? [{ label: "관리자 콘솔", href: "/admin" }] : []),
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
