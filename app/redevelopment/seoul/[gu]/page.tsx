import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Fineprint } from "@/app/components/Fineprint";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { listUpisRecordsForGu } from "@/lib/seoul/upis-store";
import { logger } from "@/lib/log";
import {
  UPIS_SERVICES,
  UPIS_SERVICE_META,
  UPIS_SOURCE_URL,
  upisAreaLabel,
  upisDateLabel,
  upisKind,
  type UpisRecord,
} from "@/lib/seoul/upis-display";
import { SEOUL_GU, SEOUL_GU_INDEX_HREF, digestGuRecords, seoulGuBySlug, seoulGuHref } from "@/lib/seoul/upis-gu";

/* ============================================================
   [1045] 서울 자치구 도시계획 결정 조서 — /redevelopment/seoul/[gu]

   왜: 정비사업 사이트맵은 2026-07-22 에 손으로 정리한 구역 40곳만 싣고 있었고, 매일 적재되는 서울시 조서
   (seoul_upis_records · 정비사업 · 도시개발 · 지구단위계획)는 /redevelopment 의 검색 칸 안에만 있어 고유 주소가 없었다.
   운영 점검(seo.sitemap_source)이 "색인이 멈춘 원천에 물려 있고, 살아 있는 원천은 한 건도 색인에 없다"고 짚었다.
   조서 한 건은 한 줄이라 건별 화면은 얇다 — 자치구로 묶는다(구마다 159~725건 · 2026-10-07).

   이 화면이 사실로 말하는 것: 구의 조서 수 · 사업(프로젝트 코드) 수 · 종류별 건수 · 최근 결정 40건 · 조서가 많은 사업 12곳 ·
   동별 건수 · 조서 유형별 건수. 전부 원문 행에서 센 값이고 원문 낱말을 그대로 적는다(이용허락: 변경금지).
   말하지 않는 것(원문에 없다): 좌표 · 세대수 · 진행 단계 · 시공사. 결정일은 고시 관리코드에 박힌 날짜다.

   자치구 25곳을 빌드 때 미리 만들고(generateStaticParams) 그 밖의 낱말은 받지 않는다(dynamicParams=false) — 없는 구는
   미들웨어 전에 정적 404 다. 요청 때 만드는 방식(빈 목록 + notFound())은 운영에서 없는 주소에 200 을 준다
   (2026-10-07 실측: /redevelopment/없는id → 200 + noindex). 낱말이 25개로 정해져 있으니 진짜 404 를 준다.
   조회 실패: 빌드 중이면 "불러오기 실패" 화면을 그리고 넘어간다(DB 한 번의 흔들림으로 배포를 깨지 않는다 — 하루 뒤 다시 만든다).
   운영의 재검증 중이면 던진다 — Next 가 직전에 만든 화면을 그대로 둔다(실패 화면으로 덮어쓰지 않는다).
   ============================================================ */

export const revalidate = 86_400;
export const dynamicParams = false;

export function generateStaticParams(): { gu: string }[] {
  return SEOUL_GU.map((g) => ({ gu: g.slug }));
}

const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

type Params = { gu: string };

const RECENT_ROWS = 40;
const BUSY_ZONES = 12;
const EMD_CHIPS = 24;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { gu: slug } = await params;
  const gu = seoulGuBySlug(slug);
  if (!gu) return { title: "자치구 없음 | 내집나우" };
  return buildPageMetadata({
    title: `${gu.name} 정비사업 · 지구단위계획 결정 조서`,
    description: `서울 ${gu.name}의 정비사업 · 도시개발 · 지구단위계획 결정 조서. 최근 결정, 사업별 · 동별 건수. 서울 열린데이터광장 원문.`,
    path: seoulGuHref(gu.slug),
    og: { badge: "도시계획 결정 조서", sub: `서울 ${gu.name} · 정비사업 · 지구단위계획` },
  });
}

type BusyZone = { key: string; name: string; n: number; lastDate: string | null; kind: string };

