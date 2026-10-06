import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [1040 · 로그인·가입 기능] 소셜(구글·카카오)로 처음 들어온 계정의 약관 동의 기록.
 *
 * 비밀번호 가입은 /api/auth/register 가 user_consents 에 동의를 남긴다(칸을 직접 누른다). 소셜 가입은 화면이
 * "소셜 가입 = 이용약관·개인정보처리방침 동의 · 만 14세 이상"(가입) · "로그인하면 … 동의 · 만 14세 이상"(로그인)이라고
 * 적어 두기만 하고 **기록이 없었다**(1039 가 뒤로 미룬 항목). 계정 행이 새로 생긴 그 순간 한 번 남긴다.
 *
 *  · 필수 3종(이용약관·개인정보·만 14세)만 true. 선택 2종(마케팅·위치)은 false — 소셜 단추는 선택 동의를 묻지 않는다.
 *    선택 동의는 마이 › 설정 › 개인정보에서 켠다.
 *  · 이미 기록이 있으면 건드리지 않는다(비밀번호로 가입하며 직접 고른 값을 덮지 않는다).
 *  · 약관 판은 가입 라우트와 같은 값. 실패해도 로그인은 막지 않는다. */

/** 가입 라우트(app/api/auth/register)의 recordConsent 와 같은 판 */
export const CONSENT_TERMS_VERSION = "2025-06-01";

export async function recordSocialSignupConsent(emailRaw: string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@")) return false;
  const sb = getServiceSupabase();
  if (!sb) return false;
  try {
    const { data: existing, error: readErr } = await sb
      .from("user_consents")
      .select("id")
      .eq("user_email", email)
      .maybeSingle();
    if (readErr) {
      logger.warn("[social-consent] read", readErr.message);
      return false;
    }
    if (existing) return false;
    const { error } = await sb.from("user_consents").insert({
      user_email: email,
      terms_agreed: true,
      privacy_agreed: true,
      age_confirmed: true,
      marketing_agreed: false,
      location_agreed: false,
      terms_version: CONSENT_TERMS_VERSION,
      privacy_version: CONSENT_TERMS_VERSION,
      ip_address: null,
      user_agent: null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      logger.warn("[social-consent] insert", error.message);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("[social-consent]", e instanceof Error ? e.message : String(e));
    return false;
  }
}
