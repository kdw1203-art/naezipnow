import type { ReactNode } from "react";
import { Delta } from "@/app/components/num/Delta";
import { ToolLink } from "./tool-cards-client";
import { ACCEPTS_COMPLEX, type HubTool } from "./tool-catalog";
import type { HubTeaser } from "./hub-teasers";
import { ROW_CLASS, RowChevron, RowText } from "./hub-row";

/* [v4 · 한 화면 한 가지] 분석 허브 도구 **행** 한 줄 — 카드(아이콘 타일 · 성격 배지 · 설명 문단 · 회색 숫자 상자 ·
   추세선 · "… 열기 ›" 링크)를 구분선 목록의 행으로 바꿨다.
   행 = 왼쪽 이름(굵게) + 그 아래 보조 한 줄 / 오른쪽 값(t-num) 또는 `›`.
   · 실측 티저가 있으면 보조 줄 = 티저 캡션(지역·기준 시점), 오른쪽 = 그 숫자(변동률이면 ▲ 빨강·▼ 파랑 <Delta>).
   · 없으면 보조 줄 = 결과 한 줄(tool-catalog sub), 오른쪽 = `›`(또는 호출측이 넘긴 값 — 비교 트레이 수).
   서버 컴포넌트(JS 0) — 링크만 ToolLink 가 클라이언트(선택 단지 ?complexId= · 최근 사용 기록). */

export function ToolRow({
  t,
  teaser,
  value,
}: {
  t: HubTool;
  teaser?: HubTeaser | null;
  /** 티저가 없을 때 오른쪽에 둘 값(클라이언트 실카운트 등) — 없으면 `›` */
  value?: ReactNode;
}) {
  return (
    <li>
      <ToolLink href={t.href} title={t.title} withPicked={ACCEPTS_COMPLEX.has(t.href)} className={ROW_CLASS}>
        <RowText title={t.title} sub={teaser ? teaser.caption : t.sub} />
        {teaser ? (
          teaser.deltaPct != null ? (
            /* 변동률은 ▲ 빨강·▼ 파랑(등락 표준) — "+1.2%" 부호만으로는 방향이 늦게 읽혔다 */
            <Delta pct={teaser.deltaPct} className="shrink-0 t-section t-num" />
          ) : (
            <span className="shrink-0 t-section t-num text-ink">{teaser.value}</span>
          )
        ) : (
          value ?? <RowChevron />
        )}
      </ToolLink>
    </li>
  );
}
