import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PUBLIC_NOTE_LIST_PATHS,
  expertPaths,
  imjangPathsForNoteRegion,
  imjangPathsForTxRegionNames,
  profilePaths,
  promptPathsForTags,
} from "@/lib/town/changed-town-paths";
import { TOWN_DATA_CACHE_TAGS, TOWN_POSTS_TAG, WEEKLY_DIGEST_TAG } from "@/lib/town/cache-tags";
import { noteRegionMatches } from "@/lib/imjang/notes-match";
import { TOWN_PROMPTS, promptTag } from "@/lib/town/prompts";

/* [1010] 동네·커뮤니티·Q&A·노트·프로필 축 — "TTL 을 올린 자리에는 쓰기 지점 비움이 함께 있다".
 *
 * 두 가지를 잠근다.
 *  1) 순수 규칙(어느 글·노트가 어느 경로를 바꾸는가)이 **화면이 쓰는 판정과 같은지**.
 *  2) 소스 규칙 — 올린 TTL 값과, 그 값을 올릴 수 있게 해 준 비움 호출이 실제로 배선돼 있는지.
 *     (revalidatePath/unstable_cache 는 next 런타임이 필요해 단위 테스트 밖이라 텍스트로 본다 —
 *      tests/unit/cache-1007.test.ts 와 같은 방식.) */

const read = (p: string): string => readFileSync(p, "utf8");

/* ── 1. 순수 규칙 ─────────────────────────────────────────────────────────── */

test("imjangPathsForNoteRegion — 화면의 매칭 판정을 거꾸로 돌린 결과와 어긋나지 않는다", () => {
  /* 노트 지역 "서울특별시 송파구 가락동" 은 정규화 후 "서울 송파구 가락동" 이고,
     /imjang/[slug] 은 noteRegionMatches(노트지역, 지역명)로 고른다. 그 판정이 참이 되는
     지역명은 정규화 라벨의 접두들뿐이다 — 아래는 그 접두 전부가 경로로 나오는지 본다. */
  const paths = imjangPathsForNoteRegion("서울특별시 송파구 가락동");
  assert.deepEqual(paths, ["/imjang/서울", "/imjang/서울-송파구", "/imjang/서울-송파구-가락동"]);

  /* 실제 지역명("서울 송파구")에 대해 화면 판정이 참이고, 그 슬러그가 위 목록에 있다 */
  assert.equal(noteRegionMatches("서울특별시 송파구 가락동", "서울 송파구"), true);
  assert.ok(paths.includes("/imjang/서울-송파구"));

  /* 우연한 접두("서울 송파구청역…")는 화면이 걸러내고, 우리도 그 슬러그를 만들지 않는다 */
  assert.equal(noteRegionMatches("서울 송파구청역 앞", "서울 송파구"), false);
  assert.ok(!imjangPathsForNoteRegion("서울 송파구청역 앞").includes("/imjang/서울-송파구"));

  /* 도(道)는 실거래 표기에 없다 — 정규화가 떨어뜨린다 */
  assert.deepEqual(imjangPathsForNoteRegion("경기도 남양주시"), ["/imjang/남양주시"]);

  /* 빈 값은 경로를 만들지 않는다(지어내지 않는다) */
  assert.deepEqual(imjangPathsForNoteRegion(""), []);
  assert.deepEqual(imjangPathsForNoteRegion(null), []);
});

test("imjangPathsForTxRegionNames — 바뀐 지역만 + 인덱스, 슬러그는 regionToSlug 와 같은 규칙", () => {
  const paths = imjangPathsForTxRegionNames(["서울 송파구", "서울 송파구", "남양주시"]);
  assert.deepEqual(paths, ["/imjang", "/imjang/서울-송파구", "/imjang/남양주시"]);
  /* 바뀐 지역이 없으면 인덱스도 비우지 않는다 — 안 바뀐 것을 비우면 재렌더만 는다 */
  assert.deepEqual(imjangPathsForTxRegionNames([]), []);
  assert.deepEqual(imjangPathsForTxRegionNames(["  "]), []);
});

