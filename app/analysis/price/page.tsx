/* [1026 · 지역 시세] 1025 표준 — 머리 아래 절차 한 줄(지역 → 면적대 → 실거래 범위 → 다음 행동) · 결론 한 줄(t-title
   "남양주시 60~85㎡ 거래 최다 3,852건 · 중앙 5.5억" + 판정 칩 · 선반이 고른 칸을 따라 바뀐다) · 대표 그림(면적 선반)을 결론 바로 아래 ·
   레일 340(실거래 범위 · 다음 행동 카드 · 이어서 분석) · 폰 하단 바(이 지역 알림 받기). 통계 타일 5칸은 결론 아래 숫자 줄로 —
   폰에서는 결론과 겹치지 않는 2칸(평단가 최고 · 면적 프리미엄)만. 채움 파랑은 다음 행동 하나(이어서 칩의 파란 "노트 쓰기"는 텍스트 링크로).
   빈 상태는 카드 하나 + 회색 선반 견본 + 한 문장. 데이터 로딩·revalidate·noIndex 는 그대로. 문장은 lib/market/region-conclusion.
   [1023 · AI 분석] 머리 통일 — h1 t-display 손 마크업(.pxs-head) → 공용 PageHead(아이콘 칩 40 · h1.t-title · 사실 한 줄 | 오른쪽 칩·지역 검색). 본문은 그대로. */
import Link from "next/link";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { PageHead } from "@/app/components/PageHead";
import type { HeroKpi } from "@/app/components/analysis/ToolHero";
import { findTemperatureRegionIdByName } from "@/lib/market/temperature";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  listTxRegions,
  listBandComplexes,
  type BandCell,
  type BandComplex,
} from "@/lib/market/tx-bands";
import { RegionSelect } from "./RegionSelect";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { pickRegionByAnyName } from "@/lib/regions/param";
import { findCatalogRegionById } from "@/lib/region/catalog";
import { formatKrwWon } from "@/lib/format/krw";
import { Explain } from "@/app/components/explain/Explain";
import { PYEONG_HOW, manPerPyeong } from "./BandTable";
import { BandShelf } from "./BandShelf";
import type { ShelfBand } from "./band-shelf-model";
import { CompareComplexes } from "./CompareComplexes";
import { AREA_BANDS } from "@/lib/market/bands";
import { regionActionLinks } from "@/lib/market/region-conclusion";
import { RegionActionCard, RegionPrimaryBar } from "../timing/region-verdict";

/** [1026] 통계 칸 — phone 이 false 면 폰에서 숨긴다(결론 한 줄·머리 사실 줄과 겹치는 칸) */
type PriceKpi = HeroKpi & { phone: boolean };

/* [1022 · 면적대별 검색·비교] 지시 2 — "검색기능이 추가되어 쉽게쉽게 검색하고, 타단지 비교까지".
   ① 머리의 지역 바꾸기(RegionSelect)가 셀렉트 → 검색형 입력(타이핑 → 시군구 자동완성, 같은 배열·같은 이동 규칙).
   ② 선반 아래 "타 단지 비교" 카드(CompareComplexes, 클라이언트): ComplexPicker 로 최대 4곳 → 면적대 5칸 × 최근 실거래가
      (기존 /api/complex/[id]/detail 의 areaBands) + 최근 거래월. 선택은 ?cmp=(replaceState)+localStorage.
      기준 행으로 이 지역 면적대별 중앙값(이미 있는 선반 값)을 같이 놓는다. 서버 데이터 로딩·revalidate·noIndex 는 그대로.

   [1021 · 지역 시세 price·timing] 시안(mock8/price)대로 — 머리(아이콘·제목·"국토교통부 신고 · 기간 · 지역 N건" + 지역 칩·
   지역 바꾸기(기존 RegionSelect)·연도) → 통계 타일 5칸(지금 값 + 최근 달) → 면적 선반 5칸(BandShelf: 누르면 상위 단지가
   그 면적대로) → 상위 단지 목록 / 레일(범위 카드 · 이어서 칩). 예전 ToolHero·BandTable·평단가 곡선 카드는 선반이 대신한다
   (표의 ⓘ 문구는 선반 머리로). 분포 히스토그램은 분포 데이터가 없어 생략. 데이터 로딩·revalidate·noIndex 는 그대로.

   면적대별 **실거래** 시세 분석 — 예전엔 이 경로가 손으로 적은 "적정가 산정 예시"
   (수치 전부 하드코딩)였다. 이제 tx_band_landing/complex 뷰(국토교통부 실거래)
   위에서 지역×면적대 평단가·중앙값·건수·단지수를 읽고, 같은 면적대의 지역 분위와
   면적 프리미엄(소형/대형 평단가 역전)을 계산한다. /tx 지역 랜딩과 색인 경쟁을
   피하려 noIndex 는 유지 — 여긴 SEO 페이지가 아니라 상호작용 분석 도구다. */
