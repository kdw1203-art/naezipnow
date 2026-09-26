"use client";

import { useEffect, useState } from "react";
import { formatAreaByUnit, readAreaUnitCookie } from "@/lib/prefs/area-unit";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";
import type { AreaUnit } from "@/lib/prefs/ui-prefs";

/* [1009 · C] 면적을 사용자 설정 단위(㎡/평)로 — 서버 HTML(방문자 공용 ISR)은 언제나 ㎡ 로 그리고, 붙은 뒤 쿠키가
   "평"이면 바꾼다(lib/prefs/area-unit: 서버 렌더 개인화 금지). 허브의 평형 칩·면적대 표·실거래 목록·그래프 탭이 같은 규칙.
   평형 키는 전용면적의 정수 내림(84.99㎡ → 84㎡, lib/ai/result-series unitOf) — 평은 그 정수에서 바꾼다(84㎡ → 25.4평)
   그래야 "84㎡" 탭과 그 탭의 거래가 서로 다른 평수로 적히지 않는다. */

export function useAreaUnit(): AreaUnit {
  const [unit, setUnit] = useState<AreaUnit>("m2");
  useEffect(() => {
    setUnit(readAreaUnitCookie());
  }, []);
  return unit;
}

/** 평형 키(㎡ 정수) → "84㎡" · "25.4평" */
export function unitAreaLabel(unitM2: number, unit: AreaUnit): string {
  return formatAreaByUnit(unitM2, unit);
}

export function AreaText({
  unitM2,
  band,
  prefix = "",
}: {
  /** 평형 키(㎡ 정수) */
  unitM2?: number | null;
  /** 면적대 라벨("60~85㎡") */
  band?: string | null;
  /** 앞에 붙일 말("전용 ") */
  prefix?: string;
}) {
  const unit = useAreaUnit();
  const text = band ? areaBandLabelByUnit(band, unit) : unitM2 != null ? unitAreaLabel(unitM2, unit) : "";
  if (!text) return null;
  return (
    <>
      {prefix}
      {text}
    </>
  );
}

export default AreaText;
