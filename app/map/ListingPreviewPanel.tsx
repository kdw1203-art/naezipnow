"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/**
 * 지도 매물 마커 클릭 시 뜨는 미리보기 패널(하단 시트).
 * /api/map/listing?id= 를 호출해 사진·가격·핵심정보를 보여주고, 상세로 이동 링크 제공.
 * 화면 이탈 없이 지도 위에서 매물을 훑어볼 수 있게 한다.
 */

type Preview = {
  id: string;
  listingType: string;
  listingTypeLabel: string;
  complexName: string | null;
  regionName: string | null;
  priceLabel: string;
  areaLabel: string | null;
  floor: number | null;
  description: string | null;
  thumbnailUrl: string | null;
  ownerVerified: boolean;
  boosted: boolean;
};

export function ListingPreviewPanel({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setData(null);
    fetch(`/api/map/listing?id=${encodeURIComponent(listingId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((json: Preview) => {
        setData(json);
        setState("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [listingId]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      {/* [1012 · 규칙 1·2] 플로팅 패널 — 반경 8px(2xl) 유지.
          [v4] 유리(블러) + 큰 그림자 → 흰 면 + 1px 선 · 썸네일 행(동네이야기 FeedRow 모양: 72px 정사각 + 제목 한 줄 +
          메타 한 줄) · 유형 배지("매매")는 값 앞 글자로 · 사진 없는 칸은 집 아이콘 대신 회색 단면(--divider) */}
      <div className="pointer-events-auto w-full max-w-[440px] rounded-2xl border border-line bg-surface p-3 [animation:riseIn_200ms_var(--ease-out)_backwards]">
        <div className="flex items-start gap-3">
          {/* 썸네일 */}
          <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">
            {data?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : null}
          </div>

          {/* 본문 */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {state === "loading" ? (
              <div className="py-3 t-sub text-text-3">매물 정보 불러오는 중…</div>
            ) : state === "error" || !data ? (
              <div className="py-3 t-sub text-text-3">매물 정보 조회 실패</div>
            ) : (
              <>
                {/* [1012 · 규칙 9] 배지 = 검증 사실 명사만("집주인 확인" — 기준 사이트 표기), 4px · 500.
                    "부스트"(끌어올림 홍보)는 배지에서 뺐다 — 정렬에만 쓰인다. */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate t-section text-ink">
                    {data.listingTypeLabel} {data.priceLabel}
                  </span>
                  {data.ownerVerified ? (
                    <span className="shrink-0 rounded-sm bg-success-soft chip-pad t-caption font-medium text-success">
                      집주인 확인
                    </span>
                  ) : null}
                </div>
                <div className="truncate t-sub text-text-3">
                  {[
                    data.complexName || "매물",
                    data.regionName,
                    data.areaLabel,
                    data.floor ? `${data.floor}층` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </>
            )}
          </div>

          {/* 닫기 */}
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="press relative -mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-3 after:absolute after:-inset-2 after:content-[''] active:bg-[rgba(29,79,216,.08)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {state === "ok" && data ? (
          <div className="mt-2.5 flex items-center gap-2">
            {/* [1012 · 규칙 5] "상세 보기" → 동사 + 구체 대상 · [v4] 한 줄로 끝나게(단지명은 위 메타 줄).
                이 판은 딤 없이 지도 위에 뜬다 — 머리의 채움 파랑("이 지역 노트 쓰기")이 함께 보이므로 테두리 버튼(규칙 2) */}
            <Link
              href={`/listings/${data.id}`}
              className="btn-secondary flex-1 rounded-lg py-2.5 text-center t-body no-underline"
            >
              매물 상세 보기
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
