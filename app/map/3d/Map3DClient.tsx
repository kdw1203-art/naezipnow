"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import {
  PRICE_BAND_LABELS,
  assignBuildings,
  complexesNear,
  distanceM,
  map3dSupported,
  priceBand,
  type BuildingLite,
  type LngLat,
  type Map3DComplex,
  type Map3DPayload,
} from "@/lib/map3d/geo";
import { complexExtrusionLayer, tuneLibertyStyle, type Map3DPalette, type StyleSpecLite } from "@/lib/map3d/style";
import { bandColors, mix } from "@/lib/map3d/color";
import { dongFromParam, dongPath, regionFromSlug } from "@/lib/dong/format";
import { formatKrwShort } from "@/lib/market/format";

/* [1086 · 서울 3D] 동네 3D 지도.
   건물 = OpenFreeMap 벡터 타일(OpenStreetMap · 높이 render_height = 높이·층수 태그 기준) · 우리 데이터 = /api/map/3d(단지·좌표·평당 평균).
   단지 색칠 = 단지 좌표 반경 안 15m 이상 건물(추정 · lib/map3d/geo assignBuildings) — 화면 범례에 그렇게 적는다.
   역 이름표 = 타일의 철도역 + "반경 600m 안 이 동 단지 수" · 학교 = 타일의 학교 이름표. 숫자는 우리 집계 그대로(꾸민 값 없음). */

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const BUILDING_SCAN_RADIUS_M = 2200;

type Phase = "params" | "loading" | "ready" | "empty" | "error" | "nogl";

type Tokens = {
  palette: Map3DPalette;
  bands: string[];
  neighbor: string;
  selected: string;
  navy: string;
  onDark: string;
  surface: string;
  line: string;
  text1: string;
  station: string;
};

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  /* 토큰이 비면(이론상) 바탕·글자 토큰끼리 섞는다 — 새 색을 정하지 않는다 */
  const bg = v("--bg", "rgb(247, 249, 252)");
  const surface = v("--surface", "rgb(255, 255, 255)");
  const primary = v("--primary", "rgb(29, 79, 216)");
  const success = v("--success", "rgb(23, 122, 74)");
  const text1 = v("--text-1", "rgb(51, 61, 75)");
  const text3 = v("--text-3", "rgb(96, 106, 119)");
  const line = v("--line", mix(text3, surface, 0.25));
  const navy = v("--brand-navy", text1);
  const red = v("--brand-red", primary);
  return {
    palette: {
      bg,
      water: mix(primary, bg, 0.22),
      park: mix(success, bg, 0.2),
      road: surface,
      roadCasing: line,
      building: mix(text3, bg, 0.32),
      text: text1,
      textHalo: surface,
      school: success,
    },
    bands: bandColors(primary, surface),
    neighbor: mix(text3, bg, 0.5),
    selected: red,
    navy,
    onDark: v("--on-dark", surface),
    surface,
    line,
    text1,
    station: red,
  };
}

