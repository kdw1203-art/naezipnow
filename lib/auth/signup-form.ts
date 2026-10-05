/* [1039 · 회원가입] 가입 폼의 순수 규칙 — 이메일 형식·오타 교정·비밀번호 강도·메일함 바로가기·화면 간 이메일 넘기기.
 *
 * 왜 따로: SignupClient 는 화면이고 이 규칙들은 테스트할 값이다(tests/unit/signup-1039.test.ts).
 * 서버(register route)도 같은 EMAIL_RE 를 쓴다 — 화면이 통과시킨 주소를 서버가 다른 기준으로 막지 않게.
 * 문구는 사실 낱말(설명문·권유문 금지 · docs/design-system.md). */

/** `a@b.c` 꼴 — 공백 없음 · @ 하나 · 도메인에 점 · 최상위 2자 이상 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 이메일 칸 오류 — 없으면 null */
export function emailProblem(raw: string): string | null {
  const v = normalizeEmail(raw);
  if (!v) return "이메일 입력";
  if (!EMAIL_RE.test(v)) return "이메일 형식 확인 · name@example.com 꼴";
  return null;
}

/* 흔한 도메인 오타 — 실제로 메일이 가지 않는 주소로 가입해 인증 메일을 못 받는 일을 막는다.
   오른쪽은 실재하는 메일 도메인만. 애매한 것(naver.net 등)은 넣지 않는다. */
const DOMAIN_FIXES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "naver.con": "naver.com",
  "naver.co": "naver.com",
  "naver.cm": "naver.com",
  "naver.om": "naver.com",
  "nvaer.com": "naver.com",
  "naer.com": "naver.com",
  "hanmail.com": "hanmail.net",
  "hanmail.ent": "hanmail.net",
  "daum.com": "daum.net",
  "daum.ent": "daum.net",
  "kakao.co": "kakao.com",
  "kakao.con": "kakao.com",
  "nate.con": "nate.com",
  "nate.co": "nate.com",
};

/** 오타로 보이면 고친 주소 전체를, 아니면 null */
export function emailTypoFix(raw: string): string | null {
  const v = normalizeEmail(raw);
  const at = v.lastIndexOf("@");
  if (at <= 0) return null;
  const fixed = DOMAIN_FIXES[v.slice(at + 1)];
  return fixed ? `${v.slice(0, at + 1)}${fixed}` : null;
}

export const PASSWORD_MIN = 8;

/** 0~4 — 길이 8 · 길이 12 · 대소문자 섞임 · 숫자+기호 섞임 (재설정 화면과 같은 기준) */
export function scorePassword(pw: string): { score: number; hint: string } {
  let score = 0;
  if (pw.length >= PASSWORD_MIN) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, hint: ["매우 약함", "약함", "보통", "강함", "매우 강함"][score] };
}

/** 비밀번호 칸 오류 — 없으면 null */
export function passwordProblem(pw: string): string | null {
  if (!pw) return "비밀번호 입력";
  if (pw.length < PASSWORD_MIN) return `비밀번호 ${PASSWORD_MIN}자 이상 · 지금 ${pw.length}자`;
  return null;
}

export const NAME_MAX = 30;

/* 인증 메일을 보낸 뒤 — 받은 메일함을 바로 여는 길(주요 국내·해외 웹메일만). 모르는 도메인은 null. */
const MAILBOX: Array<{ domains: string[]; label: string; href: string }> = [
  { domains: ["naver.com"], label: "네이버 메일", href: "https://mail.naver.com/" },
  { domains: ["gmail.com", "googlemail.com"], label: "Gmail", href: "https://mail.google.com/" },
  { domains: ["daum.net", "hanmail.net"], label: "다음 메일", href: "https://mail.daum.net/" },
  { domains: ["kakao.com"], label: "카카오 메일", href: "https://mail.kakao.com/" },
  { domains: ["nate.com"], label: "네이트 메일", href: "https://mail.nate.com/" },
  { domains: ["outlook.com", "hotmail.com", "live.com", "live.co.kr"], label: "Outlook", href: "https://outlook.live.com/mail/" },
];

export function mailboxFor(email: string): { label: string; href: string } | null {
  const v = normalizeEmail(email);
  const domain = v.slice(v.lastIndexOf("@") + 1);
  const hit = MAILBOX.find((m) => m.domains.includes(domain));
  return hit ? { label: hit.label, href: hit.href } : null;
}

/* 로그인 ↔ 가입 ↔ 비밀번호 찾기 사이에 "방금 친 이메일"을 넘긴다 — 주소(쿼리)에 싣지 않고 탭 안에만 둔다
   (주소에 실으면 접속 기록·분석 로그에 이메일이 남는다). 한 번 읽으면 지운다. */
const HANDOFF_KEY = "nz_auth_email";

export function stashAuthEmail(email: string): void {
  const v = normalizeEmail(email);
  if (!EMAIL_RE.test(v)) return;
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, v);
  } catch {
    /* 저장소 차단 — 넘기지 못할 뿐 */
  }
}

export function takeAuthEmail(): string | null {
  try {
    const v = window.sessionStorage.getItem(HANDOFF_KEY);
    if (v) window.sessionStorage.removeItem(HANDOFF_KEY);
    return v && EMAIL_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** 재발송 대기(초) — 서버 한도(IP당 10분 5회)를 화면에서 먼저 지킨다 */
export const RESEND_COOLDOWN_SEC = 30;
