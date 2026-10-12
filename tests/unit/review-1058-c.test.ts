import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { lastSevenDays, kstDateOf, prevDateString } from "@/lib/points/attendance-rules";
import {
  TALK_TOMBSTONE_MS,
  addTalkTombstone,
  dropBoardTalk,
  filterTombstoned,
  type TalkBoard,
  type TalkPost,
} from "@/lib/talk/rules";
import {
  REVIEW_MAX_OFFSET,
  REVIEW_PAGE_SIZE,
  nextReviewOffset,
  parseReviewOffset,
  reviewEditedAt,
} from "@/lib/complex-reviews/rules";

/* [1058 · C] 단지 화면(지연 래퍼·후기·토론)·노트 평가 칩·크리에이터 문구·게임 참여 닻·출석 7일 점 묶음.
 *  C1 use-near-viewport  C2 canonical id  C3 후기(로그인→계정 제한 · mine 프리필 · 50건 쪽 · 집계 throw · KST · 40px · 문의 신고)
 *  C4 토론(Enter · 판 실패 · 소식 실패 · 묘비 · 검색 실패)  C5 nz:note-rating  C6 크리에이터 사실 문구  C7 /api/quiz/today  C8 7일 점 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(scripts/check-ai-look.mjs 와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));

/* ---------- C1 지연 래퍼 ---------- */
test("C1 use-near-viewport — 래퍼마다 복제된 관찰자 코드를 한 훅으로 · 11개 *Lazy.tsx 어디에도 new IntersectionObserver 없음", () => {
  const dir = path.join(ROOT, "app/complex/[id]");
  const lazies = readdirSync(dir).filter((f) => /Lazy\.tsx$/.test(f));
  assert.equal(lazies.length, 11, "지연 래퍼 11개");
  for (const f of lazies) {
    const src = strip(read(`app/complex/[id]/${f}`));
    assert.doesNotMatch(src, /new IntersectionObserver/, `${f} 에 관찰자 보일러플레이트가 남아 있다`);
    /* 뷰포트 근접으로 받는 래퍼(후기·토론)만 훅을 쓴다 — 나머지 9개는 애초에 관찰자가 없었다(동작 그대로) */
    if (/near/.test(src)) assert.match(src, /useNearViewport\(ref, "\d+px 0px"\)/, `${f} 는 훅을 써야 한다`);
  }
  assert.match(strip(read("app/complex/[id]/ComplexReviewsLazy.tsx")), /useNearViewport\(ref, "200px 0px"\)/, "후기 200px 그대로");
  assert.match(strip(read("app/complex/[id]/ComplexTalkLazy.tsx")), /useNearViewport\(ref, "400px 0px"\)/, "토론 400px 그대로");
  const hook = strip(read("app/complex/[id]/use-near-viewport.ts"));
  assert.match(hook, /typeof IntersectionObserver === "undefined"\) \{\s*setNear\(true\)/, "관찰자 없는 환경은 바로 true");
  assert.match(hook, /io\.disconnect\(\)/);
  /* 후기 본체(다른 청크)도 같은 훅 */
  assert.match(strip(read("app/complex/ComplexReviews.tsx")), /useNearViewport\(rootRef, "200px 0px"\)/);
  assert.doesNotMatch(strip(read("app/complex/ComplexReviews.tsx")), /new IntersectionObserver/);
});

