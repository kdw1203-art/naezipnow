/**
 * [995 · 3] 재방문 프리필 — 이전 회차 노트 → 새 노트 폼의 시작값(순수 함수).
 *
 * 왜: 같은 단지를 두 번째 볼 때 위치·태그·체크리스트를 처음부터 다시 골라야 했다.
 * 상세의 "재방문" CTA 는 apt·region 두 글자만 넘겨서 단지 id·좌표·목적·태그가
 * 전부 빠졌고, 회차(round)를 잇는 정보도 없었다.
 *
 * 무엇을 이어받고 무엇을 새로 적는가는 판단이라 여기 둔다(NoteForm.tsx 는
 * "use client" + next/dynamic 이라 node:test 가 못 부른다).
 *  · 이어받음: 위치(단지 id·좌표) · 태그(장점·단점) · 유형·목적 · 체크리스트 완료 항목 ·
 *              고려사항 **목록**(완료 표시는 뺀다 — 다시 확인하라고 적어 둔 것들이다)
 *  · 새로 적음: 사진·메모·요약·제목·날씨·시간대·현장 체크 9항목·만족도 — 이번 방문의
 *              관찰이다. 지난 값을 채워 두면 안 본 것을 본 것처럼 저장하게 된다.
 *  · 읽기 전용: 지난 현장 체크(previousChecks)·축 점수·방문일 — 화면에 비교용으로만 보인다.
 *
 * `server-only`·React 를 import 하지 않는다(순수 lib · 테스트 러너).
 */
import { allKnownChecklistItems } from "@/lib/inspection/checklist";
import { checksFromSavedNote, type NoteLevel, type NoteScores } from "@/lib/notes/note-scores";

/** NoteFormInitialNote(app/notes/new/NoteForm) 와 구조적으로 호환되는 최소 형태 */
export type RevisitSourceNote = {
  id: string;
  region: string;
  aptName: string | null;
  visitDate: string;
  scores: NoteScores;
  checklist: { label: string; done: boolean }[];
  sections: { pros?: string; cons?: string; memo?: string };
  metadata?: Record<string, unknown> | null;
};

export type RevisitTag = { label: string; tone: "pos" | "neg" };
export type RevisitTodo = { text: string; level: "중요" | "보통" };

