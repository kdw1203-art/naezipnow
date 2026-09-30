/* [1026b · 노트 쓰기] 작성 폼 보강의 순수 규칙 — 지연 조각(브리핑 카드 · 판단 카드 · 2·3단계 본문 · 이 단지 카드)만 부른다.
 *  · toggleTodoText      — 브리핑 "이 지역에서 특히 볼 것" 칩 → 고려사항 담기/빼기
 *  · memoHintsFor        — "메모에서 찾은 점검 제안"(2단계 · 3단계 메모 아래 같은 값) — 퀵모드 메모·음성 전사도 메모라 같이 계산된다
 *  · decisionMarketFromContext — 판단 제안이 이미 받는 인자(market)에 구 단위 조회 응답의 market 을 그대로 옮긴다
 *  · mergeRevisitSeed    — "지난 체크 불러오기" = ?revisit= 프리필과 같은 값을 **지금 입력 위에** 합친다(지금 것은 지우지 않는다)
 * 새 수치를 만들지 않는다 — 전부 폼 상태·이미 받은 응답을 옮기거나 합칠 뿐이다. `server-only`·React 를 import 하지 않는다. */

import { allKnownChecklistItems, type ChecklistGroupDef } from "@/lib/inspection/checklist";
import { checklistHintsFromVoice } from "@/lib/inspection/voice-checklist-keywords";
import type { DecisionMarket } from "@/lib/inspection/decision";
import type { RevisitPrefill } from "@/lib/inspection/revisit-prefill";

export type FormTodo = { text: string; level: "중요" | "보통" };
export type FormTagDef = { label: string; tone: "pos" | "neg" };

/** 고려사항 한 줄 상한 — NoteForm TODO_MAX 와 같은 수 */
export const TODO_TEXT_MAX = 80;

/** 이 글이 이미 고려사항에 있는가(담기 칩의 체크 표시) — toggleTodoText 와 같은 정규화 */
export function hasTodoText(items: readonly FormTodo[], raw: string): boolean {
  const text = raw.trim().slice(0, TODO_TEXT_MAX);
  return Boolean(text) && items.some((t) => t.text === text);
}

/** 목록에 있으면 빼고, 없으면 끝에 "보통"으로 담는다. added = 담았는가 */
export function toggleTodoText(items: readonly FormTodo[], raw: string): { items: FormTodo[]; added: boolean } {
  const text = raw.trim().slice(0, TODO_TEXT_MAX);
  if (!text) return { items: [...items], added: false };
  if (items.some((t) => t.text === text)) return { items: items.filter((t) => t.text !== text), added: false };
  return { items: [...items, { text, level: "보통" }], added: true };
}

/** 메모 → 체크리스트 제안. 지금 목적의 체크리스트에 있는 항목만(없는 항목은 눌러도 목록에 안 보인다) · 이미 체크한 것은 뺀다 */
export function memoHintsFor(
  memo: string,
  groups: readonly ChecklistGroupDef[],
  checked: Readonly<Record<string, boolean>>,
): Array<{ id: string; label: string }> {
  if (!memo.trim()) return [];
  const ids = new Set(groups.flatMap((g) => g.items.map((it) => it.id)));
  return checklistHintsFromVoice(memo).filter((h) => ids.has(h.id) && !checked[h.id]);
}

/**
 * 구 단위 조회(/api/inspection/public-data-context) 응답의 market → 판단 제안 인자. 받은 값만(전월비 · 전세가율),
 * 어느 지역 값인지(district)를 앞에 붙인다 — 단지 값처럼 읽히지 않게. 둘 다 없으면 null.
 */
export function decisionMarketFromContext(ctx: unknown): DecisionMarket | null {
  if (!ctx || typeof ctx !== "object") return null;
  const o = ctx as Record<string, unknown>;
  const m = o.market && typeof o.market === "object" ? (o.market as Record<string, unknown>) : null;
  if (!m) return null;
  const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const momPct = fin(m.saleChangeMonthly);
  const jeonseRatio = fin(m.jeonseRatio);
  if (momPct == null && jeonseRatio == null) return null;
  const area = typeof o.district === "string" && o.district.trim() ? o.district.trim() : null;
  return { momPct, jeonseRatio, area };
}

/* ── 지난 체크 불러오기 ─────────────────────────────────────────────── */

export type RevisitFormState = {
  visit: Record<string, string>;
  tags: string[];
  tagDefs: FormTagDef[];
  todoItems: FormTodo[];
  groupChecked: Record<string, boolean>;
};

/* NoteForm VISIT_GROUPS 의 유형·목적 선택지와 같은 값 — 옵션에 없는 값은 버린다(visitFromRevisit 와 같은 판정) */
const VISIT_OPTIONS: Record<string, readonly string[]> = {
  유형: ["아파트", "빌라", "오피스텔"],
  목적: ["실거주", "투자", "전월세", "갈아타기"],
};

/**
 * ?revisit= 프리필(buildRevisitPrefill 결과)을 지금 폼 위에 합친다 — 같은 항목을 잇되 지금 입력은 남긴다.
 *  · 유형·목적: 지난 노트 값(시간대는 잇지 않는다 — 프리필과 같다)
 *  · 태그: 지금 것 + 지난 것(없던 것만, 톤 그대로)
 *  · 고려사항: 지금 목록 + 지난 목록(없던 것만)
 *  · 체크리스트: 지난 완료 항목 위에 지금 값(지금 켜고 끈 것이 이긴다)
 * 사진·메모·현장 체크·만족도는 건드리지 않는다(이번 방문의 관찰이다).
 */
export function mergeRevisitSeed(cur: RevisitFormState, seed: RevisitPrefill): RevisitFormState {
  const visit = { ...cur.visit };
  const pick = (label: string, v: string | null) => {
    if (v && VISIT_OPTIONS[label]?.includes(v)) visit[label] = v;
  };
  pick("유형", seed.visit.propertyType);
  pick("목적", seed.visit.visitPurpose);

  const tags = [...cur.tags];
  const tagDefs = [...cur.tagDefs];
  for (const t of seed.tags) {
    if (!tags.includes(t.label)) tags.push(t.label);
    if (!tagDefs.some((d) => d.label === t.label)) tagDefs.push({ label: t.label, tone: t.tone });
  }

  const todoItems = [...cur.todoItems];
  for (const t of seed.todos) {
    if (!todoItems.some((x) => x.text === t.text)) todoItems.push({ text: t.text, level: t.level });
  }

  const byLabel = new Map(allKnownChecklistItems().map((it) => [it.label, it.id]));
  const fromSeed: Record<string, boolean> = {};
  for (const label of seed.checklistDone) {
    const id = byLabel.get(label);
    if (id) fromSeed[id] = true;
  }
  return { visit, tags, tagDefs, todoItems, groupChecked: { ...fromSeed, ...cur.groupChecked } };
}
