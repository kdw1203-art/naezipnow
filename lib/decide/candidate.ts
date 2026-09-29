/**
 * [1025 · 결정·비서] /api/complex/[id]/detail 응답 → 결정 카드 후보 모델(순수 · 클라이언트 안전).
 *
 * 쓰는 칸만 읽는다: complex(이름·시군구·세대수·좌표) · facts.tradeSummary(12개월 건수·중앙값·최근 계약월) ·
 * facts.jeonseRatio(전세가율·전세 중앙·매매 중앙) · areaBands(면적대별 최근 한 건). 없는 칸은 null — 화면은 "—".
 * 관리비는 이 응답에 없다(단지 상세만 읽는다) → 항상 null.
 */
import type { DecideCandidateMetrics } from "./score";

export interface DecideCandidate extends DecideCandidateMetrics {
  /** "안양 동안구 · 1,710세대" 의 재료 */
  city: string | null;
  district: string | null;
  households: number | null;
  lat: number | null;
  lng: number | null;
  /** 면적대 중 가장 최근 계약 한 건(원) + 계약월 YYYYMM + 면적대 라벨 */
  latest: { krw: number; ym: string; band: string } | null;
  /** 12개월 매매 중앙값 창(YYYYMM~YYYYMM) */
  tradeWindow: { fromYm: string; toYm: string } | null;
  /** 매매 중앙 − 전세 중앙(원) — 전세가율이 계산된 창(6개월) 기준. 둘 중 하나라도 없으면 null */
  gapKrw: number | null;
  /** 조회 결과 — not_found 는 대표행 없음, failed 는 조회 실패(없음과 다르다) */
  status: "ok" | "not_found" | "failed";
  /** 학교 조회 상태 — 아직 안 물었으면 "pending" */
  school: "pending" | "none" | "unavailable" | "ok";
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** 조회 실패 자리표 — 화면이 "불러오지 못함" 으로 그린다 */
export function failedCandidate(id: string, name: string): DecideCandidate {
  return {
    id,
    name,
    city: null,
    district: null,
    households: null,
    lat: null,
    lng: null,
    priceKrw: null,
    jeonsePct: null,
    count12m: null,
    schoolM: null,
    latest: null,
    tradeWindow: null,
    gapKrw: null,
    status: "failed",
    school: "pending",
  };
}

/** detail 응답(JSON) → 후보. `fallbackName` 은 트레이·관심 목록의 이름(대표행이 없을 때) */
export function candidateFromDetail(id: string, fallbackName: string, json: unknown): DecideCandidate {
  const base = failedCandidate(id, fallbackName);
  if (!json || typeof json !== "object") return base;
  const o = json as Record<string, unknown>;
  const complex = (o.complex && typeof o.complex === "object" ? o.complex : null) as Record<string, unknown> | null;
  if (!complex) return { ...base, status: o.mode === "not_found" ? "not_found" : "failed" };
  const facts = (o.facts && typeof o.facts === "object" ? o.facts : null) as Record<string, unknown> | null;
  const trade = (facts?.tradeSummary && typeof facts.tradeSummary === "object" ? facts.tradeSummary : null) as
    | Record<string, unknown>
    | null;
  const ratio = (facts?.jeonseRatio && typeof facts.jeonseRatio === "object" ? facts.jeonseRatio : null) as
    | Record<string, unknown>
    | null;

  /* 면적대별 최근 한 건 중 계약월이 가장 늦은 것(같은 달이면 앞 면적대) */
  let latest: DecideCandidate["latest"] = null;
  if (Array.isArray(o.areaBands)) {
    for (const b of o.areaBands as unknown[]) {
      if (!b || typeof b !== "object") continue;
      const r = b as Record<string, unknown>;
      const man = num(r.latestManwon);
      const ym = str(r.latestYm);
      const band = str(r.label);
      if (man === null || man <= 0 || !ym || !band) continue;
      if (!latest || ym > latest.ym) latest = { krw: Math.round(man * 10_000), ym, band };
    }
  }

  const tradeMedian = num(trade?.medianKrw);
  const jeonseMedian = num(ratio?.jeonseMedianKrw);
  const ratioTradeMedian = num(ratio?.tradeMedianKrw);
  const gapKrw =
    jeonseMedian !== null && ratioTradeMedian !== null && jeonseMedian > 0 && ratioTradeMedian > 0
      ? ratioTradeMedian - jeonseMedian
      : null;
  const count = num(trade?.count);

  return {
    ...base,
    name: str(complex.name) ?? fallbackName,
    city: str(complex.city),
    district: str(complex.district),
    households: num(complex.households),
    lat: num(complex.lat),
    lng: num(complex.lng),
    priceKrw: tradeMedian !== null && tradeMedian > 0 ? tradeMedian : null,
    jeonsePct: num(ratio?.pct),
    count12m: count !== null && count >= 0 ? count : null,
    latest,
    tradeWindow:
      str(trade?.fromYm) && str(trade?.toYm) ? { fromYm: String(trade!.fromYm), toYm: String(trade!.toYm) } : null,
    gapKrw,
    status: "ok",
  };
}

/** "안양 동안구 · 1,710세대" — 있는 것만 잇는다. 아무것도 없으면 null */
export function candidateMetaLine(c: DecideCandidate): string | null {
  const parts: string[] = [];
  const region = [c.city, c.district].filter(Boolean).join(" ");
  if (region) parts.push(region);
  if (c.households && c.households > 0) parts.push(`${c.households.toLocaleString("ko-KR")}세대`);
  return parts.length ? parts.join(" · ") : null;
}

/** YYYYMM → "2026-08" */
export function ymDash(ym: string | null | undefined): string {
  return ym && /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}-${ym.slice(4)}` : "—";
}

/** 후보들의 가장 늦은 매매 창 끝(YYYYMM) — 머리 사실 줄 "실거래 YYYY-MM 기준". 없으면 null */
export function latestBasisYm(items: readonly DecideCandidate[]): string | null {
  let out: string | null = null;
  for (const c of items) {
    const ym = c.tradeWindow?.toYm ?? c.latest?.ym ?? null;
    if (ym && (!out || ym > out)) out = ym;
  }
  return out;
}
