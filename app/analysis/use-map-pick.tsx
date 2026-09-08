"use client";

import { useCallback, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { PickedComplex } from "./ComplexPicker";

/* ============================================================
   [975] 분석 화면 어디서나 "지도에서 고르기" — 한 줄로 붙이는 갈고리.

   소유자 지시: "단지나 지역 검색을 통해 상세하게 분석하고 결과값을 제공할 수
   있도록 대규모 개편". 그동안 분석 도구의 출발점은 **글자 검색 하나**였다.
   단지 이름을 정확히 알아야 시작할 수 있다는 뜻인데, 임장은 보통 반대 순서다.

   각 화면이 서랍 상태를 직접 들고 있으면 (a) 같은 코드가 다섯 벌이 되고
   (b) dynamic 을 항상 그려 두는 실수가 화면마다 반복된다. 그래서 여기 하나로 모은다.

   ── 왜 열렸을 때만 그리는가 ───────────────────────────────────────────
   next/dynamic 은 **그려지는 순간** 묶음을 내려받는다. open=false 인 채로
   자리에 놓아 두면 지도를 한 번도 안 연 사람도 NaverMap(1,344줄) 묶음을 받는다.
   그래서 열렸을 때만 자리에 놓는다 — First Load JS 예산과는 별개로,
   안 쓰는 사람에게 데이터를 태우지 않기 위해서다.
   ============================================================ */

const MapPickDrawer = dynamic(
  () => import("./MapPickDrawer").then((m) => m.MapPickDrawer),
  { ssr: false },
);

export function useMapPick(
  onPick: (c: PickedComplex) => void,
  /** 서랍 제목에 들어갈 목적("이 단지 종합 진단" 등) */
  purpose?: string,
): { openMap: () => void; mapNode: ReactNode } {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const openMap = useCallback(() => setOpen(true), []);

  return {
    openMap,
    mapNode: open ? (
      <MapPickDrawer open onClose={close} onPick={onPick} purpose={purpose} />
    ) : null,
  };
}
