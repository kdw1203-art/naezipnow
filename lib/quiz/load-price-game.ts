import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadOnlySupabase, readOnlyClientHasServiceRole } from "@/lib/newui/supabase-read";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { logger } from "@/lib/log";
import {
  QUIZ_AREA_MAX_M2,
  QUIZ_AREA_MIN_M2,
  QUIZ_ROUNDS,
  addDaysIso,
  buildQuizChain,
  kstDateOf,
  pickQuizCandidates,
  quizWindow,
  type QuizCandidate,
  type QuizDay,
  type QuizEntry,
} from "./price-game";

/**
 * [1008 · Q] 실거래가 게임 문제 풀 — 서버(ISR) 조회. 화면(app/quiz)은 이 결과를 페이지에 싣고,
 * 클라이언트는 **API 를 부르지 않는다**(봇·Vercel 비용 — 1007 에서 함수 호출의 99% 가 봇이었다).
 *
 * 조회 두 모양(운영 DB 읽기 전용 EXPLAIN ANALYZE, 2026-09-21):
 *  ① 후보 — complex_tx_stats(뷰; 기본 열만 고르면 스펙 LEFT JOIN 이 제거된다)
 *     recent_trade_count ≥ 6 · avg_area_m2 70~100 · 거래 많은 순 1,000곳
 *     → Index Scan using complex_tx_stats_recent_idx, 1,000행 6.0ms(버퍼 적중 1,728).
 *     상위 1,200곳 지역 분포: 서울 160 · 경기 436 · 광역시 323 · 그 외 281 — 네 묶음 모두 할당량을 넘는다.
 *  ② 단지별 최근 1건 — market_transactions (region_name, complex_name) · 매매 · 해제 제외 · 아파트 ·
 *     계약 12개월 창 · 전용 80~86㎡ · 최신순 1건
 *     → Index Only Scan using mt_trade_complex_cov2_idx(Heap Fetches 0) + Incremental Sort, 0.28ms.
 *     표본 200곳 중 199곳이 이 조건의 거래를 가졌다 — 22곳이면 사슬 11개가 거의 늘 찬다.
 * 합계: 날짜 하나당 ① 1회 + ② 22회 병렬(모자라면 예비 22곳씩). 아래 날짜별 데이터 캐시 덕에
 * 같은 날 두 번째 재생성부터는 0회다.
 */

const CANDIDATE_LIMIT = 1_000; // PostgREST 기본 상한(1,000행)과 같다
const BATCH = 22;
/** 이보다 짧은 사슬은 게임이 아니다 — 정직하게 "못 만들었다"로 간다 */
const MIN_ROUNDS = 5;

/** 조회 실패 — 페이지는 빌드 중이면 오류 화면, 런타임이면 던져서 직전 정상본을 지킨다 */
export class QuizLoadError extends Error {}

type CandidateRow = { region_name: string | null; complex_name: string | null };
type TradeRow = {
  contract_ym: string;
  deal_amount_krw: number | string;
  area_m2: number | string | null;
  floor: number | null;
  build_year: number | null;
};

