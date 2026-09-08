"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { PickedComplex } from "./ComplexPicker";

/* 허브 한 화면이 공유하는 "지금 고른 단지" + 그 단지를 고르는 **지도 서랍**.
 *
 * 예전에는 검색기가 화면 중간 카드 안에 갇혀 있어서, 단지를 골라도 그 사실을
 * 아는 건 바로 옆 임장노트 카드 하나뿐이었다. 워크벤치 12장·지역 도구는 여전히
 * 빈손으로 열렸다(고른 단지를 다시 입력해야 했다).
 *
 * 선택을 화면 전체가 공유하면 히어로에서 한 번 고른 단지가 아래 카드 전부에
 * ?complexId= 로 실려 나간다 — 소유자 피드백 "인터랙티브하지 않다"의 실제 원인은
 * 애니메이션이 아니라 **내 입력이 화면에 아무 영향을 못 준다**는 쪽이었다.
 *
 * ── [975] 지도를 왜 여기에 두는가 ──────────────────────────────────────
 * 소유자 지시: "기능을 누르면 지도도 같이 떠서 그 지도를 통해 바로 진단·예측·
 * 동선분석을 할 수 있게". 그 '기능'은 히어로 검색줄에도, 아래 워크벤치 카드
 * 12장에도 있다. 서랍을 각자 들고 있으면 지도 인스턴스가 여럿 생기고 상태도
 * 갈린다. 그래서 **선택을 공유하는 이 자리**에 서랍 하나만 둔다.
 *   · dynamic(ssr:false) — 열기 전에는 한 바이트도 안 받는다(/analysis 는
 *     First Load 예산 여유가 1KB 남짓이다. scripts/check-bundle-budget.mjs)
 *   · openMap({purpose, onPicked}) — 고르고 나서 어디로 갈지는 부르는 쪽이 정한다.
 */

const MapPickDrawer = dynamic(
  () => import("./MapPickDrawer").then((m) => m.MapPickDrawer),
  { ssr: false },
);

export interface HubMapRequest {
  /** 무엇을 위해 고르는지 — 서랍 제목에 그대로 나온다("이 단지 종합 진단") */
  purpose?: string;
  /** 고른 뒤 할 일(보통 그 도구로 이동). 없으면 선택만 반영하고 닫는다. */
  onPicked?: (c: PickedComplex) => void;
  /** 단지 없이 그냥 들어갈 수 있는 곳 — 서랍이 막다른 길이 되지 않게 한다. */
  skipHref?: string;
}

interface HubPickedValue {
  picked: PickedComplex | null;
  setPicked: (c: PickedComplex | null) => void;
  /** 고른 단지가 있으면 "?complexId=…", 없으면 빈 문자열 — 링크에 그대로 붙인다. */
  query: string;
  /** 지도 서랍 열기 */
  openMap: (req?: HubMapRequest) => void;
}

const Ctx = createContext<HubPickedValue>({
  picked: null,
  setPicked: () => {},
  query: "",
  openMap: () => {},
});

export function HubPickedProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  /* null = 닫힘. 열 때 넘어온 요청(목적·후속동작)을 그대로 들고 있는다. */
  const [mapReq, setMapReq] = useState<HubMapRequest | null>(null);

  const openMap = useCallback((req?: HubMapRequest) => {
    setMapReq(req ?? {});
  }, []);

  const closeMap = useCallback(() => setMapReq(null), []);

  const handlePick = useCallback(
    (c: PickedComplex) => {
      setPicked(c);
      /* 이동은 서랍을 닫은 다음 — 닫기 전에 라우팅하면 서랍이 잠깐 남는다. */
      const after = mapReq?.onPicked;
      setMapReq(null);
      after?.(c);
    },
    [mapReq],
  );

  const value = useMemo<HubPickedValue>(
    () => ({
      picked,
      setPicked,
      query: picked ? `?complexId=${encodeURIComponent(picked.id)}` : "",
      openMap,
    }),
    [picked, openMap],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* 요청이 있을 때만 **자리에 놓는다** — dynamic 은 그려질 때 내려받으므로,
          항상 놓아 두면 open=false 여도 첫 방문에 지도 묶음을 받아 버린다. */}
      {mapReq !== null && (
        <MapPickDrawer
          open
          onClose={closeMap}
          onPick={handlePick}
          purpose={mapReq.purpose}
          skipHref={mapReq.skipHref}
        />
      )}
    </Ctx.Provider>
  );
}

export function useHubPicked(): HubPickedValue {
  return useContext(Ctx);
}
