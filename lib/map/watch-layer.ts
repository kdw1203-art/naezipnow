/* [1023 · 지도] 관심 단지 레이어 — 좌표 붙이기 · 뷰포트 한 줄 문구. 순수 함수(테스트: tests/unit/map-1023.test.ts).
   좌표는 지도가 이미 들고 있는 단지 데이터(SSR 시드·뷰포트 인기·클러스터 포인트)에서만 찾는다 —
   새 조회·새 계산 없음. 못 찾은 단지는 숨기지 않고 개수로 말한다. */

export interface WatchCoordSource {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface WatchItemLite {
  complexId: string;
  complexName: string;
}

export interface WatchPlaced {
  complexId: string;
  name: string;
  lat: number;
  lng: number;
  /** 좌표를 빌려 온 지도 데이터의 id — 같은 자리 마커에 ★ 를 얹을 때 쓴다 */
  sourceId: string;
}

/** 이름 비교 키 — 공백·괄호 안(동·차수 표기) 무시, 대소문자 무시 */
export function watchNameKey(name: string): string {
  return name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 관심 단지 목록에 좌표를 붙인다. id 일치가 먼저, 없으면 이름 일치(옛 이름 id·새 kapt id 가 섞여 있어
 * id 만으로는 같은 단지를 못 찾는 경우 — RecentComplexes 의 dedupe 와 같은 사정). 같은 단지가 pool 에
 * 여러 번 있으면 먼저 온 것을 쓴다.
 */
export function placeWatchItems(
  items: readonly WatchItemLite[],
  pool: readonly WatchCoordSource[],
): { placed: WatchPlaced[]; unplaced: number } {
  const byId = new Map<string, WatchCoordSource>();
  const byName = new Map<string, WatchCoordSource>();
  for (const p of pool) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (!byId.has(p.id)) byId.set(p.id, p);
    const k = watchNameKey(p.name);
    if (k && !byName.has(k)) byName.set(k, p);
  }
  const placed: WatchPlaced[] = [];
  const seen = new Set<string>();
  let unplaced = 0;
  for (const it of items) {
    if (!it.complexId || seen.has(it.complexId)) continue;
    seen.add(it.complexId);
    const src = byId.get(it.complexId) ?? byName.get(watchNameKey(it.complexName));
    if (!src) {
      unplaced += 1;
      continue;
    }
    placed.push({
      complexId: it.complexId,
      name: it.complexName || src.name,
      lat: src.lat,
      lng: src.lng,
      sourceId: src.id,
    });
  }
  return { placed, unplaced };
}

/** 뷰포트 한 줄 — "단지 N" (+ 서버가 센 실거래 건수가 있을 때만 " · 거래 N건"). 실패는 "—". */
export function viewportCountLabel(
  complexCount: number,
  txCount: number,
  failed: boolean,
): string {
  if (failed) return "단지 —";
  const head = `단지 ${complexCount.toLocaleString("ko-KR")}`;
  return txCount > 0 ? `${head} · 거래 ${txCount.toLocaleString("ko-KR")}건` : head;
}
