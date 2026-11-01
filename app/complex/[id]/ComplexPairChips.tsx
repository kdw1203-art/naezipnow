/* [1095 · 기능] 단지 비교 칩 — 이 단지가 낀 비교 조합(거래 많은 순 · 최대 4). 서버 조각(JS 없음). 폰 40px · md 32px.
   라벨은 상대 단지 이름 + "비교"(표준 명사) · 건수는 두 단지의 최근 12개월 매매 신고 합. 인근 단지 블록(폰)과 레일(데스크톱) 양쪽이 같은 조각을 쓴다 */
import Link from "@/app/components/IntentLink";
import type { ComplexPairLink } from "@/lib/dong/landing";

export function ComplexPairChips({ pairs, className = "" }: { pairs: readonly ComplexPairLink[]; className?: string }) {
  if (pairs.length === 0) return null;
  return (
    <div className={className}>
      <p className="m-0 t-caption text-text-3">단지 비교 · 두 단지 나란히</p>
      <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-2 p-0">
        {pairs.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="tile inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 t-sub font-bold text-ink no-underline md:min-h-8"
            >
              <span>{p.other} 비교</span>
              <span className="t-caption font-normal tabular-nums text-text-3">{p.pairTradeCount.toLocaleString("ko-KR")}건</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
