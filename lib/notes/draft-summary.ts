/**
 * 임장노트 임시저장(draft) 요약 읽기 — 홈 "이어서 보기" 패널용 (고도화 8·21).
 *
 * 저장은 NoteForm(작성 화면)만 한다. 여기서는 **읽기만** — 홈에서 "작성 중인
 * 노트가 있다"는 사실을 알려 복귀 동선을 만들기 위해서다. 키 문자열이 두 파일에
 * 흩어지면 한쪽 변경 시 홈 배너가 조용히 죽으므로 키는 여기 한 곳에만 둔다.
 *
 * 브라우저 전용(localStorage) — useEffect/핸들러 안에서만 부를 것.
 */

import { isNoteLevel, type NoteLevel } from "@/lib/notes/note-scores";
import type { DecisionChoice } from "@/lib/inspection/decision";

export const NOTE_DRAFT_KEY = "nz_note_draft";

/* [967 · 9] 작성/수정 임시저장 키 분리.
   수정 모드도 같은 nz_note_draft 를 쓰면 (a) 홈 "이어서 쓰기" 배너가 남의 노트
   수정 중 내용을 새 노트 초안으로 안내하고 (b) 노트 A 를 고치다 만 내용이
   노트 B 의 편집 화면에 복원된다. 새 노트는 예전 키 그대로(홈 배너 호환),
   수정은 노트 id 별 키를 쓴다. */
export function noteDraftKey(editId: string | null | undefined): string {
  const id = typeof editId === "string" ? editId.trim() : "";
  return id ? `${NOTE_DRAFT_KEY}:edit:${id}` : NOTE_DRAFT_KEY;
}

/* [967 · 10] 수정 모드 초안이 "복원할 가치가 있는가" — 노트가 마지막으로
   저장된 뒤에 적힌 초안만. 다른 기기에서 그 뒤에 노트를 고쳤다면 이 초안은
   낡은 것이라 배너를 띄우지 않는다. updatedAt 을 모르면(구버전 응답) 초안을
   믿는다 — 잃는 쪽보다 한 번 더 묻는 쪽이 싸다. */
export function isDraftNewerThan(
  draftSavedAt: string,
  noteUpdatedAt: string | null | undefined,
): boolean {
  const d = Date.parse(draftSavedAt);
  if (!Number.isFinite(d)) return false;
  if (!noteUpdatedAt) return true;
  const u = Date.parse(noteUpdatedAt);
  if (!Number.isFinite(u)) return true;
  return d > u;
}

/* [967 · 10] 키 순서에 무관한 직렬화 — 초안(파싱 결과)과 폼 상태의 객체 키
   순서가 달라도 "내용이 같다"를 같다고 판정하기 위해. undefined 값은 JSON 과
   같이 생략한다. */
export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        if (o[k] === undefined) continue;
        out[k] = walk(o[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/* ===== [1005 · A3] 초안 스키마·파싱·비교 — NoteForm 에서 내려온 순수 부분 =====
   왜 여기로: 1초 자동 저장 effect 가 buildDraft 와 **다른** 객체를 손으로 만들어
   판단(decision)이 빠졌고, 고려사항(todoItems)은 스키마에 아예 없었다 — 새로고침
   한 번에 3단계 판단과 직접 적은 고려사항이 사라졌다. 파싱·비교를 여기 두면
   node:test 가 왕복(build → parse)을 검증한다. 동작은 NoteForm 의 것과 같다. */

export type NoteDraftLocation = {
  aptName: string;
  region: string;
  complexId: string | null;
  lat: number | null;
  lng: number | null;
};

export type NoteDraftTodo = { text: string; level: "중요" | "보통" };

export type NoteDraftDecision = { choice: DecisionChoice; reasons: string[] };

export type NoteDraft = {
  v: 1;
  savedAt: string;
  checks: Record<string, NoteLevel>;
  visit: Record<string, string>;
  tags: string[];
  doneTodos: string[];
  /** [970 · B-10] null = 미입력(기본). 예전 초안의 숫자는 그대로 읽는다 */
  satisfaction: number | null;
  memo: string;
  /* 선택 필드(구버전 드래프트 호환) */
  loc?: NoteDraftLocation;
  photos?: string[];
  isPublic?: boolean;
  /** 카테고리 체크리스트 항목 id → 체크 여부 */
  groupChecked?: Record<string, boolean>;
  weather?: string;
  /** 모바일8 — 체크리스트 섹션 접기 상태(그룹 id → 열림) */
  openGroups?: Record<string, boolean>;
  /** [967 · 2] 방문일(YYYY-MM-DD) — 사진 촬영일로 채운 값도 여기 남는다 */
  visitDate?: string;
  /** [999] 3단계 판단(살까·보류·패스·다시 보기)과 근거 */
  decision?: NoteDraftDecision;
  /** [1005 · A3] 고려사항 목록(직접 추가한 것 포함) — 없으면 폼 기본값 유지 */
  todoItems?: NoteDraftTodo[];
};

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const DECISION_CHOICES: readonly string[] = ["buy", "hold", "pass", "revisit"];

function parseDecision(v: unknown): NoteDraftDecision | undefined {
  const d = v as { choice?: unknown; reasons?: unknown } | null | undefined;
  if (!d || typeof d !== "object") return undefined;
  if (typeof d.choice !== "string" || !DECISION_CHOICES.includes(d.choice)) return undefined;
  return {
    choice: d.choice as DecisionChoice,
    reasons: isStringArray(d.reasons) ? d.reasons.slice(0, 3) : [],
  };
}

function parseTodoItems(v: unknown): NoteDraftTodo[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: NoteDraftTodo[] = [];
  const seen = new Set<string>();
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ text, level: o.level === "중요" ? "중요" : "보통" });
    if (out.length >= 60) break;
  }
  return out;
}

