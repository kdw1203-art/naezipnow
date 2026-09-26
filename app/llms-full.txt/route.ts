import { loadCoverage } from "@/lib/stats/coverage";
import { ACTIVE_REGION_CATALOG } from "@/lib/region/catalog";
import { listReportMonths } from "@/lib/reports/monthly";
import { GLOSSARY_TERMS } from "@/lib/seo/glossary-terms";
import { TEMPERATURE_REGIONS } from "@/lib/market/temperature";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { buildLlmsFullDoc } from "@/lib/seo/llms-full";
import { logger } from "@/lib/log";

/* ============================================================
   [1006 · E] /llms-full.txt — 정적 파일에서 라우트로(llms.txt 와 같은 전환, N16 2단계).

   public/llms-full.txt 는 이 커밋에서 삭제했다. public/ 에 같은 이름의 파일이 있으면
   Next 가 빌드에서 충돌로 실패하거나 라우트를 가린다 — 되살리지 말 것.

   본문 조립은 lib/seo/llms-full.ts(순수)가 하고, 여기서는 실데이터만 모은다.
   부하: 1시간 재검증 + head-count 두 번(coverage) + market_region_monthly 월 목록(5,000행
   상한, 집계 테이블) 한 번. 사이트맵 전체 로더 같은 무거운 것은 부르지 않는다.
   ============================================================ */

export const revalidate = 3600;

export async function GET() {
  const [coverage, reportMonths] = await Promise.all([
    loadCoverage(),
    /* 월 목록은 실패를 던진다(lib/reports/monthly 규칙) — 여기서는 null 로 접고 문서가
       "읽지 못했다"고 적게 한다. 빈 배열로 바꾸면 "리포트가 없다"는 거짓이 된다. */
    listReportMonths().catch((e: unknown) => {
      logger.warn(
        "[llms-full] 월간 리포트 월 목록을 읽지 못했습니다 — 목록 없이 렌더합니다:",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }),
  ]);
  const biz = getBusinessInfo();

  const body = buildLlmsFullDoc({
    coverage,
    towns: ACTIVE_REGION_CATALOG.map((t) => ({ id: t.id, name: t.name, city: t.city })),
    reportMonths,
    glossary: GLOSSARY_TERMS.map((g) => ({
      slug: g.slug,
      term: g.term,
      short: g.short,
      category: g.category,
    })),
    temperatureRegionCount: TEMPERATURE_REGIONS.length,
    business: {
      legalName: biz.legalName,
      representative: biz.representative,
      registrationNumber: biz.registrationNumber,
      supportEmail: biz.supportEmail,
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      /* 크롤러 엔드포인트 — CDN 1시간 (revalidate 와 일치, llms.txt 와 같은 값) */
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
