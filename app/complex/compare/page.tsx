import type { Metadata } from "next";
import Link from "@/app/components/IntentLink";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
/* [1015 · 규칙 B] "조합을 고른 기준" 문단은 제목 옆 ⓘ 하나로(단지 상세와 같은 지연 청크) */
import { ExplainLazy as Explain } from "../[id]/ExplainLazy";
import { ComparePairTiles, type ComparePairWire } from "./ComparePairTiles";
import { OpenDetailsOnHash } from "@/app/components/OpenDetailsOnHash";
import {
  listComplexPairs,
  type ComplexPair,
} from "@/lib/market/complex-pairs";
import { regionDisplayName } from "@/lib/market/complex-transactions";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";
import { cache, Fragment } from "react";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";
import { SectionTabs } from "@/app/components/nav/SectionTabs";
import { COMPARE_TABS } from "@/lib/nav/section-tabs";

/* ============================================================
   N10 — 단지 vs 단지 비교 허브 (/complex/compare)

   개별 비교 페이지(/complex/compare/[slug])로 가는 유일한 목록이자,
   크롤러가 그 페이지들을 발견하는 경로다.

   ── 여기서만 예외를 삼키는 이유 ────────────────────────────────
   같은 데이터를 읽는 [slug] 페이지는 조회가 실패하면 **던진다**. 동적
   라우트라 실패가 5xx 로 나가고, 크롤러에게 "지금 못 준다(나중에 다시
   와라)"는 정확한 신호가 된다.

   이 허브는 사정이 다르다. revalidate 가 있고 동적 파라미터가 없으니
   `next build` 가 빌드 타임에 프리렌더한다. 그런데 CI 빌드 환경에는
   SUPABASE_SERVICE_ROLE_KEY 가 없다(.github/workflows/deploy.yml 의
   링크 점검용 빌드). 여기서 던지면 빌드가 깨지고, 링크 게이트
   (scripts/check-links.mjs)도 이 페이지에 200 을 요구한다.

   그래서 세 상태를 나눠 렌더한다 — /tx 와 같은 규칙이다:
     1) 정상 — 지역별 조합 목록
     2) 조회 실패·시간 초과 — 그렇게 말하고 noindex (깨진 껍데기를 색인시키지 않는다)
     3) 정말로 0건 — "아직 기준을 넘은 조합이 없다"는 별개의 문장

   ── 예외를 삼키는 것만으로는 빌드를 못 지킨다 (배포 #263) ──────
   던지지 않아도 **느리면** 빌드가 죽는다. Next 는 프리렌더 한 페이지에 60초
   상한을 두고 넘기면 빌드를 실패시키는데, 배포 #263 이 정확히 그렇게 죽었다 —
   이 페이지를 포함한 다섯 페이지가 각자 60초를 다 태워 릴리스가 통째로 막혔다.
   느린 DB 는 페이지 내용을 떨어뜨릴 수는 있어도 배포를 막아서는 안 된다.
   그래서 조회에 20초 상한을 씌우고, 넘기면 위 2)번 화면으로 접는다.

   조회를 react cache() 로 감싸는 이유도 같은 사건에서 나왔다. 예전엔
   generateMetadata 와 본문이 같은 목록을 **각각** 읽어서 프리렌더 한 장에
   조회가 두 번 들어갔다 — 60초 예산을 두 배로 태우던 자리다.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 목록의 내용(조합 화이트리스트)은 실거래 적재·집계에서만 바뀌고,
   그 크론이 끝나면 `revalidatePath("/complex/compare")` 로 즉시 비운다
   (app/api/cron/molit-transactions-ingest). 시간은 안전망으로만 남긴다. */
export const revalidate = 604_800;

const PATH = "/complex/compare";

/** 화이트리스트 기준 — supabase/migrations/20260726120000_complex_pair_source.sql 와 같은 값.
    문장에 숫자를 적어야 하는데, 그 숫자가 실제 기준과 어긋나면 그것이 곧 거짓말이다. */
const MIN_SIDE_TX = 20;
const TOP_PER_DONG = 3;

type PairIndexData = {
  pairs: ComplexPair[];
  /** 조회가 실패했거나 상한 안에 끝나지 않았다. false 라야 "읽었고 결과가 이만큼"이다. */
  loadFailed: boolean;
};

const loadPairIndex = cache(async (): Promise<PairIndexData> => {
  const run = await loadWithinPrerenderBudget("[/complex/compare] 비교 조합 목록", () =>
    listComplexPairs(),
  );
  /* 실패를 빈 목록으로 흘려보내면 "아직 기준을 넘은 조합이 없습니다" 가 뜬다 —
     조합이 수천 개 쌓여 있어도 없다고 단정하는 셈이라 반드시 갈라 놓는다. */
  return run.ok ? { pairs: run.data, loadFailed: false } : { pairs: [], loadFailed: true };
});

