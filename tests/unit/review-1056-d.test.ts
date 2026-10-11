/* [1056 · D] 홈 "오늘의 활동" 카드 · 전문가 답변 푸시 게이트 — 잠그는 사실:
 *  D1 출석 줄 문장 규칙(완료/연속/끊김/첫 출석)과 날짜 축약.
 *  D2 포인트 줄 링크 — 적립 가능한 주간 미션이 있으면 미션 탭.
 *  D3 홈 레일이 카드를 동적 import 로 붙이고(첫 번들 밖), 로그인 뒤에만 그린다.
 *  D4 /api/me/engagement 가 한 번의 조회로 출석·잔액·미션·관심지역을 내려보내고 실패 칸은 null.
 *  D5 전문가 답변 알림이 설정(pushExpert)을 읽는 헬퍼를 거친다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attendanceLine, pointsLink, shortMd } from "@/lib/home/engagement-line";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

test("D1 출석 줄 — 상태별 문장", () => {
  assert.equal(shortMd("2026-10-07"), "10/7");
  assert.equal(attendanceLine({ checkedToday: true, streak: 3, nextReward: 20, lastDate: "2026-10-11" }), "오늘 출석 완료 · 연속 3일 · 내일 20P");
  assert.equal(attendanceLine({ checkedToday: false, streak: 2, nextReward: 20, lastDate: "2026-10-10" }), "연속 출석 2일 · 오늘 20P");
  assert.equal(attendanceLine({ checkedToday: false, streak: 0, nextReward: 10, lastDate: "2026-10-07" }), "마지막 출석 10/7 · 오늘 10P");
  assert.equal(attendanceLine({ checkedToday: false, streak: 0, nextReward: 10, lastDate: null }), "첫 출석 · 오늘 10P");
  for (const s of [attendanceLine({ checkedToday: false, streak: 6, nextReward: 50, lastDate: "2026-10-10" })]) {
    assert.doesNotMatch(s, /[!！]|해 보세요|어요/);
  }
});

test("D2 포인트 줄 링크 — 적립 가능하면 미션 탭", () => {
  assert.deepEqual(pointsLink(0), { href: "/my/points", label: "포인트·미션 ›" });
  assert.deepEqual(pointsLink(2), { href: "/my/points?tab=missions", label: "적립 받기 ›" });
});

test("D3 홈 레일 — 카드는 동적 import · 로그인 뒤", () => {
  const rail = code("app/components/home/HomeMyRail.tsx");
  assert.match(rail, /dynamic\(\s*\(\) => import\("@\/app\/components\/home\/HomeEngagementCard"\)/);
  assert.match(rail, /ssr: false/);
  assert.match(rail, /if \(!authed\) return null;[\s\S]*<HomeEngagementCard \/>/);
  const card = code("app/components/home/HomeEngagementCard.tsx");
  assert.match(card, /fetch\("\/api\/me\/engagement"/);
  assert.equal((card.match(/btn-primary/g) ?? []).length, 1);
  assert.match(card, /min-h-\[40px\][^"]*md:min-h-6/);
  assert.doesNotMatch(card, /profile_region|✓|해 보세요|[가-힣]!/);
  /* 관심지역 CTA 는 설정 전에만 · 시작 미션은 완주 전에만 */
  assert.match(card, /regionsSet === false &&/);
  assert.match(card, /!missions\.startClaimed && missions\.startDone < missions\.startTotal/);
});

test("D4 /api/me/engagement — 한 번의 조회 · 실패 칸 null", () => {
  const r = code("app/api/me/engagement/route.ts");
  assert.match(r, /getAttendanceHistory\(email, 30\)/);
  assert.match(r, /currentStreak\(rows, today\)/);
  assert.match(r, /nextAttendanceReward\(rows, today\)/);
  assert.match(r, /buildMissionBoard\(email\)/);
  assert.match(r, /primaryRegion\) \|\| \(personalization\?\.regions\?\.length \?\? 0\) > 0/);
  assert.match(r, /"Cache-Control": "private, no-store"/);
  assert.equal((r.match(/return null;/g) ?? []).length >= 3, true);
});

test("D5 전문가 답변 알림 — 설정 게이트 헬퍼 경유", () => {
  const r = code("app/api/experts/[id]/consult/route.ts");
  assert.match(r, /notifyExpertConsultReply\(\{/);
  assert.doesNotMatch(r, /appendInboxNotification/);
  const h = code("lib/notifications/engagement-notify.ts");
  assert.match(h, /pref: "pushExpert"/);
});
