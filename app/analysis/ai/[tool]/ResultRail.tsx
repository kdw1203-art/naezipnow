"use client";
/* [1026b · AI 분석 8종] 레일을 12종이 같이 쓴다 — 다음 행동 카드의 채움 파랑(주 행동)은 도구마다 하나(lib/ai/conclusion-next RAIL_PRIMARY):
   단지 분석 4종·리스크 점검·갭투자 진단·수익률 계산 "임장노트에 담기"(같은 노트 링크 규칙 — verdictNextActions noteHandoff) ·
   다른 단지와 비교 "결정 카드에 담기"(담은 단지 전부 → 비교함 → /decide) · 경제지표 모니터 "이 지역 알림 받기"(/notifications) ·
   내 자산 구성 진단·계약 리스크 점검 "이 단지 임장노트 쓰기" · 투자 체크리스트 "체크리스트로 노트 시작"(안 한 항목 → 노트 고려사항, 예전 규칙).
   예전 8종의 도구 색 채움(리스크 빨강 "이 단지 임장노트 쓰기" · 수익률 초록 …)과 "로그인하고 AI 해설 받기"(채움)는 이 카드의 한 요소 +
   텍스트 링크로. 경제지표의 기준금리 알림 패널(EconomyWatch — 보조 버튼)도 이 청크. btn-primary 리터럴은 이 파일에 하나. */
/* [1026 · 단지 분석 4종] 1025 표준 — 레일 = 내 조건(손잡이 · "다시 계산"은 보조 버튼, WorkbenchClient 가 만든다) + **다음 행동 카드 하나**:
   채움 파랑 1 "임장노트에 담기"(결론·핵심 숫자가 메모 초안으로 — verdictNextActions.primary) + 텍스트 링크
   "결정 카드에 담기"(비교함 → /decide 후보) · "관심 단지 담기"(useWatchAdd) · "AI 해설 받기"(로그인 필요 — 게스트는 로그인 링크)
   · 결과 링크 복사(실행 뒤). 도구별 초록·주황 채움(btn-soft · 이 코스로 임장노트 쓰기 btn-primary 초록)은 걷었다 — 파랑 하나.
   같은 버튼 요소(primary) 하나를 데스크톱 카드(lg+)와 폰 하단 바(MobilePrimaryBar)가 나눠 그린다 — btn-primary 리터럴 1.
   레일은 한 번만 그려진다: 폰에서는 본문 뒤에 이어지고(내 조건 카드는 lg 에서만 — 폰은 결론 아래 접이식), 데스크톱은 sticky.
   "이어서 보기" 칩은 결론 아래 다른 도구 칩 줄(VerdictChips)로 옮겼다. 매수 타이밍의 "이 지역 알림"은 링크 하나(채움 없음).
   next/dynamic(ssr:false) — 워크벤치 본체 번들(480KB)에 싣지 않는다(MobilePrimaryBar 도 이 청크). */
/* [1022 · 단지 분석 고도화] 지시 3 — 매수 타이밍 레일에 "이 지역 알림" 카드(기존 알림함 /notifications 링크만 — /analysis/timing 의
   같은 카드와 같은 문구·같은 링크, 새 알림 기능 없음). */
/* [1021 · 단지 분석 /analysis/ai] 오른쪽 레일(단지 분석 4종) — ① 내 조건(TuningForm · 다시 계산, 기존 로직) ② 이 결과로 ③ 이어서 보기. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { Verdict } from "@/lib/ai/verdict";
import { verdictNextActions } from "@/lib/ai/next-action-routing";
import { RAIL_PRIMARY, checklistHandoffItems } from "@/lib/ai/conclusion-next";
import { addToCompareTray } from "@/lib/newui/compare-tray";
import { useCopy } from "@/lib/ui/use-copy";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { useToast } from "@/app/components/toast/ToastProvider";
import { checklistKey, useWatchAdd } from "./ResultView";
import { EconomyWatch } from "./EconomyWatch";
import type { PickedLite, RunResult } from "./workbench-types";

export function RailCard({ title, children, id, className = "" }: { title: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`card flex scroll-mt-20 flex-col gap-2 rounded-2xl p-4 max-md:p-3.5 ${className}`} aria-label={title}>
      <h2 className="t-section font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** 액션 카드의 텍스트 링크 — 채움·테두리 없음, 폰 40px */
const TEXT_LINK = "inline-flex min-h-[40px] items-center gap-1.5 t-sub font-bold text-primary no-underline";