/** 알약 배경 이미지(늘어나는 이미지) — 단지·역 이름표 뒤 */
function pillImage(fill: string, stroke: string) {
  const r = 2;
  const w = 30 * r;
  const h = 24 * r;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = fill;
  g.strokeStyle = stroke;
  g.lineWidth = 1.5 * r;
  g.beginPath();
  const x = r;
  const y = r;
  const ww = w - 2 * r;
  const hh = h - 2 * r;
  const rad = 6 * r;
  g.moveTo(x + rad, y);
  g.arcTo(x + ww, y, x + ww, y + hh, rad);
  g.arcTo(x + ww, y + hh, x, y + hh, rad);
  g.arcTo(x, y + hh, x, y, rad);
  g.arcTo(x, y, x + ww, y, rad);
  g.closePath();
  g.fill();
  g.stroke();
  return {
    data: g.getImageData(0, 0, w, h),
    options: {
      pixelRatio: r,
      stretchX: [[10 * r, 20 * r]] as [number, number][],
      stretchY: [[9 * r, 15 * r]] as [number, number][],
      content: [7 * r, 4 * r, w - 7 * r, h - 4 * r] as [number, number, number, number],
    },
  };
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** 역 타일 조각 수(결과 서명용) */
function rail0(map: MlMap): number {
  try {
    return map.querySourceFeatures("openmaptiles", { sourceLayer: "poi", filter: ["==", ["get", "class"], "rail"] }).length;
  } catch {
    return 0;
  }
}

function ymDot(ym: string | null): string | null {
  return ym && /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : null;
}

export function Map3DClient() {
  const [phase, setPhase] = useState<Phase>("params");
  const [params, setParams] = useState<{ region: string; dong: string; focus: string | null } | null>(null);
  const [data, setData] = useState<Map3DPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [pitched, setPitched] = useState(true);
  const [mapError, setMapError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const tokensRef = useRef<Tokens | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const lastSigRef = useRef<string>("");

  /* 1) 주소 읽기 */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const region = regionFromSlug(sp.get("region") ?? "");
    const dong = dongFromParam(sp.get("dong") ?? "");
    if (!region || !dong || !map3dSupported(region)) {
      setPhase("empty");
      return;
    }
    if (!webglAvailable()) {
      setParams({ region, dong, focus: null });
      setPhase("nogl");
      return;
    }
    setParams({ region, dong, focus: sp.get("focus") });
    setPhase("loading");
  }, []);

  /* 2) 우리 데이터 */
  useEffect(() => {
    if (!params || phase !== "loading") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/map/3d?${new URLSearchParams({ region: params.region, dong: params.dong })}`);
        if (res.status === 404) {
          if (alive) setPhase("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Map3DPayload;
        if (!alive) return;
        setData(json);
        const focus = params.focus && json.complexes.some((c) => c.href === params.focus) ? params.focus : null;
        setSelected(focus);
        setPhase("ready");
      } catch {
        if (alive) setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [params, phase]);

  const inDong = useMemo(() => (data ? data.complexes.filter((c) => c.inDong) : []), [data]);
  const byHref = useMemo(() => new Map((data?.complexes ?? []).map((c) => [c.href, c])), [data]);
  const sel = selected ? byHref.get(selected) ?? null : null;

  const complexColor = useCallback((c: Map3DComplex, t: Tokens, selHref: string | null) => {
    if (c.href === selHref) return t.selected;
    if (!c.inDong) return t.neighbor;
    const b = priceBand(c.avgPerPyeongKrw);
    return b === null ? t.neighbor : t.bands[b];
  }, []);

  /* 단지 이름표 GeoJSON */
  const labelsGeoJson = useCallback(
    (selHref: string | null) => ({
      type: "FeatureCollection" as const,
      features: (data?.complexes ?? []).map((c, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: { href: c.href, name: c.name, inDong: c.inDong, rank: c.inDong ? i : 1000 + i, sel: c.href === selHref ? 1 : 0 },
      })),
    }),
    [data],
  );

  /* 건물 색칠 + 역 이름표 — 타일이 들어올 때마다(idle) 다시 계산 */
  const rebuild = useCallback(() => {
    const map = mapRef.current;
    const t = tokensRef.current;
    if (!map || !t || !data) return;
    if (map.getZoom() < 14) return;
    const center = data.center;
    let feats: ReturnType<MlMap["querySourceFeatures"]> = [];
    try {
      feats = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" });
    } catch {
      return;
    }
    const seen = new Set<string>();
    const blds: BuildingLite[] = [];
    for (const f of feats) {
      const g = f.geometry;
      const h = Number((f.properties as Record<string, unknown>)?.render_height ?? 0);
      const polys: LngLat[][][] = g.type === "Polygon" ? [g.coordinates as LngLat[][]] : g.type === "MultiPolygon" ? (g.coordinates as LngLat[][][]) : [];
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        const key = `${ring[0][0].toFixed(6)},${ring[0][1].toFixed(6)},${ring.length},${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blds.push({ ring, heightM: Number.isFinite(h) && h > 0 ? h : 3 });
      }
    }
    const assigned = assignBuildings(blds, data.complexes);
    const selHref = selectedRef.current;
    /* 같은 결과면 다시 넣지 않는다 — setData 가 다시 그리기 → idle 을 부르므로, 그대로 넣으면 끝없이 돈다 */
    const sig = `${blds.length}:${assigned.filter(Boolean).length}:${selHref ?? ""}:${rail0(map)}`;
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    /* 모든 건물을 이 층 하나로 그린다(타일의 building-3d 는 숨김) — 같은 자리에 두 층을 겹치면 벽면이 줄무늬로 깜빡였다 */
    const features = [];
    for (let i = 0; i < blds.length; i++) {
      const href = assigned[i];
      const c = href ? byHref.get(href) : undefined;
      features.push({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [blds[i].ring] },
        properties: { href: c ? c.href : "", h: blds[i].heightM, color: c ? complexColor(c, t, selHref) : t.palette.building },
      });
    }
    if (features.length > 0 && map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");
    (map.getSource("nz-complex-buildings") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });

    /* 역 — 타일의 철도역(이름 중복은 하나로) */
    let rail: ReturnType<MlMap["querySourceFeatures"]> = [];
    try {
      rail = map.querySourceFeatures("openmaptiles", { sourceLayer: "poi", filter: ["==", ["get", "class"], "rail"] });
    } catch {
      rail = [];
    }
    const stations = new Map<string, { lng: number; lat: number }>();
    for (const f of rail) {
      if (f.geometry.type !== "Point") continue;
      const p = f.properties as Record<string, unknown>;
      const name = String(p["name:ko"] ?? p["name:nonlatin"] ?? p.name ?? "").trim();
      if (!name || stations.has(name)) continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if (distanceM(center, { lng, lat }) > BUILDING_SCAN_RADIUS_M) continue;
      stations.set(name, { lng, lat });
    }
    (map.getSource("nz-stations") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [...stations.entries()].map(([name, p]) => {
        const n = complexesNear(p, data.complexes, 600);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: { label: n > 0 ? `${name} · ${n}단지` : name },
        };
      }),
    });
  }, [data, byHref, complexColor]);

  /* 3) 지도 만들기(데이터가 온 뒤 한 번) */
  useEffect(() => {
    if (phase !== "ready" || !data || !containerRef.current || mapRef.current) return;
    let alive = true;
    let idleTimer = 0;
    (async () => {
      try {
        const [{ default: maplibregl }, styleRes] = await Promise.all([import("maplibre-gl"), fetch(STYLE_URL)]);
        if (!styleRes.ok) throw new Error(`style ${styleRes.status}`);
        const base = (await styleRes.json()) as StyleSpecLite;
        if (!alive || !containerRef.current) return;
        const t = readTokens();
        tokensRef.current = t;
        setTokens(t);
        const style = tuneLibertyStyle(base, t.palette);
        const focus = selectedRef.current ? byHref.get(selectedRef.current) : null;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: style as unknown as import("maplibre-gl").StyleSpecification,
          center: focus ? [focus.lng, focus.lat] : [data.center.lng, data.center.lat],
          zoom: focus ? 16.2 : 15.4,
          pitch: 58,
          bearing: -17,
          maxPitch: 70,
          minZoom: 12,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.on("error", () => setMapError(true));
        map.on("load", () => {
          const imgs: Array<[string, string, string]> = [
            ["nz-pill-dong", t.navy, t.navy],
            ["nz-pill-near", t.surface, t.line],
            ["nz-pill-sel", t.selected, t.selected],
            ["nz-pill-station", t.surface, t.station],
          ];
          for (const [id, fill, stroke] of imgs) {
            const im = pillImage(fill, stroke);
            if (im && !map.hasImage(id)) map.addImage(id, im.data, im.options);
          }
          map.addSource("nz-complex-buildings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addSource("nz-complexes", { type: "geojson", data: labelsGeoJson(selectedRef.current) });
          map.addSource("nz-stations", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer(complexExtrusionLayer() as unknown as Parameters<MlMap["addLayer"]>[0], "nz-school");
          map.addLayer({
            id: "nz-station-label",
            type: "symbol",
            source: "nz-stations",
            layout: {
              "text-field": ["get", "label"],
              "text-size": 11.5,
              "text-font": ["Noto Sans Bold"],
              "icon-image": "nz-pill-station",
              "icon-text-fit": "both",
              "icon-text-fit-padding": [3, 7, 3, 7],
              "symbol-sort-key": 0,
            },
            paint: { "text-color": t.text1 },
          });
          /* 이름표 알약은 글자 상자에 맞춘다(icon-text-fit) — 알약에 따로 icon-anchor·icon-offset 을 주면 기울인 화면 앞쪽(원근 배율 > 1)에서
             알약과 글자가 다르게 늘어나 글자가 알약 아래로 삐져나왔다(빌드 캡처에서 발견) → 위치는 글자(text-anchor·text-offset)만 정한다 */
          map.addLayer({
            id: "nz-near-label",
            type: "symbol",
            source: "nz-complexes",
            minzoom: 15.8,
            filter: ["all", ["==", ["get", "sel"], 0], ["!", ["get", "inDong"]]],
            layout: {
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-font": ["Noto Sans Bold"],
              "text-anchor": "bottom",
              "text-offset": [0, -0.8],
              "text-max-width": 12,
              "icon-image": "nz-pill-near",
              "icon-text-fit": "both",
              "icon-text-fit-padding": [3, 7, 3, 7],
              "symbol-sort-key": ["get", "rank"],
            },
            paint: { "text-color": t.text1 },
          });
          map.addLayer({
            id: "nz-complex-label",
            type: "symbol",
            source: "nz-complexes",
            filter: ["all", ["==", ["get", "sel"], 0], ["get", "inDong"]],
            layout: {
              "text-field": ["get", "name"],
              "text-size": 12.5,
              "text-font": ["Noto Sans Bold"],
              "text-anchor": "bottom",
              "text-offset": [0, -0.8],
              "text-max-width": 12,
              "icon-image": "nz-pill-dong",
              "icon-text-fit": "both",
              "icon-text-fit-padding": [3, 7, 3, 7],
              "symbol-sort-key": ["get", "rank"],
            },
            paint: { "text-color": t.onDark },
          });
          map.addLayer({
            id: "nz-complex-sel",
            type: "symbol",
            source: "nz-complexes",
            filter: ["==", ["get", "sel"], 1],
            layout: {
              "text-field": ["get", "name"],
              "text-size": 13.5,
              "text-font": ["Noto Sans Bold"],
              "text-anchor": "bottom",
              "text-offset": [0, -0.8],
              "icon-image": "nz-pill-sel",
              "icon-text-fit": "both",
              "icon-text-fit-padding": [4, 8, 4, 8],
              "text-allow-overlap": true,
              "icon-allow-overlap": true,
            },
            paint: { "text-color": t.onDark },
          });
          const pick = (e: { features?: Array<{ properties?: Record<string, unknown> | null }> }) => {
            const href = e.features?.[0]?.properties?.href;
            if (typeof href === "string") setSelected(href);
          };
          for (const id of ["nz-complex-label", "nz-near-label", "nz-complex-sel", "nz-complex-3d"]) {
            map.on("click", id, pick);
            map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
          }
        });
        /* 타일이 새로 들어오거나 지도를 옮긴 뒤에만 다시 칠한다(idle 마다가 아니라) */
        const schedule = () => {
          window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(rebuild, 180);
        };
        map.on("moveend", schedule);
        map.on("sourcedata", (e) => {
          if (e.sourceId === "openmaptiles" && e.isSourceLoaded) schedule();
        });
      } catch {
        if (alive) setMapError(true);
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(idleTimer);
    };
  }, [phase, data, byHref, labelsGeoJson, rebuild]);

  /* 화면을 떠나면 지도 정리 */
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  /* 4) 고른 단지 → 이름표·건물 색 갱신 + 그 자리로 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource("nz-complexes") as GeoJSONSource | undefined)?.setData(labelsGeoJson(selected));
    rebuild();
  }, [selected, labelsGeoJson, rebuild]);

  const flyTo = (c: Map3DComplex) => {
    setSelected(c.href);
    setListOpen(false);
    mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: Math.max(mapRef.current.getZoom(), 16), speed: 0.9 });
  };

  const togglePitch = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !pitched;
    setPitched(next);
    map.easeTo({ pitch: next ? 58 : 0, bearing: next ? -17 : 0, duration: 600 });
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? inDong.filter((c) => c.name.includes(q)) : inDong;
  }, [inDong, query]);

  const t = tokens;
  const label = params ? `${params.region.replace(/^서울(특별시)?\s*/, "")} ${params.dong}` : "3D 동네 지도";
  const backHref = params ? dongPath(params.region, params.dong) : "/dong";
  const period = data ? [ymDot(data.period.from), ymDot(data.period.to)].filter(Boolean).join("~") : "";

  if (phase === "empty" || phase === "error" || phase === "nogl") {
    const title =
      phase === "empty" ? "이 주소의 3D 지도 없음" : phase === "nogl" ? "이 기기에서 3D 지도 그리기 불가" : "3D 지도 불러오기 실패";
    const desc =
      phase === "empty"
        ? "서울 동 단위 지원(예: 강남구 개포동) · 동 실거래 페이지의 \"3D로 보기\""
        : phase === "nogl"
          ? "WebGL 미지원 브라우저 · 2D 지도·동 실거래 페이지는 그대로 이용 가능"
          : "잠시 후 다시 시도해 주세요.";
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="t-section text-ink">{title}</p>
        <p className="t-sub text-text-3">{desc}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href={params ? backHref : "/dong"} className="btn-outline btn-md">
            {params ? `${label} 실거래` : "동별 실거래"}
          </Link>
          <Link href="/map" className="btn-outline btn-md">
            2D 지도
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="map3d fixed inset-0 h-[100dvh] w-full overflow-hidden bg-bg">
      {/* 지도 엔진 CSS(.maplibregl-map { position: relative })가 absolute 를 덮어 높이가 0 이 된다 — 바깥 틀이 자리를 잡고 안쪽은 꽉 채운다 */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" aria-label={`${label} 3D 지도`} role="region" />
      </div>

      {(phase !== "ready" || !data) && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <span className="t-sub text-text-3">3D 지도 불러오는 중</span>
        </div>
      )}
      {mapError && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-2 t-sub text-text-1 [box-shadow:var(--shadow-md)]" role="alert">
          지도 타일 불러오기 실패 · 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {/* 왼쪽 판(넓은 화면) · 위쪽 줄(폰) */}
      <aside className="absolute left-3 right-3 top-3 z-20 md:right-auto md:w-[300px]">
        <div className="rounded-2xl border border-line bg-surface p-3.5 [box-shadow:var(--shadow-md)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 t-section text-ink">{label}</p>
              <p className="m-0 mt-0.5 t-caption text-text-3">
                {data ? `단지 ${inDong.length}곳 · 주변 ${data.complexes.length - inDong.length}곳` : "단지 불러오는 중"}
                {" · "}
                <Link href={backHref} className="tap-line font-bold text-primary">
                  동 실거래 ›
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={togglePitch} className="btn-outline min-h-10 rounded-lg px-2.5 t-sub md:min-h-8">
                {pitched ? "위에서" : "3D"}
              </button>
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                aria-expanded={listOpen}
                className="btn-outline min-h-10 rounded-lg px-2.5 t-sub md:hidden"
              >
                목록
              </button>
            </div>
          </div>
          <div className={`${listOpen ? "block" : "hidden"} md:block`}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="단지명 검색"
              aria-label="이 동 단지 검색"
              className="mt-2.5 w-full rounded-lg border border-line bg-bg px-3 py-2 t-sub text-ink outline-none focus:border-primary"
            />
            <ul className="m-0 mt-2 max-h-[38vh] list-none overflow-y-auto p-0 md:max-h-[46vh]">
              {filtered.map((c) => {
                const b = priceBand(c.avgPerPyeongKrw);
                return (
                  <li key={c.href}>
                    <button
                      type="button"
                      onClick={() => flyTo(c)}
                      aria-pressed={c.href === selected}
                      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left t-sub md:min-h-8 ${
                        c.href === selected ? "bg-primary-soft font-bold text-ink" : "text-text-1"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: t ? (b === null ? t.neighbor : t.bands[b]) : undefined }}
                      />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.avgPerPyeongKrw ? (
                        <span className="shrink-0 tabular-nums text-text-3">평당 {formatKrwShort(c.avgPerPyeongKrw)}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {data && filtered.length === 0 ? <li className="px-2 py-3 t-sub text-text-3">검색한 단지 없음</li> : null}
            </ul>
            {/* 범례 · 기준 */}
            <div className="mt-2.5 border-t border-divider pt-2.5">
              <ul className="m-0 flex list-none flex-wrap gap-x-2.5 gap-y-1 p-0 t-caption text-text-2">
                {PRICE_BAND_LABELS.map((l, i) => (
                  <li key={l} className="flex items-center gap-1">
                    <span aria-hidden="true" className="h-2 w-3 rounded-sm" style={{ background: t?.bands[i] }} />
                    {l}
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-1.5 t-caption leading-[1.55] text-text-3">
                단지 색 = 평당 평균 매매가(국토교통부 신고{period ? ` · ${period}` : ""}) · 색칠한 건물 = 단지 좌표 반경 안 15m 이상 건물(위치 기준 추정) · 건물 높이 =
                OpenStreetMap 높이·층수(값이 없으면 낮게)
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* 고른 단지 */}
      {sel ? (
        <section
          aria-label="고른 단지"
          className="absolute bottom-12 left-3 right-3 z-20 rounded-2xl border border-line bg-surface p-3.5 [box-shadow:var(--shadow-md)] md:bottom-10 md:left-auto md:right-3 md:w-[320px]"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 min-w-0 t-section text-ink">{sel.name}</p>
            <button type="button" onClick={() => setSelected(null)} aria-label="고른 단지 닫기" className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center text-text-3">
              {/* dead-control-ok: 닫기 단추의 글자 표식 */}
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <dl className="m-0 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 t-sub">
            <div>
              <dt className="t-caption text-text-3">평당 평균</dt>
              <dd className="m-0 font-bold tabular-nums text-ink">{sel.avgPerPyeongKrw ? formatKrwShort(sel.avgPerPyeongKrw) : "—"}</dd>
            </div>
            <div>
              <dt className="t-caption text-text-3">매매 신고</dt>
              <dd className="m-0 font-bold tabular-nums text-ink">{sel.txCount.toLocaleString("ko-KR")}건</dd>
            </div>
            <div>
              <dt className="t-caption text-text-3">세대수</dt>
              <dd className="m-0 tabular-nums text-text-1">{sel.households ? `${sel.households.toLocaleString("ko-KR")}세대` : "—"}</dd>
            </div>
            <div>
              <dt className="t-caption text-text-3">준공</dt>
              <dd className="m-0 tabular-nums text-text-1">{sel.buildYear ? `${sel.buildYear}년` : "—"}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <Link href={sel.href} className="btn-primary btn-md flex-1 text-center">
              단지 화면
            </Link>
            <Link href={backHref} className="btn-outline btn-md">
              동 실거래
            </Link>
          </div>
          {!sel.inDong ? <p className="m-0 mt-2 t-caption text-text-3">{params?.dong} 밖 주변 단지</p> : null}
        </section>
      ) : null}

    </div>
  );
}
