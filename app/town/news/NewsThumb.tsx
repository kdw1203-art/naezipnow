"use client";

import { CoverImage } from "@/app/components/CoverImage";

/* [1013] 주인님: "뉴스는 이미지 파일이 있어야" — 기사 행 왼쪽 72px 정사각 썸네일(동네이야기 피드 FeedRow 와 같은 칸).
   사진 = 원문 매체가 기사에 붙인 대표 이미지(og:image, 수집분 94%). 우리 서버가 복사·변환하지 않고
   매체 주소를 그대로 건다(/_next/image 를 거치지 않는다 — 허용 호스트가 아니라 CoverImage 가 원본 src 로 둔다).
   사진이 없거나 매체가 막으면 같은 크기 칸에 매체 이름 — 행 높이가 늘 같다
   (v4 가 목록 썸네일을 뺐던 이유가 "있는 기사만 — 행 높이가 들쭉날쭉"이었다). */
export function NewsThumb({
  src,
  source,
  priority = false,
}: {
  src: string | null;
  source: string;
  /** 첫 행만 — 목록 LCP 후보 */
  priority?: boolean;
}) {
  const fallback = (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center break-keep px-1 text-center t-caption font-bold text-text-3"
    >
      {source || "뉴스"}
    </span>
  );
  return (
    <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">
      {src ? (
        <CoverImage
          src={src}
          alt=""
          sizes="72px"
          priority={priority}
          fallback={fallback}
          imgClassName="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  );
}
