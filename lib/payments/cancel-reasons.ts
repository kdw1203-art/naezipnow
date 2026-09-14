/**
 * [1000] 자동결제 해지 사유 — 순수 모듈(server-only 없음: 해지 모달(클라이언트)과
 * 해지 라우트(서버)가 같은 표를 본다).
 *
 * 왜: 해지 API 는 본문을 읽지 않아 "왜 떠나는지"가 어디에도 남지 않았다. 사유는
 * 선택이지 강요가 아니다 — 고르지 않아도 해지는 된다(전자상거래법상 해지 방해 금지).
 * 코드는 DB 컬럼 주석(billing_subscriptions.cancel_reason)과 같은 다섯 가지.
 */

export const CANCEL_REASON_CODES = [
  "too_expensive",
  "not_using",
  "missing_feature",
  "switching",
  "other",
] as const;

export type CancelReason = (typeof CANCEL_REASON_CODES)[number];

/** 코드 → 화면 라벨(라디오 목록 순서 = 이 순서) */
export const CANCEL_REASONS: Record<CancelReason, string> = {
  too_expensive: "가격이 부담돼요",
  not_using: "잘 쓰지 않게 됐어요",
  missing_feature: "필요한 기능이 없어요",
  switching: "다른 서비스로 옮겨요",
  other: "기타(직접 입력)",
};

export const CANCEL_NOTE_MAX = 500;

export function isCancelReason(v: unknown): v is CancelReason {
  return typeof v === "string" && (CANCEL_REASON_CODES as readonly string[]).includes(v);
}

export type ParsedCancelBody =
  | { ok: true; reason: CancelReason | null; note: string | null }
  | { ok: false; error: string };

/**
 * 해지 요청 본문 검증. 본문이 없거나 빈 객체면 사유 없음(하위 호환 — 예전 버튼은
 * 본문 없이 POST 했다). 모르는 사유 코드·500자 초과 의견은 400 감이다.
 */
export function parseCancelBody(body: unknown): ParsedCancelBody {
  if (body === null || body === undefined) return { ok: true, reason: null, note: null };
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "해지 요청 형식이 올바르지 않아요." };
  }
  const b = body as { reason?: unknown; note?: unknown };
  let reason: CancelReason | null = null;
  if (b.reason !== undefined && b.reason !== null && b.reason !== "") {
    if (!isCancelReason(b.reason)) return { ok: false, error: "알 수 없는 해지 사유예요." };
    reason = b.reason;
  }
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== "string") return { ok: false, error: "의견은 문자열이어야 해요." };
    const trimmed = b.note.trim();
    if (trimmed.length > CANCEL_NOTE_MAX) {
      return { ok: false, error: `의견은 ${CANCEL_NOTE_MAX}자 이내로 적어 주세요.` };
    }
    note = trimmed || null;
  }
  return { ok: true, reason, note };
}
