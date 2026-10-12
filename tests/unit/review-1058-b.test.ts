import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseWriteRegion, EMPTY_WRITE_REGION } from "@/lib/town/write-region";
import {
  COMMENT_DUPE_WINDOW_MS,
  findDuplicateComment,
  liveCommentCount,
  nextUpdatedAt,
} from "@/lib/community/comment-rules";

/* [1058 · B] 이야기 상세·댓글·공감·신고·글쓰기 묶음.
 *  B1 공감 = 로그인만 · 상한 · 눌림 상태 조회  B2 저장 수 = bookmarks 실측  B3 댓글 상한·금칙어·도배·답글 알림·산 댓글 수
 *  B4 updated_at 낙관적 동시성  B5 신고 대상 해석(기사 → target_post_id · 이야기 → 티켓)  B6 글쓰기 지역 = 카탈로그
 *  B7 숨김 조회 실패 = 오류  B8 글쓴이 수정·삭제  B9 탭 40px */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- B1 공감 ---------- */
test("B1 공감 라우트 — guest 키 없음 · 로그인 401 · 1분 30회 · 이메일 소문자 키 · GET 으로 눌림 상태", () => {
  const src = strip(read("app/api/community/posts/[id]/like/route.ts"));
  assert.doesNotMatch(src, /guest:/, "guestId 로 공감이 불어났다");
  assert.doesNotMatch(src, /guestId/);
  assert.match(src, /applyRateLimit\(req, \{ max: 30, windowMs: 60_000 \}\)/);
  assert.match(src, /\.toLowerCase\(\) \?\? ""/, "사용자 키는 소문자 이메일");
  assert.match(src, /`user:\$\{email\}`/);
  assert.match(src, /\{ status: 401 \}/);
  assert.match(src, /export async function GET\(/, "버튼이 마운트 뒤 눌림 상태를 묻는다");
  assert.match(src, /userHasLikedPost\(postId, userKey\)/);
  assert.doesNotMatch(src, /post_likes 테이블이 있는지/, "개발자용 문구가 사용자에게 가지 않는다");
});

test("B1 LikeButton — 세션이 있을 때 GET /like 로 liked 를 받아 시작한다(상세는 ISR 이라 서버가 뷰어를 모른다)", () => {
  const src = strip(read("app/town/news/[id]/PostInteractions.tsx"));
  assert.match(src, /hasSession\(\)/);
  assert.match(src, /fetch\(`\/api\/community\/posts\/\$\{postId\}\/like`, \{ cache: "no-store" \}\)/);
  assert.match(src, /typeof d\?\.liked === "boolean"\) setLiked\(d\.liked\)/);
  /* 토글 뒤 숫자는 서버 응답으로 덮는다 */
  assert.match(src, /setCount\(data\.likeCount\);\s*setLiked\(data\.liked\);/);
  /* 상세 서버 조각은 세션을 읽지 않는다(공유 캐시 정책 — scripts/check-cache-policy.mjs) */
  for (const p of ["app/town/story/[id]/page.tsx", "app/town/news/[id]/page.tsx"]) {
    assert.doesNotMatch(strip(read(p)), /safeAuth|cookies\(\)|getSession\(/, p);
  }
});

/* ---------- B2 저장 수 ---------- */
test("B2 저장 수 — 상세 두 화면이 bookmarks 를 직접 세고, 못 세면 숫자 없이", () => {
  const story = strip(read("app/town/story/[id]/page.tsx"));
  assert.match(story, /const bookmarkCount = await countPostBookmarks\(post\.id\)/);
  assert.match(story, /saveCount=\{bookmarkCount\}/);
  assert.doesNotMatch(story, /post\.bookmarkCount \?\? 0/);
  const news = strip(read("app/town/news/[id]/page.tsx"));
  assert.match(news, /const saveCount = await countPostBookmarks\(post\.id\)/);
  const store = strip(read("lib/posts-store-supabase.ts"));
  assert.match(store, /\.from\("bookmarks"\)[\s\S]*?\.eq\("target_type", "post"\)[\s\S]*?\.eq\("target_id", postId\)/);
  assert.match(store, /Promise<number \| null>/, "못 센 것은 null");
  const ui = strip(read("app/town/news/[id]/PostInteractions.tsx"));
  assert.match(ui, /saveCount: number \| null;/);
  assert.match(ui, /saveCount !== null \? ` \$\{saveCount\}` : ""/);
});

/* ---------- B3 댓글 ---------- */
test("B3 댓글 라우트 — 1분 10회 · 금칙어 · 중복 429 · 부모 댓글 작성자 알림(글쓴이·본인 제외)", () => {
  const src = strip(read("app/api/community/posts/[id]/comments/route.ts"));
  assert.match(src, /applyRateLimit\(req, \{ max: 10, windowMs: 60_000 \}\)/);
  assert.match(src, /findBlockedWord\(text\)/);
  assert.match(src, /appendComment\(id, comment, \{ rejectDuplicate: true \}\)/);
  assert.match(src, /post === "duplicate"/);
  assert.match(src, /status: 429/);
  assert.match(src, /loadPostCommentAuthorEmail\(id, parentId\)/);
  assert.match(src, /parentAuthor === replierEmail \|\| parentAuthor === postAuthorEmail\) return/);
  assert.match(src, /title: "내 댓글에 답글"/);
  assert.match(src, /body: `\$\{clipTitle\(post\.title\)\} · \$\{comment\.authorLabel\}`/);
  assert.match(src, /actionUrl: `\$\{postHref\(post\)\}#comments`/);
  assert.match(src, /pref: "pushComments"/);
  assert.doesNotMatch(src, /[가-힣]!/, "느낌표 없음");
});

