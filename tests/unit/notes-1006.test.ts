import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LIST_AI_STATE_LABEL,
  listAiState,
  noteAiIntent,
} from "../../lib/notes/ai-status.ts";
import {
  DEFAULT_MINE_FILTERS,
  MINE_REGION_CHIPS_MAX,
  applyMineFilters,
  hasActiveMineFilter,
  mineFilterOptions,
  periodFloorMs,
} from "../../lib/notes/mine-filters.ts";
import { regionGroupOf } from "../../lib/notes/region-match.ts";
import { readWriterPrefs } from "../../lib/notes/writer-prefs.ts";
import { areaBandLabels } from "../../lib/notes/area-band-label.ts";
import { buildRevisitPrefill, visitAgoLabel } from "../../lib/inspection/revisit-prefill.ts";
import { buildFieldBrief } from "../../lib/inspection/field-brief.ts";
import { buildRevisitDelta } from "../../lib/inspection/revisit.ts";
import type { FeedNote } from "../../lib/notes/feed-note.ts";

/* [1006 · D] 임장노트 추가 개선 — 목록 필터·AI 배지·작성기 설정 기본값·재방문 라벨·면적 단위 */

/* ── AI 정리 상태(목록) ─────────────────────────────────────────────── */

test("listAiState — 없음·규칙·정리됨·수정 뒤 정리 전", () => {
  assert.equal(listAiState({ analysis: null, storedHash: null, currentHash: "h1" }), "none");
  assert.equal(listAiState({ analysis: {}, storedHash: null, currentHash: "h1" }), "none");
  assert.equal(
    listAiState({ analysis: { engine: "rule-based-v1 (quota)", summary: "x" }, storedHash: "h1", currentHash: "h1" }),
    "rule",
  );
  assert.equal(listAiState({ analysis: { engine: "gpt", summary: "x" }, storedHash: "h1", currentHash: "h1" }), "ready");
  /* 수정 뒤 해시가 달라졌으면 옛 정리 — LLM 이든 규칙이든 stale */
  assert.equal(listAiState({ analysis: { engine: "gpt", summary: "x" }, storedHash: "h0", currentHash: "h1" }), "stale");
  /* 해시가 저장돼 있지 않은 옛 노트는 비교할 수 없다 — stale 로 몰지 않는다 */
  assert.equal(listAiState({ analysis: { engine: "gpt", summary: "x" }, storedHash: null, currentHash: "h1" }), "ready");
  for (const k of ["ready", "rule", "stale", "none"] as const) assert.ok(LIST_AI_STATE_LABEL[k].length > 0);
});

test("noteAiIntent — visitPurpose 우선, 없으면 intent, 둘 다 없거나 모르면 실거주", () => {
  assert.equal(noteAiIntent({ visitPurpose: "투자" }), "투자");
  assert.equal(noteAiIntent({ intent: "전월세" }), "전월세");
  assert.equal(noteAiIntent({ visitPurpose: "갈아타기" }), "실거주");
  assert.equal(noteAiIntent(null), "실거주");
  assert.equal(noteAiIntent(undefined), "실거주");
});

/* ── 내 노트 필터 ───────────────────────────────────────────────────── */

function feed(over: Partial<FeedNote> & { id: string }): FeedNote {
  return {
    author: "나",
    meta: "",
    score: 0,
    scoreTone: "muted",
    title: over.id,
    excerpt: "",
    tags: [],
    footer: [],
    interested: false,
    ...over,
  };
}

const NOW = Date.UTC(2026, 8, 20, 3, 0, 0); // 2026-09-20 12:00 KST 즈음(로컬 무관: 달력 비교)
const NOTES: FeedNote[] = [
  feed({ id: "a", score: 80, visitDate: "2026-09-18", regionGroup: "안양시 동안구", decision: { choice: "buy", label: "살까" } }),
  feed({ id: "b", score: 40, visitDate: "2026-07-01", regionGroup: "서울 송파구", decision: { choice: "hold", label: "보류" } }),
  feed({ id: "c", score: 0, visitDate: "2025-06-01", regionGroup: "안양시 동안구" }),
  feed({ id: "d", score: 60, visitDate: "2026-03-15", regionGroup: "서울 송파구", decision: { choice: "pass", label: "패스" } }),
];

