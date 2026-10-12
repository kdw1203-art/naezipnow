"use client";

import { useState } from "react";
import Link from "next/link";
import { CoverImage } from "@/app/components/CoverImage";

/* [1061] 다이제스트 뉴스 썸네일 — 원문 og:image 56px. 핫링크 차단·삭제로 못 받으면 상자째 사라진다
 * (NewsHero 와 같은 규칙 · 빈 상자 금지). 사진은 장식이라 alt 비움 · 링크는 제목 링크의 보조라 탭 순서에서 뺀다. */
export function DigestThumb({ src, href }: { src: string; href: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Link href={href} className="shrink-0 no-underline" aria-hidden="true" tabIndex={-1}>
      <span className="block h-14 w-14 overflow-hidden rounded-lg bg-bg">
        <CoverImage src={src} alt="" imgClassName="h-14 w-14 object-cover" sizes="56px" onFailed={() => setFailed(true)} />
      </span>
    </Link>
  );
}
