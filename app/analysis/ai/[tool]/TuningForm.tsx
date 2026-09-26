"use client";

/* [981] 도구별 보정 입력 폼 — **열릴 때만** 내려받는다(워크벤치 본체 예산 480KB).
   폼이 묻는 값은 전부 lib/ai/analysis-engine.ts 가 실제로 읽는 필드다
   (lib/ai/tool-tuning-fields.ts · tests/unit/tool-tuning-981.test.ts).

   [1008 · W] "내 조건" — 머리글("궤적에 쓸 값 — 전부 선택 사항")을 걷고, 단지를 고를 때 자동으로 채운
   칸(기준 가격)에는 "최근 실거래가로 채움" 표시를 붙인다. 금액 칸은 옆에 억 단위로 다시 읽어 준다
   (50000 이 5억인지 50억인지 한눈에 보이게 — 소유자 캡처). */

import type { TuningField } from "@/lib/ai/tool-tuning";
import { formatEokMan } from "@/lib/format/eok-man";

export function TuningForm({
  fields,
  value,
  onChange,
  autoValues = {},
}: {
  fields: readonly TuningField[];
  value: Record<string, string | boolean>;
  onChange: (next: Record<string, string | boolean>) => void;
  /** 자동으로 채운 값 — 칸의 값이 이것과 같을 때만 "최근 실거래가로 채움" 표시(고치면 사라진다) */
  autoValues?: Readonly<Record<string, string>>;
}) {
  if (fields.length === 0) return null;
  const set = (k: string, v: string | boolean) => onChange({ ...value, [k]: v });
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="t-sub text-text-3">전부 선택이에요. 비워 두면 공공데이터 값으로 계산해요.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {fields.map((f) => {
          if (f.kind === "toggle") {
            return (
              <label key={f.key} className="flex min-h-[40px] items-center gap-2 t-sub font-bold text-text-1">
                <input type="checkbox" className="h-5 w-5" checked={value[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            );
          }
          if (f.kind === "select") {
            return (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="t-sub font-bold text-text-2">{f.label}</span>
                <select
                  value={typeof value[f.key] === "string" ? (value[f.key] as string) : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="min-h-[40px] rounded-[10px] border border-line bg-surface px-3 t-body font-semibold text-ink outline-none focus:border-primary"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {f.hint && <span className="t-caption text-text-3">{f.hint}</span>}
              </label>
            );
          }
          if (f.kind === "textarea") {
            return (
              <label key={f.key} className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                <span className="t-sub font-bold text-text-2">{f.label}</span>
                <textarea
                  value={typeof value[f.key] === "string" ? (value[f.key] as string) : ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  rows={2}
                  placeholder={f.placeholder}
                  className="rounded-[10px] border border-line bg-surface px-3 py-2 t-body font-semibold text-ink outline-none focus:border-primary"
                />
                {f.hint && <span className="t-caption text-text-3">{f.hint}</span>}
              </label>
            );
          }
          const raw = typeof value[f.key] === "string" ? (value[f.key] as string) : "";
          const auto = raw !== "" && autoValues[f.key] === raw;
          const man = f.kind === "number" && f.unit === "만원" ? Number(raw.replace(/[^\d.]/g, "")) : NaN;
          return (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5 t-sub font-bold text-text-2">
                {f.label}
                {f.kind === "number" && f.unit ? <span className="font-bold text-text-3">({f.unit})</span> : null}
                {auto && <span className="rounded bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary">최근 실거래가로 채움</span>}
              </span>
              <span className="flex items-center gap-2">
                <input
                  value={raw}
                  onChange={(e) => set(f.key, e.target.value)}
                  inputMode={f.kind === "number" ? "numeric" : undefined}
                  placeholder={f.placeholder}
                  className="min-h-[40px] w-full min-w-0 max-w-[200px] rounded-[10px] border border-line bg-surface px-3 t-body font-semibold text-ink outline-none focus:border-primary"
                />
                {/* [1009 · A] 넣은 숫자를 반올림 없이 읽어 준다("50800" → "5억 800만원") — 짧은 "5.1억"은 넣은 값과
                    달라 보여 오타를 가렸다 */}
                {Number.isFinite(man) && man > 0 && (
                  <span className="shrink-0 t-sub font-bold tabular-nums text-text-2">= {formatEokMan(man, { unit: "만원" })}</span>
                )}
              </span>
              {f.hint && <span className="t-caption text-text-3">{f.hint}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
