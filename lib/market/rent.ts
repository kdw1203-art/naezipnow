import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { transactionNameCandidates } from "@/lib/market/store";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore } from "@/lib/format/ym";
import { readRecentMonths } from "@/lib/supabase/read-paged";

/* [#94, 2026-08-23] 전월세 실거래 표면화 — 46.9만 행(216개 지역, 최근 12개월)이
 * DB에 있는데 보여주는 화면이 없었다. 이 모듈은 지역 단위 전월세 스냅샷을
 * 두 쿼리로 만든다:
 *   1) market_region_monthly(deal_type='rent') — 12개월 거래량(집계 테이블, 값싸다)
 *   2) market_transactions(rent, 최근 3개월) — 전세 보증금·월세 중앙값(원본, 상한 4000행)
 * 원칙: 중앙값·건수 같은 산술 사실만. 신고 지연과 갱신·신규 미구분(원천 한계)은
 * 화면에 명기한다.
 */

export type RegionRentSnapshot = {
  /** 12개월 월별 전월세 신고 건수 (오름차순 yyyymm) */
  monthly: Array<{ month: string; count: number }>;
  /** 최근 3개월 표본 크기 */
  sampleCount: number;
  /** 표본이 상한(4000)에 닿아 잘렸을 수 있음 */
  sampleTruncated: boolean;
  jeonse: {
    count: number;
    /** 전체 전세 보증금 중앙값 (KRW) */
    medianDepositKrw: number | null;
    /** 59~85㎡(국민평형대) 전세 보증금 중앙값 — 표본 10건 미만이면 null */
    medianDepositKrw59_85: number | null;
  };
  wolse: {
    count: number;
    medianDepositKrw: number | null;
    medianMonthlyKrw: number | null;
  };
  /** 최근 3개월 중 월세 비중 (0~1) */
  wolseShare: number | null;
  /** 표본 기간 라벨 (예: "2026.06~2026.08") */
  periodLabel: string;
};

const SAMPLE_CAP = 4000;

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* [1055] 달 산술은 lib/format/ym(한국 달 · 넘침 없음) — 예전 `setMonth(getMonth()-n)` 은 31일에 한 달이 밀리고(8/31 → 7~8월 두 달)
   매월 1일 00~09시(KST)엔 전달이 "이번 달"이었다 */
function ymMonthsAgo(n: number): string {
  return ymMonthsBefore(currentYm(), n);
}