/** 조서가 많은 사업 — 프로젝트 코드로 묶는다(이름은 가장 최근 조서의 지역명 · 없으면 위치명). */
function busyZones(rows: readonly UpisRecord[], take: number): BusyZone[] {
  const m = new Map<string, BusyZone>();
  for (const r of rows) {
    if (!r.prjcCd) continue;
    const cur = m.get(r.prjcCd);
    if (cur) {
      cur.n += 1;
      continue;
    }
    /* rows 는 최근 결정 순 — 처음 만난 행이 그 사업의 가장 최근 조서다 */
    m.set(r.prjcCd, {
      key: r.prjcCd,
      name: r.rgnNm ?? r.pstnNm ?? "—",
      n: 1,
      lastDate: r.codeDate,
      kind: UPIS_SERVICE_META[r.service].short,
    });
  }
  return [...m.values()]
    .filter((z) => z.n >= 2)
    .sort((a, b) => b.n - a.n || (b.lastDate ?? "").localeCompare(a.lastDate ?? ""))
    .slice(0, take);
}

export default async function SeoulGuPlanPage({ params }: { params: Promise<Params> }) {
  const { gu: slug } = await params;
  const gu = seoulGuBySlug(slug);
  if (!gu) notFound();

  let rows: UpisRecord[] = [];
  let failed = false;
  try {
    rows = await listUpisRecordsForGu(gu.name);
  } catch (e) {
    if (!IS_BUILD_PHASE) throw e;
    logger.error(`[/redevelopment/seoul/${gu.slug}] 조서 조회 실패(빌드) — 실패 화면으로 넘어간다`, e);
    failed = true;
  }
  const d = digestGuRecords(rows);
  const recent = rows.slice(0, RECENT_ROWS);
  const busy = busyZones(rows, BUSY_ZONES);
  const emds = d.byEmd.slice(0, EMD_CHIPS);
  const path = seoulGuHref(gu.slug);
  const num = (n: number) => n.toLocaleString("ko-KR");

  return (
    <PageShell breadcrumb={`동네이야기 › 정비사업 지도 › 서울 ${gu.name}`} wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "정비사업 지도", url: "/redevelopment" },
              { name: "서울 자치구별 결정 조서", url: SEOUL_GU_INDEX_HREF },
              { name: gu.name, url: path },
            ]),
          ]),
        }}
      />

      <PageHead
        icon="map"
        tone="bg-success-soft text-success"
        title={`${gu.name} 도시계획 결정 조서`}
        sub="서울시 정비사업 · 도시개발 · 지구단위계획 결정 조서 · 자치구 단위"
        className="mb-4 max-md:mb-3"
        facts={
          d.total > 0 ? (
            <>
              <span>
                조서 <b className="t-num text-ink">{num(d.total)}</b>건
              </span>
              <span>
                사업 <b className="t-num text-ink">{num(d.zones)}</b>곳
              </span>
              {d.lastDate && (
                <span>
                  최근 결정 <b className="t-num text-ink">{upisDateLabel(d.lastDate)}</b>
                </span>
              )}
            </>
          ) : undefined
        }
        actions={
          <Link
            href={`/redevelopment?gu=${encodeURIComponent(gu.name)}#seoul-plan`}
            className="btn-outline btn-md rounded-xl no-underline"
          >
            조서 검색
          </Link>
        }
      />

      {failed ? (
        <div role="status" className="card rounded-2xl px-5 py-6 t-body text-text-2 max-md:px-3.5 max-md:py-4">
          조서 불러오기 실패 · 잠시 후 다시
        </div>
      ) : d.total === 0 ? (
        <div className="card rounded-2xl px-5 py-6 t-body text-text-2 max-md:px-3.5 max-md:py-4">{gu.name} 조서 없음</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            {/* 종류별 건수 */}
            <dl className="grid grid-cols-3 gap-2 md:gap-3">
              {UPIS_SERVICES.map((s) => (
                <div key={s} className="card rounded-2xl px-4 py-3 max-md:px-3">
                  <dt className="t-caption text-text-3">{UPIS_SERVICE_META[s].label}</dt>
                  <dd className="t-section t-num text-ink">{num(d.byService[s])}건</dd>
                </div>
              ))}
            </dl>

            {/* 최근 결정 */}
            <section className="card p-[var(--pad-card)]" aria-labelledby="gu-recent-title">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="gu-recent-title" className="t-section text-ink">
                  최근 결정
                </h2>
                <span className="t-caption text-text-3 tabular-nums">
                  {recent.length} / {num(d.total)}건 · 결정일 순
                </span>
              </div>
              <ol className="mt-2 flex flex-col divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.rptMngCd} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                    <span className="w-[78px] shrink-0 tabular-nums t-sub text-text-2">{upisDateLabel(r.codeDate)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="t-sub font-bold text-ink">{r.rgnNm ?? r.pstnNm ?? "—"}</span>
                      <span className="t-sub text-text-2">
                        {" "}
                        · {UPIS_SERVICE_META[r.service].short} · {r.rptType ?? "—"} · {upisKind(r)} · {upisAreaLabel(r)}
                      </span>
                      {r.pstnNm && r.pstnNm !== r.rgnNm ? (
                        <span className="block t-caption text-text-3">{r.pstnNm}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {/* 조서가 많은 사업 */}
            {busy.length > 0 && (
              <section className="card p-[var(--pad-card)]" aria-labelledby="gu-busy-title">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 id="gu-busy-title" className="t-section text-ink">
                    조서가 많은 사업
                  </h2>
                  <span className="t-caption text-text-3">프로젝트 코드 기준 · 2건 이상</span>
                </div>
                <ol className="mt-2 flex flex-col divide-y divide-border">
                  {busy.map((z) => (
                    <li key={z.key} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="t-sub font-bold text-ink">{z.name}</span>
                        <span className="t-sub text-text-2"> · {z.kind}</span>
                      </span>
                      <span className="shrink-0 t-sub tabular-nums text-text-2">
                        {num(z.n)}건 · 최근 {upisDateLabel(z.lastDate)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-4" aria-label={`${gu.name} 조서 보조`}>
            {emds.length > 0 && (
              <section className="card p-[var(--pad-card)]" aria-labelledby="gu-emd-title">
                <h2 id="gu-emd-title" className="t-section text-ink">
                  동별 조서
                </h2>
                <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
                  {emds.map((e) => (
                    <li key={e.label} className="chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2">
                      {e.label} <b className="t-num text-ink">{num(e.n)}</b>
                    </li>
                  ))}
                </ul>
                <Fineprint>위치명에서 동을 읽은 조서만 · 많은 순 {emds.length}곳</Fineprint>
              </section>
            )}

            {d.byType.length > 0 && (
              <section className="card p-[var(--pad-card)]" aria-labelledby="gu-type-title">
                <h2 id="gu-type-title" className="t-section text-ink">
                  조서 유형
                </h2>
                <dl className="mt-2 flex flex-col divide-y divide-border">
                  {d.byType.map((t) => (
                    <div key={t.label} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="t-sub text-text-2">{t.label}</dt>
                      <dd className="t-sub t-num font-bold text-ink">{num(t.n)}건</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section className="card p-[var(--pad-card)]" aria-labelledby="gu-links-title">
              <h2 id="gu-links-title" className="t-section text-ink">
                {gu.name} 관련 화면
              </h2>
              <ul data-tone="plain" className="lq-panel mt-1 flex flex-col">
                {[
                  { href: `/town/${gu.slug}`, label: "동네 홈" },
                  { href: `/region/${gu.slug}`, label: "시장 데이터" },
                  { href: "/redevelopment", label: "정비사업 지도" },
                ].map((l) => (
                  <li key={l.href} className="border-b last:border-0">
                    <Link href={l.href} className="flex min-h-10 items-center justify-between gap-3 py-2 t-body text-text-1 no-underline">
                      {l.label}
                      <span className="shrink-0 t-body font-bold text-text-3" aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}

      {/* 다른 자치구 */}
      <nav className="mt-6 max-md:mt-4" aria-labelledby="gu-others-title">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="gu-others-title" className="t-section text-ink">
            다른 자치구
          </h2>
          <Link href={SEOUL_GU_INDEX_HREF} className="inline-block py-[5px] t-sub font-bold text-primary">
            서울 전체 ›
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEOUL_GU.filter((g) => g.slug !== gu.slug).map((g) => (
            <Link
              key={g.slug}
              href={seoulGuHref(g.slug)}
              className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
            >
              {g.name}
            </Link>
          ))}
        </div>
      </nav>

      <p className="mt-4 t-caption text-text-3">
        출처{" "}
        <a href={UPIS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center font-bold text-primary">
          서울 열린데이터광장 · 도시계획 결정 조서
        </a>{" "}
        · 매일 적재 · 원문 그대로 · 참고용(법적 효력 없음) · 결정일 = 고시 코드 기준
      </p>
    </PageShell>
  );
}
