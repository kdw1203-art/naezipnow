/**
 * GET /api/cron/news-revalidate — 뉴스룸·동네 피드·동네 홈 ISR 을 지금 비운다.
 *
 * [1007] 왜 이 라우트가 있나: 뉴스(board_posts 자동수집)는 이 저장소 밖의 08:00 KST
 * 세션(ingest_daily_news)이 DB 에 직접 넣는다 — 코드 안에 "적재가 끝난 순간"이 없다.
 * /town/news·/town·/town/[region] 의 ISR 을 10분 → 6시간으로 늘리면서(크롤러 재렌더
 * 하루 985+198회 절감), 적재 직후의 신선도는 이 라우트가 잇는다:
 *   · vercel.json 크론 — 08:40·10:40·14:40 KST(적재 지연·재시도를 덮는 세 슬롯).
 *   · 외부 적재 워크플로가 끝날 때 `Authorization: Bearer <CRON_SECRET>` 로 이 주소를
 *     한 번 부르면 즉시 반영된다(선택 — 소유자에게 안내).
 * 한 번 호출 = revalidatePath 3건(뉴스룸 첫 장 · 동네 피드 · 동네 홈 62곳 패턴). 함수 시간
 * 수십 ms. 태그 "news" 는 비우지 않는다(lib/cache/invalidate.ts 의 news 항목 주석).
 * 보호: CRON_SECRET 또는 관리자 세션(lib/cron/authorize.ts).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { invalidateAfterIngest, TOWN_NEWS_PATHS, TOWN_FEED_PATHS, TOWN_REGION_ROUTE } from "@/lib/cache/invalidate";
import { invalidateNewsHubs } from "@/lib/town/invalidate-town";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  invalidateAfterIngest("news");
  /* [1010] 뉴스 주제 허브 20곳(/town/news/tag/{slug})과 동네 데이터 캐시(동네 글 병합 목록·
     주간 다이제스트)도 같이 비운다. 허브 TTL 을 30분 → 1일로, 데이터 캐시를 15분·1시간 →
     1일로 올렸기 때문이다 — 그 데이터 캐시 TTL 이 /town/news·/town/news/[id]·/complex/{id}
     라우트의 실제 TTL 을 대신 정하고 있었다(lib/town/cache-tags.ts 의 빌드 산출물 실측). */
  invalidateNewsHubs();
  return NextResponse.json({
    ok: true,
    revalidated: [
      ...TOWN_NEWS_PATHS,
      ...TOWN_FEED_PATHS,
      `${TOWN_REGION_ROUTE} (page)`,
      "/town/news/tag/[tag] (page)",
    ],
    at: new Date().toISOString(),
  });
}
