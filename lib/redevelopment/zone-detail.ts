/**
 * [1027] 정비사업 구역 상세(/redevelopment/[id])가 쓰는 순수 계산 — tests/unit/redev-zone-1027.test.ts.
 *
 * 사실 경계:
 *  · 구역 좌표는 "대표점 근사값"이다(lib/redevelopment/seed.ts). 그래서 주변 단지는 **거리순이 아니라
 *    거래 많은 순**으로 싣고 단지별 거리는 적지 않는다 — 근사 좌표에서 잰 수십 미터 차이를 순서로
 *    삼으면 정밀한 척하는 숫자가 된다. 가까운 구역은 **1km 구간**으로만 적고 그 구간 순서로 늘어놓는다
 *    ("1km 안"·"1~2km"·"2~3km") — 양쪽 좌표가 다 근사라(단지 좌표로 고친 4곳이 0.5~1km 움직였다)
 *    "약 0.4km" 같은 숫자와 1m 차이로 갈리는 순서는 가진 정밀도를 넘는다.
 *  · 관련 기사 찾기는 구역 이름 전체(도시 이름·괄호 풀이만 뗀 것, 4글자 이상)로만 한다. 짧으면 찾지 않는다.
 */
import { haversineDistanceM } from "@/lib/map/geo-haversine";
import type { RedevelopmentProject } from "./types";

/** 주변 단지를 모으는 반경(m) — 구역 대표점 기준 */
export const ZONE_NEARBY_COMPLEX_RADIUS_M = 1000;
/** 가까운 구역으로 치는 반경(m) */
export const ZONE_NEARBY_ZONE_RADIUS_M = 3000;

export type ComplexPriceRow = {
  regionName: string;
  complexName: string;
  lat: number;
  lng: number;
  /** 매매 실거래 건수(집계 뷰 기간 전체) */
  txCount: number;
  /** 평단가 평균(원/평) */
  avgPerPyeongKrw: number | null;
  /** 거래금액 평균(원) */
  avgKrw: number | null;
  /** 평균 전용면적(㎡) */
  avgAreaM2: number | null;
  firstYm: string | null;
  latestYm: string | null;
};

/** 반경 안 단지를 거래 많은 순으로(같으면 이름순 — 순서가 요청마다 흔들리지 않게) */
export function pickNearbyComplexes<T extends ComplexPriceRow>(
  rows: readonly T[],
  center: { lat: number; lng: number },
  radiusM: number = ZONE_NEARBY_COMPLEX_RADIUS_M,
  limit = 8,
): T[] {
  return rows
    .filter(
      (r) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        r.txCount > 0 &&
        haversineDistanceM(center.lat, center.lng, r.lat, r.lng) <= radiusM,
    )
    .sort(
      (a, b) =>
        b.txCount - a.txCount ||
        `${a.regionName} ${a.complexName}`.localeCompare(`${b.regionName} ${b.complexName}`, "ko-KR"),
    )
    .slice(0, Math.max(0, limit));
}

export type NearbyZone = { project: RedevelopmentProject; distanceM: number };

/** 1km 구간 번호 — 0 = 1km 안, 1 = 1~2km … */
export function zoneDistanceBand(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) return 0;
  return Math.floor(distanceM / 1000);
}

/** "1km 안" · "1~2km" · "2~3km" — 1km 구간. 양쪽 좌표가 근사라 그보다 잘게 적지 않는다. */
export function zoneDistanceLabel(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) return "";
  const band = zoneDistanceBand(distanceM);
  return band === 0 ? "1km 안" : `${band}~${band + 1}km`;
}

/** 자기 자신을 뺀 가까운 구역 — 1km 구간이 가까운 순, 같은 구간 안에서는 이름순(1m 차이로 순서가 갈리지 않게) */
export function pickNearbyZones(
  target: Pick<RedevelopmentProject, "id" | "lat" | "lng">,
  all: readonly RedevelopmentProject[],
  radiusM: number = ZONE_NEARBY_ZONE_RADIUS_M,
  limit = 6,
): NearbyZone[] {
  return all
    .filter((p) => p.id !== target.id && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ project: p, distanceM: haversineDistanceM(target.lat, target.lng, p.lat, p.lng) }))
    .filter((z) => z.distanceM <= radiusM)
    .sort(
      (a, b) =>
        zoneDistanceBand(a.distanceM) - zoneDistanceBand(b.distanceM) ||
        a.project.name.localeCompare(b.project.name, "ko-KR"),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * ISO 시각 → "YYYY.MM.DD"(한국 날짜). 서버(UTC)와 브라우저(어느 시간대든)가 같은 글자를 낸다 —
 * 브라우저 시간대로 적으면 서버가 그린 HTML 과 어긋나고(하이드레이션), 같은 화면 머리의 날짜와도 달라진다.
 */
export function kstDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
}

const CITY_PREFIX_RE = /^(서울|인천|부산|대구|대전|광주|울산|세종|성남|수원|안양|부천|고양|광명|안산|용인|화성|의정부|남양주|하남|군포|의왕|시흥|김포|파주|구리)\s+/;

/**
 * 기사에서 이 구역을 찾을 낱말. 앞의 도시 이름과 괄호 안 풀이(사업 방식·주구)를 떼고 공백을 지운다.
 * 괄호 안이 "6단지" 처럼 이름의 일부면 붙인다("목동신시가지(6단지)" → "목동신시가지6단지").
 * 뒤의 사업 종류 말("모아타운"·"재건축")은 떼지 않는다 — 떼면 "면목동"·"원곡" 같은 동 이름만 남아
 * 아무 기사에나 걸린다. 4글자 미만이면 null(찾지 않는다).
 */
export function zoneNewsKey(name: string): string | null {
  const core = (name ?? "")
    .replace(/\((\d+단지)\)/g, "$1")
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .replace(CITY_PREFIX_RE, "")
    .replace(/\s+/g, "");
  return core.length >= 4 ? core : null;
}

/** 제목·본문에 그 낱말이 들어 있는 글(공백 무시) */
export function matchZoneNews<T extends { title: string; body: string }>(
  posts: readonly T[],
  zoneName: string,
): T[] {
  const key = zoneNewsKey(zoneName);
  if (!key) return [];
  return posts.filter((p) => `${p.title ?? ""} ${p.body ?? ""}`.replace(/\s+/g, "").includes(key));
}
