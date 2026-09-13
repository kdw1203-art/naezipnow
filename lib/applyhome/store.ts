import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import type { AptCompetitionRow, AptDetailRow } from "@/lib/applyhome/types";
import { announcementFromDetail, competitionRateNumber, toInt } from "@/lib/applyhome/normalize";
export { normApplyDate, competitionRateNumber, announcementFromDetail } from "@/lib/applyhome/normalize";

/* ============================================================
   [994 · D4] 청약 공고·경쟁률 저장소 — 매일 사실의 단일 출처.

   supply-ingest 크론이 어차피 읽는 상세 행을 `applyhome_announcements` 에 함께 적재하고,
   경쟁률은 최신 상위 페이지를 `applyhome_competition` 에 적재한다. 화면(캘린더·이번 주
   청약·경쟁률 띠)과 알림(관심 지역 새 공고·접수 시작·발표)은 여기서 읽는다 — 라이브 API 는
   저장소가 비었을 때의 폴백이다.
   ============================================================ */

export type AnnouncementRow = {
  house_manage_no: string;
  pblanc_no: string;
  house_nm: string;
  house_secd_nm: string | null;
  region: string | null;
  address: string | null;
  tot_supply: number | null;
  rcept_bgnde: string | null;
  rcept_endde: string | null;
  rcrit_pblanc_de: string | null;
  przwner_de: string | null;
  mvn_ym: string | null;
  pblanc_url: string | null;
  builder: string | null;
  first_seen_at: string;
  updated_at: string;
};

export type CompetitionRow = {
  house_manage_no: string;
  pblanc_no: string;
  house_ty: string;
  rank_code: number;
  reside_secd: string;
  reside_senm: string | null;
  supply_count: number | null;
  req_cnt: number | null;
  cmpet_rate: string | null;
  cmpet_rate_num: number | null;
  updated_at: string;
};

/** 상세 행 묶음을 업서트한다 — 이미 있던 행은 updated_at 만 갱신(first_seen_at 은 보존). */
export async function upsertAnnouncements(rows: AptDetailRow[]): Promise<{ upserted: number; skipped: number }> {
  const sb = getServiceSupabase();
  if (!sb) return { upserted: 0, skipped: rows.length };
  const byKey = new Map<string, Omit<AnnouncementRow, "first_seen_at" | "updated_at">>();
  let skipped = 0;
  for (const r of rows) {
    const a = announcementFromDetail(r);
    if (!a) {
      skipped += 1;
      continue;
    }
    byKey.set(`${a.house_manage_no}:${a.pblanc_no}`, a);
  }
  const payload = [...byKey.values()].map((a) => ({ ...a, updated_at: new Date().toISOString() }));
  let upserted = 0;
  for (let i = 0; i < payload.length; i += 300) {
    const chunk = payload.slice(i, i + 300);
    const { error } = await sb
      .from("applyhome_announcements")
      .upsert(chunk, { onConflict: "house_manage_no,pblanc_no", ignoreDuplicates: false });
    if (error) {
      logger.error("[applyhome-store] 공고 업서트 실패", error);
      continue;
    }
    upserted += chunk.length;
  }
  return { upserted, skipped };
}

export async function upsertCompetition(rows: AptCompetitionRow[]): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const byKey = new Map<string, Omit<CompetitionRow, "updated_at">>();
  for (const r of rows) {
    const hm = r.HOUSE_MANAGE_NO?.trim();
    const pb = r.PBLANC_NO?.trim();
    const ty = r.HOUSE_TY?.trim();
    if (!hm || !pb || !ty) continue;
    const row = {
      house_manage_no: hm,
      pblanc_no: pb,
      house_ty: ty,
      rank_code: toInt(r.SUBSCRPT_RANK_CODE) ?? 0,
      reside_secd: r.RESIDE_SECD?.trim() ?? "",
      reside_senm: r.RESIDE_SENM?.trim() || null,
      supply_count: toInt(r.SUPLY_HSHLDCO),
      req_cnt: toInt(r.REQ_CNT),
      cmpet_rate: r.CMPET_RATE?.trim() || null,
      cmpet_rate_num: competitionRateNumber(r.CMPET_RATE),
    };
    byKey.set(`${hm}:${pb}:${ty}:${row.rank_code}:${row.reside_secd}`, row);
  }
  const payload = [...byKey.values()].map((c) => ({ ...c, updated_at: new Date().toISOString() }));
  let n = 0;
  for (let i = 0; i < payload.length; i += 300) {
    const chunk = payload.slice(i, i + 300);
    const { error } = await sb
      .from("applyhome_competition")
      .upsert(chunk, { onConflict: "house_manage_no,pblanc_no,house_ty,rank_code,reside_secd" });
    if (error) {
      logger.error("[applyhome-store] 경쟁률 업서트 실패", error);
      continue;
    }
    n += chunk.length;
  }
  return n;
}

