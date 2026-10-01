import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyWidgetProbe, isWidgetClientKey, probeWidgetUi, WIDGET_UI_NOTE } from "@/lib/payments/toss-widget-probe";

/* [1026c · 결제] 토스 도메인 변경 3차 반려(2026-09-26 "홈페이지 내 결제수단 신용/체크카드가 확인되지 않습니다").
   운영 실측: 라이브 위젯 키의 결제수단 위젯 요청이 404 {"code":"4015","message":"존재하지 않는 위젯입니다."} —
   상점관리자 "결제 UI 설정"에 라이브 결제 UI 가 없었다. 대체 버튼(payment())은 위젯 키라 SDK 가 NOT_SUPPORTED_WIDGET_KEY 로 거절. */

test("classifyWidgetProbe — 200 은 있음 · 404/4015 는 없음 · 그 밖은 확인 못 함", () => {
  assert.equal(classifyWidgetProbe(200, { data: {} }), "ok");
  assert.equal(classifyWidgetProbe(404, { result: "ERROR", data: null, error: { code: "4015", message: "존재하지 않는 위젯입니다." } }), "missing");
  assert.equal(classifyWidgetProbe(400, { error: { code: "4015" } }), "missing", "상태가 달라도 4015 면 없음");
  assert.equal(classifyWidgetProbe(404, null), "missing");
  assert.equal(classifyWidgetProbe(500, null), "error");
  assert.equal(classifyWidgetProbe(401, { error: { code: "UNAUTHORIZED_KEY" } }), "error");
});

test("probeWidgetUi — 키가 없거나 API 개별 연동 키(ck)면 조회하지 않는다", async () => {
  assert.equal(await probeWidgetUi(undefined), "no-key");
  assert.equal(await probeWidgetUi("  "), "no-key");
  assert.equal(await probeWidgetUi("live_ck_abc"), "not-widget-key");
  assert.equal(await probeWidgetUi("test_ck_abc"), "not-widget-key");
  assert.equal(isWidgetClientKey("live_gck_x"), true);
  assert.equal(isWidgetClientKey("test_gck_x"), true);
  assert.equal(isWidgetClientKey("live_ck_x"), false);
  assert.match(WIDGET_UI_NOTE.missing, /결제 UI 설정 → 라이브 → 이용 서비스 추가하기/);
});

test("결제 화면 — 위젯 키에서 위젯이 실패하면 반드시 실패하는 payment() 대체 경로를 내지 않는다", () => {
  const src = readFileSync("app/subscription/checkout/CheckoutClient.tsx", "utf8");
  assert.ok(src.includes('setPhase({ kind: "preview", amount, widget: "failed", loginHref, guestPay: false });'), "비회원 미리보기 실패 → 대체 결제 버튼 없음");
  assert.ok(src.includes('setPhase({ kind: "error", msg: WIDGET_FAIL_MSG, retry: true });'), "로그인 경로 실패 → 결제창형으로 후퇴하지 않고 다시 불러오기");
  assert.ok(!src.includes("결제수단 목록을 불러오지 못했어요. 아래 버튼으로 카드 결제창을 바로 열 수 있어요."), "열리지 않는 대체 버튼을 약속하지 않는다");
  assert.ok(src.includes('scope: "toss-widget"'), "실패 코드는 모니터링으로");
  assert.ok(src.includes("window.location.reload()"), "다시 불러오기");
  /* 결제창형(ck)은 그대로 — 위젯 없이 카드 결제창 */
  assert.ok(src.includes('method: "CARD"'));
});

test("관리자 결제 화면·헬스체크 — 결제 UI 존재를 enum 으로만(키·본문 없음)", () => {
  const admin = readFileSync("app/admin/payments/page.tsx", "utf8");
  assert.ok(admin.includes("probeWidgetUi(") && admin.includes('label: "결제위젯 결제 UI (카드 목록)"'));
  const health = readFileSync("app/api/health/route.ts", "utf8");
  assert.ok(health.includes("tossWidgetUi,"));
});
