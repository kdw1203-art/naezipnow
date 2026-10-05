"use client";
/* [1032 · 임장노트 1단계] 지도에서 단지 고르기 — 위치 카드 바로 아래 **인라인** 지도.
 *
 * 왜: 1단계는 글자 검색뿐이었다. 임장은 "지도를 보다가 여기 뭐지?"로 시작하는 일인데 단지 이름을 정확히
 * 알아야 노트를 열 수 있었다(분석 도구의 MapPickDrawer 와 같은 이유 — 다만 노트는 서랍이 아니라 1단계
 * 본문에 지도가 있어야 한다: 현장에서 열면 지금 서 있는 자리가 곧 단지다).
 *
 * 재료는 /map 과 같다: /api/map/clusters(뷰포트·줌 → 묶음 또는 개별 단지 300곳) · 마커 id = 단지 id
 * (name-id 는 lib/seo/complex-slug 로 지역·이름이 풀린다; kapt.* 는 상세 응답의 city·district 로 채운다).
 * 마커를 누르면 NoteLocationSearch 의 pickComplex 와 **같은 모양**(NoteLocation)을 부모에게 준다 —
 * 그 뒤 단지 자료 카드(ComplexGlance·NoteUnitPick)·방문 인증 카드가 똑같이 이어진다.
 *
 * 번들: 이 조각은 NoteForm 이 next/dynamic(ssr:false)으로 받고, 지도 SDK 는 NaverMapLazy 가 다시 지연한다
 * — /notes/new 첫 로드(예산 470KB)에는 들어가지 않는다. 접힘 상태는 이 기기만의 편의(localStorage). */
import { useCallback, useEffect, useRef, useState } from "react";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapIdleInfo, MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import { formatKrwManwon } from "@/lib/format/krw";
import { PICK_DEFAULT_LEVEL } from "@/lib/map/pick-zoom";
import { syncCenterState, syncLevelState } from "@/lib/map/viewport-sync";
import { decodeNameIdSafe } from "@/lib/seo/complex-slug";
import { loadComplexDetail } from "@/lib/notes/complex-glance";
import type { NoteLocation } from "./NoteLocationSearch";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const OPEN_KEY = "nz_note_map_open";

type PointItem = { id: string; name: string; lat: number; lng: number; pyeongManwon?: number };
type ClusterItem = { key: string; lat: number; lng: number; count: number };
type Viewport = { mode: "points"; points: PointItem[] } | { mode: "clusters"; clusters: ClusterItem[] };
const EMPTY: Viewport = { mode: "points", points: [] };

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/** 상세 응답의 city·district → "서울 강남구"(suggest 와 같은 규칙) */
function regionFromDetail(raw: unknown): string {
  const c = (raw as { complex?: { city?: unknown; district?: unknown } } | null)?.complex;
  const city = typeof c?.city === "string" ? c.city.trim() : "";
  const district = typeof c?.district === "string" ? c.district.trim() : "";
  if (!city) return district;
  return !district || city === district ? city : `${city} ${district}`;
}

