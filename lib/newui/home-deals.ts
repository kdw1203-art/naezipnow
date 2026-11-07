/* [1108 · 홈 A안] 최근 실거래 줄 재료 — 순수 함수(단위 테스트가 .tsx 를 못 읽어 여기 둔다). 화면은 app/components/home/HomeRecentDeals.tsx */
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";

export interface HomeDealRow {
  key: string;
  complexName: string;
  /** 단지 화면 주소 — 만들 수 없으면 null(이름만) */
  href: string | null;
  /** "2026.10.16" */
  date: string;
  /** "84㎡ · 12층" (있는 값만) */
  spec: string;
  /** 만원 */
  man: number;
}

export function toHomeDealRows(
  rows: readonly {
    complexName: string;
    contractYm: string;
    contractDay: number | null;
    dealAmountKrw: number;
    areaM2: number | null;
    floor: number | null;
    regionName: string | null;
  }[],
  hrefOf: (region: string, name: string) => string,
): HomeDealRow[] {
  return rows.map((r, i) => {
    const spec = [
      r.areaM2 != null && r.areaM2 > 0 ? `${Math.round(r.areaM2)}㎡` : null,
      r.floor != null && r.floor !== 0 ? floorLabel(r.floor) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: `${r.contractYm}-${r.contractDay ?? 0}-${r.complexName}-${r.dealAmountKrw}-${i}`,
      complexName: r.complexName,
      href: r.regionName ? hrefOf(r.regionName, r.complexName) : null,
      date: dealDateLabel(r.contractYm, r.contractDay),
      spec,
      man: Math.round(r.dealAmountKrw / 10_000),
    };
  });
}

