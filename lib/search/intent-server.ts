/**
 * [1026d · 검색] 검색어 → 검색 계획(지역·조건·이름) · 조건 검색 · 연관 검색 — /api/search/suggest · unified 공용(server-only).
 *
 *   planSearch(q)       — 조건을 떼고(lib/search/query-intent) 남은 낱말을 search_areas 로 지역/이름으로 가른다.
 *                         모드: filter(조건이 있다) · area(지역 이름만 쳤다 — "마포구" · "대치동") · name(단지 이름 — 예전 그대로)
 *   runFilteredSearch   — search_complexes_filtered(거래 많은 순 등 + 총 개수)
 *   loadSuggestWords    — [1026e] 연관 검색어 엔진: 다음 낱말(띄어 썼을 때) · 마지막 낱말 완성(search_next_words)
 *   loadChildren        — [보강] 동네로 좁히기(시군구 → 읍면동 · 시도/시 → 시군구, search_area_children)
 *   preParse            — [보강] DB 없이 조건만 먼저 읽는다 — 이름 검색을 지역 해석과 나란히 시작하게(왕복 한 번 줄임)
 *
 * 실패는 조용히 물러선다: search_areas 가 실패하면 지역 없이(이름 검색 그대로), 조건 검색이 실패하면 null 을 돌려
 * 부르는 쪽이 "지금 못 불러왔음" 으로 적는다(없음과 다르다).
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { expandComplexAlias } from "@/lib/search/normalize-query";
import { previewRowToHit, type ComplexSearchHit, type PreviewRow } from "@/lib/search/complex-preview-rows";
import {
  buildNextWords,
  completeWords,
  currentYearKst,
  hasFilter,
  nameKeys,
  normToken,
  parseSearchIntent,
  resolveScope,
  scopeQuery,
  type AreaBand,
  type AreaKind,
  type AreaRow,
  type IntentChip,
  type NextWord,
  type NextWordRow,
  type ParsedIntent,
  type RelatedQuery,
  type ResolvedScope,
  type SortKey,
} from "@/lib/search/query-intent";

export type { NextWord, RelatedQuery } from "@/lib/search/query-intent";

/** 드롭다운의 지역 한 줄 */
export interface AreaItem {
  key: string;
  kind: AreaKind;
  /** "서울 마포구" · "서울 송파구 잠실동" */
  label: string;
  /** 이 지역을 다시 검색할 말("마포구" · "송파구 잠실동") */
  q: string;
  complexCount: number;
  recentTradeCount: number;
  lat: number | null;
  lng: number | null;
}

/** 화면이 그리는 "검색 범위" — 어디를 · 어떤 조건으로 찾았는지 */
export interface SearchIntentInfo {
  mode: "filter" | "area" | "name";
  /** null = 전국(조건만 쳤을 때) 또는 지역 없음(이름 검색) */
  scope: { label: string; kind: AreaKind; q: string; lat: number | null; lng: number | null } | null;
  chips: IntentChip[];
  unsupported: IntentChip[];
  /** 조건·지역 검색의 전체 단지 수(이름 검색은 null) */
  total: number | null;
}

export interface FilterArgs {
  regions: string[] | null;
  dong: string | null;
  names: string[] | null;
  minYear: number | null;
  maxYear: number | null;
  minHouseholds: number | null;
  areaBands: AreaBand[] | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: SortKey;
}