/* ---------- C2 정규 id ---------- */
test("C2 후기·토론·글쓰기 키 = canonical_id — v.id === complexId 비교 없음 · mock·해독 불가는 숨김", () => {
  const src = strip(read("app/complex/[id]/page.tsx"));
  assert.doesNotMatch(src, /v\.id === complexId/, "kapt 매칭 단지에서 늘 거짓이던 비교");
  assert.match(src, /const socialId = rowForFacts\?\.canonical_id \?\? complexId;/);
  assert.match(src, /const socialOk = complexId !== "mock-1" && decodeComplexId\(socialId\) !== null;/);
  assert.match(src, /const talkScope = socialOk \? talkScopeForComplex\(socialId, regionId\) : null;/);
  assert.match(src, /\{socialOk && \(\s*<section[^>]*>\s*<ComplexReviewsLazy complexId=\{socialId\}/);
  assert.match(src, /notesWriteHref: `\/town\/write\?complex=\$\{encodeURIComponent\(row\.canonical_id\)\}/, "글쓰기 링크도 정규 id");
  assert.match(src, /getComplexPosts\(\(r \?\? row\)\.canonical_id, 12, budget\.signal\)/, "단지 이야기 조회 키도 정규 id");
  assert.doesNotMatch(src, /encodeURIComponent\(row\.id\)&complexName/);
});

/* ---------- C3 후기 ---------- */
test("C3 후기 규칙 — offset 해석 · 다음 쪽 · 수정 판정", () => {
  assert.equal(REVIEW_PAGE_SIZE, 50);
  assert.equal(parseReviewOffset(null), 0);
  assert.equal(parseReviewOffset(""), 0);
  assert.equal(parseReviewOffset("abc"), 0);
  assert.equal(parseReviewOffset("-5"), 0);
  assert.equal(parseReviewOffset("1.5"), 0);
  assert.equal(parseReviewOffset("50"), 50);
  assert.equal(parseReviewOffset("99999999"), 0, "자릿수 초과는 0");
  assert.equal(parseReviewOffset("999999"), REVIEW_MAX_OFFSET, "상한");
  assert.equal(nextReviewOffset(0, 50), 50);
  assert.equal(nextReviewOffset(50, 50), 100);
  assert.equal(nextReviewOffset(0, 49), null, "덜 찼으면 더 없음");
  assert.equal(nextReviewOffset(0, 0), null);
  assert.equal(nextReviewOffset(REVIEW_MAX_OFFSET, 50), null);
  const c = "2026-10-01T00:00:00.000Z";
  assert.equal(reviewEditedAt(c, null), null);
  assert.equal(reviewEditedAt(c, "2026-10-01T00:00:00.412Z"), null, "처음 저장의 ms 차는 수정이 아니다");
  assert.equal(reviewEditedAt(c, "2026-10-01T00:00:59.000Z"), null, "1분 안도 아니다");
  assert.equal(reviewEditedAt(c, "2026-10-03T09:00:00.000Z"), "2026-10-03T09:00:00.000Z");
  assert.equal(reviewEditedAt("bad", "2026-10-03T09:00:00.000Z"), null);
});

test("C3 라우트 — 로그인 확인이 제한보다 먼저 · 제한 키는 계정(이메일) · IP 제한 없음 · GET 이 mine·nextOffset·전체 요약", () => {
  const src = strip(read("app/api/complex-reviews/route.ts"));
  const post = src.slice(src.indexOf("export async function POST"));
  const loginAt = post.indexOf("safeAuth()");
  const limitAt = post.indexOf("rateLimit(");
  assert.ok(loginAt >= 0 && limitAt > loginAt, "로그인 판정 뒤에 제한");
  assert.match(post, /rateLimit\(`complex-review:user:\$\{session\.user\.email\.trim\(\)\.toLowerCase\(\)\}`/);
  assert.doesNotMatch(src, /getClientIp/, "IP 제한이 비로그인 이웃까지 막았다");
  assert.match(post, /dbUnavailable\("complex-reviews:upsert", e, "후기 저장 실패 · 잠시 후 다시"\)/);
  const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.match(get, /parseReviewOffset\(req\.nextUrl\.searchParams\.get\("offset"\)\)/);
  assert.match(get, /listReviews\(complexId, \{ limit: REVIEW_PAGE_SIZE, offset \}\)/);
  assert.match(get, /listReviewScores\(complexId\)/, "요약은 전체 후기로");
  assert.match(get, /getMyReview\(complexId, email\)/);
  assert.match(get, /nextOffset: nextReviewOffset\(offset, rows\.length, REVIEW_PAGE_SIZE\)/);
  assert.match(get, /updatedAt: mine\.updatedAt/);
});

test("C3 store — listReviews 는 50건 range + id 끝 정렬 · countHelpful 은 오류에 throw(0 을 쓰지 않는다) · 요약은 readPaged", () => {
  const src = strip(read("lib/complex-reviews/store-db.ts"));
  assert.match(src, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(offset, offset \+ limit - 1\)/);
  const ch = src.slice(src.indexOf("async function countHelpful"), src.indexOf("export async function markReviewHelpful"));
  assert.match(ch, /if \(error\) throw new Error/);
  assert.match(ch, /if \(typeof count !== "number"\) throw new Error/);
  assert.doesNotMatch(ch, /count \?\? 0/, "세지 못한 것을 0 으로");
  assert.match(src, /readPaged<Record<string, unknown>>/);
  assert.match(src, /export async function getMyReview\(complexId: string, authorEmail: string\)/);
  assert.match(src, /updatedAt: r\.updated_at \? String\(r\.updated_at\) : null/);
  const helpful = strip(read("app/api/complex-reviews/helpful/route.ts"));
  assert.match(helpful, /error: "도움 표시 실패 · 잠시 후 다시"/);
});

test("C3 ComplexReviews — mine 프리필·'후기 수정' · 30P 고정 문구 없음 · 더 보기 · KST 날짜 · 수정일 · 40px · 문의 신고 · 도움 실패 문구", () => {
  const src = strip(read("app/complex/ComplexReviews.tsx"));
  assert.doesNotMatch(src, /30P가 적립돼요/);
  assert.match(src, /benefit: "후기 저장 시 30P · 하루 5회"/);
  assert.match(src, /const openLabel = mine \? "후기 수정" : "후기 쓰기";/);
  assert.match(src, /mine \? "후기 수정" : "후기 등록"/);
  assert.match(src, /noiseScore: mine\.noiseScore,[\s\S]*setComment\(mine\.comment \?\? ""\);[\s\S]*setIsResident\(mine\.isResident\);[\s\S]*setResidentPeriod\(mine\.residentPeriod \?\? ""\)/, "별점·한줄·실거주·시기 프리필");
  assert.match(src, /&offset=\$\{offset\}/);
  assert.match(src, /더 보기/);
  assert.match(src, /kstParts\(iso\)/, "브라우저 시간대 → KST");
  assert.doesNotMatch(src, /new Date\(iso\)/);
  assert.match(src, /` · 수정 \$\{formatDate\(edited\)\}`/);
  assert.match(src, /h-10 w-10 items-center justify-center text-\[19px\][^"]*md:h-6 md:w-6/, "별 누름 면 40px");
  assert.match(src, /min-h-\[40px\] items-center gap-1 border border-line px-2\.5 t-caption md:min-h-6/, "도움돼요 칩 40px");
  assert.match(src, /도움 표시 실패 · 잠시 후 다시/);
  assert.match(src, /<ReportButton postId=\{`complex-review:\$\{r\.id\}`\} targetType="review"/);
  assert.equal((src.match(/\bbtn-primary\b/g) ?? []).length, 1, "채움 파랑 1개");
  assert.ok(!/[가-힣]!(?![=])/.test(src), "느낌표 없음");
  const rb = strip(read("app/components/ReportButton.tsx"));
  assert.match(rb, /targetType\?: ReportTargetType/);
  assert.match(rb, /href=\{`\/support\?topic=report&ref=\$\{encodeURIComponent\(ref\)\}`\}/);
  assert.match(rb, /신고 · 문의로 접수/);
  const form = strip(read("app/support/SupportContactForm.tsx"));
  assert.match(form, /sp\.get\("topic"\) === "report" && ref/);
  assert.match(form, /setCategory\("악성 콘텐츠 신고"\)/);
});

/* ---------- C4 토론 ---------- */
const post = (id: string, createdAt: string, mine = false): TalkPost => ({
  kind: "talk",
  id,
  author: "a",
  body: "b",
  complexId: null,
  complexName: null,
  createdAt,
  mine,
});

test("C4 묘비 — 60초 동안 걸러 내고 지난 묘비는 치운다 · 순위 글 수 −1 은 최근 7일 글만", () => {
  const now = Date.parse("2026-10-12T03:00:00.000Z");
  let tombs = addTalkTombstone(new Map(), "x", now);
  const posts = [post("x", "2026-10-12T02:59:00.000Z"), post("y", "2026-10-12T02:58:00.000Z")];
  assert.deepEqual(filterTombstoned(posts, tombs, now + 1_000).map((p) => p.id), ["y"], "지운 글은 새로고침 응답에서도 빠진다");
  assert.deepEqual(filterTombstoned(posts, tombs, now + TALK_TOMBSTONE_MS).map((p) => p.id), ["x", "y"], "60초 뒤엔 서버 목록 그대로");
  assert.deepEqual(filterTombstoned(posts, new Map(), now).map((p) => p.id), ["x", "y"]);
  tombs = addTalkTombstone(tombs, "z", now + TALK_TOMBSTONE_MS + 1);
  assert.equal(tombs.has("x"), false, "지난 묘비는 넣을 때 치운다");
  assert.equal(tombs.has("z"), true);

  const board: TalkBoard = {
    regions: [
      { id: "r1", name: "송파구", sido: "서울", txName: "서울 송파구", pct: null, indexYm: null, trades: null, tradesYm: null, talks: 3, lastTalkAt: null },
      { id: "r2", name: "강남구", sido: "서울", txName: "서울 강남구", pct: null, indexYm: null, trades: null, tradesYm: null, talks: 0, lastTalkAt: null },
    ],
    indexYm: null,
    tradesYm: null,
    totalTalks: 3,
  };
  const dropped = dropBoardTalk(board, "r1", "2026-10-11T00:00:00.000Z", now);
  assert.equal(dropped.regions[0]!.talks, 2);
  assert.equal(dropped.totalTalks, 2);
  assert.equal(dropBoardTalk(board, "r1", "2026-09-01T00:00:00.000Z", now), board, "7일 밖 글은 세지 않던 수라 그대로");
  assert.equal(dropBoardTalk(board, "r2", "2026-10-11T00:00:00.000Z", now), board, "0 아래로 내려가지 않는다");
  assert.equal(dropBoardTalk(board, "nope", "2026-10-11T00:00:00.000Z", now), board);
});

test("C4 TalkPanel — Enter 가드(첫 결과 붙이기) · 판 실패 문구+다시 · 소식 실패 줄 · 묘비 적용 · 검색 실패 문구", () => {
  const src = strip(read("app/components/talk/TalkPanel.tsx"));
  assert.match(src, /if \(e\.key === "Enter"\) \{\s*e\.preventDefault\(\);\s*if \(e\.nativeEvent\.isComposing\) return;\s*const first = complexHits\?\.\[0\];/);
  assert.match(src, /토론판 불러오기 실패 · 잠시 후 다시/);
  assert.match(src, /!scoped && boardFailed && !board \?/);
  assert.match(src, /posts\.length === 0 && facts\.length === 0 && feed\.factsFailed \?/);
  assert.match(src, /사람 글 없음 · 소식 불러오기 실패 · 잠시 후 다시/);
  assert.match(src, /filterTombstoned\(same \? mergeIncomingPosts\(cur\.posts, j\.posts\) : j\.posts, tombsRef\.current, Date\.now\(\)\)/);
  assert.match(src, /tombsRef\.current = addTalkTombstone\(tombsRef\.current, id, now\);/);
  assert.match(src, /dropBoardTalk\(b, cur\.regionId, gone\.createdAt, now\)/, "지우면 왼쪽 글 수 −1");
  assert.match(src, /if \(j\.result === "hidden"\) bury\(id\);/);
  assert.match(src, /단지 검색 실패 · 잠시 후 다시/);
  assert.doesNotMatch(src, /setComplexHits\(\[\]\)/, "실패를 빈 결과로 위장");
  assert.ok(!/[가-힣]!(?![=])/.test(src), "느낌표 없음");
});

/* ---------- C5 노트 평가 칩 ---------- */
test("C5 NoteRating 이 nz:note-rating 을 쏘고 머리 칩(NoteRatingChip)이 받는다 · /notes/[id] 추가분은 작다", () => {
  const rating = strip(read("app/notes/[id]/NoteRating.tsx"));
  assert.match(rating, /new CustomEvent\("nz:note-rating", \{ detail: \{ noteId, avg: data\.average \?\? null, count: data\.count \} \}\)/);
  const chip = read("app/notes/[id]/NoteRatingChip.tsx");
  assert.match(strip(chip), /window\.addEventListener\(NOTE_RATING_EVENT, on\)/);
  assert.match(strip(chip), /d\?\.noteId === noteId && typeof d\.count === "number"/);
  assert.match(strip(chip), /if \(!fact \|\| fact\.count <= 0 \|\| fact\.average == null\) return null;/, "0명이면 칩 없음");
  const body = chip.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  assert.ok(Buffer.byteLength(body, "utf8") < 1024, `주석·공백을 뺀 본문 1KB 미만(${Buffer.byteLength(body, "utf8")}B)`);
  const page = strip(read("app/notes/[id]/page.tsx"));
  assert.match(page, /<NoteRatingChip noteId=\{realNote\.id\} initial=\{\{ count: ratingR\.count, average: ratingR\.average \}\} \/>/);
  assert.doesNotMatch(page, /ratingFact\(ratingR\)/);
});

/* ---------- C6 크리에이터 ---------- */
test("C6 크리에이터 — 이모지 없음 · 공개 노트 판매 거짓 주장 없음 · 저장 집계 없음 · 정산 없음 · 자료실 보관", () => {
  const files = ["app/my/creator/page.tsx", "app/my/creator/creator-client.tsx", "app/creators/page.tsx"];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/[🎉✍️]/u.test(src), `${f} 이모지`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(src), `${f} 이모지`);
    assert.ok(!/[가-힣]!(?![=])/.test(strip(src)), `${f} 느낌표`);
    assert.doesNotMatch(strip(src), /공개 노트를 골라 유료 리포트로/, `${f} 거짓 주장`);
    assert.doesNotMatch(strip(src), /포인트가 적립돼요/, `${f} 거짓 주장`);
  }
  const page = strip(read("app/my/creator/page.tsx"));
  assert.doesNotMatch(page, /countNoteSaves|totalSaves|from\("bookmarks"\)/, "노트는 bookmarks 에 저장될 수 없다(CHECK)");
  assert.doesNotMatch(page, /탑 임장러/, "없는 탭");
  assert.match(page, /const isCreator = verified \|\| publicNotesLen > 0;/, "게이트는 API(lib/creator/gate.ts)와 같은 규칙 그대로");
  assert.match(page, /판매 대상: 비공개 노트/);
  const client = strip(read("app/my/creator/creator-client.tsx"));
  /* [1059] 노트 저장이 생겨 저장 수를 센다 — "집계 없음" 문구는 사라졌다 */
  assert.match(client, /\{ label: "저장", value: stats\.saveCount/);
  assert.match(client, /\{ label: "크리에이터 정산", value: "없음" \}/);
  assert.match(client, /구매 알림만 · 포인트 적립·정산·현금 전환 없음/);
  assert.match(client, /\/town\/library\/\$\{encodeURIComponent\(r\.id\)\}/, "구매는 리포트 상세 직접 링크");
  assert.doesNotMatch(client, /feePct|netPoints/, "적립되지 않는 수를 적립처럼");
  assert.match(client, /disabled=\{busy \|\| noteOptions\.length === 0\}/);
  const creators = strip(read("app/creators/page.tsx"));
  assert.match(creators, /현재 크리에이터 정산 없음/);
  assert.match(creators, /구매는 리포트 상세 직접 링크/);
  assert.match(creators, /비공개 노트만/);
  const buy = read("app/api/creator/reports/[id]/buy/route.ts");
  assert.ok(!/🎉/u.test(buy));
  assert.match(strip(buy), /title: "리포트 판매됨"/);
});

/* ---------- C7 게임 참여 닻 ---------- */
test("C7 GET /api/quiz/today — quiz_daily · ref_id=KST 날짜 · exact count · 공개 5분 캐시 · 실패 503 · 게임 결과 카드", () => {
  const route = strip(read("app/api/quiz/today/route.ts"));
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("reason", "quiz_daily"\)\s*\.eq\("ref_id", date\)/);
  assert.match(route, /const date = kstDateString\(\);/);
  assert.match(route, /"Cache-Control": "public, max-age=300, s-maxage=300"/);
  assert.match(route, /if \(error\) return dbUnavailable\("quiz-today", error\);/, "못 세면 0 이 아니라 503");
  assert.match(route, /\{ date, finishers: count \}/);
  const game = strip(read("app/quiz/QuizGame.tsx"));
  assert.match(game, /fetch\("\/api\/quiz\/today"\)/);
  assert.match(game, /if \(phase !== "done"\) return;/, "끝난 뒤에만");
  assert.match(game, /오늘 적립 \{finishers\.toLocaleString\("ko-KR"\)\}명/);
  assert.match(game, /return n !== null && n > 0 \? n : null;/, "0명·실패는 줄 없음");
  assert.ok(!/[가-힣]!(?![=])/.test(game), "느낌표 없음");
});

/* ---------- C8 출석 7일 점 ---------- */
test("C8 lastSevenDays — 오늘로 끝나는 7일 · 출석한 날만 채움 · 오늘 표시", () => {
  const days = lastSevenDays([{ date: "2026-10-12" }, { date: "2026-10-10" }, { date: "2026-09-01" }], "2026-10-12");
  assert.equal(days.length, 7);
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"],
  );
  assert.deepEqual(days.map((d) => d.attended), [false, false, false, false, true, false, true]);
  assert.deepEqual(days.map((d) => d.today), [false, false, false, false, false, false, true]);
  assert.equal(lastSevenDays([], "2026-03-01")[0]!.date, "2026-02-23", "월 경계");
  assert.equal(lastSevenDays([], "2026-01-01")[0]!.date, "2025-12-26", "해 경계");
  assert.equal(prevDateString("2026-10-12"), "2026-10-11");
  /* KST 날짜 — UTC 2026-10-11 15:30 은 KST 10-12 */
  assert.equal(kstDateOf(Date.parse("2026-10-11T15:30:00.000Z")), "2026-10-12");
  assert.equal(kstDateOf(Date.parse("2026-10-11T14:59:59.000Z")), "2026-10-11");
});

test("C8 AttendanceButton — GET 의 attendance 로 점 7개 · '최근 7일' · sr-only 요약 · 출석 직후 오늘 점 채움", () => {
  const src = strip(read("app/my/points/AttendanceButton.tsx"));
  assert.match(src, /lastSevenDays\(rows, kstDateOf\(Date\.now\(\)\)\)/);
  assert.match(src, /최근 7일<\/span>/);
  assert.match(src, /최근 7일 출석 \{attendedCount\}일/);
  assert.match(src, /\{days\.map\(\(d\) => \(/);
  assert.match(src, /d\.attended \? "bg-ai-accent" : "border border-ai-muted"/, "채움·빈 점");
  assert.match(src, /d\.today \? "h-3 w-3" : "h-2 w-2"/, "오늘 표시");
  assert.match(src, /days: s\.days \? s\.days\.map\(\(d\) => \(d\.today \? \{ \.\.\.d, attended: true \} : d\)\) : s\.days/);
  assert.ok(!/[가-힣]!(?![=])/.test(src), "느낌표 없음");
});
