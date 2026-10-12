/* [1061] 검색엔진 리포트 손 기록 — 네이버 서치어드바이저는 API 가 없어 화면 숫자를 사람이 옮겨 적는다.
 * 순수 규칙(시험 대상): 입력 다듬기·검증·저장 키. 저장 자리는 lib/admin/search-reports(kv 표). */

export const SEARCH_REPORT_ENGINES = ["naver", "google", "bing", "daum"] as const;
export type SearchReportEngine = (typeof SEARCH_REPORT_ENGINES)[number];

export const SEARCH_REPORT_ENGINE_LABEL: Record<SearchReportEngine, string> = {
  naver: "네이버 서치어드바이저",
  google: "구글 서치콘솔",
  bing: "빙 웹마스터",
  daum: "다음 검색등록",
};

export type SearchReport = {
  engine: SearchReportEngine;
  /** 기록 기준일(YYYY-MM-DD, 한국 날짜) — 리포트 화면의 "최근 업데이트" 날짜 */
  date: string;
  /** 리포트 기간(일) — 서치어드바이저 기본 30 */
  periodDays: number;
  clicks: number | null;
  impressions: number | null;
  indexedPages: number | null;
  note: string;
  savedAt: string;
  savedBy: string;
};

export const SEARCH_REPORT_KEY_PREFIX = "search-report:";
export const SEARCH_REPORT_NOTE_MAX = 200;

export function searchReportKey(engine: SearchReportEngine, date: string): string {
  return `${SEARCH_REPORT_KEY_PREFIX}${engine}:${date}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalCount(v: unknown, label: string, errors: string[]): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
    errors.push(`${label}은 0 이상의 수`);
    return null;
  }
  return Math.round(n);
}

/**
 * 폼·API 입력 → 저장 모양. 날짜·엔진은 필수, 숫자는 비워도 된다(모르는 칸은 비워 둔다 — 0 으로 꾸미지 않는다).
 * 하나도 안 적은 기록(클릭·노출·색인 전부 비고 메모도 없음)은 거절.
 */
export function normalizeSearchReport(
  input: Record<string, unknown>,
  savedBy: string,
  nowIso: string,
): { ok: true; report: SearchReport } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const engine = String(input.engine ?? "").trim() as SearchReportEngine;
  if (!SEARCH_REPORT_ENGINES.includes(engine)) errors.push("엔진은 naver·google·bing·daum 중 하나");
  const date = String(input.date ?? "").trim();
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.push("기준일은 YYYY-MM-DD");
  const periodRaw = input.periodDays === undefined || input.periodDays === "" ? 30 : Number(input.periodDays);
  const periodDays = Number.isFinite(periodRaw) && periodRaw >= 1 && periodRaw <= 365 ? Math.round(periodRaw) : NaN;
  if (Number.isNaN(periodDays)) errors.push("기간은 1~365일");
  const clicks = optionalCount(input.clicks, "클릭", errors);
  const impressions = optionalCount(input.impressions, "노출", errors);
  const indexedPages = optionalCount(input.indexedPages, "색인 페이지", errors);
  const note = String(input.note ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_REPORT_NOTE_MAX);
  if (clicks === null && impressions === null && indexedPages === null && !note) errors.push("적은 값이 없음");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    report: { engine, date, periodDays, clicks, impressions, indexedPages, note, savedAt: nowIso, savedBy },
  };
}

/** 저장된 jsonb → 기록. 모양이 어긋나면 null(화면에서 건너뛴다). */
export function readSearchReport(value: unknown): SearchReport | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const engine = String(v.engine ?? "") as SearchReportEngine;
  const date = String(v.date ?? "");
  if (!SEARCH_REPORT_ENGINES.includes(engine) || !DATE_RE.test(date)) return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    engine,
    date,
    periodDays: num(v.periodDays) ?? 30,
    clicks: num(v.clicks),
    impressions: num(v.impressions),
    indexedPages: num(v.indexedPages),
    note: typeof v.note === "string" ? v.note : "",
    savedAt: typeof v.savedAt === "string" ? v.savedAt : "",
    savedBy: typeof v.savedBy === "string" ? v.savedBy : "",
  };
}

/** CTR 표기 — 클릭·노출 둘 다 있을 때만 */
export function reportCtr(r: Pick<SearchReport, "clicks" | "impressions">): number | null {
  if (r.clicks === null || r.impressions === null || r.impressions <= 0) return null;
  return r.clicks / r.impressions;
}
