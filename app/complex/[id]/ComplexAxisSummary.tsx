import Link from "next/link";
import { loadAxisContext } from "./section-loaders";
import { contextFootnotes } from "@/lib/ai/live-context";
import { buildVerdict } from "@/lib/ai/verdict";
import { VerdictCard } from "@/app/analysis/ai/[tool]/VerdictCard";

/* [OPT-48] 단지 허브 2.0 — 워크벤치와 같은 근거(라이브 컨텍스트)를 허브에도 요약.
   원칙(이 페이지의 예산 규율을 따른다):
   - 컨텍스트는 5분 캐시(unstable_cache) — 보통 첫 방문자 이후 DB 왕복 0.
   - 1.2초 안에 못 받으면 **아무것도 그리지 않는다**(섹션 자체 생략 — 허브를 늦추지 않기).
   - 수치가 없는 축은 만들지 않는다 — 지어내지 않기(워크벤치와 같은 규칙).

   [994] 4칸 숫자 + 신호 줄 → **판단 카드**([1008] 화면 이름은 '결과 요약' — AI 분석과 같은 말)(구간 · 결론 · 투자 점수 · 핵심 숫자 3(기준일) ·
   근거 칩 · 반대 조건). AI 진단·임장노트와 같은 형식이라 세 화면이 같은 말을 한다.
   값은 lib/ai/verdict.ts 가 조립(새 수치 없음). 화면은 결과값을 먼저 보고, 실행은 AI 진단에서. */
export async function ComplexAxisSummary({
  complexId,
  regionName,
}: {
  complexId: string;
  regionName: string;
}) {
  const ctx = await Promise.race([
    loadAxisContext(complexId, regionName).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1200)),
  ]);
  if (!ctx) return null;

  const verdict = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: contextFootnotes(ctx) });
  /* 대표 수치도 핵심 숫자도 없으면(축 0) 카드가 "자료 부족" 한 줄뿐 — 그건 소음이라 생략 */
  if (!verdict.metric && verdict.numbers.length === 0) return null;

  return (
    <section aria-label="이 단지 결과 요약" className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-ink">이 단지 결과 요약 — 공공데이터 자동 계산</h2>
        <Link
          href={`/analysis/ai/ai-diagnosis?complexId=${encodeURIComponent(complexId)}`}
          className="inline-block shrink-0 py-[5px] text-xs font-semibold text-primary"
        >
          AI 진단으로 ›
        </Link>
      </div>
      <div className="mt-3">
        <VerdictCard verdict={verdict} />
      </div>
      {/* [1009 · C 리뷰] "숫자마다 기준일·출처 표기"는 이제 사실이 아니다 — 결과 카드(VerdictCard)가 칸마다 되풀이하던 출처를
          카드 아래 한 줄("출처 … · 기준 …")과 "데이터 출처" 접힘으로 모았다. 그 자리를 가리키게 고쳤다. */}
      <p className="mt-2 t-caption text-text-3">
        참고용 요약이며 투자 권유가 아니에요 · 출처와 기준일은 위 카드 맨 아래에 모아 적었어요 · 거래가 적거나 오래된 자료는 그 사실을 함께 적어요
      </p>
    </section>
  );
}
