import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LIKE_MILESTONES,
  HELPFUL_MILESTONES,
  likeMilestone,
  helpfulMilestone,
  clipTitle,
  emailLocalPart,
  profileHrefFor,
  kstDayLabel,
} from "@/lib/notifications/engagement-notify";
import { authorProfileHref, isLinkableAuthor } from "@/lib/profile/author-href";

/* [1056 · B] 참여 알림·프로필 링크 묶음 — 감사에서 확인한 사실의 수정을 못 박는다.
 *  B1 좋아요 무음 · B2 채택 무음 · B3 후기 도움 무음 + "30P" 고정 문구 · B4 팔로우 무음
 *  B5 답글이 부모 댓글 작성자에게 무음 · B6 지역 레벨업 무음 · B7 읽는 곳 없는 알림 설정
 *  B8 /u/[handle] 인바운드 링크 0개 · B9 받은편지함 분류 낱말 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- B1 · B3 경계 규칙 ---------- */
test("B1 likeMilestone — 1·5·10·25·50·100 에서만 참", () => {
  for (const n of [1, 5, 10, 25, 50, 100]) assert.equal(likeMilestone(n), true, String(n));
  for (const n of [0, 2, 3, 7, 11, 24, 26, 99, 101]) assert.equal(likeMilestone(n), false, String(n));
  assert.equal(likeMilestone(-1), false);
  assert.equal(likeMilestone(5.5), false, "정수가 아니면 경계가 아니다");
  assert.equal(likeMilestone(Number.NaN), false);
  assert.deepEqual([...LIKE_MILESTONES], [1, 5, 10, 25, 50, 100]);
});

test("B3 helpfulMilestone — 1·5·10·25 에서만 참", () => {
  for (const n of [1, 5, 10, 25]) assert.equal(helpfulMilestone(n), true, String(n));
  for (const n of [0, 2, 3, 7, 24, 26, 50, 100]) assert.equal(helpfulMilestone(n), false, String(n));
  assert.deepEqual([...HELPFUL_MILESTONES], [1, 5, 10, 25]);
});

/* ---------- 본문 조립 보조 ---------- */
test("clipTitle — 30자 상한 · 공백 정리 · 빈 값은 대체어", () => {
  assert.equal(clipTitle("  강남  아파트  "), "강남 아파트");
  assert.equal(clipTitle("가".repeat(40)).length, 30);
  assert.equal(clipTitle(""), "제목 없음");
  assert.equal(clipTitle(null, "단지"), "단지");
});

test("emailLocalPart · profileHrefFor — 닉네임 없을 때 이메일 앞부분 · 핸들 없으면 받은편지함", () => {
  assert.equal(emailLocalPart("hong@example.com"), "hong");
  assert.equal(emailLocalPart(""), "이웃");
  assert.equal(profileHrefFor("hong gil"), "/u/hong%20gil");
  assert.equal(profileHrefFor(null), "/notifications");
  assert.equal(profileHrefFor("  "), "/notifications");
});

test("kstDayLabel — KST 월/일(UTC 자정 직전은 다음 날)", () => {
  assert.equal(kstDayLabel("2026-10-11T00:00:00+09:00"), "10/11");
  assert.equal(kstDayLabel("2026-10-10T16:30:00Z"), "10/11", "UTC 16:30 = KST 01:30 다음 날");
  assert.equal(kstDayLabel("not-a-date"), "");
});

/* ---------- B8 프로필 링크 판정 ---------- */
test("B8 authorProfileHref — 사람 이름만 /u/ 로, 마스킹·운영진·이메일·익명은 링크 없음", () => {
  assert.equal(authorProfileHref("홍길동"), "/u/%ED%99%8D%EA%B8%B8%EB%8F%99");
  assert.equal(authorProfileHref("JangHun Bae"), "/u/JangHun%20Bae");
  assert.equal(authorProfileHref("ki** 이웃"), null, "이름 없는 계정의 마스킹 표기");
  assert.equal(authorProfileHref("익명"), null);
  assert.equal(authorProfileHref("이웃"), null);
  assert.equal(authorProfileHref("hong@example.com"), null, "옛 행의 이메일 라벨");
  assert.equal(authorProfileHref("내집나우 Lab"), null);
  assert.equal(authorProfileHref("내집나우 Lab · AI 임장노트 편집부"), null);
  assert.equal(authorProfileHref("내집나우 스카우트"), null);
  assert.equal(authorProfileHref(""), null);
  assert.equal(authorProfileHref(null), null);
  assert.equal(isLinkableAuthor("Lablanc"), true, "lab 이 낱말의 일부면 사람 이름");
});

