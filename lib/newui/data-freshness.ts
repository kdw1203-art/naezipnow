import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { freshnessLabel, isStale, STALE_AFTER_HOURS } from "./freshness-format";

/**
 * [987 · 신뢰 근거] 적재 최신 시각 — "언제 것인가"를 화면이 말하게 한다.
 *
 * 왜 필요한가: `/data-sources` 는 출처와 갱신 주기를 **글로** 적어 두었지만,
 * 실제로 마지막에 언제 들어왔는지는 어디에도 없었다. 주기를 적어 두면 사람은
 * 그 주기가 지켜지고 있다고 읽는다 — 실제로 982에서 단지 대장 적재가 13일간
 * 실패하고 있었고, 화면에는 아무 표시도 없었다.
 *
 * 원칙은 loadHomeCoverage 와 같다: **전부 실수치, 실패는 null, 화면은 그 줄을
 * 뺀다.** 추정하거나 "최근"이라고 뭉개지 않는다. 성공한 적재만 센다 — 실패한
 * 시도를 "갱신됨"으로 보이게 하면 그게 제일 나쁜 거짓말이다.
 */

/** 화면에 내보내는 원천 — market_ingest_log.source 값과 짝 */
export const FRESHNESS_SOURCES = [
  { source: "molit", label: "아파트 실거래" },
  { source: "reb", label: "시세 지수(한국부동산원)" },
  { source: "supply", label: "공급·입주 물량" },
  { source: "onbid", label: "공매 물건(온비드)" },
  { source: "news", label: "부동산 뉴스" },
] as const;

export type FreshnessRow = {
  source: string;
  label: string;
  /** 마지막으로 **성공한** 적재 시각(ISO). 없거나 못 읽으면 null */
  lastOkAt: string | null;
};

async function loadFreshnessUncached(): Promise<FreshnessRow[] | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("market_ingest_log")
      .select("source, created_at, status")
      .eq("status", "ok")
      .in(
        "source",
        FRESHNESS_SOURCES.map((s) => s.source),
      )
      .order("created_at", { ascending: false })
      .limit(400);
    if (error || !Array.isArray(data)) return null;
    const latest = new Map<string, string>();
    for (const row of data as { source?: unknown; created_at?: unknown }[]) {
      const src = typeof row.source === "string" ? row.source : "";
      const at = typeof row.created_at === "string" ? row.created_at : "";
      if (!src || !at) continue;
      /* 내림차순이라 처음 만난 것이 가장 최근이다 */
      if (!latest.has(src)) latest.set(src, at);
    }
    return FRESHNESS_SOURCES.map((s) => ({
      source: s.source,
      label: s.label,
      lastOkAt: latest.get(s.source) ?? null,
    }));
  } catch (err) {
    logger.warn("[data-freshness] 적재 최신 시각 조회 실패", err);
    return null;
  }
}

/** 6시간 캐시 — 적재가 하루 1~3회라 이보다 자주 볼 이유가 없다 */
export const loadDataFreshness = unstable_cache(
  loadFreshnessUncached,
  ["data-freshness-v1"],
  { revalidate: 60 * 60 * 6, tags: ["data-freshness"] },
);

/* 표기 함수는 순수 모듈에 있다(테스트가 붙어 있다) — 여기서는 다시 내보내기만 한다.
   호출부가 두 파일을 모두 아는 것보다 이 파일 하나만 알면 되게 둔다. */
export { freshnessLabel, isStale, STALE_AFTER_HOURS };
