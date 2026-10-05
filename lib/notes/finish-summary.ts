/* [1026b · 노트 쓰기] 입력한 값만 더한다 — 시간대 · 날씨(방문일 줄 뒤) · 목적 · 만족도 · 태그 최대 3(+N). 넘기지 않았거나 비었으면 줄이 없다
   (기존 7줄 계약·"—" 규칙은 그대로). 미리보기 카드(NotePreviewCard)는 같은 조각(visitFactParts · tagsLine)을 쓴다. */
/* [1023 · 임장노트] 작성 3단계 "저장 전 요약" — 폼 상태를 한 장으로(새 데이터 없음).
 *
 * 규칙(docs/review-1022.md 1장 ①): 3단계 마지막에서 "무엇을 적었는지" 가 한 화면에 안 모였다.
 * 폼 상태(단지 · 방문일 · 점수 5축 · 체크 N/M · 사진 N · 메모 첫 줄 · 판단)만 줄로 만든다.
 * 없는 값은 "—" 로 적고 지어내지 않는다(0점 축은 미입력이다 — 서버 규약과 같다). 순수 모듈. */

import { unitSummary, type NoteUnit } from "@/lib/notes/unit-core";
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
} & VisitFacts;

/** [1026b] 방문 정보 · 만족도 · 태그 — 입력한 것만 줄·조각이 된다 */
export type VisitFacts = {
  /** 방문 목적(실거주·투자·전월세·갈아타기) */
  purpose?: string | null;
  /** 시간대(오전·오후·저녁·주말) */
  timeSlot?: string | null;
  weather?: string | null;
  /** 종합 만족도 0~10 — null 은 미입력 */
  satisfaction?: number | null;
  tags?: readonly string[] | null;
  /** [1033] 임장한 타입(전용면적·동·층·향) — 줄은 unitSummary 가 만든다("84㎡ · 103동 · 12층 · 남향") · 비면 줄 없음 */
  unit?: NoteUnit | null;
};

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : "");

/** "만족도 7.5" — 미입력(null)이면 "" */
export function satisfactionText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `만족도 ${Number(v.toFixed(1))}` : "";
}

/** 카드 한 줄 조각 — [목적, 시간대, 날씨, 만족도] 중 입력한 것만 */
export function visitFactParts(f: VisitFacts): string[] {
  return [clean(f.purpose), clean(f.timeSlot), clean(f.weather), satisfactionText(f.satisfaction)].filter(Boolean);
}

/** 태그 최대 max 개 + 나머지 수 — "초품아 · 역세권 · 대단지 +2". 없으면 "" */
export function tagsLine(tags: readonly string[] | null | undefined, max = 3): string {
  const list = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (list.length === 0) return "";
  const head = list.slice(0, max).join(" · ");
  return list.length > max ? `${head} +${list.length - max}` : head;
}

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
  /* [1026b] 방문일 줄 뒤에 시간대·날씨(입력한 것만) — 방문일이 비면 기존처럼 "—" */
  const visitLine = [input.visitDate.trim(), clean(input.timeSlot), clean(input.weather)].filter(Boolean).join(" · ");
  const purpose = clean(input.purpose);
  const satisfaction = typeof input.satisfaction === "number" && Number.isFinite(input.satisfaction) ? input.satisfaction : null;
  const tags = tagsLine(input.tags);
  const optional = (label: string, value: string): FinishSummaryRow[] => (value ? [{ label, value }] : []);
  return [
    { label: "단지", value: place },
    ...optional("타입", input.unit ? (unitSummary(input.unit) ?? "") : ""),
    { label: "방문일", value: input.visitDate.trim() ? visitLine : EMPTY },
    ...optional("목적", purpose),
    { label: "점수", value: scoresLine(input.scores) },
    ...optional("만족도", satisfaction != null ? `${Number(satisfaction.toFixed(1))} / 10` : ""),
    {
      label: "체크",
      value: input.checklistTotal > 0 ? `${input.checklistDone}/${input.checklistTotal}` : EMPTY,
    },
    { label: "사진", value: input.photoCount > 0 ? `${input.photoCount}장` : EMPTY },
    { label: "판단", value: input.decisionLabel?.trim() || EMPTY },
    ...optional("태그", tags),
    { label: "메모", value: memo || EMPTY },
  ];
}
