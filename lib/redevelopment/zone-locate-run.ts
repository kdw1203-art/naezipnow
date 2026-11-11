import "server-only";
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isNaverMapsRestConfigured, naverGeocode } from "@/lib/map/naver-maps-rest";
import { NATIONAL_DATASET_URL } from "./national";
import {
  LOCATE_SOURCE,
  firstLot,
  hitInSigungu,
  locateSummary,
  locateSummaryBy,
  lotQuery,
  nationalStageKey,
  nationalTypeKey,
  pickComplexPoint,
  pickUpisLot,
  sameZoneKey,
  shortSido,
  zoneNameKey,
  type ComplexPoint,
  type UpisPlace,
} from "./zone-locate";

/* [1152] 서울 정비구역에 대표 지번 좌표를 붙여 redevelopment_projects(지도가 읽는 표)에 싣는다.
   이미 실린 구역은 좌표를 다시 묻지 않고 단계 · 세대수만 새로 적는다. 못 찾은 구역은 싣지 않는다(다음 실행이 다시 묻는다).
   손으로 정리한 40곳(seed-*)과 같은 구역은 건너뛴다 — 한 구역에 점 두 개가 찍히지 않게. */

const SIDO = "서울특별시";
const ID_PREFIX = "nat-";

export type ZoneLocateResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  zones: number;
  kept: number;
  located: number;
  notFound: number;
  noAddress: number;
  duplicate: number;
  offMap: number;
  /** [1154] 같은 이름 단지 좌표로 찍은 수 */
  byComplex: number;
  budgetExhausted: boolean;
};

type ZoneRow = { id: string; sigungu: string; name: string; stage: string | null; project_type: string | null; operator: string | null; households: number | null };
type ProjRow = { id: string; name: string; sido: string; sigungu: string; lat: number; lng: number; address: string | null };

export function locateId(zoneId: string): string {
  return `${ID_PREFIX}${createHash("sha1").update(zoneId).digest("hex").slice(0, 14)}`;
}

