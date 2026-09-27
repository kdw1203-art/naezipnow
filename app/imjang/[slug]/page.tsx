/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 7곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { getImjangGuide, type ImjangGuide } from "@/lib/imjang/guide";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
import { filterNotesByRegion } from "@/lib/imjang/notes-match";
import {
  inspectionAverageScore,
  listPublicNotes,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { formatKrwShort, formatYm, formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { QaBlock } from "@/app/components/QaBlock";

/* ============================================================
   지역 임장 가이드 — /imjang/[slug] (전략 정본 §4-2 프로그래매틱 임장 랜딩)

   /tx/[region] 이 "시세를 보는" 페이지라면, 이 페이지는 "현장에 가는" 페이지다
   (브랜드 대립 구도 그대로). 지역·밀도 기준은 /tx 와 같은 원천(minTx=10)을
   재사용한다 — 얇은 페이지를 새로 정의하지 않기 위해서다. 페이지 고유 내용은
   ① 단지 단위 임장 우선순위(실거래 합산)와 ② 표준 체크포인트다.

   슬러그는 /tx/[region] 과 같은 공간(regionToSlug) — 두 페이지가 1:1 로
   서로를 링크한다. DB 에 없는 슬러그는 404 (임의 문자열 페이지 양산 금지).
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 이 화면의 원천은 둘이고 둘 다 쓰기 지점이 비운다:
     · 실거래(지역 요약·단지 우선순위) — 적재 크론이 바뀐 지역만
       (app/api/cron/molit-transactions-ingest → invalidateImjangForTxRegions)
     · 이 지역의 공개 임장노트 — 노트 생성·공개 전환·수정·삭제가
       invalidatePublicNoteRoutes([지역]) 로 이 경로를 비운다(화면과 **같은 판정**을
       거꾸로 돌린 규칙: lib/town/changed-town-paths.ts imjangPathsForNoteRegion).
   사람이 쓴 노트가 7일 동안 안 보이면 안 되므로, 신선도는 TTL 이 아니라 그 비움이 맡는다. */
export const revalidate = 604_800;
/* 빈 배열 = ISR 분류용 (app/tx/[region]/page.tsx 의 같은 자리 주석 참고 —
   이 export 가 없으면 요청마다 서버 렌더 + no-store 로 돌아 함수 호출이 샌다). */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

/** null 은 "그런 지역이 없다"(→ 404)일 때만 — 조회 실패는 던진다 (soft-404 정책). */
async function load(slug: string): Promise<ImjangGuide | null> {
  return getImjangGuide(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await load(slug);
  if (!guide) {
    return { title: "지역 임장 가이드 | 내집나우", robots: { index: false, follow: false } };
  }
  const { region, topComplexes } = guide;
  const range = formatYmRange(region.firstYm, region.latestYm);
  const title = `${region.name} 임장 가이드 — 단지 우선순위·현장 체크포인트 | 내집나우`;
  const description = `${region.name} 임장(현장 답사) 준비: 실거래 ${region.txCount.toLocaleString(
    "ko-KR",
  )}건 기준 거래 활발 단지 ${Math.min(topComplexes.length, 10)}곳과 현장에서만 확인되는 체크포인트 ${
    IMJANG_CHECKPOINTS.length
  }가지.${range ? ` 국토교통부 신고 ${range}.` : ""} 실거래는 데이터로, 현장은 발로.`;
  const path = `/imjang/${encodeURIComponent(region.slug)}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website" },
  };
}

export default async function ImjangRegionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await load(slug);
  if (!guide) notFound();
  const { region, topComplexes } = guide;
  const range = formatYmRange(region.firstYm, region.latestYm);

  /* U3 플라이휠 조인 — 이 지역의 공개 임장노트. 곁다리 강화라 실패해도
     페이지는 계속 그리되, 실패와 0건은 화면에서 구분한다(사실 규율). */
  let regionNotes: InspectionNote[] = [];
  let notesFailed = false;
  try {
    regionNotes = filterNotesByRegion(await listPublicNotes(200), region.name, 4);
  } catch {
    notesFailed = true;
  }

  /* 지역 특징 한 줄 — 전부 실데이터에서 계산 (수치 창작 금지) */
  const busiestArea = region.areaCells.slice().sort((a, b) => b.txCount - a.txCount)[0] ?? null;

  const faq: FaqItem[] = [];
  if (topComplexes.length > 0) {
    const top = topComplexes[0];
    faq.push({
      q: `${region.name}에서 임장을 어느 단지부터 시작하면 좋나요?`,
      a: `실거래가 가장 활발한 단지를 기준점으로 삼는 것을 권합니다. ${region.name}에서는 ${top.name}이(가) ${
        top.txCount.toLocaleString("ko-KR")
      }건으로 거래가 가장 많았고${top.latestYm ? ` (마지막 신고 ${formatYm(top.latestYm)})` : ""}, 거래가 많은 단지는 가격 비교의 근거가 풍부해 다른 단지를 판단하는 자(尺)가 됩니다.`,
    });
  }
  if (busiestArea) {
    faq.push({
      q: `${region.name}에서 가장 거래가 활발한 면적대는 어디인가요?`,
      a: `면적대 구간 기준으로는 ${busiestArea.bandLabel} 구간이 ${busiestArea.txCount.toLocaleString(
        "ko-KR",
      )}건으로 가장 많습니다${range ? ` (국토교통부 신고 ${range})` : ""}. 평균 ${formatKrwShort(
        busiestArea.avgKrw,
      )} 수준으로, 수요가 두꺼운 면적대일수록 나중에 팔기도 쉽습니다.`,
    });
  }
  faq.push({
    q: "임장노트는 왜 쓰나요?",
    a: "실거래가는 누구나 볼 수 있지만 소음·주차·관리 상태 같은 현장 정보는 가 본 사람만 압니다. 기록해 두면 여러 단지를 같은 기준으로 비교할 수 있고, 내집나우는 기록을 AI 로 정리해 실거래 데이터와 나란히 놓아 줍니다.",
  });

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "임장 가이드", url: "/imjang" },
    { name: region.name, url: `/imjang/${encodeURIComponent(region.slug)}` },
  ]);

  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb={`홈 › 임장 가이드 › ${region.name}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄(데이터 브리핑) → 단지 구분선 행(오른쪽 거래 건수) → 체크포인트 행 →
          다녀온 기록 행 → 채움 파랑 1개 + 링크 한 줄 → 맨 끝 접힘 "출처·Q&A".
          지운 것: 브리핑 문단(→ 사실 줄), 우선순위 설명 문단, 체크포인트 카드 격자(→ 행), 노트 카드 격자·점수 배지(→ 행 오른쪽 숫자),
          칩 모양 링크 2개(→ 링크 한 줄), 맨 끝 출처 문단(→ 접힘). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">{region.name} 임장 가이드</h1>
          {/* 데이터 브리핑 — 가기 전에 아는 것. [1012] "시세" 는 실거래만 있는 곳에서 금지 */}
          <p className="t-sub text-text-3">
            실거래 {region.txCount.toLocaleString("ko-KR")}건{range ? ` · ${range}` : ""} · 단지{" "}
            {region.complexCount.toLocaleString("ko-KR")}곳
            {busiestArea ? ` · 최다 ${busiestArea.bandLabel} 평균 ${formatKrwShort(busiestArea.avgKrw)}` : ""}
          </p>
        </header>

        {/* 임장 우선순위 — 실거래 합산 상위 단지. [v4 · 규칙 5] 행 오른쪽 = 거래 건수 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            어느 단지부터 <span className="t-sub font-medium text-text-3">거래 활발 순 · 기준점부터</span>
          </h2>
          {topComplexes.length === 0 ? (
            <p className="card rounded-lg px-4 py-4 t-body text-text-2">면적대 구간에 정리된 단지 없음 · 아래 실거래 구간에서 지역 흐름</p>
          ) : (
            <ol data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {topComplexes.map((c, i) => (
                <li key={c.name}>
                  <Link
                    prefetch={false}
                    href={`/search?q=${encodeURIComponent(c.name)}`}
                    className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline"
                  >
                    <span className="w-5 shrink-0 t-body t-num text-text-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-ink">{c.name}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {c.avgKrw > 0 ? `평균 ${formatKrwShort(c.avgKrw)}` : "가격 확인 필요"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="t-body t-num text-ink">{c.txCount.toLocaleString("ko-KR")}건</span>
                      <span aria-hidden="true" className="t-body text-text-3">
                        ›
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 표준 체크포인트 — 가야만 확인되는 것들. [v4 · 규칙 5] 카드 격자 → 구분선 행 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            현장 체크포인트 <span className="t-num text-text-3">{IMJANG_CHECKPOINTS.length}</span>
            <span className="t-sub font-medium text-text-3">데이터로는 알 수 없는 것</span>
          </h2>
          <ol data-tone="sand" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {IMJANG_CHECKPOINTS.map((c, i) => (
              <li key={c.title} className="flex min-h-14 items-start gap-3 py-3">
                <span className="w-5 shrink-0 t-body t-num text-text-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold text-ink">{c.title}</span>
                  <span className="mt-0.5 block t-sub text-text-3">{c.why}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* 이 지역 공개 임장노트 — 가 본 사람의 기록 (U3 플라이휠). [v4] 카드 격자 → 행(오른쪽 평균 점수) */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            다녀온 기록 {regionNotes.length > 0 && <span className="t-num text-text-3">{regionNotes.length}</span>}
          </h2>
          {notesFailed ? (
            <p className="t-body text-text-2">공개 노트를 불러오지 못했어요 · 조회 실패(없음 아님)</p>
          ) : regionNotes.length === 0 ? (
            /* [1012] 규칙 5·6 — 어디서 + 동사·대상 링크 */
            <p className="t-body text-text-2">
              {region.name} 공개 임장노트 없음 ·{" "}
              <Link href="/notes/new" className={LINK}>
                {region.name} 첫 임장노트 쓰기
              </Link>
            </p>
          ) : (
            <ul data-tone="hanji" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {regionNotes.map((n) => {
                const avg = inspectionAverageScore(n.scores);
                return (
                  <li key={n.id}>
                    <Link
                      prefetch={false}
                      href={`/notes/${encodeURIComponent(n.id)}`}
                      className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate t-body font-bold text-ink">{n.title}</span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">
                          {[n.aptName, n.region].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {avg > 0 && <span className="t-body t-num text-ink">{avg.toFixed(1)}</span>}
                        <span aria-hidden="true" className="t-body text-text-3">
                          ›
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 다음 행동 — 기록으로 잇는다. [1012] CTA 는 동사 + 대상(지역명) · [v4 · 규칙 2] 채움 파랑 하나 */}
        <div className="flex flex-col gap-2">
          <Link href="/notes/new" className="btn-primary press flex min-h-12 items-center justify-center rounded-lg px-4 t-body no-underline">
            {region.name} 임장노트 쓰기
          </Link>
          <p className="t-sub text-text-3">
            <Link prefetch={false} href={`/map?q=${encodeURIComponent(region.name)}`} className={LINK}>
              {region.name} 지도에서 보기
            </Link>
            {" · "}
            <Link prefetch={false} href={`/tx/${encodeURIComponent(region.slug)}`} className={LINK}>
              면적대·가격대 실거래 {region.txCount.toLocaleString("ko-KR")}건 보기
            </Link>
            {/* [992 · A1] 노트 템플릿(/notes/templates)·모임(/town/groups) 칩 제거 — 둘 다 보관(비노출) */}
          </p>
        </div>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — 출처 + Q&A(FAQPage 스키마 · 같은 배열) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            출처·Q&amp;A
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col pb-3 pt-1">
            <p className="mb-4 t-caption text-text-3">
              국토교통부 신고 기준(해제분 제외) · 매물 호가 아님 · 면적대 구간에 정리된 건수라 지역 전체 신고분과 다를 수 있음
            </p>
            <QaBlock title={`${region.name} 임장 Q&A`} items={faq} />
          </div>
        </details>
      </div>
    </PageShell>
  );
}