export const metadata = buildPageMetadata({
  title: "면적대별 실거래가 분석",
  description:
    "국토교통부 실거래가로 지역·면적대별 평단가와 지역 분위를 비교하고, 소형·대형 평단가 역전(면적 프리미엄)까지 봅니다.",
  path: "/analysis/price",
  noIndex: true,
});

/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

/** [970 · B-31] 원 → "8.5억"(0.1 단위) — 같은 화면의 지역 카드가 "short"(28.8억)인데 여기만
    "eok"(8.51억·3.58억)라 소수 자릿수가 섞였다. lib/format/krw.ts "short" 로 통일. */
function eok(won: number): string {
  return formatKrwWon(won, { style: "short" });
}

/** "202607" → "2026.07" */
function ymLabel(ym: string | null): string {
  if (!ym || ym.length < 6) return "";
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/* [1026] 빈 상태 — 카드 하나 + 회색 견본(면적 선반 5칸 윤곽) + 한 문장 */
function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="card mx-auto mt-8 max-w-[560px] rounded-2xl p-4 text-center max-md:p-3.5">
      <div className="mx-auto flex max-w-[320px] items-end justify-center gap-2" aria-hidden="true">
        {[40, 88, 28, 52, 20].map((h, i) => (
          <span key={i} className="block w-full rounded-sm border border-dashed border-line-strong" style={{ height: `${h}px` }} />
        ))}
      </div>
      <p className="mt-3 t-body font-bold text-ink">{msg}</p>
      <Link href="/tx" className="btn-soft btn-sm mt-3 inline-block no-underline">
        지역별 실거래 보기
      </Link>
    </div>
  );
}

