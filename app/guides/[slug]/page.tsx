/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 9곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, GUIDE_BY_SLUG } from "@/lib/guides/catalog";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 검색 유입용 가이드 — 카탈로그(lib/guides/catalog.ts) 렌더러.
   전 편이 정적(순수 상수)이라 dynamicParams=false 로 빌드에 굳힌다.
   각 편의 도구 링크가 이 글의 존재 이유다 — 글에서 끝나면 유입이 이탈이다. */

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDE_BY_SLUG.get(slug);
  if (!guide) return { title: "가이드 | 내집나우" };
  return {
    title: `${guide.title} | 내집나우`,
    description: guide.metaDescription,
    alternates: seoAlternates(`/guides/${guide.slug}`),
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "article",
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = GUIDE_BY_SLUG.get(slug);
  if (!guide) notFound();

  const related = guide.related
    .map((s) => GUIDE_BY_SLUG.get(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "가이드", url: "/guides" },
    /* [952] 마지막 항목에도 URL 을 준다 — check-jsonld 가 모든 ListItem 의 item 을 요구하고,
       Google 도 마지막 항목의 item 을 권장한다(없으면 "선택 항목 누락" 경고). 945 에서
       비워 둔 이 한 줄이 CI 배포를 막고 있었다. */
    { name: guide.title, url: `/guides/${guide.slug}` },
  ]);

  return (
    <PageShell breadcrumb="가이드">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      {guide.faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(guide.faq)) }}
        />
      )}

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 본문(도입 · 목차 앵커 · 섹션) → 바로 해보기 구분선 행 → Q&A 행 →
          함께 볼 가이드 행 → 면책 캡션 한 줄. 지운 것: 주홍 눈썹 글자(→ 사실 줄), 목차 상자 테두리, 도구 연결 상자(연파랑 면 +
          그림자 카드 = 카드 안 카드 → 행), Q&A 카드 테두리, 하우스 광고(AdZone). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">{guide.title}</h1>
          <p className="t-sub text-text-3">
            {guide.category} 가이드 · {guide.sections.length}개 절{guide.faq.length > 0 ? ` · Q&A ${guide.faq.length}` : ""}
          </p>
        </header>

        <div className="flex flex-col gap-5">
          <p className="rise-in-1 t-body leading-[1.75] text-text-2">{guide.intro}</p>

          {/* 목차 — 섹션 3개 이상일 때만. [v4] 상자 → 1px 선 사이 앵커 목록 */}
          {guide.sections.length >= 3 && (
            <nav aria-label="목차" className="border-y border-line py-2">
              <ol className="flex flex-col">
                {guide.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#g-${i + 1}`} className="tap-line t-sub text-text-1 no-underline">
                      <span className="mr-1 t-num text-text-3">{i + 1}.</span> {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {guide.sections.map((section, i) => (
            <section key={section.heading} id={`g-${i + 1}`} className="scroll-mt-24">
              <h2 className="text-[19px] font-bold text-ink">{section.heading}</h2>
              <div className="mt-2.5 flex flex-col gap-3">
                {section.body.map((p) => (
                  <p key={p.slice(0, 24)} className="t-body leading-[1.8] text-text-1">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* 도구 연결 — 이 가이드의 다음 행동. [v4 · 규칙 5] 상자 안 카드 → 구분선 행 */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">바로 해보기</h2>
          <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {guide.tools.map((t) => (
              <SummaryRow key={t.href} label={<span className="text-primary">{t.label}</span>} sub={t.why} href={t.href} />
            ))}
          </ul>
        </section>

        {guide.faq.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">자주 묻는 질문</h2>
            <dl data-tone="hanji" className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
              {guide.faq.map((f) => (
                <div key={f.q} className="py-3">
                  <dt className="t-body font-bold text-ink">Q. {f.q}</dt>
                  <dd className="m-0 mt-1 t-body leading-[1.7] text-text-2">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {related.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">함께 보면 좋은 가이드</h2>
            <ul data-tone="mint" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {related.map((r) => (
                <SummaryRow key={r.slug} label={r.title} sub={r.description} href={`/guides/${r.slug}`} />
              ))}
            </ul>
          </section>
        )}

        <p className="t-caption leading-[1.7] text-text-3">
          일반적인 절차·개념 안내이며 특정 매물·투자에 대한 권유가 아닙니다 · 계약·세무 등 개별 사안은 공인중개사·법무사·세무사와 확인
        </p>
      </div>
    </PageShell>
  );
}