function boolMap(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "boolean") out[k] = val;
    }
  }
  return out;
}

/** localStorage 문자열 → 초안. 형식이 어긋나면 null(복원 배너를 띄우지 않는다). */
export function parseDraft(raw: string | null): NoteDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (
      typeof o.savedAt !== "string" ||
      typeof o.memo !== "string" ||
      (typeof o.satisfaction !== "number" && o.satisfaction !== null) ||
      !o.checks ||
      typeof o.checks !== "object" ||
      !o.visit ||
      typeof o.visit !== "object" ||
      !isStringArray(o.tags) ||
      !isStringArray(o.doneTodos)
    ) {
      return null;
    }
    const checks: Record<string, NoteLevel> = {};
    for (const [k, val] of Object.entries(o.checks as Record<string, unknown>)) {
      if (isNoteLevel(val)) checks[k] = val;
    }
    const visit: Record<string, string> = {};
    for (const [k, val] of Object.entries(o.visit as Record<string, unknown>)) {
      if (typeof val === "string") visit[k] = val;
    }
    let loc: NoteDraftLocation | undefined;
    if (o.loc && typeof o.loc === "object") {
      const l = o.loc as Record<string, unknown>;
      if (typeof l.aptName === "string" && typeof l.region === "string") {
        loc = {
          aptName: l.aptName,
          region: l.region,
          complexId: typeof l.complexId === "string" ? l.complexId : null,
          lat: typeof l.lat === "number" ? l.lat : null,
          lng: typeof l.lng === "number" ? l.lng : null,
        };
      }
    }
    const groupChecked = boolMap(o.groupChecked);
    const openGroups = boolMap(o.openGroups);
    return {
      v: 1,
      savedAt: o.savedAt,
      checks,
      visit,
      tags: o.tags,
      doneTodos: o.doneTodos,
      satisfaction: typeof o.satisfaction === "number" ? o.satisfaction : null,
      memo: o.memo,
      loc,
      photos: isStringArray(o.photos) ? o.photos : undefined,
      isPublic: typeof o.isPublic === "boolean" ? o.isPublic : undefined,
      groupChecked: Object.keys(groupChecked).length ? groupChecked : undefined,
      weather: typeof o.weather === "string" ? o.weather : undefined,
      openGroups: Object.keys(openGroups).length ? openGroups : undefined,
      visitDate:
        typeof o.visitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.visitDate)
          ? o.visitDate
          : undefined,
      decision: parseDecision(o.decision),
      todoItems: parseTodoItems(o.todoItems),
    };
  } catch {
    return null;
  }
}

/* [967 · 10] 초안 ↔ 폼 상태 "내용이 같은가" 비교용 정규형. 저장 시각·접기 상태
   같은 표시용 필드는 뺀다 — 그것만 달라진 초안을 복원하라고 묻는 건 소음이다.
   [1005 · A3] 판단·고려사항도 내용이다 — 그것만 바뀐 초안도 복원 대상. */
export type DraftComparable = Omit<NoteDraft, "v" | "savedAt" | "openGroups">;

export function draftComparable(d: DraftComparable): string {
  return stableStringify({
    checks: d.checks,
    visit: d.visit,
    tags: d.tags,
    doneTodos: d.doneTodos,
    satisfaction: d.satisfaction,
    memo: d.memo,
    loc: d.loc ?? null,
    photos: d.photos ?? [],
    isPublic: d.isPublic ?? false,
    /* 끄면 false 로 남는 키가 있어 "켜진 것"만 센다 — 켰다 끈 항목은 안 바뀐 것 */
    groupChecked: Object.entries(d.groupChecked ?? {})
      .filter(([, on]) => on)
      .map(([k]) => k)
      .sort(),
    weather: d.weather ?? "",
    visitDate: d.visitDate ?? "",
    decision: d.decision ?? null,
    todoItems: d.todoItems ?? [],
  });
}

/** [967 · 4] "HH:MM" — 저장 바·복구 배너의 시각 표기 */
export function clockLabel(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface NoteDraftSummary {
  /** 마지막 자동 저장 시각 (ISO) */
  savedAt: string;
  /** 작성 중이던 단지명 (없으면 null) */
  aptName: string | null;
  /** 작성 중이던 지역 (없으면 null) */
  region: string | null;
}

/**
 * 유효한 임시저장이 있으면 요약을, 없거나 형식이 깨졌으면 null.
 * 검증은 NoteForm.parseDraft 의 부분집합만 한다 — 여기서 필요한 건
 * "복구 가능한 드래프트가 존재한다"는 사실과 표시용 두 필드뿐이다.
 */
export function readNoteDraftSummary(): NoteDraftSummary | null {
  try {
    const raw = window.localStorage.getItem(NOTE_DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (typeof o.savedAt !== "string" || !o.savedAt) return null;
    const loc =
      o.loc && typeof o.loc === "object" ? (o.loc as Record<string, unknown>) : null;
    const aptName =
      loc && typeof loc.aptName === "string" && loc.aptName.trim()
        ? loc.aptName.trim()
        : null;
    const region =
      loc && typeof loc.region === "string" && loc.region.trim()
        ? loc.region.trim()
        : null;
    return { savedAt: o.savedAt, aptName, region };
  } catch {
    return null; // 파싱 실패·프라이빗 모드 — 배너를 띄우지 않는다
  }
}
