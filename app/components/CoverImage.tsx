"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { buildImageSrcSet, canOptimizeImage } from "@/lib/images/srcset";

/* 이미지 폴백 (#18) — 커버/썸네일 이미지가 없거나(로드 실패 포함) 깨질 때
   브라우저 기본 "깨진 이미지" 아이콘 대신 지정한 폴백(그라디언트·아이콘)을 노출한다.
   SSR 시엔 <img loading="lazy" decoding="async">를 그대로 렌더하고, onError가 발생하면 클라이언트에서 폴백으로 교체.

   [#93, 2026-08-23] 표시단 srcset 도입 — 예전 주석(#25)은 "리사이즈 변환
   엔드포인트가 없어 srcSet 을 만들 소스가 없다"고 판단했는데, Vercel 이미지
   최적화(/_next/image)가 정확히 그 엔드포인트다(next.config images.remotePatterns
   에 이미 우리 Supabase 호스트·pstatic 이 잠겨 있다). next/image 컴포넌트로
   갈아타면 fill/width 계약 때문에 호출부 레이아웃(absolute/block 혼재)이 전부
   흔들리므로, <img> 는 그대로 두고 srcSet 만 /_next/image 변환 URL 로 손수 만든다
   — 렌더 결과 DOM 구조·클래스는 이전과 동일(시각 회귀 0), 전송만 AVIF/WebP
   반응형으로 줄어든다. 허용 호스트가 아니면 원본 단일 src 로 그대로 폴백.
   최적화 경로가 죽으면(onError 1회) 원본으로 재시도, 그것도 죽으면 폴백 노드. */

type CoverImageProps = {
  src?: string | null;
  alt?: string;
  /** <img loading="lazy" decoding="async">에 적용할 클래스 (absolute inset-0 / block w-full 등 레이아웃은 호출부가 결정) */
  imgClassName?: string;
  /** src가 없거나 로드 실패 시 렌더할 폴백 노드 */
  fallback?: ReactNode;
  /** 정상 로드된 이미지 위에 얹는 상단 스크림 그라디언트 */
  scrim?: boolean;
  /** srcset 선택 힌트 — 그리드 카드 기본값. 넓은 히어로는 호출부가 넓게 준다 */
  sizes?: string;
  /**
   * [968 · 17] 첫 화면의 LCP 후보(목록 첫 카드·히어로)에만 true.
   * lazy 를 풀고 fetchPriority="high" 로 선점 요청한다 — 기본 lazy 는 뷰포트 안 이미지도
   * 스크립트가 붙은 뒤에야 받기 시작해 첫 카드가 LCP 를 끌어내렸다(/notes 실측 근거,
   * 제안 17). 한 화면에 하나만 준다: 여러 장에 주면 우선순위가 의미를 잃는다.
   */
  priority?: boolean;
};

/* 허용 호스트 판정·srcSet 조립은 lib/images/srcset 으로 옮겼다([968 · 17]) —
   노트 사진 캐러셀과 규칙을 한 곳에서 공유한다. */

export function CoverImage({
  src,
  alt = "",
  imgClassName = "",
  fallback = null,
  scrim = false,
  sizes = "(max-width: 768px) 50vw, 33vw",
  priority = false,
}: CoverImageProps) {
  /* ok → (최적화 실패 시) raw → (원본도 실패 시) fallback */
  const [state, setState] = useState<"ok" | "raw" | "failed">("ok");
  const canOptimize = canOptimizeImage(src);
  const show = Boolean(src) && state !== "failed";

  if (!show) return <>{fallback}</>;

  const useOptimized = canOptimize && state === "ok";

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src as string}
        {...(useOptimized ? { srcSet: buildImageSrcSet(src as string), sizes } : {})}
        alt={alt}
        /* [968 · 17] priority 면 eager + high — 그 외는 종전대로 lazy */
        loading={priority ? "eager" : "lazy"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        decoding="async"
        onError={() => setState((s) => (s === "ok" && canOptimize ? "raw" : "failed"))}
        className={imgClassName}
      />
      {scrim && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
      )}
    </>
  );
}

export default CoverImage;
