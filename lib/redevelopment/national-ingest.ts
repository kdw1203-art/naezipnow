import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { NATIONAL_API_PATH, parseNationalRow, type NationalZone } from "./national";

/* [1149] 전국 정비구역 목록 적재 — odcloud 한 번에 1,000행씩(전체 약 1,600행 · 2~3회 호출). 키는 청약 자료와 같은 DATA_GO_KR_SERVICE_KEY.
   공표 주기는 연 1회라 주 1회 받아도 충분하다. 받은 것만 upsert(지우지 않는다 — 공표에서 빠진 구역은 fetched_at 이 낡는다). */

const BASE = "https://api.odcloud.kr/api";
const PER_PAGE = 1000;
const MAX_PAGES = 10;

export type NationalIngestResult = { ok: boolean; skipped?: boolean; reason?: string; fetched: number; upserted: number; total: number | null };

export function isNationalRedevConfigured(): boolean {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim());
}

export async function ingestNationalRedevZones(): Promise<NationalIngestResult> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!key) return { ok: false, skipped: true, reason: "DATA_GO_KR_SERVICE_KEY 미설정", fetched: 0, upserted: 0, total: null };
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정", fetched: 0, upserted: 0, total: null };

  const zones = new Map<string, NationalZone>();
  let total: number | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${BASE}/${NATIONAL_API_PATH}`);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(PER_PAGE));
    url.searchParams.set("returnType", "JSON");
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`전국 정비구역 조회 실패(HTTP ${res.status})`);
    const json = (await res.json()) as { totalCount?: number; currentCount?: number; data?: unknown[] };
    if (typeof json.totalCount === "number") total = json.totalCount;
    const rows = Array.isArray(json.data) ? json.data : [];
    for (const r of rows) {
      const z = parseNationalRow(r);
      if (z) zones.set(z.id, z);
    }
    if (rows.length < PER_PAGE) break;
  }
  if (zones.size === 0) return { ok: false, reason: "응답에 구역 없음", fetched: 0, upserted: 0, total };

  const now = new Date().toISOString();
  const all = [...zones.values()].map((z) => ({
    id: z.id,
    sido: z.sido,
    sigungu: z.sigungu,
    name: z.name,
    stage: z.stage,
    project_type: z.projectType,
    operator: z.operator,
    households: z.households,
    fetched_at: now,
  }));
  let upserted = 0;
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const { error } = await sb.from("redev_national_zones").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`redev_national_zones 저장 실패: ${error.message}`);
    upserted += chunk.length;
  }
  return { ok: true, fetched: zones.size, upserted, total };
}
