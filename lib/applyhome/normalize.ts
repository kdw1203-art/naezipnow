import type { AptDetailRow } from "@/lib/applyhome/types";

/* [994] 청약 공고 정규화 — 순수 함수(server-only 아님, 단위테스트 대상).
   store.ts 가 재수출한다. */

export type AnnouncementUpsert = {
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
};

/** "2026-09-12" · "20260912" · "2026.09.12" → "2026-09-12" (아니면 null) */
export function normApplyDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^0-9]/g, "");
  if (d.length < 8) return null;
  const y = d.slice(0, 4);
  const m = d.slice(4, 6);
  const day = d.slice(6, 8);
  if (!/^20\d{2}$/.test(y) || Number(m) < 1 || Number(m) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${y}-${m}-${day}`;
}

function normYm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^0-9]/g, "").slice(0, 6);
  return /^20\d{4}$/.test(d) && Number(d.slice(4, 6)) >= 1 && Number(d.slice(4, 6)) <= 12 ? d : null;
}

export function toInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 경쟁률 원문 → 숫자. "12.5" → 12.5 · "(△3)"(미달) → null · "-" → null */
export function competitionRateNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 상세 행 → 저장 행. 단지명·키가 없으면 null(적재하지 않는다). */
export function announcementFromDetail(r: AptDetailRow): AnnouncementUpsert | null {
  const hm = r.HOUSE_MANAGE_NO?.trim();
  const pb = r.PBLANC_NO?.trim();
  const name = r.HOUSE_NM?.trim();
  if (!hm || !pb || !name) return null;
  return {
    house_manage_no: hm,
    pblanc_no: pb,
    house_nm: name,
    house_secd_nm: r.HOUSE_SECD_NM?.trim() || null,
    region: r.SUBSCRPT_AREA_CODE_NM?.trim() || null,
    address: r.HSSPLY_ADRES?.trim() || null,
    tot_supply: toInt(r.TOT_SUPLY_HSHLDCO),
    rcept_bgnde: normApplyDate(r.RCEPT_BGNDE),
    rcept_endde: normApplyDate(r.RCEPT_ENDDE),
    rcrit_pblanc_de: normApplyDate(r.RCRIT_PBLANC_DE),
    przwner_de: normApplyDate(r.PRZWNER_PRESNATN_DE),
    mvn_ym: normYm(r.MVN_PREARNGE_YM),
    pblanc_url: r.PBLANC_URL?.trim() || null,
    builder: r.BSNS_MBY_NM?.trim() || null,
  };
}