test("profilePaths — handle 과 닉네임 둘 다, 한글은 인코딩 형태도 같이", () => {
  assert.deepEqual(profilePaths(["kdw", null]), ["/u/kdw"]);
  const korean = profilePaths(["홍길동"]);
  assert.deepEqual(korean, ["/u/홍길동", `/u/${encodeURIComponent("홍길동")}`]);
  /* 한 사람에게 주소가 둘(handle · full_name)이면 둘 다 나온다 */
  assert.deepEqual(profilePaths(["kdw", "케이"]), [
    "/u/kdw",
    "/u/케이",
    `/u/${encodeURIComponent("케이")}`,
  ]);
  /* 경로를 비집고 나가는 값은 만들지 않는다 */
  assert.deepEqual(profilePaths(["a/b", "", "   "]), []);
});

test("promptPathsForTags — 글감 태그가 있을 때만, 범위 밖은 만들지 않는다", () => {
  const last = TOWN_PROMPTS.length - 1;
  assert.deepEqual(promptPathsForTags([promptTag(0), "동네", promptTag(last)]), [
    "/town/prompt/0",
    `/town/prompt/${last}`,
  ]);
  /* dynamicParams=false 라 범위 밖 인덱스는 라우트가 404 다 — 경로를 만들지 않는다 */
  assert.deepEqual(promptPathsForTags([`글감#${TOWN_PROMPTS.length}`, "글감#-1", "글감#x"]), []);
  assert.deepEqual(promptPathsForTags(null), []);
});

test("expertPaths — 목록은 언제나, 상세는 id 가 있을 때만", () => {
  assert.deepEqual(expertPaths("e1"), ["/town/experts", "/town/experts/e1"]);
  assert.deepEqual(expertPaths(null), ["/town/experts"]);
});

