import Link from "next/link";
import type { ReactNode } from "react";
import { formatKrwWon } from "@/lib/format/krw";
import { formatYm } from "@/lib/market/format";
import { decisionLabel, type NoteDecision } from "@/lib/inspection/decision";
import { AreaBandText } from "./AreaBandText";

/* ============================================================
   [993 → v4 · 규칙 2] 임장노트 판단 — 상세의 **주인공 한 덩어리**.

   예전: 유리판(.lg-glass) 카드 안에 띠 배지 · 결론 문장 · 사실 3칸(방문·체크·대표가 타일) ·
   파랑 버튼, 그리고 오른쪽 사이드바(데스크톱) / 맨 끝(모바일)에 점수 도넛 · 축 막대 · "기록 완성도"
   카드가 따로 있었다 — 같은 점수·체크가 두 번 나왔다.
   지금: 한 덩어리 — 큰 숫자(기록 점수, t-display) + 축 점수 한 줄 → 내 판단(있으면) · AI 결론(있으면) ·
   추천 행동 → 구분선 행(체크 · 대표 실거래가) → 채움 파랑 1개. 방문일은 머리 사실 줄에 있어 여기서 뺐다
   (같은 사실 한 번). 서버 조각 — 값은 전부 page.tsx 가 계산한 것이고 여기서 새 수치를 만들지 않는다.
   ============================================================ */

export type NoteVerdictProps = {
  /** 저장된 결론(inspectionReport.verdict) — 없으면 null(규칙 문장을 지어 채우지 않는다) */
  verdict: string | null;
  /** 결론이 LLM 결과인가 — 라벨 "AI 결론" / "규칙 결론" */
  verdictIsLlm: boolean;
  recommendedAction: string | null;
  totalScore: number | null;
  scoredAxisCount: number;
  /** 입력된 축만(0 = 미입력은 빠진다) — value 는 ×20 환산, bad 는 2/5 이하 */
  scoreBars: Array<{ label: string; value: number; bad: boolean }>;
  checklistDone: number;
  checklistTotal: number;
  /** 단지가 실거래와 매칭될 때만 — 없으면 행을 그리지 않는다.
      [1006] bandLabelPyeong — 같은 구간의 평 표기. 설정(면적 단위)이 평이면 클라이언트 섬이 이걸 고른다 */
  price: { priceKrw: number; bandLabel: string; bandLabelPyeong?: string; latestYm: string } | null;
  /** 채움 파랑 1개 — 화면의 유일한 btn-primary */
  next: { label: string; href: string };
  /** 버튼 아래 캡션 한 줄(저장 직후 AI 진단의 포인트 등) — 없으면 null */
  nextCaption?: string | null;
  /** [996 · 4] 작성자의 판단 — 없으면 null */
  decision?: NoteDecision | null;
  /** [996 · 4] 판단이 없을 때 소유자에게만 보이는 "판단 남기기" 링크(수정 화면 3단계) */
  decisionEditHref?: string | null;
};

/** 행 — 단지 허브 SummaryRow 와 같은 모양(왼쪽 이름 + 보조 한 줄 / 오른쪽 값) */
function Row({ label, sub, value }: { label: string; sub?: ReactNode; value: ReactNode }) {
  return (
    <li className="flex min-h-14 items-center justify-between gap-x-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block t-body font-bold text-ink">{label}</span>
        {sub ? <span className="mt-0.5 block truncate t-sub text-text-3">{sub}</span> : null}
      </span>
      <span className="shrink-0 t-body t-num text-ink">{value}</span>
    </li>
  );
}

