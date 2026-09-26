import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { Delta } from "@/app/components/num/Delta";
import { deltaDir, pctChange } from "@/lib/format/delta";
import { marketPersonaByHref, personaVars } from "@/lib/ai/tool-persona";
import { ToolGlyph, HUB_GLYPH } from "./ToolGlyph";
import { Sparkline } from "./Sparkline";
import { ToolLink } from "./tool-cards-client";
import { ACCEPTS_COMPLEX, TIERS, type HubTool } from "./tool-catalog";
import type { HubTeaser } from "./hub-teasers";

/* [1009 · A] 분석 허브의 도구 카드 한 장 — 페이지에서 떼어 냈다(임시 하네스가 실데이터 모양으로 그려 확인하려고).
   서버 컴포넌트(JS 0 — 링크만 ToolLink 가 클라이언트). 바뀐 것: 변동률 티저를 ▲ 빨강·▼ 파랑(<Delta>)으로,
   추세선 색을 기간 등락으로(예전엔 도구 색이라 오르는지 내리는지를 선의 기울기로만 읽어야 했다). */

/** [1009 · A] 추세선 색 = 그 구간의 등락(상승 빨강 · 하락 파랑 · 보합 회색) — 예전엔 도구 색(초록·주황)이라
    "오르는 중"인지 선의 기울기로만 읽어야 했다. 서버에서 정한다(클라이언트 JS 0). */
function sparkTone(series: readonly number[]): string {
  const dir = series.length >= 2 ? deltaDir(pctChange(series[series.length - 1], series[0])) : null;
  return dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-3";
}

/** 도구 카드 한 장 — 아이콘(계열색) · 제목 · 설명 · 실측 티저 + 추세선 · 열기 */
export function ToolCard({
  t,
  teaser,
  extra,
}: {
  t: HubTool;
  teaser?: HubTeaser | null;
  extra?: ReactNode;
}) {
  const tier = TIERS[t.tier];
  const spark = teaser && teaser.series.length >= 2 ? teaser.series : null;
  /* [980] 지역·시장 4종에도 성격을 준다. AI 도구와 **같은 개성 체계이되 다른 계열**이다
     — 이쪽은 AI 가 판단하는 화면이 아니라 공표 통계를 그대로 늘어놓는 화면이라,
     성격 라벨도 "실측·흐름·체온·순위" 처럼 재는 행위로 붙였다. 나머지 카드(체험·기록)는
     페르소나가 없으므로 예전 계열색 그대로 — 없는 성격을 지어내지 않는다. */
  const persona = marketPersonaByHref(t.href);
  return (
    <ToolLink
      href={t.href}
      title={t.title}
      withPicked={ACCEPTS_COMPLEX.has(t.href)}
      className={`tile card ai-glow flex flex-col gap-2 rounded-[14px] p-4 no-underline${
        persona ? " tool-scope tool-rail" : ""
      }`}
      style={persona ? personaVars(persona) : undefined}
    >
      <div className="flex items-start gap-2">
        {/* [958] 결과물 모양을 그린 글리프 — 아이콘보다 "무엇이 나오는지"가 먼저 보인다 */}
        <span
          className={
            persona
              ? "tool-soft-bg tool-ink tile-ico flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
              : `tile-ico flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] ${tier.iconClass}`
          }
        >
          {HUB_GLYPH[t.href] ? (
            <ToolGlyph id={HUB_GLYPH[t.href]} size={34} />
          ) : (
            <Icon name={t.icon} size={17} />
          )}
        </span>
        {spark && (
          <span className={`tile-spark ml-auto ${sparkTone(spark)}`}>
            <Sparkline values={spark} width={72} height={24} />
          </span>
        )}
      </div>
      {/* [989] 배지는 제목 글줄 안으로 — 사유는 app/analysis/hub-tiers.tsx 주석 참고
          (2열 좁은 칸에서 배지가 제 줄을 차지해 옆 카드에 빈 띠를 만들었다) */}
      <span className="t-section text-ink">
        {t.title}
        {persona && (
          <>
            {" "}
            <span className="tool-soft-bg tool-ink t-caption inline-block whitespace-nowrap rounded px-1.5 py-px align-middle font-extrabold">
              {persona.character}
            </span>
          </>
        )}
      </span>
      <span className="t-sub text-text-2">{persona ? persona.premise : t.desc}</span>
      {teaser && (
        /* [963] .fit — 캡션이 화면이 아니라 **이 칸** 폭으로 판정되게. 2열 그리드의
           좁은 칸에서 캡션이 3줄로 접히던 것을 자간·줄바꿈 규칙이 흡수한다. */
        <span className="fit flex flex-col gap-0.5 rounded-[10px] bg-bg px-2.5 py-1.5">
          {teaser.deltaPct != null ? (
            /* 변동률 티저는 ▲ 빨강·▼ 파랑(등락 표준) — "+1.2%" 부호만으로는 방향이 늦게 읽혔다 */
            <Delta pct={teaser.deltaPct} className="t-num t-section t-fit" />
          ) : (
            <span className="t-num t-section t-fit text-ink">{teaser.value}</span>
          )}
          {/* [958] 티저는 강남구 고정 표본 — 지역을 캡션이 아니라 값 옆에서 말한다 */}
          <span className="t-caption t-fit text-text-3">{teaser.caption}</span>
        </span>
      )}
      {extra}
      <span className={`tile-go t-sub mt-auto pt-0.5 font-bold ${persona ? "tool-ink" : "text-primary"}`}>
        열기 ›
      </span>
    </ToolLink>
  );
}