export interface SearchPlan {
  parsed: ParsedIntent;
  scope: ResolvedScope | null;
  nameTokens: string[];
  mode: SearchIntentInfo["mode"];
  /** 이름 검색에 보낼 말(군말·반영 안 한 조건어를 뺀 원문, 약칭 펼침) */
  nameQuery: string;
  filter: FilterArgs | null;
  areas: AreaItem[];
  /** search_areas 를 못 물어봤다(지역 해석 없이 이름 검색으로 물러섬) */
  areasFailed: boolean;
  /** [1026e] search_areas 가 돌려준 행 — 앞 낱말만으로 다시 계획할 때(낱말 완성) 그대로 쓴다 */
  rows: AreaRow[];
  /** [1026e] 이 계획을 세운 검색어(공백 정리) */
  query: string;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toAreaRow(r: Record<string, unknown>): AreaRow {
  return {
    kind: String(r.kind) as AreaKind,
    areaKey: String(r.area_key ?? ""),
    label: String(r.label ?? ""),
    shortLabel: String(r.short_label ?? ""),
    regions: Array.isArray(r.regions) ? (r.regions as unknown[]).map(String) : [],
    dong: r.dong ? String(r.dong) : null,
    complexCount: num(r.complex_count) ?? 0,
    recentTradeCount: num(r.recent_trade_count) ?? 0,
    lat: num(r.lat),
    lng: num(r.lng),
    matchToken: r.match_token ? String(r.match_token) : null,
    matchRank: num(r.match_rank) ?? 1,
  };
}

function toAreaItem(r: AreaRow): AreaItem {
  return {
    key: `${r.kind}:${r.areaKey}`,
    kind: r.kind,
    label: r.label,
    q: scopeQuery(r),
    complexCount: r.complexCount,
    recentTradeCount: r.recentTradeCount,
    lat: r.lat,
    lng: r.lng,
  };
}

/** 드롭다운 지역 줄 — 정한 범위 먼저, 그다음 낱말이 그대로 맞은 곳, 앞글자 일치 순(최대 4) */
function pickAreaItems(rows: AreaRow[], scope: ResolvedScope | null, max = 4): AreaItem[] {
  const seen = new Set<string>();
  const out: AreaItem[] = [];
  const push = (r: AreaRow) => {
    const k = `${r.kind}:${r.areaKey}`;
    if (seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(toAreaItem(r));
  };
  if (scope) {
    const hit = rows.find((r) => r.label === scope.label && r.kind === scope.kind);
    if (hit) push(hit);
  }
  rows.filter((r) => r.matchRank >= 2).forEach(push);
  /* 앞글자만 맞은 곳은 범위를 못 정했을 때만("잠" → 잠실동·잠원동). 범위가 있으면 소음이다("서울" → 노원구·강서구 …) */
  if (!scope) rows.filter((r) => r.matchRank < 2).forEach(push);
  return out;
}

/** DB 없이 조건만 읽는다 — 조건이 없으면 이름 검색을 지역 해석과 나란히 먼저 시작할 수 있다 */
export function preParse(rawQ: string): { nameQuery: string; filtered: boolean } {
  const parsed = parseSearchIntent(rawQ, currentYearKst());
  return { nameQuery: expandComplexAlias(parsed.rest.join(" ").trim() || rawQ), filtered: hasFilter(parsed) };
}

/** 검색어 하나를 읽어 계획을 세운다(search_areas 1회) */
export async function planSearch(rawQ: string): Promise<SearchPlan> {
  const year = currentYearKst();
  const parsed = parseSearchIntent(rawQ, year);
  let rows: AreaRow[] = [];
  let areasFailed = false;
  const restText = parsed.rest.join(" ").trim();
  if (restText && /[가-힣]/.test(restText)) {
    const sb = getReadOnlySupabase();
    if (!sb) areasFailed = true;
    else {
      const { data, error } = await sb.rpc("search_areas", { p_q: restText, p_limit: 6 });
      if (error) {
        areasFailed = true;
        logger.warn("[search] search_areas 실패 — 지역 해석 없이 이름으로 찾습니다", { message: error.message });
      } else {
        rows = ((data as Record<string, unknown>[] | null) ?? []).map(toAreaRow);
      }
    }
  }
  return buildPlan(rawQ, parsed, rows, areasFailed);
}

/** 읽은 조건 + 지역 행 → 계획(DB 없음 — 앞 낱말 계획도 같은 행으로 세운다) */
function buildPlan(rawQ: string, parsed: ParsedIntent, rows: AreaRow[], areasFailed: boolean): SearchPlan {
  const restText = parsed.rest.join(" ").trim();
  const { scope, nameTokens } = resolveScope(parsed.rest, rows);
  const filtered = hasFilter(parsed);
  let mode: SearchPlan["mode"] = "name";
  if (filtered || (parsed.sort && scope)) mode = "filter";
  else if (scope && nameTokens.length === 0 && scope.rank >= 3) mode = "area";

  const names = nameTokens.map(normToken).filter((t) => t.length > 0);
  const filter: FilterArgs | null =
    mode === "name"
      ? null
      : {
          regions: scope?.regions ?? null,
          dong: scope?.dong ?? null,
          names: names.length ? names : null,
          minYear: parsed.minYear ?? null,
          maxYear: parsed.maxYear ?? null,
          minHouseholds: parsed.minHouseholds ?? null,
          areaBands: parsed.areaBands?.length ? parsed.areaBands : null,
          minPrice: parsed.minPrice ?? null,
          maxPrice: parsed.maxPrice ?? null,
          sort: parsed.sort ?? "trades",
        };
  /* 이름 검색: 군말·반영 안 한 조건어만 뺀다. 남는 게 없으면 원문 그대로 */
  const nameQuery = expandComplexAlias(restText || rawQ);
  return {
    parsed,
    scope,
    nameTokens,
    mode,
    nameQuery,
    filter,
    areas: pickAreaItems(rows, scope),
    areasFailed,
    rows,
    query: rawQ.replace(/\s+/g, " ").trim(),
  };
}

/** [1026e] 마지막 낱말을 뺀 계획 — 마지막 낱말이 아직 덜 친 말일 때만(이미 알아들은 지역·조건이면 null) */
export function headPlan(plan: SearchPlan): { head: SearchPlan; prefix: string } | null {
  const toks = plan.query.split(" ").filter(Boolean);
  if (toks.length < 2) return null;
  const last = toks[toks.length - 1];
  const n = normToken(last);
  if (!n) return null;
  if (plan.parsed.chips.some((c) => c.token.trim() === last)) return null;
  if (plan.rows.some((r) => r.matchToken === n && r.matchRank >= 3)) return null;
  const headQ = toks.slice(0, -1).join(" ");
  const head = buildPlan(headQ, parseSearchIntent(headQ, currentYearKst()), plan.rows, plan.areasFailed);
  return { head, prefix: last };
}

export function intentInfo(plan: SearchPlan, total: number | null): SearchIntentInfo {
  const s = plan.scope;
  return {
    mode: plan.mode,
    scope: s
      ? { label: s.label, kind: s.kind, q: scopeQuery(s), lat: s.lat, lng: s.lng }
      : null,
    chips: plan.parsed.chips,
    unsupported: plan.parsed.unsupported,
    total: plan.mode === "name" ? null : total,
  };
}

type FilteredRow = PreviewRow & {
  road_address: string | null;
  band_price_manwon: number | null;
  band_trade_count: number | null;
  total_count: number | null;
};

/** 조건 검색 — null = 못 물어봄(없음과 다르다) */
export async function runFilteredSearch(
  f: FilterArgs,
  limit: number,
  offset = 0,
): Promise<{ hits: ComplexSearchHit[]; total: number } | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("search_complexes_filtered", {
    p_regions: f.regions,
    p_dong: f.dong,
    p_names: f.names,
    p_min_year: f.minYear,
    p_max_year: f.maxYear,
    p_min_households: f.minHouseholds,
    p_area_bands: f.areaBands,
    p_min_price: f.minPrice,
    p_max_price: f.maxPrice,
    p_sort: f.sort,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    logger.warn("[search] search_complexes_filtered 실패", { message: error.message });
    return null;
  }
  const rows = (data as FilteredRow[] | null) ?? [];
  return {
    hits: rows.map((r) => ({
      ...previewRowToHit({ ...r, sim: null, exact: true }, false),
      roadAddress: r.road_address?.trim() || null,
      bandPriceManwon: num(r.band_price_manwon),
    })),
    total: num(rows[0]?.total_count) ?? 0,
  };
}

/** [1026e] 연관 검색어 엔진 — 이 계획의 단지 묶음 안에서 다음 낱말과 단지 수. 묶을 게 없으면(전국 전체·한 글자 이름) null */
export async function loadNextWords(plan: SearchPlan): Promise<{ total: number; words: NextWord[] } | null> {
  const s = plan.scope;
  const names = nameKeys(plan.nameTokens);
  const p = plan.parsed;
  if (!s && !hasFilter(p) && names.join("").length < 2) return null;
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("search_next_words", {
    p_regions: s?.regions ?? null,
    p_dong: s?.dong ?? null,
    p_names: names.length ? names : null,
    p_min_year: p.minYear ?? null,
    p_max_year: p.maxYear ?? null,
    p_min_households: p.minHouseholds ?? null,
    p_area_bands: p.areaBands?.length ? p.areaBands : null,
    p_min_price: p.minPrice ?? null,
    p_max_price: p.maxPrice ?? null,
    p_year: currentYearKst(),
  });
  if (error) {
    logger.warn("[search] search_next_words 실패", { message: error.message });
    return null;
  }
  return buildNextWords((data as NextWordRow[] | null) ?? [], p);
}

/**
 * [1026e] 연관 검색어 한 벌 — next(띄어 쓴 뒤 붙일 낱말) · complete(마지막 낱말 완성) · related(/search 칩: 검색어 + 낱말).
 * 둘 다 실패해도 빈 배열 — 검색 결과는 막지 않는다.
 */
export async function loadSuggestWords(
  plan: SearchPlan,
): Promise<{ next: NextWord[]; complete: NextWord[]; related: RelatedQuery[] }> {
  const hp = headPlan(plan);
  const [full, head] = await Promise.all([
    loadNextWords(plan).catch(() => null),
    hp ? loadNextWords(hp.head).catch(() => null) : Promise.resolve(null),
  ]);
  const next = (full?.words ?? []).slice(0, 10);
  return {
    next,
    complete: hp && head ? completeWords(head.words, hp.prefix) : [],
    related: next.slice(0, 8).map((w) => ({ q: `${plan.query} ${w.word}`, label: w.word, count: w.count, kind: w.kind })),
  };
}

/** [보강] 동네로 좁히기 — 지역만 쳤을 때 그 안의 아래 단계 지역(거래 많은 순). 조건이 있으면 조건 낱말을 이어 붙인다. */
export async function loadChildren(plan: SearchPlan, limit = 8): Promise<AreaItem[]> {
  const s = plan.scope;
  if (!s || s.dong || plan.nameTokens.length > 0) return [];
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("search_area_children", { p_regions: s.regions, p_dong: null, p_limit: limit });
  if (error) {
    logger.warn("[search] search_area_children 실패", { message: error.message });
    return [];
  }
  const cond = plan.parsed.chips.map((c) => c.token.trim()).join(" ");
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => {
    const item = toAreaItem(toAreaRow({ ...r, match_token: null, match_rank: 1 }));
    return cond ? { ...item, q: `${item.q} ${cond}` } : item;
  });
}
