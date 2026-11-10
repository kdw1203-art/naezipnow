/* [1125 · 실행 전 남은 횟수] AI 해설 버튼 옆 한 줄 — /api/me/usage 의 ai_analysis 항목을 글자로(순수 함수 · 테스트 대상).
   한도가 없으면(null) 줄을 그리지 않는다. 누적 한도(무료)는 "누적", 월 한도는 "이번 달". 값은 서버가 센 그대로 — 여기서 어림하지 않는다. */
export type AiUsageItem = { key: string; used: number; limit: number | null; lifetime?: boolean };

export function aiQuotaLabel(items: ReadonlyArray<AiUsageItem> | null | undefined): string | null {
  const it = items?.find((i) => i.key === "ai_analysis");
  if (!it || it.limit == null || !Number.isFinite(it.limit) || !Number.isFinite(it.used)) return null;
  const left = Math.max(0, it.limit - it.used);
  return `${it.lifetime ? "누적" : "이번 달"} ${it.limit}회 중 ${left}회 남음`;
}
