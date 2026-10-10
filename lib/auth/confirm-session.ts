import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { logger } from "@/lib/log";
import { isFreshConfirmation } from "@/lib/auth/confirm-login";
import type { UserRole } from "@/lib/auth/types";

/**
 * [1053] 메일 인증 뒤 자동 로그인(Credentials "email-confirm")의 서버 판정.
 * Supabase 가 인증 링크를 확인하며 준 세션 토큰을 Supabase 에 되물어(getUser) 사람·메일·인증 시각을 확인한다.
 * 제재 계정은 auth.ts 의 signIn 콜백이 provider 와 무관하게 막는다.
 */
export async function authorizeConfirmedSession(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.getUser(accessToken);
  const u = data?.user;
  if (error || !u?.email) {
    logger.warn("[auth/email-confirm] 세션 토큰 확인 실패", { message: error?.message ?? "no user" });
    return null;
  }
  const confirmedAt = Date.parse(String(u.email_confirmed_at ?? u.confirmed_at ?? ""));
  if (!isFreshConfirmation(confirmedAt, Date.now())) {
    logger.warn("[auth/email-confirm] 인증 시각이 범위 밖 — 자동 로그인 안 함");
    return null;
  }
  const meta = u.user_metadata as Record<string, unknown> | undefined;
  const name =
    typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : undefined;
  try {
    const { ensureAppUserRow } = await import("@/lib/auth/ensure-app-user");
    await ensureAppUserRow({ email: u.email, name, authUserId: u.id });
  } catch {
    /* best-effort — 비밀번호 로그인과 같은 태도 */
  }
  return { id: u.id, email: u.email.toLowerCase(), name: name ?? u.email.split("@")[0] ?? "회원", role: "user" };
}
