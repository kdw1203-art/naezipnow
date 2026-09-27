import type { Metadata } from "next";
import Link from "next/link";
import { newsHref, storyHref } from "@/lib/town/post-href";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { Explain } from "@/app/components/explain/Explain";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import {
  getDigestWeek,
  weekSlugToMs,
  weekOrdinalLabel,
  ARCHIVE_WEEKS,
  MIN_ITEMS,
} from "@/lib/digest/archive";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N23 — 주간 다이제스트 웹 아카이브(한 주).

   주소의 날짜는 한국시간 기준 그 주 월요일이다. 월요일이 아닌 날짜는
   주소로 인정하지 않는다(같은 주에 URL 이 7개 생기는 것을 막는다).

   그 주에 실제로 수집된 것만 싣는다. 시장 온도 스냅샷이 그 주에 없으면
   최근 주 값으로 채우지 않고 없다고 적는다 — 다른 주 숫자를 그 주 것처럼
   싣는 순간 아카이브 전체를 믿을 수 없게 된다.

   기준 미달·범위 밖은 404. 조회 실패는 잡지 않고 던진다(→ 5xx).
   generateStaticParams 가 빈 배열이라 빌드 프리렌더 대상이 아니므로 던져도 빌드가
   깨지지 않는다. DB 장애를 404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다" 고
   확정 신고하는 꼴이다.
   ============================================================ */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 86_400;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { week: string }[] {
  return [];
}

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(kst.getUTCMonth() + 1)}.${p(kst.getUTCDate())}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  const startMs = weekSlugToMs(week);
  if (startMs === null) {
    return { title: "주간 다이제스트 | 내집나우", robots: { index: false, follow: false } };
  }
  const data = await getDigestWeek(week);
  if (!data) {
    return {
      title: `${weekOrdinalLabel(startMs)} 주간 다이제스트 | 내집나우`,
      robots: { index: false, follow: true },
    };
  }
  const title = `${data.ordinalLabel}(${data.rangeLabel}) 부동산 주간 다이제스트 | 내집나우`;
  const description = `${data.rangeLabel} 한 주 동안 수집된 부동산 뉴스 ${data.newsCount}건과 이웃 글 ${data.communityCount}건을 한 장으로 정리했습니다.`;
  const path = `/digest/${data.slug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "article" },
  };
}

export default async function DigestWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const startMs = weekSlugToMs(week);
  if (startMs === null) notFound();
  const data = await getDigestWeek(week);
  if (!data) notFound();

  /* G12 — 발췌해도 완결되는 첫 문단. 실측 개수만 쓴다. */
  const leadSentence = `${data.rangeLabel}(한국시간 월~일) 한 주 동안 내집나우에 수집된 부동산 뉴스는 ${data.newsCount}건, 이웃이 올린 글은 ${data.communityCount}건입니다.${
    data.temperature.length > 0
      ? ` 같은 주 시장 온도 기록은 ${data.temperature.length}개 지역에 남아 있습니다.`
      : " 같은 주 시장 온도 스냅샷은 남아 있지 않습니다."
  }`;

  const faq: FaqItem[] = [
    {
      q: "이 페이지의 '한 주'는 언제부터 언제까지인가요?",
      a: `한국시간 기준 월요일 00:00부터 일요일 24:00까지입니다. 주소에 적힌 날짜(${data.slug})가 그 주 월요일입니다. 진행 중인 주는 아직 끝나지 않았으므로 아카이브에 넣지 않습니다.`,
    },
    {
      q: "숫자는 어디서 온 건가요?",
      a: "그 주에 실제로 수집·게시된 글을 매번 원본에서 다시 세어 보여 줍니다. 별도의 요약본을 저장해 두지 않기 때문에, 어떤 글이 나중에 내려가면 이 페이지의 숫자도 그만큼 줄어듭니다. 저장해 둔 숫자와 원본이 어긋나는 것보다 이쪽이 낫다고 봤습니다.",
    },
    {
      q: "왜 없는 주가 있나요?",
      a: `수집 항목이 ${MIN_ITEMS}건 미만인 주는 페이지를 만들지 않습니다. 두어 줄짜리 요약을 주간 다이제스트라고 부르지 않기 위해서입니다. 보관 범위는 최근 ${ARCHIVE_WEEKS}주입니다.`,
    },
  ];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${data.ordinalLabel} 부동산 주간 다이제스트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "내집나우", url: "https://naezipnow.com" },
    publisher: { "@id": "https://naezipnow.com/#organization" },
    datePublished: new Date(data.startMs).toISOString(),
    mainEntityOfPage: `https://naezipnow.com/digest/${data.slug}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "주간 다이제스트", url: "/digest" },
    { name: "아카이브", url: "/digest/archive" },
    { name: data.ordinalLabel, url: `/digest/${data.slug}` },
  ]);

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 제목 한 줄 + 사실 한 줄(기간 · 뉴스 · 이웃 글 건수) → 그 주 뉴스(행) →
       그 주 이웃 글(행) → 시장 온도(행) → 다른 주 링크 한 줄 → 맨 끝 "이 페이지에 대해" 접힘(첫 문단 · FAQ).
       지운 것: 브레드크럼 문자열 · 항목마다의 카드 · 온도 표(→ 행) · 긴 빈 상태 문장(→ 한 줄).
       G12 첫 문단(leadSentence — 발췌해도 완결되는 요약)과 G5·G13 FAQ(FAQPage JSON-LD 와 같은 배열)는 지우지 않고
       접힘 안으로 옮겼다(승인 시안 ComplexDataSources 의 인용 요약·FAQ 와 같은 처리 — 접혀도 HTML 에 있다). */
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header>
          <h1 className="t-title text-ink">{data.ordinalLabel} 부동산 주간 다이제스트</h1>
          <p className="mt-0.5 t-sub text-text-3">
            {data.rangeLabel} · 뉴스 {data.newsCount}건 · 이웃 글 {data.communityCount}건
          </p>
        </header>

        {/* 뉴스 — [v4] 항목 카드 → 1px 선 행(제목 한 줄 + 날짜 · 매체 · 지역 한 줄) */}
        <section aria-labelledby="week-news-title" className="flex flex-col gap-1">
          <h2 id="week-news-title" className="t-section text-ink">
            그 주 뉴스 <span className="t-sub font-medium text-text-3">{data.newsCount}건</span>
          </h2>
          {data.news.length > 0 ? (
            <ul className="divide-y divide-line">
              {data.news.map((item) => (
                <li key={item.id}>
                  <Link href={newsHref(item.id)} className="flex min-w-0 flex-col gap-0.5 py-3 no-underline">
                    <span className="truncate t-body font-bold text-ink">{item.title}</span>
                    <span className="truncate t-sub text-text-3">
                      {[shortDate(item.at), item.sourceName, item.region].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 t-sub text-text-3">그 주 수집 뉴스 없음</p>
          )}
          {data.newsCount > data.news.length && (
            <p className="t-caption text-text-3">
              {data.newsCount}건 중 {data.news.length}건 표시
            </p>
          )}
        </section>

        {/* 이웃 글 — [v4] 항목 카드 → 1px 선 행 */}
        <section aria-labelledby="week-community-title" className="flex flex-col gap-1">
          <h2 id="week-community-title" className="t-section text-ink">
            그 주 이웃 글 <span className="t-sub font-medium text-text-3">{data.communityCount}건</span>
          </h2>
          {data.community.length > 0 ? (
            <ul className="divide-y divide-line">
              {data.community.map((item) => (
                <li key={item.id}>
                  {/* [1007 · P2] 이웃 글(is_automated ≠ true)은 이야기 상세로 */}
                  <Link href={storyHref(item.id)} className="flex min-w-0 flex-col gap-0.5 py-3 no-underline">
                    <span className="truncate t-body font-bold text-ink">{item.title}</span>
                    <span className="truncate t-sub text-text-3">
                      {[shortDate(item.at), item.region].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 t-sub text-text-3">그 주 이웃 글 없음</p>
          )}
          {data.communityCount > data.community.length && (
            <p className="t-caption text-text-3">
              {data.communityCount}건 중 {data.community.length}건 표시
            </p>
          )}
        </section>

        {/* 시장 온도 — 그 주 스냅샷이 있을 때만. [v4] 3열 표 → 1px 선 행: 지역(굵게) + 한 줄 요약 / 온도 */}
        <section aria-labelledby="week-temp-title" className="flex flex-col gap-1">
          <div className="flex items-center gap-0.5">
            <h2 id="week-temp-title" className="t-section text-ink">
              그 주 시장 온도
            </h2>
            {/* [1009 · H] 온도 숫자의 뜻 — /methodology "시장 온도" 와 같은 말로 */}
            <Explain
              term="sijang-ondo"
              how={[
                "50점을 중립으로 ① 매매가격지수 모멘텀(최근 3구간 평균 변동률 — 월간 지수면 월 ±1%, 주간 지수면 주 ±0.3% 를 ±25점)과 ② 거래량 추이(이번 달을 뺀 최근 최대 3개월 합을 그 직전 같은 개월 수의 합과 비교, ±50% 변화를 ±25점)를 더하고 5~95점 안으로 잘라요.",
                "이번 달을 뺀 거래량 월이 4개 미만이면 지수 모멘텀만 반영해요.",
                "매수·매도 추천이 아니라 시장 상태를 요약한 숫자예요.",
              ]}
              source="내집나우 주간 산출 · 한국부동산원 지수 · 국토교통부 실거래 신고"
            />
          </div>
          {data.temperature.length > 0 ? (
            <ul className="divide-y divide-line">
              {data.temperature.map((t) => (
                <SummaryRow
                  key={t.regionId}
                  label={t.regionLabel}
                  sub={t.headline}
                  value={
                    <>
                      {Math.round(t.score)}
                      <span className="ml-0.5 t-caption font-medium text-text-3">/100</span>
                    </>
                  }
                  href={`/analysis/temperature/${encodeURIComponent(t.regionId)}`}
                />
              ))}
            </ul>
          ) : (
            /* 다른 주 값으로 대신 채우지 않는다 — 그 주의 숫자가 아니기 때문이다. [v4] 한 줄 */
            <p className="py-3 t-sub text-text-3">그 주 시장 온도 기록 없음</p>
          )}
        </section>

        <div className="flex flex-col gap-3">
          <nav aria-label="다른 주" className="t-sub text-text-3">
            <Link href="/digest/archive" className="tap-line font-bold text-primary no-underline">
              다른 주 보기 ›
            </Link>
            {" · "}
            <Link href="/digest" className="tap-line font-bold text-primary no-underline">
              이번 주 다이제스트 ›
            </Link>
          </nav>

          {/* G12 첫 문단 + G5·G13 FAQ — 접혀도 HTML 에 있다(FAQPage JSON-LD 와 보이는 내용이 같은 배열) */}
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              이 페이지에 대해
              <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-4 pb-3 pt-1">
              <p className="t-sub text-text-2">{leadSentence}</p>
              <div>
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }} />
                <h3 className="t-sub font-bold text-text-2">자주 묻는 질문</h3>
                <dl className="mt-1 flex flex-col gap-2">
                  {faq.map((it) => (
                    <div key={it.q}>
                      <dt className="t-sub font-bold text-ink">{it.q}</dt>
                      <dd className="mt-0.5 t-sub text-text-2">{it.a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </details>
        </div>
      </div>
    </PageShell>
  );
}
