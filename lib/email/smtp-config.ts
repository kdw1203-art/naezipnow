/* [1042 · 메일 발송] SMTP 설정 읽기 — 순수 규칙(환경값 → 접속 설정 · 발신 주소 · 실패 사유 한 줄).
 *
 * 운영(Vercel)에는 SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS · SMTP_SECURE · SMTP_REQUIRE_TLS 가
 * 2026-06 부터 들어 있었는데 읽는 코드가 없었다 — 발송기는 Resend 키만 봤고, 그 키가 없어 사이트 메일이 한 통도 나가지 않았다.
 * 이 파일은 nodemailer 를 부르지 않는다(값 해석만) — 단위 테스트가 접속 없이 규칙을 고정한다. */

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = 접속부터 TLS(465) · false = 평문 접속 뒤 STARTTLS(587) */
  secure: boolean;
  /** STARTTLS 를 못 하면 보내지 않는다(평문으로 인증하지 않는다) */
  requireTLS: boolean;
  user: string | null;
  pass: string | null;
}

type Env = Record<string, string | undefined>;

const TRUE_WORDS = new Set(["1", "true", "yes", "on", "ssl", "tls"]);
const FALSE_WORDS = new Set(["0", "false", "no", "off"]);

function flag(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase();
  if (!v) return null;
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

/** 접속부터 TLS 인 포트 · STARTTLS 인 포트 — 깃발과 포트가 어긋나면 포트를 따른다 */
const IMPLICIT_TLS_PORTS = new Set([465]);
const STARTTLS_PORTS = new Set([25, 587, 2525]);

export const EMAIL_ADDRESS_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * 환경값 → SMTP 접속 설정. 호스트가 없으면 null(미설정).
 *
 * 포트와 SMTP_SECURE 가 어긋난 설정(예: 587 + secure=true)은 TLS 악수에서 바로 죽는다 —
 * 흔한 실수이고 뜻은 분명하므로 잘 알려진 포트는 포트를 따른다(465 = 접속부터 TLS · 587·25·2525 = STARTTLS).
 * 그 밖의 포트는 깃발을 그대로 따른다.
 */
export function parseSmtpEnv(env: Env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host || /\s/.test(host)) return null;

  const secureFlag = flag(env.SMTP_SECURE);
  const portRaw = Number.parseInt(env.SMTP_PORT?.trim() ?? "", 10);
  const port = Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : secureFlag ? 465 : 587;

  let secure: boolean;
  if (IMPLICIT_TLS_PORTS.has(port)) secure = true;
  else if (STARTTLS_PORTS.has(port)) secure = false;
  else secure = secureFlag ?? false;

  /* 인증 정보가 있는데 평문으로 내보낼 수는 없다 — STARTTLS 는 깃발이 없어도 요구한다(끄려면 명시적으로 false) */
  const user = env.SMTP_USER?.trim() || null;
  const pass = env.SMTP_PASS ?? null;
  const requireFlag = flag(env.SMTP_REQUIRE_TLS);
  const requireTLS = secure ? false : (requireFlag ?? Boolean(user));

  return { host, port, secure, requireTLS, user, pass: pass && pass.length > 0 ? pass : null };
}

/**
 * SMTP 로 보낼 때의 발신 주소. EMAIL_FROM 이 있으면 그 값(소유자가 정한 것).
 * 없으면 SMTP 계정 주소 — 계정과 다른 주소로 보내면 대부분의 서버가 거절하거나(네이버·다음) 계정 주소로 바꿔 쓴다(구글).
 * 계정 아이디가 주소 꼴이 아니면(SendGrid 의 "apikey" 등) null — 호출부가 기본 발신 주소를 쓰고, 거절되면 사유가 관리 화면에 보인다.
 */
export function smtpFromAddress(env: Env, displayName = "내집나우"): string | null {
  const explicit = env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const user = env.SMTP_USER?.trim();
  if (user && EMAIL_ADDRESS_RE.test(user)) return `${displayName} <${user}>`;
  return null;
}

/** "이름 <a@b.c>" 또는 "a@b.c" → a@b.c (화면 표시·봉투 발신 주소) */
export function bareAddress(from: string): string {
  const m = /<([^<>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

interface SmtpErrorLike {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
  message?: unknown;
}

/**
 * 발송 실패 → 사유 한 줄(관리 화면 · 로그). 비밀번호·서버 응답 원문은 싣지 않는다 —
 * 응답 원문에는 계정 주소나 내부 호스트 이름이 섞여 나온다. 코드(535 등)만 남긴다.
 */
export function smtpFailureReason(err: unknown): string {
  const e = (err ?? {}) as SmtpErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  const rc = typeof e.responseCode === "number" ? e.responseCode : null;
  const tail = rc ? `(${rc})` : code ? `(${code})` : "";
  if (code === "EAUTH" || rc === 535 || rc === 534 || rc === 530) return `SMTP 인증 실패${tail} · 계정·비밀번호 확인`;
  if (code === "EENVELOPE" || rc === 550 || rc === 551 || rc === 553 || rc === 554 || rc === 501) {
    return `SMTP 주소 거절${tail} · 발신 주소(EMAIL_FROM) 확인`;
  }
  if (code === "ETLS" || /ssl|tls|wrong version number|certificate/i.test(String(e.message ?? ""))) {
    return `SMTP 보안 연결 실패${tail} · 포트·SMTP_SECURE 확인`;
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return `SMTP 서버 연결 실패${tail} · 호스트·포트 확인`;
  }
  if (rc && rc >= 400 && rc < 500) return `SMTP 일시 거절${tail} · 잠시 후 다시`;
  return `SMTP 오류${tail || "(원인 미상)"}`;
}
