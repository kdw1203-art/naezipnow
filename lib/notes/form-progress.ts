/* [1026 · 노트 쓰기] 작성 폼의 "지금 무엇이 채워졌나" — 완성도 · 단계 옆 내용 · 저장 뒤 주소. 순수 모듈.
 *
 * 왜(docs 1026 브리프 담당 R): 단계 탭은 있었지만 어디가 채워졌는지는 탭의 ✓ 하나뿐이었고, 진행 수("입력 3/7")는
 * 2개 이상 채운 뒤에야 떴다. 이제 한 규칙이 세 곳을 같이 그린다 —
 *   · 절차 한 줄(StepLine 모양)의 체크와 단계 옆 내용("공작아파트" · "체크 12/30" · "사진 3")
 *   · 폰 머리의 "완성도 60% · 체크 12/30"
 *   · 데스크톱 레일의 완성도 링(필수 1 · 권장 6)
 * 항목과 판정은 예전 progressItems(NoteForm) 그대로다 — 새 기준을 만들지 않는다. 체크 수는 저장 페이로드와 같은 셈
 * (카테고리 체크 + 고려사항 완료)을 부르는 쪽이 넘긴다.
 *
 * NoteForm 첫 로드(/notes/new 예산 470KB)에 실리는 모듈이라 작게 둔다 — 레이더·판단 라벨처럼 레일에서만 쓰는 것은
 * lib/notes/note-preview(지연 조각)로 뺐다. `server-only`·React 를 import 하지 않는다(node:test 가 부른다). */

import { CHECK_ITEMS } from "@/lib/notes/note-scores";
import type { NoteStep, StepFill } from "@/lib/notes/form-steps";

export type CompletenessInput = {
  /** 단지·주소를 골랐다(저장의 유일한 필수) */
  located: boolean;
  /** 현장 체크 9칸 중 고른 수 */
  checkedItems: number;
  /** 종합 만족도를 움직였다(null 이 아님) */
  satisfactionSet: boolean;
  memo: string;
  tagCount: number;
  /** 체크리스트 완료 수 — 카테고리 체크 + 고려사항 완료(저장 페이로드와 같은 셈) */
  checklistDone: number;
  photoCount: number;
  /** 판단을 **골랐다**(제안은 입력이 아니다) */
  decided: boolean;
  /** [1033] 임장한 타입(전용면적·동·층·향 중 하나라도) — 넘기면 8번째 항목이 된다(안 넘기면 예전 7항목 그대로) */
  unitSet?: boolean;
};

export type CompletenessKey = "location" | "unit" | "field" | "memo" | "tags" | "checklist" | "photos" | "decision";

export type CompletenessItem = {
  key: CompletenessKey;
  label: string;
  done: boolean;
  /** 저장에 꼭 필요한가 — 위치 하나뿐 */
  required: boolean;
  /** 그 칸이 있는 단계 — 레일의 "빠진 항목 ›" 이 옮겨 간다 */
  step: NoteStep;
};

export type Completeness = {
  items: CompletenessItem[];
  done: number;
  total: number;
  /** 0~100 정수 */
  pct: number;
  requiredDone: number;
  requiredTotal: number;
  optionalDone: number;
  optionalTotal: number;
};

/** 7항목 — 예전 progressItems 와 같은 순서·같은 판정. [1033] unitSet 을 넘기면 "타입"(1단계)이 위치 다음에 끼어 8항목 */
export function noteCompleteness(i: CompletenessInput): Completeness {
  const items: CompletenessItem[] = [
    { key: "location", label: "위치", done: i.located, required: true, step: 1 },
    ...(typeof i.unitSet === "boolean" ? [{ key: "unit" as const, label: "타입", done: i.unitSet, required: false, step: 1 as NoteStep }] : []),
    { key: "field", label: "현장 체크", done: i.checkedItems > 0 || i.satisfactionSet, required: false, step: 2 },
    { key: "memo", label: "메모", done: i.memo.trim().length > 0, required: false, step: 3 },
    { key: "tags", label: "태그", done: i.tagCount > 0, required: false, step: 2 },
    { key: "checklist", label: "체크리스트", done: i.checklistDone > 0, required: false, step: 2 },
    { key: "photos", label: "사진", done: i.photoCount > 0, required: false, step: 3 },
    { key: "decision", label: "판단", done: i.decided, required: false, step: 3 },
  ];
  const done = items.filter((x) => x.done).length;
  const req = items.filter((x) => x.required);
  const opt = items.filter((x) => !x.required);
  return {
    items,
    done,
    total: items.length,
    pct: Math.round((done / items.length) * 100),
    requiredDone: req.filter((x) => x.done).length,
    requiredTotal: req.length,
    optionalDone: opt.filter((x) => x.done).length,
    optionalTotal: opt.length,
  };
}

