/* [1107] 단지 화면 요약 탭 — 숫자 칸(라벨 · 값 · 한 줄).
 *
 * 왜: 소유자 2026-11-05 "글씨크기 글자수 디자인 표 등 … 통합 간결화"(단지 화면 캡처). 요약 카드가 사실 열 조각을 " · " 로 이은
 * 세 줄 문단이었다("최근 실거래가 5억 7,667만원 · 전용 37㎡ 최근 6건 평균 · 2023.11~12 거래 6건 평균 대비 ▲… · 1993년 준공 ·
 * 1,710세대 · 최근 12개월 매매 186건, 60㎡ 미만 중앙 5억 · 전세 중앙 2.5억 · 전세가율 43.2%(6개월) · …"). 그 가운데
 * 준공 · 세대는 머리 개요 칸이, 전세가율은 바로 위 전세가율 카드(데스크톱은 레일도)가 이미 말한다 — 같은 사실 두 곳.
 * → 이 화면에만 있는 숫자 네 칸(대표가 · 비교 · 12개월 매매 · 전세 중앙)으로. 계산은 하지 않는다 — 이미 있는 값의 얼굴만.
 * 순수 모듈(서버 전용 import 없음) — 단위 시험 대상. */
import type { HubHeadline } from "@/lib/complex/hub-price";
import { baseShortLabel } from "@/lib/complex/hub-price";
import { changeLabel } from "@/lib/format/delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { formatKrwWon } from "@/lib/format/krw";
import { areaBandDisplayLabel } from "@/lib/complex/area-band-label";
import { MIN_SAMPLES, type RentSummary, type TradeSummary } from "@/lib/complex/complex-facts";

export type SummaryTile = {
  key: "price" | "change" | "trades" | "jeonse";
  label: string;
  value: string;
  sub: string | null;
  /** 등락 색(상승 빨강 · 하락 파랑) — 비교 칸만 */
  tone?: "up" | "down" | null;
  /** 칸에 마우스를 올리면 보이는 전문(줄임 없이) */
  title?: string;
};

const eok = (krw: number) => formatKrwWon(krw, { style: "eok1" });

export function buildSummaryTiles(input: {
  headline: HubHeadline | null;
  tradeSummary: TradeSummary | null;
  rentSummary: RentSummary | null;
}): SummaryTile[] {
  const out: SummaryTile[] = [];
  const h = input.headline;
  if (h?.kind === "rep") {
    out.push({
      key: "price",
      label: "최근 실거래가",
      value: formatEokMan(h.priceManwon),
      sub: `${h.basis === "band" ? (h.bandLabel ?? "면적대") : `전용 ${h.unitM2}㎡`} · 최근 ${h.sampleSize}건 평균`,
    });
    if (h.base) {
      const label = changeLabel({ curr: h.priceManwon, base: h.base.avgManwon, since: "", unit: "manwon" });
      if (label) {
        /* changeLabel 꼴 "▲2억 3,634만원(69.4%)" · "보합" — 값 칸은 금액, 비율은 아래 줄로(폰 두 칸 폭에서 한 줄) */
        const m = /^([▲▼])(.+?)원?\(([^)]+)\)$/.exec(label);
        out.push({
          key: "change",
          label: `${baseShortLabel(h.base)} 대비`,
          value: m ? `${m[1]}${m[2]}` : label,
          /* 폰 두 칸 폭에서 한 줄 — 비교 기준(그때 평균 금액)은 칸 제목(title)으로 */
          sub: `${m ? `${m[3]} · ` : ""}${h.base.count}건 평균 비교`,
          title: `${baseShortLabel(h.base)} ${h.base.count}건 평균 ${formatEokMan(h.base.avgManwon)}`,
          tone: label.startsWith("▲") ? "up" : label.startsWith("▼") ? "down" : null,
        });
      }
    }
  } else if (h?.kind === "single") {
    out.push({ key: "price", label: "최근 실거래", value: formatEokMan(h.priceManwon), sub: "한 건" });
  }

  const ts = input.tradeSummary;
  if (ts && ts.count > 0) {
    out.push({
      key: "trades",
      label: `최근 ${ts.windowMonths}개월 매매`,
      value: `${ts.count.toLocaleString("ko-KR")}건`,
      sub: ts.band
        ? `${areaBandDisplayLabel(ts.band.label)} 중앙 ${eok(ts.band.medianKrw)}`
        : ts.medianKrw != null
          ? `중앙 ${eok(ts.medianKrw)}`
          : null,
    });
  }

  const rs = input.rentSummary;
  if (rs && rs.jeonseCount >= MIN_SAMPLES && rs.jeonseMedianKrw != null) {
    out.push({
      key: "jeonse",
      label: "전세 중앙",
      value: eok(rs.jeonseMedianKrw),
      sub: `최근 ${rs.windowMonths}개월 ${rs.jeonseCount.toLocaleString("ko-KR")}건`,
    });
  } else if (rs && rs.jeonseCount > 0) {
    out.push({ key: "jeonse", label: "전세", value: `${rs.jeonseCount}건`, sub: "표본 적음 · 중앙값 없음" });
  }
  return out;
}
