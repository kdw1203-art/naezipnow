"use client";

import { useState } from "react";
import Link from "@/app/components/IntentLink";
import { Delta } from "@/app/components/num/Delta";
import type { HomeRegionCard } from "@/lib/newui/home-data";

/* [1114 · 홈 벤토] 지역 동향 — 회전 카드(4장씩 넘기던 판) → 표 하나(지역 화면 "평형대별" 표와 같은 꼴: 이름 아래 막대 + 숫자 열).
   소유자 2026-11-09 "이런 그래프 · 표를 적극 사용". 등락 큰 순(지수 전월 대비가 있는 줄 먼저) · 막대 = 등락 크기(상승 빨강 · 하락 파랑).
   대표 지역은 위 "시장 한눈에"가 말하므로 여기서 뺀다(app/page.tsx — 같은 숫자 두 곳 금지). 줄은 지역 종합 화면으로.
   가격 열은 카드와 같은 문자열(price) — 부동산원 평균이면 "평균", 국토부 월 집계면 "실거래 평균"을 줄 아래에 적는다. */

/* [1125 · 순서 고르기] 등락 큰 순 하나뿐이던 표 — 상승 · 하락 순을 칩으로(증권 앱 등락 탭 꼴). 같은 줄을 다시 세울 뿐 새 조회 없음.
   등락 값이 없는 줄(국토부 월 집계만 있는 지역)은 어느 순서에서도 뒤로. */
type SortKey = "up" | "down";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "up", label: "상승 순" },
  { key: "down", label: "하락 순" },
];

export function HomeRegionTable({ regions, limit = 8 }: { regions: HomeRegionCard[]; limit?: number }) {
  const [sort, setSort] = useState<SortKey>("up");
  const dir = sort === "up" ? 1 : -1;
  const rows = regions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const pa = a.r.changePct;
      const pb = b.r.changePct;
      if (typeof pa === "number" && typeof pb === "number") return (pb - pa) * dir || a.i - b.i;
      if (typeof pa === "number") return -1;
      if (typeof pb === "number") return 1;
      return a.i - b.i;
    })
    .slice(0, limit)
    .map(({ r }) => r);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.changePct ?? 0)), 0.1);
  return (
    <>
      <div role="group" aria-label="순서" className="mb-1 flex gap-1.5">
        {SORTS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={sort === o.key}
            onClick={() => setSort(o.key)}
            className={`chip inline-flex min-h-10 items-center px-3 t-sub font-bold md:min-h-8 ${
              sort === o.key ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line text-left t-caption text-text-3">
          <th scope="col" className="py-1.5 pr-2 font-bold">지역</th>
          <th scope="col" className="px-2 py-1.5 text-right font-bold">가격</th>
          <th scope="col" className="py-1.5 pl-2 text-right font-bold">전월 대비</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = r.changePct;
          const w = typeof pct === "number" ? Math.max(4, Math.round((Math.abs(pct) / max) * 100)) : 0;
          return (
            <tr key={r.id} className="border-b border-divider last:border-b-0">
              <td className="py-1.5 pr-2">
                <Link href={`/region/${encodeURIComponent(r.id)}`} className="press block min-h-10 py-0.5 no-underline">
                  <span className="block truncate t-body font-bold text-ink">{r.name}</span>
                  <span className="mt-1 block h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-divider" aria-hidden="true">
                    {w > 0 && <span className={`block h-full rounded-full ${pct! > 0 ? "bg-up" : pct! < 0 ? "bg-down" : "bg-text-3"}`} style={{ width: `${w}%` }} />}
                  </span>
                </Link>
              </td>
              <td className="px-2 py-1.5 text-right align-top">
                <span className="block t-body t-num text-ink">{r.price}</span>
                <span className="block t-caption text-text-3">{r.stale ? "실거래 평균" : "평균"}</span>
              </td>
              <td className="py-1.5 pl-2 text-right align-top t-sub">
                {typeof pct === "number" ? <Delta pct={pct} srContext="전월보다" /> : <span className="text-text-3">{r.delta || "—"}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

export default HomeRegionTable;