/** 단계 체크의 재료 — 예전 doneByStep 과 같은 묶음(2단계 = 현장 체크·태그·체크리스트, 3단계 = 메모·사진·판단) */
export function stepFillOf(c: Completeness): StepFill {
  const d = (k: CompletenessKey) => c.items.some((x) => x.key === k && x.done);
  return {
    located: d("location"),
    judged: d("field") || d("tags") || d("checklist"),
    wrote: d("memo") || d("photos") || d("decision"),
  };
}

export type StepNoteInput = {
  aptName: string;
  checklistDone: number;
  checklistTotal: number;
  checkedItems: number;
  photoCount: number;
  memo: string;
};

/** 단계 옆 내용 — 채운 것만(없으면 undefined: 빈 칸을 지어 쓰지 않는다).
 *  1 = 단지명 · 2 = "체크 d/t"(체크리스트를 안 건드리고 현장 체크만 했으면 "현장 n/9") · 3 = "사진 n"(없으면 "메모") */
export function stepNotes(i: StepNoteInput): Record<NoteStep, string | undefined> {
  const apt = i.aptName.trim();
  const two =
    i.checklistDone > 0 && i.checklistTotal > 0
      ? `체크 ${i.checklistDone}/${i.checklistTotal}`
      : i.checkedItems > 0
        ? `현장 ${i.checkedItems}/${CHECK_ITEMS.length}`
        : undefined;
  const three = i.photoCount > 0 ? `사진 ${i.photoCount}` : i.memo.trim() ? "메모" : undefined;
  return { 1: apt || undefined, 2: two, 3: three };
}

/** 폰 머리 한 줄 — "완성도 60% · 체크 12/30". 체크 목록이 비면 완성도만 */
export function completenessLine(c: Completeness, checklistDone: number, checklistTotal: number): string {
  const head = `완성도 ${c.pct}%`;
  return checklistTotal > 0 ? `${head} · 체크 ${checklistDone}/${checklistTotal}` : head;
}

/* ── 저장 뒤 주소 ─────────────────────────────────────────────────────────
   새 노트는 썸네일 고르기(/cover)를 거쳐 상세로, 수정은 상세로 바로 간다(1012). 두 길 모두 `saved=1` 을 달아
   상세가 첫머리에 "저장 완료" 카드를 그리게 한다 — 그 카드는 이 표시가 있을 때만 뜬다(일반 열람에는 없다).
   `ai=pending` 계약(1005 · A4)은 그대로다. */
export const SAVED_PARAM = "saved";

export function savedLandingHref(noteId: string, isEdit: boolean): string {
  const id = encodeURIComponent(noteId);
  return isEdit ? `/notes/${id}?ai=pending&${SAVED_PARAM}=1` : `/notes/${id}/cover?ai=pending&${SAVED_PARAM}=1`;
}

/** 썸네일 고르기 → 상세. 저장 직후 표시(ai=pending · saved=1)를 그대로 넘긴다 */
export function coverDoneHref(noteId: string, aiPending: boolean, saved: boolean): string {
  const qs = [aiPending ? "ai=pending" : "", saved ? `${SAVED_PARAM}=1` : ""].filter(Boolean).join("&");
  return `/notes/${noteId}${qs ? `?${qs}` : ""}`;
}

/** 쿼리값 → 저장 직후인가. "1" 만 참(배열·그 밖의 값은 거짓) */
export function isSavedFlag(v: unknown): boolean {
  return v === "1";
}
