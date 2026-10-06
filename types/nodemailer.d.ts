/* [1042] nodemailer 는 타입을 싣지 않는다. @types/nodemailer 는 AWS SDK 를 의존성으로 끌고 와(수백 패키지)
   쓰는 만큼만 여기 적는다 — createTransport · sendMail 두 개. */
declare module "nodemailer" {
  export interface SmtpTransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    requireTLS?: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    disableFileAccess?: boolean;
    disableUrlAccess?: boolean;
  }
  export interface MailMessage {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
  }
  export interface SentInfo {
    messageId?: string;
    accepted?: unknown[];
    rejected?: unknown[];
    response?: string;
  }
  export interface Transporter {
    sendMail(message: MailMessage): Promise<SentInfo>;
    close(): void;
  }
  export function createTransport(options: SmtpTransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
