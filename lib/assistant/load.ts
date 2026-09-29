import "server-only";

import { cache } from "react";

/**
 * [1025 · 결정·비서] AI 비서(/my/assistant) 로더 — 서버 컴포넌트가 한 번에 읽는다.
 * 실패(ok:false)·0건·n건을 갈라 넘긴다 — 못 읽은 것을 0으로 그리지 않는다(마이 허브 로더와 같은 규칙).
 *
 *  · 이번 주 요약: user_inbox_notifications(channel='user') 최근 7일 → lib/assistant/weekly countWeekly
 *  · 다음 할 일 : inspection_schedules(planned) + 계약 일정표(user_preferences.journey_state.contract)
 *  · 지켜보는 것: 관심 단지 수(countWatchlist) · 저장 검색 수(listSavedSearches) · 알림 채널(notification_preferences)
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { countWatchlist } from "@/lib/watchlist/store-db";
import { listSavedSearches } from "@/lib/saved-search/store";
import { listSchedules, type InspectionSchedule } from "@/lib/inspection-schedules/store-db";
import { getPrefs, type NotificationPrefs } from "@/lib/notification-prefs/store-db";
import { getJourneyState } from "@/lib/journey/store";
import { listWatchlist } from "@/lib/watchlist/store-db";
import { getComplexDeals } from "@/lib/complex/complex-store";
import { countWeekly, nextContractDate, weekStrip, type WeekStrip, type WeeklyCounts } from "./weekly";
import { watchSeriesFromDeals, type WatchSeries } from "./watch-series";

export type Loaded<T> = { ok: true; value: T } | { ok: false };

/** [1025c] 관심 단지 30일 줄 — 최대 6곳(시안) · 단지마다 실거래 한 건 단위(getComplexDeals · 렌더당 1회 캐시) */
export const WATCH_SERIES_MAX = 6;

export interface WatchSeriesRow {
  complexId: string;
  complexName: string;
  /** 실거래를 못 읽었으면 ok:false(없음과 다르다) */
  series: Loaded<WatchSeries>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const mem: never[] = [];

/** 최근 7일 사용자 알림(제목·링크·시각만) — Supabase 미설정이면 빈 목록(개발).
    [1025c] React cache — 같은 렌더에서 loadWeekly · loadWeekStrip 이 한 번만 읽는다(now 는 같은 Date 객체를 넘긴다) */
const listInboxLastWeek = cache(async (email: string, now: Date): Promise<{ title: string; actionUrl: string | null; createdAt: string }[]> => {
  const sb = getServiceSupabase();
  if (!sb) return mem;
  const { data, error } = await sb
    .from("user_inbox_notifications")
    .select("title, action_url, created_at")
    .eq("user_email", email.trim().toLowerCase())
    .eq("channel", "user")
    .gte("created_at", new Date(now.getTime() - WEEK_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`user_inbox_notifications 최근 7일 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("user_inbox_notifications 응답이 배열이 아닙니다");
  return data.map((r) => ({
    title: String(r.title ?? ""),
    actionUrl: (r.action_url as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  }));
});

/** 이번 주 브리핑이 이미 왔는지(digest ≥ 1) 는 counts.digest 로 안다 */
export async function loadWeekly(email: string, now = new Date()): Promise<Loaded<WeeklyCounts>> {
  try {
    return { ok: true, value: countWeekly(await listInboxLastWeek(email, now), now) };
  } catch (e) {
    logger.warn("[assistant] 최근 7일 알림 집계 실패", e);
    return { ok: false };
  }
}

/** [1025c] 이번 주(월~일 KST) 7칸 — 같은 최근 7일 행을 날짜별로 담는다 */
export async function loadWeekStrip(email: string, now = new Date()): Promise<Loaded<WeekStrip>> {
  try {
    return { ok: true, value: weekStrip(await listInboxLastWeek(email, now), now) };
  } catch (e) {
    logger.warn("[assistant] 이번 주 7일 집계 실패", e);
    return { ok: false };
  }
}

/**
 * [1025c] 관심 단지 목록(최대 WATCH_SERIES_MAX) + 단지별 30일 줄. 목록을 못 읽으면 ok:false, 단지 하나의 실거래를
 * 못 읽으면 그 행만 series ok:false — 못 읽은 것을 "거래 없음"으로 그리지 않는다.
 */
export async function loadWatchSeries(email: string, now = new Date()): Promise<Loaded<{ rows: WatchSeriesRow[]; total: number }>> {
  let items: Awaited<ReturnType<typeof listWatchlist>>;
  try {
    items = await listWatchlist(email);
  } catch (e) {
    logger.warn("[assistant] 관심 단지 목록 조회 실패", e);
    return { ok: false };
  }
  const head = items.slice(0, WATCH_SERIES_MAX);
  const rows = await Promise.all(
    head.map(async (w): Promise<WatchSeriesRow> => {
      try {
        const deals = await getComplexDeals(w.complexId);
        return { complexId: w.complexId, complexName: w.complexName, series: { ok: true, value: watchSeriesFromDeals(deals, now) } };
      } catch (e) {
        logger.warn("[assistant] 관심 단지 실거래 조회 실패", { complexId: w.complexId, err: e });
        return { complexId: w.complexId, complexName: w.complexName, series: { ok: false } };
      }
    }),
  );
  return { ok: true, value: { rows, total: items.length } };
}

export async function loadSchedules(email: string): Promise<Loaded<InspectionSchedule[]>> {
  try {
    return { ok: true, value: await listSchedules(email, "planned") };
  } catch (e) {
    logger.warn("[assistant] 임장 일정 조회 실패", e);
    return { ok: false };
  }
}

export async function loadContractDday(email: string, now = new Date()): Promise<Loaded<ReturnType<typeof nextContractDate>>> {
  try {
    const state = await getJourneyState(email);
    return { ok: true, value: nextContractDate(state.contract, now) };
  } catch (e) {
    logger.warn("[assistant] 계약 일정표 조회 실패", e);
    return { ok: false };
  }
}

export async function loadWatchCount(email: string): Promise<Loaded<number>> {
  try {
    return { ok: true, value: await countWatchlist(email) };
  } catch (e) {
    logger.warn("[assistant] 관심 단지 수 조회 실패", e);
    return { ok: false };
  }
}

/** listSavedSearches 는 실패를 [] 로 접는다(그쪽 관례) — 여기서는 그대로 센다 */
export async function loadSavedSearchCount(email: string): Promise<number> {
  return (await listSavedSearches(email)).length;
}

export async function loadNotifyPrefs(email: string): Promise<Loaded<NotificationPrefs>> {
  try {
    return { ok: true, value: await getPrefs(email.trim().toLowerCase()) };
  } catch (e) {
    logger.warn("[assistant] 알림 설정 조회 실패", e);
    return { ok: false };
  }
}
