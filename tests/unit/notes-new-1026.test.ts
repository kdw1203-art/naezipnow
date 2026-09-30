/* [1026 · 노트 쓰기] 1025 표준을 /notes/new 에 — 순수 규칙 + 배선 잠금.
   · 완성도(예전 progressItems 7항목과 같은 판정) · 단계 체크 · 단계 옆 내용 · 폰 머리 한 줄
   · 저장 뒤 주소(saved=1) · 썸네일 고르기 → 상세 전달
   · 미리보기 재료(기록 점수 = 상세와 같은 식 · 레이더 0~100 · 판정 칩) · 저장 완료 카드 결론 한 줄 · 같은 단지 링크
   · 번들 배선: 레일은 next/dynamic(ssr:false) + lg 에서만 마운트, 미리보기 카드·레이더는 첫 로드에 없음
   · 채움 파랑: 레일이 있으면 레일의 저장 하나, 저장 완료 카드는 공개일 때 "공유하기" 하나 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  completenessLine,
  coverDoneHref,
  isSavedFlag,
  noteCompleteness,
  savedLandingHref,
  stepFillOf,
  stepNotes,
  type CompletenessInput,
} from "../../lib/notes/form-progress.ts";
import {
  decisionTone,
  noteTotalScore,
  previewRadarItems,
  sameComplexLink,
  savedCardView,
  scoreTone,
} from "../../lib/notes/note-preview.ts";
import { composeScoresFromChecks } from "../../lib/notes/note-scores.ts";
import { stepDone } from "../../lib/notes/form-steps.ts";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 걷은 코드 — 설명 문장 속 낱말을 세지 않게 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const EMPTY: CompletenessInput = {
  located: false,
  checkedItems: 0,
  satisfactionSet: false,
  memo: "",
  tagCount: 0,
  checklistDone: 0,
  photoCount: 0,
  decided: false,
};

/* ── 완성도 ─────────────────────────────────────────────────────────── */

test("완성도 — 7항목(위치·현장 체크·메모·태그·체크리스트·사진·판단), 필수는 위치 하나", () => {
  const c = noteCompleteness(EMPTY);
  assert.deepEqual(
    c.items.map((x) => x.label),
    ["위치", "현장 체크", "메모", "태그", "체크리스트", "사진", "판단"],
  );
  assert.equal(c.total, 7);
  assert.equal(c.done, 0);
  assert.equal(c.pct, 0);
  assert.deepEqual([c.requiredDone, c.requiredTotal, c.optionalDone, c.optionalTotal], [0, 1, 0, 6]);
  assert.deepEqual(
    c.items.filter((x) => x.required).map((x) => x.key),
    ["location"],
  );
});

test("완성도 — 예전 progressItems 판정 그대로(만족도만 움직여도 현장 체크 · 공백 메모는 없음 · 제안 판단은 아님)", () => {
  const c = noteCompleteness({ ...EMPTY, located: true, satisfactionSet: true, memo: "   ", decided: false });
  const done = Object.fromEntries(c.items.map((x) => [x.key, x.done]));
  assert.equal(done.location, true);
  assert.equal(done.field, true, "만족도만 있어도 현장 체크");
  assert.equal(done.memo, false, "공백 메모는 입력이 아니다");
  assert.equal(done.decision, false);
  assert.equal(c.done, 2);
  assert.equal(c.pct, 29, "2/7 = 28.6 → 29");
  const all = noteCompleteness({
    located: true,
    checkedItems: 3,
    satisfactionSet: false,
    memo: "남향",
    tagCount: 1,
    checklistDone: 2,
    photoCount: 1,
    decided: true,
  });
  assert.equal(all.pct, 100);
  assert.deepEqual([all.requiredDone, all.optionalDone], [1, 6]);
});

