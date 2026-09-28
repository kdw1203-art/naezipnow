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
import { seedGradient } from "@/lib/town/shared";
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
  /** [1015 · 규칙 H] 목록 썸네일 주소(noteCoverUrl) — 없으면 단색 칸 */
  cover: string | null;
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

/* 메뉴 행 묶음 — [1015 · 규칙 I] 리퀴드 판 한 장(lq-panel) + 톤(포인트 = mint · 도구 메뉴 = blue) */
function MenuRows({
  items,
  tone,
}: {
  items: { label: string; href: string; desc?: string }[];
  tone: "blue" | "hanji" | "mint" | "sand";
}) {
  return (
    <div className="lq-panel flex flex-col py-0.5" data-tone={tone}>
      {items.map((m, i, arr) => (
        <Link
          key={m.href}
          href={m.href}
          className={`flex items-center justify-between gap-3 py-[13px] no-underline max-md:py-2.5 ${
            i < arr.length - 1 ? "border-b" : ""
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
    <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-4 py-3">
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

/* [1015 · 규칙 H] 44px 정사각 썸네일 — noteCoverUrl(템플릿 썸네일이면 그 그림, 아니면 첫 사진), 없으면 단색 칸.
   제목은 옆 칸에 있으므로 템플릿 그림 위에 글자를 겹치지 않는다. */
function NoteThumb({ n }: { n: MyHubNote }) {
  return (
    <span
      aria-hidden="true"
      className="h-11 w-11 shrink-0 overflow-hidden rounded-lg"
      style={{ background: seedGradient(n.region || n.id) }}
    >
      {n.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={n.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

/* 판(lq-panel) 안의 노트 한 행 — 썸네일 · 제목 · 메타 · 점수. 묶음 쪽이 톤을 정한다. */
function NoteRow({ n, sub, last }: { n: MyHubNote; sub?: string; last?: boolean }) {
  return (
    <Link
      href={`/notes/${n.id}`}
      className={`flex items-center gap-3 py-2.5 no-underline ${last ? "" : "border-b"}`}
    >
      <NoteThumb n={n} />
      <div className="min-w-0 flex-1">
        <div className="truncate t-body font-bold text-ink">{n.title}</div>
        <div className="t-sub text-text-3">{sub ?? n.meta}</div>
      </div>
      {/* [1009 · T] 점수가 없는 노트(축 미입력)는 "0점"이 아니라 "점수 없음" — 공개 노트 피드와 같은 말(0점은 최저점으로 읽힌다) */}
      <span className={`t-num shrink-0 pl-2 t-sub font-bold ${n.score > 0 ? "" : "text-text-3"}`}>
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
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4 max-md:gap-3">
      {/* ── 프로필 + 활동 요약 (유리판) — [1015 · 규칙 E] 폰 안쪽 여백 압축 ── */}
      <section aria-label="내 프로필" className="rise-in lg-glass flex flex-col gap-4 rounded-lg p-5 max-md:gap-3 max-md:p-3.5">
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
            포인트 잔액을 지금 불러오지 못했어요. 0 P 가 아니라 조회 실패입니다.
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
          className="rise-in-1 card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-caption font-bold text-text-3">
                남은 할 일 {nextStep.total - nextStep.done}/{nextStep.total}
              </span>
              <span className="rounded-full bg-primary-soft chip-pad t-caption font-bold text-primary">
                완주 시 200P
              </span>
            </div>
            <span className="t-body font-bold text-ink">다음 할 일 · {nextStep.step.label}</span>
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

      {/* ── 한도 임박 — 사실(사용량)만. [1015] 권유 꼬리("플러스는 … 늘어나요") 제거 ── */}
      {!isAdminViewer && !paid && nearLimit.length > 0 && (
        <section className="rise-in-1 card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 max-md:p-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="t-body font-bold text-ink">무료 한도 임박</span>
            <span className="t-sub text-text-3">
              {nearLimit.map((i) => `${i.label} ${i.used}/${i.limit}`).join(" · ")}
            </span>
          </div>
          <Link href="/subscription" className="btn-soft btn-md shrink-0 no-underline">
            플랜 비교 ›
          </Link>
        </section>
      )}

      {/* ── 2열: 좌 활동 / 우 구독·포인트·더 보기 (데스크톱) ── */}
      <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          {/* ── 최근 본 단지 — 가로 레일(폰) · [1015 · 규칙 F] 데스크톱은 줄바꿈 격자 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="최근 본 단지" href="/map" hrefLabel="지도" />
            {recent.kind === "error" ? (
              <OneLine text="최근 본 단지를 지금 불러오지 못했어요" tone="error" />
            ) : recent.kind === "empty" ? (
              <OneLine text="아직 본 단지가 없어요" href="/map" label="지도에서 둘러보기" />
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
                {recent.items.map((c) => (
                  <Link
                    key={c.id}
                    href={c.href}
                    className="card tile flex w-[150px] shrink-0 flex-col gap-0.5 rounded-lg px-3 py-2.5 no-underline"
                  >
                    <span className="truncate t-body font-bold text-ink">{c.name}</span>
                    <span className="truncate t-caption text-text-3">{c.region ?? "단지 보기"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ── 내 임장노트 — 빈 상태 그림은 여기 한 곳만. [1015 · 규칙 H·I] 썸네일 행 목록 = hanji 톤 ── */}
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="내 임장노트"
              href={notes.kind === "items" ? "/notes?mine=1" : "/notes/new"}
              hrefLabel={notes.kind === "items" ? `전체 ${notesTotal ?? notes.items.length}` : "새 노트"}
            />
            {notes.kind === "error" ? (
              <OneLine
                text="내 노트를 지금 불러오지 못했어요. 없는 게 아니라 조회 실패입니다."
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
              <div className="lq-panel flex flex-col" data-tone="hanji">
                {notes.items.map((n, i, arr) => (
                  <NoteRow key={n.id} n={n} last={i === arr.length - 1} />
                ))}
              </div>
            )}
          </section>

          {/* ── 지역 임장 레벨 (실제 노트 수 기반) ── */}
          {levelSummary && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="지역 임장 레벨" href="/notes?mine=1" hrefLabel="내 노트" />
              <div className="card flex flex-col gap-3 rounded-2xl p-5 max-md:p-3.5">
                {/* [1015] 문장 → 사실 한 줄 */}
                <div className="t-sub text-text-3">
                  임장 지역 <b className="text-ink">{levelSummary.regionCount}곳</b>
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
                          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 t-caption font-bold text-primary">
                            Lv.{r.level} · {r.label}
                          </span>
                        </span>
                        <span className="shrink-0 t-sub font-bold text-ink">{r.count}건</span>
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
          {/* [1015 · 규칙 I] 관심 단지·저장 노트·알림 세 줄 = blue 톤 리퀴드 판 */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="관심" href="/my/watchlist" hrefLabel="관심 단지 대시보드" />
            <div className="lq-panel flex flex-col py-1" data-tone="blue">
              {/* 관심 단지 */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="t-caption font-bold text-text-3">관심 단지</span>
                  <span className="t-body font-bold text-ink">
                    {!watchlistCount.ok
                      ? "지금 불러오지 못했어요"
                      : watchlistCount.value === 0
                        ? "아직 담은 단지가 없어요"
                        : `${watchlistCount.value.toLocaleString("ko-KR")}개`}
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
              <div className="flex flex-col gap-2 border-b py-3">
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
                  <div className="flex flex-col">
                    {savedNotes.items.map((n, i, arr) => (
                      <NoteRow key={n.id} n={n} last={i === arr.length - 1} />
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
                  text="구매 내역을 지금 불러오지 못했어요. 내역이 없는 게 아니라 조회 실패입니다."
                  tone="error"
                />
              ) : purchased.kind === "empty" ? null : (
                purchased.items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/town/library/${p.id}`}
                    className="card tile flex items-center justify-between rounded-lg px-4 py-3 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-body font-bold text-ink">{p.title}</div>
                      <div className="t-sub text-text-3">
                        {p.at} 구매 · {p.amount.toLocaleString("ko-KR")}P
                      </div>
                    </div>
                    <span className="shrink-0 pl-2 t-sub font-bold text-primary">열람 ›</span>
                  </Link>
                ))
              )}
            </section>
          )}

          {/* ── 중개 — 공인중개사 인증 회원에게만. 상담함·전문가 프로필·받은 문의는 보관(비노출)
              영역이라 [1006] 입구를 그리지 않는다(lib/seo/archived-routes.ts). 살아 있는 건 내 매물뿐. ── */}
          {expert.isVerified && expert.isBroker && (
            <section className="flex flex-col gap-2.5">
              {/* [1015 · 규칙 C] 제목 옆 부연("공인중개사 인증 완료") 제거 — 이 섹션은 인증 회원에게만 보인다 */}
              <SectionHead title="중개" />
              <div className="card flex flex-col gap-3 rounded-2xl p-5 max-md:p-3.5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="t-body font-bold text-ink">내 매물</div>
                  {/* [1015] 사용법 문장("등록하고 관리할 수 있어요") 제거 — 등록번호 사실만 */}
                  {expert.brokerNo && <div className="mt-0.5 t-sub text-text-3">등록번호 {expert.brokerNo}</div>}
                </div>
                {/* [1015 · 규칙 J] 채움 파랑은 화면당 1개(다음 할 일) — 보조는 outline */}
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href="/my/listings" className="btn-soft btn-md no-underline">
                    내 매물 관리
                  </Link>
                  <Link href="/listings/new" className="btn-outline btn-md no-underline">
                    매물 등록
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ── 우측: 구독 · 포인트 · 더 보기 ── */}
        <aside className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          {/* 구독 상태 — 관리(해지·카드·영수증)는 /my/subscription 한 곳 */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="구독 상태" href="/my/subscription" hrefLabel="플랜 관리" />
            <div className="card flex flex-col gap-3 rounded-2xl p-5 max-md:p-3.5">
              <div className="min-w-0">
                <div className="t-body font-bold text-ink">현재 플랜 · {planLabel(plan)}</div>
                {subscription.line && <div className="mt-0.5 t-sub text-text-3">{subscription.line}</div>}
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
                  <div className="card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5">
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
                    {/* [1015 · 규칙 D] 권유문 → 사실 한 줄. 무제한은 위 숫자 칸이 이미 말한다.
                        한도 숫자는 실제 limit 값(예전엔 "3회"·"1,100원" 을 손으로 적었다). */}
                    {!unlimited && (
                      <div className="t-sub text-text-3">
                        {atLimit
                          ? aiUsage.lifetime
                            ? `무료 ${limit}회 모두 사용 · 주간권 또는 플러스로 계속`
                            : `이번 달 무료 ${limit}회 모두 사용 · 플러스는 월 한도 확대`
                          : aiUsage.lifetime
                            ? `${remaining}회 남음 · 월 초기화 없음`
                            : `이번 달 ${remaining}회 남음`}
                      </div>
                    )}
                  </div>
                );
              })()}
          </section>

          {/* 포인트 — 적립 입구 3개 + 상점(교환). 내역(원장)은 /my/points 한 곳에서만 그린다. */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="포인트" href="/my/points" hrefLabel="전체 내역" />
            {/* [1015 · 규칙 C·I] 사용법 부연("실행한 분석 다시 보기 · 같은 도구 재실행") 제거 · 포인트 = mint 톤 */}
            <MenuRows
              tone="mint"
              items={[
                { label: "미션", href: "/my/points?tab=missions", desc: "시작 3미션 200P · 주간 미션 매주 리셋" },
                { label: "AI 분석 기록", href: "/my/analyses" },
                { label: "친구 초대", href: "/my/points?tab=referral", desc: "내 링크 가입 시 친구와 나 모두 300P" },
              ]}
            />
            {/* [1015] "리포트·이용권을 교환해요" 는 사실이 아니었다(포인트↔이용권 교환은 2026-08-23 토스 회신으로 제거,
                상점 품목은 매물 상단 노출·추천글·닉네임 효과) — 설명 문장을 지우고 링크만. 채움 파랑 → soft. */}
            <div className="card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 max-md:p-3.5">
              <span className="t-body font-bold text-ink">포인트 상점</span>
              <Link href="/points/shop" className="btn-soft btn-md shrink-0 no-underline">
                포인트 상점 가기
              </Link>
            </div>
          </section>

          {/* 더 보기 — 관리자 콘솔 링크는 role=admin 세션에만. 접근 제어는 서버(app/admin/layout.tsx). */}
          <section className="mb-2 flex flex-col gap-2.5">
            <SectionHead title="더 보기" />
            <MenuRows
              tone="blue"
              items={[
                { label: "설정", href: "/my/settings", desc: "프로필 · 기록 기본값 · 알림 · 테마 · 데이터 내보내기" },
                { label: "내 문의 내역", href: "/my/support" },
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