test("B3 산 댓글 수 — 추가·소프트 삭제 모두 liveCommentCount 를 저장한다(두 백엔드)", () => {
  const sb = strip(read("lib/posts-store-supabase.ts"));
  assert.equal((sb.match(/comment_count: liveCommentCount\(comments\)/g) ?? []).length, 2, "추가·삭제");
  assert.doesNotMatch(sb, /comment_count: comments\.length/);
  const file = strip(read("lib/posts-store-file.ts"));
  assert.equal((file.match(/commentCount: liveCommentCount\(comments\)/g) ?? []).length, 2);
  assert.doesNotMatch(file, /commentCount: comments\.length/);
});

test("B3 liveCommentCount · findDuplicateComment — 순수 규칙", () => {
  assert.equal(liveCommentCount([]), 0);
  assert.equal(
    liveCommentCount([{ deletedAt: null }, { deletedAt: "2026-10-12T00:00:00.000Z" }, {}]),
    2,
  );
  const now = Date.parse("2026-10-12T03:00:00.000Z");
  const comments = [
    { authorEmail: "a@x.com", body: "좋은 글이네요", createdAt: new Date(now - 10_000).toISOString(), deletedAt: null },
    { authorEmail: "b@x.com", body: "좋은 글이네요", createdAt: new Date(now - 10_000).toISOString(), deletedAt: null },
    { authorEmail: "a@x.com", body: "다른 말", createdAt: new Date(now - 10_000).toISOString(), deletedAt: null },
    { authorEmail: "a@x.com", body: "옛날 말", createdAt: new Date(now - COMMENT_DUPE_WINDOW_MS - 1).toISOString(), deletedAt: null },
    { authorEmail: "a@x.com", body: "지운 말", createdAt: new Date(now - 1_000).toISOString(), deletedAt: "2026-10-12T02:59:59.000Z" },
  ];
  /* 같은 사람 · 같은 말(띄어쓰기·문장부호 차이 무시) · 60초 안 → 중복 */
  assert.ok(findDuplicateComment(comments, { authorEmail: "A@x.com", body: "좋은 글이네요!!" }, now));
  /* 다른 사람의 같은 말은 중복이 아니다 */
  assert.equal(findDuplicateComment(comments, { authorEmail: "c@x.com", body: "좋은 글이네요" }, now), null);
  /* 창 밖·지운 댓글은 비교하지 않는다 */
  assert.equal(findDuplicateComment(comments, { authorEmail: "a@x.com", body: "옛날 말" }, now), null);
  assert.equal(findDuplicateComment(comments, { authorEmail: "a@x.com", body: "지운 말" }, now), null);
  /* 작성자 없는 초안·빈 본문은 판정하지 않는다 */
  assert.equal(findDuplicateComment(comments, { authorEmail: "", body: "좋은 글이네요" }, now), null);
  assert.equal(findDuplicateComment(comments, { authorEmail: "a@x.com", body: "   " }, now), null);
});