test("완성도 → 단계 체크 — 예전 doneByStep 묶음(2 = 현장·태그·체크리스트, 3 = 메모·사진·판단)", () => {
  assert.deepEqual(stepDone(stepFillOf(noteCompleteness(EMPTY))), { 1: false, 2: false, 3: false });
  assert.deepEqual(stepDone(stepFillOf(noteCompleteness({ ...EMPTY, tagCount: 1 }))), { 1: false, 2: true, 3: false });
  assert.deepEqual(stepDone(stepFillOf(noteCompleteness({ ...EMPTY, photoCount: 2 }))), { 1: false, 2: false, 3: true });
  assert.deepEqual(stepDone(stepFillOf(noteCompleteness({ ...EMPTY, located: true, decided: true }))), {
    1: true,
    2: false,
    3: true,
  });
  /* 빠진 항목이 옮겨 갈 단계 — 사진·메모·판단은 3단계(수정 모드에서도 사진 버튼이 있는 곳) */
  const steps = Object.fromEntries(noteCompleteness(EMPTY).items.map((x) => [x.key, x.step]));
  assert.deepEqual(steps, { location: 1, field: 2, memo: 3, tags: 2, checklist: 2, photos: 3, decision: 3 });
});

test("단계 옆 내용 — 채운 것만(단지명 · 체크 d/t · 현장 n/9 · 사진 n · 메모)", () => {
  const blank = stepNotes({ aptName: "  ", checklistDone: 0, checklistTotal: 39, checkedItems: 0, photoCount: 0, memo: "" });
  assert.deepEqual(blank, { 1: undefined, 2: undefined, 3: undefined });
  const full = stepNotes({ aptName: " 공작아파트 ", checklistDone: 12, checklistTotal: 30, checkedItems: 4, photoCount: 3, memo: "x" });
  assert.deepEqual(full, { 1: "공작아파트", 2: "체크 12/30", 3: "사진 3" });
  const fieldOnly = stepNotes({ aptName: "", checklistDone: 0, checklistTotal: 30, checkedItems: 4, photoCount: 0, memo: "메모" });
  assert.equal(fieldOnly[2], "현장 4/9", "체크리스트를 안 건드렸으면 현장 체크 수");
  assert.equal(fieldOnly[3], "메모");
});

test("폰 머리 한 줄 — '완성도 N% · 체크 d/t', 체크 목록이 없으면 완성도만", () => {
  const c = noteCompleteness({ ...EMPTY, located: true, checklistDone: 12, tagCount: 1, photoCount: 1 });
  assert.equal(completenessLine(c, 12, 30), "완성도 57% · 체크 12/30");
  assert.equal(completenessLine(noteCompleteness(EMPTY), 0, 0), "완성도 0%");
});

/* ── 저장 뒤 주소 ───────────────────────────────────────────────────── */

test("저장 뒤 — 새 노트는 썸네일 고르기, 수정은 상세. 둘 다 ai=pending + saved=1", () => {
  assert.equal(savedLandingHref("abc", false), "/notes/abc/cover?ai=pending&saved=1");
  assert.equal(savedLandingHref("abc", true), "/notes/abc?ai=pending&saved=1");
  assert.equal(coverDoneHref("abc", true, true), "/notes/abc?ai=pending&saved=1");
  assert.equal(coverDoneHref("abc", true, false), "/notes/abc?ai=pending", "상세의 썸네일 바꾸기 등 — 예전과 같다");
  assert.equal(coverDoneHref("abc", false, false), "/notes/abc");
  assert.equal(isSavedFlag("1"), true);
  for (const v of [undefined, "", "0", "true", ["1"], 1]) assert.equal(isSavedFlag(v), false, String(v));
});

/* ── 미리보기 재료 ──────────────────────────────────────────────────── */

test("기록 점수 — 상세 toView 와 같은 식(입력한 축 평균 × 20 반올림), 없으면 null", () => {
  assert.equal(noteTotalScore(composeScoresFromChecks({})), null, "아무것도 안 고르면 점수 없음(0 으로 지어내지 않는다)");
  /* 채광 좋음(5) → 시설 5 · 교통 보통(3) → 입지 3 · 교통 3 → 평균 11/3 × 20 = 73.3 → 73 */
  const s = composeScoresFromChecks({ 채광: "좋음", 교통: "보통" });
  assert.deepEqual(s, { location: 3, school: 0, transport: 3, facility: 5, future: 0 });
  assert.equal(noteTotalScore(s), 73);
  /* 상세 page.tsx 의 식이 그대로인지(바뀌면 이 규칙도 같이 바꿔야 한다) */
  const page = read("app/notes/[id]/page.tsx");
  assert.ok(page.includes("const total = scored ? Math.round(avg * 20) : null;"));
});

