import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { listUpisGuSummary, totalsOf } from "@/lib/seoul/upis-store";
import { UPIS_SOURCE_URL, type UpisGuSummary } from "@/lib/seoul/upis-display";
import { logger } from "@/lib/log";
import { SEOUL_GU, SEOUL_GU_INDEX_HREF, seoulGuHref } from "@/lib/seoul/upis-gu";

/* [1045] 서울 자치구별 도시계획 결정 조서 — /redevelopment/seoul. 자치구 25곳 화면(/redevelopment/seoul/[gu])의 목차.
   구별 건수는 뷰(seoul_upis_gu_summary) 한 번. 이 화면은 주소가 하나라 빌드 때 미리 만들어진다 — 여기서 던지면 DB 가 잠깐
   흔들린 것만으로 배포가 깨진다. 그래서 잡되 삼키지 않는다: 건수 없이 자치구 25곳 링크만 그리고 "건수 불러오기 실패"라고 적는다
   (목차의 쓸모는 링크다). 구 미상(시청 접수라 구를 모르는 조서)은 건수만 적는다. */

export const revalidate = 86_400;

export const metadata = buildPageMetadata({
  title: "서울 자치구별 정비사업 · 지구단위계획 결정 조서",
  description:
    "서울 25개 자치구의 정비사업 · 도시개발 · 지구단위계획 결정 조서 건수와 자치구별 화면. 서울 열린데이터광장 원문.",
  path: SEOUL_GU_INDEX_HREF,
  og: { badge: "도시계획 결정 조서", sub: "서울 25개 자치구" },
});

export default async function SeoulPlanIndexPage() {
  let summary: UpisGuSummary[] = [];
  let failed = false;
  try {
    summary = await listUpisGuSummary();
  } catch (e) {
    logger.error("[/redevelopment/seoul] 구별 조서 건수 조회 실패", e);
    failed = true;
  }
  const totals = totalsOf(summary);
  const by = new Map(summary.map((g) => [g.sigungu, g]));
  const unknown = by.get("구 미상") ?? null;
  const num = (n: number) => n.toLocaleString("ko-KR");

  return (
    <PageShell breadcrumb="동네이야기 › 정비사업 지도 › 서울" wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "정비사업 지도", url: "/redevelopment" },
              { name: "서울 자치구별 결정 조서", url: SEOUL_GU_INDEX_HREF },
            ]),
          ]),
        }}
      />
      <PageHead
        icon="map"
        tone="bg-success-soft text-success"
        title="서울 자치구별 도시계획 결정 조서"
        sub="서울시 정비사업 · 도시개발 · 지구단위계획 결정 조서 · 자치구 25곳"
        className="mb-4 max-md:mb-3"
        facts={
          totals.total > 0 ? (
            <>
              <span>
                정비사업 <b className="t-num text-ink">{num(totals.rebuild)}</b>
              </span>
              <span>
                도시개발 <b className="t-num text-ink">{num(totals.urbanDev)}</b>
              </span>
              <span>
                지구단위계획 <b className="t-num text-ink">{num(totals.distUnitPlan)}</b>
              </span>
            </>
          ) : undefined
        }
        actions={
          <Link href="/redevelopment#seoul-plan" className="btn-outline btn-md rounded-xl no-underline">
            조서 검색
          </Link>
        }
      />

      {failed && (
        <p role="status" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
          건수 불러오기 실패 · 잠시 후 다시
        </p>
      )}
      <ul className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {SEOUL_GU.map((g) => {
          const s = by.get(g.name);
          return (
            <li key={g.slug}>
              <Link href={seoulGuHref(g.slug)} className="card tile flex min-h-10 flex-col gap-0.5 rounded-2xl px-4 py-3 no-underline max-md:px-3">
                <span className="t-body font-bold text-ink">{g.name}</span>
                <span className="t-sub t-num text-text-2">{s ? `${num(s.total)}건` : failed ? "—" : "0건"}</span>
                {s && (
                  <span className="t-caption t-num text-text-3">
                    정비 {num(s.rebuild)} · 지구단위 {num(s.distUnitPlan)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 t-caption text-text-3">
        {unknown ? `자치구를 알 수 없는 조서 ${num(unknown.total)}건(서울시 접수분)은 자치구 화면에 없음 · ` : ""}
        출처{" "}
        <a href={UPIS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center font-bold text-primary">
          서울 열린데이터광장 · 도시계획 결정 조서
        </a>{" "}
        · 매일 적재 · 원문 그대로 · 참고용(법적 효력 없음)
      </p>
    </PageShell>
  );
}
