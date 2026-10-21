/**
 * [1081 · #12] 용어 → 이 용어가 쓰이는 화면·도구·가이드(분류별 고정 묶음) + 검색 설명문.
 *
 * 왜: 용어 페이지 56쪽은 풀이 2~3문장(126단어) · 설명문 29자였다(운영 실측). 풀이는 사실만 적는 글이라 함부로 늘리지 않고,
 * "어디서 이 수치를 보는가"(실거래·지역·계산기·가이드)로 글의 쓸모와 내부 링크를 더한다. 설명문은 short + def 를 이어 155자.
 */
import type { GlossaryCategory } from "@/lib/seo/glossary-terms";

export type GlossaryLink = { label: string; href: string };

const BY_CATEGORY: Record<GlossaryCategory, GlossaryLink[]> = {
  "거래·시세": [
    { label: "면적대·가격대 실거래", href: "/tx" },
    { label: "실거래가 지도", href: "/map" },
    { label: "월간 실거래 리포트", href: "/reports" },
    { label: "가이드 — 실거래가 읽는 법", href: "/guides/real-price-reading" },
    { label: "가이드 — 지수 읽는 법", href: "/guides/index-reading" },
  ],
  "면적·구조": [
    { label: "단지별 실거래 현황", href: "/complex/browse" },
    { label: "면적대·가격대 실거래", href: "/tx" },
    { label: "가이드 — 아파트 임장 체크리스트", href: "/guides/imjang-checklist" },
  ],
  임대차: [
    { label: "전월세 전환 계산기", href: "/calculator/jeonse-monthly" },
    { label: "갭·전세가율 계산기", href: "/calculator/gap" },
    { label: "원룸·오피스텔 전월세", href: "/rent" },
    { label: "가이드 — 전세 안전 점검", href: "/guides/jeonse-safety" },
    { label: "가이드 — 전세가율이 높을 때", href: "/guides/jeonse-ratio" },
  ],
  "대출·상환": [
    { label: "대출 계산기", href: "/calculator" },
    { label: "살까, 빌릴까 계산기", href: "/calculator/rent-vs-buy" },
    { label: "가이드 — 계약 전 체크리스트", href: "/guides/contract" },
  ],
  "세금·공시": [
    { label: "살까, 빌릴까 계산기(취득세 포함)", href: "/calculator/rent-vs-buy" },
    { label: "임대수익률 계산기", href: "/calculator/rental-yield" },
    { label: "가이드 — 규제·제도", href: "/guides/regulations" },
  ],
  "청약·분양": [
    { label: "청약 센터", href: "/apply" },
    { label: "청약 캘린더", href: "/apply/calendar" },
    { label: "입주 예정 물량", href: "/supply" },
    { label: "가이드 — 청약 기본", href: "/guides/apply-basics" },
  ],
  정비사업: [
    { label: "서울 재개발·재건축 지도", href: "/redevelopment" },
    { label: "입주 예정 물량", href: "/supply" },
    { label: "가이드 — 입주 물량의 영향", href: "/guides/supply-impact" },
  ],
  "경매·공매": [
    { label: "공매 물건", href: "/auctions" },
    { label: "가이드 — 경매 기본", href: "/guides/auction-basics" },
    { label: "대출 계산기", href: "/calculator" },
  ],
  "권리·등기": [
    { label: "가이드 — 계약 전 체크리스트", href: "/guides/contract" },
    { label: "가이드 — 전세 안전 점검", href: "/guides/jeonse-safety" },
    { label: "공매 물건", href: "/auctions" },
  ],
  "내집나우 지표": [
    { label: "지역별 시장 온도", href: "/analysis/temperature" },
    { label: "데이터 방법론", href: "/methodology" },
    { label: "데이터 출처", href: "/data-sources" },
  ],
};

export function glossaryUsageLinks(category: GlossaryCategory): GlossaryLink[] {
  return BY_CATEGORY[category] ?? [];
}

/** 검색 설명문 — short 만으로는 29자. def 를 이어 155자 안에서 끊는다(문장 경계 우선) */
export function glossaryMetaDescription(short: string, def: string, max = 155): string {
  const s = short.trim();
  const d = def.trim();
  if (!d || d === s) return s;
  const joined = s.endsWith(".") ? `${s} ${d}` : `${s}. ${d}`;
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  const lastStop = cut.lastIndexOf(".");
  if (lastStop > s.length && joined[lastStop + 1] === " ") return cut.slice(0, lastStop + 1);
  return `${joined.slice(0, max - 1).trimEnd()}…`; // 말줄임표까지 max 안
}
