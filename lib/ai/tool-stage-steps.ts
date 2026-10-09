/* [1050 · 펼침] AI 분석 허브 — 도구를 펼치면 보이는 "분석 순서". 순수(단위 시험 대상) · 서버에서만 부른다(app/analysis/workbench-cards). */

/**
 * 실행 중 문구 → 단계 이름. "국토부 실거래 불러오는 중 — 점수의 기준을 잡아요" → "국토부 실거래 불러오기".
 *  ① " — " 뒤 설명을 걷고 ② "~는 중" → "~기", "~ 중" → "" ③ 마지막 낱말 바로 앞 목적격 조사(을/를)를 걷는다.
 */
/* [1052] ㄹ 탈락 동사 — "다는 중"(달다) → "달기", "만드는 중" → "만들기". "~는"만 보고 "기"를 붙이면 "다기"·"만드기"가 된다.
   뜻이 갈리는 줄기(파는: 팔다/파다 · 사는: 살다/사다 · 아는)는 넣지 않는다 */
const L_DROP: Record<string, string> = { 다: "달", 만드: "만들", 여: "열", 거: "걸", 드: "들", 부: "불", 흔드: "흔들" };

export function stageStep(stage: string): string {
  let t = String(stage ?? "").split(" — ")[0].trim();
  const m = /(?:^|\s)(\S+)는 중$/.exec(t);
  if (m && L_DROP[m[1]]) t = t.slice(0, t.length - `${m[1]}는 중`.length) + `${L_DROP[m[1]]}기`;
  t = t.replace(/는 중$/, "기").replace(/\s*중$/, "");
  t = t.replace(/(\S)(을|를) (\S+기)$/, "$1 $3");
  return t.trim();
}
