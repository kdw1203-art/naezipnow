/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
/* [1012 · 규칙 1] 본문 카드 반경 12 → 8px(카드 눈금) */
import Link from "next/link";

/* 15h-44 분석→행동 제안 카드 — 모든 분석 결과 끝 "그래서 다음은?" 행 (막다른 화면 금지) */

export type NextActionItem = {
  label: string;
  href: string;
  primary?: boolean;
};

export function NextActions({ actions }: { actions: NextActionItem[] }) {
  return (
    <div className="card flex flex-col gap-2.5 rounded-lg px-[18px] py-4">
      <div className="text-xs font-bold text-text-3">다음 행동</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {actions.map((a) => (
          <Link
            key={`${a.href}-${a.label}`}
            href={a.href}
            className={`${
              a.primary ? "btn-primary" : "btn-soft"
            } flex-1 rounded-lg px-4 py-3 text-center text-[13px]`}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
