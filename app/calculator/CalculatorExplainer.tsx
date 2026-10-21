import Link from "next/link";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { calculatorExplainer } from "@/lib/calculator/explainers";

/* [1081 · #13·#21] 계산기 본문(서버 렌더) — 계산 방법 · 예시 · 확인 사항 · 관련 + 브레드크럼 JSON-LD.
   입력 칸만 있던 화면에 검색엔진이 읽을 글을 붙인다. 글은 lib/calculator/explainers 한 곳. */
export function CalculatorExplainer({ id }: { id: string }) {
  const ex = calculatorExplainer(id);
  if (!ex) return null;
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "https://naezipnow.com/" },
    { name: "계산기", url: "https://naezipnow.com/calculator" },
    { name: ex.label, url: `https://naezipnow.com${ex.path}` },
  ]);
  return (
    <section aria-labelledby={`calc-explainer-${id}`} className="rise-in-2 mt-6 flex flex-col gap-4 max-md:mt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />
      <h2 id={`calc-explainer-${id}`} className="t-section text-ink">
        계산 방법
      </h2>
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 t-body leading-[1.7] text-text-1">
        {ex.formula.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <h2 className="t-section text-ink">예시</h2>
      <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 t-body leading-[1.7] text-text-1">
        {ex.example.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ol>
      <h2 className="t-section text-ink">확인 사항</h2>
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 t-body leading-[1.7] text-text-2">
        {ex.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h2 className="t-section text-ink">관련</h2>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
        {ex.related.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="tap-line t-body font-bold text-primary no-underline">
              {r.label} ›
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