/* ---------- 소스 텍스트 — 발송 지점이 헬퍼를 부른다 ---------- */
test("B1 좋아요 라우트가 경계 판정·알림 헬퍼를 부른다(본인 제외)", () => {
  const src = strip(read("app/api/community/posts/[id]/like/route.ts"));
  assert.match(src, /likeMilestone\(result\.likeCount\)/);
  assert.match(src, /notifyPostLikeMilestone\(/);
  assert.match(src, /result\.liked\s*&&/, "취소(liked=false)에는 보내지 않는다");
  assert.match(src, /authorEmail !== likerEmail/, "본인 좋아요는 알리지 않는다");
  assert.match(src, /postHref\(found\.post\)/, "착지점은 글 상세(story·news 판정)");
});

test("B1 헬퍼 — 제목 '좋아요 N' · 푸시는 pushLikes 로 가른다", () => {
  const src = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(src, /title: `좋아요 \$\{input\.likeCount\}`/);
  assert.match(src, /pref: "pushLikes"/);
  assert.match(src, /getPrefs\(/, "설정을 읽는다");
  assert.match(src, /from\("push_subscriptions"\)/, "구독이 있는 사람만");
  assert.doesNotMatch(src, /해 보세요|하세요|[가-힣]!/, "권유문·느낌표 없음");
});

test("B2 채택 라우트가 '댓글 채택' 알림을 보낸다 — +NP 는 실제 지급액만", () => {
  const route = strip(read("app/api/community/posts/[id]/comments/adopt/route.ts"));
  assert.match(route, /notifyCommentAdopted\(/);
  assert.match(route, /pointsAwarded,/);
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /title: "댓글 채택"/);
  assert.match(helper, /input\.pointsAwarded > 0/, "0P 면 포인트를 적지 않는다");
  assert.match(helper, /#comments`/);
});

test("B3 도움돼요 라우트 — 경계·본인 제외 · 후기 저장 응답에 pointsAwarded · 화면 문구가 실제 적립액", () => {
  const helpful = strip(read("app/api/complex-reviews/helpful/route.ts"));
  assert.match(helpful, /helpfulMilestone\(result\.count\)/);
  assert.match(helpful, /!result\.already/, "이미 누른 표(already)는 새 표가 아니다");
  assert.match(helpful, /notifyReviewHelpfulMilestone\(/);
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /title: `후기 도움 \$\{input\.helpfulCount\}`/);
  assert.match(helper, /complexHrefFromId\(input\.complexId\)/, "단지 정규 주소");
  const post = strip(read("app/api/complex-reviews/route.ts"));
  assert.match(post, /pointsAwarded = award\.awarded/);
  assert.match(post, /\{ \.\.\.review, pointsAwarded \}/);
  const ui = strip(read("app/complex/ComplexReviews.tsx"));
  assert.match(ui, /후기 저장 · \+\$\{savedPoints\}P/);
  assert.match(ui, /: "후기 저장"/);
  assert.doesNotMatch(ui, /후기가 등록됐어요\. 이웃에게 큰 도움이 됩니다/);
});

test("B4 팔로우 라우트가 새 팔로우일 때만 '새 팔로워' 를 보낸다", () => {
  const route = strip(read("app/api/me/follows/route.ts"));
  assert.match(route, /notifyNewFollower\(/);
  assert.match(route, /wasFollowing === false/, "이미 팔로우 중이면 다시 알리지 않는다");
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /title: "새 팔로워"/);
  assert.match(helper, /lookupProfileHandle\(input\.followerEmail\)/);
  assert.match(helper, /profileHrefFor\(prof\.handle \?\? prof\.name\)/, "핸들 → 닉네임 → 받은편지함");
});

test("B5 임장노트 댓글 라우트 — 부모 댓글 작성자에게 '내 댓글에 답글'(소유자·본인 제외) · 소유자 알림 유지", () => {
  const route = strip(read("app/api/inspection/notes/[id]/comments/route.ts"));
  assert.match(route, /result\.comment\.parentId/);
  assert.match(route, /loadNoteCommentAuthorEmail\(id, parentCommentId\)/);
  assert.match(route, /parentAuthor === email \|\| parentAuthor === ownerEmail/);
  assert.match(route, /notifyReplyToComment\(/);
  assert.match(route, /title: "임장노트에 댓글이 달렸어요"/, "소유자 알림은 그대로");
  assert.match(route, /pref: "pushComments"/, "B7 — 소유자 알림의 푸시는 설정으로 가른다");
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /title: "내 댓글에 답글"/);
  assert.match(helper, /\.eq\("note_id", noteId\)/);
  assert.match(helper, /if \(data\.deleted_at\) return null/, "지운 댓글의 작성자에게는 보내지 않는다");
});

test("B6 노트 생성 라우트 — 레벨업 포인트가 실제 지급됐을 때만 '지역 임장 레벨 상승'", () => {
  const route = strip(read("app/api/inspection/notes/route.ts"));
  assert.match(route, /const award = await awardPoints\(session\.user!\.email!, "region_level_up"/);
  assert.match(route, /award\.ok && award\.awarded > 0/);
  assert.match(route, /notifyRegionLevelUp\(/);
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /title: "지역 임장 레벨 상승"/);
  assert.match(helper, /actionUrl: "\/my"/);
});

test("B7 설정 키를 읽는 발송자가 있다 — pushLikes·pushComments·pushExpert", () => {
  const helper = strip(read("lib/notifications/engagement-notify.ts"));
  assert.match(helper, /"pushLikes" \| "pushComments" \| "pushExpert"/);
  const town = strip(read("lib/notifications/comment-notify.ts"));
  assert.match(town, /pushIfPrefAllows\(to, "pushComments"/, "동네 글 댓글 푸시");
  assert.match(town, /trySendViaResend\(/, "메일은 종전대로 글의 notifyComments 가 정한다");
  assert.match(helper, /pref: "pushExpert"/, "전문가 답변 헬퍼(발송 지점은 consult 라우트)");
});

test("B8 작성자 이름 링크 — 노트 상세·이야기 상세·토론 패널이 /u/ 로 간다", () => {
  for (const p of [
    "app/notes/[id]/page.tsx",
    "app/town/story/[id]/page.tsx",
    "app/components/talk/TalkPanel.tsx",
  ]) {
    const src = strip(read(p));
    assert.match(src, /authorProfileHref\(/, p);
    assert.match(src, /tap-line/, `${p} — 글자 링크는 tap-line`);
  }
  const helper = strip(read("lib/profile/author-href.ts"));
  assert.match(helper, /`\/u\/\$\{encodeURIComponent\(/);
  /* 뉴스 상세는 자동수집 기사만(사람 글은 story 로 308) — 출처명에 링크를 달지 않는다 */
  const news = strip(read("app/town/news/[id]/page.tsx"));
  assert.doesNotMatch(news, /authorProfileHref/);
});

test("B9 받은편지함 분류 — 새 제목 낱말이 활동 탭으로", () => {
  const src = strip(read("app/notifications/page.tsx"));
  const fn = src.slice(src.indexOf("function classifyInbox"), src.indexOf("function foldOps"));
  for (const kw of ["댓글", "좋아요", "답글", "채택", "팔로워", "후기 도움", "레벨 상승"]) {
    assert.match(fn, new RegExp(`t\\.includes\\("${kw}"\\)`), kw);
  }
  /* 활동 낱말이 매물 낱말보다 먼저 — "후기 도움"에 "가격"이 섞여도 활동이다 */
  assert.ok(fn.indexOf('"후기 도움"') < fn.indexOf('"매물"'));
});

test("[1056] 바뀐 파일마다 사실을 적은 표식이 있다", () => {
  for (const p of [
    "app/api/community/posts/[id]/like/route.ts",
    "app/api/community/posts/[id]/comments/adopt/route.ts",
    "app/api/complex-reviews/helpful/route.ts",
    "app/api/complex-reviews/route.ts",
    "app/complex/ComplexReviews.tsx",
    "app/api/me/follows/route.ts",
    "app/api/inspection/notes/[id]/comments/route.ts",
    "app/api/inspection/notes/route.ts",
    "lib/notifications/comment-notify.ts",
    "app/notifications/page.tsx",
    "app/notes/[id]/page.tsx",
    "app/town/story/[id]/page.tsx",
    "app/components/talk/TalkPanel.tsx",
    "lib/notifications/engagement-notify.ts",
    "lib/profile/author-href.ts",
  ]) {
    assert.match(read(p), /\[1056/, p);
  }
});
