"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapIdleInfo, MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import { PICK_DEFAULT_LEVEL } from "@/lib/map/pick-zoom";
import {
  ComplexPicker,
  resolvePickedComplexById,
  type PickedComplex,
} from "./ComplexPicker";

/* ============================================================
   [975] 지도에서 단지 고르기 — 분석 도구 공용 서랍.

   ── 왜 ────────────────────────────────────────────────────────────────
   소유자 지시: "AI 분석에서 기능을 누르면 지도도 같이 떠서 그 지도를 통해 바로
   진단·예측·동선분석 등을 할 수 있게" + "단지나 지역 검색을 통해 상세하게 분석".

   지금까지 분석 도구의 대상 선택은 **글자 검색 하나**뿐이었다. 단지 이름을
   정확히 알아야 시작할 수 있다는 뜻인데, 임장은 보통 반대 순서다 — 지도를 보다가
   "여기 뭐지?" 로 시작한다. 그래서 같은 자리에 지도를 붙인다.

   ── 왜 서랍(모달)인가 ─────────────────────────────────────────────────
   /analysis 와 /analysis/ai/[tool] 은 First Load JS 예산이 각각 486/490KB ·
   458/480KB 로 여유가 거의 없다(scripts/check-bundle-budget.mjs). 지도(NaverMap,
   1,344줄)를 라우트에 정적으로 얹으면 그 자리에서 예산이 깨진다.
   그래서 (a) 지도는 NaverMapLazy(dynamic·ssr:false)로만 부르고,
   (b) 이 서랍 자체도 부르는 쪽에서 dynamic 으로 부른다.
   → **열기 전까지 한 바이트도 받지 않는다.**

   ── 고른 값은 검색과 같은 모양 ────────────────────────────────────────
   마커를 눌러 고르든 검색으로 고르든 결과는 같은 PickedComplex 다
   (resolvePickedComplexById — ComplexPicker 와 같은 조립 함수).
   두 경로가 각자 조립하면 지역 표기·시세 라벨이 갈린다.
   ============================================================ */

/** 지도가 처음 서는 자리 — 서울시청. 사용자가 고른 단지가 있으면 그쪽으로 간다. */
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
/* 서랍이 처음 서는 축척 — "열자마자 고를 수 있어야" 한다는 규칙과 그 근거는
   lib/map/pick-zoom 에 있다(단위검증이 서버 경계값과의 관계를 잠근다). */

interface ClusterItem {
  key: string;
  lat: number;
  lng: number;
  count: number;
}
interface PointItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  pyeongManwon?: number;
}

/**
 * 지금 화면에 무엇이 있는지. **모드는 서버 응답을 그대로 따른다.**
 * 처음엔 level 로 직접 계산했는데(level < 7 이면 개별 단지), /api/map/clusters 의
 * 경계는 zoom ≥ 14 = level ≤ 7 이라 정확히 level 7 에서 어긋났다 — 서버는 단지
 * 300곳을 보내는데 화면은 클러스터 배열(빈 값)을 그려 "이 화면에는 단지가 없어요"
 * 라고 말했다. 경계를 두 군데서 정하면 언젠가 이렇게 갈린다.
 */
type Viewport =
  | { mode: "points"; points: PointItem[] }
  | { mode: "clusters"; clusters: ClusterItem[] };

const EMPTY: Viewport = { mode: "points", points: [] };

