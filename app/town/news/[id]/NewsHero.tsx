"use client";

import { useState } from "react";
import { CoverImage } from "@/app/components/CoverImage";

/**
 * [970 · C-12] 뉴스 상세 원문 사진 — 16:9 상자 + "사진: 출처" 캡션을 한 덩어리로.
 *
 * 왜: 상자·캡션은 서버가 그리고 <img> 만 CoverImage(클라이언트)가 맡고 있어서,
 * 원문 매체의 og:image 가 죽으면(핫링크 차단·삭제) 이미지는 폴백 null 로 사라지는데
 * 380px 빈 회색 상자와 "사진: ○○일보" 캡션은 그대로 남았다 — 없는 사진을 설명하는
 * 상자다. 여기서는 로드 실패를 한 번에 받아 **통째로** 그리지 않는다.
 * 높이는 성공 경로에서 여전히 먼저 잡힌다(CLS 보호 — 최적화 22 그대로).
 */
export function NewsHero({ src, sourceName }: { src: string; sourceName?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="relative aspect-[16/9] max-h-[380px] w-full overflow-hidden rounded-[14px] bg-bg">
      <CoverImage
        src={src}
        alt=""
        imgClassName="absolute inset-0 h-full w-full object-cover"
        sizes="(max-width: 768px) 100vw, 720px"
        onFailed={() => setFailed(true)}
      />
      {sourceName && (
        <span className="absolute bottom-0 left-0 rounded-tr-[10px] bg-[var(--glass-bg)] px-3 py-[5px] text-[12px] text-text-3">
          사진: {sourceName}
        </span>
      )}
    </div>
  );
}