test("5축 레이더 — ScoreRadar 척도(0~100) · 이름은 저장 전 요약과 같다 · 미입력 축은 null", () => {
  const items = previewRadarItems(composeScoresFromChecks({ 채광: "좋음", 교통: "보통" }));
  assert.deepEqual(
    items.map((x) => x.label),
    ["입지", "학군", "교통", "시설", "미래가치"],
  );
  assert.deepEqual(
    items.map((x) => x.score),
    [60, null, 60, 100, null],
  );
});

test("판정 칩 — 살까 좋음 · 보류/다시 보기 보통 · 패스 주의 / 점수 문턱 70·45(상세 판단 카드와 같다)", () => {
  assert.equal(decisionTone("buy"), "good");
  assert.equal(decisionTone("hold"), "normal");
  assert.equal(decisionTone("revisit"), "normal");
  assert.equal(decisionTone("pass"), "caution");
  assert.deepEqual([scoreTone(70), scoreTone(69), scoreTone(45), scoreTone(44)], ["good", "normal", "normal", "caution"]);
  const verdict = read("app/notes/[id]/NoteVerdictCard.tsx");
  assert.ok(verdict.includes("if (score >= 70) return \"strong\";") && verdict.includes("if (score >= 45) return \"mixed\";"));
});

test("저장 완료 카드 — 결론 한 줄(단지 · 점수 · 판단) + 칩 하나 + 근거 한 줄(있는 값만)", () => {
  const a = savedCardView({
    aptName: "공작아파트",
    title: "공작아파트 임장 기록",
    totalScore: 72,
    decision: "buy",
    visitDate: "2026-09-29",
    checklistDone: 12,
    checklistTotal: 30,
    photoCount: 3,
  });
  assert.equal(a.headline, "공작아파트 임장노트 · 점수 72 · 판단 살까");
  assert.deepEqual(a.chip, { label: "살까", tone: "good" });
  assert.equal(a.facts, "방문 2026-09-29 · 체크 12/30 · 사진 3장");
  const b = savedCardView({
    aptName: null,
    title: "여의도 임장 기록",
    totalScore: null,
    decision: null,
    visitDate: "2026-09-29",
    checklistDone: 0,
    checklistTotal: 0,
    photoCount: 0,
  });
  assert.equal(b.headline, "여의도 임장 기록 임장노트 · 점수 미입력");
  assert.equal(b.chip, null, "점수도 판단도 없으면 칩을 지어내지 않는다");
  assert.equal(b.facts, "방문 2026-09-29");
  const c = savedCardView({ ...{ aptName: "A", title: "t", visitDate: "", checklistDone: 0, checklistTotal: 0, photoCount: 0 }, totalScore: 40, decision: null });
  assert.deepEqual(c.chip, { label: "주의", tone: "caution" });
});

test("같은 단지 다른 노트 — 내 회차 ≥2 면 회차 비교, 아니면 단지 홈, 둘 다 없으면 없음", () => {
  assert.deepEqual(sameComplexLink({ noteId: "n1", visitCount: 3, complexHref: "/complex/x" }), {
    href: "/notes/compare?noteId=n1",
    label: "같은 단지 다른 노트 2",
  });
  assert.deepEqual(sameComplexLink({ noteId: "n1", visitCount: 1, complexHref: "/complex/x" }), {
    href: "/complex/x",
    label: "같은 단지 다른 노트",
  });
  assert.equal(sameComplexLink({ noteId: "n1", visitCount: 1, complexHref: null }), null);
});

/* ── 배선(번들 · 채움 파랑 · 절차) ─────────────────────────────────────── */

