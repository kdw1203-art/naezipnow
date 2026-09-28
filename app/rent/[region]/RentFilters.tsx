"use client";
/* [1024 · 원룸·오피스텔] 유형 탭 · 면적 칩 · 동 칩 — ?type= · ?area= · ?dong= 를 replaceState 로 주소에만 남기고
   router.refresh() 로 서버 렌더를 다시 받는다(서버가 searchParams 를 읽는 동적 라우트 — 데이터는 6시간 데이터 캐시).
   히스토리를 쌓지 않는다(뒤로 가기가 필터를 되감지 않게). 실패해도 화면은 마지막 서버 렌더 그대로다. */
import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AREA_BANDS,
  NONAPT_PROPERTY_TYPES,
  NONAPT_TYPE_LABEL,
  rentHref,
  type NonAptPropertyType,
  type RentParams,
} from "@/lib/rent/params";

type Props = {
  regionId: string;
  params: RentParams;
  /** 유형별 건수(최근 12개월) — 탭 옆 캡션. null 이면 숫자를 적지 않는다 */
  counts?: Record<NonAptPropertyType, number> | null;
};

function useApply(regionId: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const apply = useCallback(
    (next: RentParams) => {
      try {
        window.history.replaceState(window.history.state, "", rentHref(regionId, next));
      } catch {
        /* replaceState 불가 환경 — 서버 렌더만 다시 받는다 */
      }
      start(() => router.refresh());
    },
    [regionId, router],
  );
  return { apply, pending };
}

/** 유형 탭(밑줄) + 면적 칩 줄 */
export function RentTypeAreaFilters({ regionId, params, counts }: Props) {
  const { apply, pending } = useApply(regionId);
  return (
    <div className="flex flex-col gap-2" aria-busy={pending || undefined} data-pending={pending ? "1" : undefined}>
      <div className="flex border-b border-line" role="tablist" aria-label="주택 유형">
        {NONAPT_PROPERTY_TYPES.map((t) => {
          const on = params.type === t;
          const n = counts?.[t];
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => !on && apply({ ...params, type: t })}
              className={`-mb-px inline-flex min-h-10 items-center gap-1 border-b-2 px-3 t-body transition-colors ${
                on ? "border-brand-navy font-bold text-ink" : "border-transparent font-semibold text-text-3"
              }`}
            >
              {NONAPT_TYPE_LABEL[t]}
              {typeof n === "number" && n > 0 && <span className="t-caption font-medium text-text-3 tabular-nums">{n.toLocaleString("ko-KR")}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="전용면적">
        {AREA_BANDS.map((b) => {
          const on = params.areaBand === b.key;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={on}
              onClick={() => apply({ ...params, areaBand: on ? null : b.key })}
              className={`chip press min-h-10 border px-3 py-1.5 t-sub ${on ? "chip-active" : "border-line bg-surface text-text-2"}`}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 동 선택 칩 줄 — 표본에서 본 법정동(건수 내림차순). 선택 칩을 다시 누르면 시군구 전체 */
export function RentDongChips({
  regionId,
  params,
  dongs,
}: {
  regionId: string;
  params: RentParams;
  dongs: ReadonlyArray<{ dong: string; count: number }>;
}) {
  const { apply, pending } = useApply(regionId);
  if (dongs.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="법정동" aria-busy={pending || undefined}>
      {dongs.map((d) => {
        const on = params.dong === d.dong;
        return (
          <button
            key={d.dong}
            type="button"
            aria-pressed={on}
            onClick={() => apply({ ...params, dong: on ? null : d.dong })}
            className={`chip press min-h-10 shrink-0 border px-3 py-1.5 t-sub ${on ? "chip-active" : "border-line bg-surface text-text-2"}`}
          >
            {d.dong}
            <span className="ml-1 t-caption font-medium text-text-3 tabular-nums">{d.count.toLocaleString("ko-KR")}</span>
          </button>
        );
      })}
    </div>
  );
}
