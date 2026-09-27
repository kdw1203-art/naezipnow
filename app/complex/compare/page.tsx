import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import {
  complexPairPath,
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
import { cache } from "react";

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

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 지역·동·조합 수 · 반영 시점(숫자·장소만) */
  const headFact = [
    ...(pairs.length > 0
      ? [
          `${groups.length}개 지역`,
          `${dongCount.toLocaleString("ko-KR")}개 동`,
          `단지 ${complexCount.toLocaleString("ko-KR")}개`,
          `${pairs.length.toLocaleString("ko-KR")}개 조합`,
        ]
      : []),
    ...(lastYm ? [`${lastYm} 신고분까지`] : []),
  ].join(" · ");
  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb="홈 › 단지 비교">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 지역별 접힘 목록(조합 = 구분선 행) → 링크 한 줄 → 맨 끝 접힘 "비교 기준·Q&A".
          지운 것: 소개 문단(→ 사실 줄), 지역 카드 + 조합 타일 격자(→ 접힘 + 행), "조합을 고른 기준" 카드(네 문단 → 접힘 안 한 줄씩). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">단지 vs 단지 실거래 비교</h1>
          <p className="t-sub text-text-3">{headFact}</p>
        </header>

        {loadFailed ? (
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong> · 조합 없음이 아니라 조회 실패
          </p>
        ) : pairs.length === 0 ? (
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            기준을 넘은 조합 없음 · 같은 동 12개월 매매 {MIN_SIDE_TX}건 이상 단지가 둘 이상이면 생김
          </p>
        ) : (
          <section aria-labelledby="pairs-h" className="flex flex-col gap-2">
            <h2 id="pairs-h" className="flex items-baseline gap-1.5 t-section text-ink">
              지역별 조합 <span className="t-sub font-medium text-text-3">조합 많은 순</span>
            </h2>
            {/* [v4 · 규칙 5·10] 지역 = 접힘 행(첫 지역만 펼침) · 조합 = 구분선 행. 링크는 접혀 있어도 HTML 에 있다 */}
            <div data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {groups.map((group, gi) => (
                <details key={group.regionId} open={gi === 0} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="t-body font-bold text-ink">{group.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="t-body t-num text-ink">{group.pairs.length}개</span>
                      <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </span>
                  </summary>
                  {/* [v4.1 · 리퀴드 목록] 펼친 안쪽 목록은 hanji — 바깥 blue 판 안에서 구분된다 */}
                  <ul data-tone="hanji" className="flex flex-col divide-y divide-line border-t border-line pl-3">
                    {group.pairs.map((pair) => (
                      <li key={complexPairPath(pair)}>
                        <Link
                          href={complexPairPath(pair)}
                          className="press flex min-h-12 items-center justify-between gap-x-3 py-2.5 no-underline"
                        >
                          <span className="min-w-0 flex-1">
                            {/* [1005] body 는 keep-all — 띄어쓰기 없는 긴 단지명은 넘칠 때만 꺾는다(overflow-wrap) */}
                            <span className="block break-words t-body font-bold text-ink">
                              {pair.complexA}
                              <span className="mx-1 t-sub font-medium text-text-3">vs</span>
                              {pair.complexB}
                            </span>
                            <span className="block truncate t-sub tabular-nums text-text-3">
                              {pair.dong} · 12개월 {pair.tradeCountA.toLocaleString("ko-KR")}건 vs{" "}
                              {pair.tradeCountB.toLocaleString("ko-KR")}건
                            </span>
                          </span>
                          <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                    <li className="py-2">
                      <Link href={`/region/${group.regionId}`} className={`${LINK} t-sub`}>
                        {group.label} 지역 허브 보기 ›
                      </Link>
                    </li>
                  </ul>
                </details>
              ))}
            </div>
          </section>
        )}

        <p className="t-sub text-text-3">
          <Link href="/complex/browse" className={LINK}>
            단지 실거래 브라우즈
          </Link>
          {" · "}
          <Link href="/tx" className={LINK}>
            실거래 구간
          </Link>
          {" · "}
          <Link href="/notes/new" className={LINK}>
            임장노트 쓰기
          </Link>
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — 조합 기준(네 문단 → 한 줄씩) + Q&A(FAQPage 스키마) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            비교 기준·Q&amp;A
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col pb-3 pt-1">
            <ul className="mb-4 flex list-none flex-col gap-0.5 p-0">
              <li className="t-caption text-text-3">같은 법정동 단지끼리만 — 동네 차이와 단지 차이를 섞지 않게</li>
              <li className="t-caption text-text-3">최근 12개월 매매 양쪽 모두 {MIN_SIDE_TX}건 이상일 때만</li>
              <li className="t-caption text-text-3">동마다 거래 많은 상위 {TOP_PER_DONG}개 단지 안에서만</li>
              <li className="t-caption text-text-3">집계 하루 1회 · 비교 페이지 숫자는 그 페이지가 읽은 거래 원본에서 다시 계산</li>
            </ul>
            <QaBlock items={qa} />
          </div>
        </details>
      </div>
    </PageShell>
  );
}
