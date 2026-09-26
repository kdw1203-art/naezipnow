/**
 * [1008 · 리뷰 A-18] 예전 외부 AI 실행 기록의 꼬리 줄 정리 — 순수 함수(클라이언트 결과 청크·공유 페이지 공용).
 *
 * 1007 까지 서버가 AI 해설 끝에 "_위 서술은 외부 LLM(…)이 작성한 해석이며, 수치의 원천은 함께 표시된
 * [규칙] 계산·근거 각주입니다._" 를 붙였다. 화면은 마크다운을 다 풀지 않으므로 밑줄 문자가 그대로 보이고,
 * "[규칙] 계산·근거 각주"는 사람이 모르는 내부 말이다. 새 기록은 서버가 새 문장으로 쓴다
 * (app/api/ai/analysis) — 이미 저장된 기록(ai_analysis_runs.markdown)은 보여 줄 때 여기서 걷는다.
 */

/* 정규식으로만 적는다 — 결과 화면 문구 검사(tests/unit/ai-result-1008)가 내부 말 글자 그대로를 막는다 */
const LEGACY_TAIL_TERM = /\[규칙\] 계산·근거\s각주/;
const LEGACY_TAIL_PLAIN = "결과 요약·데이터 출처(공공데이터 자동 계산)";

/** 한 줄 — 줄 전체를 감싼 밑줄 기울임(_…_)을 벗기고 내부 말을 사람 말로 */
export function cleanAiLine(line: string): string {
  return line.replace(/^(\s*)_(.+)_(\s*)$/, "$1$2$3").replace(LEGACY_TAIL_TERM, LEGACY_TAIL_PLAIN);
}

/** 여러 줄(공유 페이지처럼 원문을 그대로 보여 주는 곳) */
export function cleanAiMarkdown(md: string): string {
  return md.split("\n").map(cleanAiLine).join("\n");
}
