/**
 * [1008 · W] 내 조건 자동 채움 — 단지를 고르면 "기준 가격" 칸을 그 단지의 최근 실거래가(만원)로 채운다.
 *
 * 왜(소유자 캡처): 6.5억 단지(공작아파트)를 골랐는데 "출발 시세 (만원)" 칸에 50000(5억)이 들어 있었다 —
 * 사용자가 무엇을 넣어야 하는지 모르는 칸이 결과를 흔들었다.
 *
 * 규칙:
 *  · 칸이 비어 있거나, 직전에 **우리가 채운 값 그대로**면 새 값으로 채운다.
 *  · 같은 단지에서 사용자가 고친 값은 덮지 않는다.
 *  · 다른 단지로 바꾸면 새 단지 값으로 바꾼다(옛 단지 가격이 새 단지 결과를 흔들지 않게).
 *  · 새 단지에 값이 없으면(거래 부족) 우리가 채웠던 값은 지운다 — 옛 단지 값을 남기지 않는다.
 * 순수 함수 — 워크벤치(클라이언트)와 단위테스트 공용. 수치를 계산하지 않는다(서버가 준 값을 옮긴다).
 */

/** 자동 채움을 받는 칸 — 도구의 보정 입력에 이 키가 있을 때만 */
export const AUTOFILL_PRICE_KEYS = ["currentPriceMan", "maeMan"] as const;

export type AutofillState = {
  /** 마지막으로 채운 단지 */
  complexId: string | null;
  /** 칸별로 마지막에 우리가 넣은 값 */
  values: Record<string, string>;
};

export const EMPTY_AUTOFILL: AutofillState = { complexId: null, values: {} };

/** 원 → 만원 문자열("650000000" → "65000"). 값이 없으면 null */
export function priceManString(priceKrw: number | null | undefined): string | null {
  const n = Number(priceKrw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n / 10_000));
}

export function applyPriceAutofill(params: {
  tuning: Readonly<Record<string, string | boolean>>;
  prev: AutofillState;
  complexId: string;
  /** 이 도구의 보정 입력 키 목록 */
  fieldKeys: readonly string[];
  /** 새 단지의 자동 값(만원 문자열) — 없으면 null */
  suggestion: string | null;
}): { tuning: Record<string, string | boolean>; state: AutofillState; changed: boolean } {
  const { prev, complexId, suggestion } = params;
  const keys = AUTOFILL_PRICE_KEYS.filter((k) => params.fieldKeys.includes(k));
  const next: Record<string, string | boolean> = { ...params.tuning };
  const values: Record<string, string> = {};
  let changed = false;
  const complexChanged = prev.complexId !== complexId;

  for (const k of keys) {
    const cur = typeof next[k] === "string" ? (next[k] as string).trim() : "";
    const lastAuto = prev.values[k];
    const userEdited = cur !== "" && cur !== lastAuto;
    if (!complexChanged && userEdited) {
      /* 같은 단지에서 사용자가 고친 값 — 그대로 둔다 */
      continue;
    }
    if (suggestion) {
      if (cur !== suggestion) {
        next[k] = suggestion;
        changed = true;
      }
      values[k] = suggestion;
    } else if (cur !== "" && (complexChanged || cur === lastAuto)) {
      /* 새 단지는 값이 없다 — 옛 값(우리가 채웠든 사용자가 넣었든 옛 단지 기준)을 비운다 */
      next[k] = "";
      changed = true;
    }
  }
  return { tuning: next, state: { complexId, values }, changed };
}
