import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { filterNotesByQuery, matchesNoteQuery, normalizeQuery } from "../../lib/notes/feed-search.ts";
import { groupNoteRounds } from "../../lib/notes/round-groups.ts";
import { orderRelatedByApt } from "../../lib/notes/related-order.ts";
import { finishSummaryRows, memoFirstLine, scoresLine } from "../../lib/notes/finish-summary.ts";
import { topBreakdownAxes } from "../../lib/notes/best-axes.ts";

/* [1023 · 임장노트] docs/review-1022.md 1장 적용 — 순수 규칙 5종 + 소스 잠금.
 * 1) 피드 검색칸: 제목·지역·단지명 부분 일치, 공백·대소문자 무시, 초성 없음.
 * 2) 내 노트 회차 묶기: 같은 aptName 2건 이상만 묶고 자리는 첫 카드 자리, 안은 방문일 내림차순.
 * 3) 상세 관련 노트: 같은 단지 앞줄, 안정 분할.
 * 4) 저장 전 요약: 없는 값은 "—", 메모는 첫 줄만.
 * 5) best 카드 축 3개: 배점 대비 비율 높은 순, 같으면 표 순서. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");

/* ───────────── 1) 검색 ───────────── */

test("[1023] normalizeQuery — 공백 전부 제거 · 소문자 · 빈 값은 빈 문자열", () => {
  assert.equal(normalizeQuery("  래미안 퍼스티지 "), "래미안퍼스티지");
  assert.equal(normalizeQuery("Hello World"), "helloworld");
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery(undefined), "");
});

test("[1023] matchesNoteQuery — 제목·지역·단지명 중 하나라도 부분 일치, 빈 검색어는 전부 통과, 초성은 안 된다", () => {
  const n = { title: "래미안퍼스티지 3회차", region: "서울 서초구 반포동", aptName: "래미안퍼스티지" };
  assert.ok(matchesNoteQuery(n, ""));
  assert.ok(matchesNoteQuery(n, "   "));
  assert.ok(matchesNoteQuery(n, "퍼스티지"));
  assert.ok(matchesNoteQuery(n, "반포 동"), "공백 무시");
  assert.ok(matchesNoteQuery(n, "서초구"));
  assert.ok(!matchesNoteQuery(n, "ㄹㅁㅇ"), "초성 검색 없음");
  assert.ok(!matchesNoteQuery(n, "송파"));
  assert.ok(matchesNoteQuery({ title: "Trimage", region: undefined, aptName: null }, "TRI"), "대소문자 무시");
});

test("[1023] filterNotesByQuery — 순서 유지 · 빈 검색어는 복사본", () => {
  const notes = [
    { id: "a", title: "A단지", region: "서울 송파구 가락동" },
    { id: "b", title: "B단지", region: "경기 성남시 분당구" },
    { id: "c", title: "C", region: "서울 송파구 잠실동", aptName: "잠실엘스" },
  ];
  assert.deepEqual(filterNotesByQuery(notes, "송파").map((n) => n.id), ["a", "c"]);
  assert.deepEqual(filterNotesByQuery(notes, "엘스").map((n) => n.id), ["c"]);
  assert.deepEqual(filterNotesByQuery(notes, "없는말"), []);
  const copy = filterNotesByQuery(notes, "");
  assert.deepEqual(copy, notes);
  assert.notEqual(copy, notes);
});

/* ───────────── 2) 회차 묶기 ───────────── */

test("[1023] groupNoteRounds — 같은 aptName 2건 이상만 묶음, 자리는 첫 카드 자리, 안은 방문일 내림차순", () => {
  const notes = [
    { id: "1", aptName: "잠실엘스", visitDate: "2026-03-01" },
    { id: "2", aptName: "헬리오시티", visitDate: "2026-04-01" },
    { id: "3", aptName: "잠실엘스", visitDate: "2026-05-01" },
    { id: "4", aptName: "", createdAt: "2026-06-01T00:00:00Z" },
    { id: "5", aptName: "잠실엘스", visitDate: "2026-04-15" },
  ];
  const g = groupNoteRounds(notes);
  assert.equal(g.length, 3);
  assert.equal(g[0].kind, "group");
  if (g[0].kind !== "group") return;
  assert.equal(g[0].aptName, "잠실엘스");
  assert.deepEqual(g[0].notes.map((n) => n.id), ["3", "5", "1"]);
  assert.equal(g[0].latestVisit, "2026-05-01");
  assert.equal(g[1].kind, "single");
  assert.equal(g[2].kind, "single");
  /* 단지명 없는 노트는 절대 묶이지 않는다(제목이 같아도) */
  const none = groupNoteRounds([{ id: "x" }, { id: "y" }]);
  assert.ok(none.every((x) => x.kind === "single"));
});

