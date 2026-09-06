/**
 * [968 · T5] 헬스체크용 토스 구성 진단 — **값은 절대 담지 않는다.** 순수 함수.
 *
 * 왜: 도메인 변경 심사가 반려된 뒤 "키가 어떤 종류인지·빌링이 열렸는지·웹훅이
 * 검증되는지"를 확인하려면 소유자가 Vercel 콘솔을 열어 키를 눈으로 대조해야
 * 했다. 접두사만 보면 알 수 있는 사실(test/live · gck/ck)을 boolean·enum 으로
 * 돌려준다. 키 문자열 자체·길이·일부는 어떤 필드에도 들어가지 않는다 —
 * tests/unit/toss-968.test.ts 가 JSON 전체에 키 재료가 없음을 고정한다.
 */

import { parseTossClientKey, parseTossSecretKey, type TossKeyKind, type TossKeyMode } from "@/lib/payments/toss-keys";

export type TossDiagnosticsInput = {
  clientKey: string | undefined;
  secretKey: string | undefined;
  billingClientKey: string | undefined;
  billingSecretKey: string | undefined;
  billingEnabledFlag: string | undefined;
  /** 서버 판정(lib/payments/toss-billing.isTossBillingEnabled) — 시크릿 존재까지 본다 */
  billingEnabled: boolean;
  /** 공개 origin 상수(DEFAULT_DESKTOP_ORIGIN) — 비밀이 아니다 */
  siteOrigin: string;
};

export type TossDiagnostics = {
  clientKeyMode: TossKeyMode | null;
  clientKeyKind: TossKeyKind | null;
  /** 클라이언트·시크릿이 같은 세트(환경·종류 모두 일치)인가 */
  keyPairOk: boolean;
  secretKey: boolean;
  billingClientKey: boolean;
  billingClientKeyKind: TossKeyKind | null;
  billingSecretKey: boolean;
  billingEnabledFlag: boolean;
  billingEnabled: boolean;
  /**
   * 웹훅 검증에 쓰는 비밀이 있는가. 토스 v2 PAYMENT_STATUS_CHANGED 에는 서명이
   * 없어 별도 웹훅 시크릿 env 가 **없다** — app/api/payments/toss/webhook/route.ts 는
   * TOSS_SECRET_KEY 로 결제를 다시 조회해 페이로드를 검증한다. 그래서 이 값은
   * secretKey 와 같은 env 를 본다.
   */
  webhookSecret: boolean;
  webhookVerification: "refetch-with-secret-key";
  webhookUrl: string;
  siteOrigin: string;
  /** successUrl/failUrl 은 빌드 상수가 아니라 실행 시 window.location.origin 이다 */
  successUrlOrigin: "runtime(window.location.origin)";
  /** 심사역이 여는 경로 — 비로그인에서도 위젯이 그려진다([968 · T1]) */
  reviewCheckoutPath: "/subscription/checkout?tier=pro&billing=weekly";
};

function modeOf(raw: string | undefined): TossKeyMode | null {
  const k = parseTossClientKey(raw);
  return k.state === "ok" ? k.mode : null;
}

function kindOf(raw: string | undefined): TossKeyKind | null {
  const k = parseTossClientKey(raw);
  return k.state === "ok" ? k.kind : null;
}

function present(raw: string | undefined): boolean {
  return Boolean(raw?.trim());
}

export function tossDiagnostics(input: TossDiagnosticsInput): TossDiagnostics {
  const client = parseTossClientKey(input.clientKey);
  const secret = parseTossSecretKey(input.secretKey);
  const keyPairOk =
    client.state === "ok" &&
    secret.state === "ok" &&
    client.mode === secret.mode &&
    client.kind === secret.kind;
  const origin = input.siteOrigin.replace(/\/+$/, "");
  return {
    clientKeyMode: modeOf(input.clientKey),
    clientKeyKind: kindOf(input.clientKey),
    keyPairOk,
    secretKey: present(input.secretKey),
    billingClientKey: present(input.billingClientKey),
    billingClientKeyKind: kindOf(input.billingClientKey),
    billingSecretKey: present(input.billingSecretKey),
    billingEnabledFlag: input.billingEnabledFlag?.trim() === "1",
    billingEnabled: input.billingEnabled,
    webhookSecret: present(input.secretKey),
    webhookVerification: "refetch-with-secret-key",
    webhookUrl: `${origin}/api/payments/toss/webhook`,
    siteOrigin: origin,
    successUrlOrigin: "runtime(window.location.origin)",
    reviewCheckoutPath: "/subscription/checkout?tier=pro&billing=weekly",
  };
}