export function NoteMapPick({
  value,
  onPick,
  fallbackCenter,
}: {
  value: NoteLocation;
  /** 마커로 고른 단지 — NoteLocationSearch.onChange 와 같은 모양 */
  onPick: (loc: NoteLocation) => void;
  /** [1033] 위치가 비었을 때 처음 설 자리(직전에 쓴 단지 좌표 등). 없으면 서울시청 — 단, 위치 권한을 이미 준 기기는 내 위치로 */
  fallbackCenter?: { lat: number; lng: number } | null;
}) {
  const hasXY = typeof value.lat === "number" && typeof value.lng === "number" && value.lat !== 0 && value.lng !== 0;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(readOpen());
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* 저장 불가 환경 — 이번만 접힌다 */
      }
      return !v;
    });
  };

  const [center, setCenter] = useState(hasXY ? { lat: value.lat as number, lng: value.lng as number } : (fallbackCenter ?? DEFAULT_CENTER));
  const [level, setLevel] = useState(PICK_DEFAULT_LEVEL);
  /* [1033] 현장에서 연 사람 — 위치 권한을 **이미 준** 기기만 묻지 않고 내 위치로 간다(권한 창을 불쑥 띄우지 않는다).
     위치가 이미 정해졌거나 지도를 손으로 움직인 뒤에는 건드리지 않는다. */
  const movedRef = useRef(false);
  useEffect(() => {
    if (hasXY || typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions?.query) return;
    let alive = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((st) => {
        if (!alive || st.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!alive || movedRef.current) return;
            const { latitude: lat, longitude: lng } = pos.coords;
            if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) setCenter({ lat, lng });
          },
          () => {},
          { maximumAge: 300_000, timeout: 8000 },
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // 마운트 때 한 번 — 그 뒤 좌표 변화는 아래 effect 가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<Viewport>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapDown, setMapDown] = useState(false);
  const reqRef = useRef(0);

  /* 검색·이어받기로 좌표가 바뀌면 지도도 그 자리로(마커로 고른 경우도 같은 값이라 안 움직인다) */
  const lastXY = useRef<string>("");
  useEffect(() => {
    if (!hasXY) return;
    const key = `${value.lat},${value.lng}`;
    if (key === lastXY.current) return;
    lastXY.current = key;
    setCenter({ lat: value.lat as number, lng: value.lng as number });
    setLevel(PICK_DEFAULT_LEVEL);
  }, [hasXY, value.lat, value.lng]);

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
      const data = (await res.json()) as { mode?: string; points?: PointItem[]; clusters?: ClusterItem[] };
      if (seq !== reqRef.current) return;
      setView(
        data.mode === "clusters"
          ? { mode: "clusters", clusters: Array.isArray(data.clusters) ? data.clusters : [] }
          : { mode: "points", points: Array.isArray(data.points) ? data.points : [] },
      );
      setFailed(false);
    } catch {
      if (seq !== reqRef.current) return;
      setView(EMPTY);
      setFailed(true);
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, []);

  const selectedId = value.complexId ?? null;
  const markers: MapMarkerData[] =
    view.mode === "points"
      ? view.points.map((p) => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          priceLabel: p.pyeongManwon ? `${formatKrwManwon(p.pyeongManwon, { style: "eok1" })}/평` : undefined,
          selected: p.id === selectedId,
          brandPin: p.id === selectedId,
          priority: p.id === selectedId ? 2 : 0,
        }))
      : view.clusters.map((c) => ({ id: c.key, lat: c.lat, lng: c.lng, label: `${c.count.toLocaleString("ko-KR")}곳` }));
  /* 고른 단지가 이 화면 목록에 없을 때(검색으로 고른 직후·묶음 축척)도 핀은 보인다 */
  if (hasXY && !markers.some((m) => m.id === selectedId)) {
    markers.push({
      id: selectedId ?? "note-loc",
      lat: value.lat as number,
      lng: value.lng as number,
      label: value.aptName.slice(0, 20),
      brandPin: true,
      selected: true,
      priority: 2,
    });
  }

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const handleMarker = useCallback(
    (m: MapMarkerData) => {
      if (view.mode === "clusters") {
        setCenter({ lat: m.lat, lng: m.lng });
        setLevel(PICK_DEFAULT_LEVEL);
        return;
      }
      if (m.id === selectedId) return;
      const dec = decodeNameIdSafe(m.id);
      const name = dec?.name || m.label;
      const picked: NoteLocation = { aptName: name, region: dec?.region ?? "", complexId: m.id, lat: m.lat, lng: m.lng };
      onPickRef.current(picked);
      /* kapt.* 처럼 id 에서 지역이 안 풀리면 상세 응답(단지 자료 카드가 어차피 받는 같은 조회)으로 채운다 */
      if (!picked.region) {
        void loadComplexDetail(m.id).then((raw) => {
          const region = regionFromDetail(raw);
          if (region) onPickRef.current({ ...picked, region });
        });
      }
    },
    [view.mode, selectedId],
  );

  const status = mapDown
    ? "지도 불러오기 실패 · 위 검색으로 선택"
    : failed
      ? "단지 목록 불러오기 실패 · 지도를 조금 움직이면 다시"
      : loading
        ? "이 화면의 단지 찾는 중"
        : view.mode === "clusters"
          ? "묶음을 누르면 그 자리로 확대"
          : view.points.length > 0
            ? `이 화면에 ${view.points.length.toLocaleString("ko-KR")}곳 · 마커를 누르면 선택`
            : "이 화면에 실거래 있는 단지 없음";

  return (
    <section aria-label="지도에서 단지 고르기" className="card rise-in-1 flex flex-col overflow-hidden rounded-lg">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="map" size={16} className="shrink-0 text-primary" />
          <span className="truncate t-body font-bold text-ink">지도에서 고르기</span>
          {open && <span className="hidden truncate t-caption text-text-3 sm:inline">{status}</span>}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="shrink-0 py-[5px] t-sub font-bold text-primary"
        >
          {open ? "접기" : "펼치기"}
        </button>
      </div>
      {open && (
        <div className="relative h-56 border-t border-line md:h-72">
          <NaverMap
            markers={markers}
            center={center}
            level={level}
            onMarkerClick={handleMarker}
            onFallbackChange={setMapDown}
            onInteractionStart={() => {
              movedRef.current = true;
            }}
            onIdle={(info) => {
              setCenter((prev) => syncCenterState(prev, info.center));
              setLevel((prev) => syncLevelState(prev, info.zoom));
              void loadViewport(info);
            }}
            className="h-full w-full"
            rounded={false}
            showControls
            enableGeolocation
            declutter
            declutterMaxLabels={40}
          />
          <div className={`pointer-events-none absolute inset-x-3 flex justify-center sm:hidden ${mapDown ? "top-3" : "bottom-3"}`}>
            <span role="status" className="pointer-events-auto rounded-full bg-[rgba(11,37,69,.86)] px-3 py-1 t-caption text-on-dark">
              {status}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
