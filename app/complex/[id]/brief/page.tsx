/* [1025 · 브리핑] 중개사 브리핑 리포트 — /complex/[id]/brief. 시안 mock1025/brief-d.
   단지 상세(1024 v2)의 재료를 A4 한 장 문서로 다시 그린다. 오른쪽(lg)·위(폰)에 사무소 정보 폼 + "PDF 로 저장" + "링크 복사"(클라이언트,
   localStorage). 숫자는 있는 것만("—"). "시세" 낱말은 쓰지 않는다(실거래만 있는 화면). AI 문장 없음. QR 은 순수 SVG 라이브러리가 없어 주소 텍스트만.
   noindex — 고객에게 건네는 문서지 검색 랜딩이 아니다. 캐시는 단지 상세와 같은 ISR(7일, generateStaticParams []).

   [1025b · 브리핑] 소유자(2026-09-29) "디자인·기능·심플·테마" 다듬기 — 문서를 섹션 4개로 줄인다:
     발행자 띠(문서 맨 위 얇은 띠) → 단지명·주소 → ① 개요 8칸 → ② 타입별 최근 실거래 표 → ③ 전세가율·갭·관리비 한 줄 3칸
     (학교는 값 있을 때만 한 칸 더) → ④ 주의·출처(목록 + 맨 아래 면책 한 줄). 섹션 제목은 한 모양(t-section · 파란 점 하나 ·
     오른쪽 t-caption 한 줄). 머리(PageHead)는 사실 한 줄 + 오른쪽 버튼 1 — 아래 상태 줄은 없앴다(기준일은 ④ 안에서).
     내부 용어(K-apt 코드·POI)는 화면에 적지 않는다.

   [1025c · 브리핑] 소유자(2026-09-29) "심심하지 않아?" — 대표 그림·결론·손잡이. 시안 mock1025c/brief-d.
     · 머리 띠 bg-primary-soft(발행자 줄 · "내집나우 실거래 기준") → 단지명·주소 → **요약 띠**(최근 거래가 t-display 큰 숫자 ·
       전세가율 링 · 결론 한 줄 "최근 12개월 매매 N건 · 최근 {가격} · 전세가율 {%}") → **타입별 12개월 미니 차트 3개**
       (점 = 실거래 · 선 = 월 중앙값(3점 이상) · 막대 = 건수) → ① 개요 → ② 표 → ③ 전세가율 줄 → ④ 주의·출처 + **실제 QR**
       (qrcode 패키지 · 서버 전용 lib/brief/qr.ts · 단지 상세 주소).
     · 손잡이: 폼의 "표 강조 타입" 칩 → 문서의 미니 카드·표 행이 강조(첫 타입 기본 · BriefHighlightBridge).
     · 인쇄: 띠는 선 하나 · 미니 차트는 낮게 — A4 한 장 그대로(globals.css [1025c · 브리핑]). */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { ComplexOverviewStrip } from "../ComplexOverviewStrip";
import { gapManwon, krwToMan, ymDash } from "../complex-v2-model";
import { formatEokMan } from "@/lib/format/eok-man";
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";
import { kstParts } from "@/lib/format/kst";
import { pureIdFromParam } from "@/lib/seo/complex-slug";
import { complexCanonicalPath } from "@/lib/complex/complex-store";
import { resolveRegionId } from "@/lib/complex/dong";
import { axisRegionName } from "../section-loaders";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import {
  BRIEF_MINI_MAX,
  BRIEF_MINI_MONTHS,
  briefConclusion,
  briefMiniSeries,
  briefPathFromComplexPath,
  briefTypeRows,
  cancelledMonthsLabel,
  cancelledSummary,
  countInWindow,
  latestOf,
  nearestSchool,
  schoolDistanceLabel,
  shortUrlLabel,
} from "@/lib/brief/model";
import { HIGHLIGHT_ATTR, HIGHLIGHT_CLASS } from "@/lib/brief/highlight-store";
import { briefQrSvg } from "@/lib/brief/qr";
import { loadBrief, loadBriefRow } from "./load";
import { BriefPublisherLine } from "./BriefPublisherLine";
import { BriefPublisherForm } from "./BriefPublisherForm";
import { BriefHighlightBridge } from "./BriefHighlightBridge";
import { BriefMiniChart } from "./BriefMiniChart";
import { BriefRatioRing } from "./BriefRatioRing";

