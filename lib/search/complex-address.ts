/**
 * [1026d · 검색] 단지 검색 결과의 음영 주소 줄 · 자세한 사실 줄 — 드롭다운(동적 청크)·/search·지도·단지 선택기가 같이 쓴다.
 * complex-preview.ts(헤더 첫 묶음에 실림)와 나눠 둔다 — 첫 묶음을 늘리지 않게.
 */
import { complexFacts, type ComplexPreview } from "@/lib/search/complex-preview";

/* ── [1026d] 음영 주소 줄 ─────────────────────────────────────────────────
   소유자(2026-09-30) "상세주소나 위치 등이 음영으로 표시되게". 도로명이 있으면 도로명 + (동 번지),
   없으면 시군구 + 동 번지. 모르는 값은 빼고 그린다 — 지어내지 않는다. */
const SIDO_SHORT: Array<[RegExp, string]> = [
  [/^서울특별시\s/, "서울 "],
  [/^부산광역시\s/, "부산 "],
  [/^대구광역시\s/, "대구 "],
  [/^인천광역시\s/, "인천 "],
  [/^광주광역시\s/, "광주 "],
  [/^대전광역시\s/, "대전 "],
  [/^울산광역시\s/, "울산 "],
  [/^세종특별자치시\s/, "세종 "],
  [/^경기도\s/, "경기 "],
  [/^강원(?:특별자치)?도\s/, "강원 "],
  [/^충청북도\s/, "충북 "],
  [/^충청남도\s/, "충남 "],
  [/^전(?:라|북특별자치)?북도\s|^전북특별자치도\s/, "전북 "],
  [/^전라남도\s/, "전남 "],
  [/^경상북도\s/, "경북 "],
  [/^경상남도\s/, "경남 "],
  [/^제주특별자치도\s/, "제주 "],
];

/** 지번 주소의 "동 번지" 부분("가락동 913") — 읍면동 앞의 시군구는 떼고, 자리표시("가-")는 버린다 */
export function jibunTail(address: string | null | undefined): string {
  const toks = (address ?? "").trim().split(/\s+/).filter(Boolean);
  const i = toks.findIndex((t) => /^[가-힣][가-힣0-9]*[동읍면가리]$/.test(t));
  /* "가-" 같은 자리표시(숫자 없는 번지)는 버린다 */
  const tail = (i >= 0 ? toks.slice(i) : []).filter((t) => !(t.includes("-") && !/\d/.test(t)));
  return tail.join(" ");
}

/** "서울 송파구 송파대로 345 (가락동 913)" · "오산시 오산동 861-4" — 없으면 "" */
export function complexAddressLine(p: Pick<ComplexPreview, "region" | "address" | "roadAddress">): string {
  const road = (p.roadAddress ?? "").trim();
  const tail = jibunTail(p.address);
  if (road) {
    let r = road;
    for (const [re, to] of SIDO_SHORT) r = r.replace(re, to);
    return tail ? `${r} (${tail})` : r;
  }
  if (!tail) return "";
  return `${(p.region ?? "").trim()} ${tail}`.trim();
}

/** ["2018년 준공", "9,510세대", "6개월 거래 115건"] — 있는 값만 */
export function complexDetailFacts(p: ComplexPreview): string[] {
  return [p.buildYear ? `${p.buildYear}년 준공` : "", ...complexFacts(p)].filter(Boolean);
}
