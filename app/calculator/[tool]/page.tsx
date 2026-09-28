import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { Explain } from "@/app/components/explain/Explain";
import { BROKERAGE_BASIS } from "@/lib/finance/brokerage";
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
        {/* [1015 · 규칙 B] 소개 한 줄 + "이용 방법" 3단계는 ⓘ 하나로 접는다(데스크톱 hover 미리보기 · 폰 탭 시트).
            HowTo JSON-LD 는 같은 배열(t.howTo.steps)에서 만든다 — 화면(시트)과 스키마가 같은 글이다. */}
        <p className="rise-in mb-4 flex flex-wrap items-center gap-x-1 t-body leading-[1.75] text-text-2 max-md:mb-3">
          <span>{t.intro}</span>
          {t.howTo && (
            <Explain
              title="이용 방법"
              body={t.howTo.steps.map((s, i) => `${i + 1}. ${s.name}: ${s.text}`)}
              source={BROKERAGE_BASIS}
            />
          )}
        </p>
        <div className="rise-in-1">{t.render()}</div>

        {t.howTo && (
          <>
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