test("공개 노트가 실리는 목록 경로 — 실제로 그 화면이 공개 노트를 서버에서 그린다", () => {
  assert.deepEqual([...PUBLIC_NOTE_LIST_PATHS], [
    "/notes",
    "/notes/best",
    "/notes/market",
    "/town/library",
  ]);
  /* 목록에 적은 근거를 소스에서 되짚는다 — 화면이 안 읽는 경로를 비우고 있으면 안 된다 */
  assert.match(read("app/notes/page.tsx"), /listPublicNotes(Page|WithFallback)/);
  assert.match(read("app/notes/best/page.tsx"), /listBestNoteMonths/);
  assert.match(read("app/notes/market/page.tsx"), /listPublicNotes\(/);
  assert.match(read("app/town/library/page.tsx"), /listPublicNotes\(/);
});

test("동네 데이터 캐시 태그는 'news' 와 겹치지 않는다(지역 축 캐시를 같이 비우지 않기 위해)", () => {
  assert.deepEqual([...TOWN_DATA_CACHE_TAGS], [TOWN_POSTS_TAG, WEEKLY_DIGEST_TAG]);
  assert.ok(!TOWN_DATA_CACHE_TAGS.includes("news"));
  for (const t of TOWN_DATA_CACHE_TAGS) assert.match(t, /^[a-z-]{1,64}$/);
});

/* ── 2. 소스 규칙 — TTL 값 ────────────────────────────────────────────────── */

/** 소스에 적힌 리터럴 그대로 적는다(브리프 규칙 5: 긴 값은 `86_400`·`604_800`). */
const ROUTE_TTL: Record<string, string> = {
  "app/town/page.tsx": "86_400",
  "app/town/news/page.tsx": "86_400",
  "app/town/news/tag/[tag]/page.tsx": "86_400",
  "app/town/library/page.tsx": "86_400",
  "app/town/groups/page.tsx": "86_400",
  "app/town/experts/page.tsx": "86_400",
  "app/town/experts/[id]/page.tsx": "86_400",
  "app/town/prompt/[idx]/page.tsx": "86_400",
  "app/qna/page.tsx": "86_400",
  "app/notes/page.tsx": "86_400",
  "app/notes/best/page.tsx": "86_400",
  "app/notes/market/page.tsx": "86_400",
  "app/notes/templates/page.tsx": "86_400",
  "app/notes/templates/[id]/page.tsx": "86_400",
  "app/u/[handle]/page.tsx": "86_400",
  "app/town/news/[id]/page.tsx": "604_800",
  "app/town/story/[id]/page.tsx": "604_800",
  "app/town/[region]/page.tsx": "604_800",
  "app/qna/[id]/page.tsx": "604_800",
  "app/imjang/page.tsx": "604_800",
  "app/imjang/[slug]/page.tsx": "604_800",
};

test("동네·노트·Q&A·프로필 축 ISR TTL", () => {
  for (const [file, ttl] of Object.entries(ROUTE_TTL)) {
    assert.ok(
      read(file).includes(`export const revalidate = ${ttl};`),
      `${file}: revalidate = ${ttl} 이어야 합니다`,
    );
  }
});

test("데이터 캐시 TTL — 라우트 TTL 을 끌어내리던 자리를 같이 올렸다(태그와 함께)", () => {
  /* Next 는 세그먼트 revalidate 와 데이터 캐시 revalidate 중 **작은 값**을 쓴다.
     빌드 산출물로 확인한 실측: app/town/news/page.tsx 는 21_600 인데
     .next/prerender-manifest.json 의 /town/news 는 3600(= 주간 다이제스트 캐시)이었다.
     그래서 데이터 캐시를 올리지 않으면 라우트 TTL 을 올려도 아무 일이 없다. */
  const digest = read("lib/newui/digest.ts");
  assert.match(digest, /\["newui-weekly-digest-v2"\], \{\s*revalidate: 86_400,\s*tags: \[WEEKLY_DIGEST_TAG\]/);

  const board = read("lib/newui/board-posts.ts");
  /* 이 캐시는 /town/news/[id](7일)와 /complex/[id](7일) 둘 다가 읽는다 — 값이 그보다 작으면
     그 두 라우트의 실제 TTL 이 이 값으로 눌린다. 그래서 같은 눈금(7일)으로 맞췄다. */
  assert.match(board, /\["related-town-posts-v1"\],\s*\{ revalidate: 604_800, tags: \["news", TOWN_POSTS_TAG\] \}/);

  const link = read("lib/newui/complex-link.ts");
  assert.match(link, /\["complex-href-v2"\],\s*\{ revalidate: 604_800, tags: \["market"\] \}/);

  const notes = read("app/notes/page.tsx");
  assert.match(notes, /\["notes-public-feed-v2"\],\s*\{ revalidate: 86_400, tags: \[PUBLIC_NOTES_LIST_TAG\] \}/);
  assert.match(notes, /\["notes-best-has-month-v1"\],\s*\{ revalidate: 86_400, tags: \[PUBLIC_NOTES_LIST_TAG\] \}/);
});

/* ── 3. 소스 규칙 — 쓰기 지점 비움 ────────────────────────────────────────── */

test("공개 임장노트 쓰기 3곳이 목록·임장 가이드·공개 프로필을 비운다", () => {
  for (const p of ["app/api/inspection/notes/route.ts", "app/api/inspection/notes/[id]/route.ts"]) {
    const src = read(p);
    assert.match(src, /invalidatePublicNoteRoutes\(/, p);
    assert.match(src, /scheduleProfileInvalidation\(/, p);
  }
  /* 삭제도 같은 규칙 — 지운 노트가 하루 동안 목록에 남으면 안 된다 */
  const byId = read("app/api/inspection/notes/[id]/route.ts");
  assert.ok(byId.includes("await deleteNote(id);"), "DELETE 경로가 있다");
  assert.equal((byId.match(/invalidatePublicNoteRoutes\(/g) ?? []).length >= 2, true, "PATCH·DELETE 둘 다");
});

test("팔로우·프로필 사진 변경이 공개 프로필을 비운다", () => {
  const follows = read("app/api/me/follows/route.ts");
  assert.equal((follows.match(/scheduleProfileInvalidation\(followedEmail\)/g) ?? []).length, 2, "팔로우·언팔로우 둘 다");
  assert.match(read("app/api/me/profile/route.ts"), /scheduleProfileInvalidation\(email\)/);
});

test("이웃 글·댓글이 글감 스레드와 동네 데이터 캐시를 비운다", () => {
  const create = read("app/api/community/posts/route.ts");
  assert.match(create, /invalidatePromptThreads\(tags\)/);
  assert.match(create, /invalidateTownDataCaches\(\)/);
  const mutate = read("app/api/community/posts/[id]/route.ts");
  assert.match(mutate, /invalidatePromptThreads\(/);
  assert.match(mutate, /invalidateTownDataCaches\(\)/);
  const comments = read("app/api/community/posts/[id]/comments/route.ts");
  assert.equal((comments.match(/invalidatePromptThreads\(/g) ?? []).length, 2, "댓글 작성·삭제 둘 다");
});

test("뉴스 적재 재검증이 주제 허브 20곳과 동네 데이터 캐시를 비운다", () => {
  for (const p of [
    "app/api/cron/news-revalidate/route.ts",
    "app/api/cron/weekly-market-post/route.ts",
    "app/api/cron/region-intro-posts/route.ts",
    "app/api/cron/price-record-watch/route.ts",
  ]) {
    assert.match(read(p), /invalidateNewsHubs\(\)/, p);
  }
  /* 허브는 20장뿐이라 라우트 단위(page)로 한 번에 비운다 */
  assert.match(read("lib/town/invalidate-town.ts"), /revalidatePath\("\/town\/news\/tag\/\[tag\]", "page"\)/);
});

test("실거래 적재가 임장 가이드(바뀐 지역만)를 비운다", () => {
  const cron = read("app/api/cron/molit-transactions-ingest/route.ts");
  assert.match(cron, /invalidateImjangForTxRegions\(/);
  /* 라우트 전체(page)로 비우면 하루 1회 전량 재렌더가 되어 지금의 하루 TTL 과 같아진다 */
  assert.ok(!/revalidatePath\("\/imjang\/\[slug\]", "page"\)/.test(cron));
});

test("전문가·모임·템플릿의 쓰기 지점이 그 화면을 비운다", () => {
  assert.match(read("app/api/experts/route.ts"), /invalidateExpertRoutes\(expert\.id\)/);
  assert.match(read("app/api/experts/[id]/route.ts"), /invalidateExpertRoutes\(id\)/);
  const consult = read("app/api/experts/[id]/consult/route.ts");
  assert.equal((consult.match(/invalidateExpertRoutes\(expertId\)/g) ?? []).length, 2, "답변·마감 둘 다");
  /* 기존 배선(수정·후기·관리자 승인)도 그대로 남아 있어야 한다 */
  assert.match(read("app/api/experts/[id]/reviews/route.ts"), /revalidatePath\(`\/town\/experts\/\$\{result\.review\.expertId\}`\)/);
  assert.match(read("app/api/admin/experts/route.ts"), /revalidatePath\("\/town\/experts"\)/);

  const join = read("app/api/groups/[id]/join/route.ts");
  assert.equal((join.match(/invalidateGroupRoutes\(\)/g) ?? []).length, 2, "신청·상태변경 둘 다");
  assert.match(read("app/api/groups/route.ts"), /revalidatePath\("\/town\/groups"\)/);
  /* "24시간 메시지 N개" 배지 — 모임 방 메시지일 때만 비운다 */
  assert.match(read("lib/chat/service.ts"), /room\.roomType === "group"[\s\S]{0,400}invalidateGroupRoutes\(\)/);

  assert.match(read("app/api/inspection/notes/route.ts"), /invalidateNoteTemplateRoutes\(tplId\)/);
  assert.match(read("app/api/notes/templates/route.ts"), /revalidatePath\("\/notes\/templates"\)/);
});

test("리포트 등록이 자료실(/town/library)을 비운다", () => {
  for (const p of ["app/api/reports/route.ts", "app/api/creator/reports/route.ts"]) {
    assert.match(read(p), /invalidatePathList\(\["\/town\/library"\]/, p);
  }
});

test("Q&A — 질문·답변 등록이 목록과 상세를 비운다(TTL 을 올린 근거)", () => {
  assert.match(read("app/api/qna/route.ts"), /revalidatePath\("\/qna"\)/);
  const answers = read("app/api/qna/[id]/answers/route.ts");
  assert.match(answers, /revalidatePath\(`\/qna\/\$\{id\}`\)/);
  assert.match(answers, /revalidatePath\("\/qna"\)/);
});

test("공용 파일(통합자 소유)을 늘리지 않고 동네 축 규칙은 lib/town 에만 둔다", () => {
  /* 브리프: lib/cache/invalidate.ts 와 lib/http/cache-policy.ts 는 통합자 소유라 손대지 않는다.
     여기 있는 새 태그·경로 규칙이 그쪽으로 새지 않았는지 본다(파일 충돌 방지). */
  const inv = read("lib/cache/invalidate.ts");
  assert.ok(!inv.includes('"town-posts"'), "동네 축 태그는 lib/town/cache-tags.ts 에만 선언한다");
  assert.ok(!inv.includes('"weekly-digest"'), "주간 다이제스트 태그도 마찬가지");
  assert.ok(!inv.includes('"/imjang"'), "imjang 경로는 lib/town 쪽 헬퍼가 만든다");
  /* 반대로, 우리 헬퍼는 그 파일의 공개 함수만 빌려 쓴다(중복 구현 금지) */
  assert.match(read("lib/town/invalidate-town.ts"), /from "@\/lib\/cache\/invalidate"/);
});
