import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { CredentialsSignin } from "next-auth";
import type { UserRole } from "@/lib/auth/types";

/**
 * [965] 이메일 미인증을 Auth.js 가 **코드로** 전달하게 한다.
 *
 * 예전에는 `new Error("EMAIL_NOT_CONFIRMED")` 를 던졌다. Auth.js v5 는 authorize()
 * 안에서 던진 일반 Error 를 `CallbackRouteError` 로 감싸고, 클라이언트 `signIn()`
 * 결과에는 `error: "CallbackRouteError"` 만 남는다 — 메시지는 서버 로그에만 있다.
 * 그래서 /login 은 "email_not_confirmed" 를 찾지 못하고 "비밀번호가 올바르지
 * 않습니다" 를 보여줬다. 인증 메일만 누르면 되는 사람에게 비밀번호를 의심하게
 * 만든 셈이다.
 *
 * `CredentialsSignin` 의 하위 클래스는 `code` 가 그대로 `signIn()` 결과의
 * `res.code` 로 내려온다(리다이렉트 모드에서는 `?code=` 쿼리). 화면은 이 코드로
 * "인증 메일 다시 보내기" 를 안내한다.
 */
export class EmailNotConfirmedError extends CredentialsSignin {
  code = "email_not_confirmed";
}

/**
 * [991] 로그인 실패에 **이유**를 싣는다.
 *
 * 30일 실측: 로그인 성공 10 · 실패 8, 실패는 전부 "bad_credentials" 한 통이었다.
 * 화면은 "이메일 또는 비밀번호가 올바르지 않습니다" 만 말했다 — 사용자가 다음에 할
 * 일(비밀번호 찾기 / 소셜 버튼 누르기 / 가입하기)이 셋 중 무엇인지 알 길이 없었다.
 *
 * 비밀번호가 **틀린 뒤에만** 진단한다(성공 경로·속도 제한은 그대로). 계정 존재 여부가
 * 드러나는 건 사실이지만, 가입 화면이 "이미 가입된 이메일" 을 이미 말하고 있어
 * 새로 열리는 정보는 없다. 이메일별 시도 제한(12회/15분)이 그대로 걸린다.
 */
export type SocialOnlyProvider = "google" | "kakao" | "toss";

export class SocialOnlyAccountError extends CredentialsSignin {
  code: string;
  constructor(provider: SocialOnlyProvider) {
    super();
    this.code = `social_only_${provider}`;
  }
}

export class NoAccountError extends CredentialsSignin {
  code = "no_account";
}

/** 비밀번호 로그인 대신 어느 버튼을 눌러야 하는지 — app_users 의 sentinel 해시가 말해 준다 */
const SOCIAL_SENTINEL: Record<string, SocialOnlyProvider> = {
  "kakao-oauth-no-password": "kakao",
  "toss-login-no-password": "toss",
};

/**
 * 실패 원인 진단 — 순서: app_users 행 → Supabase Auth 사용자.
 *  · sentinel 해시(카카오·토스) → 그 소셜로만 로그인되는 계정
 *  · Supabase Auth 사용자가 있고 providers 가 google 뿐 → Google 로만
 *  · 어디에도 없음 → no_account
 *  · 그 밖(비밀번호가 있는 계정) → null = 진짜 비밀번호 오류
 * 조회 실패는 전부 null — 진단이 로그인 장애가 되면 안 된다.
 */
export async function diagnoseBadCredentials(
  email: string,
): Promise<SocialOnlyAccountError | NoAccountError | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  let rowExists = false;
  try {
    const { data } = await sb
      .from("app_users")
      .select("password_hash")
      .eq("email", email)
      .maybeSingle();
    if (data) {
      rowExists = true;
      const hash = String((data as { password_hash?: string | null }).password_hash ?? "");
      const social = SOCIAL_SENTINEL[hash];
      if (social) return new SocialOnlyAccountError(social);
      /* 자체 bcrypt 해시가 있는 계정 — 비밀번호가 틀린 것이다 */
      if (hash && hash !== "supabase-auth-linked") return null;
    }
  } catch {
    return null;
  }
  try {
    const { findAuthUserByEmail } = await import("@/lib/auth/find-auth-user");
    const authUser = await findAuthUserByEmail(email);
    if (authUser) {
      const meta = authUser.app_metadata as { providers?: unknown; provider?: unknown } | undefined;
      const providers = Array.isArray(meta?.providers)
        ? meta.providers.map(String)
        : typeof meta?.provider === "string"
          ? [meta.provider]
          : [];
      if (providers.length > 0 && !providers.includes("email") && providers.includes("google")) {
        return new SocialOnlyAccountError("google");
      }
      return null; // 이메일 비밀번호 계정 — 비밀번호 오류
    }
    return rowExists ? null : new NoAccountError();
  } catch {
    return null;
  }
}
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { recordAuthLoginOutcome } from "@/lib/auth/login-telemetry";

