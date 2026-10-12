import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  FOLLOWED_NOTES_LIMIT,
  authorKey,
  followedEmailKeys,
  followedNoteAuthorLabel,
  followedNoteTitle,
  shapeFollowedNotes,
  type AuthorProfile,
  type FollowedNoteRow,
} from "@/lib/follows/feed";
import {
  JOURNEY_DATE_FIELDS,
  JOURNEY_REMINDER_DEDUPE_DAYS,
  JOURNEY_REMINDER_URL,
  dueJourneyReminders,
  dueJourneyRemindersFor,
  journeyReminderBody,
  journeyReminderTitle,
} from "@/lib/journey/reminder";
import { normalizeJourneyState } from "@/lib/journey/state";

/* [1057 · C] 팔로우 피드·/my 섹션·여정 D-day 크론·게스트 결정 합치기·죽은 설정 스위치·고아 파일·댓글 초안·503·관리자 KST 날짜 묶음.
 *  C1 피드 — author_email in · saves 없음 · 이메일 비노출 · C2 /my 섹션 · C3 D-7/D-1(KST) + etl.yml + CronRunPanel
 *  C4 nz:decisions:v1 합치기 · C5 emailLikes/emailExpert 스위치 제거 · C6 lib/home 고아 2개 삭제 · C7 401 초안 보존
 *  C8 bookmarks GET 503 · assistant 저장 검색 수 try · C9 관리자 UTC 날짜 → KST */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다 */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- C1 피드 조립(순수) ---------- */
const row = (over: Partial<FollowedNoteRow> = {}): FollowedNoteRow => ({
  id: "n1",
  author_email: "Kim.Dongwoo@Example.com",
  author_label: null,
  title: "첫 임장",
  apt_name: null,
  region: "서울 마포구",
  created_at: "2026-10-10T15:30:00.000Z",
  ...over,
});

test("C1 shapeFollowedNotes — 항목 모양 · href · saves 없음 · 이메일 전체는 어디에도 없음", () => {
  const items = shapeFollowedNotes([row(), row({ id: "n2", apt_name: "래미안", title: "둘째" })], new Map());
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.deepEqual(Object.keys(a).sort(), ["authorHandle", "authorLabel", "createdAt", "href", "id", "regionLabel", "title"]);
  assert.equal(a.href, "/notes/n1");
  assert.equal(a.title, "첫 임장");
  assert.equal(b.title, "래미안", "단지명이 있으면 단지명");
  assert.equal(a.regionLabel, "서울 마포구");
  assert.equal(a.createdAt, "2026-10-10T15:30:00.000Z");
  assert.equal(a.authorHandle, null);
  assert.ok(!("saves" in a), "지어낸 saves 없음");
  assert.ok(!JSON.stringify(items).includes("example.com"), "이메일 도메인 비노출");
  assert.ok(!JSON.stringify(items).includes("Kim.Dongwoo"), "이메일 로컬파트 전체 비노출");
});

test("C1 작성자 라벨 — author_label → 프로필 이름 → 공용 마스킹(○○** 이웃) 순 · 핸들은 프로필에서", () => {
  const profiles = new Map<string, AuthorProfile>([[authorKey("Kim.Dongwoo@Example.com"), { handle: "dongwoo", name: "김동우" }]]);
  assert.equal(followedNoteAuthorLabel(row({ author_label: " 임장러 " }), profiles.get(authorKey(row().author_email))), "임장러");
  assert.equal(followedNoteAuthorLabel(row(), profiles.get(authorKey(row().author_email))), "김동우");
  assert.equal(followedNoteAuthorLabel(row(), undefined), "Ki** 이웃");
  const [it] = shapeFollowedNotes([row()], profiles);
  assert.equal(it.authorLabel, "김동우");
  assert.equal(it.authorHandle, "dongwoo");
  assert.equal(followedNoteTitle({ title: "  ", apt_name: null }), "제목 없음");
});

