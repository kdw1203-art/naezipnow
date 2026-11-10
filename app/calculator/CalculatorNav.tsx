import Link from "@/app/components/IntentLink";
import { HScroll } from "@/app/components/HScroll";

/* [개선 #6, 2026-08-22] 계산기 상호 링크 줄.
   방문 실측에서 /calculator 는 상위 진입 경로(홈·동네이야기 다음)인데 검색에는
   한 장으로만 노출됐다 — "중개보수 계산기"·"전월세 전환" 같은 키워드는 각자
   검색량이 있는 별개 질의라 랜딩을 나눴다. 이 줄이 다섯 장을 서로 잇는다
   (내부 링크는 SEO 이기도 하지만, 우선 사용자가 옆 계산기를 발견하는 길이다). */

export const CALCULATORS = [
  { href: "/calculator", label: "대출 계산기" },
  { href: "/calculator/brokerage", label: "중개보수 계산기" },
  { href: "/calculator/jeonse-monthly", label: "전월세 전환 계산기" },
  { href: "/calculator/gap", label: "갭·전세가율 계산기" },
  { href: "/calculator/rental-yield", label: "임대수익률 계산기" },
  /* [1025 · 담당 S] 살까·빌릴까 — 매매·전세·월세 총비용(app/calculator/rent-vs-buy) */
  { href: "/calculator/rent-vs-buy", label: "살까·빌릴까 계산기" },
  /* [1121 · 기능 통폐합] 시장·대출 시나리오(금리 · 시세 · 보유 기간을 바꿔 보는 계산) — 계산기 묶음의 한 칸(주소 /analysis/scenario 그대로) */
  { href: "/analysis/scenario", label: "시장·대출 시나리오" },
] as const;

const EXTRAS = [
  { href: "/decide", label: "결정 카드" },
  { href: "/journey", label: "내 집 마련 여정" },
  { href: "/quiz", label: "실거래가 게임" },
] as const;

export function CalculatorNav({ current }: { current: string }) {
  /* [1084] 640px 틀에서 여섯 번째 칩이 잘리고 스크롤 막대가 숨어 "더 있다"를 알 수 없었다(운영 실측 · 계산기 3쪽).
     넓은 화면은 줄바꿈, 폰은 옆으로 밀기 + 오른쪽 흐림(HScroll · 안내 줄 없음). */
  return (
    <>
    <HScroll hint={null} className="mb-4">
    <nav
      aria-label="계산기 목록"
      className="flex w-max gap-1.5 pb-1 md:w-auto md:flex-wrap"
    >
      {CALCULATORS.map((c) =>
        c.href === current ? (
          <span
            key={c.href}
            aria-current="page"
            className="chip-active shrink-0 rounded-full px-3.5 py-2 t-sub font-bold"
          >
            {c.label}
          </span>
        ) : (
          <Link
            key={c.href}
            href={c.href}
            className="chip press shrink-0 border border-line bg-surface px-3.5 py-2 t-sub font-semibold text-text-2 no-underline"
          >
            {c.label}
          </Link>
        ),
      )}
    </nav>
    </HScroll>
    {/* [1121 · 기능 통폐합] 숫자로 정하는 화면 셋은 계산기 묶음 아래 한 줄로(결정 카드 · 여정 · 실거래가 게임 — 각 30일 한 자릿수 방문) */}
    <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 t-sub">
      <span className="text-text-3">이어서</span>
      {EXTRAS.map((x) => (
        <Link key={x.href} href={x.href} className="tap-line font-bold text-text-2 no-underline hover:underline">
          {x.label} ›
        </Link>
      ))}
    </p>
    </>
  );
}
