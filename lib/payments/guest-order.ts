/**
 * [1001] 비회원(게스트) 단건 결제 — 순수 규칙(클라이언트·서버·테스트가 같은 식을 본다).
 *
 * 왜: 토스페이먼츠 홈페이지 변경 심사 반려(2026-09-12) "홈페이지 내 결제수단 신용/체크카드가 확인되지 않습니다.
 * 결제창 연동 가능 여부 확인". 운영 일반 결제 키는 결제창형(ck)이라 주문번호 없이는 결제창을 열 수 없고,
 * 주문은 로그인한 사람만 만들 수 있었다 → 심사자(비로그인)는 카드 결제창을 끝내 못 봤다.
 * 토스 심사 가이드(전자결제 심사, 한 번에 통과하는 방법)와 PG 연동 헬프 문서 모두 "비회원 구매 사용"을
 * 결제창 연동 미확인의 해법으로 든다. 주간권(7일 단건, 1,100원)만 비회원에게 연다 — 정기결제는 계정이
 * 있어야 관리(해지·카드 변경)할 수 있으므로 그대로 로그인 전용.
 */

export const GUEST_CHECKOUT_BILLINGS = ["weekly"] as const;

/** 비회원 결제가 허용되는 상품인가 — 주간권(단건)만 */
export function isGuestCheckoutAllowed(billing: string | null | undefined): boolean {
  return (GUEST_CHECKOUT_BILLINGS as readonly string[]).includes(String(billing ?? ""));
}

/** 영수증·이용권 연결에 쓰는 이메일 — 느슨하지만 실제 발송 가능한 모양만 받는다(≤254자) */
export function normalizeGuestEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  if (!/^[^\s@/\\"'<>()]+@[^\s@/\\"'<>()]+\.[a-z0-9-]{2,}$/i.test(v)) return null;
  return v;
}

export type GuestPaymentMeta = {
  guest: true;
  /** 이 이메일로 가입/로그인하면 이용권을 연결한다 — 연결되면 false */
  claimPending: boolean;
  claimedAt?: string;
};

/** 결제 행 metadata 에서 게스트 표식을 읽는다(없으면 null) */
export function readGuestMeta(metadata: Record<string, unknown> | null | undefined): GuestPaymentMeta | null {
  if (!metadata || metadata.guest !== true) return null;
  return {
    guest: true,
    claimPending: metadata.claimPending === true,
    ...(typeof metadata.claimedAt === "string" ? { claimedAt: metadata.claimedAt } : {}),
  };
}

/**
 * [1003] 이메일 칸을 어떻게 읽을 것인가 — 클라이언트·서버가 같은 규칙을 본다.
 *
 * 1001 은 비회원에게 이메일을 **요구**했다. 토스 심사자는 그 칸 앞에서 멈췄다
 * (2026-09-16 실측: /subscription 13.5초 뒤 이탈, 체크아웃 미도달 · 주문 0건).
 * 심사가 확인하려는 것은 "신용/체크카드 결제창이 열리는가" 하나뿐인데, 그 앞에
 * 타이핑을 세워 둘 이유가 없다. 그래서 빈칸은 통과시키고(주문 user_email = null),
 * 적었는데 모양이 틀린 것만 막는다. 이용권은 결제 뒤 이메일을 알려 주는 순간 켠다
 * (lib/payments/guest-claim.ts attachGuestOrderEmail — paymentKey 를 아는 사람만).
 */
export type GuestEmailInput =
  | { email: string | null; error: null }
  | { email: null; error: "invalid" };

export function readGuestEmailInput(raw: unknown): GuestEmailInput {
  if (raw === undefined || raw === null) return { email: null, error: null };
  if (typeof raw !== "string") return { email: null, error: "invalid" };
  if (raw.trim() === "") return { email: null, error: null };
  const email = normalizeGuestEmail(raw);
  return email ? { email, error: null } : { email: null, error: "invalid" };
}
