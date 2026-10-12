import "server-only";

import { logger } from "@/lib/log";
import { getServiceAccountToken } from "@/lib/seo/google-oauth";
import { isGscConfigured } from "@/lib/seo/gsc-index";
import { kstDay } from "@/lib/metrics/page-count";
import {
  fillDates,
  gscDateRanges,
  parseSearchAnalyticsRows,
  sumTotals,
  type GscMetricRow,
  type GscTotals,
} from "@/lib/seo/gsc-performance-shape";

/**
 * [1061] 구글 서치콘솔 실적 — Search Analytics API 로 최근 28일 클릭·노출·CTR·순위를 읽는다.
 *
 * 왜 API 인가: 서치콘솔 화면의 숫자를 관리 화면에 함께 보려면 사람이 옮겨 적거나 API 로 읽어야 한다.
 * 색인률(N25)이 이미 같은 서비스 계정(GSC_SERVICE_ACCOUNT_*)과 같은 스코프(webmasters.readonly)를 쓰므로
 * 키를 더 만들 일은 없다 — 서치콘솔 속성에 서비스 계정 이메일을 사용자로 넣어 두기만 하면 된다.
 *
 * 호출 4번: 날짜별(최근 28일) · 앞 28일 합계 · 검색어 상위 · 페이지 상위. 하루 할당량(1,200/분 · 프로젝트)에 비해
 * 사소하지만, 관리 화면이 열릴 때마다 부르지 않도록 lib/admin/gsc-performance.ts 가 1시간 캐시로 감싼다.
 * 자료는 이틀쯤 늦게 확정되므로 끝 날짜는 today-2 (dataState=all 로 그 사이 잠정치도 함께 받는다).
 */

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type GscPerformance = {
  siteUrl: string;
  range: { start: string; end: string; prevStart: string; prevEnd: string };
  byDate: GscMetricRow[];
  totals: GscTotals;
  prevTotals: GscTotals;
  topQueries: GscMetricRow[];
  topPages: GscMetricRow[];
  fetchedAt: string;
};

type QueryBody = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  dataState?: "all" | "final";
};

async function query(token: string, siteUrl: string, body: QueryBody): Promise<GscMetricRow[]> {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dataState: "all", ...body }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`서치콘솔 실적 조회 실패: HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  return parseSearchAnalyticsRows(await res.json());
}

export { isGscConfigured };

/** 실패는 던진다 — 호출부가 "연결 안 됨 · 조회 실패 · 정상"을 구분해 적는다. */
export async function fetchGscPerformance(nowMs: number = Date.now()): Promise<GscPerformance> {
  const siteUrl = process.env.GSC_SITE_URL?.trim();
  if (!siteUrl) throw new Error("GSC_SITE_URL 미설정");
  const token = await getServiceAccountToken(SCOPE, nowMs);
  const range = gscDateRanges(kstDay(nowMs), 28, 2);

  const [dateRows, prevRows, queryRows, pageRows] = await Promise.all([
    query(token, siteUrl, { startDate: range.start, endDate: range.end, dimensions: ["date"], rowLimit: 60 }),
    query(token, siteUrl, { startDate: range.prevStart, endDate: range.prevEnd, rowLimit: 1 }),
    query(token, siteUrl, { startDate: range.start, endDate: range.end, dimensions: ["query"], rowLimit: 15 }),
    query(token, siteUrl, { startDate: range.start, endDate: range.end, dimensions: ["page"], rowLimit: 15 }),
  ]);

  const byDate = fillDates(dateRows, range.start, range.end);
  const out: GscPerformance = {
    siteUrl,
    range,
    byDate,
    totals: sumTotals(dateRows),
    prevTotals: sumTotals(prevRows),
    topQueries: queryRows,
    topPages: pageRows,
    fetchedAt: new Date(nowMs).toISOString(),
  };
  logger.info("[gsc-performance] 조회", { clicks: out.totals.clicks, impressions: out.totals.impressions });
  return out;
}
