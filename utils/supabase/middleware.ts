import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { decideSessionRefresh } from "@/lib/supabase/session-cookie";

/**
 * 세션(쿠키) 갱신 — App Router + @supabase/ssr
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 *
 * [969 · 22] 매 요청 `getUser()` → **필요할 때만**.
 * 예전엔 매칭되는 모든 요청에서 `supabase.auth.getUser()` 를 불렀다. 쿠키가 없는
 * 게스트는 supabase-js 가 네트워크 없이 끝내지만(세션 없음 → 즉시 반환), Supabase
 * 쿠키를 가진 사용자는 캐시된 ISR 페이지를 여는 순간에도 첫 바이트 앞에 Auth 서버
 * 왕복이 붙었다. 토큰이 아직 유효하면 갱신할 것이 없다 — 만료가 REFRESH_SKEW_SEC
 * 이내이거나 쿠키를 읽을 수 없을 때만 부른다(판독 실패는 갱신 쪽으로 기운다).
 * 서버 컴포넌트·라우트 핸들러는 예전과 같이 쿠키에서 세션을 읽으므로 동작 차이가 없고,
 * 만료 직전 요청에서 여전히 갱신·재발급된다.
 */
export async function updateSession(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  const decision = decideSessionRefresh(request.cookies.getAll());
  if (!decision.refresh) {
    /* 쿠키 없음(게스트) 또는 토큰이 아직 한참 유효 — 클라이언트를 만들지도 않는다. */
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
