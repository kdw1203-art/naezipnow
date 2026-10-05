"use client";
/* [1032 · 임장노트 고도화] 2단계 "세부 기록" 카드 — 현장 체크(상·중·하 인상) 옆에 **측정값·선택지**를 적는 칸.
 *
 * 왜: 체크리스트는 인상(좋음·보통·아쉬움)이고 메모는 글이다. "지하철까지 7분", "방문 시각 주차 만차",
 * "호가 8.5억" 같은 숫자·사실은 적을 칸이 없어 메모에 묻히거나 사라졌다. 재방문 비교·AI 정리가 쓸 수
 * 있게 키가 있는 값으로 남긴다(metadata.fieldDetail — lib/notes/unit-detail 이 모양을 정한다).
 * 값은 전부 선택 — 비면 키를 보내지 않는다(0 이나 "보통"으로 채우지 않는다).
 *
 * 번들: NoteDetailFields 와 같이 2단계에 들어왔을 때만 next/dynamic 으로 내려받는다. 상태는 NoteForm. */
import { FIELD_CHOICE_GROUPS, FIELD_NUMBER_GROUPS } from "@/lib/notes/unit-detail";
import type { FieldDetailLoose as FieldDetail } from "@/lib/notes/unit-core";
import { formatKrwManwon } from "@/lib/format/krw";

export function NoteFieldDetail({ value, onChange }: { value: FieldDetail; onChange: (next: FieldDetail) => void }) {
  const set = (patch: FieldDetail) => onChange({ ...value, ...patch });
  const filled = Object.keys(value).length;
  return (
    <section aria-label="세부 기록" className="card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-body font-bold text-ink">세부 기록</h2>
        <span className="t-caption t-num text-text-3">{filled > 0 ? `${filled}개 적음` : "측정값 · 선택"}</span>
      </div>
      {FIELD_CHOICE_GROUPS.map((g) => (
        <div key={g.key} className="flex items-start gap-2">
          <span className="w-24 shrink-0 pt-2 t-sub text-text-2">{g.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {g.options.map((opt) => {
              const active = value[g.key] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ [g.key]: active ? undefined : opt })}
                  className={`chip rounded-full border px-3 py-1.5 t-sub ${active ? "chip-active" : "border-line bg-surface text-text-2"}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        {FIELD_NUMBER_GROUPS.map((g) => (
          <label key={g.key} className="flex flex-col gap-1">
            <span className="t-sub text-text-2">{g.label}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={g.max}
                value={value[g.key] ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set({ [g.key]: e.target.value && Number.isFinite(v) && v >= 0 && v <= g.max ? v : undefined });
                }}
                enterKeyHint="done"
                aria-label={`${g.label}(${g.unit})`}
                className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub t-num text-text-1 outline-none"
              />
              <span className="shrink-0 t-sub text-text-3">{g.unit}</span>
            </span>
            {/* [1033] 만원 입력은 억으로 되읽어 준다 — 85000 이 8.5억인지 바로 보이게 */}
            {g.key === "askingManwon" && typeof value.askingManwon === "number" && value.askingManwon >= 10_000 && (
              <span className="t-caption t-num text-text-3">= {formatKrwManwon(value.askingManwon, { style: "eok1" })}</span>
            )}
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="t-sub text-text-2">가까운 역</span>
          <input
            type="text"
            value={value.nearestStation ?? ""}
            maxLength={20}
            onChange={(e) => set({ nearestStation: e.target.value.slice(0, 20) || undefined })}
            enterKeyHint="done"
            aria-label="도보 분을 잰 역 이름"
            className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub text-text-1 outline-none"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="t-sub text-text-2">들은 말 · 중개사·관리실</span>
        <textarea
          value={value.heard ?? ""}
          onChange={(e) => set({ heard: e.target.value.slice(0, 200) || undefined })}
          rows={2}
          maxLength={200}
          enterKeyHint="done"
          placeholder="예: 관리실 — 지하 2층 누수 보수 9월 완료"
          className="w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
        />
      </label>
    </section>
  );
}
