/**
 * [1022 · 면적대별 검색·비교] 면적대별 실거래가(/analysis/price)의 순수 규칙 — 테스트 대상(tests/unit/price-1022.test.ts).
 *
 * 지시 2: "면적대별 실거래가는 검색기능이 추가되어 쉽게쉽게 검색하고, 타단지 비교까지 할수있도록"
 *  ① 지역 검색 — RegionSelect 가 쓰던 같은 배열(실거래 셀이 있는 지역만)을 타이핑으로 거른다(filterRegions).
 *  ② 타 단지 비교 — 최대 4곳. 선택은 URL `?cmp=id1,id2`(replaceState 만) + localStorage(readStoredIds/…).
 *     표의 칸은 기존 `/api/complex/[id]/detail` 응답의 areaBands(lib/complex/complex-store getAreaBands —
 *     면적대마다 최근가·건수·평균·최근 계약월)만 옮겨 적는다(compareRowFromDetail). 없는 칸은 null(화면 "—").
 *     새 계산은 없다 — 라벨 매칭은 lib/market/bands AREA_BANDS(단일 진실 공급원) 그대로.
 * 이 파일은 브라우저 전역·서버 전용 모듈을 만지지 않는다(클라이언트 부품·테스트가 같이 쓴다).
 */
import { AREA_BANDS } from "@/lib/market/bands";
import { formatKrwManwon } from "@/lib/format/krw";

export const COMPARE_MAX = 4;
export const COMPARE_PARAM = "cmp";
/** localStorage 키 — 최근 본 단지(nuguzip-recent-complexes)와 같은 접두 */
export const COMPARE_STORAGE_KEY = "nuguzip-price-compare";

export type RegionOption = { slug: string; name: string; txCount: number };

/** 공백·대소문자를 무시한 부분 일치("강남" → 서울 강남구 · "gangnam" → 슬러그). 빈 입력이면 앞에서 limit 개. */
export function filterRegions(regions: readonly RegionOption[], query: string, limit = 8): RegionOption[] {
  const q = norm(query);
  if (!q) return regions.slice(0, limit);
  const starts: RegionOption[] = [];
  const includes: RegionOption[] = [];
  for (const r of regions) {
    const name = norm(r.name);
    const slug = norm(r.slug);
    /* 시·구 이름만 친 것("강남구")도 앞 일치로 — "서울 강남구" 는 공백을 지우면 "서울강남구" 라 뒤쪽 일치가 된다 */
    const parts = r.name.split(/\s+/).map(norm);
    if (name.startsWith(q) || slug.startsWith(q) || parts.some((p) => p.startsWith(q))) starts.push(r);
    else if (name.includes(q) || slug.includes(q)) includes.push(r);
  }
  return [...starts, ...includes].slice(0, limit);
}

function norm(s: string): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

/** `?cmp=a,b,c` → id 목록(공백 제거 · 중복 제거 · 최대 COMPARE_MAX) */
export function parseCompareParam(search: string): string[] {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get(COMPARE_PARAM);
  } catch {
    raw = null;
  }
  return uniqueIds((raw ?? "").split(","));
}

/** id 목록 → 검색 문자열(다른 파라미터는 그대로, 비면 cmp 를 뗀다). 반환은 "?…" 또는 "" */
export function withCompareParam(search: string, ids: readonly string[]): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const clean = uniqueIds(ids);
  if (clean.length) sp.set(COMPARE_PARAM, clean.join(","));
  else sp.delete(COMPARE_PARAM);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** 담기 — 이미 있으면 그대로, 가득(4)이면 그대로(호출측이 알린다) */
export function addCompareId(ids: readonly string[], id: string): string[] {
  const clean = uniqueIds(ids);
  const v = id.trim();
  if (!v || clean.includes(v) || clean.length >= COMPARE_MAX) return clean;
  return [...clean, v];
}

export function removeCompareId(ids: readonly string[], id: string): string[] {
  return uniqueIds(ids).filter((x) => x !== id);
}

export function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const v = (raw ?? "").trim();
    /* 쉼표·공백·URL 조각이 아닌 id 만 — base64url(name-id)·kapt.* */
    if (!v || !/^[A-Za-z0-9._-]+$/.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

/** localStorage 문자열 → id 목록(깨진 값은 빈 목록) */
export function parseStoredIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? uniqueIds(parsed.filter((x): x is string => typeof x === "string")) : [];
  } catch {
    return [];
  }
}

/* ── 표 한 행 — /api/complex/[id]/detail 응답에서 옮겨 적는다 ───────────────────────────── */

/** detail 응답 중 여기서 읽는 필드만(응답 모양은 app/api/complex/[id]/detail/route.ts) */
export type DetailLike = {
  complex?: { name?: string | null; city?: string | null; district?: string | null } | null;
  areaBands?: Array<{
    label?: string | null;
    count?: number | null;
    latestManwon?: number | null;
    latestYm?: string | null;
    avgManwon?: number | null;
  }> | null;
  mode?: string | null;
};

export type CompareCell = {
  /** 최근 실거래가 — "8.5억" */
  latestText: string;
  /** 표본 평균 — "8.2억"(없으면 null) */
  avgText: string | null;
  count: number;
  /** "202608" */
  latestYm: string;
};

export type CompareRow = {
  id: string;
  name: string;
  /** "서울 강남구"(없으면 "") */
  region: string;
  /** AREA_BANDS 순서 · 그 면적대 실거래가 없으면 null */
  cells: (CompareCell | null)[];
  /** 면적대 전체에서 가장 최근 계약월 "2026.08"(없으면 null) */
  latestLabel: string | null;
};

/** 만원 → "8.5억"(0.1 단위, 지역 카드와 같은 "short") */
function manText(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  return formatKrwManwon(manwon, { style: "short" });
}

/** "202607" → "2026.07" */
export function ymDot(ym: string | null | undefined): string | null {
  if (!ym || ym.length < 6) return null;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/**
 * detail 응답 → 표 한 행. 단지를 못 찾았으면(mode "not_found" · complex 없음) null.
 * 면적대 칸은 라벨로 AREA_BANDS 와 맞춘다(둘 다 lib/market/bands 의 label). 최근가가 없는 칸은 null.
 */
export function compareRowFromDetail(id: string, data: DetailLike, fallbackName = ""): CompareRow | null {
  const c = data.complex ?? null;
  if (!c || data.mode === "not_found") return null;
  const bands = Array.isArray(data.areaBands) ? data.areaBands : [];
  const byLabel = new Map(bands.map((b) => [b.label ?? "", b]));
  let latestYm = "";
  const cells = AREA_BANDS.map<CompareCell | null>((band) => {
    const b = byLabel.get(band.label);
    const latestText = manText(b?.latestManwon);
    if (!b || !latestText) return null;
    const ym = String(b.latestYm ?? "");
    if (ym > latestYm) latestYm = ym;
    return {
      latestText,
      avgText: manText(b.avgManwon),
      count: Number(b.count ?? 0) || 0,
      latestYm: ym,
    };
  });
  return {
    id,
    name: (c.name ?? "").trim() || fallbackName || "단지",
    region: [c.city, c.district].filter(Boolean).join(" "),
    cells,
    latestLabel: ymDot(latestYm),
  };
}

/** 표 머리 — 면적대 5칸 라벨(AREA_BANDS 순서) */
export const COMPARE_BAND_LABELS: readonly string[] = AREA_BANDS.map((b) => b.label);
