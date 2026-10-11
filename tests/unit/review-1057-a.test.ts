import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { reasonLabel } from "@/lib/points/reason-label";
import { extendUntil } from "@/lib/points/extend-until";
import { EARN_RULES, SPEND_ITEMS } from "@/lib/points/catalog";

/* [1057 · A] 일정·팔로우·초대·상점·포인트 라벨·만료 묶음 — 감사에서 확인한 사실의 수정을 못 박는다.
 *  A1 일정 PATCH 가 작성자를 보지 않음 · A2 비서 일정 막다른 길 · A3 팔로잉 응답의 이메일 · A4 새 팔로워 알림의 이메일 앞부분
 *  A5 self · /u ISR 실패 캐시 · A6 기존 계정 리딤 · A7 효과 먼저 적용 · A8 원장 라벨 · A9 setMonth 넘침 · A10 리더보드 1,000행 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- A1 일정 갱신·삭제 ---------- */
test("A1 updateScheduleStatus — 작성자 일치 조건 · note_id 는 넘겼을 때만 · 바뀐 행 없음은 not_found · 실패는 던진다", () => {
  const src = strip(read("lib/inspection-schedules/store-db.ts"));
  const fn = src.slice(src.indexOf("export async function updateScheduleStatus"), src.indexOf("export async function deleteSchedule"));
  assert.match(fn, /\.eq\("author_email", authorEmail\)/, "작성자 조건");
  assert.match(fn, /\.eq\("id", id\)/);
  assert.doesNotMatch(fn, /note_id: noteId \?\? null/, "noteId 없는 PATCH 가 연결을 지우지 않는다");
  assert.match(fn, /patch\.note_id = /, "넘겼을 때만 note_id");
  assert.match(fn, /\.select\("id"\)/, "바뀐 행을 센다");
  assert.match(fn, /reason: "not_found"/);
  assert.match(fn, /if \(error\) throw/);
  const del = src.slice(src.indexOf("export async function deleteSchedule"));
  assert.match(del, /\.eq\("author_email", authorEmail\)/);
  assert.match(del, /reason: "not_found"/);
});

test("A1 라우트 — PATCH·DELETE 가 404·503 을 가른다 · 200 {ok:false} 없음", () => {
  const route = strip(read("app/api/inspection/schedule/route.ts"));
  assert.match(route, /updateScheduleStatus\(id, session\.user\.email, status, noteId\)/);
  assert.match(route, /dbUnavailable\("inspection-schedule-update", e, "일정 저장 실패 · 잠시 후 다시"\)/);
  assert.match(route, /dbUnavailable\("inspection-schedule-delete", e, "일정 삭제 실패 · 잠시 후 다시"\)/);
  assert.equal((route.match(/\{ status: 404 \}/g) ?? []).length, 2, "PATCH·DELETE 각각 404");
  assert.doesNotMatch(route, /NextResponse\.json\(result\)/, "저장소 결과를 그대로 200 으로 내보내지 않는다");
});

/* ---------- A2 비서 일정 ---------- */
test("A2 비서 — 일정 줄 조작(완료·취소·삭제) · 날짜 min · ComplexPicker 재마운트 · 저장 검색 탭 링크 · 실패 —", () => {
  const actions = strip(read("app/my/assistant/ScheduleRowActions.tsx"));
  assert.match(actions, /"use client"/);
  assert.match(actions, /min-h-\[40px\]/, "폰 탭 40px");
  assert.match(actions, /md:min-h-6/);
  assert.match(actions, /router\.refresh\(\)/);
  assert.match(actions, /method: "PATCH"/);
  assert.match(actions, /method: "DELETE"/);
  assert.match(actions, /일정 삭제 · 되돌릴 수 없음/);
  assert.doesNotMatch(actions, /해 보세요|하세요|[가-힣]!/, "권유문·느낌표 없음");
  const page = strip(read("app/my/assistant/page.tsx"));
  assert.match(page, /<ScheduleRowActions id=\{s\.id\}/);
  assert.match(page, /href="\/my\/watchlist\?tab=searches"/, "저장 검색 탭");
  assert.match(page, /savedCount === null \? NA : savedCount/);
  const form = strip(read("app/my/assistant/ScheduleForm.tsx"));
  assert.match(form, /min=\{minDate \|\| undefined\}/, "날짜 min");
  assert.match(form, /kstParts\(new Date\(\)\)/, "KST 오늘");
  assert.match(form, /<ComplexPicker key=\{pickerKey\}/, "재마운트");
  assert.match(form, /setPickerKey\(\(k\) => k \+ 1\)/);
  const load = strip(read("lib/assistant/load.ts"));
  assert.match(load, /Promise<number \| null>/);
  assert.match(load, /count: "exact", head: true/);
});

