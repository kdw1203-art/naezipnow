/* [1050 · 펼침] AI 분석 허브 — 도구를 펼치면 보이는 "분석 순서". 순수(단위 시험 대상) · 서버에서만 부른다(app/analysis/workbench-cards). */

/**
 * 실행 중 문구 → 단계 이름. "국토부 실거래 불러오는 중 — 점수의 기준을 잡아요" → "국토부 실거래 불러오기".
 *  ① " — " 뒤 설명을 걷고 ② "~는 중" → "~기", "~ 중" → "" ③ 마지막 낱말 바로 앞 목적격 조사(을/를)를 걷는다.
 */
export function stageStep(stage: string): string {
  let t = String(stage ?? "").split(" — ")[0].trim();
  t = t.replace(/는 중$/, "기").replace(/\s*중$/, "");
  t = t.replace(/(\S)(을|를) (\S+기)$/, "$1 $3");
  return t.trim();
}