/* ── 읽기 ─────────────────────────────────────────────────────────────── */

export type ApplyhomeFreshness = { rows: number; asOf: string | null };

/** 저장된 공고의 기준일(마지막 적재 시각)과 건수 — 화면 "기준일" 표기용 */
export async function announcementFreshness(): Promise<ApplyhomeFreshness> {
  const sb = getServiceSupabase();
  if (!sb) return { rows: 0, asOf: null };
  const { data, error, count } = await sb
    .from("applyhome_announcements")
    .select("updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return { rows: 0, asOf: null };
  return { rows: count ?? 0, asOf: (data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null };
}

/** [from, to] 날짜 창에 접수 시작 또는 마감이 드는 공고 */
export async function listAnnouncementsInWindow(fromDate: string, toDate: string): Promise<AnnouncementRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("applyhome_announcements")
    .select("*")
    .or(`and(rcept_bgnde.gte.${fromDate},rcept_bgnde.lte.${toDate}),and(rcept_endde.gte.${fromDate},rcept_endde.lte.${toDate})`)
    .order("rcept_bgnde", { ascending: true })
    .limit(500);
  if (error) {
    logger.error("[applyhome-store] 창 조회 실패", error);
    return [];
  }
  return (data ?? []) as AnnouncementRow[];
}

/** 알림 스윕용 — 최근 N시간 안에 처음 본 공고 · 오늘 접수 시작 · 오늘 발표 */
export async function listAnnouncementEvents(todayKst: string, sinceIso: string): Promise<{
  fresh: AnnouncementRow[];
  startsToday: AnnouncementRow[];
  announcesToday: AnnouncementRow[];
}> {
  const sb = getServiceSupabase();
  if (!sb) return { fresh: [], startsToday: [], announcesToday: [] };
  const [freshR, startR, annR] = await Promise.all([
    sb.from("applyhome_announcements").select("*").gte("first_seen_at", sinceIso).order("first_seen_at", { ascending: false }).limit(300),
    sb.from("applyhome_announcements").select("*").eq("rcept_bgnde", todayKst).limit(300),
    sb.from("applyhome_announcements").select("*").eq("przwner_de", todayKst).limit(300),
  ]);
  return {
    fresh: (freshR.data ?? []) as AnnouncementRow[],
    startsToday: (startR.data ?? []) as AnnouncementRow[],
    announcesToday: (annR.data ?? []) as AnnouncementRow[],
  };
}

/** 최근 갱신된 경쟁률 상위 — 화면 띠용(단지명은 공고 표와 조인) */
export async function listRecentCompetition(limit = 12): Promise<
  Array<CompetitionRow & { house_nm: string | null; region: string | null; przwner_de: string | null }>
> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("applyhome_competition")
    .select("*")
    .not("cmpet_rate_num", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit * 6);
  if (error || !data) return [];
  const rows = data as CompetitionRow[];
  const keys = [...new Set(rows.map((r) => r.house_manage_no))].slice(0, 60);
  const { data: ann } = await sb
    .from("applyhome_announcements")
    .select("house_manage_no,pblanc_no,house_nm,region,przwner_de")
    .in("house_manage_no", keys);
  const byHm = new Map<string, { house_nm: string; region: string | null; przwner_de: string | null }>();
  for (const a of (ann ?? []) as Array<{ house_manage_no: string; house_nm: string; region: string | null; przwner_de: string | null }>) {
    if (!byHm.has(a.house_manage_no)) byHm.set(a.house_manage_no, a);
  }
  /* 공고당 한 줄(1순위·해당지역 우선, 없으면 첫 행) */
  const seen = new Set<string>();
  const out: Array<CompetitionRow & { house_nm: string | null; region: string | null; przwner_de: string | null }> = [];
  const sorted = [...rows].sort((a, b) => a.rank_code - b.rank_code || (a.reside_secd === "01" ? -1 : 1));
  for (const r of sorted) {
    if (seen.has(r.house_manage_no)) continue;
    seen.add(r.house_manage_no);
    const a = byHm.get(r.house_manage_no);
    out.push({ ...r, house_nm: a?.house_nm ?? null, region: a?.region ?? r.reside_senm ?? null, przwner_de: a?.przwner_de ?? null });
    if (out.length >= limit) break;
  }
  return out;
}
