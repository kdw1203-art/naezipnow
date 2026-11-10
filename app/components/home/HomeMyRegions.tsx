"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { regionIdForName } from "@/lib/region/catalog";

/* [1125 · 홈 개인화] 홈 대표 지역은 모두에게 같은 정적 화면(300초 캐시)이라 서버에서 바꿀 수 없다.
   로그인한 사람에게만 내 관심 지역(가입 때 고른 1~3곳)의 종합 화면으로 가는 칩 한 줄을 붙인다 — 캐시는 그대로.
   HomeMyRail 이 세션을 확인한 뒤에만 동적으로 불러온다(비회원 첫 화면 번들에 없다). 지역이 없거나 조회 실패면 그리지 않는다. */
export function HomeMyRegions() {
  const [regions, setRegions] = useState<Array<{ name: string; id: string }>>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/me/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { personalization?: { regions?: unknown } | null } | null) => {
        const list = d?.personalization?.regions;
        if (!alive || !Array.isArray(list)) return;
        const rows = list
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .slice(0, 3)
          .map((name) => ({ name, id: regionIdForName(name) }))
          .filter((r): r is { name: string; id: string } => r.id != null);
        setRegions(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (regions.length === 0) return null;
  return (
    <nav aria-label="내 관심 지역" className="card flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl px-4 py-2.5">
      <span className="t-sub font-bold text-text-2">내 관심 지역</span>
      {regions.map((r) => (
        <Link
          key={r.id}
          href={`/region/${encodeURIComponent(r.id)}`}
          className="chip inline-flex min-h-10 items-center border border-line bg-surface px-3 t-sub font-bold text-ink no-underline md:min-h-8"
        >
          {r.name} 종합 ›
        </Link>
      ))}
      <Link href="/welcome?next=/" className="tap-line ml-auto inline-block py-[5px] t-sub font-semibold text-primary no-underline">
        지역 바꾸기 ›
      </Link>
    </nav>
  );
}

export default HomeMyRegions;
