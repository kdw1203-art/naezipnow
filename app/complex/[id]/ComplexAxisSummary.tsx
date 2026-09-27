import { loadAxisContext } from "./section-loaders";
import { diagnosisRadar } from "@/lib/ai/insight-blocks";
import { axisCountLine, summarizeAxes } from "./axis-summary-rules";
import { SummaryRow } from "./SummaryRow";

/* [OPT-48] 단지 허브 — 워크벤치와 같은 근거(라이브 컨텍스트)를 허브에도.
   원칙(이 페이지의 예산 규율을 따른다):
   - 컨텍스트는 5분 캐시(unstable_cache) — 보통 첫 방문자 이후 DB 왕복 0.
   - 1.2초 안에 못 받으면 보조 줄 없이 입구 행만 그린다(허브를 늦추지 않기).
   - 수치가 없는 축은 만들지 않는다 — 지어내지 않기(워크벤치와 같은 규칙).

   [v4 · 한 화면 한 가지] 예전 "이 단지 결과 요약 — 공공데이터 자동 계산" 카드(판단 카드 VerdictCard · 자료 부족
   알약 · 결론 · 확인된 항목 · 빈 칸 한 줄 · 데이터 출처 접힘 · 결과가 달라지는 경우 · 면책 문단)는 이 화면에서
   걷고, 요약 목록의 **한 행**("AI 종합 진단 ›" + "5개 항목 중 N개 확인됨")으로 줄였다 — 같은 사실("매매 실거래
   없음")이 히어로·카드·빈 칸 줄에서 세 번 나왔다. 결과(점수·결론·반대 조건)와 면책은 누르면 가는 AI 진단 화면
   (app/analysis/ai/[tool] — check:ai-compliance 대상)이 그대로 보여 준다. 축 규칙(axis-summary-rules)은 그대로다. */
export async function ComplexAxisSummary({
  complexId,
  regionName,
}: {
  complexId: string;
  regionName: string;
}) {
  const ctx = await Promise.race([
    loadAxisContext(complexId, regionName).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1200)),
  ]);
  const sub = ctx ? axisCountLine(summarizeAxes(diagnosisRadar(ctx))) : null;
  return (
    <SummaryRow
      label="AI 종합 진단"
      sub={sub}
      href={`/analysis/ai/ai-diagnosis?complexId=${encodeURIComponent(complexId)}`}
    />
  );
}
