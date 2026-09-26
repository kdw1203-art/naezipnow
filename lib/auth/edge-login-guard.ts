/**
 * [1007 · V2a-7] 로그인 전용 화면의 **엣지** 가드 — 세션 쿠키가 없으면 미들웨어가 /login 으로 보낸다.
 *
 * 실측(2026-09-19, 24h): /my/analyses 비로그인 요청 367회 — 페이지 함수가 떠서 safeAuth() 를 하고
 * redirect("/login?callbackUrl=/my/analyses") 로 끝났다. 답이 정해진 요청에 함수를 쓰지 않는다.
 *
 * 목록에 넣는 기준: **서버 가드가 이미 redirect("/login…") 로 답하는 화면만.** GuestGate/GuestView
 * (로그인 안내 화면)를 그리는 /my·/my/points·/my/settings·/my/support·/my/subscription·/my/creator·
 * /my/expert-profile 은 넣지 않는다 — 엣지에서 잘라 버리면 그 안내 화면이 사라진다(기능을 빼지 않는다).
 * tests/unit/probes-1007.test.ts 가 여기 적힌 화면의 page/layout 이 정말 redirect 하는지 대조한다.
 *
 * 서버 가드는 그대로 둔다(세션 쿠키가 있으나 무효인 경우는 서버가 판정한다). 엣지는 "쿠키 없음"
 * 만 본다 — 검증하지 않으므로 함수 호출도, 시크릿도 필요 없다.
 * 세션 쿠키 유무 판정은 lib/auth/authed-hint.ts hasSessionCookieName 과 같은 표를 쓴다.
 */

export const EDGE_LOGIN_GUARD_PREFIXES = [
  "/my/analyses",
  "/my/consultations",
  "/my/watchlist",
  "/my/leads",
  "/my/listings",
  "/admin",
] as const;

/** 서버 가드가 그 화면을 지키는 파일 — 테스트가 대조한다(redirect("/login… 을 포함해야 한다) */
export const EDGE_LOGIN_GUARD_SERVER_FILES: Readonly<Record<(typeof EDGE_LOGIN_GUARD_PREFIXES)[number], string>> = {
  "/my/analyses": "app/my/analyses/page.tsx",
  "/my/consultations": "app/my/consultations/page.tsx",
  "/my/watchlist": "app/my/watchlist/page.tsx",
  "/my/leads": "app/my/leads/page.tsx",
  "/my/listings": "app/my/listings/page.tsx",
  "/admin": "app/admin/layout.tsx",
};

/** 이 경로(뒤 슬래시 제거된 꼴)가 엣지에서 로그인을 요구하는 화면인가 */
export function needsLoginAtEdge(path: string): boolean {
  for (const p of EDGE_LOGIN_GUARD_PREFIXES) {
    if (path === p || path.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * 로그인 화면으로 보낼 상대 URL — 로그인 뒤 원래 화면으로 돌아오게 callbackUrl 을 싣는다.
 * (/login 은 `callbackUrl` 만 읽는다 — app/login/LoginClient.tsx resolveCallbackUrl.
 *  미들웨어의 레거시 표도 `next` → `callbackUrl` 로 옮겨 적는다. `next=` 는 조용히 버려진다.)
 */
export function loginRedirectHref(path: string, search: string): string {
  const back = `${path}${search && search !== "?" ? search : ""}`;
  return `/login?callbackUrl=${encodeURIComponent(back)}`;
}
