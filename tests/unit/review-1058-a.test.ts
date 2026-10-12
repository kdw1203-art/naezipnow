import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BIO_MAX,
  HANDLE_RE,
  RESERVED_HANDLES,
  isHandleConflict,
  normalizeHandle,
  validateBio,
  validateHandle,
} from "@/lib/account/profile-handle";
import { EMPTY_PERSONALIZATION, mergePersonalization } from "@/lib/onboarding/personalization-merge";
import { canOfferPush, fetchPushServerStatus, pushResultMessage } from "@/lib/push/subscribe-client";

/* [1058 · A] 표시명·프로필(핸들·소개)·/u 동명이인·/welcome 재진입·푸시 구독 진실 묶음.
 *  A1 작성자 표시명 = app_users.name 먼저 · A2 프로필 편집(핸들·소개 · profiles 쓰기 · 409) · A3 /u 같은 이름 N명 · FollowButton · KST
 *  A4 /welcome 재진입(프리필 · 지역만 POST · 부분 합침 · 503) · A5 푸시 켜짐 = 서버 확인 · 비로그인 → /login · A6 이름 변경 → /u 비움 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- A1 표시명 ---------- */
test("A1 resolveDisplayName — app_users.name → profiles.full_name → 세션 이름 → 마스킹 · 이메일 모양은 통과 못 함", () => {
  const src = strip(read("lib/account/display-name.ts"));
  assert.match(src, /export async function resolveDisplayName\(email: string, fallback\?: string \| null\): Promise<string>/);
  assert.ok(src.indexOf('.from("app_users").select("name")') < src.indexOf('.from("profiles").select("full_name")'), "app_users 먼저");
  assert.match(src, /return maskNoteAuthor\(found, String\(email \?\? ""\)\)/, "없으면 lib/town/shared 마스킹");
  assert.match(src, /looksLikeEmail\(s\) \? "" : s/, "이메일 모양은 이름이 아니다");
});

test("A1 다섯 쓰기 라우트가 세션 이름 대신 resolveDisplayName 을 쓴다", () => {
  const routes: [string, RegExp][] = [
    ["app/api/talk/route.ts", /talkAuthorLabel\(await resolveDisplayName\(email, session\?\.user\?\.name\), email\)/],
    ["app/api/community/posts/route.ts", /const authorLabel = await resolveDisplayName\(session\.user\.email, session\.user\.name\);/],
    ["app/api/community/posts/[id]/comments/route.ts", /const authorLabel = await resolveDisplayName\(session\.user\.email, session\.user\.name\);/],
    ["app/api/inspection/notes/route.ts", /authorLabel: await resolveDisplayName\(session\.user\.email, session\.user\.name\),/],
    ["app/api/inspection/notes/[id]/comments/route.ts", /commentAuthorLabel\(await resolveDisplayName\(email, session\?\.user\?\.name\), email\)/],
  ];
  for (const [p, re] of routes) {
    const src = strip(read(p));
    assert.match(src, /import \{ resolveDisplayName \} from "@\/lib\/account\/display-name"/, p);
    assert.match(src, re, p);
    assert.doesNotMatch(src, /authorLabel[^\n]*session\.user\.name\?\.trim\(\) \|\|/, `${p}: 세션 이름 폴백 줄이 남아 있다`);
  }
});

/* ---------- A2 핸들·소개 규칙 ---------- */
test("A2 validateHandle — [a-z0-9_]{3,20} · 소문자화 · @ 제거 · 빈 값은 null · 예약어 거부", () => {
  assert.equal(HANDLE_RE.source, "^[a-z0-9_]{3,20}$");
  assert.deepEqual(validateHandle(""), { ok: true, handle: null });
  assert.deepEqual(validateHandle("   "), { ok: true, handle: null });
  assert.deepEqual(validateHandle("@Dongwoo_12"), { ok: true, handle: "dongwoo_12" });
  assert.equal(normalizeHandle(" @@Abc "), "abc");
  for (const bad of ["ab", "a".repeat(21), "한글핸들", "with-dash", "with space", "dot.name"]) {
    const v = validateHandle(bad);
    assert.equal(v.ok, false, bad);
  }
  for (const r of ["admin", "me", "login", "signup", "notes", "map", "town", "api", "my", "u"]) {
    assert.ok(RESERVED_HANDLES.includes(r), r);
    const v = validateHandle(r);
    assert.equal(v.ok, false, r);
    assert.equal(!v.ok && v.error, "쓸 수 없는 핸들 · 다른 낱말로");
  }
  /* 예약어 검사도 소문자 기준 — "Admin" 도 막힌다 */
  assert.equal(validateHandle("Admin").ok, false);
  assert.equal(validateHandle("admin2").ok, true);
});

