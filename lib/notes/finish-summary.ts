/* [1023 · 임장노트] 작성 3단계 "저장 전 요약" — 폼 상태를 한 장으로(새 데이터 없음).
 *
 * 규칙(docs/review-1022.md 1장 ①): 3단계 마지막에서 "무엇을 적었는지" 가 한 화면에 안 모였다.
 * 폼 상태(단지 · 방문일 · 점수 5축 · 체크 N/M · 사진 N · 메모 첫 줄 · 판단)만 줄로 만든다.
 * 없는 값은 "—" 로 적고 지어내지 않는다(0점 축은 미입력이다 — 서버 규약과 같다). 순수 모듈. */

import type { NoteScores } from "@/lib/notes/note-scores";

export type FinishSummaryInput = {
  aptName: string;
  region: string;
  visitDate: string;
  scores: NoteScores;
  checklistDone: number;
  checklistTotal: number;
  photoCount: number;
  memo: string;
  /** 판단 라벨(살까·보류·패스·다시 보기) — 고르지 않았으면 null */
  decisionLabel: string | null;
};

export type FinishSummaryRow = { label: string; value: string };

/** 5축 표시 순서·이름 — 상세·전략 문서와 같은 이름(입지·학군·교통·시설·미래가치) */
export const FINISH_AXES: ReadonlyArray<{ key: keyof NoteScores; label: string }> = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

const EMPTY = "—";

/** 메모 첫 줄 — 앞뒤 공백을 걷고 첫 줄바꿈까지, 60자 넘으면 말줄임 */
export function memoFirstLine(memo: string, max = 60): string {
  const line = (memo ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** 점수 5축 한 줄 — "입지 4 · 학군 — · …". 전부 미입력이면 "—" */
export function scoresLine(scores: NoteScores): string {
  const parts = FINISH_AXES.map((a) => {
    const v = scores[a.key];
    return `${a.label} ${v > 0 ? v : EMPTY}`;
  });
  const any = FINISH_AXES.some((a) => scores[a.key] > 0);
  return any ? parts.join(" · ") : EMPTY;
}

export function finishSummaryRows(input: FinishSummaryInput): FinishSummaryRow[] {
  const apt = input.aptName.trim();
  const region = input.region.trim();
  const place = apt && region ? `${region} · ${apt}` : apt || region || EMPTY;
  const memo = memoFirstLine(input.memo);
  return [
    { label: "단지", value: place },
    { label: "방문일", value: input.visitDate.trim() || EMPTY },
    { label: "점수", value: scoresLine(input.scores) },
    {
      label: "체크",
      value: input.checklistTotal > 0 ? `${input.checklistDone}/${input.checklistTotal}` : EMPTY,
    },
    { label: "사진", value: input.photoCount > 0 ? `${input.photoCount}장` : EMPTY },
    { label: "판단", value: input.decisionLabel?.trim() || EMPTY },
    { label: "메모", value: memo || EMPTY },
  ];
}
