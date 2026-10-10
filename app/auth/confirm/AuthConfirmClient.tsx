"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";
import { afterConfirmDestination } from "@/lib/auth/confirm-login";

/* 최적화 19 — supabase-js 는 실제로 쓰는 분기에서만 불러온다.
   정적 import 이던 시절 이 페이지의 First Load JS 는 169kB 였고 그중 약 66kB가
   @supabase/supabase-js 였다(auth 만 쓰는데 realtime·storage·functions 까지 온다).
   아래 다섯 갈래 중 supabase 가 필요한 건 token_hash · 해시토큰 둘뿐이고,
   PKCE(code)·오류·기타는 리다이렉트만 한다 — 그 경우엔 한 바이트도 안 받는다.
   필요한 분기에서도 "확인하는 중…" 문구가 먼저 그려진 뒤 내려받는다. */
const loadCreateClient = () =>
  import("@/utils/supabase/client").then((m) => m.createClient);

function safeNext(raw: string | null): string {
  /* `!startsWith("//")` 만으로는 `/\evil.com` 이 통과한다 — lib/safe-path.ts 참고. */
  return safeInternalPath(raw, "/login?verified=1");
}

/* [1053] 메일 인증 뒤 자동 로그인 — 소유자 답 "인증 뒤 자동 로그인". Supabase 가 인증하며 준 세션 토큰으로
   사이트 로그인(Credentials "email-confirm" · 인증 1시간 안만)을 하고 가입 다음 단계(/welcome)로 간다.
   가입 확인 링크(next = /login?verified=1…)일 때만 — 비밀번호 재설정 등 다른 링크는 예전 길 그대로.
   로그인이 안 되면(오래된 링크 · 서버 거절) 예전처럼 로그인 화면의 "인증 완료" 안내로 간다. */
/* 성공하면 갈 곳(문서를 새로 받는다 — 머리글 · 세션 상태가 새 쿠키로 그려지게), 실패면 null */
async function finishWithSupabaseSession(
  supabase: { auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }>; signOut: (o: { scope: "local" }) => Promise<unknown> } },
  next: string,
): Promise<string | null> {
  if (!next.startsWith("/login?verified=1")) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const { signIn } = await import("next-auth/react");
    const res = await signIn("email-confirm", { accessToken: token, redirect: false });
    if (!res || res.error || res.ok === false) return null;
    /* 사이트 로그인은 Auth.js 세션이 맡는다 — Supabase 쪽 세션은 이 탭에서 지운다 */
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* 무시 */
    }
    return afterConfirmDestination(next);
  } catch {
    return null;
  }
}

export function AuthConfirmClient() {
  const router = useRouter();
  const [message, setMessage] = useState("이메일 인증을 확인하는 중…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const next = safeNext(url.searchParams.get("next"));
      const errorDesc =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");

      if (errorDesc) {
        setMessage("인증 링크가 만료됐거나 이미 사용됐어요. 다시 로그인해 주세요.");
        window.setTimeout(() => router.replace("/login?error=verify_failed"), 1200);
        return;
      }

      /* PKCE — 서버 콜백이 쿠키를 심도록 넘긴다 */
      if (code) {
        window.location.replace(
          `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`,
        );
        return;
      }

      /* token_hash 방식 (일부 메일 템플릿) */
      if (tokenHash && type) {
        try {
          const supabase = (await loadCreateClient())();
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "email" | "recovery" | "invite" | "magiclink",
          });
          if (cancelled) return;
          if (error) {
            setMessage("인증에 실패했습니다. 로그인 화면으로 이동합니다.");
            window.setTimeout(() => router.replace("/login?error=verify_failed"), 1200);
            return;
          }
          setMessage("인증 완료 · 로그인하는 중");
          const dest = await finishWithSupabaseSession(supabase, next);
          if (cancelled) return;
          if (dest) window.location.replace(dest);
          else window.setTimeout(() => router.replace(next), 800);
          return;
        } catch {
          if (!cancelled) {
            router.replace("/login?error=verify_failed");
          }
          return;
        }
      }

      /* [1053] PKCE 서버 콜백(/auth/callback)이 세션 쿠키를 심고 돌려보낸 자리 — 자동 로그인만 이어서 */
      if (url.searchParams.get("finish") === "1") {
        try {
          const supabase = (await loadCreateClient())();
          setMessage("인증 완료 · 로그인하는 중");
          const dest = await finishWithSupabaseSession(supabase, next);
          if (cancelled) return;
          /* 로그인됐으면 문서를 새로 받는다 — 머리글 · 세션 상태가 새 쿠키로 그려지게 */
          if (dest) window.location.replace(dest);
          else router.replace(next);
        } catch {
          if (!cancelled) router.replace(next);
        }
        return;
      }

      /* 해시 토큰 (implicit) — 브릿지에서 넘어온 경우 */
      if (url.hash && url.hash.includes("access_token")) {
        /* [965] 비밀번호 재설정 링크(type=recovery)는 해시를 **그대로 들고**
           /reset-password 로 넘긴다. 예전엔 여기서 세션만 만들고 해시 없이
           이동해서, 재설정 화면은 PASSWORD_RECOVERY 신호를 받지 못해 4초 뒤
           "링크가 유효하지 않습니다" 를 그렸다 — 메일을 눌러도 비밀번호를 바꿀 수
           없는 상태였다. 재설정 화면은 해시 토큰을 스스로 처리한다. */
        if (next.startsWith("/reset-password")) {
          window.location.replace(`${next}${url.hash}`);
          return;
        }
        try {
          const supabase = (await loadCreateClient())();
          const { error } = await supabase.auth.getSession();
          if (cancelled) return;
          if (error) {
            router.replace("/login?error=verify_failed");
            return;
          }
          setMessage("인증 완료 · 로그인하는 중");
          const dest = await finishWithSupabaseSession(supabase, next);
          if (cancelled) return;
          if (dest) window.location.replace(dest);
          else window.setTimeout(() => router.replace(next), 800);
          return;
        } catch {
          if (!cancelled) router.replace("/login?error=verify_failed");
          return;
        }
      }

      router.replace("/login");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3 px-7">
      <p className="text-[13px] font-bold text-text-1">{message}</p>
    </main>
  );
}
