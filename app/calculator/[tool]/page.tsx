import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { howToJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { CalculatorNav } from "../CalculatorNav";
import { CALCULATOR_TOOLS, findCalculatorTool } from "../tools";

/* [992] 계산기 4종 — 한 파일. 표(../tools.tsx)에 없는 id(구 Vite 앱의 /calculator/tax·investment
   등 색인된 옛 주소 포함)는 대출 계산기(/calculator)로 보낸다 — 예전엔 redirect-map 에 넷을
   따로 적었는데, 동적 라우트 아래 정적 규칙은 게이트가 막는다. URL 은 예전 그대로다. */

export const revalidate = 86400;

export function generateStaticParams() {
  return CALCULATOR_TOOLS.map((t) => ({ tool: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = findCalculatorTool(tool);
  if (!t) return {};
  return buildPageMetadata({
    title: t.title,
    description: t.description,
    path: `/calculator/${t.id}`,
    og: { badge: "계산기", sub: t.ogSub },
  });
}

export default async function CalculatorToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = findCalculatorTool(tool);
  if (!t) redirect("/calculator");
  return (
    <PageShell breadcrumb={`투자 도구 › ${t.label}`} title={t.label}>
      <div className="mx-auto w-full max-w-[640px]">
        <CalculatorNav current={`/calculator/${t.id}`} />
        <p className="rise-in mb-4 text-[13px] leading-[1.75] text-text-2">{t.intro}</p>
        <div className="rise-in-1">{t.render()}</div>

        {t.howTo && (
          <>
            {/* [#55] 이용 방법 — HowTo JSON-LD 와 같은 배열에서 렌더 */}
            <section className="rise-in-2 mt-6">
              <h2 className="mb-2 text-[13px] font-extrabold text-ink">이용 방법</h2>
              <ol className="flex list-none flex-col gap-2 p-0">
                {t.howTo.steps.map((s, i) => (
                  <li key={s.name} className="card flex gap-3 rounded-xl px-4 py-3">
                    <span className="text-[13px] font-extrabold tabular-nums text-primary">{i + 1}</span>
                    <div>
                      <div className="text-[13px] font-bold text-ink">{s.name}</div>
                      <p className="mt-0.5 text-[13px] leading-[1.7] text-text-2">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLdScript([
                  howToJsonLd({
                    name: t.howTo.name,
                    description: t.howTo.description,
                    path: `/calculator/${t.id}`,
                    steps: t.howTo.steps,
                  }),
                ]),
              }}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
