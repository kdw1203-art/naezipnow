/* [1025 · 결정·비서] /my/assistant — AI 비서(시장 7 "AI 를 직원처럼"). 시안 mock1025/assistant-{m,d}.
   이미 돌고 있는 자동 알림(price-alerts · watchlist-new-tx · saved-search-alerts · weekly-digest)을 "이번 주" 로 세고,
   임장 일정(기존 /api/inspection/schedule)·계약 D-day·감시 목록·알림 채널을 한 화면에. 채움 파랑은 AgentChat 링크 하나.
   세션 필수 — 게스트는 /login?callbackUrl=/my/assistant. 로더는 lib/assistant/load(실패·0건 구분).

   [1025b · 결정·비서] 3블록으로 줄였다 — ① 이번 주(4칸 한 줄 · 0이면 한 문장) ② 다음 할 일(일정 목록 · D-day 칩 ·
   "일정 추가" 는 접힌 <details>) ③ 지켜보는 것(관심 단지·저장 검색 두 줄 + 채널 상태 글자 한 줄 — 토글 모양은 쓰지 않는다).
   "대화 열기" 요소 하나를 레일(lg+)과 폰 하단 바(MobilePrimaryBar)가 나눠 그린다. 머리 아래 상태 줄 없음 · 섹션 점 파랑 하나.

   [1025c · 결정·비서] 대표 그림 + 결론 한 줄 + 손잡이(시안 mock1025c/assistant-{m,d}).
   · 결론: 글리프 아바타(원형 primary-soft + ToolGlyph agent) 옆 비서 한 줄 — 규칙 생성·실제 수치만(lib/assistant/weekly assistantLine).
   · 그림 ①: 이번 주 7일 스트립(월~일 KST · 알림 있는 날 파란 점 + 개수 · 오늘 표시 — weekStrip).
   · 그림 ②: 관심 단지(최대 6곳) 30일 줄 — 마지막 거래가 + 30일 새 거래 수 · 30일 안 거래 2건 이상일 때만 Spark(가짜 선 없음).
   · 손잡이: 관심 단지 담기(WatchAddForm · 기존 /api/me/watchlist) — 담으면 줄이 늘어난다. 빈 상태는 회색 견본 + 한 문장. */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { Spark } from "@/app/components/viz/Spark";
import { ToolGlyph } from "@/app/analysis/ToolGlyph";
import { formatEokMan } from "@/lib/format/eok-man";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { safeAuth } from "@/lib/safe-auth";
import { AI_DISCLAIMER } from "@/lib/ai/disclaimer";
import { isEmailConfigured } from "@/lib/email/send";
import { isWebPushConfigured } from "@/lib/push/vapid";
import { formatKstDateTime } from "@/lib/format/kst";
import {
  WATCH_SERIES_MAX,
  loadContractDday,
  loadNotifyPrefs,
  loadSavedSearchCount,
  loadSchedules,
  loadWatchCount,
  loadWatchSeries,
  loadWeekStrip,
  loadWeekly,
} from "@/lib/assistant/load";
import { INBOX_KIND_LABEL, assistantLine, dDayLabel, daysUntil, kstDay, weekRangeLabel, type WeekStripDay } from "@/lib/assistant/weekly";
import { dealDayLabel } from "@/lib/assistant/watch-series";
import { ScheduleForm } from "./ScheduleForm";
import { WatchAddForm } from "./WatchAddForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "AI 비서",
  description: "관심 단지 새 실거래·가격 변동·저장 검색 매치·주간 브리핑 — 최근 7일 자동 알림 기록과 임장 일정·계약 D-day·감시 목록.",
  path: "/my/assistant",
  noIndex: true,
});

const NA = "—";

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span className="t-caption text-text-3">{k}</span>
      <span className="truncate t-section t-num text-ink">{v}</span>
    </div>
  );
}

