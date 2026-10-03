import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { getProject, listProjects } from "@/lib/redevelopment/store";
import {
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import {
  ZONE_NEARBY_COMPLEX_RADIUS_M,
  ZONE_NEARBY_ZONE_RADIUS_M,
  kstDateLabel,
  matchZoneNews,
  pickNearbyZones,
  zoneDistanceLabel,
  type NearbyZone,
} from "@/lib/redevelopment/zone-detail";
import { listNearbyComplexes, type NearbyComplex } from "@/lib/redevelopment/nearby-complexes";
import { redevDetailHref } from "@/lib/redevelopment/map-layer";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";
import { postHref } from "@/lib/town/post-href";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { formatKrwShort, formatYmRange } from "@/lib/market/format";
import { krwPerPyeongToManwon } from "@/lib/map/price-tiers";
import { logger } from "@/lib/log";
import { ProjectDetailPanel } from "../ProjectDetailPanel";

/* ============================================================
   [1027] 정비사업 구역 상세 — /redevelopment/[id]

   재개발닷컴 벤치마크의 "구역을 누르면 고유 주소가 있는 상세"를 우리 데이터 범위 안에서 만든다.
   이 화면이 사실로 말하는 것:
     · 구역 이름 · 사업종류 · **현재 단계 하나** · 소재지 · 예정 세대수(공개된 구역만) · 자료 기준 시점 · 출처
     · 구역 대표점 반경 약 1km 안 아파트의 국토교통부 매매 실거래 집계(지도 시세 색상과 같은 뷰)
     · 반경 약 3km 안의 다른 구역(같은 표의 다른 행)
     · 구역 이름이 들어간 수집 기사(있을 때만)
   말하지 않는 것(자료가 없다):
     · 단계별 통과 날짜 · 시공사 · 조합원 수 · 분담금 · 구역 경계선 · 규제(토지거래허가 등)
   구역 좌표가 대표점 근사값이라 주변 단지는 거리순이 아니라 거래 많은 순이고, 단지별 거리는 적지 않는다.
   ============================================================ */

/* 구역 표는 손으로 정리한 자료라 하루에 여러 번 바뀌지 않는다. 주변 실거래는 하루 1번 적재 —
   그 적재가 끝나면 SOURCE_MAP.molit 이 "/redevelopment/[id]" 를 비운다(lib/cache/invalidate.ts). */
export const revalidate = 86_400;

/* 빈 배열 = 빌드 때 미리 만들지 않는다(요청이 오면 만들어 캐시). 이 export 가 있어야 ISR 로 분류된다
   — app/tx/[region]/page.tsx 의 같은 자리 주석 참고. */
export function generateStaticParams(): { id: string }[] {
  return [];
}

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/* 날짜는 한국 날짜로 고정 — 아래 ProjectDetailPanel(같은 함수)과 글자가 같아야 한다 */
const fmtDate = kstDateLabel;

function householdsText(p: RedevelopmentProject): string | null {
  return p.households != null && Number.isFinite(p.households) && p.households > 0
    ? `${Math.round(p.households).toLocaleString("ko-KR")}세대`
    : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const project = await getProject(decodeId(raw));
  if (!project) {
    return { title: "정비사업 구역 | 내집나우", robots: { index: false, follow: false } };
  }
  const type = labelForType(project.typeKey);
  const stage = stageLabel(project.stageKey);
  const asOf = project.asOf ?? fmtDate(project.updatedAt);
  const hh = householdsText(project);
  const loc = locationLabel(project);
  return buildPageMetadata({
    title: `${project.name} ${type} 진행 단계·주변 실거래`,
    description: `${loc} ${project.name}(${type}) — 현재 ${stage} 단계${asOf ? `(${asOf} 공개자료 기준)` : ""}${
      hh ? `, 예정 ${hh}` : ""
    }. 구역 주변 아파트의 국토교통부 실거래와 가까운 정비사업 구역을 함께 봅니다.`,
    path: redevDetailHref(project.id),
    og: { badge: "정비사업", sub: `${type} · ${stage}` },
  });
}

type Loaded<T> = { items: T[]; failed: boolean };

async function loadNearbyComplexes(p: RedevelopmentProject): Promise<Loaded<NearbyComplex>> {
  try {
    return { items: await listNearbyComplexes({ lat: p.lat, lng: p.lng }, 8), failed: false };
  } catch (e) {
    logger.error("[/redevelopment/[id]] 주변 단지 조회 실패", e);
    return { items: [], failed: true };
  }
}

async function loadNearbyZones(p: RedevelopmentProject): Promise<Loaded<NearbyZone>> {
  try {
    const all = await listProjects({ limit: 3000 });
    return { items: pickNearbyZones(p, all, ZONE_NEARBY_ZONE_RADIUS_M, 6), failed: false };
  } catch (e) {
    logger.error("[/redevelopment/[id]] 가까운 구역 조회 실패", e);
    return { items: [], failed: true };
  }
}

function postTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/* 기사는 있을 때만 그리는 덧붙임이다 — 못 읽으면 칸을 내지 않는다(없다고 말하지도 않는다). */
async function loadZoneNews(p: RedevelopmentProject): Promise<Post[]> {
  try {
    const posts = await readBoardPosts();
    return matchZoneNews(posts, p.name)
      .sort((a, b) => postTime(b) - postTime(a))
      .slice(0, 5);
  } catch (e) {
    logger.error("[/redevelopment/[id]] 관련 기사 조회 실패", e);
    return [];
  }
}

export default async function RedevelopmentZonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  /* 조회 실패는 던진다(5xx — 크롤러가 다시 온다). null 은 "그런 구역이 없다"일 때만 → 404. */
  const project = await getProject(decodeId(raw));
  if (!project) notFound();

  const [complexes, zones, news] = await Promise.all([
    loadNearbyComplexes(project),
    loadNearbyZones(project),
    loadZoneNews(project),
  ]);

  const color = colorForType(project.typeKey);
  const type = labelForType(project.typeKey);
  const stage = stageLabel(project.stageKey);
  const asOf = project.asOf ?? fmtDate(project.updatedAt);
  const hh = householdsText(project);
  const loc = locationLabel(project);
  const path = redevDetailHref(project.id);
  /* z 는 네이버 줌(15 = 단지 축척) — /map 이 주소에 써 두는 단위와 같다(lib/map/entry-params) */
  const mapHref = `/map?lat=${project.lat.toFixed(5)}&lng=${project.lng.toFixed(5)}&z=15&layers=price,redev`;

  /* 표 머리의 기간 — 실린 단지들이 실제로 덮는 계약월 범위(가장 이른 달 ~ 가장 늦은 달) */
  const firstYm = complexes.items.map((c) => c.firstYm).filter((v): v is string => !!v).sort()[0] ?? null;
  const latestYm =
    complexes.items
      .map((c) => c.latestYm)
      .filter((v): v is string => !!v)
      .sort()
      .at(-1) ?? null;
  const range = formatYmRange(firstYm, latestYm);

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "정비사업 지도", url: "/redevelopment" },
    { name: project.name, url: path },
  ]);

  return (
    <PageShell breadcrumb={`동네이야기 › 정비사업 지도 › ${project.name}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs]) }} />

      {/* ===== 머리 — 이름 · 종류 · 현재 단계 · 사실 한 줄 ===== */}
      <header className="rise-in mb-4 flex flex-wrap items-start justify-between gap-3 max-md:mb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <h1 className="t-title text-ink">{project.name}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-surface chip-pad t-sub font-semibold text-text-1">
              {type}
            </span>
            <span className="rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
              현재 {stage}
            </span>
            {project.isSample ? (
              <span className="rounded-full bg-warning-soft chip-pad t-caption font-bold text-warning">
                예시 데이터
              </span>
            ) : null}
          </div>
          <p className="mt-2 t-sub text-text-2">
            {loc}
            {hh ? ` · 예정 ${hh}` : ""}
            {asOf ? ` · ${asOf} 공개자료 기준` : ""}
          </p>
        </div>
        <Link
          href={mapHref}
          className="btn-primary btn-cta inline-flex min-h-[40px] shrink-0 items-center rounded-xl px-4 t-body no-underline"
        >
          지도에서 보기
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          {/* ===== 진행 상황 · 현황 자료 · 이 단계에서 확인할 것 (목록 화면과 같은 패널) ===== */}
          <ProjectDetailPanel project={project} hideHeader />

          {/* ===== 주변 아파트 실거래 ===== */}
          <section className="rise-in-1 card p-[var(--pad-card)]">
            <h2 className="t-section text-ink">주변 아파트 실거래</h2>
            <p className="mt-0.5 t-caption text-text-3">
              구역 대표점 반경 약 {(ZONE_NEARBY_COMPLEX_RADIUS_M / 1000).toFixed(0)}km · 거래 많은 순 · 국토교통부 매매 신고
              {range ? ` ${range}` : ""}
            </p>
            {complexes.failed ? (
              <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
                주변 단지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            ) : complexes.items.length === 0 ? (
              <p className="mt-3 t-sub text-text-3">반경 안에 매매 실거래가 있는 아파트가 없어요.</p>
            ) : (
              /* 폰은 세 칸(단지 · 평단가 · 거래)만 — 다섯 칸을 가로로 밀면 평균 거래가가 잘려 보인다. 나머지 두 칸은 단지 화면에 있다 */
              <div data-tone="blue" className="lq-panel mt-3 overflow-x-auto max-md:mt-2">
                <table className="w-full text-left t-body md:min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border t-sub text-text-3">
                      <th className="py-2 font-medium">단지</th>
                      <th className="py-2 text-right font-medium">평단가</th>
                      <th className="py-2 text-right font-medium max-md:hidden">평균 거래가</th>
                      <th className="py-2 text-right font-medium">거래</th>
                      <th className="py-2 text-right font-medium max-md:hidden">준공 · 세대</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complexes.items.map((c) => {
                      const pp = krwPerPyeongToManwon(c.avgPerPyeongKrw);
                      return (
                        <tr key={`${c.regionName}|${c.complexName}`} className="border-b border-border last:border-b-0">
                          <td className="py-2.5">
                            <Link
                              prefetch={false}
                              href={complexHrefFromNames(c.regionName, c.complexName)}
                              className="inline-flex min-h-[24px] items-center font-bold text-primary underline"
                            >
                              {c.complexName}
                            </Link>
                            <div className="t-caption text-text-3">{c.regionName}</div>
                          </td>
                          <td className="py-2.5 text-right t-num font-bold text-ink">
                            {pp != null ? `${pp.toLocaleString("ko-KR")}만/평` : "—"}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-text-2 max-md:hidden">
                            {formatKrwShort(c.avgKrw)}
                            {c.avgAreaM2 != null ? (
                              <div className="t-caption text-text-3">전용 평균 {Math.round(c.avgAreaM2)}㎡</div>
                            ) : null}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-text-2">
                            {c.txCount.toLocaleString("ko-KR")}건
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-text-2 max-md:hidden">
                            {c.buildYear != null ? `${c.buildYear}년` : "—"}
                            <div className="t-caption text-text-3">
                              {c.households != null ? `${c.households.toLocaleString("ko-KR")}세대` : "세대수 —"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 t-caption text-text-3">
              구역 좌표는 대표점 근사값 · 구역 경계와 일치하지 않음 · 매물 호가 아님 · 해제 신고분 제외
            </p>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          {/* ===== 가까운 구역 ===== */}
          <section className="card rounded-2xl px-4 py-3">
            <h2 className="t-sub font-bold text-ink">가까운 정비사업 구역</h2>
            <p className="t-caption text-text-3">
              반경 약 {(ZONE_NEARBY_ZONE_RADIUS_M / 1000).toFixed(0)}km · 가까운 구간 순
            </p>
            {zones.failed ? (
              <p className="mt-2 t-sub text-text-3">가까운 구역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            ) : zones.items.length === 0 ? (
              <p className="mt-2 t-sub text-text-3">이 지도에 실린 구역 가운데 반경 안에 다른 구역이 없어요.</p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {zones.items.map(({ project: z, distanceM }) => (
                  <li key={z.id}>
                    <Link
                      prefetch={false}
                      href={redevDetailHref(z.id)}
                      className="flex min-h-[44px] items-center justify-between gap-2 py-2 no-underline"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: colorForType(z.typeKey) }}
                          />
                          <span className="truncate t-sub font-bold text-ink">{z.name}</span>
                        </span>
                        <span className="t-caption text-text-3">
                          {labelForType(z.typeKey)} · {stageLabel(z.stageKey)}
                        </span>
                      </span>
                      <span className="shrink-0 t-caption tabular-nums text-text-3">{zoneDistanceLabel(distanceM)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ===== 관련 기사 — 구역 이름이 들어간 수집 기사가 있을 때만 ===== */}
          {news.length > 0 ? (
            <section className="card rounded-2xl px-4 py-3">
              <h2 className="t-sub font-bold text-ink">관련 기사</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {news.map((n) => (
                  <li key={n.id}>
                    <Link prefetch={false} href={postHref(n)} className="group block no-underline">
                      <span className="t-sub font-bold text-ink group-hover:text-primary">{n.title}</span>
                      <span className="mt-0.5 block t-caption text-text-3">
                        {[n.sourceName || n.authorLabel, fmtDate(n.sourcePublishedAt || n.createdAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <nav aria-label="관련 화면" data-tone="blue" className="lq-panel flex flex-col divide-y">
            <Link
              href="/redevelopment"
              className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline"
            >
              정비사업 지도 전체 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
            <Link
              href="/redevelopment#stage-guide"
              className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline"
            >
              정비사업 7단계 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
          </nav>

          <p className="px-1 t-caption leading-[1.6] text-text-3">
            구역·진행 단계는 공개자료를 정리한 참고값이며 최신 고시와 다를 수 있음 · 단계별 인가일은 확보한 자료에 없음 ·
            실거래 출처: 국토교통부 실거래가 공개시스템
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
