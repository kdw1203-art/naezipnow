"use client";
/* [1026b · 시나리오·비교] 단지 담기 입력(검색 · 지도) — page.tsx 의 ComparePickerSection 에서 카드 틀을 걷고 입력만 남겼다.
   빈 상태 카드 · 담은 단지 손잡이(데스크톱 레일 / 폰 접이식) 안에 놓인다. next/dynamic(ssr:false · CompareLazy.tsx) —
   단지 검색(ComplexPicker)이 /analysis/compare 첫 묶음에서 빠진다.
   딥링크(?complexId= · ?apt=)는 **처음 마운트된 한 벌만** 읽는다(readDeepLink) — 빈 상태에서 담기면 카드가 손잡이로 바뀌며 입력이
   다시 마운트되는데, 그때 같은 딥링크로 또 담고 토스트가 두 번 뜨지 않게. */

import { useEffect, useRef } from "react";
import { COMPARE_TRAY_MAX } from "@/lib/newui/compare-tray";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";
import { useMapPick } from "../use-map-pick";

export function ComparePicker({
  onAdd,
  readDeepLink,
  onMounted,
}: {
  onAdd: (c: PickedComplex) => void;
  /** true 면 주소의 ?complexId= · ?apt= 를 읽는다(화면에서 처음 마운트된 입력만) */
  readDeepLink: boolean;
  /** 마운트됐다고 알린다 — 다음 입력부터는 딥링크를 읽지 않는다 */
  onMounted: () => void;
}) {
  /* [975] 담기는 검색·지도 두 길이 같은 함수로 모인다 — 지도에서 고른 단지도 똑같이 담기고 같은 토스트가 뜬다. */
  const { openMap, mapNode } = useMapPick(onAdd, "후보 단지 비교");
  /* 처음 렌더의 값으로 고정 — 부모가 곧바로 false 로 바꿔도 이 입력의 딥링크 판단은 그대로 */
  const readRef = useRef(readDeepLink);
  const mountedRef = useRef(onMounted);
  useEffect(() => {
    mountedRef.current();
  }, []);

  return (
    <>
      {mapNode}
      {/* [1015 · 규칙 B] 예시("예: 공작아파트")는 걷었다 */}
      <ComplexPicker
        label={`단지 검색 · 최대 ${COMPARE_TRAY_MAX}곳`}
        placeholder="단지명 검색"
        clearOnSelect
        showChip={false}
        onSelect={onAdd}
        /* 이름을 모르는 후보는 지도에서 눌러 담는다 */
        onMapClick={openMap}
        {...(readRef.current ? {} : { initialComplexId: null, initialApt: null })}
      />
    </>
  );
}

export default ComparePicker;
