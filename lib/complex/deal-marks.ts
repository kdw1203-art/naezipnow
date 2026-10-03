/* [1028] 거래 표식(직거래 · 등기) — 순수 함수(서버 전용 아님 · 단위테스트 대상).
   읽는 쪽은 lib/complex/complex-store.ts getComplexDealMarks, 붙이는 쪽은 단지 상세(app/complex/[id]/page.tsx). */
import type { HubDeal } from "@/lib/complex/hub-price";

export type DealMarks = {
  /** 직거래인 거래의 키(dealMarkKey) */
  direct: Set<string>;
  /** 등기일이 있는 거래의 키 → 등기일 원문("26.09.18") */
  registered: Map<string, string>;
};

/** 표식을 붙일 때 쓰는 키 — 계약월·일·금액(만원)·전용면적·층이 같으면 같은 거래로 본다 */
export function dealMarkKey(d: Pick<HubDeal, "ym" | "day" | "man" | "area" | "floor">): string {
  return `${d.ym}|${d.day ?? ""}|${d.man}|${d.area ?? ""}|${d.floor ?? ""}`;
}

/** [1028] 거래 목록에 표식을 붙인 사본 — 표식이 없는 거래는 원래 객체 그대로(모양이 바뀌지 않는다) */
export function applyDealMarks<T extends HubDeal>(deals: readonly T[], marks: DealMarks | null): Array<T & { direct?: boolean; rgst?: string }> {
  if (!marks || (marks.direct.size === 0 && marks.registered.size === 0)) return deals as Array<T & { direct?: boolean; rgst?: string }>;
  return deals.map((d) => {
    const k = dealMarkKey(d);
    const direct = marks.direct.has(k);
    const rgst = marks.registered.get(k);
    return direct || rgst ? { ...d, ...(direct ? { direct: true } : {}), ...(rgst ? { rgst } : {}) } : d;
  });
}

