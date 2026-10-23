/**
 * [1086 · A6] 공개 노트 소프트월(app/notes/[id]/NoteSoftWall)의 규칙 — 순수 함수(tests/unit/review-1086).
 *
 * 비회원 하루 3편까지 본문 전체 · 4편째부터 하단을 가리고 가입을 권한다(개선 #5 · 2026-08-22).
 * [1086] 하루 한 번은 "이 노트만 마저 보기"로 닫을 수 있다 — 닫은 노트(passed)는 그날 다시 벽이 서지 않는다.
 * 저장 형식은 예전 { date, ids } 에 passed 하나를 더한 것 — 예전 값도 그대로 읽는다.
 */

export const NOTE_WALL_KEY = "nz_note_reads";
export const NOTE_WALL_FREE_PER_DAY = 3;

export type NoteWallState = { date: string; ids: string[]; passed?: string | null };

export function parseNoteWallState(raw: string | null | undefined, today: string): NoteWallState {
  const fresh: NoteWallState = { date: today, ids: [], passed: null };
  if (!raw) return fresh;
  try {
    const v = JSON.parse(raw) as Partial<NoteWallState>;
    if (v.date !== today || !Array.isArray(v.ids)) return fresh;
    return { date: today, ids: v.ids.map(String), passed: typeof v.passed === "string" ? v.passed : null };
  } catch {
    return fresh;
  }
}

export type NoteWallDecision = {
  /** 벽을 세운다 */
  walled: boolean;
  /** "이 노트만 마저 보기"를 보여 준다(오늘 아직 안 씀) */
  canPass: boolean;
  /** 바뀐 상태를 저장해야 한다 */
  write: boolean;
  state: NoteWallState;
};

export function decideNoteWall(state: NoteWallState, noteId: string, freePerDay = NOTE_WALL_FREE_PER_DAY): NoteWallDecision {
  if (state.passed === noteId || state.ids.includes(noteId)) return { walled: false, canPass: false, write: false, state };
  if (state.ids.length >= freePerDay) {
    /* 무료 쿼터 소진 — 이 글은 세지 않고 벽만 세운다 */
    return { walled: true, canPass: !state.passed, write: false, state };
  }
  const next = { ...state, ids: [...state.ids, noteId] };
  return { walled: false, canPass: false, write: true, state: next };
}
