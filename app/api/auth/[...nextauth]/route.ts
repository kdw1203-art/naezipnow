import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { authedHintFromSetCookies, authedHintSetCookieHeader } from "@/lib/auth/authed-hint";

/* [1007 · V2a-1] 로그인·로그아웃 응답에 로그인 힌트 쿠키(nz_authed)를 같이 싣는다.
   세션 쿠키(HttpOnly)를 심거나 지우는 응답은 이 라우트뿐이다. 비밀번호 로그인은 redirect:false 뒤
   router.push(소프트 내비게이션)라 목적지가 라우터 캐시에 있으면 미들웨어(문서 요청에서 전이를
   심는 예비 경로)가 돌 기회가 없다 — 그래서 여기서 확정한다. 판정은 lib/auth/authed-hint.ts. */
function withAuthedHint(res: Response): Response {
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const decision = authedHintFromSetCookies(setCookies);
  if (decision === null) return res;
  const cookie = authedHintSetCookieHeader(decision, process.env.NODE_ENV !== "development");
  try {
    res.headers.append("Set-Cookie", cookie);
    return res;
  } catch {
    /* Response.redirect() 류는 헤더가 불변이다 — 같은 본문·상태로 다시 싼다 */
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", cookie);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

export async function GET(req: NextRequest) {
  return withAuthedHint(await handlers.GET(req));
}

/** 로그인·OAuth·Credentials POST 공통 레이트리밋 (IP당 20회/10분) */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`auth-post:${getClientIp(req)}`, {
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  return withAuthedHint(await handlers.POST(req));
}
