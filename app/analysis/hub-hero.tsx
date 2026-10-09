"use client";
/* [1023 · AI 분석] 검색 카드 아래 최근 실행 결과 3건(HubRecentRuns, history-store) · 단지 고른 뒤 실행 4칸에 "마지막 실행 N일 전"
   캡션(같은 저장소를 단지 id 로 조회 — 기록이 있는 칸만). 마운트 뒤 읽는다(서버 HTML 은 비움). */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { Fineprint } from "@/app/components/Fineprint";
import { PageHead } from "@/app/components/PageHead";
import { ComplexPicker } from "./ComplexPicker";
import { ToolGlyph, WORKBENCH_GLYPH } from "./ToolGlyph";
import {
  TIERS,
  WORKBENCH_CORE,
  type TierId,
} from "./tool-catalog";
import { useHubPicked } from "./hub-context";
import { LastToolChip } from "./tool-cards-client";
import { HubRecentRuns, recentRunWhen } from "./hub-recent";
import { findLastRun } from "@/lib/ai/history-store";

/* ============================================================
   분석 허브 히어로 — [UI-05 · UI-10 · 958]

   UI-05: 검색이 화면 첫 요소. UI-10: 절차는 화면당 한 번(스텝퍼).
   958: 브랜드 네이비 면으로 통일(전문가·동네이야기 허브와 같은 규칙), 그리고
   **말을 사실에 맞춘다** —
     · "보통 1분 안팎" 같은 미측정 약속을 뺐다.
     · 기본 실행은 규칙 계산이고 AI 서술은 선택(로그인)이라는 걸 스텝퍼가 말한다.
     · 무료·플러스·프로 월 한도를 실행 전에 보여 준다(예전엔 다 쓴 뒤에야 알았다).
     · 커버리지(실거래·단지·지역 수)는 홈과 같은 6시간 캐시 실측값 — 0이면 0.
   ============================================================ */

/* [1015 · 규칙 B] 사용법 스텝퍼("1 단지 고르기 → 2 숫자·그래프로 결과")는 걷었다 — 검색칸 하나면 무엇을 하는 화면인지 보인다. */

const TIER_ORDER: readonly TierId[] = ["complex", "market", "record"];

export type HubCoverage = {
  txCount: number | null;
  complexCount: number | null;
  regionCount: number | null;
};

/** 월 한도 — lib/subscriptions/access.ts FEATURE_RULES.ai_analysis 와 같은 숫자(서버에서 넘겨 받는다) */
/* [993] 무료는 누적(lifetime) 한도, 유료는 월 한도 — 라벨이 다르다. pro(프로 플랜)는 판매 중일 때만(sell-config). */
export type HubQuota = { free: number; freeLifetime: boolean; plus: number; pro: number | null; proOnSale: boolean };

