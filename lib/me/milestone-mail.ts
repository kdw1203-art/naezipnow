/* [1168] 함께한 기록 메일 — 마케팅 수신 동의자에게만 나가므로 제목에 (광고)를 붙인다. */
import { emailLayout, escapeHtml } from "@/lib/email/templates";
import type { ActivityStats, MilestoneMessage } from "@/lib/me/milestones";

const ORIGIN = "https://naezipnow.com";

export function milestoneEmail(m: MilestoneMessage, s: ActivityStats) {
  const cell = (label: string, value: string) => `
      <td style="padding:12px 8px;text-align:center;border:1px solid #e6eaf0;">
        <div style="font-size:19px;font-weight:700;color:#191f28;">${value}</div>
        <div style="margin-top:2px;font-size:12px;color:#8a94a6;">${label}</div>
      </td>`;
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:19px;color:#191f28;">${escapeHtml(m.title)}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4a5568;">${escapeHtml(m.body)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;"><tr>
      ${cell("임장노트", `${s.notes}개`)}${cell("AI 분석", `${s.analyses}회`)}${cell("관심 단지", `${s.watchlist}곳`)}${cell("모임", `${s.groups}곳`)}
    </tr></table>
    <a href="${ORIGIN}${m.href}" style="display:inline-block;background:#1b4b91;color:#ffffff;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">${escapeHtml(m.cta)}</a>
  `);
  const text = [
    m.title,
    "",
    m.body,
    `임장노트 ${s.notes}개 · AI 분석 ${s.analyses}회 · 관심 단지 ${s.watchlist}곳 · 모임 ${s.groups}곳`,
    "",
    `${m.cta}: ${ORIGIN}${m.href}`,
  ].join("\n");
  return { subject: `(광고) [내집나우] ${m.title}`, html, text };
}
