/**
 * [1081 · #16] 가이드 글 끝의 "관련 용어·도구·지역" — 분류(category)별 고정 묶음.
 *
 * 왜: 가이드(15)·계산기·리포트의 나가는 내부 링크가 2~5개뿐이었다(운영 실측). 글을 읽고 바로 갈 수 있는 용어 설명·도구·지역
 * 허브를 글 끝에 둔다 — 사용자 경로이자 크롤 경로. 용어는 lib/seo/glossary-terms 에 **있는 슬러그만**(없는 주소를 만들지 않는다).
 * 지역은 거래가 많은 허브 6곳(카탈로그 id 고정) — 지역 상세(872쪽)로 가는 길.
 */
import type { Guide } from "@/lib/guides/catalog";
import { findGlossaryTerm } from "@/lib/seo/glossary-terms";

export type RelatedLink = { label: string; href: string };

const GLOSSARY_BY_CATEGORY: Record<Guide["category"], string[]> = {
  임장: ["imjang", "jeonyongmyeonjeok", "gonggeupmyeonjeok", "silgeoraega", "hoga"],
  "실거래 읽기": ["silgeoraega", "hoga", "haejegeorae", "pyeongdanga", "maemae-gagyeok-jisu", "geoRae-ryang"],
  전세: ["jeonse", "jeonse-garyul", "jeonwolse-jeonhwanyul", "hwakjeong-ilja", "jeonsegwon", "daehangryeok"],
  "청약·분양": ["cheongyak", "cheongyak-gajeom", "teukbyeol-gonggeup", "bunyanggwon", "mibunyang", "ipju-mulryang"],
  "경매·공매": ["gyeongmae", "gongmae", "gwolli-bunseok", "deunggibu-deungbon", "geunjeodang", "usun-byeonjegwon"],
};

const TOOLS_BY_CATEGORY: Record<Guide["category"], RelatedLink[]> = {
  임장: [
    { label: "지역 임장 가이드", href: "/imjang" },
    { label: "임장노트 쓰기", href: "/notes/new" },
    { label: "공개 임장노트", href: "/notes" },
  ],
  "실거래 읽기": [
    { label: "면적대·가격대 실거래", href: "/tx" },
    { label: "월간 실거래 리포트", href: "/reports" },
    { label: "실거래가 지도", href: "/map" },
  ],
  전세: [
    { label: "전월세 전환 계산기", href: "/calculator/jeonse-monthly" },
    { label: "갭·전세가율 계산기", href: "/calculator/gap" },
    { label: "원룸·오피스텔 전월세", href: "/rent" },
  ],
  "청약·분양": [
    { label: "청약 센터", href: "/apply" },
    { label: "청약 캘린더", href: "/apply/calendar" },
    { label: "입주 예정 물량", href: "/supply" },
  ],
  "경매·공매": [
    { label: "공매 물건", href: "/auctions" },
    { label: "대출 계산기", href: "/calculator" },
    { label: "계약 전 체크리스트", href: "/guides/contract" },
  ],
};

/** 지역 허브 6곳 — 거래 많은 순(서울 3 · 수도권 3). id 는 lib/region/catalog 고정값 */
export const RELATED_REGION_HUBS: RelatedLink[] = [
  { label: "강남구", href: "/region/gangnam" },
  { label: "송파구", href: "/region/songpa" },
  { label: "마포구", href: "/region/mapo" },
  { label: "성남 분당구", href: "/region/seongnam-bundang" },
  { label: "수원 영통구", href: "/region/suwon-yeongtong" },
  { label: "고양 덕양구", href: "/region/goyang-deogyang" },
];

export function guideRelatedLinks(category: Guide["category"]): { terms: RelatedLink[]; tools: RelatedLink[]; regions: RelatedLink[] } {
  const terms = (GLOSSARY_BY_CATEGORY[category] ?? [])
    .map((slug) => {
      const t = findGlossaryTerm(slug);
      return t ? { label: t.term, href: `/glossary/${t.slug}` } : null;
    })
    .filter((x): x is RelatedLink => x !== null);
  return { terms, tools: TOOLS_BY_CATEGORY[category] ?? [], regions: RELATED_REGION_HUBS };
}
