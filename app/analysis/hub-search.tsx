"use client";

import { useEffect, useRef, useState } from "react";
import { ComplexPicker } from "./ComplexPicker";
import { useHubPicked } from "./hub-context";
import { LastToolChip } from "./tool-cards-client";

/* ============================================================
   분석 허브 검색 — [UI-05 · 975 · v4]

   [v4 · 한 화면 한 가지] 이 화면의 주인공은 **단지 검색 하나**다. 네이비 히어로·워터마크·계열 칩 3개·
   1-2 스텝퍼·통계 3칸·한도 줄을 모두 걷고, 흰 바탕 위에 큰 입력 + 채움 파랑 [검색](화면의 유일한 채움 파랑) +
   그 아래 글자 링크 "지도에서 단지 고르기" 만 남겼다.

   동작은 그대로다.
   · 단지 선택기(ComplexPicker — 도구 화면들과 같은 부품)가 서제스트·키보드·?complexId=/?apt= 딥링크를 맡는다.
     고른 단지는 허브 전체가 공유하고(hub-context), 아래 목록의 모든 행이 ?complexId= 를 싣고 열린다.
   · [검색] 은 입력칸에서 Enter 를 누른 것과 같다(선택기의 콤보박스 규칙 — 정확히 한 곳이면 바로 고르고,
     아니면 목록을 연다). 선택기(도구 화면들과 공용 부품)를 고치지 않으려고 입력칸에 키 이벤트를 그대로 보낸다.
   · 지도는 화면을 떠나지 않고 서랍으로 연다(975). 선택기 옆 지도 단추 대신 아래 글자 링크 하나.
   ============================================================ */

export function HubSearch() {
  const { picked, setPicked, openMap } = useHubPicked();
  const boxRef = useRef<HTMLDivElement | null>(null);
  /* [970 · B-28] 좁은 화면 판정 — 서버·첫 렌더는 false(긴 placeholder)라 하이드레이션이 안 어긋난다 */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(max-width: 480px)");
    const sync = () => setNarrow(mql.matches);
    sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    return undefined;
  }, []);

  /* [검색] = 입력칸의 Enter. 단추를 누르는 mousedown 이 선택기의 "바깥 클릭"으로 목록을 먼저 닫으므로,
     닫혀 있으면 ↓(목록 다시 열기 — 선택기 규칙: 결과가 있을 때만 열린다)를 먼저 보내고 다음 프레임에 Enter.
     선택기는 굳지 않은 새 검색어면 바로 찾고(정확히 한 곳이면 선택), 같은 검색어면 가리킨 줄·첫 결과를 고른다.
     React 는 루트에서 keydown 을 위임받으므로 입력칸에 보낸 이벤트가 선택기의 onKeyDown 으로 그대로 들어간다.
     입력이 비었을 때만 포커스를 옮긴다(모바일에서 고른 뒤 키보드가 다시 올라오지 않게). */
  const submit = () => {
    const input = boxRef.current?.querySelector("input");
    if (!input) return;
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    const key = (k: string) =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    if (input.getAttribute("aria-expanded") !== "true") key("ArrowDown");
    requestAnimationFrame(() => key("Enter"));
  };

  const pickedFacts = picked
    ? [picked.regionLabel, picked.priceLabel ? `최근 월평균 ${picked.priceLabel}` : null].filter(Boolean).join(" · ")
    : "";

  return (
    <section role="search" aria-label="단지 검색" className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        {/* 선택기 입력칸을 이 화면에서만 크게 — 높이는 옆 [검색](.btn-lg 52px)과 같은 px 로(간격 유틸은 모바일에서
            0.9375 배로 줄어 어긋난다). 모바일 글자 16px 은 globals.css(iOS 확대 방지)가 이긴다 */}
        <div
          ref={boxRef}
          className="min-w-0 flex-1 [&_input]:h-[52px] [&_input]:px-4 [&_input]:font-medium md:[&_input]:text-[15px]"
        >
          <ComplexPicker
            onSelect={setPicked}
            showChip={false}
            label=""
            placeholder={narrow ? "단지명 검색" : "단지명으로 검색 (예: 은마아파트)"}
            /* 선택기 옆 지도 단추는 그리지 않는다 — 아래 글자 링크가 같은 서랍을 연다 */
            onMapClick={null}
          />
        </div>
        <button type="button" onClick={submit} className="btn-primary btn-lg shrink-0">
          검색
        </button>
      </div>

      {/* [1009 · A] 가격은 최근 거래 달의 **월평균**(평형 섞임)이다 — "평균"이라고 적는다(표기 표준) */}
      {picked && pickedFacts && <p className="t-sub text-text-2">{pickedFacts}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button type="button" onClick={() => openMap()} className="tap-line t-sub font-bold text-primary">
          지도에서 단지 고르기
        </button>
        <LastToolChip />
      </div>
    </section>
  );
}
