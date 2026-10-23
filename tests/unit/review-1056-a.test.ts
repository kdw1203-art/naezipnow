import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  attendanceRewardFor,
  currentStreak,
  latestAttendance,
  nextAttendanceReward,
  prevDateString,
} from "@/lib/points/attendance-rules";
import { EARN_RULES, SPEND_ITEMS, earnGuideRules } from "@/lib/points/catalog";
import { parseQuizCompleteBody } from "@/lib/quiz/complete";
import { START_MISSION_DEFS } from "@/lib/missions/missions";

/* [1056 · A] 포인트·출석·미션·게임 묶음 — 감사에서 확인한 사실의 수정을 못 박는다.
 *  A1 끊긴 스트릭을 "연속 출석 N일"로 적던 것 · A2 버튼 "+10P" 고정 · A3 시작 3미션 ≠ /my 3스텝
 *  A4 주간 "관심 단지 2곳"이 alert:* 행을 셈 · A5 적립표에 보관·중개사 전용 규칙 · A6 리마인드 UTC/18:00
 *  A7 게임 완주 10P · A8 초대 성사 알림 · A9 lastDate */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- A1 스트릭 규칙 ---------- */
test("A1 currentStreak — 최근 행이 오늘·어제일 때만 유효, 그보다 오래되면 0, 비면 0", () => {
  const today = "2026-10-11";
  assert.equal(currentStreak([], today), 0);
  assert.equal(currentStreak([{ date: "2026-10-11", streak: 5 }], today), 5, "오늘 출석");
  assert.equal(currentStreak([{ date: "2026-10-10", streak: 4 }], today), 4, "어제 출석 — 오늘 이어갈 수 있다");
  assert.equal(currentStreak([{ date: "2026-10-07", streak: 9 }], today), 0, "4일 전 — 끊김");
  assert.equal(currentStreak([{ date: "2026-10-09", streak: 2 }], today), 0, "그저께 — 끊김");
  /* 정렬에 기대지 않는다 — 오래된 행이 앞에 와도 가장 최근 행으로 판정 */
  assert.equal(
    currentStreak(
      [
        { date: "2026-10-05", streak: 1 },
        { date: "2026-10-10", streak: 3 },
      ],
      today,
    ),
    3,
  );
});

test("A1 prevDateString · latestAttendance — 월·연 경계", () => {
  assert.equal(prevDateString("2026-10-01"), "2026-09-30");
  assert.equal(prevDateString("2026-01-01"), "2025-12-31");
  assert.equal(prevDateString("2028-03-01"), "2028-02-29", "윤년");
  assert.equal(latestAttendance([]), null);
  assert.deepEqual(
    latestAttendance([
      { date: "2026-10-03", streak: 1 },
      { date: "2026-10-09", streak: 2 },
      { date: "2026-10-04", streak: 2 },
    ]),
    { date: "2026-10-09", streak: 2 },
  );
});

/* ---------- A2 다음 보상 티어 ---------- */
test("A2 attendanceRewardFor — 10 / 3일↑ 20 / 7일↑ 50 (store-db.checkIn · 원장 규칙 합과 같다)", () => {
  assert.equal(attendanceRewardFor(1), 10);
  assert.equal(attendanceRewardFor(2), 10);
  assert.equal(attendanceRewardFor(3), 20);
  assert.equal(attendanceRewardFor(6), 20);
  assert.equal(attendanceRewardFor(7), 50);
  assert.equal(attendanceRewardFor(30), 50);
  assert.equal(EARN_RULES.attendance.points + EARN_RULES.attendance_streak_3.points, attendanceRewardFor(3));
  assert.equal(EARN_RULES.attendance.points + EARN_RULES.attendance_streak_7.points, attendanceRewardFor(7));
});

test("A2 nextAttendanceReward — 어제 했으면 +1 티어, 오늘 했으면 내일 티어, 끊겼거나 처음이면 10", () => {
  const today = "2026-10-11";
  assert.equal(nextAttendanceReward([], today), 10, "첫 출석");
  assert.equal(nextAttendanceReward([{ date: "2026-10-10", streak: 1 }], today), 10, "어제 1일 → 오늘 2일 = 10P");
  assert.equal(nextAttendanceReward([{ date: "2026-10-10", streak: 2 }], today), 20, "어제 2일 → 오늘 3일 = 20P");
  assert.equal(nextAttendanceReward([{ date: "2026-10-10", streak: 6 }], today), 50, "어제 6일 → 오늘 7일 = 50P");
  assert.equal(nextAttendanceReward([{ date: "2026-10-11", streak: 2 }], today), 20, "오늘 2일 완료 → 내일 3일 = 20P");
  assert.equal(nextAttendanceReward([{ date: "2026-10-11", streak: 7 }], today), 50, "오늘 7일 완료 → 내일 8일 = 50P");
  assert.equal(nextAttendanceReward([{ date: "2026-10-07", streak: 9 }], today), 10, "끊김 → 오늘 1일 = 10P");
});