export function NoteVerdictCard(p: NoteVerdictProps) {
  const decision = p.decision ?? null;
  const verdict = p.verdict?.trim() || null;
  /* 근거를 이어 붙인 문장과 결론이 같으면 두 번 읽히지 않게 뺀다 */
  const verdictDuplicate = decision != null && verdict != null && decision.reasons.join(" · ").trim() === verdict;
  const unchecked = Math.max(p.checklistTotal - p.checklistDone, 0);

  return (
    <section aria-label="이 노트의 판단" className="flex flex-col gap-4">
      {/* 주인공 — 기록 점수(입력된 축 평균 × 20). 없으면 숫자를 지어내지 않고 "미입력" */}
      <div>
        <p className="t-sub text-text-3">
          기록 점수{p.totalScore != null ? ` · ${p.scoredAxisCount}개 축 평균` : ""}
        </p>
        {p.totalScore != null ? (
          <p className="t-display t-num text-ink">
            {p.totalScore}
            <span className="ml-1 t-section font-medium text-text-3">/ 100</span>
          </p>
        ) : (
          <p className="t-section text-text-3">미입력</p>
        )}
        {p.scoreBars.length > 0 && (
          <p className="t-sub text-text-3">
            {p.scoreBars.map((b, i) => (
              <span key={b.label}>
                {i > 0 ? " · " : ""}
                {b.label} <span className={`font-bold ${b.bad ? "text-danger" : "text-text-2"}`}>{b.value}</span>
              </span>
            ))}
          </p>
        )}
      </div>

      {(decision || verdict || p.recommendedAction || p.decisionEditHref) && (
        <div className="flex flex-col gap-1.5">
          {decision && (
            <>
              <p className="t-section text-ink">내 판단 · {decisionLabel(decision.choice)}</p>
              {decision.reasons.length > 0 && (
                <ul className="flex flex-col gap-0.5 t-body text-text-1">
                  {decision.reasons.slice(0, 3).map((r) => (
                    <li key={r} className="flex gap-1.5">
                      <span aria-hidden="true" className="shrink-0 text-text-3">
                        ·
                      </span>
                      <span className="min-w-0">{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {/* 결론의 출처를 문장 앞에 적는다 — AI 가 쓴 문장과 작성자의 판단을 섞어 읽지 않게 */}
          {verdict && !verdictDuplicate && (
            <p className="t-body text-text-1">
              <b className="font-bold text-text-3">{p.verdictIsLlm ? "AI 결론" : "규칙 결론"}</b> {verdict}
            </p>
          )}
          {p.recommendedAction && (
            <p className="t-body text-text-1">
              <b className="font-bold text-text-3">추천 행동</b> {p.recommendedAction}
            </p>
          )}
          {!decision && p.decisionEditHref && (
            <p className="t-sub text-text-3">
              내 판단 없음 ·{" "}
              <Link href={p.decisionEditHref} className="tap-line font-bold text-primary no-underline">
                판단 남기기 ›
              </Link>
            </p>
          )}
        </div>
      )}

      {/* 사실 행 — 체크 · 대표 실거래가(매칭될 때만). [1008 · 리뷰 A-14] "무엇의 평균인지"를 보조 줄에 */}
      <ul data-tone="blue" className="divide-y divide-line border-y border-line">
        <Row
          label="체크"
          sub={p.checklistTotal > 0 ? `미확인 ${unchecked}건` : "체크 항목 없음"}
          value={`${p.checklistDone}/${p.checklistTotal}`}
        />
        {p.price && (
          <Row
            label="대표 실거래가"
            sub={
              <>
                <AreaBandText m2={p.price.bandLabel} pyeong={p.price.bandLabelPyeong ?? p.price.bandLabel} /> 최근 최대
                6건 평균 · {formatYm(p.price.latestYm)} · 국토부
              </>
            }
            value={formatKrwWon(p.price.priceKrw, { style: "short" })}
          />
        )}
      </ul>

      {/* [v4 · 규칙 2] 채움 파랑은 화면에 이것 하나 */}
      <div className="flex flex-col gap-1">
        <Link
          href={p.next.href}
          className="btn-primary flex min-h-12 items-center justify-center rounded-lg px-4 text-center t-body no-underline"
        >
          {p.next.label}
        </Link>
        {p.nextCaption && <p className="t-caption text-text-3">{p.nextCaption}</p>}
      </div>
    </section>
  );
}
