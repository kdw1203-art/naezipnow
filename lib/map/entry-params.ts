/**
 * [1007] 지도(/map)의 진입 파라미터·개인분 덧입히기 — 순수 함수.
 *
 * 왜: /map 은 하루 911회(24h 실측) 서버리스 함수를 띄웠는데 사람 방문은 한 자릿수였다.
 * 페이지가 `auth()`(내 노트 수·예산 프리필·내 노트 레이어 기본값)와 `searchParams`(region·
 * complexId·noteId·apt·lat·lng·z·type·priceMin·priceMax·q·district)를 서버에서 읽어
 * force-dynamic 이었기 때문. 공유분(좌표·시세·세대수 — 10분 unstable_cache)만 ISR(10분)에
 * 싣고, 진입값 해석은 여기(순수·테스트)로 옮겨 app/map/MapClientLazy.tsx 가 마운트 뒤
 * window.location 을 넘겨 부른다. 값의 뜻·범위는 예전 app/map/page.tsx 와 같다.
 */

export type MapEntryParams = {
  region: string | null;
  /** ?district= — property-actions 가 만들어 보내는 값(예전엔 아무도 안 읽어 죽은 링크였다) */
  district: string | null;
  /** ?q= — 지역명이면 서버 대신 여기서 포커스, 단지명이면 map-client 의 suggest 경로가 이어받는다 */
  q: string | null;
  complexId: string | null;
  noteId: string | null;
  apt: string | null;
  /** ?type=sale|jeonse|monthly — 매물 레이어 거래유형(그 밖의 값은 null) */
  listingType: "sale" | "jeonse" | "monthly" | null;
  /** 억 단위 가격 범위(0~200 밖·숫자 아님은 null) */
  priceMinEok: number | null;
  priceMaxEok: number | null;
  /** ?lat&lng — 한반도 범위(33~39 · 124~132) 밖은 null */
  coordFocus: { lat: number; lng: number } | null;
  /** ?z — 6~19 정수, 밖은 null */
  initialLevel: number | null;
};

function firstParam(v: string | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/* `?lat=&lng=` — `?region=` 이 안 풀릴 때의 폴백 좌표(legal_regions 252행 중 183행이 좌표가 없다).
   범위를 한반도로 제한하는 건 주소로 들어오는 값이라서다 — 숫자가 아니거나 지구 반대편이면
   조용히 무시하는 편이 빈 바다를 띄우는 것보다 낫다. */
export function parseCoordFocus(
  latRaw: string | null,
  lngRaw: string | null,
): { lat: number; lng: number } | null {
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

export function parseEokParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

export function parseMapEntryParams(search: string | URLSearchParams): MapEntryParams {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const typeParam = firstParam(sp.get("type"));
  /* ?z= — 지도 상태 공유용 줌 레벨. 클라이언트가 idle 마다 URL 에 lat/lng/z 를 써 두므로
     (공유·뒤로가기), 열 때 같은 배율로 복원한다. 범위 밖은 무시. */
  const zRaw = Number(firstParam(sp.get("z")));
  return {
    region: firstParam(sp.get("region")),
    district: firstParam(sp.get("district")),
    q: firstParam(sp.get("q")),
    complexId: firstParam(sp.get("complexId")),
    noteId: firstParam(sp.get("noteId")),
    apt: firstParam(sp.get("apt")),
    listingType:
      typeParam === "sale" || typeParam === "jeonse" || typeParam === "monthly" ? typeParam : null,
    priceMinEok: parseEokParam(firstParam(sp.get("priceMin"))),
    priceMaxEok: parseEokParam(firstParam(sp.get("priceMax"))),
    coordFocus: parseCoordFocus(firstParam(sp.get("lat")), firstParam(sp.get("lng"))),
    initialLevel: Number.isFinite(zRaw) && zRaw >= 6 && zRaw <= 19 ? Math.round(zRaw) : null,
  };
}

export type MapEntryBudget = {
  type: "sale" | "jeonse";
  minEok: number | null;
  maxEok: number | null;
  label: string | null;
};

/** URL 에 가격·유형이 있으면 그것이 예산 — 없으면 null(로그인 사용자의 온보딩 예산이 뒤를 잇는다) */
export function budgetFromEntry(p: MapEntryParams): MapEntryBudget | null {
  if (p.priceMinEok == null && p.priceMaxEok == null && !p.listingType) return null;
  return {
    type: p.listingType === "jeonse" ? "jeonse" : "sale",
    minEok: p.priceMinEok,
    maxEok: p.priceMaxEok,
    label: null,
  };
}

/** 예전 page.tsx 의 initialListingType 규칙 — URL type 이 우선, 없고 가격만 있으면 예산의 type */
export function listingTypeFromEntry(
  p: MapEntryParams,
  budget: MapEntryBudget | null,
): string | null {
  if (p.listingType) return p.listingType;
  if (p.priceMinEok != null || p.priceMaxEok != null) return budget?.type ?? null;
  return null;
}

/** 지역 포커스 후보 — 이름 우선순위는 예전과 같다(region → 노트의 지역 → district → q) */
export function regionForFocus(p: MapEntryParams, regionFromNote: string | null): string | null {
  return p.region || regionFromNote || p.district || p.q || null;
}

/** 단지명 정규화 — 내 노트 apt_name 매칭 기준(공백·후행 "아파트" 제거) */
export function normalizeComplexName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

/** 내 노트의 단지명 목록 → 정규화 이름별 건수 */
export function countNotesByName(aptNames: ReadonlyArray<string | null | undefined>): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of aptNames) {
    const key = normalizeComplexName(raw ?? "");
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * 공유 단지 목록에 **내** 노트 수를 덧입힌다 — 예전 loadDanjiFromDb 와 같은 규칙.
 * 공유분(캐시)에는 사용자별 데이터를 한 조각도 섞지 않는다(A 의 노트 수가 B 의 화면에 새는 사고);
 * 이 함수는 브라우저 안에서 그 사람 것만 덧입힌다.
 */
export function overlayMyNoteCounts<T extends { name: string; note: string | null }>(
  items: T[],
  counts: Map<string, number>,
): T[] {
  if (counts.size === 0) return items;
  return items.map((it) => {
    const n = counts.get(normalizeComplexName(it.name)) ?? 0;
    return n > 0 ? { ...it, note: `노트 ${n}건` } : it;
  });
}
