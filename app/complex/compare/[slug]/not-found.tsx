"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { parsePairSlugLoose } from "@/lib/market/complex-pair-slug";

/* [967 · 30e] 단지 비교 404 — 세그먼트 전용 not-found.
   page.tsx 는 market_agg.complex_pair_mv 에서 조합이 빠지면 notFound() 를 던진다
   (양쪽 12개월 매매 20건 이상이라는 자격을 잃은 조합 — 2026-09-06 7일 404 로그에
   /complex/compare/<A>--<B>--<region> 이 조합마다 2~4회). 그때 뜨던 전역 404 는
   "이 집은 이사 갔어요" 라 방문자가 찾던 단지 이름을 잃어버린다. 이 화면은 슬러그에서
   두 단지 이름을 다시 꺼내 검색으로 잇는다. 상태 코드는 Next 가 404 로 낸다(이 세그먼트
   위에 loading 경계가 없어 첫 플러시 전에 판정이 끝난다 — docs/soft-404-policy.md).
   레이아웃은 app/not-found.tsx 와 같은 꼴(PageShell 없이 가운데 정렬). */
export default function ComplexCompareNotFound() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean).pop() ?? "";
  const parsed = parsePairSlugLoose(slug);
  const names = parsed
    ? parsed.first === parsed.second
      ? [parsed.first]
      : [parsed.first, parsed.second]
    : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3.5 px-10 text-center">
      <svg className="rise-in" width="64" height="59" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M52 28 L68 28" fill="none" stroke="var(--brand-symbol-ink)" strokeWidth="7" strokeLinecap="round" />
        <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke="var(--brand-symbol-ink)" strokeWidth="7" strokeLinecap="round" />
        <circle className="empty-dot-breathe" cx="60" cy="86" r="8.5" fill="var(--brand-dot)" style={{ transformOrigin: "60px 86px" }} />
      </svg>
      <div className="rise-in t-caption font-extrabold tracking-[0.2em] text-text-3">404</div>
      <h1 className="rise-in-1 text-[15px] font-extrabold text-ink">
        이 비교는 지금 제공되지 않아요<span className="text-brand-red">.</span>
      </h1>
      <p className="rise-in-2 text-[13px] leading-[1.6] text-text-3">
        최근 12개월 거래가 충분한 조합만 비교 페이지를 만들어요.
        <br />
        거래가 뜸해지면 페이지도 잠시 내려가요.
      </p>
      {names.length > 0 && (
        <div className="rise-in-3 flex flex-wrap justify-center gap-2">
          {names.map((name) => (
            <Link
              key={name}
              href={`/search?q=${encodeURIComponent(name)}`}
              className="btn-primary btn-cta rounded-[14px] px-[18px] py-3 text-[13px]"
            >
              {name} 검색
            </Link>
          ))}
        </div>
      )}
      <div className="rise-in-4 mt-1 flex flex-wrap justify-center gap-1.5">
        <Link
          href="/complex/browse"
          className="rounded-full bg-primary-soft px-[13px] py-[7px] text-[12px] font-bold text-primary"
        >
          단지 둘러보기
        </Link>
        <Link
          href="/tx"
          className="rounded-full bg-bg px-[13px] py-[7px] text-[12px] font-bold text-text-1"
        >
          실거래 시세
        </Link>
        <Link
          href="/search"
          className="rounded-full bg-bg px-[13px] py-[7px] text-[12px] font-bold text-text-1"
        >
          단지 검색
        </Link>
      </div>
    </main>
  );
}
