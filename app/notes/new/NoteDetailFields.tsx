"use client";

import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@/app/components/Icon";
import type { ChecklistGroupDef } from "@/lib/inspection/checklist";
import type { TagDef, TodoItem } from "./NoteForm";

/* ============================================================
   [996 · 4] 2단계 "더 자세히 적기" — 체크리스트(34)·메모 힌트·태그(16)·고려사항.

   NoteForm 에서 **그대로** 떼어 온 블록이다(마크업·클래스·open 기본 규칙 동일).
   왜 뗐나: /notes/new 첫 로드가 469KB 로 예산(470KB, 올리지 않는다)에 1KB 남았고,
   이번에 3단계에 판단 카드(DecisionStep)가 들어온다. 이 블록은 2단계에서 접힌
   <details> 안에 있어 첫 화면에 필요 없다 — next/dynamic 으로 2단계에 들어갔을 때만
   내려받는다. 상태와 세터는 전부 NoteForm 이 들고 있어(임시저장·저장 페이로드가
   그쪽에 있다) 여기는 그리기만 한다: 단계를 오가며 언마운트돼도 입력이 남는다.
   ============================================================ */

export type NoteDetailFieldsProps = {
  checklistGroups: ChecklistGroupDef[];
  groupChecked: Record<string, boolean>;
  setGroupChecked: Dispatch<SetStateAction<Record<string, boolean>>>;
  openGroups: Record<string, boolean>;
  setOpenGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  templateSuggestedIds: Set<string>;
  memoHints: Array<{ id: string; label: string }>;
  setMemoHints: Dispatch<SetStateAction<Array<{ id: string; label: string }>>>;
  /** visit["목적"] — 체크리스트 제목의 "목적(실거주)" */
  visitPurpose: string | undefined;
  tags: string[];
  tagDefs: TagDef[];
  toggleTag: (label: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tagInputOpen: boolean;
  setTagInputOpen: Dispatch<SetStateAction<boolean>>;
  submitCustomTag: () => void;
  tagMax: number;
  todoItems: TodoItem[];
  doneTodos: string[];
  toggleTodo: (text: string) => void;
  todoInput: string;
  setTodoInput: (v: string) => void;
  todoInputOpen: boolean;
  setTodoInputOpen: Dispatch<SetStateAction<boolean>>;
  submitTodo: () => void;
  todoMax: number;
};

export function NoteDetailFields({
  checklistGroups,
  groupChecked,
  setGroupChecked,
  openGroups,
  setOpenGroups,
  templateSuggestedIds,
  memoHints,
  setMemoHints,
  visitPurpose,
  tags,
  tagDefs,
  toggleTag,
  tagInput,
  setTagInput,
  tagInputOpen,
  setTagInputOpen,
  submitCustomTag,
  tagMax,
  todoItems,
  doneTodos,
  toggleTodo,
  todoInput,
  setTodoInput,
  todoInputOpen,
  setTodoInputOpen,
  submitTodo,
  todoMax,
}: NoteDetailFieldsProps) {
  return (
    /* [993] 2단계의 나머지 — 체크리스트(34)·태그(16)·고려사항(5)은 "같은 질문의 다른 형식"
       이라 기본 화면에서 접는다. 필수는 위치 하나이고, 현장 체크 9칸 + 만족도만으로도
       5축 점수·판단 카드가 만들어진다(lib/notes/note-scores). 열면 예전 그대로다. */
    <details
      className="rise-in-3 card p-4"
      open={
        checklistGroups.some((g) => g.items.some((it) => groupChecked[it.id])) ||
        tags.length > 0
      }
    >
      <summary className="cursor-pointer t-body font-extrabold text-ink">
        더 자세히 적기 <span className="t-sub font-medium text-text-3">(선택 · 체크리스트 · 태그 · 고려사항)</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {/* 카테고리별 현장 체크리스트 (입지·단지·내부·학군·생활·호재) */}
        <div className="flex flex-col gap-2">
          <div className="t-body font-extrabold text-ink">
            체크리스트{" "}
            <span className="t-sub font-medium text-text-3">
              목적({visitPurpose || "실거주"})에 맞춰 항목이 바뀝니다 ·{" "}
              {checklistGroups.reduce(
                (n, g) => n + g.items.filter((it) => groupChecked[it.id]).length,
                0,
              )}
              개 체크
              {templateSuggestedIds.size > 0
                ? ` · 템플릿 추천 ${templateSuggestedIds.size}`
                : ""}
            </span>
          </div>
          {memoHints.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-primary/20 bg-primary-soft/40 px-3 py-2.5">
              <div className="t-sub font-bold text-primary">
                메모에서 찾은 점검 제안
              </div>
              <div className="flex flex-wrap gap-1.5">
                {memoHints.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setGroupChecked((prev) => ({ ...prev, [h.id]: true }));
                      setMemoHints((prev) => prev.filter((x) => x.id !== h.id));
                      const group = checklistGroups.find((g) =>
                        g.items.some((it) => it.id === h.id),
                      );
                      if (group) {
                        setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
                      }
                    }}
                    className="rounded-full border border-primary/30 bg-surface px-2.5 py-1 t-sub font-bold text-primary"
                  >
                    ＋ {h.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {checklistGroups.map((g) => {
            const open = openGroups[g.id] ?? false;
            const doneCount = g.items.filter((it) => groupChecked[it.id]).length;
            return (
              <div key={g.id} className="rounded-xl border border-line bg-bg/60">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [g.id]: !open }))
                  }
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="t-body font-bold text-ink">{g.title}</span>
                  <span className="t-sub font-semibold text-text-3">
                    {doneCount}/{g.items.length} {open ? "▴" : "▾"}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1 border-t border-line px-2 py-2">
                    {g.items.map((it) => {
                      const checked = Boolean(groupChecked[it.id]);
                      const suggested = templateSuggestedIds.has(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() =>
                            setGroupChecked((prev) => ({
                              ...prev,
                              [it.id]: !prev[it.id],
                            }))
                          }
                          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                        >
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[12px] ${
                              checked
                                ? "bg-primary text-white"
                                : "border-[1.5px] border-line-strong bg-surface"
                            }`}
                          >
                            {checked ? "✓" : ""}
                          </span>
                          <span
                            className={`flex-1 text-[13px] ${
                              checked ? "font-semibold text-ink" : "text-text-1"
                            }`}
                          >
                            {it.label}
                            {suggested && !checked && (
                              <span className="ml-1.5 t-caption font-bold text-primary">
                                템플릿 추천
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 눈에 띈 점 태그 */}
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          <div className="t-body font-extrabold text-ink">
            눈에 띈 점{" "}
            <span className="t-sub font-medium text-text-3">
              탭해서 태그 추가 (예: 초품아 · 이중주차)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagDefs.map((t) => {
              const active = tags.includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggleTag(t.label)}
                  className={`chip rounded-full px-3 py-1.5 text-xs ${
                    active
                      ? t.tone === "neg"
                        ? "bg-danger-soft font-bold text-danger"
                        : "bg-[rgba(29,79,216,.1)] font-bold text-primary"
                      : "border border-line bg-surface text-text-2"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {t.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTagInputOpen((v) => !v)}
              aria-expanded={tagInputOpen}
              className="chip rounded-full bg-bg px-3 py-1.5 text-xs text-text-3"
            >
              ＋ 직접 입력
            </button>
          </div>
          {/* [967 · 7] 인라인 태그 입력 — Enter 추가 · Esc 닫기 */}
          {tagInputOpen && (
            <div className="flex items-center gap-2">
              <input
                id="note-tag-input"
                type="text"
                autoFocus
                value={tagInput}
                maxLength={tagMax}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 무시
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCustomTag();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTagInput("");
                    setTagInputOpen(false);
                  }
                }}
                placeholder="예: 조용한 단지"
                aria-label="추가할 태그"
                /* [968 · 29] Enter = 추가 — 자판에도 "완료" 로 보인다 */
                enterKeyHint="done"
                className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus:border-primary"
              />
              <button
                type="button"
                onClick={submitCustomTag}
                disabled={!tagInput.trim()}
                className="btn-soft min-h-[40px] shrink-0 rounded-lg px-3 t-sub font-bold disabled:opacity-60"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setTagInput("");
                  setTagInputOpen(false);
                }}
                aria-label="태그 입력 닫기"
                className="tap grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-3"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 고려사항 — 추가 확인 항목 (중요/보통) */}
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          <div className="t-body font-extrabold text-ink">
            고려사항{" "}
            <span className="t-sub font-medium text-text-3">
              결정 전 꼭 확인할 것 · 중요도 표시
            </span>
          </div>
          {todoItems.map((todo) => {
            const done = doneTodos.includes(todo.text);
            return (
              <button
                key={todo.text}
                type="button"
                onClick={() => toggleTodo(todo.text)}
                className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-[11px] text-left"
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[12px] ${
                    done
                      ? "bg-primary text-white"
                      : "border-[1.5px] border-line-strong bg-surface"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  className={`flex-1 text-[13px] ${
                    done ? "text-text-3 line-through" : "text-text-1"
                  }`}
                >
                  {todo.text}
                </span>
                <span
                  className={`rounded-full chip-pad text-[10px] font-bold ${
                    todo.level === "중요"
                      ? "bg-danger-soft text-danger"
                      : "bg-bg text-text-2"
                  }`}
                >
                  {todo.level}
                </span>
              </button>
            );
          })}
          {/* [967 · 7] 인라인 고려사항 입력 — Enter 추가 · Esc 닫기 */}
          {todoInputOpen ? (
            <div className="flex items-center gap-2">
              <input
                id="note-todo-input"
                type="text"
                autoFocus
                value={todoInput}
                maxLength={todoMax}
                onChange={(e) => setTodoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitTodo();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTodoInput("");
                    setTodoInputOpen(false);
                  }
                }}
                placeholder="예: 저녁 시간대 주차 상황 확인"
                aria-label="추가할 고려사항"
                /* [968 · 29] Enter = 추가 — 자판에도 "완료" 로 보인다 */
                enterKeyHint="done"
                className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus:border-primary"
              />
              <button
                type="button"
                onClick={submitTodo}
                disabled={!todoInput.trim()}
                className="btn-soft min-h-[40px] shrink-0 rounded-lg px-3 t-sub font-bold disabled:opacity-60"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setTodoInput("");
                  setTodoInputOpen(false);
                }}
                aria-label="고려사항 입력 닫기"
                className="tap grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-3"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setTodoInputOpen(true)}
              aria-expanded={false}
              className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-strong px-3 py-[11px] t-body text-text-3"
            >
              ＋ 고려사항 추가
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
