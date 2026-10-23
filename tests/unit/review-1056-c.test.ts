/* [1056 · C] 저장·알림·내비 묶음 검토 — 고친 사실을 잠근다.
 *
 *  C1 저장한 노트 — "note" 북마크 타입은 운영 DB CHECK(post·report·expert·meeting·market·complex)가 막는다.
 *     /my 는 모든 북마크를 노트로 풀던 조회를 하지 않고(0건을 사실대로), API 는 DB 거절을 503 + 고정 문구로 답한다.
 *  C2 저장한 글 — 동네 글 북마크(type=post)를 /my 3건 + /my/watchlist?tab=saved 전체 목록으로 보여 준다.
 *  C3 다이제스트 — 크론은 월 06:00 UTC = 15:00 KST(오후)이고 스위치 기본값이 켜짐이라 "받는 설정" 링크다.
 *  C4 폰 전체 메뉴 — /my/watchlist · /my/points 가 데스크톱 내비처럼 있다(ICON_PATHS 이름만).
 *  C5 전문가 화면 — 보관 경로 /qna 로 가는 링크 없음 · Q&A 상세는 채택 API 가 없으니 "채택된 답변"을 그리지 않음 ·
 *     현상금 배지는 bounty > 0 일 때만.
 *  C6 단지 화면 — 아무도 그리지 않는 Q&A preload(loadComplexQuestions) 없음.
 *  C7 임장 일정 리마인드 — 크론 라우트(authorizeCron · "내일 임장 일정") + etl.yml 등록 + 내일(KST) 창 계산.
 *  C8 주석 — 18:00 KST 가 아니라 15:00 KST · 이탈 리마인드는 동의자 이메일도 보낸다 · HomeLevelKpi 는 고아. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SCHEDULE_REMINDER_TITLE,
  SCHEDULE_REMINDER_URL,
  kstShortDateTime,
  kstTomorrowWindow,
  scheduleReminderBody,
} from "@/lib/inspection-schedules/reminder";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 지운 소스 — 고친 이유를 적은 주석에 옛 문구가 남아 있어도 코드만 본다 */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

/* ---------- C1 저장한 노트 ---------- */
test("C1 북마크 타입 — [1059] note 는 표가 아니라 프로필 설정 jsonb 로 간다(사유가 저장소 파일에 적혀 있다)", () => {
  const store = read("lib/bookmarks/store.ts");
  assert.match(store, /bookmarks_target_type_check/);
  /* [1059] note·listing 은 settings-store 분기 — 표 insert 로는 가지 않는다 */
  assert.match(code("lib/bookmarks/store.ts"), /if \(isSettingsKind\(input\.targetType\)\)/);
});

