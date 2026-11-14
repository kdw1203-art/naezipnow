/* [1183 · 정비구역 수집] 부산광역시 정비사업 정보(공공데이터포털 3069406 · 자동승인 · 실시간) — 구역마다 "위치"(대표 지번, 예: "양정동 271-2")를 준다.
   전국 목록(국토교통부)에는 위치가 없어 부산 211곳이 지도에 못 올랐다. 이 자료의 지번을 지오코더에 물어 나온 좌표만 찍는다(위치를 지어내지 않는다).
   순수 규칙(server-only 없음) — 응답 꼴은 실호출로 확인하지 못해 느슨하게 읽는다: 어디에 있든 areaName 을 가진 객체 배열을 찾는다. */

export const BUSAN_REDEV_URL = "https://apis.data.go.kr/6260000/MaintenanceBusinessStatus1/getMaintenanceBusiness1";
export const BUSAN_REDEV_DATASET_URL = "https://www.data.go.kr/data/3069406/openapi.do";

export type BusanZone = { name: string; location: string | null; step: string | null; households: number | null };

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return t ? t : null;
}

/** 응답 어디에 있든 areaName 을 가진 객체들을 모은다(깊이 6까지) */
export function findBusanItems(json: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || json == null || typeof json !== "object") return [];
  if (Array.isArray(json)) {
    const direct = json.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x) && "areaName" in (x as object));
    if (direct.length > 0) return direct;
    return json.flatMap((x) => findBusanItems(x, depth + 1));
  }
  const o = json as Record<string, unknown>;
  if ("areaName" in o) return [o];
  return Object.values(o).flatMap((v) => findBusanItems(v, depth + 1));
}

/** 전체 건수 — 어디에 있든 totalCount */
export function findBusanTotal(json: unknown, depth = 0): number | null {
  if (depth > 6 || json == null || typeof json !== "object") return null;
  if (!Array.isArray(json)) {
    const t = (json as Record<string, unknown>).totalCount;
    const n = typeof t === "number" ? t : typeof t === "string" ? Number.parseInt(t, 10) : NaN;
    if (Number.isFinite(n)) return n;
  }
  for (const v of Object.values(json as Record<string, unknown>)) {
    const n = findBusanTotal(v, depth + 1);
    if (n != null) return n;
  }
  return null;
}

export function parseBusanItem(o: Record<string, unknown>): BusanZone | null {
  const name = str(o.areaName);
  if (!name) return null;
  const h = Number.parseInt(String(o.generationJoo ?? "").replace(/[^\d]/g, ""), 10);
  return { name, location: str(o.location), step: str(o.step), households: Number.isFinite(h) && h > 0 ? h : null };
}
