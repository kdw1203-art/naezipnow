/**
 * [1000] 고객 문의 답변 메일 — lib/email/templates.ts 와 같은 레이아웃·이스케이프를 쓴다.
 *
 * 별도 파일인 이유: templates.ts 는 결제 템플릿 작업자가 소유한다(release-1000 분담).
 * 레이아웃·escapeHtml 만 가져다 쓰고 그 파일은 건드리지 않는다.
 */
import { emailLayout, escapeHtml } from "@/lib/email/templates";

const ACCENT = "#1d4fd8";
const NAVY = "#0B2545";

/** 사용자에게 보내는 답변 메일 — 문의 원문 요약 + 운영자 답변 + 내 문의 내역 링크 */
export function supportReplyEmail(params: {
  ticketNo: string;
  subject: string;
  reply: string;
  /** 문의 원문(선택) — 있으면 답변 아래에 접어 보여 준다 */
  message?: string;
}): { subject: string; html: string; text: string } {
  const ticketNo = escapeHtml(params.ticketNo);
  const subject = escapeHtml(params.subject);
  const replyHtml = escapeHtml(params.reply).replace(/\r?\n/g, "<br />");
  const messageHtml = params.message
    ? escapeHtml(params.message).replace(/\r?\n/g, "<br />")
    : "";
  const html = emailLayout(`
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8a94a6;letter-spacing:1px;">문의 ${ticketNo}</p>
      <h1 style="margin:0 0 14px;font-size:18px;line-height:1.4;color:${NAVY};">문의하신 내용에 답변드립니다</h1>
      <p style="margin:0 0 12px;font-size:14px;color:#3d4657;"><b>제목</b> · ${subject}</p>
      <div style="padding:16px;background-color:#eaf0ff;border-left:3px solid ${ACCENT};border-radius:0 8px 8px 0;font-size:14px;line-height:1.75;color:#1f2a44;">
        ${replyHtml}
      </div>
      ${
        messageHtml
          ? `<p style="margin:18px 0 6px;font-size:12px;font-weight:700;color:#8a94a6;">보내주신 문의</p>
      <div style="padding:12px 14px;background-color:#f7f9fd;border-radius:8px;font-size:13px;line-height:1.7;color:#5b667a;">
        ${messageHtml}
      </div>`
          : ""
      }
      <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#3d4657;">
        추가로 궁금한 점이 있으면 이 메일에 그대로 회신해 주세요. 같은 문의로 이어서 처리해 드립니다.
      </p>
      <a href="https://naezipnow.com/my/support" style="display:inline-block;margin-top:16px;padding:11px 18px;background-color:${ACCENT};color:#ffffff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">내 문의 내역 보기</a>`);
  const text = [
    `[문의 ${params.ticketNo}] 문의하신 내용에 답변드립니다`,
    "",
    `제목: ${params.subject}`,
    "",
    "답변:",
    params.reply,
    ...(params.message ? ["", "보내주신 문의:", params.message] : []),
    "",
    "추가 문의는 이 메일에 회신해 주세요.",
    "내 문의 내역: https://naezipnow.com/my/support",
  ].join("\n");
  return {
    subject: `[내집나우] 문의 답변 — ${params.subject} (${params.ticketNo})`,
    html,
    text,
  };
}