test("A2·A9 GET /api/me/attendance — streak 은 currentStreak, nextReward·lastDate 를 내려보낸다 · POST 도 nextReward", () => {
  const src = strip(read("app/api/me/attendance/route.ts"));
  assert.ok(src.includes("currentStreak(attendance30, today)"));
  assert.ok(src.includes("nextAttendanceReward(attendance30, today)"));
  assert.ok(src.includes("latestAttendance(attendance30)?.date ?? null"));
  assert.ok(!src.includes("attendance[0]?.streak"), "7일 안 최근 행의 streak 를 그대로 쓰던 줄 제거");
  assert.equal((src.match(/attendanceRewardFor\(result\.streak \+ 1\)/g) ?? []).length, 2, "POST 두 응답 모두");
  const store = strip(read("lib/points/store-db.ts"));
  assert.ok(store.includes("attendanceRewardFor(streak)"), "checkIn 티어도 같은 함수");
});

test("A2 AttendanceButton — 버튼 문구는 nextReward, 기호 없는 완료 문구, 오류 문구 표준, 보너스 포함 표시", () => {
  const src = strip(read("app/my/points/AttendanceButton.tsx"));
  assert.ok(src.includes("`출석 체크 +${nextReward}P`"));
  assert.ok(src.includes('"오늘 출석 완료"') && !src.includes("✓"), "기호 없음");
  assert.ok(!src.includes('"출석 체크 +10P"'), "고정 +10P 제거");
  assert.ok(src.includes("출석 저장 실패 · 잠시 후 다시"));
  assert.ok(!src.includes("네트워크 오류가 발생했어요"));
  assert.ok(src.includes("보너스 포함"));
  assert.ok(src.includes("마지막 출석 ${shortDate(lastDate)}"), "A9 lastDate 표시");
  assert.match(src, /연속 출석 \$\{streak\}일 · \$\{checkedToday \? "내일" : "오늘"\} \$\{nextReward\}P/);
  assert.ok(!/[가-힣]!(?![=])/.test(src), "느낌표 없음");
  assert.ok(!src.includes("해 보세요"));
});

/* ---------- A3 시작 3미션 = /my 3스텝 ---------- */
test("A3 시작 3미션 — verify.ts 의 3스텝과 같은 id·순서, 지정된 라벨·링크", () => {
  assert.deepEqual(
    START_MISSION_DEFS.map((d) => d.key),
    ["explore", "inspection", "share"],
  );
  assert.deepEqual(
    START_MISSION_DEFS.map((d) => d.label),
    ["관심 단지 또는 지역 알림 1개", "첫 임장노트 1편", "임장노트 1편 공개"],
  );
  assert.deepEqual(
    START_MISSION_DEFS.map((d) => d.href),
    ["/map", "/notes/new?quick=1", "/notes?mine=1"],
  );
  for (const d of START_MISSION_DEFS) {
    assert.ok(!/[가-힣]!/.test(d.desc) && !d.desc.includes("해 보세요") && !d.desc.includes("드려요"), d.desc);
  }
  const missions = strip(read("lib/missions/missions.ts"));
  assert.ok(missions.includes("readVerifiedOnboardingSteps(email)"), "같은 질의(verify.ts)에서 판정");
  assert.ok(!missions.includes('"saved_searches"'), "키워드 알림(saved_searches)은 더 이상 시작 미션이 아니다");
  assert.ok(missions.includes('alreadyAwardedRef(email, "onboarding_complete", null)'), "claimed = 원장에 onboarding_complete");
  const verify = strip(read("app/api/me/onboarding/verify.ts"));
  assert.ok(verify.includes("export async function readVerifiedOnboardingSteps"));
  assert.ok(verify.includes("readVerifiedOnboardingSteps(email)"), "getVerifiedOnboarding 도 같은 헬퍼를 쓴다");
});

test("A3 claim kind=start — getVerifiedOnboarding 으로 멱등 지급, 별도 awardPoints 없음 · 안내 문구", () => {
  const src = strip(read("app/api/missions/claim/route.ts"));
  assert.ok(src.includes("getVerifiedOnboarding(email)"));
  assert.ok(!src.includes('awardPoints(email, "onboarding_complete")'), "지급 경로 이원화 제거");
  assert.ok(src.includes("awarded: v.bonusAwarded"));
  const section = strip(read("app/my/points/MissionsSection.tsx"));
  assert.ok(section.includes("3가지 완료 시 완주 보너스 200P · 1회"));
  assert.ok(!section.includes("받을 수 있어요 (1회)"));
  assert.ok(!section.includes('"✓ "'), "완료 기호 접두 제거");
  const claim = strip(read("app/my/points/MissionClaim.tsx"));
  assert.ok(claim.includes("적립 완료") && !claim.includes("✓"));
  assert.ok(claim.includes("적립 실패 · 잠시 후 다시") && claim.includes("이미 적립됨"));
});

