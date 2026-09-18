/**
 * [1003] 비회원 결제에 이메일을 붙여도 되는가 — 순수 판정.
 *
 * guest-claim.ts 는 server-only 라 단위 테스트가 부르지 못한다. 이 릴리스에서 가장 위험한
 * 규칙(남의 결제에 자기 이메일을 붙이지 못하게 하는 것)이라 테스트가 닿는 자리에 따로 둔다.
 * 값은 전부 payments 행에서 읽은 것이고, 여기서는 DB 를 보지 않는다.
 */
export function guestAttachDecision(input: {
  status: string | null | undefined;
  isGuest: boolean;
  storedPaymentKey: string | null | undefined;
  givenPaymentKey: string;
  currentEmail: string | null | undefined;
  email: string;
}): { ok: true } | { ok: false; reason: "not_paid" | "not_guest" | "mismatch" | "taken" } {
  if (String(input.status ?? "") !== "paid") return { ok: false, reason: "not_paid" };
  if (!input.isGuest) return { ok: false, reason: "not_guest" };
  const key = String(input.storedPaymentKey ?? "");
  const given = String(input.givenPaymentKey ?? "");
  /* 길이가 다르면 비교 전에 탈락 — 결제창을 통과한 사람만 아는 값이다 */
  if (!key || !given || key.length !== given.length || key !== given) {
    return { ok: false, reason: "mismatch" };
  }
  const current = typeof input.currentEmail === "string" ? input.currentEmail.trim().toLowerCase() : "";
  if (current && current !== input.email) return { ok: false, reason: "taken" };
  return { ok: true };
}