test("mineFilterOptions — 실제로 있는 판단·지역만, 판단은 고정 순서 · 지역은 건수순", () => {
  const o = mineFilterOptions(NOTES);
  assert.deepEqual(
    o.decisions.map((d) => [d.value, d.count]),
    [
      ["buy", 1],
      ["hold", 1],
      ["pass", 1],
      ["none", 1],
    ],
  );
  assert.deepEqual(
    o.regions.map((r) => [r.value, r.count]),
    [
      ["서울 송파구", 2],
      ["안양시 동안구", 2],
    ],
  );
  /* 값이 한 종류뿐이면 칩을 만들지 않는다 — 전체와 같다 */
  const one = mineFilterOptions([NOTES[0], feed({ id: "e", regionGroup: "안양시 동안구", decision: { choice: "buy", label: "살까" } })]);
  assert.deepEqual(one.decisions, []);
  assert.deepEqual(one.regions, []);
  assert.equal(mineFilterOptions([]).decisions.length, 0);
  assert.ok(MINE_REGION_CHIPS_MAX >= 5);
});

test("applyMineFilters — 판단·지역·기간(방문일)·정렬", () => {
  assert.deepEqual(applyMineFilters(NOTES, DEFAULT_MINE_FILTERS, NOW).map((n) => n.id), ["a", "b", "c", "d"]);
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, decision: "hold" }, NOW).map((n) => n.id), ["b"]);
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, decision: "none" }, NOW).map((n) => n.id), ["c"]);
  assert.deepEqual(
    applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, region: "서울 송파구" }, NOW).map((n) => n.id),
    ["b", "d"],
  );
  /* 기간 — 방문일 기준. 1개월: 9/18 만, 3개월: 7/1 포함, 1년: 2026-03-15 포함·2025-06-01 제외 */
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, period: 1 }, NOW).map((n) => n.id), ["a"]);
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, period: 3 }, NOW).map((n) => n.id), ["a", "b"]);
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, period: 12 }, NOW).map((n) => n.id), ["a", "b", "d"]);
  /* 방문일을 모르는 노트는 기간 필터에서 빠진다 */
  const noDate = feed({ id: "z", regionGroup: "x" });
  assert.deepEqual(applyMineFilters([noDate], { ...DEFAULT_MINE_FILTERS, period: 12 }, NOW), []);
  assert.deepEqual(applyMineFilters([noDate], DEFAULT_MINE_FILTERS, NOW).map((n) => n.id), ["z"]);
  /* 정렬 — 점수(0 은 뒤로), 방문일(없으면 뒤로), 최신은 서버 순서 유지 */
  assert.deepEqual(applyMineFilters(NOTES, { ...DEFAULT_MINE_FILTERS, sort: "score" }, NOW).map((n) => n.id), ["a", "d", "b", "c"]);
  assert.deepEqual(
    applyMineFilters([...NOTES, noDate], { ...DEFAULT_MINE_FILTERS, sort: "visit" }, NOW).map((n) => n.id),
    ["a", "b", "d", "c", "z"],
  );
  /* 조합 */
  assert.deepEqual(
    applyMineFilters(NOTES, { sort: "score", decision: null, region: "서울 송파구", period: 12 }, NOW).map((n) => n.id),
    ["d", "b"],
  );
});

test("periodFloorMs — 달력 기준 N개월 전 자정", () => {
  const floor = periodFloorMs(1, new Date(2026, 2, 31, 15, 0).getTime());
  const d = new Date(floor);
  /* 3/31 의 1개월 전은 JS 달력상 3/3(2월 31일 → 넘침) — 자정으로 맞춘다 */
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.ok(floor < new Date(2026, 2, 31).getTime());
});

test("hasActiveMineFilter — 기본값이면 false, 하나라도 다르면 true", () => {
  assert.equal(hasActiveMineFilter(DEFAULT_MINE_FILTERS), false);
  assert.equal(hasActiveMineFilter({ ...DEFAULT_MINE_FILTERS, sort: "visit" }), true);
  assert.equal(hasActiveMineFilter({ ...DEFAULT_MINE_FILTERS, period: 3 }), true);
});

test("regionGroupOf — 시·구까지만, 못 읽으면 원문", () => {
  assert.equal(regionGroupOf("경기 안양시 동안구 관양동"), "안양시 동안구");
  assert.equal(regionGroupOf("서울특별시 송파구 가락동"), "서울 송파구");
  assert.equal(regionGroupOf("서울 강남구"), "서울 강남구");
  assert.equal(regionGroupOf("판교"), "판교");
  assert.equal(regionGroupOf(""), "");
  assert.equal(regionGroupOf(null), "");
});

