import "server-only";

import bcrypt from "bcryptjs";
import { getServiceSupabase } from "@/lib/supabase/service";
import { findAuthUserByEmail } from "@/lib/auth/find-auth-user";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { passwordChangedEmail } from "@/lib/email/templates";
import { logger } from "@/lib/log";
import { maskEmailPublic } from "@/lib/privacy/mask-email";

/* [1040 · 로그인·가입 기능] 계정 비밀번호 바꾸기 — 재설정 링크(/api/auth/reset-password)와 설정 화면(/api/me/password)이
 * 같은 길을 쓴다. 예전엔 재설정 라우트 안에만 있었다.
 *
 * 두 저장소를 함께 바꾼다([965]): 가입은 대부분 Supabase Auth(인증 메일) 경로라 비밀번호가 그쪽에 있고,
 * app_users.password_hash 는 표식("supabase-auth-linked")뿐인 계정이 많다. 한쪽만 바꾸면 "새 비밀번호도 되고
 * 옛 비밀번호도 되는" 계정이 된다(로그인이 bcrypt → Supabase Auth 순서로 둘 다 본다). */

export type SetPasswordResult = { ok: true } | { ok: false; status: number; error: string };

export async function setAccountPassword(
  emailRaw: string,
  password: string,
  opts: { confirmEmail?: boolean } = {},
): Promise<SetPasswordResult> {
  const email = emailRaw.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, status: 503, error: "서비스를 이용할 수 없습니다." };

  try {
    const authUser = await findAuthUserByEmail(email);
    if (authUser) {
      const { error: authErr } = await sb.auth.admin.updateUserById(authUser.id, {
        password,
        /* 메일 링크로 들어온 재설정이면 이메일 소유가 증명됐다 — 미인증 계정은 그 사실도 함께 기록한다 */
        ...(opts.confirmEmail && !authUser.email_confirmed_at ? { email_confirm: true } : {}),
      });
      if (authErr) {
        logger.error("[set-password] Supabase Auth 비밀번호 갱신 실패", {
          message: authErr.message,
          email: maskEmailPublic(email),
        });
        return { ok: false, status: 500, error: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." };
      }
    }
  } catch (e) {
    logger.error("[set-password] Supabase Auth 사용자 조회 실패", e);
    return { ok: false, status: 500, error: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { error: updateErr } = await sb.from("app_users").update({ password_hash }).eq("email", email);
  if (updateErr) {
    logger.error("[set-password] app_users 갱신 실패", updateErr.message);
    return { ok: false, status: 500, error: "비밀번호 변경에 실패했습니다." };
  }
  return { ok: true };
}

/**
 * 비밀번호가 바뀌었다는 알림 메일 — 본인이 아닌 변경을 알아챌 수 있게.
 * 발송 실패는 변경을 되돌리지 않는다(경고만). 메일 미설정이면 조용히 건너뛴다.
 */
export async function sendPasswordChangedNotice(emailRaw: string, via: "reset" | "settings"): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@") || !isEmailConfigured()) return;
  try {
    const result = await sendEmail({ to: email, ...passwordChangedEmail({ via, at: new Date() }) });
    if (!result.sent) logger.warn("[set-password] 변경 알림 메일 발송 실패", result.reason);
  } catch (e) {
    logger.warn("[set-password] 변경 알림 메일 오류", e);
  }
}