test("NoteForm — 레일은 next/dynamic(ssr:false) + lg(matchMedia)에서만 마운트, 미리보기 카드·레이더는 첫 로드에 없다", () => {
  const src = code("app/notes/new/NoteForm.tsx");
  assert.match(src, /const NotePreviewRail = nextDynamic\(\s*\(\) => import\("\.\/NotePreviewRail"\)[\s\S]*?ssr: false/);
  assert.ok(src.includes('"(min-width: 1024px)"'), "lg = 1024px");
  assert.ok(src.includes("useSyncExternalStore(subscribeDesktop, readDesktop, readDesktopServer)"));
  assert.ok(src.includes("const showRail = isDesktop && !quickMode;"));
  assert.ok(src.includes("{showRail && (") && src.includes("<NotePreviewRail"), "레일은 showRail 일 때만");
  /* 값 import 만 센다 — `import type`(판단 타입 등)은 지워져 번들에 안 실린다 */
  for (const mod of ["./NotePreviewRail", "./NotePreviewCard", "@/app/components/viz/ScoreRadar", "@/lib/notes/note-preview", "@/lib/inspection/decision"]) {
    const esc = mod.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    assert.ok(!new RegExp(`^import (?!type )[^;]*from "${esc}"`, "m").test(src), `${mod} 정적 import 없음`);
  }
  /* 2열 — 폼 680 | 레일 360, 1fr 금지(check-sidebar-grid-minmax) */
  assert.ok(src.includes("grid grid-cols-[minmax(0,680px)_360px]"));
  assert.ok(src.includes('aside aria-label="미리보기" className="sticky top-22'));
});

test("NoteForm — 절차 한 줄(StepLine 모양 · 버튼) · 진행 막대 없음 · 단계 옆 내용 · 폰 완성도 한 줄", () => {
  const src = code("app/notes/new/NoteForm.tsx");
  assert.ok(!src.includes('role="progressbar"'), "4px 진행 막대 제거(절차는 한 번)");
  assert.ok(!src.includes("grid grid-cols-3 gap-1 rounded-lg bg-bg p-1"), "3칸 탭 모양 제거");
  assert.ok(src.includes('<nav aria-label="작성 단계"'));
  assert.ok(src.includes("onClick={() => goStep(st.n)}"), "단계 이동은 버튼 그대로");
  assert.ok(src.includes('aria-current={active ? "step" : undefined}'));
  assert.ok(src.includes('"border-primary bg-primary-soft text-primary"'), "현재 단계 = 파랑 칩(StepLine 토큰)");
  assert.ok(src.includes('<Icon name="check" size={12} />'), "채운 단계 = 체크 아이콘");
  assert.ok(src.includes("const note = notesByStep[st.n];"));
  assert.ok(src.includes("noteCompleteness({") && src.includes("stepDone(stepFillOf(completeness))"));
  assert.ok(src.includes("{fillLine}") && src.includes("lg:hidden"), "폰 머리 완성도 한 줄(데스크톱은 레일)");
  assert.ok(!src.includes("fillPill"), "'입력 3/7' 알약은 완성도 한 줄로 대체");
});

test("NoteForm — 레일이 있으면 채움 파랑은 레일의 저장 하나(다음 단계 outline · 저장 바 숨김) · 저장 뒤 saved=1", () => {
  const src = code("app/notes/new/NoteForm.tsx");
  assert.ok(src.includes('${showRail ? "btn-outline" : "btn-primary"}'), "레일 화면의 '다음 단계'는 outline");
  assert.ok(src.includes("const showSaveBar = !ctaInView && !showRail;"));
  assert.ok(src.includes("{!showRail && <FieldCaptureConsentNotice />}"), "고지는 저장 버튼 곁(레일)으로");
  assert.ok((src.match(/\bbtn-primary\b/g) ?? []).length <= 2, "check-ai-look 상한(2) 안");
  assert.ok(src.includes("return savedLandingHref(noteId, isEdit);"));
  assert.ok(src.includes("const oneHand = oneHandPref && !isDesktop;"), "데스크톱은 한 손 모드를 그리지 않는다");
});

test("NotePreviewRail — 카드 · 완성도 링 · ScoreRadar · 저장(ActionButton) + AI 처리 고지, btn-primary 리터럴 0", () => {
  const src = code("app/notes/new/NotePreviewRail.tsx");
  assert.ok(src.startsWith('"use client"') || read("app/notes/new/NotePreviewRail.tsx").startsWith('"use client"'));
  assert.ok(src.includes("<NotePreviewCard"));
  assert.ok(src.includes("<CompletenessRing pct={c.pct} />"));
  assert.ok(src.includes("<ScoreRadar items={previewRadarItems(p.scores)} />"));
  assert.ok(src.includes("<ActionButton") && src.includes("onClick={p.onSave}"));
  assert.ok(src.includes("<FieldCaptureConsentNotice />"));
  assert.ok(src.includes("onClick={() => p.onGoStep(x.step)}"), "빠진 항목 → 그 단계로");
  assert.equal((src.match(/\bbtn-primary\b/g) ?? []).length, 0);
  assert.ok(!/text-\[\d/.test(src), "램프 유틸만");
});

test("NoteFinishStep — 폰 '미리보기' 접힘(<details> 닫힘 · 카드 + 요약 줄), 데스크톱은 숨김(레일)", () => {
  const src = code("app/notes/new/NoteFinishStep.tsx");
  assert.ok(src.includes('aria-label="저장 전 요약"') && src.includes('data-tone="plain"'), "[1023] 잠금 유지");
  assert.ok(src.includes("<details>") && !src.includes("<details open"), "기본 닫힘");
  assert.ok(src.includes("lg:hidden"));
  assert.ok(src.includes("<NotePreviewCard"));
  assert.ok(src.includes("{p.preview.line}"));
});

test("NotePreviewCard — 사진 최대 3 · 없으면 회색 견본 · 단지 미선택 · 판단 칩 세 색", () => {
  const src = code("app/notes/new/NotePreviewCard.tsx");
  assert.ok(src.includes("p.photos.slice(0, 3)"));
  assert.ok(src.includes('"단지 미선택"'));
  assert.ok(src.includes("bg-divider"), "회색 견본 칸");
  assert.ok(src.includes('"bg-success-soft text-success"') && src.includes('"bg-primary-soft text-primary"') && src.includes('"bg-warning-soft text-warning"'));
});

test("저장 완료 카드 — 공개일 때만 채움 파랑 '공유하기'(ShareLinkButton), 비공개는 '공개로 바꾸기' · 결정 카드 · 같은 단지", () => {
  const src = code("app/notes/new/NoteSavedCard.tsx");
  assert.equal((src.match(/\bbtn-primary\b/g) ?? []).length, 1, "채움 파랑 하나");
  assert.match(src, /\{isPublic \? \(\s*<ShareLinkButton/);
  assert.ok(src.includes('label="공유하기"'));
  assert.ok(src.includes("공개로 바꾸기"));
  assert.ok(src.includes('JSON.stringify({ isPublic: true })'), "상세의 전환과 같은 PATCH");
  assert.ok(src.includes("addToCompareTray(p.complex)") && src.includes('const DECIDE_HREF = "/decide"'), "결정 카드 = 이 기기 비교함");
  assert.ok(src.includes("결정 카드에 담기"));
  assert.ok(src.includes("{p.sameComplex.label}"));
  assert.ok(src.includes('className="t-title font-bold text-ink"') || src.includes("t-title font-bold text-ink"), "결론 = t-title 굵게");
});

test("상세 — ?saved=1 + 작성자일 때만, '다음 행동' 자리 한 곳에서 저장 완료 카드 · 썸네일 고르기는 saved 를 넘긴다", () => {
  const page = code("app/notes/[id]/page.tsx");
  assert.ok(page.includes("saved: savedRaw } = await searchParams;"));
  assert.ok(page.includes("{isOwner && isSavedFlag(savedRaw) ? ("), "작성자 + saved=1");
  assert.match(page, /isSavedFlag\(savedRaw\) \? \(\s*<NoteSavedCard[\s\S]*?\) : \(\s*nextActionCard\s*\)\}/);
  assert.equal((page.match(/<NoteSavedCard/g) ?? []).length, 1, "자리 하나");
  const cover = code("app/notes/[id]/cover/page.tsx");
  assert.ok(cover.includes("const doneHref = coverDoneHref(id, aiPending, saved);"));
});

test("globals.css — [1026 · 노트 쓰기] 블록(작성 화면 섹션 점 파랑 하나) · 그라데이션 없음", () => {
  const css = read("app/globals.css");
  const i = css.indexOf("[1026 · 노트 쓰기]");
  assert.ok(i > 0);
  const block = css.slice(i, i + 900);
  assert.ok(block.includes(".note-form :is(section, article) > :is(h2, h3).t-section::before"));
  assert.ok(block.includes("background: var(--lq-blue);"));
  assert.ok(!/gradient/.test(block));
});

test("loading.tsx — 골격도 절차 칩 3개 + lg 레일(진행 막대 없음)", () => {
  const src = code("app/notes/new/loading.tsx");
  assert.ok(!src.includes('className="mt-2.5 h-1 rounded-sm bg-bg"'));
  assert.ok(src.includes("lg:grid-cols-[minmax(0,680px)_360px]") && src.includes("grid grid-cols-1"));
  assert.ok(src.includes("hidden flex-col gap-3 lg:flex"));
});