async function readCandidates(sb: SupabaseClient): Promise<QuizCandidate[]> {
  const { data, error } = await sb
    .from("complex_tx_stats")
    .select("region_name, complex_name")
    .gte("recent_trade_count", 6)
    .gte("avg_area_m2", 70)
    .lte("avg_area_m2", 100)
    .order("recent_trade_count", { ascending: false })
    .order("trade_count", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  if (error) throw new QuizLoadError(`quiz 후보 조회 실패: ${error.message}`);
  return ((data as CandidateRow[] | null) ?? [])
    .map((r) => ({ region: (r.region_name ?? "").trim(), name: (r.complex_name ?? "").trim() }))
    .filter((c) => c.region && c.name);
}

async function readLatestTrade(
  sb: SupabaseClient,
  c: QuizCandidate,
  fromYm: string,
  toYm: string,
): Promise<QuizEntry | null> {
  const { data, error } = await sb
    .from("market_transactions")
    .select("contract_ym, deal_amount_krw, area_m2, floor, build_year")
    .eq("region_name", c.region)
    .eq("complex_name", c.name)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .gte("contract_ym", fromYm)
    .lte("contract_ym", toYm)
    .gte("area_m2", QUIZ_AREA_MIN_M2)
    .lte("area_m2", QUIZ_AREA_MAX_M2)
    .gt("deal_amount_krw", 0)
    .order("contract_ym", { ascending: false })
    .order("contract_day", { ascending: false, nullsFirst: false })
    .limit(1);
  /* 한 곳이라도 못 읽으면 판 전체를 실패로 — 조용히 풀을 줄이면 "없는 거래"와 "못 읽은 거래"가 섞인다 */
  if (error) throw new QuizLoadError(`quiz 실거래 조회 실패(${c.region} ${c.name}): ${error.message}`);
  const r = (data as TradeRow[] | null)?.[0];
  if (!r) return null;
  const won = Number(r.deal_amount_krw);
  const area = Number(r.area_m2);
  if (!Number.isFinite(won) || won <= 0 || !Number.isFinite(area) || area <= 0) return null;
  return {
    region: c.region,
    name: c.name,
    href: complexHrefFromNames(c.region, c.name),
    ym: String(r.contract_ym),
    /* 국토부 신고는 만원 단위 정수 — 원으로 적재된 값을 되돌린다 */
    priceManwon: Math.round(won / 10_000),
    areaM2: area,
    floor: typeof r.floor === "number" && r.floor > 0 ? r.floor : null,
    buildYear: typeof r.build_year === "number" && r.build_year >= 1950 ? r.build_year : null,
  };
}

/* 서비스 롤로만 읽는다 — complex_tx_stats 밑단(complex_tx_stats_base)은 anon 에 권한이 없어
   공개 키만 있는 환경(로컬·CI 미리보기)에서는 "permission denied for materialized view" 로 반드시
   실패한다(2026-09-21 로컬 실측). 실패할 걸 아는 조회는 보내지 않고 "미설정"으로 답한다. */
function serviceReadClient(): SupabaseClient | null {
  return readOnlyClientHasServiceRole() ? getReadOnlySupabase() : null;
}

async function buildQuizDay(date: string): Promise<QuizDay> {
  const sb = serviceReadClient();
  if (!sb) throw new QuizLoadError("quiz: 데이터 소스 미설정");
  const { fromYm, toYm } = quizWindow(date);
  const { primary, reserve } = pickQuizCandidates(await readCandidates(sb), date);
  const read = (list: QuizCandidate[]) =>
    Promise.all(list.map((c) => readLatestTrade(sb, c, fromYm, toYm))).then((xs) =>
      xs.filter((x): x is QuizEntry => x !== null),
    );
  let entries = await read(primary);
  let chain = buildQuizChain(entries);
  for (let i = 0; chain.length < QUIZ_ROUNDS + 1 && i < reserve.length; i += BATCH) {
    entries = entries.concat(await read(reserve.slice(i, i + BATCH)));
    chain = buildQuizChain(entries);
  }
  if (chain.length < MIN_ROUNDS + 1) {
    throw new QuizLoadError(`quiz: ${date} 문제 사슬이 ${Math.max(0, chain.length - 1)}라운드뿐`);
  }
  return { date, fromYm, toYm, entries: chain };
}

/* 날짜별 데이터 캐시 — 같은 날의 두 번째 ISR 재생성부터는 조회 0회이고, 새 거래가 적재돼도
   **그 날의 문제는 바뀌지 않는다**("같은 날엔 모두 같은 문제"). 내일 치는 오늘 미리 만들어 두므로
   자정이 지나도 HTML 을 다시 만들 필요가 없다(화면이 KST 날짜로 고른다). 48시간이면 그 날이 끝난다. */
const cachedQuizDay = unstable_cache(buildQuizDay, ["quiz-price-game-v1"], {
  revalidate: 172_800,
  tags: ["quiz"],
});

export type QuizLoadResult =
  | { ok: true; days: QuizDay[] }
  | { ok: false; reason: "unconfigured" | "failed" };

const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

/**
 * 오늘·내일 두 판. 오늘 판이 없으면 실패다(내일 판만으로는 오늘 문제를 낼 수 없다).
 *  - 서비스 롤 없음(로컬·미리보기 — 공개 키만으로는 후보 뷰를 못 읽는다) → 정직한 "준비 못 함" 화면.
 *  - 조회 실패 · 빌드 중 → 같은 화면(빌드를 죽이지 않는다; 다음 재생성에서 다시 읽는다).
 *  - 조회 실패 · 런타임 → 던진다. ISR 재생성이 실패하면 Next 는 직전 정상본을 계속 내보내고,
 *    정상본이 없으면 app/quiz/error.tsx 가 그린다(오류 화면을 6시간 캐시에 얼리지 않는다).
 */
export async function loadQuizDays(nowMs: number): Promise<QuizLoadResult> {
  if (!serviceReadClient()) return { ok: false, reason: "unconfigured" };
  const today = kstDateOf(nowMs);
  const [first, second] = await Promise.allSettled([
    cachedQuizDay(today),
    cachedQuizDay(addDaysIso(today, 1)),
  ]);
  if (first.status === "rejected") {
    if (IS_BUILD_PHASE) {
      logger.error("[quiz] 빌드 중 문제 풀 조회 실패 — 오류 화면으로 굽는다", first.reason);
      return { ok: false, reason: "failed" };
    }
    throw first.reason;
  }
  if (second.status === "rejected") {
    logger.warnSampled("quiz-tomorrow", "[quiz] 내일 문제 풀 조회 실패 — 오늘 판만 싣는다", second.reason);
  }
  return {
    ok: true,
    days: second.status === "fulfilled" ? [first.value, second.value] : [first.value],
  };
}
