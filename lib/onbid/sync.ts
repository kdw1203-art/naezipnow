import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchOnbidList, isOnbidConfigured } from "@/lib/onbid/client";
import { logger } from "@/lib/log";

/**
 * 온비드 서울권 부동산 공매 물건 → onbid_auctions 적재.
 * 여러 페이지를 돌며 서울 소재 물건만 upsert. 미설정·실패 시 skipped.
 */

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function fnum(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type OnbidSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  inserted?: number;
  /** [1201] 온비드가 알려 준 그 시도 전체 건수(첫 페이지 totalCount) — 수집 상한(maxPages×100)에 걸려 못 받은 양을 드러낸다 */
  total?: number;
};

export async function syncOnbidSeoul(
  opts: { maxPages?: number; sido?: string } = {},
): Promise<OnbidSyncResult> {
  if (!isOnbidConfigured()) {
    return { ok: false, skipped: true, reason: "ONBID_SERVICE_KEY 미설정" };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정" };

  const sido = opts.sido ?? "서울특별시";
  const maxPages = opts.maxPages ?? 5;
  const rows: Record<string, unknown>[] = [];
  let total: number | undefined;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchOnbidList({ sido, pageNo: page, numOfRows: 100 });
    /* [1201] 첫 페이지부터 응답이 없으면(오류·시간 초과·비JSON) "0건 성공"이 아니라 실패다 —
       광주광역시가 매일 "0" 으로 찍혀 수집이 안 되는 줄 아무도 몰랐다(운영 11-15~11-20). */
    if (!res) {
      if (page === 1) return { ok: false, reason: "조회 실패(응답 없음)" };
      break;
    }
    if (page === 1) total = res.totalCount;
    if (res.items.length === 0) break;
    for (const it of res.items) {
      const key =
        `${it.cltrMngNo ?? ""}-${it.pbctCdtnNo ?? ""}`.trim() || it.onbidCltrno;
      if (!key) continue;
      rows.push({
        external_key: key,
        cltr_mng_no: it.cltrMngNo ?? null,
        pbct_cdtn_no: it.pbctCdtnNo ?? null,
        onbid_cltrno: it.onbidCltrno ?? null,
        pbct_no: it.pbctNo ?? null,
        name: it.onbidCltrNm ?? null,
        prpt_div: it.prptDivNm ?? null,
        usage_mcls: it.cltrUsgMclsCtgrNm ?? null,
        usage_scls: it.cltrUsgSclsCtgrNm ?? null,
        sido: it.lctnSdnm ?? null,
        sigungu: it.lctnSggnm ?? null,
        emd: it.lctnEmdNm ?? null,
        appraisal_krw: num(it.apslEvlAmt),
        min_bid_krw: num(it.lowstBidPrcIndctCont),
        min_bid_text: it.lowstBidPrcIndctCont ?? null,
        land_sqms: fnum(it.landSqms),
        bld_sqms: fnum(it.bldSqms),
        bid_begin: it.cltrBidBgngDt ?? null,
        bid_end: it.cltrBidEndDt ?? null,
        status: it.pbctStatNm ?? null,
        thumb_url: it.thnlImgUrlAdr ?? null,
        updated_at: new Date().toISOString(),
      });
    }
    if (res.items.length < 100) break;
  }

  if (rows.length === 0) {
    return { ok: true, inserted: 0, total };
  }
  /* [1205] 쪽 사이에 같은 물건이 다시 나오면(목록이 조회 중에 밀림) 한 번의 upsert 에 같은 키가 둘 — Postgres 가
     "ON CONFLICT DO UPDATE command cannot affect row a second time" 로 그 시도 전체를 버린다. 키당 마지막 줄만 남긴다. */
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of rows) byKey.set(String(r.external_key), r);
  const unique = [...byKey.values()];
  const { error } = await sb
    .from("onbid_auctions")
    .upsert(unique, { onConflict: "external_key" });
  if (error) {
    logger.error("[onbid sync] upsert failed", error);
    return { ok: false, reason: error.message };
  }
  return { ok: true, inserted: unique.length, total };
}
