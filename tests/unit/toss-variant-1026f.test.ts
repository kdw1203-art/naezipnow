import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOSS_WIDGET_VARIANT_FALLBACK, tossWidgetVariant } from "@/lib/payments/toss-variant";

/* [1026f · 결제] 소유자(2026-10-01): 상점관리자 → 결제 UI 설정(라이브)에 "결제 UI" 를 만들고 베리언트 키를 "naezipnow" 로 저장
   ("DEFAULT" 로는 바꿀 수 없게 돼 있음). SDK 는 키를 안 주면 DEFAULT 를 찾아 4015(존재하지 않는 위젯)였다. */

test("베리언트 키 — 기본 naezipnow, Vercel 값이 있으면 그것", () => {
  const prev = process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY;
  delete process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY;
  assert.equal(TOSS_WIDGET_VARIANT_FALLBACK, "naezipnow");
  assert.equal(tossWidgetVariant(), "naezipnow");
  process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY = "  other  ";
  assert.equal(tossWidgetVariant(), "other");
  process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY = " ";
  assert.equal(tossWidgetVariant(), "naezipnow");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY;
  else process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY = prev;
});

test("체크아웃 — 결제수단·약관 모두 그 키로, 못 찾으면 기본 UI 로 한 번 더 · 관리자/헬스체크도 같은 키를 확인", () => {
  const c = readFileSync("app/subscription/checkout/CheckoutClient.tsx", "utf8");
  assert.match(c, /const variantKey = tossWidgetVariant\(\);/);
  assert.match(c, /\[variantKey, "DEFAULT"\]/);
  assert.match(c, /renderAgreement\(\{ selector: "#toss-agreement", \.\.\.\(v \? \{ variantKey: v \} : \{\}\) \}\)/);
  assert.match(c, /\[variantKey, undefined\]/);
  for (const f of ["app/admin/payments/page.tsx", "app/api/health/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /probeWidgetUi\(\s*process\.env\.NEXT_PUBLIC_TOSS_CLIENT_KEY,\s*tossWidgetVariant\(\),\s*\)/, f);
  }
});