/* ---------- A4 주간 관심 단지 2곳 — alert:* 제외 ---------- */
test("A4 주간 watch2 질의 — user_watchlist 에서 complex_id like 'alert:%' 를 뺀다 · 권유문 제거", () => {
  const src = strip(read("lib/missions/missions.ts"));
  assert.ok(src.includes('.not("complex_id", "like", "alert:%")'), "alert:region:* 행 제외");
  assert.ok(!src.includes("담아 보세요"));
  assert.ok(src.includes("지역 알림 구독은 제외"));
});

/* ---------- A5 적립표 ---------- */
test("A5 earnGuideRules — template_used 는 항상 숨김, listing_* 는 중개사에게만 따로", () => {
  const user = earnGuideRules({ isBroker: false });
  assert.ok(!user.general.some((r) => r.key === "template_used"));
  assert.ok(!user.general.some((r) => r.key.startsWith("listing_")));
  assert.equal(user.broker.length, 0);
  const broker = earnGuideRules({ isBroker: true });
  assert.ok(!broker.general.some((r) => r.key === "template_used"));
  assert.ok(!broker.general.some((r) => r.key.startsWith("listing_")));
  assert.ok(broker.broker.length > 0 && broker.broker.every((r) => r.key.startsWith("listing_")));
  assert.equal(
    user.general.length + broker.broker.length + 1,
    Object.keys(EARN_RULES).length,
    "숨긴 것은 template_used 하나뿐",
  );
  const page = strip(read("app/my/points/page.tsx"));
  assert.ok(page.includes("earnGuideRules({ isBroker })"));
  assert.ok(page.includes("<EarnGuide isBroker={false} />"), "게스트 뷰");
  assert.ok(page.includes("<EarnGuide isBroker={isBroker} />"), "지갑 뷰");
  assert.ok(page.includes("getExpertStatus(email)"));
  assert.ok(page.includes("공인중개사 매물 적립"));
  assert.ok(!page.includes("Object.values(EARN_RULES).map"), "전체 나열 제거");
});

/* ---------- A6 리마인드 크론 · 시각 문구 ---------- */
test("A6 attendance-reminders — today 는 kstDateString · 알려진 한계 주석 삭제 · 18:00 문구 없음", () => {
  const raw = read("app/api/cron/attendance-reminders/route.ts");
  const src = strip(raw);
  assert.ok(src.includes("const today = kstDateString();"));
  assert.ok(src.includes('import { kstDateString } from "@/lib/points/store-db";'));
  assert.ok(!src.includes("new Date().toISOString().slice(0, 10)"), "UTC 날짜 제거");
  assert.ok(!raw.includes("알려진 한계"), "낡은 UTC 한계 주석 삭제");
  for (const f of [
    "app/api/cron/attendance-reminders/route.ts",
    "lib/notification-prefs/store-db.ts",
    "app/my/settings/SettingsClient.tsx",
  ]) {
    assert.ok(!read(f).includes("18:00"), `${f}: 18:00 없음`);
  }
  assert.ok(read("lib/notification-prefs/store-db.ts").includes("기본 **true**(옵트아웃)"), "다이제스트 기본값 사실");
  assert.ok(!read("lib/notification-prefs/store-db.ts").includes("기본 **false**"));
  const settings = read("app/my/settings/SettingsClient.tsx");
  assert.ok(settings.includes("매일 15시경 · 1회 (기본 켜짐)")); // [1084]
  assert.ok(settings.includes("매주 월요일 15시경") && settings.includes("요약 1회 (기본 켜짐)")); // [1084]
  assert.ok(!settings.includes("(기본 꺼짐)"));
  /* 푸시 본문도 권유문 없이 사실만 */
  assert.ok(src.includes("출석 10P · 연속 3일 20P · 7일 50P"));
  assert.ok(!src.includes("잊지 마세요") && !src.includes("이어가세요"));
});

/* ---------- A7 게임 완주 적립 ---------- */
test("A7 quiz_daily 규칙 — 10P · 하루 1회 · once 아님", () => {
  const r = EARN_RULES.quiz_daily;
  assert.ok(r);
  assert.equal(r.key, "quiz_daily");
  assert.equal(r.points, 10);
  assert.equal(r.dailyCap, 1);
  assert.equal(r.once, undefined);
  assert.equal(r.label, "실거래가 게임 하루 1회");
});