async function geocodeLot(query: string, sigungu: string): Promise<{ lat: number; lng: number } | null> {
  const hits = await naverGeocode(query, 3, { fresh: true });
  const hit = hits.find((h) => hitInSigungu(h.jibunAddress ?? h.address, sigungu) || hitInSigungu(h.address, sigungu));
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

export async function locateSeoulZones(opts: { budgetMs?: number } = {}): Promise<ZoneLocateResult> {
  const empty = { zones: 0, kept: 0, located: 0, notFound: 0, noAddress: 0, duplicate: 0, offMap: 0, byComplex: 0, budgetExhausted: false };
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정", ...empty };
  if (!isNaverMapsRestConfigured()) return { ok: false, skipped: true, reason: "지오코딩 키 미설정", ...empty };
  const deadline = Date.now() + (opts.budgetMs ?? 90_000);

  const { data: zData, error: zErr } = await sb.from("redev_national_zones").select("id,sigungu,name,stage,project_type,operator,households").eq("sido", SIDO).limit(3000);
  if (zErr) throw new Error(`redev_national_zones 조회 실패: ${zErr.message}`);
  const zones = (zData ?? []) as ZoneRow[];

  const upis: UpisPlace[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await sb.from("seoul_upis_records").select("rgn_nm,pstn_nm,sigungu,code_date").eq("service", "upisRebuild").order("rpt_mng_cd").range(from, from + 999);
    if (error) throw new Error(`seoul_upis_records 조회 실패: ${error.message}`);
    const rows = (data ?? []) as { rgn_nm: string | null; pstn_nm: string | null; sigungu: string | null; code_date: string | null }[];
    for (const r of rows) if (r.rgn_nm) upis.push({ name: r.rgn_nm, place: r.pstn_nm, sigungu: r.sigungu, date: r.code_date });
    if (rows.length < 1000) break;
  }

  const { data: pData, error: pErr } = await sb.from("redevelopment_projects").select("id,name,sido,sigungu,lat,lng,address").limit(5000);
  if (pErr) throw new Error(`redevelopment_projects 조회 실패: ${pErr.message}`);
  const projects = (pData ?? []) as ProjRow[];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const curated = projects.filter((p) => !p.id.startsWith(ID_PREFIX) && p.sido === shortSido(SIDO));

  /* [1154] 단지 좌표(실거래 주소로 지오코딩해 둔 값) — 자치구별. 못 읽어도 지번 경로는 그대로 간다 */
  const complexByGu = new Map<string, ComplexPoint[]>();
  {
    const { data } = await sb.from("complex_geocode").select("region_name,complex_name,lat,lng").like("region_name", `${shortSido(SIDO)} %`).eq("status", "ok").limit(20_000);
    for (const c of (data ?? []) as { region_name: string; complex_name: string; lat: number | null; lng: number | null }[]) {
      if (c.lat == null || c.lng == null) continue;
      const gu = c.region_name.split(/\s+/).slice(1).join(" ");
      complexByGu.set(gu, [...(complexByGu.get(gu) ?? []), { name: c.complex_name, lat: c.lat, lng: c.lng }]);
    }
  }

  const r: ZoneLocateResult = { ok: true, ...empty, zones: zones.length };
  const now = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  const todo: { z: ZoneRow; id: string; query: string; address: string; typeKey: string; stageKey: string }[] = [];

  for (const z of zones) {
    const typeKey = nationalTypeKey(z.project_type);
    const stageKey = nationalStageKey(z.stage);
    if (!typeKey || !stageKey) { r.offMap += 1; continue; }
    const key = zoneNameKey(z.name);
    if (curated.some((p) => p.sigungu === z.sigungu && sameZoneKey(key, zoneNameKey(p.name)))) { r.duplicate += 1; continue; }
    const id = locateId(z.id);
    const base = { id, name: z.name, type_key: typeKey, stage_key: stageKey, sido: shortSido(SIDO), sigungu: z.sigungu, households: z.households, summary: locateSummary(z), source: LOCATE_SOURCE, source_url: NATIONAL_DATASET_URL, is_sample: false, updated_at: now };
    const have = byId.get(id);
    if (have) { out.push({ ...base, address: have.address, lat: have.lat, lng: have.lng }); r.kept += 1; continue; }
    const lot = pickUpisLot(z, upis) ?? firstLot(z.name);
    if (!lot) {
      const cx = pickComplexPoint(z.name, complexByGu.get(z.sigungu) ?? []);
      if (!cx) { r.noAddress += 1; continue; }
      out.push({ ...base, summary: locateSummaryBy(z, "complex"), address: `${z.sigungu} ${cx.name}`, lat: cx.lat, lng: cx.lng });
      r.byComplex += 1;
      continue;
    }
    todo.push({ z, id, query: lotQuery(SIDO, z.sigungu, lot), address: `${z.sigungu} ${lot.dong} ${lot.lot} 일대`, typeKey, stageKey });
    out.push({ ...base, address: `${z.sigungu} ${lot.dong} ${lot.lot} 일대`, lat: null, lng: null });
  }

  /* 지오코딩 — 4개씩 나란히, 예산이 다하면 멈춘다(남은 구역은 다음 실행) */
  const pending = new Map(todo.map((t) => [t.id, t]));
  const coords = new Map<string, { lat: number; lng: number }>();
  const queue = [...todo];
  const worker = async () => {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      if (Date.now() > deadline) { r.budgetExhausted = true; return; }
      const hit = await geocodeLot(t.query, t.z.sigungu);
      pending.delete(t.id);
      if (hit) { coords.set(t.id, hit); r.located += 1; } else r.notFound += 1;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const rows = out
    .map((o) => (o.lat === null ? (coords.has(String(o.id)) ? { ...o, ...coords.get(String(o.id)) } : null) : o))
    .filter((o): o is Record<string, unknown> => o !== null);
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await sb.from("redevelopment_projects").upsert(rows.slice(i, i + 300), { onConflict: "id" });
    if (error) throw new Error(`redevelopment_projects 저장 실패: ${error.message}`);
  }
  return r;
}
