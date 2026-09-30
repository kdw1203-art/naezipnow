/* [1026b · 노트 쓰기] axisBars — 폰 2단계 5축 한 줄 막대(레이더와 같은 값). */
/* [1026 · 노트 쓰기] 미리보기·저장 완료 카드의 재료 — 5축 레이더 · 기록 점수 · 판정 칩 · 결론 한 줄. 순수 모듈.
 *
 * 규칙(1025 표준 2·3): 숫자는 화면이 이미 가진 값만 쓴다. 기록 점수는 상세(app/notes/[id]/page.tsx toView)와 같은 식 —
 * 입력한 축(>0)의 평균 × 20, 반올림. 한 축도 없으면 null("점수 미입력" — 0점으로 지어내지 않는다).
 * 레이더는 app/components/viz/ScoreRadar 의 0~100 척도를 쓴다: 축 점수(1~5) × 20, 미입력 축은 null(꼭짓점 없음).
 * 판정 칩 색은 세 가지뿐(좋음 = success · 보통 = primary · 주의 = warning) — 클래스는 화면(.tsx)이 고른다.
 *
 * 이 모듈은 지연 조각(레일·미리보기 카드)과 서버(노트 상세)만 부른다 — /notes/new 첫 로드에 싣지 않는다. */

import type { NoteScores } from "@/lib/notes/note-scores";
import { FINISH_AXES } from "@/lib/notes/finish-summary";
import { decisionLabel, type DecisionChoice } from "@/lib/inspection/decision";

export type PreviewTone = "good" | "normal" | "caution";

/** 상세 toView 와 같은 식 — 입력한 축 평균 × 20(반올림). 없으면 null */
export function noteTotalScore(scores: NoteScores): number | null {
  const vals = FINISH_AXES.map((a) => scores[a.key]).filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 20);
}

export type PreviewRadarItem = { key: string; label: string; score: number | null };

/** ScoreRadar 입력 — 5축 이름은 저장 전 요약과 같다(입지·학군·교통·시설·미래가치) */
export function previewRadarItems(scores: NoteScores): PreviewRadarItem[] {
  return FINISH_AXES.map((a) => {
    const v = scores[a.key];
    return { key: a.key, label: a.label, score: Number.isFinite(v) && v > 0 ? Math.round(v * 20) : null };
  });
}

/** [1026b · 노트 쓰기] 폰 2단계 "5축 점수" 한 줄 막대 — 축 점수(1~5) → 폭 %(×20)와 글자. 미입력 축(0)은 pct null · "—"(회색).
    값은 레이더와 같다(composeScoresFromChecks 결과 그대로 — 새 계산 없음). */
export type AxisBar = { key: string; label: string; pct: number | null; text: string };

export function axisBars(scores: NoteScores): AxisBar[] {
  return FINISH_AXES.map((a) => {
    const v = scores[a.key];
    const on = Number.isFinite(v) && v > 0;
    /* [1026b · 통합] 글자는 레이더(데스크톱 레일 "100점")와 같은 100점 단위 — 폰 "5" · 데스크톱 "100점"이 다른 말을 하지 않게 */
    const pct = on ? Math.max(0, Math.min(100, Math.round(v * 20))) : null;
    return { key: a.key, label: a.label, pct, text: pct === null ? "—" : String(pct) };
  });
}

/** 판단 → 칩 색. 살까 좋음 · 보류/다시 보기 보통 · 패스 주의 */
export function decisionTone(choice: DecisionChoice): PreviewTone {
  if (choice === "buy") return "good";
  if (choice === "pass") return "caution";
  return "normal";
}

/** 점수 → 칩(판단이 없을 때). 상세 판단 카드 띠와 같은 문턱(70 · 45) */
export function scoreTone(total: number): PreviewTone {
  if (total >= 70) return "good";
  if (total >= 45) return "normal";
  return "caution";
}

const TONE_WORD: Record<PreviewTone, string> = { good: "좋음", normal: "보통", caution: "주의" };

export type SavedCardInput = {
  aptName: string | null | undefined;
  /** 단지명이 없을 때 쓰는 노트 제목 */
  title: string;
  totalScore: number | null;
  decision: DecisionChoice | null;
  visitDate: string;
  checklistDone: number;
  checklistTotal: number;
  photoCount: number;
};

export type SavedCardView = {
  /** t-title 결론 한 줄 — "공작아파트 임장노트 · 점수 72 · 판단 살까" */
  headline: string;
  /** 판정 칩 하나 — 판단이 있으면 그 말, 없으면 점수 문턱(좋음·보통·주의). 점수도 없으면 null */
  chip: { label: string; tone: PreviewTone } | null;
  /** 근거 t-sub 한 줄 — 방문일 · 체크 · 사진(있는 것만) */
  facts: string;
};

export function savedCardView(i: SavedCardInput): SavedCardView {
  const name = (i.aptName ?? "").trim() || i.title.trim() || "임장";
  const score = i.totalScore == null ? "점수 미입력" : `점수 ${i.totalScore}`;
  const label = i.decision ? decisionLabel(i.decision) : null;
  const headline = `${name} 임장노트 · ${score}${label ? ` · 판단 ${label}` : ""}`;
  const chip = i.decision
    ? { label: label as string, tone: decisionTone(i.decision) }
    : i.totalScore != null
      ? { label: TONE_WORD[scoreTone(i.totalScore)], tone: scoreTone(i.totalScore) }
      : null;
  const facts = [
    i.visitDate.trim() ? `방문 ${i.visitDate.trim()}` : "",
    i.checklistTotal > 0 ? `체크 ${i.checklistDone}/${i.checklistTotal}` : "",
    i.photoCount > 0 ? `사진 ${i.photoCount}장` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { headline, chip, facts };
}

/** "같은 단지 다른 노트" — 내 회차가 둘 이상이면 회차 비교, 아니면 단지 홈(이 단지 임장노트 목록), 둘 다 없으면 null */
export function sameComplexLink(i: {
  noteId: string;
  visitCount: number;
  complexHref: string | null;
}): { href: string; label: string } | null {
  if (i.visitCount >= 2) {
    return { href: `/notes/compare?noteId=${encodeURIComponent(i.noteId)}`, label: `같은 단지 다른 노트 ${i.visitCount - 1}` };
  }
  if (i.complexHref) return { href: i.complexHref, label: "같은 단지 다른 노트" };
  return null;
}