type RegionGroup = {
  regionId: string;
  label: string;
  pairs: ComplexPair[];
  totalTx: number;
};

function groupByRegion(pairs: ComplexPair[]): RegionGroup[] {
  const byRegion = new Map<string, RegionGroup>();
  for (const pair of pairs) {
    const key = pair.region.id;
    let group = byRegion.get(key);
    if (!group) {
      group = {
        regionId: key,
        label: regionDisplayName(pair.region),
        pairs: [],
        totalTx: 0,
      };
      byRegion.set(key, group);
    }
    group.pairs.push(pair);
    group.totalTx += pair.pairTradeCount;
  }
  // 조합이 많은 지역 → 거래가 많은 지역 → 이름 순. 셋 다 걸어 두면 데이터가
  // 같은 한 정렬이 흔들리지 않는다(배포마다 순서가 바뀌면 diff 가 소음이 된다).
  return [...byRegion.values()].sort(
    (a, b) =>
      b.pairs.length - a.pairs.length ||
      b.totalTx - a.totalTx ||
      a.label.localeCompare(b.label, "ko"),
  );
}

function latestYm(pairs: ComplexPair[]): string | null {
  return pairs.reduce<string | null>(
    (acc, p) => (p.lastContractYm && (!acc || p.lastContractYm > acc) ? p.lastContractYm : acc),
    null,
  );
}

function formatYm(ym: string | null): string | null {
  if (!ym || ym.length !== 6) return null;
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { pairs, loadFailed } = await loadPairIndex();
  const regionCount = new Set(pairs.map((p) => p.region.id)).size;
  const description =
    pairs.length > 0
      ? `같은 동에서 최근 12개월 매매 ${MIN_SIDE_TX}건 이상 신고된 단지끼리만 짝지어, ${regionCount}개 지역 ${pairs.length.toLocaleString("ko-KR")}개 조합의 실거래를 나란히 비교합니다. 국토교통부 신고 자료 기준이며 매물 호가가 아닙니다.`
      : "같은 동의 거래 많은 단지끼리 실거래를 나란히 비교합니다. 국토교통부 신고 자료 기준이며 매물 호가가 아닙니다.";
  return {
    title: "단지 vs 단지 실거래 비교 | 내집나우",
    description,
    alternates: seoAlternates(PATH),
    // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면 사라진다.
    ...(loadFailed ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "단지 vs 단지 실거래 비교 | 내집나우",
      description,
      url: `https://naezipnow.com${PATH}`,
      type: "website",
      images: DEFAULT_OG_IMAGES,
    },
  };
}

