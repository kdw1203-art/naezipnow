/* [1026c · 결제] 결제위젯 "결제 UI" 존재 확인 — 토스 도메인 변경 3차 반려(2026-09-26 "홈페이지 내 결제수단 신용/체크카드가
   확인되지 않습니다")의 원인이 코드가 아니라 상점관리자 설정이었다: 라이브 위젯 키로 결제수단 위젯을 부르면
   GET /v1/payment-widget/widget-groups/keys?variantKey=DEFAULT 가 404 {"code":"4015","message":"존재하지 않는 위젯입니다."}.
   SDK 가 브라우저에서 부르는 **같은 요청**을 서버에서 한 번 해 보고 결과를 enum 으로만 돌려준다(관리자 결제 화면 · 헬스체크).
   · 인증은 공개 클라이언트 키(NEXT_PUBLIC_*, 브라우저 번들에 이미 있는 값) — 시크릿 키는 쓰지 않는다.
   · 키 값·응답 본문은 어디에도 싣지 않는다. 결과는 "ok" | "missing" | "not-widget-key" | "no-key" | "error" 뿐. */

export type WidgetUiState = "ok" | "missing" | "not-widget-key" | "no-key" | "error";

/** 순수 판정 — 응답 상태·본문(JSON 이면 파싱된 값)으로 분류한다 */
export function classifyWidgetProbe(status: number, body: unknown): WidgetUiState {
  if (status >= 200 && status < 300) return "ok";
  const code =
    body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "code" in body.error
      ? String((body.error as { code: unknown }).code)
      : "";
  if (status === 404 || code === "4015") return "missing";
  return "error";
}

export function isWidgetClientKey(raw: string | undefined | null): boolean {
  const k = raw?.trim() ?? "";
  return k.startsWith("live_gck_") || k.startsWith("test_gck_");
}

/** 서버에서 한 번 조회(최대 5초). 네트워크·기타 오류는 "error" — 화면은 "확인 못 함"으로만 말한다. */
export async function probeWidgetUi(
  clientKey: string | undefined | null,
  variantKey: string = "DEFAULT",
): Promise<WidgetUiState> {
  const k = clientKey?.trim();
  if (!k) return "no-key";
  if (!isWidgetClientKey(k)) return "not-widget-key";
  try {
    const url = `https://api.tosspayments.com/v1/payment-widget/widget-groups/keys?variantKey=${encodeURIComponent(variantKey || "DEFAULT")}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${k}:`).toString("base64")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json().catch(() => null);
    return classifyWidgetProbe(res.status, body);
  } catch {
    return "error";
  }
}

/** 관리자 화면 한 줄 — 상태별 설명(사실만) */
export const WIDGET_UI_NOTE: Record<WidgetUiState, string> = {
  ok: "결제수단 위젯(신용·체크카드 목록)이 그려진다",
  missing:
    "토스가 '존재하지 않는 위젯(4015)'을 돌려준다 — 결제수단 목록이 안 보인다. 상점관리자 → 결제 UI 설정 → 라이브 → 이용 서비스 추가하기 → 일반결제 MID 연결 → 저장",
  "not-widget-key": "API 개별 연동 키(ck) — 위젯 대신 카드 결제창을 바로 연다(결제 UI 설정 불필요)",
  "no-key": "클라이언트 키 미설정",
  error: "토스 응답을 확인하지 못했다(네트워크) — 새로고침",
};