test("[1023] groupNoteRounds — 방문일이 없으면 createdAt 날짜부, 둘 다 없으면 입력 순서", () => {
  const g = groupNoteRounds([
    { id: "a", aptName: "X" },
    { id: "b", aptName: "X", createdAt: "2026-02-02T09:00:00Z" },
    { id: "c", aptName: "X" },
  ]);
  assert.equal(g.length, 1);
  if (g[0].kind !== "group") return assert.fail("group");
  assert.deepEqual(g[0].notes.map((n) => n.id), ["b", "a", "c"]);
  assert.equal(g[0].latestVisit, "2026-02-02");
});

/* ───────────── 3) 관련 노트 정렬 ───────────── */

test("[1023] orderRelatedByApt — 같은 단지 앞줄(안정), 나머지 뒤, 단지명 없으면 전부 region", () => {
  const pool = [
    { id: "1", aptName: "B" },
    { id: "2", aptName: "A" },
    { id: "3", aptName: null },
    { id: "4", aptName: " a " },
  ];
  const o = orderRelatedByApt(pool, "A");
  assert.deepEqual(o.map((x) => `${x.note.id}:${x.tier}`), ["2:apt", "4:apt", "1:region", "3:region"]);
  assert.ok(orderRelatedByApt(pool, "").every((x) => x.tier === "region"));
  assert.deepEqual(orderRelatedByApt(pool, null).map((x) => x.note.id), ["1", "2", "3", "4"]);
});

/* ───────────── 4) 저장 전 요약 ───────────── */

test("[1023] finishSummaryRows — 7줄 고정, 없는 값은 '—', 메모는 첫 줄만, 0점 축은 미입력", () => {
  const rows = finishSummaryRows({
    aptName: "잠실엘스",
    region: "서울 송파구 잠실동",
    visitDate: "2026-09-20",
    scores: { location: 4, school: 0, transport: 5, facility: 3, future: 0 },
    checklistDone: 3,
    checklistTotal: 9,
    photoCount: 2,
    memo: "남향 채광 좋음\n소음은 약간",
    decisionLabel: "보류",
  });
  assert.deepEqual(rows.map((r) => r.label), ["단지", "방문일", "점수", "체크", "사진", "판단", "메모"]);
  assert.equal(rows[0].value, "서울 송파구 잠실동 · 잠실엘스");
  assert.equal(rows[2].value, "입지 4 · 학군 — · 교통 5 · 시설 3 · 미래가치 —");
  assert.equal(rows[3].value, "3/9");
  assert.equal(rows[4].value, "2장");
  assert.equal(rows[5].value, "보류");
  assert.equal(rows[6].value, "남향 채광 좋음");

  const empty = finishSummaryRows({
    aptName: "",
    region: "",
    visitDate: "",
    scores: { location: 0, school: 0, transport: 0, facility: 0, future: 0 },
    checklistDone: 0,
    checklistTotal: 0,
    photoCount: 0,
    memo: "   ",
    decisionLabel: null,
  });
  assert.ok(empty.every((r) => r.value === "—"), "전부 '—'");
  assert.equal(scoresLine({ location: 0, school: 0, transport: 0, facility: 0, future: 0 }), "—");
  assert.equal(memoFirstLine("a".repeat(70)).length, 61);
});

/* ───────────── 5) best 축 3개 ───────────── */

test("[1023] topBreakdownAxes — 배점 대비 비율 높은 순 3개, 같으면 표 순서, 폭은 0~100", () => {
  const breakdown = [
    { key: "text", label: "글", points: 15, max: 30 },
    { key: "photo", label: "사진", points: 20, max: 20 },
    { key: "evidence", label: "근거", points: 0, max: 25 },
    { key: "checklist", label: "체크", points: 15, max: 15 },
    { key: "coverage", label: "항목", points: 5, max: 10 },
  ];
  const top = topBreakdownAxes(breakdown);
  assert.deepEqual(top.map((b) => b.key), ["photo", "checklist", "text"]);
  assert.deepEqual(top.map((b) => b.pct), [100, 100, 50]);
  assert.equal(topBreakdownAxes(breakdown, 0).length, 0);
  assert.equal(topBreakdownAxes([{ key: "z", label: "z", points: 3, max: 0 }])[0].pct, 0);
});

