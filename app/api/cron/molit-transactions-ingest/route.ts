/**
 * GET/POST /api/cron/molit-transactions-ingest
 *
 * 국토교통부 아파트 실거래가(RTMS) → `market_transactions` 적재.
 * 시군구 슬라이스를 12시간 창 기준으로 회전하며 전국을 순차 커버한다.
 * 이미 데이터가 있는 (시군구, 계약월) 조합은 건너뛰므로 이중 계상이 없다.
 *
 * 파라미터
 *   ?yyyymm=202606      대상 계약월 (기본: 날짜 홀짝으로 당월/전월 교대 — autoTargetMonth)
 *   ?slice=3            슬라이스 인덱스 수동 지정
 *   ?size=16            1회 처리 시군구 수 (1~60)
 *   ?codes=11680,11710  특정 시군구 코드만 처리
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * MOLIT 인증키 미설정 시 적재 0건으로 정상 반환(가짜 데이터 생성 없음).
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestMolitTransactions, type MolitIngestResult } from "@/lib/market/molit-transactions";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { invalidateAfterIngest, invalidateComplexIds, invalidatePathList } from "@/lib/cache/invalidate";
import { invalidateImjangForTxRegions } from "@/lib/town/invalidate-town";
import { complexCacheIdsFromNames } from "@/lib/complex/complex-invalidate";
import {
  buildComplexTxSlug,
  findComplexTxRegionByTransactionName,
} from "@/lib/market/complex-transactions";
import { logger } from "@/lib/log";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const num = (key: string): number | undefined => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const codes = url.searchParams
    .get("codes")
    ?.split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const yyyymm = url.searchParams.get("yyyymm") ?? undefined;

  /* F3(#147) — 성공 로그는 ingestMolitTransactions() 안에서 남긴다. 여기서는
     그 함수가 통째로 던졌을 때(키 만료·공공 API 장애·DB 오류)를 받는다.
     이걸 잡지 않으면 실패한 실행이 로그에 아무 흔적도 남기지 않아서,
     어드민 신선도 화면에서 "크론이 아예 안 돌았다"와 구분되지 않는다.

     시간 초과도 같은 문제다 — maxDuration=300 에 걸려 죽으면 catch 도 안 돌아
     아무 기록이 안 남는다. 슬라이스가 크거나 공공 API 가 느린 날 실제로 그랬다.
     270초에 스스로 접는다. 이미 채운 (시군구, 계약월) 조합은 건너뛰므로 중간에
     버려도 이중 계상이 없고, 남은 시군구는 다음 회전에서 다시 잡힌다. */
  const run = await withBudget(
    Promise.resolve().then(() =>
      ingestMolitTransactions({
        yyyymm,
        slice: num("slice"),
        sliceSize: num("size"),
        codes: codes?.length ? codes : undefined,
        /* [997] ?gaps=1 — 그 달에 0행인 시군구만(행정구역 개편 뒤 빈 구·월 메우기, GH ETL 이 매일 호출) */
        gapsFirst: url.searchParams.get("gaps") === "1",
      }),
    ),
    CRON_WORK_BUDGET_MS,
  );

  /* yyyymm 미지정이면 ingestMolitTransactions 가 당월/전월을 날짜 홀짝으로 고른다.
     성공 로그의 dataset 은 그 함수가 실제 고른 yyyymm 으로 남기므로(logIngest 내부),
     여기 라벨은 오류/타임아웃 경로에서만 쓰인다 — "(자동: 당월/전월)"로 표기. */
  const dataset = `아파트 매매·전월세 실거래 ${yyyymm ?? "(자동: 당월/전월)"}`;

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({
      source: "molit",
      dataset,
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    /* [OPT-10] 수집이 실제로 끝난 순간에만 캐시를 비운다 — 시간 추측 제거 */
    invalidateAfterIngest("molit");
    return NextResponse.json(
      { ok: false, error: message, timedOut: true, finishedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "실거래 적재 실패");
    await logIngest({
      source: "molit",
      dataset,
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json(
      { ok: false, error: message, finishedAt: new Date().toISOString() },
      { status: 500 },
    );
  }

  /* [1010] 적재가 실제로 끝난 순간에만 캐시를 비운다.
     예전에는 이 호출이 **시간 초과 경로에만** 있었다 — 0행을 적재하고 죽은 실행은 비우고,
     정상 적재한 실행은 안 비우는 반대 모양이었다. molit SOURCE_MAP(/ · /analysis* · /tx ·
     /map · /data/records · /reports + "market" 태그)이 성공 경로에서 한 번도 돌지 않았다는 뜻이다.
     TTL 을 7일로 넓히면서 이 무효화가 신선도의 유일한 장치가 되므로 성공 경로에도 붙인다.
     단, **적재된 행이 있을 때만** 부른다 — 0행이면 집계가 달라질 수 없고(같은 판단이
     ingestMolitTransactions 의 aggregates 주석에 있다), 괜히 비우면 크롤러가 올 때
     재렌더만 만든다. 이번 판의 목적이 바로 그 재렌더를 없애는 것이다. */
  let touchedStats: { revalidated: number } = { revalidated: 0 };
  if (run.value.inserted > 0) {
    invalidateAfterIngest("molit");
    touchedStats = invalidateTouchedComplexes(run.value);
  }

  /* 응답에는 **개수만** 싣는다 — touchedComplexes 는 최대 2,000개라 그대로 실으면
     크론 응답이 수십 KB 커진다(브리프: 응답 크기를 키우지 않는다). */
  const { touchedComplexes, ...payload } = run.value;
  return NextResponse.json({
    ...payload,
    touched: touchedComplexes.length,
    touchedRevalidated: touchedStats.revalidated,
    finishedAt: new Date().toISOString(),
  });
}

/**
 * [1010] 이번 적재가 실제로 바꾼 단지 화면만 비운다.
 *
 * 비우는 것:
 *  · `/complex/{정규 슬러그}.{id}` · `/embed/complex/{id}` — invalidateComplexIds
 *    (두 라우트가 서로 다른 id 표기로 캐시돼 있다 — lib/complex/complex-cache-paths.ts 주석)
 *  · `/complex/tx/{단지명--지역id}` — 같은 실거래 행만으로 그려지는 화면.
 *    내부 지역 목록(서울 25구 + 광역 탐색 구 + 세종)으로 되짚을 수 없는 표기는 건너뛴다.
 *  · `/complex/compare` 와 `/complex/compare/[slug]` — 조합 화이트리스트(complex_pair_mv)와
 *    표의 숫자가 모두 이 실거래에서 나온다. 조합은 **어느 단지가 낀 조합인지** 를 알려면
 *    MV 를 한 번 더 읽어야 해서(운영 실측 669행), 대신 라우트 단위로 한 번에 비운다 —
 *    호출 2회로 끝나고, 조합 페이지는 669장이라 재렌더 비용이 롱테일과 비교가 안 된다.
 *
 * 재검증 실패가 적재 결과를 되돌리면 안 된다 — 헬퍼가 이미 예외를 삼키지만 호출도 감싼다.
 */
function invalidateTouchedComplexes(result: MolitIngestResult): { revalidated: number } {
  try {
    const ids: string[] = [];
    const txPaths: string[] = [];
    for (const c of result.touchedComplexes) {
      ids.push(...complexCacheIdsFromNames(c.region, c.name));
      const region = findComplexTxRegionByTransactionName(c.region);
      if (region) txPaths.push(`/complex/tx/${buildComplexTxSlug(c.name, region.id)}`);
    }
    /* 상한을 명시한다. 기본값(800)은 단지 4경로 × 200곳까지라 한 슬라이스를 덮지 못하고,
       상한 없이 수천 건을 밀어 넣으면 요청 끝 플러시가 크론 응답을 잡아먹는다(헬퍼 주석).
       2,000 = 단지 500곳 × 4경로 — 슬라이스 하나(시군구 16곳)의 상당 부분을 덮으면서
       revalidatePath 호출 수가 네 자리 초반에 머문다. 남는 몫은 7일 TTL 이 받는다. */
    const stats = invalidateComplexIds(ids, { budget: 2_000 });
    invalidatePathList(txPaths, { budget: 1_000, label: "complex-tx" });
    /* [1010 · 동네축] 지역 임장 가이드(/imjang/{slug})와 그 인덱스(/imjang)도 이 실거래만으로
       그려진다(lib/imjang/guide.ts) — SOURCE_MAP.molit 에는 없던 자리다. 이 두 화면의 TTL 을
       하루 → 7일로 늘리는 대신, 이번 슬라이스가 건드린 지역만 비운다. 슬러그 규칙은
       /tx/{slug} 와 같은 한 줄(regionToSlug)이라 지역 표기를 그대로 넘긴다. */
    invalidateImjangForTxRegions(result.touchedComplexes.map((c) => c.region));
    revalidatePath("/complex/compare");
    revalidatePath("/complex/compare/[slug]", "page");
    if (stats.truncated || result.touchedTruncated) {
      logger.warn(
        "[molit-tx] 단지 무효화 일부 생략 — 남은 단지는 TTL(7일)로 처리",
        `touched=${result.touchedComplexes.length}${result.touchedTruncated ? "(상한)" : ""}`,
        `paths=${stats.revalidated}/${stats.requested}`,
      );
    }
    return stats;
  } catch (e) {
    logger.warn("[molit-tx] 단지 재검증 실패(무시) — 적재 결과는 그대로", e);
    return { revalidated: 0 };
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
