/**
 * [970 · B-10] 임장노트 현장 체크(9항목 좋음·보통·아쉬움) → 5축 점수 — 순수 함수.
 *
 * 왜 바뀌었나: 새 노트는 9항목 전부에 기본값(채광 좋음·주차 아쉬움…)이 채워진 채
 * 저장돼, 아무것도 고르지 않은 노트가 "평가된" 노트로 보였다(상세 4축·종합 점수·
 * 지도 비교까지 지어낸 값이 흘렀다). 이제 **고른 항목만** 점수에 넣고, 한 항목도
 * 없는 축은 0 으로 보낸다 — lib/inspection/store-db 의 규약이 "0 = 미입력"이다
 * (inspectionAverageScore·hasInspectionScores 가 `> 0` 만 센다). 종합 만족도도 같은
 * 이유로 null(미입력)이 기본이다.
 *
 * NoteForm.tsx 는 "use client" + next/dynamic 이라 node:test 가 못 부른다 — 여기 둔다.
 */

export const NOTE_LEVELS = ["좋음", "보통", "아쉬움"] as const;
export type NoteLevel = (typeof NOTE_LEVELS)[number];

export const LEVEL_SCORE: Record<NoteLevel, number> = { 좋음: 5, 보통: 3, 아쉬움: 1 };

/** 현장 체크 항목 순서 — 화면 순서이자 fieldRatings 키 */
export const CHECK_ITEMS = ["채광", "소음", "주차", "교통", "경사", "보안", "학군", "관리", "호재"] as const;

export type NoteScores = {
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

export function isNoteLevel(v: unknown): v is NoteLevel {
  return typeof v === "string" && (NOTE_LEVELS as readonly string[]).includes(v);
}

/** 고른 항목들의 평균(반올림). 하나도 없으면 0(미입력). */
function axisOf(checks: Readonly<Record<string, NoteLevel | undefined>>, keys: readonly string[]): number {
  const vals = keys.map((k) => checks[k]).filter(isNoteLevel).map((lv) => LEVEL_SCORE[lv]);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/** 9항목 → 5축. 미선택 축은 0(미입력) — 서버 규약과 같다. */
export function composeScoresFromChecks(
  checks: Readonly<Record<string, NoteLevel | undefined>>,
): NoteScores {
  return {
    location: axisOf(checks, ["경사", "교통"]),
    school: axisOf(checks, ["학군"]),
    transport: axisOf(checks, ["교통"]),
    facility: axisOf(checks, ["채광", "소음", "주차", "보안", "관리"]),
    future: axisOf(checks, ["호재"]),
  };
}

/** 고른 항목 수 — 저장 바 진행 표시·"평가 안 함" 판정용 */
export function countCheckedItems(checks: Readonly<Record<string, NoteLevel | undefined>>): number {
  return CHECK_ITEMS.filter((k) => isNoteLevel(checks[k])).length;
}

/** 축 점수(1~5) → 화면 등급. 0(미입력)은 null — "보통"으로 지어내지 않는다. */
export function levelFromAxisScore(score: number): NoteLevel | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (score >= 4) return "좋음";
  if (score <= 2) return "아쉬움";
  return "보통";
}

/**
 * 저장된 노트 → 폼 체크 상태 복원.
 *  - metadata.fieldRatings 가 있으면 그 키만(예전 노트는 9키 전부, 새 노트는 고른 것만)
 *  - 없으면(구버전) 축 점수의 근사 역변환 — 0 인 축은 비워 둔다
 */
export function checksFromSavedNote(
  fieldRatings: unknown,
  scores: NoteScores,
): Record<string, NoteLevel> {
  const out: Record<string, NoteLevel> = {};
  if (fieldRatings && typeof fieldRatings === "object") {
    for (const [k, val] of Object.entries(fieldRatings as Record<string, unknown>)) {
      if (isNoteLevel(val)) out[k] = val;
    }
    return out;
  }
  const put = (k: string, score: number) => {
    const lv = levelFromAxisScore(score);
    if (lv) out[k] = lv;
  };
  put("채광", scores.facility);
  put("소음", scores.facility);
  put("주차", scores.facility);
  put("보안", scores.facility);
  put("관리", scores.facility);
  put("교통", scores.transport);
  put("경사", scores.location);
  put("학군", scores.school);
  put("호재", scores.future);
  return out;
}
