import type { Metadata } from "next";
import { AdZone } from "@/app/components/ads/AdZone";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, GUIDE_BY_SLUG } from "@/lib/guides/catalog";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 검색 유입용 가이드 — 카탈로그(lib/guides/catalog.ts) 렌더러.
   전 편이 정적(순수 상수)이라 dynamicParams=false 로 빌드에 굳힌다.
   각 편의 도구 링크가 이 글의 존재 이유다 — 글에서 끝나면 유입이 이탈이다.
   [1015] 데스크톱은 본문 + 340px 레일(목차 · 도구 · 관련 가이드 · 광고 1). 도구·관련 가이드는 리퀴드 행 목록
   (도구 = blue · 가이드 = hanji). 폰은 한 열(목차는 본문 위), 광고는 글 끝 1. */

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

const rowCls = "flex min-h-[44px] items-center justify-between gap-3 py-2 no-underline";

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

  const toc = guide.sections.length >= 3 && (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {guide.sections.map((s, i) => (
        <li key={s.heading} className="t-sub text-text-1">
          <a href={`#g-${i + 1}`} className="inline-flex min-h-[24px] items-center gap-1 text-text-1 no-underline">
            <span className="font-bold text-primary">{i + 1}.</span> {s.heading}
          </a>
        </li>
      ))}
    </ol>
  );

  const tools = (
    <nav aria-label="바로 쓰는 도구" data-tone="blue" className="lq-panel flex flex-col divide-y">
      {guide.tools.map((t) => (
        <Link key={t.href} href={t.href} className={rowCls}>
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">{t.label}</span>
            <span className="mt-0.5 block t-caption text-text-2">{t.why}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 t-body font-bold text-primary">
            ›
          </span>
        </Link>
      ))}
    </nav>
  );

  const relatedRows = related.length > 0 && (
    <nav aria-label="관련 가이드" data-tone="hanji" className="lq-panel flex flex-col divide-y">
      {related.map((r) => (
        <Link key={r.slug} href={`/guides/${r.slug}`} className={rowCls}>
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">{r.title}</span>
            <span className="mt-0.5 block t-caption text-text-3">{r.description}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 t-body font-bold text-text-3">
            ›
          </span>
        </Link>
      ))}
    </nav>
  );

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

      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <article className="min-w-0 lg:max-w-[720px]">
          <p className="rise-in t-caption font-bold text-primary">{guide.category} 가이드</p>
          <h1 className="rise-in mt-1 t-title leading-[1.3] text-ink">{guide.title}</h1>
          <p className="rise-in-1 mt-3 t-body leading-[1.75] text-text-2 max-md:mt-2">{guide.intro}</p>

          {/* 목차 — 섹션 3개 이상일 때만. 폰은 본문 위, 데스크톱은 레일 */}
          {toc && (
            <nav aria-label="목차" className="rise-in-2 mt-4 rounded-2xl border border-line bg-surface px-4 py-3 lg:hidden">
              <div className="t-caption font-bold text-text-3">목차</div>
              <div className="mt-1.5">{toc}</div>
            </nav>
          )}

          {guide.sections.map((section, i) => (
            <section key={section.heading} id={`g-${i + 1}`} className="mt-7 scroll-mt-24 max-md:mt-5">
              <h2 className="t-section text-ink md:text-[19px]">{section.heading}</h2>
              <div className="mt-2.5 flex flex-col gap-3 max-md:gap-2">
                {section.body.map((p) => (
                  <p key={p.slice(0, 24)} className="t-body leading-[1.8] text-text-1">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}

          {/* 도구 연결 — 이 가이드의 다음 행동. 폰은 본문 끝, 데스크톱은 레일 */}
          <section className="mt-8 max-md:mt-5 lg:hidden">
            {/* [1015 · 규칙 D] "읽었다면, 바로 해보기" → 명사 제목 */}
            <h2 className="mb-2 t-section text-ink">바로 쓰는 도구</h2>
            {tools}
          </section>

          {guide.faq.length > 0 && (
            <section className="mt-8 max-md:mt-5">
              <h2 className="t-section text-ink md:text-[19px]">자주 묻는 질문</h2>
              <div className="mt-2.5 flex flex-col gap-3 max-md:gap-2">
                {guide.faq.map((f) => (
                  <div key={f.q} className="rounded-2xl border border-line bg-surface px-4 py-3.5 max-md:px-3.5 max-md:py-3">
                    <div className="t-body font-bold text-ink">Q. {f.q}</div>
                    <p className="mt-1.5 t-body leading-[1.7] text-text-2">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {relatedRows && (
            <section className="mt-8 max-md:mt-5 lg:hidden">
              <h2 className="mb-2 t-section text-ink">관련 가이드</h2>
              {relatedRows}
            </section>
          )}

          {/* [961] 광고 공간 — 가이드 본문 끝 */}
          <AdZone placement="article_end" seed={1} plan={null} className="mt-8 max-md:mt-5" />
          <p className="mt-6 t-caption leading-[1.7] text-text-3 max-md:mt-4">
            일반적인 절차·개념 안내이며 특정 매물·투자 권유가 아닙니다. 계약·세무 등 개별 사안은 중개사무소·세무 전문가와
            관련 기관에서 확인.
          </p>
        </article>

        {/* [1015 · 규칙 F] 데스크톱 레일 — 목차 · 도구 · 관련 가이드 · 광고 1 */}
        <aside className="hidden flex-col gap-3 lg:sticky lg:top-[76px] lg:flex lg:self-start">
          {toc && (
            <nav aria-label="목차" className="card rounded-2xl px-4 py-3">
              <div className="t-caption font-bold text-text-3">목차</div>
              <div className="mt-1.5">{toc}</div>
            </nav>
          )}
          <section>
            <h2 className="mb-2 t-sub font-bold text-ink">바로 쓰는 도구</h2>
            {tools}
          </section>
          {relatedRows && (
            <section>
              <h2 className="mb-2 t-sub font-bold text-ink">관련 가이드</h2>
              {relatedRows}
            </section>
          )}
          <AdZone placement="sidebar" seed={2} plan={null} />
        </aside>
      </div>
    </PageShell>
  );
}
