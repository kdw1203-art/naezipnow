import Link from "next/link";
import type { TemperatureSnapshot } from "@/lib/market/temperature-archive";
import { ScoreDiff } from "./score-diff";

/* 점수 밴드 색 — 예전엔 #dc2626·#ea580c·#0284c7·#2563eb 를 인라인 style 로
   박아 두었다. 다크에서 토큰을 안 타 그대로 튀었고, 대비 게이트가 보증하는
   조합 밖이었다. 토큰 클래스로 바꾼다(위→아래 = 뜨거움→식음). */
export function scoreToneClass(score: number): string {
  if (score >= 65) return "bg-danger-soft text-danger";
  if (score >= 55) return "bg-warning-soft text-warning";
  if (score >= 45) return "bg-bg text-text-2";
  return "bg-primary-soft text-primary";
}

/* [1009 · A] 온도 허브의 지역 한 칸.
   [v4 · 규칙 5·7] 카드 격자(점수 색 타일 + 눈금 막대 + 배지) → 구분선 목록 행:
   왼쪽 지역(굵게) + 보조 한 줄(판정 한 줄) / 오른쪽 점수(t-num, 점수 밴드 글자색) + 지난주 대비(글자형 등락).
   행 전체가 링크. 부르는 쪽의 `<ul className="divide-y divide-line">` 이 1px 선으로 가른다. */
export function TempRegionCard({
  current,
  previous,
  href,
}: {
  current: TemperatureSnapshot;
  previous: TemperatureSnapshot | null;
  href: string;
}) {
  const diff = previous ? current.score - previous.score : null;
  /* 밴드 색은 글자에만(면 없이) — scoreToneClass 의 text-* 만 쓴다 */
  const tone = scoreToneClass(current.score).split(" ").find((c) => c.startsWith("text-")) ?? "text-ink";
  return (
    <li>
      <Link href={href} className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline">
        <span className="min-w-0 flex-1">
          <span className="block truncate t-body font-bold text-ink">{current.regionLabel}</span>
          <span className="mt-0.5 block truncate t-sub text-text-3">{current.headline}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={`t-body t-num ${tone}`}>{current.score}</span>
          {diff !== null && (
            <span className="t-caption">
              <ScoreDiff d={diff} sr="지난주보다" />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
