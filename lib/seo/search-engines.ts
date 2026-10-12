/* [1061] 검색엔진별 착지 — 익명 하루 수(page_view_daily_agg)의 ref_host 를 "어디서 왔나"로 접는다.
 * 순수 모듈(서버 전용 import 없음) — 단위 시험 대상. 네이버·구글은 **검색 결과 호스트만** 검색으로 센다
 * (blog.naver.com·cafe.naver.com 은 검색이 아니라 네이버 안 다른 서비스 → "referral").
 * AI 검색(챗GPT·퍼플렉시티 등)은 따로 묶는다 — robots 를 열어 둔 이유(GEO)가 숫자로 보여야 한다. */

export type LandingSource =
  | "naver"
  | "google"
  | "bing"
  | "daum"
  | "other-search"
  | "ai"
  | "referral"
  | "direct";

export const SOURCE_LABEL: Record<LandingSource, string> = {
  naver: "네이버 검색",
  google: "구글 검색",
  bing: "빙",
  daum: "다음 검색",
  "other-search": "그 밖의 검색",
  ai: "AI 검색",
  referral: "다른 사이트",
  direct: "직접 · 앱 · 알 수 없음",
};

/** 화면 순서 — 검색엔진 먼저, 그다음 AI, 그다음 나머지 */
export const SOURCE_ORDER: readonly LandingSource[] = [
  "naver",
  "google",
  "bing",
  "daum",
  "other-search",
  "ai",
  "referral",
  "direct",
];

const AI_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "www.perplexity.ai",
  "claude.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
  "you.com",
  "search.brave.com",
];

/** 리퍼러 호스트 → 출처 묶음. 호스트는 소문자·공백 제거 뒤 판정. */
export function classifyRefHost(host: string | null | undefined): LandingSource {
  const h = String(host ?? "")
    .trim()
    .toLowerCase();
  if (!h) return "direct";
  if (AI_HOSTS.includes(h)) return "ai";
  /* 네이버 검색 — search.naver.com · m.search.naver.com · (옛) s.search.naver.com */
  if (/^(m\.|s\.)?search\.naver\.com$/.test(h)) return "naver";
  /* 구글 검색 — google.com · google.co.kr · www.google.* · 안드로이드 검색 앱(android-app://…googlequicksearchbox) */
  if (/^(www\.)?google\.(com|co\.[a-z]{2}|[a-z]{2})$/.test(h) || h === "com.google.android.googlequicksearchbox") {
    return "google";
  }
  if (/^(www\.|cn\.|m\.)?bing\.com$/.test(h)) return "bing";
  if (/^(m\.)?search\.daum\.net$/.test(h)) return "daum";
  if (
    /^(www\.)?duckduckgo\.com$/.test(h) ||
    /(^|\.)search\.yahoo\.(com|co\.jp)$/.test(h) ||
    /^(m\.)?search\.zum\.com$/.test(h) ||
    /^(www\.)?yandex\.(ru|com)$/.test(h) ||
    /^(www\.)?baidu\.com$/.test(h) ||
    /^(www\.)?ecosia\.org$/.test(h) ||
    /^(www\.)?startpage\.com$/.test(h)
  ) {
    return "other-search";
  }
  return "referral";
}

export type LandingRow = {
  day: string;
  route: string;
  ref_host: string;
  n: number;
};

export type SourceDay = { day: string; total: number; bySource: Partial<Record<LandingSource, number>> };

export type SearchLandingSummary = {
  /** 최근 `days` 일(오늘 포함) 하루씩 — 없는 날은 0 */
  days: SourceDay[];
  /** 최근 기간 출처별 합 */
  totals: Record<LandingSource, number>;
  /** 그 앞 같은 길이 기간 출처별 합(비교용) */
  prevTotals: Record<LandingSource, number>;
  /** 검색엔진별 많이 착지한 화면(상위 8) */
  topRoutes: Partial<Record<LandingSource, Array<{ route: string; n: number }>>>;
  /** 기간 */
  range: { start: string; end: string; prevStart: string; prevEnd: string };
};

function addDays(day: string, delta: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function emptyTotals(): Record<LandingSource, number> {
  return {
    naver: 0,
    google: 0,
    bing: 0,
    daum: 0,
    "other-search": 0,
    ai: 0,
    referral: 0,
    direct: 0,
  };
}

/**
 * 착지 줄(is_landing = true 만) → 출처별 하루 수·합·앞 기간·상위 화면.
 * today = 한국 날짜(YYYY-MM-DD). 줄의 day 가 기간 밖이면 버린다.
 */
export function summarizeSearchLandings(rows: readonly LandingRow[], today: string, days = 28): SearchLandingSummary {
  const span = Math.max(1, Math.floor(days));
  const start = addDays(today, -(span - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(span - 1));

  const perDay = new Map<string, SourceDay>();
  for (let i = 0; i < span; i++) {
    const d = addDays(start, i);
    perDay.set(d, { day: d, total: 0, bySource: {} });
  }
  const totals = emptyTotals();
  const prevTotals = emptyTotals();
  const routeMaps: Partial<Record<LandingSource, Map<string, number>>> = {};

  for (const r of rows) {
    const n = Number(r.n) || 0;
    if (n <= 0) continue;
    const src = classifyRefHost(r.ref_host);
    if (r.day >= start && r.day <= today) {
      const d = perDay.get(r.day);
      if (!d) continue;
      d.total += n;
      d.bySource[src] = (d.bySource[src] ?? 0) + n;
      totals[src] += n;
      if (src === "naver" || src === "google" || src === "bing" || src === "daum" || src === "ai") {
        const m = routeMaps[src] ?? new Map<string, number>();
        m.set(r.route, (m.get(r.route) ?? 0) + n);
        routeMaps[src] = m;
      }
    } else if (r.day >= prevStart && r.day <= prevEnd) {
      prevTotals[src] += n;
    }
  }

  const topRoutes: SearchLandingSummary["topRoutes"] = {};
  for (const [src, m] of Object.entries(routeMaps) as Array<[LandingSource, Map<string, number>]>) {
    topRoutes[src] = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([route, n]) => ({ route, n }));
  }

  return {
    days: [...perDay.values()],
    totals,
    prevTotals,
    topRoutes,
    range: { start, end: today, prevStart, prevEnd },
  };
}

/** 앞 기간 대비 변화율(%) — 앞 기간 0 이면 null(비율 없음) */
export function deltaPct(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((now - prev) / prev) * 100);
}
