/**
 * [992] 페이월 링크 — **순수 함수(클라이언트 안전).**
 *
 * 무료 AI 분석 3회를 다 쓴 순간이 첫 결제의 자연스러운 자리다(방금 결과를 봤다).
 * 그 자리에서 구독 설명 페이지로 보내지 않고, 주간권(1,100원·7일) 결제창으로 바로
 * 보낸 뒤 `returnTo` 로 같은 도구 화면에 돌아온다 — /payment/success 는 returnTo 가
 * 있으면 "이어서 사용하기" 를 첫 버튼으로 그린다. 경로는 내부 경로만 받는다.
 */
import { safeInternalPath } from "@/lib/safe-path";

export function weeklyPassCheckoutHref(returnTo: string | null | undefined): string {
  const rt = safeInternalPath(returnTo ?? "", "");
  const q = new URLSearchParams({ tier: "pro", billing: "weekly" });
  if (rt && rt !== "/") q.set("returnTo", rt);
  return `/subscription/checkout?${q.toString()}`;
}

/** 무료 누적 한도 문구 — 화면·API 가 같은 말을 쓴다 */
export function freeQuotaLabel(used: number, limit: number | null, lifetime: boolean | undefined): string {
  if (limit == null) return `사용 ${used}회 (무제한)`;
  return lifetime ? `무료 ${used} / ${limit}회 (누적)` : `이번 달 ${used} / ${limit}회`;
}
