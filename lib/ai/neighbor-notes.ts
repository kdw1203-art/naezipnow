/**
 * [1008 · W] 이웃 임장노트 요약 — **사람이 쓴 공개 노트만** 센다(순수 함수 · 테스트 대상).
 *
 * 왜(1008 리뷰 A-1, 운영 DB 실측 2026-09-21): 공개 inspection_notes 30건이 전부 author_label
 * "내집나우 Lab…"(운영진 예시 글)이고 사람 글은 0건이다. 1008 에서 점수 열 오류를 고치자 Lab 노트가
 * "이웃 임장노트 · 이웃 평가"로 종합 점수(레이더)·숫자 칸·노트 초안 근거에 섞였다(헬리오시티 이웃 평가
 * 72점 — 예시 글 한 편의 점수). "이웃"이라고 부르려면 이웃이 쓴 것이어야 한다.
 * 판정은 노트 화면과 같은 lib/notes/author-label.ts 의 isLabAuthor. 남는 게 없으면 null(축 없음).
 */
import { isLabAuthor } from "@/lib/notes/author-label";

export interface NoteRowLite {
  id: string | number;
  title: string | null;
  author_label: string | null;
  created_at: string | null;
  score_location?: number | null;
  score_school?: number | null;
  score_transport?: number | null;
  score_facility?: number | null;
  score_future?: number | null;
}

export interface NeighborNotesSummary {
  count: number;
  avgScore: number | null;
  latest: { id: string; title: string } | null;
  source: string;
  asOf: string | null;
  sample: number;
  href: string;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 입력된 축(>0)만 평균 — lib/inspection/store-db 의 inspectionAverageScore 와 같은 규칙
    (그 모듈은 서버 전용 클라이언트를 import 해 테스트에서 못 부른다). 축이 없으면 0 */
function noteAverage(r: NoteRowLite): number {
  const axes = [r.score_location, r.score_school, r.score_transport, r.score_facility, r.score_future]
    .map(n)
    .filter((v) => v > 0);
  return axes.length ? axes.reduce((a, b) => a + b, 0) / axes.length : 0;
}

/** 최신순 행 → 사람 글 요약. Lab(운영진 예시) 글은 빼고, 남는 게 없으면 null */
export function summarizeNeighborNotes(
  rows: readonly NoteRowLite[] | null | undefined,
  scope: "complex" | "region",
): NeighborNotesSummary | null {
  const human = (rows ?? []).filter((r) => !isLabAuthor(r.author_label));
  if (human.length === 0) return null;
  const scores = human.map(noteAverage).filter((s) => s > 0);
  const first = human[0];
  return {
    count: human.length,
    avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    latest: { id: String(first.id), title: String(first.title ?? "") },
    source: scope === "complex" ? "이웃 공개 임장노트(이 단지)" : "이웃 공개 임장노트(이 지역)",
    asOf: first.created_at ? String(first.created_at).slice(0, 10) : null,
    sample: scores.length,
    href: "/notes",
  };
}
