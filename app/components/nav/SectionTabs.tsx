import Link from "@/app/components/IntentLink";
import type { SectionTab } from "@/lib/nav/section-tabs";

/* [1121 · 기능 통폐합] 묶음 탭 줄 — 지역 화면 탭(RegionTabs)과 같은 꼴(.news-tabs 밑줄 탭 · 40px · 폰 가로 밀기). JS 0.
   current = 지금 화면이 속한 탭의 href(데이터 출처처럼 탭이 따로 없는 화면은 가장 가까운 탭을 넘긴다). */
export function SectionTabs({
  tabs,
  current,
  label,
  className = "",
}: {
  tabs: readonly SectionTab[];
  current: string;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`region-tabs news-tabs ${className}`.trim()}>
      {tabs.map((t) =>
        t.href === current ? (
          <Link key={t.href} href={t.href} aria-current="page" prefetch={false}>
            {t.label}
          </Link>
        ) : (
          <Link key={t.href} href={t.href} prefetch={false}>
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
