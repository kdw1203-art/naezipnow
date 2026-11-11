import "server-only";
import { cookies } from "next/headers";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ADMIN_2FA_COOKIE, checkAdmin2fa, openSecret } from "@/lib/auth/totp";

/* [1147] 관리자 2단계 인증 — 저장소 · 이번 요청이 확인을 마쳤는지. 규칙과 암호는 lib/auth/totp.
   등록은 선택이다(등록 전에는 예전처럼 들어간다 · 대시보드가 등록을 권한다). 등록을 마친 계정은 확인 표식이 없으면 /admin-2fa 로 간다. */

export function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
}

export type TotpRow = { enabled: boolean; secret: string | null };

/** 못 읽으면 던진다 — "등록 안 함"으로 읽으면 장애가 곧 우회가 된다 */
export async function readAdminTotp(email: string): Promise<TotpRow | null> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("[admin-2fa] 저장소 미구성");
  const { data, error } = await sb.from("admin_totp").select("secret_sealed, enabled").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw new Error(`admin_totp 조회 실패: ${error.message}`);
  if (!data) return null;
  return { enabled: data.enabled === true, secret: openSecret(String(data.secret_sealed ?? ""), authSecret()) };
}

export type Admin2faGate = "ok" | "not-enrolled" | "need-code" | "error";

/** 관리자 화면 · 관리자 API 가 묻는다 */
export async function admin2faGate(email: string): Promise<Admin2faGate> {
  let row: TotpRow | null;
  try {
    row = await readAdminTotp(email);
  } catch {
    return "error";
  }
  if (!row || !row.enabled) return "not-enrolled";
  const token = (await cookies()).get(ADMIN_2FA_COOKIE)?.value ?? null;
  return checkAdmin2fa(token, email, authSecret(), Date.now()) ? "ok" : "need-code";
}