test("C1 같은 id 중복 제거 · 빈 id 제외 · 이메일 키는 원문+소문자 · 상한 30", () => {
  const items = shapeFollowedNotes([row(), row(), row({ id: " " })], new Map());
  assert.equal(items.length, 1);
  assert.deepEqual(followedEmailKeys([" A@B.com ", "a@b.com", ""]), ["A@B.com", "a@b.com"]);
  assert.equal(FOLLOWED_NOTES_LIMIT, 30);
});

test("C1 라우트·DB — author_email `.in` · is_public · created_at+id 정렬 · saves/maskAuthor 없음 · 503", () => {
  const db = strip(read("lib/follows/feed-db.ts"));
  assert.match(db, /\.in\("author_email", keys\)/, "팔로우한 작성자로 직접 조회");
  assert.match(db, /\.eq\("is_public", true\)/);
  assert.match(db, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/, "유일 정렬");
  assert.match(db, /from\("profiles"\)[\s\S]*\.in\("email", authorEmails\)/, "프로필 묶음 조회");
  assert.doesNotMatch(db, /listPublicNotes/, "사이트 전체 100건에서 거르지 않는다");
  const route = strip(read("app/api/me/follows/feed/route.ts"));
  assert.match(route, /listFollowedAuthorsNotes\(session\.user\.email\)/);
  assert.doesNotMatch(route, /saves|inspectionAverageScore|function maskAuthor|listPublicNotes/);
  assert.match(route, /dbUnavailable\("follows-feed", e, "새 노트 불러오기 실패 · 잠시 후 다시"\)/);
  assert.match(read("app/api/me/follows/feed/route.ts"), /\[1057/);
  /* /u/[handle] — 같은 followCounts 호출의 following 을 버리지 않는다 */
  const profile = strip(read("app/u/[handle]/page.tsx"));
  assert.match(profile, /followingCount = counts\?\.following \?\? null/);
  assert.match(profile, /팔로워 · 팔로잉 \$\{followingCount\.toLocaleString\("ko-KR"\)\}/);
});

/* ---------- C2 /my 섹션 ---------- */
test("C2 /my — FollowedAuthorsNotes(서버 컴포넌트) · 5줄 · 세 상태 문구 · CTA 없음", () => {
  const page = strip(read("app/my/page.tsx"));
  assert.match(page, /import \{ FollowedAuthorsNotes \} from "\.\/FollowedAuthorsNotes"/);
  assert.match(page, /<FollowedAuthorsNotes email=\{email\} \/>/);
  const sec = read("app/my/FollowedAuthorsNotes.tsx");
  assert.doesNotMatch(sec, /"use client"/, "서버 컴포넌트");
  assert.match(sec, /listFollowedAuthorsNotes\(email, ROWS\)/);
  assert.match(sec, /const ROWS = 5;/);
  assert.match(sec, /팔로우한 작성자의 새 노트/);
  assert.match(sec, /새 노트 불러오기 실패 · 잠시 후 다시/);
  assert.match(sec, /팔로우한 작성자 없음 · 노트 작성자 이름을 누르면 프로필/);
  assert.match(sec, /새 노트 없음/);
  assert.match(sec, /sectionState\(/, "lib/me/my-hub 상태 규칙");
  assert.doesNotMatch(sec, /btn-primary|btn-secondary/, "CTA 버튼 없음");
  assert.doesNotMatch(strip(sec), /해 보세요|하세요|[가-힣]!/, "권유문·느낌표 없음");
  assert.match(sec, /formatKstShortDate\(n\.createdAt\)/, "KST 날짜");
});

/* ---------- C3 여정 D-day ---------- */
const plan = (over: Record<string, unknown>) =>
  normalizeJourneyState({ contract: { checked: [], ...over } }).contract;

test("C3 dueJourneyReminders — D-7 · D-1 만 · 제목·본문·순서", () => {
  /* 2026-10-11 06:00 UTC = 10/11 15:00 KST → D-7 = 10/18 · D-1 = 10/12 */
  const now = new Date("2026-10-11T06:00:00Z");
  const due = dueJourneyReminders(
    plan({ contractDate: "2026-10-18", midDate: "2026-10-12", balanceDate: "2026-10-20", moveInDate: "2026-10-11" }),
    now,
  );
  assert.deepEqual(
    due.map((d) => [d.key, d.daysLeft, d.title, d.body]),
    [
      ["contractDate", 7, "계약일 D-7", "10/18 · 내 집 마련 여정"],
      ["midDate", 1, "중도금일 D-1", "10/12 · 내 집 마련 여정"],
    ],
  );
  assert.equal(journeyReminderTitle("잔금일", 1), "잔금일 D-1");
  assert.equal(journeyReminderBody("2026-01-05"), "1/5 · 내 집 마련 여정", "월·일은 0 없이");
  assert.equal(JOURNEY_REMINDER_URL, "/journey");
  assert.equal(JOURNEY_REMINDER_DEDUPE_DAYS, 10);
  assert.deepEqual(
    JOURNEY_DATE_FIELDS.map((f) => f.label),
    ["계약일", "중도금일", "잔금일", "입주일"],
  );
});

test("C3 KST 경계 — 2026-10-11T16:00Z 는 KST 10/12 01:00: 10/13 이 D-1 · 10/19 가 D-7 (UTC 날짜 10/11 로 세면 틀린다)", () => {
  const now = new Date("2026-10-11T16:00:00Z");
  const due = dueJourneyReminders(plan({ contractDate: "2026-10-19", balanceDate: "2026-10-13", midDate: "2026-10-12" }), now);
  assert.deepEqual(
    due.map((d) => d.title),
    ["계약일 D-7", "잔금일 D-1"],
  );
  /* 같은 날짜를 UTC 날짜(10/11)로 세면 10/12 가 D-1 로 나왔을 것 — 그건 없어야 한다 */
  assert.ok(!due.some((d) => d.date === "2026-10-12"));
  /* 10/11 14:59 UTC = 10/11 23:59 KST → 아직 10/11: 10/12 가 D-1 */
  const before = dueJourneyReminders(plan({ midDate: "2026-10-12" }), new Date("2026-10-11T14:59:00Z"));
  assert.deepEqual(
    before.map((d) => d.title),
    ["중도금일 D-1"],
  );
  /* 15:00 UTC = 10/12 00:00 KST → 10/12 는 D-day(알림 없음) */
  assert.deepEqual(dueJourneyReminders(plan({ midDate: "2026-10-12" }), new Date("2026-10-11T15:00:00Z")), []);
});

test("C3 날짜 없음·일정표 없음·월말 넘김 · dueJourneyRemindersFor", () => {
  assert.deepEqual(dueJourneyReminders(null, new Date("2026-10-11T06:00:00Z")), []);
  assert.deepEqual(dueJourneyReminders(plan({ priceManwon: 50_000 }), new Date("2026-10-11T06:00:00Z")), []);
  /* 10/28 KST 기준 D-7 = 11/4 */
  const due = dueJourneyReminders(plan({ balanceDate: "2026-11-04" }), new Date("2026-10-28T06:00:00Z"));
  assert.deepEqual(
    due.map((d) => d.body),
    ["11/4 · 내 집 마련 여정"],
  );
  const state = normalizeJourneyState({ done: {}, contract: { contractDate: "2026-10-12", checked: [] } });
  assert.equal(dueJourneyRemindersFor(state, new Date("2026-10-11T06:00:00Z")).length, 1);
});

test("C3 크론 라우트 — authorizeCron · readPaged(user_preferences · author_email 정렬) · 10일 멱등 · 푸시 · 503", () => {
  const src = strip(read("app/api/cron/journey-reminders/route.ts"));
  assert.match(src, /authorizeCron\(req\)/);
  assert.match(src, /readPaged</);
  assert.match(src, /from\("user_preferences"\)[\s\S]*\.not\("journey_state->contract", "is", null\)[\s\S]*\.order\("author_email"/);
  assert.match(src, /\.range\(from, to\)/);
  assert.match(src, /JOURNEY_REMINDER_DEDUPE_DAYS \* 24 \* 60 \* 60 \* 1000/);
  assert.match(src, /from\("user_inbox_notifications"\)[\s\S]*\.eq\("action_url", JOURNEY_REMINDER_URL\)/);
  assert.match(src, /status: 503/, "수신함 조회 실패면 보내지 않는다");
  assert.match(src, /appendInboxNotification\(\{/);
  assert.match(src, /from\("push_subscriptions"\)/);
  assert.match(src, /sendPush\(/);
  assert.match(src, /actionUrl: JOURNEY_REMINDER_URL/);
  assert.match(read("app/api/cron/journey-reminders/route.ts"), /\[1057/);
});

test("C3 etl.yml — alerts 잡에 journey-reminders 호출 한 줄 + 한국어 주석 · CronRunPanel 에 schedule/journey 두 작업", () => {
  const yml = read(".github/workflows/etl.yml");
  assert.match(yml, /call journey-reminders "\$\{SITE\}\/api\/cron\/journey-reminders"/);
  assert.match(yml, /# \[1057 · C3\] 내 집 마련 여정 D-day/);
  assert.equal((yml.match(/api\/cron\/journey-reminders/g) ?? []).length, 1);
  const alerts = yml.slice(yml.indexOf("\n  alerts:"));
  assert.ok(alerts.includes("call journey-reminders"), "alerts 잡 안에");
  const panel = strip(read("app/admin/data/CronRunPanel.tsx"));
  assert.match(panel, /path: "\/api\/cron\/schedule-reminders"/);
  assert.match(panel, /path: "\/api\/cron\/journey-reminders"/);
  for (const key of ["schedule-reminders", "journey-reminders"]) {
    const block = panel.slice(panel.indexOf(`key: "${key}"`), panel.indexOf(`key: "${key}"`) + 400);
    assert.match(block, /group: "알림"/, key);
    assert.match(block, /schedule: "하루 1회"/, key);
    assert.match(block, /sends: true/, key);
  }
  assert.match(read("app/admin/data/CronRunPanel.tsx"), /\[1057/);
});

/* ---------- C4 게스트 결정 합치기 ---------- */
test("C4 DecideClient — 세션이 있으면 nz:decisions:v1 를 한 건씩 POST · 성공분은 로컬에서 제거 · 상태 한 줄", () => {
  const src = strip(read("app/decide/DecideClient.tsx"));
  assert.match(src, /async function mergeGuestDecisions\(\): Promise<number>/);
  assert.match(src, /readJson\(GUEST_DECISIONS_KEY, parseDecisionList\)/);
  assert.match(src, /window\.localStorage\.removeItem\(GUEST_DECISIONS_KEY\)/);
  assert.match(src, /writeJson\(GUEST_DECISIONS_KEY, remaining\)/, "실패분만 남긴다");
  assert.match(src, /const merged = await mergeGuestDecisions\(\);/);
  assert.match(src, /로그인 전 결정 \{mergedCount\}건 합침/);
  assert.match(src, /res\.status === 400/, "400 은 다시 보내도 같다 — 버린다");
  assert.match(read("app/decide/DecideClient.tsx"), /\[1057/);
});

/* ---------- C5 설정 스위치 ---------- */
test("C5 SettingsClient — emailLikes · emailExpert 스위치 없음 · 타입 필드는 유지", () => {
  const src = strip(read("app/my/settings/SettingsClient.tsx"));
  assert.doesNotMatch(src, /key: "emailLikes"/);
  assert.doesNotMatch(src, /key: "emailExpert"/);
  assert.match(src, /key: "emailComments"/);
  assert.match(src, /key: "pushExpert"/);
  assert.match(src, /\| "emailLikes"/, "PrefKey 타입은 그대로(컬럼이 남아 있다)");
  assert.match(read("app/my/settings/SettingsClient.tsx"), /\[1057 · C5\]/);
  assert.match(read("lib/notification-prefs/store-db.ts"), /\[1057 · C5\] 읽는 메일 발송자가 없다/);
});

/* ---------- C6 고아 파일 ---------- */
test("C6 lib/home/home-feed.ts · recent-searches.ts 삭제 · importer 0 · engagement-line 은 남는다", () => {
  assert.ok(!existsSync(path.join(ROOT, "lib/home/home-feed.ts")));
  assert.ok(!existsSync(path.join(ROOT, "lib/home/recent-searches.ts")));
  assert.ok(existsSync(path.join(ROOT, "lib/home/engagement-line.ts")));
});

/* ---------- C7 댓글 초안 ---------- */
test("C7 NoteComments — 401 이면 sessionStorage(노트 id 키)에 초안을 두고 마운트 때 되살린다 · 권유문 없음", () => {
  const src = strip(read("app/notes/[id]/NoteComments.tsx"));
  assert.match(src, /const draftKey = \(noteId: string\) => `nz:note-comment-draft:\$\{noteId\}`/);
  assert.match(src, /window\.sessionStorage\.setItem\(draftKey\(noteId\), text\)/);
  assert.match(src, /if \(res\.status === 401\) \{\s*stashDraft\(noteId, text\);\s*askLogin\(\);/);
  assert.match(src, /window\.sessionStorage\.getItem\(draftKey\(noteId\)\)/);
  assert.match(src, /window\.sessionStorage\.removeItem\(draftKey\(noteId\)\)/);
  assert.doesNotMatch(src, /잠시 후 다시 시도해 주세요/);
  assert.match(read("app/notes/[id]/NoteComments.tsx"), /\[1057 · C7\]/);
});

/* ---------- C8 503 ---------- */
test("C8 bookmarks GET try/catch → 503 · assistant 저장 검색 수(서비스 키 없음 경로)도 try → null", () => {
  const route = strip(read("app/api/bookmarks/route.ts"));
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /try \{[\s\S]*?const items = await listBookmarks\(session\.user\.email, type\);/ /* [1059] try 안에 ?type=&id= 분기가 먼저 온다 */);
  assert.match(get, /dbUnavailable\("bookmark-list", e, "저장 목록 불러오기 실패 · 잠시 후 다시"\)/);
  const load = strip(read("lib/assistant/load.ts"));
  assert.match(load, /if \(!sb\) \{\s*try \{\s*return \(await listSavedSearches\(email\)\)\.length;\s*\} catch/);
  assert.match(read("app/api/bookmarks/route.ts"), /\[1057 · C8\]/);
  assert.match(read("lib/assistant/load.ts"), /\[1057 · C8\]/);
});

/* ---------- C9 관리자 KST 날짜 ---------- */
test("C9 관리자 화면 — 표시용 toISOString().slice(0,10) 세 곳이 formatKstDate 로", () => {
  for (const [f, re] of [
    ["app/admin/listings/OwnerVerificationQueue.tsx", /formatKstDate\(item\.reviewedAt\)/],
    ["app/admin/moderation/ModerationQueue.tsx", /formatKstDate\(item\.handledAt\)/],
    ["app/admin/community/page.tsx", /formatKstDate\(String\(p\.created_at \?\? ""\)\)/],
  ] as const) {
    const src = strip(read(f));
    assert.match(src, re, f);
    assert.match(src, /import \{ formatKstDate \} from "@\/lib\/format\/kst"/, f);
    assert.match(read(f), /\[1057 · C9\]/, f);
  }
  /* 필터·키(관리 SEO 의 since)는 손대지 않는다 */
  assert.match(read("app/admin/seo/page.tsx"), /const since = new Date\(Date\.now\(\) - 30 \* 86400_000\)\.toISOString\(\)\.slice\(0, 10\);/);
});