type Creds = Record<"email" | "password", string> | undefined;

async function tryAppUsersBcrypt(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data: row, error } = await sb
    .from("app_users")
    .select("id, email, name, password_hash, role")
    .eq("email", email)
    .maybeSingle();

  if (error || !row?.password_hash) return null;

  const ok = await bcrypt.compare(password, row.password_hash as string);
  if (!ok) return null;

  const role: UserRole =
    (row.role as string) === "admin" ? "admin" : "user";

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? row.email.split("@")[0] ?? "회원"),
    role,
  };
}

/** Supabase Auth(대시보드·signUp) 사용자 — anon/Publishable 키만으로 검증 */
async function trySupabaseAuthPassword(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user?.email) {
    const msg = (error?.message ?? "").toLowerCase();
    const code = (error as { code?: string } | null)?.code ?? "";
    if (
      code === "email_not_confirmed" ||
      msg.includes("email not confirmed") ||
      msg.includes("email_not_confirmed")
    ) {
      throw new EmailNotConfirmedError();
    }
    return null;
  }

  const meta = data.user.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : undefined;

  try {
    const { ensureAppUserRow } = await import("@/lib/auth/ensure-app-user");
    await ensureAppUserRow({
      email: data.user.email,
      name: nameFromMeta,
      authUserId: data.user.id,
    });
  } catch {
    /* best-effort — 로그인 자체는 막지 않는다 */
  }

  return {
    id: data.user.id,
    email: data.user.email,
    name: nameFromMeta ?? data.user.email.split("@")[0] ?? "회원",
    role: "user",
  };
}

export async function authorizeWithPassword(
  credentials: Creds,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const email = String(credentials?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(credentials?.password ?? "");
  if (!email.includes("@") || password.length < 8) {
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "invalid_input",
    });
    return null;
  }

  /* 이메일별 비밀번호 시도 제한 — NextAuth POST IP 한도와 이중으로 */
  const rl = rateLimit(`password-login:${email}`, {
    limit: 12,
    windowMs: 15 * 60_000,
  });
  if (!rl.ok) {
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "rate_limited",
    });
    return null;
  }

  const fromDb = await tryAppUsersBcrypt(email, password);
  if (fromDb) {
    void recordAuthLoginOutcome({
      ok: true,
      provider: "password",
      userEmail: fromDb.email,
    });
    return fromDb;
  }

  try {
    const fromSb = await trySupabaseAuthPassword(email, password);
    if (fromSb) {
      void recordAuthLoginOutcome({
        ok: true,
        provider: "password",
        userEmail: fromSb.email,
      });
      return fromSb;
    }
    /* [991] 틀린 뒤에만 왜 틀렸는지 본다 */
    const diagnosed = await diagnoseBadCredentials(email);
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason:
        diagnosed instanceof NoAccountError
          ? "no_account"
          : diagnosed instanceof SocialOnlyAccountError
            ? "social_only"
            : "bad_credentials",
    });
    if (diagnosed) throw diagnosed;
    return null;
  } catch (e) {
    if (e instanceof EmailNotConfirmedError) {
      void recordAuthLoginOutcome({
        ok: false,
        provider: "password",
        reason: "email_not_confirmed",
      });
      throw e;
    }
    if (e instanceof SocialOnlyAccountError || e instanceof NoAccountError) {
      /* [991] 이유가 실린 실패 — 계측은 던지기 전에 이미 기록했다. Auth.js 가 code 를
         signIn() 결과(res.code)로 클라이언트에 전달한다. */
      throw e;
    }
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "unknown",
    });
    return null;
  }
}
