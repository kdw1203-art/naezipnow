/**
 * [1082] 동네 홈(/town/<id>) 검색 설명문 — 130쪽이 전부 같은 틀("○○구 이웃 글과 공개 임장노트, 아파트 시장 요약. 키워드 알림 지원." 40자)이었다
 * (운영 실측 2026-10-21 · sitemap-pages 216쪽 전수). 부동산원 스냅샷 값이 있으면 그 지역의 수(평균 매매가·기준월·전세가율)를 앞에 적어
 * 지역마다 다른 문장이 되게 하고, 값이 없으면(서울 구 일부) 화면에 실제로 있는 것만 적는다. "시세" 낱말은 쓰지 않는다(실거래·공표 통계만).
 */
import { formatKrwShort } from "@/lib/market/format";

export type TownSnapshotFacts = { period?: string | null; avgSale?: number | null; jeonseRatio?: number | null } | null | undefined;

function ymKo(period: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})$/.exec(String(period ?? "").trim());
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}년 ${month}월` : null;
}

export function townMetaDescription(name: string, snap: TownSnapshotFacts): string {
  const facts: string[] = [];
  if (snap && typeof snap.avgSale === "number" && Number.isFinite(snap.avgSale) && snap.avgSale > 0) {
    const when = ymKo(snap.period);
    facts.push(`아파트 평균 매매가 ${formatKrwShort(snap.avgSale)}${when ? `(${when} · 한국부동산원)` : "(한국부동산원)"}`);
  }
  if (snap && typeof snap.jeonseRatio === "number" && Number.isFinite(snap.jeonseRatio) && snap.jeonseRatio > 0) {
    facts.push(`전세가율 ${snap.jeonseRatio.toFixed(1)}%`);
  }
  /* 꼬리는 화면에 실제로 있는 것만 — 이웃 글 · 공개 임장노트 · 평균 매매가·전세가율·거래 타일 · 16주 매매지수 · 인근 지역 비교 · 키워드 알림
     (입주·정비사업·청약은 이 화면에 없다 — 적지 않는다) */
  if (facts.length > 0) {
    return `${name} 동네 홈 — ${facts.join(" · ")}. 이웃이 쓴 동네 글 · 공개 임장노트 · 거래 건수 · 16주 매매지수 · 인근 지역 평균 매매가 비교 · 키워드 알림.`;
  }
  return `${name} 동네 홈 — 이웃이 쓴 동네 글 · 공개 임장노트 · 아파트 평균 매매가·전세가율·거래(한국부동산원 공표 통계) · 16주 매매지수 · 인근 지역 비교 · 키워드 알림.`;
}