/* ───────────── 소스 잠금 ───────────── */

test("[1023] 피드 — 검색칸(40px · 지우기 ×) · 0건 문구 · 회차 묶음 · 다시 시도 라벨 · 격자 타일 배지 하나", () => {
  const src = code("app/notes/notes-feed-client.tsx");
  assert.ok(src.includes('aria-label="노트 검색"') && src.includes('type="search"'), "검색 입력");
  assert.ok(src.includes('aria-label="검색어 지우기"'), "지우기 ×");
  assert.ok(src.includes("filterNotesByQuery(regionFiltered, query)"), "지역 칩과 AND");
  assert.ok(src.includes('title="검색어에 맞는 노트가 없어요"'), "0건 문구");
  assert.ok(src.includes("groupNoteRounds(visible)") && src.includes("function RoundGroupCard"), "회차 묶기");
  assert.ok(src.includes("/notes/compare?noteId=${encodeURIComponent(latest.id)}"), "묶음 머리 → 회차 비교(있는 화면)");
  assert.ok(src.includes('moreError ? "다시 시도" : "더 보기"'), "더 보기 실패 = 다시 시도");
  assert.ok(src.includes("onClick={() => void loadMine()}"), "내 노트 실패 카드 재시도");
  assert.ok(src.includes('<NoteBadges n={n} onDark only="decision" />'), "격자 타일은 판단 배지 하나");
  assert.ok(!/text-\[\d+px\]/.test(src) && !/font-extrabold|font-black/.test(src));
});

test("[1023] 상세 — RelatedNotes 같은 단지 앞줄 · 댓글 재시도 · 마지막 칩 네이비 채움 없음", () => {
  const rel = code("app/notes/[id]/RelatedNotes.tsx");
  assert.ok(rel.includes("orderRelatedByApt(pool, currentApt)"));
  assert.ok(rel.includes('"같은 단지"') && rel.includes('"같은 지역"'));
  const page = code("app/notes/[id]/page.tsx");
  assert.ok(page.includes("aptName={realNote.aptName}"), "aptName 전달");
  assert.ok(page.includes("<CommentsRetry />"), "댓글 실패 자리 재시도");
  assert.ok(!page.includes("잠시 후 새로고침해 주세요"), "새로고침 권유문 없음");
  assert.ok(!page.includes("rounded-full bg-brand-navy px-2.5"), "칩 줄 네이비 채움 없음");
  const retry = code("app/notes/[id]/comments-retry.tsx");
  assert.ok(retry.includes("router.refresh()") && retry.includes("btn-md"));
});

test("[1023] 작성 — 3단계 저장 전 요약(summary prop · 폼 상태 그대로) · 오프라인 배너 흰 카드", () => {
  const step = code("app/notes/new/NoteFinishStep.tsx");
  assert.ok(step.includes('aria-label="저장 전 요약"') && step.includes('data-tone="plain"'));
  const form = code("app/notes/new/NoteForm.tsx");
  assert.ok(form.includes("scores: composeScoresFromChecks(checks)") && form.includes("decision: decisionChoice"));
  assert.ok(!form.includes("bg-warning-soft px-4 py-3"), "오프라인 배너 경고색 면 없음");
  assert.ok(form.includes("useUnsavedGuard(!saving && draftPending)"), "뒤로가기 보호는 그대로");
});

test("[1023] best 월 카드 — 축 3개 막대 · globals.css append 블록", () => {
  const best = code("app/notes/best/[ym]/page.tsx");
  assert.ok(best.includes("topBreakdownAxes(p.breakdown, 3)"));
  assert.ok(best.includes("notes-best-axes__bar"));
  const css = read("app/globals.css");
  const i = css.indexOf("[1023 · 임장노트]");
  assert.ok(i > 0, "블록이 있다");
  const block = css.slice(i);
  assert.ok(block.includes(".notes-best-axes__track") && block.includes("var(--primary)"));
  assert.ok(!/gradient/.test(block), "그라데이션 없음");
});
