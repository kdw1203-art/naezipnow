/**
 * 이메일 발송 레이어 (프로바이더 추상화)
 *
 *  - RESEND_API_KEY 가 "re_" 로 시작하면 Resend REST API 로 발송.
 *  - [1042] 아니면 SMTP_HOST(+ SMTP_PORT · SMTP_USER · SMTP_PASS · SMTP_SECURE · SMTP_REQUIRE_TLS)로 발송.
 *    운영에는 이 여섯 값이 2026-06 부터 있었는데 읽는 코드가 없어 사이트 메일이 한 통도 나가지 않았다.
 *  - 둘 다 없으면 { sent: false, reason: "미설정" } 을 조용히 반환 (경고 로그는 최초 1회만).
 */
import { logger } from "@/lib/log";
import { bareAddress, parseSmtpEnv, smtpFromAddress, type SmtpConfig } from "@/lib/email/smtp-config";

const DEFAULT_FROM = "내집나우 <noreply@nuguzip.com>";

function resendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key && key.startsWith("re_") ? key : null;
}

function smtpConfig(): SmtpConfig | null {
  return parseSmtpEnv(process.env);
}

export type MailProvider = "resend" | "smtp";

/** 지금 메일이 나가는 길 — Resend 키가 있으면 Resend, 없고 SMTP 호스트가 있으면 SMTP, 둘 다 없으면 null */
export function mailProvider(): MailProvider | null {
  if (resendApiKey()) return "resend";
  if (smtpConfig()) return "smtp";
  return null;
}

/* [952] 발신 도메인은 Resend 에서 **인증한 도메인**과 같아야 한다 — 사이트 도메인이 바뀌어도
   인증이 끝나기 전에는 바꾸면 안 된다. 그래서 env `EMAIL_FROM` 이 정본이고, 없으면 구 기본값.
   도메인 전환(docs/ops/domain-migration.md ③ Resend) 뒤 env 로 `내집나우 <noreply@naezipnow.com>` 을 넣는다.
   [1042] SMTP 로 보낼 때 EMAIL_FROM 이 없으면 SMTP 계정 주소가 발신 주소다 — 계정과 다른 주소는 대부분의 서버가 거절한다. */
function resolveFrom(): string {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  if (!resendApiKey() && smtpConfig()) return smtpFromAddress(process.env) ?? DEFAULT_FROM;
  return DEFAULT_FROM;
}

export const EMAIL_FROM = resolveFrom();

/** 관리 화면용 — 발송 수단과 발신 주소(이름 뺀 주소만). 비밀번호·호스트는 싣지 않는다. */
export function mailStatus(): { provider: MailProvider | null; from: string | null } {
  const provider = mailProvider();
  return { provider, from: provider ? bareAddress(resolveFrom()) : null };
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** 텍스트 대체 본문 (선택) */
  text?: string;
  /** 답장 받을 주소 (선택) */
  replyTo?: string;
}

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string };

let warnedUnconfigured = false;

/** 이메일 프로바이더(Resend 또는 SMTP)가 설정돼 있는지 여부 */
export function isEmailConfigured(): boolean {
  return mailProvider() !== null;
}

/**
 * 이메일 발송. 프로바이더 미설정 시 실패 대신 { sent: false, reason: "미설정" } 반환.
 * 네트워크/API 오류도 throw 하지 않고 결과 객체로 돌려줍니다.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = resendApiKey();
  if (!key) {
    /* [1042] Resend 키가 없으면 SMTP — nodemailer 는 보낼 때만 불러온다 */
    const smtp = smtpConfig();
    if (smtp) {
      const { sendViaSmtp } = await import("@/lib/email/smtp-send");
      return sendViaSmtp(smtp, { from: resolveFrom(), ...input });
    }
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        "[email] RESEND_API_KEY · SMTP_HOST 미설정 — 이메일 발송을 건너뜁니다. (이 경고는 1회만 출력)",
      );
    }
    return { sent: false, reason: "미설정" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveFrom(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")) || res.statusText;
      logger.error("[email] Resend 발송 실패:", res.status, detail.slice(0, 500));
      return { sent: false, reason: `HTTP ${res.status}` };
    }

    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: json?.id };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "알 수 없는 오류";
    logger.error("[email] Resend 요청 오류:", reason);
    return { sent: false, reason };
  }
}
