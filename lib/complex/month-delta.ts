/**
 * [1009 · C 리뷰] 월별 실거래 표의 등락 — **무엇과** 비교했는지(순수 함수, 클라이언트 안전).
 *
 * 왜(리뷰 RA 실측, 운영 DB 읽기 전용): 허브 실거래 탭 표(toHubTrades·viewTrades)와 지도 단지 패널 표는 등락을
 * "바로 앞 **줄**"과 비교한다 — 줄은 거래가 있던 달만이라, 가운데 달이 비면 두세 달 전과 비교한 값이 "전월 대비"
 * 머리 아래 적혔다. 3개 구 다월 단지 381곳 중 201곳(53%)에 빈 달이 있었다. 그리고 변동 0 이 "—"(모름과 같은 표시)였다.
 * 그래서 앞 줄의 달이 정확히 전달일 때만 "전월 대비", 아니면 기준 달을 적는다("26.02 대비"). 모르면 "—", 0 은 "보합".
 * 기존 표 함수(hub-trades toHubTrades·viewTrades)의 출력은 테스트가 잠가 두었으므로 건드리지 않고, 같은 짝으로 기준 달만 다시 센다.
 */
import { deltaDir, deltaText, type DeltaDir } from "@/lib/format/delta";

export interface MonthDeltaBasis {
  /** 변동률(%) — 앞 줄이 없거나 값이 0 이하면 null */
  pct: number | null;
  /** 비교한 앞 줄의 달(YYYYMM) — 없으면 null */
  baseYm: string | null;
}

export interface MonthDeltaView {
  /** "▲ 3.2%" · "보합" · 비교할 앞 달이 없으면 "—" */
  text: string;
  dir: DeltaDir | null;
  /** "전월 대비" · "26.02 대비" · 비교 없음이면 null */
  basis: string | null;
  /** 앞 줄이 정확히 전달인가(아니면 화면에 기준 달을 보인다) */
  adjacent: boolean;
}

/** YYYYMM 의 전달 */
export function prevYm(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  return m <= 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, "0")}`;
}

/** "26.02" */
export function ymShort(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 달력 범위 — "26.01~26.08" · 같은 달이면 "26.08" */
export function ymRangeShort(firstYm: string, lastYm: string): string {
  return firstYm === lastYm ? ymShort(lastYm) : `${ymShort(firstYm)}~${ymShort(lastYm)}`;
}

export function monthDeltaView(ym: string, b: MonthDeltaBasis | null | undefined): MonthDeltaView {
  const dir = b ? deltaDir(b.pct) : null;
  if (!b || !b.baseYm || dir === null) return { text: "—", dir: null, basis: null, adjacent: false };
  const adjacent = b.baseYm === prevYm(ym);
  return {
    text: deltaText(b.pct),
    dir,
    basis: adjacent ? "전월 대비" : `${ymShort(b.baseYm)} 대비`,
    adjacent,
  };
}

/**
 * 최신순 줄(거래 있는 달만) → 달마다 앞 줄(바로 더 이른 줄)과의 비교. 지도 단지 패널 표처럼 줄 배열을 직접 그리는 곳용.
 * rows 는 최신 → 과거 순서여야 한다.
 */
export function monthDeltasLatestFirst(
  rows: readonly { ym: string; avg: number }[],
): Map<string, MonthDeltaBasis> {
  const out = new Map<string, MonthDeltaBasis>();
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i + 1];
    const cur = rows[i];
    out.set(cur.ym, {
      pct: prev && prev.avg > 0 && Number.isFinite(cur.avg) ? Math.round(((cur.avg - prev.avg) / prev.avg) * 1000) / 10 : null,
      baseYm: prev ? prev.ym : null,
    });
  }
  return out;
}