export function MapPickDrawer({
  open,
  onClose,
  onPick,
  /** 서랍 제목 — 어떤 도구를 위해 고르는지 알려 준다("이 단지 종합 진단" 등) */
  purpose,
  /** 이미 고른 단지가 있으면 그 좌표로 시작(없으면 서울시청) */
  initialCenter,
  /**
   * 단지를 안 고르고도 갈 수 있는 곳. 도구 카드에서 서랍이 열린 경우에만 준다 —
   * 서랍이 **막다른 길**이 되면 "도구가 어떤 건지 먼저 보고 싶다"를 막는다.
   */
  skipHref,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: PickedComplex) => void;
  purpose?: string;
  initialCenter?: { lat: number; lng: number } | null;
  skipHref?: string;
}) {
  const [center, setCenter] = useState(initialCenter ?? DEFAULT_CENTER);
  const [level, setLevel] = useState(PICK_DEFAULT_LEVEL);
  const [view, setView] = useState<Viewport>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  /* 지도 SDK 가 뜨지 않으면 NaverMap 은 OSM iframe 으로 대체된다 — 마커가 없으니
     **거기서는 아무것도 고를 수 없다.** 그때 "이 화면에는 단지가 없어요" 라고
     말하면 거짓말이다. 사실대로 말하고 위 검색으로 안내한다. */
  const [mapDown, setMapDown] = useState(false);
  /* 뷰포트가 여러 번 바뀌는 동안 늦게 온 응답이 최신 것을 덮지 않게 한다. */
  const reqRef = useRef(0);

  /* Esc 로 닫기 — 서랍은 화면을 덮으므로 키보드 탈출구가 반드시 있어야 한다. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadViewport = useCallback(async (info: MapIdleInfo) => {
    const b = info.bounds;
    if (!b) return;
    const seq = ++reqRef.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        minLat: String(b.swLat),
        maxLat: String(b.neLat),
        minLng: String(b.swLng),
        maxLng: String(b.neLng),
        zoom: String(Math.round(info.zoom)),
      });
      const res = await fetch(`/api/map/clusters?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        mode?: string;
        points?: PointItem[];
        clusters?: ClusterItem[];
      };
      if (seq !== reqRef.current) return; // 늦게 온 응답 — 버린다
      setView(
        data.mode === "clusters"
          ? {
              mode: "clusters",
              clusters: Array.isArray(data.clusters) ? data.clusters : [],
            }
          : {
              mode: "points",
              points: Array.isArray(data.points) ? data.points : [],
            },
      );
      setFailed(false);
    } catch {
      if (seq !== reqRef.current) return;
      /* 실패를 "단지 없음"으로 그리지 않는다 — 아래 안내가 조회 실패라고 말한다. */
      setView(EMPTY);
      setFailed(true);
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, []);

  const markers: MapMarkerData[] =
    view.mode === "points"
      ? view.points.map((p) => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          priceLabel: p.pyeongManwon
            ? `${p.pyeongManwon.toLocaleString("ko-KR")}만/평`
            : undefined,
        }))
      : view.clusters.map((c) => ({
          id: c.key,
          lat: c.lat,
          lng: c.lng,
          label: `${c.count.toLocaleString("ko-KR")}곳`,
        }));

  const handleMarker = useCallback(
    async (m: MapMarkerData) => {
      /* 클러스터는 고를 수 없다 — 누르면 그 자리로 확대해 개별 단지가 나오게 한다.
         "눌렀는데 아무 일도 없다" 를 만들지 않으려는 것이다. */
      if (view.mode === "clusters") {
        setCenter({ lat: m.lat, lng: m.lng });
        setLevel(PICK_DEFAULT_LEVEL);
        return;
      }
      setResolving(m.id);
      try {
        const picked = await resolvePickedComplexById(m.id, m.label);
        onPick(picked);
        onClose();
      } finally {
        setResolving(null);
      }
    },
    [view.mode, onPick, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(11,37,69,.62)] p-0 backdrop-blur-[2px] md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="지도에서 단지 고르기"
    >
      {/* 바깥을 눌러도 닫힌다 — 모달의 기본 기대다 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative flex h-[86vh] w-full max-w-[880px] flex-col overflow-hidden rounded-t-[20px] bg-surface md:h-[76vh] md:rounded-[20px]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="t-body font-extrabold text-ink">
              지도에서 단지 고르기
            </p>
            {purpose && (
              <p className="mt-0.5 truncate t-sub text-text-3">
                {purpose}에 쓸 단지를 고릅니다
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="press shrink-0 rounded-full p-2 text-text-2"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* 검색도 같은 서랍 안에 — "지도 또는 검색" 이 한 자리에 있어야 고르기가 끝난다 */}
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
          <ComplexPicker
            label=""
            /* 이미 지도 안이다 — 피커 옆 "지도로 찾기" 단추는 그리지 않는다 */
            onMapClick={null}
            onSelect={(c) => {
              if (!c) return;
              onPick(c);
              onClose();
            }}
          />
          {skipHref && (
            <Link
              href={skipHref}
              prefetch={false}
              className="self-start t-caption font-bold text-text-2 no-underline underline-offset-2 hover:underline"
            >
              단지 없이 {purpose ?? "도구"} 먼저 보기 ›
            </Link>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <NaverMap
            markers={markers}
            center={center}
            level={level}
            onMarkerClick={handleMarker}
            onFallbackChange={setMapDown}
            onIdle={(info) => {
              setLevel(Math.max(1, Math.round(21 - info.zoom)));
              void loadViewport(info);
            }}
            className="h-full w-full"
            rounded={false}
            showControls
          />
          {/* 상태 한 줄 — 지금 무엇을 눌러야 하는지 항상 말해 준다.
              지도가 대체(OSM)로 내려가면 아래쪽이 그쪽 안내로 차므로 위로 올린다. */}
          <div
            className={`pointer-events-none absolute inset-x-3 flex justify-center ${
              mapDown ? "top-3" : "bottom-3"
            }`}
          >
            <span className="pointer-events-auto rounded-full bg-[rgba(11,37,69,.86)] px-3.5 py-1.5 t-sub text-on-dark">
              {resolving
                ? "단지를 불러오는 중…"
                : mapDown
                  ? "지도를 불러오지 못했어요 — 위 검색창에 단지명을 넣어 주세요"
                  : failed
                    ? "단지 목록을 지금 불러오지 못했어요 — 지도를 조금 움직여 보세요"
                    : loading
                      ? "이 화면의 단지를 찾는 중…"
                      : view.mode === "clusters"
                        ? "묶음을 누르면 그 자리로 확대돼요"
                        : view.points.length > 0
                          ? `이 화면에 ${view.points.length.toLocaleString("ko-KR")}곳 · 마커를 누르면 선택`
                          : "이 화면에는 실거래가 있는 단지가 없어요"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
