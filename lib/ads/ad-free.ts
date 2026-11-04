/**
 * 광고 제거 대상 플랜 판정 — 서버(AdSlot·getAdViewer)와 클라이언트(AdFreeGate)가
 * 같은 기준을 쓰도록 순수 함수로 분리. "광고 제거"는 pro 이상 유료 플랜의 혜택이다
 * (plans.ts 기능표 기준). DB 는 무료를 'free' 로 쓰지만 'basic' 별칭도 무료로 본다.
 */
export function isAdFreePlan(plan: string | null | undefined): boolean {
  const p = (plan ?? "").trim().toLowerCase();
  return p === "pro" || p === "expert" || p === "enterprise";
}

/* [1105] 애드센스 게이트(AdSenseLoader · AdZoneUnit · AdSenseUnit)용 — getSessionLite 결과 → 광고 없음 여부.
   null 은 두 뜻이다(lib/client/session-lite [1007]): 로그인 힌트(nz_authed)가 없으면 비회원 확정 → 광고 대상(false),
   힌트가 있는데 null 이면 조회 실패·만료 → 모른다 → 광고 없음 쪽(true · 결제자에게 광고가 나가는 쪽이 더 나쁜 실수).
   예전엔 null 을 전부 "광고 없음"으로 읽어 비회원의 광고 요청 잠금이 한 번도 풀리지 않았다(Auth.js v5 는 비로그인에
   JSON null 을 준다 — 최적화 26 부터, 1007 부터는 요청 없이). 관리자 규칙(adFreeForViewer)은 배너 자리용 — 여기는 종전대로 플랜만 본다. */
export function adSenseAdFree(
  session: { user?: { plan?: string | null } | null } | null,
  authedHint: boolean,
): boolean {
  if (session == null) return authedHint;
  return isAdFreePlan(typeof session === "object" ? session.user?.plan : null);
}

/* [1098] 보는 사람 기준 — 관리자는 광고 자리(배너 · 띠 배너)를 확인해야 하므로 유료 플랜이어도 광고를 본다.
   소유자 계정(enterprise · admin)이 화면마다 광고 카드가 그려졌다 사라지는 것을 봤다("깜박거려") — 숨기는 대신 그대로 둔다. */
export function adFreeForViewer(viewer: { plan?: string | null; role?: string | null } | null | undefined): boolean {
  if (!viewer) return false;
  if ((viewer.role ?? "").trim().toLowerCase() === "admin") return false;
  return isAdFreePlan(viewer.plan);
}
