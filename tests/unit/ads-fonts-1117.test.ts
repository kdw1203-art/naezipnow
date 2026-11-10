import test from "node:test";
import assert from "node:assert/strict";
import { buildContentSecurityPolicy } from "../../lib/security/content-security-policy.ts";

/* 1117 — 애드센스 광고 글꼴(Google Sans)이 CSP 에 막혀 광고 화면마다 위반 리포트가 났다.
   운영 정책은 두 구글 폰트 도메인을 열고, 개발 정책은 그대로 좁게 둔다. */

function directive(csp: string, name: string): string {
  const hit = csp.split("; ").find((d) => d.startsWith(`${name} `));
  assert.ok(hit, `${name} 지시문이 있어야 한다`);
  return hit;
}

test("운영 CSP: 광고 글꼴 CSS 와 woff2 를 받을 수 있다", () => {
  const csp = buildContentSecurityPolicy(false);
  assert.ok(directive(csp, "style-src").includes("https://fonts.googleapis.com"));
  assert.ok(directive(csp, "font-src").includes("https://fonts.gstatic.com"));
});

test("개발 CSP: 광고를 싣지 않으므로 구글 폰트 도메인을 열지 않는다", () => {
  const csp = buildContentSecurityPolicy(true);
  assert.ok(!directive(csp, "style-src").includes("fonts.googleapis.com"));
  assert.ok(!directive(csp, "font-src").includes("fonts.gstatic.com"));
});

test("다른 지시문에는 구글 폰트 도메인이 새지 않는다", () => {
  const csp = buildContentSecurityPolicy(false);
  for (const name of ["script-src", "connect-src", "frame-src"]) {
    assert.ok(!directive(csp, name).includes("fonts.g"), `${name} 는 그대로여야 한다`);
  }
});
