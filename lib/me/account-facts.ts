/**
 * [1006] 계정 사실 — 설정 › 계정 탭의 "연결된 로그인 수단 · 가입일 · 동의 갱신일".
 * 순수 함수(node:test 대상). DB 행과 세션 식별자를 받아 **사실만** 판정한다.
 *
 * 무엇이 사실인가:
 *  · 카카오·토스: app_users.kakao_linked_at / toss_linked_at(토스는 unlinked_at 이 뒤면 해제).
 *  · 이메일·비밀번호: password_hash 가 진짜 bcrypt 해시("$2…")이거나 Supabase Auth 이메일
 *    가입 표식("supabase-auth-linked"). 카카오·토스 전용 표식은 비밀번호가 없는 계정이다.
 *  · 구글: 서버 열이 없다(NextAuth 구글은 app_users 에 아무것도 적지 않는다). 그래서
 *    **지금 이 세션이 구글로 열렸을 때만** 줄을 그린다 — 세션 sub 가 구글의 숫자 id.
 *    다른 세션에서는 알 수 없으므로 "연결 안 됨"을 단언하지 않고 줄을 숨긴다(카카오도 기록이
 *    없으면 같은 처리).
 *  · 어느 수단이든 지금 로그인 중이면 열 값과 무관하게 연결됨(세션 자체가 증거).
 *
 * 해시 원문은 여기서 boolean 으로만 바뀐다 — 라우트가 클라이언트에 넘기는 건 이 결과뿐.
 */

export type LoginProvider = "email" | "google" | "kakao" | "toss";

export const LOGIN_PROVIDER_LABEL: Record<LoginProvider, string> = {
  email: "이메일 · 비밀번호",
  google: "구글",
  kakao: "카카오",
  toss: "토스",
};

export type LoginLink = {
  provider: LoginProvider;
  label: string;
  linked: boolean;
  /** 연결 시각(열이 있을 때만) — 세션으로만 아는 경우 null */
  at: string | null;
  /** 지금 이 세션이 이 수단으로 열렸다 */
  current: boolean;
};

export type AppUserFactsRow = {
  created_at?: string | null;
  consent_updated_at?: string | null;
  marketing_agreed?: boolean | null;
  location_agreed?: boolean | null;
  password_hash?: string | null;
  kakao_linked_at?: string | null;
  toss_linked_at?: string | null;
  toss_unlinked_at?: string | null;
};

export type AccountFacts = {
  createdAt: string | null;
  consentUpdatedAt: string | null;
  marketing: boolean;
  location: boolean;
  currentProvider: LoginProvider | null;
  logins: LoginLink[];
};

/** auth.ts 가 provider 별로 다르게 만드는 세션 sub 에서 지금 로그인 수단을 읽는다. */
export function providerFromSessionSub(sub: string | null | undefined): LoginProvider | null {
  const s = (sub ?? "").trim();
  if (!s) return null;
  if (s.startsWith("kakao:")) return "kakao";
  if (s.startsWith("toss:")) return "toss";
  /* 구글 OAuth 의 subject 는 숫자만으로 된 긴 id — uuid(이메일 계정)·이메일(개발 로그인)과 겹치지 않는다 */
  if (/^\d{15,}$/.test(s)) return "google";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "email";
  if (s.includes("@")) return "email";
  return null;
}

/** 비밀번호(이메일) 로그인이 가능한 계정인가 — bcrypt 해시 또는 Supabase Auth 이메일 가입 */
export function hasEmailPassword(passwordHash: string | null | undefined): boolean {
  const h = (passwordHash ?? "").trim();
  if (!h) return false;
  if (h === "supabase-auth-linked") return true;
  return h.startsWith("$2");
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

/** 토스는 연결 뒤 해제 콜백이 toss_unlinked_at 을 적는다 — 해제가 더 나중이면 연결 아님 */
export function tossLinked(row: Pick<AppUserFactsRow, "toss_linked_at" | "toss_unlinked_at">): boolean {
  const linked = isoOrNull(row.toss_linked_at);
  if (!linked) return false;
  const unlinked = isoOrNull(row.toss_unlinked_at);
  if (!unlinked) return true;
  return Date.parse(linked) > Date.parse(unlinked);
}

export function deriveAccountFacts(
  row: AppUserFactsRow | null,
  input: { sessionSub?: string | null; providersConfigured: LoginProvider[] },
): AccountFacts {
  const current = providerFromSessionSub(input.sessionSub);
  const r = row ?? {};
  const configured = new Set<LoginProvider>(input.providersConfigured);

  /* [리뷰 M4] 근거 없는 "연결 안 됨"은 단언하지 않는다.
     · 이메일: password_hash 가 사실 → 항상 그린다.
     · 토스: toss_linked_at/unlinked_at 을 토스 로그인이 직접 적는다 → 설정돼 있으면 그린다.
     · 구글: 서버 열이 없다 → 지금 세션이 구글일 때만 그린다.
     · 카카오: 열은 있으나 현재 NextAuth 카카오 로그인이 채우지 않는다 → 기록이 있거나 지금 세션이
       카카오일 때만 그린다. */
  const all: Array<LoginLink & { show: boolean }> = [
    {
      provider: "email",
      label: LOGIN_PROVIDER_LABEL.email,
      linked: hasEmailPassword(r.password_hash) || current === "email",
      at: null,
      current: current === "email",
      show: true,
    },
    {
      provider: "google",
      label: LOGIN_PROVIDER_LABEL.google,
      linked: current === "google",
      at: null,
      current: current === "google",
      show: current === "google",
    },
    {
      provider: "kakao",
      label: LOGIN_PROVIDER_LABEL.kakao,
      linked: isoOrNull(r.kakao_linked_at) !== null || current === "kakao",
      at: isoOrNull(r.kakao_linked_at),
      current: current === "kakao",
      show: isoOrNull(r.kakao_linked_at) !== null || current === "kakao",
    },
    {
      provider: "toss",
      label: LOGIN_PROVIDER_LABEL.toss,
      linked: tossLinked(r) || current === "toss",
      at: tossLinked(r) ? isoOrNull(r.toss_linked_at) : null,
      current: current === "toss",
      show: configured.has("toss") || tossLinked(r) || current === "toss",
    },
  ];
  const logins: LoginLink[] = all
    .filter((l) => l.show)
    .map(({ show: _show, ...l }) => l);

  return {
    createdAt: isoOrNull(r.created_at),
    consentUpdatedAt: isoOrNull(r.consent_updated_at),
    marketing: Boolean(r.marketing_agreed),
    location: Boolean(r.location_agreed),
    currentProvider: current,
    logins,
  };
}
