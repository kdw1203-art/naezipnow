import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 가이드 허브 — 카탈로그 10편 + 기존 2편(계약·규제).
   [1015] 카드 타일 묶음 → 리퀴드 행 목록(lq-panel · 가이드 = hanji). 소개 문단은 편수 한 줄로. 폰 여백 압축. */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "부동산 실전 가이드 — 임장·실거래·전세·청약 | 내집나우",
  description:
    "임장 체크리스트, 전세가율 보는 법, 실거래가 해석, 전세 안전 점검, 청약 일정까지 순서대로 따라 하는 실전 가이드 모음.",
  alternates: seoAlternates("/guides"),
};

const CATEGORY_ORDER = ["임장", "실거래 읽기", "전세", "청약·분양", "경매·공매"] as const;

function GuideRows({ items }: { items: { slug: string; title: string; description: string }[] }) {
  return (
    <div data-tone="hanji" className="lq-panel flex flex-col divide-y">
      {items.map((g) => (
        <Link
          key={g.slug}
          href={`/guides/${g.slug}`}
          className="flex min-h-[48px] items-center justify-between gap-3 py-2.5 no-underline"
        >
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">{g.title}</span>
            <span className="mt-0.5 block t-sub leading-[1.5] text-text-2">{g.description}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 t-body font-bold text-text-3">
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function GuidesIndexPage() {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: GUIDES.filter((g) => g.category === cat),
  })).filter((x) => x.items.length > 0);
  const total = GUIDES.length + LEGACY_GUIDES.length;

  return (
    <PageShell breadcrumb="가이드">
      <div className="mx-auto w-full max-w-[720px]">
        <h1 className="rise-in t-title text-ink">부동산 실전 가이드</h1>
        {/* [1015 · 규칙 B] 소개 문단("개념은 짧게, 순서는 구체적으로…") → 사실 한 줄(편 수는 카탈로그 길이) */}
        <p className="rise-in-1 mt-1 t-sub text-text-2">
          {total}편 · {byCategory.length + 1}개 분야
        </p>

        {byCategory.map(({ cat, items }) => (
          <section key={cat} className="mt-6 max-md:mt-4">
            <h2 className="mb-2 t-section text-ink">{cat}</h2>
            <GuideRows items={items} />
          </section>
        ))}

        <section className="mt-6 max-md:mt-4">
          <h2 className="mb-2 t-section text-ink">계약·규제</h2>
          <GuideRows items={LEGACY_GUIDES} />
        </section>
      </div>
    </PageShell>
  );
}