/** D-day 칩 — 읽는 글자(컨트롤 아님) */
function Dday({ days }: { days: number | null }) {
  return <span className="chip chip-soft inline-flex shrink-0 items-center px-2 py-0.5 t-caption t-num">{dDayLabel(days)}</span>;
}

/** 채널 상태 글자 — "켜짐 · 꺼짐 · —"(미설정). 바꾸는 곳은 /my/settings */
function channelWord(on: boolean | null): string {
  return on === null ? NA : on ? "켜짐" : "꺼짐";
}

/* [1025c] 이번 주 7칸 — 알림 있는 날 파란 점 + 개수 · 오늘은 primary-soft 칸. 못 읽었으면(null) 회색 견본(점 없음) */
function DayStrip({ days }: { days: readonly WeekStripDay[] }) {
  return (
    <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0" aria-label="이번 주 알림 · 날짜별">
      {days.map((d) => {
        const on = d.count > 0;
        return (
          <li
            key={d.date}
            aria-label={`${d.date} ${d.dow}요일 알림 ${d.count}건${d.today ? " · 오늘" : ""}`}
            className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 ${d.today ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}
          >
            <span className={`t-caption ${d.today ? "font-bold text-primary" : "text-text-3"}`}>{d.dow}</span>
            <span className={`t-body t-num ${d.future ? "text-text-3" : "text-ink"}`}>{d.day}</span>
            <span className={`h-2 w-2 rounded-full ${on ? "bg-primary" : "border border-line-strong bg-surface"}`} aria-hidden="true" />
            <span className="h-[15px] t-caption t-num text-text-3" aria-hidden="true">
              {on ? d.count : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 회색 견본 줄(관심 단지 0곳) — 데이터 없는 스파크 자리 윤곽 */
function GhostRow({ n }: { n: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-2.5 py-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
      <span className="min-w-0">
        <span className="block t-body text-text-3">{NA}</span>
        <span className="block t-caption text-text-3">관심 단지 {n}</span>
      </span>
      <svg viewBox="0 0 96 28" className="block h-7 w-full" aria-hidden="true" preserveAspectRatio="none">
        <path d="M2 16 H94" className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="3 3" fill="none" />
      </svg>
      <span className="text-right t-body text-text-3">{NA}</span>
    </li>
  );
}

export default async function AssistantPage() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) redirect(`/login?callbackUrl=${encodeURIComponent("/my/assistant")}`);

  const now = new Date();
  const [weekly, strip, schedules, contract, watch, watchSeries, savedCount, prefs] = await Promise.all([
    loadWeekly(email, now),
    loadWeekStrip(email, now),
    loadSchedules(email),
    loadContractDday(email, now),
    loadWatchCount(email),
    loadWatchSeries(email, now),
    loadSavedSearchCount(email),
    loadNotifyPrefs(email),
  ]);

  const n = (v: number) => `${v.toLocaleString("ko-KR")}건`;
  const counts = weekly.ok ? weekly.value : null;
  const week = strip.ok ? strip.value : null;
  const upcoming = schedules.ok ? schedules.value.filter((s) => (daysUntil(s.scheduledAt, now) ?? -1) >= 0) : null;
  const watchCount = watch.ok ? watch.value : null;
  const dday = contract.ok ? contract.value : null;
  const rows = watchSeries.ok ? watchSeries.value.rows : null;
  const watchTotal = watchSeries.ok ? watchSeries.value.total : watchCount;

  /* 비서 한 줄 — 이번 주(월~오늘) 새 실거래 알림의 건수 합 · 가격 변동 알림 수 · 다음 임장 D-day. 스트립을 못 읽었으면 지난 7일 집계로 */
  const nextInspection = upcoming && upcoming.length > 0 ? daysUntil(upcoming[0].scheduledAt, now) : null;
  const line =
    week || counts
      ? assistantLine({
          watchCount: watchTotal,
          txDeals: week ? week.txDeals : (counts?.tx ?? 0),
          price: week ? week.price : (counts?.price ?? 0),
          nextInspectionDays: nextInspection,
        })
      : null;
  const todayLabel = kstDay(now).slice(5);

  const p = prefs.ok ? prefs.value : null;
  const pushState: boolean | null = isWebPushConfigured() && p ? p.pushWeeklyDigest : null;
  const emailState: boolean | null = isEmailConfigured() && p ? p.emailWatchlistTx : null;

  /* 채움 파랑 하나 — 같은 요소를 레일(lg+)과 폰 하단 바(lg 미만)가 나눠 그린다 */
  const openChat = (
    <Link href="/agent" className="btn-primary btn-md press w-full gap-1.5 no-underline">
      <Icon name="message-circle" size={16} />
      대화 열기
    </Link>
  );

  return (
    <PageShell wide>
      <div className="nz-dot-blue">
        <PageHead
          icon="bot"
          title="AI 비서"
          sub={`${watchTotal !== null ? `관심 단지 ${watchTotal}곳 · ` : ""}${week ? week.rangeLabel : counts ? weekRangeLabel(counts) : "알림·일정·감시 자동 실행 기록"}`}
        />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
          <div className="flex min-w-0 flex-col gap-3">
            {/* ① 비서 한 줄 + 이번 주 7일 */}
            <section className="card p-[var(--pad-card)]" aria-labelledby="as-week-title">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
                  <ToolGlyph id="agent" size={24} />
                </span>
                <div className="min-w-0 flex-1 rounded-lg bg-bg px-3 py-2.5">
                  {line ? (
                    <p className="t-title text-ink">{line}</p>
                  ) : (
                    <p className="t-title text-text-3">이번 주 알림 불러오기 실패 · 잠시 후 다시</p>
                  )}
                  <p className="mt-1 t-caption text-text-3">규칙으로 만든 한 줄 · 실거래·알림 기록만 · 매일 15:00 점검</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <h2 id="as-week-title" className="t-section text-ink">
                  이번 주
                </h2>
                <Link href="/notifications" className="t-caption text-text-3 no-underline">
                  알림 있는 날 파란 점 · 오늘 {todayLabel} ›
                </Link>
              </div>
              {week ? (
                <>
                  <div className="mt-2">
                    <DayStrip days={week.days} />
                  </div>
                  <p className="mt-2 t-caption text-text-3">
                    {week.total === 0
                      ? "이번 주 알림 없음 · 관심 단지를 담으면 새 실거래·가격 변동을 알립니다"
                      : `이번 주 알림 ${n(week.total)} · ${INBOX_KIND_LABEL.tx} ${n(week.txNotices)} · ${INBOX_KIND_LABEL.price} ${n(week.price)}`}
                  </p>
                </>
              ) : (
                <>
                  <ol className="m-0 mt-2 grid list-none grid-cols-7 gap-1 p-0" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, i) => (
                      <li key={i} className="flex h-[68px] flex-col items-center justify-center rounded-lg border border-dashed border-line-strong">
                        <span className="h-2 w-2 rounded-full border border-line-strong" />
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 t-sub text-text-3">최근 7일 알림 불러오기 실패 · 잠시 후 다시</p>
                </>
              )}
              {counts && counts.total > 0 && (
                <div className="as-strip mt-2 grid grid-cols-2 md:grid-cols-4" aria-label="최근 7일 알림">
                  <Stat k={INBOX_KIND_LABEL.tx} v={n(counts.tx)} />
                  <Stat k={INBOX_KIND_LABEL.price} v={n(counts.price)} />
                  <Stat k={INBOX_KIND_LABEL.saved} v={n(counts.saved)} />
                  <Stat k={INBOX_KIND_LABEL.digest} v={counts.digest > 0 ? n(counts.digest) : NA} />
                </div>
              )}
            </section>

            {/* ② 관심 단지 30일 — 마지막 거래가 · 30일 새 거래 수 · 스파크(2건 이상일 때만) */}
            <section className="card p-[var(--pad-card)]" aria-labelledby="as-series-title">
              <div className="flex items-center justify-between gap-2">
                <h2 id="as-series-title" className="t-section text-ink">
                  관심 단지 30일
                </h2>
                <span className="t-caption text-text-3">마지막 거래가 · 30일 새 거래 수</span>
              </div>
              {rows === null ? (
                <p className="mt-2 t-sub text-text-3">관심 단지 불러오기 실패 · 잠시 후 다시</p>
              ) : rows.length === 0 ? (
                <>
                  <ul className="m-0 mt-1 flex list-none flex-col divide-y p-0" data-tone="plain" aria-hidden="true">
                    <GhostRow n={1} />
                    <GhostRow n={2} />
                    <GhostRow n={3} />
                  </ul>
                  <p className="mt-2 t-sub text-text-2">관심 단지를 담으면 단지마다 마지막 거래가와 30일 거래 선이 여기에 그려집니다</p>
                </>
              ) : (
                <ul className="m-0 mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
                  {rows.map((r) => {
                    const sr = r.series.ok ? r.series.value : null;
                    const last = sr?.last ?? null;
                    const sub = last
                      ? [last.area !== null ? `${Math.round(last.area)}㎡` : null, last.floor !== null ? `${last.floor}층` : null].filter(Boolean).join(" · ")
                      : "";
                    return (
                      <li key={r.complexId} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-2.5 py-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                        <span className="min-w-0">
                          <Link href={complexHrefFromId(r.complexId)} className="block truncate t-body font-bold text-ink no-underline">
                            {r.complexName}
                          </Link>
                          <span className="block t-caption text-text-3">{sub || (sr ? "마지막 거래 " + dealDayLabel(last) : "")}</span>
                        </span>
                        <span className="block text-primary" aria-hidden="true">
                          {sr?.spark ? (
                            <Spark values={sr.spark} width={96} height={28} className="block h-7 w-full" />
                          ) : (
                            <svg viewBox="0 0 96 28" className="block h-7 w-full" preserveAspectRatio="none">
                              <path d="M2 16 H94" className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="3 3" fill="none" />
                            </svg>
                          )}
                        </span>
                        <span className="text-right">
                          <span className={`block t-body t-num ${last ? "text-ink" : "font-medium text-text-3"}`}>{last ? formatEokMan(last.man) : NA}</span>
                          <span className="block t-caption text-text-3">
                            {!sr ? "불러오지 못함" : !last ? "거래 자료 —" : `${dealDayLabel(last)} · 30일 ${n(sr.count30)}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rows !== null && rows.length > 0 && rows.length < (watchSeries.ok ? watchSeries.value.total : 0) && (
                <p className="mt-1 t-caption text-text-3">
                  여기에는 {rows.length}곳 · 전체 {watchSeries.ok ? watchSeries.value.total : 0}곳은 관심 단지 화면에서
                </p>
              )}
              <WatchAddForm count={rows?.length ?? 0} max={WATCH_SERIES_MAX} />
            </section>

            {/* ③ 다음 할 일 */}
            <section className="card p-[var(--pad-card)]" aria-labelledby="as-next-title">
              <div className="flex items-center justify-between gap-2">
                <h2 id="as-next-title" className="t-section text-ink">
                  다음 할 일
                </h2>
                <span className="t-caption text-text-3">
                  임장 {upcoming === null ? NA : `${upcoming.length}건`}
                  {contract.ok && dday ? ` · 계약 ${dDayLabel(dday.days)}` : ""}
                </span>
              </div>
              <ul className="mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
                {upcoming === null ? (
                  <li className="flex items-center justify-between gap-3 py-2.5">
                    <span className="t-body text-text-1">임장 일정</span>
                    <span className="t-sub text-text-3">불러오지 못함</span>
                  </li>
                ) : upcoming.length === 0 ? (
                  <li className="flex items-center justify-between gap-3 py-2.5">
                    <span className="t-body text-text-1">임장 일정</span>
                    <span className="t-sub text-text-3">없음</span>
                  </li>
                ) : (
                  upcoming.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate t-body font-semibold text-text-1">{s.aptName?.trim() || s.title}</span>
                        <span className="block t-caption text-text-3">
                          {formatKstDateTime(s.scheduledAt) || kstDay(s.scheduledAt)}
                          {s.region ? ` · ${s.region}` : ""}
                        </span>
                      </span>
                      <Dday days={daysUntil(s.scheduledAt, now)} />
                    </li>
                  ))
                )}
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block t-body text-text-1">계약 D-day</span>
                    {dday && (
                      <span className="block t-caption text-text-3">
                        {dday.label} · {dday.date}
                      </span>
                    )}
                  </span>
                  {contract.ok ? (
                    dday ? (
                      <Dday days={dday.days} />
                    ) : (
                      <Link href="/journey/contract" className="shrink-0 t-sub text-text-3 no-underline">
                        없음 · 일정표 ›
                      </Link>
                    )
                  ) : (
                    <span className="shrink-0 t-sub text-text-3">불러오지 못함</span>
                  )}
                </li>
              </ul>
              <details className="mt-1">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 t-sub font-bold text-primary">
                  <Icon name="plus" size={16} />
                  일정 추가
                </summary>
                <ScheduleForm />
              </details>
            </section>

            {/* ④ 지켜보는 것 */}
            <section className="card p-[var(--pad-card)]" aria-labelledby="as-watch-title">
              <div className="flex items-center justify-between gap-2">
                <h2 id="as-watch-title" className="t-section text-ink">
                  지켜보는 것
                </h2>
                <span className="t-caption text-text-3">매일 15:00 점검</span>
              </div>
              <ul className="mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
                <li>
                  <Link href="/my/watchlist" className="flex min-h-10 items-center justify-between gap-3 py-2.5 no-underline">
                    <span>
                      <span className="block t-body font-bold text-ink">관심 단지</span>
                      <span className="block t-caption text-text-3">새 실거래 · 가격 변동</span>
                    </span>
                    <span className="t-body font-bold t-num text-ink">{watchCount === null ? NA : watchCount} ›</span>
                  </Link>
                </li>
                <li>
                  <Link href="/my/watchlist" className="flex min-h-10 items-center justify-between gap-3 py-2.5 no-underline">
                    <span>
                      <span className="block t-body font-bold text-ink">저장 검색</span>
                      <span className="block t-caption text-text-3">조건에 맞는 새 결과</span>
                    </span>
                    <span className="t-body font-bold t-num text-ink">{savedCount} ›</span>
                  </Link>
                </li>
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block t-body font-bold text-ink">알림 채널</span>
                    <span className="block t-caption text-text-3">
                      수신함 켜짐 · 푸시 {channelWord(pushState)} · 이메일 {channelWord(emailState)}
                    </span>
                  </span>
                  <Link href="/my/settings" className="shrink-0 t-sub text-text-3 no-underline">
                    설정 ›
                  </Link>
                </li>
              </ul>
            </section>

            <p className="t-caption text-text-3">{AI_DISCLAIMER}</p>
          </div>

          <aside className="hidden lg:sticky lg:top-[76px] lg:flex lg:flex-col lg:gap-3">
            <section className="card p-[var(--pad-card)]" aria-labelledby="as-ask-title">
              <h2 id="as-ask-title" className="t-section text-ink">
                비서에게 묻기
              </h2>
              <p className="mt-2 t-body text-text-1">
                {watchCount !== null && watchCount > 0 ? `관심 단지 ${watchCount}곳 · ` : ""}국토교통부 실거래 기준으로 답한다
              </p>
              <div className="mt-2">{openChat}</div>
            </section>
          </aside>
        </div>

        <MobilePrimaryBar label="비서에게 묻기">{openChat}</MobilePrimaryBar>
      </div>
    </PageShell>
  );
}