export type RailAi = {
  /** 로그인 여부 — 게스트는 로그인 링크로 보낸다(401 을 맞으러 가지 않는다) */
  signedIn: boolean;
  running: boolean;
  /** AI 해설 받기(기존 실행 — 내 조건 + 외부 AI 모델) */
  onAsk: () => void;
};

export function ResultRail({
  tool,
  picked,
  verdict,
  result,
  condition,
  ai = null,
  compareTray = null,
  economyRate = null,
}: {
  tool: AiAnalysisToolId;
  picked: PickedLite | null;
  verdict: Verdict | null;
  result: RunResult | null;
  /** 내 조건 카드 안(TuningForm + 다시 계산 버튼) — 없으면 카드를 그리지 않는다(데스크톱만 — 폰은 결론 아래 접이식) */
  condition?: ReactNode;
  /** AI 해설 링크 — 서버에 외부 모델 키가 없으면 null(링크를 그리지 않는다) */
  ai?: RailAi | null;
  /** [1026b] 다른 단지와 비교 — 담은 단지(결정 카드 후보로 전부 담는다) */
  compareTray?: PickedLite[] | null;
  /** [1026b] 경제지표 모니터 — 지금 기준금리(있을 때만 알림 패널) */
  economyRate?: number | null;
}) {
  const shareUrl = result?.ok && result.runId ? `/analysis/ai/r/${result.runId}` : null;
  const { copy, copied } = useCopy("결과 링크를 복사했어요");
  const { watch, addWatch } = useWatchAdd(picked);
  const { showToast } = useToast();
  const loginHref = `/login?callbackUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : `/analysis/ai/${tool}`)}`;
  const spec = RAIL_PRIMARY[tool];
  /* 노트 링크 — 결론·핵심 숫자가 메모 초안으로 들어간다(단지 분석 4종 규칙을 12종 모두에 · next-action-routing) */
  const noteHref = picked
    ? verdictNextActions({ tool, verdict, complexId: picked.id, complexName: picked.name, region: picked.region, noteHandoff: true }).primary.href
    : "/notes/new";
  /* 결정 카드 후보 담기(비교함 → /decide) — 비교 도구는 담은 단지 전부, 나머지는 이 단지 */
  const addDecide = (items: readonly PickedLite[]) => {
    let added = 0;
    let fail: "full" | "unavailable" | null = null;
    for (const it of items) {
      const r = addToCompareTray({ id: it.id, name: it.name, region: it.region });
      if (r.ok) added += 1;
      else fail = fail ?? r.reason;
    }
    showToast(
      fail === "unavailable"
        ? "이 브라우저에서는 담을 수 없어요(저장 공간이 막혀 있어요)"
        : fail === "full"
          ? "후보가 가득 찼어요 · 최대 5곳이에요"
          : added > 1
            ? `결정 카드 후보에 담았어요 · ${added}곳`
            : `결정 카드 후보에 담았어요 · ${items[0]?.name ?? ""}`,
    );
  };
  /* [AI-24] 체크리스트 → 노트 고려사항 — 아직 체크하지 않은 항목(최대 10개)을 넘긴다(예전 규칙 · 누를 때 이 기기의 체크 상태를 읽는다) */
  const handoffChecklist = () => {
    try {
      const raw = window.localStorage.getItem(checklistKey(picked?.id ?? null));
      const items = checklistHandoffItems(verdict?.checklist, new Set<string>(raw ? (JSON.parse(raw) as string[]) : []));
      if (items.length) window.localStorage.setItem("nz_ai_checklist", JSON.stringify({ at: Date.now(), items }));
      else window.localStorage.removeItem("nz_ai_checklist");
    } catch {
      /* 저장 실패해도 이동은 그대로 */
    }
  };
  const decideItems = compareTray && compareTray.length > 0 ? compareTray : picked ? [picked] : [];
  const target: { href: string; icon: string; onClick?: () => void } =
    spec.kind === "decide"
      ? { href: "/decide", icon: "clipboard", onClick: () => addDecide(decideItems) }
      : spec.kind === "alert"
        ? { href: "/notifications", icon: "bell" }
        : spec.kind === "checklist"
          ? { href: `${noteHref}${noteHref.includes("?") ? "&" : "?"}fromChecklist=1`, icon: "notebook-pen", onClick: handoffChecklist }
          : { href: noteHref, icon: "notebook-pen" };
  /* 채움 파랑 — 이 화면에 하나. 데스크톱은 아래 카드, 폰은 하단 바(같은 요소) */
  const primary = (
    <Link href={target.href} onClick={target.onClick} className="btn-primary btn-md w-full gap-1.5 no-underline">
      <Icon name={target.icon} size={16} /> {spec.label}
    </Link>
  );
  /* 결론 요약 한 줄 — 대상(단지 · 비교는 N곳) · 판정 · 대표 수치(숫자일 때만) */
  const m = verdict?.metric ?? null;
  const many = Boolean(compareTray && compareTray.length >= 2);
  const who = many ? `${compareTray!.length}곳` : (picked?.name ?? null);
  /* 비교의 대표 수치("비교 대상 N곳")는 앞의 "N곳"과 같은 말이라 뺀다 */
  const summary = [who, verdict?.bandLabel ?? null, !many && m && /\d/.test(m.value) ? `${m.value}${m.unit ?? ""}` : null].filter(Boolean).join(" · ");
  const hasLinks = Boolean(picked || ai || shareUrl);
  return (
    <>
      {condition && (
        <RailCard title="내 조건" className="max-lg:hidden">
          {condition}
        </RailCard>
      )}
      {/* 폰에서 링크가 하나도 없으면(경제지표 · AI 해설 없음) 카드를 비워 두지 않는다 — 주 행동은 하단 바가 든다 */}
      <section className={`card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5 ${hasLinks ? "" : "max-lg:hidden"}`} aria-label="다음 행동">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h2 className="t-section font-bold text-ink">다음 행동</h2>
          {summary && <span className="min-w-0 t-caption tabular-nums text-text-3 break-words">{summary}</span>}
        </div>
        {/* 채움 파랑 — 데스크톱은 여기, 폰은 하단 바(같은 요소) */}
        <div className="max-lg:hidden">{primary}</div>
        {hasLinks && (
          <ul className="flex flex-wrap gap-x-4 lg:flex-col lg:gap-x-0" aria-label="이 결과로">
            {picked && spec.kind !== "decide" && (
              <li>
                <Link href="/decide" onClick={() => addDecide([picked])} className={TEXT_LINK}>
                  <Icon name="clipboard" size={16} /> 결정 카드에 담기 ›
                </Link>
              </li>
            )}
            {picked && (
              <li>
                {watch === "login" ? (
                  <Link href={loginHref} className={TEXT_LINK}>
                    <Icon name="heart" size={16} /> 관심 단지 담기 <span className="font-medium text-text-3">(로그인)</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void addWatch()}
                    disabled={watch === "busy" || watch === "done"}
                    aria-busy={watch === "busy" || undefined}
                    className={TEXT_LINK}
                  >
                    {watch === "busy" ? (
                      <span className="njn-ring njn-ring--ink" aria-hidden="true" />
                    ) : watch === "done" ? (
                      <span className="njn-pop-once inline-flex" aria-hidden="true">
                        <Icon name="check" size={16} />
                      </span>
                    ) : (
                      <Icon name="heart" size={16} />
                    )}
                    {watch === "done" ? "관심 단지에 담았어요" : watch === "busy" ? "담는 중" : watch === "fail" ? "관심 단지 다시 담기" : "관심 단지 담기"}
                  </button>
                )}
              </li>
            )}
            {ai && (
              <li>
                {ai.signedIn ? (
                  <button type="button" onClick={ai.onAsk} disabled={ai.running} aria-busy={ai.running || undefined} className={TEXT_LINK}>
                    {ai.running ? <span className="njn-ring njn-ring--ink" aria-hidden="true" /> : <Icon name="sparkles" size={16} />}
                    {ai.running ? "AI 해설 쓰는 중" : "AI 해설 받기"}
                  </button>
                ) : (
                  <Link href={loginHref} className={TEXT_LINK}>
                    <Icon name="sparkles" size={16} /> AI 해설 받기 <span className="font-medium text-text-3">(로그인)</span>
                  </Link>
                )}
              </li>
            )}
            {shareUrl && (
              <li>
                <button type="button" onClick={() => void copy(`${location.origin}${shareUrl}`)} className={TEXT_LINK}>
                  <Icon name={copied ? "check" : "link"} size={16} />
                  {copied ? "복사했어요" : "결과 링크 복사"}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
      {tool === "ai-timing" && picked && (
        <RailCard title="이 지역 알림">
          <p className="t-sub text-text-2 break-words">{picked.region} 실거래 등록·지수 변동</p>
          <Link href="/notifications" className={`${TEXT_LINK} self-start`}>
            <Icon name="bell" size={16} /> 알림 설정 ›
          </Link>
        </RailCard>
      )}
      {tool === "ai-economy" && economyRate != null && <EconomyWatch currentRate={economyRate} />}
      <MobilePrimaryBar label={spec.label}>{primary}</MobilePrimaryBar>
    </>
  );
}
