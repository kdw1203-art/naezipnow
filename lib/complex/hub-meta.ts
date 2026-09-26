/* ============================================================
   [1009 · C] 단지 허브 제목·설명·공유 카드(OG)의 가격 조각 — 순수 함수.

   왜: 첫 화면은 대표 실거래가(hubHeadline — 가장 많이 거래된 평형의 최근 6건 평균, AI 분석과 같은 규칙)를
   말하는데, 제목·설명·공유 카드는 "그 달 평형 혼합 평균 · 혼합 평균끼리의 전월비"를 말했다. 실측(운영 DB 읽기
   전용, 2026-09-22) 헬리오시티 공유 카드 "30.9억 ▲ 15.8% 전월비"(8월 4건 = 84·110㎡, 7월 11건 = 39·59㎡ 포함)
   → 들어오면 첫 화면 "29억 6,750만원 ▼0.8%". 등락 방향까지 반대였다. 같은 대표가·같은 비교 기준으로 맞춘다.

   표기: 평균은 짧은 표기("29.7억" — 표기 표준: 평균·요약은 eok1, "평균"을 적는다), 한 건은 정밀 표기
   ("6억 1,000만"). 비교는 대표가 표본과 겹치지 않는 같은 평형의 기간 첫 거래들(hubHeadline.base) — 없으면 쓰지 않는다.
   ============================================================ */
import { deltaDir, deltaText, pctChange } from "@/lib/format/delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { formatManwon } from "@/lib/complex/hub-trades";
import { ymShortLabel } from "@/lib/complex/dong";
import { baseShortLabel, baseSince, dealDateLabel, ymDot, type HubHeadline } from "@/lib/complex/hub-price";

export interface HubMetaPrice {
  /** 제목·설명 가격 — 평균 "29.7억" · 한 건 "6억 1,000만" */
  price: string;
  /** 공유 카드(72px 큰 숫자) 가격 — 언제나 짧은 표기 "6.1억"(정밀 표기는 카드에서 "만"이 다음 줄로 떨어졌다 — 실측) */
  ogPrice: string;
  /** "▼ 0.8%" — 비교 기준이 없거나 보합이면 "" */
  deltaPct: string;
  /** 공유 카드 등락 줄 — "▼ 0.8% · 26.01~04 대비"(없으면 "") */
  ogDelta: string;
  /** 제목 괄호 — "84㎡ 26.7~8월 6건 평균" · "84㎡ 26.4월 한 건" */
  titleNote: string;
  /** 설명 괄호 — "전용 84㎡ 2026.07~08 계약 6건 평균, 2026.01~04 거래 6건 평균보다 ▼ 0.8%" */
  descNote: string;
}

/** [1009 · C 리뷰] 표본 기간 짧은 꼴 — "26.8월" · "26.7~8월" · "25.12~26.2월". 예전엔 마지막 달만("26.8월") 적어
 *  7~8월 6건 평균이 "8월 평균"처럼 읽혔다. */
export function ymSpanShort(firstYm: string, latestYm: string): string {
  const last = ymShortLabel(latestYm) ?? "";
  if (!firstYm || firstYm === latestYm) return last;
  const fm = Number(firstYm.slice(4, 6));
  const lm = Number(latestYm.slice(4, 6));
  return firstYm.slice(0, 4) === latestYm.slice(0, 4)
    ? `${latestYm.slice(2, 4)}.${fm}~${lm}월`
    : `${firstYm.slice(2, 4)}.${fm}~${latestYm.slice(2, 4)}.${lm}월`;
}

/** "2026.07~08" · "2025.12~2026.02" · 같은 달 "2026.08" */
export function ymSpanDot(firstYm: string, latestYm: string): string {
  if (!firstYm || firstYm === latestYm) return ymDot(latestYm);
  return firstYm.slice(0, 4) === latestYm.slice(0, 4)
    ? `${ymDot(firstYm)}~${latestYm.slice(4, 6)}`
    : `${ymDot(firstYm)}~${ymDot(latestYm)}`;
}

export function hubMetaPrice(head: HubHeadline): HubMetaPrice {
  const area =
    head.basis === "band" ? head.bandLabel : head.unitM2 != null ? `${head.unitM2}㎡` : null;
  const monthLabel = ymShortLabel(head.latestYm);
  if (head.kind === "single") {
    return {
      price: formatEokMan(head.priceManwon),
      ogPrice: formatManwon(head.priceManwon),
      deltaPct: "",
      ogDelta: "",
      titleNote: [area, monthLabel ? `${monthLabel} 한 건` : "한 건"].filter(Boolean).join(" "),
      descNote: `${area ? `전용 ${area} ` : ""}${ymDot(head.latestYm)} 거래 한 건`,
    };
  }
  const pct = head.base ? pctChange(head.priceManwon, head.base.avgManwon) : null;
  const dir = deltaDir(pct);
  const deltaPct = head.base && pct !== null && dir !== null && dir !== "flat" ? deltaText(pct) : "";
  return {
    price: formatManwon(head.priceManwon),
    ogPrice: formatManwon(head.priceManwon),
    deltaPct,
    ogDelta: deltaPct && head.base ? `${deltaPct} · ${baseShortLabel(head.base)} 대비` : "",
    titleNote: [area, ymSpanShort(head.firstYm, head.latestYm), `${head.sampleSize}건 평균`].filter(Boolean).join(" "),
    descNote: [
      `${area ? `전용 ${area} ` : ""}${ymSpanDot(head.firstYm, head.latestYm)} 계약 ${head.sampleSize}건 평균`,
      deltaPct && head.base ? `${baseSince(head.base)} ${deltaPct}` : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/**
 * [1009 · C 리뷰] 단지 허브 FAQ(+FAQPage JSON-LD) "최근 실거래가" 답 — 첫 화면 대표가와 같은 숫자·같은 기준.
 * 예전 답은 "최근 월 실거래 평균은 30.9억입니다 (▲ 15.8% 전월비)" — 면적 혼합 월평균과 그 전월비라, 첫 화면·제목·공유 카드
 * ("29.7억 ▼0.8%")와 다른 말을 했다(리뷰 실측, 헬리오시티). 등락은 싣지 않는다(검색 결과에 오래 남는 문장이다).
 */
export function hubFaqPriceAnswer(name: string, head: HubHeadline): string {
  const tail = "매물 호가가 아닌 국토교통부에 신고된 실거래 기준이며, 면적대별 실거래가는 위 면적대별 표를 참고하세요.";
  if (head.kind === "single") {
    const d = head.deal;
    const when = d ? dealDateLabel(d.ym, d.day) : ymDot(head.latestYm);
    const area = head.unitM2 != null ? `전용 ${head.unitM2}㎡ ` : "";
    return `${name}의 최근 실거래는 ${when} 계약 ${area}${formatEokMan(head.priceManwon, { unit: "만원" })} 한 건입니다. 같은 평형·면적대 거래가 3건이 안 돼 평균을 내지 않았습니다. ${tail}`;
  }
  const what = head.basis === "band" ? `${head.bandLabel} 면적대` : `전용 ${head.unitM2}㎡`;
  return `${name}의 최근 실거래가는 ${what} ${ymSpanDot(head.firstYm, head.latestYm)} 계약 ${head.sampleSize}건 평균 ${formatEokMan(head.priceManwon, { unit: "만원" })}입니다(최근 거래가 가장 많은 ${head.basis === "band" ? "면적대" : "평형"}). ${tail}`;
}
