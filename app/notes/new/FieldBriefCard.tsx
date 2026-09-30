"use client";
/* [1026b · 노트 쓰기] "이 지역에서 특히 볼 것" — 누를 수 없던 라벨 → 칩 버튼: 누르면 고려사항 목록에 담고(끝에 "보통"),
   이미 있으면 체크 아이콘 · 다시 누르면 뺀다 + 토스트(lib/notes/form-extras toggleTodoText). 목록 상태는 NoteForm 이 든다. */

/**
 * [985 · 17] 현장 브리핑 카드 — 위치를 고른 뒤에만 나타난다.
 *
 * 왜 별도 파일 + next/dynamic 인가: 이 카드와 lib/inspection/field-brief.ts 를
 * NoteForm 에 직접 두면 /notes/new 초기 번들이 471KB 가 되어 예산(470KB)을 1KB
 * 넘겼다(실측). 예산을 올리지 않는다 — 필요한 시점(위치 확정)에만 받아 온다.
 * 위치를 안 고르면 이 코드는 내려오지도 않는다.
 *
 * 판정(무엇을 몇 줄까지 믿고 보여줄지)은 여기서 하지 않고 순수 모듈이 한다 —
 * 그 쪽에 단위 테스트가 붙어 있다.
 *
 * [1006] 면적 단위 — 설정(nz_area_unit 쿠키, lib/prefs/area-unit)이 평이면 "㎡당 매매"를
 * "평당 매매"로 적는다. 쿠키는 클라이언트에서만 읽는다(마운트 뒤) — 이 카드는 ssr:false
 * 지연 로드라 첫 렌더가 곧 클라이언트라 깜빡임이 없다.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { hasTodoText, toggleTodoText } from "@/lib/notes/form-extras";
import type { TodoItem } from "./NoteForm";
import { briefFetchedLabel, buildFieldBrief } from "@/lib/inspection/field-brief";
import { readAreaUnitCookie } from "@/lib/prefs/area-unit";
import type { AreaUnit } from "@/lib/prefs/ui-prefs";

export function FieldBriefCard({
  context,
  todoItems,
  setTodoItems,
}: {
  context: unknown;
  /** [1026b] 고려사항 목록(NoteForm 상태) — 칩이 담고 뺀다 */
  todoItems: TodoItem[];
  setTodoItems: Dispatch<SetStateAction<TodoItem[]>>;
}) {
  const { showToast } = useToast();
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("m2");
  useEffect(() => {
    setAreaUnit(readAreaUnitCookie());
  }, []);
  const brief = buildFieldBrief(context, { areaUnit });
  /* 아무것도 없으면 아무것도 그리지 않는다 — 빈 카드는 "조회했는데 없다"를
     "볼 게 없다"로 보이게 한다. */
  if (!brief) return null;
  const fetched = briefFetchedLabel(brief.fetchedAt);

  return (
    <div className="rise-in card flex flex-col gap-2.5 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-body font-bold text-ink">지금 이 지역은</span>
        {fetched && <span className="shrink-0 t-caption text-text-3">{fetched}</span>}
      </div>
      {brief.lines.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {brief.lines.map((l) => (
            <li key={l.key} className="flex gap-2 t-sub leading-[1.6]">
              <span className="shrink-0 font-bold text-primary">{l.label}</span>
              <span className="min-w-0 text-text-1">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {brief.checks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="t-caption font-bold text-text-3">이 지역에서 특히 볼 것</span>
          <div className="flex flex-wrap gap-1.5">
            {brief.checks.map((c) => {
              /* [1026b] 누르는 칩(24px · 폰 40px) — 담기/빼기. 담긴 것은 체크 아이콘 + 선택 칸 모양(한지 + 남색, 현장 체크 칸과 같은 세 토큰).
                 글이 길어 두 줄이 될 수 있어 .chip(한 줄 · 둥근 알약) 대신 8px 모서리 */
              const has = hasTodoText(todoItems, c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={has}
                  onClick={() => {
                    setTodoItems((prev) => toggleTodoText(prev, c).items);
                    showToast(has ? "고려사항에서 뺐어요" : "고려사항에 담았어요");
                  }}
                  className={`inline-flex min-h-6 max-w-full items-center gap-1 rounded-lg border px-2.5 py-1 text-left t-sub max-md:min-h-10 ${
                    has
                      ? "border-brand-hanji-ink bg-brand-hanji font-bold text-brand-hanji-ink"
                      : "border-line bg-surface font-semibold text-text-2"
                  }`}
                >
                  <Icon name={has ? "check" : "plus"} size={12} className="shrink-0" />
                  <span className="min-w-0">{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {brief.plans.length > 0 && (
        <div className="t-caption text-text-3">
          주변 공개 계획 ·{" "}
          {brief.plans.map((p) => `${p.title} ${p.count}건`).join(" · ")}
        </div>
      )}
    </div>
  );
}
