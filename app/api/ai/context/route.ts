import { PUBLIC_CACHE } from "@/lib/http/cache-headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { buildLiveToolContextWithTrades, contextFootnotes, axisAgeDays } from "@/lib/ai/live-context";
import {
  diagnosisRadar,
  riskFlags,
  riskChecklist,
  timingSignals,
  counterScenarios,
} from "@/lib/ai/insight-blocks";
import { getServiceSupabase } from "@/lib/supabase/service";
import { decodeComplexId, encodeComplexId } from "@/lib/complex/complex-store";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { buildVerdict } from "@/lib/ai/verdict";
import { buildComplexTradeSeries } from "@/lib/ai/result-series";

/* [AI-16] 유사 단지 자동 후보 — 같은 지역에서 최근 거래가 활발한 단지 4곳.
   "무엇과 비교할지"부터 막히는 진입 마찰을 줄인다. 실패는 빈 배열(치명 아님).
   [1008 · W] 요청마다 market_transactions 매매 행을 최대 2,000행 읽어 JS 로 세던 것을
   complex_tx_stats_base(매일 갱신 단지 매트뷰)의 recent_trade_count(최근 6개월 매매) 로 바꿨다 —
   EXPLAIN 실측 88ms·1,038행 전송(안양 동안구) → 3.1ms·5행. 건수 기준이 3개월 → 6개월로 바뀐다(화면 라벨도). */
async function similarComplexes(
  complexId: string,
): Promise<{ id: string; name: string; txCount: number }[]> {
  const decoded = decodeComplexId(complexId);
  const sb = getServiceSupabase();
  if (!decoded || !sb) return [];
  const { data, error } = await sb
    .from("complex_tx_stats_base")
    .select("complex_name, recent_trade_count")
    .eq("region_name", decoded.region)
    .gt("recent_trade_count", 0)
    .order("recent_trade_count", { ascending: false })
    .limit(5);
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ complex_name: string | null; recent_trade_count: number | null }>)
    .map((r) => ({ name: (r.complex_name ?? "").trim(), txCount: Number(r.recent_trade_count ?? 0) }))
    .filter((r) => r.name && r.name !== decoded.name)
    .slice(0, 4)
    .map((r) => ({ id: encodeComplexId(decoded.region, r.name), name: r.name, txCount: r.txCount }));
}

/* [AI-32 2단계] 자동 로드 데이터 — 단지/지역을 받으면 실데이터 컨텍스트와
   구조화 판정(레이더·플래그·신호·반대 시나리오·각주)을 한 번에 돌려준다.
   워크벤치 2단계 미리보기와 3단계 실행 입력이 같은 응답을 쓴다(불일치 방지). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const complexId = url.searchParams.get("complexId");
  const regionName = url.searchParams.get("region");
  /* [993] 판단 카드는 도구마다 대표 수치가 다르다 — 없으면 종합 진단 기준으로 조립 */
  const toolParam = url.searchParams.get("tool");
  const tool: AiAnalysisToolId = toolParam && isAiAnalysisToolId(toolParam) ? toolParam : "ai-diagnosis";
  const wantSeries = url.searchParams.get("series") === "1";
  /* [1008 · 리뷰 A-3] 비교 도구 — 담은 단지 수(0~3). 결론 문장이 "나란히 놓았어요"를 말할지 정한다 */
  const compareRaw = Number(url.searchParams.get("compare") ?? "");
  const compareCount = Number.isFinite(compareRaw) && compareRaw >= 0 ? Math.min(3, Math.floor(compareRaw)) : null;
  if (!complexId && !regionName) {
    return NextResponse.json(
      { error: "complexId 또는 region 이 필요합니다." },
      { status: 400 },
    );
  }

  const now = new Date();
  const [{ ctx, trades }, similar] = await Promise.all([
    buildLiveToolContextWithTrades(complexId ?? null, regionName ?? null),
    complexId ? similarComplexes(complexId) : Promise.resolve([]),
  ]);
  /* [1008 · W] 결과 그래프 재료 — 대표가와 **같은 행·같은 평형**(lib/ai/result-series.ts). 행은 컨텍스트의
     단지 축 캐시에 이미 있어 조회가 늘지 않는다. "최근 6개월 거래" 칸은 늘 쓰고, 월별 칸(series)은
     워크벤치 본 조회(`series=1`)에서만 싣는다 — "다른 도구로 본 이 단지" 보드의 세 번 조회엔 그래프가 없다. */
  const price = ctx.complex?.price ?? null;
  const fullSeries =
    complexId && ctx.complex && trades
      ? buildComplexTradeSeries(trades.rows, {
          unitM2: price?.unitM2 ?? null,
          bandSlug: price?.bandSlug ?? null,
          label: price?.bandLabel ?? null,
          now,
          monthsBack: 36,
          capped: trades.capped,
        })
      : null;
  const series = wantSeries ? fullSeries : null;
  const footnotes = contextFootnotes(ctx);
  /* [993] 판단 카드 — 실데이터·규칙 판정만 조립(lib/ai/verdict.ts). 실행 전에도 보인다:
     결과값(대표 수치·핵심 숫자·근거)은 실행 버튼이 아니라 데이터가 만든다. */
  const verdict = buildVerdict({
    tool,
    ctx,
    footnotes,
    input: { similarCount: similar.length, compareCount },
    extras: { recent6: fullSeries?.recent6 ?? ctx.complex?.recent6 ?? null },
    now,
  });

  return NextResponse.json(
    {
      ok: true,
      context: ctx,
      verdict,
      footnotes: footnotes.map((f) => ({
        ...f,
        ageDays: axisAgeDays(f.asOf, now),
      })),
      insight: {
        radar: diagnosisRadar(ctx),
        flags: riskFlags(ctx),
        signals: timingSignals(ctx),
        counters: counterScenarios(ctx),
        /* [1008] 리스크 5항목 — 걸린 것만이 아니라 전부(통과·주의·참고·자료 없음) */
        checks: riskChecklist(ctx),
      },
      similar,
      /* [1008] 그래프 재료 — series=1 일 때만(아니면 null) */
      series,
    },
    /* [OPT-12] 공개 데이터만 담는 응답 — CDN 60초·백그라운드 갱신 10분.
       세션·개인화가 없으므로 private 일 이유가 없었다. */
    { headers: { "Cache-Control": PUBLIC_CACHE.short } },
  );
}
