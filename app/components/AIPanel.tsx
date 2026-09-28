/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
import Link from "next/link";

/** AI 결과는 항상 잉크 다크 패널 — 신뢰 시각 언어
 *  disclaimer: AI 오정보 리스크 대응 — 전 분석 결과에 면책 고지 (실행과제 CRO-3) */
export function AIPanel({
  title,
  children,
  className = "",
  disclaimer = true,
  cta,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  disclaimer?: boolean;
  /** 시작 행동 — 시장 브리핑만 두고 끝내지 않을 때 */
  cta?: { href: string; label: string };
}) {
  return (
    <div className={`ai-panel flex flex-col gap-2 p-[18px] ${className}`}>
      <div className="flex items-center gap-[7px]">
        {/* [1012-R2 · 규칙 9 · 채점 C] "AI" 배지: 파랑 채움(.ai-chip) → 어두운 면 위 규칙 — 한지 글자(text-on-dark) +
            한지 45% 외곽선(border-on-dark-faint), 채움 없음. 홈의 채움 파랑은 검색 CTA 하나여야 하고, 네이비 위 파랑 면은
            브랜드 면 규칙("나우블루는 CTA·링크 전용")에도 어긋난다. 반경 4px(rounded-sm)·20px·10px/700 = 배지 규격. */}
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-on-dark-faint t-caption font-bold text-on-dark">
          AI
        </span>
        <span className="t-body font-bold text-white">{title}</span>
      </div>
      {/* [964] .fit — AI 패널 본문은 사이드바(340px)에도, 본문 전폭(1,200px)에도 들어간다.
          판정을 화면이 아니라 **이 패널 폭**으로 하면 좁은 자리에서 글자가 한 단 내려가고
          자간이 조여져, 어느 자리에 놓든 같은 밀도로 보인다(통일감). 값은 램프 안에서만 움직인다. */}
      <div className="fit t-body t-fit leading-[1.6] text-ai-text">{children}</div>
      {cta && (
        <Link
          href={cta.href}
          className="press mt-0.5 inline-flex w-fit items-center rounded-lg bg-white/10 px-3 py-2 t-body font-bold text-ai-accent no-underline"
        >
          {cta.label} ›
        </Link>
      )}
      {disclaimer && (
        <div className="t-caption leading-[1.5] text-ai-muted">
          본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
        </div>
      )}
    </div>
  );
}