test("A2 validateBio — 120자 · 줄바꿈·연속 공백은 한 칸 · 빈 값은 ''", () => {
  assert.equal(BIO_MAX, 120);
  assert.deepEqual(validateBio(null), { ok: true, bio: "" });
  assert.deepEqual(validateBio("  한 줄 \n 소개  "), { ok: true, bio: "한 줄 소개" });
  assert.deepEqual(validateBio("가".repeat(120)), { ok: true, bio: "가".repeat(120) });
  const over = validateBio("가".repeat(121));
  assert.equal(over.ok, false);
  assert.equal(!over.ok && over.error, "소개는 120자 이내");
});

test("A2 isHandleConflict — 23505 또는 profiles_handle_key 메시지만 409", () => {
  assert.equal(isHandleConflict({ code: "23505", message: "duplicate key" }), true);
  assert.equal(isHandleConflict({ code: "PGRST116", message: 'duplicate key value violates unique constraint "profiles_handle_key"' }), true);
  assert.equal(isHandleConflict({ code: "42P01", message: "relation does not exist" }), false);
  assert.equal(isHandleConflict(null), false);
});

test("A2 PATCH /api/me/profile — app_users.name + profiles(full_name·handle·bio) · 23505 → 409 · app_users 에 bio/phone/location 없음", () => {
  const src = strip(read("app/api/me/profile/route.ts"));
  assert.match(src, /publicUpdates\.full_name = name/);
  assert.match(src, /validateHandle\(body\.handle === null \? "" : String\(body\.handle\)\)/);
  assert.match(src, /validateBio\(body\.bio === null \? "" : String\(body\.bio\)\)/);
  assert.match(src, /\.from\("profiles"\)\s*\.update\(\{ \.\.\.publicUpdates, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(src, /if \(isHandleConflict\(error\)\) \{\s*return NextResponse\.json\(\{ error: "이미 쓰는 핸들" \}, \{ status: 409 \}\)/);
  assert.doesNotMatch(src, /updates\.(bio|phone|location) =/, "app_users 에 없는 컬럼으로 보내던 줄 삭제");
  assert.match(src, /\.from\("app_users"\)\.update\(dbUpdates\)\.eq\("email", lowerEmail\)/);
  /* A6 — 이름·핸들·소개가 바뀌면 /u 를 비운다(새 주소 + 옛 주소) */
  assert.match(src, /if \(updates\.avatar_url !== undefined \|\| Object\.keys\(publicUpdates\)\.length > 0\) \{\s*scheduleProfileInvalidation\(email\);/);
  assert.match(src, /profilePaths\(\[previous\.handle, previous\.full_name\]\)/, "옛 핸들·이름 주소도 비운다");
  assert.doesNotMatch(src, /[가-힣]!|해 보세요/);
});

test("A2 loadMeProfile — profiles.handle·bio 를 같이 읽는다(publicProfileOk 로 실패 구분)", () => {
  const src = strip(read("lib/me/profile.ts"));
  assert.match(src, /\.from\("profiles"\)\s*\.select\("handle, bio"\)/);
  assert.match(src, /publicProfileOk = !pub\.error/);
  assert.match(src, /handle\?: string \| null;/);
  assert.match(src, /bio\?: string \| null;/);
});

test("A2 ProfileEditSheet — 공개 이름·핸들·소개 세 칸 · 거짓 문장 삭제 · 핸들 없음 문구 · 열 때 GET 으로 채움 · btn-primary 1", () => {
  const src = read("app/my/ProfileEditSheet.tsx");
  const code = strip(src);
  assert.doesNotMatch(code, /공개 노트와 댓글에 이 이름이 보여요/, "거짓 문장");
  assert.match(code, /새로 쓰는 노트·글·댓글에 보이는 이름 · 지난 글은 그대로/);
  assert.match(code, /공개 이름 · 닉네임/);
  assert.match(code, /핸들 · 프로필 주소/);
  assert.match(code, /핸들 없음 · 이름으로 찾기/);
  assert.match(code, /naezipnow\.com\/u\/\$\{handlePreview\}/);
  assert.match(code, /fetch\("\/api\/me\/profile", \{ cache: "no-store" \}\)/, "열 때 핸들·소개를 받는다");
  assert.match(code, /핸들·소개 불러오기 실패 · 잠시 후 다시/);
  assert.match(code, /maxLength=\{BIO_MAX \* 2\}/);
  assert.equal((code.match(/\bbtn-primary\b/g) ?? []).length, 1);
  assert.doesNotMatch(code, /text-\[\d+px\]/, "임의 px 없음");
  assert.doesNotMatch(code, /[가-힣]!|해 보세요/);
  /* 못 받았으면 두 칸을 잠근다 — 빈 값으로 덮어쓰지 않게 */
  assert.match(code, /disabled=\{!pubEditable\}/);
  assert.match(code, /if \(pub\.phase === "ready"\) \{\s*if \(handleV\.handle !== pub\.value\.handle\) out\.handle = handleV\.handle;/);
});

/* ---------- A3 /u ---------- */
test("A3 /u/[handle] — 같은 이름 N명은 고르지 않는다 · 노트 폴백도 FollowButton · 첫 노트 월은 KST · @핸들", () => {
  const src = strip(read("app/u/[handle]/page.tsx"));
  assert.match(src, /\.select\(cols, \{ count: "exact" \}\)\s*\.ilike\("full_name", escapeLike\(q\)\)\s*\.limit\(1\)/);
  assert.match(src, /if \(typeof byName\.count === "number" && byName\.count > 1\) \{\s*return \{ ok: true, profile: null, ambiguous: \{ count: byName\.count \} \};/);
  assert.match(src, /같은 이름 \{n\}명 · 핸들 주소\(\/u\/핸들\)로 구분/);
  assert.match(src, /<FollowButton handle=\{profile \? \(profile\.handle \?\? profile\.name\) : displayName\} \/>/);
  assert.doesNotMatch(src, /href=\{`\/login\?callbackUrl=\$\{encodeURIComponent\(`\/u\//, "로그인 링크 팔로우 버튼 삭제");
  assert.match(src, /const k = kstParts\(first\);\s*return k \? `\$\{k\.year\}\.\$\{k\.month\}` : null;/);
  assert.doesNotMatch(src, /first\.slice\(0, 7\)\.split\("-"\)/, "UTC 월 삭제");
  assert.match(src, /profile\?\.handle \? `@\$\{profile\.handle\}` : `naezipnow\.com\/u\/\$\{handleLabel\}`/);
  assert.match(src, /\{bio && \(/, "소개는 있을 때만");
  /* 1057 의 ISR 실패 규칙은 그대로 */
  assert.match(src, /if \(loadFailed\) \{\s*throw new Error\(/);
});

test("A3 resolveEmailByHandle — handle → full_name(둘 이상이면 ambiguous) → 공개 노트 라벨 · 라우트는 ambiguous 를 409 로", () => {
  const store = strip(read("lib/follows/store-db.ts"));
  assert.match(store, /export const AMBIGUOUS_HANDLE = "ambiguous" as const/);
  assert.match(store, /export async function resolveEmailByHandle\(handleOrName: string\): Promise<ResolvedHandle>/);
  const fn = store.slice(store.indexOf("export async function resolveEmailByHandle"), store.indexOf("export type FollowingPublic"));
  assert.ok(fn.indexOf('.ilike("handle", pattern)') < fn.indexOf('.ilike("full_name", pattern)'), "핸들 먼저");
  assert.match(fn, /if \(typeof byName\.count === "number" && byName\.count > 1\) return AMBIGUOUS_HANDLE;/);
  assert.match(fn, /\.from\("inspection_notes"\)/, "공개 노트 라벨 폴백");
  assert.match(fn, /if \(emails\.size > 1\) return AMBIGUOUS_HANDLE;/);
  const route = strip(read("app/api/me/follows/route.ts"));
  assert.equal((route.match(/if \(followedEmail === AMBIGUOUS_HANDLE\) \{\s*return NextResponse\.json\(\{ error: FOLLOW_AMBIGUOUS \}, \{ status: 409 \}\);/g) ?? []).length, 2, "POST·DELETE 둘 다");
  assert.match(route, /if \(email === AMBIGUOUS_HANDLE\) return NextResponse\.json\(\{ following: false, ambiguous: true \}\);/);
});

/* ---------- A4 /welcome 재진입 ---------- */
test("A4 mergePersonalization — 요청에 있고 null 이 아닌 키만 바꾼다 · 나머지는 지금 값 그대로", () => {
  const existing = {
    regions: ["서울 강남구"],
    budget: { type: "sale" as const, min: 6, max: 9, label: "6~9억" },
    purpose: "live" as const,
    persona: "resident" as const,
    profile: { ageBand: "30s" },
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const merged = mergePersonalization(
    existing,
    { regions: ["서울 송파구", "경기 성남시 분당구"], budget: null, purpose: null, persona: null, profile: null },
    "2026-10-12T00:00:00.000Z",
  );
  assert.deepEqual(merged, { ...existing, regions: ["서울 송파구", "경기 성남시 분당구"], updatedAt: "2026-10-12T00:00:00.000Z" });
  /* undefined 도 "손대지 않음" */
  const same = mergePersonalization(existing, {}, "2026-10-12T00:00:00.000Z");
  assert.deepEqual(same, { ...existing, updatedAt: "2026-10-12T00:00:00.000Z" });
  /* 값이 있으면 바꾼다 */
  const changed = mergePersonalization(existing, { purpose: "invest", persona: "investor" }, "t");
  assert.equal(changed.purpose, "invest");
  assert.equal(changed.persona, "investor");
  assert.deepEqual(changed.regions, existing.regions);
  /* 처음 저장 — 빈 값 위에 */
  const first = mergePersonalization(null, { regions: ["인천 연수구"] }, "t");
  assert.deepEqual(first, { ...EMPTY_PERSONALIZATION, regions: ["인천 연수구"], updatedAt: "t" });
});

test("A4 saveOnboardingPersonalization — 지금 값과 합친다 · 못 읽거나 못 쓰면 던진다 · 라우트는 503", () => {
  const lib = strip(read("lib/onboarding/personalization.ts"));
  const fn = lib.slice(lib.indexOf("export async function saveOnboardingPersonalization"));
  assert.match(fn, /regions: input\.regions == null \? null : sanitizeRegions\(input\.regions\)/);
  assert.match(fn, /const current = await loadOnboardingPersonalization\(email\);/);
  assert.match(fn, /if \(current\.status === "error"\) throw new Error/);
  assert.match(fn, /mergePersonalization\(current\.value, patch, new Date\(\)\.toISOString\(\)\)/);
  assert.match(fn, /if \(error\) throw new Error\(`user_personalization 저장 실패/);
  assert.doesNotMatch(fn, /logger\.warn\("\[onboarding\] save personalization failed"/, "warn + 200 삭제");
  const route = strip(read("app/api/me/preferences/route.ts"));
  assert.match(route, /return dbUnavailable\("personalization-save", err, "관심 지역 저장 실패 · 잠시 후 다시"\)/);
});

test("A4 WelcomeClient — 지금 지역으로 채움 · 지역만 POST · 재진입은 가입 띠 숨김 · 저장 뒤 next(기본 /my) · 실패는 머문다", () => {
  const src = read("app/welcome/WelcomeClient.tsx");
  const code = strip(src);
  assert.match(code, /fetch\("\/api\/me\/preferences", \{ cache: "no-store" \}\)/, "GET 으로 지금 지역");
  assert.match(code, /data\?\.personalization\?\.regions/);
  assert.match(code, /setReentry\(saved\.length > 0\)/);
  assert.match(code, /body: JSON\.stringify\(\{ regions \}\)/, "지역만");
  assert.doesNotMatch(code, /budget: null, purpose: null, persona: null/, "null 키를 보내던 본문 삭제");
  assert.match(code, /\{!reentry && <SignupSteps current=\{2\} className="rise-in" \/>\}/);
  assert.match(code, /const returnTo = next \?\? "\/my";/);
  assert.match(code, /if \(reentry\) \{\s*if \(!prefRes \|\| !prefRes\.ok\) \{\s*setSaveError\("관심 지역 저장 실패 · 잠시 후 다시"\);/);
  assert.match(code, /router\.push\(returnTo\);/);
  assert.match(code, /변경 없이 돌아가기/);
  /* 가입 흐름은 그대로 — 첫 노트로 */
  assert.match(code, /router\.push\(`\/notes\/new\?\$\{qs\.toString\(\)\}`\)/);
  for (const ev of ["welcome_view", "welcome_finish", "welcome_skip"]) assert.ok(src.includes(`eventName: "${ev}"`), ev);
  assert.match(strip(read("app/components/HomeMiniMap.tsx")), /href="\/welcome\?next=%2F"/, "홈에서 온 수정은 홈으로");
});

/* ---------- A5 푸시 ---------- */
test("A5 GET /api/push/subscribe?endpoint= — 로그인 · 내 행만 · { subscribed }", () => {
  const src = strip(read("app/api/push/subscribe/route.ts"));
  assert.match(src, /export async function GET\(req: Request\)/);
  assert.match(src, /searchParams\.get\("endpoint"\)/);
  assert.match(src, /\{ subscribed: false, requiresLogin: true \}, \{ status: 401 \}/);
  assert.match(src, /\.from\("push_subscriptions"\)\s*\.select\("endpoint"\)\s*\.eq\("endpoint", endpoint\)\s*\.eq\("user_email", session\.user\.email\)/);
  assert.match(src, /subscribed: Array\.isArray\(data\) && data\.length > 0/);
});

test("A5 PushSubscribe — 켜짐 전에 서버 상태 GET · 서버에 없으면 다시 저장 · 비로그인은 로그인 링크 · 차단 문구", () => {
  const src = read("components/PushSubscribe.tsx");
  const code = strip(src);
  const effect = code.slice(code.indexOf("useEffect(() => {"), code.indexOf("const subscribe = async"));
  assert.match(effect, /const server = await fetchPushServerStatus\(existing\.endpoint\);/);
  assert.ok(effect.indexOf("fetchPushServerStatus(existing.endpoint)") < effect.indexOf('setStatus("subscribed")'), "서버 확인이 켜짐보다 앞");
  assert.match(effect, /if \(server && !server\.subscribed\) \{\s*setStatus\("loading"\);\s*const result = await subscribeToPush\(\);/, "서버에 없으면 다시 저장");
  assert.match(effect, /if \(!readAuthedHint\(\)\) \{\s*if \(!cancelled\) setStatus\("guest"\);/);
  assert.match(code, /href=\{LOGIN_HREF\}/);
  assert.match(code, /const LOGIN_HREF = "\/login\?callbackUrl=%2Fmy%2Fsettings"/);
  assert.match(code, /브라우저 알림 차단됨 · 주소창 자물쇠 › 알림 허용 뒤 다시/);
  assert.doesNotMatch(code, /브라우저 알림이 차단됨</);
  assert.doesNotMatch(code, /text-\[\d+px\]/, "임의 px 없음");
  assert.match(code, /min-h-\[40px\][^"]*md:min-h-6/, "폰 탭 40px");
  /* 1007 규칙 유지 — 마운트 때 공개키 GET 없음 */
  assert.ok(!src.includes("fetchVapidPublicKey"));
});

test("A5 subscribe-client — 401 은 login_required · canOfferPush 는 granted + 서버 없음도 허용 · 상태 조회 헬퍼", async () => {
  assert.equal(pushResultMessage("login_required"), "푸시 알림은 로그인 뒤 · 설정 › 알림에서");
  assert.equal(pushResultMessage("denied"), "브라우저 알림 차단됨 · 주소창 자물쇠 › 알림 허용 뒤 다시");
  assert.equal(canOfferPush(), false, "window 없음");
  const src = strip(read("lib/push/subscribe-client.ts"));
  assert.match(src, /if \(res\.status === 401\) return "login_required";/);
  assert.match(src, /return p === "granted" && opts\.serverSubscribed === false;/);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  assert.deepEqual(await fetchPushServerStatus("https://push.example/abc", async () => json({ subscribed: true })), { subscribed: true });
  assert.deepEqual(await fetchPushServerStatus("https://push.example/abc", async () => json({ subscribed: false })), { subscribed: false });
  assert.equal(await fetchPushServerStatus("https://push.example/abc", async () => json({}, 401)), "login_required");
  assert.equal(await fetchPushServerStatus("https://push.example/abc", async () => json({}, 503)), null);
  let askedUrl = "";
  await fetchPushServerStatus("https://push.example/a?b=1", async (u) => {
    askedUrl = String(u);
    return json({ subscribed: true });
  });
  assert.equal(askedUrl, `/api/push/subscribe?endpoint=${encodeURIComponent("https://push.example/a?b=1")}`);
});

test("A5 MobileMenu 비로그인 → /login?callbackUrl=/my/settings · 알림함 한 줄(PushStatusRow)", () => {
  const menu = read("app/components/MobileMenu.tsx");
  const code = strip(menu);
  assert.match(code, /loggedIn === false \? \(\s*<Link\s+prefetch=\{false\}\s+href="\/login\?callbackUrl=%2Fmy%2Fsettings"/);
  assert.ok(menu.includes("{everOpened && <PushSubscribe />}"), "1007 의 마운트 규칙 그대로");
  const row = strip(read("components/PushStatusRow.tsx"));
  assert.match(row, /"use client"/);
  assert.match(row, /status === "loading" \|\| status === "subscribed" \|\| status === "unsupported"/, "켜짐·미지원·판정 전엔 숨김");
  assert.match(row, /브라우저 알림 끔/);
  assert.match(row, /<PushSubscribe onStatus=\{onStatus\} \/>/);
  const page = strip(read("app/notifications/page.tsx"));
  assert.match(page, /\{mode === "live" && <PushStatusRow \/>\}/);
  /* 1057 B6·B7 그대로 */
  assert.match(page, /fetch\("\/api\/notifications\/unread-count", \{ cache: "no-store" \}\)/);
  assert.match(page, /showToast\("읽음 처리 실패 · 잠시 후 다시"\)/);
});

/* ---------- 표식 ---------- */
test("[1058] 바뀐 파일마다 사실을 적은 표식이 있다", () => {
  for (const p of [
    "lib/account/display-name.ts",
    "lib/account/profile-handle.ts",
    "app/api/talk/route.ts",
    "app/api/community/posts/route.ts",
    "app/api/community/posts/[id]/comments/route.ts",
    "app/api/inspection/notes/route.ts",
    "app/api/inspection/notes/[id]/comments/route.ts",
    "app/my/ProfileEditSheet.tsx",
    "app/api/me/profile/route.ts",
    "lib/me/profile.ts",
    "app/u/[handle]/page.tsx",
    "lib/follows/store-db.ts",
    "app/api/me/follows/route.ts",
    "app/welcome/WelcomeClient.tsx",
    "app/api/me/preferences/route.ts",
    "lib/onboarding/personalization.ts",
    "lib/onboarding/personalization-merge.ts",
    "app/components/HomeMiniMap.tsx",
    "components/PushSubscribe.tsx",
    "components/PushStatusRow.tsx",
    "lib/push/subscribe-client.ts",
    "app/api/push/subscribe/route.ts",
    "app/notifications/page.tsx",
    "app/components/MobileMenu.tsx",
  ]) {
    assert.match(read(p), /\[1058/, p);
  }
});