export default async function PricePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const sp = await searchParams;
  let regions;
  try {
    regions = await listTxRegions();
  } catch {
    return (
      <PageShell breadcrumb="분석 · 면적대별 실거래가">
        <EmptyState msg="실거래 집계를 일시적으로 읽지 못했어요. 잠시 후 다시 시도해 주세요." />
      </PageShell>
    );
  }

  // 면적대 셀이 있는 지역만(가격대만 있는 지역 제외)
  const areaRegions = regions.filter((r) => r.areaCells.length > 0);
  if (areaRegions.length === 0) {
    return (
      <PageShell breadcrumb="분석 · 면적대별 실거래가" toolScope={personaVars(TOOL_PERSONAS["market:price"])}>
        <EmptyState msg="면적대별로 정리된 실거래 없음" />
      </PageShell>
    );
  }

  /* [D62] `?region=` 은 화면마다 다른 말로 온다 — 지도는 "서울 강남구",
     타이밍·시나리오는 "gangnam", 여기 목록은 "서울-강남구". 예전에는 정확히
     일치할 때만 찾고 **아니면 조용히 첫 지역으로** 갔다: 사용자는 자기가 고른
     줄 알았던 다른 동네의 숫자를 봤다. 이제 어느 말로 와도 찾고, 정말 없으면
     못 찾았다고 화면에 적는다. */
  const wanted = (sp.region ?? "").trim();
  /* 카탈로그 id("gangnam")로 오는 경우가 있다 — 타이밍·시나리오가 쓰는 말이다.
     이 목록에는 id 칸이 없으므로(실거래 집계는 슬러그·한글명뿐), 먼저 id 를
     한글 지역명으로 옮긴 뒤 같은 매칭을 한 번 더 돌린다. 서버 전용 import 라
     클라이언트 번들에는 영향이 없다. */
  const wantedAsName = wanted ? (findCatalogRegionById(wanted)?.name ?? null) : null;
  const matched =
    (wanted ? pickRegionByAnyName(wanted, areaRegions) : null) ??
    (wantedAsName ? pickRegionByAnyName(wantedAsName, areaRegions) : null);
  const target = matched ?? areaRegions[0];
  const regionMissed = Boolean(wanted) && !matched;

  // 지역 분위 — 같은 면적대의 평단가를 수록 지역끼리 줄 세운다
  const perByBand = new Map<string, number[]>();
  for (const r of areaRegions) {
    for (const c of r.areaCells) {
      if (c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0) {
        const arr = perByBand.get(c.bandSlug) ?? [];
        arr.push(c.avgPerPyeongKrw);
        perByBand.set(c.bandSlug, arr);
      }
    }
  }
  for (const arr of perByBand.values()) arr.sort((a, b) => a - b);

  /** 이 면적대·평단가가 수록 지역 중 상위 몇 %인가 (표본 8곳 미만이면 null). */
  function topPercentOf(bandSlug: string, v: number): number | null {
    const arr = perByBand.get(bandSlug);
    if (!arr || arr.length < 8) return null;
    const below = arr.filter((x) => x <= v).length;
    return Math.max(1, 100 - Math.round((below / arr.length) * 100));
  }

  const cells = target.areaCells; // 면적 순서(좁은 → 넓은)로 이미 정렬됨

  // 가장 거래 많은 면적대(선반의 처음 선택 칸)
  const busiest = [...cells].sort((a, b) => b.txCount - a.txCount)[0] ?? null;
  /* [1021] 선반 칸을 누르면 상위 단지가 바뀌므로 면적대마다 미리 읽는다(하루 1회 재생성 · 실패한 칸은 빈 목록) */
  const complexesByBand: BandComplex[][] = await Promise.all(
    cells.map((c) => listBandComplexes(target.name, "area", c.bandSlug, 8).catch(() => [])),
  );

  // 면적 프리미엄 — 평단가 최고/최저 면적대
  const withPer = cells.filter((c): c is BandCell & { avgPerPyeongKrw: number } =>
    Boolean(c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0),
  );
  const hiBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw > a.avgPerPyeongKrw ? b : a))
    : null;
  const loBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw < a.avgPerPyeongKrw ? b : a))
    : null;
  const premiumRatio =
    hiBand && loBand && loBand.avgPerPyeongKrw > 0
      ? hiBand.avgPerPyeongKrw / loBand.avgPerPyeongKrw
      : null;
  // 최고 평단가 면적대가 작은 평형이면 '소형 프리미엄', 큰 평형이면 '대형 프리미엄'
  const smallSlugs = new Set(["under-60", "60-85"]);
  const premiumKind = hiBand
    ? smallSlugs.has(hiBand.bandSlug)
      ? "소형"
      : "대형"
    : null;

  /* 통계 타일 5칸 — 값이 없으면 그 칸을 만들지 않는다. [1026] 결론 한 줄 아래 숫자 줄 — 폰은 phone 칸(2칸)만 */
  const heroKpis: PriceKpi[] = [
    {
      label: "수집 실거래",
      value: `${target.txCount.toLocaleString("ko-KR")}건`,
      note: `${target.complexCount.toLocaleString("ko-KR")}개 단지`,
      phone: false,
    },
  ];
  if (busiest) {
    heroKpis.push({
      label: "거래 최다 면적대",
      value: busiest.bandLabel,
      note: `${busiest.txCount.toLocaleString("ko-KR")}건 · 중앙값 ${eok(busiest.medianKrw)}`,
      phone: false,
    });
  }
  if (hiBand) {
    heroKpis.push({
      label: "평단가 최고",
      value: manPerPyeong(hiBand.avgPerPyeongKrw),
      note: `${hiBand.bandLabel}${premiumKind ? ` · ${premiumKind} 프리미엄` : ""}`,
      aside: <Explain term="pyeongdanga" how={PYEONG_HOW} size={12} />,
      phone: true,
    });
  }
  if (premiumRatio && loBand && hiBand && loBand.bandSlug !== hiBand.bandSlug) {
    heroKpis.push({
      label: "면적 프리미엄",
      value: `${premiumRatio.toFixed(2)}배`,
      note: `${hiBand.bandLabel} ÷ ${loBand.bandLabel} 평단가`,
      aside: (
        <Explain
          title="면적 프리미엄"
          how="면적대별 평단가(거래금액 ÷ 전용면적 × 3.3058)의 최고 ÷ 최저."
          source="국토교통부 실거래가"
          size={12}
        />
      ),
      phone: true,
    });
  }
  if (target.latestYm) {
    heroKpis.push({ label: "최근 달", value: ymLabel(target.latestYm), note: "신고 기준", phone: false });
  }
  /* 폰에 보일 칸이 둘 미만이면(평단가 칸이 없는 지역) 앞에서부터 채워 2칸은 남긴다 */
  for (const k of heroKpis) {
    if (heroKpis.filter((x) => x.phone).length >= 2) break;
    k.phone = true;
  }

  const selectRegions = areaRegions.map((r) => ({
    slug: r.slug,
    name: r.name,
    txCount: r.txCount,
  }));

  /* 선반 데이터 — 표시 문자열은 여기서 만든다(클라이언트에 포맷 라이브러리를 보내지 않는다) */
  const bands: ShelfBand[] = cells.map((c, i) => {
    const rows = complexesByBand[i] ?? [];
    return {
      slug: c.bandSlug,
      label: c.bandLabel,
      txCount: c.txCount,
      complexCount: c.complexCount,
      medianText: eok(c.medianKrw),
      avgText: eok(c.avgKrw),
      minText: eok(c.minKrw),
      maxText: eok(c.maxKrw),
      perText: c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0 ? manPerPyeong(c.avgPerPyeongKrw) : null,
      top: c.avgPerPyeongKrw ? topPercentOf(c.bandSlug, c.avgPerPyeongKrw) : null,
      rows: rows.map((x, k) => ({
        key: `${x.name}-${k}`,
        label: x.name,
        value: x.txCount,
        href: complexHrefFromNames(target.name, x.name),
      })),
      avgRows: rows.slice(0, 3).map((x) => ({ name: x.name, avgText: eok(x.avgKrw) })),
    };
  });

  /* 연도 칩 — 기간이 한 해 안일 때만(두 해에 걸치면 한 해로 적지 않는다) */
  const yearChip =
    target.firstYm && target.latestYm && target.firstYm.slice(0, 4) === target.latestYm.slice(0, 4)
      ? `${target.latestYm.slice(0, 4)}년`
      : null;
  const timingRegionId = findTemperatureRegionIdByName(target.name);
  /* [1022] 비교 표의 기준 행 — 면적대 5칸(AREA_BANDS 순서) 중앙값 문자열, 이 지역에 없는 칸은 null */
  const referenceMedians = AREA_BANDS.map((b) => bands.find((x) => x.slug === b.slug)?.medianText ?? null);

  /* [1026] 결론 아래 숫자 줄(서버 마크업 — 선반 본문이 결론 카드 바로 아래에 꽂는다) */
  const facts = (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
      {heroKpis.map((k) => (
        <div key={k.label} className={k.phone ? "min-w-0" : "min-w-0 max-md:hidden"}>
          <div className="kpi h-full">
            <span className="kpi-k inline-flex items-center gap-0.5">
              {k.label}
              {k.aside}
            </span>
            <span className="kpi-v">{k.value}</span>
            {k.note && <span className="kpi-d">{k.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <PageShell breadcrumb="분석 · 면적대별 실거래가">
      <div className="nz-dot-blue mx-auto w-full max-w-[1200px]">
        {/* [D62] 넘겨받은 지역을 못 찾았으면 **그 사실을 말한다.**
            예전에는 조용히 첫 지역으로 갈아탔다 — 화면에는 다른 동네의 숫자가
            아무 표시 없이 떠 있었고, 사용자는 그게 자기가 고른 지역인 줄 알았다. */}
        {regionMissed && (
          <div className="mb-3 rounded-lg border border-line bg-warning-soft px-3.5 py-2.5 t-sub text-ink">
            “{wanted}”는 실거래 집계에 아직 없는 지역. 대신 <b>{target.name}</b> 표시.
          </div>
        )}

        {/* 머리 — 아이콘 칩 · 제목 · 사실 한 줄 | 지역 칩 · 지역 바꾸기 · 연도. [1023] 공용 PageHead(허브·노트·동네와 같은 t-title) */}
        <PageHead
          icon="bar"
          title="면적대별 실거래가"
          sub={
            <>
              국토교통부 신고 · {ymLabel(target.firstYm)}~{ymLabel(target.latestYm)} · {target.name}{" "}
              {target.txCount.toLocaleString("ko-KR")}건
            </>
          }
          subOnPhone
          actions={
            <>
              <span className="chip chip-soft chip-pad t-sub">{target.name}</span>
              <RegionSelect regions={selectRegions} current={target.slug} />
              {yearChip && <span className="chip chip-pad t-sub border border-line text-text-2">{yearChip}</span>}
            </>
          }
        />

        {/* 절차 · 결론(+숫자 줄) · 면적 선반 · 상위 단지 · 비교 | 레일 — [1026] 선반이 고른 칸을 절차·결론이 따라가므로 BandShelf 안에서 그린다 */}
        <BandShelf
          bands={bands}
          busiestSlug={busiest?.bandSlug ?? null}
          hiSlug={premiumKind ? (hiBand?.bandSlug ?? null) : null}
          regionName={target.name}
          regionSlug={target.slug}
          facts={facts}
          below={<CompareComplexes regionName={target.name} reference={referenceMedians} />}
          rail={
            <>
              {/* [1026] 다음 행동 — 채움 파랑 "이 지역 알림 받기"(레일) + 지도 · 노트 쓰기 · 결정 카드 */}
              <RegionActionCard regionLabel={target.name} links={regionActionLinks(target.name, target.name)} />
              {/* #411 — 도구 간 이어가기: 보던 지역 그대로 타이밍·시나리오·지도로. [1026] 파란 "노트 쓰기" 칩은 다음 행동 카드의 텍스트 링크로 */}
              <AnalysisCrossLinks
                current="price"
                regionLabel={target.name}
                regionFor={{
                  map: target.name,
                  ...(timingRegionId ? { timing: timingRegionId, scenario: timingRegionId } : {}),
                }}
              />
            </>
          }
        />
        {/* [1026] 폰 하단 바 — 레일의 채움 파랑과 같은 요소(화면에 한 번) */}
        <RegionPrimaryBar regionLabel={target.name} />
      </div>
    </PageShell>
  );
}
