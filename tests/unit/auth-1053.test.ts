/* [1053] 로그인 안전장치 · 메일 인증 뒤 자동 로그인 · 기본 글꼴.
 *
 * 잠그는 사실:
 *  A1 앱 안 브라우저 판정 — 카카오톡 · 네이버 앱 · 인스타 · 페이스북 · 라인 · 다음 · 밴드 · 안드로이드 웹뷰(; wv)).
 *     크롬 · 사파리 · 삼성 인터넷 · 크롬 맞춤 탭은 앱 안이 아니다.
 *  A2 기본 브라우저로 여는 주소 — 카카오톡은 공식 스킴, 안드로이드는 intent:// 크롬, iOS 다른 앱은 null(주소 복사 안내).
 *     http(s) 아닌 주소는 null.
 *  A3 로그인 · 가입 화면 — 앱 안에서는 구글 단추를 빼고 안내를 보인다(판정은 마운트 뒤).
 *  A4 옛 주소 — AUTH_URL 이 nuguzip.com 이면 메일 링크 주소(desktopBaseUrl)에서 건너뛴다 · 미들웨어가 옛 주소의
 *     /api/auth 콜백을 받아 새 주소로 넘긴다.
 *  A5 메일 인증 뒤 자동 로그인 — 인증 1시간 안만 · 갈 곳은 내부 경로만(callbackUrl 꺼내기 · 기본 /welcome) ·
 *     속도 제한 키는 토큰의 sub · Credentials "email-confirm" 은 비밀번호 로그인이 켜졌을 때만.
 *  F1 글꼴 — Pretendard 조각 CSS(@font-face 92개) 링크 없음 · 기본 글꼴 묶음 · 로고 글자 4자만 824바이트 글꼴. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { externalOpenUrl, inAppKind, inAppLabel, isIOS } from "@/lib/client/in-app-browser";
import {
  CONFIRM_LOGIN_WINDOW_MS,
  afterConfirmDestination,
  isFreshConfirmation,
  jwtSubject,
} from "@/lib/auth/confirm-login";
import { desktopBaseUrl, isLegacyOrigin } from "@/lib/platform-shell";

const read = (p: string) => readFileSync(p, "utf8");

const UA = {
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36;KAKAOTALK 2410520",
  kakaoIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
  naverAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.3)",
  naverIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.8.3; 15)",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.25.104",
  facebook:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.15.0",
  band: "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 BAND/14.0.0",
  daum: "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 DaumApps/7.9.0",
  webview: "Mozilla/5.0 (Linux; Android 13; SM-A536N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  crios:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0",
};

test("A1 앱 안 브라우저 판정", () => {
  assert.equal(inAppKind(UA.kakaoAndroid), "kakaotalk");
  assert.equal(inAppKind(UA.kakaoIOS), "kakaotalk");
  assert.equal(inAppKind(UA.naverAndroid), "naver");
  assert.equal(inAppKind(UA.naverIOS), "naver");
  assert.equal(inAppKind(UA.instagram), "instagram");
  assert.equal(inAppKind(UA.facebook), "facebook");
  assert.equal(inAppKind(UA.line), "line");
  assert.equal(inAppKind(UA.band), "band");
  assert.equal(inAppKind(UA.daum), "daum");
  assert.equal(inAppKind(UA.webview), "webview");
  for (const k of ["chromeAndroid", "samsung", "safari", "crios", "desktop"] as const) {
    assert.equal(inAppKind(UA[k]), null, k);
  }
  assert.equal(inAppKind(""), null);
  assert.equal(inAppKind(null), null);
  assert.equal(inAppKind(undefined), null);
  assert.equal(isIOS(UA.naverIOS), true);
  assert.equal(isIOS(UA.naverAndroid), false);
  assert.equal(inAppLabel("naver"), "네이버 앱");
  assert.equal(inAppLabel("kakaotalk"), "카카오톡");
});

test("A2 기본 브라우저로 여는 주소", () => {
  const href = "https://naezipnow.com/login?callbackUrl=%2Fmy";
  assert.equal(
    externalOpenUrl("kakaotalk", href, UA.kakaoIOS),
    `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`,
  );
  assert.equal(
    externalOpenUrl("kakaotalk", href, UA.kakaoAndroid),
    `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`,
  );
  assert.equal(
    externalOpenUrl("naver", href, UA.naverAndroid),
    "intent://naezipnow.com/login?callbackUrl=%2Fmy#Intent;scheme=https;package=com.android.chrome;end",
  );
  assert.equal(externalOpenUrl("naver", href, UA.naverIOS), null);
  assert.equal(externalOpenUrl("instagram", href, UA.instagram), null);
  assert.equal(externalOpenUrl("naver", "javascript:alert(1)", UA.naverAndroid), null);
  assert.equal(externalOpenUrl("kakaotalk", "not a url", UA.kakaoIOS), null);
});

test("A3 로그인 · 가입 — 앱 안에서는 구글 단추 대신 안내", () => {
  for (const f of ["app/login/LoginClient.tsx", "app/signup/SignupClient.tsx"]) {
    const src = read(f);
    assert.match(src, /useInAppBrowser\(\)/, f);
    assert.match(src, /socialAll\.filter\(\(p\) => p !== "google"\)/, f);
    assert.match(src, /<InAppBrowserNotice kind=\{inApp\}( flow="signup")? \/>/, f);
  }
  const notice = read("app/components/auth/InAppBrowserNotice.tsx");
  /* 서버 · 첫 렌더는 null — 마운트 뒤에만 판정(하이드레이션 어긋남 없음) */
  assert.match(notice, /useState<InAppKind \| null>\(null\)/);
  assert.match(notice, /useEffect\(\(\) => \{\s*try \{\s*setKind\(inAppKind\(navigator\.userAgent\)\)/);
  assert.match(notice, /min-h-\[40px\]/);
  /* 가입 화면은 "이메일 가입은 여기서도 가능" */
  assert.match(read("app/signup/SignupClient.tsx"), /<InAppBrowserNotice kind=\{inApp\} flow="signup" \/>/);
  assert.match(notice, /이메일 \{flow === "signup" \? "가입" : "로그인"\}은 여기서도 가능/);
  assert.doesNotMatch(notice, /min-h-10 md:min-h-6/);
});

test("A4 옛 주소 — 메일 링크 주소에서 건너뛰고 · 콜백은 새 주소로", () => {
  assert.equal(isLegacyOrigin("https://nuguzip.com"), true);
  assert.equal(isLegacyOrigin("nuguzip.com"), true);
  assert.equal(isLegacyOrigin("https://www.nuguzip.com/"), true);
  assert.equal(isLegacyOrigin("https://naezipnow.com"), false);
  assert.equal(isLegacyOrigin(""), false);
  assert.equal(isLegacyOrigin(undefined), false);

  const keys = ["NEXT_PUBLIC_DESKTOP_APP_URL", "AUTH_URL", "NEXT_PUBLIC_APP_URL", "VERCEL_URL"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    process.env.AUTH_URL = "https://nuguzip.com";
    assert.equal(desktopBaseUrl(), "https://naezipnow.com");
    process.env.NEXT_PUBLIC_APP_URL = "https://naezipnow.com";
    assert.equal(desktopBaseUrl(), "https://naezipnow.com");
    process.env.AUTH_URL = "https://naezipnow.com";
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(desktopBaseUrl(), "https://naezipnow.com");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  const mw = read("middleware.ts");
  assert.ok(
    mw.includes(`{ source: "/api/auth/:path*", has: [{ type: "header", key: "host", value: "(?:www\\\\.|m\\\\.)?nuguzip\\\\.com" }] }`),
    "옛 주소 host 매처",
  );
  assert.ok(
    mw.includes(`{ source: "/api/auth/:path*", has: [{ type: "header", key: "x-forwarded-host", value: "(?:www\\\\.|m\\\\.)?nuguzip\\\\.com" }] }`),
    "옛 주소 x-forwarded-host 매처",
  );
  /* 매처 정규식이 실제로 옛 주소만 고르는지 */
  const re = /^(?:www\.|m\.)?nuguzip\.com$/;
  assert.ok(re.test("nuguzip.com") && re.test("www.nuguzip.com") && re.test("m.nuguzip.com"));
  assert.ok(!re.test("naezipnow.com") && !re.test("evil-nuguzip.com"));

  assert.match(read("lib/notifications/comment-notify.ts"), /desktopBaseUrl\(\) \|\| SITE_URL/);
  assert.match(read("app/api/health/route.ts"), /urlLegacy: isLegacyOrigin\(authUrl\)/);
});

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

test("A5 메일 인증 뒤 자동 로그인 — 규칙", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");
  assert.equal(CONFIRM_LOGIN_WINDOW_MS, 3_600_000);
  assert.equal(isFreshConfirmation(now - 5 * 60_000, now), true);
  assert.equal(isFreshConfirmation(now - CONFIRM_LOGIN_WINDOW_MS, now), true);
  assert.equal(isFreshConfirmation(now - CONFIRM_LOGIN_WINDOW_MS - 1, now), false);
  assert.equal(isFreshConfirmation(now + 60_000, now), true, "시계 차이 2분 안");
  assert.equal(isFreshConfirmation(now + 5 * 60_000, now), false);
  assert.equal(isFreshConfirmation(Number.NaN, now), false);

  assert.equal(afterConfirmDestination("/login?verified=1&callbackUrl=%2Fwelcome%3Fnext%3D%252Fmy"), "/welcome?next=%2Fmy");
  assert.equal(afterConfirmDestination("/login?verified=1"), "/welcome");
  assert.equal(afterConfirmDestination("/login?verified=1&callbackUrl=https%3A%2F%2Fevil.example"), "/welcome");
  assert.equal(afterConfirmDestination("/login?verified=1&callbackUrl=%2F%2Fevil.example"), "/welcome");
  assert.equal(afterConfirmDestination("/login?verified=1&callbackUrl=%2Flogin%3Fx%3D1"), "/welcome");
  assert.equal(afterConfirmDestination("/my"), "/my");
  assert.equal(afterConfirmDestination("//evil.example"), "/welcome");
  assert.equal(afterConfirmDestination("https://evil.example"), "/welcome");
  assert.equal(afterConfirmDestination(null), "/welcome");

  const sub = "0b5e2f4c-1d2e-4f5a-9b8c-7d6e5f4a3b2c";
  assert.equal(jwtSubject(fakeJwt({ sub })), sub);
  assert.equal(jwtSubject(fakeJwt({ sub: "../../x" })), null);
  assert.equal(jwtSubject(fakeJwt({})), null);
  assert.equal(jwtSubject("a.b"), null);
  assert.equal(jwtSubject("x.!!!.y"), null);
});

test("A5 메일 인증 뒤 자동 로그인 — 연결", () => {
  const auth = read("auth.ts");
  const i = auth.indexOf('id: "email-confirm"');
  assert.ok(i > 0, "Credentials email-confirm");
  /* 비밀번호 로그인(supabasePassword) 묶음 안 — 그 기능이 꺼지면 이 길도 없다 */
  const gate = auth.lastIndexOf("supabasePassword", i);
  assert.ok(gate > 0 && i - gate < 4000);
  const block = auth.slice(i, i + 900);
  assert.match(block, /token\.length > 8192/);
  assert.match(block, /credentialThrottleBlocked\("email-confirm", jwtSubject\(token\) \?\? "unknown", request\)/);
  assert.match(block, /authorizeConfirmedSession\(token\)/);

  const session = read("lib/auth/confirm-session.ts");
  assert.match(session, /^import "server-only";/m);
  assert.match(session, /auth\.getUser\(/);
  assert.match(session, /isFreshConfirmation\(/);
  assert.match(session, /email_confirmed_at/);
  assert.doesNotMatch(session, /SERVICE_ROLE/);

  const client = read("app/auth/confirm/AuthConfirmClient.tsx");
  assert.match(client, /signIn\("email-confirm", \{ accessToken: token, redirect: false \}\)/);
  assert.match(client, /next\.startsWith\("\/login\?verified=1"\)/);
  /* 사이트 세션을 만든 뒤 Supabase 브라우저 세션은 지운다(로그인은 Auth.js 쿠키 하나로) */
  assert.match(client, /signOut\(\{ scope: "local" \}\)/);
  assert.match(client, /if \(dest\) window\.location\.replace\(dest\)/);
  const cb = read("app/auth/callback/route.ts");
  assert.match(cb, /if \(code && next\.startsWith\("\/login\?verified=1"\)\)/);
  assert.match(cb, /new URL\("\/auth\/confirm", base\)/);
  assert.match(cb, /finish\.searchParams\.set\("finish", "1"\)/);
});

test("F1 기본 글꼴 — 조각 글꼴 CSS 없음 · 로고 글자만 작은 글꼴", () => {
  const layout = read("app/layout.tsx");
  assert.doesNotMatch(layout, /href=\{?["'`][^"'`]*pretendard/i, "Pretendard CSS 링크 제거");
  assert.doesNotMatch(layout, /pretendard[^"'`\n]*\.css/i);
  assert.doesNotMatch(layout, /PRETENDARD_CSS/);
  assert.match(layout, /href="\/fonts\/wordmark\/naezipnow-wordmark\.woff2"/);

  const css = read("app/globals.css");
  const tail = css.slice(css.indexOf("[1053 · 속도]"));
  assert.match(tail, /--font-sans: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo"/);
  assert.match(tail, /"Malgun Gothic"/);
  assert.match(tail, /"Noto Sans KR"/);
  assert.match(tail, /font-display: optional;/);
  assert.match(tail, /unicode-range: U\+B098, U\+B0B4, U\+C6B0, U\+C9D1;/);
  /* unicode-range 는 정확히 "내집나우" 네 글자 */
  const cps = [..."내집나우"].map((c) => c.codePointAt(0)!.toString(16).toUpperCase()).sort();
  assert.deepEqual(cps, ["B098", "B0B4", "C6B0", "C9D1"]);

  const size = statSync("public/fonts/wordmark/naezipnow-wordmark.woff2").size;
  assert.ok(size > 200 && size < 4096, `wordmark ${size}B`);
  assert.match(read("app/components/Logo.tsx"), /className="nz-wordmark font-bold"/);
});