/* ---------- A3 팔로잉 응답 ---------- */
test("A3 GET /api/me/follows — followedEmail 없음 · check= 분기 없음 · checkHandle 본인은 self:true", () => {
  const route = strip(read("app/api/me/follows/route.ts"));
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("async function resolveTarget"));
  assert.doesNotMatch(get, /followedEmail/, "GET 응답·코드에 이메일 없음");
  assert.doesNotMatch(get, /searchParams\.get\("check"\)/, "이메일 오라클 분기 삭제");
  assert.match(get, /searchParams\.get\("checkHandle"\)/);
  assert.match(get, /listFollowingPublic\(myEmail\)/);
  assert.match(get, /self: true/);
  assert.match(route, /dbUnavailable\("팔로우 저장 실패"/, "쓰기 실패 503");
  assert.match(route, /dbUnavailable\("팔로우 취소 실패"/);
  const store = strip(read("lib/follows/store-db.ts"));
  assert.match(store, /throw new Error\(`user_follows 저장 실패/);
  assert.match(store, /throw new Error\(`user_follows 삭제 실패/);
  assert.match(store, /throw new Error\(`profiles\(handle\) 조회 실패/, "핸들 조회 실패는 던진다");
  const pub = store.slice(store.indexOf("export async function listFollowingPublic"));
  assert.match(pub, /\.in\("email", emails\)/, "한 번의 배치 조회");
  assert.doesNotMatch(pub, /followedEmail: r\.followedEmail/, "공개 목록에 이메일을 싣지 않는다");
});

/* ---------- A4 새 팔로워 알림 ---------- */
test("A4 notifyNewFollower — 가린 이메일(maskNoteAuthor) · 7일 중복 건너뜀", () => {
  const src = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(src, /import \{ maskNoteAuthor \} from "@\/lib\/town\/shared"/);
  const fn = src.slice(src.indexOf("export async function notifyNewFollower"));
  assert.match(fn, /maskNoteAuthor\(prof\.name \|\| prof\.handle, input\.followerEmail\)/);
  assert.doesNotMatch(fn, /emailLocalPart\(input\.followerEmail\)/, "이메일 앞부분 그대로 쓰지 않는다");
  assert.match(fn, /hasRecentFollowerNotice\(input\.followedEmail, shown\)/);
  const dedupe = src.slice(src.indexOf("async function hasRecentFollowerNotice"), src.indexOf("export async function notifyNewFollower"));
  assert.match(dedupe, /\.eq\("title", "새 팔로워"\)/);
  assert.match(dedupe, /startsWith\(prefix\)/, "본문이 `<라벨> ·` 로 시작(like 의 * 치환을 피해 JS 비교)");
  assert.match(dedupe, /\.gte\("created_at", since\)/);
  assert.match(src, /FOLLOWER_NOTICE_DEDUPE_DAYS = 7/);
});

/* ---------- A5 FollowButton · /u ---------- */
test("A5 FollowButton self → null · 토글 뒤 router.refresh · /u 실패는 던져 error.tsx", () => {
  const btn = strip(read("app/components/FollowButton.tsx"));
  assert.match(btn, /if \(state === "self"\) return null/);
  assert.match(btn, /data\.self \? "self"/);
  assert.match(btn, /router\.refresh\(\)/);
  assert.match(btn, /label: "되돌리기"/, "되돌리기 토스트 유지");
  const page = strip(read("app/u/[handle]/page.tsx"));
  assert.match(page, /if \(loadFailed\) \{\s*throw new Error\(/);
  assert.doesNotMatch(page, /<ErrorState/, "실패를 ISR 로 그려 캐시하지 않는다");
  const err = strip(read("app/u/[handle]/error.tsx"));
  assert.match(err, /"use client"/);
  assert.match(err, /AreaError/);
  assert.match(err, /title="프로필 불러오기 실패"/);
  assert.doesNotMatch(err, /해 보세요|하세요|[가-힣]!/, "권유문·느낌표 없음");
});

/* ---------- A6 초대 리딤 ---------- */
test("A6 redeemReferral — app_users.created_at 7일 안만 · not_new → 409 · 클라이언트는 409 에 쿠키만 지움", () => {
  const store = strip(read("lib/referral/store.ts"));
  assert.match(store, /REFERRAL_NEW_ACCOUNT_DAYS = 7/);
  const redeem = store.slice(store.indexOf("export async function redeemReferral"), store.indexOf("export type ReferralLeaderRow"));
  assert.match(redeem, /readAccountCreatedAt\(write, refereeEmail\)/);
  assert.match(redeem, /if \(!isNewAccount\(createdAt\)\) return \{ ok: false, reason: "not_new" \}/);
  assert.match(store, /\.from\("app_users"\)\s*\.select\("created_at"\)/);
  assert.ok(redeem.indexOf("not_new") < redeem.indexOf('.insert({'), "리딤 기록 전에 판정한다");
  const route = strip(read("app/api/referral/redeem/route.ts"));
  assert.match(route, /result\.reason === "not_new"/);
  assert.match(route, /초대 코드는 가입 7일 안에만 적용/);
  assert.match(route, /\{ status: 409 \}/);
  const comp = strip(read("components/ReferralRedeem.tsx"));
  assert.match(comp, /res\.status === 409/);
  assert.match(comp, /usePathname\(\)/, "경로가 바뀌면 다시 확인");
  assert.match(comp, /lastPath\.current === path/, "같은 경로에서는 한 번");
  assert.doesNotMatch(comp, /done\.current/, "페이지 로드당 한 번 플래그 제거");
});

test("A6 isNewAccount — 7일 안 true · 8일 false · 읽을 수 없으면 false", async () => {
  /* store 는 server-only + supabase 모듈이라 순수 함수만 끌어다 쓴다 */
  const { isNewAccount } = await import("@/lib/referral/store");
  const now = new Date("2026-10-11T00:00:00Z");
  assert.equal(isNewAccount("2026-10-10T00:00:00Z", now), true);
  assert.equal(isNewAccount("2026-10-04T00:00:00Z", now), true, "정확히 7일");
  assert.equal(isNewAccount("2026-10-03T23:59:59Z", now), false);
  assert.equal(isNewAccount(null, now), false);
  assert.equal(isNewAccount("not-a-date", now), false);
});

test("A6 초대 통계·랜딩 — 적립 P 는 원장 합 · 랜딩 문구 사실화", () => {
  const store = strip(read("lib/referral/store.ts"));
  assert.doesNotMatch(store, /count \* REFERRAL_POINTS/, "성사 수 × 300 제거");
  assert.match(store, /\.eq\("reason", "referral"\)\s*\.like\("ref_id", "referee:%"\)/);
  const invite = strip(read("app/invite/[code]/page.tsx"));
  assert.doesNotMatch(invite, /AI 분석·리포트/);
  assert.doesNotMatch(invite, /포인트로 바로 이용/);
  assert.doesNotMatch(invite, /관심 단지·키워드 알림·첫 기록/);
  assert.match(invite, /관심 단지 또는 지역 알림 · 첫 임장노트 · 노트 1편 공개/);
  assert.match(invite, /매물 상단 노출 · 추천글 · 닉네임 효과 · 배지/);
});

/* ---------- A7 상점 ---------- */
test("A7 spend 라우트 — 네 효과 모두 spendPoints 가 효과 적용보다 앞 · 실패 시 refundPoints · 재구매 연장 · 피드 조건 · 캐시 비움", () => {
  const route = strip(read("app/api/points/spend/route.ts"));
  // listing_boost
  const lb = route.slice(route.indexOf('item.effect === "listing_boost"'), route.indexOf('item.effect === "post_boost"'));
  assert.ok(lb.indexOf("await spendPoints(") < lb.indexOf("await boostListing("), "매물: 차감 → 적용");
  assert.match(lb, /invalidateComplexByNames\(listing\.regionName, listing\.complexName\)/);
  assert.match(lb, /invalidateListingsIndex\(\)/);
  // post_boost
  const pb = route.slice(route.indexOf('item.effect === "post_boost"'), route.indexOf('item.effect === "nickname_aurora"'));
  assert.ok(pb.indexOf("await spendPoints(") < pb.indexOf("await applyPostBoost("), "추천글: 차감 → 적용");
  assert.match(pb, /\.or\("visibility\.is\.null,visibility\.eq\.public"\)/, "link_only·hidden 제외(피드와 같은 조건)");
  assert.match(pb, /\.eq\("is_automated", false\)/);
  assert.match(pb, /extendUntil\(target\?\.boost_until/);
  assert.match(pb, /invalidateTownFeed\(\)/);
  assert.match(pb, /invalidateTownDataCaches\(\)/);
  // nickname · badge (한 분기)
  const nb = route.slice(route.indexOf('item.effect === "nickname_aurora"'), route.indexOf("async function applyPostBoost"));
  assert.ok(nb.indexOf("await spendPoints(") < nb.indexOf('.from("profiles")\n      .update('), "닉네임·배지: 차감 → 적용");
  assert.match(nb, /extendUntil\(current\?\.kind === kind/);
  assert.match(nb, /scheduleProfileInvalidation\(email\)/);
  assert.match(nb, /invalidateAuthorStories\(sb, email\)/);
  assert.equal((route.match(/failAfterSpend\(/g) ?? []).length, 4, "선언 1 + 세 분기 호출 3");
  assert.match(route, /refundPoints\(email, item\.cost, item\.key, refundRef\)/);
  // 소유자 조건 — 차감 뒤 남의 글에 쓰지 않는다
  const apply = route.slice(route.indexOf("async function applyPostBoost"));
  assert.match(apply, /\.eq\("author_email", email\)/);
  assert.doesNotMatch(route, /Date\.now\(\) \+ \(item\.durationDays/, "now + days 덮어쓰기 제거");
});

test("A7 extendUntil — 남은 기간 뒤에 이어 붙인다 · 지났으면 지금부터", () => {
  const now = Date.UTC(2026, 9, 11);
  const DAY = 86_400_000;
  assert.equal(extendUntil(null, 7, now), new Date(now + 7 * DAY).toISOString());
  assert.equal(extendUntil(new Date(now - DAY).toISOString(), 7, now), new Date(now + 7 * DAY).toISOString(), "만료 지남");
  assert.equal(extendUntil(new Date(now + 3 * DAY).toISOString(), 7, now), new Date(now + 10 * DAY).toISOString(), "3일 남음 + 7");
  assert.equal(extendUntil("garbage", 3, now), new Date(now + 3 * DAY).toISOString());
});

test("A7 ShopClient — 교환 완료 뒤 버튼 잠김 · refundPoints 는 원장에 refund:<itemKey> 양수 행(refId 멱등)", () => {
  const shop = strip(read("app/points/shop/ShopClient.tsx"));
  assert.match(shop, /const disabled = busy \|\| st\.status === "done" \|\| insufficient;/);
  assert.doesNotMatch(shop, /insufficient && st\.status !== "done"/);
  const ledger = strip(read("lib/points/ledger.ts"));
  const refund = ledger.slice(ledger.indexOf("export async function refundPoints"));
  assert.match(refund, /const reason = `refund:\$\{itemKey\}`/);
  assert.match(refund, /alreadyAwarded\(email, reason, refId\)/, "refId 멱등");
  assert.match(refund, /sb\.rpc\("point_ledger_award"/, "적립과 같은 자물쇠");
  assert.equal(SPEND_ITEMS.length, 5, "상품 수 그대로(새 상품 없음)");
});

/* ---------- A8 라벨 ---------- */
test("A8 reasonLabel — EARN_RULES 전부 · spend/expire/listing_boost/report/refund · 부호 폴백", () => {
  for (const [key, rule] of Object.entries(EARN_RULES)) assert.equal(reasonLabel(key), rule.label, key);
  assert.equal(reasonLabel("quiz_daily"), "실거래가 게임 하루 1회");
  assert.equal(reasonLabel("spend:post_boost_3d"), "동네이야기 추천글 3일");
  assert.equal(reasonLabel("spend:ai_analysis", -200), "포인트 사용", "판매 중단 상품");
  assert.equal(reasonLabel("expire"), "포인트 만료");
  assert.equal(reasonLabel("listing_boost"), "매물 상단 노출");
  assert.equal(reasonLabel("report:abc"), "리포트 구매");
  assert.equal(reasonLabel("refund:x"), "환불");
  assert.equal(reasonLabel("refund:post_boost_3d"), "환불 · 동네이야기 추천글 3일");
  assert.equal(reasonLabel("unknown_thing", -30), "포인트 사용");
  assert.equal(reasonLabel("unknown_thing", 30), "포인트 적립");
  assert.equal(reasonLabel("unknown_thing"), "포인트 변동");
  assert.equal(reasonLabel("attendance_streak_7"), "7일 연속 출석 보너스");
});

test("A8 두 화면이 같은 라벨을 쓴다 · 지갑 이번 달 합은 원장 달 조회", () => {
  const api = strip(read("app/api/notifications/route.ts"));
  assert.match(api, /import \{ reasonLabel \} from "@\/lib\/points\/reason-label"/);
  assert.match(api, /pointLabel\(r\.reason, r\.delta\)/);
  assert.doesNotMatch(api, /return reason \|\| "포인트 변동"/, "원문 그대로 보여 주던 폴백 제거");
  const page = strip(read("app/my/points/page.tsx"));
  assert.match(page, /import \{ reasonLabel \} from "@\/lib\/points\/reason-label"/);
  assert.doesNotMatch(page, /EARN_RULES\[reason\]\?\.label \?\? "포인트 적립"/, "사용 행을 적립으로 적던 분기 제거");
  assert.match(page, /\.gte\("created_at", since\)/);
  assert.match(page, /kstMonthStart\(now\)/);
  assert.match(page, /readPaged</);
  assert.match(page, /month \? `\+\$\{month\.earned/);
  assert.match(page, /: "—"/, "실패는 —");
  assert.doesNotMatch(page, /history\s*\.filter\(\(r\) => r\.delta > 0 && sameMonth/, "최근 50행 합 제거");
});

/* ---------- A9 만료 월 산술 · 스윕 ---------- */
test("A9 addMonthsClamped — 1/31+6 → 7/31 · 8/31+6 → 2/28(윤년 2/29) · 10/31+6 → 4/30", async () => {
  const { addMonthsClamped } = await import("@/lib/points/ledger");
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
  assert.equal(addMonthsClamped(new Date(iso(2026, 1, 31)), 6).toISOString(), iso(2026, 7, 31));
  assert.equal(addMonthsClamped(new Date(iso(2026, 8, 31)), 6).toISOString(), iso(2027, 2, 28));
  assert.equal(addMonthsClamped(new Date(iso(2027, 8, 31)), 6).toISOString(), iso(2028, 2, 29), "윤년");
  assert.equal(addMonthsClamped(new Date(iso(2026, 10, 31)), 6).toISOString(), iso(2027, 4, 30));
  assert.equal(addMonthsClamped(new Date(iso(2026, 3, 15)), 6).toISOString(), iso(2026, 9, 15), "말일 아니면 같은 날");
  const ledger = strip(read("lib/points/ledger.ts"));
  assert.doesNotMatch(ledger, /expires\.setMonth\(/, "setMonth(+6) 제거");
  assert.match(ledger, /const expires = pointExpiryFrom\(now\)/);
});

test("A9 points-expiry-sweep — 후보 조회는 readPaged · expires_at,id 정렬 · limit(2000) 없음 · 잔액 경합 주석", () => {
  const raw = read("app/api/cron/points-expiry-sweep/route.ts");
  const src = strip(raw);
  assert.doesNotMatch(src, /\.limit\(2000\)/);
  assert.equal((src.match(/readPaged</g) ?? []).length, 3, "후보 2 + 사용자 원장 1");
  assert.equal((src.match(/\.order\("expires_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/g) ?? []).length, 2);
  assert.match(raw, /자물쇠 밖/, "잔액 경합은 손대지 않고 적어 둔다");
  assert.doesNotMatch(src, /해 보세요/, "권유문 없음");
});

/* ---------- A10 리더보드 ---------- */
test("A10 getReferralLeaderboard — readPaged · created_at,id 정렬 · limit(3000) 없음", () => {
  const store = strip(read("lib/referral/store.ts"));
  const lb = store.slice(store.indexOf("export async function getReferralLeaderboard"));
  assert.match(lb, /readPaged</);
  assert.match(lb, /\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  assert.doesNotMatch(lb, /\.limit\(3000\)/);
});

/* ---------- 표식 ---------- */
test("[1057] 바뀐 파일마다 사실을 적은 표식이 있다", () => {
  for (const p of [
    "app/api/inspection/schedule/route.ts",
    "lib/inspection-schedules/store-db.ts",
    "app/my/assistant/page.tsx",
    "app/my/assistant/ScheduleForm.tsx",
    "app/my/assistant/ScheduleRowActions.tsx",
    "lib/assistant/load.ts",
    "app/api/me/follows/route.ts",
    "lib/follows/store-db.ts",
    "app/components/FollowButton.tsx",
    "app/u/[handle]/page.tsx",
    "app/u/[handle]/error.tsx",
    "lib/notifications/engagement-notify.ts",
    "lib/referral/store.ts",
    "app/api/referral/redeem/route.ts",
    "components/ReferralRedeem.tsx",
    "app/invite/[code]/page.tsx",
    "app/my/points/ReferralSection.tsx",
    "app/api/points/spend/route.ts",
    "app/points/shop/ShopClient.tsx",
    "lib/points/ledger.ts",
    "lib/points/reason-label.ts",
    "lib/points/extend-until.ts",
    "app/api/notifications/route.ts",
    "app/my/points/page.tsx",
    "app/api/cron/points-expiry-sweep/route.ts",
  ]) {
    assert.match(read(p), /\[1057/, p);
  }
});
