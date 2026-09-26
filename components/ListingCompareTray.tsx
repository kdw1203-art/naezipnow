"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { listingPriceLine } from "@/app/listings/price-text";
import { restoreListingAt } from "@/app/listings/compare-restore";
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  remove,
  clear,
  add,
  MIN_COMPARE,
  MAX_COMPARE,
  type CompareListing,
} from "./listing-compare-store";

/* [1009 · T] 호가는 정밀 표기("매매 12억 4,500만") — app/listings/price-text 한 곳(목록·상세·비교 표와 같은 말) */
const priceLine = listingPriceLine;

/**
 * 화면 하단 고정 비교함 트레이 — 담긴 매물이 1개 이상일 때만 노출.
 * "비교하기 (N)" → /listings/compare?ids=a,b,c
 */
export function ListingCompareTray() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { showToast } = useToast();
  /* [1009 · T] 빼기·비우기는 확인 없이 바로 — 대신 "되돌리기"(같은 저장소에 다시 담는다).
     한 칸 빼기는 **트레이 안에서** 되돌리기를 준다: 트레이(바닥 76px)가 남아 있는 동안 토스트(탭바 위 88px)를 띄우면
     트레이의 "비교하기" 줄을 5초 동안 가린다. 전체 비우기는 트레이가 사라지므로 토스트로. */
  /* [1009 · T 리뷰] 되돌리면 **원래 자리**로(예전엔 맨 뒤에 붙었다) — 뺀 자리(index)를 같이 기억한다 */
  const [lastRemoved, setLastRemoved] = useState<{ item: CompareListing; index: number } | null>(null);
  useEffect(() => {
    if (!lastRemoved) return;
    const t = window.setTimeout(() => setLastRemoved(null), 5000);
    return () => window.clearTimeout(t);
  }, [lastRemoved]);
  const removeOne = (it: CompareListing) => {
    const index = items.findIndex((x) => x.id === it.id);
    remove(it.id);
    /* 마지막 한 칸이면 트레이가 사라진다 — 그때만 토스트로 */
    if (items.length <= 1) showToast("비교함에서 뺐어요", { label: "되돌리기", onClick: () => void restoreListingAt(it, 0) });
    else setLastRemoved({ item: it, index });
  };
  const clearAll = () => {
    const before = [...items];
    clear();
    showToast(`비교함을 비웠어요 (${before.length}개)`, {
      label: "되돌리기",
      onClick: () => before.forEach((it) => add(it)),
    });
  };

  if (items.length === 0) return null;

  const canCompare = items.length >= MIN_COMPARE;
  const href = `/listings/compare?ids=${items.map((i) => i.id).join(",")}`;

  return (
    <div className="fixed inset-x-0 bottom-[76px] z-40 px-4 md:bottom-6">
      <div className="glass mx-auto flex max-w-[840px] flex-col gap-2.5 rounded-2xl border border-line p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <Icon name="scale" size={16} strokeWidth={2} />
            비교함 <span className="t-num text-primary">({items.length})</span>
            <span className="text-[12px] font-medium text-text-3">
              / 최대 {MAX_COMPARE}
            </span>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-[24px] items-center text-[12px] font-bold text-text-3 hover:text-danger"
          >
            전체 비우기
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface py-1 pl-2.5 pr-1 text-[12px]"
            >
              <span className="font-bold text-ink">{it.complexName}</span>
              <span className="t-num font-medium text-text-2">{priceLine(it)}</span>
              <button
                type="button"
                onClick={() => removeOne(it)}
                aria-label={`${it.complexName} 비교함에서 빼기`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-text-3 hover:text-danger"
              >
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          {lastRemoved ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-2" role="status">
              <span className="truncate">‘{lastRemoved.item.complexName}’ 뺐어요</span>
              <button
                type="button"
                onClick={() => {
                  restoreListingAt(lastRemoved.item, lastRemoved.index);
                  setLastRemoved(null);
                }}
                className="inline-flex min-h-[24px] shrink-0 items-center font-bold text-primary"
              >
                되돌리기
              </button>
            </span>
          ) : (
            <span className="text-[12px] text-text-3">
              {canCompare
                ? "나란히 비교해 보세요"
                : `${MIN_COMPARE}개 이상 담으면 비교할 수 있어요`}
            </span>
          )}
          {canCompare ? (
            <Link href={href} className="btn-primary btn-sm">
              비교하기 ({items.length})
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="btn-primary btn-sm"
              aria-disabled="true"
            >
              비교하기 ({items.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