/* ── 작성기 설정 기본값 ────────────────────────────────────────────── */

test("readWriterPrefs — 로그인 + 저장한 적 있음(updatedAt)일 때만 값을 준다", () => {
  const saved = {
    authenticated: true,
    uiPrefs: {
      areaUnit: "pyeong",
      noteVisibilityDefault: "public",
      noteQuickDefault: true,
      investorRoleDefault: "flip",
      weeklyDigestEmail: false,
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
  };
  assert.deepEqual(readWriterPrefs(saved), { visibility: "public", quick: true, investorRole: "flip" });
  /* 저장한 적 없음(스키마 기본값 그대로) — 작성기 기본값을 바꾸지 않는다 */
  assert.equal(readWriterPrefs({ authenticated: true, uiPrefs: { ...saved.uiPrefs, updatedAt: null } }), null);
  /* 비로그인·깨진 응답 */
  assert.equal(readWriterPrefs({ authenticated: false, uiPrefs: saved.uiPrefs }), null);
  assert.equal(readWriterPrefs({ uiPrefs: saved.uiPrefs }), null);
  assert.equal(readWriterPrefs(null), null);
  assert.equal(readWriterPrefs("x"), null);
  assert.equal(readWriterPrefs({ authenticated: true }), null);
  /* 틀린 값은 정규화(normalizeUiPrefs, lib/prefs) — 모르는 역할 문자열은 null(노트마다 고른다)로 접힌다(그 모듈의 규칙) */
  const odd = readWriterPrefs({
    authenticated: true,
    uiPrefs: { noteVisibilityDefault: "private", investorRoleDefault: "whale", updatedAt: "2026-09-20T00:00:00Z" },
  });
  assert.deepEqual(odd, { visibility: "private", quick: false, investorRole: null });
  /* null 은 "노트마다 고른다" 그대로 */
  const none = readWriterPrefs({
    authenticated: true,
    uiPrefs: { investorRoleDefault: null, updatedAt: "2026-09-20T00:00:00Z" },
  });
  assert.equal(none?.investorRole, null);
});

test("NoteForm — 설정 기본값은 1회 조회·스위치를 건드리지 않았을 때만 적용·URL quick 이 우선", () => {
  const src = readFileSync("app/notes/new/NoteForm.tsx", "utf8");
  assert.ok(src.includes('fetch("/api/me/preferences"'));
  assert.ok(src.includes("if (isEdit || isGuest !== false) return;"), "로그인 확정 + 작성 모드에서만 조회");
  assert.ok(src.includes("if (!visibilityTouchedRef.current)"), "스위치를 건드렸으면 덮지 않는다");
  assert.ok(src.includes("writerPrefs.quick && !quickExplicit"), "URL ?quick= 명시가 설정보다 우선");
  assert.ok(src.includes("writerPrefs?.investorRole ?? investorRoleFromPurpose"), "역할: 설정 → 목적 파생");
  /* 첫 로드에서 뺀 조각 셋 — next/dynamic 이어야 한다(예산 470KB) */
  for (const name of ["NoteFinishStep", "NotePhotoStrip", "NoteUploadProgress", "VisitVerifyCard"]) {
    assert.ok(new RegExp(`const ${name} = nextDynamic\\(`).test(src), `${name} 는 지연 로드`);
  }
  assert.ok(!src.includes('from "@/app/components/ui/CharCount"'), "CharCount 는 지연 조각(3단계 본문)으로");
  /* [1006 · H2] 퀵모드 한 화면에도 공개/비공개 줄 — 3단계 스위치와 같은 상태·같은 손잡이(togglePublic).
     설정에서 "공개"를 기본으로 저장한 사람이 표식 없이 공개로 저장하는 구멍을 막는다. */
  const quickStart = src.indexOf("{quickMode && !isEdit && (");
  const quickEnd = src.indexOf("일반 3단계 — 퀵모드가 아닐 때만 마운트한다", quickStart);
  const quick = src.slice(quickStart, quickEnd);
  assert.ok(quickStart > 0 && quickEnd > quickStart);
  assert.ok(quick.includes('role="switch"') && quick.includes("aria-checked={isPublic}"), "퀵모드 공개/비공개 스위치");
  assert.ok(quick.includes("onClick={togglePublic}") && src.includes("onTogglePublic={togglePublic}"), "3단계와 같은 손잡이");
  assert.ok(quick.includes("설정에서 정한 기본값: 공개"), "문구는 사실대로");
  assert.ok(quick.indexOf('role="switch"') < quick.indexOf("busyLabel=\"저장 중\""), "저장 버튼 위");
});

test("?quick=0/1 명시 여부를 폼에 넘긴다 — [1007] 판정은 lib/notes/new-entry, 전달은 NoteNewEntry(정적 셸)", () => {
  /* [1007] page.tsx 는 정적 셸이 되어 searchParams 를 읽지 않는다 — 같은 판정이 순수 모듈로 옮겨 갔다 */
  const rule = readFileSync("lib/notes/new-entry.ts", "utf8");
  assert.ok(rule.includes('quickExplicit: quickRaw === "1" || quickRaw === "0"'));
  const entry = readFileSync("app/notes/new/NoteNewEntry.tsx", "utf8");
  assert.ok(entry.includes("quickExplicit={resolved.quickExplicit}"));
});

/* ── 재방문 ────────────────────────────────────────────────────────── */

test("visitAgoLabel — 오늘·어제·N일·N개월(달력)·N년, 미래·깨진 값은 null", () => {
  assert.equal(visitAgoLabel("2026-09-20", "2026-09-20"), "오늘");
  assert.equal(visitAgoLabel("2026-09-19", "2026-09-20"), "어제");
  assert.equal(visitAgoLabel("2026-09-01", "2026-09-20"), "19일 전");
  assert.equal(visitAgoLabel("2026-08-21", "2026-09-20"), "30일 전"); // 30일이지만 달력상 아직 1개월 미만
  assert.equal(visitAgoLabel("2026-08-20", "2026-09-20"), "1개월 전");
  assert.equal(visitAgoLabel("2026-06-12", "2026-09-20"), "3개월 전");
  assert.equal(visitAgoLabel("2025-09-21", "2026-09-20"), "11개월 전");
  assert.equal(visitAgoLabel("2025-09-20", "2026-09-20"), "1년 전");
  assert.equal(visitAgoLabel("2023-01-05", "2026-09-20"), "3년 전");
  assert.equal(visitAgoLabel("2026-09-21", "2026-09-20"), null);
  assert.equal(visitAgoLabel("abc", "2026-09-20"), null);
  assert.equal(visitAgoLabel("2026-09-20T10:00:00Z", "2026-09-20"), "오늘");
});

test("buildRevisitPrefill — previousAgoLabel 이 채워진다", () => {
  const p = buildRevisitPrefill(
    {
      id: "n1",
      region: "경기 안양시 동안구",
      aptName: "샘플",
      visitDate: "2026-06-12",
      scores: { location: 4, school: 0, transport: 3, facility: 0, future: 0 },
      checklist: [],
      sections: {},
      metadata: null,
    },
    "2026-09-20",
  );
  assert.equal(p.previousAgoLabel, "3개월 전");
  assert.equal(p.previousVisitDate, "2026-06-12");
  assert.equal(p.round, 2);
});

/* ── 면적 단위 ─────────────────────────────────────────────────────── */

test("areaBandLabels — 구간 슬러그 → ㎡·평 두 벌, 모르는 슬러그는 라벨 그대로", () => {
  assert.deepEqual(areaBandLabels("60-85", "60~85㎡"), { m2: "60~85㎡", pyeong: "18~26평" });
  assert.deepEqual(areaBandLabels("under-60", "~59㎡"), { m2: "~59㎡", pyeong: "~17평" });
  assert.deepEqual(areaBandLabels("over-135", "135㎡~"), { m2: "135㎡~", pyeong: "41평~" });
  assert.deepEqual(areaBandLabels("nope", "x"), { m2: "x", pyeong: "x" });
});

test("buildFieldBrief — 평 설정이면 ㎡당 매매를 평당으로 환산해 적는다", () => {
  const raw = { market: { perM2Sale: 1000, jeonseRatio: 60.5 } };
  const m2 = buildFieldBrief(raw);
  const py = buildFieldBrief(raw, { areaUnit: "pyeong" });
  assert.ok(m2 && m2.lines[0].text.startsWith("㎡당 매매 1,000만원"));
  assert.ok(py && py.lines[0].text.startsWith("평당 매매 3,306만원"), py?.lines[0].text);
  /* 나머지 항목은 단위와 무관 */
  assert.ok(py!.lines[0].text.includes("전세가율 60.5%"));
});

/* ── 상세 ──────────────────────────────────────────────────────────── */

test("상세 — 회차 줄은 링크, 라이트박스는 지연 로드 + 포커스 트랩", () => {
  const page = readFileSync("app/notes/[id]/page.tsx", "utf8");
  assert.ok(page.includes("href={`/notes/${visit.id}`}"), "다른 회차로 가는 링크");
  assert.ok(page.includes("bandLabelPyeong: areaBandLabels("), "평 표기를 같이 넘긴다");
  const carousel = readFileSync("app/notes/[id]/NotePhotoCarousel.tsx", "utf8");
  assert.ok(/const NotePhotoLightbox = nextDynamic\(/.test(carousel));
  const lb = readFileSync("app/notes/[id]/NotePhotoLightbox.tsx", "utf8");
  assert.ok(lb.includes('e.key !== "Tab"') && lb.includes("opener.focus()"), "Tab 트랩 + 포커스 복귀");
  assert.ok(lb.includes('role="dialog"') && lb.includes('aria-modal="true"'));
});

test("내 노트 목록 — 필터 줄은 mine 에서만, 배지는 aiStatus 가 있을 때만", () => {
  const src = readFileSync("app/notes/notes-feed-client.tsx", "utf8");
  assert.ok(src.includes("{mine && mineOptions && allNotes.length > 0 && ("));
  assert.ok(src.includes("{n.aiStatus && ("));
  assert.ok(src.includes("applyMineFilters(allNotes, mineFilters)"));
});

/* ── 재방문 diff(lib/inspection/revisit — 996 부터 있었지만 테스트가 없었다) ───── */

test("buildRevisitDelta — 판단·현장 체크·만족도·체크 수 변화만 문장으로, 비교 항목 0이면 null", () => {
  const base = {
    id: "p",
    authorEmail: "a@b.c",
    title: "t",
    region: "서울 송파구",
    aptName: "x",
    visitDate: "2026-06-12",
    scores: { location: 4, school: 0, transport: 3, facility: 0, future: 0 },
    checklist: [{ label: "a", done: true }, { label: "b", done: false }],
    sections: {},
    photos: [],
    aiAnalysis: null,
    isPublic: false,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:00Z",
  };
  const prev = {
    ...base,
    metadata: {
      fieldRatings: { 소음: "보통", 주차: "좋음" },
      satisfaction: 6,
      decision: { choice: "hold", reasons: [], decidedAt: "2026-06-12T00:00:00Z" },
    },
  };
  const curr = {
    ...base,
    id: "c",
    visitDate: "2026-09-18",
    checklist: [{ label: "a", done: true }, { label: "b", done: true }],
    metadata: {
      fieldRatings: { 소음: "아쉬움", 주차: "좋음" },
      satisfaction: 8,
      decision: { choice: "buy", reasons: ["x"], decidedAt: "2026-09-18T00:00:00Z" },
      round: 2,
      revisitOf: "p",
    },
  };
  const d = buildRevisitDelta(prev as never, curr as never, 0, 1);
  assert.ok(d);
  assert.equal(d.decisionLine, "지난 방문 보류 → 이번 살까");
  assert.deepEqual(d.changes, ["소음 보통→아쉬움", "만족도 6→8", "체크 완료 1→2개"]);
  assert.equal(d.comparable, 5); // 소음·주차·만족도·체크·판단
  assert.equal(d.round, 2);
  assert.equal(d.prevVisitDate, "2026-06-12");
  /* 아무것도 기록되지 않은 두 노트 — 비교 자체가 없다 */
  const empty = { ...base, checklist: [], scores: { location: 0, school: 0, transport: 0, facility: 0, future: 0 }, metadata: {} };
  assert.equal(buildRevisitDelta(empty as never, { ...empty, id: "c2" } as never, 0, 1), null);
  /* 한쪽만 판단이 있으면 변화가 아니다(기록 습관의 차이) */
  const onlyCurr = buildRevisitDelta(
    { ...base, metadata: { satisfaction: 5 } } as never,
    { ...base, id: "c3", metadata: { satisfaction: 5, decision: { choice: "buy", reasons: [], decidedAt: "x" } } } as never,
    0,
    1,
  );
  assert.ok(onlyCurr);
  assert.equal(onlyCurr.decisionLine, null);
  assert.deepEqual(onlyCurr.changes, []);
});
