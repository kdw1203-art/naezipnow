/**
 * 광고 제거 대상 플랜 판정 — 서버(AdSlot·getAdViewer)와 클라이언트(AdFreeGate)가
 * 같은 기준을 쓰도록 순수 함수로 분리. "광고 제거"는 pro 이상 유료 플랜의 혜택이다
 * (plans.ts 기능표 기준). DB 는 무료를 'free' 로 쓰지만 'basic' 별칭도 무료로 본다.
 */
export function isAdFreePlan(plan: string | null | undefined): boolean {
  const p = (plan ?? "").trim().toLowerCase();
  return p === "pro" || p === "expert" || p === "enterprise";
}

/* [1098] 보는 사람 기준 — 관리자는 광고 자리(배너 · 띠 배너)를 확인해야 하므로 유료 플랜이어도 광고를 본다.
   소유자 계정(enterprise · admin)이 화면마다 광고 카드가 그려졌다 사라지는 것을 봤다("깜박거려") — 숨기는 대신 그대로 둔다. */
export function adFreeForViewer(viewer: { plan?: string | null; role?: string | null } | null | undefined): boolean {
  if (!viewer) return false;
  if ((viewer.role ?? "").trim().toLowerCase() === "admin") return false;
  return isAdFreePlan(viewer.plan);
}
