"use client";
/* [1023 · AI 분석] 시장 계열 카드의 티저 — 지역 고정 해제.
   서버는 강남구 한 벌(fallback)과 대표 지역 8곳(byRegion, hub-teasers HUB_TEASER_REGIONS)을 같이 내려 주고,
   여기서 허브가 고른 단지의 regionId 에 맞는 벌로 바꿔 그린다. 목록 밖 지역·없는 값은 강남구 한 벌 그대로
   (빈 칸·가짜 수치 없음). 첫 렌더는 picked 가 null 이라 서버 HTML 과 같다(하이드레이션 불일치 없음).
   카드 안 두 자리(오른쪽 위 추세선 · 아래 값 줄)를 slot 으로 나눠 같은 부품을 두 번 놓는다. */

import { Delta } from "@/app/components/num/Delta";
import { deltaDir, pctChange } from "@/lib/format/delta";
import { Sparkline } from "./Sparkline";
import { useHubPicked } from "./hub-context";
import type { HubTeaser } from "./hub-teasers";

/** hub-tool-card.tsx sparkTone 과 같은 규칙(상승 빨강 · 하락 파랑 · 보합 회색) — 서버 부품을 클라이언트로 끌어오지 않으려고 따로 둔다 */
function tone(series: readonly number[]): string {
  const dir = series.length >= 2 ? deltaDir(pctChange(series[series.length - 1], series[0])) : null;
  return dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-3";
}

export function RegionTeaser({
  slot,
  fallback,
  byRegion,
}: {
  slot: "spark" | "value";
  fallback: HubTeaser | null;
  byRegion: Record<string, HubTeaser>;
}) {
  const { picked } = useHubPicked();
  const rid = picked?.regionId ?? null;
  const teaser = (rid && byRegion[rid]) || fallback;
  if (!teaser) return null;
  if (slot === "spark") {
    if (teaser.series.length < 2) return null;
    return (
      <span className={`tile-spark ml-auto ${tone(teaser.series)}`}>
        <Sparkline values={teaser.series} width={72} height={24} />
      </span>
    );
  }
  return (
    <span className="fit flex flex-col gap-0.5 rounded-lg bg-bg px-2.5 py-1.5">
      {teaser.deltaPct != null ? (
        <Delta pct={teaser.deltaPct} className="t-num t-section t-fit" />
      ) : (
        <span className="t-num t-section t-fit text-ink">{teaser.value}</span>
      )}
      <span className="t-caption t-fit text-text-3">{teaser.caption}</span>
    </span>
  );
}
