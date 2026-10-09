import "server-only";
import { logger } from "@/lib/log";

/**
 * 한국은행 ECOS(경제통계시스템) Open API 클라이언트.
 * 명세: 100대 통계지표(KeyStatisticList) — 기준금리·환율·경제성장률 등.
 *  GET https://ecos.bok.or.kr/api/KeyStatisticList/{authkey}/json/kr/1/100
 *
 * ECOS_API_KEY 미설정 시 null 반환(정상 폴백). 컨테이너/CI에는 egress 없어 실패도 graceful.
 */

export function isEcosConfigured(): boolean {
  return Boolean(process.env.ECOS_API_KEY?.trim());
}

export type EcosKeyStat = {
  className: string;
  name: string;
  value: string;
  cycle: string;
  unit: string;
};

/** 100대 통계지표 조회 — 실패·미설정 시 null */
export async function fetchKeyStatistics(): Promise<EcosKeyStat[] | null> {
  const key = process.env.ECOS_API_KEY?.trim();
  if (!key) return null;
  try {
    const url = `https://ecos.bok.or.kr/api/KeyStatisticList/${encodeURIComponent(
      key,
    )}/json/kr/1/100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.error("[ecos] request failed", res.status);
      return null;
    }
    const data = (await res.json()) as {
      KeyStatisticList?: { row?: Array<Record<string, string>> };
      RESULT?: { CODE?: string; MESSAGE?: string };
    };
    const rows = data.KeyStatisticList?.row;
    if (!Array.isArray(rows)) {
      // 인증키 오류 등은 RESULT 로 내려옴
      if (data.RESULT?.CODE) logger.error("[ecos]", data.RESULT.MESSAGE);
      return null;
    }
    return rows.map((r) => ({
      className: String(r.CLASS_NAME ?? ""),
      name: String(r.KEYSTAT_NAME ?? ""),
      value: String(r.DATA_VALUE ?? ""),
      cycle: String(r.CYCLE ?? ""),
      unit: String(r.UNIT_NAME ?? ""),
    }));
  } catch (e) {
    logger.error("[ecos] error", e);
    return null;
  }
}

/* ── [1048] 소비자동향조사 — 주택가격전망 CSI · 금리수준전망 CSI ─────────────────────────
   다요인 분석(lib/signals)의 심리 · 금리 요인. 100대 지표에는 소비자심리지수(종합)만 있고 주택 쪽 CSI 가 없다.
   통계표 511Y002(소비자동향조사, 전국, 월) · 항목 FMFB(주택가격전망CSI) · FMBG(금리수준전망CSI)
   · 분류 99988(전체) · F0001(서울) · F0002(6대광역시) · F0003(기타도시). 실측(2026-10-09, 공개 sample 키):
   2026.09 주택가격전망CSI 전체 125. */

export type EcosPoint = { ym: string; value: number };

export const ECOS_CSI_SERIES = [
  { key: "housing:전체", item: "FMFB", group: "99988" },
  { key: "housing:서울", item: "FMFB", group: "F0001" },
  { key: "housing:6대광역시", item: "FMFB", group: "F0002" },
  { key: "housing:기타도시", item: "FMFB", group: "F0003" },
  { key: "rate:전체", item: "FMBG", group: "99988" },
] as const;

function ymMinus(ym: string, months: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 - months;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 월간 통계 한 줄(StatisticSearch) — 실패·미설정 시 null */
export async function fetchEcosMonthly(
  statCode: string,
  item1: string,
  item2: string,
  months = 13,
  now: Date = new Date(),
): Promise<EcosPoint[] | null> {
  const key = process.env.ECOS_API_KEY?.trim();
  if (!key) return null;
  const end = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const start = ymMinus(end, months);
  try {
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/${months + 2}/${statCode}/M/${start}/${end}/${item1}/${item2}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.error("[ecos] series request failed", res.status);
      return null;
    }
    const data = (await res.json()) as {
      StatisticSearch?: { row?: Array<Record<string, string>> };
      RESULT?: { CODE?: string; MESSAGE?: string };
    };
    const rows = data.StatisticSearch?.row;
    if (!Array.isArray(rows)) {
      if (data.RESULT?.CODE) logger.warn("[ecos] series", item1, item2, data.RESULT.MESSAGE);
      return null;
    }
    return rows
      .map((r) => ({ ym: String(r.TIME ?? ""), value: Number(r.DATA_VALUE) }))
      .filter((p) => /^\d{6}$/.test(p.ym) && Number.isFinite(p.value))
      .sort((a, b) => a.ym.localeCompare(b.ym));
  } catch (e) {
    logger.error("[ecos] series error", e);
    return null;
  }
}

/** 주택가격전망 CSI(전체·서울·6대광역시·기타도시) + 금리수준전망 CSI — 하나라도 받으면 객체, 전부 실패면 null */
export async function fetchHousingCsi(now: Date = new Date()): Promise<Record<string, EcosPoint[]> | null> {
  const out: Record<string, EcosPoint[]> = {};
  for (const s of ECOS_CSI_SERIES) {
    const pts = await fetchEcosMonthly("511Y002", s.item, s.group, 13, now);
    if (pts && pts.length > 0) out[s.key] = pts;
  }
  return Object.keys(out).length > 0 ? out : null;
}
