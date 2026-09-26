import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore } from "@/lib/complex/complex-facts";

/* [#94 잔여, 2026-08-23] 단지 전월세 이력 — 지역 스냅샷(lib/market/rent.ts)의
 * 단지 버전. market_transactions(rent)를 (region_name, complex_name) 등치로 읽어
 * 월별 전세 보증금 중앙값·월세(보증금/월세) 중앙값·건수를 만든다.
 *
 * 규칙은 지역판과 동일:
 *   - 산술 사실만(중앙값·건수). 전망·권유 문장 없음.
 *   - 신고 지연·갱신/신규 미구분(원천 한계)은 화면에 명기한다.
 *   - kapt.* id 는 이름 튜플이 없어 조회 불가 → null (섹션 미표시).
 */

export type ComplexRentMonth = {
  /** yyyymm */
  month: string;
  jeonseCount: number;
  /** 전세 보증금 중앙값 (KRW) — 표본 0이면 null */
  jeonseMedianDepositKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
};

/** [1006 · B] 원 표본 한 건 — monthlyKrw > 0 이면 월세, 0 이면 전세 */
export type ComplexRentSample = {
  /** yyyymm */
  ym: string;
  depositKrw: number;
  monthlyKrw: number;
};

export type ComplexRentHistory = {
  months: ComplexRentMonth[];
  totalCount: number;
  /** 표본이 상한에 닿아 잘렸을 수 있음 */
  truncated: boolean;
  /** 조회 구간 라벨 (예: "2024.09~2026.08") */
  periodLabel: string;
  /**
   * [1006 · B] 원 표본(최신 계약월 먼저). 지도 단지 패널이 6·12개월 창의 **표본 중앙값**과
   * 단지 전세가율을 만든다 — 월별 중앙값을 다시 접으면 표본 중앙값이 아니라서 원값이 필요하다.
   * 허브 표(ComplexRentSection)는 months 만 읽는다. 서버 안에서만 돌고 클라이언트로 나가지 않는다.
   */
  samples: ComplexRentSample[];
};

const ROW_CAP = 2000;
const MONTHS_BACK = 23; // 이번 달 포함 24개 캘린더 월

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* [1006 · B] 이번 달은 KST 기준 — 서버(UTC)의 getMonth() 는 KST 월초 0~9시에 전달을 가리켜
   24개월 창과 라벨이 한 달 어긋났다. 달 산술도 setMonth 대신 순수 함수로(31일 → 2월 넘김 방지). */
function ymMonthsAgo(n: number): string {
  return ymMonthsBefore(currentYm(), n);
}

/**
 * (region_name, complex_name) 등치 → 24개월 전월세 이력.
 * region 은 market_transactions.region_name 형식("서울 노원구" = `${city} ${district}`).
 * kapt 매칭 여부와 무관하게 페이지가 가진 표시명 그대로 조회한다.
 * 없음(0행)은 null, 못 읽음은 throw — 호출부가 catch 로 접는다.
 */
export async function getComplexRentHistoryByNames(
  region: string,
  name: string,
  signal?: AbortSignal,
): Promise<ComplexRentHistory | null> {
  const dec = { region: region.trim(), name: name.trim() };
  if (!dec.region || !dec.name) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;

  const from = ymMonthsAgo(MONTHS_BACK);
  let q = sb
    .from("market_transactions")
    .select("deposit_krw, monthly_rent_krw, contract_ym")
    .eq("region_name", dec.region)
    .eq("complex_name", dec.name)
    .eq("transaction_type", "rent")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .gte("contract_ym", from)
    .not("deposit_krw", "is", null)
    .order("contract_ym", { ascending: false })
    .limit(ROW_CAP);
  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;
  if (error) {
    logger.error(`[complex-rent] 조회 실패(${dec.region} ${dec.name})`, error);
    throw new Error(`market_transactions(rent, 단지) 조회 실패: ${error.message}`);
  }
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const byMonth = new Map<
    string,
    { jd: number[]; wd: number[]; wm: number[] }
  >();
  const samples: ComplexRentSample[] = [];
  for (const r of rows) {
    const m = String(r.contract_ym ?? "");
    if (!/^\d{6}$/.test(m)) continue;
    const deposit = Number(r.deposit_krw);
    if (!Number.isFinite(deposit) || deposit <= 0) continue;
    const monthly = Number(r.monthly_rent_krw ?? 0) || 0;
    samples.push({ ym: m, depositKrw: deposit, monthlyKrw: monthly });
    let bucket = byMonth.get(m);
    if (!bucket) {
      bucket = { jd: [], wd: [], wm: [] };
      byMonth.set(m, bucket);
    }
    if (monthly > 0) {
      bucket.wd.push(deposit);
      bucket.wm.push(monthly);
    } else {
      bucket.jd.push(deposit);
    }
  }

  const months: ComplexRentMonth[] = [...byMonth.entries()]
    .map(([month, b]) => {
      b.jd.sort((a, z) => a - z);
      b.wd.sort((a, z) => a - z);
      b.wm.sort((a, z) => a - z);
      return {
        month,
        jeonseCount: b.jd.length,
        jeonseMedianDepositKrw: median(b.jd),
        wolseCount: b.wd.length,
        wolseMedianDepositKrw: median(b.wd),
        wolseMedianMonthlyKrw: median(b.wm),
      };
    })
    .sort((a, z) => z.month.localeCompare(a.month)); // 최신 먼저 (표 그대로)

  const fmt = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
  return {
    months,
    totalCount: rows.length,
    truncated: rows.length >= ROW_CAP,
    periodLabel: `${fmt(from)}~${fmt(ymMonthsAgo(0))}`,
    samples,
  };
}
