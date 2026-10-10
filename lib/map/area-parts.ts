/**
 * [1053 · 단지 위치 지도] 주변 정보를 두 요청으로 나눈 규칙 — 순수(단위 시험 대상).
 *
 * 왜 나눴나: 관공서를 묻는 OpenStreetMap(Overpass)은 거의 늘 실패하고(시간 초과 · 504 — 20시간에 약 90번) 최대 9초를 쓴다.
 * 예전 /api/complex/area 는 유사 단지와 Overpass 를 한 응답(Promise.allSettled)에 담아, 이미 읽은 유사 단지도 그만큼 기다렸다.
 *  · main (기본)      유사 단지(우리 표) + 역(공공데이터 poi_stations — 반경 bbox · 직선 거리 · 같은 역은 노선을 묶어 하나).
 *                     DB 만 읽는다 — 빠르다. 관공서는 pending 으로 알린다.
 *  · osm (part=osm)   관공서(Overpass). 화면이 main 을 받은 뒤 따로 부른다 — main 을 늦추지 않는다.
 *                     공공 역 표가 통째로 비었을 때만(main 의 stationSource = "osm") st=1 로 역도 여기서 받는다.
 * 원천별로 따로 실패한다 — 관공서 실패가 역 · 유사 단지를 "실패"로 만들지 않는다.
 */
import { similarView, type AreaComplex, type AreaData, type AreaLayer, type AreaOffice, type AreaStation } from "@/lib/map/area-pick";

export type AreaPartKey = "similar" | "stations" | "offices";
export type StationSource = "public" | "osm";
export type AreaPartName = "main" | "osm";

/** /api/complex/area 응답. 예전 모양(AreaData)을 그대로 품는다 — missing 의 값만 원천 이름(similar · stations · offices) */
export type AreaResponse = AreaData & {
  part: AreaPartName;
  /** main: 역을 어디서 읽나(public = 공공 표 · osm = 공공 표가 비어 part=osm 에서) · osm: st=1 이면 "osm", 아니면 null(역 안 담음) */
  stationSource: StationSource | null;
  /** 이 응답에 담지 않고 다른 요청(part=osm)으로 오는 원천 */
  pending: AreaPartKey[];
};

export const AREA_PART_KEYS: readonly AreaPartKey[] = ["similar", "stations", "offices"];

export function parseAreaPart(v: string | null | undefined): AreaPartName {
  return v === "osm" ? "osm" : "main";
}

/**
 * 역 원천 고르기 — 공공 표(poi_stations)를 먼저.
 *  · 반경 안에 줄이 있으면 공공.
 *  · 반경 안엔 없어도 표에 줄이 하나라도 있으면 공공(= "반경 안 역 없음"이 사실이다).
 *  · 표가 통째로 비었을 때만(tableHasRows = false) OpenStreetMap 으로 넘긴다. 모르면(null) 비었다고 보지 않는다 — 호출부가 확인한다.
 */
export function stationSourceFor(nearbyRows: number, tableHasRows: boolean | null): StationSource {
  if (nearbyRows > 0) return "public";
  return tableHasRows === false ? "osm" : "public";
}

export function mainPending(stationSource: StationSource | null): AreaPartKey[] {
  return stationSource === "osm" ? ["stations", "offices"] : ["offices"];
}

/**
 * CDN 캐시 — 정직하게:
 *  · 한 원천이라도 못 읽었으면 5분(일시 장애가 7일 동안 빈 지도로 굳지 않게).
 *  · main 인데 공공 역 표가 비어 OpenStreetMap 으로 넘겼으면 하루(표가 채워지면 하루 안에 공공 역으로 바뀐다).
 *  · 다 읽었으면 7일.
 */
export function areaCacheControl(r: Pick<AreaResponse, "part" | "missing" | "stationSource">): string {
  if (r.missing.length > 0) return "public, max-age=60, s-maxage=300";
  if (r.part === "main" && r.stationSource === "osm") return "public, max-age=600, s-maxage=86400";
  return "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400";
}

/* ── 화면 쪽 ──────────────────────────────────────────────────────────── */

export type PartStatus = "loading" | "ok" | "failed";

export type AreaView = {
  similar: AreaComplex[];
  stations: AreaStation[];
  offices: AreaOffice[];
  stationSource: StationSource | null;
  status: Record<AreaPartKey, PartStatus>;
};

export type AreaFetchState = {
  main: AreaResponse | null;
  /** main 요청 자체가 실패(네트워크 · 5xx) */
  mainFailed: boolean;
  osm: AreaResponse | null;
  /** osm 요청 자체가 실패 */
  osmFailed: boolean;
};

