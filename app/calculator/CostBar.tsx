import type { CostBreakdown } from "@/lib/finance/calc-summary";
import { manwonText, shareTexts } from "@/lib/finance/money";

/* [1009 · T] 돈의 구성 막대 — 집값 + 취득세 + 중개보수를 대출 / 내 돈 / 취득세·중개보수 세 칸으로.
 *
 * 왜(2026-09-22 실측): 계산기 결과는 "최대 대출 3억 3,600만원 · 필요 현금 5억 2,802만원" 두 숫자가 따로 있어,
 * 두 숫자가 집값 8억 4,000만원을 어떻게 나눠 갖는지(대출이 38%, 내 돈이 62%)는 사용자가 암산해야 했다.
 * 토스 대출 계산 결과처럼 한 줄 막대로 비율을 보여 주고, 막대 오른쪽 두 칸(내 돈 + 세금·보수)이 곧 "필요 현금"이라는
 * 것을 같은 자리에서 말한다. 값은 전부 calc-summary.costBreakdown 의 실제 계산 — 지어낸 칸 없음.
 * 어두운 결과 패널(.ai-panel) 안에 놓인다 — 색은 네이비 면 전용 토큰(on-navy-*·on-dark)만.
 * 칸 너비는 flex-grow(값에 비례)라 입력이 바뀌면 부드럽게 늘고 준다(모션 최소화면 즉시).
 */

type Part = { key: string; label: string; manwon: number; dot: string; sub?: string };

export function CostBar({ breakdown }: { breakdown: CostBreakdown }) {
  const by = Object.fromEntries(breakdown.segments.map((s) => [s.key, s])) as Record<
    "loan" | "equity" | "tax" | "broker",
    CostBreakdown["segments"][number]
  >;
  const fees = by.tax.manwon + by.broker.manwon;
  const parts: Part[] = [
    { key: "loan", label: "대출", manwon: by.loan.manwon, dot: "bg-on-navy-blue" },
    { key: "equity", label: "내 돈", manwon: by.equity.manwon, dot: "bg-on-dark", sub: "매매가 − 대출" },
    {
      key: "fees",
      label: "취득세·중개보수",
      manwon: fees,
      dot: "bg-on-navy-amber",
      sub: `취득세 ${manwonText(by.tax.manwon, "만")} · 중개보수 ${manwonText(by.broker.manwon, "만")}`,
    },
  ];
  /* [1009 · T 리뷰] 비율 글자는 합이 정확히 100% 가 되게(최대 잔여법 — lib/finance/money shareTexts).
     칸마다 따로 반올림하면 70% + 30% + 0.5% = 100.5% 처럼 합이 어긋났다. */
  const shares = shareTexts(parts.map((p) => p.manwon));
  const aria = parts.map((p, i) => `${p.label} ${manwonText(p.manwon)}(${shares[i]})`).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="t-sub font-bold text-ai-text">돈의 구성</span>
        <span className="t-caption text-ai-muted">
          합계 {manwonText(breakdown.totalManwon)} = 매매가 + 취득세 + 중개보수
        </span>
      </div>
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-on-dark-panel"
        role="img"
        aria-label={`돈의 구성: ${aria}`}
      >
        {parts.map((p) =>
          p.manwon > 0 ? (
            <span
              key={p.key}
              className={`h-full min-w-[3px] basis-0 ${p.dot} motion-safe:transition-[flex-grow] motion-safe:duration-300`}
              style={{ flexGrow: p.manwon }}
            />
          ) : null,
        )}
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-3">
        {parts.map((p, i) => (
          <li key={p.key} className="flex min-w-0 items-start gap-1.5">
            <span aria-hidden="true" className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
            <span className="flex min-w-0 flex-col">
              <span className="t-sub text-ai-muted">
                {p.label} <b className="t-num font-bold text-ai-text">{manwonText(p.manwon)}</b>{" "}
                <span className="t-num">{shares[i]}</span>
              </span>
              {p.sub && <span className="t-caption text-ai-muted break-words">{p.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CostBar;