test("A7 parseQuizCompleteBody — 정수 · 0 ≤ score ≤ total ≤ 20", () => {
  assert.deepEqual(parseQuizCompleteBody({ score: 7, total: 10 }), { score: 7, total: 10 });
  assert.deepEqual(parseQuizCompleteBody({ score: 0, total: 1 }), { score: 0, total: 1 });
  assert.deepEqual(parseQuizCompleteBody({ score: 20, total: 20 }), { score: 20, total: 20 });
  assert.equal(parseQuizCompleteBody({ score: 11, total: 10 }), null, "score > total");
  assert.equal(parseQuizCompleteBody({ score: 1, total: 21 }), null, "total > 20");
  assert.equal(parseQuizCompleteBody({ score: 1, total: 0 }), null, "total 0");
  assert.equal(parseQuizCompleteBody({ score: -1, total: 10 }), null);
  assert.equal(parseQuizCompleteBody({ score: 1.5, total: 10 }), null, "정수 아님");
  assert.equal(parseQuizCompleteBody({ score: "7", total: 10 }), null, "문자열");
  assert.equal(parseQuizCompleteBody(null), null);
  assert.equal(parseQuizCompleteBody("x"), null);
  assert.equal(parseQuizCompleteBody({}), null);
});

test("A7 POST /api/quiz/complete — 세션 필수 · 레이트리밋 · refId=KST 날짜 · 게임 결과 화면 호출 1회", () => {
  const route = strip(read("app/api/quiz/complete/route.ts"));
  assert.ok(route.includes("applyRateLimit(req, { max: 10, windowMs: 60_000 })"));
  assert.ok(route.includes("status: 401"));
  assert.ok(route.includes('awardPoints(session.user.email, "quiz_daily", kstDateString())'));
  assert.ok(route.includes("parseQuizCompleteBody(body)"));
  const game = strip(read("app/quiz/QuizGame.tsx"));
  assert.ok(game.includes('fetch("/api/quiz/complete"'));
  assert.ok(game.includes("if (!(await hasSession())) return { kind: \"guest\" };"), "비회원·봇은 요청 없음");
  assert.ok(game.includes('if (!replay || reward?.kind === "failed")'), "첫 판(또는 실패 뒤 재시도)에만");
  assert.ok(game.includes("+${r.points}P 적립") && game.includes("오늘 적립 완료") && game.includes("로그인하면 하루 10P 적립"));
  assert.equal((game.match(/\bbtn-primary\b/g) ?? []).length, 2, "[1020] 채움 파랑 2개 그대로");
  assert.ok(!/[가-힣]!(?![=])/.test(game), "느낌표 없음");
});

/* ---------- A8 초대 성사 알림 ---------- */
test("A8 referral redeem — 추천인 수신함 알림(원장 행 확인 뒤) · 새 회원 토스트", () => {
  const route = strip(read("app/api/referral/redeem/route.ts"));
  assert.ok(route.includes("appendInboxNotification({"));
  assert.ok(route.includes("`친구 초대 성사 · +${points}P`"));
  assert.ok(route.includes('actionUrl: "/my/points?tab=referral"'));
  assert.ok(route.includes('.eq("ref_id", `referee:${refereeEmail}`)'), "추천인 적립 행이 있을 때만");
  assert.ok(route.includes("if (result.ok) await notifyReferrer(code, email);"));
  const comp = strip(read("components/ReferralRedeem.tsx"));
  assert.ok(comp.includes('useToast } from "@/app/components/toast/ToastProvider"'));
  assert.ok(comp.includes("`초대 코드 적용 · +${pts}P`"));
  const layout = read("app/layout.tsx");
  assert.ok(layout.indexOf("<ToastProvider>") < layout.indexOf("<ReferralRedeem />"), "Provider 안쪽에 마운트");
});

/* ---------- 결제 심사 가드 — 카탈로그에 유상 항목 없음 ---------- */
test("카탈로그 — 새 유료 상품·티어 없음, 소비 항목 3+2 그대로, 적립 규칙만 추가", () => {
  assert.deepEqual(
    SPEND_ITEMS.map((s) => s.key),
    ["listing_boost_7d", "post_boost_3d", "nickname_aurora_7d", "nickname_sunset_7d", "season_badge_30d"],
  );
  assert.ok(SPEND_ITEMS.every((s) => !/plan_|charge|구독|충전/.test(s.key + s.label)));
  const cat = strip(read("lib/points/catalog.ts"));
  assert.ok(!/plan_pro|plan_expert|charge/.test(cat));
  assert.ok(Object.values(EARN_RULES).every((r) => r.points > 0), "적립은 전부 무상 리워드(양수)");
});
