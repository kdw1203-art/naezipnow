"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import { AREA_RADII_M, formatDistance, type AreaData } from "@/lib/map/area-pick";

/* [1047 · 단지 위치 지도] 소유자 지시(2026-10-09, 단지 화면 캡처의 오른쪽 레일에 노란 표시):
   "단지를 검색하면 지도에서 위치를 보여주고 · 위치는 노란색 부분에" → 레일 맨 위 카드.
   "확대, 축소 · 인근 반경 범위 · 유사 단지나 전철역, 관공서 위치도 간단하게" →
     · 지도 확대·축소 단추(네이버 지도 기본 조작) · 반경 원(500m / 1km 고르기)
     · 켜고 끄는 세 겹: 유사 단지(우리 실거래 집계 — 평당가·준공 연도가 닮은 순) · 역 · 관공서(OpenStreetMap)
   지도 SDK 는 지연 로드(NaverMapLazy) · 주변 정보는 /api/complex/area(CDN 7일) — 단지 화면 첫 그림과 무관하다.
   같은 카드가 데스크톱(레일)과 폰(본문)에 하나씩 놓이므로 media 로 한쪽만 켠다(숨은 쪽은 지도를 만들지 않는다). */

type Layer = "similar" | "stations" | "offices";

const LAYER_META: Record<Layer, { label: string; color: string }> = {
  similar: { label: "유사 단지", color: "var(--primary)" },
  stations: { label: "역", color: "var(--success)" },
  offices: { label: "관공서", color: "var(--warning)" },
};

/** 반경 → 네이버 지도 레벨(lib/map/naver-maps-sdk: 레벨 5 = 줌 16 동네 크기) */
const LEVEL_FOR_RADIUS: Record<number, number> = { 500: 4, 1000: 5 };

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function infoHtml(title: string, sub: string): string {
  return `<div style="min-width:140px;padding:2px"><p style="font-size:13px;font-weight:700;color:var(--ink);margin:0">${escapeText(title)}</p><p style="font-size:11px;color:var(--text-3);margin:2px 0 0">${escapeText(sub)}</p></div>`;
}

