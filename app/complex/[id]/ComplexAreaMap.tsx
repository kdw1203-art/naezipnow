"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import {
  AREA_RADII_M,
  formatDistance,
  formatStraightDistance,
  similarLayerLabel,
  similarView,
  walkMinutesAtLeast,
  type AreaLayer,
} from "@/lib/map/area-pick";
import {
  areaPartCount,
  composeAreaView,
  hasFailedPart,
  mergeAreaPart,
  osmFetchPlan,
  osmShown,
  reloadPlan,
  type AreaPartName,
  type AreaResponse,
} from "@/lib/map/area-parts";
import { stationLabel } from "@/lib/poi/parse";

/* [1047 · 단지 위치 지도] 소유자 지시(2026-10-09, 단지 화면 캡처의 오른쪽 레일에 노란 표시):
   "단지를 검색하면 지도에서 위치를 보여주고 · 위치는 노란색 부분에" → 레일 맨 위 카드.
   "확대, 축소 · 인근 반경 범위 · 유사 단지나 전철역, 관공서 위치도 간단하게" →
     · 지도 확대·축소 단추(네이버 지도 기본 조작) · 반경 원(500m / 1km 고르기)
     · 켜고 끄는 세 겹: 유사 단지(우리 실거래 집계 — 평당가·준공 연도가 닮은 순) · 역(공공데이터 — 표가 빈 동안만
       OpenStreetMap) · 관공서(OpenStreetMap)
   지도 SDK 는 지연 로드(NaverMapLazy) · 주변 정보는 /api/complex/area(CDN 7일) — 단지 화면 첫 그림과 무관하다.
   같은 카드가 데스크톱(레일)과 폰(본문)에 하나씩 놓이므로 media 로 한쪽만 켠다(숨은 쪽은 지도를 만들지 않는다).
   [1052] 정직한 이름표 · 실패 처리: 닮음 점수가 없으면 "주변 단지(가까운 순)" · 덜 닮은 단지(0.3 미만)는 빼고 ·
   거리는 "직선" · 못 읽은 원천의 숫자는 "—" · 실패 뒤 "다시 불러오기"(규칙은 lib/map/area-pick — 단위 시험).
   [1053] 두 요청: main(유사 단지 + 공공데이터 역 — DB 만, 빠름)을 먼저 받고, 관공서(OpenStreetMap · 자주 실패)는
   main 뒤에 part=osm 으로 따로 받는다 — 관공서가 유사 단지 · 역을 기다리게 하지 않는다. 원천별 상태(읽는 중 · 읽음 · 실패)를
   따로 두고, "다시 불러오기"는 실패한 원천이 든 요청만 다시 부른다(규칙은 lib/map/area-parts — 단위 시험).
   출처: 역은 공공 표에서 왔으면 "전국도시철도역사정보표준데이터", OpenStreetMap 은 그 자료가 화면에 있을 때만 적는다. */

type Layer = AreaLayer;

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

/** 주변 정보 주소 — retry 는 CDN 캐시 칸을 가르는 값(실패 응답은 5분 캐시라 같은 주소면 같은 실패를 받는다).
 *  v=2: [1053] 응답 모양이 바뀌었다(part · stationSource · pending) — 예전 모양의 캐시 칸을 피한다.
 *  osm 쪽은 단지 이름 · 준공 연도와 무관하다 — 같은 좌표면 같은 칸. */
function areaUrl(p: {
  lat: number;
  lng: number;
  part: AreaPartName;
  name?: string;
  buildYear?: number | null;
  st?: boolean;
  retry?: string;
}): string {
  const qs = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng) });
  if (p.part === "osm") {
    qs.set("part", "osm");
    if (p.st) qs.set("st", "1");
  } else {
    qs.set("name", p.name ?? "");
    if (p.buildYear) qs.set("by", String(p.buildYear));
  }
  qs.set("v", "2");
  if (p.retry) qs.set("retry", p.retry);
  return `/api/complex/area?${qs.toString()}`;
}

