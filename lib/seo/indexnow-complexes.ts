import "server-only";

import { complexCanonicalPathFromNames } from "@/lib/complex/complex-store";
import { getServiceSupabase } from "@/lib/supabase/service";
import { kstYm } from "@/lib/seo/complex-index-policy";
import { INDEXNOW_COMPLEX_DAILY_CAP, pickFreshComplexes, ymMinus } from "@/lib/seo/indexnow-pick";

/**
 * [1046 · 성장] 지난 sinceHours 사이에 최근 계약월 거래가 새로 들어온 단지의 정규 경로.
 * 고르는 규칙은 lib/seo/indexnow-pick.ts(순수). 여기는 읽기만 한다.
 *
 * 읽는 양: 하루 새 거래 중 최근 계약월 행만(당월·전월 — 실측 하루 300건 안팎). 이력 백필 행은
 * DB 에서부터 거른다(contract_ym 하한) — 하루 수만 건을 끌어와 버리지 않는다.
 */
const READ_LIMIT = 5000;

export async function listFreshComplexPaths(opts: { sinceHours?: number; cap?: number } = {}): Promise<{
  paths: string[];
  rows: number;
}> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 롤 키가 없어 단지 거래를 읽지 못했습니다");
  const sinceHours = opts.sinceHours ?? 26;
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const minYm = ymMinus(kstYm(), 1);

  const { data, error } = await sb
    .from("market_transactions")
    .select("region_name, complex_name, contract_ym")
    .gte("created_at", since)
    .gte("contract_ym", minYm)
    .eq("property_type", "apartment")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .not("complex_name", "is", null)
    .limit(READ_LIMIT);
  if (error) throw new Error(`새 거래 조회 실패: ${error.message}`);

  const rows = (data ?? []) as Array<{ region_name: string | null; complex_name: string | null; contract_ym: string | null }>;
  const picked = pickFreshComplexes(rows, { minYm, cap: opts.cap ?? INDEXNOW_COMPLEX_DAILY_CAP });
  return { paths: picked.map((c) => complexCanonicalPathFromNames(c.region, c.name)), rows: rows.length };
}
