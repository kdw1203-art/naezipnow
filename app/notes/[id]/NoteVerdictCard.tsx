import Link from "next/link";
import { formatKrwWon } from "@/lib/format/krw";
import { formatYm } from "@/lib/market/format";
import { decisionBand, decisionLabel, type NoteDecision } from "@/lib/inspection/decision";

/* ============================================================
   [993] 임장노트 판단 카드 — 상세 첫 화면.

   왜: 31블록짜리 화면에서 결론(우측 400px 패널)이 모바일에선 맨 끝에 왔고, LLM 이
   만든 verdict·recommendedAction 은 DB 에 저장만 되고 그리지 않았다(카드 출력에서만).
   이 카드는 노트가 **말하려는 것** 한 장이다: 결론 · 추천 행동 · 기록 점수 · 사실 3개
   (방문일 · 체크 · 대표 실거래가+기준월) · 다음 행동 하나. 서버 컴포넌트 — 값은 전부
   호출부(page.tsx)가 이미 계산한 것이고, 여기서 새 수치를 만들지 않는다.

   [996 · 4] 작성자가 고른 판단(metadata.decision)이 있으면 그것이 헤드라인이다 —
   "내 판단 · 살까" + 근거 ≤3줄. 규칙/LLM 요약은 그 아래 보조 줄로 내려간다(같은
   문장이면 뺀다). 띠 색은 판단으로(살까 strong · 보류 mixed · 패스 weak · 다시 보기 thin).
   없으면 소유자에게만 "판단 남기기 ›"(수정 화면 3단계)를 한 줄로 둔다.
   ============================================================ */

export type NoteVerdictProps = {
  /** LLM 결론(inspectionReport.verdict) 또는 규칙 요약 */
  verdict: string;
  /** 결론의 출처 라벨 — "AI 생성" / "규칙 기반 …" */
  sourceBadge: string;
  recommendedAction: string | null;
  totalScore: number | null;
  scoredAxisCount: number;
  weakestAxis: { label: string; score: number } | null;
  visitDate: string;
  checklistDone: number;
  checklistTotal: number;
  /** 단지가 실거래와 매칭될 때만 — 없으면 칸을 그리지 않는다 */
  price: { priceKrw: number; bandLabel: string; latestYm: string } | null;
  complexHref: string | null;
  /** 다음 행동 1개 */
  next: { label: string; href: string };
  /** [996 · 4] 작성자의 판단 — 없으면 null */
  decision?: NoteDecision | null;
  /** [996 · 4] 판단이 없을 때 소유자에게만 보이는 "판단 남기기" 링크(수정 화면 3단계) */
  decisionEditHref?: string | null;
};

function scoreTone(score: number | null): "strong" | "mixed" | "weak" | "thin" {
  if (score == null) return "thin";
  if (score >= 70) return "strong";
  if (score >= 45) return "mixed";
  return "weak";
}

export function NoteVerdictCard(p: NoteVerdictProps) {
  const isLlm = p.sourceBadge.startsWith("AI");
  const decision = p.decision ?? null;
  const tone = decision ? decisionBand(decision.choice) : scoreTone(p.totalScore);
  const scoreText =
    p.totalScore != null ? `기록 점수 ${p.totalScore} / 100` : "점수 미입력";
  const scoreHint =
    p.totalScore != null ? `${p.scoredAxisCount}개 축 평균 × 20` : "현장 체크를 채우면 점수가 생겨요";
  const summaryLabel = isLlm ? "AI 요약" : "규칙 요약";
  /* 근거를 이어 붙인 문장과 요약이 같으면 두 번 읽히지 않게 뺀다 */
  const summaryDuplicate =
    decision != null && decision.reasons.join(" · ").trim() === p.verdict.trim();
  return (
    <section className="card rise-in flex flex-col gap-3 rounded-[18px] p-5" aria-label="이 노트의 판단">
      <div className="flex flex-wrap items-center gap-2">
        <span className="verdict-band rounded-md px-2 py-0.5 t-caption font-extrabold tracking-wider" data-band={tone}>
          {decision ? decisionLabel(decision.choice) : scoreText}
        </span>
        <span className="t-caption text-text-3">
          {decision ? `${scoreText} · ${scoreHint}` : scoreHint}
          {" · "}
          {decision ? "작성자가 직접 고른 판단" : isLlm ? "AI 생성 결론" : "규칙 기반 요약"}
        </span>
      </div>

      {decision ? (
        <>
          <p className="t-section text-ink" style={{ textWrap: "balance" }}>
            내 판단 · {decisionLabel(decision.choice)}
          </p>
          {decision.reasons.length > 0 && (
            <ul className="flex flex-col gap-1 t-body text-text-1">
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
          {!summaryDuplicate && (
            <p className="t-sub text-text-3">
              <b className="font-bold">{summaryLabel}:</b> {p.verdict}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="t-section text-ink" style={{ textWrap: "balance" }}>
            {p.verdict}
          </p>
          {p.decisionEditHref && (
            /* [989] 문장 옆 텍스트 링크 — 24px(py-[5px] + 12px 글자). 판단이 없다는 사실을
               숨기지 않고, 남길 길을 같은 자리에 둔다. */
            <p className="-mt-1 t-sub text-text-3">
              아직 내 판단이 없어요 —{" "}
              <Link href={p.decisionEditHref} className="inline-block py-[5px] font-bold text-primary no-underline">
                판단 남기기 ›
              </Link>
            </p>
          )}
        </>
      )}
      {p.recommendedAction && (
        <p className="t-body text-text-2">
          <b className="font-extrabold text-ink">추천 행동</b> — {p.recommendedAction}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[12px] bg-bg px-3 py-2.5">
          <div className="t-caption font-bold text-text-3">방문</div>
          <div className="mt-0.5 t-body font-extrabold tabular-nums text-ink">{p.visitDate}</div>
          <div className="t-caption text-text-3">작성자 직접 기록</div>
        </div>
        <div className="rounded-[12px] bg-bg px-3 py-2.5">
          <div className="t-caption font-bold text-text-3">체크</div>
          <div className="mt-0.5 t-body font-extrabold tabular-nums text-ink">
            {p.checklistDone}/{p.checklistTotal}
          </div>
          <div className="t-caption text-text-3">
            {p.weakestAxis ? `약한 축 ${p.weakestAxis.label} ${p.weakestAxis.score}/5` : "축 점수 없음"}
          </div>
        </div>
        {p.price ? (
          <Link href={p.complexHref ?? "#"} className="rounded-[12px] bg-bg px-3 py-2.5 no-underline">
            <div className="t-caption font-bold text-text-3">대표 실거래가</div>
            <div className="mt-0.5 t-body font-extrabold tabular-nums text-ink">
              {formatKrwWon(p.price.priceKrw, { style: "short" })}
            </div>
            <div className="t-caption text-text-3">
              {p.price.bandLabel} · 기준 {formatYm(p.price.latestYm)} · 국토부
            </div>
          </Link>
        ) : (
          <div className="rounded-[12px] bg-bg px-3 py-2.5">
            <div className="t-caption font-bold text-text-3">대표 실거래가</div>
            <div className="mt-0.5 t-body font-extrabold text-text-3">매칭 없음</div>
            <div className="t-caption text-text-3">단지가 실거래와 연결되면 표시</div>
          </div>
        )}
      </div>

      <Link
        href={p.next.href}
        className="btn-primary btn-cta self-start rounded-[12px] px-4 py-2.5 t-body font-bold no-underline"
      >
        {p.next.label} ›
      </Link>
    </section>
  );
}