test("B3 스레드 — 지운 부모는 산 답글이 있을 때만 자리 · 빈 문구는 스레드 한 곳 · 내 댓글엔 채택 없음", () => {
  const page = strip(read("app/town/story/[id]/page.tsx"));
  assert.doesNotMatch(page, /댓글 없음/, "페이지와 스레드가 둘 다 적어 두 줄이 나왔다");
  assert.doesNotMatch(page, /activeComments/, "지운 댓글을 걸러 넘기면 답글 문맥이 사라진다");
  assert.match(page, /comments=\{post\.comments\.map\(/);
  assert.match(page, /deletedAt: c\.deletedAt \?\? null,/);
  assert.match(page, /댓글 \{liveCommentCount\}/, "머리 수는 산 댓글만");
  const thread = strip(read("app/town/news/[id]/CommentThread.tsx"));
  assert.equal((thread.match(/댓글 없음/g) ?? []).length, 1);
  assert.match(thread, /const live = comments\.filter\(\(c\) => !c\.deletedAt\)/);
  assert.match(thread, /\(!c\.deletedAt \|\| repliesOf\(c\.id\)\.length > 0\)/);
  assert.match(thread, /if \(live\.length === 0\)/);
  assert.match(thread, /isAuthor && !c\.adopted && !c\.deletedAt && !ownIds\.has\(c\.id\)/, "글쓴이 자신의 댓글엔 채택 버튼 없음");
  assert.match(thread, /\{canAdopt && onAdopt && \(/);
});

/* ---------- B4 낙관적 동시성 ---------- */
test("B4 posts-store-supabase — updated_at 조건부 갱신 · 0행 재시도 · 원본 jsonb 로 이어 쓴다", () => {
  const src = strip(read("lib/posts-store-supabase.ts"));
  assert.match(src, /\.eq\("updated_at", prevUpdatedAt\)/);
  assert.match(src, /\.select\("\*"\);\s*if \(error\)/, "select 로 0행을 구분한다(.single 아님)");
  assert.match(src, /const OCC_MAX_TRIES = 3;/);
  for (const fn of ["incrementViewCountSb", "appendCommentSb", "softDeleteCommentSb", "adoptCommentSb"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`));
    const head = body.slice(0, body.indexOf("\n}\n"));
    assert.match(head, /for \(let attempt = 0; attempt < OCC_MAX_TRIES; attempt \+= 1\)/, fn);
    assert.match(head, /if \(written === "conflict"\) continue;/, fn);
    assert.doesNotMatch(head, /\.single\(\)/, `${fn} — .single() 은 0행을 오류로 뭉갠다`);
  }
  /* 댓글 추가가 rowToPost(authorEmail 제거)를 되쓰지 않는다 */
  const append = src.slice(src.indexOf("export async function appendCommentSb("), src.indexOf("export async function softDeleteCommentSb("));
  assert.doesNotMatch(append, /getPostSb\(/, "rowToPost 를 거치면 앞선 댓글의 authorEmail 이 전부 지워진다");
  assert.match(append, /readPostRaw\(sb, id, "comments"\)/);
});

test("B4 nextUpdatedAt — 이전 값보다 반드시 뒤", () => {
  const prev = "2026-10-12T03:00:00.500Z";
  assert.equal(nextUpdatedAt(prev, Date.parse(prev)), "2026-10-12T03:00:00.501Z");
  assert.equal(nextUpdatedAt(prev, Date.parse(prev) - 5_000), "2026-10-12T03:00:00.501Z");
  assert.equal(nextUpdatedAt(prev, Date.parse(prev) + 5_000), "2026-10-12T03:00:05.500Z");
  assert.equal(nextUpdatedAt(null, Date.parse(prev)), prev);
  assert.equal(nextUpdatedAt("not-a-date", Date.parse(prev)), prev);
});

/* ---------- B5 신고 ---------- */
test("B5 reports-store — 기사 → target_post_id · 노트 → target_note_id · 이야기·매물 → 문의 티켓 · 대상 해석", () => {
  const src = strip(read("lib/moderation/reports-store.ts"));
  assert.match(src, /export type ReportTargetType = "post" \| "board" \| "note" \| "listing";/);
  assert.match(src, /targetColumns = \{ post_id: null, target_type: "post", target_post_id: targetId, comment_id: null \};/, "기사(board_posts)");
  assert.match(src, /targetColumns = \{ post_id: null, target_type: "note", target_note_id: targetId, comment_id: commentId \};/);
  assert.match(src, /target_type: "comment", target_comment_id: commentId/, "기사 댓글은 board_comments uuid 일 때만");
  /* 이야기는 content_reports 에 들어갈 수 없다(CHECK report_target_required) — 티켓 */
  assert.match(src, /createSupportTicket\(\{/);
  assert.match(src, /category: REPORT_TICKET_CATEGORY/);
  assert.match(src, /export const REPORT_TICKET_CATEGORY = "악성 콘텐츠 신고" as const;/);
  assert.doesNotMatch(src, /post_id: input\.postId/, "이야기 id 를 post_id 에만 적는 행은 CHECK 에 걸린다");
  assert.match(src, /export async function resolveReportTarget\(/);
  assert.match(src, /\["post", "board", "note", "listing"\]/, "유형이 없으면 이야기 → 기사 → 노트 → 매물 순");
  /* 자동 숨김 집계도 티켓을 센다 */
  assert.match(src, /\.from\("support_tickets"\)[\s\S]*?\.eq\("metadata->>targetId", targetId\)/);
});

test("B5 신고 라우트 — targetType·targetId 받음 · 모르는 대상 400 · 실패 문구에 DB 원문 없음", () => {
  const src = strip(read("app/api/moderation/content-report/route.ts"));
  assert.match(src, /String\(body\.targetId \?\? body\.postId \?\? ""\)/);
  assert.match(src, /parseTargetType\(body\.targetType\)/);
  assert.match(src, /resolveReportTarget\(targetId, hint\)/);
  assert.match(src, /"이 항목은 신고 대상이 아님"/);
  assert.match(src, /"신고 접수 실패 · 잠시 후 다시"/);
  assert.doesNotMatch(src, /error: res\.error \?\? "접수 실패"/, "DB 오류 원문이 사용자에게 갔다");
  assert.doesNotMatch(src, /getNote\(/, "노트만 가려내던 분기 대신 대상 해석");
  assert.match(src, /targetType === "listing"\) await markListingReport\(targetId\)/);
});

/* ---------- B6 글쓰기 지역 ---------- */
test("B6 parseWriteRegion — ?region= 을 카탈로그로 시·도까지 푼다 · 못 풀면 빈 값", () => {
  assert.deepEqual(parseWriteRegion({ region: "성남시 분당구" }), { city: "경기도", district: "성남시" });
  assert.deepEqual(parseWriteRegion({ region: "성남 분당구" }), { city: "경기도", district: "성남시" });
  assert.deepEqual(parseWriteRegion({ region: "서울 강남구" }), { city: "서울특별시", district: "강남구" });
  assert.deepEqual(parseWriteRegion({ region: "강남구" }), { city: "서울특별시", district: "강남구" });
  assert.deepEqual(parseWriteRegion({ region: "판교" }), { city: "경기도", district: "성남시" });
  assert.deepEqual(parseWriteRegion({ region: "해운대구" }), { city: "부산광역시", district: "해운대구" });
  assert.deepEqual(parseWriteRegion({ region: "부산 강서구" }), { city: "부산광역시", district: "강서구" });
  assert.deepEqual(parseWriteRegion({ region: "인천 연수구" }), { city: "인천광역시", district: "연수구" });
  assert.deepEqual(parseWriteRegion({ region: "전국" }), { city: "기타(전국)", district: "전국" });
  /* 시·도만 → 시·군·구는 고르게 둔다 */
  assert.deepEqual(parseWriteRegion({ region: "경기" }), { city: "경기도", district: "" });
  /* 폼이 표현 못 하는 시·도·모르는 이름 → 빈 값(강남구로 때우지 않는다) */
  assert.deepEqual(parseWriteRegion({ region: "대구 수성구" }), EMPTY_WRITE_REGION);
  assert.deepEqual(parseWriteRegion({ region: "없는동네" }), EMPTY_WRITE_REGION);
  assert.deepEqual(parseWriteRegion({}), EMPTY_WRITE_REGION);
  /* 옛 ?city=&district= 도 그대로 */
  assert.deepEqual(parseWriteRegion({ city: "경기도", district: "안양시 동안구" }), { city: "경기도", district: "안양시" });
  assert.deepEqual(parseWriteRegion({ city: "경기도", region: "성남시 분당구" }), { city: "경기도", district: "성남시" });
  assert.deepEqual(parseWriteRegion({ city: "경기도" }), { city: "경기도", district: "" });
});

test("B6 글쓰기 화면 — parseWriteRegion 사용 · 서울 기본값 없음 · 지역 선택 필요 · 단지 정식 주소로", () => {
  const src = strip(read("app/town/write/page.tsx"));
  assert.match(src, /parseWriteRegion\(\{\s*region: searchParams\.get\("region"\)/);
  assert.doesNotMatch(src, /: "서울특별시";/, "서울특별시 기본값");
  assert.doesNotMatch(src, /list\[0\] \?\? ""/, "첫 항목으로 때우기");
  assert.match(src, /setError\("지역 선택 필요"\)/);
  assert.match(src, /<option value="">시·도 선택<\/option>/);
  assert.match(src, /\? complexHrefFromId\(complexId\)/);
  assert.doesNotMatch(src, /`\/complex\/\$\{encodeURIComponent\(complexId\)\}`/);
});

/* ---------- B7 숨김 조회 실패 ---------- */
test("B7 이야기 상세 — 숨김 조회 실패는 오류(fail-open 아님) · 알림은 명시적으로 끈 글만 건너뛴다", () => {
  const page = strip(read("app/town/story/[id]/page.tsx"));
  assert.doesNotMatch(page, /isPostHidden\(id\)\.catch\(\(\) => false\)/);
  assert.match(page, /hidden = await isPostHidden\(id\);/);
  assert.match(page, /throw new Error\("글 불러오기 실패 · 잠시 후 다시"\)/);
  const store = strip(read("lib/moderation/reports-store.ts"));
  const fn = store.slice(store.indexOf("export async function isPostHidden("));
  assert.match(fn.slice(0, fn.indexOf("\n}\n")), /throw new Error\(/, "상세 게이트는 못 읽었으면 던진다");
  const notify = strip(read("lib/notifications/comment-notify.ts"));
  assert.match(notify, /if \(post\.notifyComments === false\) return;/);
  assert.doesNotMatch(notify, /if \(!post\.notifyComments\) return;/);
});

/* ---------- B8 글쓴이 수정·삭제 ---------- */
test("B8 OwnerActions — PATCH·DELETE · 2단계 삭제(5초) · 길이 상한 · 서버는 작성자·관리자만", () => {
  const src = strip(read("app/town/story/[id]/OwnerActions.tsx"));
  assert.match(src, /method: "PATCH"/);
  assert.match(src, /method: "DELETE"/);
  assert.match(src, /const CONFIRM_MS = 5_000;/);
  assert.match(src, /"삭제 · 확인"/);
  assert.match(src, /const TITLE_MAX = 80;/);
  assert.match(src, /const BODY_MAX = 20_000;/);
  assert.match(src, /showToast\("글 삭제"\)/);
  assert.match(src, /router\.push\("\/town"\)/);
  assert.match(src, /if \(!isOwner\) return null;/);
  assert.match(src, /min-h-\[40px\]/);
  assert.equal((src.match(/btn-primary/g) ?? []).length, 0, "채움 파랑은 사이드바 CTA 하나뿐");
  assert.doesNotMatch(src, /[가-힣]!|해 보세요/);
  assert.match(strip(read("app/town/story/[id]/page.tsx")), /<OwnerActions postId=\{post\.id\} \/>/);
  const api = strip(read("app/api/community/posts/[id]/route.ts"));
  assert.equal((api.match(/if \(!isAuthor\(post, session\) && !isAdmin\(session\)\)/g) ?? []).length, 2, "PATCH·DELETE 소유 판정");
  assert.match(api, /patch\.title\.length < 2 \|\| patch\.title\.length > 80/);
  assert.match(api, /patch\.body\.length < 5 \|\| patch\.body\.length > 20_000/);
  assert.match(api, /findBlockedWord\(patch\.title\)/);
});

/* ---------- B9 탭 ---------- */
test("B9 탭 — 댓글 글자 버튼·공감·등록·사진 빼기가 폰에서 40px", () => {
  const thread = strip(read("app/town/news/[id]/CommentThread.tsx"));
  assert.match(thread, /const TEXT_TAP = "inline-flex min-h-\[40px\] items-center px-2 t-sub font-bold md:min-h-6 md:px-0";/);
  assert.ok((thread.match(/\$\{TEXT_TAP\}/g) ?? []).length >= 4, "답글·채택·삭제·취소");
  const ui = strip(read("app/town/news/[id]/PostInteractions.tsx"));
  assert.equal((ui.match(/min-h-\[40px\]/g) ?? []).length, 2, "공감 · 등록");
  const write = strip(read("app/town/write/page.tsx"));
  assert.match(write, /h-10 w-10 items-center justify-center rounded-full bg-brand-navy text-white md:-right-1\.5 md:-top-1\.5 md:h-6 md:w-6/);
  assert.doesNotMatch(write, /h-\[22px\] w-\[22px\]/);
});

/* ---------- 표식·문구 ---------- */
test("[1058 · B] 바뀐 파일마다 사실을 적은 표식 · 느낌표·권유문 없음 · 새 임의 px 없음", () => {
  const files = [
    "app/town/news/[id]/PostInteractions.tsx",
    "app/town/news/[id]/CommentThread.tsx",
    "app/town/news/[id]/page.tsx",
    "app/town/story/[id]/page.tsx",
    "app/town/story/[id]/OwnerActions.tsx",
    "app/api/community/posts/[id]/like/route.ts",
    "app/api/community/posts/[id]/comments/route.ts",
    "app/api/community/posts/[id]/route.ts",
    "lib/posts-store.ts",
    "lib/posts-store-supabase.ts",
    "lib/posts-store-file.ts",
    "lib/community/comment-rules.ts",
    "lib/town/write-region.ts",
    "app/town/write/page.tsx",
    "app/api/moderation/content-report/route.ts",
    "lib/moderation/reports-store.ts",
    "lib/notifications/comment-notify.ts",
  ];
  for (const p of files) {
    assert.match(read(p), /\[1058/, p);
  }
  for (const p of files.filter((f) => f.endsWith(".tsx"))) {
    const src = strip(read(p));
    assert.doesNotMatch(src, /해 보세요/, p);
    assert.doesNotMatch(src, /text-\[\d+px\]/, `${p} — 글자 크기는 램프만`);
  }
  assert.doesNotMatch(strip(read("app/town/story/[id]/OwnerActions.tsx")), /[가-힣]!/);
});