export async function getRegionRentSnapshot(
  regionId: string,
  regionName: string,
  signal?: AbortSignal,
): Promise<RegionRentSnapshot | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const names = transactionNameCandidates(regionId, regionName);
  const from3 = ymMonthsAgo(2); // 이번 달 포함 3개 캘린더 월
  const from12 = ymMonthsAgo(11);

  let volQ = sb
    .from("market_region_monthly")
    .select("month, transaction_count")
    .in("region_name", names)
    .eq("deal_type", "rent")
    .eq("property_type", "apartment")
    .gte("month", from12)
    .order("month", { ascending: true })
    .limit(14);
  if (signal) volQ = volQ.abortSignal(signal);

  /* [1055] 끝까지 나눠 읽는다 — `.limit(4000)` 한 번은 PostgREST 상한(1,000행)에서 조용히 잘려 운영 지역 12곳+(평택 2,329 ·
     강남 1,996 · 송파 1,921 …)가 "신고분 1,000건 기준"을 사실처럼 적고 중앙값은 임의의 1,000행에서 나왔다(정렬도 없었다).
     정렬은 (contract_ym, id)로 유일하게 — 쪽이 겹치거나 빠지지 않는다. SAMPLE_CAP 에 닿으면 sampleTruncated. */
  /* [1103] 달마다 한 번씩 나란히 · 정렬 없이(인덱스만) — 이유와 실측은 lib/supabase/read-paged.ts readRecentMonths.
     예전(3개월을 (contract_ym, id) 정렬로 쪽 나누기)은 쪽마다 힙을 다시 읽어 큰 구에서 8초 예산을 넘겼다. 읽는 행 집합은
     같다(최신 달은 gte, 나머지 달은 eq — 합치면 gte(from3)). 한 달이 1,000행을 채우면 그 달만 예전 정렬로 다시 읽는다. */
  const rowP = readRecentMonths<Record<string, unknown>>([ymMonthsAgo(0), ymMonthsAgo(1), from3], (ym, { newest, ordered }, from, to) => {
    let q = sb
      .from("market_transactions")
      .select("deposit_krw, monthly_rent_krw, area_m2, contract_ym")
      .in("region_name", names)
      .eq("transaction_type", "rent")
      .eq("is_cancelled", false)
      .eq("property_type", "apartment")
      .not("deposit_krw", "is", null);
    q = newest ? q.gte("contract_ym", ym) : q.eq("contract_ym", ym);
    if (ordered) q = q.order("contract_ym", { ascending: false }).order("id", { ascending: true });
    q = q.range(from, to);
    if (signal) q = q.abortSignal(signal);
    return q;
  }, SAMPLE_CAP).then(
    (r) => ({ ok: true as const, ...r }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e : new Error(String(e)) }),
  );

  const [volRes, rowRes] = await Promise.all([volQ, rowP]);
  if (volRes.error) {
    logger.error(`[rent] 월별 집계 조회 실패(${regionId})`, volRes.error);
    throw new Error(`market_region_monthly(rent) 조회 실패: ${volRes.error.message}`);
  }
  if (!rowRes.ok) {
    /* [1103] 곁다리 예산이 끊은 것(signal.aborted)은 설계대로 접힌 것 — warn. 진짜 조회 실패만 error(section-budget.ts 와 같은 구분).
       호출부(/region/[id])가 같은 실패를 한 번 더 적는다. */
    if (signal?.aborted) logger.warn(`[rent] 원본 표본 예산 초과로 접음(${regionId})`, rowRes.error.message);
    else logger.error(`[rent] 원본 표본 조회 실패(${regionId})`, rowRes.error);
    throw new Error(`market_transactions(rent) 조회 실패: ${rowRes.error.message}`);
  }

  const monthlyMap = new Map<string, number>();
  for (const r of volRes.data ?? []) {
    const m = String(r.month ?? "");
    if (!/^\d{6}$/.test(m)) continue;
    monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + (Number(r.transaction_count) || 0));
  }
  const monthly = [...monthlyMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const rows = rowRes.rows;
  if (monthly.length === 0 && rows.length === 0) return null;

  const jeonseDeposits: number[] = [];
  const jeonseDeposits5985: number[] = [];
  const wolseDeposits: number[] = [];
  const wolseMonthlies: number[] = [];
  for (const r of rows) {
    const deposit = Number(r.deposit_krw);
    const monthlyRent = Number(r.monthly_rent_krw ?? 0) || 0;
    if (!Number.isFinite(deposit) || deposit <= 0) continue;
    const area = r.area_m2 === null ? null : Number(r.area_m2);
    if (monthlyRent > 0) {
      wolseDeposits.push(deposit);
      wolseMonthlies.push(monthlyRent);
    } else {
      jeonseDeposits.push(deposit);
      if (area !== null && area >= 59 && area <= 85) jeonseDeposits5985.push(deposit);
    }
  }
  jeonseDeposits.sort((a, b) => a - b);
  jeonseDeposits5985.sort((a, b) => a - b);
  wolseDeposits.sort((a, b) => a - b);
  wolseMonthlies.sort((a, b) => a - b);

  const total = jeonseDeposits.length + wolseDeposits.length;
  const fmtYm = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;

  return {
    monthly,
    sampleCount: rows.length,
    sampleTruncated: rowRes.truncated,
    jeonse: {
      count: jeonseDeposits.length,
      medianDepositKrw: median(jeonseDeposits),
      medianDepositKrw59_85:
        jeonseDeposits5985.length >= 10 ? median(jeonseDeposits5985) : null,
    },
    wolse: {
      count: wolseDeposits.length,
      medianDepositKrw: median(wolseDeposits),
      medianMonthlyKrw: median(wolseMonthlies),
    },
    wolseShare: total > 0 ? wolseDeposits.length / total : null,
    periodLabel: `${fmtYm(from3)}~${fmtYm(ymMonthsAgo(0))}`,
  };
}