/** 두 응답 → 화면에 그릴 것과 원천별 상태. 관공서 상태는 역 · 유사 단지 상태에 섞이지 않는다 */
export function composeAreaView(s: AreaFetchState): AreaView {
  const { main, osm } = s;
  const similar: PartStatus = main ? (main.missing.includes("similar") ? "failed" : "ok") : s.mainFailed ? "failed" : "loading";
  const stationSource = main?.stationSource ?? null;

  let stations: PartStatus;
  let stationList: AreaStation[] = [];
  if (!main) {
    stations = s.mainFailed ? "failed" : "loading";
  } else if (main.missing.includes("stations")) {
    stations = "failed";
  } else if (stationSource === "public") {
    stations = "ok";
    stationList = main.stations;
  } else {
    const fromOsm = osm && osm.stationSource === "osm" ? osm : null;
    if (fromOsm) {
      stations = fromOsm.missing.includes("stations") ? "failed" : "ok";
      if (stations === "ok") stationList = fromOsm.stations;
    } else {
      stations = s.osmFailed ? "failed" : "loading";
    }
  }

  const offices: PartStatus = osm ? (osm.missing.includes("offices") ? "failed" : "ok") : s.osmFailed ? "failed" : "loading";

  return {
    similar: similar === "ok" && main ? main.similar : [],
    stations: stationList,
    offices: offices === "ok" && osm ? osm.offices : [],
    stationSource,
    status: { similar, stations, offices },
  };
}

/**
 * part=osm 을 지금 부를지 · 부르면 역도 담을지(st). main 이 오기(또는 실패하기) 전에는 부르지 않는다 —
 * 역 원천을 알아야 하고, 느린 Overpass 요청이 main 과 겨루지 않게. 실패한 뒤의 재요청은 "다시 불러오기"가 한다.
 */
export function osmFetchPlan(s: AreaFetchState): { st: boolean } | null {
  if (!s.main && !s.mainFailed) return null;
  if (s.osmFailed) return null;
  const st = s.main?.stationSource === "osm";
  if (!s.osm) return { st };
  if (st && s.osm.stationSource !== "osm") return { st: true };
  return null;
}

/** "다시 불러오기" — 못 읽은 원천이 든 요청만 다시 부른다 */
export function reloadPlan(view: AreaView): { main: boolean; osm: boolean; st: boolean } {
  const st = view.stationSource === "osm";
  const stationsFailed = view.status.stations === "failed";
  return {
    main: view.status.similar === "failed" || (stationsFailed && !st),
    osm: view.status.offices === "failed" || (stationsFailed && st),
    st,
  };
}

export function hasFailedPart(view: AreaView): boolean {
  return AREA_PART_KEYS.some((k) => view.status[k] === "failed");
}

/**
 * 다시 부른 응답을 같은 쪽(main · osm)의 앞 응답과 합친다 — 원천별로 읽은 쪽을 남긴다
 * (다시 부른 main 에서 유사 단지가 실패해도 처음 읽은 유사 단지를 지우지 않는다).
 */
export function mergeAreaPart(prev: AreaResponse | null, next: AreaResponse): AreaResponse {
  if (!prev || prev.part !== next.part) return next;
  const keepPrev = (k: AreaPartKey) => next.missing.includes(k) && !prev.missing.includes(k) && !prev.pending.includes(k);
  const sim = keepPrev("similar") ? prev : next;
  const st = keepPrev("stations") ? prev : next;
  const of = keepPrev("offices") ? prev : next;
  const from: Record<AreaPartKey, AreaResponse> = { similar: sim, stations: st, offices: of };
  return {
    ...next,
    similar: sim.similar,
    stations: st.stations,
    stationSource: st.stationSource,
    offices: of.offices,
    missing: AREA_PART_KEYS.filter((k) => from[k].missing.includes(k)),
  };
}

/**
 * 겹 단추 옆 숫자. 읽는 중이면 null(숫자 없음) · 못 읽었으면 "—"(0 이 아니다 — 0 은 "주변에 없다"로 읽힌다).
 * 유사 단지는 화면 목록과 같은 걸러진 수(similarView).
 */
export function areaPartCount(view: AreaView, layer: AreaLayer, radiusM: number): string | null {
  const st = view.status[layer];
  if (st === "loading") return null;
  if (st === "failed") return "—";
  const list = layer === "similar" ? similarView(view.similar).items : layer === "stations" ? view.stations : view.offices;
  return String(list.filter((x) => x.distanceM <= radiusM).length);
}

/** OpenStreetMap 에서 온 것이 화면에 있나 — 있을 때만 "© OpenStreetMap 기여자"를 적는다 */
export function osmShown(view: AreaView): boolean {
  return view.status.offices === "ok" || (view.stationSource === "osm" && view.status.stations === "ok");
}