async function fetchArea(url: string, part: AreaPartName, signal?: AbortSignal): Promise<AreaResponse> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const json = (await r.json()) as AreaResponse;
  /* 모양이 다르면(예전 캐시 등) 실패로 — 섞어 그리지 않는다 */
  if (!json || json.part !== part || !Array.isArray(json.missing)) throw new Error("응답 형식 아님");
  return json;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

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
  /* [1053] 쪽별 응답 · 요청 자체의 실패 — 화면에 그릴 것과 원천별 상태는 composeAreaView 가 만든다 */
  const [main, setMain] = useState<AreaResponse | null>(null);
  const [mainFailed, setMainFailed] = useState(false);
  const [osm, setOsm] = useState<AreaResponse | null>(null);
  const [osmFailed, setOsmFailed] = useState(false);
  /* [1052] 손으로 다시 부른 횟수(캐시 칸 m1, m2 …) · 다시 부르는 중 */
  const [manualTries, setManualTries] = useState(0);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setActive(media === "desktop" ? mq.matches : !mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [media]);

  /* main — 유사 단지 + 역(공공 표). Overpass 를 기다리지 않는다 */
  useEffect(() => {
    if (!active || main || mainFailed) return;
    const ctrl = new AbortController();
    fetchArea(areaUrl({ lat, lng, part: "main", name, buildYear }), "main", ctrl.signal)
      .then(setMain)
      .catch((e: unknown) => {
        if (!isAbort(e)) setMainFailed(true);
      });
    return () => ctrl.abort();
  }, [active, main, mainFailed, lat, lng, name, buildYear]);

  /* osm — main 이 온(또는 실패한) 뒤에 관공서. 공공 역 표가 비었으면(stationSource "osm") 역도(st) */
  const osmPlan = active ? osmFetchPlan({ main, mainFailed, osm, osmFailed }) : null;
  const osmWant = osmPlan ? (osmPlan.st ? "st" : "offices") : null;
  useEffect(() => {
    if (!osmWant) return;
    const ctrl = new AbortController();
    fetchArea(areaUrl({ lat, lng, part: "osm", st: osmWant === "st" }), "osm", ctrl.signal)
      .then((d) => setOsm((prev) => mergeAreaPart(prev, d)))
      .catch((e: unknown) => {
        if (!isAbort(e)) setOsmFailed(true);
      });
    return () => ctrl.abort();
  }, [osmWant, lat, lng]);

  const view = useMemo(() => composeAreaView({ main, mainFailed, osm, osmFailed }), [main, mainFailed, osm, osmFailed]);
  const status = view.status;

  /* [1052] 실패 뒤 "다시 불러오기" — 실패한 원천이 든 요청만 다시 부르고, 읽은 원천은 지키며 합친다 */
  const reload = () => {
    if (reloading) return;
    const plan = reloadPlan(view);
    if (!plan.main && !plan.osm) return;
    const n = manualTries + 1;
    setManualTries(n);
    setReloading(true);
    const jobs: Promise<void>[] = [];
    if (plan.main) {
      jobs.push(
        fetchArea(areaUrl({ lat, lng, part: "main", name, buildYear, retry: `m${n}` }), "main")
          .then((d) => {
            setMain((prev) => mergeAreaPart(prev, d));
            setMainFailed(false);
          })
          .catch(() => undefined),
      );
    }
    if (plan.osm) {
      jobs.push(
        fetchArea(areaUrl({ lat, lng, part: "osm", st: plan.st, retry: `m${n}` }), "osm")
          .then((d) => {
            setOsm((prev) => mergeAreaPart(prev, d));
            setOsmFailed(false);
          })
          .catch(() => undefined),
      );
    }
    void Promise.all(jobs).finally(() => setReloading(false));
  };

  /* 유사 단지 — 닮음 점수가 없으면(이 단지 평당 실거래가를 모름) "주변 단지 · 가까운 순", 덜 닮은 단지(0.3 미만)는 뺀다 */
  const similar = useMemo(() => similarView(view.similar), [view.similar]);
  const similarLabel = status.similar !== "ok" ? LAYER_META.similar.label : similarLayerLabel(similar.basis);
  const layerLabel = (k: Layer) => (k === "similar" ? similarLabel : LAYER_META[k].label);

  /* 반경 원 — 같은 값이면 같은 객체(지도 쪽 effect 가 렌더마다 원과 손잡이를 다시 놓지 않게) */
  const circle = useMemo(() => ({ lat, lng, radiusM: radius }), [lat, lng, radius]);

  const markers = useMemo<MapMarkerData[]>(() => {
    const out: MapMarkerData[] = [{ id: "self", lat, lng, label: name.slice(0, 20), brandPin: true, selected: true }];
    if (layers.similar) {
      for (const c of similar.items) {
        if (c.distanceM > radius) continue;
        const sub = [
          c.avgPerPyeongKrw ? `평당 ${(c.avgPerPyeongKrw / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만` : null,
          c.buildYear ? `${c.buildYear}년` : null,
          formatStraightDistance(c.distanceM),
        ]
          .filter(Boolean)
          .join(" · ");
        out.push({ id: `cx:${c.regionName}:${c.name}`, lat: c.lat, lng: c.lng, label: c.name, pinColor: LAYER_META.similar.color, infoHtml: infoHtml(c.name, `${similarLayerLabel(similar.basis)} · ${sub}`) });
      }
    }
    if (layers.stations) {
      for (const s of view.stations) {
        if (s.distanceM > radius) continue;
        /* 공공 표의 역은 노선을 묶어 하나 — "2호선·신분당선 · 직선 450m · 도보 6분 이상" */
        out.push({ id: `st:${s.name}`, lat: s.lat, lng: s.lng, label: s.name, pinColor: LAYER_META.stations.color, infoHtml: infoHtml(s.name, `${s.line ?? "역"} · ${formatStraightDistance(s.distanceM)} · ${walkMinutesAtLeast(s.distanceM)}`) });
      }
    }
    if (layers.offices) {
      for (const o of view.offices) {
        if (o.distanceM > radius) continue;
        out.push({ id: `of:${o.name}`, lat: o.lat, lng: o.lng, label: o.name, pinColor: LAYER_META.offices.color, infoHtml: infoHtml(o.name, `${o.kind} · ${formatStraightDistance(o.distanceM)}`) });
      }
    }
    return out;
  }, [view, similar, layers, radius, lat, lng, name]);

  if (active === false) return null;

  /* 원천별 숫자 — 읽는 중 없음 · 못 읽었으면 "—"(0 이 아니다). 관공서 실패는 역 · 유사 단지 숫자에 번지지 않는다 */
  const count = (k: Layer) => areaPartCount(view, k, radius);
  const nearestStation = view.stations[0];
  const allFailed = status.similar === "failed" && status.stations === "failed" && status.offices === "failed";
  const showRetry = hasFailedPart(view);
  const stationsFromPublic = view.stationSource === "public" && status.stations === "ok";
  const showOsmCredit = osmShown(view);

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
        {/* key: media 로 폰·데스크톱 두 카드를 가르고, 반경이 바뀌면 단지를 가운데 두고 새로 그린다(끌어 옮긴 화면 되돌림) */}
        {active && (
          <NaverMap
            key={`${media}-${radius}`}
            markers={markers}
            center={{ lat, lng }}
            level={LEVEL_FOR_RADIUS[radius] ?? 5}
            showControls
            rounded={false}
            declutter
            circle={circle}
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
              {layerLabel(k)}
              {n === "—" ? (
                <span className="tabular-nums text-text-3">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">불러오기 실패</span>
                </span>
              ) : (
                n !== null && <span className="tabular-nums text-text-3">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <span className="t-caption text-text-3" aria-live="polite">
          {reloading
            ? "주변 정보 불러오는 중"
            : allFailed
              ? "주변 정보 불러오기 실패 · 잠시 후 다시"
              : nearestStation
                ? `가까운 역 ${stationLabel(nearestStation)} · ${formatStraightDistance(nearestStation.distanceM)}`
                : status.stations === "failed"
                  ? "역 불러오기 실패 · 잠시 후 다시"
                  : status.stations === "ok"
                    ? `반경 ${formatDistance(radius)} 안 역 없음`
                    : "주변 정보 불러오는 중"}
        </span>
        <span className="flex flex-wrap items-center gap-x-3">
          {/* [1052] 실패 뒤 다시 부르기 — 한 원천(유사 단지 · 역 · 관공서)이라도 못 읽었을 때만 · 그 원천의 요청만 다시 */}
          {showRetry && (
            <button
              type="button"
              onClick={reload}
              disabled={reloading}
              aria-busy={reloading}
              className="inline-flex min-h-[40px] items-center gap-1 t-sub font-bold text-primary disabled:text-text-3 lg:min-h-6"
            >
              <Icon name="repeat" size={13} />
              다시 불러오기
            </button>
          )}
          <Link
            href={`/map?lat=${lat}&lng=${lng}&z=16`}
            className="inline-flex min-h-[40px] items-center gap-1 t-sub font-bold text-primary no-underline lg:min-h-6"
          >
            <Icon name="map" size={13} />
            크게 보기 ›
          </Link>
        </span>
      </div>
      <p className="px-1 t-caption text-text-3">
        {status.similar === "ok" && similar.basis === "nearest"
          ? "주변 단지 = 가까운 순 · 비교할 실거래 없음"
          : "유사 단지 = 국토부 실거래 평당가·준공 연도가 닮은 순"}
        {status.similar === "failed" ? " (지금 못 읽음)" : ""} · 거리는 직선 거리
        {stationsFromPublic ? " · 역 = 공공데이터 전국도시철도역사정보표준데이터" : ""}
        {showOsmCredit
          ? ` · ${view.stationSource === "osm" && status.stations === "ok" ? "역·관공서" : "관공서"} © OpenStreetMap 기여자`
          : ""}
        {status.offices === "failed" ? " · 관공서 (지금 못 읽음)" : ""}
      </p>
    </section>
  );
}
