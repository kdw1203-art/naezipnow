"use client";

import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";

/* [968 · 3 · 4] 거주민 후기 — 뷰포트에 가까워질 때 코드와 데이터를 함께 받는다.

   왜: ComplexReviews(작성 폼·별점·도움돼요·신고까지 한 파일)는 단지 페이지 아래쪽인데
   첫 로드 JS 에 통째로 실렸고, 마운트 즉시 /api/complex-reviews 를 불렀다. 여기서는
   섹션 자리가 뷰포트 200px 앞에 들어올 때 청크를 내려받아 마운트한다(데이터 조회는
   컴포넌트 안의 같은 관찰자가 이어서 한다). 그 전에는 서버가 그린 같은 모양의 자리
   표시(제목·안내문)만 있다 — ISR HTML 에 제목·설명은 그대로 남는다.
   IntersectionObserver 가 없는 환경은 바로 마운트한다(기능을 빼지 않는다). */

function ReviewsPlaceholder() {
  return (
    <div className="card rounded-[18px] px-[18px] py-4">
      <h2 className="t-section text-ink">거주민 후기</h2>
      <p className="mt-1 t-sub text-text-3">
        직접 살아봤거나 임장에서 확인한 내용만 남겨주세요 · 같은 단지 재작성 시 기존 후기가
        갱신돼요 · 실거주·방문 후기가 먼저 보여요
      </p>
      <div className="mt-3 py-6 text-center t-sub text-text-3" role="status">
        후기를 불러오는 중…
      </div>
    </div>
  );
}

const ComplexReviews = nextDynamic(
  () => import("../ComplexReviews").then((m) => m.ComplexReviews),
  { ssr: false, loading: () => <ReviewsPlaceholder /> },
);

export function ComplexReviewsLazy({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {near ? (
        <ComplexReviews complexId={complexId} complexName={complexName} />
      ) : (
        <ReviewsPlaceholder />
      )}
    </div>
  );
}
