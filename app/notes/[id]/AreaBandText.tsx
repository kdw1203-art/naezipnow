"use client";

import { useEffect, useState } from "react";
import { readAreaUnitCookie } from "@/lib/prefs/area-unit";

/* [1006] 면적 구간 글자 — 서버가 두 표기("60~85㎡" · "18~26평")를 넘기고, 마운트 뒤 설정
   쿠키(nz_area_unit)를 읽어 하나를 고른다. 서버 렌더·첫 페인트는 ㎡(개인화 없음 — 공개
   노트 상세는 캐시되는 화면이다), 평 설정인 사람만 hydration 직후 바뀐다. 상태·요청 없음. */
export function AreaBandText({ m2, pyeong }: { m2: string; pyeong: string }) {
  const [unit, setUnit] = useState<"m2" | "pyeong">("m2");
  useEffect(() => {
    setUnit(readAreaUnitCookie());
  }, []);
  return <>{unit === "pyeong" ? pyeong : m2}</>;
}