/** 계열 3개로 바로 가는 내비 — 이 페이지의 뼈대가 질문 3개라는 걸 상단에서 알린다. */
function TierNav() {
  const [active, setActive] = useState<TierId | null>(null);

  useEffect(() => {
    const secs = TIER_ORDER.map((id) => document.getElementById(`tier-${id}`)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (secs.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace("tier-", "") as TierId);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label="분석 계열 바로가기"
      className="scroll-x-hidden-bar -mx-1 flex w-full gap-1.5 px-1 md:mx-0 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:px-0"
    >
      {TIER_ORDER.map((id) => {
        const t = TIERS[id];
        const on = active === id;
        return (
          <a
            key={id}
            href={`#tier-${id}`}
            aria-current={on ? "true" : undefined}
            className={`chip t-sub shrink-0 px-3 py-1.5 font-bold no-underline transition-colors ${
              on ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            {t.question}
          </a>
        );
      })}
    </nav>
  );
}

/* [961] 숫자가 도착하는 방식 — 실측값을 900ms 동안 세어 올라온다(CountUp). null 은 — */
function Num({ n }: { n: number | null }) {
  return n === null ? <>—</> : <CountUp value={n} />;
}

export function HubHero({
  initialComplexId,
  initialApt,
  coverage,
  quota,
  toolCount,
  toolTitles = {},
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
  coverage: HubCoverage;
  quota: HubQuota;
  toolCount: number;
  /** [1050 · 번들] 도구 id → 이름(서버 workbenchCardData) — tool-identity 를 브라우저 번들에 싣지 않는다 */
  toolTitles?: Readonly<Record<string, string>>;
}) {
  const { picked, setPicked, query: q, openMap } = useHubPicked();
  /* [1052] 좁은 화면 판정(970 · B-28)은 걷었다 — 두 갈래 placeholder 가 같은 글("단지명 검색")이 된 뒤로 하는 일 없는 상태였다 */
  const regionHref = picked?.regionId
    ? `/analysis/timing?region=${encodeURIComponent(picked.regionId)}`
    : `/analysis/timing${q}`;
  /* [1023] 실행 4칸의 "마지막 실행 N일 전" — 고른 단지 id 로 history-store 조회(기록이 있는 칸만). picked 는 마운트 뒤에만 생긴다 */
  const pickedId = picked?.id ?? null;
  const [lastRun, setLastRun] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!pickedId) {
      setLastRun({});
      return;
    }
    const next: Record<string, string> = {};
    for (const id of WORKBENCH_CORE) {
      try {
        const e = findLastRun(id, pickedId);
        const when = e ? recentRunWhen(e.createdAt) : null;
        if (when) next[id] = when;
      } catch {
        /* 저장소 읽기 실패 — 캡션만 없다 */
      }
    }
    setLastRun(next);
  }, [pickedId]);

  /* [1021] 소유자(허브 머리 캡처): "이 문구와 디자인도 바꿔줘 구성도 함께". 슬로건 히어로(카드·워터마크·통계 띠·한도 띠)를 걷고
     다른 도구 머리와 같은 **흰 머리 한 줄**로: 아이콘 칩 + "AI 분석" + 사실 한 줄(실거래·단지·도구 수는 같은 실측값을 글자 안에) |
     오른쪽 최근 사용 칩 + 계열 칩 3개. 검색 카드는 그대로 첫 조작. 한도는 검색 아래 캡션 한 줄. */
  return (
    <section className="rise-in flex flex-col gap-3 max-md:gap-2.5">
      {/* [1022 · 정렬·글씨·테마] 머리는 공용 PageHead(아이콘 칩 40 · h1.t-title · 사실 한 줄 | 오른쪽 칩) — 임장노트·동네와 같은 한 줄 */}
      <PageHead
        icon="sparkles"
        title="AI 분석"
        sub={
          <>
            단지 하나로 종합 진단 · 시세 예측 · 임장 동선 · 매수 타이밍
            {/* [1028] 실거래 건수·단지 수를 못 읽었으면(null) 그 조각을 통째로 뺀다 — "실거래 —건" 으로 그리지 않는다 */}
            <span className="max-md:hidden">
              {coverage.txCount !== null && (
                <>
                  {" "}· 실거래 <b className="t-num text-ink"><Num n={coverage.txCount} /></b>건
                </>
              )}
              {coverage.complexCount !== null && (
                <>
                  {" "}· 단지 <b className="t-num text-ink"><Num n={coverage.complexCount} /></b>곳
                </>
              )}
              {" "}· 도구 <b className="t-num text-ink"><CountUp value={toolCount} /></b>개
            </span>
          </>
        }
        subOnPhone
        actions={
          <div className="flex flex-col items-start gap-2 md:items-end">
            <LastToolChip />
            <TierNav />
          </div>
        }
      />

      {/* 검색 — 이 화면의 출발점(UI-05) */}
      <div className="card rounded-2xl p-3.5">
        <ComplexPicker
          initialComplexId={initialComplexId}
          initialApt={initialApt}
          onSelect={setPicked}
          showChip={false}
          label="단지 검색"
          /* [1015 · 규칙 B] 예시("예: 은마아파트")는 걷었다 — 폰·데스크톱 같은 한마디 */
          placeholder="단지명 검색"
          /* [975] 이름을 몰라도 시작할 수 있게 — /map 으로 나갔다 돌아오는 대신
             이 자리에서 지도를 연다. 임장은 보통 "여기 뭐지?"로 시작한다. */
          onMapClick={() => openMap()}
        />

      </div>

      {/* [1023] 최근 실행 결과 3건 — 기록이 있을 때만(마운트 뒤) */}
      <HubRecentRuns titles={toolTitles} />

      {/* 고른 즉시 실행 지점을 띄운다 — 다시 아래로 찾아 내려갈 필요가 없다 */}
      {picked && (
        <div className="card flex flex-col gap-2.5 rounded-2xl p-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="t-section text-ink">{picked.name}</span>
            {picked.regionLabel && (
              <span className="t-sub font-bold text-text-2">{picked.regionLabel}</span>
            )}
            {/* [1009 · A] 이 값은 최근 거래 달의 **월평균**(평형 섞임)이다 — "평균"이라고 적는다(표기 표준) */}
            {picked.priceLabel && (
              <span className="t-sub t-num text-text-2">최근 월평균 {picked.priceLabel}</span>
            )}
            {/* [1015 · 규칙 C] "실데이터 기준" 배지는 걷었다 */}
          </div>

          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {WORKBENCH_CORE.map((id) => {
              const title = toolTitles[id] ?? id;
              return (
                <Link
                  key={id}
                  href={`/analysis/ai/${id}${q}`}
                  className="tile card flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 py-2 no-underline"
                >
                  <span className="tile-ico flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <ToolGlyph id={WORKBENCH_GLYPH[id] ?? "radar"} size={22} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-sub truncate font-bold text-ink">{title}</span>
                    {/* [1023] 같은 단지로 실행한 기록이 있을 때만 */}
                    {lastRun[id] && (
                      <span className="t-caption truncate text-text-3">
                        {lastRun[id] === "오늘" ? "오늘 실행" : `마지막 실행 ${lastRun[id]}`}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Link href={regionHref} className="chip chip-soft t-sub px-3 py-1.5 no-underline">
              이 지역 시세·타이밍 ›
            </Link>
            <Link
              href={`/analysis/scenario${q}`}
              className="chip chip-soft t-sub px-3 py-1.5 no-underline"
            >
              시장·대출 시나리오 ›
            </Link>
            <Link
              href={`/analysis/compare${q}`}
              className="chip chip-soft t-sub px-3 py-1.5 no-underline"
            >
              후보 단지 비교에 담기 ›
            </Link>
            <a href="#ai-note-analysis" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
              내 임장노트와 함께 보기 ›
            </a>
          </div>
        </div>
      )}

      {/* 한도 — 실행 전에 미리. [1036 · 밀도] 캡션 한 줄 → 접힘(라벨만 보임) */}
      <Fineprint className="px-1" label="단지 분석 한도">
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          무료 <b className="text-ink">{quota.freeLifetime ? `누적 ${quota.free}회` : `월 ${quota.free}회`}</b>
        </span>
        <span>
          플러스 <b className="text-ink">월 {quota.plus}회</b>
        </span>
        {quota.proOnSale && (
          <span>
            프로 <b className="text-ink">{quota.pro === null ? "무제한" : `월 ${quota.pro}회`}</b>
          </span>
        )}
        <Link href="/subscription" className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
          요금제 보기 ›
        </Link>
      </p>
      </Fineprint>
    </section>
  );
}
