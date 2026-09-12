/**
 * [991] 비밀번호 로그인 실패 코드 → 화면이 보여 줄 다음 행동. **순수 함수(클라이언트 안전).**
 *
 * 서버(lib/auth/password-login.ts)가 CredentialsSignin 하위 클래스의 `code` 로 이유를
 * 싣는다: `email_not_confirmed` · `social_only_<provider>` · `no_account`. Auth.js 는
 * 그 코드를 signIn() 결과(`res.code`)나 리다이렉트 쿼리(`?code=`)로 전달한다.
 * 화면은 문구가 아니라 **행동**이 달라야 한다 — 인증 메일 재발송 / 소셜 버튼 / 가입 / 비밀번호 찾기.
 */

export type SocialOnlyProvider = "google" | "kakao" | "toss";

export type LoginFailHint =
  | { kind: "email_not_confirmed" }
  | { kind: "social"; provider: SocialOnlyProvider }
  | { kind: "no_account" }
  | { kind: "bad_password" };

/** `${error} ${code}` 를 소문자로 합친 문자열을 받는다(LoginClient 의 기존 관행). */
export function loginFailHint(detail: string): LoginFailHint {
  const d = detail.toLowerCase();
  if (d.includes("email_not_confirmed")) return { kind: "email_not_confirmed" };
  const social = d.match(/social_only_(google|kakao|toss)/)?.[1] as SocialOnlyProvider | undefined;
  if (social) return { kind: "social", provider: social };
  if (d.includes("no_account")) return { kind: "no_account" };
  return { kind: "bad_password" };
}
