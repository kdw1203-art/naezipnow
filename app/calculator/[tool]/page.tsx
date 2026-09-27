/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 2곳을 font-bold(700)로 바꿨다. */
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
    <PageShell breadcrumb={`투자 도구 › ${t.label}`}>
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄(식·근거) → 밑줄 탭 → 계산기 → 맨 끝 접힘 "이용 방법"(HowTo 와 같은 배열).
          지운 것: 소개 문단(두세 문장 → 사실 줄), 이용 방법 카드 3장(→ 접힘 안 구분선 행). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col">
        <header className="mb-3 flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">{t.label}</h1>
          <p className="t-sub text-text-3">{t.fact}</p>
        </header>
        <CalculatorNav current={`/calculator/${t.id}`} />
        <div className="rise-in-1">{t.render()}</div>

        {t.howTo && (
          <>
            {/* [#55] 이용 방법 — HowTo JSON-LD 와 같은 배열에서 렌더. [v4 · 규칙 3] 맨 끝 접힘(펼치면 보이는 본문) */}
            <details className="group mt-8 border-t border-line pt-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
                이용 방법
                <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <ol data-tone="hanji" className="card m-0 mb-3 flex list-none flex-col divide-y divide-line rounded-lg p-0 px-4">
                {t.howTo.steps.map((s, i) => (
                  <li key={s.name} className="flex gap-3 py-3">
                    <span className="w-4 shrink-0 t-body t-num text-text-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block t-body font-bold text-ink">{s.name}</span>
                      <span className="mt-0.5 block t-sub leading-[1.7] text-text-2">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
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
