import "server-only";

import type { SmtpConfig } from "@/lib/email/smtp-config";
import { smtpFailureReason } from "@/lib/email/smtp-config";
import { logger } from "@/lib/log";

/* [1042 · 메일 발송] SMTP 로 한 통 보내기 — lib/email/send.ts 의 sendEmail 만 부른다.
 *
 * nodemailer 는 여기서만, 보낼 때만 불러온다(dynamic import) — 메일을 보내지 않는 요청의 시작 시간에 얹지 않는다.
 * 시간 제한: 접속 8초 · 인사 8초 · 무응답 15초. 서버가 죽어 있어도 요청이 붙잡히지 않는다
 * (비밀번호 찾기는 발송이 실패하면 Supabase 메일로 넘어가고, 그 밖의 호출부는 실패를 값으로 받는다).
 * 실패는 throw 하지 않는다 — 사유 한 줄({ sent:false, reason })로 돌려준다. 비밀번호·서버 응답 원문은 로그에 싣지 않는다. */

export interface SmtpMail {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type SmtpSendResult = { sent: true; id?: string } | { sent: false; reason: string };

export async function sendViaSmtp(cfg: SmtpConfig, mail: SmtpMail): Promise<SmtpSendResult> {
  let transporter: { sendMail: (m: SmtpMail) => Promise<{ messageId?: string }>; close: () => void } | null = null;
  try {
    const mod = await import("nodemailer");
    const createTransport = mod.createTransport ?? mod.default.createTransport;
    transporter = createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      requireTLS: cfg.requireTLS,
      ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
      /* 본문은 우리가 만든 글자뿐이다 — 파일·URL 첨부 경로는 닫아 둔다 */
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const info = await transporter.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      ...(mail.text ? { text: mail.text } : {}),
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    return { sent: true, id: info.messageId };
  } catch (e) {
    const reason = smtpFailureReason(e);
    logger.error("[email] SMTP 발송 실패:", reason);
    return { sent: false, reason };
  } finally {
    try {
      transporter?.close();
    } catch {
      /* 닫기 실패는 결과를 바꾸지 않는다 */
    }
  }
}
