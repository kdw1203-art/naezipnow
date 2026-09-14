/**
 * [1000] 문의 티켓 — 라벨·분류·검증 (순수 모듈, server-only 아님).
 *
 * 왜 따로 두나: 카테고리 6종은 SupportContactForm(클라이언트)·/api/support(서버)·
 * 관리자 화면이 각자 배열을 적고 있었다. 한 곳에서 읽어야 폼에 있는 값을 서버가
 * 거부하는 일이 없다. 검증 규칙도 폼(선검증)과 API(재검증)가 같은 함수를 부른다.
 *
 * DB: public.support_tickets (status ∈ open|answered|closed) — lib/support/tickets.ts 가 쓴다.
 */

export const TICKET_CATEGORIES = [
  "일반 문의",
  "결제·환불",
  "버그 신고",
  "개인정보",
  "악성 콘텐츠 신고",
  "기타",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ["open", "answered", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
};

/** 상태 칩 색 — 토큰만 (danger/success 헥스 금지) */
export const TICKET_STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-primary-soft text-primary",
  answered: "bg-success-soft text-success",
  closed: "bg-bg text-text-3",
};

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v);
}

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}

/** 제목·본문 길이 상한 — 폼 maxLength 와 API 검증이 같은 숫자를 본다 */
export const TICKET_SUBJECT_MIN = 2;
export const TICKET_SUBJECT_MAX = 200;
export const TICKET_MESSAGE_MIN = 10;
export const TICKET_MESSAGE_MAX = 3000;
/** 관리자 답변 상한 */
export const TICKET_REPLY_MAX = 5000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 표시용 접수번호 — uuid 앞 8자리(hex) 대문자. 사용자에게 "티켓 3F2A9C10" 처럼
 * 부르기 위한 값이지 조회 키가 아니다(조회는 항상 id 전체 + 소유자 이메일).
 * uuid 가 아닌 값(메모리 저장소 등)은 앞 8자를 그대로 대문자로.
 */
export function formatTicketNo(id: string | null | undefined): string {
  const raw = String(id ?? "").replace(/-/g, "").trim();
  if (!raw) return "—";
  return raw.slice(0, 8).toUpperCase();
}

export type TicketInputErrors = {
  category?: string;
  subject?: string;
  message?: string;
  email?: string;
};

export type TicketInput = {
  category: unknown;
  subject: unknown;
  message: unknown;
  email: unknown;
};

export type TicketInputResult =
  | {
      ok: true;
      value: { category: TicketCategory; subject: string; message: string; email: string };
    }
  | { ok: false; errors: TicketInputErrors };

/**
 * 문의 입력 검증 — 폼과 API 가 같은 규칙을 본다. trim 후 판정하며,
 * ok 이면 정리된(trim 된) 값을 함께 돌려준다.
 */
export function validateTicketInput(input: TicketInput): TicketInputResult {
  const errors: TicketInputErrors = {};
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";

  if (!isTicketCategory(category)) {
    errors.category = "유효하지 않은 카테고리입니다.";
  }
  if (subject.length < TICKET_SUBJECT_MIN || subject.length > TICKET_SUBJECT_MAX) {
    errors.subject = `제목은 ${TICKET_SUBJECT_MIN}~${TICKET_SUBJECT_MAX}자 사이여야 합니다.`;
  }
  if (message.length < TICKET_MESSAGE_MIN || message.length > TICKET_MESSAGE_MAX) {
    errors.message = `내용은 ${TICKET_MESSAGE_MIN}~${TICKET_MESSAGE_MAX}자 사이여야 합니다.`;
  }
  if (!email || !EMAIL_RE.test(email)) {
    errors.email = "답변 받을 이메일 주소를 정확히 입력해 주세요.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { category: category as TicketCategory, subject, message, email },
  };
}

/** 첫 번째 오류 문구 — API 400 응답·폼 상단 한 줄 표시용 */
export function firstTicketError(errors: TicketInputErrors): string {
  return errors.category ?? errors.subject ?? errors.message ?? errors.email ?? "입력을 확인해 주세요.";
}

/* [1002] 결제·환불 문의 본문의 "주문번호: …" 를 읽어 결제 관리(환불 버튼)로 바로 잇는다.
   본문은 사용자가 쓴 것이라 표시·링크 인자로만 쓴다(영숫자·-_ 만, 6~64자). */
export function orderIdFromTicket(category: string, message: string | null | undefined): string | null {
  if (category !== "결제·환불") return null;
  const m = /주문번호\s*[:：]\s*([A-Za-z0-9_-]{6,64})(?![A-Za-z0-9_-])/.exec(message ?? "");
  return m ? m[1] : null;
}