export type RevisitPrefill = {
  region: string;
  aptName: string;
  complexId: string | null;
  lat: number | null;
  lng: number | null;
  /** 장점(pos)·단점(neg) 태그 — 폼이 sections.pros/cons 에 " · " 로 적는 것을 되읽는다 */
  tags: RevisitTag[];
  /** 방문 정보 — 폼이 metadata 에 쓰는 키 그대로. 시간대(visitTimeSlot)는 일부러 뺀다:
      재방문은 다른 시간대에 오는 일이라 지금 시각이 더 맞는 기본값이다. */
  visit: { propertyType: string | null; visitPurpose: string | null };
  /** 카테고리 체크리스트 중 완료(done)였던 **알려진** 항목 라벨 */
  checklistDone: string[];
  /** 커스텀 고려사항 — 목록만 잇고 완료 표시는 잇지 않는다 */
  todos: RevisitTodo[];
  /** 지난 현장 체크 9항목(좋음·보통·아쉬움) — 읽기 전용 표시용 */
  previousChecks: Record<string, NoteLevel>;
  previousScores: NoteScores;
  previousVisitDate: string;
  /** [1006] "3개월 전" — 지난 방문일과 오늘의 거리(달력 기준). 못 읽으면 null */
  previousAgoLabel: string | null;
  previousNoteId: string;
  /** 이전 노트의 회차(없으면 1) 와 이번 회차 */
  previousRound: number;
  round: number;
  /** 이번 방문일 — 호출부가 준 오늘 */
  visitDate: string;
  /** 새로 적는 것들 — 계약을 눈에 보이게 비워 둔다 */
  memo: string;
  photos: string[];
};

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = meta?.[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** 폼의 태그 직렬화(" · " 구분)를 되읽는다 — NoteForm.splitTagText 와 같은 규칙 */
function splitTagText(s?: string): string[] {
  return (s ?? "")
    .split("·")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * [1006] 지난 방문일 → "오늘 · 어제 · N일 전 · N개월 전 · N년 전". 재방문 배너가 "언제 기록과
 * 비교하는지"를 날짜만 적으면 현장에서 셈을 해야 한다. 둘 다 YYYY-MM-DD(달력 날짜)라
 * UTC 자정으로 읽어 시간대에 흔들리지 않게 한다. 미래 날짜·깨진 값은 null(문구를 뺀다).
 */
export function visitAgoLabel(prevIso: string, todayIso: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}/;
  if (!re.test(prevIso) || !re.test(todayIso)) return null;
  const a = Date.parse(`${prevIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return null;
  const days = Math.round((b - a) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 30) return `${days}일 전`;
  /* 달 수는 달력으로 센다(30일 나누기가 아니라) — 1월 31일 → 3월 1일은 1개월 전 */
  const pa = new Date(a);
  const pb = new Date(b);
  let months = (pb.getUTCFullYear() - pa.getUTCFullYear()) * 12 + (pb.getUTCMonth() - pa.getUTCMonth());
  if (pb.getUTCDate() < pa.getUTCDate()) months -= 1;
  if (months < 1) return `${days}일 전`;
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

/** 이전 노트의 회차 — 정수 1 이상만 믿는다. 없거나 깨졌으면 1회차였던 것으로 본다. */
export function previousRoundOf(meta: Record<string, unknown> | null | undefined): number {
  const n = metaNumber(meta, "round");
  return n != null && Number.isInteger(n) && n >= 1 ? n : 1;
}

export function buildRevisitPrefill(prev: RevisitSourceNote, todayIso: string): RevisitPrefill {
  const meta = prev.metadata ?? null;
  const lat = metaNumber(meta, "lat");
  const lng = metaNumber(meta, "lng");

  /* 태그: pros 는 장점, cons 는 단점. 같은 라벨이 양쪽에 있으면 먼저 온 쪽(장점)만 */
  const tags: RevisitTag[] = [];
  const seenTag = new Set<string>();
  for (const label of splitTagText(prev.sections.pros)) {
    if (seenTag.has(label)) continue;
    seenTag.add(label);
    tags.push({ label, tone: "pos" });
  }
  for (const label of splitTagText(prev.sections.cons)) {
    if (seenTag.has(label)) continue;
    seenTag.add(label);
    tags.push({ label, tone: "neg" });
  }

  /* 체크리스트: 알려진 항목(카테고리 체크리스트)은 완료 상태를 잇고, 나머지(커스텀
     고려사항)는 목록만 — 완료 표시는 이번 방문에서 다시 확인하고 누르게 둔다. */
  const known = new Set(allKnownChecklistItems().map((it) => it.label));
  const levels =
    meta?.todoLevels && typeof meta.todoLevels === "object"
      ? (meta.todoLevels as Record<string, unknown>)
      : {};
  const checklistDone: string[] = [];
  const todos: RevisitTodo[] = [];
  const seenTodo = new Set<string>();
  for (const c of prev.checklist ?? []) {
    const label = typeof c?.label === "string" ? c.label.trim() : "";
    if (!label) continue;
    if (known.has(label)) {
      if (c.done && !checklistDone.includes(label)) checklistDone.push(label);
      continue;
    }
    if (seenTodo.has(label)) continue;
    seenTodo.add(label);
    todos.push({ text: label, level: levels[label] === "중요" ? "중요" : "보통" });
  }

  const previousRound = previousRoundOf(meta);
  return {
    region: prev.region.trim(),
    aptName: (prev.aptName ?? "").trim(),
    complexId: metaString(meta, "complexId"),
    /* 0,0 은 좌표가 아니라 "없음"이다(폼의 URL 프리필과 같은 판정) */
    lat: lat != null && lat !== 0 ? lat : null,
    lng: lng != null && lng !== 0 ? lng : null,
    tags,
    visit: {
      propertyType: metaString(meta, "propertyType"),
      visitPurpose: metaString(meta, "visitPurpose"),
    },
    checklistDone,
    todos,
    previousChecks: checksFromSavedNote(meta?.fieldRatings, prev.scores),
    previousScores: { ...prev.scores },
    previousVisitDate: prev.visitDate.slice(0, 10),
    previousAgoLabel: visitAgoLabel(prev.visitDate, todayIso),
    previousNoteId: prev.id,
    previousRound,
    round: previousRound + 1,
    visitDate: todayIso,
    memo: "",
    photos: [],
  };
}

/* [995] 지난 체크 띠(previousCheckChips)는 lib/inspection/revisit-chips.ts 로 — 작성 폼 번들이
   이 모듈(체크리스트 카탈로그·점수 규칙까지 딸려 온다)을 통째로 싣지 않게. 여기서는 재수출만. */
export { PREVIOUS_CHECKS_MAX, previousCheckChips } from "@/lib/inspection/revisit-chips";