export default async function ComplexComparePage() {
  const { pairs, loadFailed } = await loadPairIndex();
  const groups = groupByRegion(pairs);
  const dongCount = new Set(pairs.map((p) => `${p.region.id}|${p.dong}`)).size;
  const complexCount = new Set(
    pairs.flatMap((p) => [`${p.region.id}|${p.complexA}`, `${p.region.id}|${p.complexB}`]),
  ).size;
  const lastYm = formatYm(latestYm(pairs));

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "단지 비교", url: PATH },
  ]);

  const qa: FaqItem[] = [
    {
      q: "어떤 단지끼리 비교할 수 있나요?",
      a: `같은 법정동에 있고, 최근 12개월 아파트 매매 신고가 양쪽 모두 ${MIN_SIDE_TX}건 이상인 단지끼리만 비교 페이지를 만듭니다. 동마다 거래가 많은 상위 ${TOP_PER_DONG}개 단지가 대상입니다. 거래가 한두 건뿐인 단지는 평균이 표본에 흔들려 비교가 오히려 오해를 만들기 때문에 넣지 않았습니다.`,
    },
    {
      q: "왜 원하는 단지 조합이 목록에 없나요?",
      a: "다른 동에 있거나, 최근 12개월 거래가 기준보다 적거나, 그 동에서 거래가 많은 순으로 상위에 들지 못한 경우입니다. 조합을 임의로 늘리는 대신 근거가 되는 거래가 충분한 조합만 공개합니다. 개별 단지의 전체 실거래는 단지 페이지에서 조건 없이 볼 수 있습니다.",
    },
    {
      q: "여기 숫자는 호가인가요, 실거래인가요?",
      a: "국토교통부 아파트 매매 실거래 신고 자료입니다. 매물 호가나 중개사 제시가가 아니라 실제 체결·신고된 금액이며, 계약 후 신고까지 시차가 있어 최근 달은 건수가 더 늘어날 수 있습니다. 해제(취소) 신고된 거래는 제외했습니다.",
    },
  ];

  return (
    <PageShell breadcrumb="홈 › 단지 비교" title="단지 vs 단지 실거래 비교">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [1015 · 규칙 B·D] 기능 설명 문장은 걷고 사실 한 줄(숫자·출처·시점) + 기준은 ⓘ 하나 */}
      {/* [1096 · 디자인] 폰에서 두 절 사이 가운뎃점이 줄 끝(또는 줄 머리)에 홀로 남았다(로컬 실측 390px) — 두 절은 flex 항목이라 낱말처럼 꺾이지
          않는다. 사이 가운뎃점을 빼고 간격(gap-x-3)으로 가른다: 한 줄이면 띄어서, 두 줄이면 줄마다 한 절. */}
      <p className="rise-in mb-5 flex flex-wrap items-center gap-x-3 gap-y-0.5 t-sub text-text-2 max-md:mb-3">
        {pairs.length > 0 && (
          <span className="tabular-nums">
            {groups.length}개 지역 · {dongCount.toLocaleString("ko-KR")}개 동 · 단지{" "}
            {complexCount.toLocaleString("ko-KR")}개 · {pairs.length.toLocaleString("ko-KR")}개 조합
            {lastYm && ` · ${lastYm} 신고분까지`}
          </span>
        )}
        <span className="inline-flex items-center">
          국토교통부 실거래 · 매물 호가 아님
          <Explain
            title="조합을 고른 기준"
            body="같은 법정동에서 최근 12개월 매매 신고가 많은 단지끼리만 짝지어 실거래를 나란히 놓는다."
            how={[
              "같은 법정동에 있는 단지끼리만 짝지었다. 생활권이 다른 단지를 나란히 놓으면 가격 차이가 단지 차이인지 동네 차이인지 알 수 없다.",
              `최근 12개월 매매 신고가 양쪽 모두 ${MIN_SIDE_TX}건 이상일 때만 페이지를 만든다. 거래가 얇으면 평균이 한두 건에 끌려다닌다.`,
              `동마다 거래가 많은 상위 ${TOP_PER_DONG}개 단지 안에서만 조합을 만든다.`,
              "집계는 하루 한 번 갱신. 각 비교 페이지의 숫자는 그 페이지가 읽어 온 거래 원본에서 다시 계산한다.",
            ]}
            source="국토교통부 아파트 매매 실거래 신고(해제 신고 제외)"
          />
        </span>
      </p>

      {/* [1121 · 기능 통폐합] 비교 묶음 탭(단지 · 노트 · 매물) + 후보 단지 비교(내가 담은 단지)는 단지 탭 안 링크 */}
      <SectionTabs tabs={COMPARE_TABS} current="/complex/compare" label="비교" className="mb-3" />
      <p className="-mt-1 mb-4 t-sub max-md:mb-3">
        <Link href="/analysis/compare" className="tap-line font-bold text-primary no-underline hover:underline">
          내가 담은 후보 단지 비교 ›
        </Link>
      </p>

      {loadFailed ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-8 text-center t-body text-text-3">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong>
          </p>
        </section>
      ) : pairs.length === 0 ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-8 text-center t-body text-text-3">
            아직 기준을 넘은 조합이 없습니다.
            <br />
            같은 동에서 최근 12개월 매매 {MIN_SIDE_TX}건 이상인 단지가 둘 이상 모이면 이곳에
            나타납니다.
          </p>
        </section>
      ) : (
        <div className="rise-in-1 mb-6 space-y-4 max-md:mb-3 max-md:space-y-3">
          {/* [1030 · 2차] 63개 지역 1,148개 조합을 한 번에 펼쳐 데스크톱 42,782px(운영 실측) → 지역 칩(이동) + 첫 지역만 펼침,
              나머지는 접힌 <details>. 링크는 전부 HTML 에 그대로(검색 색인 동일). */}
          {/* [1074] 폰에서 63개 칩이 줄바꿈으로 쌓여 첫 화면(약 700px)을 다 덮었다 — 폰은 한 줄 가로 밀기(PC 는 그대로 줄바꿈).
              칩·순서·이동 대상은 그대로 */}
          {/* [1096 · 고도화] 칩이 가리키는 지역이 접혀 있으면 펼친다(주소 #region-… · 해시 변경마다) */}
          <OpenDetailsOnHash />
          {/* [1101 · 조작 다이어트] PC 도 한 줄 가로 밀기 — 63개 칩이 PC 에서 일곱 줄(약 280px)로 쌓여 첫 화면을 덮었다. 폰은 1074 부터 한 줄.
              PC 는 얇은 가로 막대를 보인다(마우스로 밀 수 있다는 표시 · 폰은 막대 없이 손가락으로) */}
          {/* [1105] data-hscroll — 칩 포커스 링을 안쪽으로(가로 밀기 틀이 바깥 링 위 · 아래를 잘랐다 · globals.css 끝) */}
          {/* [1119 · 5개 넘으면 필터] 63개 지역 칩 가로 밀기 → "지역 고르기" 접힘 하나(판 안 링크 63개 · 누르면 그 지역이 펼쳐진다 — OpenDetailsOnHash) */}
          <details className="group relative">
            <summary className="press flex min-h-10 w-fit cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-surface px-3 t-sub font-bold text-text-2">
              지역 고르기 · {groups.length}곳
              <span aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-180">
                {/* dead-control-ok: summary 가 눌리는 자리 — 꺾쇠는 열림 표시 */}⌄
              </span>
            </summary>
            <nav aria-label="지역 바로가기" className="card absolute left-0 z-20 mt-1 grid max-h-[60vh] w-[min(92vw,640px)] grid-cols-2 gap-1 overflow-y-auto rounded-xl p-2 sm:grid-cols-3">
              {groups.map((group) => (
                <a
                  key={`jump-${group.regionId}`}
                  href={`#region-${group.regionId}`}
                  className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2.5 t-sub font-bold text-text-2 no-underline hover:bg-bg"
                >
                  <span className="truncate">{group.label}</span>
                  <span className="shrink-0 font-medium text-text-3 tabular-nums">{group.pairs.length}</span>
                </a>
              ))}
            </nav>
          </details>
          {/* [1105 · 접근성] <summary> 안 <h2> 는 대화형 요소 안 제목이라(버튼 역할 · 자식 의미가 지워지는 보조기기가 있다) 걷는다 —
              summary 에는 글(span · 같은 모양), 제목은 summary 밖 낭독기 전용 h2(지역마다 제목 이동 그대로) · details 이름은 그 제목.
              span 의 [html[data-mscale]_&]:truncate 는 예전 h2 가 받던 폰 배율 한 줄 규칙(globals html[data-mscale] :is(h2,h3,h4))과 같다 */}
          {groups.map((group, gi) => (
            <Fragment key={group.regionId}>
            <h2 id={`region-h-${group.regionId}`} className="sr-only">{group.label}</h2>
            <details
              id={`region-${group.regionId}`}
              open={gi === 0}
              aria-labelledby={`region-h-${group.regionId}`}
              className="group card p-[var(--pad-card)] max-md:p-3.5"
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-baseline justify-between gap-3 t-section text-ink [&::-webkit-details-marker]:hidden">
                <span className="t-section text-ink [html[data-mscale]_&]:truncate">{group.label}</span>
                <span className="shrink-0 t-sub font-medium text-text-3">
                  조합 {group.pairs.length}개 · <span className="group-open:hidden">열기</span>
                  <span className="hidden group-open:inline">닫기</span>
                </span>
              </summary>
              <Link href={`/region/${group.regionId}`} className="mt-1 inline-flex min-h-[40px] items-center t-sub font-bold text-primary md:min-h-6">
                {group.label} 지역 화면 ›
              </Link>
              {/* [1096 · 비용] 타일은 클라이언트 조각이 압축 행으로 그린다(ComparePairTiles 머리 주석) — 허브 한 장 1,842KB 의 대부분이 이 타일이었다 */}
              <ComparePairTiles
                regionId={group.regionId}
                pairs={group.pairs.map((pair): ComparePairWire => [pair.complexA, pair.complexB, pair.dong, pair.tradeCountA, pair.tradeCountB])}
              />
            </details>
            </Fragment>
          ))}
        </div>
      )}

      <QaBlock items={qa} />

      {/* [1015 · 규칙 B] "조합을 고른 기준" 문단 → 위 ⓘ 로 접었다. 안내문("~을 이용하세요")은 링크 칩 세 개로 */}
      <nav aria-label="관련 화면" className="mb-8 flex flex-wrap gap-1.5 max-md:mb-4">
        <Link href="/complex/browse" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
          단지 실거래 보기 ›
        </Link>
        <Link href="/tx" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
          면적대·가격대 실거래 ›
        </Link>
        <Link href="/notes/new" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
          임장노트 쓰기 ›
        </Link>
      </nav>
    </PageShell>
  );
}
