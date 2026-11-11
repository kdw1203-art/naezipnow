/* [1143 · 한 줄 맞춤] 소유자 2026-11-11 "글자가 두 줄이 안 되도록 자간 및 글자 크기 조절 · 다른 페이지들도 일괄 적용".
   순수 규칙 — 어떤 글줄을 맞출지, 어디까지 줄일지. 화면 쪽(OneLineFit)이 재고 적용한다.

   대상: 설명 줄(.t-caption · .t-sub · [data-fit]) 가운데 **딱 두 줄로 넘친 짧은 글**. 세 줄 이상이거나 긴 문단은 읽는 글이라 건드리지 않는다.
   방법: 먼저 자간을 좁히고(−0.01em 씩 −0.05em 까지), 그래도 넘치면 글자를 줄인다(원래의 88%까지 · 11px 밑으로는 안 내린다).
   그래도 한 줄이 안 되면 원래대로 둔다 — 읽기 어려울 만큼 줄이지 않는다. */

export const FIT_SELECTOR = ".t-caption, .t-sub, [data-fit]";
export const FIT_MAX_CHARS = 64;
export const FIT_MIN_SCALE = 0.88;
export const FIT_MIN_PX = 11;
export const FIT_SPACING_STEPS = [-0.01, -0.02, -0.03, -0.04, -0.05] as const;
export const FIT_SCALE_STEPS = [0.96, 0.92, 0.88] as const;

/** 두 줄로 넘친 짧은 글인가 — 높이가 한 줄 반을 넘고 두 줄 반 아래 */
export function isTwoLineOverflow(heightPx: number, lineHeightPx: number, chars: number): boolean {
  if (!(lineHeightPx > 0) || chars === 0 || chars > FIT_MAX_CHARS) return false;
  const lines = heightPx / lineHeightPx;
  return lines > 1.5 && lines < 2.5;
}

/** 시도 순서 — [자간(em), 글자 배율]. 바닥(11px)보다 작아지는 배율은 뺀다 */
export function fitAttempts(basePx: number): Array<{ spacingEm: number; scale: number }> {
  const out: Array<{ spacingEm: number; scale: number }> = FIT_SPACING_STEPS.map((s) => ({ spacingEm: s, scale: 1 }));
  const tight = FIT_SPACING_STEPS[FIT_SPACING_STEPS.length - 1];
  for (const k of FIT_SCALE_STEPS) {
    if (k < FIT_MIN_SCALE || basePx * k < FIT_MIN_PX) break;
    out.push({ spacingEm: tight, scale: k });
  }
  return out;
}
