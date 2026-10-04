import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import {
  isUpisService,
  mapUpisAnnouncement,
  mapUpisRecord,
  upisQueryTokens,
  zoneNamePattern,
  type UpisAnnouncement,
  type UpisGuSummary,
  type UpisRecord,
  type UpisService,
} from "./upis";

/* [1029] 서울 UPIS 결정 조서 읽기 — seoul_upis_records(공개 읽기) · seoul_upis_gu_summary(뷰) · seoul_upis_announcements.
   조회 실패는 던진다 — 호출부가 "불러오기 실패"로 그린다. 0행은 0행이다(표가 비어 있는 동안은 섹션을 접는다). */

const RECORD_COLUMNS =
  "rpt_mng_cd,service,prjc_cd,rpt_type,lclsf,mclsf,sclsf,pstn_nm,rgn_nm,area_exs,area_chg_aftr,dcsn_ancmnt_mng_cd,sigungu,emd,code_date";

export type UpisListOpts = {
  sigungu?: string | null;
  service?: UpisService | null;
  emd?: string | null;
  /** [1029b] 검색어 — 구역 이름(rgn_nm) 또는 위치명(pstn_nm)에 낱말이 모두 들어 있는 행 */
  q?: string | null;
  limit?: number;
};

export async function listUpisRecords(opts: UpisListOpts = {}): Promise<UpisRecord[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 미설정");
  let q = sb.from("seoul_upis_records").select(RECORD_COLUMNS);
  if (opts.sigungu) q = q.eq("sigungu", opts.sigungu);
  if (opts.service && isUpisService(opts.service)) q = q.eq("service", opts.service);
  if (opts.emd) q = q.eq("emd", opts.emd);
  for (const tok of upisQueryTokens(opts.q)) q = q.or(`rgn_nm.ilike.%${tok}%,pstn_nm.ilike.%${tok}%`);
  q = q.order("code_date", { ascending: false, nullsFirst: false }).order("rpt_mng_cd", { ascending: false }).limit(Math.min(500, opts.limit ?? 50));
  const { data, error } = await q;
  if (error) throw new Error(`seoul_upis_records: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapUpisRecord).filter((x): x is UpisRecord => x != null);
}

/** 구별·서비스별 건수(뷰). 표가 비어 있으면 빈 배열. */
export async function listUpisGuSummary(): Promise<UpisGuSummary[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 미설정");
  const { data, error } = await sb.from("seoul_upis_gu_summary").select("service,sigungu,n");
  if (error) throw new Error(`seoul_upis_gu_summary: ${error.message}`);
  const map = new Map<string, UpisGuSummary>();
  for (const r of (data ?? []) as { service: string; sigungu: string | null; n: number }[]) {
    const gu = r.sigungu ?? "구 미상";
    const cur = map.get(gu) ?? { sigungu: gu, rebuild: 0, urbanDev: 0, distUnitPlan: 0, total: 0 };
    const n = Number(r.n) || 0;
    if (r.service === "upisRebuild") cur.rebuild += n;
    else if (r.service === "upisUrbanDev") cur.urbanDev += n;
    else if (r.service === "upisDistUnitPlan") cur.distUnitPlan += n;
    cur.total += n;
    map.set(gu, cur);
  }
  return [...map.values()].sort((a, b) =>
    a.sigungu === "구 미상" ? 1 : b.sigungu === "구 미상" ? -1 : b.total - a.total || a.sigungu.localeCompare(b.sigungu, "ko"),
  );
}

export type UpisTotals = { rebuild: number; urbanDev: number; distUnitPlan: number; total: number; guCount: number };

export function totalsOf(summary: readonly UpisGuSummary[]): UpisTotals {
  const t: UpisTotals = { rebuild: 0, urbanDev: 0, distUnitPlan: 0, total: 0, guCount: 0 };
  for (const g of summary) {
    t.rebuild += g.rebuild;
    t.urbanDev += g.urbanDev;
    t.distUnitPlan += g.distUnitPlan;
    t.total += g.total;
    if (g.sigungu !== "구 미상") t.guCount++;
  }
  return t;
}

/** 구역 이름으로 조서 찾기(정비사업 조서만) — 같은 구가 있으면 그 구로 좁힌다. 이름 줄기가 없으면 빈 배열. */
export async function listUpisForZone(name: string, sigungu?: string | null, limit = 20): Promise<UpisRecord[]> {
  const pattern = zoneNamePattern(name);
  if (!pattern) return [];
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 미설정");
  let q = sb.from("seoul_upis_records").select(RECORD_COLUMNS).eq("service", "upisRebuild").ilike("rgn_nm", pattern);
  if (sigungu) q = q.or(`sigungu.eq.${sigungu},sigungu.is.null`);
  const { data, error } = await q.order("code_date", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw new Error(`seoul_upis_records(zone): ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapUpisRecord).filter((x): x is UpisRecord => x != null);
}

/** 결정고시 — 조서의 dcsn_ancmnt_mng_cd 묶음으로 */
export async function listUpisAnnouncements(codes: readonly string[]): Promise<Map<string, UpisAnnouncement>> {
  const out = new Map<string, UpisAnnouncement>();
  const uniq = [...new Set(codes.filter(Boolean))].slice(0, 200);
  if (uniq.length === 0) return out;
  const sb = getReadOnlySupabase();
  if (!sb) return out;
  const { data, error } = await sb
    .from("seoul_upis_announcements")
    .select("ancmnt_mng_cd,prjc_cd,ancmnt_type,ancmnt_no,ancmnt_ymd,ancmnt_inst,tkcg_inst,ttl")
    .in("ancmnt_mng_cd", uniq);
  if (error) {
    logger.warn("[upis] 결정고시 조회 실패 — 고시 번호 없이 그린다", error.message);
    return out;
  }
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const a = mapUpisAnnouncement(r);
    if (a) out.set(a.ancmntMngCd, a);
  }
  return out;
}

/** 한 구의 조서 수(서비스 셋 합계) — /region/[id] 머리칸용. 실패는 던진다. */
export async function countUpisForGu(sigungu: string): Promise<UpisGuSummary | null> {
  const all = await listUpisGuSummary();
  return all.find((g) => g.sigungu === sigungu) ?? null;
}
