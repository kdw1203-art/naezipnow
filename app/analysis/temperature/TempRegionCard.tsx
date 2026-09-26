import Link from "next/link";
import type { TemperatureSnapshot } from "@/lib/market/temperature-archive";
import { DiffBadge } from "./score-diff";

/* 점수 밴드 색 — 예전엔 #dc2626·#ea580c·#0284c7·#2563eb 를 인라인 style 로
   박아 두었다. 다크에서 토큰을 안 타 그대로 튀었고, 대비 게이트가 보증하는
   조합 밖이었다. 토큰 클래스로 바꾼다(위→아래 = 뜨거움→식음). */
export function scoreToneClass(score: number): string {
  if (score >= 65) return "bg-danger-soft text-danger";
  if (score >= 55) return "bg-warning-soft text-warning";
  if (score >= 45) return "bg-bg text-text-2";
  return "bg-primary-soft text-primary";
}

/* [1009 · A] 온도 허브의 지역 한 칸 — 페이지에서 떼어 냈다(임시 하네스가 실데이터 모양으로 그려 확인하려고).
   점수(큰 숫자) → 지역·한 줄 → 눈금(50이 중립) → 지난주 대비 배지(등락 표준: ▲ 빨강·▼ 파랑·보합).
   칸 전체가 링크라 눌림은 .tile(:active)이 준다. */
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
  return (
    <Link href={href} className="tile card flex items-center gap-3 rounded-[10px] px-3 py-2.5 no-underline">
      <span
        className={`tile-ico t-num flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] text-[15px] ${scoreToneClass(current.score)}`}
      >
        {current.score}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="t-sub truncate font-bold text-ink">{current.regionLabel}</span>
        <span className="t-caption truncate text-text-3">{current.headline}</span>
        {/* 눈금 위 위치 — 숫자만으로는 "62가 높은 편인가"를 못 읽는다.
            가운데 눈금이 중립(50)이다. */}
        <span className="rank-track" aria-hidden="true">
          <span
            className={`rank-fill ${current.score >= 55 ? "text-warning" : "text-primary"}`}
            style={{ width: `${Math.min(100, Math.max(3, current.score))}%` }}
          />
        </span>
      </span>
      {diff !== null && <DiffBadge diff={diff} />}
    </Link>
  );
}
