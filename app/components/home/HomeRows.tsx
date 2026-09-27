import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import { Delta } from "@/app/components/num/Delta";
import { kpiRegionOf, todayRegionSentence, todayTradeSentence } from "./today-line";

/* ============================================================
   [v4 · 규칙 5] 홈 목록 행의 공통 모양 — 승인 시안(단지 SummaryRow · 분석 hub-row · 동네 FeedRow)과 같은 행.
   상태·훅이 없는 순수 JSX 라 서버 조각에서도, 로그인 관심지역 행(HomeMyRegionRow · 클라이언트)에서도 쓴다.

     행 = 왼쪽 이름(굵게, 한 줄) + 그 아래 보조 한 줄 / 오른쪽 값(t-num) · 링크면 `›`.
     목록은 부르는 쪽의 `<ul className={HOME_LIST}>` 이 1px 구분선으로 가른다.
     썸네일(72px 정사각)은 넘어올 때만 — 동네 피드 FeedRow 와 같은 칸.
   ============================================================ */

/** 목록 판 — 흰 면 + 1px 선 + 8px, 행 사이 1px 구분선(분석 허브 목록과 같은 클래스) */
export const HOME_LIST = "card flex flex-col divide-y divide-line rounded-lg px-4";

/** 섹션 머리 — 제목(t-section) + 숫자 / 오른쪽 글자 링크 · 필요하면 아래 사실 한 줄(숫자·시점만) */
export function HomeSectionHead({
  id,
  title,
  count,
  link,
  fact,
}: {
  id: string;
  title: string;
  count?: ReactNode;
  link?: { href: string; label: string };
  fact?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="flex min-w-0 items-baseline gap-1.5 t-section text-ink">
          {title}
          {count != null && count !== "" ? <span className="t-num text-text-3">{count}</span> : null}
        </h2>
        {link && (
          <Link href={link.href} className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
            {link.label}
          </Link>
        )}
      </div>
      {fact ? <p className="truncate t-sub text-text-3">{fact}</p> : null}
    </div>
  );
}

/** 목록 행 한 줄. href 가 없으면 링크 없는 사실 행(빈 상태 한 줄 등) */
export function HomeRow({
  href,
  label,
  sub,
  value,
  valueSub,
  ariaLabel,
  thumb,
  muted = false,
}: {
  href?: string;
  /** 빈 상태·실패 한 줄 — 목록의 항목처럼 굵게 보이지 않게 흐린 글자 */
  muted?: boolean;
  label: ReactNode;
  sub?: ReactNode;
  /** 오른쪽 숫자(t-num) — 링크 행이면 그 뒤에 `›`(SummaryRow 와 같다) */
  value?: ReactNode;
  /** 오른쪽 숫자 아래 작은 한 줄(등락 등) */
  valueSub?: ReactNode;
  ariaLabel?: string;
  /** 72px 정사각 썸네일 칸 — undefined 면 칸 없음, null 이면 회색 단면(같은 목록의 다른 행에 사진이 있을 때) */
  thumb?: ReactNode | null;
}) {
  const body = (
    <>
      {thumb !== undefined && (
        <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">{thumb}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={muted ? "truncate t-body text-text-3" : "truncate t-body font-bold text-ink"}>{label}</span>
        {sub ? <span className="truncate t-sub text-text-3">{sub}</span> : null}
      </span>
      {value != null ? (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="t-body t-num text-ink">{value}</span>
          {valueSub ? <span className="t-sub tabular-nums text-text-3">{valueSub}</span> : null}
        </span>
      ) : null}
      {href && (
        <span aria-hidden="true" className="shrink-0 t-body text-text-3">
          ›
        </span>
      )}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 py-3";
  return (
    <li>
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={`press ${cls} no-underline`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** "202607" → "7월" · 아니면 null */
function monthOf(ym: string | null | undefined): string | null {
  return ym && /^\d{6}$/.test(ym) ? `${Number(ym.slice(4, 6))}월` : null;
}

/**
 * 지역 동향 한 행 — 옛 RegionPulseCards 카드(2열 · 스파크라인 · 카운트업)를 행으로.
 *  왼쪽: 지역 이름 / "서울 · 8월 평균 매매가 · 거래 1,204건(7월)"   오른쪽: 가격 / 등락(▲ 빨강 · ▼ 파랑)
 *  · 무엇의 평균인지(부동산원 평균 매매가 / 국토부 실거래 평균) · 건수의 제 달 · 등락의 달이 가격의 달과 다르면 그 달 —
 *    [1009 · H] 표기 표준을 그대로 지킨다. 등락의 기준(지수/평당가)은 행의 접근성 문장과 페이지 끝 데이터 출처가 말한다.
 *  · 변동을 모르면 오른쪽 아래 줄을 비운다("변동 미상" 글자를 행마다 깔지 않는다 — 문장은 비교를 쓰지 않는다).
 */
export function RegionRow({ card, mine = false }: { card: HomeRegionCard; mine?: boolean }) {
  const avgLabel = card.stale ? "실거래 평균" : "평균 매매가";
  const tradesMonth = monthOf(card.tradesYm);
  const trades =
    typeof card.trades === "number" && card.trades > 0
      ? `거래 ${card.trades.toLocaleString("ko-KR")}건${tradesMonth && tradesMonth !== card.periodLabel ? `(${tradesMonth})` : ""}`
      : null;
  const sub = [
    mine ? "내 관심지역" : card.city ?? null,
    `${card.periodLabel ? `${card.periodLabel} ` : ""}${avgLabel}`,
    trades,
  ]
    .filter(Boolean)
    .join(" · ");
  const pct = typeof card.changePct === "number" ? card.changePct : null;
  const changeMonth = monthOf(card.changeYm);
  const at = changeMonth && changeMonth !== card.periodLabel ? `${changeMonth} ` : "";
  const kpi = kpiRegionOf(card);
  const trade = todayTradeSentence(kpi);
  return (
    <HomeRow
      href={card.href}
      ariaLabel={`${mine ? "내 관심지역 " : ""}${todayRegionSentence(kpi)}${trade ? ` ${trade}` : ""} 지도에서 보기`}
      label={card.name}
      sub={sub}
      value={card.price}
      valueSub={
        pct !== null ? (
          <>
            {at}
            <Delta pct={pct} />
          </>
        ) : null
      }
    />
  );
}