test("C1 북마크 API — DB 가 insert 를 거절하면 503 + \"저장 실패 · 잠시 후 다시\"", () => {
  const route = code("app/api/bookmarks/route.ts");
  assert.match(route, /try \{\s*rec = await addBookmark\(/);
  assert.match(route, /dbUnavailable\("bookmark-add", e, "저장 실패 · 잠시 후 다시"\)/);
});

test("C1 /my 저장한 노트 — [1059] note 타입만 읽어 노트로 푼다(전체 북마크를 풀지 않는다)", () => {
  const my = code("app/my/page.tsx");
  assert.doesNotMatch(my, /listBookmarks\(email\)\s*;/, "타입 없는 전체 북마크 조회 없음");
  assert.match(my, /listBookmarks\(email, "note"\)/);
  assert.match(read("app/my/page.tsx"), /\[1056 · C1 → 1059\]/);
});

/* ---------- C2 저장한 글 ---------- */
test("C2 /my 저장한 글 — type=post 북마크 3건 · postHref · 빈 상태 \"저장한 글 없음\" · 전체 보기 링크", () => {
  const my = code("app/my/page.tsx");
  assert.match(my, /listBookmarks\(email, "post"\)/);
  assert.match(my, /\.slice\(0, 3\)/);
  assert.match(my, /href: postHref\(p\)/);
  assert.match(my, /저장한 글 없음/);
  assert.match(my, /저장한 글 불러오기 실패 · 잠시 후 다시/);
  assert.match(my, /href="\/my\/watchlist\?tab=saved"/);
  assert.match(my, /tap-line inline-flex min-h-\[40px\]/, "단독 텍스트 링크는 tap-line + 폰 40px");
  const section = my.slice(my.indexOf('aria-label="저장한 글"'), my.indexOf('aria-label="결정 카드'));
  assert.ok(section.length > 0, "저장한 글 섹션은 결정 카드 섹션 앞");
  assert.doesNotMatch(section, /해 보세요|권유|느낌표/);
  assert.doesNotMatch(section, />[^<{]*![^<{]*</, "JSX 글에 느낌표 없음");
});

test("C2 /my/watchlist — \"저장한 글\" 탭이 있고 SavedPostsSection 이 post 북마크를 postHref 로 잇는다", () => {
  const page = code("app/my/watchlist/page.tsx");
  assert.match(page, /\{ key: "saved", label: "저장" \}/); /* [1059] 노트도 들어와 "저장" */
  assert.match(page, /rawTab === "saved"/);
  assert.match(page, /<SavedPostsSection email=\{email\} \/>/);
  const section = code("app/my/watchlist/SavedPostsSection.tsx");
  assert.match(section, /listBookmarks\(email, "post"\)/);
  assert.match(section, /postHref\(p\)/);
  assert.match(section, /title="저장한 글 없음"/);
  assert.match(section, /title="저장한 글 불러오기 실패"/);
  assert.match(section, /formatKstShortDate\(p\.createdAt\)/, "날짜는 KST");
  assert.doesNotMatch(section, /btn-primary/);
  assert.doesNotMatch(section, /text-\[\d+px\]/, "임의 px 글자 크기 없음");
});

/* ---------- C3 다이제스트 ---------- */
test("C3 다이제스트 — 18:00·저녁·\"매주 받아보기\" 없음 · 받는 설정 링크(알림 설정 보기 ›) · 오후(15시쯤)", () => {
  const src = code("app/digest/(index)/page.tsx");
  assert.doesNotMatch(src, /18:00/);
  assert.doesNotMatch(src, /저녁/);
  assert.doesNotMatch(src, /매주 받아보기/);
  assert.match(src, /받는 설정 · 마이 › 설정/);
  assert.match(src, /알림 설정 보기 ›/);
  assert.match(src, /기본 켜짐 · <span className="whitespace-nowrap">매주 월요일 15시경 · 1회<\/span>/); // [1084] 시각 꼴 정리
  assert.match(src, /href="\/my\/settings"/, "설정 화면으로 가는 링크는 유지");
  /* 사실 확인: 크론은 06:00 UTC 하나 · 다이제스트 스위치 기본값은 켜짐 */
  assert.match(read(".github/workflows/etl.yml"), /- cron: "0 6 \* \* \*"/);
  assert.match(read("lib/notification-prefs/store-db.ts"), /pushWeeklyDigest: true,/);
});

/* ---------- C4 폰 전체 메뉴 ---------- */
test("C4 MobileMenu — 관심 단지(/my/watchlist) · 포인트·미션(/my/points) · 아이콘은 ICON_PATHS 이름", () => {
  const menu = code("app/components/MobileMenu.tsx");
  assert.match(menu, /\{ label: "관심 단지", href: "\/my\/watchlist", icon: "heart" \}/);
  assert.match(menu, /\{ label: "포인트·미션", href: "\/my\/points", icon: "coin" \}/);
  const icons = read("app/components/Icon.tsx");
  for (const name of ["heart", "coin", "user", "crown", "settings", "life", "mail"]) {
    assert.match(icons, new RegExp(`^\\s*"?${name}"?:`, "m"), `ICON_PATHS 에 ${name}`);
  }
  /* 데스크톱 내비와 같은 목적지 */
  const side = code("app/components/DesktopSideNav.tsx");
  assert.match(side, /href: "\/my\/watchlist"/);
  assert.match(side, /href: "\/my\/points"/);
});

/* ---------- C5 전문가 · Q&A ---------- */
test("C5 전문가 화면 — 보관 경로 /qna 로 가는 링크 없음(동네이야기로)", () => {
  const p = code("app/town/experts/page.tsx");
  assert.doesNotMatch(p, /href="\/qna"/);
  assert.match(p, /이웃에게 묻기 \(동네이야기\)/);
  assert.match(read("lib/seo/archived-routes.ts"), /"\/qna",/, "/qna 는 여전히 보관 경로");
});

test("C5 Q&A — 현상금 배지는 bounty > 0 일 때만 · 채택된 답변은 그리지 않는다(채택 API 없음)", () => {
  assert.match(code("app/qna/QnaListClient.tsx"), /q\.bountyPoints > 0 && \(/);
  const detail = code("app/qna/[id]/page.tsx");
  assert.match(detail, /question\.bountyPoints > 0 && \(/);
  assert.doesNotMatch(detail, /채택된 답변/);
  assert.doesNotMatch(detail, /a\.isAccepted/);
  assert.match(read("app/qna/[id]/page.tsx"), /\[1056 · C5\]/);
  /* 등록 API 는 현상금을 0 으로 고정한다 — 배지가 켜질 데이터가 생기지 않는다 */
  assert.match(code("app/api/qna/route.ts"), /bountyPoints: 0,/);
  /* 채택 라우트가 정말 없다 */
  assert.doesNotMatch(code("app/api/qna/[id]/answers/route.ts"), /is_accepted|accepted/);
});

/* ---------- C6 단지 화면 ---------- */
test("C6 section-loaders — loadComplexQuestions · listQuestionsForComplex 없음", () => {
  const loaders = code("app/complex/[id]/section-loaders.ts");
  assert.doesNotMatch(loaders, /loadComplexQuestions/);
  assert.doesNotMatch(loaders, /listQuestionsForComplex/);
  assert.doesNotMatch(loaders, /lib\/qna\/store/);
  /* 남은 preload 는 그대로 */
  assert.match(loaders, /swallow\(loadRentHistory\(region, args\.name\)\)/);
  assert.match(loaders, /swallow\(loadRelatedNews\(args\.name, dong\)\)/);
});

/* ---------- C7 임장 일정 리마인드 ---------- */
test("C7 크론 라우트 — authorizeCron · \"내일 임장 일정\" · 수신함 + 푸시 · 멱등(최근 2일 같은 제목·본문) · {ok,sent,skipped}", () => {
  const route = code("app/api/cron/schedule-reminders/route.ts");
  assert.match(route, /await authorizeCron\(req\)/);
  assert.match(route, /listPlannedSchedulesBetween\(win\.startIso, win\.endIso\)/);
  assert.match(route, /appendInboxNotification\(\{/);
  assert.match(route, /sendPush\(/);
  assert.match(route, /from\("user_inbox_notifications"\)/);
  assert.match(route, /\.eq\("title", SCHEDULE_REMINDER_TITLE\)/);
  assert.match(route, /NextResponse\.json\(\{ ok: true, sent, skipped, pushSent, date: win\.date \}\)/);
  assert.equal(SCHEDULE_REMINDER_TITLE, "내일 임장 일정");
  assert.equal(SCHEDULE_REMINDER_URL, "/my/assistant");
  /* 저장소 읽기 헬퍼 — planned · [start, end) */
  const store = code("lib/inspection-schedules/store-db.ts");
  assert.match(store, /export async function listPlannedSchedulesBetween\(/);
  assert.match(store, /\.eq\("status", "planned"\)\s*\.gte\("scheduled_at", startIso\)\s*\.lt\("scheduled_at", endIso\)/);
});

test("C7 etl.yml — alerts 잡에 schedule-reminders 호출 한 줄 + 한국어 주석", () => {
  const yml = read(".github/workflows/etl.yml");
  assert.match(yml, /call schedule-reminders "\$\{SITE\}\/api\/cron\/schedule-reminders"/);
  assert.match(yml, /# \[1056 · C7\] 임장 일정 리마인드/);
  assert.equal((yml.match(/api\/cron\/schedule-reminders/g) ?? []).length, 1);
});

test("C7 kstTomorrowWindow — 15:00 KST 실행이면 내일, KST 자정 직후(UTC 전날 저녁)에도 KST 기준 내일", () => {
  /* 2026-10-11 06:00 UTC = 10/11 15:00 KST → 내일은 10/12 */
  const w1 = kstTomorrowWindow(new Date("2026-10-11T06:00:00Z"));
  assert.equal(w1.date, "2026-10-12");
  assert.equal(w1.startIso, "2026-10-11T15:00:00.000Z");
  assert.equal(w1.endIso, "2026-10-12T15:00:00.000Z");
  /* 2026-10-11 16:00 UTC = 10/12 01:00 KST → UTC 날짜로는 아직 11일이지만 내일은 10/13 */
  const w2 = kstTomorrowWindow(new Date("2026-10-11T16:00:00Z"));
  assert.equal(w2.date, "2026-10-13");
  assert.equal(w2.startIso, "2026-10-12T15:00:00.000Z");
  /* 월말·연말 넘김 */
  assert.equal(kstTomorrowWindow(new Date("2026-10-31T06:00:00Z")).date, "2026-11-01");
  assert.equal(kstTomorrowWindow(new Date("2026-12-31T06:00:00Z")).date, "2027-01-01");
  /* 창 길이는 정확히 하루 */
  assert.equal(Date.parse(w1.endIso) - Date.parse(w1.startIso), 24 * 60 * 60 * 1000);
});

test("C7 본문 — \"{단지/장소명} · MM/DD HH:mm\"(KST) · 단지명 없으면 제목 · 시각 못 읽으면 \"내일\"", () => {
  assert.equal(kstShortDateTime("2026-10-12T01:30:00Z"), "10/12 10:30");
  assert.equal(kstShortDateTime("2026-10-11T15:00:00Z"), "10/12 00:00");
  assert.equal(kstShortDateTime("not-a-date"), null);
  assert.equal(
    scheduleReminderBody({ title: "래미안 임장", aptName: "래미안대치팰리스", scheduledAt: "2026-10-12T01:30:00Z" }),
    "래미안대치팰리스 · 10/12 10:30",
  );
  assert.equal(
    scheduleReminderBody({ title: "강남 임장", aptName: null, scheduledAt: "2026-10-12T05:00:00Z" }),
    "강남 임장 · 10/12 14:00",
  );
  assert.equal(scheduleReminderBody({ title: "  ", aptName: "", scheduledAt: "x" }), "임장 · 내일");
});

/* ---------- C8 주석 ---------- */
test("C8 주석 — 크론 라우트 둘에 18:00 없음 · 이탈 후보 문서는 이메일 발송을 인정 · ResumeDraftPopup 은 HomeLevelKpi 고아를 명시", () => {
  for (const p of ["app/api/cron/listing-stale-reminders/route.ts", "app/api/cron/reengage-reminders/route.ts"]) {
    const src = read(p);
    assert.match(src, /15:00 KST/, p);
    assert.doesNotMatch(src.replace(/\[1056 · C8\][^\n]*\n/g, ""), /18:00/, `${p} — 사유 인용 밖에 18:00 없음`);
  }
  const cand = read("lib/reengagement/candidates.ts");
  assert.doesNotMatch(cand, /이메일을 쓰지 않는 이유/);
  assert.match(cand, /이메일\(마케팅 수신 동의자만/);
  assert.match(read("app/api/cron/reengage-reminders/route.ts"), /sendEmail\(\{ to: c\.userEmail/, "실제로 보낸다");
  const popup = read("app/components/home/ResumeDraftPopup.tsx");
  assert.doesNotMatch(popup, /KPI ④\) — 여기 다시 그리지 않는다/);
  assert.match(popup, /HomeLevelKpi 는 어디서도\s*\n?\s*\*\s*렌더되지 않는 고아 컴포넌트/);
  assert.doesNotMatch(code("app/page.tsx"), /HomeLevelKpi/, "홈은 HomeLevelKpi 를 쓰지 않는다");
});
