import Link from "next/link";

/**
 * [1000] 섹션 머리 — 제목(h2 기본) + 선택 부제 + 오른쪽 "전체 보기" 링크.
 *
 * 왜 공용인가: /my 가 로컬 SectionHead 를 갖고 있었고, 구독 관리·고객센터가 같은 얼굴을
 * 각자 다시 그리려던 참이었다. 오른쪽 링크는 문장 속 링크 규칙(`inline-block py-[5px]`
 * → 24px 히트)을 따른다. 서버·클라이언트 어디서든 렌더된다(훅 없음).
 */
export type SectionHeadProps = {
  title: string;
  /** 오른쪽 링크 목적지 — 없으면 제목만 */
  href?: string;
  /** 링크 글자 (기본 "전체 보기") */
  hrefLabel?: string;
  /** 제목 아래 한 줄 설명 */
  sub?: string;
  /** 문서 구조상 h3 이 맞는 자리(카드 안 소제목)면 바꾼다 */
  as?: "h2" | "h3";
  className?: string;
};

export function SectionHead({
  title,
  href,
  hrefLabel,
  sub,
  as: Heading = "h2",
  className = "",
}: SectionHeadProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-1 ${className}`.trim()}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading className="t-section text-ink">{title}</Heading>
        {sub && <span className="t-sub text-text-3">{sub}</span>}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-block shrink-0 py-[5px] t-sub font-semibold text-primary no-underline"
        >
          {hrefLabel ?? "전체 보기"} ›
        </Link>
      )}
    </div>
  );
}

export default SectionHead;