export function ComplexAreaMap({
  lat,
  lng,
  name,
  buildYear,
  media,
}: {
  lat: number;
  lng: number;
  name: string;
  buildYear?: number | null;
  /** desktop = 레일(1024px 이상에서만 켠다) · mobile = 본문(1024px 미만에서만) */
  media: "desktop" | "mobile";
}) {
  const [active, setActive] = useState<boolean | null>(null);
  const [radius, setRadius] = useState<number>(1000);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ similar: true, stations: true, offices: true });
  const [data, setData] = useState<AreaData | null>(null);
  const [failed, setFailed] = useState(false);
  /* 역·관공서(OpenStreetMap)를 못 읽었으면 3초 뒤 한 번만 다시 묻는다(공개 서버가 가끔 바쁘다) */
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setActive(media === "desktop" ? mq.matches : !mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [media]);

  useEffect(() => {
    if (!active || data || failed) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), name });
    if (buildYear) qs.set("by", String(buildYear));
    fetch(`/api/complex/area?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<AreaData>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(true);
      });
    return () => ctrl.abort();
  }, [active, data, failed, lat, lng, name, buildYear]);

  useEffect(() => {
    if (!data || retried || !data.missing.includes("osm")) return;
    const t = window.setTimeout(() => {
      setRetried(true);
      const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), name, retry: "1" });
      if (buildYear) qs.set("by", String(buildYear));
      fetch(`/api/complex/area?${qs.toString()}`)
        .then((r) => (r.ok ? (r.json() as Promise<AreaData>) : null))
        .then((d) => {
          if (d && !d.missing.includes("osm")) setData(d);
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [data, retried, lat, lng, name, buildYear]);

  const markers = useMemo<MapMarkerData[]>(() => {
    const out: MapMarkerData[] = [{ id: "self", lat, lng, label: name.slice(0, 20), brandPin: true, selected: true }];
    if (!data) return out;
    if (layers.similar) {
      for (const c of data.similar) {
        if (c.distanceM > radius) continue;
        const sub = [
          c.avgPerPyeongKrw ? `평당 ${(c.avgPerPyeongKrw / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만` : null,
          c.buildYear ? `${c.buildYear}년` : null,
          formatDistance(c.distanceM),
        ]
          .filter(Boolean)
          .join(" · ");
        out.push({ id: `cx:${c.regionName}:${c.name}`, lat: c.lat, lng: c.lng, label: c.name, pinColor: LAYER_META.similar.color, infoHtml: infoHtml(c.name, `유사 단지 · ${sub}`) });
      }
    }
    if (layers.stations) {
      for (const s of data.stations) {
        if (s.distanceM > radius) continue;
        out.push({ id: `st:${s.name}`, lat: s.lat, lng: s.lng, label: s.name, pinColor: LAYER_META.stations.color, infoHtml: infoHtml(s.name, `역 · ${formatDistance(s.distanceM)} · 도보 ${Math.max(1, Math.round(s.distanceM / 80))}분`) });
      }
    }
    if (layers.offices) {
      for (const o of data.offices) {
        if (o.distanceM > radius) continue;
        out.push({ id: `of:${o.name}`, lat: o.lat, lng: o.lng, label: o.name, pinColor: LAYER_META.offices.color, infoHtml: infoHtml(o.name, `${o.kind} · ${formatDistance(o.distanceM)}`) });
      }
    }
    return out;
  }, [data, layers, radius, lat, lng, name]);

  if (active === false) return null;

  const count = (k: Layer) =>
    data ? (k === "similar" ? data.similar : k === "stations" ? data.stations : data.offices).filter((x) => x.distanceM <= radius).length : null;
  const nearestStation = data?.stations[0];

  return (
    <section className="card rise-in-1 flex flex-col gap-2.5 rounded-2xl p-3" aria-labelledby={`area-map-title-${media}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id={`area-map-title-${media}`} className="t-section text-ink">
          위치 · 주변
        </h2>
        {/* 반경 고르기 — 원과 목록이 함께 바뀐다 */}
        <div role="group" aria-label="반경" className="flex rounded-full bg-bg p-0.5">
          {AREA_RADII_M.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              aria-pressed={radius === r}
              className={`min-h-10 rounded-full px-3 t-caption font-bold ${radius === r ? "bg-surface text-ink shadow-sm" : "text-text-3"}`}
            >
              {formatDistance(r)}
            </button>
          ))}
        </div>
      </div>

      {/* 지도 — 확대·축소 단추(showControls) · 반경 원 · 겹침 정리(declutter) */}
      <div className="h-64 overflow-hidden rounded-xl border border-line">
        {active && (
          <NaverMap
            key={`${media}-${radius}`}
            markers={markers}
            center={{ lat, lng }}
            level={LEVEL_FOR_RADIUS[radius] ?? 5}
            showControls
            rounded={false}
            declutter
            circle={{ lat, lng, radiusM: radius }}
            className="h-full w-full"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-divider t-sub font-bold text-text-1">
                <Icon name="pin" size={16} /> {name}
              </div>
            }
          />
        )}
      </div>

      {/* 겹 켜고 끄기 — 색 점은 지도 핀과 같은 색 */}
      <div className="flex flex-wrap gap-1.5 px-1">
        {(Object.keys(LAYER_META) as Layer[]).map((k) => {
          const n = count(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setLayers((p) => ({ ...p, [k]: !p[k] }))}
              aria-pressed={layers[k]}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 t-caption font-bold ${
                layers[k] ? "border-line bg-surface text-ink" : "border-transparent bg-bg text-text-3"
              }`}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: LAYER_META[k].color, opacity: layers[k] ? 1 : 0.35 }} />
              {LAYER_META[k].label}
              {n !== null && <span className="tabular-nums text-text-3">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <span className="t-caption text-text-3">
          {failed
            ? "주변 정보 불러오기 실패 · 잠시 후 다시"
            : nearestStation
              ? `가까운 역 ${nearestStation.name} · ${formatDistance(nearestStation.distanceM)}`
              : data
                ? data.missing.includes("osm")
                  ? "역·관공서 불러오기 실패 · 잠시 후 다시"
                  : `반경 ${formatDistance(radius)} 안 역 없음`
                : "주변 정보 불러오는 중"}
        </span>
        <Link
          href={`/map?lat=${lat}&lng=${lng}&z=16`}
          className="inline-flex min-h-6 items-center gap-1 t-sub font-bold text-primary no-underline"
        >
          <Icon name="map" size={13} />
          크게 보기 ›
        </Link>
      </div>
      <p className="px-1 t-caption text-text-3">
        유사 단지 = 국토부 실거래 평당가·준공 연도가 닮은 순 · 역·관공서 © OpenStreetMap 기여자
        {data?.missing.includes("osm") ? " (지금 못 읽음)" : ""}
      </p>
    </section>
  );
}
