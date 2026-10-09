/* [1048 · 다요인 분석] 임장노트 결과의 시장 신호 판 — 오른쪽 "AI 분석" 칸, 기록 점수 카드 아래.
   소유자 지시(2026-10-09): "해당 내용(다요인 분석)은 임장노트에 대한 결과에도 반영할 수 있도록 범용적으로".

   · 같은 엔진(lib/signals) — 단지 화면과 같은 8요인 · 같은 공식. 이 노트의 기록 점수를 "현장"으로 옆에 적는다
     (시장 점수에 섞지 않는다 — 시장은 지역 사실, 현장은 작성자의 방문 평가).
   · 지역: 노트에 단지가 이어져 있으면 그 단지 id 의 실거래 지역 이름, 아니면 노트 지역 표기를 실거래 표기로.
   · 이 화면은 동적이라 벽시계 2.5초 — 넘기면 판을 그리지 않는다(노트 본문을 늦추지 않기).
   · [1052] 제목에 "AI" 를 붙이지 않는다 — 정해진 규칙 계산이다(판 머리에 "규칙 계산 · 공식 vN"). */
import { SignalBoard } from "@/app/components/signals/SignalBoard";
import { loadSignalReport } from "@/lib/signals/load";
import { noteSignalRegion } from "@/lib/signals/regions";

export const NOTE_SIGNALS_BUDGET_MS = 2_500;

export async function NoteSignals({
  region,
  complexParam,
  totalScore,
  lab,
}: {
  region: string;
  complexParam: string | null;
  /** 기록 점수 0~100 — 미입력이면 null(현장 칸을 그리지 않는다) */
  totalScore: number | null;
  /** 운영진 자료 조사 노트 */
  lab: boolean;
}) {
  const regionName = noteSignalRegion(region, complexParam);
  if (!regionName) return null;
  const report = await Promise.race([
    loadSignalReport({
      scope: "note",
      regionName,
      field:
        totalScore !== null
          ? { score100: totalScore, label: lab ? "자료 조사 점수" : "이 노트 기록 점수", source: lab ? "내집나우 Lab 자료 조사" : "작성자 직접 방문 기록" }
          : null,
    }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), NOTE_SIGNALS_BUDGET_MS)),
  ]);
  if (!report || report.coverage.used === 0) return null;
  return <SignalBoard report={report} idPrefix="note" title="다요인 분석 · 이 노트 지역" className="rise-in-2 rounded-3xl" />;
}

export default NoteSignals;