/* 단지 상세와 같은 캐시 정책 — 주소 하나에 HTML 한 벌(searchParams·쿠키·세션 없음). 빈 generateStaticParams 가 ISR 분류를 만든다
   (app/complex/[id]/page.tsx 의 2026-07-28 사고 메모). */
export const revalidate = 604_800;

export function generateStaticParams(): { id: string }[] {
  return [];
}

/** "2026.08.30" → "2026-08-30" (시안 표기) */
function dashDate(label: string | null): string | null {
  return label && /^\d{4}\.\d{2}\.\d{2}$/.test(label) ? label.replace(/\./g, "-") : label;
}

function ymDot(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

const won = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString("ko-KR")}원`);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = pureIdFromParam(decodeURIComponent(rawId));
  const row = await loadBriefRow(id);
  if (!row) {
    return { title: "단지를 찾을 수 없습니다 | 내집나우", robots: { index: false, follow: false } };
  }
  const title = `${row.name} 브리핑 리포트 | 내집나우`;
  return {
    title,
    description: `${row.name} 개요·타입별 최근 실거래·전세가율·주의 사항 — 국토교통부 실거래 기준, A4 1장 인쇄용.`,
    /* 고객에게 건네는 문서 — 색인하지 않는다(단지 화면이 정규 랜딩). 링크는 따라가도 된다. */
    robots: { index: false, follow: true },
    openGraph: { title, siteName: "내집나우", locale: "ko_KR", type: "website" },
  };
}

/** 섹션 머리 한 모양 — t-section(파란 점은 globals.css [1025b · 브리핑]) + 오른쪽 t-caption 한 줄 */
function SectionHead({ id, title, caption }: { id: string; title: string; caption?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={id} className="t-section text-ink">
        {title}
      </h3>
      {caption && <span className="t-caption text-text-3 tabular-nums">{caption}</span>}
    </div>
  );
}

/** ③ 의 칸 하나 — 라벨 · 값 · 근거 한 줄 */
function Cell({ label, value, sub, num = true }: { label: string; value: string; sub: string; num?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="t-caption text-text-3">{label}</span>
      <span className={`truncate t-title text-ink ${num ? "tabular-nums" : ""}`}>{value}</span>
      <span className="truncate t-caption text-text-3">{sub}</span>
    </div>
  );
}

export default async function ComplexBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = pureIdFromParam(decodeURIComponent(rawId));
  const data = await loadBrief(id);
  if (!data) notFound();
  const { row, deals, facts, mgmt, poi, freshness } = data;

  const complexPath = complexCanonicalPath(row);
  const briefPath = briefPathFromComplexPath(complexPath);
  const regionId = resolveRegionId(row.city, row.district);
  const regionLabel = axisRegionName(row.city, row.district) || row.district || row.city;

  const now = kstParts(Date.now());
  const nowYm = now ? `${now.year}${String(now.month).padStart(2, "0")}` : null;
  const dealsFailed = deals == null;
  const typeRows = deals ? briefTypeRows(deals, nowYm) : [];
  const live = (deals ?? []).filter((d) => !d.cancelled);
  const cancelled = deals ? cancelledSummary(deals) : null;
  const thisYear = nowYm?.slice(0, 4) ?? null;
  const yearCount = thisYear ? live.filter((d) => d.ym.startsWith(thisYear)).length : 0;

  /* [1025c] 요약 띠·미니 차트 재료 — 전부 같은 deals 에서(추정 없음) */
  const latest = deals ? latestOf(deals) : null;
  const count12 = deals ? countInWindow(deals, nowYm) : null;
  const typeAreas = typeRows.map((r) => r.areaM2);
  const minis = deals ? briefMiniSeries(deals, typeAreas, nowYm) : [];
  const miniMax = Math.max(0, ...minis.map((m) => m.count));
  const hlArea = typeAreas[0] ?? null;
  const hlAttrs = (area: number) => ({ [HIGHLIGHT_ATTR]: area });
  const hlClass = (area: number) => (area === hlArea ? HIGHLIGHT_CLASS : "");

  const jeonse = facts.jeonseRatio;
  const conclusion = briefConclusion({ count12, latestLabel: latest ? formatEokMan(latest.man) : null, jeonsePct: jeonse?.pct ?? null });
  const latestCaption = latest
    ? ["최근 실거래", latest.area != null ? `${Math.floor(latest.area)}㎡` : null, dealDateLabel(latest.ym, latest.day).replace(/\./g, "-"), floorLabel(latest.floor)]
        .filter(Boolean)
        .join(" · ")
    : dealsFailed
      ? "최근 실거래 · 조회 실패"
      : "최근 실거래 · 아직 신고된 매매 없음";
  const tradeMed = jeonse ? krwToMan(jeonse.tradeMedianKrw) : null;
  const jeonseMed = jeonse ? krwToMan(jeonse.jeonseMedianKrw) : null;
  const gap = gapManwon(tradeMed, jeonseMed);
  const ratioWindow = jeonse ? `최근 ${jeonse.windowMonths}개월 · ${ymDot(jeonse.fromYm)}~${ymDot(jeonse.toYm)}` : null;

  /* 학교 — 가장 가까운 초등학교(없으면 가장 가까운 학교). 값이 있을 때만 ③ 에 한 칸 더 */
  const school = nearestSchool(poi?.schools ?? []);

  const freshDash = dashDate(freshness);
  const headSub = [row.address?.trim() || null, row.road_address?.trim() && row.road_address.trim() !== row.address?.trim() ? row.road_address.trim() : null]
    .filter(Boolean)
    .join(" · ");
  const addressLine = headSub || `${row.city} ${row.district}`.trim();

  const cancelledText = dealsFailed
    ? "조회 실패"
    : cancelled && cancelled.count > 0
      ? `${cancelled.count}건 · ${cancelledMonthsLabel(cancelled.yms)} · 표에서 제외`
      : "0건";
  const basisText = [freshDash ? `국토교통부 실거래 ${freshDash}` : "국토교통부 실거래 기준일 조회 실패", mgmt?.latest ? `관리비 ${ymDash(mgmt.latest.ym)}` : null]
    .filter(Boolean)
    .join(" · ");
  const sourceText = ["국토교통부 실거래", mgmt ? "공동주택관리정보(K-apt) 관리비" : null, school ? "공공데이터포털 학교" : null].filter(Boolean).join(" · ");
  /* [1025c] 실제 QR — 단지 상세 주소(브리핑이 아니라 단지 화면). 실패는 null → 주소 텍스트만 */
  const qr = await briefQrSvg(`${DEFAULT_DESKTOP_ORIGIN}${complexPath}`);

  return (
    <PageShell>
      {/* 브레드크럼 칩 — 지역 허브 · 단지 화면 */}
      <div data-noprint="" className="flex flex-wrap gap-1.5">
        <Link
          href={regionId ? `/region/${regionId}` : `/map?region=${encodeURIComponent(row.district)}`}
          className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2"
        >
          {regionLabel}
        </Link>
        <Link href={complexPath} className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2">
          {row.name}
        </Link>
      </div>

      {/* 머리 — 사실 한 줄 + 오른쪽 버튼 1. 상태 줄 없음(기준일·해제는 문서 ④ 안에) */}
      <div data-noprint="">
        <PageHead
          className="mt-3"
          icon="file-text"
          title="브리핑 리포트"
          sub={`${row.name} · 개요 · 타입별 최근 실거래 · 전세가율 — A4 1장`}
          actions={
            <Link href={complexPath} className="btn-secondary btn-md press gap-1.5 no-underline">
              단지 화면
            </Link>
          }
        />
      </div>

      {/* 본문 | 오른쪽 폼(lg) — 폰은 폼이 위. [체크] lg:grid 의 base 는 grid-cols-1 · 사이드바 트랙은 minmax(0,1fr) */}
      <div className="brief-lay mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <aside className="min-w-0 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <BriefPublisherForm sharePath={briefPath} types={typeAreas} />
        </aside>

        <article aria-label={`${row.name} 브리핑 리포트`} className="brief-doc card min-w-0 rounded-2xl px-4 py-4 md:mx-auto md:w-full md:max-w-[800px] md:px-9 md:py-8 lg:order-1">
          {/* 발행자 띠 — 문서 맨 위 얇은 띠(카드 안쪽 여백을 되물려 가장자리까지) */}
          <BriefPublisherLine />

          <BriefHighlightBridge scope=".brief-doc" />

          <div className="mt-4">
            <h2 className="t-display text-ink">{row.name}</h2>
            <p className="m-0 mt-1 t-sub text-text-2">{addressLine}</p>
          </div>

          {/* [1025c] 요약 띠 — 최근 거래가 큰 숫자 · 결론 한 줄 · 전세가율 링. 값은 로더가 준 것만("—"·"조회 실패") */}
          <div className="brief-sum mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line bg-bg px-3.5 py-3">
            <div className="min-w-0">
              <p className="m-0 t-caption text-text-3">{latestCaption}</p>
              <p className={`m-0 t-display t-num ${latest ? "text-ink" : "text-text-3"}`}>{latest ? formatEokMan(latest.man) : "—"}</p>
              {conclusion && <p className="m-0 mt-1 t-sub font-bold text-ink">{conclusion}</p>}
            </div>
            <div className="flex flex-col items-center gap-1">
              <BriefRatioRing pct={jeonse?.pct ?? null} />
              <span className="t-caption text-text-3">전세가율</span>
            </div>
          </div>

          {/* [1025c] 타입별 최근 12개월 미니 차트 — 표 행과 같은 타입 최대 3개. 빈 상태는 회색 윤곽(기준선·빈 막대)만 */}
          <section aria-labelledby="brief-minis-title" className="mt-4">
            <SectionHead id="brief-minis-title" title={`타입별 ${BRIEF_MINI_MONTHS}개월 · 매매`} caption="점 = 실거래 · 선 = 월 중앙값 · 막대 = 건수" />
            <div className="brief-minis mt-2 grid grid-cols-3 gap-2">
              {minis.length === 0
                ? Array.from({ length: BRIEF_MINI_MAX }, (_, i) => (
                    <div key={i} className="brief-mini min-w-0 rounded-xl border border-line px-3 py-2.5 text-text-3">
                      <p className="m-0 t-caption text-text-3">{dealsFailed ? "조회 실패" : "실거래 없음"}</p>
                      <p className="m-0 truncate t-body font-bold tabular-nums">—</p>
                      <BriefMiniChart series={{ points: [], line: [], count: 0 }} maxCount={0} className="mt-1 block h-9 w-full" />
                      <p className="m-0 mt-0.5 truncate t-caption">—</p>
                    </div>
                  ))
                : minis.map((m) => {
                    const row = typeRows.find((r) => r.areaM2 === m.areaM2);
                    return (
                      <div key={m.areaM2} {...hlAttrs(m.areaM2)} className={`brief-mini min-w-0 rounded-xl border border-line px-3 py-2.5 ${hlClass(m.areaM2)}`}>
                        <p className="m-0 truncate t-caption text-text-3 tabular-nums">
                          {m.areaM2}㎡ · {BRIEF_MINI_MONTHS}개월 {m.count.toLocaleString("ko-KR")}건
                        </p>
                        <p className="m-0 truncate t-body font-bold tabular-nums text-ink">{row?.latest ? formatEokMan(row.latest.man) : "—"}</p>
                        <BriefMiniChart series={m} maxCount={miniMax} className="mt-1 block h-9 w-full text-primary" />
                        <p className="m-0 mt-0.5 truncate t-caption text-text-3 tabular-nums">
                          {row?.latest
                            ? `${row.median3Man != null ? `중앙 ${formatEokMan(row.median3Man)} → ` : ""}${dealDateLabel(row.latest.ym, row.latest.day).replace(/\./g, "-").slice(5)} · ${floorLabel(row.latest.floor)}`
                            : "—"}
                        </p>
                      </div>
                    );
                  })}
            </div>
          </section>

          {/* ① 개요 8칸 — 단지 상세와 같은 부품·같은 값 */}
          <section aria-labelledby="brief-overview-title" className="mt-4">
            <SectionHead id="brief-overview-title" title="개요" caption="단지 대장 기준" />
            <ComplexOverviewStrip row={row} />
          </section>

          {/* ② 타입별 최근 실거래 · 매매 */}
          <section aria-labelledby="brief-types-title" className="mt-5">
            <SectionHead
              id="brief-types-title"
              title="타입별 최근 실거래 · 매매"
              caption={
                dealsFailed ? (
                  "조회 실패"
                ) : (
                  <>
                    {thisYear ? `${thisYear}년 ${yearCount.toLocaleString("ko-KR")}건 · ` : ""}해제 제외
                    {hlArea != null && (
                      <>
                        {" · "}
                        <span data-brief-hl-label="">{hlArea}㎡ 강조</span>
                      </>
                    )}
                  </>
                )
              }
            />
            {typeRows.length === 0 ? (
              <p className="mt-2 rounded-lg bg-bg px-3 py-4 text-center t-body text-text-3">
                {dealsFailed ? "실거래를 지금 불러오지 못했습니다. 잠시 후 새로고침해 주세요." : "아직 신고된 매매 실거래 없음"}
              </p>
            ) : (
              <div className="-mx-1 mt-1 overflow-x-auto px-1">
                <table className="w-full min-w-[420px] border-collapse t-body">
                  <thead>
                    <tr className="text-left t-caption text-text-3">
                      <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">타입</th>
                      <th scope="col" className="border-b border-line py-1.5 pr-2 text-right font-semibold">최근가</th>
                      <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">계약일 · 층</th>
                      <th scope="col" className="border-b border-line py-1.5 pr-2 text-right font-semibold">중앙값 · 3개월</th>
                      <th scope="col" className="border-b border-line py-1.5 text-right font-semibold">건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map((r) => (
                      <tr key={r.areaM2} {...hlAttrs(r.areaM2)} className={`border-b border-divider last:border-0 ${hlClass(r.areaM2)}`}>
                        <td className="whitespace-nowrap py-2 pr-2 font-bold tabular-nums text-ink">{r.areaM2}㎡</td>
                        <td className="whitespace-nowrap py-2 pr-2 text-right font-bold tabular-nums text-ink">
                          {r.latest ? formatEokMan(r.latest.man) : "—"}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-text-1">
                          {r.latest ? `${dealDateLabel(r.latest.ym, r.latest.day).replace(/\./g, "-")} · ${floorLabel(r.latest.floor)}` : "—"}
                        </td>
                        <td className={`whitespace-nowrap py-2 pr-2 text-right tabular-nums ${r.median3Man != null ? "text-text-1" : "text-text-3"}`}>
                          {r.median3Man != null ? formatEokMan(r.median3Man) : "—"}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right tabular-nums text-text-1">{r.count.toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ③ 전세가율 · 갭 · 관리비 — 한 줄 3칸(학교는 값 있을 때만 한 칸 더). 재료는 단지 상세와 같다(전 타입 중앙값) */}
          <section aria-labelledby="brief-ratio-title" className="mt-5">
            <SectionHead id="brief-ratio-title" title={school ? "전세가율 · 갭 · 관리비 · 학교" : "전세가율 · 갭 · 관리비"} caption={ratioWindow} />
            <div className={`brief-cells mt-2 grid gap-3 ${school ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
              <Cell
                label="전세가율"
                value={jeonse ? `${jeonse.pct}%` : "—"}
                sub={jeonse ? "전세 중앙값 ÷ 매매 중앙값" : facts.jeonseRatioReason ?? "전세·매매 각 3건 이상일 때 계산"}
              />
              <Cell
                label="갭"
                value={gap != null ? formatEokMan(gap) : "—"}
                sub={gap != null ? `매매 ${formatEokMan(tradeMed)} − 전세 ${formatEokMan(jeonseMed)}` : "매매 중앙값 − 전세 중앙값"}
              />
              <Cell
                label="관리비 · 월 ㎡당"
                value={won(mgmt?.avgPerM2Krw)}
                sub={mgmt ? `최근 ${mgmt.months}개월 평균` : "관리비 자료 준비 중"}
              />
              {school && <Cell label={school.category?.includes("초등") ? "초등학교" : school.category ?? "학교"} value={school.name} sub={schoolDistanceLabel(school.distanceM)} num={false} />}
            </div>
          </section>

          {/* ④ 주의 · 출처 — 목록 + 맨 아래 면책 한 줄 */}
          <section aria-labelledby="brief-notice-title" className="mt-5 border-t border-line pt-3">
            <SectionHead id="brief-notice-title" title="주의 · 출처" />
            <ul className="m-0 mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
              <li className="flex min-h-10 items-center justify-between gap-3 py-2">
                <span className="shrink-0 t-body text-text-1">해제 신고</span>
                <span className="text-right t-sub text-text-3 tabular-nums">{cancelledText}</span>
              </li>
              <li className="flex min-h-10 items-center justify-between gap-3 py-2">
                <span className="shrink-0 t-body text-text-1">자료 기준일</span>
                <span className="text-right t-sub text-text-3 tabular-nums">{basisText}</span>
              </li>
              <li className="flex min-h-10 items-center justify-between gap-3 py-2">
                <span className="shrink-0 t-body text-text-1">신고 지연</span>
                <span className="text-right t-sub text-text-3">계약 후 30일 안 신고 · 최근 1~2개월은 늘 수 있음</span>
              </li>
              <li className="flex min-h-10 items-center justify-between gap-3 py-2">
                <span className="shrink-0 t-body text-text-1">출처</span>
                <span className="text-right t-sub text-text-3">{sourceText}</span>
              </li>
            </ul>
            {/* 출처 줄 — [1025c] 실제 QR(단지 상세 주소 · qrcode 서버 전용). QR 을 못 만들면 주소 텍스트만. 면책은 이 한 줄뿐 */}
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
              <div className="min-w-0">
                <p className="m-0 t-sub font-bold text-ink">내집나우 실거래 기준</p>
                <p className="m-0 break-all t-caption text-text-3">
                  {shortUrlLabel(DEFAULT_DESKTOP_ORIGIN, briefPath)}
                  {qr && " · QR 로 단지 화면"}
                </p>
              </div>
              {qr && <div className="brief-qr h-[72px] w-[72px] shrink-0 rounded-sm bg-white p-0.5" dangerouslySetInnerHTML={{ __html: qr }} />}
            </div>
            <p className="m-0 mt-1 t-caption text-text-3">매물 호가 아님 · 투자 권유 아님 · 현장 확인 후 판단</p>
          </section>
        </article>
      </div>
    </PageShell>
  );
}
