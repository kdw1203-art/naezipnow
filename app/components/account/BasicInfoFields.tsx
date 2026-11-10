"use client";

import {
  ADDRESS_MAX,
  BASIC_CHOICES,
  BASIC_FIELD_LABEL,
  BASIC_FIELD_ORDER,
  JOB_OPTIONS,
  type BasicField,
} from "@/lib/account/basic-info";

/* [1138 · 필수 기본 정보] 가입 화면 · 마이 › 설정 · 완성 화면(/my/basic-info)이 같은 칸을 같은 순서로 그린다.
   순서(소유자 지정): 생년월일 → 주소 → 휴대전화 → 직업 → 보유 주택 → 이용 목적.
   글자 칸은 njn-field(떠오르는 이름표) · 직업은 목록(10개 · 칩으로 늘어놓지 않는다) · 보유 주택 · 이용 목적은 칩(3~4개).
   칸마다 오류 한 줄 · aria-invalid. 첫 오류 칸 id 는 basicFieldId(prefix, field). */

export type BasicDraft = Record<BasicField, string>;
export const EMPTY_DRAFT: BasicDraft = { birth: "", address: "", phone: "", job: "", housing: "", purpose: "" };

export function basicFieldId(prefix: string, f: BasicField): string {
  return `${prefix}-${f}`;
}

export function BasicInfoFields({
  prefix,
  value,
  onChange,
  errors,
}: {
  prefix: string;
  value: BasicDraft;
  onChange: (field: BasicField, v: string) => void;
  errors: Partial<Record<BasicField, string>>;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {BASIC_FIELD_ORDER.map((f) => {
        const id = basicFieldId(prefix, f);
        const err = errors[f];
        const errId = `${id}-err`;
        const label = `${BASIC_FIELD_LABEL[f]} (필수)`;
        const errLine = err ? (
          <p id={errId} className="m-0 px-1 t-caption font-bold text-danger">
            {err}
          </p>
        ) : null;

        if (f === "job") {
          return (
            <div key={f} className="flex flex-col gap-1">
              <label htmlFor={id} className="px-1 t-caption font-bold text-text-2">
                {label}
              </label>
              <select
                id={id}
                value={value.job}
                onChange={(e) => onChange("job", e.target.value)}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? errId : undefined}
                className={`min-h-12 w-full rounded-xl border bg-surface px-3 t-body text-text-1 ${err ? "border-danger" : "border-line"}`}
              >
                <option value="">직업 고르기</option>
                {JOB_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {errLine}
            </div>
          );
        }

        const choices = BASIC_CHOICES[f];
        if (choices) {
          return (
            <div key={f} className="flex flex-col gap-1">
              <span id={`${id}-label`} className="px-1 t-caption font-bold text-text-2">
                {label}
              </span>
              <div
                id={id}
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                aria-describedby={err ? errId : undefined}
                tabIndex={-1}
                className="flex flex-wrap gap-1.5"
              >
                {choices.map((o) => {
                  const on = value[f] === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange(f, o)}
                      className={`press min-h-10 rounded-full border px-3.5 t-sub font-bold ${
                        on ? "border-primary bg-primary-soft text-primary" : err ? "border-danger text-text-2" : "border-line text-text-2"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              {errLine}
            </div>
          );
        }

        const common = {
          id,
          value: value[f],
          placeholder: " ",
          "aria-invalid": err ? true : undefined,
          "aria-describedby": err ? errId : undefined,
          required: true,
        } as const;
        return (
          <div key={f} className="flex flex-col gap-1">
            <div className="njn-field">
              {f === "birth" ? (
                <input {...common} name="bday" type="text" inputMode="numeric" autoComplete="bday" maxLength={6} onChange={(e) => onChange("birth", e.target.value.replace(/\D/g, "").slice(0, 6))} />
              ) : f === "address" ? (
                <input {...common} name="address" type="text" autoComplete="street-address" maxLength={ADDRESS_MAX} onChange={(e) => onChange("address", e.target.value)} />
              ) : (
                <input {...common} name="tel" type="tel" inputMode="tel" autoComplete="tel" maxLength={13} onChange={(e) => onChange("phone", e.target.value)} />
              )}
              <label htmlFor={id}>{label}</label>
            </div>
            {errLine}
          </div>
        );
      })}
      <p className="m-0 px-1 t-caption text-text-3">주민등록번호 뒷자리는 받지 않음 · 본인만 볼 수 있음 · 마이 › 설정에서 수정</p>
    </div>
  );
}
