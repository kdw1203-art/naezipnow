"use client";

/* [981] 도구별 보정 입력 폼 — **열릴 때만** 내려받는다.
   이 라우트의 First Load 예산은 480KB 이고 본체가 이미 479KB 다. 폼 JSX(선택
   상자·여러 줄 입력·숫자 칸 세 갈래)를 본체에 두면 그 자리에서 예산이 깨진다.
   데이터가 준비된 뒤에만 마운트되므로(WorkbenchClient 의 `ready` 분기),
   next/dynamic 이 실제로 그 시점에 받아 온다 — 975 에서 지도 서랍에 쓴 것과 같은 규칙.

   폼이 묻는 값은 전부 lib/ai/analysis-engine.ts 가 실제로 읽는 필드다
   (lib/ai/tool-tuning-fields.ts · tests/unit/tool-tuning-981.test.ts). */

import type { TuningField } from "@/lib/ai/tool-tuning";

export function TuningForm({
  fields,
  characterLabel,
  value,
  onChange,
}: {
  fields: readonly TuningField[];
  /** 도구 성격 한 낱말 — "심사에 쓸 값" 처럼 머리글에 들어간다 */
  characterLabel: string;
  value: Record<string, string | boolean>;
  onChange: (next: Record<string, string | boolean>) => void;
}) {
  if (fields.length === 0) return null;
  const tuning = value;
  const setTuning = (fn: (p: Record<string, string | boolean>) => Record<string, string | boolean>) =>
    onChange(fn(value));
  return (
    <div className="mt-3 flex flex-col gap-1.5">
            <span className="t-sub font-extrabold text-text-2">
              {characterLabel}에 쓸 값 <span className="font-bold text-text-3">— 전부 선택 사항</span>
            </span>
            <div className="flex flex-wrap items-end gap-3">
              {fields.map((f) => {
                if (f.kind === "toggle") {
                  return (
                    <label key={f.key} className="flex items-center gap-1.5 pb-2 t-sub font-bold text-text-2">
                      <input
                        type="checkbox"
                        checked={tuning[f.key] === true}
                        onChange={(e) => setTuning((p) => ({ ...p, [f.key]: e.target.checked }))}
                      />
                      {f.label}
                    </label>
                  );
                }
                if (f.kind === "select") {
                  return (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="t-sub font-bold text-text-3">{f.label}</span>
                      <select
                        value={typeof tuning[f.key] === "string" ? (tuning[f.key] as string) : ""}
                        onChange={(e) => setTuning((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="rounded-[10px] border border-line bg-surface px-3 py-2 t-body font-semibold text-ink outline-none focus:border-primary"
                      >
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {f.hint && <span className="t-caption text-text-3">{f.hint}</span>}
                    </label>
                  );
                }
                if (f.kind === "textarea") {
                  return (
                    <label key={f.key} className="flex min-w-[220px] flex-1 flex-col gap-1">
                      <span className="t-sub font-bold text-text-3">{f.label}</span>
                      <textarea
                        value={typeof tuning[f.key] === "string" ? (tuning[f.key] as string) : ""}
                        onChange={(e) => setTuning((p) => ({ ...p, [f.key]: e.target.value }))}
                        rows={2}
                        placeholder={f.placeholder}
                        className="rounded-[10px] border border-line bg-surface px-3 py-2 t-body font-semibold text-ink outline-none focus:border-primary"
                      />
                      {f.hint && <span className="t-caption text-text-3">{f.hint}</span>}
                    </label>
                  );
                }
                return (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="t-sub font-bold text-text-3">
                      {f.label}
                      {f.kind === "number" && f.unit ? <span className="ml-1 font-bold text-text-3">({f.unit})</span> : null}
                    </span>
                    <input
                      value={typeof tuning[f.key] === "string" ? (tuning[f.key] as string) : ""}
                      onChange={(e) => setTuning((p) => ({ ...p, [f.key]: e.target.value }))}
                      inputMode={f.kind === "number" ? "numeric" : undefined}
                      placeholder={f.placeholder}
                      className="w-[160px] rounded-[10px] border border-line bg-surface px-3 py-2 t-body font-semibold text-ink outline-none focus:border-primary"
                    />
                    {f.hint && <span className="t-caption max-w-[200px] text-text-3">{f.hint}</span>}
                  </label>
                );
              })}
            </div>
          </div>
  );
}
